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

  // ── Этапы рана (дефолтные, общие для всех сценариев) ──
  // monthEnd — месяц, на котором этап завершается (т.е. на нём
  // выскакивает milestone-модал перехода к следующему). У эндгейма
  // null — финальный этап, milestone не нужен.
  //
  // С v3.15 этапы и бонусы можно полностью переопределить в данных
  // сценария — SCENARIO.runMap = { stages: [...], bonuses: [...] }.
  // Если поле не задано — берём встроенные дефолты (back-compat).
  const DEFAULT_STAGES = [
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

  // ── Пул бонусов (дефолтный) ───────────────────────────
  // Бонусы — чистые данные: effects[] описаны в DSL scenario-loader
  // (gAdd / gSet / overheadBump / money / rep / fatigue), интерпретатор
  // ScenarioLoader.applyOps выполняет их. Никакого DOM или ядра.
  // Сценарий может переопределить весь массив через SCENARIO.runMap.bonuses.
  const DEFAULT_BONUSES = [
    { id: 'cash',         icon: '💸', name: 'Дивиденды',
      desc: 'Разовая выплата +250 000 ₽',
      effects: [{ money: 250000 }],
      log:  '💸 Дивиденды: +250 000 ₽' },
    { id: 'rep',          icon: '⭐', name: 'Узнаваемость',
      desc: '+5 репутации',
      effects: [{ rep: 5 }],
      log:  '⭐ Узнаваемость: +5 реп.' },
    { id: 'payout',       icon: '📈', name: 'Премиум-позиционирование',
      desc: '+5% к выплатам всех проектов',
      effects: [{ gAdd: { perkPayoutMult: 0.05 } }],
      log:  '📈 Премиум-позиционирование: выплаты +5%' },
    { id: 'overhead',     icon: '🛠', name: 'Оптимизация процессов',
      desc: '−10% overhead до конца партии',
      effects: [{ overheadBump: -0.10 }],
      log:  '🛠 Оптимизация: overhead −10%' },
    { id: 'cases',        icon: '🏆', name: 'Резонансный кейс',
      desc: '+5 к качеству от кейсов навсегда',
      effects: [{ gAdd: { caseQBonus: 5 } }],
      log:  '🏆 Резонансный кейс: +5 Q' },
    { id: 'scout',        icon: '🔍', name: 'Связи с заказчиками',
      desc: '+1 лид при скаутинге',
      effects: [{ gAdd: { caseScoutBonus: 1 } }],
      log:  '🔍 Связи: +1 лид' },
    { id: 'rep_recovery', icon: '💼', name: 'PR-агентство',
      desc: '+1 восстановление репутации/мес',
      effects: [{ gAdd: { caseRepBonus: 1 } }],
      log:  '💼 PR-агентство: +1 реп/мес' },
    { id: 'speed',        icon: '🚀', name: 'Внутренний акселератор',
      desc: '+5% скорости команды',
      effects: [{ gAdd: { speedUpgrades: 0.05 } }],
      log:  '🚀 Акселератор: скорость +5%' },
    { id: 'prepay',       icon: '💳', name: 'Юридический бренд',
      desc: '+15% к шансу предоплаты',
      effects: [{ gAdd: { perkPrepayBonus: 0.15 } }],
      log:  '💳 Юр-бренд: предоплата +15%' },
    { id: 'penalty_shield', icon: '🛡', name: 'Авторитет на рынке',
      desc: 'Просрочка бьёт по репутации −50%',
      effects: [{ gSet: { perkPenaltyShield: true } }],
      log:  '🛡 Авторитет: штраф просрочки −50%' },
    { id: 'fatigue',      icon: '🌿', name: 'Велнес-программа',
      desc: '−15 усталости команды, +5% к восст.',
      effects: [{ fatigue: -15 }, { gAdd: { perkRecoveryBonus: 0.05 } }],
      log:  '🌿 Велнес: усталость −15, восст. +5%' },
    { id: 'portfolio',    icon: '📚', name: 'PR-кампания',
      desc: '+10 баллов портфолио',
      effects: [{ gAdd: { portfolio: 10 } }],
      log:  '📚 PR-кампания: +10 портфолио' },
  ];

  // ── Чтение из сценария (Тип C) с фолбэком ─────────────
  // Функциями, а не константами — данные SCENARIO загружены до этого
  // модуля, но кастомные runMap могут отсутствовать → фолбэк на дефолт.
  function _getStages() {
    const s = (typeof SCENARIO !== 'undefined') && SCENARIO && SCENARIO.runMap;
    return (s && Array.isArray(s.stages) && s.stages.length >= 2) ? s.stages : DEFAULT_STAGES;
  }
  function _getBonuses() {
    const s = (typeof SCENARIO !== 'undefined') && SCENARIO && SCENARIO.runMap;
    return (s && Array.isArray(s.bonuses) && s.bonuses.length >= 3) ? s.bonuses : DEFAULT_BONUSES;
  }

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
    const stages = _getStages();
    const st = _ensureState(G);
    const cur  = stages[st.stageIdx];
    const next = stages[st.stageIdx + 1];
    if (!cur || !next) return;            // финальный этап, не двигаемся дальше
    if ((G.month || 0) < cur.monthEnd) return;
    // Защита от двойного срабатывания одного и того же milestone
    if ((st.milestonesShown || []).includes(next.id)) return;
    st.milestonesShown = (st.milestonesShown || []).concat(next.id);
    _showMilestoneModal(next, cur);
  }

  // ── Применение эффектов бонуса (DSL-режим + legacy apply) ─
  function _applyBonusEffects(b, g) {
    // Новый путь (v3.15): effects[] через DSL ScenarioLoader.applyOps.
    if (b && Array.isArray(b.effects) && typeof ScenarioLoader !== 'undefined' &&
        ScenarioLoader && typeof ScenarioLoader.applyOps === 'function') {
      ScenarioLoader.applyOps(b.effects, g);
      return;
    }
    // Legacy-путь: inline apply(g) — для совместимости со старыми кастомизациями.
    if (b && typeof b.apply === 'function') {
      b.apply(g);
    }
  }

  // ── Видимость бонуса на этапе (v3.17) ────────────────
  // Бонус может быть универсальным (без stages/exclusiveStages) или
  // привязанным к конкретным этапам через:
  //   stages:          ['bank_corp', 'bank_private'] — только на этих этапах
  //   exclusiveStages: ['bank_private']               — алиас (читается так же)
  // Не привязанные показываются на всех этапах.
  function _bonusFitsStage(b, stageId) {
    const list = b && (b.stages || b.exclusiveStages);
    if (!Array.isArray(list) || !list.length) return true;
    return list.includes(stageId);
  }

  // ── Модал milestone-перехода ─────────────────────────
  function _showMilestoneModal(nextStage, prevStage) {
    const bonusesAll = _getBonuses();
    // Сначала отфильтруем бонусы, подходящие текущему этапу:
    // универсальные + те, что объявили stages/exclusiveStages для nextStage.id.
    const stageScoped = bonusesAll.filter(b => _bonusFitsStage(b, nextStage.id));
    // 3 случайных бонуса из ОТКРЫТОЙ части пула.
    // Запираемые (prepay/penalty_shield/fatigue/portfolio в дефолтном пуле,
    // в сценарных пулах — свои) появляются по мере мета-прогресса
    // (см. src/meta.js). Без RogueMeta — все открыты (back-compat).
    const meta = (typeof window !== 'undefined') ? window.RogueMeta : null;
    let unlocked = stageScoped.filter(b =>
      !meta || typeof meta.isBonusUnlocked !== 'function' || meta.isBonusUnlocked(b.id)
    );
    if (unlocked.length < 3) {
      // Фолбэк 1: добираем этапно-подходящие запертые
      // (на случай, если они ещё не открыты мета-прогрессом).
      for (const b of stageScoped) {
        if (unlocked.length >= 3) break;
        if (!unlocked.includes(b)) unlocked.push(b);
      }
    }
    if (unlocked.length < 3) {
      // Фолбэк 2: добираем универсальными (без stages/exclusiveStages)
      // из общего пула — даже если на этап мало контента, игрок всегда
      // получает 3 варианта. Этап-эксклюзивы НЕ участвуют в этом проходе.
      for (const b of bonusesAll) {
        if (unlocked.length >= 3) break;
        const isUniversal = !b.stages && !b.exclusiveStages;
        if (isUniversal && !unlocked.includes(b)) unlocked.push(b);
      }
    }
    const pool = unlocked.slice().sort(() => Math.random() - 0.5).slice(0, 3);
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
          try { _applyBonusEffects(b, g); } catch (e) { console.warn('[runmap] bonus apply', e); }
          // Продвигаем этап
          const st = _ensureState(g);
          const stages = _getStages();
          st.stageIdx = Math.min(stages.length - 1, st.stageIdx + 1);
          st.choicesTaken = (st.choicesTaken || []).concat({ stage: nextStage.id, bonus: b.id });
          if (typeof addLog === 'function') {
            addLog(`${nextStage.icon} Этап «${nextStage.name}»: бонус — ${b.log || b.name}`, 'purple');
          }
          if (typeof notify === 'function') notify(`${nextStage.icon} ${nextStage.name}: ${b.name}`, 'success');
          EventBus.emit('render');
          // v2.2.3: Победа = достижение финального этапа Run Map.
          // Задержка 600мс — даём модалу закрыться до перехода на экран результатов.
          const isFinalStage = st.stageIdx >= stages.length - 1;
          if (isFinalStage && !g._wonAlreadyCelebrated) {
            g._wonAlreadyCelebrated = true;
            if (typeof g._endGameFired !== 'undefined') g._endGameFired = true;
            setTimeout(() => {
              if (typeof EventBus !== 'undefined') EventBus.emit('end_game', { won: true });
            }, 600);
          }
        },
      })),
    }});
  }

  // ── UI: пилюля этапа в game-header ───────────────────
  function _injectPill() {
    if (typeof G === 'undefined' || !G || !G.runMap) return;
    const header = document.querySelector('.game-header .game-logo');
    if (!header) return;
    const stages = _getStages();
    const stage = stages[G.runMap.stageIdx] || stages[0];

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
    pill.title            = `Этап ${G.runMap.stageIdx + 1}/${stages.length}: ${stage.name}. ${stage.sub}`;
    pill.textContent      = `${stage.icon} ${stage.name}`;
  }

  EventBus.on('render', _injectPill);
  try { _injectPill(); } catch (e) {}

  // ── Публичный API ────────────────────────────────────
  window.RunMap = {
    _tick:        _tickRunMap,
    getStages:    () => _getStages().slice(),
    getBonuses:   () => _getBonuses().slice(),
    // v3.17: только бонусы, подходящие конкретному этапу
    // (универсальные + те, у кого stages/exclusiveStages содержит stageId).
    getBonusesForStage: (stageId) => _getBonuses().filter(b => _bonusFitsStage(b, stageId)),
    bonusFitsStage:     _bonusFitsStage,
    getDefaultStages:   () => DEFAULT_STAGES.slice(),
    getDefaultBonuses:  () => DEFAULT_BONUSES.slice(),
    getState:     () => (typeof G !== 'undefined' && G ? G.runMap || null : null),
    getCurrent:   () => {
      const stages = _getStages();
      if (typeof G === 'undefined' || !G || !G.runMap) return stages[0];
      return stages[G.runMap.stageIdx] || stages[0];
    },
    // Применение эффектов конкретного бонуса (для дебага / тестов)
    applyBonusEffects: _applyBonusEffects,
    // Для дебага/тестов: форсированно открыть milestone-модал
    forceMilestone: () => {
      const st = _ensureState(G);
      const stages = _getStages();
      const cur  = stages[st.stageIdx];
      const next = stages[st.stageIdx + 1];
      if (!cur || !next) return false;
      _showMilestoneModal(next, cur);
      return true;
    },
  };

  // Сообщаем какой источник этапов/бонусов
  const _src = (typeof SCENARIO !== 'undefined' && SCENARIO && SCENARIO.runMap)
    ? `сценарий «${SCENARIO.id || '?'}»` : 'дефолт';
  // v3.17: показываем сколько из пула — этап-эксклюзивы
  const _bonuses = _getBonuses();
  const _exclusives = _bonuses.filter(b => b.stages || b.exclusiveStages).length;
  console.log('[runmap] v0.3 активирован: источник — ' + _src +
    ', ' + _getStages().length + ' этапов, пул из ' + _bonuses.length + ' бонусов' +
    (_exclusives ? ' (из них этап-эксклюзивов: ' + _exclusives + ')' : ''));
})();
