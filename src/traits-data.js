// ══════════════════════════════════════════════════════
//  Ф.7 — Стартовый каталог трейтов/синергий (§13 → данные, §14.5/§14.6)
//
//  Слой 1 из трёх (§14.1): ЧИСТЫЕ ДАННЫЕ, без DOM/логики/замыканий
//  (Godot-portable). Исполняет src/traits.js (TraitEngine).
//
//  Добавить новый трейт/синергию = дописать объект сюда (§14.7).
//  pool — узел «Дерева открытий», при котором трейт попадает в скаут-пул
//  (§13.6; привязка к скауту — шаг 5, до этого поле информационное).
//  Все числа — заглушки под плейтест (§15.6).
//
//  12 трейтов (по категориям §13.2) + 5 синергий (§13.3/§13.4).
// ══════════════════════════════════════════════════════

/* eslint-disable no-unused-vars */
var STAFF_TRAITS = [

  // ── Скейлеры (§13.2.1) — snowball за ран ─────────────────────────────
  { id:'perfectionist', name:'Перфекционист', icon:'💎', family:'scaler', pool:'A3',
    weight:3, rarity:'common',
    stackPer:{ event:'project_delivered', ownProject:true, cap:10 },
    hooks:{ calcQuality:[ { when:[], do:[ { qAdd:1, stackOf:'perfectionist' } ] } ] },
    desc:'+1 Q проекта за каждую свою сдачу в этом ране (до +10).' },

  // ── Условные множители (§13.2.2) — подбирай проект под трейт ────────
  { id:'niche_expert', name:'Нишевый', icon:'🎯', family:'conditional', pool:'A1',
    weight:3, rarity:'common',
    hooks:{ calcQuality:[ { when:[ { projectTier:{ min:3 } } ], do:[ { qMult:0.5 } ] } ] },
    desc:'×1.5 к вкладу качества на проектах T3+.' },

  { id:'loner', name:'Одиночка', icon:'🐺', family:'conditional', pool:'A1',
    weight:2, rarity:'common',
    hooks:{ calcSpeed:[ { when:[ { soloOnProject:true } ], do:[ { speedMult:0.4 } ] } ] },
    desc:'+40% скорость проекта, если работает на нём один.' },

  { id:'marathoner', name:'Марафонец', icon:'🏃', family:'conditional', pool:'A2',
    weight:2, rarity:'common',
    hooks:{ calcSpeed:[ { when:[ { monthsOnProject:{ min:4 } } ], do:[ { speedMult:0.2 } ] } ] },
    desc:'+20% скорость на проектах длиннее 3 месяцев (раскачивается).' },

  { id:'cruncher', name:'Кранчер', icon:'🔥', family:'conditional', pool:'A2',
    weight:2, rarity:'uncommon',
    hooks:{ calcSpeed:[ { when:[ { overdue:true } ], do:[ { speedMult:0.25 } ] } ],
            onMonth:  [ { when:[], do:[ { fatigueAdd:1 } ] } ] },
    desc:'+25% скорость на просроченных проектах, но команда устаёт быстрее.' },

  // ── Триггеры (§13.2.3) — разовый импульс on-event ────────────────────
  { id:'mentor', name:'Ментор', icon:'🎓', family:'trigger', pool:'A2',
    weight:2, rarity:'uncommon',
    hooks:{ onDeliver:[ { when:[ { teamHasGrade:'junior' } ],
                          do:[ { statAdd:{ stat:'qStat', v:1 }, target:'grade:junior' } ] } ] },
    desc:'При сдаче — все джуны команды навсегда +1 к качеству.' },

  { id:'finisher', name:'Финишер', icon:'🏁', family:'trigger', pool:'B2',
    weight:2, rarity:'uncommon',
    hooks:{ onDeliver:[ { when:[ { projectTier:{ min:3 } } ], do:[ { money:40000 } ] } ] },
    desc:'При сдаче T3+ — разовый бонус 40 000 в кассу.' },

  // ── Синерго-трейты (§13.2.4) — масштаб от ДРУГИХ ─────────────────────
  { id:'teamlead', name:'Тимлид', icon:'🧭', family:'synergy', pool:'A1',
    weight:2, rarity:'uncommon',
    hooks:{ calcQuality:[ { when:[ { countRoleOnProject:{ role:'developer', min:2 } } ],
                            do:[ { qAdd:3 } ] } ] },
    desc:'+3 Q проекта, если рядом на проекте 2+ разработчика.' },

  { id:'conductor', name:'Дирижёр', icon:'🎼', family:'synergy', pool:'A5',
    weight:1, rarity:'rare',
    hooks:{ calcSpeed:[ { when:[ { distinctRolesOnProject:{ min:3 } } ], do:[ { speedMult:0.15 } ] } ] },
    desc:'+15% скорость, если на проекте 3+ разные роли (награда за диверсити).' },

  // ── Экономические (§13.2.5) ──────────────────────────────────────────
  { id:'upseller', name:'Апсейлер', icon:'💼', family:'economic', pool:'B2',
    weight:2, rarity:'uncommon',
    hooks:{ calcPayout:[ { when:[ { projectTier:{ min:2 } } ], do:[ { payoutMult:0.12 } ] } ],
            calcRisk:  [ { when:[], do:[ { riskMult:0.3 } ] } ] },
    desc:'+12% выплата на T2+, но риск-события бьют его проекты на 30% сильнее.' },

  // ── Мораль-движки / энейблеры (§13.2.6) ──────────────────────────────
  { id:'hr_soul', name:'HR-душа', icon:'🤗', family:'enabler', pool:'A5',
    weight:2, rarity:'uncommon',
    hooks:{ onMonth:[ { when:[], do:[ { moodAdd:2, target:'staff_all' } ] } ] },
    desc:'+2 морали всей команде каждый месяц (снимает потолок размера штата).' },

  // ── Drawbacks (§13.2.9) — сильные, но с ценой ────────────────────────
  { id:'star_ego', name:'Звезда', icon:'👑', family:'drawback', pool:'B3',
    weight:1, rarity:'rare',
    hooks:{ calcQuality:[ { when:[], do:[ { qAdd:5 } ] } ],
            onMonth:    [ { when:[], do:[ { moodAdd:-1, target:'staff_all' } ] } ] },
    desc:'+5 Q любому своему проекту, но −1 морали всем каждый месяц (эго).' },
];

