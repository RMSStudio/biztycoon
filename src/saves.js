// ══════════════════════════════════════════════════════
//  SAVES — система сохранений
//  Зависит от: engine.js (G, DECISIONS, renderGame, goTo, notify, monthLabel)
//
//  Два типа сохранений:
//    auto   — создаётся автоматически после каждого advanceMonth
//             хранит последние MAX_AUTO_SAVES месяцев (кольцевой буфер)
//    manual — создаётся вручную (Ctrl+S / кнопка 💾)
//             хранит последние MAX_MANUAL_SAVES слотов
//
//  Полный откат: loadSave(id) восстанавливает G и DECISIONS целиком.
// ══════════════════════════════════════════════════════

const SAVES_KEY_AUTO   = 'btz_saves_auto';
const SAVES_KEY_MANUAL = 'btz_saves_manual';
const MAX_AUTO_SAVES   = 48;   // по месяцу на протяжении всей партии
const MAX_MANUAL_SAVES = 10;

// ── Сериализация / десериализация ─────────────────────

function _snap() {
  return {
    G:         JSON.parse(JSON.stringify({ ...G, log: (G.log||[]).slice(-80) })),
    DECISIONS: JSON.parse(JSON.stringify(DECISIONS || [])),
  };
}

function _restore(snapshot) {
  const s = snapshot;
  Object.keys(s.G).forEach(k => { G[k] = s.G[k]; });
  // DECISIONS — let-переменная в engine.js, доступна в этом же скоупе
  DECISIONS = (s.DECISIONS || []).slice();
}

// ── Auto-save ─────────────────────────────────────────

function autoSave() {
  if (!G || G.month == null) return;
  try {
    const saves = _loadRaw(SAVES_KEY_AUTO);
    const entry = {
      id:    `auto_m${G.month}`,
      type:  'auto',
      month: G.month,
      money: G.money,
      label: (monthLabel ? monthLabel(-1) : `Месяц ${G.month}`) + ' — авто',
      ts:    Date.now(),
      state: _snap(),
    };
    const idx = saves.findIndex(s => s.id === entry.id);
    if (idx >= 0) saves[idx] = entry;
    else          saves.push(entry);
    // кольцевой буфер: удаляем самые старые
    saves.sort((a,b) => a.month - b.month);
    while (saves.length > MAX_AUTO_SAVES) saves.shift();
    _saveRaw(SAVES_KEY_AUTO, saves);
  } catch(e) {
    console.warn('autoSave failed:', e);
  }
}

// ── Quick / manual save ───────────────────────────────

