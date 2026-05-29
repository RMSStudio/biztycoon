// ══════════════════════════════════════════════════════
//  DATA — константы, пулы проектов, события
//  Не содержит логики. Безопасно импортировать первым.
// ══════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════
//  CONSTANTS
// ══════════════════════════════════════════════════════

const OVERHEAD          = 20000;   // ₽/мес постоянных расходов
const ACTIONS_PER_MONTH = 10;      // рабочих дней в месяц
const SCOUT_COST        = 3;       // дней на скаутинг
const HIRE_COST         = 2;       // дней на найм

// Бюджеты проектов по тирам (генерируются при подписании)
const BUDGET_RANGES = {
  1: [90000,   165000],
  2: [220000,  440000],
  3: [550000,  1320000],
  4: [1500000, 3500000],
};

const SPECS = {
  smm:   { name:'SMM-агентство',  icon:'📱', bonus:'small_income', bonusVal:0.15 },
  seo:   { name:'SEO-агентство',  icon:'🔍', bonus:'staff_cost',   bonusVal:-0.10 },
  web:   { name:'Web-разработка', icon:'💻', bonus:'corp_income',  bonusVal:0.25 },
  brand: { name:'Брендинг',       icon:'✨', bonus:'store_income', bonusVal:0.40 },
};