var TEAM_SYNERGIES = [

  // ── Роле-стек «цех» (§13.3, scope: штат) ─────────────────────────────
  { id:'design_boutique', name:'Дизайн-бутик', icon:'🎨', scope:'staff',
    when:[ { countRoleInStaff:{ role:'designer', min:3 } } ],
    do:[ { qAdd:4 } ],
    desc:'3+ дизайнера в штате → +4 Q всем проектам.' },

  { id:'tech_shop', name:'Тех-шоп', icon:'💻', scope:'staff',
    when:[ { countRoleInStaff:{ role:'developer', min:3 } } ],
    do:[ { speedMult:0.10 } ],
    desc:'3+ разработчика в штате → +10% скорость всех проектов.' },

  // ── Грейд-архетип «пирамида» (§13.3) ─────────────────────────────────
  { id:'healthy_studio', name:'Здоровая студия', icon:'🏛', scope:'staff',
    when:[ { countGradeInStaff:{ grade:'senior', min:1 } },
           { countGradeInStaff:{ grade:'middle', min:2 } },
           { countGradeInStaff:{ grade:'junior', min:3 } } ],
    do:[ { upkeepMult:-0.05 },
         { moodAdd:1, on:'onMonth', target:'staff_all' } ],
    desc:'Пирамида 1 sr / 2+ md / 3+ jr → −5% ФОТ и +1 мораль/мес.' },

  // ── Роле-комбо (§13.3, scope: проект — ось расстановки §13.4) ────────
  { id:'product_team', name:'Продуктовая команда', icon:'🚀', scope:'project',
    when:[ { countRoleOnProject:{ role:'designer',   min:1 } },
           { countRoleOnProject:{ role:'developer',  min:1 } },
           { countRoleOnProject:{ role:'copywriter', min:1 } } ],
    do:[ { payoutMult:0.10, when:[ { projectTier:{ min:3 } } ] } ],
    desc:'Дизайнер+разработчик+копирайтер на одном проекте → +10% выплата на T3+.' },

  { id:'pair_review', name:'Парное ревью', icon:'🔍', scope:'project',
    when:[ { countGradeOnProject:{ grade:'senior', min:2 } } ],
    do:[ { qAdd:3 } ],
    desc:'2+ senior на одном проекте → +3 Q (ревьюят друг друга).' },
];

// Автозагрузка в движок (если TraitEngine уже поднят; иначе он сам подберёт)
try {
  if (typeof window !== 'undefined') {
    window.STAFF_TRAITS   = STAFF_TRAITS;
    window.TEAM_SYNERGIES = TEAM_SYNERGIES;
    if (window.TraitEngine) window.TraitEngine.load(STAFF_TRAITS, TEAM_SYNERGIES);
  }
} catch (e) {}