function quickSave(label) {
  if (!G || G.month == null) { notify('Игра ещё не начата', 'error'); return; }
  try {
    const saves = _loadRaw(SAVES_KEY_MANUAL);
    const ts    = Date.now();
    const entry = {
      id:    `manual_${ts}`,
      type:  'manual',
      month: G.month,
      money: G.money,
      label: label || ((monthLabel ? monthLabel(-1) : `М${G.month}`) + ' — ручное'),
      ts,
      state: _snap(),
    };
    saves.unshift(entry);
    while (saves.length > MAX_MANUAL_SAVES) saves.pop();
    _saveRaw(SAVES_KEY_MANUAL, saves);
    notify('💾 Сохранено', 'success');
    // обновить список если модал открыт
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
  const entry = _allSaves().find(s => s.id === id);
  if (!entry) { notify('Сохранение не найдено', 'error'); return; }
  try {
    _restore(entry.state);
    renderGame();
    goTo('screen-game');
    closeSaveModal();
    notify(`⏮ Загружено: ${entry.label}`, 'success');
  } catch(e) {
    console.warn('loadSave failed:', e);
    notify('Ошибка загрузки', 'error');
  }
}

// ── Delete ────────────────────────────────────────────

function deleteSave(id) {
  // manual
  let saves = _loadRaw(SAVES_KEY_MANUAL);
  const before = saves.length;
  saves = saves.filter(s => s.id !== id);
  if (saves.length < before) { _saveRaw(SAVES_KEY_MANUAL, saves); }
  else {
    // auto
    saves = _loadRaw(SAVES_KEY_AUTO).filter(s => s.id !== id);
    _saveRaw(SAVES_KEY_AUTO, saves);
  }
  _renderSaveList();
}

// ── Getters ───────────────────────────────────────────

function _allSaves() {
  const auto   = _loadRaw(SAVES_KEY_AUTO);
  const manual = _loadRaw(SAVES_KEY_MANUAL);
  return [...manual, ...auto].sort((a,b) => b.ts - a.ts);
}

function _loadRaw(key) {
  try { return JSON.parse(localStorage.getItem(key) || '[]'); }
  catch { return []; }
}

function _saveRaw(key, arr) {
  localStorage.setItem(key, JSON.stringify(arr));
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

  const manual = _loadRaw(SAVES_KEY_MANUAL);
  const auto   = _loadRaw(SAVES_KEY_AUTO).slice().reverse(); // новые сверху

  const fmtMoney = v => {
    if (v == null) return '—';
    return new Intl.NumberFormat('ru-RU').format(Math.round(v)) + ' ₽';
  };
  const fmtTime = ts => {
    const d = new Date(ts);
    return d.toLocaleDateString('ru-RU', { day:'2-digit', month:'short' })
           + ' ' + d.toLocaleTimeString('ru-RU', { hour:'2-digit', minute:'2-digit' });
  };

  const renderEntry = (s) => {
    const isManual = s.type === 'manual';
    const typeIcon = isManual ? '📌' : '🔄';
    const typeCol  = isManual ? 'var(--purple)' : 'var(--sub)';
    const moneyCol = (s.money||0) >= 0 ? 'var(--green)' : 'var(--red)';
    return `
      <div style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:var(--bg2);border-radius:8px;margin-bottom:6px">
        <span style="font-size:16px;flex-shrink:0">${typeIcon}</span>
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;font-weight:600;color:var(--fg);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${s.label}</div>
          <div style="font-size:10px;color:${typeCol};margin-top:1px">${fmtTime(s.ts)} · <span style="color:${moneyCol}">${fmtMoney(s.money)}</span></div>
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0">
          <button class="btn btn-teal" style="font-size:11px;padding:5px 10px" onclick="loadSave('${s.id}')">⏮ Загрузить</button>
          ${isManual ? `<button class="btn btn-ghost" style="font-size:11px;padding:5px 8px;color:var(--red)" onclick="deleteSave('${s.id}')">✕</button>` : ''}
        </div>
      </div>`;
  };

  const manualHtml = manual.length > 0
    ? manual.map(renderEntry).join('')
    : `<div style="font-size:12px;color:var(--muted);padding:8px 0">Ручных сохранений нет — нажми Ctrl+S или кнопку выше</div>`;

  const autoHtml = auto.length > 0
    ? auto.map(renderEntry).join('')
    : `<div style="font-size:12px;color:var(--muted);padding:8px 0">Авто-сохранений нет — появятся после завершения первого месяца</div>`;

  el.innerHTML = `
    <div style="margin-bottom:10px">
      <div style="font-size:11px;font-weight:700;color:var(--sub);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">📌 Ручные (${manual.length}/${MAX_MANUAL_SAVES})</div>
      ${manualHtml}
    </div>
    <div>
      <div style="font-size:11px;font-weight:700;color:var(--sub);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">🔄 Авто-сохранения (${auto.length}/${MAX_AUTO_SAVES})</div>
      <div style="max-height:280px;overflow-y:auto;padding-right:2px">${autoHtml}</div>
    </div>`;
}

// ── Keyboard shortcut ─────────────────────────────────

document.addEventListener('keydown', e => {
  // Ctrl+S / Cmd+S — быстрое сохранение
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    quickSave();
  }
  // Escape — закрыть модал
  if (e.key === 'Escape') {
    closeSaveModal();
  }
});
