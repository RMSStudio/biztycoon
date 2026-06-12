// ══════════════════════════════════════════════════════
//  SCENARIO DATA: Региональный банк (🏦)
//  ЧИСТЫЕ ДАННЫЕ — без кода. Формат значения: строгий JSON,
//  можно редактировать любым текстовым редактором.
//  События — декларативные эффекты (DSL: src/scenario-loader.js).
//  Godot читает этот же объект как JSON напрямую.
// ══════════════════════════════════════════════════════
window.SCENARIO_DATA = {
  "id": "bank",
  "name": "Региональный банк",
  "icon": "🏦",
  "settings": {
    "startMoney": 2000000,
    "startReputation": 60,
    "overhead": 85000,
    "actionsPerMonth": 21,
    "scoutCost": 6,
    "hireCost": 4,
    "winCondition": 9000000,
    "introText": "Ты получил лицензию и открываешь <strong>региональный банк</strong>. Заявки не приходят сами — каждый <strong>скаутинг</strong> входящего потока стоит рабочих дней. Каждая сделка — свой риск: кто-то тянет с платежами, у кого-то маржа отличная, но репутация сомнительная. Доведи капитал до <strong>9 000 000 ₽</strong> и не попади под санкции регулятора.",
    "workdays": [
      17,
      20,
      21,
      22,
      18,
      21,
      23,
      21,
      22,
      23,
      20,
      22
    ]
  },
  "specs": {
    "retail": {
      "name": "Розничный банк",
      "icon": "👛",
      "bonus": "small_income",
      "bonusVal": 0.2,
      "bonusLabel": "+20% к доходу розничных сделок",
      "passive": "scout_offers",
      "passiveVal": 1,
      "passiveLabel": "+1 заявка при каждом скаутинге",
      "desc": "Потребкредиты, карты, вклады. Большой поток мелких сделок, быстрый оборот."
    },
    "corporate": {
      "name": "Корпоративный банк",
      "icon": "🏭",
      "bonus": "corp_income",
      "bonusVal": 0.25,
      "bonusLabel": "+25% к доходу корпоративных сделок",
      "passive": "nps_start",
      "passiveVal": 5,
      "passiveLabel": "+5 к стартовой лояльности клиентов",
      "desc": "Кредитование бизнеса, РКО, гарантии. Меньше сделок — выше чеки."
    },
    "digital": {
      "name": "Цифровой банк",
      "icon": "📲",
      "bonus": "staff_cost",
      "bonusVal": -0.1,
      "bonusLabel": "−10% расходов на персонал",
      "passive": "speed",
      "passiveVal": 0.1,
      "passiveLabel": "+10% скорость обработки сделок",
      "desc": "Без отделений, всё в приложении. Технологичная команда, низкие издержки."
    },
    "private": {
      "name": "Private Banking",
      "icon": "💎",
      "bonus": "store_income",
      "bonusVal": 0.4,
      "bonusLabel": "+40% к доходу премиальных клиентов",
      "passive": "nps_start_store",
      "passiveVal": 10,
      "passiveLabel": "+10 лояльности премиальным клиентам",
      "desc": "Состоятельные семьи и их капиталы. Доверие решает всё."
    }
  },
  "staffRoles": [
    "designer",
    "copywriter",
    "manager",
    "developer",
    "smm",
    "lawyer",
    "hr"
  ],
  "roleLabels": {
    "designer": {
      "name": "Кредитный аналитик",
      "icon": "📈"
    },
    "copywriter": {
      "name": "Операционист",
      "icon": "🧾"
    },
    "manager": {
      "name": "Управляющий",
      "icon": "🗝"
    },
    "developer": {
      "name": "IT-инженер",
      "icon": "💻"
    },
    "smm": {
      "name": "Менеджер продаж",
      "icon": "📞"
    },
    "lawyer": {
      "name": "Комплаенс-юрист",
      "icon": "⚖️"
    },
    "hr": {
      "name": "HR-партнёр",
      "icon": "🤝"
    }
  },
  "roleMeta": {
    "designer": {
      "id": "designer",
      "label": "Кредитный аналитик",
      "emoji": "📈",
      "color": "#ec4899"
    },
    "copywriter": {
      "id": "copywriter",
      "label": "Операционист",
      "emoji": "🧾",
      "color": "#f59e0b"
    },
    "manager": {
      "id": "manager",
      "label": "Управляющий",
      "emoji": "🗝",
      "color": "#6366f1"
    },
    "developer": {
      "id": "developer",
      "label": "IT-инженер",
      "emoji": "💻",
      "color": "#06b6d4"
    },
    "smm": {
      "id": "smm",
      "label": "Менеджер продаж",
      "emoji": "📞",
      "color": "#10b981"
    },
    "lawyer": {
      "id": "lawyer",
      "label": "Комплаенс-юрист",
      "emoji": "⚖️",
      "color": "#8b5cf6"
    },
    "hr": {
      "id": "hr",
      "label": "HR-партнёр",
      "emoji": "🤝",
      "color": "#f97316"
    }
  },
  "roleCategories": [
    {
      "id": "credit",
      "label": "Кредитование",
      "emoji": "📈",
      "roles": [
        "designer",
        "copywriter",
        "smm"
      ]
    },
    {
      "id": "tech",
      "label": "Технологии",
      "emoji": "💻",
      "roles": [
        "developer"
      ]
    },
    {
      "id": "management",
      "label": "Управление",
      "emoji": "🗝",
      "roles": [
        "manager",
        "hr"
      ]
    },
    {
      "id": "compliance",
      "label": "Комплаенс",
      "emoji": "⚖️",
      "roles": [
        "lawyer"
      ]
    }
  ],
  "staff": [
    {
      "id": "designer",
      "role": "designer",
      "grade": "md",
      "gradeLabel": "Middle",
      "name": "Кредитный аналитик",
      "icon": "📈",
      "desc": "Качество портфеля",
      "cost": 55000,
      "quality": 12,
      "volume": 0,
      "capacity": 0,
      "throughput": 7,
      "speedBonus": 0,
      "unlockCond": null
    },
    {
      "id": "copywriter",
      "role": "copywriter",
      "grade": "md",
      "gradeLabel": "Middle",
      "name": "Операционист",
      "icon": "🧾",
      "desc": "Объём операций",
      "cost": 40000,
      "quality": 0,
      "volume": 15,
      "capacity": 0,
      "throughput": 5,
      "speedBonus": 0,
      "unlockCond": null
    },
    {
      "id": "manager",
      "role": "manager",
      "grade": "md",
      "gradeLabel": "Middle",
      "name": "Управляющий",
      "icon": "🗝",
      "desc": "Слоты сделок",
      "cost": 60000,
      "quality": 0,
      "volume": 0,
      "capacity": 2,
      "throughput": 5,
      "speedBonus": 0.05,
      "unlockCond": null
    },
    {
      "id": "developer",
      "role": "developer",
      "grade": "md",
      "gradeLabel": "Middle",
      "name": "IT-инженер",
      "icon": "💻",
      "desc": "Технологичные сделки",
      "cost": 70000,
      "quality": 8,
      "volume": 0,
      "capacity": 0,
      "throughput": 7,
      "speedBonus": 0.05,
      "unlockCond": null
    },
    {
      "id": "smm",
      "role": "smm",
      "grade": "md",
      "gradeLabel": "Middle",
      "name": "Менеджер продаж",
      "icon": "📞",
      "desc": "+1 заявка при скаутинге",
      "cost": 38000,
      "quality": 0,
      "volume": 10,
      "capacity": 0,
      "throughput": 3,
      "speedBonus": 0,
      "unlockCond": null
    },
    {
      "id": "lawyer",
      "role": "lawyer",
      "grade": "md",
      "gradeLabel": "Middle",
      "name": "Комплаенс-юрист",
      "icon": "⚖️",
      "desc": "Юридика, штрафы −50%",
      "cost": 48000,
      "quality": 0,
      "volume": 0,
      "capacity": 0,
      "throughput": 2,
      "speedBonus": 0,
      "unlockCond": null
    },
    {
      "id": "hr",
      "role": "hr",
      "grade": "md",
      "gradeLabel": "Middle",
      "name": "HR-партнёр",
      "icon": "🤝",
      "desc": "Усталость −30%",
      "cost": 35000,
      "quality": 0,
      "volume": 0,
      "capacity": 0,
      "throughput": 2,
      "speedBonus": 0,
      "unlockCond": null
    }
  ],
  "budgetRanges": {
    "1": [
      450000,
      900000
    ],
    "2": [
      1800000,
      3800000
    ],
    "3": [
      4500000,
      8500000
    ],
    "4": [
      9000000,
      18000000
    ],
    "5": [
      16000000,
      32000000
    ],
    "6": [
      30000000,
      65000000
    ],
    "7": [
      70000000,
      140000000
    ]
  },
  "projects": [
    {
      "id": "fx_deal",
      "tier": 1,
      "icon": "💱",
      "name": "Валютный контракт",
      "desc": "Импортёр конвертирует крупную сумму под сделку. Комиссия здесь и сейчас — нужна только свободная операционка.",
      "revenue": 0,
      "minQ": 0,
      "minV": 0,
      "type": "small",
      "npsStart": 80,
      "oneTime": true,
      "fixedBudget": [
        200000,
        320000
      ],
      "cooldown": 3,
      "rarity": "common",
      "modifier": {
        "type": "one_time",
        "val": 0,
        "label": "Разовая комиссия"
      },
      "modBadge": "mb-purple",
      "prob": 0.8
    },
    {
      "id": "bank_guarantee",
      "tier": 1,
      "icon": "📜",
      "name": "Банковская гарантия",
      "desc": "Подрядчику нужна гарантия на тендер к пятнице. Быстрые деньги при свободной мощности.",
      "revenue": 0,
      "minQ": 0,
      "minV": 0,
      "type": "small",
      "npsStart": 78,
      "oneTime": true,
      "fixedBudget": [
        220000,
        350000
      ],
      "cooldown": 3,
      "rarity": "common",
      "modifier": {
        "type": "one_time",
        "val": 0,
        "label": "Разовая комиссия"
      },
      "modBadge": "mb-purple",
      "prob": 0.75
    },
    {
      "id": "salary_project",
      "tier": 1,
      "icon": "💳",
      "name": "Зарплатный проект",
      "desc": "Магазин на тридцать сотрудников переводит зарплаты к нам. Скромно, зато стабильно и без сюрпризов.",
      "revenue": 0,
      "minQ": 0,
      "minV": 0,
      "type": "small",
      "npsStart": 76,
      "oneTime": false,
      "rarity": "common",
      "prepayChance": 0.2,
      "prob": 0.75,
      "modifier": {
        "type": "nps_passive",
        "val": 2,
        "label": "+2 лояльности/мес"
      },
      "modBadge": "mb-green"
    },
    {
      "id": "consumer_batch",
      "tier": 1,
      "icon": "🛍",
      "name": "Пакет потребкредитов",
      "desc": "Партнёрская сеть электроники гонит поток заявок на рассрочку. Объём решает.",
      "revenue": 0,
      "minQ": 0,
      "minV": 8,
      "type": "small",
      "npsStart": 72,
      "oneTime": false,
      "rarity": "common",
      "prepayChance": 0,
      "prob": 0.7,
      "modifier": {
        "type": "none",
        "val": 0,
        "label": "Поточная розница"
      },
      "modBadge": "mb-green"
    },
    {
      "id": "sme_rko",
      "tier": 1,
      "icon": "🏪",
      "name": "РКО малого бизнеса",
      "desc": "Кофейня с двумя точками: счёт, эквайринг, инкассация. Хочет персонального менеджера и человеческое отношение.",
      "revenue": 0,
      "minQ": 0,
      "minV": 0,
      "type": "small",
      "npsStart": 74,
      "oneTime": false,
      "rarity": "common",
      "prepayChance": 0.25,
      "prob": 0.7,
      "modifier": {
        "type": "none",
        "val": 0,
        "label": "Расчётное обслуживание"
      },
      "modBadge": "mb-green"
    },
    {
      "id": "late_borrower",
      "tier": 1,
      "icon": "⏳",
      "name": "Заёмщик с историей",
      "desc": "Кредитная история так себе, но залог хороший. Платит, просто не всегда вовремя.",
      "revenue": 0,
      "minQ": 0,
      "minV": 0,
      "type": "small",
      "npsStart": 64,
      "oneTime": false,
      "rarity": "common",
      "prepayChance": 0,
      "prob": 0.55,
      "modifier": {
        "type": "payment_delay",
        "val": 0.4,
        "label": "40% шанс задержки оплаты"
      },
      "modBadge": "mb-amber"
    },
    {
      "id": "card_program",
      "tier": 1,
      "icon": "💎",
      "name": "Кобрендовая карта",
      "desc": "Локальная сеть фитнес-клубов хочет карту со своим лого. Маркетинговая возня, зато комиссия с каждой транзакции.",
      "revenue": 0,
      "minQ": 8,
      "minV": 5,
      "type": "small",
      "npsStart": 70,
      "oneTime": false,
      "rarity": "uncommon",
      "prepayChance": 0.3,
      "prob": 0.55,
      "modifier": {
        "type": "revenue_growth",
        "val": 0.04,
        "label": "+4% дохода каждый мес"
      },
      "modBadge": "mb-teal"
    },
    {
      "id": "auto_fleet",
      "tier": 2,
      "icon": "🚚",
      "name": "Автопарк в лизинг",
      "desc": "Логистическая компания обновляет двадцать машин. Стандартный лизинг, понятный залог.",
      "revenue": 0,
      "minQ": 10,
      "minV": 5,
      "type": "corp",
      "npsStart": 72,
      "oneTime": false,
      "rarity": "common",
      "prepayChance": 0.4,
      "prob": 0.6,
      "modifier": {
        "type": "none",
        "val": 0,
        "label": "Лизинговая сделка"
      },
      "modBadge": "mb-green"
    },
    {
      "id": "mortgage_mini",
      "tier": 2,
      "icon": "🏠",
      "name": "Ипотечная мини-программа",
      "desc": "Локальный застройщик приводит покупателей своих квартир. Долгие деньги, проценты капают.",
      "revenue": 0,
      "minQ": 12,
      "minV": 8,
      "type": "small",
      "npsStart": 70,
      "oneTime": false,
      "rarity": "common",
      "prepayChance": 0.3,
      "prob": 0.55,
      "modifier": {
        "type": "revenue_growth",
        "val": 0.05,
        "label": "+5% дохода каждый мес"
      },
      "modBadge": "mb-teal"
    },
    {
      "id": "restaurant_chain",
      "tier": 2,
      "icon": "🍽",
      "name": "Эквайринг ресторанной сети",
      "desc": "Восемь ресторанов, высокий оборот, капризный владелец. Требует SLA по каждой транзакции.",
      "revenue": 0,
      "minQ": 14,
      "minV": 10,
      "type": "corp",
      "npsStart": 62,
      "oneTime": false,
      "rarity": "uncommon",
      "prepayChance": 0.35,
      "prob": 0.5,
      "modifier": {
        "type": "nps_penalty",
        "val": -30000,
        "threshold": 60,
        "label": "SLA-штраф при лояльности<60"
      },
      "modBadge": "mb-amber"
    },
    {
      "id": "grey_importer",
      "tier": 2,
      "icon": "🕶",
      "name": "Импортёр «с нюансами»",
      "desc": "Маржа отличная, происхождение товара туманное. Комплаенс нервничает, регулятор может спросить.",
      "revenue": 0,
      "minQ": 0,
      "minV": 0,
      "type": "corp",
      "npsStart": 66,
      "oneTime": false,
      "rarity": "uncommon",
      "prepayChance": 0.6,
      "prob": 0.45,
      "modifier": {
        "type": "reputation",
        "val": -12,
        "label": "−12 репутации при подписании"
      },
      "modBadge": "mb-red"
    },
    {
      "id": "fintech_startup",
      "tier": 2,
      "icon": "🚀",
      "name": "Финтех-стартап (BaaS)",
      "desc": "Стартапу нужен банк-партнёр под их приложение: API, счета, карты. Без сильного IT не подступиться.",
      "revenue": 0,
      "minQ": 12,
      "minV": 0,
      "type": "corp",
      "npsStart": 68,
      "oneTime": false,
      "rarity": "uncommon",
      "requiresDev": true,
      "prepayChance": 0.45,
      "prob": 0.5,
      "modifier": {
        "type": "revenue_growth",
        "val": 0.06,
        "label": "+6% дохода каждый мес"
      },
      "modBadge": "mb-teal"
    },
    {
      "id": "private_family",
      "tier": 2,
      "icon": "👜",
      "name": "Семейный капитал",
      "desc": "Семья врачей размещает накопления и берёт ипотеку на дом. Премиальный сервис, сарафанное радио.",
      "revenue": 0,
      "minQ": 15,
      "minV": 0,
      "type": "store",
      "npsStart": 75,
      "oneTime": false,
      "rarity": "uncommon",
      "prepayChance": 0.3,
      "prob": 0.45,
      "modifier": {
        "type": "nps_passive",
        "val": 3,
        "label": "+3 лояльности/мес"
      },
      "modBadge": "mb-green"
    },
    {
      "id": "factory_loan",
      "tier": 3,
      "icon": "🏭",
      "name": "Кредит производству",
      "desc": "Завод модернизирует линию. Залог — недвижимость и оборудование. Андеррайтинг на совесть.",
      "revenue": 0,
      "minQ": 20,
      "minV": 10,
      "type": "corp",
      "npsStart": 68,
      "oneTime": false,
      "rarity": "common",
      "prepayChance": 0.5,
      "prob": 0.45,
      "modifier": {
        "type": "none",
        "val": 0,
        "label": "Залоговое кредитование"
      },
      "modBadge": "mb-green"
    },
    {
      "id": "gov_mortgage",
      "tier": 3,
      "icon": "🏛",
      "name": "Госпрограмма льготной ипотеки",
      "desc": "Субсидируемая ставка, гарантированный поток заёмщиков — и три месяца согласований до первого транша.",
      "revenue": 0,
      "minQ": 18,
      "minV": 15,
      "type": "small",
      "npsStart": 70,
      "oneTime": false,
      "rarity": "rare",
      "prepayChance": 0.7,
      "duration": 12,
      "prob": 0.35,
      "modifier": {
        "type": "payment_delay_fixed",
        "val": 2,
        "label": "Старт через 2 мес (бюрократия)"
      },
      "modBadge": "mb-amber"
    },
    {
      "id": "retail_factoring",
      "tier": 3,
      "icon": "📦",
      "name": "Факторинг ритейлера",
      "desc": "Региональная сеть продуктовых хочет финансирование под дебиторку. Оборот огромный, маржа тонкая, риск концентрации.",
      "revenue": 0,
      "minQ": 22,
      "minV": 12,
      "type": "corp",
      "npsStart": 64,
      "oneTime": false,
      "rarity": "rare",
      "prepayChance": 0.4,
      "prob": 0.38,
      "modifier": {
        "type": "payment_delay",
        "val": 0.25,
        "label": "25% шанс задержки траншей"
      },
      "modBadge": "mb-amber"
    },
    {
      "id": "private_office",
      "tier": 3,
      "icon": "🗄",
      "name": "Family office",
      "desc": "Капитал владельца агрохолдинга: депозиты, бумаги, наследственное планирование. Ошибок не прощают.",
      "revenue": 0,
      "minQ": 25,
      "minV": 0,
      "type": "store",
      "npsStart": 66,
      "oneTime": false,
      "rarity": "rare",
      "prepayChance": 0.35,
      "prob": 0.32,
      "modifier": {
        "type": "nps_penalty",
        "val": -50000,
        "threshold": 65,
        "label": "Штраф доверия при лояльности<65"
      },
      "modBadge": "mb-amber"
    },
    {
      "id": "bond_issue",
      "tier": 4,
      "icon": "📊",
      "name": "Облигационный выпуск",
      "desc": "Андеррайтинг облигаций областного водоканала. Имя банка — на проспекте эмиссии.",
      "revenue": 0,
      "minQ": 30,
      "minV": 15,
      "type": "corp",
      "npsStart": 64,
      "oneTime": false,
      "rarity": "epic",
      "prepayChance": 0.5,
      "minPortfolio": 20,
      "prob": 0.25,
      "modifier": {
        "type": "none",
        "val": 0,
        "label": "Андеррайтинг"
      },
      "modBadge": "mb-green"
    },
    {
      "id": "digital_bank_b2b",
      "tier": 4,
      "icon": "🛠",
      "name": "Белый лейбл для маркетплейса",
      "desc": "Маркетплейс хочет «свой банк» на нашей лицензии и нашем ядре. Огромный IT-проект.",
      "revenue": 0,
      "minQ": 28,
      "minV": 18,
      "type": "corp",
      "npsStart": 66,
      "oneTime": false,
      "rarity": "epic",
      "requiresDev": true,
      "prepayChance": 0.55,
      "prob": 0.22,
      "modifier": {
        "type": "revenue_growth",
        "val": 0.05,
        "label": "+5% дохода каждый мес"
      },
      "modBadge": "mb-teal"
    },
    {
      "id": "region_infra",
      "tier": 5,
      "icon": "🌉",
      "name": "Инфраструктурный кредит региону",
      "desc": "Софинансирование моста через реку. Госгарантии, длинные деньги, политическая видимость.",
      "revenue": 0,
      "minQ": 32,
      "minV": 20,
      "type": "corp",
      "npsStart": 62,
      "oneTime": false,
      "rarity": "rare",
      "prepayChance": 0.6,
      "prob": 0.3,
      "modifier": {
        "type": "payment_delay_fixed",
        "val": 2,
        "label": "Транши с задержкой (казначейство)"
      },
      "modBadge": "mb-amber"
    },
    {
      "id": "agro_holding",
      "tier": 5,
      "icon": "🌾",
      "name": "Сезонный кредит агрохолдингу",
      "desc": "Посевная — уборочная — расчёт. Классика регионального банкинга в максимальном масштабе.",
      "revenue": 0,
      "minQ": 30,
      "minV": 22,
      "type": "corp",
      "npsStart": 65,
      "oneTime": false,
      "rarity": "rare",
      "prepayChance": 0.5,
      "prob": 0.3,
      "modifier": {
        "type": "revenue_growth",
        "val": 0.04,
        "label": "+4% дохода каждый мес"
      },
      "modBadge": "mb-teal"
    },
    {
      "id": "ma_financing",
      "tier": 6,
      "icon": "🤝",
      "name": "Финансирование M&A",
      "desc": "Местный холдинг покупает конкурента из соседней области. Синдикат, юристы, дедлайны сделки.",
      "revenue": 0,
      "minQ": 36,
      "minV": 22,
      "type": "corp",
      "npsStart": 60,
      "oneTime": false,
      "rarity": "epic",
      "requiresLegal": true,
      "prepayChance": 0.55,
      "prob": 0.22,
      "modifier": {
        "type": "nps_penalty",
        "val": -100000,
        "threshold": 65,
        "label": "Срыв сроков сделки — штраф"
      },
      "modBadge": "mb-amber"
    },
    {
      "id": "concession",
      "tier": 7,
      "icon": "🏗",
      "name": "Концессия аэропорта",
      "desc": "Тридцатилетняя концессия с участием федерального капитала. Сделка, после которой банк попадает в учебники.",
      "revenue": 0,
      "minQ": 42,
      "minV": 26,
      "type": "corp",
      "npsStart": 58,
      "oneTime": false,
      "rarity": "legendary",
      "requiresLegal": true,
      "requiresDev": true,
      "prepayChance": 0.65,
      "duration": 22,
      "minPortfolio": 80,
      "prob": 0.15,
      "modifier": {
        "type": "payment_delay_fixed",
        "val": 3,
        "label": "Старт через 3 мес (структурирование)"
      },
      "modBadge": "mb-amber"
    }
  ],
  "upgrades": [
    {
      "id": "tools_q",
      "icon": "🧮",
      "name": "Скоринговая модель",
      "desc": "Автоматическая оценка заёмщиков.",
      "cost": 30000,
      "days": 2,
      "qBonus": 4,
      "repBonus": 0,
      "oneTime": true,
      "speedBonus": 0,
      "treePos": {
        "col": 0,
        "row": 0
      }
    },
    {
      "id": "training_q",
      "icon": "🎓",
      "name": "Школа андеррайтинга",
      "desc": "Системное обучение специалистов.",
      "cost": 50000,
      "days": 4,
      "qBonus": 7,
      "repBonus": 0,
      "oneTime": true,
      "speedBonus": 0,
      "treePos": {
        "col": 0,
        "row": 1
      },
      "requires": [
        "tools_q"
      ]
    },
    {
      "id": "consultant_q",
      "icon": "🛡",
      "name": "Кредитный комитет",
      "desc": "Коллегиальные решения по крупным сделкам.",
      "cost": 80000,
      "days": 2,
      "qBonus": 10,
      "repBonus": 3,
      "oneTime": true,
      "speedBonus": 0,
      "treePos": {
        "col": 0,
        "row": 2
      },
      "requires": [
        "training_q"
      ]
    },
    {
      "id": "standards_q",
      "icon": "📐",
      "name": "Базель по-домашнему",
      "desc": "Вершина пути качества. Закрывает «Конвейер».",
      "cost": 100000,
      "days": 4,
      "qBonus": 6,
      "repBonus": 2,
      "oneTime": true,
      "speedBonus": 0,
      "treePos": {
        "col": 0,
        "row": 3
      },
      "requires": [
        "consultant_q"
      ],
      "excludes": [
        "ai_workflow"
      ]
    },
    {
      "id": "agile",
      "icon": "⚙️",
      "name": "Цифровой документооборот",
      "desc": "Процессы без лишних согласований.",
      "cost": 45000,
      "days": 4,
      "qBonus": 0,
      "repBonus": 0,
      "oneTime": true,
      "speedBonus": 0.1,
      "treePos": {
        "col": 1,
        "row": 0
      }
    },
    {
      "id": "scrum",
      "icon": "🔁",
      "name": "Кредитный конвейер",
      "desc": "Типовые сделки — по выделенной линии.",
      "cost": 70000,
      "days": 4,
      "qBonus": 0,
      "repBonus": 0,
      "oneTime": true,
      "speedBonus": 0.15,
      "treePos": {
        "col": 1,
        "row": 1
      },
      "requires": [
        "agile"
      ]
    },
    {
      "id": "automation",
      "icon": "🤖",
      "name": "RPA-роботизация",
      "desc": "Роботы заполняют формы.",
      "cost": 95000,
      "days": 6,
      "qBonus": 0,
      "repBonus": 0,
      "oneTime": true,
      "speedBonus": 0.2,
      "treePos": {
        "col": 1,
        "row": 2
      },
      "requires": [
        "scrum"
      ]
    },
    {
      "id": "ai_workflow",
      "icon": "🧠",
      "name": "ИИ-андеррайтинг",
      "desc": "Вершина пути скорости. Требует инструментарий качества. Закрывает «Стандарты».",
      "cost": 140000,
      "days": 6,
      "qBonus": 3,
      "repBonus": 0,
      "oneTime": true,
      "speedBonus": 0.1,
      "treePos": {
        "col": 1,
        "row": 3
      },
      "requires": [
        "automation",
        "tools_q"
      ],
      "excludes": [
        "standards_q"
      ]
    },
    {
      "id": "team_rituals",
      "icon": "🧘",
      "name": "Регламенты отделения",
      "desc": "Здоровый ритм: рост усталости −15% навсегда.",
      "cost": 25000,
      "days": 2,
      "qBonus": 0,
      "repBonus": 0,
      "oneTime": true,
      "speedBonus": 0,
      "treePos": {
        "col": 2,
        "row": 0
      },
      "fatigueRateMult": 0.85
    },
    {
      "id": "team_dms",
      "icon": "🏥",
      "name": "ДМС и спорт",
      "desc": "Команда восстанавливается на +3/мес быстрее.",
      "cost": 45000,
      "days": 2,
      "qBonus": 0,
      "repBonus": 0,
      "oneTime": true,
      "speedBonus": 0,
      "treePos": {
        "col": 2,
        "row": 1
      },
      "recoveryBonus": 3,
      "requires": [
        "team_rituals"
      ]
    },
    {
      "id": "mentorship",
      "icon": "🌱",
      "name": "Кадровый резерв",
      "desc": "Опытные растят молодых: +2 Q, рост усталости ещё −10%.",
      "cost": 50000,
      "days": 4,
      "qBonus": 2,
      "repBonus": 0,
      "oneTime": true,
      "speedBonus": 0,
      "treePos": {
        "col": 2,
        "row": 2
      },
      "fatigueRateMult": 0.9,
      "requires": [
        "team_dms"
      ]
    },
    {
      "id": "team_culture",
      "icon": "🏛",
      "name": "Культура банка",
      "desc": "Люди остаются ради людей: рост усталости −20%, отдых +2/мес.",
      "cost": 90000,
      "days": 4,
      "qBonus": 0,
      "repBonus": 0,
      "oneTime": true,
      "speedBonus": 0,
      "treePos": {
        "col": 2,
        "row": 3
      },
      "fatigueRateMult": 0.8,
      "recoveryBonus": 2,
      "requires": [
        "mentorship"
      ]
    },
    {
      "id": "portfolio_site",
      "icon": "🏢",
      "name": "Флагманское отделение",
      "desc": "Витрина компании.",
      "cost": 60000,
      "days": 2,
      "qBonus": 0,
      "repBonus": 4,
      "oneTime": true,
      "speedBonus": 0,
      "treePos": {
        "col": 3,
        "row": 0
      }
    },
    {
      "id": "case_studies",
      "icon": "📰",
      "name": "Публичная отчётность",
      "desc": "Истории успеха работают на имя.",
      "cost": 60000,
      "days": 2,
      "qBonus": 0,
      "repBonus": 4,
      "oneTime": true,
      "speedBonus": 0,
      "treePos": {
        "col": 3,
        "row": 1
      },
      "requires": [
        "portfolio_site"
      ]
    },
    {
      "id": "awards",
      "icon": "🏆",
      "name": "Премия «Банк региона»",
      "desc": "Заявка на премию. Требует экспертный узел качества.",
      "cost": 90000,
      "days": 2,
      "qBonus": 0,
      "repBonus": 6,
      "oneTime": true,
      "speedBonus": 0,
      "treePos": {
        "col": 3,
        "row": 2
      },
      "requires": [
        "case_studies",
        "consultant_q"
      ]
    },
    {
      "id": "pr_team",
      "icon": "📣",
      "name": "Пресс-служба",
      "desc": "Системная работа с инфополем.",
      "cost": 120000,
      "days": 4,
      "qBonus": 0,
      "repBonus": 8,
      "oneTime": true,
      "speedBonus": 0,
      "treePos": {
        "col": 3,
        "row": 3
      },
      "requires": [
        "awards"
      ]
    },
    {
      "id": "negotiator",
      "icon": "🤝",
      "name": "Переговорщик по ставкам",
      "desc": "Аванс выбивается на +10% чаще.",
      "cost": 45000,
      "days": 2,
      "qBonus": 0,
      "repBonus": 0,
      "oneTime": true,
      "speedBonus": 0,
      "treePos": {
        "col": 4,
        "row": 0
      },
      "prepayBonus": 0.1
    },
    {
      "id": "contracts",
      "icon": "📋",
      "name": "Договорная база",
      "desc": "Просрочки бьют по репутации вдвое слабее.",
      "cost": 60000,
      "days": 4,
      "qBonus": 0,
      "repBonus": 0,
      "oneTime": true,
      "speedBonus": 0,
      "treePos": {
        "col": 4,
        "row": 1
      },
      "penaltyShield": true,
      "requires": [
        "negotiator"
      ]
    },
    {
      "id": "closer",
      "icon": "💼",
      "name": "Синдикатор",
      "desc": "Финальные выплаты по всем сделкам +5%.",
      "cost": 110000,
      "days": 4,
      "qBonus": 0,
      "repBonus": 0,
      "oneTime": true,
      "speedBonus": 0,
      "treePos": {
        "col": 4,
        "row": 2
      },
      "payoutMult": 0.05,
      "requires": [
        "contracts"
      ]
    },
    {
      "id": "rainmaker",
      "icon": "🌧",
      "name": "Голос рынка",
      "desc": "Вершина сделок: ещё +5% к выплатам и +5% к авансам. Требует награды.",
      "cost": 160000,
      "days": 6,
      "qBonus": 0,
      "repBonus": 0,
      "oneTime": true,
      "speedBonus": 0,
      "treePos": {
        "col": 4,
        "row": 3
      },
      "payoutMult": 0.05,
      "prepayBonus": 0.05,
      "requires": [
        "closer",
        "awards"
      ]
    },
    {
      "id": "paid_leave",
      "icon": "🌴",
      "name": "Отгулы после отчётности",
      "desc": "Квартальный отчёт сдан — команда выдыхает.",
      "cost": 15000,
      "days": 2,
      "qBonus": 0,
      "repBonus": 0,
      "oneTime": false,
      "speedBonus": 0,
      "fatigueReduce": 12,
      "cooldownMonths": 1
    },
    {
      "id": "teambuilding",
      "icon": "🎳",
      "name": "Корпоратив отделения",
      "desc": "Боулинг и разговоры не про нормативы.",
      "cost": 32000,
      "days": 2,
      "qBonus": 0,
      "repBonus": 0,
      "oneTime": false,
      "speedBonus": 0,
      "fatigueReduce": 22,
      "cooldownMonths": 2
    },
    {
      "id": "corp_vacation",
      "icon": "🏔",
      "name": "Выезд на турбазу",
      "desc": "Два дня без клиент-банка. Перезагрузка.",
      "cost": 60000,
      "days": 4,
      "qBonus": 0,
      "repBonus": 0,
      "oneTime": false,
      "speedBonus": 0,
      "fatigueReduce": 38,
      "cooldownMonths": 3,
      "minFatigue": 40
    },
    {
      "id": "freelance_q",
      "icon": "🧑‍💼",
      "name": "Внешний аудитор",
      "desc": "Подключаем «большую четвёрку» на месяц.",
      "cost": 40000,
      "days": 2,
      "qBonus": 6,
      "repBonus": 0,
      "oneTime": false,
      "speedBonus": 0
    }
  ],
  "events": [
    {
      "id": "key_rate",
      "icon": "📉",
      "title": "ЦБ поднял ключевую ставку",
      "requiresClients": true,
      "body": "Стоимость денег выросла. Перекладывать на клиентов или абсорбировать маржой?",
      "choices": [
        {
          "text": "Переложить на клиентов (+10% к доходам сделок)",
          "desc": "Маржа целее, лояльность всех −8",
          "effects": [
            {
              "client": {
                "sel": "biggest",
                "op": "budgetMulPct",
                "val": 10
              }
            },
            {
              "nudgeAll": -8
            },
            {
              "notify": [
                "Ставки по сделкам пересмотрены 📈",
                "info"
              ]
            },
            {
              "rd": [
                "Переложили ставку на клиентов",
                "event"
              ]
            }
          ]
        },
        {
          "text": "Абсорбировать маржой (−40 000 ₽)",
          "desc": "Клиенты не заметят, банк платит из кармана",
          "effects": [
            {
              "money": -40000
            },
            {
              "notify": [
                "Ставки для клиентов сохранены 🤝",
                "success"
              ]
            },
            {
              "rd": [
                "Абсорбировали рост ставки −40К",
                "event"
              ]
            }
          ]
        }
      ]
    },
    {
      "id": "cb_audit",
      "icon": "🏛",
      "title": "Плановая проверка ЦБ",
      "body": "Регулятор запросил документы по портфелю. Комплаенс-юрист сильно упрощает жизнь.",
      "choices": [
        {
          "text": "Подготовиться как следует (−60 000 ₽)",
          "desc": "Аудит пройдёт гладко, +2 репутации",
          "effects": [
            {
              "money": -60000
            },
            {
              "rep": 2
            },
            {
              "notify": [
                "Проверка пройдена без замечаний ✅",
                "success"
              ]
            },
            {
              "rd": [
                "Проверка ЦБ: подготовились −60К",
                "event"
              ]
            }
          ]
        },
        {
          "text": "Пройти «как есть»",
          "desc": "Без юриста — риск предписания (−120К и −4 реп. с шансом 50%)",
          "effects": [
            {
              "ifRole": {
                "role": "lawyer",
                "then": [
                  {
                    "notify": [
                      "Комплаенс отбился от всех вопросов ⚖️",
                      "success"
                    ]
                  }
                ],
                "else": [
                  {
                    "roll": {
                      "chance": 0.5,
                      "success": [
                        {
                          "money": -120000
                        },
                        {
                          "rep": -4
                        },
                        {
                          "notify": [
                            "Предписание ЦБ: штраф 120К 📋",
                            "error"
                          ]
                        },
                        {
                          "rd": [
                            "Предписание ЦБ −120К",
                            "event"
                          ]
                        }
                      ],
                      "fail": [
                        {
                          "notify": [
                            "Пронесло — замечаний нет",
                            "success"
                          ]
                        }
                      ]
                    }
                  }
                ]
              }
            }
          ]
        }
      ]
    },
    {
      "id": "bank_run",
      "icon": "😱",
      "title": "Слух о проблемах банка",
      "requiresClients": true,
      "body": "В местном телеграм-канале пишут, что «банк шатается». Вкладчики нервничают.",
      "choices": [
        {
          "text": "Экстренный PR + открытый день (−50 000 ₽)",
          "desc": "Гасим панику деньгами и открытостью",
          "effects": [
            {
              "money": -50000
            },
            {
              "nudgeAll": 5
            },
            {
              "notify": [
                "Паника погашена, доверие восстановлено 🤝",
                "success"
              ]
            },
            {
              "rd": [
                "Антикризисный PR −50К",
                "event"
              ]
            }
          ]
        },
        {
          "text": "Переждать молча",
          "desc": "Лояльность всех −12, репутация −3",
          "effects": [
            {
              "nudgeAll": -12
            },
            {
              "rep": -3
            },
            {
              "notify": [
                "Слухи сделали своё дело 📉",
                "warning"
              ]
            }
          ]
        }
      ]
    },
    {
      "id": "borrower_default",
      "icon": "🆘",
      "title": "Крупный заёмщик на грани дефолта",
      "requiresClients": true,
      "body": "У клиента с самой большой сделкой кассовый разрыв. Реструктурировать или взыскивать?",
      "choices": [
        {
          "text": "Реструктуризация (−25% дохода сделки)",
          "desc": "Клиент благодарен (+10 лояльности), сделка живёт",
          "effects": [
            {
              "client": {
                "sel": "biggest",
                "op": "budgetMulPct",
                "val": -25
              }
            },
            {
              "client": {
                "sel": "biggest",
                "op": "rating",
                "val": 10
              }
            },
            {
              "rd": [
                "Реструктуризация крупного заёмщика",
                "event"
              ]
            }
          ]
        },
        {
          "text": "Жёсткое взыскание",
          "desc": "50/50: либо всё сразу, либо потеря сделки и −5 репутации",
          "effects": [
            {
              "roll": {
                "chance": 0.5,
                "success": [
                  {
                    "client": {
                      "sel": "biggest",
                      "op": "collect"
                    }
                  },
                  {
                    "rd": [
                      "Взыскание — успех",
                      "event"
                    ]
                  }
                ],
                "fail": [
                  {
                    "client": {
                      "sel": "biggest",
                      "op": "remove"
                    }
                  },
                  {
                    "rep": -5
                  },
                  {
                    "notify": [
                      "Заёмщик ушёл в банкротство — сделка потеряна 💸",
                      "error"
                    ]
                  },
                  {
                    "rd": [
                      "Взыскание — провал",
                      "churn"
                    ]
                  }
                ]
              }
            }
          ]
        }
      ]
    },
    {
      "id": "cyber_attack",
      "icon": "🕷",
      "title": "Кибератака на клиент-банк",
      "body": "Ночью ботнет долбит интернет-банк. Есть IT-инженер — есть шанс отбиться без потерь.",
      "choices": [
        {
          "text": "Поднять команду по тревоге",
          "desc": "С IT-инженером — отбились (+2 реп.); без него — простой −90К",
          "effects": [
            {
              "ifRole": {
                "role": "developer",
                "then": [
                  {
                    "rep": 2
                  },
                  {
                    "notify": [
                      "Атака отбита, клиенты ничего не заметили 🛡",
                      "success"
                    ]
                  },
                  {
                    "rd": [
                      "Кибератака отбита",
                      "event"
                    ]
                  }
                ],
                "else": [
                  {
                    "money": -90000
                  },
                  {
                    "nudgeAll": -6
                  },
                  {
                    "notify": [
                      "Сутки простоя: −90К и недовольные клиенты 🕷",
                      "error"
                    ]
                  },
                  {
                    "rd": [
                      "Кибератака: простой −90К",
                      "event"
                    ]
                  }
                ]
              }
            }
          ]
        },
        {
          "text": "Нанять внешних безопасников (−45 000 ₽)",
          "desc": "Дорого, но надёжно при любом составе",
          "effects": [
            {
              "money": -45000
            },
            {
              "notify": [
                "Внешний SOC закрыл атаку 🔒",
                "info"
              ]
            },
            {
              "rd": [
                "Внешний SOC −45К",
                "event"
              ]
            }
          ]
        }
      ]
    },
    {
      "id": "deposit_inflow",
      "icon": "💰",
      "title": "Приток вкладов",
      "requiresClients": true,
      "body": "Сосед-банк лишился лицензии — его вкладчики идут к нам. Деньги дешёвые, но операционка трещит.",
      "choices": [
        {
          "text": "Принять всех (+120 000 ₽)",
          "desc": "Касса пополнена, усталость команды +10",
          "effects": [
            {
              "money": 120000
            },
            {
              "fatigue": 10
            },
            {
              "notify": [
                "Вклады приняты: +120К, команда на пределе 💰",
                "info"
              ]
            },
            {
              "rd": [
                "Приток вкладов +120К",
                "event"
              ]
            }
          ]
        },
        {
          "text": "Ограничить приём",
          "desc": "Без денег, зато без перегрузки",
          "effects": [
            {
              "notify": [
                "Приём ограничен — операционка дышит",
                "info"
              ]
            }
          ]
        }
      ]
    },
    {
      "id": "subs_renewal",
      "icon": "💳",
      "title": "Продление лицензий АБС",
      "body": "Лицензии банковского ПО истекают. Оплатить сейчас со скидкой вендора или отложить по полной цене?",
      "choices": [
        {
          "text": "Оплатить сейчас со скидкой (−45 000 ₽)",
          "desc": "Дешевле и забыли",
          "effects": [
            {
              "money": -45000
            },
            {
              "notify": [
                "Лицензии продлены ✅",
                "info"
              ]
            },
            {
              "rd": [
                "Лицензии со скидкой −45К",
                "event"
              ]
            }
          ]
        },
        {
          "text": "Отложить платёж",
          "desc": "Через 2 месяца спишется 70 000 ₽ — появится в календаре",
          "effects": [
            {
              "schedule": {
                "inMonths": 2,
                "label": "Оплата лицензий АБС (отложенная)",
                "money": -70000,
                "icon": "💳"
              }
            },
            {
              "notify": [
                "Платёж отложен — следи за календарём 📅",
                "warning"
              ]
            }
          ]
        }
      ]
    }
  ],
  "ai": {
    "purchaseCost": 250000,
    "purchaseMinRep": 50,
    "levels": [
      {
        "level": 0,
        "name": "Пилотная модель",
        "desc": "Скоринг-ядро развёрнуто, учится на нашем портфеле.",
        "cost": 0,
        "trainingMonths": 0,
        "responseMonths": 3,
        "queriesPerMonth": 2
      },
      {
        "level": 1,
        "name": "Боевой скоринг",
        "desc": "Модель в проде, решения быстрее.",
        "cost": 120000,
        "trainingMonths": 2,
        "responseMonths": 2,
        "queriesPerMonth": 2
      },
      {
        "level": 2,
        "name": "Поведенческий анализ",
        "desc": "Видит дефолт до того, как он случится.",
        "cost": 200000,
        "trainingMonths": 2,
        "responseMonths": 1,
        "queriesPerMonth": 3,
        "passiveQ": 2
      },
      {
        "level": 3,
        "name": "Риск-офицер 2.0",
        "desc": "Сопровождает каждую сделку.",
        "cost": 320000,
        "trainingMonths": 3,
        "responseMonths": 0,
        "queriesPerMonth": 5,
        "passiveQ": 2,
        "passiveRep": 1
      },
      {
        "level": 4,
        "name": "Центр решений",
        "desc": "Кредитный комитет советуется с моделью, а не наоборот.",
        "cost": 500000,
        "trainingMonths": 3,
        "responseMonths": 0,
        "queriesPerMonth": 999,
        "passiveQ": 3,
        "passiveRep": 2,
        "passiveV": 5
      }
    ]
  },
  "upgradeBranches": [
    {
      "label": "Портфель",
      "color": "rgba(45,212,191,.65)"
    },
    {
      "label": "Операции",
      "color": "rgba(99,102,241,.65)"
    },
    {
      "label": "Команда",
      "color": "rgba(249,115,22,.65)"
    },
    {
      "label": "Репутация",
      "color": "rgba(139,92,246,.65)"
    },
    {
      "label": "Сделки",
      "color": "rgba(210,153,34,.7)"
    }
  ]
};
