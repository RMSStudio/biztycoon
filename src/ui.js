// ══════════════════════════════════════════════════════
//  UI — рендер, скаутинг-модал, события, дашборд
//  Зависит от: events.js (EventBus), constants.js, scenarios/{id}.js, engine.js
//
//  Godot-совместимая архитектура:
//    UI не вызывается из engine напрямую.
//    Engine emit-ит сигналы → UI подписывается и рендерит.
//    При переносе: заменить EventBus.on → connect("signal", ...)
// ══════════════════════════════════════════════════════

// Scenario bindings объявлены в engine.js (загружается раньше).
// ui.js использует те же алиасы: STAFF_DEFS, PROJECT_POOL, UPGRADES, SPECS и др.

// ── Accordion state — переживает renderGame(), сбрасывается при перезагрузке ─
const _acc = {
  hire:         true,   // Найм — открыт
  metrics:      true,   // Метрики — открыты
  pnl:          false,  // P&L — свёрнут по умолчанию
};

function toggleAcc(key) {
  _acc[key] = !_acc[key];
  const body  = document.getElementById('acc-' + key);
  const arrow = document.getElementById('acc-arrow-' + key);
  if (body)  body.style.display  = _acc[key] ? 'block' : 'none';
  if (arrow) arrow.textContent   = _acc[key] ? '▾' : '▸';
}

// Тултип метрики — показывается по клику на "?"
function toggleMetricTip(id) {
  const el = document.getElementById('mtip-' + id);
  if (!el) return;
  const isOpen = el.style.display !== 'none';
  // Закрыть все открытые тултипы метрик
  document.querySelectorAll('[id^="mtip-"]').forEach(t => { t.style.display = 'none'; });
  if (!isOpen) el.style.display = 'block';
}

// ── DOM-реализации сигналов (Godot: обработчики connect) ─
// В Godot эти функции становятся методами UI-нода, подключёнными через connect()

function _uiNotify(msg, type = 'info') {
  const el = document.getElementById('notif');
  if (!el) return;
  el.textContent = msg;
  el.className = 'notif show ' + type;
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 3000);
}

function _uiNavigate(screen) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(screen);
  if (el) el.classList.add('active');
  window.scrollTo(0, 0);
  // Хуки на конкретные экраны
  if (screen === 'screen-scenario-editor' && typeof SE !== 'undefined') SE.render();
  if (screen === 'screen-intro'           && typeof SE !== 'undefined') SE.syncIntroStats();
}

function _uiSelectSpec(id) {
  document.querySelectorAll('.spec-card').forEach(c => c.classList.remove('selected'));
  const card = document.getElementById('spec-' + id);
  if (card) card.classList.add('selected');
  const btn = document.getElementById('btn-start-game');
  if (btn) btn.disabled = false;
}

function _uiShowScout(offers) {
  const modal = document.getElementById('scout-modal');
  document.getElementById('scout-title').textContent =
    offers.length ? `Найдено проектов: ${offers.length}` : 'Скаутинг не дал результатов';
  document.getElementById('scout-sub').textContent =
    offers.length
      ? 'Можно взять несколько. Пул сохраняется — закрой, докупи перки и вернись.'
      : 'На рынке тишина. Попробуй снова в следующем месяце или улучши репутацию.';
  // Рендер карточек скаутинга делегируем legacy-функции из engine (временно)
  // В Godot: заменить на GDScript-метод, строящий карточки из offers[]
  _legacyShowScout(offers);
}

function _uiCloseScout() {
  document.getElementById('scout-modal').classList.remove('active');
}

function _uiShowConfirm(icon, title, body, confirmText, confirmClass, onConfirm) {
  document.getElementById('modal-icon').textContent  = icon;
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').textContent  = body;
  const div = document.getElementById('modal-choices');
  div.innerHTML = '';

  const borderMap = { red:'rgba(248,81,73,.4)', amber:'rgba(210,153,34,.4)', teal:'rgba(45,212,191,.4)', green:'rgba(74,222,128,.4)' };
  const btnOk = document.createElement('button');
  btnOk.className = 'modal-choice';
  btnOk.style.borderColor = borderMap[confirmClass] || borderMap.amber;
  btnOk.innerHTML = `<div class="choice-title" style="color:var(--${confirmClass})">${confirmText}</div>`;
  btnOk.onclick = () => { document.getElementById('event-modal').classList.remove('active'); onConfirm(); };

  const btnCancel = document.createElement('button');
  btnCancel.className = 'modal-choice';
  btnCancel.innerHTML = `<div class="choice-title">Отмена</div><div class="choice-desc">Ничего не менять</div>`;
  btnCancel.onclick = () => document.getElementById('event-modal').classList.remove('active');

  div.appendChild(btnOk);
  div.appendChild(btnCancel);
  document.getElementById('event-modal').classList.add('active');
}

// _uiFocusChanged удалён (v2.7) — система фокуса упразднена,
// распределение мощности делает назначение команды (WU-система)

// ══════════════════════════════════════════════════════
//  СЦЕНАРИИ (v3.1): выбор из меню до старта игры
//  Реестр — мета для карточек; сам контент грузится лоадером
//  в index.html (dev) или embed-блоком (dist) по localStorage
// ══════════════════════════════════════════════════════
const SCENARIO_REGISTRY = [
  { id:'agency', icon:'🏢', name:'Диджитал-агентство', desc:'Клиенты, проекты, репутация студии' },
  { id:'bank',   icon:'🏦', name:'Региональный банк',  desc:'Сделки, кредитный портфель, регулятор' },
];
const LS_SCENARIO_KEY = 'bt_scenario_v1';

function initScenarioSelect() {
  const host = document.getElementById('scenario-select');
  if (!host) return;
  const cur = localStorage.getItem(LS_SCENARIO_KEY) || 'agency';
  host.innerHTML = SCENARIO_REGISTRY.map(s => {
    const active = s.id === cur;
    return `<div onclick="switchScenario('${s.id}')" style="flex:1;min-width:200px;cursor:${active ? 'default' : 'pointer'};
        display:flex;gap:10px;align-items:center;padding:10px 12px;border-radius:10px;
        border:1px solid ${active ? 'rgba(45,212,191,.45)' : 'var(--border)'};
        background:${active ? 'rgba(45,212,191,.08)' : 'var(--bg2)'}">
      <span style="font-size:22px">${s.icon}</span>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:700">${s.name}</div>
        <div style="font-size:11px;color:var(--sub)">${s.desc}</div>
      </div>
      ${active ? '<span class="dlc-pill" style="background:rgba(45,212,191,.14);color:var(--teal)">Выбран</span>'
               : '<span class="dlc-pill" style="background:rgba(255,255,255,.06);color:var(--sub)">Играть</span>'}
    </div>`;
  }).join('');
}

function switchScenario(id) {
  // v3.18: основной путь — live-переключение без перезагрузки страницы.
  // Старое поведение (location.reload) оставлено как фолбэк, если live-режим
  // не справляется (нет доступа к источнику data — например, кастомные dev-сборки).
  return switchScenarioLive(id);
}

// ── v3.18: live-переключение сценария без location.reload ─────
// Логика:
//   1) если активен ран — confirm и сброс через resetGame() (G обнуляется)
//   2) грузим SCENARIO_DATA для нового id (dev: <script src>, dist: __SCEN_SRC)
//   3) пере-гидрируем SCENARIO, перепривязываем биндинги в engine
//   4) перерисовываем mode-screen — карточки сценария/сложности/спеков/интро/DLC
function switchScenarioLive(id) {
  const cur = localStorage.getItem(LS_SCENARIO_KEY) || 'agency';
  if (id === cur || !SCENARIO_REGISTRY.find(s => s.id === id)) return false;

  // Если посреди партии — авто-сброс без confirm (window.confirm блокируется Chrome).
  // Пользователь кликнул другой сценарий — намерение смены очевидно.
  if (typeof G !== 'undefined' && G && (G.month || 0) > 0) {
    if (typeof resetGame === 'function') resetGame();
    EventBus.emit('navigate', { screen: 'screen-mode' });
  }

  localStorage.setItem(LS_SCENARIO_KEY, id);

  _loadScenarioData(id, function (err) {
    if (err) {
      console.warn('[switchScenarioLive] не удалось загрузить data:', err);
      if (typeof notify === 'function') notify('⚠️ Ошибка загрузки сценария — обновите страницу', 'error');
      return;
    }
    try {
      SCENARIO = ScenarioLoader.hydrate(window.SCENARIO_DATA);
      if (typeof SE !== 'undefined' && typeof SE.applyActiveScenario === 'function') SE.applyActiveScenario();
      if (typeof rebindFromScenario === 'function') rebindFromScenario();
      // initState полностью обновит G под новый сценарий
      if (typeof initState === 'function') initState();

      // Перерисовка mode-screen и интро
      initScenarioSelect();
      initDifficultySelect();
      renderSpecGrid();
      applyScenarioChrome();
      if (typeof SE !== 'undefined' && typeof SE.syncIntroStats === 'function') SE.syncIntroStats();

      // Кнопка «Продолжить» — обновить состояние сейвов под новый сценарий
      const loadBtn = document.getElementById('btn-load-save');
      if (loadBtn && typeof hasSaves === 'function') loadBtn.disabled = !hasSaves();

      EventBus.emit('render');
      if (typeof notify === 'function') {
        const meta = SCENARIO_REGISTRY.find(s => s.id === id);
        notify(`${meta?.icon || '🎯'} Сценарий: ${meta?.name || id}`, 'success');
      }
    } catch (e) {
      console.error('[switchScenarioLive] hydrate/rebind упал:', e);
      if (typeof notify === 'function') notify('⚠️ Ошибка инициализации сценария — обновите страницу', 'error');
    }
  });
  return true;
}

// Загрузка SCENARIO_DATA по id — два пути:
//   • multi-дист: глобальный __SCEN_SRC map (id → исходник как строка)
//   • dev: динамический <script src="scenarios/<id>.data.js">
function _loadScenarioData(id, done) {
  // 1) Multi-дист: SCENARIO_DATA пересоздаётся через new Function
  if (typeof window.__SCEN_SRC !== 'undefined' && window.__SCEN_SRC[id]) {
    try {
      (new Function(window.__SCEN_SRC[id]))();
      done(null);
    } catch (e) { done(e); }
    return;
  }
  // 2) Dev: инжект <script> и ждём onload (data-файл присваивает window.SCENARIO_DATA)
  const s = document.createElement('script');
  s.src = `scenarios/${id}.data.js?ts=${Date.now()}`;  // обходим кеш
  s.onload  = () => done(null);
  s.onerror = () => done(new Error(`не удалось загрузить scenarios/${id}.data.js`));
  document.head.appendChild(s);
}

// ══════════════════════════════════════════════════════
//  СЛОЖНОСТЬ (v3.9): пресеты экономики, выбор до старта
//  Применяется в scenario-loader.hydrate() через override
//  settings (startMoney/overhead/winCondition/startReputation).
//  Реестр содержит порядок и meta — сами моды живут в loader.
// ══════════════════════════════════════════════════════
const LS_DIFFICULTY_KEY_UI = 'bt_difficulty_v1';

function initDifficultySelect() {
  const host = document.getElementById('difficulty-select');
  if (!host || typeof ScenarioLoader === 'undefined') return;
  const cur = localStorage.getItem(LS_DIFFICULTY_KEY_UI) || 'normal';
  const presets = ScenarioLoader.resolveDifficulties(SCENARIO);
  const order = ScenarioLoader.DIFFICULTY_ORDER;
  // Цветовая раскладка по сложности — оранжевые/тил-оттенки
  const TINT = {
    easy:      { bd: 'rgba(74,222,128,.4)',  bg: 'rgba(74,222,128,.07)', tag: 'var(--green)' },
    normal:    { bd: 'rgba(45,212,191,.45)', bg: 'rgba(45,212,191,.08)', tag: 'var(--teal)' },
    hard:      { bd: 'rgba(251,191,36,.45)', bg: 'rgba(251,191,36,.08)', tag: 'var(--amber)' },
    nightmare: { bd: 'rgba(248,113,113,.45)',bg: 'rgba(248,113,113,.08)',tag: 'var(--red)' },
  };
  host.innerHTML = order.map(id => {
    const p = presets[id]; if (!p) return '';
    const active = id === cur;
    const t = TINT[id] || TINT.normal;
    const perks = (p.perks || []).map(x => `<span class="dlc-pill" style="background:rgba(255,255,255,.05);color:var(--sub);font-size:10px">${x}</span>`).join(' ');
    return `<div onclick="switchDifficulty('${id}')" style="flex:1;min-width:200px;cursor:${active ? 'default' : 'pointer'};
        display:flex;flex-direction:column;gap:6px;padding:10px 12px;border-radius:10px;
        border:1px solid ${active ? t.bd : 'var(--border)'};
        background:${active ? t.bg : 'var(--bg2)'}">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
        <div style="font-size:13px;font-weight:700">${p.label}</div>
        ${active ? `<span class="dlc-pill" style="background:${t.bg};color:${t.tag};font-size:10px">Выбрана</span>`
                 : `<span class="dlc-pill" style="background:rgba(255,255,255,.06);color:var(--sub);font-size:10px">Выбрать</span>`}
      </div>
      <div style="font-size:11px;color:var(--sub);line-height:1.35">${p.desc || ''}</div>
      <div style="display:flex;flex-wrap:wrap;gap:4px">${perks}</div>
    </div>`;
  }).join('');
}

function switchDifficulty(id) {
  // v3.18: основной путь — live-переключение без перезагрузки страницы.
  return switchDifficultyLive(id);
}

// ── v3.18: live-переключение сложности без location.reload ────
// Сложность применяется через ScenarioLoader.applyDifficulty(sc, id),
// который мутирует SCENARIO.settings (overhead/winCondition/...).
// После этого initState() ресинкает все let-биндинги движка.
function switchDifficultyLive(id) {
  if (typeof ScenarioLoader === 'undefined') return false;
  const cur = localStorage.getItem(LS_DIFFICULTY_KEY_UI) || 'normal';
  if (id === cur || !ScenarioLoader.DIFFICULTY_ORDER.includes(id)) return false;

  // Авто-сброс без window.confirm (блокируется Chrome).
  if (typeof G !== 'undefined' && G && (G.month || 0) > 0) {
    if (typeof resetGame === 'function') resetGame();
    EventBus.emit('navigate', { screen: 'screen-mode' });
  }

  localStorage.setItem(LS_DIFFICULTY_KEY_UI, id);

  try {
    // applyDifficulty переписывает settings под новый пресет (мутирует SCENARIO)
    ScenarioLoader.applyDifficulty(SCENARIO, id);
    if (typeof SE !== 'undefined' && typeof SE.applyActiveScenario === 'function') SE.applyActiveScenario();
    if (typeof rebindFromScenario === 'function') rebindFromScenario();
    if (typeof initState === 'function') initState();

    // Перерисовка экранов выбора и интро
    initDifficultySelect();
    renderSpecGrid();
    applyScenarioChrome();
    if (typeof SE !== 'undefined' && typeof SE.syncIntroStats === 'function') SE.syncIntroStats();

    const loadBtn = document.getElementById('btn-load-save');
    if (loadBtn && typeof hasSaves === 'function') loadBtn.disabled = !hasSaves();

    EventBus.emit('render');
    if (typeof notify === 'function' && SCENARIO._activeDifficulty) {
      notify(`Сложность: ${SCENARIO._activeDifficulty.label}`, 'success');
    }
    return true;
  } catch (e) {
    console.error('[switchDifficultyLive] упал:', e);
    if (typeof notify === 'function') notify('⚠️ Ошибка переключения сложности — обновите страницу', 'error');
    return false;
  }
}

// Сценарный «хром»: интро-текст, иконки лого, title — из SCENARIO
function applyScenarioChrome() {
  if (typeof SCENARIO === 'undefined') return;
  const intro = document.querySelector('.intro-desc');
  if (intro && SCENARIO.settings?.introText) intro.innerHTML = SCENARIO.settings.introText;
  document.querySelectorAll('.logo-icon').forEach(el => { el.textContent = SCENARIO.icon || '🏢'; });
  document.title = `BizTycoon — ${SCENARIO.name || ''}`;
  // Пилюля активной сложности на интро-экране
  if (intro && SCENARIO._activeDifficulty) {
    const d = SCENARIO._activeDifficulty;
    const old = document.getElementById('intro-diff-pill');
    if (old) old.remove();
    const pill = document.createElement('div');
    pill.id = 'intro-diff-pill';
    pill.style.cssText = 'margin-top:10px;display:inline-flex;align-items:center;gap:8px;padding:6px 12px;border-radius:8px;background:var(--bg2);border:1px solid var(--border);font-size:12px;color:var(--sub)';
    pill.innerHTML = `<span>Сложность:</span><b style="color:var(--text)">${d.label}</b><span style="opacity:.7">— ${d.desc || ''}</span>`;
    intro.parentNode.insertBefore(pill, intro.nextSibling);
  }
}

// Spec-карточки из SCENARIO.specs — статический HTML ломал не-агентские сценарии
function renderSpecGrid() {
  const grid = document.querySelector('.spec-grid');
  if (!grid || typeof SPECS === 'undefined') return;
  const TAGS = ['green', 'amber', 'purple', ''];
  grid.innerHTML = Object.entries(SPECS).map(([id, s], i) => `
    <div class="spec-card" onclick="selectSpec('${id}')" id="spec-${id}">
      <div class="spec-icon">${s.icon}</div><div class="spec-name">${s.name}</div>
      <div class="spec-desc">${s.desc}</div>
      <div class="spec-bonus" style="margin-top:8px;display:flex;flex-direction:column;gap:4px">
        <span class="tag ${TAGS[i % TAGS.length]}">${s.bonusLabel}</span>
        <span class="tag teal" style="font-size:10px">${s.passiveLabel}</span>
      </div>
    </div>`).join('');
}

// ══════════════════════════════════════════════════════
//  КАЛЕНДАРЬ-ПЛАНИРОВЩИК (v3.5)
//  Горизонт 8 месяцев: рабочие дни, прогнозы сдач/выплат по
//  текущему темпу, дедлайны (с буфером движка), отложенные события
// ══════════════════════════════════════════════════════
function _projectPaceMonths(c) {
  // Та же математика, что в advanceMonth: прогноз месяцев до 100% текущей фазы
  const pLoad   = getProjectLoad(c);
  const projThr = getProjectThroughput(c);
  const eff     = pLoad > 0 ? effFromRatio(projThr / pLoad) : 1;
  const workCnt = c._lcChain ? c._lcChain.filter(p => p.startsWith('work_')).length : 1;
  const phaseDur = (c._duration || 3) / Math.max(1, workCnt);
  const perMonth = (100 / phaseDur) * eff * getSpeed() * getFatigueMult();
  if (perMonth <= 0) return null;
  // оставшиеся фазы: текущая (до 100%) + целые следующие work-фазы + ревью/сдача мгновенны
  const wPhases = c._lcChain ? c._lcChain.filter(p => p.startsWith('work_')) : ['work_0'];
  const wIdx    = Math.max(0, wPhases.indexOf(c._lcPhase));
  const restCur = Math.max(0, 100 - (c._progress || 0)) / perMonth;
  const restFut = (wPhases.length - wIdx - 1) * (100 / perMonth);
  return Math.max(1, Math.ceil(restCur + restFut));
}

// Ближайшие денежные поступления по текущему темпу (для P&L и сводок)
function forecastInflows(horizon = 6) {
  const out = [];
  (G.activeClients || []).forEach(c => {
    if (!c._lcPhase || !c._lcPhase.startsWith('work_')) return;
    const pLoad = getProjectLoad(c), projThr = getProjectThroughput(c);
    const eff = pLoad > 0 ? effFromRatio(projThr / pLoad) : 1;
    const wPhases = c._lcChain ? c._lcChain.filter(p => p.startsWith('work_')) : ['work_0'];
    const perPhase = (100 / ((c._duration || 3) / Math.max(1, wPhases.length))) * eff * getSpeed() * getFatigueMult();
    if (perPhase <= 0) return;
    const mDone = _projectPaceMonths(c);
    if (mDone != null && mDone <= horizon) out.push({ m: mDone, icon: '🏁', label: c.name, sum: c._totalBudget || 0 });
    // следующая выплата по ходу (milestone или этапная треть)
    if (c._lcTags && c._lcTags.payment_staged && (c._stagedPaid || 0) < 3) {
      const mPay = Math.max(1, Math.ceil(Math.max(0, 100 - (c._progress || 0)) / perPhase));
      if (mPay <= horizon && mPay < (mDone || 99)) out.push({ m: mPay, icon: '💵', label: `${c.name} · этап ${(c._stagedPaid||0)+1}/3`, sum: Math.round((c._originalBudget||0)/3/5000)*5000 });
    } else (c._milestones || []).forEach((thr, i) => {
      if ((c._milestonesPaid || []).includes(i)) return;
      const wIdx = Math.max(0, wPhases.indexOf(c._lcPhase));
      const gp = ((wIdx * 100) + (c._progress || 0)) / wPhases.length;
      if (gp >= thr) return;
      const perGlobal = (100 / (c._duration || 3)) * eff * getSpeed() * getFatigueMult();
      const mPay = Math.max(1, Math.ceil((thr - gp) / perGlobal));
      if (mPay <= horizon) out.push({ m: mPay, icon: '💵', label: `${c.name} · ${thr}%`, sum: Math.round((c._originalBudget||0)*(c._milestonePcts||[])[i]/5000)*5000 });
    });
  });
  (G.calendarEvents || []).forEach(ev => {
    if (!ev.done && ev.money > 0 && ev.month - G.month <= horizon) out.push({ m: ev.month - G.month, icon: ev.icon || '📌', label: ev.label, sum: ev.money });
  });
  return out.sort((a, b) => a.m - b.m);
}

