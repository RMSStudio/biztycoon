// ══════════════════════════════════════════════════════
//  Карта рана (Run Map) — реализация roguelite-механики
//
//  Активируется ТОЛЬКО когда включён DLC «Rogue-lite»
//  (см. правило в src/runes.js / src/storyarcs.js).
//
//  Делит партию на 5 этапов с понятными иконками:
//    🏚 Гараж → 🛠 Закрепление → 📈 Рост → 🏛 Зрелость → 👑 Эндгейм
//  На границе каждого этапа (кроме первого старта и финального)
//  выскакивает milestone-модал с выбором 1 из 3 случайных бонусов
//  из общего пула BONUSES. Бонусы — пермы на остаток партии,
//  применяются через те же G-каналы, что и руны/перки/кейсы.
//
//  Принцип: ядро не модифицируется. Цепляемся обёрткой
//  advanceMonth, эмитим существующий 'show_event' (тот же модал
//  #event-modal). Пилюля прогресса этапа вставляется через
//  подписку на 'render' (как у руны).
//
//  Стейт: G.runMap = { stageIdx, monthsInStage, choicesTaken[] }
//  переносится через _restore без правок saves.js.
//
//  Бэклог: п.13 «Roguelite-механики», третий шаг (Run Map).
//  Story Arcs (v3.11) и стартовые руны (v3.10) — предыдущие шаги.
// ══════════════════════════════════════════════════════

