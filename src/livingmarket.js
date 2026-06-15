'use strict';
// ══════════════════════════════════════════════════════════════════════
//   src/livingmarket.js — Живой рынок: бесконечная прогрессия
//   v0.1 (2026-06-15) · Тип A · Фаза A первый шаг (см. design_living_market.md)
//
//   Опциональный модуль БАЗОВОГО геймплея, актуальный для всех версий.
//   Не DLC — управляется обычным const-флагом, как outsource (v3.8.1).
//   Активен по умолчанию; чтобы выключить — поменять LIVING_MARKET_ENABLED
//   на false или закомментировать строку `<script src="src/livingmarket.js">`
//   в index.html и `read('src/livingmarket.js')` в build/build.js.
//
//   Что делает:
//   1. Снимает классический win-экран — выставляет SCENARIO.settings.
//      winCondition = Infinity в обёртке startGame.  Engine читает это
//      значение в advanceMonth, поэтому никаких правок ядра не нужно.
//      Оригинальное значение сохраняется и используется как порог для
//      майлстоуна «Первые N ₽ на счету».
//   2. Вводит лестницу стадий компании (Гараж → Студия → Агентство →
//      Сеть → Холдинг → Империя) с композитными гейтами.  В этом шаге
//      реализованы 1–3 (Гараж/Студия/Агентство) — гейты считаются по
//      завершённым проектам, штату, репутации, накопленной выручке.
//      Стадии 4–6 объявлены, но требуют рейтинга/наград/поглощений —
//      это придёт с модулем конкурентов (Фаза C+ из дизайн-дока).
//   3. Декларативный фреймворк майлстоунов: список { id, name, icon,
//      desc, cond(G,helpers), once } проверяется в обёртке advanceMonth,
//      сработавшие пишутся в G.living.journal и эмитят сигнал
//      `milestone_reached` через EventBus.  Сигнал использует existing
//      `notify` UI (тост), журнал виден в модале «Журнал».
//   4. Пилюля стадии в .game-header .game-logo с прогресс-индикатором
//      ближайшего гейта (например «2/3 сдач · 1/2 штат · …»).
//
//   Чего НЕ делает (запланировано на следующие шаги):
//   • Годовые итоги M12/M24/… — отдельная итерация (этот шаг — каркас).
//   • Живые конкуренты / рейтинг / награды — Фаза C дизайн-дока.
//   • Древо 2.0 (★XP, 5 веток) — Фаза B.
//   • Активы (офисы, саббренды) и M&A — Фаза E.
//   • Перенос milestones в данные сценария — пока встроенный пул.
//
//   Godot-portability: модуль DOM-free снаружи `_renderXxx`-функций;
//   стейт мутирует только `G`, все ре-рендеры через EventBus.emit.
//   Engine ничего не знает о модуле.
// ══════════════════════════════════════════════════════════════════════