function openCalendar() {
  const body = document.getElementById('calendar-body');
  if (!body) return;
  const HORIZON = 8;
  const byMonth = {};   // absMonth → [{icon,text,color}]
  const add = (m, icon, text, color) => {
    if (m < G.month || m >= G.month + HORIZON) return;
    (byMonth[m] = byMonth[m] || []).push({ icon, text, color });
  };

  (G.activeClients || []).forEach(c => {
    // Отложенный старт работ (транши/бюрократия)
    if (c.modifier?.type === 'payment_delay_fixed' && (c._monthsSigned || 0) <= c.modifier.val) {
      add(G.month + (c.modifier.val - (c._monthsSigned || 0)) + 1, '▶', `${c.name}: старт работ`, 'var(--teal)');
    }
    const inWork = c._lcPhase && c._lcPhase.startsWith('work_');
    if (inWork) {
      const mths = _projectPaceMonths(c);
      if (mths != null) {
        add(G.month + mths, '🏁', `${c.name}: прогноз сдачи · +${fmtK(c._totalBudget || 0)}`, 'var(--green)');
        // Поэтапная оплата: следующая треть — в конце текущей work-фазы
        if (c._lcTags && c._lcTags.payment_staged && (c._stagedPaid || 0) < 3) {
          const pLoad = getProjectLoad(c), projThr = getProjectThroughput(c);
          const eff = pLoad > 0 ? effFromRatio(projThr / pLoad) : 1;
          const workCnt = c._lcChain ? c._lcChain.filter(p => p.startsWith('work_')).length : 1;
          const perMonth = (100 / ((c._duration || 3) / Math.max(1, workCnt))) * eff * getSpeed() * getFatigueMult();
          if (perMonth > 0) {
            const phaseEnd = Math.max(1, Math.ceil(Math.max(0, 100 - (c._progress || 0)) / perMonth));
            const third = Math.round((c._originalBudget || 0) / 3 / 5000) * 5000;
            add(G.month + phaseEnd, '💵', `${c.name}: этап ${(c._stagedPaid || 0) + 1}/3 · +${fmtK(third)}`, 'var(--green)');
          }
        }
        // Milestone-прогноз (tier-схема)
        (c._milestones || []).forEach((thr, i) => {
          if ((c._milestonesPaid || []).includes(i)) return;
          const wPhases = c._lcChain ? c._lcChain.filter(p => p.startsWith('work_')) : ['work_0'];
          const wIdx = Math.max(0, wPhases.indexOf(c._lcPhase));
          const globalProg = ((wIdx * 100) + (c._progress || 0)) / wPhases.length;
          if (globalProg >= thr) return;
          const pLoad = getProjectLoad(c), projThr = getProjectThroughput(c);
          const eff = pLoad > 0 ? effFromRatio(projThr / pLoad) : 1;
          const perMonthGlobal = ((100 / (c._duration || 3)) * eff * getSpeed() * getFatigueMult());
          if (perMonthGlobal <= 0) return;
          const m = Math.max(1, Math.ceil((thr - globalProg) / perMonthGlobal));
          const pay = Math.round((c._originalBudget || 0) * (c._milestonePcts || [])[i] / 5000) * 5000;
          add(G.month + m, '💵', `${c.name}: milestone ${thr}% · +${fmtK(pay)}`, 'var(--green)');
        });
      }
      // Дедлайн (с буфером движка ×1.6+2)
      const dl = Math.round((c._duration || 3) * 1.6) + 2;
      const effMon = c._workStartMonth != null ? (c._monthsSigned || 0) - c._workStartMonth : (c._monthsSigned || 0);
      add(G.month + Math.max(0, dl - effMon), '⏰', `${c.name}: дедлайн (буфер учтён)`, 'var(--amber)');
    }
  });

  // Отложенные события (schedule / scheduleCalendarEvent)
  (G.calendarEvents || []).forEach(ev => {
    if (!ev.done) add(ev.month, ev.icon || '📌', `${ev.label}${ev.money ? ` · ${ev.money > 0 ? '+' : ''}${fmtK(ev.money)}` : ''}`, ev.money < 0 ? 'var(--red)' : 'var(--teal)');
  });

  let html = '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">';
  for (let i = 0; i < HORIZON; i++) {
    const m = G.month + i;
    const wd = getWorkdays(m % 12);
    const wdCol = wd <= 18 ? 'var(--amber)' : wd >= 22 ? 'var(--teal)' : 'var(--sub)';
    const items = byMonth[m] || [];
    html += `<div style="background:var(--bg);border:1px solid ${i === 0 ? 'rgba(45,212,191,.35)' : 'var(--border)'};border-radius:8px;padding:8px;min-height:92px">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:5px">
        <b style="font-size:11px">${MONTHS[m % 12]} ${2026 + Math.floor(m / 12)}${i === 0 ? ' · сейчас' : ''}</b>
        <span style="font-size:10px;color:${wdCol};font-weight:700">${wd} р.дн.</span>
      </div>
      ${items.length ? items.map(it => `<div style="font-size:9.5px;color:${it.color};margin-bottom:3px;line-height:1.3">${it.icon} ${it.text}</div>`).join('')
        : '<div style="font-size:9px;color:var(--muted)">—</div>'}
    </div>`;
  }
  html += '</div><div style="font-size:9px;color:var(--muted);margin-top:8px">Прогнозы — по текущему темпу команды (назначения, скорость, усталость); меняется состав — меняются и даты. Короткие месяцы (≤18 дн.) подсвечены янтарным.</div>';
  body.innerHTML = html;
  document.getElementById('calendar-modal').style.display = 'flex';
}
function closeCalendar() { const m = document.getElementById('calendar-modal'); if (m) m.style.display = 'none'; }

// ── Кастомные тултипы: лёгкий блок под курсором вместо системного title ──
// Любой элемент с атрибутом data-tip="текст" показывает подсказку сразу при наведении.
(function initCustomTooltips() {
  if (typeof document === 'undefined') return;
  let tip = null;
  const ensure = () => {
    if (tip) return tip;
    tip = document.createElement('div');
    tip.id = 'bz-tip';
    tip.style.cssText = [
      'position:fixed', 'z-index:9999', 'max-width:280px', 'padding:8px 11px',
      'border-radius:8px', 'background:#0d1117', 'border:1px solid rgba(255,255,255,.14)',
      'color:#e6edf3', 'font-size:12px', 'line-height:1.45',
      'box-shadow:0 8px 28px rgba(0,0,0,.55)', 'pointer-events:none', 'display:none',
      'white-space:normal',
    ].join(';');
    document.body.appendChild(tip);
    return tip;
  };
  const place = (e) => {
    if (!tip || tip.style.display === 'none') return;
    const pad = 14;
    const r = tip.getBoundingClientRect();
    let x = e.clientX + pad, y = e.clientY + pad;
    if (x + r.width  > window.innerWidth)  x = e.clientX - r.width  - pad;
    if (y + r.height > window.innerHeight) y = e.clientY - r.height - pad;
    tip.style.left = Math.max(4, x) + 'px';
    tip.style.top  = Math.max(4, y) + 'px';
  };
  document.addEventListener('mouseover', (e) => {
    const el = e.target.closest && e.target.closest('[data-tip]');
    if (!el) return;
    const t = ensure();
    t.textContent = el.getAttribute('data-tip');
    t.style.display = 'block';
    place(e);
  });
  document.addEventListener('mousemove', place);
  document.addEventListener('mouseout', (e) => {
    const el = e.target.closest && e.target.closest('[data-tip]');
    if (el && tip) tip.style.display = 'none';
  });
})();

// ── EventBus → DOM биндинги (Godot: вызовы connect в _ready) ─
function initEventBus() {
  EventBus.on('notify',       ({ msg, type })                              => _uiNotify(msg, type));
  EventBus.on('navigate',     ({ screen })                                 => _uiNavigate(screen));
  EventBus.on('render',       ()                                           => renderGame());
  EventBus.on('show_event',   ({ ev })                                     => showEvent(ev));
  EventBus.on('end_game',     ({ won })                                    => endGame(won));
  EventBus.on('spec_selected',({ id })                                     => _uiSelectSpec(id));
  EventBus.on('show_scout',   ({ offers })                                 => _uiShowScout(offers));
  EventBus.on('close_scout',  ()                                           => _uiCloseScout());
  EventBus.on('show_confirm', ({ icon, title, body, confirmText, confirmClass, onConfirm }) =>
    _uiShowConfirm(icon, title, body, confirmText, confirmClass, onConfirm));
  // AI-сигналы — перерисовываем вкладку если она открыта
  const _refreshAI = () => {
    if (document.getElementById('tab-panel-ai')?.classList.contains('active')) renderAITab();
    // Бейдж на вкладке при новом ответе
  };
  EventBus.on('ai_purchased',        _refreshAI);
  EventBus.on('ai_upgrading',        _refreshAI);
  EventBus.on('ai_training_complete',_refreshAI);
  EventBus.on('ai_thinking',         _refreshAI);
  EventBus.on('ai_response_ready',   () => {
    _refreshAI();
    const badge = document.getElementById('tab-ai-badge');
    if (badge) { badge.style.display = 'inline-flex'; }
  });

  // Б.4: уход сотрудника — показываем модал с именем/ролью/усталостью
  EventBus.on('staff_quit', ({ staff, fatigue }) => _showStaffQuitModal(staff, fatigue));
}

// ── Б.4: Staff Quit Modal ─────────────────────────────
function _showStaffQuitModal(staff, fatigue) {
  const modal = document.getElementById('staff-quit-modal');
  if (!modal) return;

  const icon  = staff.icon || '👤';
  const name  = staff.name || 'Сотрудник';
  const role  = staff.roleLabel || staff.role || '';
  const grade = staff.gradeLabel || staff.grade || '';
  const fat   = Math.min(100, Math.max(0, fatigue || 0));
  const barCol = fat >= 85 ? 'var(--red)' : 'var(--amber)';

  const iconEl = document.getElementById('sqm-icon');
  const nameEl = document.getElementById('sqm-name');
  const roleEl = document.getElementById('sqm-role');
  const fatLbl = document.getElementById('sqm-fatigue-label');
  const fatBar = document.getElementById('sqm-fatigue-bar');

  if (iconEl)  iconEl.textContent  = icon;
  if (nameEl)  nameEl.textContent  = `${name} покинул команду`;
  if (roleEl)  roleEl.textContent  = grade ? `${role} · ${grade}` : role;
  if (fatLbl) { fatLbl.textContent = `${fat}%`; fatLbl.style.color = barCol; }
  if (fatBar) { fatBar.style.width = `${fat}%`; fatBar.style.background = barCol; }

  modal.classList.add('active');
}

function _closeStaffQuitModal() {
  document.getElementById('staff-quit-modal')?.classList.remove('active');
}
// ══════════════════════════════════════════════════════
//  CAPABILITY BAR HELPER  (Q / V visual meter)
// ══════════════════════════════════════════════════════
// thresholds: [{val, label}]  — vertical marker lines
// col: CSS color for the fill
// hint: shown in amber below bar when current val is 0
function makeCapBar(cur, maxV, thresholds, col, hint) {
  const pct = Math.min(100, cur / maxV * 100);
  const marks = thresholds.map(t => {
    const x = Math.min(99, t.val / maxV * 100);
    const reached = cur >= t.val;
    return `<div style="position:absolute;left:${x}%;top:0;transform:translateX(-50%);text-align:center;pointer-events:none">
      <div style="width:1px;height:8px;background:${reached ? col : 'var(--border)'};margin:0 auto"></div>
      <div style="font-size:9px;color:${reached ? col : 'var(--muted)'};white-space:nowrap;margin-top:1px">${t.label}</div>
    </div>`;
  }).join('');
  return `
    <div style="position:relative;height:5px;background:var(--bg3);border-radius:3px;margin-bottom:2px">
      <div style="height:100%;width:${pct}%;background:${col};border-radius:3px;transition:width .4s"></div>
    </div>
    <div style="position:relative;height:22px">${marks}</div>
    ${cur === 0 && hint ? `<div style="font-size:10px;color:var(--amber);margin-top:-2px;margin-bottom:4px">↑ ${hint}</div>` : ''}`;
}

