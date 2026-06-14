// ══════════════════════════════════════════════════════
//  SCENARIO DATA: Диджитал-агентство (🏢)
//  ЧИСТЫЕ ДАННЫЕ — без кода. Формат значения: строгий JSON,
//  можно редактировать любым текстовым редактором.
//  События — декларативные эффекты (DSL: src/scenario-loader.js).
//  Godot читает этот же объект как JSON напрямую.
// ══════════════════════════════════════════════════════
window.SCENARIO_DATA = {
  "id": "agency",
  "name": "Диджитал-агентство",
  "icon": "🏢",
  "settings": {
    "startMoney": 1000000,
    "startReputation": 60,
    "overhead": 35000,
    "actionsPerMonth": 21,
    "scoutCost": 6,
    "hireCost": 4,
    "winCondition": 7500000,
    "introText": "Ты открываешь <strong>собственное диджитал-агентство</strong>. Клиенты не приходят сами — их нужно искать: каждый <strong>скаутинг</strong> стоит рабочих дней и не гарантирует результат. Каждый найденный проект — свой риск: кто-то задерживает оплату, кто-то платит хорошо, но портит репутацию. Доведи баланс до <strong>7 500 000 ₽</strong>, пока деньги не кончились.",
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
    "smm": {
      "name": "SMM-агентство",
      "icon": "📱",
      "bonus": "small_income",
      "bonusVal": 0.2,
      "bonusLabel": "+20% к выплате small-клиентов",
      "passive": "scout_offers",
      "passiveVal": 1,
      "passiveLabel": "+1 оффер при каждом скаутинге",
      "desc": "Соцсети, контент, таргет. Много небольших клиентов, быстрый оборот."
    },
    "seo": {
      "name": "SEO-агентство",
      "icon": "🔍",
      "bonus": "staff_cost",
      "bonusVal": -0.1,
      "bonusLabel": "−10% расходов на команду",
      "passive": "nps_start",
      "passiveVal": 5,
      "passiveLabel": "+5 NPS каждому клиенту при подписании",
      "desc": "Продвижение в поиске. Долгосрочный подход и стабильные клиенты."
    },
    "web": {
      "name": "Web-разработка",
      "icon": "💻",
      "bonus": "corp_income",
      "bonusVal": 0.25,
      "bonusLabel": "+25% к выплате корп. клиентов",
      "passive": "speed",
      "passiveVal": 0.1,
      "passiveLabel": "+10% скорость команды",
      "desc": "Сайты и приложения. Технически эффективная команда."
    },
    "brand": {
      "name": "Брендинг",
      "icon": "✨",
      "bonus": "store_income",
      "bonusVal": 0.4,
      "bonusLabel": "+40% к выплате брендинг-клиентов",
      "passive": "nps_start_store",
      "passiveVal": 10,
      "passiveLabel": "+10 NPS брендинг-клиентам при подписании",
      "desc": "Айдентика, упаковка, стратегия. Брендовые клиенты — от малого бизнеса до крупных ритейлеров."
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
      "name": "Дизайнер",
      "icon": "🎨"
    },
    "copywriter": {
      "name": "Копирайтер",
      "icon": "✍️"
    },
    "manager": {
      "name": "Менеджер",
      "icon": "📋"
    },
    "developer": {
      "name": "Разработчик",
      "icon": "💻"
    },
    "smm": {
      "name": "SMM-маркетолог",
      "icon": "📣"
    },
    "lawyer": {
      "name": "Юрист",
      "icon": "⚖️"
    },
    "hr": {
      "name": "HR-менеджер",
      "icon": "🤝"
    }
  },
  "staff": [
    {
      "id": "designer_jr",
      "role": "designer",
      "grade": "jr",
      "gradeLabel": "Junior",
      "name": "Дизайнер Jr",
      "icon": "🎨",
      "desc": "Визуал + качество",
      "cost": 30000,
      "quality": 5,
      "volume": 0,
      "capacity": 0,
      "throughput": 4,
      "speedBonus": 0,
      "unlockCond": null
    },
    {
      "id": "designer",
      "role": "designer",
      "grade": "md",
      "gradeLabel": "Middle",
      "name": "Дизайнер",
      "icon": "🎨",
      "desc": "Визуал + качество",
      "cost": 48000,
      "quality": 12,
      "volume": 0,
      "capacity": 0,
      "throughput": 7,
      "speedBonus": 0,
      "unlockCond": null
    },
    {
      "id": "designer_sr",
      "role": "designer",
      "grade": "sr",
      "gradeLabel": "Senior",
      "name": "Дизайнер Sr",
      "icon": "🎨",
      "desc": "Визуал + качество",
      "cost": 72000,
      "quality": 22,
      "volume": 0,
      "capacity": 0,
      "throughput": 10,
      "speedBonus": 0,
      "unlockCond": {
        "minRep": 70
      }
    },
    {
      "id": "copywriter_jr",
      "role": "copywriter",
      "grade": "jr",
      "gradeLabel": "Junior",
      "name": "Копирайтер Jr",
      "icon": "✍️",
      "desc": "Контент + объём",
      "cost": 22000,
      "quality": 0,
      "volume": 8,
      "capacity": 0,
      "throughput": 3,
      "speedBonus": 0,
      "unlockCond": null
    },
    {
      "id": "copywriter",
      "role": "copywriter",
      "grade": "md",
      "gradeLabel": "Middle",
      "name": "Копирайтер",
      "icon": "✍️",
      "desc": "Контент + объём",
      "cost": 35000,
      "quality": 0,
      "volume": 15,
      "capacity": 0,
      "throughput": 5,
      "speedBonus": 0,
      "unlockCond": null
    },
    {
      "id": "copywriter_sr",
      "role": "copywriter",
      "grade": "sr",
      "gradeLabel": "Senior",
      "name": "Копирайтер Sr",
      "icon": "✍️",
      "desc": "Контент + объём",
      "cost": 52000,
      "quality": 0,
      "volume": 25,
      "capacity": 0,
      "throughput": 7,
      "speedBonus": 0,
      "unlockCond": {
        "minRep": 60
      }
    },
    {
      "id": "manager_jr",
      "role": "manager",
      "grade": "jr",
      "gradeLabel": "Junior",
      "name": "Менеджер Jr",
      "icon": "📋",
      "desc": "Аккаунтинг",
      "cost": 33000,
      "quality": 0,
      "volume": 0,
      "capacity": 1,
      "throughput": 3,
      "speedBonus": 0.03,
      "unlockCond": null
    },
    {
      "id": "manager",
      "role": "manager",
      "grade": "md",
      "gradeLabel": "Middle",
      "name": "Менеджер",
      "icon": "📋",
      "desc": "Аккаунтинг",
      "cost": 52000,
      "quality": 0,
      "volume": 0,
      "capacity": 2,
      "throughput": 5,
      "speedBonus": 0.05,
      "unlockCond": null
    },
    {
      "id": "manager_sr",
      "role": "manager",
      "grade": "sr",
      "gradeLabel": "Senior",
      "name": "Менеджер Sr",
      "icon": "📋",
      "desc": "Аккаунтинг",
      "cost": 80000,
      "quality": 0,
      "volume": 0,
      "capacity": 3,
      "throughput": 7,
      "speedBonus": 0.08,
      "unlockCond": {
        "minRep": 70
      }
    },
    {
      "id": "developer_jr",
      "role": "developer",
      "grade": "jr",
      "gradeLabel": "Junior",
      "name": "Разработчик Jr",
      "icon": "💻",
      "desc": "Кач +8 · тех-проекты",
      "cost": 38000,
      "quality": 4,
      "volume": 0,
      "capacity": 0,
      "throughput": 4,
      "speedBonus": 0.03,
      "unlockCond": null
    },
    {
      "id": "developer",
      "role": "developer",
      "grade": "md",
      "gradeLabel": "Middle",
      "name": "Разработчик",
      "icon": "💻",
      "desc": "Кач +15 · тех-проекты",
      "cost": 60000,
      "quality": 8,
      "volume": 0,
      "capacity": 0,
      "throughput": 7,
      "speedBonus": 0.05,
      "unlockCond": null
    },
    {
      "id": "developer_sr",
      "role": "developer",
      "grade": "sr",
      "gradeLabel": "Senior",
      "name": "Разработчик Sr",
      "icon": "💻",
      "desc": "Кач +25 · тех-проекты",
      "cost": 90000,
      "quality": 16,
      "volume": 0,
      "capacity": 0,
      "throughput": 10,
      "speedBonus": 0.08,
      "unlockCond": {
        "minRep": 80
      }
    },
    {
      "id": "smm_jr",
      "role": "smm",
      "grade": "jr",
      "gradeLabel": "Junior",
      "name": "SMM Jr",
      "icon": "📣",
      "desc": "Объём +5 · +1 лид/скаут",
      "cost": 22000,
      "quality": 0,
      "volume": 5,
      "capacity": 0,
      "throughput": 2,
      "speedBonus": 0,
      "unlockCond": null
    },
    {
      "id": "smm",
      "role": "smm",
      "grade": "md",
      "gradeLabel": "Middle",
      "name": "SMM-маркетолог",
      "icon": "📣",
      "desc": "Объём +10 · +1 лид/скаут",
      "cost": 34000,
      "quality": 0,
      "volume": 10,
      "capacity": 0,
      "throughput": 3,
      "speedBonus": 0,
      "unlockCond": null
    },
    {
      "id": "smm_sr",
      "role": "smm",
      "grade": "sr",
      "gradeLabel": "Senior",
      "name": "SMM Sr",
      "icon": "📣",
      "desc": "Объём +18 · +1 лид/скаут",
      "cost": 50000,
      "quality": 0,
      "volume": 18,
      "capacity": 0,
      "throughput": 5,
      "speedBonus": 0,
      "unlockCond": {
        "minRep": 60
      }
    },
    {
      "id": "lawyer_jr",
      "role": "lawyer",
      "grade": "jr",
      "gradeLabel": "Junior",
      "name": "Юрист Jr",
      "icon": "⚖️",
      "desc": "Штрафы и риски −30%",
      "cost": 28000,
      "quality": 0,
      "volume": 0,
      "capacity": 0,
      "throughput": 1,
      "speedBonus": 0,
      "unlockCond": null
    },
    {
      "id": "lawyer",
      "role": "lawyer",
      "grade": "md",
      "gradeLabel": "Middle",
      "name": "Юрист",
      "icon": "⚖️",
      "desc": "Штрафы и риски −50%",
      "cost": 42000,
      "quality": 0,
      "volume": 0,
      "capacity": 0,
      "throughput": 2,
      "speedBonus": 0,
      "unlockCond": null
    },
    {
      "id": "lawyer_sr",
      "role": "lawyer",
      "grade": "sr",
      "gradeLabel": "Senior",
      "name": "Юрист Sr",
      "icon": "⚖️",
      "desc": "Штрафы и риски −70%",
      "cost": 65000,
      "quality": 0,
      "volume": 0,
      "capacity": 0,
      "throughput": 3,
      "speedBonus": 0,
      "unlockCond": {
        "minRep": 75
      }
    },
    {
      "id": "hr_jr",
      "role": "hr",
      "grade": "jr",
      "gradeLabel": "Junior",
      "name": "HR Jr",
      "icon": "🤝",
      "desc": "NPS +2/мес · найм за 1 день",
      "cost": 20000,
      "quality": 0,
      "volume": 0,
      "capacity": 0,
      "throughput": 1,
      "speedBonus": 0,
      "unlockCond": null
    },
    {
      "id": "hr",
      "role": "hr",
      "grade": "md",
      "gradeLabel": "Middle",
      "name": "HR-менеджер",
      "icon": "🤝",
      "desc": "NPS +3/мес · найм за 1 день",
      "cost": 30000,
      "quality": 0,
      "volume": 0,
      "capacity": 0,
      "throughput": 2,
      "speedBonus": 0,
      "unlockCond": null
    },
    {
      "id": "hr_sr",
      "role": "hr",
      "grade": "sr",
      "gradeLabel": "Senior",
      "name": "HR Sr",
      "icon": "🤝",
      "desc": "NPS +4/мес · найм за 1 день",
      "cost": 46000,
      "quality": 0,
      "volume": 0,
      "capacity": 0,
      "throughput": 3,
      "speedBonus": 0,
      "unlockCond": {
        "minRep": 65
      }
    }
  ],
  "budgetRanges": {
    "1": [
      500000,
      950000
    ],
    "2": [
      2000000,
      4000000
    ],
    "3": [
      5000000,
      9000000
    ],
    "4": [
      10000000,
      20000000
    ],
    "5": [
      18000000,
      35000000
    ],
    "6": [
      35000000,
      70000000
    ],
    "7": [
      75000000,
      150000000
    ]
  },
  "projects": [
    {
      "id": "lc_simple",
      "tier": 1,
      "icon": "🟢",
      "name": "Лендинг для кафе",
      "desc": "Небольшой заказ — лендинг для местного кафе. Стандартный флоу без юридики и сложных фаз. Идеален для проверки базовой цепочки решений.",
      "revenue": 15000,
      "minQ": 0,
      "minV": 0,
      "type": "small",
      "npsStart": 78,
      "oneTime": false,
      "rarity": "common",
      "fixedBudget": [
        700000,
        1000000
      ],
      "modifier": {
        "type": "nps_passive",
        "val": 3,
        "label": "+3 NPS/мес"
      },
      "modBadge": "mb-green",
      "prob": 0.6,
      "_negotiationTier": "quick",
      "_duration": 6,
      "requiresLegal": false,
      "hasSubPhases": false,
      "skipProposal": false
    },
    {
      "id": "lc_full",
      "tier": 2,
      "icon": "🔵",
      "name": "Ребрендинг «ТехноСтарт»",
      "desc": "Средний клиент, требует договор и все этапы — от брифа до сдачи. Включены фаза юридики и детальные под-этапы работы (сбор рефов, прото).",
      "revenue": 35000,
      "minQ": 10,
      "minV": 0,
      "type": "corp",
      "npsStart": 72,
      "oneTime": false,
      "rarity": "uncommon",
      "fixedBudget": [
        3000000,
        4200000
      ],
      "modifier": {
        "type": "nps_start",
        "val": 5,
        "label": "NPS старт +5"
      },
      "modBadge": "mb-green",
      "prob": 0.5,
      "_negotiationTier": "standard",
      "_duration": 9,
      "requiresLegal": true,
      "hasSubPhases": true,
      "skipProposal": false
    },
    {
      "id": "lc_risky",
      "tier": 2,
      "icon": "🔴",
      "name": "Онлайн-магазин «Каприз»",
      "desc": "Клиент с завышенными ожиданиями. Скоуп плывёт, NPS нестабилен. Нужен для проверки ветки scope_creep, юридических рисков и неудовлетворённого ревью.",
      "revenue": 38000,
      "minQ": 0,
      "minV": 0,
      "type": "store",
      "npsStart": 58,
      "oneTime": false,
      "rarity": "uncommon",
      "fixedBudget": [
        2400000,
        3400000
      ],
      "modifier": {
        "type": "nps_drain",
        "val": -4,
        "label": "−4 NPS/мес"
      },
      "modBadge": "mb-amber",
      "prob": 0.45,
      "_negotiationTier": "challenge",
      "_duration": 7,
      "requiresLegal": false,
      "hasSubPhases": false,
      "skipProposal": false,
      "_riskProfile": {
        "scope_creep": 0.45,
        "external_deadline": 0.3
      }
    },
    {
      "id": "audit_quick",
      "tier": 1,
      "icon": "🔍",
      "name": "Экспресс-аудит",
      "desc": "Клиент хочет быстрый взгляд со стороны: аудит сайта или соцсетей. Никакого онбординга — просто сделай и получи.",
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
        "label": "Разовый платёж"
      },
      "modBadge": "mb-purple",
      "prob": 0.8
    },
    {
      "id": "consult_once",
      "tier": 1,
      "icon": "💬",
      "name": "Разовая консультация",
      "desc": "Час-полтора с предпринимателем: стратегия, позиционирование, точки роста. Без портфолио, без требований.",
      "revenue": 0,
      "minQ": 0,
      "minV": 0,
      "type": "small",
      "npsStart": 82,
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
        "label": "Разовый платёж"
      },
      "modBadge": "mb-purple",
      "prob": 0.75
    },
    {
      "id": "loyal",
      "tier": 1,
      "icon": "😊",
      "name": "Лояльный заказчик",
      "desc": "Простой проект, всегда доволен, платит вовремя. Идеальный первый клиент.",
      "revenue": 12000,
      "minQ": 0,
      "minV": 0,
      "type": "small",
      "npsStart": 84,
      "oneTime": false,
      "rarity": "common",
      "modifier": {
        "type": "nps_passive",
        "val": 5,
        "label": "+5 NPS/мес"
      },
      "modBadge": "mb-green",
      "prob": 0.75
    },
    {
      "id": "referral",
      "tier": 1,
      "icon": "🤝",
      "name": "Тёплый лид (рекомендация)",
      "desc": "Пришёл по рекомендации. Уже расположен к вам — NPS стартует выше нормы.",
      "revenue": 19000,
      "minQ": 0,
      "minV": 0,
      "type": "small",
      "npsStart": 94,
      "oneTime": false,
      "rarity": "common",
      "modifier": {
        "type": "nps_start",
        "val": 14,
        "label": "NPS старт +14"
      },
      "modBadge": "mb-green",
      "prob": 0.8
    },
    {
      "id": "late_pay",
      "tier": 1,
      "icon": "🕐",
      "name": "Систематически задерживает",
      "desc": "Хороший чек, но «деньги переведём на следующей неделе» — его фирменная фраза.",
      "revenue": 28000,
      "minQ": 0,
      "minV": 0,
      "type": "small",
      "npsStart": 72,
      "oneTime": false,
      "rarity": "common",
      "modifier": {
        "type": "payment_delay",
        "val": 0.4,
        "label": "40% шанс задержки/мес"
      },
      "modBadge": "mb-amber",
      "prob": 0.55
    },
    {
      "id": "local_shop",
      "tier": 1,
      "icon": "🏪",
      "name": "Местный магазин",
      "desc": "Небольшой ритейл, хочет простой сайт и соцсети. Стабильный, без сюрпризов.",
      "revenue": 14000,
      "minQ": 0,
      "minV": 0,
      "type": "small",
      "npsStart": 80,
      "oneTime": false,
      "rarity": "common",
      "modifier": {
        "type": "nps_passive",
        "val": 3,
        "label": "+3 NPS/мес"
      },
      "modBadge": "mb-green",
      "prob": 0.7
    },
    {
      "id": "photographer",
      "tier": 1,
      "icon": "📷",
      "name": "Фотограф-предприниматель",
      "desc": "Нужен лендинг и продвижение. Не требует дизайнера — главное подача.",
      "revenue": 17000,
      "minQ": 0,
      "minV": 5,
      "type": "small",
      "npsStart": 79,
      "oneTime": false,
      "rarity": "common",
      "modifier": {
        "type": "nps_start",
        "val": 8,
        "label": "NPS старт +8"
      },
      "modBadge": "mb-green",
      "prob": 0.65
    },
    {
      "id": "blogger",
      "tier": 1,
      "icon": "✍️",
      "name": "Блогер-ниша",
      "desc": "Молодой инфлюенсер, монетизирует аудиторию. Платит немного, но NPS высокий.",
      "revenue": 15000,
      "minQ": 0,
      "minV": 8,
      "type": "small",
      "npsStart": 86,
      "oneTime": false,
      "rarity": "common",
      "modifier": {
        "type": "nps_passive",
        "val": 4,
        "label": "+4 NPS/мес"
      },
      "modBadge": "mb-green",
      "prob": 0.6
    },
    {
      "id": "restaurant",
      "tier": 1,
      "icon": "🍽️",
      "name": "Ресторан",
      "desc": "Владелец ресторана хочет Instagram и рекламу. Сезонность влияет на NPS.",
      "revenue": 22000,
      "minQ": 0,
      "minV": 5,
      "type": "small",
      "npsStart": 74,
      "oneTime": false,
      "rarity": "common",
      "modifier": {
        "type": "random_bonus",
        "val": 12000,
        "label": "25% шанс бонуса 12К"
      },
      "modBadge": "mb-teal",
      "prob": 0.6
    },
    {
      "id": "dental",
      "tier": 1,
      "icon": "🦷",
      "name": "Стоматологическая клиника",
      "desc": "Клиника хочет выделиться среди конкурентов. Требует качество визуала.",
      "revenue": 26000,
      "minQ": 5,
      "minV": 0,
      "type": "small",
      "npsStart": 76,
      "oneTime": false,
      "rarity": "uncommon",
      "modifier": {
        "type": "nps_passive",
        "val": 3,
        "label": "+3 NPS/мес"
      },
      "modBadge": "mb-green",
      "prob": 0.5
    },
    {
      "id": "language_school",
      "tier": 1,
      "icon": "🌐",
      "name": "Языковая школа",
      "desc": "Хотят контент-маркетинг и рассылки. Стабильный клиент с умеренным NPS.",
      "revenue": 20000,
      "minQ": 0,
      "minV": 10,
      "type": "small",
      "npsStart": 77,
      "oneTime": false,
      "rarity": "uncommon",
      "modifier": {
        "type": "nps_passive",
        "val": 2,
        "label": "+2 NPS/мес"
      },
      "modBadge": "mb-green",
      "prob": 0.55
    },
    {
      "id": "local_boutique",
      "tier": 1,
      "icon": "👗",
      "name": "Локальный бутик",
      "desc": "Небольшой модный магазин хочет айдентику и соцсети. Простой брендинговый проект без лишних требований.",
      "revenue": 18000,
      "minQ": 0,
      "minV": 3,
      "type": "store",
      "npsStart": 81,
      "oneTime": false,
      "rarity": "common",
      "modifier": {
        "type": "nps_passive",
        "val": 3,
        "label": "+3 NPS/мес"
      },
      "modBadge": "mb-green",
      "prob": 0.65
    },
    {
      "id": "craft_brand",
      "tier": 1,
      "icon": "🍺",
      "name": "Крафт-бренд",
      "desc": "Небольшое производство — пиво, кофе, мёд — ищет визуальный стиль и упаковку.",
      "revenue": 22000,
      "minQ": 3,
      "minV": 4,
      "type": "store",
      "npsStart": 78,
      "oneTime": false,
      "rarity": "uncommon",
      "modifier": {
        "type": "nps_passive",
        "val": 2,
        "label": "+2 NPS/мес"
      },
      "modBadge": "mb-green",
      "prob": 0.55
    },
    {
      "id": "fashion_startup",
      "tier": 2,
      "icon": "👠",
      "name": "Фэшн-стартап",
      "desc": "Новый модный бренд: лого, фирстиль, соцсети. Умеренный бюджет, высокие амбиции.",
      "revenue": 46000,
      "minQ": 7,
      "minV": 8,
      "type": "store",
      "npsStart": 74,
      "oneTime": false,
      "rarity": "uncommon",
      "modifier": {
        "type": "nps_drain",
        "val": -4,
        "label": "NPS −4 доп./мес"
      },
      "modBadge": "mb-amber",
      "prob": 0.5
    },
    {
      "id": "perfectionist",
      "tier": 2,
      "icon": "🔬",
      "name": "Перфекционист",
      "desc": "Платит хорошо, но никогда не удовлетворён. NPS тает быстрее без высокого качества.",
      "revenue": 40000,
      "minQ": 10,
      "minV": 0,
      "type": "small",
      "npsStart": 68,
      "oneTime": false,
      "rarity": "common",
      "modifier": {
        "type": "nps_drain",
        "val": -8,
        "label": "NPS −8 доп./мес"
      },
      "modBadge": "mb-amber",
      "prob": 0.5
    },
    {
      "id": "startup_hype",
      "tier": 2,
      "icon": "🚀",
      "name": "Стартап на хайпе",
      "desc": "Горит идеей, платит нерегулярно. Иногда кидает приятный бонус.",
      "revenue": 24000,
      "minQ": 0,
      "minV": 10,
      "type": "small",
      "npsStart": 74,
      "oneTime": false,
      "rarity": "common",
      "modifier": {
        "type": "random_bonus",
        "val": 18000,
        "label": "30% шанс бонуса 18К"
      },
      "modBadge": "mb-teal",
      "prob": 0.65
    },
    {
      "id": "urgent",
      "tier": 2,
      "icon": "⚡",
      "name": "Срочный разовый заказ",
      "desc": "Нужно «ещё вчера». Хорошо платит единоразово и исчезает.",
      "revenue": 60000,
      "minQ": 7,
      "minV": 5,
      "type": "small",
      "npsStart": 78,
      "oneTime": true,
      "rarity": "uncommon",
      "modifier": {
        "type": "one_time",
        "val": 0,
        "label": "Разовый платёж"
      },
      "modBadge": "mb-purple",
      "prob": 0.6
    },
    {
      "id": "demanding_corp",
      "tier": 2,
      "icon": "🏢",
      "name": "Корпоративный KPI",
      "desc": "Солидный чек, но штраф если NPS опустится ниже порога.",
      "revenue": 90000,
      "minQ": 18,
      "minV": 10,
      "type": "corp",
      "npsStart": 66,
      "oneTime": false,
      "rarity": "uncommon",
      "modifier": {
        "type": "nps_penalty",
        "val": -22000,
        "threshold": 65,
        "label": "NPS<65 → штраф 22К/мес"
      },
      "modBadge": "mb-red",
      "prob": 0.35
    },
    {
      "id": "ecommerce",
      "tier": 2,
      "icon": "🛒",
      "name": "E-commerce магазин",
      "desc": "Интернет-магазин 200+ SKU. Нужны каталог, контент и реклама.",
      "revenue": 48000,
      "minQ": 7,
      "minV": 10,
      "type": "small",
      "npsStart": 73,
      "oneTime": false,
      "rarity": "common",
      "modifier": {
        "type": "nps_passive",
        "val": 2,
        "label": "+2 NPS/мес"
      },
      "modBadge": "mb-green",
      "prob": 0.55
    },
    {
      "id": "edtech",
      "tier": 2,
      "icon": "🎓",
      "name": "Образовательная платформа",
      "desc": "EdTech-стартап масштабируется. Нужен сильный контент и визуал.",
      "revenue": 52000,
      "minQ": 10,
      "minV": 12,
      "type": "small",
      "npsStart": 75,
      "oneTime": false,
      "rarity": "uncommon",
      "modifier": {
        "type": "nps_passive",
        "val": 3,
        "label": "+3 NPS/мес"
      },
      "modBadge": "mb-green",
      "prob": 0.45
    },
    {
      "id": "fitchain",
      "tier": 2,
      "icon": "🏋️",
      "name": "Фитнес-сеть",
      "desc": "Сеть клубов хочет единый бренд и SMM. Платит регулярно, требует объём.",
      "revenue": 44000,
      "minQ": 0,
      "minV": 15,
      "type": "store",
      "npsStart": 71,
      "oneTime": false,
      "rarity": "uncommon",
      "modifier": {
        "type": "revenue_growth",
        "val": 0.04,
        "label": "+4% выручки каждый мес"
      },
      "modBadge": "mb-teal",
      "prob": 0.45
    },
    {
      "id": "lawfirm",
      "tier": 2,
      "icon": "📜",
      "name": "Юридическая фирма",
      "desc": "Консервативный клиент с высокими требованиями к качеству. NPS строгий.",
      "revenue": 58000,
      "minQ": 12,
      "minV": 0,
      "type": "corp",
      "npsStart": 64,
      "oneTime": false,
      "rarity": "uncommon",
      "modifier": {
        "type": "nps_drain",
        "val": -5,
        "label": "NPS −5 доп./мес"
      },
      "modBadge": "mb-amber",
      "prob": 0.4
    },
    {
      "id": "hr_platform",
      "tier": 2,
      "icon": "👥",
      "name": "HR-платформа",
      "desc": "B2B SaaS для рекрутинга. Нужен объёмный контент: кейсы, вебинары, рассылки.",
      "revenue": 46000,
      "minQ": 0,
      "minV": 18,
      "type": "small",
      "npsStart": 76,
      "oneTime": false,
      "rarity": "uncommon",
      "modifier": {
        "type": "nps_passive",
        "val": 2,
        "label": "+2 NPS/мес"
      },
      "modBadge": "mb-green",
      "prob": 0.45
    },
    {
      "id": "agro",
      "tier": 2,
      "icon": "🌾",
      "name": "Агрохолдинг",
      "desc": "Неожиданный клиент из сектора АПК. Бюджет есть, требования скромные.",
      "revenue": 35000,
      "minQ": 6,
      "minV": 5,
      "type": "small",
      "npsStart": 80,
      "oneTime": false,
      "rarity": "common",
      "modifier": {
        "type": "nps_start",
        "val": 10,
        "label": "NPS старт +10"
      },
      "modBadge": "mb-green",
      "prob": 0.5
    },
    {
      "id": "medical_center",
      "tier": 2,
      "icon": "🏥",
      "name": "Медицинский центр",
      "desc": "Клиника с серьёзными ожиданиями по визуалу и имиджу. Хорошо платит, строго оценивает.",
      "revenue": 65000,
      "minQ": 15,
      "minV": 0,
      "type": "corp",
      "npsStart": 65,
      "oneTime": false,
      "rarity": "rare",
      "modifier": {
        "type": "nps_passive",
        "val": 2,
        "label": "+2 NPS/мес"
      },
      "modBadge": "mb-green",
      "prob": 0.3
    },
    {
      "id": "grey_zone",
      "tier": 3,
      "icon": "🌫️",
      "name": "Серая зона",
      "desc": "Щедро платит, но проекты на грани закона. Репутация и портфолио страдают.",
      "revenue": 75000,
      "minQ": 0,
      "minV": 0,
      "type": "small",
      "npsStart": 70,
      "oneTime": false,
      "rarity": "uncommon",
      "modifier": {
        "type": "reputation",
        "val": -12,
        "label": "−12 репутации при подписании"
      },
      "modBadge": "mb-red",
      "prob": 0.45
    },
    {
      "id": "state",
      "tier": 3,
      "icon": "🏛️",
      "name": "Государственный контракт",
      "desc": "Огромный чек, но бюрократия: первые 2 месяца оплаты нет — готовь кэш.",
      "revenue": 130000,
      "minQ": 22,
      "minV": 15,
      "type": "corp",
      "npsStart": 62,
      "oneTime": false,
      "rarity": "rare",
      "duration": 8,
      "modifier": {
        "type": "payment_delay_fixed",
        "val": 2,
        "label": "Первые 2 мес — нет оплаты"
      },
      "modBadge": "mb-purple",
      "prob": 0.25
    },
    {
      "id": "retainer_plus",
      "tier": 3,
      "icon": "💎",
      "name": "Долгосрочный ретейнер",
      "desc": "Стабильный крупный клиент с растущей ставкой за лояльность.",
      "revenue": 55000,
      "minQ": 14,
      "minV": 15,
      "type": "store",
      "npsStart": 76,
      "oneTime": false,
      "rarity": "uncommon",
      "modifier": {
        "type": "revenue_growth",
        "val": 0.05,
        "label": "+5% выручки каждый мес"
      },
      "modBadge": "mb-teal",
      "prob": 0.3
    },
    {
      "id": "federal_retail",
      "tier": 3,
      "icon": "🏬",
      "name": "Федеральный ритейлер",
      "desc": "Сеть 500+ магазинов хочет единую коммуникацию. Большие требования, большой бюджет.",
      "revenue": 110000,
      "minQ": 18,
      "minV": 15,
      "type": "corp",
      "npsStart": 65,
      "oneTime": false,
      "rarity": "rare",
      "modifier": {
        "type": "nps_penalty",
        "val": -30000,
        "threshold": 70,
        "label": "NPS<70 → штраф 30К/мес"
      },
      "modBadge": "mb-red",
      "prob": 0.28
    },
    {
      "id": "insurance",
      "tier": 3,
      "icon": "🛡️",
      "name": "Страховая компания",
      "desc": "Консервативный корпоративный клиент. Стабильный доход, но NPS держать сложно.",
      "revenue": 85000,
      "minQ": 14,
      "minV": 10,
      "type": "corp",
      "npsStart": 64,
      "oneTime": false,
      "rarity": "uncommon",
      "modifier": {
        "type": "nps_drain",
        "val": -6,
        "label": "NPS −6 доп./мес"
      },
      "modBadge": "mb-amber",
      "prob": 0.35
    },
    {
      "id": "media_holding",
      "tier": 3,
      "icon": "📺",
      "name": "Медиахолдинг",
      "desc": "Крупный медиа-игрок. Нужен весь спектр: контент, визуал, стратегия.",
      "revenue": 95000,
      "minQ": 18,
      "minV": 20,
      "type": "store",
      "npsStart": 68,
      "oneTime": false,
      "rarity": "rare",
      "modifier": {
        "type": "revenue_growth",
        "val": 0.06,
        "label": "+6% выручки каждый мес"
      },
      "modBadge": "mb-teal",
      "prob": 0.25
    },
    {
      "id": "auto_dealer",
      "tier": 3,
      "icon": "🚗",
      "name": "Дилерская сеть",
      "desc": "Крупный автодилер, хочет digital-присутствие. Платит аккуратно, NPS нестабилен.",
      "revenue": 80000,
      "minQ": 14,
      "minV": 10,
      "type": "corp",
      "npsStart": 67,
      "oneTime": false,
      "rarity": "uncommon",
      "modifier": {
        "type": "payment_delay",
        "val": 0.2,
        "label": "20% шанс задержки/мес"
      },
      "modBadge": "mb-amber",
      "prob": 0.3
    },
    {
      "id": "ministry",
      "tier": 3,
      "icon": "🗂️",
      "name": "Министерство (нацпроект)",
      "desc": "Государственный нацпроект. Огромный бюджет, но бюрократия затягивает старт.",
      "revenue": 160000,
      "minQ": 26,
      "minV": 20,
      "type": "corp",
      "npsStart": 58,
      "oneTime": false,
      "rarity": "epic",
      "duration": 10,
      "modifier": {
        "type": "payment_delay_fixed",
        "val": 3,
        "label": "Первые 3 мес — нет оплаты"
      },
      "modBadge": "mb-purple",
      "prob": 0.15
    },
    {
      "id": "media_agency",
      "tier": 2,
      "icon": "📊",
      "name": "Медиа-агентство",
      "desc": "Работают только с агентствами с историей. Требует портфолио.",
      "revenue": 54000,
      "minQ": 10,
      "minV": 10,
      "type": "small",
      "npsStart": 77,
      "oneTime": false,
      "rarity": "uncommon",
      "minPortfolio": 12,
      "portfolioWeight": 2,
      "modifier": {
        "type": "nps_passive",
        "val": 4,
        "label": "+4 NPS/мес"
      },
      "modBadge": "mb-green",
      "prob": 0.55
    },
    {
      "id": "international",
      "tier": 3,
      "icon": "🌍",
      "name": "Международный клиент",
      "desc": "Зарубежная компания с серьёзными требованиями к опыту агентства.",
      "revenue": 100000,
      "minQ": 18,
      "minV": 10,
      "type": "corp",
      "npsStart": 70,
      "oneTime": false,
      "rarity": "rare",
      "minPortfolio": 28,
      "portfolioWeight": 3,
      "modifier": {
        "type": "payment_delay",
        "val": 0.2,
        "label": "20% шанс задержки/мес"
      },
      "modBadge": "mb-amber",
      "prob": 0.38
    },
    {
      "id": "strategic_partner",
      "tier": 3,
      "icon": "🤝",
      "name": "Стратегический партнёр",
      "desc": "Якорный долгосрочный контракт. Только для агентств с сильным портфолио.",
      "revenue": 80000,
      "minQ": 14,
      "minV": 15,
      "type": "store",
      "npsStart": 82,
      "oneTime": false,
      "rarity": "rare",
      "minPortfolio": 50,
      "portfolioWeight": 3,
      "modifier": {
        "type": "revenue_growth",
        "val": 0.08,
        "label": "+8% выручки каждый мес"
      },
      "modBadge": "mb-teal",
      "prob": 0.32
    },
    {
      "id": "developer_estate",
      "tier": 3,
      "icon": "🏗️",
      "name": "Девелопер недвижимости",
      "desc": "Крупный застройщик с амбициозным брендингом. Портфолио обязательно.",
      "revenue": 90000,
      "minQ": 18,
      "minV": 15,
      "type": "store",
      "npsStart": 70,
      "oneTime": false,
      "rarity": "rare",
      "minPortfolio": 20,
      "portfolioWeight": 2,
      "modifier": {
        "type": "revenue_growth",
        "val": 0.05,
        "label": "+5% выручки каждый мес"
      },
      "modBadge": "mb-teal",
      "prob": 0.3
    },
    {
      "id": "saas",
      "tier": 2,
      "icon": "⚙️",
      "name": "SaaS-интеграция",
      "desc": "Технический клиент — настройка и поддержка платформы. Нужен Разработчик.",
      "revenue": 72000,
      "minQ": 12,
      "minV": 0,
      "type": "corp",
      "npsStart": 74,
      "oneTime": false,
      "rarity": "uncommon",
      "requiresDev": true,
      "modifier": {
        "type": "nps_passive",
        "val": 3,
        "label": "+3 NPS/мес"
      },
      "modBadge": "mb-teal",
      "prob": 0.5
    },
    {
      "id": "fintech",
      "tier": 3,
      "icon": "🏦",
      "name": "FinTech-платформа",
      "desc": "Крупный технический контракт. Высокий порог качества и обязательно Разработчик.",
      "revenue": 115000,
      "minQ": 22,
      "minV": 10,
      "type": "corp",
      "npsStart": 65,
      "oneTime": false,
      "rarity": "rare",
      "requiresDev": true,
      "modifier": {
        "type": "payment_delay_fixed",
        "val": 1,
        "label": "1 мес — нет оплаты"
      },
      "modBadge": "mb-purple",
      "prob": 0.3
    },
    {
      "id": "telecom",
      "tier": 3,
      "icon": "📡",
      "name": "Телеком-оператор",
      "desc": "B2B-контракт с оператором. Нужен разработчик для интеграции с системами.",
      "revenue": 105000,
      "minQ": 18,
      "minV": 10,
      "type": "corp",
      "npsStart": 63,
      "oneTime": false,
      "rarity": "rare",
      "requiresDev": true,
      "modifier": {
        "type": "nps_drain",
        "val": -5,
        "label": "NPS −5 доп./мес"
      },
      "modBadge": "mb-amber",
      "prob": 0.28
    },
    {
      "id": "payment_sys",
      "tier": 3,
      "icon": "💳",
      "name": "Платёжная система",
      "desc": "Fintech-гигант. Компания платит огромные деньги, но требует всего и сразу.",
      "revenue": 140000,
      "minQ": 26,
      "minV": 15,
      "type": "corp",
      "npsStart": 60,
      "oneTime": false,
      "rarity": "epic",
      "requiresDev": true,
      "modifier": {
        "type": "nps_penalty",
        "val": -40000,
        "threshold": 70,
        "label": "NPS<70 → штраф 40К/мес"
      },
      "modBadge": "mb-red",
      "prob": 0.15
    },
    {
      "id": "national_corp",
      "tier": 4,
      "icon": "🏭",
      "name": "Национальная корпорация",
      "desc": "Системообразующее предприятие. Требует выдающейся команды и безупречного портфолио.",
      "revenue": 200000,
      "minQ": 30,
      "minV": 25,
      "type": "corp",
      "npsStart": 62,
      "oneTime": false,
      "rarity": "epic",
      "minPortfolio": 20,
      "modifier": {
        "type": "nps_penalty",
        "val": -50000,
        "threshold": 70,
        "label": "NPS<70 → штраф 50К/мес"
      },
      "modBadge": "mb-red",
      "prob": 0.2
    },
    {
      "id": "intl_holding",
      "tier": 4,
      "icon": "🌐",
      "name": "Международный холдинг",
      "desc": "Мультинациональная структура. Платит в валюте, но ждёт агентство уровня топ-5 рынка.",
      "revenue": 180000,
      "minQ": 26,
      "minV": 25,
      "type": "store",
      "npsStart": 66,
      "oneTime": false,
      "rarity": "epic",
      "minPortfolio": 30,
      "modifier": {
        "type": "revenue_growth",
        "val": 0.07,
        "label": "+7% выручки каждый мес"
      },
      "modBadge": "mb-teal",
      "prob": 0.18
    },
    {
      "id": "unicorn_startup",
      "tier": 4,
      "icon": "🦄",
      "name": "Единорог-стартап",
      "desc": "Компания на пороге IPO. Нужен брендинг мирового уровня — и быстро.",
      "revenue": 220000,
      "minQ": 30,
      "minV": 20,
      "type": "store",
      "npsStart": 70,
      "oneTime": false,
      "rarity": "epic",
      "requiresDev": true,
      "modifier": {
        "type": "payment_delay_fixed",
        "val": 1,
        "label": "1 мес — нет оплаты"
      },
      "modBadge": "mb-purple",
      "prob": 0.15
    },
    {
      "id": "state_mega",
      "tier": 4,
      "icon": "🏛️",
      "name": "Госмегапроект",
      "desc": "Федеральная программа. Бюджет огромный, сроки жёсткие, бюрократия запредельная.",
      "revenue": 250000,
      "minQ": 26,
      "minV": 30,
      "type": "corp",
      "npsStart": 55,
      "oneTime": false,
      "rarity": "epic",
      "duration": 12,
      "minPortfolio": 25,
      "modifier": {
        "type": "payment_delay_fixed",
        "val": 3,
        "label": "Первые 3 мес — нет оплаты"
      },
      "modBadge": "mb-purple",
      "prob": 0.12
    },
    {
      "id": "enterprise_anchor",
      "tier": 4,
      "icon": "⚓",
      "name": "Enterprise-якорь",
      "desc": "Долгосрочный ретейнер от крупнейшего игрока рынка. Мечта любого агентства.",
      "revenue": 160000,
      "minQ": 26,
      "minV": 20,
      "type": "store",
      "npsStart": 72,
      "oneTime": false,
      "rarity": "epic",
      "minPortfolio": 40,
      "portfolioWeight": 4,
      "modifier": {
        "type": "revenue_growth",
        "val": 0.1,
        "label": "+10% выручки каждый мес"
      },
      "modBadge": "mb-teal",
      "prob": 0.15
    },
    {
      "id": "bank_digital",
      "tier": 4,
      "icon": "🏦",
      "name": "Цифровой банк",
      "desc": "Банк трансформируется в digital. Контракт с жёсткими KPI и большим потенциалом.",
      "revenue": 190000,
      "minQ": 30,
      "minV": 20,
      "type": "corp",
      "npsStart": 60,
      "oneTime": false,
      "rarity": "epic",
      "requiresDev": true,
      "minPortfolio": 20,
      "modifier": {
        "type": "nps_passive",
        "val": 2,
        "label": "+2 NPS/мес"
      },
      "modBadge": "mb-green",
      "prob": 0.15
    },
    {
      "id": "federal_bank",
      "tier": 5,
      "icon": "🏛",
      "name": "Федеральный банк",
      "desc": "Полный ребрендинг розничного направления: айдентика, диджитал-каналы, внутренние гайды. Тендер выигран — теперь главное не утонуть в согласованиях.",
      "revenue": 0,
      "minQ": 30,
      "minV": 18,
      "type": "corp",
      "npsStart": 62,
      "oneTime": false,
      "rarity": "rare",
      "prepayChance": 0.55,
      "modifier": {
        "type": "nps_penalty",
        "val": -60000,
        "threshold": 65,
        "label": "KPI-штраф при NPS<65"
      },
      "modBadge": "mb-amber",
      "prob": 0.3
    },
    {
      "id": "retail_giant",
      "tier": 5,
      "icon": "🛒",
      "name": "Ритейл-сеть «Полка»",
      "desc": "Восемьсот магазинов по стране и устаревший образ. Перезапуск бренда плюс кампания на федеральных площадках. Много стейкхолдеров, много правок.",
      "revenue": 0,
      "minQ": 28,
      "minV": 22,
      "type": "store",
      "npsStart": 60,
      "oneTime": false,
      "rarity": "rare",
      "prepayChance": 0.5,
      "modifier": {
        "type": "revenue_growth",
        "val": 0.04,
        "label": "+4% бюджета каждый мес"
      },
      "modBadge": "mb-teal",
      "prob": 0.32
    },
    {
      "id": "airline",
      "tier": 5,
      "icon": "✈️",
      "name": "Авиакомпания «Высота»",
      "desc": "Лоукостер хочет выглядеть премиально, не меняя цен. Брендинг, борта, форма экипажа, диджитал. Красивый кейс — если довезёте до конца.",
      "revenue": 0,
      "minQ": 32,
      "minV": 15,
      "type": "corp",
      "npsStart": 58,
      "oneTime": false,
      "rarity": "epic",
      "prepayChance": 0.45,
      "requiresDev": true,
      "modifier": {
        "type": "nps_drain",
        "val": -2,
        "label": "−2 NPS/мес — капризный борт"
      },
      "modBadge": "mb-amber",
      "prob": 0.25
    },
    {
      "id": "oil_corp",
      "tier": 6,
      "icon": "🛢",
      "name": "Сырьевой холдинг «Недра»",
      "desc": "Корпорация выходит на розничный рынок и хочет человеческое лицо. Бюджеты огромные, процессы каменные: каждое решение проходит три уровня согласований.",
      "revenue": 0,
      "minQ": 35,
      "minV": 20,
      "type": "corp",
      "npsStart": 55,
      "oneTime": false,
      "rarity": "epic",
      "prepayChance": 0.6,
      "requiresLegal": true,
      "modifier": {
        "type": "payment_delay",
        "val": 0.3,
        "label": "30% шанс задержки части оплаты"
      },
      "modBadge": "mb-amber",
      "prob": 0.25
    },
    {
      "id": "mega_holding",
      "tier": 6,
      "icon": "🏗",
      "name": "Экосистема «Сфера»",
      "desc": "Холдинг собирает десяток сервисов под один зонтичный бренд. Архитектура бренда, нейминг, дизайн-система — работа на год вперёд для всей команды.",
      "revenue": 0,
      "minQ": 38,
      "minV": 25,
      "type": "corp",
      "npsStart": 60,
      "oneTime": false,
      "rarity": "epic",
      "prepayChance": 0.55,
      "requiresDev": true,
      "minPortfolio": 55,
      "modifier": {
        "type": "revenue_growth",
        "val": 0.05,
        "label": "+5% бюджета каждый мес"
      },
      "modBadge": "mb-teal",
      "prob": 0.22
    },
    {
      "id": "state_program",
      "tier": 7,
      "icon": "🏟",
      "name": "Цифровизация региона",
      "desc": "Госпрограмма полного цикла: портал, сервисы, кампания, айдентика региона. Контракт, о котором пишут в отраслевых медиа. И который снится в кошмарах.",
      "revenue": 0,
      "minQ": 40,
      "minV": 28,
      "type": "corp",
      "npsStart": 55,
      "oneTime": false,
      "rarity": "legendary",
      "prepayChance": 0.7,
      "requiresLegal": true,
      "requiresDev": true,
      "duration": 22,
      "modifier": {
        "type": "payment_delay_fixed",
        "val": 2,
        "label": "Старт работ через 2 мес (бюрократия)"
      },
      "modBadge": "mb-amber",
      "prob": 0.18
    },
    {
      "id": "global_brand",
      "tier": 7,
      "icon": "🌍",
      "name": "Глобальный бренд «Atlas»",
      "desc": "Международная компания заходит на рынок и ищет локальное агентство флагманского уровня. Победа в этом питче меняет статус студии навсегда.",
      "revenue": 0,
      "minQ": 42,
      "minV": 25,
      "type": "corp",
      "npsStart": 62,
      "oneTime": false,
      "rarity": "legendary",
      "prepayChance": 0.5,
      "requiresDev": true,
      "minPortfolio": 90,
      "modifier": {
        "type": "nps_penalty",
        "val": -120000,
        "threshold": 70,
        "label": "KPI-штраф при NPS<70"
      },
      "modBadge": "mb-amber",
      "prob": 0.15
    }
  ],
  "upgrades": [
    {
      "id": "tools_q",
      "icon": "🖥️",
      "name": "Проф. инструментарий",
      "desc": "Базовый стек качества.",
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
      "icon": "📚",
      "name": "Курсы команды",
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
      "icon": "🎯",
      "name": "UX-консультант",
      "desc": "Взгляд эксперта на каждый проект.",
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
      "name": "Стандарты качества",
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
      "icon": "⚡",
      "name": "Agile-внедрение",
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
      "icon": "🔄",
      "name": "Scrum-мастер",
      "desc": "Ритм спринтов для всей команды.",
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
      "name": "Автоматизация",
      "desc": "Рутина уходит к скриптам.",
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
      "name": "ИИ-конвейер",
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
      "name": "Рабочие ритуалы",
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
      "name": "Менторство",
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
      "name": "Культура студии",
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
      "icon": "🌐",
      "name": "Портфолио-сайт",
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
      "icon": "📄",
      "name": "Кейс-стади",
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
      "name": "Отраслевые награды",
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
      "name": "PR-служба",
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
      "name": "Переговорщик",
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
      "name": "Клоузер",
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
      "name": "Делатель дождя",
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
      "icon": "🏖️",
      "name": "Оплачиваемые выходные",
      "desc": "Команда отдыхает пару дней — быстрый сброс накопленного стресса",
      "cost": 12000,
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
      "icon": "🎉",
      "name": "Тимбилдинг",
      "desc": "Командный офлайн-день: игры, еда, живое общение — существенный откат усталости",
      "cost": 28000,
      "days": 4,
      "qBonus": 0,
      "repBonus": 0,
      "oneTime": false,
      "speedBonus": 0,
      "fatigueReduce": 22,
      "cooldownMonths": 2
    },
    {
      "id": "corp_vacation",
      "icon": "✈️",
      "name": "Корп. отпуск",
      "desc": "Полноценный отдых команды. Снимает даже сильное выгорание. Доступен при усталости ≥40",
      "cost": 55000,
      "days": 6,
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
      "icon": "✏️",
      "name": "Фриланс-дизайнер",
      "desc": "Временная помощь — Q только в этом месяце. Q +7",
      "cost": 30000,
      "days": 2,
      "qBonus": 7,
      "repBonus": 0,
      "oneTime": false,
      "speedBonus": 0
    }
  ],
  "events": [
    {
      "id": "discount",
      "icon": "🤝",
      "title": "Клиент просит скидку",
      "requiresClients": true,
      "body": "Постоянный клиент просит снизить итоговый бюджет на 15%. Отказать — лояльность падает, согласиться — теряешь часть выплаты.",
      "choices": [
        {
          "text": "Согласиться (−15% бюджета, лояльность +12)",
          "desc": "Клиент доволен, лояльность растёт",
          "effects": [
            {
              "client": {
                "sel": "last",
                "op": "budgetMulPct",
                "val": -15
              }
            },
            {
              "nudgeAll": 12
            },
            {
              "notify": [
                "🤝 Скидка дана — клиент благодарен",
                "info"
              ]
            }
          ]
        },
        {
          "text": "Отказать",
          "desc": "Лояльность клиента −20 (риск ухода)",
          "effects": [
            {
              "client": {
                "sel": "last",
                "op": "rating",
                "val": -20
              }
            }
          ]
        }
      ]
    },
    {
      "id": "quit",
      "icon": "🚪",
      "title": "Сотрудник хочет уйти",
      "body": "Получил оффер. Можно удержать повышением или отпустить.",
      "choices": [
        {
          "text": "Повышение +20 000 ₽/мес",
          "desc": "Остаётся, зарплата выше",
          "effects": [
            {
              "staff": {
                "sel": "last",
                "op": "raise",
                "val": 20000
              }
            },
            {
              "rd": [
                "Удержал сотрудника +20К/мес",
                "hire"
              ]
            }
          ]
        },
        {
          "text": "Отпустить",
          "desc": "Теряешь его бонусы",
          "effects": [
            {
              "staff": {
                "sel": "last",
                "op": "remove"
              }
            },
            {
              "rd": [
                "Сотрудник ушёл из команды",
                "churn"
              ]
            }
          ]
        }
      ]
    },
    {
      "id": "algo",
      "icon": "📉",
      "title": "Алгоритм сменился",
      "requiresClients": true,
      "body": "Апдейт платформ. Клиенты паникуют — лояльность всех просела.",
      "choices": [
        {
          "text": "Антикризисный аудит (−30 000 ₽)",
          "desc": "Лояльность +15 у всех",
          "effects": [
            {
              "money": -30000
            },
            {
              "nudgeAll": 15
            },
            {
              "notify": [
                "Аудит проведён ✅",
                "info"
              ]
            },
            {
              "rd": [
                "Антикризисный аудит −30К",
                "event"
              ]
            }
          ]
        },
        {
          "text": "Переждать",
          "desc": "Лояльность всех клиентов −18",
          "effects": [
            {
              "nudgeAll": -18
            },
            {
              "notify": [
                "Клиенты недовольны 📉",
                "warning"
              ]
            }
          ]
        }
      ]
    },
    {
      "id": "conflict",
      "icon": "⚡",
      "title": "Конфликт в команде",
      "body": "Два специалиста не поделили проект. Атмосфера накаляется.",
      "choices": [
        {
          "text": "Тимбилдинг (−25 000 ₽)",
          "desc": "Команда выдыхает, клиенты чувствуют настрой",
          "effects": [
            {
              "money": -25000
            },
            {
              "nudgeAll": 10
            },
            {
              "notify": [
                "Тимбилдинг помог 🎉",
                "success"
              ]
            },
            {
              "rd": [
                "Тимбилдинг −25К",
                "event"
              ]
            }
          ]
        },
        {
          "text": "Пусть разбираются сами",
          "desc": "50/50: уляжется или заденет клиентов (−8)",
          "effects": [
            {
              "roll": {
                "chance": 0.5,
                "success": [
                  {
                    "nudgeAll": -8
                  },
                  {
                    "notify": [
                      "Конфликт зацепил проекты 📉",
                      "warning"
                    ]
                  }
                ],
                "fail": [
                  {
                    "notify": [
                      "Конфликт исчерпан 🤝",
                      "success"
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
      "id": "subs_renewal",
      "icon": "💳",
      "title": "Продление подписок на сервисы",
      "body": "Figma, хостинг, стоки — годовые подписки истекают. Оплатить сейчас со скидкой или отложить на пару месяцев по полной цене?",
      "choices": [
        {
          "text": "Оплатить сейчас со скидкой (−25 000 ₽)",
          "desc": "Дешевле и забыли",
          "effects": [
            {
              "money": -25000
            },
            {
              "notify": [
                "Подписки продлены на год ✅",
                "info"
              ]
            },
            {
              "rd": [
                "Подписки со скидкой −25К",
                "event"
              ]
            }
          ]
        },
        {
          "text": "Отложить платёж",
          "desc": "Через 2 месяца спишется 40 000 ₽ — появится в календаре",
          "effects": [
            {
              "schedule": {
                "inMonths": 2,
                "label": "Оплата подписок (отложенная)",
                "money": -40000,
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
    "purchaseCost": 200000,
    "purchaseMinRep": 50,
    "levels": [
      {
        "level": 0,
        "name": "Базовая модель",
        "desc": "Нейросеть развёрнута и принимает запросы. Обработка занимает несколько месяцев — модель ещё только обучается на данных вашего агентства.",
        "cost": 0,
        "trainingMonths": 0,
        "responseMonths": 3,
        "queriesPerMonth": 2,
        "passiveQ": 0,
        "passiveRep": 0,
        "passiveV": 0,
        "autoScout": false
      },
      {
        "level": 1,
        "name": "Первое дообучение",
        "desc": "Модель изучила историю ваших проектов. Скорость ответа выросла — анализ теперь занимает два месяца.",
        "cost": 80000,
        "trainingMonths": 2,
        "responseMonths": 2,
        "queriesPerMonth": 2,
        "passiveQ": 0,
        "passiveRep": 0,
        "passiveV": 0,
        "autoScout": false
      },
      {
        "level": 2,
        "name": "Расширенный контекст",
        "desc": "Нейросеть научилась учитывать репутацию, усталость и рыночную конъюнктуру. Ответы приходят через месяц. Активирует пассивный рост качества.",
        "cost": 150000,
        "trainingMonths": 3,
        "responseMonths": 1,
        "queriesPerMonth": 3,
        "passiveQ": 2,
        "passiveRep": 0,
        "passiveV": 0,
        "autoScout": false
      },
      {
        "level": 3,
        "name": "Оперативная аналитика",
        "desc": "Модель работает в режиме реального времени. Ответы приходят в тот же месяц. Начинает пассивно поддерживать репутацию агентства.",
        "cost": 250000,
        "trainingMonths": 4,
        "responseMonths": 0,
        "queriesPerMonth": 5,
        "passiveQ": 2,
        "passiveRep": 1,
        "passiveV": 0,
        "autoScout": false
      },
      {
        "level": 4,
        "name": "Стратегический советник",
        "desc": "Нейросеть стала полноценным членом команды. Безлимитные запросы, пассивный рост всех ключевых параметров.",
        "cost": 400000,
        "trainingMonths": 5,
        "responseMonths": 0,
        "queriesPerMonth": 999,
        "passiveQ": 3,
        "passiveRep": 2,
        "passiveV": 5,
        "autoScout": false
      },
      {
        "level": 5,
        "name": "Полная автономия",
        "desc": "ИИ самостоятельно мониторит рынок и помечает лучшие офферы при скаутинге. Максимальный уровень развития.",
        "cost": 600000,
        "trainingMonths": 6,
        "responseMonths": 0,
        "queriesPerMonth": 999,
        "passiveQ": 3,
        "passiveRep": 2,
        "passiveV": 5,
        "autoScout": true
      }
    ],
    "quickQuestions": [
      "📊 Проанализируй текущее состояние агентства",
      "💰 Стоит ли брать ещё один проект сейчас?",
      "😓 Как справиться с усталостью команды?",
      "📉 Что делать с падающей репутацией?",
      "🔍 Какие проекты сейчас наиболее выгодны?",
      "💳 Имеет ли смысл брать кредит?",
      "👥 Кого из специалистов нанять следующим?"
    ]
  },
  "upgradeBranches": [
    {
      "label": "Качество",
      "color": "rgba(45,212,191,.65)"
    },
    {
      "label": "Скорость",
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
  ],

  "runMap": {
    "stages": [
      { "id": "studio_garage",  "name": "Гараж-студия",    "icon": "🏚", "color": "#94a3b8", "monthEnd":  6,
        "sub": "Первые контракты, фрилансная гибкость. Доказываем, что вообще можем делать проекты в срок." },
      { "id": "studio_team",    "name": "Команда сложилась","icon": "🛠", "color": "#22d3ee", "monthEnd": 14,
        "sub": "Появился костяк, постоянные клиенты, кейсы. Пора систематизировать процессы." },
      { "id": "studio_growth",  "name": "Заметное агентство","icon": "📈","color": "#a78bfa", "monthEnd": 22,
        "sub": "Заходят тиры посерьёзнее, реп больше 70. Без процессов рассыпется." },
      { "id": "studio_brand",   "name": "Бренд",            "icon": "🏛", "color": "#f59e0b", "monthEnd": 30,
        "sub": "Нас знают по нише. Эпики берут не «на спор», а с расчётом." },
      { "id": "studio_endgame", "name": "Топ-лист",         "icon": "👑", "color": "#facc15", "monthEnd": null,
        "sub": "Финальный рывок: лучшие проекты, выжимаем максимум из бренда." }
    ],
    "bonuses": [
      { "id": "cash",           "icon": "💸", "name": "Дивиденды",
        "desc": "Разовая выплата +250 000 ₽",
        "effects": [{ "money": 250000 }],
        "log":  "💸 Дивиденды: +250 000 ₽" },
      { "id": "rep",            "icon": "⭐", "name": "Узнаваемость",
        "desc": "+5 репутации",
        "effects": [{ "rep": 5 }],
        "log":  "⭐ Узнаваемость: +5 реп." },
      { "id": "payout",         "icon": "📈", "name": "Премиум-позиционирование",
        "desc": "+5% к выплатам всех проектов",
        "effects": [{ "gAdd": { "perkPayoutMult": 0.05 } }],
        "log":  "📈 Премиум-позиционирование: выплаты +5%" },
      { "id": "overhead",       "icon": "🛠", "name": "Оптимизация процессов",
        "desc": "−10% overhead до конца партии",
        "effects": [{ "overheadBump": -0.10 }],
        "log":  "🛠 Оптимизация: overhead −10%" },
      { "id": "cases",          "icon": "🏆", "name": "Резонансный кейс",
        "desc": "+5 к качеству от кейсов навсегда",
        "effects": [{ "gAdd": { "caseQBonus": 5 } }],
        "log":  "🏆 Резонансный кейс: +5 Q" },
      { "id": "scout",          "icon": "🔍", "name": "Связи с заказчиками",
        "desc": "+1 лид при скаутинге",
        "effects": [{ "gAdd": { "caseScoutBonus": 1 } }],
        "log":  "🔍 Связи: +1 лид" },
      { "id": "rep_recovery",   "icon": "💼", "name": "PR-агентство",
        "desc": "+1 восстановление репутации/мес",
        "effects": [{ "gAdd": { "caseRepBonus": 1 } }],
        "log":  "💼 PR-агентство: +1 реп/мес" },
      { "id": "speed",          "icon": "🚀", "name": "Внутренний акселератор",
        "desc": "+5% скорости команды",
        "effects": [{ "gAdd": { "speedUpgrades": 0.05 } }],
        "log":  "🚀 Акселератор: скорость +5%" },
      { "id": "prepay",         "icon": "💳", "name": "Юридический бренд",
        "desc": "+15% к шансу предоплаты",
        "effects": [{ "gAdd": { "perkPrepayBonus": 0.15 } }],
        "log":  "💳 Юр-бренд: предоплата +15%" },
      { "id": "penalty_shield", "icon": "🛡", "name": "Авторитет на рынке",
        "desc": "Просрочка бьёт по репутации −50%",
        "effects": [{ "gSet": { "perkPenaltyShield": true } }],
        "log":  "🛡 Авторитет: штраф просрочки −50%" },
      { "id": "fatigue",        "icon": "🌿", "name": "Велнес-программа",
        "desc": "−15 усталости команды, +5% к восст.",
        "effects": [{ "fatigue": -15 }, { "gAdd": { "perkRecoveryBonus": 0.05 } }],
        "log":  "🌿 Велнес: усталость −15, восст. +5%" },
      { "id": "portfolio",      "icon": "📚", "name": "PR-кампания",
        "desc": "+10 баллов портфолио",
        "effects": [{ "gAdd": { "portfolio": 10 } }],
        "log":  "📚 PR-кампания: +10 портфолио" },

      // ────────────────────────────────────────────────────────────────
      // ЭТАП-ЭКСКЛЮЗИВЫ (v3.17): доступны только на конкретных этапах
      // ────────────────────────────────────────────────────────────────
      // 🏛 Бренд
      { "id": "thought_leader",   "icon": "🎤", "name": "Thought leadership",
        "desc": "+1 лид при скаутинге · +1 восст. реп/мес (выступления и публикации)",
        "stages": ["studio_brand"],
        "effects": [{ "gAdd": { "caseScoutBonus": 1, "caseRepBonus": 1 } }],
        "log":  "🎤 Thought leadership: +1 лид · +1 реп/мес" },
      { "id": "design_awards",    "icon": "🏅", "name": "Победа на отраслевых наградах",
        "desc": "+15 баллов портфолио · +5 репутации",
        "stages": ["studio_brand"],
        "effects": [{ "gAdd": { "portfolio": 15 } }, { "rep": 5 }],
        "log":  "🏅 Награды: +15 портф. · +5 реп." },

      // 👑 Топ-лист
      { "id": "boutique_premium", "icon": "💎", "name": "Премиум-позиционирование «бутик»",
        "desc": "+10% к выплатам всех проектов до конца партии",
        "stages": ["studio_endgame"],
        "effects": [{ "gAdd": { "perkPayoutMult": 0.10 } }],
        "log":  "💎 Бутик: выплаты +10%" },
      { "id": "agency_franchise", "icon": "🌐", "name": "Открытие франшизы",
        "desc": "Разовая выплата +600 000 ₽ от продажи лицензий",
        "stages": ["studio_endgame"],
        "effects": [{ "money": 600000 }],
        "log":  "🌐 Франшиза: +600 000 ₽" }
    ]
  },

  "storyArcs": [
    {
      "id": "old_friend",
      "name": "Звонок от старого знакомого",
      "trigger": { "minMonth": 3, "maxMonth": 14, "minRep": 30, "chance": 0.55 },
      "stageDelayMonths": 2,
      "cooldown": 6,
      "stages": [
        {
          "id": "intro",
          "icon": "📞",
          "title": "Звонок от Алексея",
          "body": "Бывший коллега из «Орбиты» вышел на связь. Готов рекомендовать тебя крупному клиенту — розничной сети «Берёзка». Просит 8% от первой сделки за интро.",
          "choices": [
            {
              "text": "Согласиться (8% откат)",
              "desc": "Тёплое интро, но обязательство",
              "effects": [
                { "rep": 2 },
                { "log": ["📞 Алексей: «Сегодня же напишу владельцу»", "purple"] }
              ],
              "next": "meeting"
            },
            {
              "text": "Отказаться — обойдусь сам",
              "desc": "Без обязательств, но без интро",
              "effects": [
                { "rep": -1 },
                { "log": ["📞 Алексей расстроен — связи остыли", "amber"] }
              ],
              "end": true
            }
          ]
        },
        {
          "id": "meeting",
          "icon": "🤝",
          "title": "Встреча с «Берёзкой»",
          "body": "Владелец сети сидит напротив. Он хочет редизайн e-com и SMM-сопровождение — но бюджет «как у всех». Что делаешь?",
          "choices": [
            {
              "text": "Поднять цену и продать ценность",
              "desc": "Риск отказа, но шанс на большой контракт",
              "effects": [
                {
                  "roll": {
                    "chance": 0.55,
                    "roleBonus": { "role": "manager", "add": 0.15 },
                    "success": [
                      { "money": 480000 },
                      { "rep": 4 },
                      { "log": ["🤝 «Берёзка»: сделка закрыта, аванс +480К", "green"] },
                      { "notify": ["🌟 Крупный клиент подписался — +480К", "success"] }
                    ],
                    "fail": [
                      { "rep": -2 },
                      { "log": ["🤝 «Берёзка»: ушли к конкуренту — цена не зашла", "red"] }
                    ]
                  }
                }
              ],
              "next": "aftermath"
            },
            {
              "text": "Принять их бюджет — лишь бы зашли",
              "desc": "Сделка точно будет, но не выручишь",
              "effects": [
                { "money": 180000 },
                { "rep": 1 },
                { "log": ["🤝 «Берёзка»: подписан минимальный пакет +180К", "amber"] }
              ],
              "next": "aftermath"
            }
          ]
        },
        {
          "id": "aftermath",
          "icon": "📨",
          "title": "Алексей напоминает про комиссию",
          "body": "Через два месяца Алексей просит свои 8%. Платить или попытаться отвертеться?",
          "choices": [
            {
              "text": "Заплатить честно (−45 000 ₽)",
              "desc": "Связь сохранится, может ещё клиента приведёт",
              "effects": [
                { "money": -45000 },
                { "rep": 2 },
                { "log": ["📨 Алексею выплачены 45К — связь жива", "teal"] }
              ],
              "end": true
            },
            {
              "text": "Затянуть с оплатой",
              "desc": "Сэкономишь, но Алексей расскажет рынку",
              "effects": [
                { "rep": -6 },
                { "nudgeAll": -8 },
                { "log": ["📨 Алексей хлопнул дверью — слух пошёл по рынку", "red"] },
                { "notify": ["⚠️ Репутация просела — слух о невыплате", "warning"] }
              ],
              "end": true
            }
          ]
        }
      ]
    },
    {
      "id": "burnout_signal",
      "name": "Сигнал выгорания",
      "trigger": { "minMonth": 8, "maxMonth": 24, "minPortfolio": 10, "chance": 0.5 },
      "stageDelayMonths": 1,
      "cooldown": 6,
      "stages": [
        {
          "id": "anonymous_note",
          "icon": "✉️",
          "title": "Анонимная записка в чате",
          "body": "В рабочем чате появилось анонимное сообщение: «Команда устала. Уйдёт половина к концу квартала, если ничего не поменяется». Реакция?",
          "choices": [
            {
              "text": "Созвать общий разговор",
              "desc": "Открытость — но риск, что вскроются проблемы пожёстче",
              "effects": [
                { "fatigue": -8 },
                { "log": ["✉️ Открытый разговор: команда дышит свободнее", "teal"] }
              ],
              "next": "investigate"
            },
            {
              "text": "Проигнорировать — рабочее напряжение",
              "desc": "Возможно, само рассосётся",
              "effects": [
                { "fatigue": 6 },
                { "log": ["✉️ Записка проигнорирована — атмосфера испортилась", "amber"] }
              ],
              "next": "investigate"
            }
          ]
        },
        {
          "id": "investigate",
          "icon": "🔍",
          "title": "Источник напряжения",
          "body": "Стало ясно: один из сеньоров заваливает соседей правками по ночам. Сделать с ним разговор или премировать остальных?",
          "choices": [
            {
              "text": "Премировать всех (−80 000 ₽)",
              "desc": "Снимет острые углы, но дорого",
              "effects": [
                { "money": -80000 },
                { "fatigue": -10 },
                { "log": ["🎁 Премии разосланы — команда выдохнула", "green"] }
              ],
              "end": true
            },
            {
              "text": "Разговор с сеньором",
              "desc": "Бесплатно, но риск ухода ключевого",
              "effects": [
                {
                  "roll": {
                    "chance": 0.6,
                    "roleBonus": { "role": "hr", "add": 0.2 },
                    "success": [
                      { "fatigue": -6 },
                      { "rep": 1 },
                      { "log": ["🤝 Сеньор остыл — режим выровнялся", "teal"] }
                    ],
                    "fail": [
                      { "staff": { "sel": "strongest", "op": "remove" } },
                      { "rep": -3 },
                      { "log": ["💼 Сеньор ушёл — ключевая фигура потеряна", "red"] }
                    ]
                  }
                }
              ],
              "end": true
            }
          ]
        }
      ]
    }
  ]
};
