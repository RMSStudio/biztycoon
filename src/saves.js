// ══════════════════════════════════════════════════════
//  SAVES v2 — система сохранений по ранам
//
//  Структура хранилища:
//    btz_runs_v2: Run[]
//    Run: { runId, startTs, scenario, label, steps: Step[] }
//    Step: { id, type:'auto'|'manual', month, money, label, ts, state }
//
//  Правила:
//    · хранятся последние MAX_RUNS ранов
//    · внутри рана — все шаги без ограничений
//    · новый ран создаётся при startGame() → startRun()
//    · loadSave() переключает "текущий ран" на тот, откуда загрузка
//
//  Зависит от: events.js (EventBus), engine.js (G, DECISIONS, notify, monthLabel)
// ══════════════════════════════════════════════════════

const RUNS_KEY   = 'btz_runs_v2';
const CURR_KEY   = 'btz_current_run';
const MAX_RUNS   = 10;

// ── Миграция из старого формата ───────────────────────

(function _migrate() {
  const oldAuto   = localStorage.getItem('btz_saves_auto');
  const oldManual = localStorage.getItem('btz_saves_manual');
  if (!oldAuto && !oldManual) return;
  if (_loadRuns().length > 0) return; // уже мигрировали

  const autoArr   = JSON.parse(oldAuto   || '[]');
  const manualArr = JSON.parse(oldManual || '[]');
  const steps     = [...manualArr, ...autoArr].sort((a,b) => a.ts - b.ts);

  if (steps.length === 0) return;

  const runId = `run_import`;
  const run = {
    runId,
    startTs: steps[0]?.ts || Date.now(),
    scenario: 'agency',
    label: 'Импорт (старый формат)',
    steps,
  };
  localStorage.setItem(RUNS_KEY, JSON.stringify([run]));
  localStorage.removeItem('btz_saves_auto');
  localStorage.removeItem('btz_saves_manual');
  console.info('[saves] Мигрировано из старого формата:', steps.length, 'шагов');
})();

// ── Сериализация / десериализация ─────────────────────

function _snap() {
  return {
    G:         JSON.parse(JSON.stringify({ ...G, log: (G.log||[]).slice(-80) })),
    DECISIONS: JSON.parse(JSON.stringify(DECISIONS || [])),
  };
}

function _restore(snapshot) {
  Object.keys(snapshot.G).forEach(k => { G[k] = snapshot.G[k]; });
  DECISIONS = (snapshot.DECISIONS || []).slice();
  // п.31: старые сейвы могут содержать money > winCondition без флага.
  // Ставим флаг чтобы не показывать победный экран повторно при загрузке.
  const wc = (typeof SCENARIO !== 'undefined') && SCENARIO?.settings?.winCondition;
  const atEndgame = (G.runMap?.stageIdx ?? 0) >= 4;
  if (wc != null && atEndgame && (G.money || 0) >= wc) {
    G._wonAlreadyCelebrated = true;
  }
}

// ── Run management ────────────────────────────────────

function startRun() {
  const runs   = _loadRuns();
  const runNum = runs.filter(r => r.runId !== 'run_import').length + 1;
  const runId  = `run_${Date.now()}`;
  const label  = `Ран #${runNum} — ${new Date().toLocaleDateString('ru-RU', { day:'numeric', month:'short' })}`;

  runs.unshift({
    runId,
    startTs:  Date.now(),
    scenario: typeof SCENARIO !== 'undefined' ? (SCENARIO.name || SCENARIO.id) : '—',
    label,
    steps: [],
  });

  // Оставить только MAX_RUNS
  while (runs.length > MAX_RUNS) runs.pop();

  _saveRuns(runs);
  localStorage.setItem(CURR_KEY, runId);
}

function _currentRunId() {
  return localStorage.getItem(CURR_KEY) || null;
}

function _currentRun() {
  const id = _currentRunId();
  return id ? _loadRuns().find(r => r.runId === id) || null : null;
}

// ── Auto-save ─────────────────────────────────────────

function autoSave() {
  if (!G || G.month == null) return;
  const runId = _currentRunId();
  if (!runId) return;
  try {
    const runs = _loadRuns();
    const run  = runs.find(r => r.runId === runId);
    if (!run) return;

    const entry = {
      id:    `auto_${runId}_m${G.month}`,
      type:  'auto',
      month: G.month,
      money: G.money,
      label: (typeof monthLabel === 'function' ? monthLabel(-1) : `Месяц ${G.month}`) + ' — авто',
      ts:    Date.now(),
      state: _snap(),
    };

    // Перезаписать шаг того же месяца (кольцевой буфер внутри рана)
    const idx = run.steps.findIndex(s => s.id === entry.id);
    if (idx >= 0) run.steps[idx] = entry;
    else          run.steps.push(entry);

    _saveRuns(runs);
  } catch(e) {
    console.warn('autoSave failed:', e);
  }
}