// ══════════════════════════════════════════════════════
//  RENDER GAME
// ══════════════════════════════════════════════════════
function renderGame() {
  const spec=SPECS[G.spec];
  document.getElementById('g-spec-name').textContent=spec.name;
  document.getElementById('g-month').textContent=monthLabel();
  // Ф.6: индикатор сезона рядом с меткой месяца (тема + тултип эффектов + хинт следующего)
  { const _sea = (typeof getActiveSeason === 'function') ? getActiveSeason() : null;
    let _seaEl = document.getElementById('g-season-badge');
    if (_sea && _sea.label) {
      if (!_seaEl) {
        _seaEl = document.createElement('span');
        _seaEl.id = 'g-season-badge';
        _seaEl.style.cssText = 'display:inline-block;font-size:9px;padding:1px 6px;border-radius:4px;margin-left:6px;font-weight:700;vertical-align:middle;cursor:help';
        const mEl = document.getElementById('g-month');
        if (mEl) mEl.parentElement.appendChild(_seaEl);
      }
      _seaEl.textContent = `${_sea.icon} ${_sea.label}`;
      _seaEl.style.color  = _sea.color;
      _seaEl.style.background = `${_sea.color}1f`;
      _seaEl.style.border = `1px solid ${_sea.color}55`;
      const _nx = (typeof getNextSeason === 'function') ? getNextSeason() : null;
      const _nxTip = _nx ? ` · Следующий сезон через ${_nx.monthsLeft} мес: ${_nx.theme.icon} ${_nx.theme.label}` : '';
      _seaEl.setAttribute('data-tip', `${_sea.icon} ${_sea.label}. ${_sea.desc}${_nxTip}`);
      _seaEl.title = '';
    } else if (_seaEl) {
      _seaEl.remove();
    } }

  // Money
  const mEl=document.getElementById('g-money');
  mEl.textContent=fmt(G.money);
  mEl.className='v '+(G.money>100000?'green':G.money>0?'amber':'red');

  // Cashflow — чистый поток/мес: средний приток проектов + дивиденды − расходы
  const _cfBurn = getTotalStaffCost() + OVERHEAD + (G.loan ? G.loan.monthlyPayment : 0);
  const _cfDiv  = (typeof LivingMarket !== 'undefined' && LivingMarket.totalDividends) ? LivingMarket.totalDividends() : 0;
  const _cfInf  = (typeof forecastInflows === 'function') ? forecastInflows(6) : [];
  const _cfProjRate = _cfInf.length ? Math.round(_cfInf.reduce((s,f)=>s+f.sum,0)/6) : 0;
  const cf = _cfProjRate + _cfDiv - _cfBurn;
  const cfEl=document.getElementById('g-cashflow');
  cfEl.textContent=(cf>=0?'+':'')+fmt(cf);
  cfEl.className='v '+(cf>=0?'green':'red');
  cfEl.setAttribute('data-tip', 'Чистый поток/мес (оценка):\n• проекты ~+' + fmtK(_cfProjRate) + ' (среднее за 6 мес.)\n• дивиденды +' + fmtK(_cfDiv) + '\n• расходы −' + fmtK(_cfBurn) + ' (ФОТ+overhead' + (G.loan?'+кредит':'') + ')');
  cfEl.style.cursor='help';

  // Reputation (legacy header chip — может быть удалён из DOM)
  const repEl=document.getElementById('g-rep');
  if (repEl) { repEl.textContent=Math.round(G.reputation); repEl.className='v '+(G.reputation>=70?'teal':G.reputation>=40?'amber':'red'); }

  // Portfolio (legacy)
  const pfEl=document.getElementById('g-portfolio'); if (pfEl) pfEl.textContent=G.portfolio||0;

  // Goal progress bar
  const winCond = (SCENARIO?.settings?.winCondition) || 7500000;
  const goalPct = Math.min(100, Math.round(G.money / winCond * 100));
  const goalBarEl = document.getElementById('g-goal-bar');
  const goalPctEl = document.getElementById('g-goal-pct');
  const moneySavedEl = document.getElementById('g-money-saved');
  if (goalBarEl) { goalBarEl.style.width = goalPct + '%'; goalBarEl.style.background = goalPct >= 80 ? 'var(--green)' : 'var(--accent)'; }
  if (goalPctEl) goalPctEl.textContent = goalPct + '%';
  if (moneySavedEl) moneySavedEl.textContent = fmt(G.money) + ' / ' + fmt(winCond) + ' ₽';

  // Actions pips
  const pipsDiv=document.getElementById('g-action-pips');
  pipsDiv.innerHTML='';
  const _wdMax = getWorkdays(G.month % 12);
  for (let i=0;i<_wdMax;i++){
    const d=document.createElement('div');
    d.className='pip'+(i>=G.actions?' used':'');
    pipsDiv.appendChild(d);
  }
  document.getElementById('g-action-val').textContent=`${G.actions} / ${_wdMax}`;
  const hasPool=G.scoutPool && G.scoutPool.length>0;
  // Кредитные линии — собственный блок (v3.6, вынесены из P&L)
  { const host = document.getElementById('loans-host');
    if (host) {
      if (G.loan) {
        host.innerHTML = `<div style="border:1px solid rgba(210,153,34,.3);border-radius:8px;padding:7px 10px;background:rgba(210,153,34,.05)">
          <div style="font-size:11px;color:var(--amber);font-weight:700">${G.loan.icon||'🏦'} Кредит «${G.loan.label}»</div>
          <div style="font-size:10px;color:var(--sub);margin-top:2px">−${fmtK(G.loan.monthlyPayment)}/мес · ещё ${G.loan.monthsRemaining} мес. · остаток ${fmtK(G.loan.monthlyPayment * G.loan.monthsRemaining)}</div>
          ${G.loan.debuff ? `<div style="font-size:9px;color:var(--red);margin-top:2px">⚡ ${G.loan.debuff.label}</div>` : ''}
        </div>`;
      } else {
        const loans = getLoansInfo(G.reputation);
        const availCount = loans.filter(t => t.available).length;
        const rows = loans.map(t => {
          const locked = !t.available;
          return `<div style="display:flex;align-items:center;justify-content:space-between;gap:6px;padding:5px 0;border-bottom:1px solid var(--border);opacity:${locked ? '0.45' : '1'}">
            <div style="min-width:0;flex:1">
              <div style="font-size:11px;font-weight:600;color:${locked ? 'var(--muted)' : 'var(--text)'}">${t.icon} ${t.label}${locked ? ` <span style="font-size:9px;color:var(--muted)">🔒 реп ≥${t.minRep}</span>` : ''}</div>
              <div style="font-size:10px;color:var(--sub);margin-top:1px">${fmtK(t.principal)} · ${fmtK(t.monthlyPayment)}/мес × ${t.months} мес.</div>
              ${t.debuff ? `<div style="font-size:9px;color:var(--red);margin-top:2px">⚠ ${t.debuff.label}</div>` : ''}
            </div>
            <button class="btn btn-xs btn-ghost" style="font-size:9px;padding:2px 7px;flex-shrink:0" ${locked ? 'disabled style="opacity:.35"' : ''} onclick="takeLoanById('${t.id}')">Взять</button>
          </div>`;
        }).join('');
        host.innerHTML = `<div style="cursor:pointer;display:flex;align-items:center;justify-content:space-between;user-select:none;border:1px solid var(--border);border-radius:8px;padding:7px 10px"
            onclick="(()=>{const el=document.getElementById('loan-list');const arr=document.getElementById('loan-arr');el.style.display=el.style.display==='none'?'block':'none';arr.textContent=el.style.display==='none'?'▸':'▾';})()">
          <span style="font-size:11px;color:var(--sub);font-weight:600">🏦 Кредитные линии <span style="font-weight:400;color:var(--muted)">(${availCount} доступно)</span></span>
          <span id="loan-arr" style="font-size:10px;color:var(--muted)">▸</span>
        </div>
        <div id="loan-list" style="display:none;margin-top:4px;padding:0 4px">${rows}</div>`;
      }
    } }

  // Подписи стоимостей действий — из данных сценария (фикс хвостов v3.3)
  { const h=document.getElementById('hire-cost-label');    if (h) h.textContent = `−${HIRE_COST} дн.`;
    const r=document.getElementById('refresh-cost-label'); if (r) r.textContent = `−${SCOUT_COST} дн.`;
    const sc=document.getElementById('scout-cost-label');  if (sc) sc.textContent = `−${SCOUT_COST} дн.`; }
  // Забота о команде: повторяемые акции (recovery вне дерева, v3.4)
  { const host=document.getElementById('recovery-actions');
    if (host) {
      // Индикатор усталости — там же, где её лечат (фикс: была видна только в метриках)
      const _ft = Math.round(G.teamFatigue || 0);
      const _ftCol = _ft >= 85 ? 'var(--red)' : _ft >= 60 ? 'var(--amber)' : _ft >= 30 ? '#e8a838' : 'var(--green)';
      const _ftLbl = _ft >= 85 ? 'Кризис' : _ft >= 60 ? 'Выгорание' : _ft >= 30 ? 'Напряжение' : 'Норма';
      const _ftHead = `<div style="margin-bottom:6px">
        <div style="display:flex;justify-content:space-between;font-size:10px;margin-bottom:3px">
          <span style="color:var(--sub)">😴 Усталость команды</span>
          <span style="color:${_ftCol};font-weight:700">${_ft} · ${_ftLbl}</span>
        </div>
        <div style="height:4px;background:var(--bg3);border-radius:2px;overflow:hidden">
          <div style="height:100%;width:${_ft}%;background:${_ftCol};border-radius:2px;transition:width .3s"></div>
        </div>
      </div>`;
      const acts=(UPGRADES||[]).filter(u=>!u.treePos && (u.fatigueReduce || !u.oneTime));
      host.innerHTML = _ftHead + acts.map(u=>{
        const cd=(G.fatigueActionCooldowns||{})[u.id]||0;
        const ftGate=u.minFatigue && (G.teamFatigue||0)<u.minFatigue;
        const dis=cd>0||ftGate||G.money<u.cost||G.actions<u.days;
        const eff=u.fatigueReduce?`😴 −${u.fatigueReduce}`:`Q +${u.qBonus} (мес)`;
        const note=cd>0?`⏳ ${cd} мес.`:ftGate?`уст. ≥${u.minFatigue}`:`${fmtK(u.cost)} · ${u.days} дн.`;
        const buyFn1 = u.fatigueReduce ? 'buyFatigueAction' : 'buyUpgrade';
        return `<button class="btn btn-xs btn-ghost" ${dis?'disabled':''} onclick="${buyFn1}('${u.id}')"
          style="display:flex;justify-content:space-between;gap:6px;width:100%;text-align:left">
          <span>${u.icon} ${u.name}</span>
          <span style="color:var(--teal)">${eff}</span>
          <span style="color:var(--muted);font-size:10px;flex-shrink:0">${note}</span>
        </button>`;
      }).join('');
    } }
  const scoutBtn=document.getElementById('btn-scout');
  scoutBtn.disabled=!hasPool && G.actions<SCOUT_COST;
  // Ф.7: на голом тир-0 (scout заперт) скаутинг ПЕРЕОДЕТ в «один разовый заказ
  // руками» (§11.2). Рендерим наклейку прямо здесь — единый источник правды,
  // чтобы applyModuleVisibility не гонялся за перерисовкой (баг клоббера).
  const _scoutT0 = (typeof Unlocks!=='undefined' && Unlocks.isActive && Unlocks.isActive()
    && typeof isModuleUnlocked==='function' && !isModuleUnlocked('scout'));
  scoutBtn.innerHTML=hasPool
    ? `📋 Открыть пул <span style="color:rgba(255,255,255,.6);font-size:11px">${G.scoutPool.length} ${G.scoutPool.length===1?'проект':'проекта'}</span>`
    : _scoutT0
      ? `📦 Найти разовый заказ <span style="color:rgba(255,255,255,.5);font-size:11px" id="scout-cost-label">тир-0 · один за раз</span>`
      : `🔍 Скаутинг проектов <span style="color:rgba(255,255,255,.5);font-size:11px" id="scout-cost-label">−${SCOUT_COST} дн.</span>`;

  // ── Active clients ──
  document.getElementById('g-client-count').textContent=G.activeClients.length+'/'+getCapacity();
  let chtml='';

  if (G.activeClients.length===0){
    chtml=`<div style="text-align:center;padding:18px 0;color:var(--sub);">
      <div style="font-size:26px;margin-bottom:6px">🔍</div>
      <div style="font-weight:600;color:var(--text);margin-bottom:4px">Нет активных проектов</div>
      <div style="font-size:11px">Используй Скаутинг в боковой панели</div>
    </div>`;
  }

  // Сводка мощности (v2.7, фокус упразднён): нагрузка всех проектов vs мощность
  // команды. Распределение мощности — через назначение сотрудников (WU-система).
  const _thrForPct    = Math.max(1, getTeamThroughput());
  const usedLoad      = getTotalLoad();   // v3.0: разовые включены в общую нагрузку
  const capOver       = usedLoad > _thrForPct;
  if (G.activeClients.length > 0) {
    const pctUsed  = Math.round(usedLoad / _thrForPct * 100);
    const barUsed  = Math.min(100, pctUsed);
    const barColor = capOver ? '#F85149' : pctUsed >= 85 ? '#D29922' : '#3FB950';
    const hBg      = capOver ? 'rgba(248,81,73,.08)'  : 'rgba(45,212,191,.05)';
    const hBrd     = capOver ? 'rgba(248,81,73,.25)'  : 'rgba(45,212,191,.18)';
    const hClr     = capOver ? 'var(--red)' : pctUsed >= 85 ? 'var(--amber)' : 'var(--teal)';
    const otNote   = '';
    const hTxt     = capOver
      ? `⚠️ Перегруз: проектам нужно ${Math.round(usedLoad)} ед., у команды ${_thrForPct} — прогресс замедлится`
      : `Мощность: занято ${Math.round(usedLoad)} из ${_thrForPct} ед.${otNote}`;
    chtml += `<div id="capacity-header" style="background:${hBg};border:1px solid ${hBrd};border-radius:7px;padding:6px 10px;margin-bottom:8px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px">
        <span id="capacity-total-info" style="font-size:11px;color:${hClr};font-weight:600">${hTxt}</span>
      </div>
      <div style="height:4px;background:var(--bg3);border-radius:2px;overflow:hidden">
        <div style="height:100%;width:${barUsed}%;background:${barColor};border-radius:2px;transition:width .3s"></div>
      </div>
    </div>`;
  }

  G.activeClients.forEach(c=>{
    const nps       = Math.round(G.clientNPS[c.id]??c.npsStart??70);
    const nc        = npsColor(nps);
    const warn      = nps<25?'critical':nps<45?'at-risk':'';
    const ml        = c.modifier?.label||'';
    const mb        = c.modBadge||'mb-teal';
    const affordable= G.money>=20000;

    // Прогресс проекта
    const progress  = Math.round(c._progress||0);
    const progColor = progress>=100?'var(--green)':progress>=60?'var(--teal)':'var(--amber)';

    // Дедлайн-бейдж
    let deadlineBadge='';
    if (!c.oneTime && c._duration) {
      const mo=c._monthsSigned||0, dur=c._duration, overdue=mo>dur;
      const penPct=overdue?Math.min(40,Math.round((mo-dur)*10)):0;
      if (overdue) {
        deadlineBadge=`<span class="tag red" style="font-size:10px;">⏰ +${mo-dur} мес.${penPct?` (−${penPct}%)`:''}</span>`;
      } else {
        const col=mo>=dur?'var(--green)':mo>=(dur-1)?'var(--amber)':'var(--teal)';
        deadlineBadge=`<span style="font-size:10px;color:${col};font-weight:600;">📅 ${mo}/${dur} мес.</span>`;
      }
    }

    // Ожидание старта (payment_delay_fixed)
    const isWaiting = c.modifier?.type==='payment_delay_fixed' && (c._monthsSigned||0)<=c.modifier.val;
    const waitMos   = isWaiting ? c.modifier.val-(c._monthsSigned||0) : 0;

    // Бюджет — показываем реальную ожидаемую выплату с учётом мультипликатора портфолио
    const budget     = c._totalBudget||0;
    const pfM        = getPortfolioMultiplier();
    const pfBoostPct = Math.round((pfM - 1) * 100);
    const actualPayout = pfBoostPct > 0 ? Math.round(budget * pfM) : budget; // реальная выплата
    const budgetStr = c.oneTime
      ? `${fmtK(budget)}<small> разово</small>`
      : isWaiting
        ? `<span style="color:var(--muted);font-size:12px">${fmtK(budget)}</span><small style="color:var(--amber)"> старт через ${waitMos} мес.</small>`
        : (() => {
            const origStr = (c._originalBudget && c._originalBudget !== budget && (c._milestonesPaid||[]).length > 0)
              ? `<div style="font-size:9px;color:var(--sub);text-decoration:line-through">${fmtK(c._originalBudget)} полный</div>` : '';
            // Показываем реальную выплату (с бонусом), а не базовую
            const pfStr = pfBoostPct > 0
              ? `<div style="font-size:9px;color:var(--purple);font-weight:600;margin-top:1px">💎 +${pfBoostPct}% портфолио → ${fmtK(actualPayout)}</div>`
              : '';
            return `${origStr}${fmtK(budget)}<small> при сдаче</small>${pfStr}`;
          })();

    // Кнопка «Завершить» — только при progress === 100
    const canComplete = !c.oneTime && progress >= 100;

    // Milestone-маркеры и инфо
    const hasMilestones = (c._milestones||[]).length > 0;
    const milestoneMarkers = hasMilestones
      ? (c._milestones).map((thr, idx) => {
          const paid = (c._milestonesPaid||[]).includes(idx);
          const col  = paid ? 'var(--green)' : 'var(--amber)';
          const amt  = Math.round((c._originalBudget||c._totalBudget) * (c._milestonePcts||[])[idx] / 5000) * 5000;
          return `<div style="position:absolute;left:${thr}%;top:-2px;width:2px;height:8px;background:${col};border-radius:1px" title="${paid?'✅':'⏳'} Milestone ${thr}%: ${fmtK(amt)}"></div>`;
        }).join('')
      : '';
    const milestoneSummary = hasMilestones ? (()=>{
      const totalPaid = (c._milestonesPaid||[]).reduce((s, idx) => {
        return s + Math.round((c._originalBudget||0) * (c._milestonePcts||[])[idx] / 5000) * 5000;
      }, 0);
      const next = (c._milestones).find((thr, idx) => !(c._milestonesPaid||[]).includes(idx));
      if (totalPaid > 0) {
        return `<div style="font-size:9px;color:var(--green);margin-top:2px">💵 Получено milestone: +${fmtK(totalPaid)}</div>`;
      } else if (next != null) {
        const nextAmt = Math.round((c._originalBudget||0) * (c._milestonePcts||[])[0] / 5000) * 5000;
        return `<div style="font-size:9px;color:var(--amber);margin-top:2px">⏳ Milestone при ${next}%: +${fmtK(nextAmt)}</div>`;
      }
      return '';
    })() : '';

    // Прогресс-бар (для всех проектов включая разовые)
    const progressBar = `
      <div style="margin-top:6px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px">
          <span style="font-size:10px;color:var(--sub)">Прогресс</span>
          <span style="font-size:10px;font-weight:700;color:${progColor}">${progress}%</span>
        </div>
        <div style="position:relative;height:4px;background:var(--bg3);border-radius:2px;overflow:visible">
          <div style="height:100%;width:${progress}%;background:${progColor};border-radius:2px;transition:width .4s"></div>
          ${milestoneMarkers}
        </div>
        ${milestoneSummary}
      </div>`;

    // Темп проекта (v2.7, фокус упразднён): превью от назначенной команды —
    // та же формула, что в advanceMonth (efficiency = projThr / pLoad, кэп 1.5)
    const _pace = (() => {
      const spd  = getSpeed();
      const fat  = getFatigueMult();
      let raw;
      {
        const pLoad   = getProjectLoad(c);
        const projThr = getProjectThroughput(c);
        const eff     = pLoad > 0 ? effFromRatio(projThr / pLoad) : 1;
        const workCnt = c._lcChain ? c._lcChain.filter(p => p.startsWith('work_')).length : 1;
        const phaseDur = (c._duration || 3) / Math.max(1, workCnt);
        raw = (100 / phaseDur) * eff * spd;
      }
      const base  = Math.round(raw);
      const withF = Math.round(raw * fat);
      const rem   = Math.max(0, 100 - (c._progress||0));
      return { base, withF, mthsLeft: withF > 0 ? Math.ceil(rem / withF) : 99 };
    })();
    const fatigueDelta = _pace.base - _pace.withF;
    const fatigueLabel = fatigueDelta > 0 ? ` <span style="color:var(--red);font-size:9px">(−${fatigueDelta}% усталость)</span>` : '';
    const _spd = getSpeed();
    const speedLabel = _spd > 1.05 ? ` <span style="color:var(--teal);font-size:9px">⚡×${_spd.toFixed(2)}</span>` : '';

    // Блок ресурса (v3.0): у всех проектов — строка темпа от назначенной команды
    let resourceRow = '';
    {
    // Регулярный проект: строка темпа от назначенной команды
      const _assignedCnt = (c._assignedStaff||[]).length;
      const _projThr     = getProjectThroughput(c);
      const _pLoad       = getProjectLoad(c);
      const _under       = _projThr < _pLoad;
      const paceColor    = _pace.withF <= 0 ? 'var(--red)' : _under ? 'var(--amber)' : 'var(--green)';
      resourceRow = `
      <div style="margin-top:7px;display:flex;align-items:center;gap:8px;font-size:10px">
        <span style="color:var(--sub)">⚙️ Команда: ${_assignedCnt ? _assignedCnt + ' чел.' : 'не назначена'} · ${_projThr}/${_pLoad} ед.</span>
        <span style="flex:1;text-align:right;color:${paceColor}">+${_pace.withF}%/мес${(_pLoad > 0 && _projThr / _pLoad > 1.5) ? ' <span style=\'color:var(--muted)\'>(убыв. отдача)</span>' : ''}${speedLabel}${fatigueLabel} · этап ~${_pace.mthsLeft} мес.${(() => { const _full = (typeof _projectPaceMonths === 'function' && c._lcPhase && c._lcPhase.startsWith('work_')) ? _projectPaceMonths(c) : null; return (_full != null && _full !== _pace.mthsLeft) ? ` <span style='color:var(--sub)'>· проект ~${_full} мес.</span>` : ''; })()}</span>
      </div>`;
    }

    // ── LC-lifecycle: вычисляем доп. данные для карточки ──
    const _isLC          = !!c._lcPhase;
    const _isLCEvent     = _isLC && !c._lcPhase.startsWith('work_');
    const _lcPhaseBadge  = _isLC && typeof Projects !== 'undefined'
      ? Projects.renderPhaseBadge(c) : '';

    // Сегментированный прогресс-бар для LC work-фаз (3 этапа на одной шкале)
    const _lcWorkBar = (() => {
      if (!_isLC || _isLCEvent) return '';
      // v3.0: сегментов столько, сколько work-фаз в цепочке (1–5)
      const _wOrder = (c._lcChain || []).filter(ph => ph.startsWith('work_'));
      if (!_wOrder.length) return '';
      const _wIdx   = Math.max(0, _wOrder.indexOf(c._lcPhase));
      const _prog   = c._progress || 0;
      // Показываем 100% только когда последняя work-фаза реально закрыта (≥100),
      // иначе округляем ВНИЗ и держим максимум 99% — чтобы не было «застрявших 100%»,
      // которые ещё не дошли до перехода (переход при Math.round(_progress)≥100).
      const _doneAll = (_wIdx === _wOrder.length - 1) && _prog >= 100;
      const _total  = _doneAll ? 100 : Math.min(99, Math.floor((_wIdx * 100 + _prog) / _wOrder.length));
      const _col    = _total >= 66 ? 'var(--teal)' : _total >= 33 ? 'var(--amber)' : 'var(--sub)';

      const _segs = _wOrder.map((_, i) => {
        const pct  = i < _wIdx ? 100 : i === _wIdx ? _prog : 0;
        const show = pct > 0;
        return `<div style="flex:1;height:5px;background:rgba(255,255,255,.07);border-radius:2px;overflow:hidden">
          <div style="height:100%;width:${pct}%;background:var(--teal);border-radius:2px;transition:width .4s;
                      opacity:${i < _wIdx ? '.6' : '1'}"></div>
        </div>`;
      }).join('<div style="width:3px;flex-shrink:0"></div>');

      return `<div style="margin-top:6px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
          <span style="font-size:10px;color:var(--sub)">Работа ${_wIdx + 1} из ${_wOrder.length}</span>
          <span style="font-size:10px;font-weight:700;color:${_col}">${_total}%</span>
        </div>
        <div style="display:flex;gap:2px">${_segs}</div>
      </div>`;
    })();

    // ── Staff assignment row (v2.8): интерактивные чипы всей команды ──
    // Назначение — в один клик прямо с карточки: свой чип = снять,
    // свободный = назначить, занятый на другом проекте = перевести сюда
    const staffAssignRow = (() => {
      if (_isLCEvent) return '';   // v3.0: разовые тоже назначаются
      const team  = (G.staff || []).filter(s => s.status !== 'fired');
      const pThr  = typeof getProjectThroughput === 'function' ? getProjectThroughput(c) : 2;
      const pLoad = getProjectLoad(c);
      const eff   = pLoad > 0 ? effFromRatio(pThr / pLoad) : 1;   // единая формула (v3.7)
      const effPct = Math.round(eff * 100);
      const barCol = effPct >= 100 ? 'var(--green)' : effPct >= 60 ? 'var(--amber)' : 'var(--red)';
      const barW   = Math.min(100, (effPct / 220) * 100);

      // Фаундер — всегда на каждом проекте (+2 базовых)
      const founderChip = `<span style="display:inline-flex;align-items:center;gap:3px;padding:2px 7px;
        border-radius:4px;background:rgba(255,255,255,.05);color:var(--muted);border:1px solid rgba(255,255,255,.1);
        font-size:10px;font-weight:600" title="Фаундер работает на всех проектах">👤 Ты +2</span>`;

      // Ф.1: чипы назначенных — всегда; остальные — сворачиваются при большом штате
      const assignedChips = [];
      const restChips = [];
      let freeCount = 0;
      team.forEach(s => {
        const iid   = s._iid || s.uid || s.id;
        const here  = (c._assignedStaff || []).includes(iid);
        const other = s._assignedProjectId && s._assignedProjectId !== c.id
          ? (G.activeClients || []).find(x => x.id === s._assignedProjectId) : null;
        if (!here && !other) freeCount++;
        const wu    = calcStaffWorkUnit(s);
        const first = (s.name || '').split(' ')[0] || '?';
        const style = here
          ? 'background:rgba(45,212,191,.16);color:var(--teal);border:1px solid rgba(45,212,191,.45)'
          : other
            ? 'background:rgba(210,153,34,.08);color:var(--amber);border:1px dashed rgba(210,153,34,.35);opacity:.85'
            : 'background:rgba(255,255,255,.04);color:var(--sub);border:1px dashed rgba(255,255,255,.18)';
        const hint  = here ? 'Снять с проекта'
          : other ? `Сейчас на «${other.name}» — кликни, чтобы перевести сюда`
          : 'Назначить на проект';
        const act   = here ? `unassignAndRefresh('${iid}','${c.id}')` : `assignAndRefresh('${iid}','${c.id}')`;
        const chipHtml = `<button style="display:inline-flex;align-items:center;gap:3px;padding:2px 7px;
          border-radius:4px;${style};font-size:10px;font-weight:600;cursor:pointer" title="${hint}"
          onclick="${act}">${s.icon || '👤'} ${first} +${wu}${other ? ' ↪' : here ? ' ✕' : ''}</button>`;
        (here ? assignedChips : restChips).push(chipHtml);
      });

      // Сворачивание: при штате >6 прячем неназначенных за «развернуть»
      const collapse = team.length > 6;
      const expanded = !!_teamChipsExpanded[c.id];
      const chips = [founderChip, ...assignedChips];
      if (!collapse || expanded) {
        chips.push(...restChips);
        if (collapse && restChips.length) chips.push(`<button onclick="toggleTeamChips('${c.id}')" style="padding:2px 7px;border-radius:4px;background:rgba(255,255,255,.04);color:var(--sub);border:1px solid rgba(255,255,255,.14);font-size:10px;font-weight:600;cursor:pointer" title="Свернуть">▲ свернуть</button>`);
      } else if (restChips.length) {
        chips.push(`<button onclick="toggleTeamChips('${c.id}')" style="padding:2px 7px;border-radius:4px;background:rgba(255,255,255,.04);color:var(--sub);border:1px dashed rgba(255,255,255,.2);font-size:10px;font-weight:600;cursor:pointer" title="Показать остальных">＋ ещё ${restChips.length} (развернуть)</button>`);
      }

      const hintRow = team.length === 0
        ? `<span style="font-size:10px;color:var(--amber)">Команды нет — проект идёт только на твоей мощности (+2)</span>`
        : pThr < pLoad
          ? `<span style="font-size:10px;color:var(--amber)">⚠ не хватает ${Math.round(pLoad - pThr)} ед. — кликни по свободным чипам</span>`
          : '';

      const ratio  = pLoad > 0 ? pThr / pLoad : 1;
      const capped = ratio > 1.5;
      return `<div style="margin-top:6px">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:3px">
          <span style="font-size:10px;color:var(--sub)">👥 Команда на проекте · ⚙ ${Math.round(pThr)} / ${pLoad} мощн. · <b style="color:${barCol}">${effPct}%${capped ? ' <span style=\'color:var(--muted);font-weight:400\'>убыв. отдача</span>' : ''}</b></span>
          <span style="display:flex;gap:5px;flex-shrink:0">
            <button class="btn btn-xs" ${freeCount === 0 ? 'disabled' : ''} style="font-size:10px;padding:2px 8px;white-space:nowrap;background:rgba(45,212,191,.12);color:var(--teal);border:1px solid rgba(45,212,191,.35);border-radius:5px;font-weight:700;cursor:${freeCount === 0 ? 'not-allowed' : 'pointer'};${freeCount === 0 ? 'opacity:.45' : ''}"
              title="${freeCount === 0 ? 'Нет свободных специалистов' : 'Подобрать команду автоматически под нагрузку проекта'}" onclick="autoAssignAndRefresh('${c.id}')">⚡ Авто</button>
            <button class="btn btn-xs btn-ghost" style="font-size:10px;padding:2px 7px;white-space:nowrap"
              onclick="openAssignModal('${c.id}')">Подробнее</button>
          </span>
        </div>
        <div style="height:3px;background:rgba(255,255,255,.07);border-radius:2px;overflow:hidden;margin-bottom:4px">
          <div style="height:100%;width:${barW}%;background:${barCol};border-radius:2px;transition:width .4s"></div>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:3px;align-items:center">${chips.join('')}</div>
        ${ratio >= 3 ? `<div style="margin-top:3px"><span style="font-size:10px;color:var(--amber)">⚠ Перевыполнение ×${ratio.toFixed(1)} — прирост минимален (√-отдача), людей выгоднее перевести</span></div>` : ''}
        ${hintRow ? `<div style="margin-top:3px">${hintRow}</div>` : ''}
      </div>`;
    })();

    chtml+=`<div class="client-card ${warn}">
      <div class="client-row1">
        <div class="client-icon">${c.icon}</div>
        <div class="client-info">
          <div class="client-name">
            ${c.name}
            ${warn==='critical'?'<span class="tag red" style="font-size:10px;">⚠ Уходит</span>':
              warn==='at-risk'?'<span class="tag amber" style="font-size:10px;">Недоволен</span>':''}
            ${c.oneTime?'<span class="tag purple" style="font-size:10px;">Разовый</span>':''}
            ${_isLC?'<span style="font-size:10px;padding:1px 6px;border-radius:4px;background:rgba(168,85,247,.12);color:rgba(168,85,247,.9);font-weight:600;border:1px solid rgba(168,85,247,.3)">LC</span>':''}
            ${deadlineBadge}
          </div>
          <div class="client-desc" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            <span class="modifier-badge ${mb}" style="font-size:10px;padding:2px 6px">${ml}</span>
            ${(()=>{
              const _pLoad = getProjectLoad(c);
              const _thr   = getTeamThroughput();
              const _totLoad = getTotalLoad();
              if (isWaiting) {
                return `<span style="font-size:10px;padding:2px 6px;border-radius:4px;background:rgba(120,120,120,.12);color:var(--muted);font-weight:600">⚙ ${_pLoad} мощн. <span style="font-weight:400;font-size:9px">— старт через ${waitMos} мес.</span></span>`;
              }
              const _willOvld = _totLoad > _thr;
              const _bg  = _willOvld ? 'rgba(248,81,73,.12)' : 'rgba(45,212,191,.1)';
              const _col = _willOvld ? 'var(--red)' : 'var(--teal)';
              return `<span style="font-size:10px;padding:2px 6px;border-radius:4px;background:${_bg};color:${_col};font-weight:600">⚙ ${_thr} / ${_totLoad} мощн.</span>`;
            })()}
          </div>
          ${_isLCEvent ? _lcPhaseBadge : (_isLC ? _lcWorkBar : progressBar) + (_isLC ? _lcPhaseBadge : '')}
          ${(_isLC && !_isLCEvent) ? (()=>{
            const _m=Math.round(c._lcClientMood??60), _r=Math.round(c._lcRisk||0), _q=Math.round(Math.min(100,c._lcQualityBonus||0));
            const _mc=_m>=70?'var(--green)':_m>=45?'var(--amber)':'var(--red)';
            const _rc=_r>=60?'var(--red)':_r>=30?'var(--amber)':'var(--teal)';
            const _qc=_q>=66?'var(--teal)':_q>=33?'var(--amber)':'var(--sub)';
            return `<div style="display:flex;gap:12px;font-size:10px;margin:5px 0 2px;font-weight:600">
              <span data-tip="Настроение клиента (${_m}/100): тянет оценку при сдаче вверх; низкое → риск ухода. Поднимается действиями влияния." style="color:${_mc};cursor:help">😊 ${_m}</span>
              <span data-tip="Риск проекта (${_r}/100): высокий → шанс критических ошибок (−прогресс) и срыва. Снижается антикризисными действиями/юристом." style="color:${_rc};cursor:help">⚠ ${_r}</span>
              <span data-tip="Качество (${_q}/100): копится от назначенной команды по ходу работы + действия качества. Даёт бонус к оплате и оценке клиента при сдаче." style="color:${_qc};cursor:help">✨ ${_q}</span>
            </div>`;
          })() : ''}
          ${staffAssignRow}
          ${_isLCEvent ? '' : resourceRow}
        </div>
        <div class="client-rev">
          ${budgetStr}
          ${c._prepaidAmount ? `
            <div style="font-size:10px;color:var(--green);margin-top:3px;white-space:nowrap;font-weight:600">💰 ${fmtK(c._prepaidAmount)}</div>
            <div style="font-size:9px;color:var(--muted);white-space:nowrap">получено авансом</div>` : ''}
        </div>
      </div>
      <div class="nps-row">
        <span class="nps-label" data-tip="Оценка клиента: насколько клиент доволен проектом. Низкая → риск расторжения; высокая → бонус и репутация при сдаче." style="cursor:help">Оценка</span>
        <div class="nps-wrap"><div class="nps-fill" style="width:${nps}%;background:${nc}"></div></div>
        <span class="nps-val" style="color:${nc}">${nps}</span>
        ${(()=>{ const _aq=G.staff.length>0?Math.round(getQuality()/G.staff.length):0; return _aq>60?`<span data-tip="Среднее качество команды: ${_aq}. Высокое среднее качество (70+) даёт буст к оценке клиента при сдаче." style="font-size:10px;padding:1px 5px;border-radius:4px;background:rgba(251,191,36,.1);color:var(--amber);font-weight:600;cursor:help">⭐ Кач ${_aq}</span>`:''; })()}
        <span class="nps-btn" style="display:flex;gap:5px;align-items:center;flex-wrap:wrap;">
          ${_isLC
            // LC-проект
            ? `${c._lcPendingDecision
                // Есть pending decision — красная кнопка "Решить"
                ? `<button class="btn btn-xs" style="background:rgba(248,81,73,.15);color:var(--red);border:1px solid rgba(248,81,73,.4);padding:4px 8px;font-size:10px;border-radius:5px;font-weight:700;cursor:pointer;animation:pulse 1.5s infinite"
                     onclick="Projects.resolveWorkEvent('${c.id}')">⚡ Решить</button>`
                : _isLCEvent
                  ? `<button class="btn btn-xs" style="background:rgba(210,153,34,.12);color:var(--amber);border:1px solid rgba(210,153,34,.3);padding:4px 8px;font-size:10px;border-radius:5px;font-weight:600;cursor:pointer"
                       onclick="Projects.showPhasePopup(G.activeClients.find(x=>x.id==='${c.id}'))">
                       ${Projects.PHASE_ICONS[c._lcPhase]||'▶'} ${Projects.PHASE_LABELS[c._lcPhase]||'Фаза'}
                     </button>`
                  : '' /* work-фаза без pending */
              }
              <button class="btn btn-xs" style="background:rgba(168,85,247,.08);color:rgba(168,85,247,.9);border:1px solid rgba(168,85,247,.25);padding:4px 8px;font-size:10px;border-radius:5px;font-weight:600;cursor:pointer"
                onclick="Projects.showDetailPanel('${c.id}')" title="История решений и метрики проекта">📋 Детали</button>
              <button class="btn btn-xs" style="background:rgba(248,81,73,.1);color:var(--red);border:1px solid rgba(248,81,73,.25);padding:4px 8px;font-size:10px;border-radius:5px;font-weight:600;cursor:pointer" onclick="terminateContract('${c.id}')" title="Досрочное расторжение (−10 реп.)">✕</button>`
            // Обычный проект: стандартные кнопки
            : `${canComplete?`<button class="btn btn-xs" style="background:rgba(45,212,191,.12);color:var(--teal);border:1px solid rgba(45,212,191,.3);padding:4px 8px;font-size:10px;border-radius:5px;font-weight:600;cursor:pointer" onclick="completeProject('${c.id}')" title="Проект выполнен — получить оплату">🏁 Завершить</button>`:''}
               <button class="btn btn-xs btn-ghost" onclick="investInClient('${c.id}')" ${!affordable?'disabled':''} data-tip="−20 000 ₽ → оценка клиента +25 (вложиться в отношения с клиентом)" style="cursor:help">💬 −20К</button>
               <button class="btn btn-xs" style="background:rgba(248,81,73,.1);color:var(--red);border:1px solid rgba(248,81,73,.25);padding:4px 8px;font-size:10px;border-radius:5px;font-weight:600;cursor:pointer" onclick="terminateContract('${c.id}')" title="Досрочное расторжение (−10 реп.)">✕</button>`
          }
        </span>
      </div>
    </div>`;
  });

  document.getElementById('g-clients-list').innerHTML=chtml;

  // Кнопка «Завершить месяц» не блокируется (v2.7): перегруз мощности —
  // легитимное состояние, прогресс замедляется честно через efficiency

  // ── P&L ──
  const staffCost = getTotalStaffCost();
  const loanCost  = G.loan ? G.loan.monthlyPayment : 0;
  const burnRate  = staffCost + OVERHEAD + loanCost;
  const pipeline  = G.activeClients.filter(c=>!c.oneTime).reduce((s,c)=>s+(c._totalBudget||0),0);
  const oneTimeV  = G.activeClients.filter(c=>c.oneTime).reduce((s,c)=>s+(c._totalBudget||0),0);
  const divFlow   = (typeof LivingMarket!=='undefined' && LivingMarket.totalDividends) ? LivingMarket.totalDividends() : 0;

  document.getElementById('g-pnl').innerHTML=`
    ${pipeline>0?`<div class="pnl-row"><span style="color:var(--sub)">Пайплайн проектов</span><span style="color:var(--teal);font-weight:700">${fmtK(pipeline)}</span></div>`:''}
    ${oneTimeV>0?`<div class="pnl-row"><span style="color:var(--purple)">Разовые заказы</span><span style="color:var(--purple)">${fmtK(oneTimeV)}</span></div>`:''}
    ${G.delayedIncome>0?`<div class="pnl-row"><span style="color:var(--amber)">🕐 В пути (задержано)</span><span style="color:var(--amber)">+${fmt(G.delayedIncome)}</span></div>`:''}
    ${divFlow>0?`<div class="pnl-row"><span style="color:var(--teal)">📈 Дивиденды с долей</span><span style="color:var(--green);font-weight:700">+${fmt(divFlow)}/мес</span></div>`:''}
    ${(pipeline>0||oneTimeV>0||divFlow>0)?'<div class="divider"></div>':''}
    <div class="pnl-row"><span>Зарплаты</span><span class="neg">−${fmt(staffCost)}</span></div>
    <div class="pnl-row"><span>Overhead</span><span class="neg">−${fmt(OVERHEAD)}</span></div>
    ${G.loan ? `<div class="pnl-row">
        <span style="color:var(--amber)">${G.loan.icon||'🏦'} Кредит «${G.loan.label}»</span>
        <span style="color:var(--amber);font-weight:600">−${fmt(G.loan.monthlyPayment)}</span>
      </div>
      <div style="font-size:10px;color:var(--muted);margin-bottom:2px;padding-left:2px">ещё ${G.loan.monthsRemaining} мес. · остаток ${fmtK(G.loan.monthlyPayment * G.loan.monthsRemaining)}</div>
      ${G.loan.debuff?.type === 'speed_debuff' ? `<div style="font-size:10px;color:var(--red);padding-left:2px;margin-bottom:3px">⚡ ${G.loan.debuff.label}</div>` : ''}` : ''}
    <div class="divider"></div>
    <div class="pnl-row total"><span>Расход/мес</span><span class="neg">−${fmt(burnRate)}</span></div>
    ${(()=>{
      // Ближайшие поступления по текущей загрузке (v3.6)
      const inflows = forecastInflows(6);
      if (!inflows.length) return `<div style="font-size:10px;color:var(--muted);margin-top:5px">Поступлений на горизонте 6 мес. не видно — возьми проекты в работу</div>`;
      const next3 = inflows.filter(f => f.m <= 3).reduce((s2, f) => s2 + f.sum, 0);
      const rows = inflows.slice(0, 4).map(f =>
        `<div class="pnl-row" style="font-size:11px"><span style="color:var(--sub)">${f.icon} ${f.label}</span>
         <span style="color:var(--green)">+${fmtK(f.sum)} <span style="color:var(--muted);font-weight:400">через ${f.m} мес.</span></span></div>`).join('');
      return `<div class="divider"></div>
        <div style="font-size:10px;color:var(--sub);font-weight:700;margin-bottom:3px">БЛИЖАЙШИЕ ПОСТУПЛЕНИЯ <span style="font-weight:400;color:var(--muted)">(по текущей загрузке)</span></div>
        ${rows}
        <div class="pnl-row" style="font-size:11px"><span style="color:var(--sub)">Σ за 3 мес.</span><span style="color:${next3 >= burnRate*3 ? 'var(--green)' : 'var(--amber)'};font-weight:700">+${fmtK(next3)} <span style="color:var(--muted);font-weight:400">vs −${fmtK(burnRate*3)} расходов</span></span></div>`;
    })()}
`;

  // Legacy progress bar (hidden DOM compat)
  const pct=Math.min(100,Math.round(G.money/SCENARIO.settings.winCondition*100));
  { const el=document.getElementById('g-progress-pct'); if(el) el.textContent=pct+'%'; }
  { const el=document.getElementById('g-progress-bar'); if(el){ el.style.width=pct+'%'; el.className='progress-fill '+(pct>=80?'green':pct>=40?'amber':''); } }

  // P&L summary line
  { const el = document.getElementById('g-pnl-summary');
    if (el) {
      const _sc = getTotalStaffCost(), _lc = G.loan ? G.loan.monthlyPayment : 0;
      const _burn = _sc + OVERHEAD + _lc;
      const _div = (typeof LivingMarket!=='undefined' && LivingMarket.totalDividends) ? LivingMarket.totalDividends() : 0;
      const _inf = (typeof forecastInflows==='function') ? forecastInflows(6) : [];
      const _pr  = _inf.length ? Math.round(_inf.reduce((s,f)=>s+f.sum,0)/6) : 0;
      const _cf = _pr + _div - _burn;
      const _netCol = _cf >= 0 ? 'var(--green)' : 'var(--red)';
      const _netSign = _cf >= 0 ? '+' : '';
      el.innerHTML = `<span style="color:var(--muted)">−${fmtK(_burn)}/мес</span> · <span style="color:${_netCol};font-weight:600">${_netSign}${fmtK(_cf)} чистыми</span>`;
    }
  }

  // ── Team — rich character cards (staff.js) ──
  if (typeof renderTeamCards === 'function') {
    renderTeamCards(document.getElementById('g-team-list'));
  }

  // ── Hire — Scout Panel ──
  const poolCount = (G.candidatePool || []).length;
  const poolBadge = poolCount > 0
    ? `<span style="background:var(--teal);color:#fff;border-radius:10px;padding:1px 8px;font-size:11px;font-weight:700">${poolCount}</span>`
    : '';
  // ── Team composition summary by category ──
  const _teamCompHtml = (() => {
    if (typeof ROLE_CATEGORIES === 'undefined') return '';
    const active = (G.staff || []).filter(s => s.status !== 'fired');
    const rows = ROLE_CATEGORIES.map(cat => {
      const cnt    = active.filter(s => cat.roles.includes(s.role)).length;
      const hasGap = cnt === 0;
      return `<div style="display:flex;align-items:center;gap:6px">
        <span style="font-size:12px;width:16px;text-align:center">${cat.emoji}</span>
        <span style="font-size:11px;color:${hasGap ? 'var(--muted)' : 'var(--sub)'};flex:1">${cat.label}</span>
        ${cnt > 0
          ? `<span style="font-size:10px;font-weight:600;color:var(--teal)">${cnt}</span>`
          : `<span style="font-size:10px;color:rgba(255,255,255,.2)">нет</span>`}
      </div>`;
    }).join('');
    return `<div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:8px;padding:8px 10px">
      <div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.6px;margin-bottom:7px">Состав команды</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 12px">${rows}</div>
    </div>`;
  })();

  document.getElementById('g-hire-list').innerHTML = `
    <div style="display:flex;flex-direction:column;gap:8px;padding:4px 0">
      ${_teamCompHtml}
      <button class="btn btn-primary" style="width:100%;justify-content:center;gap:8px;font-size:13px"
              onclick="openStaffScoutModal()">
        🔍 Скаутинг специалистов ${poolBadge}
      </button>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px">
        <button class="btn btn-ghost" style="font-size:11px;padding:7px 4px;justify-content:center;flex-direction:column;gap:2px;line-height:1.3;text-align:center"
                onclick="scoutCandidates('free')">
          <span>Бесплатный</span>
          <span style="color:var(--muted);font-size:10px">Junior–Middle · 2 дн.</span>
        </button>
        <button class="btn btn-ghost" style="font-size:11px;padding:7px 4px;justify-content:center;flex-direction:column;gap:2px;line-height:1.3;text-align:center"
                onclick="scoutCandidates('paid')">
          <span>Платный</span>
          <span style="color:var(--teal);font-size:10px">25 000 ₽ · 4 дн.</span>
        </button>
        <button class="btn btn-ghost" style="font-size:11px;padding:7px 4px;justify-content:center;flex-direction:column;gap:2px;line-height:1.3;text-align:center"
                onclick="scoutCandidates('premium')">
          <span>Премиум</span>
          <span style="color:var(--purple);font-size:10px">60 000 ₽ · 6 дн.</span>
        </button>
      </div>
      ${poolCount > 0
        ? `<div style="font-size:11px;color:var(--sub);text-align:center;padding:2px 0">
            ${poolCount} ${poolCount===1?'кандидат':'кандидатов'} ожидают просмотра
          </div>`
        : ''}
    </div>`;

  // ── Legacy hire accordion (hidden — kept for scenario-editor compat) ──
  const dayCostHire=hasRole('hr') ? 1 : HIRE_COST;
  let hhtml='';
  STAFF_ROLES.forEach(role=>{
    const rl = ROLE_LABELS[role];
    const grades = STAFF_DEFS.filter(d=>d.role===role);
    const totalInTeam = countRole(role);
    const roleBadge = totalInTeam > 0
      ? `<span style="font-size:10px;background:rgba(79,110,247,.18);color:var(--accent2);border-radius:4px;padding:1px 6px;margin-left:6px">×${totalInTeam}</span>`
      : '';
    hhtml += `<div style="margin-bottom:6px;border:1px solid rgba(255,255,255,.06);border-radius:8px;overflow:hidden">
      <button onclick="(function(el){var b=el.nextElementSibling;b.style.display=b.style.display==='none'?'block':'none';})(this)"
        style="width:100%;background:rgba(255,255,255,.03);border:none;color:var(--fg);padding:8px 10px;display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;font-weight:600;text-align:left">
        <span>${rl.icon}</span><span>${rl.name}</span>${roleBadge}
        <span style="margin-left:auto;font-size:10px;color:var(--muted)">▾</span>
      </button>
      <div style="display:none;padding:4px 6px 6px">`;

    grades.forEach(def=>{
      const gradeColor = def.grade==='sr'?'var(--purple)':def.grade==='jr'?'var(--muted)':'var(--sub)';
      const locked = def.unlockCond && (
        (def.unlockCond.minRep       && G.reputation    < def.unlockCond.minRep) ||
        (def.unlockCond.minPortfolio && (G.portfolio||0) < def.unlockCond.minPortfolio)
      );
      const ok = !locked && G.money >= def.cost*2 && G.actions >= dayCostHire;
      const alreadyCount = G.staff.filter(s=>s.id===def.id).length;

      const bonuses=[];
      if (def.quality)    bonuses.push(`Q +${def.quality}`);
      if (def.volume)     bonuses.push(`V +${def.volume}`);
      if (def.capacity)   bonuses.push(`+${def.capacity} слот`);
      if (def.throughput) bonuses.push(`Произв. +${def.throughput}`);
      if (def.speedBonus) bonuses.push(`<span style="color:var(--green)">Speed +${Math.round(def.speedBonus*100)}%</span>`);
      if (role==='lawyer')    bonuses.push(`<span style="color:var(--amber);font-size:10px">риски −${def.grade==='sr'?70:def.grade==='jr'?30:50}%</span>`);
      if (role==='smm')       bonuses.push(`<span style="color:var(--teal);font-size:10px">+1 лид/скаут</span>`);
      if (role==='hr')        bonuses.push(`<span style="color:var(--teal);font-size:10px">оценка клиента +${def.grade==='sr'?4:def.grade==='jr'?2:3}/мес · +${def.grade==='sr'?3:def.grade==='jr'?1:2} мораль/лояльность/мес · найм 1 дн</span>`);
      if (role==='developer') bonuses.push(`<span style="color:var(--accent2);font-size:10px">тех-проекты</span>`);

      let lockHint = '';
      if (def.unlockCond?.minRep)       lockHint = `🔒 Реп ≥${def.unlockCond.minRep} (сейчас ${Math.round(G.reputation)})`;
      if (def.unlockCond?.minPortfolio) lockHint = `🔒 Портфолио ≥${def.unlockCond.minPortfolio}`;

      const countBadge = alreadyCount > 0
        ? `<span style="font-size:10px;background:rgba(79,110,247,.18);color:var(--accent2);border-radius:4px;padding:1px 5px;margin-right:4px">×${alreadyCount}</span>`
        : '';

      hhtml += `<div class="hire-item" style="${locked?'opacity:.55':''}">
        <div style="width:6px;border-radius:3px;background:${gradeColor};align-self:stretch;margin-right:4px;flex-shrink:0"></div>
        <div class="hire-info">
          <div class="hire-name" style="font-size:12px">${countBadge}${def.name}
            <span style="font-size:10px;color:${gradeColor};font-weight:700;margin-left:4px">${def.gradeLabel}</span>
          </div>
          <div class="hire-desc" style="font-size:10px">${bonuses.join(' · ')}${locked?` · <span style="color:var(--red)">${lockHint}</span>`:''}</div>
        </div>
        <div style="display:flex;align-items:center;gap:5px;flex-shrink:0;margin-left:auto">
          <div class="hire-cost" style="font-size:11px">−${fmt(def.cost)}/мес</div>
          <button class="btn btn-sm btn-primary" onclick="hireStaff('${def.id}')" ${!ok?'disabled':''}>${alreadyCount>0?'Ещё':'Нанять'}</button>
        </div>
      </div>`;
    });
    hhtml += `</div></div>`;
  });
  // (legacy hhtml computed but not applied — scout panel is rendered above)

  // Синхронизируем видимость секции найма с _acc.hire
  { const el = document.getElementById('acc-hire'); if (el) el.style.display = _acc.hire ? 'block' : 'none'; }
  { const el = document.getElementById('acc-arrow-hire'); if (el) el.textContent = _acc.hire ? '▾' : '▸'; }

  // Синхронизируем видимость P&L с _acc.pnl
  { const el = document.getElementById('acc-pnl'); if (el) el.style.display = _acc.pnl ? 'block' : 'none'; }
  { const el = document.getElementById('acc-arrow-pnl'); if (el) el.textContent = _acc.pnl ? '▾' : '▸'; }

  // Синхронизируем видимость блока метрик с _acc.metrics
  { const el = document.getElementById('acc-metrics'); if (el) el.style.display = _acc.metrics ? 'block' : 'none'; }
  { const el = document.getElementById('acc-arrow-metrics'); if (el) el.textContent = _acc.metrics ? '▾' : '▸'; }

  // ── Upgrades — обновляем дерево и кнопку-триггер ──
  { const el = document.getElementById('g-upgrades-list'); if (el) el.innerHTML = _renderPerkTree(); }
  // Обновляем подпись кнопки "Дерево навыков"
  { const sub = document.getElementById('perk-btn-sub');
    if (sub) {
      const allTree = (UPGRADES || []).filter(p => p.treePos && p.oneTime);
      const bought  = allTree.filter(p => G.upgrades[p.id]).length;
      const total   = allTree.length;
      const pts     = allTree.reduce((s,p) => s + (G.upgrades[p.id] ? (p.qBonus||0)+(p.repBonus||0)+Math.round((p.speedBonus||0)*100) : 0), 0);
      sub.textContent = bought > 0
        ? `${bought} из ${total} куплено · +${pts} очков`
        : `${total} перков · разблокируй первый ряд`;
    }
  }
  // Обновляем подпись внутри модала (если открыт)
  { const sub = document.getElementById('perk-modal-sub');
    if (sub) {
      const allTree = (UPGRADES || []).filter(p => p.treePos && p.oneTime && !p.draft);
      const bought  = allTree.filter(p => G.upgrades[p.id]).length;
      sub.textContent = `${bought} из ${allTree.length} активных перков куплено`;
    }
  }

  // ── Metrics ──
  const avgNps=G.activeClients.length?Math.round(G.activeClients.reduce((s,c)=>s+(G.clientNPS[c.id]||70),0)/G.activeClients.length):'—';
  const npsCl=typeof avgNps==='number'?npsColor(avgNps):'var(--sub)';
  const qv=getQuality(), vv=getVolume();
  const qCl=qv>=20?'var(--green)':qv>=10?'var(--amber)':'var(--red)';
  const vCl=vv>=15?'var(--green)':vv>=5?'var(--amber)':'var(--red)';
  const repC=repColor(G.reputation);
  // Q/V премия к выручке убрана (нет помесячной выручки в новой модели)

  // Q bar: thresholds at 10 (разблокирует стартапы), 20 (корпораты), 30 (госконтракт)
  const qThresholds = [
    { val:10, label:'Стартап' },
    { val:20, label:'Корп.' },
    { val:30, label:'Гос.' },
  ];
  // V bar: thresholds at 5 (стартапы), 10 (корпораты), 15 (ретейнер/гос)
  const vThresholds = [
    { val:5,  label:'Стартап' },
    { val:10, label:'Корп.' },
    { val:15, label:'Гос./Рет.' },
  ];
  const staffQ = G.staff.reduce((s,x)=>s+(x.quality||0),0);
  const qBar = makeCapBar(qv, 40, qThresholds, qCl, 'Нанять Дизайнера (+20 качества)');
  const vBar = makeCapBar(vv, 20, vThresholds, vCl, 'Нанять Копирайтера (+15 объёма)');

  // Q breakdown hint
  const qBreakdown=[];
  if (staffQ>0)           qBreakdown.push(`команда +${staffQ}`);
  if (G.qualityBonus>0)   qBreakdown.push(`апгрейды +${G.qualityBonus}`);
  if (G.tempQBonus>0)     qBreakdown.push(`<span style="color:var(--amber)">фриланс +${G.tempQBonus}</span>`);
  const qBreakdownHtml = qBreakdown.length>1
    ? `<div style="font-size:10px;color:var(--muted);margin-top:-2px;margin-bottom:3px">${qBreakdown.join(' · ')}</div>` : '';

  // Portfolio bar
  const pf=G.portfolio||0;
  const pfMult=Math.round((getPortfolioMultiplier()-1)*100);
  const pfCl=pf>=50?'var(--purple)':pf>=28?'var(--accent2)':pf>=12?'var(--teal)':'var(--muted)';
  const pfThresholds=[
    {val:12, label:'📊 Медиа'},
    {val:28, label:'🌍 Меж.'},
    {val:50, label:'🤝 Партн.'},
  ];
  const pfBar=makeCapBar(pf, 60, pfThresholds, pfCl, '');
  // Next unlock hint
  const nextPfUnlock=[12,28,50].find(v=>pf<v);
  const pfHint=nextPfUnlock
    ? `<div style="font-size:10px;color:var(--muted);margin-top:-2px;margin-bottom:2px">до следующего проекта: ${nextPfUnlock-pf} балл${(nextPfUnlock-pf)===1?'':'а'}</div>`
    : `<div style="font-size:10px;color:var(--purple);margin-top:-2px;margin-bottom:2px">все портфолио-проекты открыты 🏆</div>`;

  // ── Метрики — grid-карточки ──────────────────────────
  // Вспомогательная функция: одна метрика-карточка
  const mc = ({ id, label, value, valueColor='var(--fg)', sub='', bar='', tip='', full=false }) => `
    <div style="background:var(--bg2);border:1px solid rgba(255,255,255,.07);border-radius:8px;padding:8px 10px;position:relative;${full?'grid-column:1/-1;':''}">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:2px">
        <span style="font-size:9px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.06em">${label}</span>
        <button onclick="toggleMetricTip('${id}')"
          style="background:none;border:1px solid rgba(255,255,255,.14);border-radius:50%;width:15px;height:15px;color:var(--muted);font-size:8px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;padding:0;line-height:1">?</button>
      </div>
      <div style="font-size:${full?'17':'19'}px;font-weight:700;color:${valueColor};line-height:1.1;margin-bottom:${sub||bar?'3':'0'}px">${value}</div>
      ${sub?`<div style="font-size:10px;color:var(--muted);margin-bottom:${bar?'3':'0'}px">${sub}</div>`:''}
      ${bar}
      <div id="mtip-${id}" style="display:none;margin-top:5px;font-size:10px;color:var(--sub);background:rgba(255,255,255,.04);border-radius:5px;padding:5px 7px;line-height:1.4;border-left:2px solid rgba(79,110,247,.4)">${tip}</div>
    </div>`;

  // Данные мощности команды vs проектов
  const thr=getTeamThroughput(), tld=getTotalLoad();
  const fMult=getFatigueMult();
  const effThr=Math.round(thr*fMult);
  const fatDelta=thr-effThr;
  const ratio=tld>0?effThr/tld:1, overloaded=tld>0&&ratio<0.95;
  const loadCol=overloaded?'var(--red)':tld===0?'var(--muted)':ratio<1.1?'var(--amber)':'var(--green)';
  const loadPct=Math.round(ratio*100);
  const loadBar=tld>0?`<div style="height:3px;background:var(--bg3);border-radius:2px;overflow:hidden"><div style="height:100%;width:${Math.min(100,loadPct)}%;background:${loadCol};border-radius:2px"></div></div>`:'';
  const loadSub=tld===0?'нет активных проектов':overloaded?`⚠ хватает на ${loadPct}%`:`покрытие ${loadPct}%`;
  const loadSubCol=overloaded?'color:var(--red)':'color:var(--muted)';
  // Показываем "команда / проекты" — сначала то, что есть, потом то, что нужно
  const loadVal=tld===0?`${effThr}`:`${effThr} / ${Math.round(tld)}${fatDelta>0?` <span style="font-size:11px;color:var(--red);font-weight:400">−${fatDelta}уст.</span>`:''}`;


  // Данные усталости
  const ft = G.teamFatigue || 0;
  const ftCol = ft>=85?'var(--red)':ft>=60?'var(--amber)':ft>=30?'#e8a838':'var(--green)';
  const ftLabel = ft>=85?'Кризис':ft>=60?'Выгорание':ft>=30?'Напряжение':'Норма';
  // v2.7: эффективная нагрузка — реальная (фокус-взвешивание удалено), зеркалит advanceMonth
  const _effectiveLoad = getTotalLoad();   // v3.0: разовые уже включены
  const _loadPct2 = getTeamThroughput()>0?_effectiveLoad/getTeamThroughput():0;
  let _fd = _loadPct2>=1.0?10:_loadPct2>=0.85?4:_loadPct2>=0.70?1:-8;
  const _hrSr=G.staff.some(s=>s.id==='hr_sr'),_hrMd=G.staff.some(s=>s.id==='hr'),_hrJr=G.staff.some(s=>s.id==='hr_jr');
  if (_fd>0&&_hrSr) _fd=Math.round(_fd*0.55); else if(_fd>0&&_hrMd)_fd=Math.round(_fd*0.70); else if(_fd>0&&_hrJr)_fd=Math.round(_fd*0.80);
  if (_hrSr) _fd-=2;
  const _fdSign=_fd>=0?`+${_fd}`:`${_fd}`;
  const _fdCol=_fd>0?'var(--red)':_fd<0?'var(--green)':'var(--muted)';
  let _forecast='';
  if(_fd<0&&ft>30) _forecast=`· Норма ~${Math.ceil((ft-30)/Math.abs(_fd))} мес.`;
  else if(_fd<0&&ft<=30) _forecast='· восстановление';
  else if(_fd>0&&ft>=60) _forecast='· нужен Тимбилдинг';
  const ftBar=`<div style="height:3px;background:var(--bg3);border-radius:2px;margin-bottom:2px;overflow:hidden"><div style="height:100%;width:${ft}%;background:${ftCol};border-radius:2px;transition:width .3s"></div></div>`;
  const ftSub=`<span style="color:${_fdCol};font-weight:600">${_fdSign}/мес</span>${_forecast?` <span style="color:var(--sub)">${_forecast}</span>`:''}`;

  // Скорость
  const spd=getSpeed(), spdPct=Math.round(spd*100);
  const spdCol=spdPct>=130?'var(--purple)':spdPct>=115?'var(--green)':spdPct>=105?'var(--teal)':'var(--muted)';
  const staffSpdBonus=G.staff.reduce((s,x)=>s+(x.speedBonus||0),0);
  const spdHint=[
    staffSpdBonus>0?`специалисты +${Math.round(staffSpdBonus*100)}%`:null,
    (G.speedUpgrades||0)>0?`перки +${Math.round(G.speedUpgrades*100)}%`:null,
  ].filter(Boolean).join(', ')||'базовая';

  // Репутация
  const repBar=`<div style="height:3px;background:var(--bg3);border-radius:2px;overflow:hidden"><div style="height:100%;width:${G.reputation}%;background:${repC};border-radius:2px"></div></div>`;

  // ── Compact access chip (с кастомной подсказкой data-tip) ──
  const kompaktChip = ({ label, value, valueColor, bar, tip }) => `
    <div ${tip ? `data-tip="${tip}"` : ''} style="background:var(--bg2);border:1px solid rgba(255,255,255,.07);border-radius:8px;padding:7px 8px${tip ? ';cursor:help' : ''}">
      <div style="font-size:9px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.03em;margin-bottom:3px;line-height:1.05;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${label}</div>
      <div style="font-size:18px;font-weight:700;color:${valueColor};line-height:1;margin-bottom:4px">${value}</div>
      ${bar}
    </div>`;

  // ── Условия сигнальных ламп ──
  const _sigNps  = typeof avgNps === 'number' && avgNps < 55;
  const _sigLoad = overloaded || (tld > 0 && ratio < 1.1);
  const _sigFat  = ft >= 25;
  const _sigCount = [_sigNps, _sigLoad, _sigFat].filter(Boolean).length;
  const _allClear = _sigCount === 0;
  const _sigCols  = _sigCount >= 2 ? '1fr 1fr' : '1fr';

  document.getElementById('g-metrics').innerHTML=`
    <div style="font-size:9px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.07em;margin-bottom:5px;padding:0 1px">Ключи доступа</div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:4px;margin-bottom:10px">
      ${kompaktChip({ label:'Качество', value:qv, valueColor:qCl, bar:qBar,
        tip:'Качество агентства — суммарное качество команды и бонусов. Ключ доступа к клиентам: чем выше, тем крупнее заказчики (стартапы → корпораты → госзаказ). Поднимают: дизайнеры, кейсы в портфолио, перки качества.' })}
      ${kompaktChip({ label:'Объём', value:vv, valueColor:vCl, bar:vBar,
        tip:'Объём — производственная ёмкость по контенту. Ключ доступа к клиентам (стартапы → гос/ретейл). Поднимают: копирайтеры, SMM.' })}
      ${kompaktChip({ label:'Репутация', value:Math.round(G.reputation), valueColor:repC, bar:repBar,
        tip:'Репутация агентства (0–100). Открывает более крупные тиры проектов и улучшает входящие предложения. Растёт за удачные сдачи (высокая оценка клиента), падает за провалы и просрочки.' })}
      ${kompaktChip({ label:'Портфолио', value:pf, valueColor:pfCl, bar:pfBar,
        tip:'Портфолио — баллы за собранные кейсы. Открывает доступ к крупным клиентам и усиливает качество. Растёт за сдачи и сборку кейсов во вкладке «Портфолио».' })}
    </div>

    <div style="font-size:9px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.07em;margin-bottom:5px;padding:0 1px">Сигнальные лампы</div>
    ${_allClear
      ? `<div style="text-align:center;padding:7px 0 5px;color:var(--muted);font-size:11px;border:1px dashed rgba(255,255,255,.07);border-radius:7px;margin-bottom:8px">✓ всё в норме</div>`
      : `<div style="display:grid;grid-template-columns:${_sigCols};gap:6px;margin-bottom:8px">
          ${_sigNps  ? mc({ id:'nps',  label:'Оценка клиента',           value:avgNps,              valueColor:npsCl,
            tip: 'Средняя оценка клиента (удовлетворённость). При оценке < 40 клиент расторгает контракт. Повышается инвестицией (−20К → +25 оценки).' }) : ''}
          ${_sigLoad ? mc({ id:'load', label:'Мощность',                 value:loadVal,             valueColor:loadCol,
            bar:loadBar, sub:`<span style="${loadSubCol}">${loadSub}</span>`,
            tip: 'Команда / Проекты мощн. Если мощности команды не хватает — прогресс замедляется. Назначь сотрудников на проекты или найми новых.' }) : ''}
          ${_sigFat  ? mc({ id:'fat',  label:`Усталость · ${ftLabel}`,   value:`${Math.round(ft)}`, valueColor:ftCol,
            bar:ftBar, sub:ftSub,
            tip: '30–60: −5% прогресс. 60–85: −15%, уходы сотрудников. 85+: −30%, найм заблокирован.' }) : ''}
        </div>`
    }

    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:5px 2px;border-top:1px solid rgba(255,255,255,.06);font-size:10px">
      <span data-tip="Скорость команды — общий множитель темпа выполнения проектов. Растёт от специалистов и перков производства." style="color:var(--muted);cursor:help">Скорость</span><span style="font-weight:700;color:${spdCol}">${spdPct}%</span>
      <span style="color:rgba(255,255,255,.12)">·</span>
      <span data-tip="Слоты проектов — сколько проектов можно вести одновременно (занято/всего). Расширяются наймом Менеджера." style="color:var(--muted);cursor:help">Слоты</span><span style="font-weight:700;color:var(--fg)">${G.activeClients.length}/${getCapacity()}</span>
      <span style="color:rgba(255,255,255,.12)">·</span>
      <span data-tip="Overhead — постоянные расходы агентства в месяц (аренда, инструменты и т.п.), не зависят от проектов." style="color:var(--muted);cursor:help">Overhead</span><span style="font-weight:600;color:var(--red)">−${fmtK(OVERHEAD)}/мес</span>
    </div>`;

  // ── Log ──
  const lhtml=G.log.map(l=>`<div class="log-item"><span class="log-month">${l.month} — </span><span class="log-msg ${l.cls}">${l.msg}</span></div>`).join('');
  document.getElementById('g-log').innerHTML=lhtml||'<div class="log-item"><span class="log-msg">Пока всё тихо…</span></div>';

  // ── Portfolio tab badge ──
  // П.18: отмененные и провальные проекты не идут в портфолио
  const available=(G.completedProjects||[]).filter(p=>!p._cased && !p.terminated && !p.failed).length;
  const tabBadge=document.getElementById('tab-portfolio-badge');
  if (tabBadge){
    tabBadge.textContent=available;
    tabBadge.style.display=available>0?'inline-flex':'none';
  }
}

