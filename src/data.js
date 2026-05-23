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

const SPECS = {
  smm:   { name:'SMM-агентство',  icon:'📱', bonus:'small_income', bonusVal:0.15 },
  seo:   { name:'SEO-агентство',  icon:'🔍', bonus:'staff_cost',   bonusVal:-0.10 },
  web:   { name:'Web-разработка', icon:'💻', bonus:'corp_income',  bonusVal:0.25 },
  brand: { name:'Брендинг',       icon:'✨', bonus:'store_income', bonusVal:0.40 },
};

const STAFF_DEFS = [
  { id:'designer',   name:'Дизайнер',      icon:'🎨', role:'Визуал + качество',      cost:67000, quality:20, volume:0,  capacity:0 },
  { id:'copywriter', name:'Копирайтер',    icon:'✍️', role:'Контент + объём',        cost:50000, quality:0,  volume:15, capacity:0 },
  { id:'manager',    name:'Менеджер',      icon:'📋', role:'Аккаунтинг',             cost:75000, quality:0,  volume:0,  capacity:2 },
  { id:'developer',  name:'Разработчик',   icon:'💻', role:'Кач +15 • тех-проекты',  cost:85000, quality:15, volume:0,  capacity:0 },
  { id:'smm',        name:'SMM-маркетолог',icon:'📣', role:'Объём +10 • +1 лид/скаут',cost:48000, quality:0,  volume:10, capacity:0 },
  { id:'lawyer',     name:'Юрист',         icon:'⚖️', role:'Штрафы и риски −50%',    cost:58000, quality:0,  volume:0,  capacity:0 },
  { id:'hr',         name:'HR-менеджер',   icon:'🤝', role:'NPS +3/мес • найм за 1 день', cost:42000, quality:0, volume:0, capacity:0 },
];

const MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];

// ── Q-UPGRADES ───────────────────────────────────────────
// oneTime:true  → постоянный бонус к qualityBonus (купить 1 раз)
// oneTime:false → разовый бонус к tempQBonus (сбрасывается в конце месяца)
const UPGRADES = [
  {
    id:'tools_q', icon:'🖥️', name:'Проф. инструментарий',
    desc:'Figma Pro, Adobe CC — команда работает без ограничений',
    cost:25000, days:1, qBonus:6,  repBonus:0, oneTime:true,
  },
  {
    id:'training_q', icon:'📚', name:'Курсы по дизайну',
    desc:'Онлайн-обучение + внутренний воркшоп для команды',
    cost:45000, days:2, qBonus:10, repBonus:0, oneTime:true,
  },
  {
    id:'consultant_q', icon:'🎯', name:'UX-консультант',
    desc:'Разовый аудит от топ-специалиста: Q-рост и репутация',
    cost:72000, days:1, qBonus:14, repBonus:5, oneTime:true,
  },
  {
    id:'freelance_q', icon:'✏️', name:'Фриланс-дизайнер',
    desc:'Временная помощь — Q только в этом месяце',
    cost:30000, days:1, qBonus:10, repBonus:0, oneTime:false,
  },
];