// ── STAFF_DEFS ────────────────────────────────────────
// role — базовая роль (используется hasRole/countRole)
// grade — 'jr'|'md'|'sr'
// gradeLabel — отображаемое название грейда
// unlockCond — условие разблокировки { minRep?, minPortfolio? } или null
// speedBonus — вклад в G.speed (Manager и Developer ускоряют прогресс)
const STAFF_DEFS = [

  // ── ДИЗАЙНЕР ──────────────────────────────────────
  {
    id:'designer_jr', role:'designer', grade:'jr', gradeLabel:'Junior',
    name:'Дизайнер Jr', icon:'🎨', desc:'Визуал + качество',
    cost:30000, quality:10, volume:0, capacity:0, throughput:4, speedBonus:0,
    unlockCond: null,
  },
  {
    id:'designer',    role:'designer', grade:'md', gradeLabel:'Middle',
    name:'Дизайнер',  icon:'🎨', desc:'Визуал + качество',
    cost:48000, quality:20, volume:0, capacity:0, throughput:7, speedBonus:0,
    unlockCond: null,
  },
  {
    id:'designer_sr', role:'designer', grade:'sr', gradeLabel:'Senior',
    name:'Дизайнер Sr', icon:'🎨', desc:'Визуал + качество',
    cost:72000, quality:35, volume:0, capacity:0, throughput:10, speedBonus:0,
    unlockCond: { minRep:70 },
  },

  // ── КОПИРАЙТЕР ────────────────────────────────────
  {
    id:'copywriter_jr', role:'copywriter', grade:'jr', gradeLabel:'Junior',
    name:'Копирайтер Jr', icon:'✍️', desc:'Контент + объём',
    cost:22000, quality:0, volume:8, capacity:0, throughput:3, speedBonus:0,
    unlockCond: null,
  },
  {
    id:'copywriter',    role:'copywriter', grade:'md', gradeLabel:'Middle',
    name:'Копирайтер',  icon:'✍️', desc:'Контент + объём',
    cost:35000, quality:0, volume:15, capacity:0, throughput:5, speedBonus:0,
    unlockCond: null,
  },
  {
    id:'copywriter_sr', role:'copywriter', grade:'sr', gradeLabel:'Senior',
    name:'Копирайтер Sr', icon:'✍️', desc:'Контент + объём',
    cost:52000, quality:0, volume:25, capacity:0, throughput:7, speedBonus:0,
    unlockCond: { minRep:60 },
  },

  // ── МЕНЕДЖЕР ──────────────────────────────────────
  {
    id:'manager_jr', role:'manager', grade:'jr', gradeLabel:'Junior',
    name:'Менеджер Jr', icon:'📋', desc:'Аккаунтинг',
    cost:33000, quality:0, volume:0, capacity:1, throughput:3, speedBonus:0.03,
    unlockCond: null,
  },
  {
    id:'manager',    role:'manager', grade:'md', gradeLabel:'Middle',
    name:'Менеджер',  icon:'📋', desc:'Аккаунтинг',
    cost:52000, quality:0, volume:0, capacity:2, throughput:5, speedBonus:0.05,
    unlockCond: null,
  },
  {
    id:'manager_sr', role:'manager', grade:'sr', gradeLabel:'Senior',
    name:'Менеджер Sr', icon:'📋', desc:'Аккаунтинг',
    cost:80000, quality:0, volume:0, capacity:3, throughput:7, speedBonus:0.08,
    unlockCond: { minRep:70 },
  },

  // ── РАЗРАБОТЧИК ───────────────────────────────────
  {
    id:'developer_jr', role:'developer', grade:'jr', gradeLabel:'Junior',
    name:'Разработчик Jr', icon:'💻', desc:'Кач +8 · тех-проекты',
    cost:38000, quality:8, volume:0, capacity:0, throughput:4, speedBonus:0.03,
    unlockCond: null,
  },
  {
    id:'developer',    role:'developer', grade:'md', gradeLabel:'Middle',
    name:'Разработчик',  icon:'💻', desc:'Кач +15 · тех-проекты',
    cost:60000, quality:15, volume:0, capacity:0, throughput:7, speedBonus:0.05,
    unlockCond: null,
  },
  {
    id:'developer_sr', role:'developer', grade:'sr', gradeLabel:'Senior',
    name:'Разработчик Sr', icon:'💻', desc:'Кач +25 · тех-проекты',
    cost:90000, quality:25, volume:0, capacity:0, throughput:10, speedBonus:0.08,
    unlockCond: { minRep:80 },
  },

  // ── SMM ───────────────────────────────────────────
  {
    id:'smm_jr', role:'smm', grade:'jr', gradeLabel:'Junior',
    name:'SMM Jr', icon:'📣', desc:'Объём +5 · +1 лид/скаут',
    cost:22000, quality:0, volume:5, capacity:0, throughput:2, speedBonus:0,
    unlockCond: null,
  },
  {
    id:'smm',    role:'smm', grade:'md', gradeLabel:'Middle',
    name:'SMM-маркетолог', icon:'📣', desc:'Объём +10 · +1 лид/скаут',
    cost:34000, quality:0, volume:10, capacity:0, throughput:3, speedBonus:0,
    unlockCond: null,
  },
  {
    id:'smm_sr', role:'smm', grade:'sr', gradeLabel:'Senior',
    name:'SMM Sr', icon:'📣', desc:'Объём +18 · +1 лид/скаут',
    cost:50000, quality:0, volume:18, capacity:0, throughput:5, speedBonus:0,
    unlockCond: { minRep:60 },
  },

  // ── ЮРИСТ ─────────────────────────────────────────
  {
    id:'lawyer_jr', role:'lawyer', grade:'jr', gradeLabel:'Junior',
    name:'Юрист Jr', icon:'⚖️', desc:'Штрафы и риски −30%',
    cost:28000, quality:0, volume:0, capacity:0, throughput:1, speedBonus:0,
    unlockCond: null,
  },
  {
    id:'lawyer',    role:'lawyer', grade:'md', gradeLabel:'Middle',
    name:'Юрист',   icon:'⚖️', desc:'Штрафы и риски −50%',
    cost:42000, quality:0, volume:0, capacity:0, throughput:2, speedBonus:0,
    unlockCond: null,
  },
  {
    id:'lawyer_sr', role:'lawyer', grade:'sr', gradeLabel:'Senior',
    name:'Юрист Sr', icon:'⚖️', desc:'Штрафы и риски −70%',
    cost:65000, quality:0, volume:0, capacity:0, throughput:3, speedBonus:0,
    unlockCond: { minRep:75 },
  },

  // ── HR ────────────────────────────────────────────
  {
    id:'hr_jr', role:'hr', grade:'jr', gradeLabel:'Junior',
    name:'HR Jr', icon:'🤝', desc:'NPS +2/мес · найм за 1 день',
    cost:20000, quality:0, volume:0, capacity:0, throughput:1, speedBonus:0,
    unlockCond: null,
  },
  {
    id:'hr',    role:'hr', grade:'md', gradeLabel:'Middle',
    name:'HR-менеджер', icon:'🤝', desc:'NPS +3/мес · найм за 1 день',
    cost:30000, quality:0, volume:0, capacity:0, throughput:2, speedBonus:0,
    unlockCond: null,
  },
  {
    id:'hr_sr', role:'hr', grade:'sr', gradeLabel:'Senior',
    name:'HR Sr', icon:'🤝', desc:'NPS +4/мес · найм за 1 день',
    cost:46000, quality:0, volume:0, capacity:0, throughput:3, speedBonus:0,
    unlockCond: { minRep:65 },
  },
];

// Группировка STAFF_DEFS по ролям (для UI)
const STAFF_ROLES = ['designer','copywriter','manager','developer','smm','lawyer','hr'];
const ROLE_LABELS = {
  designer:   { name:'Дизайнер',        icon:'🎨' },
  copywriter: { name:'Копирайтер',      icon:'✍️' },
  manager:    { name:'Менеджер',        icon:'📋' },
  developer:  { name:'Разработчик',     icon:'💻' },
  smm:        { name:'SMM-маркетолог',  icon:'📣' },
  lawyer:     { name:'Юрист',           icon:'⚖️' },
  hr:         { name:'HR-менеджер',     icon:'🤝' },
};

const MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];