// ══════════════════════════════════════════════════════
//  EVENTS
// ══════════════════════════════════════════════════════
function showEvent(ev) {
  document.getElementById('modal-icon').textContent=ev.icon;
  document.getElementById('modal-title').textContent=ev.title;
  document.getElementById('modal-body').textContent=ev.body;
  const div=document.getElementById('modal-choices'); div.innerHTML='';
  ev.choices.forEach(ch=>{
    const btn=document.createElement('button');
    btn.className='modal-choice';
    btn.innerHTML=`<div class="choice-title">${ch.text}</div><div class="choice-desc">${ch.desc}</div>`;
    btn.onclick=()=>{
      ch.fn(G);
      document.getElementById('event-modal').classList.remove('active');
      renderGame();
      if (G.money<=0){endGame(false);return;}
      // winCondition временно отключён — режим бесконечной игры
      // if (G.money>=SCENARIO.settings.winCondition){endGame(true);}
    };
    div.appendChild(btn);
  });
  document.getElementById('event-modal').classList.add('active');
}

// ══════════════════════════════════════════════════════
//  END / DASHBOARD
// ══════════════════════════════════════════════════════
function endGame(won) {
  buildDashboard(won);
  // Кнопка «Продолжить ран» — только на победном экране
  const contBtn = document.getElementById('btn-continue-run');
  if (contBtn) contBtn.style.display = won ? '' : 'none';
  _uiNavigate('screen-results');
}