// ── PROJECT POOL ────────────────────────────────────────
// tier 1 = малый риск/доход, tier 2 = средний, tier 3 = высокий
// modifier.type: nps_passive | nps_start | nps_drain | payment_delay
//                payment_delay_fixed | one_time | reputation | nps_penalty | random_bonus
const PROJECT_POOL = [
  // ── TIER 1 ─────────────────────────────────────────
  {
    id:'loyal', tier:1, icon:'😊', name:'Лояльный заказчик',
    desc:'Простой проект, всегда доволен, платит вовремя. Идеальный первый клиент.',
    revenue:12000, minQ:0, minV:0, type:'small', npsStart:84, oneTime:false,
    modifier:{ type:'nps_passive', val:+5, label:'+5 NPS/мес' },
    modBadge:'mb-green', prob:0.75,
  },
  {
    id:'referral', tier:1, icon:'🤝', name:'Тёплый лид (рекомендация)',
    desc:'Пришёл по рекомендации. Уже расположен к вам — NPS стартует выше нормы.',
    revenue:19000, minQ:0, minV:0, type:'small', npsStart:94, oneTime:false,
    modifier:{ type:'nps_start', val:+14, label:'NPS старт +14' },
    modBadge:'mb-green', prob:0.80,
  },
  {
    id:'late_pay', tier:1, icon:'🕐', name:'Систематически задерживает',
    desc:'Хороший чек, но «деньги переведём на следующей неделе» — его фирменная фраза.',
    revenue:28000, minQ:0, minV:0, type:'small', npsStart:72, oneTime:false,
    modifier:{ type:'payment_delay', val:0.40, label:'40% шанс задержки/мес' },
    modBadge:'mb-amber', prob:0.55,
  },

  // ── TIER 2 ─────────────────────────────────────────
  {
    id:'perfectionist', tier:2, icon:'🔬', name:'Перфекционист',
    desc:'Платит хорошо, но никогда не удовлетворён. NPS тает быстрее без высокого качества.',
    revenue:40000, minQ:15, minV:0, type:'small', npsStart:68, oneTime:false,
    modifier:{ type:'nps_drain', val:-8, label:'NPS −8 доп./мес' },
    modBadge:'mb-amber', prob:0.50,
  },
  {
    id:'startup_hype', tier:2, icon:'🚀', name:'Стартап на хайпе',
    desc:'Горит идеей, платит нерегулярно. Иногда кидает приятный бонус.',
    revenue:24000, minQ:0, minV:10, type:'small', npsStart:74, oneTime:false,
    modifier:{ type:'random_bonus', val:18000, label:'30% шанс бонуса 18К' },
    modBadge:'mb-teal', prob:0.65,
  },
  {
    id:'urgent', tier:2, icon:'⚡', name:'Срочный разовый заказ',
    desc:'Нужно «ещё вчера». Хорошо платит единоразово и исчезает.',
    revenue:60000, minQ:10, minV:5, type:'small', npsStart:78, oneTime:true,
    modifier:{ type:'one_time', val:0, label:'Разовый платёж' },
    modBadge:'mb-purple', prob:0.60,
  },
  {
    id:'demanding_corp', tier:2, icon:'🏢', name:'Корпоративный KPI',
    desc:'Солидный чек, но штраф если NPS опустится ниже порога.',
    revenue:90000, minQ:30, minV:10, type:'corp', npsStart:66, oneTime:false,
    modifier:{ type:'nps_penalty', val:-22000, threshold:65, label:'NPS<65 → штраф 22К/мес' },
    modBadge:'mb-red', prob:0.35,
  },

  // ── TIER 3 ─────────────────────────────────────────
  {
    id:'grey_zone', tier:3, icon:'🌫️', name:'Серая зона',
    desc:'Щедро платит, но проекты на грани закона. Репутация и портфолио страдают.',
    revenue:75000, minQ:0, minV:0, type:'small', npsStart:70, oneTime:false,
    modifier:{ type:'reputation', val:-12, label:'−12 репутации при подписании' },
    modBadge:'mb-red', prob:0.45,
  },
  {
    id:'state', tier:3, icon:'🏛️', name:'Государственный контракт',
    desc:'Огромный чек, но бюрократия: первые 2 месяца оплаты нет — готовь кэш.',
    revenue:130000, minQ:30, minV:15, type:'corp', npsStart:62, oneTime:false,
    modifier:{ type:'payment_delay_fixed', val:2, label:'Первые 2 мес — нет оплаты' },
    modBadge:'mb-purple', prob:0.25,
  },
  {
    id:'retainer_plus', tier:3, icon:'💎', name:'Долгосрочный ретейнер',
    desc:'Стабильный крупный клиент с растущей ставкой за лояльность.',
    revenue:55000, minQ:20, minV:15, type:'store', npsStart:76, oneTime:false,
    modifier:{ type:'revenue_growth', val:0.05, label:'+5% выручки каждый мес' },
    modBadge:'mb-teal', prob:0.30,
  },

  // ── PORTFOLIO-GATED ──────────────────────────────────
  {
    id:'media_agency', tier:2, icon:'📊', name:'Медиа-агентство',
    desc:'Работают только с агентствами с историей. Требует портфолио.',
    revenue:54000, minQ:15, minV:10, type:'small', npsStart:77, oneTime:false,
    minPortfolio:12, portfolioWeight:2,
    modifier:{ type:'nps_passive', val:+4, label:'+4 NPS/мес' },
    modBadge:'mb-green', prob:0.55,
  },
  {
    id:'international', tier:3, icon:'🌍', name:'Международный клиент',
    desc:'Зарубежная компания с серьёзными требованиями к опыту агентства.',
    revenue:100000, minQ:25, minV:10, type:'corp', npsStart:70, oneTime:false,
    minPortfolio:28, portfolioWeight:3,
    modifier:{ type:'payment_delay', val:0.20, label:'20% шанс задержки/мес' },
    modBadge:'mb-amber', prob:0.38,
  },
  {
    id:'strategic_partner', tier:3, icon:'🤝', name:'Стратегический партнёр',
    desc:'Якорный долгосрочный контракт. Только для агентств с сильным портфолио.',
    revenue:80000, minQ:20, minV:15, type:'store', npsStart:82, oneTime:false,
    minPortfolio:50, portfolioWeight:3,
    modifier:{ type:'revenue_growth', val:0.08, label:'+8% выручки каждый мес' },
    modBadge:'mb-teal', prob:0.32,
  },

  // ── TECH (требуют Разработчика) ─────────────────────
  {
    id:'saas', tier:2, icon:'⚙️', name:'SaaS-интеграция',
    desc:'Технический клиент — настройка и поддержка платформы. Нужен Разработчик в команде.',
    revenue:72000, minQ:20, minV:0, type:'corp', npsStart:74, oneTime:false,
    requiresDev:true,
    modifier:{ type:'nps_passive', val:+3, label:'+3 NPS/мес' },
    modBadge:'mb-teal', prob:0.50,
  },
  {
    id:'fintech', tier:3, icon:'🏦', name:'FinTech-платформа',
    desc:'Крупный технический контракт. Высокий порог качества и обязательно нужен Разработчик.',
    revenue:115000, minQ:30, minV:10, type:'corp', npsStart:65, oneTime:false,
    requiresDev:true,
    modifier:{ type:'payment_delay_fixed', val:1, label:'1 мес — нет оплаты' },
    modBadge:'mb-purple', prob:0.30,
  },
];

// ── EVENTS ──────────────────────────────────────────────
const EVENTS = [
  {
    id:'discount', icon:'🤝', title:'Клиент просит скидку',
    body:'Постоянный клиент просит снизить чек на 15%. Отказать — NPS падает, согласиться — теряешь доход.',
    choices:[
      { text:'Согласиться (−15% дохода, NPS +12)', desc:'Клиент доволен, лояльность растёт',
        fn:g=>{ g.tempDiscount=0.15; nudgeAllNPS(g,+12); } },
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