// ── Q-UPGRADES + SPEED-UPGRADES ──────────────────────
// oneTime:true  → постоянный бонус (купить 1 раз)
// oneTime:false → разовый бонус к tempQBonus (сбрасывается в конце месяца)
// speedBonus → прибавляется к G.speedUpgrades (множитель прогресса проектов)
const UPGRADES = [
  // — Q-перки —
  {
    id:'tools_q', icon:'🖥️', name:'Проф. инструментарий',
    desc:'Figma Pro, Adobe CC — команда работает без ограничений',
    cost:25000, days:1, qBonus:6, repBonus:0, oneTime:true, speedBonus:0,
  },
  {
    id:'training_q', icon:'📚', name:'Курсы по дизайну',
    desc:'Онлайн-обучение + внутренний воркшоп для команды',
    cost:45000, days:2, qBonus:10, repBonus:0, oneTime:true, speedBonus:0,
  },
  {
    id:'consultant_q', icon:'🎯', name:'UX-консультант',
    desc:'Разовый аудит от топ-специалиста: Q-рост и репутация',
    cost:72000, days:1, qBonus:14, repBonus:5, oneTime:true, speedBonus:0,
  },
  {
    id:'freelance_q', icon:'✏️', name:'Фриланс-дизайнер',
    desc:'Временная помощь — Q только в этом месяце',
    cost:30000, days:1, qBonus:10, repBonus:0, oneTime:false, speedBonus:0,
  },
  // — Speed-перки —
  {
    id:'agile', icon:'⚡', name:'Agile-внедрение',
    desc:'Спринты и итерации — команда сдаёт задачи быстрее',
    cost:40000, days:2, qBonus:0, repBonus:0, oneTime:true, speedBonus:0.10,
  },
  {
    id:'scrum', icon:'🔄', name:'Scrum-мастер',
    desc:'Внешний коуч настраивает ретро и планирование. Прогресс проектов +15%',
    cost:65000, days:2, qBonus:0, repBonus:0, oneTime:true, speedBonus:0.15,
  },
  {
    id:'automation', icon:'🤖', name:'Автоматизация процессов',
    desc:'Рутина уходит в скрипты. Прогресс всех проектов +20%',
    cost:90000, days:3, qBonus:0, repBonus:0, oneTime:true, speedBonus:0.20,
  },
  // — Восстановление усталости (разовые действия с кулдауном) —
  {
    id:'paid_leave', icon:'🏖️', name:'Оплачиваемые выходные',
    desc:'Команда отдыхает пару дней — быстрый сброс накопленного стресса',
    cost:12000, days:1, qBonus:0, repBonus:0, oneTime:false, speedBonus:0,
    fatigueReduce:12, cooldownMonths:1,
  },
  {
    id:'teambuilding', icon:'🎉', name:'Тимбилдинг',
    desc:'Командный офлайн-день: игры, еда, живое общение — существенный откат усталости',
    cost:28000, days:2, qBonus:0, repBonus:0, oneTime:false, speedBonus:0,
    fatigueReduce:22, cooldownMonths:2,
  },
  {
    id:'corp_vacation', icon:'✈️', name:'Корпоративный отпуск',
    desc:'Полноценный отдых команды. Снимает даже сильное выгорание. Доступен при усталости ≥40',
    cost:55000, days:3, qBonus:0, repBonus:0, oneTime:false, speedBonus:0,
    fatigueReduce:38, cooldownMonths:3, minFatigue:40,
  },
];