// Вернуться в игру из экрана победы без сброса партии
function continueRun() {
  EventBus.emit('render');
  _uiNavigate('screen-game');
}

function buildDashboard(won) {
  const spec=SPECS[G.spec];
  document.getElementById('r-icon').textContent=won?'🏆':'💸';
  document.getElementById('r-title').textContent=won?'Компания вышла на эндгейм!':'Деньги кончились';
  document.getElementById('r-title').style.color=won?'var(--green)':'var(--red)';
  document.getElementById('r-sub').textContent=won
    ?`${spec.name} — ${G.monthsPlayed} мес. · ${fmtK(G.money)} в банке. Можно продолжить или зафиксировать результат.`
    :G.monthsPlayed<4?'Кассовый разрыв: расходы съели стартовый капитал до появления стабильных проектов.'
    :'Рынок суров. Оценка клиентов деградировала, клиенты ушли раньше, чем выросла выручка.';

  // Ф.7: «вступительный ран» — заскриптованное поражение подаётся как начало пути.
  if (!won && typeof G !== 'undefined' && G._scriptedIntro) {
    document.getElementById('r-icon').textContent = '🌱';
    const _rt = document.getElementById('r-title');
    _rt.textContent = 'Вступительный ран пройден'; _rt.style.color = 'var(--amber)';
    document.getElementById('r-sub').textContent =
      'Так и должно быть. Без команды и инструментов студию пока не удержать — это начало пути, а не провал. ' +
      'Ты нащупал, как всё устроено, и заработал экспертизу — открой первый модуль в «Дереве открытий», и следующий ран будет глубже.';
  }

  const peak=Math.max(...G.history.map(h=>h.money));
  const churned=DECISIONS.filter(d=>d.type==='churn').length;
  const scouts=DECISIONS.filter(d=>d.type==='client').length;
  document.getElementById('r-kpis').innerHTML=`
    <div class="kpi-box"><div class="kv" style="color:${won?'var(--green)':'var(--red)'}">${fmtK(G.money)}</div><div class="kl">Итоговый баланс</div></div>
    <div class="kpi-box"><div class="kv">${G.monthsPlayed}</div><div class="kl">Месяцев</div></div>
    <div class="kpi-box"><div class="kv" style="color:var(--accent2)">${fmtK(peak)}</div><div class="kl">Пик баланса</div></div>
    <div class="kpi-box"><div class="kv">${churned}</div><div class="kl">Ушло клиентов</div></div>`;

  buildChart();

  // Breakdown
  const totalE=Object.values(G.clientEarnings).reduce((s,v)=>s+v,0)||1;
  const byName={};
  Object.entries(G.clientEarnings).forEach(([id,e])=>{
    const def=PROJECT_POOL.find(p=>id.startsWith(p.id))||{name:id,icon:'🏢'};
    byName[def.name]=(byName[def.name]||{name:def.name,icon:def.icon,e:0});
    byName[def.name].e+=e;
  });
  let bhtml=Object.values(byName).sort((a,b)=>b.e-a.e).map(t=>{
    const pct=Math.round(t.e/totalE*100);
    return `<div class="breakdown-row">
      <div class="breakdown-icon">${t.icon}</div>
      <div class="breakdown-info">
        <div class="breakdown-name">${t.name}</div>
        <div class="breakdown-bar-wrap"><div class="breakdown-bar-fill" style="width:${pct}%;background:var(--accent)"></div></div>
      </div>
      <div class="breakdown-val">${fmtK(t.e)}</div>
    </div>`;
  }).join('');
  document.getElementById('r-breakdown').innerHTML=bhtml||'<div style="color:var(--sub);font-size:13px">Нет данных</div>';

  // Timeline
  const dc={hire:'var(--accent)',client:'var(--green)',event:'var(--amber)',churn:'var(--red)'};
  document.getElementById('r-timeline').innerHTML=DECISIONS.length
    ?DECISIONS.map(d=>`<div class="tl-item"><div class="tl-dot" style="background:${dc[d.type]||'var(--sub)'}"></div><div class="tl-month">${d.label}</div><div class="tl-text">${d.text}</div></div>`).join('')
    :'<div style="color:var(--sub);font-size:13px">Решений не зафиксировано</div>';

  // Insights
  document.getElementById('r-insights').innerHTML=generateInsights(won).map(i=>
    `<div class="insight-row"><div class="insight-icon">${i.icon}</div><div class="insight-text">${i.text}</div></div>`
  ).join('');
}

