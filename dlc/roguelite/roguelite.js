// ══════════════════════════════════════════════════════
//  DLC: Rogue-lite
//  Загружается ТОЛЬКО если активирован в меню режимов.
//  Не импортируется из index.html напрямую.
//
//  Все механики подключаются через EventBus — engine.js
//  ничего не знает об этом файле.
//
//  Статус: stub / WIP — см. backlog/05_roguelite.md
// ══════════════════════════════════════════════════════

(function () {
  'use strict';

  const ID = 'roguelite';

  // Проверяем что EventBus доступен (загружен engine.js)
  if (typeof EventBus === 'undefined') {
    console.error(`[DLC:${ID}] EventBus не найден — DLC не активирован`);
    return;
  }

  // ── Состояние DLC ─────────────────────────────────────
  const RL = {
    runCount:    0,   // сколько ранов завершено
    perks:       [],  // активные перки этого рана
    metaPerks:   [],  // перки между ранами (persist)
    eventQueue:  [],  // очередь процедурных событий
  };

  // ── Реестр перков (заглушки для будущей реализации) ──
  const PERK_POOL = [
    { id:'cash_start',   name:'Кэш-инъекция',    desc:'+200K стартового капитала',          icon:'💰' },
    { id:'rep_boost',    name:'Репутация',        desc:'+15 к начальной репутации',          icon:'⭐' },
    { id:'scout_free',   name:'Бесплатный скаут', desc:'Первый скаутинг стоит 0 дней',       icon:'🔍' },
    { id:'fast_hire',    name:'Быстрый найм',     desc:'Найм стоит 1 день весь ран',         icon:'⚡' },
    { id:'nps_shield',   name:'NPS-щит',          desc:'Клиенты не уходят при NPS ≥ 30',     icon:'🛡' },
    { id:'double_t1',    name:'Дабл-Т1',          desc:'+1 слот для T1-проектов',            icon:'📁' },
    { id:'overhead_cut', name:'Оптимизация',      desc:'Overhead −30% весь ран',             icon:'✂️' },
  ];

  // ── Хуки EventBus ─────────────────────────────────────

  // Старт новой игры — применяем перки рана
  EventBus.on('game_started', () => {
    console.log(`[DLC:${ID}] game_started — ран #${RL.runCount + 1}`);
    _applyRunPerks();
    _injectRogueliteUI();
  });

  // Конец каждого месяца — шанс процедурного события
  EventBus.on('month_end', () => {
    _tryProcEvent();
  });

  // Завершение проекта — накапливаем «осколки» для метапрогресса
  EventBus.on('project_completed', ({ project }) => {
    // TODO: начислять RL.shards в зависимости от tier/rarity проекта
    console.log(`[DLC:${ID}] project_completed:`, project?.id);
  });

  // Конец игры — показываем экран выбора перков для следующего рана
  EventBus.on('game_ended', ({ won }) => {
    RL.runCount++;
    console.log(`[DLC:${ID}] game_ended (won=${won}), runs=${RL.runCount}`);
    // TODO: показать _showPerkSelectScreen() перед экраном результатов
  });

  // ── Внутренние функции (заглушки) ─────────────────────

  function _applyRunPerks() {
    if (!RL.perks.length) return;
    // TODO: применить перки к G / SCENARIO в зависимости от id
    RL.perks.forEach(p => {
      console.log(`[DLC:${ID}] applying perk: ${p.id}`);
      // Пример реализации cash_start:
      // if (p.id === 'cash_start' && typeof G !== 'undefined') G.money += 200000;
    });
  }

  function _tryProcEvent() {
    // TODO: генерировать процедурные события из RL.eventQueue
    // Шанс ~20% каждый месяц при активном DLC
  }

  function _injectRogueliteUI() {
    // TODO: добавить RL-индикатор (счётчик ранов, активные перки) в game-header
    // Без изменения engine.js — только DOM-манипуляции
  }

  function _showPerkSelectScreen() {
    // TODO: модальное окно с выбором 3 случайных перков из PERK_POOL
    // Выбранный перк добавляется в RL.metaPerks и сохраняется в localStorage
  }

  // ── Регистрация в глобальном пространстве (для дебага) ─
  window._RL = RL;

  console.log(`[DLC:${ID}] v0.1 активирован — хуки зарегистрированы, механики в разработке`);

})();
