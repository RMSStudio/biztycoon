'use strict';
// ══════════════════════════════════════════════════════════════════════
//   src/livingmarket.js — Живой рынок: бесконечная прогрессия
//   v0.5 (2026-06-15) · Тип A · Фаза A шаг 2 — годовые итоги M12/M24/…
//   (см. design_living_market.md §6, ответ §9.6)
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

  // v0.6 (Фаза B, шаг 2 полный): tree 2.0 как ОСНОВНОЙ канал прогрессии.
  // При ON — старая engine-прокачка скрывается из UI и блокируется на
  // покупку.  Оба варианта остаются в коде — откат к старой прокачке
  // требует одной правки (поставить false и перезагрузить).
  //
  // Откат: USE_TREE2_PROGRESSION = false → openPerkModal снова показывает
  // engine-древо, buyUpgrade не блокируется, ничего больше не меняется.
  const USE_TREE2_PROGRESSION = true;

  const VERSION = 'v0.9';

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
      sub: '25 сдач · штат 10 · топ-3 рейтинга рынка · 60M ₽',
      gate: (g) => {
        const dels  = _countDeliveries(g);
        const staff = _countStaff(g);
        const rev   = _cumulativeRevenue(g);
        const rank  = (g.market && g.market.playerRank != null) ? g.market.playerRank : 999;
        return _composite([
          { label: 'сдач',          cur: dels,          max: 25 },
          { label: 'штат',          cur: staff,         max: 10 },
          { label: 'выручка',       cur: rev,           max: 60_000_000, fmt: 'money' },
          { label: 'топ-3 рейтинга',cur: rank <= 3 ? 1 : 0, max: 1 },
        ]);
      },
      unlocks: 'второй офис (+capacity), хантинг у конкурентов, T5-сделки',
    },
    {
      id: 'holding',
      idx: 4,
      name: 'Холдинг',
      icon: '🏛',
      color: '#facc15',
      sub: '50 сдач · штат 18 · №1 рейтинга ≥3 мес. · 200M ₽',
      gate: (g) => {
        const dels       = _countDeliveries(g);
        const staff      = _countStaff(g);
        const rev        = _cumulativeRevenue(g);
        const monthsAt1  = (g.market && g.market.monthsAtRank1) || 0;
        return _composite([
          { label: 'сдач',              cur: dels,       max: 50 },
          { label: 'штат',              cur: staff,      max: 18 },
          { label: 'выручка',           cur: rev,        max: 200_000_000, fmt: 'money' },
          { label: 'мес. на #1 рейтинга', cur: monthsAt1, max: 3 },
        ]);
      },
      unlocks: 'саббренды (параллельные команды), поглощение конкурентов, T6',
    },
    {
      id: 'empire',
      idx: 5,
      name: 'Империя',
      icon: '👑',
      color: '#fde047',
      sub: '100 сдач · поглощён ≥1 конкурент · 500M ₽',
      gate: (g) => {
        const dels = _countDeliveries(g);
        const rev  = _cumulativeRevenue(g);
        const acq  = (g.market && g.market.acquisitions) || 0;
        return _composite([
          { label: 'сдач',         cur: dels, max: 100 },
          { label: 'выручка',      cur: rev,  max: 500_000_000, fmt: 'money' },
          { label: 'поглощений',   cur: acq,  max: 1 },
        ]);
      },
      unlocks: 'T7, престиж-цели, режим «легаси»',
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
      flags: ['perkPenaltyShield'],
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
      flags: ['perkInstantSpeed'],
      apply: g => { g.speedUpgrades = (g.speedUpgrades || 0) + 0.05; g.perkInstantSpeed = true; } },
    { id: 'prod3', branch: 'production', tier: 3, icon: '🚀', name: 'Автоматизация', desc: '+10% к скорости команды',                         cost: 340,
      apply: g => { g.speedUpgrades = (g.speedUpgrades || 0) + 0.10; } },
    { id: 'prod4',  branch: 'production', tier: 4, icon: '⚙️', name: 'Конвейер',     desc: '+15% к скорости · −1 фазе у epic-цепочек',        cost: 720,
      excludes: ['prod4b'],
      flags: ['perkEpicShortcut'],
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
      flags: ['perkPenaltyShield'],
      apply: g => { g.perkPrepayBonus = (g.perkPrepayBonus || 0) + 0.15; g.perkPenaltyShield = true; } },
    { id: 'deal4b', branch: 'deals', tier: 4, icon: '⚔️', name: 'Финансовый агрессор',
      desc: '+15% к выплатам со всех сделок (стек) — давим маржой вместо защиты',  cost: 720,
      excludes: ['deal4'],
      apply: g => { g.perkPayoutMult = (g.perkPayoutMult || 0) + 0.15; } },
    { id: 'deal5', branch: 'deals', tier: 5, icon: '🏭', name: 'M&A-отдел',          desc: '(Фаза C) Поглощения конкурентов дешевле',          cost: 1200,
      apply: g => { /* подключается в Фазе C */ } },
  ];

  // ── Майлстоуны: DSL + чтение из сценария (v0.8, Фаза A шаг 3) ─────────
  // Источник истины — `SCENARIO.milestones` (Тип C, чистые данные).  Если
  // в сценарии нет `milestones`, используется встроенный `_milestonesBuiltin`
  // как back-compat fallback (тот же контент, что был до v0.8).
  //
  // Формат сценарного майлстоуна:
  //   { id, icon, name, desc, tier: 'micro'|'middle'|'large', when: {...} }
  //
  // Поля `when` объединяются логическим И (срабатывает только когда ВСЕ
  // условия выполнены).  Поддерживаемые операторы:
  //   • deliveriesAtLeast: N        — кол-во записей в G.completedProjects
  //   • staffAtLeast: N             — кол-во сотрудников в G.staff
  //   • moneyAtLeast: N|'originalWin'  — текущий G.money ≥ порога
  //   • peakMoneyAtLeast: N|'originalWin' — пик кассы за партию
  //   • revenueAtLeast: N           — накопленная выручка (sum revenue)
  //   • reputationAtLeast: N        — G.reputation ≥ N
  //   • portfolioAtLeast: N         — G.portfolio ≥ N
  //   • stageAtLeast: N             — индекс достигнутой стадии
  //
  // Токен `$win` в поле desc заменяется отформатированным originalWinCondition
  // (бывшая win-цель сценария), чтобы конкретное число не приходилось
  // дублировать в data.

  function _compileMilestoneWhen(when) {
    if (!when || typeof when !== 'object') return () => false;
    return function (g) {
      const winOrig = (g.living && g.living.originalWinCondition) || 0;
      const resolveTarget = v => (v === 'originalWin' || v === 'winCondition') ? winOrig : v;
      if ('deliveriesAtLeast' in when && _countDeliveries(g) < when.deliveriesAtLeast) return false;
      if ('staffAtLeast'      in when && _countStaff(g)      < when.staffAtLeast)      return false;
      if ('moneyAtLeast'      in when && (g.money || 0)      < resolveTarget(when.moneyAtLeast)) return false;
      if ('peakMoneyAtLeast'  in when) {
        const peak = (g.living && g.living._peakMoney != null) ? g.living._peakMoney : (g.money || 0);
        if (peak < resolveTarget(when.peakMoneyAtLeast)) return false;
      }
      if ('revenueAtLeast'    in when && _cumulativeRevenue(g) < when.revenueAtLeast)   return false;
      if ('reputationAtLeast' in when && (g.reputation || 0)   < when.reputationAtLeast) return false;
      if ('portfolioAtLeast'  in when && (g.portfolio || 0)    < when.portfolioAtLeast)  return false;
      if ('stageAtLeast'      in when && _stageIdx(g)          < when.stageAtLeast)      return false;
      return true;
    };
  }

  function _resolveMilestoneDesc(desc, g) {
    if (typeof desc !== 'string') return desc || '';
    if (desc.indexOf('$win') === -1) return desc;
    const orig = (g.living && g.living.originalWinCondition) || 0;
    return desc.split('$win').join(_formatMoneyShort(orig));
  }

  function _scenarioMilestones(g) {
    if (typeof SCENARIO === 'undefined' || !SCENARIO || !Array.isArray(SCENARIO.milestones)) return null;
    return SCENARIO.milestones.map(m => ({
      id:    m.id,
      icon:  m.icon || '🎯',
      name:  m.name || m.id,
      desc:  _resolveMilestoneDesc(m.desc, g),
      tier:  m.tier || 'micro',
      cond:  _compileMilestoneWhen(m.when),
    }));
  }

  function _milestones(g) {
    const sc = _scenarioMilestones(g);
    if (sc && sc.length) return sc;
    return _milestonesBuiltin(g);
  }

  function _milestonesBuiltin(g) {
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
        // { mul: 0.9 } (делим обратно); boolean → { setBool: true }.
        // v0.7 (Фаза B шаг 6): boolean-флаги теперь снимаются на респеке
        // через refcounting tree2-источников + baseline-снимок.
        purchasedDetails:    {},
        // v0.4: история респеков для лимита 1 на ветку на стадию.
        // [{ stage: 1, branch: 'craft', ts, refunded: 200, nodes: ['craft1','craft2'] }]
        respecsUsed:         [],
        // v0.7: refcount tree2-узлов, выставивших boolean-флаг.
        // При покупке инкрементируем, при респеке декрементируем.
        // { perkPenaltyShield: 2, perkInstantSpeed: 1, ... }
        _flagRefcount:       {},
        // v0.7: было ли значение флага true ДО ПЕРВОЙ tree2-покупки.
        // Если true (мета-перк/runMap-бонус уже включил его) — на
        // последнем респеке tree2 НЕ снимаем; если false — снимаем.
        // { perkPenaltyShield: true|false }
        _flagBaseline:       {},
      },
      _xpLog:                [],         // последние 10 начислений (для UI: «+15 ★ Первый найм»)
      _lastDeliveryCount:    0,          // трекер для diff-начисления XP за сдачи
      // v0.5 (Фаза A шаг 2): годовые итоги M12/M24/…
      // yearly — рантайм-снапшот текущего «незакрытого» года (база сравнения).
      // yearlyReports[] — собранные итоги: триггерится каждые 12 месяцев,
      // запись хранит цифры выручки/сдач/команды/тиров за период и выводится
      // модалом-церемонией «Год N завершён». Все отчёты переоткрываются
      // из журнала прогресса (компактный список карточек).
      yearly:                {
        yearIdx:                0,        // сколько лет уже закрыто (0 — ещё нет)
        yearStartMonth:         0,        // G.month на момент начала текущего года
        yearStartMoney:         0,
        yearStartStaffIds:      [],
        yearStartCompletedLen:  0,
        yearStartStage:         0,
        yearStartReputation:    0,
        yearStartPortfolio:     0,
      },
      yearlyReports:         [],
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
      // v0.7: миграция refcount/baseline. У сейвов до v0.7 их нет, но мы
      // не пересчитываем по факту (G уже мутирован purchases раньше) —
      // просто инициализируем пустыми. Это означает: респек узла, купленного
      // ДО апгрейда до v0.7, не снимет boolean-флаг (нет данных о baseline).
      // Это безопасный fallback — игрок не теряет эффекты, но при следующих
      // покупках/респеках всё работает корректно.
      if (G.living.tree2 && !G.living.tree2._flagRefcount) G.living.tree2._flagRefcount = {};
      if (G.living.tree2 && !G.living.tree2._flagBaseline) G.living.tree2._flagBaseline = {};
      // v0.5: миграция yearly. У старых сейвов нет, инициализируем по факту
      // текущего G — если игрок уже играл 8 месяцев, год начнётся с этого
      // месяца как «базы» (не пересчитываем заднюю историю).
      if (!G.living.yearly) {
        G.living.yearly = d.yearly;
        G.living.yearly.yearStartMonth = (G.month || 0);
        G.living.yearly.yearStartMoney = (G.money || 0);
        G.living.yearly.yearStartStaffIds = (G.staff || []).map(s => s && s.id).filter(Boolean);
        G.living.yearly.yearStartCompletedLen = (G.completedProjects || []).length;
        G.living.yearly.yearStartStage = (typeof G.living.stage === 'number' ? G.living.stage : 0);
        G.living.yearly.yearStartReputation = (G.reputation || 0);
        G.living.yearly.yearStartPortfolio = (G.portfolio || 0);
      }
      if (!G.living.yearlyReports) G.living.yearlyReports = [];
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
  // Boolean-флаги обрабатываются ОТДЕЛЬНО через _releaseBoolFlags
  // (refcounting tree2-источников + baseline-снимок).  См. v0.7.
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
      // boolean — обрабатывается в _releaseBoolFlags до этого вызова
    }
  }

  // v0.7 (Фаза B шаг 6): refcount boolean-флагов tree 2.0.
  // Источник флагов — декларативное поле `node.flags = ['perkPenaltyShield', ...]`,
  // а не delta. Причина: `_computeTreeDelta` не записывает setBool, если флаг
  // уже был true к моменту apply (например, первый узел его выставил, и второй
  // не «меняет» значения). Refcount должен считать все tree2-источники, поэтому
  // используем явное объявление в узле.
  //
  // Вызывается ПОСЛЕ apply узла. beforeSnap — снимок каналов G до apply,
  // нужен для baseline (был ли флаг включён ДО первой tree2-покупки).
  function _acquireBoolFlags(node, beforeSnap) {
    if (!G || !G.living || !G.living.tree2 || !node) return;
    const flags = node.flags || [];
    if (!flags.length) return;
    const rc = G.living.tree2._flagRefcount = G.living.tree2._flagRefcount || {};
    const bl = G.living.tree2._flagBaseline = G.living.tree2._flagBaseline || {};
    flags.forEach(k => {
      if ((rc[k] || 0) === 0) {
        // Первый tree2-источник — фиксируем baseline (значение ДО apply).
        // Если до tree2 он был true — другой источник его уже выставил,
        // на финальном респеке tree2 не должен его снимать.
        bl[k] = !!(beforeSnap || {})[k];
      }
      rc[k] = (rc[k] || 0) + 1;
    });
  }

  // Вызывается в respecBranch для КАЖДОГО узла ДО _applyInverseTreeDelta.
  // Декрементирует refcount; на 0, если baseline=false (флаг был выключен до tree2)
  // — снимает флаг с G. Если baseline=true — оставляет (внешний источник).
  function _releaseBoolFlags(g, node) {
    if (!g || !g.living || !g.living.tree2 || !node) return;
    const flags = node.flags || [];
    if (!flags.length) return;
    const rc = g.living.tree2._flagRefcount = g.living.tree2._flagRefcount || {};
    const bl = g.living.tree2._flagBaseline = g.living.tree2._flagBaseline || {};
    flags.forEach(k => {
      rc[k] = Math.max(0, (rc[k] || 0) - 1);
      if (rc[k] === 0) {
        // Последний tree2-источник снят. Если до tree2 флаг был выключен —
        // безопасно снимаем; если был включён извне — оставляем.
        if (bl[k] === false) {
          g[k] = false;
        }
        delete bl[k];
        delete rc[k];
      }
    });
  }

  function purchaseTreeNode(id) {
    const r = canPurchaseNode(id);
    if (!r.ok) return r;
    const n = r.node;
    G.xp = (G.xp || 0) - n.cost;
    G.living.xp = (G.living.xp || 0) - n.cost;
    G.living.tree2 = G.living.tree2 || { purchased: [], purchasedDetails: {}, respecsUsed: [], _flagRefcount: {}, _flagBaseline: {} };
    if (!G.living.tree2.purchasedDetails) G.living.tree2.purchasedDetails = {};
    if (!G.living.tree2.respecsUsed)     G.living.tree2.respecsUsed     = [];
    if (!G.living.tree2._flagRefcount)   G.living.tree2._flagRefcount   = {};
    if (!G.living.tree2._flagBaseline)   G.living.tree2._flagBaseline   = {};
    G.living.tree2.purchased = (G.living.tree2.purchased || []).concat(id);
    // v0.4: снимаем G до и после apply → сохраняем delta для респека
    const before = _snapshotTreeChannels(G);
    try { n.apply(G); } catch (e) { try { console.warn('[livingmarket] node apply', n.id, e); } catch (_) {} }
    const after = _snapshotTreeChannels(G);
    const delta = _computeTreeDelta(before, after);
    G.living.tree2.purchasedDetails[id] = delta;
    // v0.7: фиксируем refcount + baseline для boolean-флагов (через node.flags,
    // не через delta — delta не записывает setBool если флаг уже был true)
    _acquireBoolFlags(n, before);
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
      // v0.7: сначала отпускаем boolean-флаги (через node.flags, с учётом
      // refcount), потом инвертируем numeric/mul.
      _releaseBoolFlags(G, n);
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

  // ── v0.5 (Фаза A шаг 2): Годовые итоги ──────────────────────────────
  // Раз в 12 игровых месяцев — модал-церемония «Год N завершён» с цифрами
  // за прошедший период. После закрытия отчёт остаётся в G.living.yearlyReports
  // и доступен из журнала прогресса (компактные карточки с переоткрытием).
  //
  // Подход без помесячного трекинга: храним только снимок «начала года»
  // (yearStartMoney/Staff/CompletedLen/Stage/Rep/Portfolio), а на момент
  // триггера агрегируем дельту по фактическому G и по
  // `G.completedProjects.slice(yearStartCompletedLen)` — это даёт срез сдач
  // именно за этот год без необходимости месяц за месяцем дублировать данные.
  //
  // Триггер ровно когда (G.month − yearStartMonth) ≥ 12.  После сборки
  // отчёта база сдвигается на текущий месяц, чтобы следующая церемония
  // случилась снова через 12 тиков.

  function _yearlyEnsureStart() {
    if (!G || !G.living) return;
    if (!G.living.yearly) {
      G.living.yearly = _defaults().yearly;
      G.living.yearly.yearStartMonth         = G.month || 0;
      G.living.yearly.yearStartMoney         = G.money || 0;
      G.living.yearly.yearStartStaffIds      = (G.staff || []).map(s => s && s.id).filter(Boolean);
      G.living.yearly.yearStartCompletedLen  = (G.completedProjects || []).length;
      G.living.yearly.yearStartStage         = _stageIdx(G);
      G.living.yearly.yearStartReputation    = G.reputation || 0;
      G.living.yearly.yearStartPortfolio     = G.portfolio || 0;
    }
    if (!G.living.yearlyReports) G.living.yearlyReports = [];
  }

  function _buildYearlyReport(y) {
    const cp = G.completedProjects || [];
    const yearDeliveries = cp.slice(y.yearStartCompletedLen || 0);
    const success = yearDeliveries.filter(d => !d.failed);
    const failed  = yearDeliveries.filter(d => d.failed);
    const yearRevenue = success.reduce((s, d) => s + (d.revenue || 0), 0);
    const byTier = {};
    success.forEach(d => {
      const t = d.tier || 1;
      byTier[t] = (byTier[t] || 0) + 1;
    });
    const tierKeys = Object.keys(byTier).map(Number).sort((a, b) => a - b);
    const topTier  = tierKeys.length ? tierKeys[tierKeys.length - 1] : 0;
    const bestProject = success.slice().sort((a, b) => (b.revenue || 0) - (a.revenue || 0))[0] || null;
    // Staff diff
    const curStaffIds = (G.staff || []).map(s => s && s.id).filter(Boolean);
    const startSet = new Set(y.yearStartStaffIds || []);
    const curSet   = new Set(curStaffIds);
    const hires    = curStaffIds.filter(id => !startSet.has(id)).length;
    const leaves   = (y.yearStartStaffIds || []).filter(id => !curSet.has(id)).length;
    // Майлстоуны/стадии этого года (без узлов древа/респеков/самих year_-записей)
    const newMilestones = (G.living.journal || [])
      .filter(j => (j.month || 0) > (y.yearStartMonth || 0) && (j.month || 0) <= (G.month || 0))
      .filter(j => {
        const id = String(j.id || '');
        return !id.startsWith('respec_') && !id.startsWith('tree_') && !id.startsWith('year_');
      })
      .map(j => ({ id: j.id, icon: j.icon, name: j.name, tier: j.tier, month: j.month }));
    return {
      yearIdx:          (y.yearIdx || 0) + 1,
      monthFrom:        (y.yearStartMonth || 0) + 1,
      monthTo:          G.month || 0,
      startMoney:       y.yearStartMoney || 0,
      endMoney:         G.money || 0,
      netDelta:         (G.money || 0) - (y.yearStartMoney || 0),
      revenue:          yearRevenue,
      deliveries:       success.length,
      failed:           failed.length,
      byTier,
      topTier,
      bestProject:      bestProject ? {
        name:    bestProject.name || 'Проект',
        tier:    bestProject.tier || 1,
        revenue: bestProject.revenue || 0,
        icon:    bestProject.icon || '🏁',
      } : null,
      hires,
      leaves,
      startStaff:       (y.yearStartStaffIds || []).length,
      endStaff:         curStaffIds.length,
      startStage:       y.yearStartStage || 0,
      endStage:         _stageIdx(G),
      startReputation:  y.yearStartReputation || 0,
      endReputation:    G.reputation || 0,
      startPortfolio:   y.yearStartPortfolio || 0,
      endPortfolio:     G.portfolio || 0,
      newMilestones,
      ts:               Date.now(),
    };
  }

  function _maybeTriggerYearly() {
    if (!G || !G.living) return;
    _yearlyEnsureStart();
    const y   = G.living.yearly;
    const cur = G.month || 0;
    const elapsed = cur - (y.yearStartMonth || 0);
    if (elapsed < 12) return;
    const report = _buildYearlyReport(y);
    G.living.yearlyReports.push(report);
    // Запись в journal — компактная, без дублирования цифр модала
    G.living.journal.push({
      id:    'year_' + report.yearIdx,
      icon:  '📅',
      name:  'Год ' + report.yearIdx + ' завершён',
      desc:  'Выручка ' + _formatMoneyShort(report.revenue) + ' · ' + report.deliveries + ' сдач · команда ' + report.endStaff + ' чел.',
      tier:  'large',
      month: cur,
      ts:    Date.now(),
    });
    // Сдвиг базы на следующий год
    y.yearIdx                 = report.yearIdx;
    y.yearStartMonth          = cur;
    y.yearStartMoney          = G.money || 0;
    y.yearStartStaffIds       = (G.staff || []).map(s => s && s.id).filter(Boolean);
    y.yearStartCompletedLen   = (G.completedProjects || []).length;
    y.yearStartStage          = _stageIdx(G);
    y.yearStartReputation     = G.reputation || 0;
    y.yearStartPortfolio      = G.portfolio || 0;
    // EventBus + UI
    if (typeof EventBus !== 'undefined' && EventBus.emit) {
      EventBus.emit('yearly_report', { report });
    }
    if (typeof notify === 'function') {
      notify('📅 Год ' + report.yearIdx + ' завершён · выручка ' + _formatMoneyShort(report.revenue), 'success');
    }
    if (typeof addLog === 'function') {
      addLog('📅 Год ' + report.yearIdx + ': выручка ' + _formatMoneyShort(report.revenue) + ', сдач ' + report.deliveries, 'amber');
    }
    _showYearlyReportModal(report);
  }

  // ── UI: модал годового итога ─────────────────────────────────────────
  function _showYearlyReportModal(report) {
    if (typeof document === 'undefined' || !report) return;
    let m = document.getElementById('lm-yearly-modal');
    if (!m) {
      m = document.createElement('div');
      m.id = 'lm-yearly-modal';
      m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.86);z-index:345;display:flex;align-items:center;justify-content:center';
      m.onclick = e => { if (e.target === m) m.style.display = 'none'; };
      document.body.appendChild(m);
    }
    const r = report;
    const sign     = r.netDelta >= 0 ? '+' : '−';
    const netStr   = sign + _formatMoneyShort(Math.abs(r.netDelta));
    const netColor = r.netDelta >= 0 ? '#86efac' : '#fca5a5';
    const tierKeys = Object.keys(r.byTier || {}).sort((a, b) => +b - +a);
    const tierRows = tierKeys.length
      ? tierKeys.map(t => '<span style="display:inline-block;padding:2px 7px;border:1px solid var(--border);border-radius:999px;font-size:10px;font-weight:700;color:var(--text);background:rgba(255,255,255,.04);margin:2px 4px 2px 0">T' + t + ' ×' + r.byTier[t] + '</span>').join('')
      : '<span style="font-size:10px;color:var(--muted);font-style:italic">нет сдач</span>';
    const bestStr = r.bestProject
      ? '<div style="margin-top:8px;font-size:11px;color:var(--sub)">Лучший проект: <b style="color:var(--text)">' + r.bestProject.icon + ' ' + r.bestProject.name + '</b> · T' + r.bestProject.tier + ' · ' + _formatMoneyShort(r.bestProject.revenue) + '</div>'
      : '<div style="margin-top:8px;font-size:11px;color:var(--muted);font-style:italic">В этом году сдач не было</div>';
    const milestonesHtml = (r.newMilestones || []).length
      ? '<div style="margin-top:12px"><div style="font-size:10px;color:var(--muted);font-weight:700;letter-spacing:.08em;text-transform:uppercase;margin-bottom:5px">Достижения года</div>' +
        '<div style="display:flex;flex-wrap:wrap;gap:4px">' +
          r.newMilestones.slice(0, 8).map(mm =>
            '<span style="font-size:10px;border:1px solid var(--border);border-radius:6px;padding:3px 7px;color:var(--text);background:rgba(255,255,255,.03)" title="' + mm.name + '">' + mm.icon + ' ' + mm.name + '</span>'
          ).join('') +
          (r.newMilestones.length > 8 ? '<span style="font-size:10px;color:var(--muted);align-self:center;margin-left:4px">+' + (r.newMilestones.length - 8) + '</span>' : '') +
        '</div></div>'
      : '';
    m.innerHTML =
      '<div style="background:var(--panel);border:2px solid #fbbf24;border-radius:14px;padding:26px;max-width:560px;width:90vw;box-shadow:0 0 60px rgba(251,191,36,.25)">' +
        '<div style="display:flex;align-items:center;gap:14px;margin-bottom:14px">' +
          '<div style="font-size:46px;line-height:1">📅</div>' +
          '<div>' +
            '<div style="font-size:11px;color:var(--muted);font-weight:700;letter-spacing:.13em;text-transform:uppercase">Годовой итог</div>' +
            '<div style="font-size:24px;font-weight:800;color:#fbbf24;line-height:1.1">Год ' + r.yearIdx + '</div>' +
            '<div style="font-size:10px;color:var(--sub);margin-top:2px">M' + r.monthFrom + ' — M' + r.monthTo + '</div>' +
          '</div>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">' +
          '<div style="border:1px solid var(--border);background:rgba(255,255,255,.03);border-radius:8px;padding:10px 12px">' +
            '<div style="font-size:9px;color:var(--muted);font-weight:700;letter-spacing:.08em;text-transform:uppercase">Выручка</div>' +
            '<div style="font-size:18px;font-weight:800;color:var(--text);margin-top:2px">' + _formatMoneyShort(r.revenue) + '</div>' +
          '</div>' +
          '<div style="border:1px solid var(--border);background:rgba(255,255,255,.03);border-radius:8px;padding:10px 12px">' +
            '<div style="font-size:9px;color:var(--muted);font-weight:700;letter-spacing:.08em;text-transform:uppercase">Чистая дельта</div>' +
            '<div style="font-size:18px;font-weight:800;color:' + netColor + ';margin-top:2px">' + netStr + '</div>' +
          '</div>' +
        '</div>' +
        '<div style="border:1px solid var(--border);background:rgba(255,255,255,.02);border-radius:8px;padding:10px 12px;margin-bottom:10px">' +
          '<div style="display:flex;justify-content:space-between;font-size:11px;color:var(--sub)">' +
            '<span>📦 Сдач: <b style="color:var(--text)">' + r.deliveries + '</b>' + (r.failed ? ' · <span style="color:#fca5a5">провалов: ' + r.failed + '</span>' : '') + '</span>' +
            '<span>Топ-тир: <b style="color:var(--text)">T' + r.topTier + '</b></span>' +
          '</div>' +
          '<div style="margin-top:6px">' + tierRows + '</div>' +
          bestStr +
        '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">' +
          '<div style="border:1px solid var(--border);background:rgba(255,255,255,.02);border-radius:8px;padding:10px 12px">' +
            '<div style="font-size:10px;color:var(--muted);font-weight:700">👥 Команда</div>' +
            '<div style="font-size:13px;font-weight:700;color:var(--text);margin-top:3px">' + r.startStaff + ' → ' + r.endStaff + ' чел.</div>' +
            '<div style="font-size:10px;color:var(--sub);margin-top:2px">+' + r.hires + ' найм · −' + r.leaves + ' ушли</div>' +
          '</div>' +
          '<div style="border:1px solid var(--border);background:rgba(255,255,255,.02);border-radius:8px;padding:10px 12px">' +
            '<div style="font-size:10px;color:var(--muted);font-weight:700">⭐ Реп. / Портфолио</div>' +
            '<div style="font-size:13px;font-weight:700;color:var(--text);margin-top:3px">' + r.startReputation + ' → ' + r.endReputation + ' · ' + r.startPortfolio + ' → ' + r.endPortfolio + '</div>' +
          '</div>' +
        '</div>' +
        milestonesHtml +
        '<div style="display:flex;gap:8px;justify-content:center;margin-top:18px">' +
          '<button onclick="document.getElementById(\'lm-yearly-modal\').style.display=\'none\'" style="background:#fbbf24;border:none;color:#111;font-weight:700;padding:10px 24px;border-radius:8px;cursor:pointer;font-size:12px">Продолжить</button>' +
        '</div>' +
      '</div>';
    m.style.display = 'flex';
  }

  function showYearlyReport(idx) {
    const reports = (G && G.living && G.living.yearlyReports) || [];
    if (!reports.length) return null;
    const i = (idx == null) ? reports.length - 1 : Math.max(0, Math.min(reports.length - 1, idx | 0));
    _showYearlyReportModal(reports[i]);
    return reports[i];
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

  // ── Фаза C: Конкуренты рынка ──────────────────────────────────────────
  // 5 ИИ-агентств с фиксированными архетипами.  Каждый месяц
  // _processMarketMonth() начисляет им псевдо-выручку по модели архетипа,
  // обновляет рейтинг (G.market.playerRank) и счётчики
  // (monthsAtRank1 — для гейта Холдинга, acquisitions — для Империи).
  //
  // Стейт: G.market = { competitors[], playerRank, monthsAtRank1, acquisitions }
  // Хранится в сейве через saves.js (_snap/G целиком).
  // _lastRankings — кэш рейтинга, пересчитывается каждый месяц, НЕ в сейве.

  const COMPETITOR_ARCHETYPES = {
    dumper:    { name: 'Демпер',       icon: '🔨', desc: 'Берёт объёмом, цена ниже рынка',       revenueRange: [150_000, 400_000] },
    boutique:  { name: 'Бутик',        icon: '💎', desc: 'Высокий чек, нишевые проекты',          revenueRange: [180_000, 480_000] },
    machine:   { name: 'Машина найма', icon: '🏭', desc: 'Агрессивный рост команды и мощности',   revenueRange: [220_000, 520_000] },
    networker: { name: 'Сетевик',      icon: '🌐', desc: 'Репутация и партнёрская сеть',           revenueRange: [100_000, 280_000] },
    wildcard:  { name: 'Дикая карта',  icon: '🃏', desc: 'Непредсказуемые скачки роста',            revenueRange: [50_000,  750_000] },
  };

  function _createCompetitors() {
    return Object.keys(COMPETITOR_ARCHETYPES).map((arch) => ({
      id:            'comp_' + arch,
      name:          COMPETITOR_ARCHETYPES[arch].name,
      icon:          COMPETITOR_ARCHETYPES[arch].icon,
      archetype:     arch,
      revenue:       0,
      reputation:    Math.floor(20 + Math.random() * 30),
      deliveries:    0,
      monthlyRevenue: 0,
    }));
  }

  function _initMarket() {
    if (typeof G === 'undefined' || !G) return;
    if (!G.market) {
      G.market = {
        competitors:   _createCompetitors(),
        playerRank:    null,
        monthsAtRank1: 0,
        acquisitions:  0,
      };
    } else {
      // back-compat: добиваем недостающие поля
      if (!G.market.competitors || !G.market.competitors.length)
        G.market.competitors = _createCompetitors();
      if (G.market.monthsAtRank1 == null) G.market.monthsAtRank1 = 0;
      if (G.market.acquisitions  == null) G.market.acquisitions  = 0;
    }
  }

  function _competitorMonthlyDelta(archetype) {
    const a = COMPETITOR_ARCHETYPES[archetype] || COMPETITOR_ARCHETYPES.dumper;
    const [lo, hi] = a.revenueRange;
    return Math.round((lo + Math.random() * (hi - lo)) / 1000) * 1000;
  }

  function _processMarketMonth() {
    if (typeof G === 'undefined' || !G) return;
    _initMarket();
    const market = G.market;
    if (!market || !Array.isArray(market.competitors)) return;

    // Тик каждого конкурента
    for (let i = 0; i < market.competitors.length; i++) {
      const c     = market.competitors[i];
      const delta = _competitorMonthlyDelta(c.archetype);
      c.monthlyRevenue = delta;
      c.revenue       += delta;
      c.deliveries    += Math.round(delta / 220_000);
      if (Math.random() < 0.3) c.reputation = Math.min(100, (c.reputation || 0) + 1);
    }

    _updateMarketRankings();
  }

  // Пересчитать рейтинг и обновить счётчики (вызывать из processMarketMonth).
  function _updateMarketRankings() {
    if (typeof G === 'undefined' || !G || !G.market) return;
    const market    = G.market;
    const playerRev = _cumulativeRevenue(G);

    const entries = [
      { id: 'player', revenue: playerRev },
      ...market.competitors.map(c => ({ id: c.id, revenue: c.revenue })),
    ];
    entries.sort((a, b) => b.revenue - a.revenue);

    const playerPos = entries.findIndex(e => e.id === 'player');
    const newRank   = playerPos + 1;   // 1-indexed

    if (newRank === 1) {
      market.monthsAtRank1 = (market.monthsAtRank1 || 0) + 1;
    } else {
      market.monthsAtRank1 = 0;
    }

    market.playerRank    = newRank;
    market._lastRankings = entries;    // UI-кэш, не сохраняется в save
  }

  // Проставить начальный ранг без изменения счётчиков (для startGame).
  function _setInitialRankings() {
    if (typeof G === 'undefined' || !G || !G.market) return;
    const market    = G.market;
    const playerRev = _cumulativeRevenue(G);
    const entries   = [
      { id: 'player', revenue: playerRev },
      ...market.competitors.map(c => ({ id: c.id, revenue: c.revenue })),
    ];
    entries.sort((a, b) => b.revenue - a.revenue);
    market.playerRank    = entries.findIndex(e => e.id === 'player') + 1;
    market._lastRankings = entries;
    // monthsAtRank1 НЕ трогаем — счётчик растёт только из processMarketMonth
  }

  // ── UI: модал «Рынок» ─────────────────────────────────────────────────

  function showMarketModal() {
    if (typeof document === 'undefined') return;
    let modal = document.getElementById('market-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id        = 'market-modal';
      modal.className = 'modal-overlay';
      modal.innerHTML = `
        <div class="modal" style="max-width:520px;max-height:82vh;overflow:hidden;display:flex;flex-direction:column">
          <div class="modal-header" style="flex-shrink:0">
            <h2 style="margin:0;font-size:15px">📊 Рейтинг рынка</h2>
            <button class="btn btn-ghost" onclick="document.getElementById('market-modal').classList.remove('active')"
                    style="padding:4px 10px">✕</button>
          </div>
          <div id="market-modal-body" style="overflow-y:auto;padding:16px 16px 20px;flex:1"></div>
        </div>`;
      document.body.appendChild(modal);
      modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('active'); });
    }
    _renderMarketModal();
    modal.classList.add('active');
  }

  function _renderMarketModal() {
    const el = document.getElementById('market-modal-body');
    if (!el) return;

    if (typeof G === 'undefined' || !G || !G.market || !(G.month > 0)) {
      el.innerHTML = '<p style="color:var(--muted);font-size:13px">Начни игру, чтобы увидеть рейтинг.</p>';
      return;
    }

    const market    = G.market;
    const playerRev = _cumulativeRevenue(G);
    const fmtM      = v => _formatMoneyShort(v);

    const entries = [
      {
        id: 'player', isPlayer: true,
        name: 'Вы',
        icon: (G._spec && G._spec.icon) || '🏢',
        archetype: null,
        revenue:   playerRev,
        reputation: G.reputation || 0,
        deliveries: (G.completedProjects || []).length,
        monthlyRevenue: null,
      },
      ...market.competitors,
    ];
    entries.sort((a, b) => b.revenue - a.revenue);

    const playerRank = entries.findIndex(e => e.isPlayer) + 1;

    // Заголовок — позиция игрока
    const rankIcon  = playerRank === 1 ? '🏆' : playerRank <= 3 ? '🥈' : '📍';
    const at1Msg    = market.monthsAtRank1 > 0
      ? '🔥 ' + market.monthsAtRank1 + ' мес. подряд на #1'
      : 'Удержите #1 в течение 3 мес. для Холдинга';

    let html = `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;
                  padding:12px;background:rgba(255,255,255,.04);
                  border-radius:8px;border:1px solid var(--border)">
        <div style="font-size:28px;line-height:1">${rankIcon}</div>
        <div>
          <div style="font-size:19px;font-weight:700;color:var(--text)">Место #${playerRank} из ${entries.length}</div>
          <div style="font-size:11px;color:var(--muted);margin-top:2px">${at1Msg}</div>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:5px;margin-bottom:16px">`;

    entries.forEach((e, i) => {
      const rank      = i + 1;
      const rankColor = rank === 1 ? 'var(--yellow)' : rank <= 3 ? 'var(--teal)' : 'var(--muted)';
      const isP       = !!e.isPlayer;
      const arch      = (!isP && COMPETITOR_ARCHETYPES[e.archetype]) ? COMPETITOR_ARCHETYPES[e.archetype].desc : '';
      const monthlyStr = (!isP && e.monthlyRevenue > 0) ? '<div style="font-size:10px;color:var(--muted)">+' + fmtM(e.monthlyRevenue) + '/мес</div>' : '';

      html += `
        <div style="display:flex;align-items:center;gap:10px;padding:9px 12px;
                    border-radius:7px;
                    border:1px solid ${isP ? 'var(--purple)' : 'var(--border)'};
                    background:${isP ? 'rgba(167,139,250,.07)' : 'rgba(255,255,255,.02)'}">
          <div style="font-size:14px;font-weight:800;color:${rankColor};min-width:22px;text-align:center">${rank}</div>
          <div style="font-size:17px">${e.icon}</div>
          <div style="flex:1;min-width:0">
            <div style="font-size:12px;font-weight:600;color:${isP ? 'var(--purple)' : 'var(--text)'}">${e.name}</div>
            ${arch ? '<div style="font-size:10px;color:var(--muted)">' + arch + '</div>' : ''}
          </div>
          <div style="text-align:right;flex-shrink:0">
            <div style="font-size:12px;font-weight:700;color:var(--teal)">${fmtM(e.revenue)}</div>
            ${monthlyStr}
          </div>
        </div>`;
    });

    html += '</div>';

    // Пояснение к гейтам
    const stage     = _stageIdx(G);
    const nextGate  = STAGES[stage + 1];
    if (nextGate && !nextGate.requiresMarket) {
      const gateRes = nextGate.gate(G);
      const gateHtml = gateRes.progress.map(p => {
        const frac = Math.min(1, p.fmt === 'money' ? p.cur / p.max : p.cur / p.max);
        const pct  = Math.round(frac * 100);
        const col  = frac >= 1 ? 'var(--green)' : 'var(--teal)';
        const val  = p.fmt === 'money' ? fmtM(p.cur) + ' / ' + fmtM(p.max) : p.cur + ' / ' + p.max;
        return `<div style="margin-bottom:4px">
          <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--sub);margin-bottom:2px">
            <span>${p.label}</span><span style="color:${col}">${val}</span>
          </div>
          <div style="height:3px;background:rgba(255,255,255,.08);border-radius:99px">
            <div style="height:100%;width:${pct}%;background:${col};border-radius:99px;transition:width .3s"></div>
          </div>
        </div>`;
      }).join('');

      html += `
        <div style="padding:10px 12px;background:rgba(255,255,255,.03);
                    border:1px solid var(--border);border-radius:7px">
          <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;
                      letter-spacing:.05em;margin-bottom:8px">
            До стадии ${nextGate.icon} ${nextGate.name}
          </div>
          ${gateHtml}
        </div>`;
    }

    el.innerHTML = html;
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

    // v0.5 (Фаза A шаг 2): блок «Годовые итоги» — список карточек по годам.
    // Если ни один год ещё не закрыт, показываем прогресс-индикатор текущего.
    const yReports = (G.living && G.living.yearlyReports) || [];
    const yProgress = (function () {
      const y = G.living && G.living.yearly;
      if (!y) return null;
      const cur = G.month || 0;
      const elapsed = Math.max(0, cur - (y.yearStartMonth || 0));
      return { elapsed: Math.min(12, elapsed), left: Math.max(0, 12 - elapsed) };
    })();
    let yearlyBlock = '';
    if (yReports.length) {
      const cards = yReports.slice().reverse().slice(0, 6).map((r, idx) => {
        // idx считаем от конца. Чтобы передать realIdx, восстановим (length-1-idx)
        const realIdx = yReports.length - 1 - idx;
        const netColor = r.netDelta >= 0 ? '#86efac' : '#fca5a5';
        const sign = r.netDelta >= 0 ? '+' : '−';
        return '<button onclick="LivingMarket.showYearlyReport(' + realIdx + ')" style="text-align:left;background:rgba(255,255,255,.03);border:1px solid var(--border);border-left:3px solid #fbbf24;border-radius:7px;padding:8px 11px;cursor:pointer;display:flex;align-items:center;gap:10px;color:var(--text);font-family:inherit">' +
          '<span style="font-size:18px">📅</span>' +
          '<div style="min-width:0;flex:1">' +
            '<div style="font-size:11px;font-weight:700">Год ' + r.yearIdx + ' · M' + r.monthFrom + '–M' + r.monthTo + '</div>' +
            '<div style="font-size:10px;color:var(--sub);margin-top:1px">' + _formatMoneyShort(r.revenue) + ' выручки · ' + r.deliveries + ' сдач · T-топ ' + r.topTier + '</div>' +
          '</div>' +
          '<span style="font-size:11px;font-weight:700;color:' + netColor + ';white-space:nowrap">' + sign + _formatMoneyShort(Math.abs(r.netDelta)) + '</span>' +
        '</button>';
      }).join('');
      const more = yReports.length > 6 ? '<div style="font-size:10px;color:var(--muted);text-align:center;margin-top:4px;font-style:italic">показаны последние 6 из ' + yReports.length + '</div>' : '';
      const progressLine = yProgress
        ? '<div style="font-size:10px;color:var(--sub);margin-top:6px;text-align:center">Текущий год: ' + yProgress.elapsed + '/12 мес. · до итога ' + yProgress.left + ' мес.</div>'
        : '';
      yearlyBlock =
        '<div style="margin:0 0 12px;padding:10px 13px;border:1px solid rgba(251,191,36,.22);background:rgba(251,191,36,.03);border-radius:8px">' +
          '<div style="font-size:11px;color:var(--muted);font-weight:700;letter-spacing:.08em;text-transform:uppercase;margin-bottom:8px">📅 Годовые итоги (' + yReports.length + ')</div>' +
          '<div style="display:flex;flex-direction:column;gap:5px">' + cards + '</div>' +
          more +
          progressLine +
        '</div>';
    } else if (yProgress && yProgress.elapsed > 0) {
      yearlyBlock =
        '<div style="margin:0 0 12px;padding:9px 12px;border:1px dashed var(--border);background:rgba(255,255,255,.02);border-radius:8px;display:flex;align-items:center;gap:10px">' +
          '<span style="font-size:18px;opacity:.7">📅</span>' +
          '<div style="font-size:10px;color:var(--sub)">Первый годовой итог через <b style="color:var(--text)">' + yProgress.left + ' мес.</b> (' + yProgress.elapsed + '/12)</div>' +
        '</div>';
    }
    return '<div style="background:var(--panel);border:1px solid var(--border);border-radius:14px;padding:22px;max-width:540px;max-height:80vh;display:flex;flex-direction:column;width:90vw">' +
      '<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">' +
        '<span style="font-size:24px">' + st.icon + '</span>' +
        '<div><div style="font-size:11px;color:var(--muted);font-weight:700;letter-spacing:.1em;text-transform:uppercase">Журнал прогресса</div>' +
        '<div style="font-size:18px;font-weight:800;color:' + st.color + '">' + st.name + ' · M' + (G.month || 0) + '</div></div>' +
      '</div>' +
      '<div style="font-size:11px;color:var(--sub);margin-bottom:12px">' + st.sub + '</div>' +
      xpBlock +
      yearlyBlock +
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
        _initMarket();           // Phase C: инициализировать конкурентов
        _setInitialRankings();   // начальный ранг без инкремента monthsAtRank1
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
        _processMarketMonth(); // Phase C: тик конкурентов + пересчёт рейтинга
        _tickStages();
        _tickMilestones();
        _maybeTriggerYearly();
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

  // ── Phase C: кнопка «📊 Рынок» в шапке игры ─────────────────────────
  // Добавляем одну кнопку рядом с 💾 при каждом render.
  // Godot: только внутри _renderXxx-функций — не трогаем DOM вне рендера.

  function _ensureMarketButton() {
    if (typeof document === 'undefined') return;
    if (document.getElementById('btn-market')) return;
    const header = document.querySelector('.game-header');
    if (!header) return;
    const btn        = document.createElement('button');
    btn.id           = 'btn-market';
    btn.className    = 'btn btn-ghost';
    btn.title        = 'Рейтинг рынка';
    btn.style.cssText = 'font-size:12px;padding:5px 10px';
    btn.onclick      = () => showMarketModal();
    // Вставляем перед первой кнопкой в шапке (если есть)
    const firstBtn = header.querySelector('button');
    if (firstBtn) header.insertBefore(btn, firstBtn);
    else header.appendChild(btn);
    _updateMarketButton(btn);
  }

  function _updateMarketButton(btn) {
    if (!btn) btn = document.getElementById('btn-market');
    if (!btn) return;
    const rank = (typeof G !== 'undefined' && G && G.market && G.market.playerRank != null)
      ? G.market.playerRank : null;
    const rankStr = rank != null ? ' #' + rank : '';
    btn.textContent = '📊 Рынок' + rankStr;
  }

  if (typeof EventBus !== 'undefined' && EventBus.on) {
    EventBus.on('render', () => {
      try {
        if (typeof G !== 'undefined' && G && G._spec) {
          _ensureMarketButton();
          _updateMarketButton();
          // Если модал открыт — обновить его тоже
          const modal = document.getElementById('market-modal');
          if (modal && modal.classList.contains('active')) _renderMarketModal();
        }
      } catch (e) {}
    });
  }

  // ── v0.6 (Фаза B, шаг 2 полный): tree 2.0 как основной канал ────────
  // Перехватываем openPerkModal — вместо engine-древа открываем модал
  // tree 2.0.  Если USE_TREE2_PROGRESSION = false — пропускаем, старое
  // поведение остаётся.
  //
  // Также блокируем buyUpgrade, чтобы старые апгрейды нельзя было купить
  // даже из консоли/сейвов.  Купленные ДО переключения флага остаются
  // активными (G.upgrades сохраняется в сейве как есть).  Это безопасно:
  // их эффекты не дублируются с tree 2.0 (см. v3.30 upgradeAlias).

  if (USE_TREE2_PROGRESSION) {
    // 1) openPerkModal → showTreeModal
    if (typeof window.openPerkModal === 'function' && !window.openPerkModal.__livingMarketRedirected) {
      const _origOpenPerk = window.openPerkModal;
      window.openPerkModal = function () {
        try { showTreeModal(); } catch (e) {
          // На случай если tree-модал почему-то не открылся —
          // fallback на старое поведение (чтобы UI не пропал).
          try { _origOpenPerk.apply(this, arguments); } catch (_) {}
        }
      };
      window.openPerkModal.__livingMarketRedirected = true;
    }
    // 2) buyUpgrade → блокируем + notify (старые апгрейды нельзя купить)
    if (typeof window.buyUpgrade === 'function' && !window.buyUpgrade.__livingMarketBlocked) {
      const _origBuy = window.buyUpgrade;
      window.buyUpgrade = function (id) {
        if (typeof notify === 'function') {
          notify('🌳 Прокачка переехала в Древо 2.0 — открой модал «Древо»', 'error');
        }
        if (typeof EventBus !== 'undefined' && EventBus.emit) {
          EventBus.emit('living_market_blocked_old_upgrade', { id });
        }
        return null;   // покупка не происходит
      };
      // Сохраняем оригинал для дебага и для возможного отката
      window.buyUpgrade.__livingMarketBlocked = true;
      window.buyUpgrade.__original           = _origBuy;
    }
    // 3) Обновляем подпись в кнопке «Дерево навыков» на mode-screen,
    // чтобы было ясно: это новое древо 2.0. Подписка на render — UI
    // вызывает render() очень часто, и она перехватит actual-state.
    if (typeof EventBus !== 'undefined' && EventBus.on) {
      EventBus.on('render', () => {
        try {
          const sub = document.getElementById('perk-btn-sub');
          if (sub) {
            const xp        = Math.floor((G && G.xp) || 0);
            const owned     = ((G && G.living && G.living.tree2 && G.living.tree2.purchased) || []).length;
            sub.textContent = '🌳 Древо 2.0 · ★' + xp + ' · ' + owned + '/30 узлов';
          }
        } catch (e) {}
      });
    }
  }

  // ── Публичный API (для тестов и UI-кнопок) ──────────────────────────
  window.LivingMarket = {
    version:           VERSION,
    enabled:           LIVING_MARKET_ENABLED,
    useTree2Progression: USE_TREE2_PROGRESSION,
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
    // v0.7 (Фаза B шаг 6) — refcount boolean-флагов
    getFlagRefcount:    () => Object.assign({}, (G && G.living && G.living.tree2 && G.living.tree2._flagRefcount) || {}),
    getFlagBaseline:    () => Object.assign({}, (G && G.living && G.living.tree2 && G.living.tree2._flagBaseline) || {}),
    // v0.5 (Фаза B шаги 2 lite + 7)
    getDuplicatedEngineUpgrades,
    getEffectsSummary,
    getChannelLabels:   () => Object.assign({}, CHANNEL_LABELS),
    getPurchasedNodeIds:  () => ((G && G.living && G.living.tree2 && G.living.tree2.purchased) || []).slice(),
    showTreeModal,
    _buyNode,
    _doRespec,
    _awardXp,                              // публичен для dev-вмешательства
    // v0.5 (Фаза A шаг 2) — годовые итоги M12/M24/…
    getYearlyReports:   () => ((G && G.living && G.living.yearlyReports) || []).slice(),
    getCurrentYearProgress: () => {
      if (!G || !G.living || !G.living.yearly) return null;
      const y = G.living.yearly;
      const cur = G.month || 0;
      const elapsed = cur - (y.yearStartMonth || 0);
      return {
        yearIdx:        y.yearIdx || 0,
        yearStartMonth: y.yearStartMonth || 0,
        currentMonth:   cur,
        monthsElapsed:  Math.max(0, elapsed),
        monthsLeft:     Math.max(0, 12 - elapsed),
      };
    },
    showYearlyReport,
    // v0.8 (Фаза A шаг 3) — DSL милстоунов в данных сценария
    getScenarioMilestones: () => (typeof SCENARIO !== 'undefined' && SCENARIO && Array.isArray(SCENARIO.milestones)) ? SCENARIO.milestones.slice() : null,
    compileMilestoneWhen:  _compileMilestoneWhen,
    resolveMilestoneDesc:  _resolveMilestoneDesc,
    // v0.9 (Фаза C) — конкуренты + рейтинг рынка
    getMarket:             () => (typeof G !== 'undefined' && G && G.market) ? G.market : null,
    getCompetitors:        () => (typeof G !== 'undefined' && G && G.market && G.market.competitors) ? G.market.competitors.slice() : [],
    getPlayerRank:         () => (typeof G !== 'undefined' && G && G.market) ? G.market.playerRank : null,
    getMonthsAtRank1:      () => (typeof G !== 'undefined' && G && G.market) ? (G.market.monthsAtRank1 || 0) : 0,
    getAcquisitions:       () => (typeof G !== 'undefined' && G && G.market) ? (G.market.acquisitions || 0) : 0,
    getCompetitorArchetypes: () => Object.assign({}, COMPETITOR_ARCHETYPES),
    showMarketModal,
    // dev/test
    _initLiving,
    _suppressWin,
    _initMarket,
    _processMarketMonth,
    _updateMarketRankings,
    _createCompetitors,
    _tickStages,
    _tickMilestones,
    _maybeTriggerYearly,
    _yearlyEnsureStart,
    _buildYearlyReport,
    _awardDeliveryXp,
    _countDeliveries,
    _countStaff,
    _cumulativeRevenue,
    _formatMoneyShort,
    _milestones,
    _milestonesBuiltin,
    _scenarioMilestones,
  };

  try {
    const t4count = TREE_NODES.filter(n => n.tier === 4).length;
    const compCount = Object.keys(COMPETITOR_ARCHETYPES).length;
    console.log('[livingmarket] ' + VERSION + ' активирован: ' + STAGES.length + ' стадий (все живые), ' + compCount + ' конкурентов (Фаза C), древо 2.0: ' + TREE_NODES.length + ' узлов (tier 4 пар: ' + (t4count / 2) + ')');
  } catch (e) {}
})();