function buildChart() {
  const hist=G.history;
  if (hist.length<2){ document.getElementById('r-chart').innerHTML='<div style="color:var(--sub);padding:16px;text-align:center">Недостаточно данных</div>'; return; }
  const W=600,H=180,PL=52,PR=12,PT=12,PB=28,cW=W-PL-PR,cH=H-PT-PB;
  const ms=hist.map(h=>h.money), maxM=Math.max(...ms,500000)*1.08, minM=Math.min(...ms,0), rng=maxM-minM||1;
  const px=i=>PL+(i/(hist.length-1))*cW, py=m=>PT+cH-((m-minM)/rng)*cH;
  const pts=hist.map((h,i)=>`${px(i).toFixed(1)},${py(h.money).toFixed(1)}`).join(' ');
  const area=`M${px(0).toFixed(1)},${(PT+cH).toFixed(1)} `+hist.map((h,i)=>`L${px(i).toFixed(1)},${py(h.money).toFixed(1)}`).join(' ')+` L${px(hist.length-1).toFixed(1)},${(PT+cH).toFixed(1)} Z`;
  const goalY=py(SCENARIO.settings.winCondition), showGoal=goalY>=PT&&goalY<=PT+cH;
  const dc2={hire:'#4F6EF7',client:'#3FB950',event:'#D29922',churn:'#F85149'};
  const dots=DECISIONS.map(d=>{
    const idx=Math.min(d.monthIdx,hist.length-1);
    return `<circle cx="${px(idx).toFixed(1)}" cy="${py(hist[idx]?.money??0).toFixed(1)}" r="5" fill="${dc2[d.type]||'#8B949E'}" stroke="#161B22" stroke-width="2"><title>${d.label}: ${d.text}</title></circle>`;
  }).join('');
  const ticks=[minM,(minM+maxM)/2,maxM].map(v=>{
    const lbl=Math.abs(v)>=1000000?(v/1000000).toFixed(1)+'M':Math.abs(v)>=1000?Math.round(v/1000)+'K':'0';
    return `<text x="${PL-6}" y="${py(v).toFixed(1)}" fill="#484F58" font-size="10" text-anchor="end" dominant-baseline="middle">${lbl}</text>`;
  }).join('');
  const step=Math.max(1,Math.floor(hist.length/5));
  const xlbls=hist.map((h,i)=>{
    if (i%step!==0&&i!==hist.length-1) return '';
    return `<text x="${px(i).toFixed(1)}" y="${PT+cH+14}" fill="#484F58" font-size="9" text-anchor="middle">${h.label.slice(0,3)}</text>`;
  }).join('');
  document.getElementById('r-chart').innerHTML=`<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="cg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#4F6EF7" stop-opacity=".25"/><stop offset="100%" stop-color="#4F6EF7" stop-opacity=".01"/></linearGradient></defs>
    <line x1="${PL}" y1="${PT}" x2="${W-PR}" y2="${PT}" stroke="#1C2330" stroke-width="1"/>
    <line x1="${PL}" y1="${PT+cH/2}" x2="${W-PR}" y2="${PT+cH/2}" stroke="#1C2330" stroke-width="1"/>
    <line x1="${PL}" y1="${PT+cH}" x2="${W-PR}" y2="${PT+cH}" stroke="#30363D" stroke-width="1"/>
    ${minM<0?`<line x1="${PL}" y1="${py(0).toFixed(1)}" x2="${W-PR}" y2="${py(0).toFixed(1)}" stroke="#F85149" stroke-width=".8" stroke-dasharray="3,3" opacity=".5"/>`:''}
    ${showGoal?`<line x1="${PL}" y1="${goalY.toFixed(1)}" x2="${W-PR}" y2="${goalY.toFixed(1)}" stroke="#3FB950" stroke-width="1" stroke-dasharray="4,3" opacity=".6"/><text x="${W-PR-2}" y="${goalY-4}" fill="#3FB950" font-size="9" text-anchor="end" opacity=".8">Цель ${fmtK(SCENARIO.settings.winCondition)}</text>`:''}
    <path d="${area}" fill="url(#cg)"/>
    <polyline points="${pts}" fill="none" stroke="#4F6EF7" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    ${dots}${ticks}${xlbls}
  </svg>`;
}

function generateInsights(won) {
  const ins=[];
  const churned=DECISIONS.filter(d=>d.type==='churn').length;
  const scouts=DECISIONS.filter(d=>d.type==='client').length;
  const hired=DECISIONS.filter(d=>d.type==='hire').length;
  const ms=G.history.map(h=>h.money);
  const peak=Math.max(...ms);
  const peakM=G.history.findIndex(h=>h.money===peak);

  if (scouts===0) ins.push({icon:'🔍',text:'<strong>Ни одного проекта не подписано через скаутинг.</strong> Без активного поиска агентство живёт только на overhead — деньги утекают каждый месяц.'});
  if (scouts>0)   ins.push({icon:'📋',text:`<strong>Подписано ${scouts} проект${scouts===1?'':scouts<5?'а':'ов'} через скаутинг.</strong> Качество скаутинга зависит от репутации — чем выше, тем лучше пул предложений.`});
  if (churned>0)  ins.push({icon:'💔',text:`<strong>${churned} клиент${churned===1?'':churned<5?'а':'ов'} ушли органически.</strong> Оценка клиентов падает без качества и объёма — Дизайнер и Копирайтер напрямую снижают риск оттока.`});
  if (churned===0&&scouts>0) ins.push({icon:'✅',text:'<strong>Ни одного органического оттока.</strong> Оценка клиентов держалась выше критического уровня на протяжении всей игры.'});
  if (hired===0) ins.push({icon:'👤',text:'<strong>Команда так и не собрана.</strong> Без Дизайнера и Копирайтера качество/объём равны нулю — это блокирует дорогие проекты и ускоряет деградацию оценки клиентов.'});
  if (peakM>0&&peakM<G.history.length-2) ins.push({icon:'📉',text:`<strong>Пик достигнут в ${G.history[peakM].label}</strong>, затем кривая пошла вниз. Вероятная причина: отток клиентов или рост постоянных расходов без новых проектов.`});
  if (won) ins.push({icon:'📊',text:`<strong>Победа за ${G.monthsPlayed} мес. — специализация: ${SPECS[G.spec].name}.</strong> В реальном агентстве этот путь занимает 18–36 месяцев.`});
  if (!won&&G.monthsPlayed<5) ins.push({icon:'⚡',text:`<strong>Банкротство за ${G.monthsPlayed} мес.</strong> Overhead ${fmt(OVERHEAD)}/мес + зарплаты без выручки — классический кассовый разрыв первого года.`});
  return ins.slice(0,4);
}

// ══════════════════════════════════════════════════════
//  PORTFOLIO TAB
// ══════════════════════════════════════════════════════

function switchTab(tab) {
  document.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.gtab').forEach(t=>t.classList.remove('active'));
  document.getElementById('tab-panel-'+tab).classList.add('active');
  document.getElementById('tab-btn-'+tab).classList.add('active');
  if (tab==='portfolio') renderPortfolioTab();
  if (tab==='ai') {
    renderAITab();
    const badge = document.getElementById('tab-ai-badge');
    if (badge) badge.style.display = 'none';
  }
  if (tab==='market' && typeof Competitors !== 'undefined' && Competitors.renderMarketTab) Competitors.renderMarketTab();
}

function renderPortfolioTab() {
  const container=document.getElementById('g-portfolio-content');
  if (!container) return;

  const cases=G.cases||[];
  // П.18: расторгнутые и провальные — не в портфолио
  const available=(G.completedProjects||[]).filter(p=>!p._cased && !p.terminated && !p.failed);
  const cased=(G.completedProjects||[]).filter(p=>p._cased);

  // ── Total bonuses summary ──
  const totalQ=G.caseQBonus||0;
  const totalRep=G.caseRepBonus||0;
  const totalScout=G.caseScoutBonus||0;
  const hasBonuses=totalQ>0||totalRep>0||totalScout>0;
  const bonusSummary=hasBonuses
    ? `<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px;padding:10px 14px;background:rgba(168,85,247,.08);border:1px solid rgba(168,85,247,.2);border-radius:9px;align-items:center">
        <span style="font-size:11px;color:var(--sub)">Суммарные бонусы портфолио:</span>
        ${totalQ>0?`<span style="font-size:12px;color:var(--teal);font-weight:700">Качество +${totalQ}</span>`:''}
        ${totalRep>0?`<span style="font-size:12px;color:var(--green);font-weight:700">Репутация +${totalRep}/мес</span>`:''}
        ${totalScout>0?`<span style="font-size:12px;color:var(--purple);font-weight:700">+${totalScout} лид/скаутинг</span>`:''}
      </div>` : '';

  // ── Cases in portfolio ──
  let casesHtml='';
  if (cases.length===0){
    casesHtml=`<div style="text-align:center;padding:20px 0;color:var(--sub)">
      <div style="font-size:26px;margin-bottom:8px">📁</div>
      <div style="font-weight:600;color:var(--text);margin-bottom:4px">Кейсов пока нет</div>
      <div style="font-size:12px">Собери первый кейс из завершённых проектов справа</div>
    </div>`;
  } else {
    casesHtml=cases.map(c=>{
      const gd=CASE_GRADES[c.grade];
      const bonusPills=[
        c.qBonus>0?`<span style="font-size:10px;color:var(--teal);font-weight:700;background:rgba(45,212,191,.12);padding:2px 7px;border-radius:4px">Q +${c.qBonus}</span>`:'',
        c.repBonus>0?`<span style="font-size:10px;color:var(--green);font-weight:700;background:rgba(63,185,80,.1);padding:2px 7px;border-radius:4px">Реп +${c.repBonus}/мес</span>`:'',
        c.scoutBonus>0?`<span style="font-size:10px;color:var(--purple);font-weight:700;background:rgba(168,85,247,.12);padding:2px 7px;border-radius:4px">+${c.scoutBonus} лид</span>`:'',
      ].filter(Boolean).join('');
      return `<div class="staff-item" style="border-left:3px solid ${gd.color};padding-left:12px;margin-bottom:8px">
        <div class="staff-avatar" style="background:rgba(168,85,247,.12);font-size:18px">${c.icon}</div>
        <div class="staff-info">
          <div class="staff-name" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            ${c.name}
            <span style="font-size:10px;padding:2px 8px;border-radius:4px;background:rgba(168,85,247,.15);color:${gd.color};font-weight:700">${gd.icon} ${gd.label}</span>
          </div>
          <div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:4px">${bonusPills||`<span style="font-size:10px;color:var(--muted)">без бонусов</span>`}</div>
          <div style="font-size:10px;color:var(--muted);margin-top:3px">Оценка клиента при закрытии: ${c.finalNPS} · сборка: ${c.daysSpent} дн.</div>
        </div>
        <button class="btn btn-xs" style="background:rgba(248,81,73,.08);color:var(--red);border:1px solid rgba(248,81,73,.2);flex-shrink:0" onclick="removeCase('${c.id}')">Убрать</button>
      </div>`;
    }).join('');
    if (cased.length>0){
      casesHtml+=`<div style="font-size:10px;color:var(--muted);margin-top:4px;text-align:center">${cased.length} проект${cased.length<5?'а':'ов'} в кейсах — убери чтобы пересобрать</div>`;
    }
  }

  // ── Available to build ──
  let buildHtml='';
  if (available.length===0 && (G.completedProjects||[]).length===0){
    buildHtml=`<div style="text-align:center;padding:20px 0;color:var(--sub)">
      <div style="font-size:22px;margin-bottom:8px">⏳</div>
      <div style="font-size:13px">Здесь появятся завершённые проекты.<br>Закрой разовый заказ или дождись ухода клиента.</div>
    </div>`;
  } else if (available.length===0){
    buildHtml=`<div style="text-align:center;padding:14px 0;color:var(--sub);font-size:13px">Все завершённые проекты уже оформлены в кейсы.</div>`;
  } else {
    buildHtml=`<div style="font-size:11px;color:var(--muted);margin-bottom:10px">Потрать рабочие дни на сборку. Больше дней + выше качество + лучше оценка клиента → выше грейд.</div>`;
    buildHtml+=available.map(p=>{
      const g1=CASE_GRADES[calcCaseGrade(p,2)];
      const g2=CASE_GRADES[calcCaseGrade(p,4)];
      const g3=CASE_GRADES[calcCaseGrade(p,6)];
      const statusBadge=p.failed
        ?`<span style="font-size:10px;color:var(--red);font-weight:600">💔 Клиент ушёл</span>`
        :p.terminated
        ?`<span style="font-size:10px;color:var(--amber);font-weight:600">🚫 Расторгнут</span>`
        :`<span style="font-size:10px;color:var(--green);font-weight:600">✅ Выполнен</span>`;

      const btnStyle=(gd)=>{
        if (gd.id==='excellent') return 'btn-primary';
        if (gd.id==='good') return 'btn-teal';
        return 'btn-ghost';
      };

      return `<div class="client-card" style="margin-bottom:10px">
        <div class="client-row1">
          <div class="client-icon">${p.icon}</div>
          <div class="client-info">
            <div class="client-name">${p.name} ${statusBadge}</div>
            <div class="client-desc">Оценка клиента при завершении: <strong style="color:${p.finalNPS>=55?'var(--green)':p.finalNPS>=40?'var(--amber)':'var(--red)'}">${p.finalNPS}</strong> · Tier ${p.tier}</div>
          </div>
        </div>
        <div style="margin-top:10px">
          <div style="font-size:10px;color:var(--muted);margin-bottom:6px">Выбери время на сборку кейса:</div>
          <div style="display:flex;gap:6px">
            <button class="btn btn-sm ${btnStyle(g1)}" onclick="buildCase('${p.id}',2)" ${G.actions<2?'disabled':''}
              style="flex:1;flex-direction:column;gap:2px;align-items:center;padding:8px 6px;text-align:center">
              <span>2 дня</span><span style="font-size:9px;opacity:.75">${g1.icon} ${g1.label}</span>
            </button>
            <button class="btn btn-sm ${btnStyle(g2)}" onclick="buildCase('${p.id}',4)" ${G.actions<4?'disabled':''}
              style="flex:1;flex-direction:column;gap:2px;align-items:center;padding:8px 6px;text-align:center">
              <span>4 дня</span><span style="font-size:9px;opacity:.75">${g2.icon} ${g2.label}</span>
            </button>
            <button class="btn btn-sm ${btnStyle(g3)}" onclick="buildCase('${p.id}',6)" ${G.actions<6?'disabled':''}
              style="flex:1;flex-direction:column;gap:2px;align-items:center;padding:8px 6px;text-align:center">
              <span>6 дней</span><span style="font-size:9px;opacity:.75">${g3.icon} ${g3.label}</span>
            </button>
          </div>
        </div>
      </div>`;
    }).join('');
  }

  container.innerHTML=`
    ${bonusSummary}
    <div class="portfolio-grid">
      <div class="panel">
        <div class="panel-title">Кейсы в портфолио <span class="badge badge-spec">${cases.length}</span></div>
        ${casesHtml}
      </div>
      <div class="panel">
        <div class="panel-title">Завершённые проекты <span class="badge badge-spec">${available.length}</span></div>
        ${buildHtml}
      </div>
    </div>`;
}