// ── Quick / manual save ───────────────────────────────

function quickSave(label) {
  if (!G || G.month == null) { notify('Игра ещё не начата', 'error'); return; }
  const runId = _currentRunId();
  if (!runId) { notify('Нет активного рана', 'error'); return; }
  try {
    const runs = _loadRuns();
    const run  = runs.find(r => r.runId === runId);
    if (!run) return;

    const ts    = Date.now();
    const entry = {
      id:    `manual_${ts}`,
      type:  'manual',
      month: G.month,
      money: G.money,
      label: label || ((typeof monthLabel === 'function' ? monthLabel(-1) : `М${G.month}`) + ' — ручное'),
      ts,
      state: _snap(),
    };

    run.steps.unshift(entry);
    _saveRuns(runs);
    notify('💾 Сохранено', 'success');
    if (document.getElementById('save-modal')?.classList.contains('active')) {
      _renderSaveList();
    }
  } catch(e) {
    console.warn('quickSave failed:', e);
    notify('Ошибка сохранения', 'error');
  }
}

// ── Load ──────────────────────────────────────────────

function loadSave(id) {
  const found = _findStepWithRun(id);
  if (!found) { notify('Сохранение не найдено', 'error'); return; }
  try {
    _restore(found.step.state);
    // Переключаем "текущий ран" на тот, откуда загружаем
    localStorage.setItem(CURR_KEY, found.run.runId);
    EventBus.emit('render');
    EventBus.emit('navigate', { screen: 'screen-game' });
    closeSaveModal();
    notify(`⏮ Загружено: ${found.step.label}`, 'success');
  } catch(e) {
    console.warn('loadSave failed:', e);
    notify('Ошибка загрузки', 'error');
  }
}

// ── Delete ────────────────────────────────────────────

function deleteSave(id) {
  const runs = _loadRuns();
  runs.forEach(run => {
    run.steps = run.steps.filter(s => s.id !== id);
  });
  _saveRuns(runs);
  _renderSaveList();
}

function deleteRun(runId) {
  if (!confirm('Удалить весь ран и все его сохранения?')) return;
  const runs = _loadRuns().filter(r => r.runId !== runId);
  _saveRuns(runs);
  if (_currentRunId() === runId) localStorage.removeItem(CURR_KEY);
  _renderSaveList();
}

// ── Internal helpers ──────────────────────────────────

function _findStepWithRun(id) {
  for (const run of _loadRuns()) {
    const step = run.steps.find(s => s.id === id);
    if (step) return { run, step };
  }
  return null;
}

function _loadRuns() {
  try { return JSON.parse(localStorage.getItem(RUNS_KEY) || '[]'); }
  catch { return []; }
}

function _saveRuns(runs) {
  localStorage.setItem(RUNS_KEY, JSON.stringify(runs));
}

// ── Public helpers ────────────────────────────────────

function hasSaves() {
  return _loadRuns().some(r => r.steps.length > 0);
}

// ── Modal UI ──────────────────────────────────────────

function openSaveModal() {
  _renderSaveList();
  document.getElementById('save-modal')?.classList.add('active');
}

function closeSaveModal() {
  document.getElementById('save-modal')?.classList.remove('active');
}