// ── PROJECT POOL ────────────────────────────────────────
// rarity: 'common'|'uncommon'|'rare'|'epic'
// tier 1–4; modifier.type: nps_passive|nps_start|nps_drain|payment_delay|
//           payment_delay_fixed|one_time|reputation|nps_penalty|random_bonus|revenue_growth
const PROJECT_POOL = [

  // ═══════════════════════════════════════════════════
  //  TIER 1 — Стартовые разовые (без требований Q/V)
  // ═══════════════════════════════════════════════════
  {
    id:'audit_quick', tier:1, icon:'🔍', name:'Экспресс-аудит',
    desc:'Клиент хочет быстрый взгляд со стороны: аудит сайта или соцсетей. Никакого онбординга — просто сделай и получи.',
    revenue:0, minQ:0, minV:0, type:'small', npsStart:78, oneTime:true,
    fixedBudget:[70000, 90000], cooldown:3, rarity:'common',
    modifier:{ type:'one_time', val:0, label:'Разовый платёж' },
    modBadge:'mb-purple', prob:0.80,
  },
  {
    id:'consult_once', tier:1, icon:'💬', name:'Разовая консультация',
    desc:'Час-полтора с предпринимателем: стратегия, позиционирование, точки роста. Без портфолио, без требований.',
    revenue:0, minQ:0, minV:0, type:'small', npsStart:82, oneTime:true,
    fixedBudget:[70000, 90000], cooldown:3, rarity:'common',
    modifier:{ type:'one_time', val:0, label:'Разовый платёж' },
    modBadge:'mb-purple', prob:0.75,
  },

  // ═══════════════════════════════════════════════════
  //  TIER 1 — Регулярные
  // ═══════════════════════════════════════════════════
  {
    id:'loyal', tier:1, icon:'😊', name:'Лояльный заказчик',
    desc:'Простой проект, всегда доволен, платит вовремя. Идеальный первый клиент.',
    revenue:12000, minQ:0, minV:0, type:'small', npsStart:84, oneTime:false, rarity:'common',
    modifier:{ type:'nps_passive', val:+5, label:'+5 NPS/мес' },
    modBadge:'mb-green', prob:0.75,
  },
  {
    id:'referral', tier:1, icon:'🤝', name:'Тёплый лид (рекомендация)',
    desc:'Пришёл по рекомендации. Уже расположен к вам — NPS стартует выше нормы.',
    revenue:19000, minQ:0, minV:0, type:'small', npsStart:94, oneTime:false, rarity:'common',
    modifier:{ type:'nps_start', val:+14, label:'NPS старт +14' },
    modBadge:'mb-green', prob:0.80,
  },
  {
    id:'late_pay', tier:1, icon:'🕐', name:'Систематически задерживает',
    desc:'Хороший чек, но «деньги переведём на следующей неделе» — его фирменная фраза.',
    revenue:28000, minQ:0, minV:0, type:'small', npsStart:72, oneTime:false, rarity:'common',
    modifier:{ type:'payment_delay', val:0.40, label:'40% шанс задержки/мес' },
    modBadge:'mb-amber', prob:0.55,
  },
  {
    id:'local_shop', tier:1, icon:'🏪', name:'Местный магазин',
    desc:'Небольшой ритейл, хочет простой сайт и соцсети. Стабильный, без сюрпризов.',
    revenue:14000, minQ:0, minV:0, type:'small', npsStart:80, oneTime:false, rarity:'common',
    modifier:{ type:'nps_passive', val:+3, label:'+3 NPS/мес' },
    modBadge:'mb-green', prob:0.70,
  },
  {
    id:'photographer', tier:1, icon:'📷', name:'Фотограф-предприниматель',
    desc:'Нужен лендинг и продвижение. Не требует дизайнера — главное подача.',
    revenue:17000, minQ:0, minV:5, type:'small', npsStart:79, oneTime:false, rarity:'common',
    modifier:{ type:'nps_start', val:+8, label:'NPS старт +8' },
    modBadge:'mb-green', prob:0.65,
  },
  {
    id:'blogger', tier:1, icon:'✍️', name:'Блогер-ниша',
    desc:'Молодой инфлюенсер, монетизирует аудиторию. Платит немного, но NPS высокий.',
    revenue:15000, minQ:0, minV:8, type:'small', npsStart:86, oneTime:false, rarity:'common',
    modifier:{ type:'nps_passive', val:+4, label:'+4 NPS/мес' },
    modBadge:'mb-green', prob:0.60,
  },
  {
    id:'restaurant', tier:1, icon:'🍽️', name:'Ресторан',
    desc:'Владелец ресторана хочет Instagram и рекламу. Сезонность влияет на NPS.',
    revenue:22000, minQ:0, minV:5, type:'small', npsStart:74, oneTime:false, rarity:'common',
    modifier:{ type:'random_bonus', val:12000, label:'25% шанс бонуса 12К' },
    modBadge:'mb-teal', prob:0.60,
  },
  {
    id:'dental', tier:1, icon:'🦷', name:'Стоматологическая клиника',
    desc:'Клиника хочет выделиться среди конкурентов. Требует качество визуала.',
    revenue:26000, minQ:10, minV:0, type:'small', npsStart:76, oneTime:false, rarity:'uncommon',
    modifier:{ type:'nps_passive', val:+3, label:'+3 NPS/мес' },
    modBadge:'mb-green', prob:0.50,
  },
  {
    id:'language_school', tier:1, icon:'🌐', name:'Языковая школа',
    desc:'Хотят контент-маркетинг и рассылки. Стабильный клиент с умеренным NPS.',
    revenue:20000, minQ:0, minV:10, type:'small', npsStart:77, oneTime:false, rarity:'uncommon',
    modifier:{ type:'nps_passive', val:+2, label:'+2 NPS/мес' },
    modBadge:'mb-green', prob:0.55,
  },

  // ═══════════════════════════════════════════════════
  //  TIER 2
  // ═══════════════════════════════════════════════════
  {
    id:'perfectionist', tier:2, icon:'🔬', name:'Перфекционист',
    desc:'Платит хорошо, но никогда не удовлетворён. NPS тает быстрее без высокого качества.',
    revenue:40000, minQ:15, minV:0, type:'small', npsStart:68, oneTime:false, rarity:'common',
    modifier:{ type:'nps_drain', val:-8, label:'NPS −8 доп./мес' },
    modBadge:'mb-amber', prob:0.50,
  },
  {
    id:'startup_hype', tier:2, icon:'🚀', name:'Стартап на хайпе',
    desc:'Горит идеей, платит нерегулярно. Иногда кидает приятный бонус.',
    revenue:24000, minQ:0, minV:10, type:'small', npsStart:74, oneTime:false, rarity:'common',
    modifier:{ type:'random_bonus', val:18000, label:'30% шанс бонуса 18К' },
    modBadge:'mb-teal', prob:0.65,
  },
  {
    id:'urgent', tier:2, icon:'⚡', name:'Срочный разовый заказ',
    desc:'Нужно «ещё вчера». Хорошо платит единоразово и исчезает.',
    revenue:60000, minQ:10, minV:5, type:'small', npsStart:78, oneTime:true, rarity:'uncommon',
    modifier:{ type:'one_time', val:0, label:'Разовый платёж' },
    modBadge:'mb-purple', prob:0.60,
  },
  {
    id:'demanding_corp', tier:2, icon:'🏢', name:'Корпоративный KPI',
    desc:'Солидный чек, но штраф если NPS опустится ниже порога.',
    revenue:90000, minQ:30, minV:10, type:'corp', npsStart:66, oneTime:false, rarity:'uncommon',
    modifier:{ type:'nps_penalty', val:-22000, threshold:65, label:'NPS<65 → штраф 22К/мес' },
    modBadge:'mb-red', prob:0.35,
  },
  {
    id:'ecommerce', tier:2, icon:'🛒', name:'E-commerce магазин',
    desc:'Интернет-магазин 200+ SKU. Нужны каталог, контент и реклама.',
    revenue:48000, minQ:10, minV:10, type:'small', npsStart:73, oneTime:false, rarity:'common',
    modifier:{ type:'nps_passive', val:+2, label:'+2 NPS/мес' },
    modBadge:'mb-green', prob:0.55,
  },
  {
    id:'edtech', tier:2, icon:'🎓', name:'Образовательная платформа',
    desc:'EdTech-стартап масштабируется. Нужен сильный контент и визуал.',
    revenue:52000, minQ:15, minV:12, type:'small', npsStart:75, oneTime:false, rarity:'uncommon',
    modifier:{ type:'nps_passive', val:+3, label:'+3 NPS/мес' },
    modBadge:'mb-green', prob:0.45,
  },
  {
    id:'fitchain', tier:2, icon:'🏋️', name:'Фитнес-сеть',
    desc:'Сеть клубов хочет единый бренд и SMM. Платит регулярно, требует объём.',
    revenue:44000, minQ:0, minV:15, type:'store', npsStart:71, oneTime:false, rarity:'uncommon',
    modifier:{ type:'revenue_growth', val:0.04, label:'+4% выручки каждый мес' },
    modBadge:'mb-teal', prob:0.45,
  },
  {
    id:'lawfirm', tier:2, icon:'📜', name:'Юридическая фирма',
    desc:'Консервативный клиент с высокими требованиями к качеству. NPS строгий.',
    revenue:58000, minQ:20, minV:0, type:'corp', npsStart:64, oneTime:false, rarity:'uncommon',
    modifier:{ type:'nps_drain', val:-5, label:'NPS −5 доп./мес' },
    modBadge:'mb-amber', prob:0.40,
  },
  {
    id:'hr_platform', tier:2, icon:'👥', name:'HR-платформа',
    desc:'B2B SaaS для рекрутинга. Нужен объёмный контент: кейсы, вебинары, рассылки.',
    revenue:46000, minQ:0, minV:18, type:'small', npsStart:76, oneTime:false, rarity:'uncommon',
    modifier:{ type:'nps_passive', val:+2, label:'+2 NPS/мес' },
    modBadge:'mb-green', prob:0.45,
  },
  {
    id:'agro', tier:2, icon:'🌾', name:'Агрохолдинг',
    desc:'Неожиданный клиент из сектора АПК. Бюджет есть, требования скромные.',
    revenue:35000, minQ:10, minV:5, type:'small', npsStart:80, oneTime:false, rarity:'common',
    modifier:{ type:'nps_start', val:+10, label:'NPS старт +10' },
    modBadge:'mb-green', prob:0.50,
  },
  {
    id:'medical_center', tier:2, icon:'🏥', name:'Медицинский центр',
    desc:'Клиника с серьёзными ожиданиями по визуалу и имиджу. Хорошо платит, строго оценивает.',
    revenue:65000, minQ:25, minV:0, type:'corp', npsStart:65, oneTime:false, rarity:'rare',
    modifier:{ type:'nps_passive', val:+2, label:'+2 NPS/мес' },
    modBadge:'mb-green', prob:0.30,
  },

  // ═══════════════════════════════════════════════════
  //  TIER 3
  // ═══════════════════════════════════════════════════
  {
    id:'grey_zone', tier:3, icon:'🌫️', name:'Серая зона',
    desc:'Щедро платит, но проекты на грани закона. Репутация и портфолио страдают.',
    revenue:75000, minQ:0, minV:0, type:'small', npsStart:70, oneTime:false, rarity:'uncommon',
    modifier:{ type:'reputation', val:-12, label:'−12 репутации при подписании' },
    modBadge:'mb-red', prob:0.45,
  },
  {
    id:'state', tier:3, icon:'🏛️', name:'Государственный контракт',
    desc:'Огромный чек, но бюрократия: первые 2 месяца оплаты нет — готовь кэш.',
    revenue:130000, minQ:30, minV:15, type:'corp', npsStart:62, oneTime:false, rarity:'rare',
    duration:8,
    modifier:{ type:'payment_delay_fixed', val:2, label:'Первые 2 мес — нет оплаты' },
    modBadge:'mb-purple', prob:0.25,
  },
  {
    id:'retainer_plus', tier:3, icon:'💎', name:'Долгосрочный ретейнер',
    desc:'Стабильный крупный клиент с растущей ставкой за лояльность.',
    revenue:55000, minQ:20, minV:15, type:'store', npsStart:76, oneTime:false, rarity:'uncommon',
    modifier:{ type:'revenue_growth', val:0.05, label:'+5% выручки каждый мес' },
    modBadge:'mb-teal', prob:0.30,
  },
  {
    id:'federal_retail', tier:3, icon:'🏬', name:'Федеральный ритейлер',
    desc:'Сеть 500+ магазинов хочет единую коммуникацию. Большие требования, большой бюджет.',
    revenue:110000, minQ:25, minV:15, type:'corp', npsStart:65, oneTime:false, rarity:'rare',
    modifier:{ type:'nps_penalty', val:-30000, threshold:70, label:'NPS<70 → штраф 30К/мес' },
    modBadge:'mb-red', prob:0.28,
  },
  {
    id:'insurance', tier:3, icon:'🛡️', name:'Страховая компания',
    desc:'Консервативный корпоративный клиент. Стабильный доход, но NPS держать сложно.',
    revenue:85000, minQ:20, minV:10, type:'corp', npsStart:64, oneTime:false, rarity:'uncommon',
    modifier:{ type:'nps_drain', val:-6, label:'NPS −6 доп./мес' },
    modBadge:'mb-amber', prob:0.35,
  },
  {
    id:'media_holding', tier:3, icon:'📺', name:'Медиахолдинг',
    desc:'Крупный медиа-игрок. Нужен весь спектр: контент, визуал, стратегия.',
    revenue:95000, minQ:25, minV:20, type:'store', npsStart:68, oneTime:false, rarity:'rare',
    modifier:{ type:'revenue_growth', val:0.06, label:'+6% выручки каждый мес' },
    modBadge:'mb-teal', prob:0.25,
  },
  {
    id:'auto_dealer', tier:3, icon:'🚗', name:'Дилерская сеть',
    desc:'Крупный автодилер, хочет digital-присутствие. Платит аккуратно, NPS нестабилен.',
    revenue:80000, minQ:20, minV:10, type:'corp', npsStart:67, oneTime:false, rarity:'uncommon',
    modifier:{ type:'payment_delay', val:0.20, label:'20% шанс задержки/мес' },
    modBadge:'mb-amber', prob:0.30,
  },
  {
    id:'ministry', tier:3, icon:'🗂️', name:'Министерство (нацпроект)',
    desc:'Государственный нацпроект. Огромный бюджет, но бюрократия затягивает старт.',
    revenue:160000, minQ:35, minV:20, type:'corp', npsStart:58, oneTime:false, rarity:'epic',
    duration:10,
    modifier:{ type:'payment_delay_fixed', val:3, label:'Первые 3 мес — нет оплаты' },
    modBadge:'mb-purple', prob:0.15,
  },

  // ═══════════════════════════════════════════════════
  //  PORTFOLIO-GATED
  // ═══════════════════════════════════════════════════
  {
    id:'media_agency', tier:2, icon:'📊', name:'Медиа-агентство',
    desc:'Работают только с агентствами с историей. Требует портфолио.',
    revenue:54000, minQ:15, minV:10, type:'small', npsStart:77, oneTime:false, rarity:'uncommon',
    minPortfolio:12, portfolioWeight:2,
    modifier:{ type:'nps_passive', val:+4, label:'+4 NPS/мес' },
    modBadge:'mb-green', prob:0.55,
  },
  {
    id:'international', tier:3, icon:'🌍', name:'Международный клиент',
    desc:'Зарубежная компания с серьёзными требованиями к опыту агентства.',
    revenue:100000, minQ:25, minV:10, type:'corp', npsStart:70, oneTime:false, rarity:'rare',
    minPortfolio:28, portfolioWeight:3,
    modifier:{ type:'payment_delay', val:0.20, label:'20% шанс задержки/мес' },
    modBadge:'mb-amber', prob:0.38,
  },
  {
    id:'strategic_partner', tier:3, icon:'🤝', name:'Стратегический партнёр',
    desc:'Якорный долгосрочный контракт. Только для агентств с сильным портфолио.',
    revenue:80000, minQ:20, minV:15, type:'store', npsStart:82, oneTime:false, rarity:'rare',
    minPortfolio:50, portfolioWeight:3,
    modifier:{ type:'revenue_growth', val:0.08, label:'+8% выручки каждый мес' },
    modBadge:'mb-teal', prob:0.32,
  },
  {
    id:'developer_estate', tier:3, icon:'🏗️', name:'Девелопер недвижимости',
    desc:'Крупный застройщик с амбициозным брендингом. Портфолио обязательно.',
    revenue:90000, minQ:25, minV:15, type:'store', npsStart:70, oneTime:false, rarity:'rare',
    minPortfolio:20, portfolioWeight:2,
    modifier:{ type:'revenue_growth', val:0.05, label:'+5% выручки каждый мес' },
    modBadge:'mb-teal', prob:0.30,
  },

  // ═══════════════════════════════════════════════════
  //  TECH (требуют Разработчика)
  // ═══════════════════════════════════════════════════
  {
    id:'saas', tier:2, icon:'⚙️', name:'SaaS-интеграция',
    desc:'Технический клиент — настройка и поддержка платформы. Нужен Разработчик.',
    revenue:72000, minQ:20, minV:0, type:'corp', npsStart:74, oneTime:false, rarity:'uncommon',
    requiresDev:true,
    modifier:{ type:'nps_passive', val:+3, label:'+3 NPS/мес' },
    modBadge:'mb-teal', prob:0.50,
  },
  {
    id:'fintech', tier:3, icon:'🏦', name:'FinTech-платформа',
    desc:'Крупный технический контракт. Высокий порог качества и обязательно Разработчик.',
    revenue:115000, minQ:30, minV:10, type:'corp', npsStart:65, oneTime:false, rarity:'rare',
    requiresDev:true,
    modifier:{ type:'payment_delay_fixed', val:1, label:'1 мес — нет оплаты' },
    modBadge:'mb-purple', prob:0.30,
  },
  {
    id:'telecom', tier:3, icon:'📡', name:'Телеком-оператор',
    desc:'B2B-контракт с оператором. Нужен разработчик для интеграции с системами.',
    revenue:105000, minQ:25, minV:10, type:'corp', npsStart:63, oneTime:false, rarity:'rare',
    requiresDev:true,
    modifier:{ type:'nps_drain', val:-5, label:'NPS −5 доп./мес' },
    modBadge:'mb-amber', prob:0.28,
  },
  {
    id:'payment_sys', tier:3, icon:'💳', name:'Платёжная система',
    desc:'Fintech-гигант. Компания платит огромные деньги, но требует всего и сразу.',
    revenue:140000, minQ:35, minV:15, type:'corp', npsStart:60, oneTime:false, rarity:'epic',
    requiresDev:true,
    modifier:{ type:'nps_penalty', val:-40000, threshold:70, label:'NPS<70 → штраф 40К/мес' },
    modBadge:'mb-red', prob:0.15,
  },

  // ═══════════════════════════════════════════════════
  //  TIER 4 — Эндгейм (rep ≥ 80, portfolio ≥ 20)
  // ═══════════════════════════════════════════════════
  {
    id:'national_corp', tier:4, icon:'🏭', name:'Национальная корпорация',
    desc:'Системообразующее предприятие. Требует выдающейся команды и безупречного портфолио.',
    revenue:200000, minQ:40, minV:25, type:'corp', npsStart:62, oneTime:false, rarity:'epic',
    minPortfolio:20,
    modifier:{ type:'nps_penalty', val:-50000, threshold:70, label:'NPS<70 → штраф 50К/мес' },
    modBadge:'mb-red', prob:0.20,
  },
  {
    id:'intl_holding', tier:4, icon:'🌐', name:'Международный холдинг',
    desc:'Мультинациональная структура. Платит в валюте, но ждёт агентство уровня топ-5 рынка.',
    revenue:180000, minQ:35, minV:25, type:'store', npsStart:66, oneTime:false, rarity:'epic',
    minPortfolio:30,
    modifier:{ type:'revenue_growth', val:0.07, label:'+7% выручки каждый мес' },
    modBadge:'mb-teal', prob:0.18,
  },
  {
    id:'unicorn_startup', tier:4, icon:'🦄', name:'Единорог-стартап',
    desc:'Компания на пороге IPO. Нужен брендинг мирового уровня — и быстро.',
    revenue:220000, minQ:40, minV:20, type:'store', npsStart:70, oneTime:false, rarity:'epic',
    requiresDev:true,
    modifier:{ type:'payment_delay_fixed', val:1, label:'1 мес — нет оплаты' },
    modBadge:'mb-purple', prob:0.15,
  },
  {
    id:'state_mega', tier:4, icon:'🏛️', name:'Госмегапроект',
    desc:'Федеральная программа. Бюджет огромный, сроки жёсткие, бюрократия запредельная.',
    revenue:250000, minQ:35, minV:30, type:'corp', npsStart:55, oneTime:false, rarity:'epic',
    duration:12,
    minPortfolio:25,
    modifier:{ type:'payment_delay_fixed', val:3, label:'Первые 3 мес — нет оплаты' },
    modBadge:'mb-purple', prob:0.12,
  },
  {
    id:'enterprise_anchor', tier:4, icon:'⚓', name:'Enterprise-якорь',
    desc:'Долгосрочный ретейнер от крупнейшего игрока рынка. Мечта любого агентства.',
    revenue:160000, minQ:35, minV:20, type:'store', npsStart:72, oneTime:false, rarity:'epic',
    minPortfolio:40, portfolioWeight:4,
    modifier:{ type:'revenue_growth', val:0.10, label:'+10% выручки каждый мес' },
    modBadge:'mb-teal', prob:0.15,
  },
  {
    id:'bank_digital', tier:4, icon:'🏦', name:'Цифровой банк',
    desc:'Банк трансформируется в digital. Контракт с жёсткими KPI и большим потенциалом.',
    revenue:190000, minQ:40, minV:20, type:'corp', npsStart:60, oneTime:false, rarity:'epic',
    requiresDev:true, minPortfolio:20,
    modifier:{ type:'nps_passive', val:+2, label:'+2 NPS/мес' },
    modBadge:'mb-green', prob:0.15,
  },
];