// ══════════════════════════════════════════════════════
//  НЕЙРОСЕТЬ — рендер вкладки
// ══════════════════════════════════════════════════════

function renderAITab() {
  const el = document.getElementById('g-ai-content');
  if (!el) return;

  const cfg      = SCENARIO.ai || {};
  const ai       = G.ai || {};
  const levels   = cfg.levels || [];
  const purchased = ai.purchased;

  // ── Экран покупки ──────────────────────────────────
  if (!purchased) {
    const canBuy = G.money >= cfg.purchaseCost && G.reputation >= cfg.purchaseMinRep;
    el.innerHTML = `
      <div class="ai-screen">
        <div class="ai-glow-bg" style="text-align:center;padding:40px 24px">
          <div style="font-size:52px;margin-bottom:16px;filter:drop-shadow(0 0 18px rgba(168,85,247,.6))">🤖</div>
          <div style="font-size:22px;font-weight:700;color:var(--fg);margin-bottom:8px">Нейросеть</div>
          <div style="font-size:13px;color:var(--sub);max-width:480px;margin:0 auto 24px;line-height:1.6">
            Подключи ИИ-советника для анализа стейта агентства, стратегических рекомендаций
            и пассивных бонусов к Q, V и репутации. Прокачивай модель — она становится быстрее
            и эффективнее.
          </div>
          <div style="display:flex;gap:16px;justify-content:center;margin-bottom:24px;flex-wrap:wrap">
            <div style="background:rgba(168,85,247,.1);border:1px solid rgba(168,85,247,.2);border-radius:8px;padding:12px 20px;text-align:center">
              <div style="font-size:18px;font-weight:700;color:var(--purple)">${fmtK(cfg.purchaseCost)}</div>
              <div style="font-size:11px;color:var(--muted)">Стоимость доступа</div>
            </div>
            <div style="background:rgba(168,85,247,.1);border:1px solid rgba(168,85,247,.2);border-radius:8px;padding:12px 20px;text-align:center">
              <div style="font-size:18px;font-weight:700;color:var(--purple)">≥${cfg.purchaseMinRep}</div>
              <div style="font-size:11px;color:var(--muted)">Репутация</div>
            </div>
          </div>
          ${!canBuy && G.reputation < cfg.purchaseMinRep
            ? `<div style="font-size:12px;color:var(--amber);margin-bottom:12px">⚠️ Нужна репутация ≥${cfg.purchaseMinRep} (сейчас ${Math.round(G.reputation)})</div>` : ''}
          ${!canBuy && G.money < cfg.purchaseCost
            ? `<div style="font-size:12px;color:var(--red);margin-bottom:12px">⚠️ Недостаточно средств (нужно ${fmtK(cfg.purchaseCost)})</div>` : ''}
          <button class="btn btn-primary" onclick="purchaseAI()" ${!canBuy?'disabled':''}
            style="font-size:15px;padding:12px 32px;background:linear-gradient(135deg,#7c3aed,#4f46e5)">
            🤖 Подключить нейросеть
          </button>
          <div style="margin-top:12px;font-size:11px;color:var(--muted)">
            После покупки станет доступен чат и дерево прокачки
          </div>
        </div>

        <!-- Превью уровней -->
        <div style="margin-top:16px">
          <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px">Дерево прокачки</div>
          <div class="ai-tree">
            ${levels.map((lvl, i) => `
              <div class="ai-node locked">
                <div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;margin-bottom:4px">Ур. ${lvl.level}</div>
                <div style="font-size:12px;font-weight:600;color:var(--sub)">${lvl.name}</div>
                ${lvl.cost > 0 ? `<div style="font-size:10px;color:var(--muted);margin-top:4px">${fmtK(lvl.cost)} · ${lvl.trainingMonths} мес.</div>` : ''}
              </div>`).join('')}
          </div>
        </div>
      </div>`;
    return;
  }

  // ── Активный экран (после покупки) ────────────────
  const currentLevel = levels[ai.level] || levels[0];
  const nextLevel    = levels[ai.level + 1];
  const limit        = typeof getAIQueriesLimit === 'function' ? getAIQueriesLimit() : 0;
  const delay        = typeof getAIResponseDelay === 'function' ? getAIResponseDelay() : 0;
  const queriesLeft  = Math.max(0, limit - (ai.queriesThisMonth || 0));
  const apiKey       = typeof getAIKey === 'function' ? getAIKey() : '';

  // Пассивные бонусы текущего уровня
  const passives = [];
  if (currentLevel.passiveQ)   passives.push(`+${currentLevel.passiveQ} качества/мес`);
  if (currentLevel.passiveRep) passives.push(`+${currentLevel.passiveRep} репутации/мес`);
  if (currentLevel.passiveV)   passives.push(`+${currentLevel.passiveV} объёма/мес`);
  if (currentLevel.autoScout)  passives.push('Авто-скаутинг 🔍');

  // Рендер чата
  const chatHtml = (ai.chat || []).length === 0
    ? `<div style="text-align:center;padding:24px 0;color:var(--muted);font-size:13px">
        Задай первый вопрос — нейросеть проанализирует состояние агентства
       </div>`
    : (ai.chat || []).map(msg => {
        const label = msg.month != null ? (monthLabel ? `Месяц ${msg.month}` : `М${msg.month}`) : '';
        return `<div class="ai-bubble ${msg.role}${msg.pending ? ' pending' : ''}">
          ${msg.pending && msg.role === 'ai' && msg.text.includes('⏳')
            ? `<span class="ai-thinking-dots"><span>·</span><span>·</span><span>·</span></span> ${msg.text}`
            : msg.text}
          <div class="ai-month">${label}</div>
        </div>`;
      }).join('');

  // Дерево прокачки
  const treeHtml = levels.map((lvl) => {
    const isDone     = lvl.level < ai.level;
    const isCurrent  = lvl.level === ai.level;
    const isTraining = isCurrent && ai.upgrading;
    const isNext     = lvl.level === ai.level + 1 && !ai.upgrading;
    const isLocked   = lvl.level > ai.level + 1 || (lvl.level === ai.level + 1 && ai.upgrading);

    let cls = 'ai-node';
    if (isDone)     cls += ' completed';
    if (isCurrent && !ai.upgrading) cls += ' active';
    if (isTraining) cls += ' training';
    if (isLocked)   cls += ' locked';

    const bonuses = [];
    if (lvl.passiveQ)   bonuses.push(`Качество +${lvl.passiveQ}`);
    if (lvl.passiveRep) bonuses.push(`Репутация +${lvl.passiveRep}`);
    if (lvl.passiveV)   bonuses.push(`Объём +${lvl.passiveV}`);
    if (lvl.autoScout)  bonuses.push('Авто-скаут');

    return `<div class="${cls}">
      <div style="font-size:9px;font-weight:700;color:${isDone?'var(--green)':isCurrent?'var(--purple)':'var(--muted)'};text-transform:uppercase;margin-bottom:3px">
        ${isDone ? '✓ ' : ''}Ур. ${lvl.level}
      </div>
      <div style="font-size:11px;font-weight:700;color:var(--fg);margin-bottom:4px">${lvl.name}</div>
      ${bonuses.length ? `<div style="font-size:9px;color:var(--green);margin-bottom:4px">${bonuses.join(' · ')}</div>` : ''}
      ${isTraining ? `<div style="font-size:10px;color:var(--amber)">🔄 ${ai.upgradeMonthsLeft} мес. до завершения</div>`
        : isCurrent && !ai.upgrading ? `<div style="font-size:9px;color:var(--purple)">◀ Текущий · ответ ${lvl.responseMonths===0?'сразу':`~${lvl.responseMonths} мес.`} · ${lvl.queriesPerMonth===999?'∞':lvl.queriesPerMonth}/мес</div>`
        : isNext ? `<button class="btn btn-sm btn-primary" onclick="upgradeAI()"
            style="font-size:10px;padding:4px 8px;margin-top:2px;background:linear-gradient(135deg,#7c3aed,#4f46e5);border:none"
            ${G.money < lvl.cost ? 'disabled' : ''}>
            Обучить ${fmtK(lvl.cost)} · ${lvl.trainingMonths} мес.
          </button>`
        : lvl.cost > 0 ? `<div style="font-size:9px;color:var(--muted)">${fmtK(lvl.cost)} · ${lvl.trainingMonths} мес.</div>` : ''}
    </div>`;
  }).join('');

  // Быстрые вопросы
  const quickQHtml = (cfg.quickQuestions || []).map(q =>
    `<button onclick="document.getElementById('ai-input').value='${q.replace(/'/g,"\\'")}'"
      style="background:rgba(168,85,247,.08);border:1px solid rgba(168,85,247,.15);border-radius:6px;
             color:var(--sub);font-size:11px;padding:4px 10px;cursor:pointer;text-align:left;
             transition:background .15s" onmouseover="this.style.background='rgba(168,85,247,.18)'"
             onmouseout="this.style.background='rgba(168,85,247,.08)'">${q}</button>`
  ).join('');

  el.innerHTML = `
    <div class="ai-screen">

      <!-- Статус и уровень -->
      <div class="ai-glow-bg" style="padding:16px 20px;margin-bottom:12px">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:${passives.length?'8':'0'}px">
          <div style="font-size:28px;filter:drop-shadow(0 0 10px rgba(168,85,247,.7))">🤖</div>
          <div>
            <div style="font-weight:700;font-size:15px;color:var(--fg)">${currentLevel.name}</div>
            <div style="font-size:11px;color:var(--muted)">
              ${ai.upgrading ? `🔄 Обучение: осталось ${ai.upgradeMonthsLeft} мес.`
                : `Ур. ${ai.level} · ответ ${delay===0?'в этот месяц':`~${delay} мес.`} · ${queriesLeft===999?'∞':queriesLeft}/${limit} запросов осталось`}
            </div>
          </div>
          ${!apiKey ? `<div style="margin-left:auto;font-size:10px;color:var(--amber);cursor:pointer"
            onclick="document.getElementById('ai-key-row').style.display='flex'" title="Задать API ключ">🔑 API ключ</div>` : ''}
        </div>
        ${passives.length ? `<div style="display:flex;gap:8px;flex-wrap:wrap">
          ${passives.map(p=>`<span style="background:rgba(63,185,80,.12);color:var(--green);border-radius:4px;padding:2px 8px;font-size:10px;font-weight:600">${p}</span>`).join('')}
        </div>` : ''}
      </div>

      <!-- Поле API-ключа (скрыто по умолчанию если ключ уже есть) -->
      <div id="ai-key-row" style="display:${apiKey?'none':'flex'};gap:8px;align-items:center;margin-bottom:12px">
        <input id="ai-key-input" type="password" placeholder="Anthropic API key (sk-ant-...)"
          value="${apiKey}"
          style="flex:1;background:var(--bg2);border:1px solid var(--border);border-radius:8px;
                 color:var(--fg);font-size:12px;padding:7px 12px;outline:none;font-family:monospace">
        <button class="btn btn-sm btn-teal" onclick="
          const k=document.getElementById('ai-key-input').value;
          if(typeof setAIKey==='function') setAIKey(k);
          document.getElementById('ai-key-row').style.display='none';
          notify(k?'🔑 API ключ сохранён':'Ключ очищен','success');">
          Сохранить
        </button>
      </div>

      <!-- Чат -->
      <div class="panel" style="padding:0;overflow:hidden;margin-bottom:12px">
        <div style="padding:10px 14px;border-bottom:1px solid rgba(255,255,255,.06);font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.05em">
          💬 Диалог
        </div>
        <div class="ai-chat" id="ai-chat-log" style="padding:12px 14px">
          ${chatHtml}
        </div>

        <!-- Быстрые вопросы -->
        <div style="padding:8px 14px;border-top:1px solid rgba(255,255,255,.04);display:flex;gap:6px;flex-wrap:wrap">
          ${quickQHtml}
        </div>

        <!-- Поле ввода -->
        <div class="ai-input-row" style="padding:10px 14px;border-top:1px solid rgba(255,255,255,.06)">
          <textarea id="ai-input" class="ai-textarea" rows="2"
            placeholder="${ai.upgrading ? 'Нейросеть на обучении...' : queriesLeft===0 ? 'Лимит запросов на этот месяц исчерпан' : 'Задай вопрос нейросети...'}"
            ${ai.upgrading || queriesLeft===0 ? 'disabled' : ''}
            onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();_aiSend();}"></textarea>
          <button class="btn btn-primary" onclick="_aiSend()"
            style="padding:8px 16px;background:linear-gradient(135deg,#7c3aed,#4f46e5);border:none;flex-shrink:0"
            ${ai.upgrading || queriesLeft===0 ? 'disabled' : ''}>
            Отправить
          </button>
        </div>
      </div>

      <!-- Дерево прокачки -->
      <div class="panel">
        <div class="panel-title">🧬 Дерево прокачки</div>
        <div class="ai-tree">${treeHtml}</div>
      </div>

    </div>`;

  // Скролл чата вниз
  const chatLog = document.getElementById('ai-chat-log');
  if (chatLog) chatLog.scrollTop = chatLog.scrollHeight;
}

// Отправить сообщение из UI
function _aiSend() {
  const inp = document.getElementById('ai-input');
  if (!inp) return;
  const q = inp.value.trim();
  if (!q) return;
  inp.value = '';
  if (typeof askAI === 'function') askAI(q);
}

// ══════════════════════════════════════════════════════
//  PERK TREE MODAL
// ══════════════════════════════════════════════════════
function openPerkModal() {
  // Ф.7: гейт режима «Rogue-lite» (вне режима не блокирует)
  if (typeof isModuleUnlocked === 'function' && !isModuleUnlocked('tree')) {
    if (typeof notify === 'function') notify('🔒 Древо перков заперто — открой его в Дереве открытий', 'error');
    return;
  }
  // Контент уже актуален (renderGame обновляет g-upgrades-list при каждом тике)
  document.getElementById('perk-modal')?.classList.add('active');
}

function closePerkModal() {
  document.getElementById('perk-modal')?.classList.remove('active');
}

// ══════════════════════════════════════════════════════
//  STAFF ASSIGN MODAL
// ══════════════════════════════════════════════════════
let _assignModalProjectId = null;

function openAssignModal(projectId) {
  _assignModalProjectId = projectId;
  _renderAssignModal();
  document.getElementById('staff-assign-modal')?.classList.add('active');
}

function closeAssignModal() {
  _assignModalProjectId = null;
  document.getElementById('staff-assign-modal')?.classList.remove('active');
}

function _renderAssignModal() {
  const pid = _assignModalProjectId;
  if (!pid) return;
  const client = (G.activeClients || []).find(c => c.id === pid);
  if (!client) { closeAssignModal(); return; }

  const pThr  = typeof getProjectThroughput === 'function' ? getProjectThroughput(client) : 2;
  const pLoad = getProjectLoad(client);
  const eff   = pLoad > 0 ? effFromRatio(pThr / pLoad) : 1;   // единая формула (v3.7)
  const effPct = Math.round(eff * 100);
  const barCol = effPct >= 100 ? 'var(--green)' : effPct >= 60 ? 'var(--amber)' : 'var(--red)';
  const barW   = Math.min(100, (effPct / 220) * 100);

  const sub = document.getElementById('staff-assign-subtitle');
  if (sub) sub.textContent = `${client.name} · ⚙ ${Math.round(pThr)} / ${pLoad} мощн. · ${effPct}%`;

  const staff = G.staff || [];
  const assignedIds = client._assignedStaff || [];

  let html = `
  <!-- Capacity bar -->
  <div style="margin-bottom:14px">
    <div style="display:flex;justify-content:space-between;margin-bottom:4px">
      <span style="font-size:11px;color:var(--sub)">Мощность проекта</span>
      <span style="font-size:11px;font-weight:700;color:${barCol}">${effPct}%</span>
    </div>
    <div style="height:5px;background:rgba(255,255,255,.07);border-radius:3px;overflow:hidden">
      <div style="height:100%;width:${barW}%;background:${barCol};border-radius:3px;transition:width .4s"></div>
    </div>
    <div style="font-size:10px;color:var(--sub);margin-top:4px">
      выделено ${Math.round(pThr)} из ${pLoad} мощн. (тир ${client.tier})
      ${effPct < 60 ? ' · <span style="color:var(--red)">⚠ мало — проект идёт очень медленно</span>' :
        effPct >= 150 ? ' · <span style="color:var(--amber)">отдача сверх 100% убывает — каждый следующий даёт меньше</span>' :
        effPct >= 100 ? ' · <span style="color:var(--green)">✓ достаточно</span>' : ''}
    </div>
  </div>
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
    <span style="font-size:11px;color:var(--sub);font-weight:600">СОТРУДНИКИ</span>
    <button class="btn btn-xs" style="font-size:11px;padding:4px 12px;background:rgba(45,212,191,.12);color:var(--teal);border:1px solid rgba(45,212,191,.35);border-radius:6px;font-weight:700;cursor:pointer"
      title="Подобрать свободных под нагрузку проекта" onclick="autoAssignAndRefresh('${pid}')">⚡ Авто-подбор</button>
  </div>`;

  if (staff.length === 0) {
    html += `<div style="text-align:center;color:var(--sub);padding:24px;font-size:13px">Команды пока нет — наймите специалистов</div>`;
  } else {
    staff.forEach(s => {
      if (s.status === 'fired') return;
      const meta  = (typeof ROLE_META !== 'undefined' && ROLE_META[s.role]) || {};
      const color = meta.color || '#6366f1';
      const emoji = s.icon || meta.emoji || '👤';
      const iid   = s._iid || s.uid || s.id;
      const isAssigned = assignedIds.includes(iid);
      // Is this staff assigned to a different project?
      const otherClient = s._assignedProjectId && s._assignedProjectId !== pid
        ? (G.activeClients || []).find(c => c.id === s._assignedProjectId) : null;

      // WU из единой формулы движка (v2.8: раньше здесь была устаревшая
      // копия без нормализации qStat — модал занижал мощность)
      const wu = calcStaffWorkUnit(s);

      const btnStyle = isAssigned
        ? `background:rgba(45,212,191,.15);color:var(--teal);border:1px solid rgba(45,212,191,.4)`
        : `background:rgba(255,255,255,.05);color:var(--sub);border:1px solid rgba(255,255,255,.1)`;
      const btnLabel = isAssigned ? '✓ Назначен' : '+ Назначить';
      const btnAction = isAssigned
        ? `unassignAndRefresh('${iid}', '${pid}')`
        : `assignAndRefresh('${iid}', '${pid}')`;

      html += `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.06)">
        <div style="width:32px;height:32px;border-radius:8px;background:${color}20;border:1px solid ${color}40;
                    display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0">${emoji}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:600">${s.name}</div>
          <div style="font-size:11px;color:var(--sub)">${s.roleLabel || s.role} · ${s.gradeLabel || s.grade}
            <span style="color:var(--teal);margin-left:4px">⚙ ${wu} мощн.</span>
            ${(typeof _rampActive === 'function' && _rampActive() && isAssigned && (s._rampMo || 0) < 2)
              ? `<span style="color:var(--amber);margin-left:4px" title="После перевода спец набирает мощность 2 мес (×0.5→×0.75→×1.0). Переключение сбрасывает разгон.">🔥 разгон ${(s._rampMo || 0)}/2</span>` : ''}
            ${otherClient ? `<span style="color:var(--amber);margin-left:4px">→ ${otherClient.name}</span>` : ''}
          </div>
        </div>
        <button class="btn btn-xs" style="${btnStyle};padding:4px 10px;font-size:11px;font-weight:600;cursor:pointer"
          onclick="${btnAction}">${btnLabel}</button>
      </div>`;
    });
  }

  const body = document.getElementById('staff-assign-body');
  if (body) body.innerHTML = html;
}

