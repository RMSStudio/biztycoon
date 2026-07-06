// ══════════════════════════════════════════════════════════════════════
//  Ф.7 — КАТАЛОГ ТРЕЙТОВ И СИНЕРГИЙ (§13 → данные, §14.5/§14.6)
//
//  Чистые данные без DOM/логики (Godot-portable). Исполняет src/traits.js.
//  Проверка корректности: TraitEngine.validateCatalog() → список проблем.
//
// ┌─────────────────────── ФОРМУЛА ТРЕЙТА ────────────────────────────────┐
// │  КТО:    id · name · icon · family · pool · weight/rarity            │
// │  КОГДА:  хук — момент, в который трейт «просыпается»                 │
// │  ЕСЛИ:   when-предикаты — все условия должны совпасть (AND)          │
// │  ТО:     do-глаголы — что меняется (числа/события)                   │
// │  ТЕКСТ:  desc — одна строка, понятная игроку с первого взгляда       │
// └───────────────────────────────────────────────────────────────────────┘
//
//  ── КОГДА (хуки) ──────────────────────────────────────────────────────
//  calcQuality  Q проекта (ежемесячный вклад)   calcSpeed   темп проекта
//  calcPayout   выплата при сдаче               calcUpkeep  ФОТ/мес
//  calcRisk     усиление/гашение риск-событий   onDeliver   в момент сдачи
//  onMonth      каждый месяц                    onHire      при найме
//  onStageUp    смена стадии компании           scoutCandidate/filterOffers — скаут
//  ⚠ проектные хуки (Q/скорость/выплата/риск/onDeliver) работают, только
//    если НОСИТЕЛЬ трейта назначен на этот проект (ось расстановки §13.4)
//
//  ── ЕСЛИ (предикаты; аргумент после двоеточия) ────────────────────────
//  role:'designer'                  grade:'junior|middle|senior|lead|star'
//  projectTier:{min,max}            projectType:'small|corp|store'
//  soloOnProject:true               sameRoleOnProject:{min}   ← коллеги ЕГО роли
//  countRoleOnProject:{role,min}    countGradeOnProject:{grade,min}
//  countRoleInStaff:{role,min}      countGradeInStaff:{grade,min}
//  distinctRolesOnProject:{min}     teamSize:{min,max}        teamMood:{min}
//  monthsOnProject:{min}            overdue:true | onSchedule:true
//  companyStage:{min}               teamHasGrade:'junior'     moduleOpen:'market'
//  traitInStaff:'mentor'            traitFamilyInStaff:{family,min}
//
//  ── ТО (глаголы) ──────────────────────────────────────────────────────
//  числа:   qAdd/qMult · speedAdd/speedMult · payoutAdd/payoutMult
//           upkeepAdd/upkeepMult · riskAdd/riskMult   (Mult: 0.15 = +15%)
//  события: money:N · rep:N · moodAdd:N · fatigueAdd:N
//           statAdd:{stat,v} (перманентный рост стата)
//  цели:    target:'self|team|staff_all|role:<id>|grade:<id>'
//  скейлер: stackPer:{event,ownProject,cap} на трейте + stackOf:'<id>' в do —
//           величина глагола умножается на накопленный счётчик
//
//  ── ПУЛЫ (§13.6): трейт приходит в скаут, когда узел дерева ОТКРЫТ ────
//  A1 Найм        A2 Lifecycle   A3 Портфолио   A4 Древо перков  A5 Саббренды
//  B1 Скаутинг    B2 Переговоры  B3 Живой рынок B4 Доли/акции    B5 M&A
//  C1 Нейросеть   C2 Сезоны      C3 Директор
//
//  ── СЕМЕЙСТВА (теги на экране «Билд команды») ─────────────────────────
//  scaler скейл · conditional услов. · trigger триггер · synergy синерг.
//  economic эконом. · enabler энейблер · drawback цена
//
// ┌──────────────── ШАБЛОН (скопируй и заполни) ──────────────────────────
// │ { id:'', name:'', icon:'', family:'', pool:'', weight:2, rarity:'common',
// │   hooks:{ ХУК:[ { when:[ {ПРЕДИКАТ:АРГ} ], do:[ {ГЛАГОЛ:ЧИСЛО} ] } ] },
// │   desc:'Что делает — одной строкой.' },
// └───────────────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════

