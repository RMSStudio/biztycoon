// ══════════════════════════════════════════════════════════
//  SE_PRESETS — библиотека готовых сущностей для редактора
//  Источник: agency.js (сценарий «Диджитал-агентство»)
//  Формат совместим с customStaff / customProjects / customEvents
// ══════════════════════════════════════════════════════════

window.SE_PRESETS = {

  // ── Персонал ──────────────────────────────────────────
  staff: [

    // Дизайнер
    { _label:'Дизайнер', icon:'🎨', role:'Дизайнер',        grade:'junior', cost:30000, quality:5,  npsBonus:0, speedBonus:0, desc:'Визуал + качество. Junior.' },
    { _label:'Дизайнер', icon:'🎨', role:'Дизайнер',        grade:'middle', cost:48000, quality:12, npsBonus:0, speedBonus:0, desc:'Визуал + качество. Middle.' },
    { _label:'Дизайнер', icon:'🎨', role:'Дизайнер Sr',      grade:'senior', cost:72000, quality:22, npsBonus:0, speedBonus:0, desc:'Визуал + качество. Senior (rep ≥70).' },

    // Копирайтер
    { _label:'Копирайтер', icon:'✍️', role:'Копирайтер',    grade:'junior', cost:22000, quality:0, npsBonus:0, speedBonus:0, desc:'Контент + объём. Junior.' },
    { _label:'Копирайтер', icon:'✍️', role:'Копирайтер',    grade:'middle', cost:35000, quality:0, npsBonus:0, speedBonus:0, desc:'Контент + объём. Middle.' },
    { _label:'Копирайтер', icon:'✍️', role:'Копирайтер Sr', grade:'senior', cost:52000, quality:0, npsBonus:0, speedBonus:0, desc:'Контент + объём. Senior.' },

    // Менеджер
    { _label:'Менеджер', icon:'📋', role:'Менеджер',        grade:'junior', cost:33000, quality:0, npsBonus:0, speedBonus:3, desc:'Аккаунтинг, ёмкость проектов +1. Junior.' },
    { _label:'Менеджер', icon:'📋', role:'Менеджер',        grade:'middle', cost:52000, quality:0, npsBonus:0, speedBonus:5, desc:'Аккаунтинг, ёмкость проектов +2. Middle.' },
    { _label:'Менеджер', icon:'📋', role:'Менеджер Sr',     grade:'senior', cost:80000, quality:0, npsBonus:0, speedBonus:8, desc:'Аккаунтинг, ёмкость проектов +3. Senior (rep ≥70).' },

    // Разработчик
    { _label:'Разработчик', icon:'💻', role:'Разработчик',    grade:'junior', cost:38000, quality:4,  npsBonus:0, speedBonus:3, desc:'Тех-проекты. Quality +4. Junior.' },
    { _label:'Разработчик', icon:'💻', role:'Разработчик',    grade:'middle', cost:60000, quality:8,  npsBonus:0, speedBonus:5, desc:'Тех-проекты. Quality +8. Middle.' },
    { _label:'Разработчик', icon:'💻', role:'Разработчик Sr', grade:'senior', cost:90000, quality:16, npsBonus:0, speedBonus:8, desc:'Тех-проекты. Quality +16. Senior (rep ≥80).' },

    // SMM
    { _label:'SMM', icon:'📣', role:'SMM Jr',           grade:'junior', cost:22000, quality:0, npsBonus:0, speedBonus:0, desc:'Объём +5. Junior.' },
    { _label:'SMM', icon:'📣', role:'SMM-маркетолог',   grade:'middle', cost:34000, quality:0, npsBonus:0, speedBonus:0, desc:'Объём +10. Middle.' },
    { _label:'SMM', icon:'📣', role:'SMM Sr',           grade:'senior', cost:50000, quality:0, npsBonus:0, speedBonus:0, desc:'Объём +18. Senior.' },

    // Юрист
    { _label:'Юрист', icon:'⚖️', role:'Юрист Jr', grade:'junior', cost:28000, quality:0, npsBonus:0, speedBonus:0, desc:'Штрафы и риски −30%. Junior.' },
    { _label:'Юрист', icon:'⚖️', role:'Юрист',    grade:'middle', cost:42000, quality:0, npsBonus:0, speedBonus:0, desc:'Штрафы и риски −50%. Middle.' },
    { _label:'Юрист', icon:'⚖️', role:'Юрист Sr', grade:'senior', cost:65000, quality:0, npsBonus:0, speedBonus:0, desc:'Штрафы и риски −70%. Senior (rep ≥75).' },

    // HR
    { _label:'HR', icon:'🤝', role:'HR Jr',         grade:'junior', cost:20000, quality:0, npsBonus:2, speedBonus:0, desc:'NPS +2/мес · найм за 1 день. Junior.' },
    { _label:'HR', icon:'🤝', role:'HR-менеджер',   grade:'middle', cost:30000, quality:0, npsBonus:3, speedBonus:0, desc:'NPS +3/мес · найм за 1 день. Middle.' },
    { _label:'HR', icon:'🤝', role:'HR Sr',         grade:'senior', cost:46000, quality:0, npsBonus:4, speedBonus:0, desc:'NPS +4/мес · найм за 1 день. Senior (rep ≥65).' },
  ],

  // ── Проекты ───────────────────────────────────────────
  projects: [

    // Tier 1 — Разовые
    {
      _label:'Tier 1 · Разовые',
      icon:'🔍', name:'Экспресс-аудит', tier:1, type:'small', rarity:'common',
      desc:'Клиент хочет быстрый взгляд со стороны: аудит сайта или соцсетей. Никакого онбординга.',
      npsStart:78, prob:0.80,
      useRangeBudget:false, fixedBudget:[70000, 90000],
      requirements:{ minQ:0, minV:0, minPortfolio:0, requiresDev:false },
      modifier:{ type:'none', val:0, val2:0 },
      prepayment:{ enabled:false, prob:0.5, pct:0.3 },
    },
    {
      _label:'Tier 1 · Разовые',
      icon:'💬', name:'Разовая консультация', tier:1, type:'small', rarity:'common',
      desc:'Час-полтора с предпринимателем: стратегия, позиционирование, точки роста.',
      npsStart:82, prob:0.75,
      useRangeBudget:false, fixedBudget:[70000, 90000],
      requirements:{ minQ:0, minV:0, minPortfolio:0, requiresDev:false },
      modifier:{ type:'none', val:0, val2:0 },
      prepayment:{ enabled:false, prob:0.5, pct:0.3 },
    },

    // Tier 1 — Регулярные
    {
      _label:'Tier 1 · Стандарт',
      icon:'😊', name:'Лояльный заказчик', tier:1, type:'small', rarity:'common',
      desc:'Простой проект, всегда доволен, платит вовремя. Идеальный первый клиент.',
      npsStart:84, prob:0.75,
      useRangeBudget:true,
      requirements:{ minQ:0, minV:0, minPortfolio:0, requiresDev:false },
      modifier:{ type:'nps_passive', val:5, val2:0 },
      prepayment:{ enabled:false, prob:0.5, pct:0.3 },
    },
    {
      _label:'Tier 1 · Стандарт',
      icon:'🤝', name:'Тёплый лид', tier:1, type:'small', rarity:'common',
      desc:'Пришёл по рекомендации. Уже расположен к вам — NPS стартует выше нормы.',
      npsStart:94, prob:0.80,
      useRangeBudget:true,
      requirements:{ minQ:0, minV:0, minPortfolio:0, requiresDev:false },
      modifier:{ type:'nps_start', val:14, val2:0 },
      prepayment:{ enabled:false, prob:0.5, pct:0.3 },
    },
    {
      _label:'Tier 1 · Стандарт',
      icon:'🕐', name:'Систематически задерживает', tier:1, type:'small', rarity:'common',
      desc:'Хороший чек, но «деньги переведём на следующей неделе» — его фирменная фраза.',
      npsStart:72, prob:0.55,
      useRangeBudget:true,
      requirements:{ minQ:0, minV:0, minPortfolio:0, requiresDev:false },
      modifier:{ type:'payment_delay', val:0.40, val2:0 },
      prepayment:{ enabled:false, prob:0.5, pct:0.3 },
    },
    {
      _label:'Tier 1 · Стандарт',
      icon:'🦷', name:'Стоматологическая клиника', tier:1, type:'small', rarity:'uncommon',
      desc:'Клиника хочет выделиться среди конкурентов. Требует качество визуала.',
      npsStart:76, prob:0.50,
      useRangeBudget:true,
      requirements:{ minQ:5, minV:0, minPortfolio:0, requiresDev:false },
      modifier:{ type:'nps_passive', val:3, val2:0 },
      prepayment:{ enabled:false, prob:0.5, pct:0.3 },
    },
    {
      _label:'Tier 1 · Брендинг',
      icon:'👗', name:'Локальный бутик', tier:1, type:'store', rarity:'common',
      desc:'Небольшой модный магазин хочет айдентику и соцсети.',
      npsStart:81, prob:0.65,
      useRangeBudget:true,
      requirements:{ minQ:0, minV:3, minPortfolio:0, requiresDev:false },
      modifier:{ type:'nps_passive', val:3, val2:0 },
      prepayment:{ enabled:false, prob:0.5, pct:0.3 },
    },

    // Tier 2
    {
      _label:'Tier 2',
      icon:'🚀', name:'Стартап на хайпе', tier:2, type:'small', rarity:'common',
      desc:'Горит идеей, платит нерегулярно. Иногда кидает приятный бонус.',
      npsStart:74, prob:0.65,
      useRangeBudget:true,
      requirements:{ minQ:0, minV:10, minPortfolio:0, requiresDev:false },
      modifier:{ type:'random_bonus', val:18000, val2:0 },
      prepayment:{ enabled:false, prob:0.5, pct:0.3 },
    },
    {
      _label:'Tier 2',
      icon:'⚡', name:'Срочный разовый заказ', tier:2, type:'small', rarity:'uncommon',
      desc:'Нужно «ещё вчера». Хорошо платит единоразово и исчезает.',
      npsStart:78, prob:0.60,
      useRangeBudget:true,
      requirements:{ minQ:7, minV:5, minPortfolio:0, requiresDev:false },
      modifier:{ type:'none', val:0, val2:0 },
      prepayment:{ enabled:false, prob:0.5, pct:0.3 },
    },
    {
      _label:'Tier 2',
      icon:'🏢', name:'Корпоративный KPI', tier:2, type:'corp', rarity:'uncommon',
      desc:'Солидный чек, но штраф если NPS опустится ниже порога.',
      npsStart:66, prob:0.35,
      useRangeBudget:true,
      requirements:{ minQ:18, minV:10, minPortfolio:0, requiresDev:false },
      modifier:{ type:'nps_passive', val:3, val2:0 },
      prepayment:{ enabled:false, prob:0.5, pct:0.3 },
    },
    {
      _label:'Tier 2',
      icon:'🎓', name:'Образовательная платформа', tier:2, type:'small', rarity:'uncommon',
      desc:'EdTech-стартап масштабируется. Нужен сильный контент и визуал.',
      npsStart:75, prob:0.45,
      useRangeBudget:true,
      requirements:{ minQ:10, minV:12, minPortfolio:0, requiresDev:false },
      modifier:{ type:'nps_passive', val:3, val2:0 },
      prepayment:{ enabled:false, prob:0.5, pct:0.3 },
    },
    {
      _label:'Tier 2 · Tech',
      icon:'⚙️', name:'SaaS-интеграция', tier:2, type:'corp', rarity:'uncommon',
      desc:'Технический клиент — настройка и поддержка платформы. Нужен Разработчик.',
      npsStart:74, prob:0.50,
      useRangeBudget:true,
      requirements:{ minQ:12, minV:0, minPortfolio:0, requiresDev:true },
      modifier:{ type:'nps_passive', val:3, val2:0 },
      prepayment:{ enabled:false, prob:0.5, pct:0.3 },
    },

    // Tier 3
    {
      _label:'Tier 3',
      icon:'🌫️', name:'Серая зона', tier:3, type:'small', rarity:'uncommon',
      desc:'Щедро платит, но проекты на грани закона. Репутация и портфолио страдают.',
      npsStart:70, prob:0.45,
      useRangeBudget:true,
      requirements:{ minQ:0, minV:0, minPortfolio:0, requiresDev:false },
      modifier:{ type:'reputation', val:-12, val2:0 },
      prepayment:{ enabled:false, prob:0.5, pct:0.3 },
    },
    {
      _label:'Tier 3',
      icon:'💎', name:'Долгосрочный ретейнер', tier:3, type:'store', rarity:'uncommon',
      desc:'Стабильный крупный клиент с растущей ставкой за лояльность.',
      npsStart:76, prob:0.30,
      useRangeBudget:true,
      requirements:{ minQ:14, minV:15, minPortfolio:0, requiresDev:false },
      modifier:{ type:'revenue_growth', val:0.05, val2:0 },
      prepayment:{ enabled:false, prob:0.5, pct:0.3 },
    },
    {
      _label:'Tier 3',
      icon:'🏛️', name:'Государственный контракт', tier:3, type:'corp', rarity:'rare',
      desc:'Огромный чек, но бюрократия: первые месяцы оплаты нет — готовь кэш.',
      npsStart:62, prob:0.25,
      useRangeBudget:true,
      requirements:{ minQ:22, minV:15, minPortfolio:0, requiresDev:false },
      modifier:{ type:'payment_delay', val:0.50, val2:0 },
      prepayment:{ enabled:false, prob:0.5, pct:0.3 },
    },
    {
      _label:'Tier 3 · Tech',
      icon:'🏦', name:'FinTech-платформа', tier:3, type:'corp', rarity:'rare',
      desc:'Крупный технический контракт. Высокий порог качества. Нужен Разработчик.',
      npsStart:65, prob:0.30,
      useRangeBudget:true,
      requirements:{ minQ:22, minV:10, minPortfolio:0, requiresDev:true },
      modifier:{ type:'nps_drain', val:-5, val2:0 },
      prepayment:{ enabled:false, prob:0.5, pct:0.3 },
    },
    {
      _label:'Tier 3',
      icon:'📺', name:'Медиахолдинг', tier:3, type:'store', rarity:'rare',
      desc:'Крупный медиа-игрок. Нужен весь спектр: контент, визуал, стратегия.',
      npsStart:68, prob:0.25,
      useRangeBudget:true,
      requirements:{ minQ:18, minV:20, minPortfolio:0, requiresDev:false },
      modifier:{ type:'revenue_growth', val:0.06, val2:0 },
      prepayment:{ enabled:false, prob:0.5, pct:0.3 },
    },

    // Tier 4
    {
      _label:'Tier 4 · Эндгейм',
      icon:'🏭', name:'Национальная корпорация', tier:4, type:'corp', rarity:'epic',
      desc:'Системообразующее предприятие. Требует выдающейся команды и безупречного портфолио.',
      npsStart:62, prob:0.20,
      useRangeBudget:true,
      requirements:{ minQ:30, minV:25, minPortfolio:20, requiresDev:false },
      modifier:{ type:'nps_passive', val:2, val2:0 },
      prepayment:{ enabled:false, prob:0.5, pct:0.3 },
    },
    {
      _label:'Tier 4 · Эндгейм',
      icon:'🦄', name:'Единорог-стартап', tier:4, type:'store', rarity:'epic',
      desc:'Компания на пороге IPO. Нужен брендинг мирового уровня — и быстро.',
      npsStart:70, prob:0.15,
      useRangeBudget:true,
      requirements:{ minQ:30, minV:20, minPortfolio:0, requiresDev:true },
      modifier:{ type:'payment_delay', val:0.20, val2:0 },
      prepayment:{ enabled:true, prob:0.7, pct:0.3 },
    },
    {
      _label:'Tier 4 · Эндгейм',
      icon:'⚓', name:'Enterprise-якорь', tier:4, type:'store', rarity:'epic',
      desc:'Долгосрочный ретейнер от крупнейшего игрока рынка. Мечта любого агентства.',
      npsStart:72, prob:0.15,
      useRangeBudget:true,
      requirements:{ minQ:26, minV:20, minPortfolio:40, requiresDev:false },
      modifier:{ type:'revenue_growth', val:0.10, val2:0 },
      prepayment:{ enabled:false, prob:0.5, pct:0.3 },
    },
    {
      _label:'Tier 4 · Эндгейм',
      icon:'🏦', name:'Цифровой банк', tier:4, type:'corp', rarity:'epic',
      desc:'Банк трансформируется в digital. Контракт с жёсткими KPI и большим потенциалом.',
      npsStart:60, prob:0.15,
      useRangeBudget:true,
      requirements:{ minQ:30, minV:20, minPortfolio:20, requiresDev:true },
      modifier:{ type:'nps_passive', val:2, val2:0 },
      prepayment:{ enabled:false, prob:0.5, pct:0.3 },
    },
  ],

  // ── События ───────────────────────────────────────────
  // fn-логика оригинала упрощена до effects-data — полная совместимость с _buildEffectFn
  events: [
    {
      _label:'Клиентские',
      icon:'🤝', title:'Клиент просит скидку', requiresClients:true, chance:0.20,
      body:'Постоянный клиент просит снизить итоговый бюджет на 15%. Отказать — NPS падает, согласиться — теряешь часть выплаты.',
      choices:[
        { text:'Согласиться (−15% бюджета)',    desc:'NPS всех клиентов +12', effects:[{ type:'nps_all',   val: 12 }] },
        { text:'Отказать',                      desc:'NPS у клиента −20',      effects:[{ type:'nps_all',   val:-20 }] },
      ],
    },
    {
      _label:'Рыночные',
      icon:'📉', title:'Алгоритм сменился', requiresClients:true, chance:0.18,
      body:'Апдейт платформ. Клиенты паникуют — NPS всех просел.',
      choices:[
        { text:'Антикризисный аудит (−30 000 ₽)', desc:'NPS +15 у всех',       effects:[{ type:'money_add', val:-30000 }, { type:'nps_all', val: 15 }] },
        { text:'Переждать',                        desc:'NPS всех клиентов −18', effects:[{ type:'nps_all', val:-18 }] },
      ],
    },
    {
      _label:'Командные',
      icon:'⚡', title:'Конфликт в команде', requiresClients:false, chance:0.15,
      body:'Напряжение сказывается на работе — NPS клиентов падает, усталость растёт.',
      choices:[
        { text:'Тимбилдинг (−25 000 ₽)',  desc:'NPS +10, усталость −15',  effects:[{ type:'money_add', val:-25000 }, { type:'nps_all', val:10 }, { type:'fatigue', val:-15 }] },
        { text:'Поговорить самому',         desc:'50% шанс — NPS ±8',       effects:[{ type:'random_nps', val:-8 }] },
      ],
    },
    {
      _label:'Командные',
      icon:'🚪', title:'Сотрудник хочет уйти', requiresClients:false, chance:0.12,
      body:'Получил оффер от конкурентов. Можно удержать повышением или отпустить.',
      choices:[
        { text:'Повышение +20 000 ₽/мес', desc:'Остаётся, расходы растут',  effects:[{ type:'money_add', val:-20000 }] },
        { text:'Отпустить',                desc:'NPS команды −10',           effects:[{ type:'nps_all', val:-10 }] },
      ],
    },
    {
      _label:'Рыночные',
      icon:'🎉', title:'Рост рынка', requiresClients:false, chance:0.10,
      body:'Рынок неожиданно оживился. Можно воспользоваться моментом или продолжить по плану.',
      choices:[
        { text:'Агрессивный скаутинг',  desc:'Случайный доп. доход',      effects:[{ type:'random_money', val:60000 }] },
        { text:'Укрепить репутацию',    desc:'Репутация +8',               effects:[{ type:'reputation', val:8 }] },
      ],
    },
    {
      _label:'Рыночные',
      icon:'🏆', title:'Получили award', requiresClients:false, chance:0.08,
      body:'Отраслевое признание: агентство попало в шорт-лист профессиональной премии.',
      choices:[
        { text:'Активно продвигать',  desc:'Репутация +12, портфолио +3', effects:[{ type:'reputation', val:12 }, { type:'portfolio', val:3 }] },
        { text:'Принять спокойно',    desc:'Репутация +5',                 effects:[{ type:'reputation', val:5 }] },
      ],
    },
    {
      _label:'Клиентские',
      icon:'😤', title:'Клиент недоволен', requiresClients:true, chance:0.16,
      body:'Один из клиентов оставил публичный негативный отзыв. Нужно реагировать.',
      choices:[
        { text:'Публичный ответ + компенсация (−15 000 ₽)', desc:'NPS −5, репутация +4', effects:[{ type:'money_add', val:-15000 }, { type:'nps_all', val:-5 }, { type:'reputation', val:4 }] },
        { text:'Игнорировать',                               desc:'Репутация −8',          effects:[{ type:'reputation', val:-8 }] },
      ],
    },
    {
      _label:'Командные',
      icon:'😓', title:'Команда выгорает', requiresClients:false, chance:0.14,
      body:'Усталость достигла опасного уровня. Производительность падает.',
      choices:[
        { text:'Оплачиваемые выходные (−12 000 ₽)', desc:'Усталость −15',            effects:[{ type:'money_add', val:-12000 }, { type:'fatigue', val:-15 }] },
        { text:'Переждать',                           desc:'NPS всех клиентов −8',    effects:[{ type:'nps_all', val:-8 }] },
      ],
    },
  ],

};