function _renderSaveList() {
  const el = document.getElementById('save-list');
  if (!el) return;

  const runs     = _loadRuns();
  const currId   = _currentRunId();

  const fmtMoney = v => v == null ? '—'
    : new Intl.NumberFormat('ru-RU').format(Math.round(v)) + ' ₽';
  const fmtTime  = ts => {
    const d = new Date(ts);
    return d.toLocaleDateString('ru-RU', { day:'2-digit', month:'short' })
           + ' ' + d.toLocaleTimeString('ru-RU', { hour:'2-digit', minute:'2-digit' });
  };

  if (runs.length === 0 || runs.every(r => r.steps.length === 0)) {
    el.innerHTML = `<p style="color:var(--muted);font-size:13px;padding:12px 0">
      Сохранений нет — начни игру, чтобы появились авто-сохранения.</p>`;
    return;
  }

  const renderStep = (step) => {
    const isManual  = step.type === 'manual';
    const icon      = isManual ? '📌' : '🔄';
    const moneyCol  = (step.money||0) >= 0 ? 'var(--green)' : 'var(--red)';
    const typeColor = isManual ? 'var(--purple)' : 'var(--sub)';
    return `
      <div class="sv-step">
        <span class="sv-step-icon">${icon}</span>
        <div class="sv-step-info">
          <div class="sv-step-label">${step.label}</div>
          <div class="sv-step-meta" style="color:${typeColor}">
            ${fmtTime(step.ts)} · <span style="color:${moneyCol}">${fmtMoney(step.money)}</span>
          </div>
        </div>
        <div class="sv-step-actions">
          <button class="btn btn-teal" style="font-size:11px;padding:5px 10px"
                  onclick="loadSave('${step.id}')">⏮ Загрузить</button>
          ${isManual
            ? `<button class="btn btn-ghost" style="font-size:11px;padding:5px 8px;color:var(--red)"
                       onclick="deleteSave('${step.id}')">✕</button>`
            : ''}
        </div>
      </div>`;
  };

  const renderRun = (run, openByDefault) => {
    const isCurrent   = run.runId === currId;
    const stepsDesc   = [...run.steps].sort((a,b) => b.ts - a.ts); // новые сверху
    const manualCnt   = stepsDesc.filter(s => s.type === 'manual').length;
    const autoCnt     = stepsDesc.filter(s => s.type === 'auto').length;
    const lastMoney   = stepsDesc[0]?.money;
    const scenarioLbl = run.scenario ? `<span class="sv-run-tag">${run.scenario}</span>` : '';
    const currentBadge = isCurrent
      ? `<span class="sv-run-tag sv-run-current">● Текущий</span>` : '';

    return `
      <details class="sv-run" ${openByDefault ? 'open' : ''}>
        <summary class="sv-run-header">
          <div class="sv-run-title">
            <span class="sv-run-name">${run.label}</span>
            ${scenarioLbl}
            ${currentBadge}
          </div>
          <div class="sv-run-meta">
            ${lastMoney != null ? `<span style="color:var(--teal)">${fmtMoney(lastMoney)}</span>` : ''}
            <span style="color:var(--muted);font-size:11px">
              ${manualCnt ? `📌${manualCnt}` : ''} 🔄${autoCnt}
            </span>
            <button class="sv-run-del" title="Удалить ран"
                    onclick="event.preventDefault();deleteRun('${run.runId}')">🗑</button>
          </div>
        </summary>
        <div class="sv-steps">
          ${stepsDesc.length > 0
            ? stepsDesc.map(renderStep).join('')
            : `<p style="color:var(--muted);font-size:12px;padding:8px 0">Нет шагов</p>`}
        </div>
      </details>`;
  };

  el.innerHTML = runs.map((run, i) => renderRun(run, i === 0)).join('');
}

// ── Export / Import ───────────────────────────────────

// п.30: скачать все раны одним JSON-файлом
function exportSaves() {
  const data = localStorage.getItem(RUNS_KEY) || '[]';
  const blob  = new Blob([data], { type: 'application/json' });
  const url   = URL.createObjectURL(blob);
  const a     = document.createElement('a');
  a.href      = url;
  a.download  = `btz_runs_export_${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  notify('📥 Сохранения выгружены', 'success');
}

// п.30: импорт из JSON-файла — merge без дублирования по runId
function importSaves(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      const imported = JSON.parse(e.target.result);
      if (!Array.isArray(imported)) throw new Error('Неверный формат');
      const current = _loadRuns();
      const existingIds = new Set(current.map(r => r.runId));
      const newRuns = imported.filter(r => r.runId && !existingIds.has(r.runId));
      const merged = [...newRuns, ...current].slice(0, MAX_RUNS);
      _saveRuns(merged);
      _renderSaveList();
      notify(`✅ Импортировано ${newRuns.length} ран(ов)`, 'success');
    } catch (err) {
      notify('Ошибка импорта: ' + err.message, 'error');
    }
  };
  reader.readAsText(file);
}

function _triggerImportFile() {
  const inp = document.createElement('input');
  inp.type   = 'file';
  inp.accept = '.json';
  inp.onchange = e => importSaves(e.target.files[0]);
  inp.click();
}

// ── Keyboard shortcut ─────────────────────────────────

document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    quickSave();
  }
  if (e.key === 'Escape') {
    closeSaveModal();
  }
});