// ── CASE GRADES ─────────────────────────────────────────
const CASE_GRADES = {
  bad: {
    id:'bad', label:'Слабый кейс', icon:'📄',
    color:'var(--muted)',
    qBonus:0, repBonus:0, scoutBonus:0,
    desc:'Минимальная сборка. Виден в портфолио, бонусов почти нет.',
  },
  normal: {
    id:'normal', label:'Нормальный кейс', icon:'📋',
    color:'var(--sub)',
    qBonus:1, repBonus:1, scoutBonus:0,
    desc:'+1 Q постоянно, восстановление репутации +1/мес.',
  },
  good: {
    id:'good', label:'Сильный кейс', icon:'📂',
    color:'var(--teal)',
    qBonus:2, repBonus:2, scoutBonus:0,
    desc:'+2 Q постоянно, восстановление репутации +2/мес.',
  },
  excellent: {
    id:'excellent', label:'Топ-кейс', icon:'💎',
    color:'var(--purple)',
    qBonus:4, repBonus:3, scoutBonus:1,
    desc:'+4 Q постоянно, реп. +3/мес, +1 лид при каждом скаутинге.',
  },
};

// ── EVENTS ──────────────────────────────────────────────
const EVENTS = [
  {
    id:'discount', icon:'🤝', title:'Клиент просит скидку',
    body:'Постоянный клиент просит снизить итоговый бюджет на 15%. Отказать — NPS падает, согласиться — теряешь часть выплаты.',
    choices:[
      { text:'Согласиться (−15% бюджета, NPS +12)', desc:'Клиент доволен, лояльность растёт',
        fn:g=>{
          const c=g.activeClients.length>0?g.activeClients[g.activeClients.length-1]:null;
          if(c&&c._totalBudget){
            const cut=Math.round(c._totalBudget*0.15);
            c._totalBudget=Math.max(0,c._totalBudget-cut);
            nudgeAllNPS(g,+12);
            notify(`🤝 Скидка: бюджет «${c.name}» −${fmt(cut)}, NPS +12`,'info');
          }
        } },
      { text:'Отказать', desc:'NPS у клиента −20 (риск ухода)',
        fn:g=>{ if(g.activeClients.length>0){ const c=g.activeClients[g.activeClients.length-1]; g.clientNPS[c.id]=Math.max(0,(g.clientNPS[c.id]||60)-20); } } },
    ]
  },
  {
    id:'quit', icon:'🚪', title:'Сотрудник хочет уйти',
    body:'Получил оффер. Можно удержать повышением или отпустить.',
    choices:[
      { text:'Повышение +20 000 ₽/мес', desc:'Остаётся, зарплата выше',
        fn:g=>{ if(g.staff.length>0){ g.staff[g.staff.length-1].cost+=20000; notify('Зарплата повышена 💰','info'); rd('Удержал сотрудника +20К/мес','hire'); } } },
      { text:'Отпустить', desc:'Теряешь его бонусы',
        fn:g=>{ if(g.staff.length>0){ const s=g.staff.pop(); notify(`${s.name} ушёл 😢`,'error'); rd(`${s.name} ушёл из команды`,'churn'); } } },
    ]
  },
  {
    id:'algo', icon:'📉', title:'Алгоритм сменился',
    body:'Апдейт платформ. Клиенты паникуют — NPS всех просел.',
    choices:[
      { text:'Антикризисный аудит (−30 000 ₽)', desc:'NPS +15 у всех',
        fn:g=>{ g.money-=30000; nudgeAllNPS(g,+15); notify('Аудит проведён ✅','info'); rd('Антикризисный аудит −30К','event'); } },
      { text:'Переждать', desc:'NPS всех клиентов −18',
        fn:g=>{ nudgeAllNPS(g,-18); notify('Клиенты недовольны 📉','warning'); } },
    ]
  },
  {
    id:'conflict', icon:'⚡', title:'Конфликт в команде',
    body:'Напряжение сказывается на работе — NPS клиентов падает.',
    choices:[
      { text:'Тимбилдинг (−25 000 ₽)', desc:'NPS +10, команда в потоке',
        fn:g=>{ g.money-=25000; nudgeAllNPS(g,+10); notify('Тимбилдинг помог 🎉','success'); rd('Тимбилдинг −25К','event'); } },
      { text:'Поговорить самому', desc:'50% — NPS −8 или без изменений',
        fn:g=>{ if(Math.random()<0.5) nudgeAllNPS(g,-8); else notify('Конфликт исчерпан 🤝','success'); } },
    ]
  },
];