/* eslint-disable no-unused-vars */
var STAFF_TRAITS = [

  // ════ СКЕЙЛЕРЫ (§13.2.1) — копят силу за ран, snowball ═══════════════

  // 💎 [копит: свои сдачи, до 10] → +1 Q за каждую
  { id:'perfectionist', name:'Перфекционист', icon:'💎', family:'scaler', pool:'A3',
    weight:3, rarity:'common',
    stackPer:{ event:'project_delivered', ownProject:true, cap:10 },
    hooks:{ calcQuality:[ { when:[], do:[ { qAdd:1, stackOf:'perfectionist' } ] } ] },
    desc:'+1 Q проекта за каждую свою сдачу в этом ране (до +10).' },

  // 🗃 [копит: свои сдачи, до 10] → +4К к выплате за каждую
  { id:'collector', name:'Коллекционер', icon:'🗃', family:'scaler', pool:'A3',
    weight:2, rarity:'uncommon',
    stackPer:{ event:'project_delivered', ownProject:true, cap:10 },
    hooks:{ calcPayout:[ { when:[], do:[ { payoutAdd:4000, stackOf:'collector' } ] } ] },
    desc:'Каждая его сдача добавляет +4К к выплатам всех следующих проектов (до +40К).' },

  // 🎖 [копит: прожитые месяцы, до 20] → +0.15 Q за каждый
  { id:'veteran', name:'Ветеран', icon:'🎖', family:'scaler', pool:'A4',
    weight:2, rarity:'uncommon',
    stackPer:{ event:'month_advanced', cap:20 },
    hooks:{ calcQuality:[ { when:[], do:[ { qAdd:0.15, stackOf:'veteran' } ] } ] },
    desc:'Матереет со временем: +0.15 Q за каждый месяц в ране (до +3).' },

  // ════ УСЛОВНЫЕ (§13.2.2) — подбирай проект/момент под трейт ══════════

  // 🎯 [если проект T3+] → ×1.5 вклад качества
  { id:'niche_expert', name:'Нишевый', icon:'🎯', family:'conditional', pool:'A1',
    weight:3, rarity:'common',
    hooks:{ calcQuality:[ { when:[ { projectTier:{ min:3 } } ], do:[ { qMult:0.5 } ] } ] },
    desc:'×1.5 к вкладу качества на проектах T3+.' },

  // 🐺 [если один на проекте] → +40% скорость
  { id:'loner', name:'Одиночка', icon:'🐺', family:'conditional', pool:'A1',
    weight:2, rarity:'common',
    hooks:{ calcSpeed:[ { when:[ { soloOnProject:true } ], do:[ { speedMult:0.4 } ] } ] },
    desc:'+40% скорость проекта, если работает на нём один.' },

  // 🏃 [если проект идёт 4+ мес] → +20% скорость
  { id:'marathoner', name:'Марафонец', icon:'🏃', family:'conditional', pool:'A2',
    weight:2, rarity:'common',
    hooks:{ calcSpeed:[ { when:[ { monthsOnProject:{ min:4 } } ], do:[ { speedMult:0.2 } ] } ] },
    desc:'+20% скорость на проектах длиннее 3 месяцев (раскачивается).' },

  // 🔥 [если просрочка] → +25% скорость, но команда устаёт
  { id:'cruncher', name:'Кранчер', icon:'🔥', family:'conditional', pool:'A2',
    weight:2, rarity:'uncommon',
    hooks:{ calcSpeed:[ { when:[ { overdue:true } ], do:[ { speedMult:0.25 } ] } ],
            onMonth:  [ { when:[], do:[ { fatigueAdd:1 } ] } ] },
    desc:'+25% скорость на просроченных проектах, но команда устаёт быстрее.' },

  // ⏱ [если проект В срок] → +8% выплата
  { id:'deadliner', name:'Дедлайнер', icon:'⏱', family:'conditional', pool:'B2',
    weight:2, rarity:'common',
    hooks:{ calcPayout:[ { when:[ { onSchedule:true } ], do:[ { payoutMult:0.08 } ] } ] },
    desc:'+8% выплата, если проект сдаётся без просрочки (ставка на дисциплину).' },

  // 🏦 [если проект-корпорат] → +12% выплата
  { id:'corp_wolf', name:'Корпорат-волк', icon:'🏦', family:'conditional', pool:'B3',
    weight:2, rarity:'uncommon',
    hooks:{ calcPayout:[ { when:[ { projectType:'corp' } ], do:[ { payoutMult:0.12 } ] } ] },
    desc:'Знает язык корпораций: +12% выплата на корпоративных проектах.' },

  // 🐣 [если проект T1] → +35% скорость
  { id:'underdog', name:'Мастер мелочей', icon:'🐣', family:'conditional', pool:'B1',
    weight:2, rarity:'common',
    hooks:{ calcSpeed:[ { when:[ { projectTier:{ max:1 } } ], do:[ { speedMult:0.35 } ] } ] },
    desc:'+35% скорость на мелких проектах T1 (анти-Нишевый: любит конвейер).' },

  // 🧘 [если мораль штата 75+] → +2 Q
  { id:'stoic', name:'Стоик', icon:'🧘', family:'conditional', pool:'C2',
    weight:2, rarity:'uncommon',
    hooks:{ calcQuality:[ { when:[ { teamMood:{ min:75 } } ], do:[ { qAdd:2 } ] } ] },
    desc:'+2 Q его проектам, пока средняя мораль штата 75+ (нужна атмосфера).' },

  // ════ ТРИГГЕРЫ (§13.2.3) — разовый импульс on-event ══════════════════

  // 🎓 [при сдаче, если в команде джун] → джуны навсегда +1 качеству
  { id:'mentor', name:'Ментор', icon:'🎓', family:'trigger', pool:'A2',
    weight:2, rarity:'uncommon',
    hooks:{ onDeliver:[ { when:[ { teamHasGrade:'junior' } ],
                          do:[ { statAdd:{ stat:'qStat', v:1 }, target:'grade:junior' } ] } ] },
    desc:'При сдаче — все джуны команды навсегда +1 к качеству.' },

  // 🏁 [при сдаче T3+] → +40К в кассу
  { id:'finisher', name:'Финишер', icon:'🏁', family:'trigger', pool:'B2',
    weight:2, rarity:'uncommon',
    hooks:{ onDeliver:[ { when:[ { projectTier:{ min:3 } } ], do:[ { money:40000 } ] } ] },
    desc:'При сдаче T3+ — разовый бонус 40 000 в кассу.' },

  // 🌧 [при каждой его сдаче] → +1 репутация
  { id:'rainmaker', name:'Рейнмейкер', icon:'🌧', family:'trigger', pool:'B3',
    weight:2, rarity:'uncommon',
    hooks:{ onDeliver:[ { when:[], do:[ { rep:1 } ] } ] },
    desc:'Каждая его сдача — +1 к репутации агентства (имя на рынке).' },

  // ════ СИНЕРГО-ТРЕЙТЫ (§13.2.4) — масштаб от ДРУГИХ ═══════════════════

  // 🧭 [если рядом 2+ разработчика] → +3 Q
  { id:'teamlead', name:'Тимлид', icon:'🧭', family:'synergy', pool:'A1',
    weight:2, rarity:'uncommon',
    hooks:{ calcQuality:[ { when:[ { countRoleOnProject:{ role:'developer', min:2 } } ],
                            do:[ { qAdd:3 } ] } ] },
    desc:'+3 Q проекта, если рядом на проекте 2+ разработчика.' },

  // 🎼 [если на проекте 3+ разные роли] → +15% скорость
  { id:'conductor', name:'Дирижёр', icon:'🎼', family:'synergy', pool:'A5',
    weight:1, rarity:'rare',
    hooks:{ calcSpeed:[ { when:[ { distinctRolesOnProject:{ min:3 } } ], do:[ { speedMult:0.15 } ] } ] },
    desc:'+15% скорость, если на проекте 3+ разные роли (награда за диверсити).' },

  // 🪞 [если рядом 2+ коллеги ЕГО роли] → +20% скорость (анти-Дирижёр)
  { id:'clone_master', name:'Клон-мастер', icon:'🪞', family:'synergy', pool:'A5',
    weight:1, rarity:'rare',
    hooks:{ calcSpeed:[ { when:[ { sameRoleOnProject:{ min:2 } } ], do:[ { speedMult:0.2 } ] } ] },
    desc:'+20% скорость в моно-стеке: рядом 2+ коллеги его же роли (противоположность Дирижёру).' },

  // ════ ЭКОНОМИЧЕСКИЕ (§13.2.5) — меняют «сколько заработал/потратил» ═══

  // 💼 [на T2+] → +12% выплата, но риск-события бьют сильнее
  { id:'upseller', name:'Апсейлер', icon:'💼', family:'economic', pool:'B2',
    weight:2, rarity:'uncommon',
    hooks:{ calcPayout:[ { when:[ { projectTier:{ min:2 } } ], do:[ { payoutMult:0.12 } ] } ],
            calcRisk:  [ { when:[], do:[ { riskMult:0.3 } ] } ] },
    desc:'+12% выплата на T2+, но риск-события бьют его проекты на 30% сильнее.' },

  // 🦈 [каждый его проект] → +15К к выплате (жёсткая переговорка)
  { id:'shark', name:'Акула', icon:'🦈', family:'economic', pool:'B4',
    weight:2, rarity:'uncommon',
    hooks:{ calcPayout:[ { when:[], do:[ { payoutAdd:15000 } ] } ] },
    desc:'Дожимает условия: +15К к выплате любого своего проекта.' },

  // 🌿 [если мораль штата 80+] → −10% ФОТ
  { id:'frugal', name:'Бережливый', icon:'🌿', family:'economic', pool:'A3',
    weight:2, rarity:'uncommon',
    hooks:{ calcUpkeep:[ { when:[ { teamMood:{ min:80 } } ], do:[ { upkeepMult:-0.10 } ] } ] },
    desc:'−10% ФОТ всей студии, пока мораль 80+ (люди работают не за деньги).' },

  // 🏷 [всегда] → +25% скорость, но −8% выплата (конвейер со скидкой)
  { id:'discounter', name:'Дискаунтер', icon:'🏷', family:'economic', pool:'B1',
    weight:2, rarity:'common',
    hooks:{ calcSpeed: [ { when:[], do:[ { speedMult:0.25 } ] } ],
            calcPayout:[ { when:[], do:[ { payoutMult:-0.08 } ] } ] },
    desc:'Гонит объём: +25% скорость его проектов, но −8% выплата (маржа тает).' },

  // ════ ЭНЕЙБЛЕРЫ / МОРАЛЬ (§13.2.6) — снимают лимиты ══════════════════

  // 🤗 [каждый месяц] → +2 морали всем
  { id:'hr_soul', name:'HR-душа', icon:'🤗', family:'enabler', pool:'A5',
    weight:2, rarity:'uncommon',
    hooks:{ onMonth:[ { when:[], do:[ { moodAdd:2, target:'staff_all' } ] } ] },
    desc:'+2 морали всей команде каждый месяц (снимает потолок размера штата).' },

  // 🤖 [каждый месяц] → −2 усталости команды
  { id:'automator', name:'Автоматизатор', icon:'🤖', family:'enabler', pool:'C1',
    weight:2, rarity:'uncommon',
    hooks:{ onMonth:[ { when:[], do:[ { fatigueAdd:-2 } ] } ] },
    desc:'Скрипты и пайплайны: −2 усталости команды каждый месяц.' },

  // 🛡 [риск-события его проектов] → бьют на 25% слабее
  { id:'insurer', name:'Страховщик', icon:'🛡', family:'enabler', pool:'C3',
    weight:1, rarity:'rare',
    hooks:{ calcRisk:[ { when:[], do:[ { riskMult:-0.25 } ] } ] },
    desc:'Риск-события бьют его проекты на 25% слабее (превращает хаос в план).' },

  // ════ DRAWBACKS (§13.2.9) — сильные, но с ценой ══════════════════════

  // 👑 [+5 Q его проектам] ↔ [−1 мораль всем каждый месяц]
  { id:'star_ego', name:'Звезда', icon:'👑', family:'drawback', pool:'B3',
    weight:1, rarity:'rare',
    hooks:{ calcQuality:[ { when:[], do:[ { qAdd:5 } ] } ],
            onMonth:    [ { when:[], do:[ { moodAdd:-1, target:'staff_all' } ] } ] },
    desc:'+5 Q любому своему проекту, но −1 морали всем каждый месяц (эго).' },

  // ⚡ [+30% скорость] ↔ [+2 усталости каждый месяц]
  { id:'burnout', name:'Выгораемый', icon:'⚡', family:'drawback', pool:'C3',
    weight:1, rarity:'rare',
    hooks:{ calcSpeed:[ { when:[], do:[ { speedMult:0.3 } ] } ],
            onMonth:  [ { when:[], do:[ { fatigueAdd:2 } ] } ] },
    desc:'+30% скорость его проектов, но выжигает команду: +2 усталости/мес.' },

  // 🥇 [+6 Q его проектам] ↔ [+25К к ФОТ]
  { id:'expensive_genius', name:'Дорогой гений', icon:'🥇', family:'drawback', pool:'B5',
    weight:1, rarity:'rare',
    hooks:{ calcQuality:[ { when:[], do:[ { qAdd:6 } ] } ],
            calcUpkeep: [ { when:[], do:[ { upkeepAdd:25000 } ] } ] },
    desc:'+6 Q любому своему проекту, но контракт +25К/мес к ФОТ.' },

  // ── НОВЫЕ ДЖОКЕРЫ: энейблеры под напряжения/синергии/разгон (§13.4) ───
  // 🕊 [2+ «Звезды» на проекте] → гасит эго-войну: +5 Q, +10% скорость
  { id:'diplomat', name:'Дипломат', icon:'🕊', family:'enabler', pool:'A1',
    weight:1, rarity:'rare',
    hooks:{ calcQuality:[ { when:[ { countTraitOnProject:{ trait:'star_ego', min:2 } } ], do:[ { qAdd:5 } ] } ],
            calcSpeed:  [ { when:[ { countTraitOnProject:{ trait:'star_ego', min:2 } } ], do:[ { speedMult:0.10 } ] } ] },
    desc:'Разруливает эго: при 2+ «Звёздах» на проекте гасит их войну — +5 Q и +10% скорость. Делает стак звёзд играбельным.' },

  // 🧑‍🏫 [2+ junior на проекте] → присматривает: +3 Q (лечит «Джунов без присмотра»)
  { id:'player_coach', name:'Играющий тренер', icon:'🧑‍🏫', family:'synergy', pool:'A2',
    weight:2, rarity:'uncommon',
    hooks:{ calcQuality:[ { when:[ { countGradeOnProject:{ grade:'junior', min:2 } } ], do:[ { qAdd:3 } ] } ] },
    desc:'2+ джуна на его проекте → +3 Q: подхватывает молодых прямо в бою (гасит штраф «без присмотра»).' },

  // 🧰 [3+ разные роли на проекте] → +20% скорость (любит разносторонние команды)
  { id:'generalist', name:'Генералист', icon:'🧰', family:'synergy', pool:'A5',
    weight:2, rarity:'uncommon',
    hooks:{ calcSpeed:[ { when:[ { distinctRolesOnProject:{ min:3 } } ], do:[ { speedMult:0.20 } ] } ] },
    desc:'3+ разные роли на проекте → +20% скорость: сшивает разношёрстную команду.' },

  // 🎯 [3+ одной роли на проекте] → +4 Q (глубина профиля лечит «Монокультуру»)
  { id:'role_fanatic', name:'Фанатик роли', icon:'🎯', family:'conditional', pool:'B1',
    weight:2, rarity:'uncommon',
    hooks:{ calcQuality:[ { when:[ { roleStackOnProject:{ min:3 } } ], do:[ { qAdd:4 } ] } ] },
    desc:'3+ спеца одной роли на проекте → +4 Q: гонит глубину, компенсируя «Монокультуру». Моно-стек становится жизнеспособным.' },

  // 🧠 быстро адаптируется — разгон после перевода вдвое короче (движковый эффект)
  { id:'quick_study', name:'Квик-стади', icon:'🧠', family:'enabler', pool:'A4',
    weight:2, rarity:'uncommon',
    hooks:{},
    desc:'Схватывает на лету: после перевода на проект разгон вдвое короче (стартует с ×0.75, полная сила уже через месяц). Снижает цену переключения.' },

  // 🚨 [проект просрочен] → +30% скорость (личный антикризис, любая роль)
  { id:'crisis_manager', name:'Кризис-менеджер', icon:'🚨', family:'conditional', pool:'C3',
    weight:2, rarity:'uncommon',
    hooks:{ calcSpeed:[ { when:[ { overdue:true } ], do:[ { speedMult:0.30 } ] } ] },
    desc:'На просроченном проекте → +30% скорость: включается на пожаре в одиночку.' },

  // 🦉 [работает ОДИН на проекте] → +6 Q (гений-одиночка)
  { id:'introvert_genius', name:'Интроверт-гений', icon:'🦉', family:'conditional', pool:'A3',
    weight:1, rarity:'rare',
    hooks:{ calcQuality:[ { when:[ { projectTeamSize:{ max:1 } } ], do:[ { qAdd:6 } ] } ] },
    desc:'Один на проекте → +6 Q: в тишине выдаёт шедевр. (На сложном T3+ частично гасит «Одиночку на сложном».)' },

  // 🤗 [каждый месяц] → +1 морали всем (держит большие/звёздные команды)
  { id:'team_builder', name:'Тимбилдер', icon:'🤗', family:'enabler', pool:'C2',
    weight:1, rarity:'uncommon',
    hooks:{ onMonth:[ { when:[], do:[ { moodAdd:1, target:'staff_all' } ] } ] },
    desc:'+1 морали всей команде каждый месяц: гасит эго-просадку «Звезды» и держит крупные команды.' },
];