(function () {
  'use strict';

  // ─── Hard kill-switch ─────────────────────────────────
  const RUN_MAP_ENABLED = true;
  if (!RUN_MAP_ENABLED) return;

  // ─── Гейт по DLC «Rogue-lite» ─────────────────────────
  if (!_rogueliteEnabled()) return;

  if (typeof EventBus === 'undefined') {
    console.error('[runmap] EventBus не найден — модуль не активирован');
    return;
  }
  if (window.__RM_LOADED) return;
  window.__RM_LOADED = true;

  function _rogueliteEnabled() {
    try {
      const raw = (typeof localStorage !== 'undefined' && localStorage.getItem('bt_enabled_dlcs_v1')) || '[]';
      const arr = JSON.parse(raw);
      return Array.isArray(arr) && arr.includes('roguelite');
    } catch (e) { return false; }
  }

  // ── Этапы рана ────────────────────────────────────────
  // monthEnd — месяц, на котором этап завершается (т.е. на нём
  // выскакивает milestone-модал перехода к следующему). У эндгейма
  // null — финальный этап, milestone не нужен.
  const STAGES = [
    { id: 'startup',  name: 'Гараж',        icon: '🏚', color: '#94a3b8', monthEnd:  6,
      sub: 'Первые сделки, поиск стиля. Доказываешь, что вообще можешь.' },
    { id: 'foothold', name: 'Закрепление',  icon: '🛠', color: '#22d3ee', monthEnd: 14,
      sub: 'Появилась команда и постоянные клиенты. Пора систематизировать.' },
    { id: 'growth',   name: 'Рост',         icon: '📈', color: '#a78bfa', monthEnd: 22,
      sub: 'Заходят тиры посерьёзнее. Без процессов рассыпется — пора инвестировать.' },
    { id: 'maturity', name: 'Зрелость',     icon: '🏛', color: '#f59e0b', monthEnd: 30,
      sub: 'Бренд узнают. Эпики берут не «на спор», а с расчётом.' },
    { id: 'endgame',  name: 'Эндгейм',      icon: '👑', color: '#facc15', monthEnd: null,
      sub: 'Финальный рывок: лучшие проекты, выжимаем максимум.' },
  ];

  // ── Пул бонусов ───────────────────────────────────────
  // Каждый бонус — applay(G) фунция + текст. Используются те же
  // G-каналы, что и в кейсах/рунах/перках — engine читает их без
  // дополнительных правок.
  const BONUSES = [
    { id: 'cash',         icon: '💸', name: 'Дивиденды',
      desc: 'Разовая выплата +250 000 ₽',
      apply: g => { g.money = (g.money || 0) + 250000; },
      log:  '💸 Дивиденды: +250 000 ₽' },
    { id: 'rep',          icon: '⭐', name: 'Узнаваемость',
      desc: '+5 репутации',
      apply: g => { g.reputation = Math.min(100, (g.reputation || 0) + 5); },
      log:  '⭐ Узнаваемость: +5 реп.' },
    { id: 'payout',       icon: '📈', name: 'Премиум-позиционирование',
      desc: '+5% к выплатам всех проектов',
      apply: g => { g.perkPayoutMult = Math.round(((g.perkPayoutMult || 0) + 0.05) * 100) / 100; },
      log:  '📈 Премиум-позиционирование: выплаты +5%' },
    { id: 'overhead',     icon: '🛠', name: 'Оптимизация процессов',
      desc: '−10% overhead до конца партии',
      apply: g => {
        const base = (typeof SCENARIO !== 'undefined' && SCENARIO.settings && SCENARIO.settings.overhead) || 0;
        g.runeOverheadBump = (g.runeOverheadBump || 0) - Math.round(base * 0.10);
      },
      log:  '🛠 Оптимизация: overhead −10%' },
    { id: 'cases',        icon: '🏆', name: 'Резонансный кейс',
      desc: '+5 к качеству от кейсов навсегда',
      apply: g => { g.caseQBonus = (g.caseQBonus || 0) + 5; },
      log:  '🏆 Резонансный кейс: +5 Q' },
    { id: 'scout',        icon: '🔍', name: 'Связи с заказчиками',
      desc: '+1 лид при скаутинге',
      apply: g => { g.caseScoutBonus = (g.caseScoutBonus || 0) + 1; },
      log:  '🔍 Связи: +1 лид' },
    { id: 'rep_recovery', icon: '💼', name: 'PR-агентство',
      desc: '+1 восстановление репутации/мес',
      apply: g => { g.caseRepBonus = (g.caseRepBonus || 0) + 1; },
      log:  '💼 PR-агентство: +1 реп/мес' },
    { id: 'speed',        icon: '🚀', name: 'Внутренний акселератор',
      desc: '+5% скорости команды',
      apply: g => { g.speedUpgrades = Math.round(((g.speedUpgrades || 0) + 0.05) * 100) / 100; },
      log:  '🚀 Акселератор: скорость +5%' },
    { id: 'prepay',       icon: '💳', name: 'Юридический бренд',
      desc: '+15% к шансу предоплаты',
      apply: g => { g.perkPrepayBonus = Math.round(((g.perkPrepayBonus || 0) + 0.15) * 100) / 100; },
      log:  '💳 Юр-бренд: предоплата +15%' },
    { id: 'penalty_shield', icon: '🛡', name: 'Авторитет на рынке',
      desc: 'Просрочка бьёт по репутации −50%',
      apply: g => { g.perkPenaltyShield = true; },
      log:  '🛡 Авторитет: штраф просрочки −50%' },
    { id: 'fatigue',      icon: '🌿', name: 'Велнес-программа',
      desc: '−15 усталости команды, +5% к восст.',
      apply: g => {
        g.teamFatigue = Math.max(0, (g.teamFatigue || 0) - 15);
        g.perkRecoveryBonus = Math.round(((g.perkRecoveryBonus || 0) + 0.05) * 100) / 100;
      },
      log:  '🌿 Велнес: усталость −15, восст. +5%' },
    { id: 'portfolio',    icon: '📚', name: 'PR-кампания',
      desc: '+10 баллов портфолио',
      apply: g => { g.portfolio = (g.portfolio || 0) + 10; },
      log:  '📚 PR-кампания: +10 портфолио' },
  ];

  // ── Обёртка advanceMonth ─────────────────────────────
  if (typeof window.advanceMonth === 'function' && !window.advanceMonth.__rmWrapped) {
    const _origAdvance = window.advanceMonth;
    window.advanceMonth = function () {
      const r = _origAdvance.apply(this, arguments);
      try { _tickRunMap(); } catch (e) { console.warn('[runmap] tick error:', e); }
      return r;
    };
    window.advanceMonth.__rmWrapped = true;
  }

  // ── Стейт ────────────────────────────────────────────
  function _ensureState(g) {
    g.runMap = g.runMap || { stageIdx: 0, choicesTaken: [], milestonesShown: [] };
    return g.runMap;
  }

  // ── Тик карты ────────────────────────────────────────
  function _tickRunMap() {
    if (typeof G === 'undefined' || !G) return;
    const st = _ensureState(G);
    const cur  = STAGES[st.stageIdx];
    const next = STAGES[st.stageIdx + 1];
    if (!cur || !next) return;            // финальный этап, не двигаемся дальше
    if ((G.month || 0) < cur.monthEnd) return;
    // Защита от двойного срабатывания одного и того же milestone
    if ((st.milestonesShown || []).includes(next.id)) return;
    st.milestonesShown = (st.milestonesShown || []).concat(next.id);
    _showMilestoneModal(next, cur);
  }

  // ── Модал milestone-перехода ─────────────────────────
  function _showMilestoneModal(nextStage, prevStage) {
    // 3 случайных бонуса из пула
    const pool = BONUSES.slice().sort(() => Math.random() - 0.5).slice(0, 3);
    EventBus.emit('show_event', { ev: {
      id:       'runmap_' + nextStage.id,
      _runmap:  true,
      icon:     nextStage.icon,
      title:    `Новый этап рана: ${nextStage.name}`,
      body:     `${prevStage.icon} ${prevStage.name} пройден. ${nextStage.sub} Выбери один бонус — он останется до конца партии.`,
      choices:  pool.map(b => ({
        text: `${b.icon} ${b.name}`,
        desc: b.desc,
        fn:   (g) => {
          try { b.apply(g); } catch (e) { console.warn('[runmap] bonus apply', e); }
          // Продвигаем этап
          const st = _ensureState(g);
          st.stageIdx = Math.min(STAGES.length - 1, st.stageIdx + 1);
          st.choicesTaken = (st.choicesTaken || []).concat({ stage: nextStage.id, bonus: b.id });
          if (typeof addLog === 'function') {
            addLog(`${nextStage.icon} Этап «${nextStage.name}»: бонус — ${b.log}`, 'purple');
          }
          if (typeof notify === 'function') notify(`${nextStage.icon} ${nextStage.name}: ${b.name}`, 'success');
          EventBus.emit('render');
        },
      })),
    }});
  }

  // ── UI: пилюля этапа в game-header ───────────────────
  function _injectPill() {
    if (typeof G === 'undefined' || !G || !G.runMap) return;
    const header = document.querySelector('.game-header .game-logo');
    if (!header) return;
    const stage = STAGES[G.runMap.stageIdx] || STAGES[0];

    let pill = document.getElementById('runmap-pill');
    if (!pill) {
      pill = document.createElement('span');
      pill.id = 'runmap-pill';
      pill.style.cssText = 'margin-left:8px;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;letter-spacing:.3px;vertical-align:middle';
      header.appendChild(pill);
    }
    pill.style.background = `${stage.color}22`;
    pill.style.color      = stage.color;
    pill.style.border     = `1px solid ${stage.color}55`;
    pill.title            = `Этап ${G.runMap.stageIdx + 1}/${STAGES.length}: ${stage.name}. ${stage.sub}`;
    pill.textContent      = `${stage.icon} ${stage.name}`;
  }

  EventBus.on('render', _injectPill);
  try { _injectPill(); } catch (e) {}

  // ── Публичный API ────────────────────────────────────
  window.RunMap = {
    _tick:        _tickRunMap,
    getStages:    () => STAGES.slice(),
    getBonuses:   () => BONUSES.slice(),
    getState:     () => (typeof G !== 'undefined' && G ? G.runMap || null : null),
    getCurrent:   () => {
      if (typeof G === 'undefined' || !G || !G.runMap) return STAGES[0];
      return STAGES[G.runMap.stageIdx] || STAGES[0];
    },
    // Для дебага/тестов: форсированно открыть milestone-модал
    forceMilestone: () => {
      const st = _ensureState(G);
      const cur  = STAGES[st.stageIdx];
      const next = STAGES[st.stageIdx + 1];
      if (!cur || !next) return false;
      _showMilestoneModal(next, cur);
      return true;
    },
  };

  console.log('[runmap] v0.1 активирован: ' + STAGES.length + ' этапов, пул из ' + BONUSES.length + ' бонусов');
})();