function assignAndRefresh(staffId, projectId) {
  if (typeof assignStaffToProject === 'function') {
    assignStaffToProject(staffId, projectId);
    _renderAssignModal();
    renderGame();
  }
}

function unassignAndRefresh(staffId, projectId) {
  if (typeof unassignStaff === 'function') {
    unassignStaff(staffId);
    _renderAssignModal();
    renderGame();
  }
}

// Ф.1: состояние «развёрнуты ли чипы команды» по карточке проекта
let _teamChipsExpanded = {};
function toggleTeamChips(cid) {
  _teamChipsExpanded[cid] = !_teamChipsExpanded[cid];
  renderGame();
}

// Ф.1: авто-подбор команды прямо с карточки проекта (переиспользует autoAssignOptimal)
function autoAssignAndRefresh(cid) {
  const c = (G.activeClients || []).find(x => x.id === cid);
  if (!c) return;
  if (typeof autoAssignOptimal !== 'function' || typeof assignStaffToProject !== 'function') return;
  const picks = autoAssignOptimal(c) || [];
  if (!picks.length) {
    if (typeof notify === 'function') notify('Нет свободных специалистов для авто-назначения', 'error');
    return;
  }
  picks.forEach(s => assignStaffToProject(s._iid || s.uid || s.id, cid));
  if (typeof notify === 'function') notify(`⚡ Авто-назначено: ${picks.length} спец. на «${c.name}»`, 'success');
  if (document.getElementById('staff-assign-modal')?.classList.contains('active')) _renderAssignModal();
  renderGame();
}

// ══════════════════════════════════════════════════════
//  PERK TREE — визуальное дерево навыков 4×4
// ══════════════════════════════════════════════════════
function _renderPerkTree() {
  const NODE_W = 68, NODE_H = 66, GAP_X = 12, GAP_Y = 20, HDR_H = 15;
  // Дерево 2.0: размер сетки и ветки — из данных сценария
  const _treeNodes = (UPGRADES || []).filter(p => p.treePos);
  const COLS = Math.max(...(_treeNodes.map(p => p.treePos.col)), 3) + 1;
  const ROWS = Math.max(...(_treeNodes.map(p => p.treePos.row)), 3) + 1;
  const W = COLS * NODE_W + (COLS - 1) * GAP_X; // 308px
  const H = HDR_H + ROWS * NODE_H + (ROWS - 1) * GAP_Y + 34; // + стаггер/джиттер (v3.6)

  // Органичная сеть (v3.6, по референсам): колонки со стаггером,
  // детерминированный джиттер от id — узлы «дышат», а не стоят сеткой
  const _hash = id => { let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0; return h; };
  const _jx = p => ((_hash(p.id) % 17) - 8);
  const _jy = p => (((_hash(p.id) >> 4) % 11) - 5);
  const _stag = col => (col % 2 ? 22 : 0);
  const nx  = col => col * (NODE_W + GAP_X);
  const ny  = row => HDR_H + row * (NODE_H + GAP_Y);
  const nodeX = p => nx(p.treePos.col) + _jx(p);
  const nodeY = p => ny(p.treePos.row) + _stag(p.treePos.col) + _jy(p);
  const ncx = col => nx(col) + NODE_W / 2;             // legacy (заголовки)
  const ncy = row => HDR_H + row * (NODE_H + GAP_Y) + NODE_H / 2;
  const nodeCX = p => nodeX(p) + NODE_W / 2;
  const nodeCY = p => nodeY(p) + NODE_H / 2;

  const _branches  = SCENARIO.upgradeBranches || [];
  const COL_LABELS = _branches.length ? _branches.map(b => b.label)
    : ['Качество', 'Скорость', 'Команда', 'Репутация', 'Сделки'];
  const COL_COLORS = _branches.length ? _branches.map(b => b.color)
    : ['rgba(45,212,191,.6)', 'rgba(99,102,241,.6)', 'rgba(249,115,22,.6)', 'rgba(139,92,246,.6)', 'rgba(210,153,34,.7)'];

  // Lookup: "col,row" → perk
  const treeMap = {};
  (UPGRADES || []).forEach(p => { if (p.treePos) treeMap[`${p.treePos.col},${p.treePos.row}`] = p; });
  const gn = (c, r) => treeMap[`${c},${r}`];

  // Row-0 и repeatables всегда доступны; остальные — если есть смежный купленный oneTime перк
  function isUnlocked(p) {
    if (!p.oneTime) return true;
    // Дерево 2.0: явные связи (включая кросс-веточные) приоритетнее соседства
    if (p.requires && p.requires.length) return p.requires.every(id => !!G.upgrades[id]);
    if (p.treePos.row === 0) return true;
    const { col, row } = p.treePos;
    const nbrs = [gn(col, row-1), gn(col, row+1), gn(col-1, row), gn(col+1, row)]
      .filter(n => n && n.oneTime);
    return nbrs.some(n => !!G.upgrades[n.id]);
  }

  // Узел закрыт выбором взаимоисключающей ветки?
  const _byId = {};
  (UPGRADES || []).forEach(u => { _byId[u.id] = u; });
  function isMutexLocked(p) {
    return (p.excludes || []).some(id => !!G.upgrades[id]);
  }

  // Связи (v3.6): только граф requires/excludes — кривые Безье,
  // цвет ветки-получателя, купленный путь светится
  let lines = '';
  const _curve = (a, b, color, width, dash, glow) => {
    const x1 = nodeCX(a), y1 = nodeCY(a), x2 = nodeCX(b), y2 = nodeCY(b);
    const dx = (x2 - x1) * 0.5;
    const d = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
    return (glow ? `<path d="${d}" stroke="${color}" stroke-width="${width + 3}" fill="none" opacity=".18" stroke-linecap="round"/>` : '') +
      `<path d="${d}" stroke="${color}" stroke-width="${width}" fill="none" ${dash ? `stroke-dasharray="${dash}"` : ''} stroke-linecap="round"/>`;
  };
  _treeNodes.forEach(p => {
    const branchCol = COL_COLORS[p.treePos.col] || 'rgba(255,255,255,.2)';
    (p.requires || []).forEach(rid => {
      const r = _byId[rid];
      if (!r || !r.treePos) return;
      const done = !!G.upgrades[rid] && !!G.upgrades[p.id];
      const open = !!G.upgrades[rid];
      const cross = r.treePos.col !== p.treePos.col;
      lines += _curve(r, p,
        done ? branchCol : open ? branchCol.replace('.65', '.45').replace('.7', '.45') : 'rgba(255,255,255,.08)',
        done ? 2.5 : 1.5, (!done && cross) ? '5,4' : (done ? '' : ''), done);
    });
    // row-0 без requires: лёгкий «корень» снизу вверх не рисуем — вершины свободны
    (p.excludes || []).forEach(xid => {
      const r = _byId[xid];
      if (!r || !r.treePos || xid < p.id) return;
      lines += _curve(r, p, 'rgba(248,81,73,.35)', 1.5, '2,5', false);
    });
  });

  // Заголовки колонок
  let headers = '';
  for (let col = 0; col < COLS; col++) {
    headers += `<div style="position:absolute;left:${nx(col)}px;top:0;width:${NODE_W}px;height:${HDR_H}px;
      display:flex;align-items:center;justify-content:center;
      font-size:8px;font-weight:700;color:${COL_COLORS[col]};letter-spacing:.5px;text-transform:uppercase"
    >${COL_LABELS[col]}</div>`;
  }

  // Узлы дерева
  let nodes = '';
  (UPGRADES || []).forEach(p => {
    if (!p.treePos) return;
    const { col, row } = p.treePos;
    const bought     = p.oneTime && !!G.upgrades[p.id];
    const tempActive = !p.oneTime && !p.fatigueReduce && G.tempQBonus >= p.qBonus;
    const unlocked   = isUnlocked(p);
    const mutexLock  = isMutexLocked(p);
    const draft      = !!p.draft;
    const onCd       = p.fatigueReduce ? ((G.fatigueActionCooldowns || {})[p.id] || 0) > 0 : false;
    const ftGate     = !!(p.minFatigue && (G.teamFatigue || 0) < p.minFatigue);
    const canAfford  = G.money >= p.cost;

    // Визуальное состояние узла — ветка светится своим цветом (v3.6)
    const bCol     = COL_COLORS[p.treePos.col] || 'rgba(255,255,255,.3)';
    const bColSoft = bCol.replace(/\.\d+\)/, '.16)');
    let border, bg, op, cur, glow = '';
    if (mutexLock && !bought) {
      border = '1.5px solid rgba(248,81,73,.35)'; bg = 'rgba(248,81,73,.05)'; op = .45; cur = 'not-allowed';
    } else if (bought || tempActive) {
      border = `2px solid ${bCol}`; bg = bColSoft; op = 1; cur = 'default';
      glow = `box-shadow:0 0 16px ${bColSoft}, 0 0 4px ${bColSoft};`;
    } else if (draft) {
      border = '1.5px dashed rgba(210,153,34,.45)'; bg = 'rgba(210,153,34,.04)'; op = .88; cur = 'pointer';
    } else if (!unlocked) {
      border = '1.5px solid rgba(255,255,255,.04)'; bg = 'rgba(0,0,0,.15)'; op = .28; cur = 'default';
    } else if (onCd || ftGate) {
      border = '1.5px solid rgba(255,255,255,.10)'; bg = 'transparent'; op = .60; cur = 'not-allowed';
    } else if (canAfford) {
      border = `1.5px solid ${bCol}`; bg = 'rgba(255,255,255,.02)'; op = 1; cur = 'pointer';
      glow = `box-shadow:0 0 8px ${bColSoft};`;
    } else {
      border = '1.5px solid rgba(255,255,255,.09)'; bg = 'transparent'; op = .70; cur = 'pointer';
    }

    // Подпись эффекта
    let eff = '', effCol = 'var(--teal)';
    if (p.fatigueReduce)       { eff = `😴 −${p.fatigueReduce}`; effCol = 'var(--green)'; }
    else if (p.qBonus && p.repBonus) eff = `Q+${p.qBonus} · Реп+${p.repBonus}`;
    else if (p.qBonus)         eff = `Q +${p.qBonus}`;
    else if (p.speedBonus)     { eff = `⚡ +${Math.round(p.speedBonus*100)}%`; effCol = 'rgba(99,102,241,.9)'; }
    else if (p.repBonus)       { eff = `Реп +${p.repBonus}`; effCol = 'rgba(139,92,246,.9)'; }
    else                       { eff = 'скоро'; effCol = 'var(--amber)'; }
    if (bought || tempActive) effCol = 'var(--green)';
    if (draft)                effCol = 'var(--amber)';

    // Нижняя строка узла (стоимость / кулдаун / гейт)
    let subLine = '';
    if (!bought && !tempActive) {
      if (onCd)   subLine = `<div style="font-size:7px;color:var(--muted)">⏳ ${(G.fatigueActionCooldowns||{})[p.id]} мес.</div>`;
      else if (ftGate) subLine = `<div style="font-size:7px;color:var(--amber)">уст. ≥${p.minFatigue}</div>`;
      else if (mutexLock) subLine = `<div style="font-size:7px;color:var(--red)">⛔ выбор сделан</div>`;
      else        subLine = `<div style="font-size:7.5px;color:var(--muted)">${fmtK(p.cost)} · ${p.days||1} дн.</div>`;
    }

    // Иконка состояния (верхний правый угол)
    const badge = (bought || tempActive)
      ? `<span style="position:absolute;top:3px;right:4px;font-size:9px;color:var(--green);font-weight:900">✓</span>`
      : draft
        ? `<span style="position:absolute;top:2px;right:4px;font-size:8px;color:var(--amber)">⚗</span>`
        : !unlocked
          ? `<span style="position:absolute;top:3px;right:4px;font-size:10px;opacity:.25">🔒</span>`
          : '';

    const clickable  = !bought && !tempActive && !mutexLock && (draft || (unlocked && !onCd && !ftGate));
    const onclickStr = clickable ? `onclick="buyUpgrade('${p.id}')"` : '';
    const shortName  = p.name.length > 14 ? p.name.substring(0, 13) + '…' : p.name;

    nodes += `<div ${onclickStr} title="${p.name}: ${p.desc}"
      style="position:absolute;left:${nodeX(p)}px;top:${nodeY(p)}px;
             width:${NODE_W}px;height:${NODE_H}px;box-sizing:border-box;
             border-radius:14px;border:${border};background:${bg};${glow}
             opacity:${op};cursor:${cur};
             display:flex;flex-direction:column;align-items:center;
             justify-content:center;gap:1px;padding:4px 3px;
             transition:border-color .18s,background .18s,filter .12s">
      ${badge}
      <div style="font-size:20px;line-height:1;margin-bottom:2px">${p.icon}</div>
      <div style="font-size:8.5px;color:var(--fg);text-align:center;line-height:1.25;font-weight:600;
                  max-width:${NODE_W-6}px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${shortName}</div>
      <div style="font-size:8px;font-weight:700;color:${effCol}">${eff}</div>
      ${subLine}
    </div>`;
  });

  // Быстрые действия (перки без treePos)
  const quickPerks = (UPGRADES || []).filter(p => !p.treePos);
  let quickHtml = '';
  if (quickPerks.length) {
    const btns = quickPerks.map(p => {
      const tempActive = !p.oneTime && !p.fatigueReduce && G.tempQBonus >= p.qBonus;
      const onCd    = p.fatigueReduce ? ((G.fatigueActionCooldowns||{})[p.id]||0) > 0 : false;
      const ftGate  = !!(p.minFatigue && (G.teamFatigue||0) < p.minFatigue);
      const ok      = G.money >= p.cost && G.actions >= (p.days||1);
      const dis     = tempActive || onCd || ftGate || !ok;
      const sub     = onCd ? `⏳${(G.fatigueActionCooldowns||{})[p.id]}м`
        : tempActive ? 'активен' : ftGate ? `≥${p.minFatigue}уст`
        : `${fmtK(p.cost)} · −${p.days}дн`;
      const buyFn2 = p.fatigueReduce ? 'buyFatigueAction' : 'buyUpgrade';
      return `<button class="btn btn-sm ${dis?'btn-ghost':'btn-teal'}"
        onclick="${buyFn2}('${p.id}')" ${dis?'disabled':''}
        style="font-size:10px;padding:5px 9px;white-space:nowrap" title="${p.desc}">
        ${p.icon} ${p.name} <span style="opacity:.6">· ${sub}</span>
      </button>`;
    }).join('');
    quickHtml = `<div style="margin-top:11px;border-top:1px solid rgba(255,255,255,.06);padding-top:9px">
      <div style="font-size:9px;font-weight:700;color:var(--muted);text-transform:uppercase;
                  letter-spacing:.6px;margin-bottom:7px">⚡ Быстрые действия</div>
      <div style="display:flex;flex-wrap:wrap;gap:5px">${btns}</div>
    </div>`;
  }

  return `<div style="width:100%;overflow-x:auto;padding:2px 0 4px">
    <div style="position:relative;width:${W}px;height:${H}px;margin:0 auto">
      ${headers}
      <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"
           style="position:absolute;top:0;left:0;pointer-events:none;overflow:visible">
        ${lines}
      </svg>
      ${nodes}
    </div>
    ${quickHtml}
  </div>`;
}

// ══════════════════════════════════════════════════════
//  RESET
// ══════════════════════════════════════════════════════
function resetGame() {
  // п.29: если сессия была активна и end_game ещё не сработал — записать мета-прогресс
  if (typeof G !== 'undefined' && G && (G.month || 0) > 0 && !G._endGameFired) {
    EventBus.emit('end_game', { won: false });
  }
  initState();
  initEventBus();
  document.querySelectorAll('.spec-card').forEach(c=>c.classList.remove('selected'));
  document.getElementById('btn-start-game').disabled=true;
  _uiNavigate('screen-mode');
}

// Б.1: кастомный confirm-модал вместо window.confirm (блокируется Chrome после dismiss)
function confirmExitToMenu() {
  const active = typeof G !== 'undefined' && G && (G.month || 0) > 0 && !G._endGameFired;
  if (active) {
    document.getElementById('confirm-exit-modal')?.classList.add('active');
    return;
  }
  resetGame();
}

function _doExitToMenu() {
  document.getElementById('confirm-exit-modal')?.classList.remove('active');
  resetGame();
}

// ══════════════════════════════════════════════════════
//  п.13 — ВТОРАЯ СПЕЦИАЛИЗАЦИЯ (Серийный предприниматель)
//  Вызывается из runes.js при достижении 15 портфолио.
//  Показывает оверлей со спек-картами (кроме текущей),
//  на выбор вызывает applySecondSpec(id).
// ══════════════════════════════════════════════════════
function showSecondSpecPicker() {
  if (typeof SPECS === 'undefined' || !G || !G.spec) return;
  // Удаляем старый оверлей если есть
  document.getElementById('second-spec-overlay')?.remove();

  const options = Object.entries(SPECS).filter(([id]) => id !== G.spec);
  if (!options.length) return;

  const overlay = document.createElement('div');
  overlay.id = 'second-spec-overlay';
  overlay.style.cssText = [
    'position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:9999',
    'display:flex;align-items:center;justify-content:center',
    'animation:fadeIn .2s ease',
  ].join(';');

  const TAGS = ['green', 'amber', 'purple', 'teal'];
  overlay.innerHTML = `
    <div style="background:var(--bg);border:1px solid var(--border);border-radius:12px;
                padding:24px;max-width:520px;width:92%;box-shadow:0 20px 60px rgba(0,0,0,.5)">
      <div style="font-size:10px;letter-spacing:.08em;text-transform:uppercase;
                  color:var(--muted);margin-bottom:4px">Руна · Серийный предприниматель</div>
      <div style="font-size:15px;font-weight:700;color:var(--text);margin-bottom:4px">
        🚀 Открыта вторая специализация
      </div>
      <div style="font-size:11px;color:var(--muted);margin-bottom:18px;line-height:1.5">
        15 портфолио — ты построил диверсифицированное агентство.<br>
        Выбери второе направление: его бонусы будут работать параллельно с основным.
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        ${options.map(([id, s], i) => `
          <div onclick="applySecondSpec('${id}')"
               style="cursor:pointer;padding:14px;border:1px solid var(--border);border-radius:8px;
                      transition:.15s;background:rgba(255,255,255,.02)"
               onmouseover="this.style.borderColor='var(--teal)';this.style.background='rgba(45,212,191,.06)'"
               onmouseout="this.style.borderColor='var(--border)';this.style.background='rgba(255,255,255,.02)'">
            <div style="font-size:20px;margin-bottom:5px">${s.icon}</div>
            <div style="font-size:12px;font-weight:700;color:var(--text)">${s.name}</div>
            <div style="font-size:10px;color:var(--muted);margin-top:3px;line-height:1.4">${s.desc}</div>
            <div style="margin-top:10px;display:flex;flex-direction:column;gap:3px">
              <span style="font-size:9px;font-weight:600;padding:2px 7px;border-radius:4px;width:fit-content;
                           background:rgba(63,185,80,.1);color:var(--green);border:1px solid rgba(63,185,80,.2)">${s.bonusLabel}</span>
              <span style="font-size:9px;font-weight:600;padding:2px 7px;border-radius:4px;width:fit-content;
                           background:rgba(45,212,191,.1);color:var(--teal);border:1px solid rgba(45,212,191,.2)">${s.passiveLabel}</span>
            </div>
          </div>`).join('')}
      </div>
    </div>`;

  document.body.appendChild(overlay);
  if (typeof addLog === 'function') addLog('🚀 Серийный предприниматель: доступен выбор второй специализации', 'green');
}

// Применяет выбранную вторую специализацию. Вызывается из onclick оверлея.
function applySecondSpec(specId) {
  document.getElementById('second-spec-overlay')?.remove();
  if (typeof G === 'undefined' || typeof SPECS === 'undefined') return;
  G.secondSpec = specId;
  const s = SPECS[specId];
  if (!s) return;
  if (typeof addLog === 'function')
    addLog(`🚀 Вторая специализация: ${s.icon} ${s.name} — ${s.bonusLabel}`, 'green');
  if (typeof notify === 'function')
    notify(`🚀 ${s.icon} ${s.name} — вторая специализация активна!`, 'success');
  if (typeof _emitRender === 'function') _emitRender();
}