// ┌─────────────────────── ФОРМУЛА СИНЕРГИИ ──────────────────────────────┐
// │  КТО:    id · name · icon · scope ('staff' = весь штат,              │
// │          'project' = состав на ОДНОМ проекте — ось расстановки Ф.4)  │
// │  ЕСЛИ:   when — условия на СОСТАВ (все AND)                          │
// │  ТО:     do — глаголы; хук берётся из глагола автоматически          │
// │          (событийным можно указать on:'onMonth' и target)            │
// │  ТЕКСТ:  desc — «условие → эффект» одной строкой                     │
// └───────────────────────────────────────────────────────────────────────┘

var TEAM_SYNERGIES = [

  // ── Роле-стек «цех» (§13.3, scope: штат) ─────────────────────────────

  // 🎨 [3+ дизайнера в штате] → +4 Q всем проектам
  { id:'design_boutique', name:'Дизайн-бутик', icon:'🎨', scope:'staff',
    when:[ { countRoleInStaff:{ role:'designer', min:3 } } ],
    do:[ { qAdd:4 } ],
    desc:'3+ дизайнера в штате → +4 Q всем проектам.' },

  // 💻 [3+ разработчика в штате] → +10% скорость всех проектов
  { id:'tech_shop', name:'Тех-шоп', icon:'💻', scope:'staff',
    when:[ { countRoleInStaff:{ role:'developer', min:3 } } ],
    do:[ { speedMult:0.10 } ],
    desc:'3+ разработчика в штате → +10% скорость всех проектов.' },

  // 📡 [3+ SMM в штате] → +10К/мес входящего потока
  { id:'media_machine', name:'Медиа-машина', icon:'📡', scope:'staff',
    when:[ { countRoleInStaff:{ role:'smm', min:3 } } ],
    do:[ { money:10000, on:'onMonth' } ],
    desc:'3+ SMM в штате → медийный поток приносит +10К каждый месяц.' },

  // ── Грейд-архетипы (§13.3) ───────────────────────────────────────────

  // 🏛 [пирамида 1 sr / 2+ md / 3+ jr] → −5% ФОТ и +1 мораль/мес
  { id:'healthy_studio', name:'Здоровая студия', icon:'🏛', scope:'staff',
    when:[ { countGradeInStaff:{ grade:'senior', min:1 } },
           { countGradeInStaff:{ grade:'middle', min:2 } },
           { countGradeInStaff:{ grade:'junior', min:3 } } ],
    do:[ { upkeepMult:-0.05 },
         { moodAdd:1, on:'onMonth', target:'staff_all' } ],
    desc:'Пирамида 1 sr / 2+ md / 3+ jr → −5% ФОТ и +1 мораль/мес.' },

  // 🌱 [3+ джуна + Ментор в штате] → +3 Q всем (менторский конвейер)
  { id:'jun_rush', name:'Джун-раш', icon:'🌱', scope:'staff',
    when:[ { countGradeInStaff:{ grade:'junior', min:3 } },
           { traitInStaff:'mentor' } ],
    do:[ { qAdd:3 }, { upkeepMult:-0.05 } ],
    desc:'3+ джуна под крылом Ментора → +3 Q всем проектам и −5% ФОТ (дёшево и растёт).' },

  // 🕰 [3+ senior и штат ≤5] → +12% выплата (мало и премиум)
  { id:'boutique', name:'Бутик', icon:'🕰', scope:'staff',
    when:[ { countGradeInStaff:{ grade:'senior', min:3 } },
           { teamSize:{ max:5 } } ],
    do:[ { payoutMult:0.12 } ],
    desc:'3+ senior в компактном штате (≤5) → +12% выплата: редкие дорогие сдачи.' },

  // ── Трейт-семейные (§13.3) ───────────────────────────────────────────

  // ❄️ [3+ носителя скейлер-трейтов] → +2 Q всем (снежный ком)
  { id:'snowball', name:'Снежный ком', icon:'❄️', scope:'staff',
    when:[ { traitFamilyInStaff:{ family:'scaler', min:3 } } ],
    do:[ { qAdd:2 } ],
    desc:'3+ скейлера в штате → +2 Q всем: слаб на старте, имба к концу рана.' },

  // ── Роле-комбо (§13.3) ───────────────────────────────────────────────

  // ⚖️ [дизайнер+разработчик+копирайтер+юрист в штате] → +8% выплата на T4+
  { id:'enterprise_ready', name:'Энтерпрайз-готовность', icon:'⚖️', scope:'staff',
    when:[ { countRoleInStaff:{ role:'designer',   min:1 } },
           { countRoleInStaff:{ role:'developer',  min:1 } },
           { countRoleInStaff:{ role:'copywriter', min:1 } },
           { countRoleInStaff:{ role:'lawyer',     min:1 } } ],
    do:[ { payoutMult:0.08, when:[ { projectTier:{ min:4 } } ] } ],
    desc:'Полное покрытие + юрист → +8% выплата на крупных тендерах T4+.' },

  // ── Проект-локальные (§13.4, scope: проект — решает РАССТАНОВКА) ─────

  // 🚀 [дизайнер+разработчик+копирайтер на ОДНОМ проекте] → +10% выплата на T3+
  { id:'product_team', name:'Продуктовая команда', icon:'🚀', scope:'project',
    when:[ { countRoleOnProject:{ role:'designer',   min:1 } },
           { countRoleOnProject:{ role:'developer',  min:1 } },
           { countRoleOnProject:{ role:'copywriter', min:1 } } ],
    do:[ { payoutMult:0.10, when:[ { projectTier:{ min:3 } } ] } ],
    desc:'Дизайнер+разработчик+копирайтер на одном проекте → +10% выплата на T3+.' },

  // 🔍 [2+ senior на ОДНОМ проекте] → +3 Q (ревьюят друг друга)
  { id:'pair_review', name:'Парное ревью', icon:'🔍', scope:'project',
    when:[ { countGradeOnProject:{ grade:'senior', min:2 } } ],
    do:[ { qAdd:3 } ],
    desc:'2+ senior на одном проекте → +3 Q (ревьюят друг друга).' },

  // 🚒 [просрочка + менеджер на проекте] → +20% скорость (спасение горящего)
  { id:'fire_brigade', name:'Пожарная команда', icon:'🚒', scope:'project',
    when:[ { overdue:true },
           { countRoleOnProject:{ role:'manager', min:1 } } ],
    do:[ { speedMult:0.20 } ],
    desc:'Менеджер на просроченном проекте → +20% скорость: антикризисный режим.' },

  // ── НОВЫЕ ПРОЕКТНЫЕ СИНЕРГИИ (позитив, решает расстановка) ───────────
  // ⚖️ [3+ разные роли на проекте] → +12% скорость, +2 Q (сбалансированная команда)
  { id:'balanced_trio', name:'Сбалансированное трио', icon:'⚖️', scope:'project',
    when:[ { distinctRolesOnProject:{ min:3 } } ],
    do:[ { speedMult:0.12 }, { qAdd:2 } ],
    desc:'3+ разные роли на проекте → +12% скорость и +2 Q: разносторонний взгляд.' },

  // 🎓 [senior + junior на проекте] → +2 Q (наставничество прямо в бою)
  { id:'mentor_pair', name:'Менторская связка', icon:'🎓', scope:'project',
    when:[ { countGradeOnProject:{ grade:'senior', min:1 } },
           { countGradeOnProject:{ grade:'junior', min:1 } } ],
    do:[ { qAdd:2 } ],
    desc:'Senior + junior на одном проекте → +2 Q: наставничество в бою.' },

  // 🧩 [дизайнер+разработчик+smm на проекте] → +12% выплата T2+, +2 Q
  { id:'cross_pod', name:'Кросс-функциональный под', icon:'🧩', scope:'project',
    when:[ { countRoleOnProject:{ role:'designer',  min:1 } },
           { countRoleOnProject:{ role:'developer', min:1 } },
           { countRoleOnProject:{ role:'smm',       min:1 } } ],
    do:[ { payoutMult:0.12, when:[ { projectTier:{ min:2 } } ] }, { qAdd:2 } ],
    desc:'Дизайнер+разработчик+SMM на проекте → +12% выплата (T2+) и +2 Q.' },

  // 🎯 [3+ одной роли на проекте] → +15% скорость (профильный десант)
  { id:'specialist_strike', name:'Спец-страйк', icon:'🎯', scope:'project',
    when:[ { roleStackOnProject:{ min:3 } } ],
    do:[ { speedMult:0.15 } ],
    desc:'3+ спеца одной роли на проекте → +15% скорость: узкий профиль давит массой.' },

  // ── НАПРЯЖЕНИЯ / АНТИ-СИНЕРГИИ (штраф за плохой состав; kind:'tension') ─
  // 👑👑 [2+ «Звезда» на проекте] → эго-война: −5 Q, −10% скорость
  { id:'ego_clash', name:'Битва эго', icon:'⚔️', scope:'project', kind:'tension',
    when:[ { countTraitOnProject:{ trait:'star_ego', min:2 } } ],
    do:[ { qAdd:-5 }, { speedMult:-0.10 } ],
    desc:'2+ «Звезды» на одном проекте → эго-война: −5 Q и −10% скорость.' },

  // 🍲 [3+ senior на проекте] → «слишком много поваров»: −15% скорость (споры)
  { id:'too_many_cooks', name:'Слишком много поваров', icon:'🍲', scope:'project', kind:'tension',
    when:[ { countGradeOnProject:{ grade:'senior', min:3 } } ],
    do:[ { speedMult:-0.15 } ],
    desc:'3+ senior на одном проекте → бесконечные споры: −15% скорость (2 — ещё ревью, 3 — уже базар).' },

  // 🧱 [моно-роль 3+ на сложном T3+] → однобокость: −4 Q (нет второго взгляда)
  { id:'monoculture', name:'Монокультура', icon:'🧱', scope:'project', kind:'tension',
    when:[ { roleStackOnProject:{ min:3 } },
           { distinctRolesOnProject:{ max:1 } },
           { projectTier:{ min:3 } } ],
    do:[ { qAdd:-4 } ],
    desc:'Только одна роль (3+) на сложном T3+ проекте → однобоко: −4 Q. (Скорость от Спец-страйка остаётся — быстро, но криво.)' },

  // 🐣 [3+ junior и НИ одного senior на проекте] → без присмотра: −4 Q
  { id:'unsupervised_juniors', name:'Джуны без присмотра', icon:'🐣', scope:'project', kind:'tension',
    when:[ { countGradeOnProject:{ grade:'junior', min:3 } },
           { countGradeOnProject:{ grade:'senior', max:0 } } ],
    do:[ { qAdd:-4 } ],
    desc:'3+ джуна и ни одного senior на проекте → некому проверить: −4 Q.' },

  // 🥇🥇 [2+ «Дорогой гений» на проекте] → раздутый ФОТ: +30К upkeep
  { id:'costly_bench', name:'Дорогая скамейка', icon:'💸', scope:'project', kind:'tension',
    when:[ { countTraitOnProject:{ trait:'expensive_genius', min:2 } } ],
    do:[ { upkeepAdd:30000 } ],
    desc:'2+ «Дорогих гения» на одном проекте → раздутый ФОТ: +30К upkeep.' },

  // 🥵 [1 человек на сложном T3+] → перегруз-одиночка: −3 Q, +25% риск
  { id:'solo_on_complex', name:'Одиночка на сложном', icon:'🥵', scope:'project', kind:'tension',
    when:[ { projectTeamSize:{ max:1 } },
           { projectTier:{ min:3 } } ],
    do:[ { qAdd:-3 }, { riskMult:0.25 } ],
    desc:'Один человек на сложном T3+ проекте → не вывозит: −3 Q и +25% риск.' },
];

// Автозагрузка в движок (если TraitEngine уже поднят; иначе он сам подберёт)
try {
  if (typeof window !== 'undefined') {
    window.STAFF_TRAITS   = STAFF_TRAITS;
    window.TEAM_SYNERGIES = TEAM_SYNERGIES;
    if (window.TraitEngine) window.TraitEngine.load(STAFF_TRAITS, TEAM_SYNERGIES);
  }
} catch (e) {}