(function () {
  const LIVING_MARKET_ENABLED = true;
  if (!LIVING_MARKET_ENABLED) return;

  const VERSION = 'v0.5';

  // ── Стадии компании ────────────────────────────────────────────────
  // Гейт — функция G → { ok: boolean, progress: [{ label, cur, max }] }.
  // progress нужен для пилюли «следующий гейт N/M ✓»; даже выполненные
  // условия остаются в массиве (визуально перечёркнуты) — это явно
  // показывает игроку, какие именно требования у стадии.
  //
  // requiresMarket: true — гейт нельзя выполнить без модуля рынка
  // (награды/рейтинг/поглощения), стадия не достигается в этом шаге.
  // Подпись в UI: «Откроется с модулем «Живой рынок» (фаза C)».

  const STAGES = [
    {
      id: 'garage',
      idx: 0,
      name: 'Гараж',
      icon: '🏚',
      color: '#94a3b8',
      sub: 'Старт. Базовый цикл, T1–T2, никаких требований.',
      gate: () => ({ ok: true, progress: [] }),
      unlocks: 'базовый цикл, T1–T2 — стартовое состояние',
    },
    {
      id: 'studio',
      idx: 1,
      name: 'Студия',
      icon: '🛠',
      color: '#22d3ee',
      sub: '3 сдачи · штат 2 · накопленная выручка 2M ₽',
      gate: (g) => {
        const dels = _countDeliveries(g);
        const staff = _countStaff(g);
        const rev = _cumulativeRevenue(g);
        return _composite([
          { label: 'сдач', cur: dels,  max: 3 },
          { label: 'штат', cur: staff, max: 2 },
          { label: 'выручка', cur: rev, max: 2000000, fmt: 'money' },
        ]);
      },
      unlocks: 'древо прокачки, кейсы, T3-сделки',
    },
    {
      id: 'agency',
      idx: 2,
      name: 'Агентство',
      icon: '📈',
      color: '#a78bfa',
      sub: '10 сдач · штат 5 · репутация 75 · накопл. выручка 15M ₽',
      gate: (g) => {
        const dels = _countDeliveries(g);
        const staff = _countStaff(g);
        const rep = (g.reputation || 0);
        const rev = _cumulativeRevenue(g);
        return _composite([
          { label: 'сдач', cur: dels,  max: 10 },
          { label: 'штат', cur: staff, max: 5 },
          { label: 'реп.', cur: rep,   max: 75 },
          { label: 'выручка', cur: rev, max: 15000000, fmt: 'money' },
        ]);
      },
      unlocks: 'менеджер-слоты, рейтинг рынка, награды, T4-сделки',
    },
    // Стадии 4–6: гейты требуют живого рынка (награды/рейтинг/поглощения).
    // В этом шаге не достижимы. Декларируем заранее, чтобы UI показывал
    // полную лестницу и игрок видел, куда движется прогрессия.
    {
      id: 'network',
      idx: 3,
      name: 'Сеть',
      icon: '🌐',
      color: '#f59e0b',
      sub: '25 сдач · штат 10 · награда года ИЛИ топ-3 рейтинга · 60M ₽',
      gate: () => ({ ok: false, progress: [{ label: 'требуется модуль «Живой рынок»', cur: 0, max: 1, locked: true }] }),
      unlocks: 'второй офис (+capacity), хантинг у конкурентов, T5-сделки',
      requiresMarket: true,
    },
    {
      id: 'holding',
      idx: 4,
      name: 'Холдинг',
      icon: '🏛',
      color: '#facc15',
      sub: '50 сдач · штат 18 · №1 рейтинга ≥3 мес · 200M ₽',
      gate: () => ({ ok: false, progress: [{ label: 'требуется модуль «Живой рынок»', cur: 0, max: 1, locked: true }] }),
      unlocks: 'саббренды (параллельные команды), поглощение конкурентов, T6',
      requiresMarket: true,
    },
    {
      id: 'empire',
      idx: 5,
      name: 'Империя',
      icon: '👑',
      color: '#fde047',
      sub: '100 сдач · поглощён ≥1 конкурент · 500M ₽',
      gate: () => ({ ok: false, progress: [{ label: 'требуется модуль «Живой рынок»', cur: 0, max: 1, locked: true }] }),
      unlocks: 'T7, престиж-цели, режим «легаси»',
      requiresMarket: true,
    },
  ];

  // ── Древо 2.0 (Фаза B, шаг 1 — v0.2) ────────────────────────────────
  // 5 веток × 5 ярусов = 25 узлов.  Каждая ветка — отдельная тема:
  // Ремесло (Q), Производство (скорость/мощность), Люди (найм/лояльность),
  // Рынок (репутация/лиды/награды), Сделки (деньги/переговоры).  Ярус —
  // ступень сложности, гейтится стадией компании:
  //   tier 1: открыт со старта (стадия 0 — Гараж)
  //   tier 2: открыт со старта
  //   tier 3: со стадии Студия (idx 1)
  //   tier 4: со стадии Агентство (idx 2)
  //   tier 5: со стадии Сеть (idx 3) — недоступно до Фазы C (требует
  //           модуля конкурентов).  Объявлены, но не покупаются.
  //
  // Эффекты применяются к G через те же каналы, что уже используют другие
  // системы (qualityBonus, perkPayoutMult, caseScoutBonus, …).  Это
  // позволяет суммироваться с runMap-бонусами и мета-перками без двойного
  // учёта.  В сейве хранятся только id купленных узлов
  // (G.living.tree2.purchased[]) — эффекты переприменяются при загрузке.
  //
  // ── Эффект-DSL (минимальный) ───────────────────────────────────────
  // Каждый узел задаёт `apply: g => { ... }` — чистую мутацию G.
  // Мутации простые и идемпотентные относительно факта владения; если
  // покупка повторится (что заблокировано purchaseTreeNode), эффект
  // тоже сложится — но purchase API гарантирует одну покупку на узел.
  //
  // ⚠ Маппинг существующих 16 перков из engine.UPGRADES в узлы tree 2.0
  // ОТЛОЖЕН на следующую итерацию.  Сейчас деревья сосуществуют: старая
  // прокачка остаётся доступной, новое древо — дополнительный канал.

  const TREE_BRANCHES = [
    { id: 'craft',      name: 'Ремесло',     icon: '🎯', color: '#22d3ee', sub: 'Качество, ревью, R&D' },
    { id: 'production', name: 'Производство',icon: '⚡', color: '#facc15', sub: 'Скорость, мощность, фазы' },
    { id: 'people',     name: 'Люди',        icon: '🤝', color: '#a78bfa', sub: 'Найм, лояльность, усталость' },
    { id: 'market',     name: 'Рынок',       icon: '📣', color: '#f59e0b', sub: 'Репутация, лиды, награды' },
    { id: 'deals',      name: 'Сделки',      icon: '💼', color: '#86efac', sub: 'Деньги, переговоры' },
  ];

  // Гейт яруса по стадии компании. Доступ — стадия ≥ requiresStage.
  const TIER_STAGE_GATES = [0, 0, 1, 2, 3]; // tier 1..5 → stage idx ≥ N

  // Узлы. Tier 5 в этом шаге не покупаются (нет конкурентов из Фазы C).
  // Цены растут от 50 ★XP (tier 1) до 800 (tier 4); tier 5 — 1200, но
  // заблокированы гейтом стадии «Сеть» (requiresMarket).
  const TREE_NODES = [
    // ── Ремесло ──
    { id: 'craft1', branch: 'craft', tier: 1, icon: '🛠', name: 'Инструментарий',     desc: '+2 к качеству от кейсов навсегда',                cost: 50,
      upgradeAlias: ['tools_q'],
      apply: g => { g.caseQBonus = (g.caseQBonus || 0) + 2; } },
    { id: 'craft2', branch: 'craft', tier: 2, icon: '📐', name: 'Дизайн-система',     desc: 'Штраф просрочки бьёт по репутации в два раза мягче',
      cost: 150,
      upgradeAlias: ['standards_q'],
      apply: g => { g.perkPenaltyShield = true; } },
    { id: 'craft3', branch: 'craft', tier: 3, icon: '🎨', name: 'Арт-директорат',     desc: '+5 к качеству от кейсов навсегда',                cost: 320,
      apply: g => { g.caseQBonus = (g.caseQBonus || 0) + 5; } },
    { id: 'craft4',  branch: 'craft', tier: 4, icon: '🔬', name: 'R&D-лаборатория',    desc: '+10 к качеству от кейсов · потолок качества выше', cost: 700,
      excludes: ['craft4b'],
      apply: g => { g.caseQBonus = (g.caseQBonus || 0) + 10; } },
    { id: 'craft4b', branch: 'craft', tier: 4, icon: '🎨', name: 'Школа арт-директорства',
      desc: '+5 Q · +1 восст. реп/мес · +5 портфолио (широкий путь вместо глубокого R&D)',
      cost: 720, excludes: ['craft4'],
      apply: g => { g.caseQBonus = (g.caseQBonus || 0) + 5; g.caseRepBonus = (g.caseRepBonus || 0) + 1; g.portfolio = (g.portfolio || 0) + 5; } },
    { id: 'craft5', branch: 'craft', tier: 5, icon: '🎓', name: 'Школа студии',       desc: '(Фаза C) Junior растёт в Middle автоматически',   cost: 1200,
      apply: g => { /* эффект подключается в Фазе C — без модуля рынка пока no-op */ } },

    // ── Производство ──
    { id: 'prod1', branch: 'production', tier: 1, icon: '🔁', name: 'Agile',         desc: '+5% к скорости команды',                          cost: 50,
      upgradeAlias: ['agile'],
      apply: g => { g.speedUpgrades = (g.speedUpgrades || 0) + 0.05; } },
    { id: 'prod2', branch: 'production', tier: 2, icon: '📑', name: 'Шаблоны',       desc: '+5% к скорости (стек) · быстрее instant-проекты',cost: 160,
      upgradeAlias: ['scrum'],
      apply: g => { g.speedUpgrades = (g.speedUpgrades || 0) + 0.05; g.perkInstantSpeed = true; } },
    { id: 'prod3', branch: 'production', tier: 3, icon: '🚀', name: 'Автоматизация', desc: '+10% к скорости команды',                         cost: 340,
      apply: g => { g.speedUpgrades = (g.speedUpgrades || 0) + 0.10; } },
    { id: 'prod4',  branch: 'production', tier: 4, icon: '⚙️', name: 'Конвейер',     desc: '+15% к скорости · −1 фазе у epic-цепочек',        cost: 720,
      excludes: ['prod4b'],
      apply: g => { g.speedUpgrades = (g.speedUpgrades || 0) + 0.15; g.perkEpicShortcut = true; } },
    { id: 'prod4b', branch: 'production', tier: 4, icon: '💎', name: 'Бутик-режим',
      desc: '+10 Q · +5% к восстановлению (медленно, но качественно вместо конвейера)', cost: 720,
      excludes: ['prod4'],
      apply: g => { g.caseQBonus = (g.caseQBonus || 0) + 10; g.perkRecoveryBonus = (g.perkRecoveryBonus || 0) + 0.05; } },
    { id: 'prod5', branch: 'production', tier: 5, icon: '🏗', name: 'Параллельные треки', desc: '(Фаза C) +1 слот мощности по умолчанию',   cost: 1200,
      apply: g => { /* подключается в Фазе C */ } },

    // ── Люди ──
    { id: 'peop1', branch: 'people', tier: 1, icon: '💬', name: 'HR-бренд',          desc: 'Скаутинг кандидатов −10% к запрашиваемой зарплате', cost: 60,
      apply: g => { g.scoutSalaryMult = (g.scoutSalaryMult || 1) * 0.9; } },
    { id: 'peop2', branch: 'people', tier: 2, icon: '🌿', name: 'Менторство',        desc: '−10% усталости команды (умножитель)',             cost: 180,
      upgradeAlias: ['mentorship'],
      apply: g => { g.perkFatigueMult = (g.perkFatigueMult || 1) * 0.9; } },
    { id: 'peop3', branch: 'people', tier: 3, icon: '📈', name: 'Опционы',           desc: '+10% к восстановлению от HR-действий',            cost: 350,
      apply: g => { g.perkRecoveryBonus = (g.perkRecoveryBonus || 0) + 0.10; } },
    { id: 'peop4',  branch: 'people', tier: 4, icon: '🪪', name: 'Кадровый резерв',   desc: '+1 кандидат при скаутинге',                       cost: 720,
      excludes: ['peop4b'],
      apply: g => { g.caseScoutBonus = (g.caseScoutBonus || 0) + 1; } },
    { id: 'peop4b', branch: 'people', tier: 4, icon: '🧘', name: 'Корпоративная культура',
      desc: '−20% усталости команды (умножитель × 0.8) — выгорание не строит резервы', cost: 720,
      excludes: ['peop4'],
      apply: g => { g.perkFatigueMult = (g.perkFatigueMult || 1) * 0.8; } },
    { id: 'peop5', branch: 'people', tier: 5, icon: '👑', name: 'Культ компании',    desc: '(Фаза C) Иммунитет к хантингу звёзд',             cost: 1200,
      apply: g => { /* подключается в Фазе C */ } },

    // ── Рынок ──
    { id: 'mark1', branch: 'market', tier: 1, icon: '🌐', name: 'Портфолио-сайт',    desc: '+5 баллов портфолио',                             cost: 50,
      upgradeAlias: ['portfolio_site'],
      apply: g => { g.portfolio = (g.portfolio || 0) + 5; } },
    { id: 'mark2', branch: 'market', tier: 2, icon: '📚', name: 'Кейс-стади',        desc: '+1 восстановление репутации/мес',                 cost: 160,
      upgradeAlias: ['case_studies'],
      apply: g => { g.caseRepBonus = (g.caseRepBonus || 0) + 1; } },
    { id: 'mark3', branch: 'market', tier: 3, icon: '📣', name: 'PR-служба',         desc: '+1 лид при скаутинге · +1 восст. реп/мес',        cost: 340,
      apply: g => { g.caseScoutBonus = (g.caseScoutBonus || 0) + 1; g.caseRepBonus = (g.caseRepBonus || 0) + 1; } },
    { id: 'mark4',  branch: 'market', tier: 4, icon: '🏅', name: 'Премии',            desc: '+10 баллов портфолио · +5 репутации',             cost: 720,
      excludes: ['mark4b'],
      apply: g => { g.portfolio = (g.portfolio || 0) + 10; g.reputation = Math.min(100, (g.reputation || 0) + 5); } },
    { id: 'mark4b', branch: 'market', tier: 4, icon: '📡', name: 'Медиа-присутствие',
      desc: '+2 лида при скаутинге · +5 портфолио (массовая узнаваемость вместо премий)', cost: 720,
      excludes: ['mark4'],
      apply: g => { g.caseScoutBonus = (g.caseScoutBonus || 0) + 2; g.portfolio = (g.portfolio || 0) + 5; } },
    { id: 'mark5', branch: 'market', tier: 5, icon: '🎤', name: 'Лидер мнений',      desc: '(Фаза C) T5+ офферы появляются чаще',             cost: 1200,
      apply: g => { /* подключается в Фазе C */ } },

    // ── Сделки ──
    { id: 'deal1', branch: 'deals', tier: 1, icon: '📝', name: 'Юр-шаблоны',         desc: '+5% к выплатам со всех сделок',                  cost: 60,
      upgradeAlias: ['contracts'],
      apply: g => { g.perkPayoutMult = (g.perkPayoutMult || 0) + 0.05; } },
    { id: 'deal2', branch: 'deals', tier: 2, icon: '🤝', name: 'Переговорщик',       desc: '+10% к шансу предоплаты',                         cost: 170,
      upgradeAlias: ['negotiator'],
      apply: g => { g.perkPrepayBonus = (g.perkPrepayBonus || 0) + 0.10; } },
    { id: 'deal3', branch: 'deals', tier: 3, icon: '💳', name: 'Финдир',             desc: '+10% к выплатам (стек)',                          cost: 350,
      apply: g => { g.perkPayoutMult = (g.perkPayoutMult || 0) + 0.10; } },
    { id: 'deal4',  branch: 'deals', tier: 4, icon: '🛡', name: 'Демпинг-защита',     desc: '+15% к шансу предоплаты (стек) · −штраф просрочки', cost: 720,
      excludes: ['deal4b'],
      apply: g => { g.perkPrepayBonus = (g.perkPrepayBonus || 0) + 0.15; g.perkPenaltyShield = true; } },
    { id: 'deal4b', branch: 'deals', tier: 4, icon: '⚔️', name: 'Финансовый агрессор',
      desc: '+15% к выплатам со всех сделок (стек) — давим маржой вместо защиты',  cost: 720,
      excludes: ['deal4'],
      apply: g => { g.perkPayoutMult = (g.perkPayoutMult || 0) + 0.15; } },
    { id: 'deal5', branch: 'deals', tier: 5, icon: '🏭', name: 'M&A-отдел',          desc: '(Фаза C) Поглощения конкурентов дешевле',          cost: 1200,
      apply: g => { /* подключается в Фазе C */ } },
  ];

  // ── Майлстоуны (встроенный пул v0.1) ────────────────────────────────
  // В следующей итерации переедет в `scenarios/<id>.data.js → milestones[]`.
  // Каждый майлстоун — `cond(g, helpers)` → bool.  Срабатывает один раз,
  // id попадает в `g.living.journal`.  Заходит через обёртку advanceMonth.

  function _milestones(g) {
    const orig = (g.living && g.living.originalWinCondition) || 7500000;
    return [
      // Эшелон «Микро»
      { id: 'first_delivery', icon: '🏁', name: 'Первая сдача',
        desc: 'Завершить первый проект',
        tier: 'micro',
        cond: () => _countDeliveries(g) >= 1 },
      { id: 'reputation_50', icon: '⭐', name: 'Репутация 50',
        desc: 'Поднять репутацию агентства до 50',
        tier: 'micro',
        cond: () => (g.reputation || 0) >= 50 },
      { id: 'first_hire',    icon: '🤝', name: 'Первый найм',
        desc: 'Нанять хотя бы одного сотрудника',
        tier: 'micro',
        cond: () => _countStaff(g) >= 1 },
      { id: 'first_million', icon: '💵', name: 'Первый миллион',
        desc: 'Достичь баланса 1 000 000 ₽',
        tier: 'micro',
        cond: () => (g.money || 0) >= 1000000 },
      { id: 'five_deliveries', icon: '📦', name: 'Пять сдач',
        desc: 'Завершить 5 проектов суммарно',
        tier: 'micro',
        cond: () => _countDeliveries(g) >= 5 },
      // Эшелон «Средние»
      { id: 'team_5',         icon: '👥', name: 'Команда из пяти',
        desc: 'Штат вырос до 5 человек',
        tier: 'middle',
        cond: () => _countStaff(g) >= 5 },
      { id: 'revenue_5m',     icon: '📊', name: 'Выручка 5M',
        desc: 'Накопленная выручка преодолела 5 000 000 ₽',
        tier: 'middle',
        cond: () => _cumulativeRevenue(g) >= 5000000 },
      { id: 'portfolio_25',   icon: '📚', name: 'Портфолио 25',
        desc: 'Набрать 25 баллов портфолио',
        tier: 'middle',
        cond: () => (g.portfolio || 0) >= 25 },
      // Эшелон «Крупные» (стадии + бывший win)
      { id: 'original_win', icon: '💰', name: 'Старый порог',
        desc: 'Достичь капитала ' + _formatMoneyShort(orig) + ' (классический win-порог)',
        tier: 'large',
        // Используем пик кассы за партию (`_peakMoney`), а не текущий
        // баланс — иначе майлстоун теряется, если в тот же тик овердрафт
        // съел расходов и баланс снова упал ниже порога.
        cond: () => (g.living && g.living._peakMoney != null ? g.living._peakMoney : (g.money || 0)) >= orig },
      { id: 'stage_studio',  icon: '🛠', name: 'Стадия «Студия»',
        desc: 'Перейти на стадию Студия',
        tier: 'large',
        cond: () => _stageIdx(g) >= 1 },
      { id: 'stage_agency',  icon: '📈', name: 'Стадия «Агентство»',
        desc: 'Перейти на стадию Агентство',
        tier: 'large',
        cond: () => _stageIdx(g) >= 2 },
    ];
  }

  // ── Хелперы (DOM-free) ───────────────────────────────────────────────

  function _countDeliveries(g) {
    if (!g || !Array.isArray(g.completedProjects)) return 0;
    return g.completedProjects.length;
  }
  function _countStaff(g) { return (g && Array.isArray(g.staff)) ? g.staff.length : 0; }
  function _cumulativeRevenue(g) {
    if (!g || !Array.isArray(g.completedProjects)) return 0;
    let sum = 0;
    for (let i = 0; i < g.completedProjects.length; i++) {
      sum += (g.completedProjects[i].revenue || 0);
    }
    return sum;
  }
  function _stageIdx(g) { return (g && g.living && typeof g.living.stage === 'number') ? g.living.stage : 0; }

  // Композитный гейт: ok=true если ВСЕ условия выполнены.
  // Возвращает { ok, progress[] } чтобы UI мог показать прогресс-бары.
  function _composite(items) {
    let ok = true;
    for (let i = 0; i < items.length; i++) {
      if ((items[i].cur || 0) < items[i].max) { ok = false; break; }
    }
    return { ok, progress: items };
  }

  function _formatMoneyShort(n) {
    n = n || 0;
    if (n >= 1000000) {
      const m = n / 1000000;
      return (m === Math.floor(m) ? m.toFixed(0) : m.toFixed(1)) + 'M ₽';
    }
    if (n >= 1000) return Math.round(n / 1000) + 'K ₽';
    return n + ' ₽';
  }

  // ── Стейт ────────────────────────────────────────────────────────────
  // G.living = { stage, journal, originalWinCondition, milestonesFired }
  // — переживает сейв (saves.js сохраняет G целиком, _restore копирует поля).

  function _defaults() {
    return {
      version:               VERSION,
      stage:                 0,          // индекс текущей стадии в STAGES
      journal:               [],         // [{ id, icon, name, desc, tier, month, ts }]
      milestonesFired:       [],         // id зафиксированных майлстоунов (быстрая проверка)
      originalWinCondition:  null,       // запоминаем до подмены, для майлстоуна
      // v0.2 (Фаза B): ★XP-валюта и купленные узлы древа 2.0
      xp:                    0,          // накопленный, доступный для покупки узлов
      xpEarned:              0,          // всего заработано за партию (для статистики)
      tree2:                 {
        purchased:           [],         // [id, id, ...] купленных узлов
        // v0.4 (Фаза B шаг 3): per-узловые дельты эффектов для респека
        // Хранится { '<nodeId>': { caseQBonus: 5, perkPayoutMult: 0.05, ... } }
        // Numeric → аддитивное число (просто разница); mul-каналы →
        // { mul: 0.9 } (делим обратно); boolean → { setBool: true }
        // (на респеке не снимаем — известное ограничение, см. respecBranch).
        purchasedDetails:    {},
        // v0.4: история респеков для лимита 1 на ветку на стадию.
        // [{ stage: 1, branch: 'craft', ts, refunded: 200, nodes: ['craft1','craft2'] }]
        respecsUsed:         [],
      },
      _xpLog:                [],         // последние 10 начислений (для UI: «+15 ★ Первый найм»)
      _lastDeliveryCount:    0,          // трекер для diff-начисления XP за сдачи
    };
  }

  function _initLiving() {
    if (typeof G === 'undefined' || !G) return;
    if (!G.living) G.living = _defaults();
    else {
      // Back-compat: добиваем недостающие поля при загрузке старого сейва
      const d = _defaults();
      for (const k in d) if (!(k in G.living)) G.living[k] = d[k];
      // v0.4: миграция tree2 — добавляем покапаленные поля purchasedDetails
      // и respecsUsed, если их не было в старом сейве (v0.2/v0.3).
      if (G.living.tree2 && !G.living.tree2.purchasedDetails) G.living.tree2.purchasedDetails = {};
      if (G.living.tree2 && !G.living.tree2.respecsUsed)     G.living.tree2.respecsUsed     = [];
    }
  }

  // Пик кассы за партию — для майлстоунов, которые проверяют «крест порога»
  // (например original_win). Обновляется до того, как engine успеет списать
  // расходы и сбросить баланс ниже целевого числа. Не пишется в сейв
  // намеренно (это рантайм-трекер; сейв заранее не знает фактический пик).
  function _updateMoneyPeak() {
    if (typeof G === 'undefined' || !G || !G.living) return;
    const m = G.money || 0;
    if (G.living._peakMoney == null || m > G.living._peakMoney) G.living._peakMoney = m;
  }

  // ── ★XP-валюта (Фаза B) ──────────────────────────────────────────────
  // Источники начисления:
  //   • Завершение проекта: 10 × tier ★XP (tier из completedProjects[i].tier)
  //   • Майлстоун: 15 (микро) / 40 (средние) / 120 (крупные) ★XP
  //   • Переход стадии: 200 + (idx × 100) ★XP (Студия 300, Агентство 400, ...)
  // Покупка узла древа списывает XP — не даёт перерасхода, не возвращается.

  function _awardXp(amount, sourceLabel) {
    if (typeof G === 'undefined' || !G || !G.living) return;
    if (!amount || amount <= 0) return;
    G.xp = (G.xp || 0) + amount;
    G.living.xp      = (G.living.xp      || 0) + amount;
    G.living.xpEarned = (G.living.xpEarned || 0) + amount;
    // _xpLog — короткий fifo последних 10 для UI-всплывашек
    G.living._xpLog = G.living._xpLog || [];
    G.living._xpLog.push({ amount, source: sourceLabel || '', month: G.month || 0, ts: Date.now() });
    if (G.living._xpLog.length > 10) G.living._xpLog = G.living._xpLog.slice(-10);
    if (typeof EventBus !== 'undefined' && EventBus.emit) {
      EventBus.emit('xp_awarded', { amount, source: sourceLabel });
    }
  }

  // diff-награды за завершённые проекты с прошлого тика. Tier берётся
  // из completedProjects[i].tier (fallback 1). При первом вызове в
  // партии trackedCount стоит на текущей длине — стартовые «пустышки»
  // из debug-сценариев не дадут лишнего XP.
  function _awardDeliveryXp() {
    if (!G || !G.living || !Array.isArray(G.completedProjects)) return;
    const len = G.completedProjects.length;
    const prev = G.living._lastDeliveryCount || 0;
    if (len <= prev) {
      G.living._lastDeliveryCount = len;
      return;
    }
    let sum = 0;
    for (let i = prev; i < len; i++) {
      const t = (G.completedProjects[i].tier || 1);
      sum += 10 * t;
    }
    G.living._lastDeliveryCount = len;
    if (sum > 0) _awardXp(sum, '🏁 Сдач: ' + (len - prev));
  }

  // ── Древо 2.0 — публичный API ────────────────────────────────────────

  function _getTreeNode(id) { return TREE_NODES.find(n => n.id === id); }

  function _isNodeOwned(id) {
    if (!G || !G.living || !G.living.tree2) return false;
    return (G.living.tree2.purchased || []).indexOf(id) !== -1;
  }

  // Доступен ли узел: стадия игрока удовлетворяет requiresStage яруса,
  // и не помечен ли как «требует Фазу C» (tier 5 = требует конкурентов).
  function isNodeUnlocked(id) {
    const n = _getTreeNode(id);
    if (!n) return false;
    const requiresStage = TIER_STAGE_GATES[n.tier - 1] || 0;
    if (_stageIdx(G) < requiresStage) return false;
    if (n.tier === 5) return false;     // Фаза C
    return true;
  }

  // v0.3 (Фаза B шаг 4): возвращает массив id всех узлов, конфликтующих
  // с указанным. Двунаправленно: direct excludes + inverse (если кто-то
  // указал этот id в своём excludes). По образцу meta.js getConflictingPerks.
  function getConflictingTreeNodes(id) {
    const n = _getTreeNode(id);
    if (!n) return [];
    const direct  = (n.excludes || []).slice();
    const inverse = TREE_NODES
      .filter(x => (x.excludes || []).includes(id))
      .map(x => x.id);
    return Array.from(new Set(direct.concat(inverse)));
  }

  // Можно ли купить сейчас: открыт + не куплен + хватает XP + нет
  // купленного взаимоисключающего (v0.3, tier 4 a/b).
  function canPurchaseNode(id) {
    const n = _getTreeNode(id);
    if (!n) return { ok: false, reason: 'unknown_node' };
    if (_isNodeOwned(id))         return { ok: false, reason: 'already_owned', node: n };
    if (!isNodeUnlocked(id))      return { ok: false, reason: 'locked',        node: n };
    // v0.3: проверка взаимоисключений (двунаправленно)
    const conflicts = getConflictingTreeNodes(id);
    const blocker = conflicts.find(x => _isNodeOwned(x));
    if (blocker) return { ok: false, reason: 'excluded_by', blocker, node: n };
    if ((G.xp || 0) < n.cost)     return { ok: false, reason: 'not_enough_xp', node: n };
    return { ok: true, node: n };
  }

  // v0.4 (Фаза B шаг 3): каналы G, которые tree 2.0 может мутировать.
  // Снимок до/после apply() позволяет вычислить delta и инвертировать её
  // при респеке.  Список — все каналы, упомянутые в `apply` любого узла.
  const TREE_TRACKED_CHANNELS_NUM  = [
    'caseQBonus', 'caseScoutBonus', 'caseRepBonus',
    'speedUpgrades', 'perkPayoutMult', 'perkPrepayBonus',
    'perkRecoveryBonus', 'portfolio', 'reputation',
  ];
  const TREE_TRACKED_CHANNELS_MUL  = ['scoutSalaryMult', 'perkFatigueMult'];
  const TREE_TRACKED_CHANNELS_BOOL = ['perkPenaltyShield', 'perkInstantSpeed', 'perkEpicShortcut'];

  function _snapshotTreeChannels(g) {
    const snap = {};
    TREE_TRACKED_CHANNELS_NUM.forEach(k  => { snap[k] = g[k] || 0; });
    TREE_TRACKED_CHANNELS_MUL.forEach(k  => { snap[k] = (g[k] == null) ? 1 : g[k]; });
    TREE_TRACKED_CHANNELS_BOOL.forEach(k => { snap[k] = !!g[k]; });
    return snap;
  }

  // Вычисляет дельту между двумя снапшотами для хранения в purchasedDetails.
  // Возвращает плоский объект с разными форматами на канал:
  //   numeric: { caseQBonus: 5 }       (просто прибавили 5)
  //   mul:     { scoutSalaryMult: { mul: 0.9 } }   (умножили на 0.9)
  //   bool:    { perkPenaltyShield: { setBool: true } }   (изменили флаг)
  function _computeTreeDelta(before, after) {
    const delta = {};
    TREE_TRACKED_CHANNELS_NUM.forEach(k => {
      const d = (after[k] || 0) - (before[k] || 0);
      if (Math.abs(d) > 1e-12) delta[k] = d;
    });
    TREE_TRACKED_CHANNELS_MUL.forEach(k => {
      const b = before[k] == null ? 1 : before[k];
      const a = after[k]  == null ? 1 : after[k];
      if (Math.abs(a - b) > 1e-12 && b !== 0) {
        delta[k] = { mul: a / b };
      }
    });
    TREE_TRACKED_CHANNELS_BOOL.forEach(k => {
      if (!!before[k] !== !!after[k]) {
        delta[k] = { setBool: !!after[k] };
      }
    });
    return delta;
  }

  // Обратная операция к delta: вычитает numeric, делит mul-каналы.
  // Boolean-флаги НЕ снимаем — другие источники (мета-перки/runMap-бонусы/
  // другие узлы древа) могут полагаться на тот же флаг.  Это известное
  // ограничение респека; refcounting вынесен в потенциальный шаг 6.
  function _applyInverseTreeDelta(g, delta) {
    if (!g || !delta) return;
    for (const k in delta) {
      const v = delta[k];
      if (typeof v === 'number') {
        g[k] = (g[k] || 0) - v;
      } else if (v && typeof v.mul === 'number' && v.mul !== 0) {
        const cur = (g[k] == null) ? 1 : g[k];
        g[k] = cur / v.mul;
      }
      // boolean — пропускаем (см. комментарий выше)
    }
  }

  function purchaseTreeNode(id) {
    const r = canPurchaseNode(id);
    if (!r.ok) return r;
    const n = r.node;
    G.xp = (G.xp || 0) - n.cost;
    G.living.xp = (G.living.xp || 0) - n.cost;
    G.living.tree2 = G.living.tree2 || { purchased: [], purchasedDetails: {}, respecsUsed: [] };
    if (!G.living.tree2.purchasedDetails) G.living.tree2.purchasedDetails = {};
    if (!G.living.tree2.respecsUsed)     G.living.tree2.respecsUsed     = [];
    G.living.tree2.purchased = (G.living.tree2.purchased || []).concat(id);
    // v0.4: снимаем G до и после apply → сохраняем delta для респека
    const before = _snapshotTreeChannels(G);
    try { n.apply(G); } catch (e) { try { console.warn('[livingmarket] node apply', n.id, e); } catch (_) {} }
    const after = _snapshotTreeChannels(G);
    G.living.tree2.purchasedDetails[id] = _computeTreeDelta(before, after);
    G.living.journal.push({
      id:   'tree_' + n.id,
      icon: n.icon,
      name: 'Узел: ' + n.name,
      desc: n.desc,
      tier: 'micro',
      month: G.month || 0,
      ts:   Date.now(),
    });
    if (typeof EventBus !== 'undefined' && EventBus.emit) {
      EventBus.emit('tree_node_purchased', { node: n });
      EventBus.emit('render');
    }
    if (typeof notify === 'function') {
      notify(n.icon + ' Куплен узел «' + n.name + '» — ' + n.desc, 'success');
    }
    return { ok: true, node: n };
  }

  // ── v0.4 (Фаза B шаг 3): Респец ветки ──────────────────────────────
  // Раз в стадию игрок может бесплатно сбросить любую ветку — все купленные
  // узлы возвращаются (XP-cost восстанавливается, эффекты инвертируются).
  // Лимит: один респец на ветку на стадию.  Переход на следующую стадию
  // снимает использование (можно снова сбросить ту же ветку).

  function canRespecBranch(branchId) {
    if (typeof G === 'undefined' || !G || !G.living) return { ok: false, reason: 'no_active_game' };
    const owned = (G.living.tree2 && G.living.tree2.purchased) || [];
    const branchOwned = owned.filter(id => {
      const n = _getTreeNode(id);
      return n && n.branch === branchId;
    });
    if (branchOwned.length === 0) return { ok: false, reason: 'no_nodes_owned' };
    const stage = _stageIdx(G);
    const usedAtStage = (G.living.tree2.respecsUsed || []).some(r => r.stage === stage && r.branch === branchId);
    if (usedAtStage) return { ok: false, reason: 'already_used_at_stage', stage };
    return { ok: true, nodes: branchOwned, stage };
  }

  // ── v0.5 (Фаза B шаги 2 lite + 7): осведомлённость о engine.UPGRADES ─
  // и сводка эффектов tree 2.0 ─────────────────────────────────────────
  // upgradeAlias — НЕинвазивная связка: узел tree 2.0 объявляет, какие
  // существующие engine-апгрейды дают пересекающийся эффект. Покупка
  // одного НЕ блокирует другое (старая прокачка остаётся отдельной
  // системой) — UI просто показывает игроку «⚠ Дублирует X», чтобы
  // выбор был осознанным.

  function getDuplicatedEngineUpgrades(nodeId) {
    const n = _getTreeNode(nodeId);
    if (!n || !n.upgradeAlias || !n.upgradeAlias.length) return [];
    if (typeof G === 'undefined' || !G || !G.upgrades) return [];
    return n.upgradeAlias.filter(uid => !!G.upgrades[uid]);
  }

  // Суммарные эффекты от ВСЕХ купленных узлов tree 2.0. Используется в
  // UI-блоке «Эффекты древа» и для дебага. Аккумулирует numeric (sum) и
  // mul-каналы (произведение), boolean — список узлов-источников.
  function getEffectsSummary() {
    const summary = { numeric: {}, mul: {}, flags: {} };
    if (typeof G === 'undefined' || !G || !G.living || !G.living.tree2) return summary;
    const purchased = G.living.tree2.purchased || [];
    const details   = G.living.tree2.purchasedDetails || {};
    purchased.forEach(id => {
      const n = _getTreeNode(id);
      if (!n) return;
      const delta = details[id];
      if (!delta) return;
      for (const k in delta) {
        const v = delta[k];
        if (typeof v === 'number') {
          summary.numeric[k] = summary.numeric[k] || { total: 0, contributors: [] };
          summary.numeric[k].total += v;
          summary.numeric[k].contributors.push({ id, name: n.name, icon: n.icon, delta: v });
        } else if (v && typeof v.mul === 'number') {
          summary.mul[k] = summary.mul[k] || { total: 1, contributors: [] };
          summary.mul[k].total *= v.mul;
          summary.mul[k].contributors.push({ id, name: n.name, icon: n.icon, mul: v.mul });
        } else if (v && 'setBool' in v) {
          summary.flags[k] = summary.flags[k] || { value: !!v.setBool, contributors: [] };
          summary.flags[k].contributors.push({ id, name: n.name, icon: n.icon });
        }
      }
    });
    return summary;
  }

  // Человекочитаемые названия каналов для UI Effects Summary.
  const CHANNEL_LABELS = {
    caseQBonus:        '🎯 Качество',
    caseScoutBonus:    '🔍 Лиды/скаут',
    caseRepBonus:      '⭐ Реп/мес',
    speedUpgrades:     '🚀 Скорость',
    perkPayoutMult:    '💰 Выплаты',
    perkPrepayBonus:   '💳 Предоплата',
    perkRecoveryBonus: '🌿 Восстановление',
    portfolio:         '📚 Портфолио',
    reputation:        '⭐ Репутация',
    scoutSalaryMult:   '💼 Зарплата кандидатов',
    perkFatigueMult:   '😴 Усталость команды',
    perkPenaltyShield: '🛡 Штраф просрочки −50%',
    perkInstantSpeed:  '⚡ Скорость instant-проектов',
    perkEpicShortcut:  '⚙️ Epic −1 фаза',
  };

  function respecBranch(branchId) {
    const r = canRespecBranch(branchId);
    if (!r.ok) return r;
    let refunded = 0;
    const removed = r.nodes.slice();
    removed.forEach(id => {
      const n = _getTreeNode(id);
      if (!n) return;
      const delta = (G.living.tree2.purchasedDetails || {})[id];
      _applyInverseTreeDelta(G, delta);
      refunded += n.cost;
      delete G.living.tree2.purchasedDetails[id];
    });
    G.living.tree2.purchased = (G.living.tree2.purchased || []).filter(id => removed.indexOf(id) === -1);
    G.xp = (G.xp || 0) + refunded;
    G.living.xp = (G.living.xp || 0) + refunded;
    G.living.tree2.respecsUsed = (G.living.tree2.respecsUsed || []).concat({
      stage:   r.stage,
      branch:  branchId,
      ts:      Date.now(),
      refunded,
      nodes:   removed,
    });
    G.living.journal.push({
      id:   'respec_' + branchId + '_' + r.stage,
      icon: '↺',
      name: 'Респец ветки',
      desc: 'Ветка «' + branchId + '» сброшена · возвращено ★' + refunded + ' (' + removed.length + ' узлов)',
      tier: 'micro',
      month: G.month || 0,
      ts:   Date.now(),
    });
    if (typeof EventBus !== 'undefined' && EventBus.emit) {
      EventBus.emit('tree_branch_respec', { branch: branchId, refunded, removed });
      EventBus.emit('render');
    }
    if (typeof notify === 'function') {
      notify('↺ Респец «' + branchId + '»: +★' + refunded + ' (' + removed.length + ' узлов)', 'success');
    }
    return { ok: true, refunded, removed, stage: r.stage };
  }

  // ── Подмена winCondition (главный спецэффект модуля) ─────────────────
  // Сохраняем оригинал в G.living.originalWinCondition (для майлстоуна
  // «Старый порог»), затем выставляем Infinity в SCENARIO.settings.
  // Engine читает это значение в advanceMonth → win больше не сработает.
  // При отключённом флаге (см. начало файла) этот блок вообще не выполнится,
  // и engine продолжит триггерить win как раньше.

  function _suppressWin() {
    if (typeof SCENARIO === 'undefined' || !SCENARIO || !SCENARIO.settings) return;
    if (!G.living.originalWinCondition) {
      G.living.originalWinCondition = SCENARIO.settings.winCondition;
    }
    SCENARIO.settings.winCondition = Infinity;
  }

  // ── Тик: стадии + майлстоуны ─────────────────────────────────────────

  function _tickStages() {
    const cur = _stageIdx(G);
    // Пытаемся продвинуться на следующую достижимую стадию (несколько за тик
    // на случай, если за один месяц выполнились гейты сразу двух стадий —
    // например, на старте после _restore сейва).
    for (let i = cur + 1; i < STAGES.length; i++) {
      const st = STAGES[i];
      if (st.requiresMarket) break;       // дальше — заблокировано
      const r = st.gate(G);
      if (!r.ok) break;
      G.living.stage = i;
      _logStageReached(st);
    }
  }

  function _logStageReached(st) {
    const entry = {
      id: 'stage_' + st.id,
      icon: st.icon,
      name: 'Стадия «' + st.name + '»',
      desc: st.unlocks,
      tier: 'large',
      month: G.month || 0,
      ts:    Date.now(),
    };
    G.living.journal.push(entry);
    // Стадия — это тоже майлстоун с тем же id, помечаем чтобы _tickMilestones
    // не выдал второй раз через декл. правила (stage_studio/stage_agency)
    if (!G.living.milestonesFired.includes('stage_' + st.id)) {
      G.living.milestonesFired.push('stage_' + st.id);
    }
    // v0.2 (Фаза B): ★XP-награда за стадию — масштабируется по индексу.
    // Гараж (idx 0) — стартовая, без XP; дальше 300/400/500/600/700.
    if (st.idx > 0) _awardXp(200 + st.idx * 100, st.icon + ' Стадия: ' + st.name);
    // EventBus + UI
    if (typeof EventBus !== 'undefined' && EventBus.emit) {
      EventBus.emit('stage_reached', { stage: st, entry });
    }
    if (typeof notify === 'function') {
      notify(st.icon + ' Стадия «' + st.name + '» — ' + st.unlocks, 'success');
    }
    if (typeof addLog === 'function') {
      addLog(st.icon + ' Достигнута стадия «' + st.name + '»: ' + st.unlocks, 'green');
    }
    _showStageCeremony(st);
  }

  function _tickMilestones() {
    const fired = new Set(G.living.milestonesFired);
    const milestones = _milestones(G);
    for (let i = 0; i < milestones.length; i++) {
      const m = milestones[i];
      if (fired.has(m.id)) continue;
      let ok = false;
      try { ok = !!m.cond(G); } catch (e) { ok = false; }
      if (!ok) continue;
      G.living.milestonesFired.push(m.id);
      G.living.journal.push({
        id:   m.id,
        icon: m.icon,
        name: m.name,
        desc: m.desc,
        tier: m.tier,
        month: G.month || 0,
        ts:    Date.now(),
      });
      // v0.2 (Фаза B): ★XP по эшелону майлстоуна — 15/40/120.
      const xpByTier = { micro: 15, middle: 40, large: 120 };
      _awardXp(xpByTier[m.tier] || 15, m.icon + ' ' + m.name);
      if (typeof EventBus !== 'undefined' && EventBus.emit) {
        EventBus.emit('milestone_reached', { milestone: m });
      }
      if (typeof notify === 'function') {
        notify(m.icon + ' ' + m.name, 'success');
      }
      if (typeof addLog === 'function') {
        addLog(m.icon + ' Майлстоун: ' + m.name + ' — ' + m.desc, 'purple');
      }
    }
  }

  // ── UI: пилюля стадии в шапке ────────────────────────────────────────

  function _renderStagePill() {
    if (typeof document === 'undefined') return;
    const host = document.querySelector('.game-header .game-logo');
    if (!host) return;
    let pill = document.getElementById('lm-stage-pill');
    if (!pill) {
      pill = document.createElement('div');
      pill.id = 'lm-stage-pill';
      pill.style.cssText = 'display:inline-flex;align-items:center;gap:6px;margin-left:10px;padding:4px 10px;border-radius:999px;font-size:11px;font-weight:700;cursor:pointer;border:1px solid var(--border);background:rgba(255,255,255,.03);transition:background .15s';
      pill.onmouseover = () => { pill.style.background = 'rgba(255,255,255,.07)'; };
      pill.onmouseout  = () => { pill.style.background = 'rgba(255,255,255,.03)'; };
      pill.onclick = () => showJournalModal();
      host.appendChild(pill);
    }
    const idx = _stageIdx(G);
    const st = STAGES[idx];
    let nextStr = '';
    if (idx + 1 < STAGES.length) {
      const next = STAGES[idx + 1];
      if (next.requiresMarket) {
        nextStr = ' · след.: 🔒 ' + next.name;
      } else {
        const r = next.gate(G);
        const parts = (r.progress || []).map(p => {
          const cur = p.fmt === 'money' ? _formatMoneyShort(p.cur) : Math.floor(p.cur);
          const max = p.fmt === 'money' ? _formatMoneyShort(p.max) : p.max;
          const done = (p.cur || 0) >= p.max;
          return (done ? '✓ ' : '') + cur + '/' + max + ' ' + p.label;
        });
        nextStr = ' · след. ' + next.name + ': ' + parts.join(' · ');
      }
    } else {
      nextStr = ' · финальная стадия';
    }
    // v0.2: ★XP-баланс справа от прогресса (если XP > 0)
    const xpStr = (G.xp || 0) > 0 ? ' · <span style="color:#fbbf24;font-weight:700">★' + Math.floor(G.xp) + '</span>' : '';
    pill.innerHTML = '<span style="color:' + st.color + '">' + st.icon + '</span> ' + st.name + '<span style="color:var(--muted);font-weight:500">' + nextStr + xpStr + '</span>';
  }

  // ── UI: модал церемонии при достижении стадии ────────────────────────

  function _showStageCeremony(st) {
    if (typeof document === 'undefined') return;
    let m = document.getElementById('lm-stage-modal');
    if (!m) {
      m = document.createElement('div');
      m.id = 'lm-stage-modal';
      m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:340;display:flex;align-items:center;justify-content:center';
      m.onclick = e => { if (e.target === m) m.style.display = 'none'; };
      document.body.appendChild(m);
    }
    m.innerHTML =
      '<div style="background:var(--panel);border:2px solid ' + st.color + ';border-radius:14px;padding:32px;max-width:480px;text-align:center;box-shadow:0 0 60px ' + st.color + '44">' +
        '<div style="font-size:64px;line-height:1;margin-bottom:14px">' + st.icon + '</div>' +
        '<div style="font-size:12px;color:var(--muted);font-weight:700;letter-spacing:.15em;text-transform:uppercase;margin-bottom:6px">Стадия достигнута</div>' +
        '<div style="font-size:28px;font-weight:800;color:' + st.color + ';margin-bottom:14px">' + st.name + '</div>' +
        '<div style="font-size:13px;color:var(--text);margin-bottom:6px">' + st.sub + '</div>' +
        '<div style="font-size:12px;color:var(--sub);margin-bottom:22px;font-style:italic">Открыто: ' + st.unlocks + '</div>' +
        '<button onclick="document.getElementById(\'lm-stage-modal\').style.display=\'none\'" style="background:' + st.color + ';border:none;color:#0a0a0a;font-weight:700;padding:10px 28px;border-radius:8px;cursor:pointer;font-size:13px">Продолжить</button>' +
      '</div>';
    m.style.display = 'flex';
  }

  // ── UI: модал журнала ────────────────────────────────────────────────

  function showJournalModal() {
    if (typeof document === 'undefined') return;
    let m = document.getElementById('lm-journal-modal');
    if (!m) {
      m = document.createElement('div');
      m.id = 'lm-journal-modal';
      m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:330;display:flex;align-items:center;justify-content:center';
      m.onclick = e => { if (e.target === m) m.style.display = 'none'; };
      document.body.appendChild(m);
    }
    m.innerHTML = _renderJournalHtml();
    m.style.display = 'flex';
  }

  function _renderJournalHtml() {
    const journal = (G.living && G.living.journal) || [];
    const tierColors = { micro: '#94a3b8', middle: '#22d3ee', large: '#facc15' };
    const tierLabels = { micro: 'Микро', middle: 'Средние', large: 'Крупные' };
    const rows = journal.slice().reverse().map(j => {
      const c = tierColors[j.tier] || '#94a3b8';
      return '<div style="border:1px solid var(--border);border-left:3px solid ' + c + ';background:rgba(255,255,255,.02);border-radius:8px;padding:10px 13px;display:flex;align-items:center;gap:11px">' +
        '<span style="font-size:22px">' + j.icon + '</span>' +
        '<div style="min-width:0;flex:1">' +
          '<div style="font-size:12px;font-weight:700;color:var(--text)">' + j.name + '</div>' +
          '<div style="font-size:10px;color:var(--sub);margin-top:2px;line-height:1.4">' + j.desc + '</div>' +
        '</div>' +
        '<span style="font-size:10px;color:' + c + ';font-weight:700;background:rgba(255,255,255,.04);border:1px solid var(--border);border-radius:6px;padding:3px 8px;white-space:nowrap">M' + j.month + ' · ' + (tierLabels[j.tier] || j.tier) + '</span>' +
      '</div>';
    }).join('');

    const idx = _stageIdx(G);
    const st  = STAGES[idx];
    const next = STAGES[idx + 1];
    let nextHtml = '';
    if (next) {
      if (next.requiresMarket) {
        nextHtml = '<div style="border:1px dashed var(--border);background:rgba(255,255,255,.02);border-radius:8px;padding:11px 13px;margin-top:12px;font-size:11px;color:var(--muted)">🔒 ' + next.icon + ' <b>' + next.name + '</b> — откроется с модулем «Живой рынок» (фаза C дизайн-дока)</div>';
      } else {
        const r = next.gate(G);
        const parts = (r.progress || []).map(p => {
          const cur = p.fmt === 'money' ? _formatMoneyShort(p.cur) : Math.floor(p.cur);
          const max = p.fmt === 'money' ? _formatMoneyShort(p.max) : p.max;
          const done = (p.cur || 0) >= p.max;
          return '<div style="display:flex;justify-content:space-between;font-size:11px;line-height:1.6">' +
                   '<span style="color:var(--sub)">' + (done ? '✓ ' : '○ ') + p.label + '</span>' +
                   '<span style="color:' + (done ? '#86efac' : 'var(--text)') + ';font-weight:700">' + cur + ' / ' + max + '</span>' +
                 '</div>';
        }).join('');
        nextHtml =
          '<div style="border:1px solid ' + next.color + '55;background:rgba(255,255,255,.02);border-radius:8px;padding:11px 13px;margin-top:12px">' +
            '<div style="font-size:11px;color:var(--muted);font-weight:700;margin-bottom:6px">' + next.icon + ' Следующая стадия: <span style="color:' + next.color + '">' + next.name + '</span></div>' +
            parts +
          '</div>';
      }
    }

    const empty = rows ? '' : '<div style="font-size:11px;color:var(--muted);text-align:center;padding:24px;font-style:italic">Журнал пуст. Первые записи появятся при сдаче проектов, найме команды и росте репутации.</div>';
    // v0.2: ★XP-блок + кнопка «Древо 2.0»
    const xpNow     = Math.floor(G.xp || 0);
    const xpEarned  = Math.floor((G.living && G.living.xpEarned) || 0);
    const treeOwned = (G.living && G.living.tree2 && G.living.tree2.purchased.length) || 0;
    const xpBlock =
      '<div style="display:flex;align-items:center;gap:10px;margin:0 0 12px;padding:10px 13px;border:1px solid rgba(251,191,36,.3);background:rgba(251,191,36,.06);border-radius:8px">' +
        '<span style="font-size:22px">⭐</span>' +
        '<div style="min-width:0;flex:1">' +
          '<div style="font-size:11px;color:var(--muted);font-weight:700;letter-spacing:.08em;text-transform:uppercase">★XP Опыт студии</div>' +
          '<div style="font-size:16px;font-weight:800;color:#fbbf24">' + xpNow + ' доступно <span style="color:var(--sub);font-size:11px;font-weight:500">(' + xpEarned + ' всего · ' + treeOwned + '/25 узлов куплено)</span></div>' +
        '</div>' +
        '<button onclick="LivingMarket.showTreeModal()" style="background:#fbbf24;border:none;color:#111;font-weight:700;padding:7px 14px;border-radius:6px;cursor:pointer;font-size:11px;white-space:nowrap">Древо 2.0 →</button>' +
      '</div>';
    return '<div style="background:var(--panel);border:1px solid var(--border);border-radius:14px;padding:22px;max-width:540px;max-height:80vh;display:flex;flex-direction:column;width:90vw">' +
      '<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">' +
        '<span style="font-size:24px">' + st.icon + '</span>' +
        '<div><div style="font-size:11px;color:var(--muted);font-weight:700;letter-spacing:.1em;text-transform:uppercase">Журнал прогресса</div>' +
        '<div style="font-size:18px;font-weight:800;color:' + st.color + '">' + st.name + ' · M' + (G.month || 0) + '</div></div>' +
      '</div>' +
      '<div style="font-size:11px;color:var(--sub);margin-bottom:12px">' + st.sub + '</div>' +
      xpBlock +
      nextHtml +
      '<div style="font-size:11px;font-weight:700;color:var(--muted);margin:14px 0 6px">Достижения (' + journal.length + ')</div>' +
      '<div style="display:flex;flex-direction:column;gap:5px;overflow-y:auto;flex:1">' + (rows || empty) + '</div>' +
      '<button onclick="document.getElementById(\'lm-journal-modal\').style.display=\'none\'" style="margin-top:14px;background:rgba(255,255,255,.06);border:1px solid var(--border);color:var(--text);padding:8px 16px;border-radius:8px;cursor:pointer;font-size:11px;font-weight:700;align-self:center">Закрыть</button>' +
    '</div>';
  }

  // ── UI: модал «Древо 2.0» ────────────────────────────────────────────

  function showTreeModal() {
    if (typeof document === 'undefined') return;
    let m = document.getElementById('lm-tree-modal');
    if (!m) {
      m = document.createElement('div');
      m.id = 'lm-tree-modal';
      m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.78);z-index:335;display:flex;align-items:center;justify-content:center';
      m.onclick = e => { if (e.target === m) m.style.display = 'none'; };
      document.body.appendChild(m);
    }
    m.innerHTML = _renderTreeHtml();
    m.style.display = 'flex';
  }

  function _renderTreeHtml() {
    const xpNow = Math.floor(G.xp || 0);
    const stageIdx = _stageIdx(G);
    // Заголовок
    const head =
      '<div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">' +
        '<span style="font-size:30px">🌳</span>' +
        '<div style="flex:1">' +
          '<div style="font-size:11px;color:var(--muted);font-weight:700;letter-spacing:.1em;text-transform:uppercase">Древо прокачки 2.0</div>' +
          '<div style="font-size:17px;font-weight:800;color:var(--text)">5 веток · 5 ярусов · 25 узлов</div>' +
        '</div>' +
        '<div style="text-align:right">' +
          '<div style="font-size:10px;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:.08em">★XP доступно</div>' +
          '<div style="font-size:20px;font-weight:800;color:#fbbf24">' + xpNow + '</div>' +
        '</div>' +
      '</div>';
    // Заголовок-сетка веток + кнопка респека (v0.4)
    const branchHeads = TREE_BRANCHES.map(b => {
      const r = canRespecBranch(b.id);
      let respecBtn;
      if (r.ok) {
        respecBtn = '<button onclick="LivingMarket._doRespec(\'' + b.id + '\')" title="Сбросить ветку, вернуть ★XP" style="margin-top:4px;background:rgba(255,255,255,.04);border:1px solid ' + b.color + '44;color:' + b.color + ';font-size:9px;font-weight:700;padding:2px 7px;border-radius:4px;cursor:pointer;width:100%">↺ Респец</button>';
      } else {
        let title;
        if (r.reason === 'no_nodes_owned')          title = 'Нет купленных узлов в этой ветке';
        else if (r.reason === 'already_used_at_stage') title = 'Респец уже использован на этой стадии — следующий бесплатный со сменой стадии';
        else if (r.reason === 'no_active_game')     title = 'Партия не запущена';
        else title = r.reason;
        respecBtn = '<button disabled title="' + title + '" style="margin-top:4px;background:rgba(255,255,255,.02);border:1px solid var(--border);color:var(--muted);font-size:9px;font-weight:700;padding:2px 7px;border-radius:4px;cursor:not-allowed;width:100%;opacity:.55">↺ Респец</button>';
      }
      return '<div style="text-align:center;padding:8px 4px;border-bottom:2px solid ' + b.color + '">' +
        '<div style="font-size:20px;line-height:1">' + b.icon + '</div>' +
        '<div style="font-size:11px;font-weight:700;color:' + b.color + ';margin-top:4px">' + b.name + '</div>' +
        '<div style="font-size:9px;color:var(--muted);margin-top:1px">' + b.sub + '</div>' +
        respecBtn +
      '</div>';
    }).join('');
    // 5 ярусов, по 5 узлов в каждом ряду
    const rows = [];
    for (let tier = 1; tier <= 5; tier++) {
      const requiresStage = TIER_STAGE_GATES[tier - 1] || 0;
      const tierLocked    = stageIdx < requiresStage;
      const tierLabel     = tier === 5
        ? 'Ярус 5 · 🔒 требуется модуль «Живой рынок» (Фаза C)'
        : (tierLocked ? 'Ярус ' + tier + ' · 🔒 откроется со стадии «' + STAGES[requiresStage].name + '»' : 'Ярус ' + tier);
      const tierLabelHtml =
        '<div style="grid-column:1/-1;font-size:10px;color:' + (tierLocked || tier === 5 ? 'var(--muted)' : 'var(--sub)') + ';font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin:8px 0 4px;padding-bottom:2px;border-bottom:1px dashed var(--border)">' + tierLabel + '</div>';
      const cells = TREE_BRANCHES.map(b => {
        const n = TREE_NODES.find(x => x.branch === b.id && x.tier === tier);
        return n ? _renderNodeCell(n, b) : '<div></div>';
      }).join('');
      rows.push(tierLabelHtml + cells);
    }
    const grid = '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px;flex:1;overflow-y:auto;padding-right:4px">' + rows.join('') + '</div>';

    // v0.5: блок «Эффекты древа» — суммарные мутации от всех купленных узлов
    const summaryHtml = _renderEffectsSummaryHtml();

    return '<div style="background:var(--panel);border:1px solid var(--border);border-radius:14px;padding:20px;max-width:1000px;max-height:90vh;display:flex;flex-direction:column;width:96vw">' +
      head +
      '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-bottom:4px">' + branchHeads + '</div>' +
      grid +
      summaryHtml +
      '<div style="display:flex;gap:8px;margin-top:8px;justify-content:center;align-items:center">' +
        '<div style="font-size:10px;color:var(--muted)">★XP начисляется за: сдачи проектов · майлстоуны · переходы стадий</div>' +
      '</div>' +
      '<button onclick="document.getElementById(\'lm-tree-modal\').style.display=\'none\'" style="margin-top:10px;background:rgba(255,255,255,.06);border:1px solid var(--border);color:var(--text);padding:8px 16px;border-radius:8px;cursor:pointer;font-size:11px;font-weight:700;align-self:center">Закрыть</button>' +
    '</div>';
  }

  // v0.5: компактная сводка суммарных эффектов tree 2.0 на каналы G.
  // Скрыта если ничего не куплено — экономим место в модале.
  function _renderEffectsSummaryHtml() {
    const s = getEffectsSummary();
    const numericKeys = Object.keys(s.numeric);
    const mulKeys     = Object.keys(s.mul);
    const flagKeys    = Object.keys(s.flags);
    if (!numericKeys.length && !mulKeys.length && !flagKeys.length) return '';
    const fmt = (n, ch) => {
      // perkPayoutMult/perkPrepayBonus/perkRecoveryBonus/speedUpgrades — проценты
      const pctCh = ['perkPayoutMult','perkPrepayBonus','perkRecoveryBonus','speedUpgrades'];
      if (pctCh.indexOf(ch) !== -1) return (n >= 0 ? '+' : '') + Math.round(n * 100) + '%';
      return (n >= 0 ? '+' : '') + (Math.round(n * 100) / 100);
    };
    const rows = [];
    numericKeys.forEach(ch => {
      const e = s.numeric[ch];
      const label = CHANNEL_LABELS[ch] || ch;
      const contribStr = e.contributors.map(c => c.icon + ' ' + c.name).join(' · ');
      rows.push('<div style="display:flex;align-items:center;justify-content:space-between;padding:3px 0;font-size:10px;border-bottom:1px dashed var(--border)"><span style="color:var(--text);font-weight:700">' + label + '</span><span style="color:var(--sub);font-weight:700">' + fmt(e.total, ch) + ' <span style="color:var(--muted);font-weight:500">· ' + contribStr + '</span></span></div>');
    });
    mulKeys.forEach(ch => {
      const e = s.mul[ch];
      const label = CHANNEL_LABELS[ch] || ch;
      const contribStr = e.contributors.map(c => c.icon + ' ' + c.name + ' ×' + c.mul).join(' · ');
      const pct = Math.round((e.total - 1) * 100);
      rows.push('<div style="display:flex;align-items:center;justify-content:space-between;padding:3px 0;font-size:10px;border-bottom:1px dashed var(--border)"><span style="color:var(--text);font-weight:700">' + label + '</span><span style="color:var(--sub);font-weight:700">×' + (Math.round(e.total * 100) / 100) + ' (' + (pct >= 0 ? '+' : '') + pct + '%) <span style="color:var(--muted);font-weight:500">· ' + contribStr + '</span></span></div>');
    });
    flagKeys.forEach(ch => {
      const e = s.flags[ch];
      const label = CHANNEL_LABELS[ch] || ch;
      const contribStr = e.contributors.map(c => c.icon + ' ' + c.name).join(' · ');
      rows.push('<div style="display:flex;align-items:center;justify-content:space-between;padding:3px 0;font-size:10px;border-bottom:1px dashed var(--border)"><span style="color:var(--text);font-weight:700">' + label + '</span><span style="color:#86efac;font-weight:700">включён <span style="color:var(--muted);font-weight:500">· ' + contribStr + '</span></span></div>');
    });
    return '<div style="margin-top:10px;padding:10px 12px;background:rgba(34,211,238,.04);border:1px solid rgba(34,211,238,.18);border-radius:8px">' +
      '<div style="font-size:10px;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin-bottom:5px">📊 Итоговые эффекты древа</div>' +
      rows.join('') +
    '</div>';
  }

  function _renderNodeCell(n, b) {
    const owned    = _isNodeOwned(n.id);
    const unlocked = isNodeUnlocked(n.id);
    const can      = canPurchaseNode(n.id);
    // v0.3: учитываем взаимоисключения tier 4 a/b
    const conflicts = getConflictingTreeNodes(n.id);
    const blockerId = !owned && conflicts.find(x => _isNodeOwned(x));
    const isExcluded = !!blockerId;
    // Цветовая разметка по состоянию
    let borderColor, bg, statusHtml, opacity;
    if (owned) {
      borderColor = 'rgba(34,211,238,.5)';
      bg          = 'rgba(34,211,238,.07)';
      opacity     = '1';
      statusHtml  = '<div style="font-size:9px;color:#22d3ee;font-weight:700">✓ Куплен</div>';
    } else if (isExcluded) {
      const bp = _getTreeNode(blockerId);
      const bIcon = bp ? bp.icon : '⛔';
      const bName = bp ? bp.name : blockerId;
      borderColor = 'rgba(248,81,73,.25)';
      bg          = 'rgba(248,81,73,.04)';
      opacity     = '.6';
      statusHtml  = '<div style="font-size:9px;font-weight:700;color:#fca5a5" title="Заблокирован: ' + bName + '">' + bIcon + ' Несовместимо</div>';
    } else if (!unlocked) {
      borderColor = 'var(--border)';
      bg          = 'rgba(255,255,255,.015)';
      opacity     = '.45';
      statusHtml  = '<div style="font-size:9px;color:var(--muted);font-weight:700">🔒 Заблокирован</div>';
    } else if (!can.ok) {
      borderColor = 'var(--border)';
      bg          = 'rgba(255,255,255,.025)';
      opacity     = '.8';
      statusHtml  = '<button disabled style="background:rgba(255,255,255,.03);border:1px solid var(--border);color:var(--muted);padding:3px 8px;border-radius:5px;font-size:9px;font-weight:700;cursor:not-allowed;width:100%">★' + n.cost + ' (не хватает)</button>';
    } else {
      borderColor = b.color + '55';
      bg          = 'rgba(255,255,255,.03)';
      opacity     = '1';
      statusHtml  = '<button onclick="LivingMarket._buyNode(\'' + n.id + '\')" style="background:' + b.color + ';border:none;color:#0a0a0a;padding:3px 8px;border-radius:5px;font-size:9px;font-weight:700;cursor:pointer;width:100%">Купить · ★' + n.cost + '</button>';
    }
    // Силуэт для locked (стадия не достигнута): имя + иконка приглушены, описание скрыто.
    // Для excluded — описание показываем, чтобы игрок видел, ЧТО он отдал, выбрав другую ветку.
    const descHtml = (!unlocked && !owned)
      ? '<div style="font-size:9px;color:var(--muted);line-height:1.3;font-style:italic">…</div>'
      : '<div style="font-size:9px;color:var(--sub);line-height:1.3">' + n.desc + '</div>';
    // Подпись «Несовместимо: …» показываем у всех узлов с конфликтами (даже до покупки),
    // чтобы выбор был осознанным до клика «Купить».
    let conflictLine = '';
    if (conflicts.length) {
      const names = conflicts.map(id => {
        const cn = _getTreeNode(id);
        return cn ? cn.icon + ' ' + cn.name : id;
      }).join(' / ');
      conflictLine = '<div style="font-size:8px;color:var(--muted);margin-top:2px;line-height:1.3">⇄ ' + (owned || isExcluded ? '' : 'или ') + names + '</div>';
    }
    // v0.5: подпись «дублирует engine-апгрейд», если игрок уже купил
    // пересекающийся апгрейд в старой прокачке. Не блокирует покупку —
    // только информационно, чтобы игрок осознавал, что эффекты сложатся.
    let dupLine = '';
    const duplicates = getDuplicatedEngineUpgrades(n.id);
    if (duplicates.length && !owned) {
      const dupNames = duplicates.map(uid => {
        if (typeof UPGRADES === 'undefined' || !UPGRADES) return uid;
        const u = UPGRADES.find(x => x.id === uid);
        return u ? (u.icon || '') + ' ' + (u.name || uid) : uid;
      }).join(' / ');
      dupLine = '<div style="font-size:8px;color:#fbbf24;margin-top:2px;line-height:1.3" title="Эффекты сложатся — это не блокировка, просто предупреждение">⚠ Дублирует: ' + dupNames + '</div>';
    }
    return '<div style="border:1px solid ' + borderColor + ';background:' + bg + ';border-radius:7px;padding:7px;display:flex;flex-direction:column;gap:4px;opacity:' + opacity + ';min-height:90px">' +
      '<div style="display:flex;align-items:center;gap:5px"><span style="font-size:15px">' + n.icon + '</span><span style="font-size:10px;font-weight:700;color:var(--text)">' + n.name + '</span></div>' +
      descHtml +
      conflictLine +
      dupLine +
      '<div style="margin-top:auto">' + statusHtml + '</div>' +
    '</div>';
  }

  // Хелпер для inline-onclick: купить + перерисовать модал
  function _buyNode(id) {
    const r = purchaseTreeNode(id);
    showTreeModal();
    return r;
  }

  // v0.4: inline-helper для кнопки респека в шапке ветки
  function _doRespec(branchId) {
    const r = respecBranch(branchId);
    showTreeModal();
    return r;
  }

  // ── Подключаем обёртки ───────────────────────────────────────────────

  // 1) startGame: инициализация стейта + подмена winCondition.
  if (typeof window.startGame === 'function' && !window.startGame.__livingMarketWrapped) {
    const _orig = window.startGame;
    window.startGame = function () {
      const r = _orig.apply(this, arguments);
      try {
        _initLiving();
        _suppressWin();
        _tickStages();
        _tickMilestones();
        _renderStagePill();
      } catch (e) { try { console.warn('[livingmarket] startGame wrap', e); } catch (_) {} }
      return r;
    };
    window.startGame.__livingMarketWrapped = true;
  }

  // 2) advanceMonth: проверка стадий + майлстоунов после каждого тика.
  // Пик кассы фиксируем ДО оригинальной advanceMonth (чтобы зафиксировать
  // значение, которое могло быть выше до списания overhead/зарплат) и
  // повторно ПОСЛЕ (на случай поступления денег внутри тика — события,
  // milestone-выплаты, переходы по фазам lifecycle).
  // XP за сдачи начисляем ПОСЛЕ оригинала — finishDelivery работает внутри
  // tick'а через projects.js и пушит в completedProjects.
  if (typeof window.advanceMonth === 'function' && !window.advanceMonth.__livingMarketWrapped) {
    const _orig = window.advanceMonth;
    window.advanceMonth = function () {
      try { _initLiving(); _updateMoneyPeak(); } catch (_) {}
      const r = _orig.apply(this, arguments);
      try {
        _initLiving();
        _updateMoneyPeak();
        _awardDeliveryXp();
        _tickStages();
        _tickMilestones();
        _renderStagePill();
      } catch (e) { try { console.warn('[livingmarket] advanceMonth wrap', e); } catch (_) {} }
      return r;
    };
    window.advanceMonth.__livingMarketWrapped = true;
  }

  // 3) При каждом «render» — обновляем пилюлю (стейт мог поменяться
  // вне advanceMonth: ручной найм/увольнение, апгрейды и т.д.)
  if (typeof EventBus !== 'undefined' && EventBus.on) {
    EventBus.on('render', () => {
      try {
        if (typeof G !== 'undefined' && G && G._spec) {  // партия запущена
          _initLiving();
          _renderStagePill();
        }
      } catch (e) {}
    });
  }

  // ── Публичный API (для тестов и UI-кнопок) ──────────────────────────
  window.LivingMarket = {
    version:           VERSION,
    enabled:           LIVING_MARKET_ENABLED,
    getStages:         () => STAGES.slice(),
    getCurrentStage:   () => STAGES[_stageIdx(G)],
    getNextStage:      () => STAGES[_stageIdx(G) + 1] || null,
    getJournal:        () => ((G && G.living && G.living.journal) || []).slice(),
    getMilestones:     () => _milestones(G || {}),
    getFiredMilestoneIds: () => ((G && G.living && G.living.milestonesFired) || []).slice(),
    showJournalModal,
    // v0.2 (Фаза B) — древо 2.0 + XP
    getXp:                () => Math.floor((G && G.xp) || 0),
    getXpEarned:          () => Math.floor((G && G.living && G.living.xpEarned) || 0),
    getTreeBranches:      () => TREE_BRANCHES.slice(),
    getTreeNodes:         () => TREE_NODES.slice(),
    getTierStageGates:    () => TIER_STAGE_GATES.slice(),
    isNodeUnlocked,
    canPurchaseNode,
    purchaseTreeNode,
    getConflictingTreeNodes,
    // v0.4 (Фаза B шаг 3) — респец
    canRespecBranch,
    respecBranch,
    getRespecsUsed:     () => ((G && G.living && G.living.tree2 && G.living.tree2.respecsUsed) || []).slice(),
    getNodeDelta:       (id) => ((G && G.living && G.living.tree2 && G.living.tree2.purchasedDetails) || {})[id] || null,
    // v0.5 (Фаза B шаги 2 lite + 7)
    getDuplicatedEngineUpgrades,
    getEffectsSummary,
    getChannelLabels:   () => Object.assign({}, CHANNEL_LABELS),
    getPurchasedNodeIds:  () => ((G && G.living && G.living.tree2 && G.living.tree2.purchased) || []).slice(),
    showTreeModal,
    _buyNode,
    _doRespec,
    _awardXp,                              // публичен для dev-вмешательства
    // dev/test
    _initLiving,
    _suppressWin,
    _tickStages,
    _tickMilestones,
    _awardDeliveryXp,
    _countDeliveries,
    _countStaff,
    _cumulativeRevenue,
    _formatMoneyShort,
  };

  try {
    const t4count = TREE_NODES.filter(n => n.tier === 4).length;
    console.log('[livingmarket] ' + VERSION + ' активирован: ' + STAGES.length + ' стадий (3 живых, 3 требуют модуль рынка), древо 2.0: ' + TREE_NODES.length + ' узлов (tier 4 пар: ' + (t4count / 2) + ')');
  } catch (e) {}
})();
