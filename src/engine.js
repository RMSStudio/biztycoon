// ══════════════════════════════════════════════════════
//  ENGINE — стейт, хелперы, игровая логика
//  Зависит от: constants.js, scenarios/{id}.js
// ══════════════════════════════════════════════════════

// ── Scenario bindings ─────────────────────────────────
// SCENARIO объявляется в scenarios/{id}.js и загружается до engine.js.
// Алиасы дают обратную совместимость: весь код внутри engine.js
// продолжает использовать прежние имена без изменений.
//
// v3.18: ВСЕ биндинги — let, чтобы rebindFromScenario() мог переприсвоить
// их при live-смене сценария или сложности (без location.reload).
// Раньше эти 8 были const и держали ссылки на старый сценарий после reload.
let STAFF_DEFS        = SCENARIO.staff;
let STAFF_ROLES       = SCENARIO.staffRoles;
let ROLE_LABELS       = SCENARIO.roleLabels;
let PROJECT_POOL      = SCENARIO.projects;
let BUDGET_RANGES     = SCENARIO.budgetRanges;
let UPGRADES          = SCENARIO.upgrades;
let SPECS             = SCENARIO.specs;
let EVENTS            = SCENARIO.events;
let OVERHEAD          = SCENARIO.settings.overhead;
let ACTIONS_PER_MONTH = SCENARIO.settings.actionsPerMonth;

// v3.18: единая точка перепривязки биндингов к текущему SCENARIO.
// Вызывается из initState() и из switchScenarioLive/switchDifficultyLive.
function rebindFromScenario() {
  STAFF_DEFS        = SCENARIO.staff;
  STAFF_ROLES       = SCENARIO.staffRoles;
  ROLE_LABELS       = SCENARIO.roleLabels;
  PROJECT_POOL      = SCENARIO.projects;
  BUDGET_RANGES     = SCENARIO.budgetRanges;
  UPGRADES          = SCENARIO.upgrades;
  SPECS             = SCENARIO.specs;
  EVENTS            = SCENARIO.events;
  OVERHEAD          = SCENARIO.settings.overhead;
  ACTIONS_PER_MONTH = SCENARIO.settings.actionsPerMonth;
  SCOUT_COST        = SCENARIO.settings.scoutCost;
  HIRE_COST         = SCENARIO.settings.hireCost;
}

// Рабочие дни месяца (v3.3): производственный календарь из сценария
// (settings.workdays[12]); фолбэк — плоский actionsPerMonth
function getWorkdays(monthIdx) {
  const cal = SCENARIO.settings.workdays;
  return (Array.isArray(cal) && cal[monthIdx % 12] != null)
    ? cal[monthIdx % 12]
    : ACTIONS_PER_MONTH;
}
let SCOUT_COST        = SCENARIO.settings.scoutCost;
let HIRE_COST         = SCENARIO.settings.hireCost;

// ══════════════════════════════════════════════════════
//  STATE
// ══════════════════════════════════════════════════════
let G = {};
let DECISIONS = [];

// ── КРЕДИТНЫЕ ЛИНИИ ─────────────────────────────────
// debuff.type: 'rep_penalty' — разовый штраф реп при взятии
//              'speed_debuff' — постоянный дебафф Speed пока кредит активен
const LOAN_TIERS = [
  {
    id:'micro',     icon:'💳', label:'Микрозайм',  minRep:0,
    principal:50000,  monthlyPayment:10000, months:5,
    debuff: null,
    desc: 'Без условий — быстрые деньги',
  },
  {
    id:'basic',     icon:'🏦', label:'Базовый',    minRep:30,
    principal:100000, monthlyPayment:18000, months:7,
    debuff: null,
    desc: 'Стандартные условия',
  },
  {
    id:'standard',  icon:'🏦', label:'Стандарт',   minRep:40,
    principal:250000, monthlyPayment:38000, months:8,
    debuff: { type:'rep_penalty', val:-5,    label:'−5 репутации при выдаче' },
    desc: 'Крупная сумма, репутационные издержки',
  },
  {
    id:'premium',   icon:'💎', label:'Премиум',    minRep:70,
    principal:500000, monthlyPayment:68000, months:9,
    debuff: { type:'rep_penalty', val:-10,   label:'−10 репутации при выдаче' },
    desc: 'Серьёзные деньги для зрелых агентств',
  },
  {
    id:'emergency', icon:'🚨', label:'Экстренный', minRep:0,
    principal:150000, monthlyPayment:32000, months:6,
    debuff: { type:'speed_debuff', val:-0.15, label:'−15% скорость команды на весь срок' },
    desc: 'Форс-мажор. Дорогой кредит с дебаффом скорости.',
  },
];

function initState() {
  // Применяем активный сценарий и ресинкаем все let-биндинги.
  // Работает и при первом запуске, и при «Играть снова», и после
  // live-смены сценария/сложности без перезагрузки страницы (v3.18).
  if (typeof SE !== 'undefined') SE.applyActiveScenario();
  rebindFromScenario();

  G = {
    spec:null, money:500000, month:0,
    staff:[], activeClients:[], log:[],
    tempDiscount:0, monthsPlayed:0,
    actions: getWorkdays(0),
    reputation: SCENARIO.settings.startReputation ?? 100,
    clientNPS: {},
    clientEarnings: {},
    delayedIncome: 0,
    history: [],
    upgrades: {},        // купленные одноразовые апгрейды {id: true}
    qualityBonus: 0,     // постоянный Q-бонус от апгрейдов
    tempQBonus: 0,       // временный Q-бонус (сбрасывается в конце месяца)
    portfolio: 0,        // накопленное портфолио (баллы за завершённые проекты)
    completedProjects: [],  // завершённые проекты, доступные для кейсов
    cases: [],              // собранные кейсы в портфолио
    caseQBonus: 0,          // суммарный Q-бонус от кейсов
    caseRepBonus: 0,        // суммарный бонус восстановления репутации от кейсов
    caseScoutBonus: 0,      // суммарный бонус лидов при скаутинге от кейсов
    caseRepPenalty: 0,      // репутационный штраф/мес от провальных кейсов в портфолио
    scoutPool: null,        // сохранённый пул скаутинга (массив project-def или null)
    candidatePool: [],     // пул кандидатов-специалистов (staff.js)
    loan: null,             // активный кредит { principal, monthlyPayment, monthsRemaining, label }
    teamFatigue: 0,              // усталость команды 0–100: 30+=напряжение, 60+=выгорание, 85+=кризис
    fatigueActionCooldowns: {},  // { paid_leave:N, teambuilding:N, corp_vacation:N } — мес. до доступности
    oneTimeCooldown: 0,          // мес. до следующего oneTime с cooldown (0 = доступен)
    speedUpgrades: 0,            // суммарный бонус Speed от перков (0.10/0.15/0.20 за Agile/Scrum/Auto)
  };
  DECISIONS = [];

  // Migrate staff from old format (если есть сохранённый стейт)
  if (typeof migrateStaffArr === 'function' && G.staff.length > 0) {
    G.staff = migrateStaffArr(G.staff);
  }
}

function rd(text, type) {
  DECISIONS.push({ monthIdx:G.history.length, label:monthLabel(), text, type });
}

function monthLabel(offset=0) {
  const m=G.month+offset;
  return MONTHS[m%12]+' '+(2026+Math.floor(m/12));
}

// ══════════════════════════════════════════════════════
//  NAV / SPEC / START
// ══════════════════════════════════════════════════════
function selectSpec(id) {
  G.spec = id;                                 // чистая мутация стейта
  EventBus.emit('spec_selected', { id });      // UI обновит выделение карточки
}

function startGame() {
  if (!G.spec) return;
  if (typeof startRun === 'function') startRun(); // saves.js: открыть новый ран
  G.money=SCENARIO.settings.startMoney; G.month=0; G.staff=[]; G.activeClients=[]; G.log=[]; G.candidatePool=[];
  G.tempDiscount=0; G.monthsPlayed=0; G._endGameFired=false; G._wonAlreadyCelebrated=false;
  G.actions=getWorkdays(0); G.reputation=SCENARIO.settings.startReputation ?? 100;
  G.clientNPS={}; G.clientEarnings={}; G.delayedIncome=0; G.history=[];
  G.upgrades={}; G.qualityBonus=0; G.tempQBonus=0; G.portfolio=0;
  G.completedProjects=[]; G.cases=[]; G.caseQBonus=0; G.calendarEvents=[]; G.perkFatigueMult=1; G.perkRecoveryBonus=0; G.perkPrepayBonus=0; G.perkPayoutMult=0; G.perkPenaltyShield=false; G.caseRepBonus=0; G.caseScoutBonus=0; G.caseRepPenalty=0; G.scoutPool=null; G.loan=null; G.teamFatigue=0; G.fatigueActionCooldowns={}; G.oneTimeCooldown=0; G.speedUpgrades=0; G.secondSpec=null; G._pendingNegAudit=null; G.perks={}; G._negUsedThisMonth=0;
  G.seasons={}; G._lastSeasonKey=null;   // Ф.6: сезоны (порядок тем по годам)
  G.director={ comfort:0, streak:0, pressure:0, lastCrisisMonth:-99, crises:0, overheadSpikePct:0, overheadSpikeUntil:-1, demandCrashUntil:-1 };  // Р.4
  // ИИ-нейросеть
  G.ai = {
    purchased:         false,   // куплен доступ
    level:             0,       // текущий уровень (0 = базовый, только после покупки)
    upgrading:         false,   // идёт обучение
    upgradeMonthsLeft: 0,       // месяцев до завершения обучения
    chat:              [],       // [{role:'user'|'ai', text, month, pending?}]
    pendingResponse:   null,     // {text, readyMonth} — ответ в очереди
    queriesThisMonth:  0,        // счётчик запросов в текущем месяце
    aiQBonus:          0,        // текущий пассивный Q от ИИ
    aiRepBonus:        0,        // текущий пассивный реп от ИИ
    aiVBonus:          0,        // текущий пассивный V от ИИ (добавляется к caseQBonus-механике)
  };
  DECISIONS=[];
  G.history.push({month:0, money:SCENARIO.settings.startMoney, label:'Старт'});
  addLog('Агентство открыто. Найди первый проект через Скаутинг!','amber');
  addLog(`Выручка начисляется при завершении проекта. Overhead −${fmt(OVERHEAD)}/мес`,'red');
  _emitRender(); goTo('screen-game');
}

// ══════════════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════════════
function fmt(n)  { return Math.round(n).toLocaleString('ru-RU')+'₽'; }
function fmtK(n) { return Math.abs(n)>=1000000?(n/1000000).toFixed(1)+'M₽':Math.abs(n)>=1000?Math.round(n/1000)+'K₽':Math.round(n)+'₽'; }
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }

function getQuality(g=G){ return g.staff.reduce((s,x)=>s+(x.quality||0),0)+(g.qualityBonus||0)+(g.tempQBonus||0)+(g.caseQBonus||0)+(g.ai?.aiQBonus||0); }
function getVolume(g=G) { return g.staff.reduce((s,x)=>s+(x.volume||0),0)+(g.ai?.aiVBonus||0); }
function getCapacity(g=G){ return 2+g.staff.reduce((s,x)=>s+(x.capacity||0),0); }
// hasRole/countRole проверяют по полю role (новые грейды) или id (обратная совместимость)
function hasRole(id,g=G){ return !!g.staff.find(s=>(s.role||s.id)===id); }
function countRole(id,g=G){ return g.staff.filter(s=>(s.role||s.id)===id).length; }

// Скорость выполнения проектов: 1.0 база + бонус от специалистов + перки − дебафф кредита + пассив спека
function getSpeed(g=G) {
  const staffBonus  = g.staff.reduce((s,x) => s + (x.speedBonus||0), 0);
  const loanDebuff  = g.loan?.debuff?.type === 'speed_debuff' ? (g.loan.debuff.val || 0) : 0;
  const specBonus   = SPECS[g.spec]?.passive === 'speed' ? (SPECS[g.spec].passiveVal || 0) : 0;
  // п.13: пассив второй специализации
  const spec2Bonus  = g.secondSpec && SPECS[g.secondSpec]?.passive === 'speed' ? (SPECS[g.secondSpec].passiveVal || 0) : 0;
  // Ф.6: сезонный модификатор скорости (напр. «Сезон спорта» −5%)
  const seasonMod   = (typeof getActiveSeason === 'function' && g) ? (getActiveSeason(g).speedMod || 0) : 0;
  return Math.max(0.2, 1.0 + staffBonus + (g.speedUpgrades||0) + loanDebuff + specBonus + spec2Bonus + seasonMod);
}
// +0.4% выручки за каждый балл портфолио, cap +20% при 50 баллах
function getPortfolioMultiplier(g=G){ return 1+Math.min((g.portfolio||0)*0.004, 0.20); }

// Множитель прогресса от усталости команды
function getFatigueMult(g=G) {
  const ft = g.teamFatigue || 0;
  return ft >= 85 ? 0.70 : ft >= 60 ? 0.85 : ft >= 30 ? 0.95 : 1.0;
}

// ── МОЩНОСТЬ ─────────────────────────────────────────────
// Эффективность от перевыполнения мощности (v3.7, по A/B/C-тесту):
// до 100% нагрузки — линейно; сверх — убывающая отдача √(избытка)×0.5.
// ×2 мощности → 1.5, ×4 → 1.87, ×7 → 2.22. Единая точка правды для
// движка, превью и прогнозов (в Godot переносится 1-в-1)
function effFromRatio(r) {
  return r <= 1 ? r : 1 + Math.sqrt(r - 1) * 0.5;
}

// Мощность одного сотрудника (целое число мощн.): grade × качество × настроение
function calcStaffWorkUnit(s) {
  if (!s || s.status === 'fired') return 0;
  // Грейды staff v2 (junior…star) + легаси-алиасы jr/md/sr (фикс п.25)
  const gradeWU  = { jr:2, junior:2, md:4, middle:4, sr:7, senior:7, lead:9, star:12 }[s.grade] || 3;
  // qStat у staff v2 — шкала 0–10, легаси quality — 0–100; нормализуем к 0–100
  const rawQ     = (s.qStat || s.quality || 50);
  const q100     = rawQ <= 10 ? rawQ * 10 : rawQ;
  const qualMult = Math.max(0.4, q100 / 75);
  const moodMult = Math.max(0.5, ((s.mood ?? 80) / 100));
  return Math.round(gradeWU * qualMult * moodMult);
}

// Мощность команды (2 у фаундера + мощн. каждого сотрудника)
function getTeamThroughput(g=G) {
  return 2 + g.staff.reduce((s,x) => s + calcStaffWorkUnit(x), 0);
}

// Мощность конкретного проекта: 2 (фаундер) + мощн. назначенных сотрудников
function getProjectThroughput(c) {
  const assigned = (G.staff || []).filter(s =>
    s.status !== 'fired' &&
    (c._assignedStaff || []).includes(s._iid || s.id)
  );
  return 2 + assigned.reduce((sum, s) => sum + calcStaffWorkUnit(s), 0);
}

// Пассивный прирост качества проекта/мес от назначенной команды (+ Нейросеть).
// Фидбэк 2026-06-21: качество не должно зависеть только от 1 действия/мес —
// сильная команда сама доводит качество к высоким значениям по ходу работы.
function getProjectQualityGain(c) {
  const assigned = (G.staff || []).filter(s =>
    s.status !== 'fired' &&
    (c._assignedStaff || []).includes(s._iid || s.id)
  );
  let qSum = 0;
  assigned.forEach(s => { qSum += (s.qStat != null ? s.qStat : (s.quality ? s.quality / 10 : 5)); });
  const ai = (G.ai && G.ai.aiQBonus) ? G.ai.aiQBonus * 0.2 : 0;
  // 1.5 (фаундер курирует) + 0.6 за каждую единицу qStat команды + пассив ИИ
  return 1.5 + qSum * 0.6 + ai;
}

// Назначить сотрудника на проект (один сотрудник — один проект)
function assignStaffToProject(staffId, projectId) {
  unassignStaff(staffId);
  const project = (G.activeClients || []).find(c => c.id === projectId);
  const staff   = (G.staff || []).find(s => (s._iid || s.id) === staffId);
  if (!project || !staff) return;
  project._assignedStaff = project._assignedStaff || [];
  project._assignedStaff.push(staffId);
  staff._assignedProjectId = projectId;
  _emitRender();
}

// Снять сотрудника со всех проектов
function unassignStaff(staffId) {
  const staff = (G.staff || []).find(s => (s._iid || s.id) === staffId);
  if (staff) staff._assignedProjectId = null;
  (G.activeClients || []).forEach(c => {
    if (c._assignedStaff) c._assignedStaff = c._assignedStaff.filter(id => id !== staffId);
  });
}

// Б.9 (2026-06-18): освободить ВСЮ команду выбывающего проекта.
// Раньше _assignedProjectId не снимался при сдаче/завершении/расторжении/churn —
// сотрудники оставались «вечно заняты», ломая планнинг и автоназначение (Ф.1).
// Вызывать ПЕРЕД удалением клиента из G.activeClients в каждой точке выбытия.
function releaseProjectTeam(projectId) {
  if (projectId == null) return;
  (G.staff || []).forEach(s => {
    if (s._assignedProjectId === projectId) s._assignedProjectId = null;
  });
}

// п.17 (Ф.1): Оптимальный подбор команды под проект
// Сортирует свободных сотрудников по WU × affinity-бонусу роли к типу проекта,
// жадно добавляет пока throughput (2 + WU выбранных) не покроет load×1.15
function autoAssignOptimal(project) {
  const pLoad  = getProjectLoad(project);
  if (pLoad <= 0) return [];

  // Подбор под ОСТАТОК текущей work-фазы (фидбэк 2026-06-21): если проект уже на
  // 49%, авто тянет ровно столько мощности, чтобы закрыть оставшийся ~51% (по
  // возможности за месяц), а не на полные 100%.
  const remaining    = Math.max(5, 100 - (project._progress || 0));
  const workPhaseCnt = project._lcChain ? project._lcChain.filter(p => p.startsWith('work_')).length : 1;
  const phaseDur     = (project._duration || 3) / Math.max(1, workPhaseCnt);
  const speed        = (typeof getSpeed === 'function' ? getSpeed() : 1) *
                       (typeof getFatigueMult === 'function' ? getFatigueMult() : 1);
  // Нужная эффективность, чтобы закрыть остаток за 1 месяц, и обратная effFromRatio:
  const effNeeded   = (remaining * phaseDur) / (100 * Math.max(0.1, speed));
  const ratioNeeded = effNeeded <= 1 ? effNeeded : 1 + Math.pow((effNeeded - 1) / 0.5, 2);
  // целевая мощность (+5% запас), с разумным потолком: отдача убывает выше 1.0,
  // и не даём авто монополизировать всю команду на один проект (макс ~2.5× нагрузки)
  const target = Math.max(4, Math.min(pLoad * 2.5, pLoad * ratioNeeded * 1.05));

  const free = (G.staff || []).filter(s => s.status !== 'fired' && !s._assignedProjectId);
  if (!free.length) return [];

  // Role → project-type affinity multipliers
  const _AFF = {
    corp:  { developer: 1.2, manager: 1.15, lawyer: 1.2 },
    bank:  { developer: 1.2, manager: 1.15, lawyer: 1.25 },
    state: { lawyer: 1.25, manager: 1.1 },
    store: { designer: 1.2, smm: 1.15, copywriter: 1.15 },
    local: { designer: 1.15, smm: 1.2, copywriter: 1.1 },
  };
  const affMap = _AFF[project.type] || {};

  const scored = free.map(s => {
    const wu = calcStaffWorkUnit(s);
    return { s, wu, score: wu * (affMap[s.role] || 1.0) };
  }).sort((a, b) => b.score - a.score);

  const selected = [];
  // Стартуем от ТЕКУЩЕЙ мощности проекта (учитывает уже назначенных) — добираем остаток
  let thr = (typeof getProjectThroughput === 'function') ? getProjectThroughput(project) : 2;
  for (const { s, wu } of scored) {
    if (thr >= target) break;
    selected.push(s);
    thr += wu;
  }
  // Если уже укомплектован — ничего не добавляем; иначе гарантируем хотя бы одного
  return selected.length ? selected : ((thr < target && scored[0]) ? [scored[0].s] : []);
}

// ── Ф.3: переговорщики (авто-подписание проектов) ──────
// Спец роли 'salesrep' даёт 1 авто-подписание/мес. Грейд → условия сделки.
// Оплата гибрид: премиальный оклад (staff.js ×1.4) + комиссия % с бюджета.
function getNegotiators() {
  return (G.staff || []).filter(s => s.role === 'salesrep' && s.status !== 'fired');
}
function negotiatorCapacity() { return getNegotiators().length; }
function negotiatorFree() { return Math.max(0, negotiatorCapacity() - (G._negUsedThisMonth || 0)); }
function bestFreeNegotiator() {
  const order = { star: 5, lead: 4, senior: 3, middle: 2, junior: 1 };
  return getNegotiators().slice().sort((a, b) => (order[b.grade] || 0) - (order[a.grade] || 0))[0] || null;
}
function delegateSign(pid) {
  if (negotiatorFree() <= 0) { notify('Нет свободного переговорщика в этом месяце', 'error'); return; }
  const neg = bestFreeNegotiator();
  if (!neg) { notify('Нет переговорщика в штате', 'error'); return; }
  signProject(pid, { autoNeg: neg });
}
// Комиссия + расход заряда переговорщика (гибрид-оплата). Вызывается из signProject.
function _applyNegotiatorDeal(client, neg) {
  G._negUsedThisMonth = (G._negUsedThisMonth || 0) + 1;
  neg._negDealsMonth = (neg._negDealsMonth || 0) + 1;
  let commPct = 0.05;
  if (G.upgrades && G.upgrades['negotiator']) commPct *= 0.5;  // перк «M&A/Переговорщик» — вдвое меньше комиссия
  const comm = Math.round((client._totalBudget || 0) * commPct / 1000) * 1000;
  if (comm > 0) {
    G.money -= comm;
    addLog(`💼 ${neg.name} закрыл сделку «${client.name}» — комиссия −${fmtK(comm)}`, 'amber');
  }
}

// Мощность, которую требует проект (по тиру) — целевая нагрузка/мес.
// T1–T7 (v3.0): 4 / 8 / 14 / 18 / 24 / 32 / 40 — шкала пропорциональна
// мощн. сотрудников (jr=2, md=4, sr=7, lead=9, star=12)
// payment_delay_fixed: в период ожидания проект не потребляет мощность
function getProjectLoad(c) {
  if (c.modifier?.type==='payment_delay_fixed' && (c._monthsSigned||0) <= c.modifier.val) return 0;
  return [0, 4, 8, 14, 18, 24, 32, 40][c.tier] ?? 4;
}

// Суммарная мощность, требуемая всеми активными проектами
// (v3.0: разовые включены — они тоже работают через назначение команды)
function getTotalLoad(g=G) {
  return g.activeClients.reduce((s,c) => s + getProjectLoad(c), 0);
}

// Суммарный пайплайн (ожидаемые выплаты при завершении)
function getPipelineValue(g=G) {
  return g.activeClients.reduce((s,c) => s + (c._totalBudget||0), 0);
}

function getTotalStaffCost(g=G) {
  let t=g.staff.reduce((s,x)=>s+x.cost,0);
  if (SPECS[g.spec].bonus==='staff_cost') t=Math.round(t*(1+SPECS[g.spec].bonusVal));
  // п.13: бонус второй специализации
  if (g.secondSpec && SPECS[g.secondSpec]?.bonus==='staff_cost') t=Math.round(t*(1+SPECS[g.secondSpec].bonusVal));
  return t;
}

// Ежемесячный расход (выручка приходит только при завершении проектов)
function getCashflow(g=G) {
  const loanPayment = g.loan ? g.loan.monthlyPayment : 0;
  return -(getTotalStaffCost(g) + OVERHEAD + loanPayment);
}

function addLog(msg, cls='') {
  G.log.unshift({ month:monthLabel(), msg, cls });
  if (G.log.length>30) G.log.pop();
}

// ── Сигналы (Godot: emit_signal) ─────────────────────
// Engine не знает о DOM. Все UI-эффекты — через EventBus.
// При переносе в Godot: заменить EventBus.emit → emit_signal

function notify(msg, type='info') {
  EventBus.emit('notify', { msg, type });
}

function goTo(id) {
  EventBus.emit('navigate', { screen: id });
}

// Ре-рендер всего игрового поля (вызов UI из engine → через сигнал)
function _emitRender()     { EventBus.emit('render'); }
function _emitShowEvent(ev){ EventBus.emit('show_event', { ev }); }
function _emitEndGame(won) { G._endGameFired = true; EventBus.emit('end_game', { won }); }

function npsColor(v) {
  return v>=65?'var(--green)':v>=42?'var(--amber)':'var(--red)';
}

function repColor(v) {
  return v>=70?'var(--green)':v>=40?'var(--amber)':'var(--red)';
}

// ══════════════════════════════════════════════════════
//  NPS ENGINE
// ══════════════════════════════════════════════════════
// ── ЕДИНЫЙ КАНАЛ ОЦЕНКИ КЛИЕНТА (фикс п.26) ─────────────
// LC-проекты: канон — _lcClientMood, clientNPS — зеркало (для карточек,
// churn-проверки и всех старых механик). Обычные проекты: clientNPS как раньше.
// ВСЕ изменения отношения клиента должны идти через эту функцию.
function nudgeClientRating(c, delta, g=G) {
  if (c._lcChain) {
    c._lcClientMood = clamp((c._lcClientMood ?? 60) + delta, 0, 100);
    g.clientNPS[c.id] = c._lcClientMood;
  } else {
    g.clientNPS[c.id] = clamp((g.clientNPS[c.id] ?? c.npsStart ?? 70) + delta, 0, 100);
  }
}

function nudgeAllNPS(g,delta) {
  g.activeClients.forEach(c=>{ nudgeClientRating(c, delta, g); });
}

function updateAllNPS() {
  const quality=getQuality(), volume=getVolume();
  const overloaded=G.activeClients.length>=getCapacity();
  const hasManager=hasRole('manager');
  const hrBonus=countRole('hr')*3; // +3 NPS/мес per HR
  const churned=[];

  G.activeClients.forEach(c=>{
    // ── LC-проекты: канон — _lcClientMood (фикс п.26) ──
    // Q/V-гэп, overload и пр. на них НЕ действуют — отношение клиента
    // формируется решениями фаз, work-событиями и действиями игрока.
    // Помесячно применяются только модификаторы самого проекта.
    if (c._lcChain) {
      let moodDrift = 0;
      if (c.modifier?.type==='nps_passive') moodDrift += c.modifier.val;
      if (c.modifier?.type==='nps_drain')   moodDrift += c.modifier.val;
      if (moodDrift !== 0) nudgeClientRating(c, moodDrift);
      const mood = c._lcClientMood ?? 60;
      G.clientNPS[c.id] = mood; // зеркало всегда актуально
      if      (mood<25) churned.push(c);
      else if (mood<45) addLog(`⚠️ ${c.name}: настроение ${Math.round(mood)} — клиент недоволен`,'amber');
      return;
    }

    let nps=G.clientNPS[c.id]??c.npsStart??70;
    const qGap=quality-c.minQ, vGap=volume-c.minV;

    // Качество/объём как драйверы NPS
    if      (qGap<0)    nps-=14;
    else if (qGap<5)    nps-=5;
    else if (qGap>=15)  nps+=4;

    if (vGap<0)   nps-=10;
    else if (vGap<5) nps-=2;

    if (overloaded)  nps-=6;
    if (hasManager)  nps+=5;
    if (hrBonus>0)   nps+=hrBonus;

    // Client-specific passive modifiers
    if (c.modifier?.type==='nps_passive') nps+=c.modifier.val;
    if (c.modifier?.type==='nps_drain')   nps+=c.modifier.val;

    nps+=Math.random()*6-3; // market noise ±3
    nps=clamp(nps,0,100);
    G.clientNPS[c.id]=nps;

    if      (nps<25) churned.push(c);
    else if (nps<45) addLog(`⚠️ ${c.name}: оценка клиента ${Math.round(nps)} — клиент недоволен`,'amber');
  });

  churned.forEach(c=>{
    const finalNPS=Math.round(G.clientNPS[c.id]||20);
    G.completedProjects=G.completedProjects||[];
    G.completedProjects.push({
      id:c.id, name:c.name, icon:c.icon, revenue:c.revenue, tier:c.tier||1,
      finalNPS:finalNPS, monthCompleted:G.month, terminated:false, failed:true, _cased:false,
    });
    releaseProjectTeam(c.id); // Б.9
    G.activeClients=G.activeClients.filter(a=>a.id!==c.id);
    delete G.clientNPS[c.id];
    addLog(`💔 ${c.name} расторг контракт (оценка клиента обнулилась)`,'red');
    notify(`${c.icon} ${c.name} ушёл сам`,'error');
    rd(`${c.name} ушёл органически`,'churn');
  });
  // п.10 (Р.4): churn-каскад — слух о потере клиента ударяет по остальным
  if (churned.length > 0 && G.activeClients.filter(c=>!c.oneTime).length > 0) {
    nudgeAllNPS(G, -5);
    G.reputation = clamp((G.reputation||0) - 3, 0, 100);
    addLog(`📢 Слух о потере клиента: лояльность остальных −5, репутация −3`, 'red');
  }
}

function investInClient(cid) {
  if (G.money<20000){ notify('Мало денег','error'); return; }
  const c=G.activeClients.find(a=>a.id===cid);
  if (!c) return;
  G.money-=20000;
  const before=Math.round(G.clientNPS[cid]||70);
  nudgeClientRating(c, +25); // единый канал: LC → mood, обычные → NPS
  addLog(`💬 Инвестиция в ${c.name}: NPS ${before}→${Math.round(G.clientNPS[cid])}`,'teal');
  notify(`NPS ${c.name}: ${before}→${Math.round(G.clientNPS[cid])} 📈`,'success');
  rd(`Инвестиция в ${c.name}:  оценка клиента +25`,'event');
  _emitRender();
}

// ══════════════════════════════════════════════════════
//  SCOUTING
// ══════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════
//  Ф.6 — СЕЗОННОСТЬ (стиль HoMM3 «тематических недель»)
//  Каждый игровой год 4 темы вытягиваются из пула и раскладываются по кварталам
//  в случайном порядке (тасуются год к году). У темы три слоя: глобальный эффект,
//  тематический наплыв проектов (season-тег), уникальное событие-вилка.
// ══════════════════════════════════════════════════════
//  Поля темы:
//   speedMod   — добавка к getSpeed (доля, напр. -0.05 = «−5 к скорости»)
//   budgetMult — множитель бюджета офферов (1.15 = +15%, 0.9 = −10%)
//   offerBonus — +/- к числу офферов в скаутинге
//   npsNudge   — ежемесячный сдвиг лояльности активных клиентов
//   riskMod    — добавка к ежемесячному риску проектов (доля)
//   pool       — season-тег, проекты которого «заливают» рынок в этот сезон
const SEASON_THEMES = [
  { id: 'sport',   label: 'Сезон большого спорта', icon: '🏟', color: '#34d399',
    atmosphere: 'все смотрят трансляции, а не работают',
    speedMod: -0.05, budgetMult: 1.10, offerBonus: 0, npsNudge: 0, riskMod: 0, pool: 'event',
    desc: 'Спонсорские и ивент-заказы. Бюджеты +10%, но скорость −5% (команда отвлекается).' },
  { id: 'sale',    label: 'Сезон распродаж', icon: '🛍', color: '#f59e0b',
    atmosphere: 'Black Friday на носу, всем нужно «ещё вчера»',
    speedMod: 0, budgetMult: 1.20, offerBonus: 1, npsNudge: -1, riskMod: 0.04, pool: 'ecom',
    desc: 'Performance/e-comm заказы. Бюджеты +20%, +1 оффер, но риск и нервы клиентов выше.' },
  { id: 'report',  label: 'Сезон отчётности', icon: '📊', color: '#60a5fa',
    atmosphere: 'годовые отчёты, аналитика, «покажите цифры»',
    speedMod: 0, budgetMult: 1.0, offerBonus: 0, npsNudge: 0, riskMod: 0, pool: 'report',
    desc: 'Аналитика и брендинг. Лояльность клиентов держится, но рынок ровный.' },
  { id: 'startup', label: 'Стартап-лихорадка', icon: '🚀', color: '#a78bfa',
    atmosphere: 'инвест-волна, новые студии плодятся каждую неделю',
    speedMod: 0, budgetMult: 0.90, offerBonus: 2, npsNudge: 0, riskMod: 0.05, pool: 'startup',
    desc: 'Много мелких рисковых заказов: +2 оффера, но бюджеты −10% и риск выше.' },
  { id: 'rebrand', label: 'Сезон ребрендингов', icon: '🎨', color: '#f472b6',
    atmosphere: 'все хотят «освежить айдентику»',
    speedMod: 0, budgetMult: 1.15, offerBonus: 0, npsNudge: 1, riskMod: 0, pool: 'brand',
    desc: 'Брендинг и дизайн-проекты. Бюджеты +15%, клиенты довольнее.' },
  { id: 'slump',   label: 'Глухой сезон', icon: '🌫', color: '#94a3b8',
    atmosphere: 'рынок замер, бюджеты режут',
    speedMod: 0, budgetMult: 0.90, offerBonus: -1, npsNudge: -2, riskMod: 0, pool: null,
    desc: 'Затишье: −1 оффер, бюджеты −10%, клиенты нервничают. Пережить и не уйти в минус.' },
];

function _seasonYear(g = G) { return Math.floor(((g && g.month) || 0) / 12); }
function _seasonQuarter(g = G) { return Math.floor((((g && g.month) || 0) % 12) / 3); }  // 0..3

// Жеребьёвка порядка тем на год: 4 из пула, по возможности не повторяя
// прошлогоднюю границу (Q4→Q1) для ощущения смены.
function _drawSeasonOrder(prevOrder) {
  const ids = SEASON_THEMES.map(t => t.id);
  for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
  const order = ids.slice(0, 4);
  // мягко избегаем мгновенного повтора темы на стыке годов
  if (prevOrder && prevOrder.length && order[0] === prevOrder[prevOrder.length - 1] && SEASON_THEMES.length > 4) {
    const alt = ids.slice(4).find(x => x !== order[0]);
    if (alt) order[0] = alt;
  }
  return order;
}

function _ensureSeasonOrder(g = G) {
  if (!g) return SEASON_THEMES.slice(0, 4).map(t => t.id);
  g.seasons = g.seasons || {};
  const y = _seasonYear(g);
  if (!Array.isArray(g.seasons[y])) g.seasons[y] = _drawSeasonOrder(g.seasons[y - 1]);
  return g.seasons[y];
}

// Активная тема сезона (текущий квартал текущего года).
function getActiveSeason(g = G) {
  const order = _ensureSeasonOrder(g);
  const id = order[_seasonQuarter(g)] || order[0];
  return SEASON_THEMES.find(t => t.id === id) || SEASON_THEMES[0];
}

// Сколько месяцев до следующего сезона + какая тема будет.
function getNextSeason(g = G) {
  const m = ((g && g.month) || 0);
  const monthsLeft = 3 - (m % 3);
  const nextMonth = m + monthsLeft;
  const order = _ensureSeasonOrder({ ...(g || {}), month: nextMonth, seasons: (g && g.seasons) || {} });
  const id = order[Math.floor((nextMonth % 12) / 3)] || order[0];
  return { monthsLeft, theme: SEASON_THEMES.find(t => t.id === id) || SEASON_THEMES[0] };
}

// Back-compat обёртка: прежние потребители ждут {offerBonus,budgetBoost,npsNudge,label,icon,color}.
// budgetBoost = доля (budgetMult-1), чтобы signProject (1+_seasonBoost) работал как раньше.
function getSeasonMod() {
  if (typeof G === 'undefined' || !G) return { offerBonus: 0, budgetBoost: 0, npsNudge: 0, speedMod: 0, riskMod: 0, pool: null, label: null, icon: null, color: null };
  const s = getActiveSeason();
  return {
    id: s.id, label: s.label, icon: s.icon, color: s.color, atmosphere: s.atmosphere, desc: s.desc,
    offerBonus: s.offerBonus || 0, budgetBoost: (s.budgetMult || 1) - 1, budgetMult: s.budgetMult || 1,
    npsNudge: s.npsNudge || 0, speedMod: s.speedMod || 0, riskMod: s.riskMod || 0, pool: s.pool || null,
  };
}

// Ф.6: сезонные события-вилки (по 1 на тему). Срабатывают при смене квартала.
// Каждое — {icon,title,body,choices:[{text,desc,fn(G)}]}; fn мутирует G.
const _seasNoop = { text: 'Пройти мимо', desc: 'Без последствий.', fn: () => {} };
const SEASON_EVENTS = {
  sport: () => ({ icon: '🏟', title: 'Амбассадор лиги', body: 'Звезда спортлиги предлагает стать её амбассадором — громкий охват, но небесплатно.',
    choices: [
      { text: 'Заключить спонсорство', desc: '−180К, +6 репутации.', fn: g => { g.money -= 180000; g.reputation = clamp(g.reputation + 6, 0, 100); addLog('🏟 Спонсорство лиги: −180К, +6 реп.', 'amber'); } },
      _seasNoop ] }),
  sale: () => ({ icon: '🛍', title: 'Слот на маркетплейсе', body: 'Маркетплейс открывает платный промо-слот под распродажу — выкупишь, поднимешь поток заявок.',
    choices: [
      { text: 'Выкупить промо-слот', desc: '−120К, +1 к скаутингу.', fn: g => { g.money -= 120000; g.caseScoutBonus = (g.caseScoutBonus || 0) + 1; addLog('🛍 Промо-слот: −120К, +1 к скаутингу', 'amber'); } },
      _seasNoop ] }),
  report: () => ({ icon: '📊', title: 'Срочный годовой отчёт', body: 'Крупный клиент просит сверстать годовой отчёт «на вчера». Возьмёшь авралом?',
    choices: [
      { text: 'Взять авралом', desc: '+220К, но +15 усталости команды.', fn: g => { g.money += 220000; g.teamFatigue = clamp((g.teamFatigue || 0) + 15, 0, 100); addLog('📊 Аврал по отчёту: +220К, +15 усталости', 'teal'); } },
      { text: 'Вежливо отказать', desc: '−2 репутации.', fn: g => { g.reputation = clamp(g.reputation - 2, 0, 100); } } ] }),
  startup: () => ({ icon: '🚀', title: 'Инвест-волна', body: 'Поднялась инвест-волна — десятки стартапов ищут подрядчика прямо сейчас.',
    choices: [
      { text: 'Набрать пачку лидов', desc: '+2 к скаутингу, +10 усталости.', fn: g => { g.caseScoutBonus = (g.caseScoutBonus || 0) + 2; g.teamFatigue = clamp((g.teamFatigue || 0) + 10, 0, 100); addLog('🚀 Инвест-волна: +2 к скаутингу, +10 усталости', 'teal'); } },
      { text: 'Держать фокус на текущих', desc: 'Без последствий.', fn: () => {} } ] }),
  rebrand: () => ({ icon: '🎨', title: 'Конкурс на ребрендинг', body: 'Объявлен тендер на ребрендинг известной сети. Участие отнимает силы, но громкая победа поднимет имя.',
    choices: [
      { text: 'Участвовать', desc: '60%: +8 репутации, иначе −2 рабочих дня.', fn: g => { if (Math.random() < 0.6) { g.reputation = clamp(g.reputation + 8, 0, 100); addLog('🎨 Победа в тендере на ребрендинг: +8 реп.', 'green'); } else { g.actions = Math.max(0, (g.actions || 0) - 2); addLog('🎨 Тендер проигран — потеряно 2 дня', 'muted'); } } },
      _seasNoop ] }),
  slump: () => ({ icon: '🌫', title: 'Клиент давит на скидку', body: 'В затишье ключевой клиент намекает: либо скидка, либо уходит к конкуренту.',
    choices: [
      { text: 'Дать скидку, удержать', desc: '−90К, +4 лояльности всем клиентам.', fn: g => { g.money -= 90000; if (typeof nudgeAllNPS === 'function') nudgeAllNPS(g, 4); addLog('🌫 Скидка ради удержания: −90К, +4 лояльности', 'amber'); } },
      { text: 'Держать цену', desc: 'Риск: −3 лояльности.', fn: g => { if (typeof nudgeAllNPS === 'function') nudgeAllNPS(g, -3); } } ] }),
};

// Срабатывает при смене квартала (нового сезона). Возвращает true, если событие показано.
function _maybeFireSeasonEvent() {
  if (typeof G === 'undefined' || !G) return false;
  const key = _seasonYear() * 4 + _seasonQuarter();
  if (G._lastSeasonKey == null) { G._lastSeasonKey = key; return false; }   // инициализация без события
  if (key === G._lastSeasonKey) return false;
  G._lastSeasonKey = key;
  const s = getActiveSeason();
  addLog(`${s.icon} Новый сезон: ${s.label} — ${s.desc}`, 'purple');
  const mk = SEASON_EVENTS[s.id];
  if (mk) { _emitShowEvent(mk()); return true; }
  return false;
}

// ══════════════════════════════════════════════════════
//  Р.4 — ДИНАМИЧЕСКАЯ СЛОЖНОСТЬ: «ДИРЕКТОР ДАВЛЕНИЯ»
//  Каждый месяц оценивает «комфорт» игрока (runway/баланс/репутация/слоты).
//  Долгий комфорт → растёт давление → директор бросает кризисы (мелкие авто +
//  крупные вилки) и незаметно подкручивает рынок. Пороги зависят от сложности.
//  🌫 Глухой сезон (Ф.6) усиливает давление. Самоподстраивается (rubber-band).
// ══════════════════════════════════════════════════════
const DIRECTOR_COMFORT_CAP = { easy: 85, normal: 70, hard: 58, nightmare: 45 };
const DIRECTOR_CRISIS_CD   = { easy: 6,  normal: 5,  hard: 4,  nightmare: 3  };  // база месяцев между кризисами
const DIRECTOR_SEVERITY    = { easy: 0.7, normal: 1.0, hard: 1.25, nightmare: 1.5 };

function _directorDifficulty() {
  try { if (typeof ScenarioLoader !== 'undefined' && ScenarioLoader.getDifficultyId) return ScenarioLoader.getDifficultyId() || 'normal'; } catch (_) {}
  return 'normal';
}
function _directorState(g = G) {
  g.director = g.director || { comfort: 0, streak: 0, pressure: 0, lastCrisisMonth: -99, crises: 0,
    overheadSpikePct: 0, overheadSpikeUntil: -1, demandCrashUntil: -1 };
  return g.director;
}

// Индекс комфорта 0..100: чем выше — тем «жирнее» живёт игрок.
function computeComfort(g = G) {
  if (!g) return 0;
  const burn = Math.max(1, -getCashflow(g));
  const runway = (g.money > 0) ? g.money / burn : 0;
  const sRun  = clamp(runway / 10, 0, 1);                 // 10+ мес runway = максимум
  const sBal  = clamp((g.money || 0) / (burn * 6), 0, 1); // подушка 6 мес
  const sRep  = clamp(((g.reputation || 0) - 40) / 55, 0, 1);
  const cap   = getCapacity(g);
  const used  = (g.activeClients || []).filter(c => !c.oneTime).length;
  const sSlack = cap > 0 ? clamp(1 - used / cap, 0, 1) : 0; // простаивающая мощность = комфорт
  return Math.round(100 * (0.40 * sRun + 0.25 * sBal + 0.20 * sRep + 0.15 * sSlack));
}

// Доп. overhead от кризиса (читается в шаге расходов advanceMonth).
function getDirectorOverhead(g = G) {
  const d = g.director;
  if (!d || (d.overheadSpikeUntil || -1) < (g.month || 0)) return 0;
  return Math.round(OVERHEAD * (d.overheadSpikePct || 0));
}

// «Невидимая рука»: в комфорте директор подрезает офферы. Возвращает {tierCut, budgetMult}.
function _directorOfferPenalty(g = G) {
  const d = g.director;
  if (!d) return { tierCut: 0, budgetMult: 1 };
  const cap = DIRECTOR_COMFORT_CAP[_directorDifficulty()] ?? 70;
  if ((d.comfort || 0) <= cap) return { tierCut: 0, budgetMult: 1 };
  const p = Math.min(3, d.pressure || 0);
  // чем выше давление в комфорте — тем вероятнее срез тира и сильнее усушка бюджета
  const tierCut = (p >= 1 && Math.random() < 0.25 * p) ? 1 : 0;
  const budgetMult = 1 - Math.min(0.10, 0.03 * p);
  return { tierCut, budgetMult };
}

// Крупнейший активный (не разовый) клиент — частая цель кризисов.
function _biggestClient(g = G) {
  const list = (g.activeClients || []).filter(c => !c.oneTime);
  if (!list.length) return null;
  return [...list].sort((a, b) => (b._totalBudget || 0) - (a._totalBudget || 0))[0];
}

// ── Мелкие кризисы (авто, без выбора) ───────────────────────────────
function _crisisMinor(g, p, sev) {
  const d = _directorState(g);
  const pool = [];
  pool.push(() => { // скачок overhead
    d.overheadSpikePct = Math.min(0.5, (d.overheadSpikePct || 0) + 0.06 * p * sev);
    d.overheadSpikeUntil = (g.month || 0) + 2;
    addLog(`📈 Скачок издержек: overhead +${Math.round(d.overheadSpikePct * 100)}% на 2 мес`, 'red');
    notify('📈 Выросли операционные издержки', 'warning');
  });
  pool.push(() => { // репутационный укол
    const dr = Math.round((1 + p) * sev);
    g.reputation = clamp((g.reputation || 0) - dr, 0, 100);
    addLog(`📰 Неудачный кейс попал в прессу: −${dr} репутации`, 'amber');
  });
  const big = _biggestClient(g);
  if (big) pool.push(() => { // подрезка бюджета сделки
    const pct = Math.round((5 + 5 * p) * sev);
    const delta = Math.round((big._totalBudget || 0) * pct / 100);
    big._totalBudget = Math.max(0, (big._totalBudget || 0) - delta);
    addLog(`✂️ «${big.name}» урезал бюджет на ${pct}% (−${fmtK(delta)})`, 'amber');
    notify('✂️ Клиент сократил бюджет', 'warning');
  });
  if ((g.activeClients || []).filter(c => !c.oneTime).length) pool.push(() => { // удар по лояльности случайного
    const live = g.activeClients.filter(c => !c.oneTime);
    const c = live[Math.floor(Math.random() * live.length)];
    const dr = Math.round((3 + 2 * p) * sev);
    if (typeof nudgeClientRating === 'function') nudgeClientRating(c, -dr, g);
    addLog(`😕 «${c.name}» недоволен: оценка клиента −${dr}`, 'amber');
  });
  pool[Math.floor(Math.random() * pool.length)]();
}

// ── Крупные кризисы (вилка с выбором) ───────────────────────────────
function _crisisMajor(g, p, sev) {
  const evs = [];
  const big = _biggestClient(g);
  const staff = (g.staff || []).filter(s => s.status !== 'fired');

  if (big) evs.push(() => { // секвестр бюджета
    const pct = Math.round((20 + 5 * p) * sev);
    const delta = Math.round((big._totalBudget || 0) * pct / 100);
    _emitShowEvent({ icon: '✂️', title: 'Секвестр бюджета', body: `«${big.name}» режет бюджет проекта на ${pct}% (−${fmtK(delta)}). Как поступишь?`,
      choices: [
        { text: 'Принять удар', desc: `−${fmtK(delta)} к доходу сделки.`, fn: gg => { const c = _biggestClient(gg); if (c) { c._totalBudget = Math.max(0, (c._totalBudget || 0) - delta); addLog(`✂️ Секвестр «${c.name}»: −${fmtK(delta)}`, 'red'); } } },
        { text: 'Сесть за стол переговоров', desc: '−2 рабочих дня, 50%: вернуть половину среза.', fn: gg => { gg.actions = Math.max(0, (gg.actions || 0) - 2); const c = _biggestClient(gg); if (!c) return; if (Math.random() < 0.5) { const back = Math.round(delta / 2); addLog(`🤝 Переговоры удались: спасено ${fmtK(back)} (срез −${fmtK(delta - back)})`, 'teal'); c._totalBudget = Math.max(0, (c._totalBudget || 0) - (delta - back)); } else { addLog(`🤝 Переговоры провалились: секвестр −${fmtK(delta)} в силе`, 'red'); c._totalBudget = Math.max(0, (c._totalBudget || 0) - delta); } } },
      ] });
  });

  if (staff.length) evs.push(() => { // хантинг ключевого спеца
    const star = [...staff].sort((a, b) => (b.cost || 0) - (a.cost || 0))[0];
    const keep = Math.round((star.cost || 50000) * 3 * sev);
    _emitShowEvent({ icon: '🎯', title: 'Хантинг ключевого спеца', body: `Конкурент переманивает «${star.name || star.role}» (${star.role}). Удержишь?`,
      choices: [
        { text: 'Контр-оффер', desc: `−${fmtK(keep)} (премия+опционы), специалист остаётся.`, fn: gg => { gg.money -= keep; const s = (gg.staff || []).find(x => x === star) || star; if (s) { s.loyalty = clamp((s.loyalty || 50) + 20, 0, 100); s.mood = clamp((s.mood || 50) + 10, 0, 100); } addLog(`🎯 Удержан «${star.name || star.role}»: −${fmtK(keep)}`, 'amber'); } },
        { text: 'Отпустить', desc: '−мощность, мораль команды −8.', fn: gg => { gg.staff = (gg.staff || []).filter(x => x !== star); (gg.staff || []).forEach(s => { s.mood = clamp((s.mood || 50) - 8, 0, 100); }); addLog(`🚪 «${star.name || star.role}» ушёл к конкуренту — мораль команды просела`, 'red'); if (typeof checkCapacityExceeded === 'function') checkCapacityExceeded(star.name || star.role); } },
      ] });
  });

  evs.push(() => { // антипиар
    const repHit = Math.round((4 + 2 * p) * sev);
    const prCost = Math.round((-getCashflow(g)) * 0.8 * sev);
    _emitShowEvent({ icon: '📰', title: 'Антипиар', body: 'В отраслевом канале вышел разгромный пост о вашем агентстве. Реакция?',
      choices: [
        { text: 'Запустить PR-кампанию', desc: `−${fmtK(prCost)}, репутация спасена.`, fn: gg => { gg.money -= prCost; addLog(`📣 PR-кампания против антипиара: −${fmtK(prCost)}`, 'amber'); } },
        { text: 'Проигнорировать', desc: `−${repHit} репутации, лояльность клиентов −3.`, fn: gg => { gg.reputation = clamp((gg.reputation || 0) - repHit, 0, 100); if (typeof nudgeAllNPS === 'function') nudgeAllNPS(gg, -3); addLog(`📰 Антипиар без ответа: −${repHit} реп.`, 'red'); } },
      ] });
  });

  evs.push(() => { // обвал спроса
    const mkt = Math.round((-getCashflow(g)) * 1.0 * sev);
    _emitShowEvent({ icon: '📉', title: 'Обвал спроса', body: 'Рынок резко просел — заявок почти нет ближайшие 2 месяца.',
      choices: [
        { text: 'Демпинг-маркетинг', desc: `−${fmtK(mkt)}, поток заявок восстановлен.`, fn: gg => { gg.money -= mkt; const d = _directorState(gg); d.demandCrashUntil = -1; addLog(`📣 Антикризисный маркетинг: −${fmtK(mkt)}, спрос удержан`, 'amber'); } },
        { text: 'Переждать', desc: '−1..2 оффера на 2 месяца.', fn: gg => { const d = _directorState(gg); d.demandCrashUntil = (gg.month || 0) + 2; addLog('📉 Пережидаем обвал спроса (−офферы 2 мес)', 'red'); } },
      ] });
  });

  evs[Math.floor(Math.random() * evs.length)]();
}

// Бросок кризиса: мелкий (авто) или крупный (вилка), вероятность крупного растёт с давлением.
function _rollCrisis(g, pressure, diff) {
  const sev = DIRECTOR_SEVERITY[diff] ?? 1.0;
  const majorChance = [0, 0.30, 0.55, 0.80][Math.min(3, pressure)] || 0.3;
  _directorState(g).crises++;
  if (Math.random() < majorChance) _crisisMajor(g, pressure, sev);
  else _crisisMinor(g, pressure, sev);
}

// Месячный тик директора. Вызывается из advanceMonth после расходов.
function _directorTick(g = G) {
  if (!g) return;
  const d = _directorState(g);
  const diff = _directorDifficulty();
  const cap = DIRECTOR_COMFORT_CAP[diff] ?? 70;
  d.comfort = computeComfort(g);
  if (d.comfort > cap) d.streak = (d.streak || 0) + 1;
  else d.streak = Math.max(0, (d.streak || 0) - 2);   // дискомфорт быстро снимает давление
  d.pressure = Math.min(3, Math.floor((d.streak || 0) / 3));

  // 🌫 Глухой сезон (Ф.6) усиливает давление директора
  const slump = (typeof getActiveSeason === 'function') && getActiveSeason(g).id === 'slump';
  const effPressure = Math.min(3, (d.pressure || 0) + (slump ? 1 : 0));
  if (effPressure <= 0) return;

  const baseCd = DIRECTOR_CRISIS_CD[diff] ?? 5;
  const cd = Math.max(2, baseCd - (effPressure - 1));
  if (((g.month || 0) - (d.lastCrisisMonth || -99)) >= cd) {
    _rollCrisis(g, effPressure, diff);
    d.lastCrisisMonth = (g.month || 0);
  }
}

function _generateOffers() {
  const roll=Math.random()*100;
  const repBonus=(G.reputation-50)*0.2;
  const adjustedRoll=roll+repBonus;

  let offerCount;
  if      (adjustedRoll<=10) offerCount=0;
  else if (adjustedRoll<=40) offerCount=1;
  else if (adjustedRoll<=75) offerCount=2;
  else                       offerCount=3;

  if (hasRole('smm')) offerCount=Math.min(4, offerCount+1);
  if (G.caseScoutBonus>0) offerCount=Math.min(4, offerCount+(G.caseScoutBonus||0));
  // SMM-специализация: пассивно +1 оффер всегда (стек с HR-SMM)
  if (SPECS[G.spec]?.passive === 'scout_offers') offerCount=Math.min(5, offerCount+(SPECS[G.spec].passiveVal||0));
  // п.13: пассив второй специализации
  if (G.secondSpec && SPECS[G.secondSpec]?.passive === 'scout_offers') offerCount=Math.min(5, offerCount+(SPECS[G.secondSpec].passiveVal||0));
  // п.21 (Ф.6): сезонный бонус/штраф к количеству офферов
  { const sea = getSeasonMod(); offerCount = Math.max(0, Math.min(5, offerCount + sea.offerBonus)); }
  // Р.4: обвал спроса (кризис «Переждать») режет число офферов
  if (G.director && (G.director.demandCrashUntil || -1) >= (G.month || 0)) offerCount = Math.max(0, offerCount - 2);

  // Гейты тиров T1–T7 (v3.0): репутация + портфолио для эндгейма
  const _rep = G.reputation, _pf = G.portfolio || 0;
  let maxTier = (_rep>=95 && _pf>=80) ? 7
                : (_rep>=90 && _pf>=50) ? 6
                : (_rep>=85 && _pf>=30) ? 5
                : _rep>=80 ? 4 : _rep>=70 ? 3 : _rep>=40 ? 2 : 1;
  // Р.4: «невидимая рука» — в комфорте директор иногда срезает верхний тир офферов
  const _dpen = (typeof _directorOfferPenalty === 'function') ? _directorOfferPenalty(G) : { tierCut: 0, budgetMult: 1 };
  maxTier = Math.max(1, maxTier - (_dpen.tierCut || 0));

  // Rarity: legendary при rep≥90, epic при rep≥80, rare при rep≥60
  const rarityOk = r => {
    if (r==='legendary') return G.reputation >= 90;
    if (r==='epic')      return G.reputation >= 80;
    if (r==='rare')      return G.reputation >= 60;
    return true; // common/uncommon всегда
  };

  const pool=PROJECT_POOL.filter(p=>
    p.tier<=maxTier &&
    rarityOk(p.rarity||'common') &&
    (!p.requiresDev  || hasRole('developer')) &&
    (!p.minPortfolio || (G.portfolio||0)>=p.minPortfolio)
  );

  // Взвешенный выбор: вероятность из поля prob; epic/rare имеют меньший prob.
  // Ф.6: сезонный бюджет-множитель применяется ко ВСЕМ офферам (может быть и
  // отрицательным — «Глухой сезон»). Плюс тематический НАПЛЫВ: в сезон ~60%
  // офферов из проектов с season-тегом темы, обычный пул на период ужимается.
  const _sea       = getSeasonMod();
  // Сезонный бюджет × «невидимая рука» директора (усушка в комфорте) → итоговая доля
  const _seaBoost  = (1 + _sea.budgetBoost) * (_dpen.budgetMult || 1) - 1;
  const _seaTag    = _sea.pool;            // тег темы (или null)
  const _decorate  = p => ({ ...p, ...(_seaBoost !== 0 ? { _seasonBoost: _seaBoost } : {}), ...(_seaTag && p.season === _seaTag ? { _seasonHot: true } : {}) });

  const offers=[];
  const available = pool.filter(p => !G.activeClients.find(c=>c.id.startsWith(p.id)));
  const _shuf = arr => [...arr].sort(()=>Math.random()-0.5);
  const themed  = _seaTag ? available.filter(p => p.season === _seaTag) : [];
  const regular = available.filter(p => !_seaTag || p.season !== _seaTag);
  const shTheme = _shuf(themed), shReg = _shuf(regular);

  // Сколько слотов отдаём тематическим (наплыв) — ~60%, минимум 1, если они есть
  const wantThemed = (themed.length > 0) ? Math.min(themed.length, Math.max(1, Math.round(offerCount * 0.6))) : 0;

  const _pick = (src, limit, useProb) => {
    for (let i=0; i<src.length && offers.length<limit; i++){
      const p = src[i];
      if (offers.find(o=>o.id===p.id)) continue;
      if (!useProb || Math.random() < (p.prob||0.5)) offers.push(_decorate(p));
    }
  };
  // 1) тематический наплыв до квоты (с prob, затем гарантированный добор без prob),
  // 2) обычный пул до общего числа, 3) финальный добор без prob.
  const themedQuota = Math.min(offerCount, wantThemed);
  _pick(shTheme, themedQuota, true);
  if (offers.length < themedQuota) _pick(shTheme, themedQuota, false);   // гарантируем наплыв
  _pick(shReg, offerCount, true);
  if (offers.length < offerCount) { _pick(shTheme, offerCount, false); _pick(shReg, offerCount, false); }
  return offers;
}

function doScouting() {
  // Ф.7: гейт режима «Rogue-lite» (вне режима не блокирует)
  if (typeof isModuleUnlocked === 'function' && !isModuleUnlocked('scout')) {
    if (typeof notify === 'function') notify('🔒 Систематический скаутинг заперт — открой «Скаутинг» в Дереве открытий', 'error');
    return;
  }
  // Если пул уже есть — просто переоткрываем модал без затрат дней
  if (G.scoutPool && G.scoutPool.length>0) {
    showScoutResults(G.scoutPool);
    return;
  }
  if (G.actions<SCOUT_COST){ notify(`Нужно ≥${SCOUT_COST} дней — осталось ${G.actions}`,'error'); return; }
  G.actions-=SCOUT_COST;
  addLog(`🔍 Скаутинг проектов (−${SCOUT_COST} дня)`,'teal');
  G.scoutPool=_generateOffers();
  showScoutResults(G.scoutPool);
  _emitRender();
}

function refreshScoutPool() {
  if (G.actions<SCOUT_COST){ notify(`Нужно ≥${SCOUT_COST} дней — осталось ${G.actions}`,'error'); return; }
  G.actions-=SCOUT_COST;
  G.scoutPool=null;
  addLog(`🔄 Пул заказов обновлён (−${SCOUT_COST} дня)`,'teal');
  G.scoutPool=_generateOffers();
  showScoutResults(G.scoutPool);
  _emitRender();
}

// doLifecycleScouting удалён (v3.0): единый пул — все проекты идут через
// lifecycle-флоу из обычного «Скаутинга проектов»

// showScoutResults / closeScout / showConfirm — DOM-реализации в ui.js
// Engine emit-ит сигналы, UI рендерит модалы
function showScoutResults(offers) {
  EventBus.emit('show_scout', { offers });
}

function closeScout() {
  EventBus.emit('close_scout');
}

function showConfirm(icon, title, body, confirmText, confirmClass, onConfirm) {
  EventBus.emit('show_confirm', { icon, title, body, confirmText, confirmClass, onConfirm });
}

// ── Старые DOM-реализации (перенесены в ui.js как _uiShowScout/_uiCloseScout/_uiShowConfirm)
// Оставлены ниже как tombstone для истории, удаляются после переноса в Godot
function _legacyShowScout(offers) {
  const modal=document.getElementById('scout-modal');
  document.getElementById('scout-title').textContent=
    offers.length ? `Найдено проектов: ${offers.length}` : 'Скаутинг не дал результатов';
  document.getElementById('scout-sub').textContent=
    offers.length
      ? 'Можно взять несколько. Пул сохраняется — закрой, докупи перки и вернись.'
      : 'На рынке тишина. Попробуй снова в следующем месяце или улучши репутацию.';

  const grid=document.getElementById('scout-grid');
  grid.innerHTML='';

  offers.forEach(p=>{
    const curQ = getQuality(), curV = getVolume();
    const qOk  = curQ >= p.minQ;
    const vOk  = curV >= p.minV;
    const devOk  = !p.requiresDev  || hasRole('developer');
    const portOk = !p.minPortfolio || (G.portfolio||0) >= p.minPortfolio;
    const slotOk = G.activeClients.length < getCapacity();
    const onCooldown = !!(p.oneTime && p.cooldown && (G.oneTimeCooldown||0) > 0);
    const canTake = slotOk && qOk && vOk && devOk && portOk && !onCooldown;

    // Build req row: always show when there are any requirements
    const hasReqs = p.minQ > 0 || p.minV > 0 || p.requiresDev || p.minPortfolio > 0;
    let reqRow = '';
    if (onCooldown) {
      reqRow = `<div style="margin-top:7px"><span class="req-badge" style="background:rgba(168,85,247,.12);color:var(--purple);border-color:rgba(168,85,247,.3)">⏳ Следующий разовый заказ через ${G.oneTimeCooldown} мес.</span></div>`;
    } else if (!slotOk) {
      reqRow = `<div style="margin-top:7px"><span class="req-badge">⛔ Нет слота — нужен Менеджер (+2 слота)</span></div>`;
    } else if (hasReqs) {
      const chips = [];
      if (p.minQ > 0) chips.push(
        `<span style="font-size:11px;padding:2px 7px;border-radius:4px;background:${qOk?'rgba(63,185,80,.12)':'rgba(248,81,73,.1)'};color:${qOk?'var(--green)':'var(--red)'};font-weight:600">
          ${qOk?'✓':'✗'} Q: ${curQ}/${p.minQ}${!qOk?' — нанять Дизайнера':''}
        </span>`);
      if (p.minV > 0) chips.push(
        `<span style="font-size:11px;padding:2px 7px;border-radius:4px;background:${vOk?'rgba(63,185,80,.12)':'rgba(248,81,73,.1)'};color:${vOk?'var(--green)':'var(--red)'};font-weight:600">
          ${vOk?'✓':'✗'} V: ${curV}/${p.minV}${!vOk?' — нанять Копирайтера':''}
        </span>`);
      if (p.requiresDev) chips.push(
        `<span style="font-size:11px;padding:2px 7px;border-radius:4px;background:${devOk?'rgba(63,185,80,.12)':'rgba(248,81,73,.1)'};color:${devOk?'var(--green)':'var(--red)'};font-weight:600">
          ${devOk?'✓':'✗'} Разработчик${!devOk?' — нанять Разработчика':''}
        </span>`);
      if (p.minPortfolio > 0) chips.push(
        `<span style="font-size:11px;padding:2px 7px;border-radius:4px;background:${portOk?'rgba(168,85,247,.12)':'rgba(248,81,73,.1)'};color:${portOk?'var(--purple)':'var(--red)'};font-weight:600">
          ${portOk?'✓':'✗'} Портфолио: ${G.portfolio||0}/${p.minPortfolio}${!portOk?' — закрывай проекты':''}
        </span>`);
      reqRow = `<div style="margin-top:7px;display:flex;gap:6px;flex-wrap:wrap">${chips.join('')}</div>`;
    }

    // ── Мощность chip (скаут-карточка) ──
    const tierLoad  = getProjectLoad(p);
    const hasDelay  = p.modifier?.type==='payment_delay_fixed';
    const curLoad   = getTotalLoad();
    const curThr    = getTeamThroughput();
    const projLoad  = curLoad + (hasDelay ? 0 : tierLoad);
    const willOvld  = !hasDelay && projLoad > curThr;
    const loadBg    = willOvld ? 'rgba(248,81,73,.12)' : 'rgba(45,212,191,.1)';
    const loadCol   = willOvld ? 'var(--red)' : 'var(--teal)';
    const loadNote  = hasDelay
      ? `<span style="font-size:10px;color:var(--muted)">мощность начнёт тратиться через ${p.modifier.val} мес.</span>`
      : willOvld
        ? `<span style="font-size:10px;color:var(--red)">⚠ нужно ${projLoad} мощн., есть ${curThr}</span>`
        : `<span style="font-size:10px;color:var(--muted)">${projLoad} / ${curThr} мощн. после подписания</span>`;
    const loadRow = `<div style="margin-top:6px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      <span style="font-size:11px;padding:2px 7px;border-radius:4px;background:${loadBg};color:${loadCol};font-weight:600">⚙ ${tierLoad} мощн.</span>
      ${loadNote}
    </div>`;

    // ── Rarity badge ──
    const rarityMeta = {
      uncommon: { label:'Uncommon', col:'var(--teal)',   bg:'rgba(45,212,191,.12)', border:'rgba(45,212,191,.3)' },
      rare:     { label:'Rare',     col:'var(--purple)', bg:'rgba(168,85,247,.12)', border:'rgba(168,85,247,.3)' },
      epic:     { label:'✦ Epic',   col:'#f59e0b',       bg:'rgba(245,158,11,.12)', border:'rgba(245,158,11,.35)' },
    };
    const rMeta = rarityMeta[p.rarity];
    const rarityBadge = rMeta
      ? `<span style="font-size:10px;font-weight:700;padding:1px 6px;border-radius:4px;background:${rMeta.bg};color:${rMeta.col};border:1px solid ${rMeta.border};letter-spacing:.3px;text-transform:uppercase">${rMeta.label}</span>`
      : '';

    // Бейдж специализации — показывает бонус если проект подходит под текущий спек
    const _specDef  = SPECS[G.spec];
    const _specMatch = _specDef && (
      (p.type==='small' && _specDef.bonus==='small_income') ||
      (p.type==='corp'  && _specDef.bonus==='corp_income')  ||
      (p.type==='store' && _specDef.bonus==='store_income')
    );
    const specBadge = _specMatch
      ? `<span style="font-size:10px;font-weight:700;padding:1px 6px;border-radius:4px;background:rgba(63,185,80,.12);color:var(--green);border:1px solid rgba(63,185,80,.3)">★ +${Math.round(_specDef.bonusVal*100)}%</span>`
      : '';

    const card=document.createElement('div');
    card.className='project-card'+(canTake?'':' unavailable');
    if (p.rarity==='epic') card.style.cssText='border-color:rgba(245,158,11,.35);box-shadow:0 0 0 1px rgba(245,158,11,.15)';
    else if (p.rarity==='rare') card.style.cssText='border-color:rgba(168,85,247,.35)';
    card.innerHTML=`
      <div class="project-top">
        <div class="project-icon">${p.icon}</div>
        <div class="project-meta">
          <div class="project-name" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">${p.name}${rarityBadge}${specBadge}</div>
          <div class="project-desc">${p.desc}</div>
        </div>
      </div>
      <div class="project-bottom">
        ${(()=>{
          if (p.oneTime) {
            const revStr = (() => {
              const fb = p.fixedBudget;
              if (Array.isArray(fb)) return `${fmtK(fb[0])}–${fmtK(fb[1])}`;
              if (fb) return fmtK(fb);
              const [bMin, bMax] = BUDGET_RANGES[p.tier] || [90000, 165000];
              return `${fmtK(bMin)}–${fmtK(bMax)}`;
            })();
            return `<span class="project-rev">${revStr}</span>
        <span class="project-rev-label">разово</span>`;
          }
          const [bMin, bMax] = BUDGET_RANGES[p.tier] || BUDGET_RANGES[1];
          const mHint = p.tier===4 ? ' · 3 этапа' : p.tier===3 ? ' · 2 этапа' : p.tier===2 ? ' · 1 этап' : '';
          return `<span class="project-rev">${fmtK(bMin)}–${fmtK(bMax)}</span>
        <span class="project-rev-label">бюджет${mHint}</span>`;
        })()}
        <span class="modifier-badge ${p.modBadge}">${p.modifier.label}</span>
      </div>
      ${loadRow}
      ${(()=>{
        // v3.0: предоплата выбивается в переговорах — на карточке показываем шанс проекта
        if (p.oneTime) return '';
        const baseChance = p.prepayChance ?? [0, .25, .35, .45, .50, .55, .60, .65][p.tier || 1] ?? 0;
        if (baseChance <= 0) return `<div style="margin-top:6px;font-size:10px;color:var(--muted)">💸 Без предоплаты — оплата по ходу проекта</div>`;
        const withLawyer = hasRole('lawyer');
        const chance = Math.round(Math.min(0.95, baseChance + (withLawyer ? 0.15 : 0)) * 100);
        return `<div style="margin-top:6px;background:rgba(63,185,80,.08);border:1px solid rgba(63,185,80,.2);border-radius:6px;padding:5px 8px">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
            <span style="font-size:10px;color:var(--green);font-weight:600">💰 Аванс 30% можно выбить в переговорах</span>
            <span style="font-size:10px;font-weight:700;color:var(--green)">~${chance}%${withLawyer?' <span style="font-weight:400;color:var(--muted)">(⚖️ +15%)</span>':''}</span>
          </div>
        </div>`;
      })()}
      ${reqRow}
      ${canTake?`<button class="btn btn-primary btn-sm" style="width:100%;justify-content:center;margin-top:10px;" onclick="startSign('${p.id}')">Подписать контракт</button>`:''}
      ${canTake && negotiatorFree() > 0 ? (() => {
        const _ng = bestFreeNegotiator();
        const _gl = _ng ? ((typeof GRADE_CFG!=='undefined' && GRADE_CFG[_ng.grade] && GRADE_CFG[_ng.grade].label) || _ng.grade) : '';
        return `<button class="btn btn-sm" style="width:100%;justify-content:center;margin-top:6px;background:rgba(20,184,166,.12);color:#2dd4bf;border:1px solid rgba(20,184,166,.4);font-weight:700" title="Переговорщик авто-проведёт КП и условия по своему грейду (комиссия 5%). Свободно в этом месяце: ${negotiatorFree()}" onclick="delegateSign('${p.id}')">💼 Поручить переговорщику · ${_gl} <span style="opacity:.7;font-weight:500">(своб. ${negotiatorFree()})</span></button>`;
      })() : ''}
    `;
    grid.appendChild(card);
  });

  modal.classList.add('active');
} // end _legacyShowScout

function signProject(pid, opts) {
  const def=PROJECT_POOL.find(p=>p.id===pid);
  if (!def) return;
  if (G.activeClients.length>=getCapacity()){ notify('Нет свободного слота','error'); return; }

  // Блокируем oneTime-проект с cooldown, пока кулдаун активен
  if (def.oneTime && def.cooldown && (G.oneTimeCooldown||0) > 0) {
    notify(`⏳ Разовый заказ доступен через ${G.oneTimeCooldown} мес.`, 'error');
    return;
  }

  // Бюджет: диапазон/число из fixedBudget (oneTime) или случайный из BUDGET_RANGES тира
  const totalBudget = (() => {
    const fb = def.fixedBudget;
    const _sea = 1 + (def._seasonBoost || 0); // п.21 (Ф.6): Q4 буст бюджета
    if (Array.isArray(fb)) return Math.round((fb[0] + Math.random() * (fb[1] - fb[0])) * _sea / 1000) * 1000;
    if (fb) return Math.round(fb * _sea / 1000) * 1000;
    const [bMin, bMax] = BUDGET_RANGES[def.tier] || BUDGET_RANGES[1];
    return Math.round((bMin + Math.random() * (bMax - bMin)) * _sea / 5000) * 5000;
  })();

  // Milestone-выплаты: T2 — 40% при 50%; T3–T4 — 30%+30% при 33/66;
  // T5–T7 (v3.0) — 25%×3 при 25/50/75. Сглаживают кассовый разрыв длинных
  // контрактов, не увеличивая сумму. «Поэтапная оплата» в переговорах их заменяет.
  const _mThresholds = def.oneTime ? [] : def.tier===2 ? [50] : def.tier>=5 ? [25,50,75] : def.tier>=3 ? [33,66] : [];
  const _mPayPcts    = def.oneTime ? [] : def.tier===2 ? [0.40] : def.tier>=5 ? [0.25,0.25,0.25] : def.tier>=3 ? [0.30,0.30] : [];

  const client={
    ...def,
    id: pid+'_'+G.month,
    _monthsSigned: 0,
    // Дедлайн: явный _duration/duration или тир-дефолт. Длительности от
    // модели затрат: T1 4, T2 7, T3 10, T4 12, T5 14, T6 17, T7 20 мес (v3.0)
    _duration: def.oneTime ? 1 : (def._duration || def.duration ||
      ([0, 4, 7, 10, 12, 14, 17, 20][def.tier] ?? 12)),
    _originalBudget: totalBudget,  // для расчёта milestone — до вычета аванса
    _totalBudget: totalBudget,
    _progress: 0,   // 0–100%
    _milestones: _mThresholds,     // массив порогов прогресса [%]
    _milestonePcts: _mPayPcts,     // доля от _originalBudget для каждого milestone
    _milestonesPaid: [],           // индексы уже выплаченных milestone
    _assignedStaff: [],            // массив _iid назначенных сотрудников
  };

  // nps_start: override starting NPS
  if (client.modifier.type==='nps_start') {
    client.npsStart=Math.min(100, (def.npsStart||70)+def.modifier.val);
  }

  // Пассивные бонусы специализации при подписании
  const _spec = SPECS[G.spec];
  if (_spec?.passive === 'nps_start' && !client.oneTime) {
    // SEO: +passiveVal NPS всем клиентам
    client.npsStart = Math.min(100, (client.npsStart||70) + (_spec.passiveVal||0));
  }
  if (_spec?.passive === 'nps_start_store' && client.type === 'store') {
    // Brand: +passiveVal NPS только store-клиентам
    client.npsStart = Math.min(100, (client.npsStart||70) + (_spec.passiveVal||0));
  }
  // п.13: пассивы второй специализации
  const _spec2 = G.secondSpec ? SPECS[G.secondSpec] : null;
  if (_spec2?.passive === 'nps_start' && !client.oneTime)
    client.npsStart = Math.min(100, (client.npsStart||70) + (_spec2.passiveVal||0));
  if (_spec2?.passive === 'nps_start_store' && client.type === 'store')
    client.npsStart = Math.min(100, (client.npsStart||70) + (_spec2.passiveVal||0));

  // п.19 (Ф.3): применяем выбор из Переговорного аудита
  if (G._pendingNegAudit && G._pendingNegAudit.pid === pid) {
    const _na = G._pendingNegAudit;
    if (_na.prepayBoost) client._negPrepayBoost = _na.prepayBoost;
    if (_na.scopeBoost) {
      client._totalBudget    = Math.round(client._totalBudget * 1.15);
      client._originalBudget = client._totalBudget;
      client._duration       = (client._duration || 4) + 1;
    }
    if (_na.budgetBoost) {
      client._totalBudget    = Math.round(client._totalBudget * (1 + _na.budgetBoost));
      client._originalBudget = client._totalBudget;
    }
    if (_na.moodHit) client._negMoodPending = _na.moodHit;
    G._pendingNegAudit = null;
  }

  G.activeClients.push(client);
  G.clientNPS[client.id]=client.npsStart||70;
  G.clientEarnings[client.id]=0;

  // п.19 (Ф.3): применяем отложенный штраф настроения от аудита
  if (client._negMoodPending) {
    G.clientNPS[client.id] = Math.max(0, Math.min(100, (G.clientNPS[client.id]||70) + client._negMoodPending));
    delete client._negMoodPending;
  }

  // Immediate modifier effects
  if (client.modifier.type==='reputation'){
    const repHit=hasRole('lawyer') ? Math.round(client.modifier.val*0.5) : client.modifier.val;
    G.reputation=clamp(G.reputation+repHit,0,100);
    addLog(`⚠️ Репутация: ${repHit} (серая зона${hasRole('lawyer')?' — юрист −50%':''})`,'red');
  }

  addLog(`✅ Подписан: ${client.name} — бюджет ${fmtK(totalBudget)}`,'green');
  notify(`${client.icon} ${client.name} — контракт подписан!`,'success');
  rd(`Подписан: ${client.name}`,'client');

  // Предоплата при подписании удалена (v3.0): аванс теперь выбивается
  // в переговорах (F2) с шансом prepayChance проекта — см. projects.js

  // Устанавливаем кулдаун для oneTime-проектов с ограничением
  if (def.oneTime && def.cooldown) {
    G.oneTimeCooldown = def.cooldown;
    addLog(`⏳ Следующий разовый заказ доступен через ${def.cooldown} мес.`, 'muted');
  }

  // ── v3.0: ВСЕ проекты идут через lifecycle-флоу ──────
  // Убираем подписанный из пула, пул остаётся открытым если есть ещё офферы
  if (G.scoutPool) G.scoutPool = G.scoutPool.filter(p => p.id !== pid);
  if (G.scoutPool && G.scoutPool.length === 0) G.scoutPool = null;
  closeScout();
  if (typeof Projects !== 'undefined') {
    Projects.initLCState(client);
    if (opts && opts.autoNeg && typeof Projects.autoResolveNegotiation === 'function') {
      // Ф.3: переговорщик авто-проходит КП+условия по своему грейду
      Projects.autoResolveNegotiation(client, opts.autoNeg);
      _applyNegotiatorDeal(client, opts.autoNeg);
      notify(`💼 ${opts.autoNeg.name} закрыл переговоры по «${client.name}»`, 'success');
    } else {
      Projects.showPhasePopup(client);
    }
  }
  _emitRender();
}

// п.19 (Ф.3): Переговорный аудит — перехватывает нажатие «Подписать»
// Если пёрк negotiator куплен — показывает pre-sign аудит через Projects.
// Иначе — прямой вызов signProject.
function startSign(pid) {
  // Ф.3 (v3.72): pre-sign аудит из v3.47 убран — ручное подписание идёт напрямую
  // в переговорный флоу. Авто-переговоры теперь у нанимаемого переговорщика
  // (delegateSign → signProject{autoNeg}). Перк negotiator → −50% комиссии.
  signProject(pid);
}

// ══════════════════════════════════════════════════════
//  HIRE
// ══════════════════════════════════════════════════════
function hireStaff(id) {
  // Ф.7: гейт режима «Rogue-lite» (вне режима isModuleUnlocked→true, не блокирует)
  if (typeof isModuleUnlocked === 'function' && !isModuleUnlocked('hire')) {
    if (typeof notify === 'function') notify('🔒 Найм заперт — открой «Найм» в Дереве открытий', 'error');
    return;
  }
  const def=STAFF_DEFS.find(d=>d.id===id);
  if (!def) return;
  if ((G.teamFatigue||0) >= 85) { notify('🔥 Кризис усталости — найм временно недоступен','error'); return; }
  // Проверка unlock-условий грейда
  if (def.unlockCond) {
    if (def.unlockCond.minRep && G.reputation < def.unlockCond.minRep) {
      notify(`🔒 ${def.name} — нужна репутация ≥${def.unlockCond.minRep}`, 'error'); return;
    }
    if (def.unlockCond.minPortfolio && (G.portfolio||0) < def.unlockCond.minPortfolio) {
      notify(`🔒 ${def.name} — нужно портфолио ≥${def.unlockCond.minPortfolio}`, 'error'); return;
    }
  }
  const dayCost=hasRole('hr') ? 1 : HIRE_COST;
  if (G.actions<dayCost){ notify(`Нужно ≥${dayCost} рабочих дня`,'error'); return; }
  if (G.money<def.cost*2){ notify('Мало денег — нужен запас ≥2 зарплаты','error'); return; }
  const instance={...def, _iid: def.id+'_m'+G.month+'_n'+G.staff.length};
  G.staff.push(instance);
  G.actions-=dayCost;
  addLog(`👥 Нанят ${def.name} (−${fmt(def.cost)}/мес, −${dayCost} дня)`,'amber');
  notify(`${def.name} принят! ${def.icon}`,'success');
  rd(`Нанят ${def.name}`,'hire');
  _emitRender();
}

// ══════════════════════════════════════════════════════
//  Q UPGRADES
// ══════════════════════════════════════════════════════
function buyUpgrade(id) {
  const def = UPGRADES.find(u => u.id === id);
  if (!def) return;
  if (def.draft) { notify('⚗ Этот перк в разработке — появится в следующем обновлении', 'info'); return; }
  // Дерево 2.0: связи и взаимоисключения
  if (def.requires && def.requires.some(id => !G.upgrades[id])) {
    notify('🔗 Сначала изучи связанные узлы дерева', 'error'); return;
  }
  if (def.excludes && def.excludes.some(id => G.upgrades[id])) {
    notify('⛔ Закрыто выбором другой ветки', 'error'); return;
  }
  if (def.oneTime && G.upgrades[id]) { notify('Уже куплено ✓','error'); return; }
  if (!def.oneTime && !def.fatigueReduce && G.tempQBonus >= def.qBonus) { notify('Фриланс уже активен этот месяц','error'); return; }
  if (G.actions < def.days) { notify(`Нужно ≥${def.days} дн.`,'error'); return; }
  if (G.money < def.cost)   { notify('Мало денег','error'); return; }

  // ── Действия восстановления усталости ───────────────
  if (def.fatigueReduce) {
    const cd = (G.fatigueActionCooldowns||{})[def.id] || 0;
    if (cd > 0) { notify(`⏳ Доступно через ${cd} мес.`, 'error'); return; }
    if (def.minFatigue && (G.teamFatigue||0) < def.minFatigue) {
      notify(`Усталость команды ещё слишком низкая — нужно ≥${def.minFatigue}`, 'error'); return;
    }
    G.money   -= def.cost;
    G.actions -= def.days;
    const before = Math.round(G.teamFatigue||0);
    G.teamFatigue = clamp((G.teamFatigue||0) - def.fatigueReduce, 0, 100);
    const after = Math.round(G.teamFatigue);
    if (!G.fatigueActionCooldowns) G.fatigueActionCooldowns = {};
    if (def.cooldownMonths) G.fatigueActionCooldowns[def.id] = def.cooldownMonths;
    const ftLabel = after >= 85 ? 'Кризис' : after >= 60 ? 'Выгорание' : after >= 30 ? 'Напряжение' : 'Норма';
    addLog(`${def.icon} ${def.name}: усталость ${before} → ${after} (${ftLabel})`, 'green');
    notify(`${def.icon} ${def.name} — усталость −${before - after} → ${after} (${ftLabel})`, 'success');
    rd(`${def.name}`, 'event');
    // п.8 (Р.1): восстановление команды → клиенты замечают позитивный настрой
    { const _ftT = G.activeClients.filter(c => !c.oneTime);
      if (_ftT.length > 0) { const _t = _ftT[Math.floor(Math.random()*_ftT.length)]; nudgeClientRating(_t, +5); addLog(`✨ «${_t.name}» замечает, что команда отдохнула: настроение +5`, 'teal'); } }
    _emitRender();
    return;
  }

  G.money   -= def.cost;
  G.actions -= def.days;

  if (def.oneTime) {
    G.upgrades[id]    = true;
    if (def.qBonus)    G.qualityBonus += def.qBonus;
    if (def.speedBonus) G.speedUpgrades = Math.round(((G.speedUpgrades||0) + def.speedBonus) * 1000) / 1000;
    if (def.repBonus)  G.reputation = clamp(G.reputation + def.repBonus, 0, 100);
    // Пассивные пермы дерева 2.0 (постоянные, в отличие от recovery-акций)
    if (def.fatigueRateMult) G.perkFatigueMult   = Math.round(((G.perkFatigueMult ?? 1) * def.fatigueRateMult) * 100) / 100;
    if (def.recoveryBonus)   G.perkRecoveryBonus = (G.perkRecoveryBonus || 0) + def.recoveryBonus;
    if (def.prepayBonus)     G.perkPrepayBonus   = Math.round(((G.perkPrepayBonus || 0) + def.prepayBonus) * 100) / 100;
    if (def.payoutMult)      G.perkPayoutMult    = Math.round(((G.perkPayoutMult || 0) + def.payoutMult) * 100) / 100;
    if (def.penaltyShield)   G.perkPenaltyShield = true;
    const parts = [];
    if (def.qBonus)    parts.push(`Q +${def.qBonus}`);
    if (def.speedBonus) parts.push(`Speed +${Math.round(def.speedBonus*100)}%`);
    if (def.repBonus)  parts.push(`Реп +${def.repBonus}`);
    if (def.fatigueRateMult) parts.push(`рост усталости ×${def.fatigueRateMult}`);
    if (def.recoveryBonus)   parts.push(`отдых +${def.recoveryBonus}/мес`);
    if (def.prepayBonus)     parts.push(`аванс +${Math.round(def.prepayBonus*100)}%`);
    if (def.payoutMult)      parts.push(`выплаты +${Math.round(def.payoutMult*100)}%`);
    if (def.penaltyShield)   parts.push(`просрочки −50% репутации`);
    const label = parts.join(', ') || '✓';
    addLog(`${def.icon} ${def.name}: ${label}`, 'teal');
    notify(`${def.icon} ${def.name} — ${label}!`, 'success');
  } else {
    G.tempQBonus += def.qBonus;
    addLog(`${def.icon} ${def.name}: Q +${def.qBonus} до конца месяца`, 'teal');
    notify(`${def.icon} Фриланс-дизайнер — +${def.qBonus} Q этот месяц`, 'success');
  }
  rd(`${def.name}`, 'event');
  _emitRender();
}

// ══════════════════════════════════════════════════════
//  FATIGUE ACTIONS  (обходит блокировку tree2 из livingmarket.js)
// ══════════════════════════════════════════════════════
function buyFatigueAction(id) {
  const def = UPGRADES.find(u => u.id === id);
  if (!def || !def.fatigueReduce) return;
  const cd = (G.fatigueActionCooldowns || {})[def.id] || 0;
  if (cd > 0) { notify(`⏳ Доступно через ${cd} мес.`, 'error'); return; }
  if (def.minFatigue && (G.teamFatigue || 0) < def.minFatigue) {
    notify(`Усталость команды слишком низкая — нужно ≥${def.minFatigue}`, 'error'); return;
  }
  if (G.actions < def.days) { notify(`Нужно ≥${def.days} дн.`, 'error'); return; }
  if (G.money < def.cost)   { notify('Мало денег', 'error'); return; }
  G.money   -= def.cost;
  G.actions -= def.days;
  const before = Math.round(G.teamFatigue || 0);
  G.teamFatigue = clamp((G.teamFatigue || 0) - def.fatigueReduce, 0, 100);
  const after = Math.round(G.teamFatigue);
  if (!G.fatigueActionCooldowns) G.fatigueActionCooldowns = {};
  if (def.cooldownMonths) G.fatigueActionCooldowns[def.id] = def.cooldownMonths;
  const ftLabel = after >= 85 ? 'Кризис' : after >= 60 ? 'Выгорание' : after >= 30 ? 'Напряжение' : 'Норма';
  addLog(`${def.icon} ${def.name}: усталость ${before} → ${after} (${ftLabel})`, 'green');
  notify(`${def.icon} ${def.name} — усталость −${before - after} → ${after} (${ftLabel})`, 'success');
  rd(`${def.name}`, 'event');
  // п.8 (Р.1): восстановление команды → клиенты замечают позитивный настрой
  { const _ftT = G.activeClients.filter(c => !c.oneTime);
    if (_ftT.length > 0) { const _t = _ftT[Math.floor(Math.random()*_ftT.length)]; nudgeClientRating(_t, +5); addLog(`✨ «${_t.name}» замечает, что команда отдохнула: настроение +5`, 'teal'); } }
  _emitRender();
}

// ══════════════════════════════════════════════════════
//  CONFIRM HELPER  (reuses event-modal)
// ══════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════
//  FIRE STAFF
// ══════════════════════════════════════════════════════
function fireStaff(iid) {
  const s = G.staff.find(x => x._iid === iid);
  if (!s) return;
  const severance = Math.round(s.cost * 0.5);
  showConfirm(
    '👋', `Уволить ${s.name}?`,
    `Выходное пособие: ${fmt(severance)} (50% оклада). Потеряете бонусы этого сотрудника к Q/V/слотам.`,
    `Уволить — выплатить ${fmt(severance)}`, 'red',
    () => {
      G.staff = G.staff.filter(x => x._iid !== iid);
      G.money -= severance;
      addLog(`👋 ${s.name} уволен. Выходное пособие −${fmt(severance)}`, 'amber');
      notify(`${s.icon} ${s.name} уволен`, 'warning');
      rd(`Уволен ${s.name} (−${fmt(severance)})`, 'hire');
      checkCapacityExceeded(s.name);
      _emitRender();
    }
  );
}

// ══════════════════════════════════════════════════════
//  TERMINATE CONTRACT
// ══════════════════════════════════════════════════════
function terminateContract(cid) {
  const c = G.activeClients.find(a => a.id === cid);
  if (!c) return;
  const prepaid = c._prepaidAmount || 0;
  const prepaidReturnNote = prepaid > 0
    ? ` Аванс ${fmtK(prepaid)} придётся вернуть${hasRole('lawyer') ? ' (юрист: −50% штрафа → ' + fmtK(Math.round(prepaid*0.5)) + ')' : ''}.`
    : '';
  showConfirm(
    '🚫', `Расторгнуть контракт с ${c.name}?`,
    `Досрочное расторжение: −10 репутации. Клиент уходит недовольным — это повлияет на входящие предложения.${prepaidReturnNote}`,
    'Расторгнуть контракт', 'red',
    () => {
      G.completedProjects=G.completedProjects||[];
      G.completedProjects.push({
        id:cid, name:c.name, icon:c.icon, revenue:c.revenue, tier:c.tier||1,
        finalNPS:Math.round(G.clientNPS[cid]||50), monthCompleted:G.month,
        terminated:true, failed:false, _cased:false,
      });
      releaseProjectTeam(cid); // Б.9
      G.activeClients = G.activeClients.filter(a => a.id !== cid);
      delete G.clientNPS[cid];
      G.reputation = clamp(G.reputation - 10, 0, 100);
      addLog(`🚫 Расторгнут контракт с ${c.name} (−10 репутации)`, 'red');
      // П.15: возврат аванса клиенту при расторжении
      if (prepaid > 0) {
        const returnAmt = hasRole('lawyer') ? Math.round(prepaid * 0.5) : prepaid;
        G.money = clamp(G.money - returnAmt, -Infinity, Infinity);
        addLog(`💸 Возврат аванса «${c.name}»: −${fmtK(returnAmt)}${hasRole('lawyer') ? ' (юрист −50%)' : ''}`, 'red');
      }
      notify(`${c.icon} Контракт с ${c.name} расторгнут`, 'error');
      rd(`Расторгнут: ${c.name}`, 'churn');
      _emitRender();
    }
  );
}

// Принудительное расторжение без confirm-диалога (для capacity-exceeded модала)
function _forceTerminate(cid) {
  const c = G.activeClients.find(a => a.id === cid);
  if (!c) return;
  G.completedProjects = G.completedProjects || [];
  G.completedProjects.push({
    id:cid, name:c.name, icon:c.icon, revenue:c.revenue, tier:c.tier||1,
    finalNPS:Math.round(G.clientNPS[cid]||50), monthCompleted:G.month,
    terminated:true, failed:false, _cased:false,
  });
  releaseProjectTeam(cid); // Б.9
  G.activeClients = G.activeClients.filter(a => a.id !== cid);
  delete G.clientNPS[cid];
  G.reputation = clamp(G.reputation - 10, 0, 100);
  addLog(`🚫 Расторгнут «${c.name}» из-за потери менеджера (−10 реп.)`, 'red');
  const prepaid = c._prepaidAmount || 0;
  if (prepaid > 0) {
    const ret = hasRole('lawyer') ? Math.round(prepaid*0.5) : prepaid;
    G.money = clamp(G.money - ret, -Infinity, Infinity);
    addLog(`💸 Возврат аванса «${c.name}»: −${fmtK(ret)}`, 'red');
  }
  notify(`${c.icon} Контракт с ${c.name} расторгнут`, 'error');
  rd(`Расторгнут (capacity): ${c.name}`, 'churn');
}

// Проверка переполнения capacity после ухода сотрудника.
// Вызывается после fireStaff, fatigue-quit, event-quit.
function checkCapacityExceeded(leaverName) {
  const cap    = getCapacity();
  const active = G.activeClients.filter(c => !c.oneTime);
  const excess = active.length - cap;
  if (excess <= 0) return;

  // Строим синтетическое событие через существующий showEvent механизм.
  // Каждый «лишний» проект — отдельная кнопка выбора.
  const choices = active.map(c => ({
    text:  `Расторгнуть «${c.name}» (T${c.tier}, прогресс ${Math.round(c._progress||0)}%) — −10 реп.`,
    desc:  `${fmtK(c._totalBudget||0)} потеряно. ${c._prepaidAmount?`Аванс ${fmtK(c._prepaidAmount)} возвращается.`:''}`,
    fn:    () => { _forceTerminate(c.id); _emitRender(); },
  }));

  _emitShowEvent({
    icon:    '⚠️',
    title:   'Превышен лимит проектов',
    body:    `После ухода ${leaverName} свободных слотов: ${cap}, активных проектов: ${active.length}. ` +
             `Нужно расторгнуть ${excess} контракт${excess===1?'':'а'} — выбери ${excess===1?'его':'один за другим'}.`,
    choices,
  });
}

// ══════════════════════════════════════════════════════
//  PORTFOLIO CASES
// ══════════════════════════════════════════════════════

// Рассчитывает грейд кейса по трём факторам: Q компании, время сборки, финальный NPS.
// Провальные и досрочно расторгнутые проекты имеют кап по score.
function calcCaseGrade(project, daysSpent) {
  const q=getQuality();
  const nps=project.finalNPS||50;
  let score=0;

  // Q factor (0–3)
  if      (q>=30) score+=3;
  else if (q>=20) score+=2;
  else if (q>=10) score+=1;

  // Time factor (1–3) — дни в шкале произв. календаря (2/4/6)
  score+=Math.min(3, Math.round(daysSpent/2));

  // NPS factor (0–3)
  if      (nps>=70) score+=3;
  else if (nps>=55) score+=2;
  else if (nps>=40) score+=1;

  // Штраф: провал или досрочное расторжение ограничивают максимум
  if (project.failed)     score=Math.min(score,3); // cap → bad/normal
  if (project.terminated) score=Math.min(score,5); // cap → normal/good

  if (score>=8) return 'excellent';
  if (score>=6) return 'good';
  if (score>=4) return 'normal';
  return 'bad';
}

function buildCase(projectId, daysSpent) {
  const project=G.completedProjects.find(p=>p.id===projectId);
  if (!project) return;
  if (project._cased)     { notify('Кейс уже собран','error'); return; }
  if (G.actions<daysSpent){ notify(`Нужно ≥${daysSpent} рабочих дня`,'error'); return; }

  G.actions-=daysSpent;
  const grade=calcCaseGrade(project, daysSpent);
  const gd=CASE_GRADES[grade];

  // Провальный кейс в портфолио даёт штраф репутации каждый месяц пока находится там
  const repPenalty=project.failed ? 1 : 0;

  const newCase={
    id:'case_'+G.month+'_'+G.cases.length,
    projectId:projectId,
    name:project.name, icon:project.icon, tier:project.tier,
    grade:grade,
    qBonus:gd.qBonus, repBonus:gd.repBonus, scoutBonus:gd.scoutBonus,
    repPenalty:repPenalty,
    assembledMonth:G.month, daysSpent:daysSpent, finalNPS:project.finalNPS,
    failed:project.failed||false,
  };

  G.cases.push(newCase);
  G.caseQBonus=(G.caseQBonus||0)+newCase.qBonus;
  G.caseRepBonus=(G.caseRepBonus||0)+newCase.repBonus;
  G.caseScoutBonus=(G.caseScoutBonus||0)+newCase.scoutBonus;
  G.caseRepPenalty=(G.caseRepPenalty||0)+newCase.repPenalty;
  project._cased=true;

  const bonusLine=[
    newCase.qBonus>0?`Q+${newCase.qBonus}`:'',
    newCase.repBonus>0?`Реп+${newCase.repBonus}/мес`:'',
    newCase.scoutBonus>0?`+${newCase.scoutBonus} лид`:'',
  ].filter(Boolean).join(', ');

  addLog(`📁 Кейс «${project.name}» — ${gd.icon} ${gd.label}${bonusLine?' ('+bonusLine+')':''}`, 'purple');
  notify(`${gd.icon} Кейс собран: ${gd.label}`, 'success');
  rd(`Кейс: ${project.name} (${gd.label})`, 'event');
  renderPortfolioTab();
  _emitRender();
}

function removeCase(caseId) {
  const c=G.cases.find(x=>x.id===caseId);
  if (!c) return;
  const gd=CASE_GRADES[c.grade];
  showConfirm(
    '🗑️', `Убрать кейс «${c.name}»?`,
    `Бонусы будут сняты: ${gd.desc}. Кейс можно пересобрать позже.`,
    'Убрать из портфолио', 'amber',
    () => {
      G.cases=G.cases.filter(x=>x.id!==caseId);
      G.caseQBonus=Math.max(0,(G.caseQBonus||0)-c.qBonus);
      G.caseRepBonus=Math.max(0,(G.caseRepBonus||0)-c.repBonus);
      G.caseScoutBonus=Math.max(0,(G.caseScoutBonus||0)-c.scoutBonus);
      G.caseRepPenalty=Math.max(0,(G.caseRepPenalty||0)-(c.repPenalty||0));
      const p=G.completedProjects.find(x=>x.id===c.projectId);
      if (p) p._cased=false;
      addLog(`🗑️ Кейс «${c.name}» убран из портфолио`,'amber');
      renderPortfolioTab();
      _emitRender();
    }
  );
}

function completeProject(cid) {
  const c = G.activeClients.find(a => a.id === cid);
  if (!c) return;

  // Блокировка: прогресс должен быть 100% (Math.round убирает float-погрешность ≤0.5%)
  if (Math.round(c._progress||0) < 100) {
    notify('Проект ещё не завершён — прогресс < 100%', 'error');
    return;
  }

  const overdueMonths = Math.max(0, (c._monthsSigned||0) - (c._duration||99));
  const penaltyPct    = Math.min(0.40, overdueMonths * 0.10); // −10%/мес, макс −40%
  const onTime        = overdueMonths === 0;
  const finalNPS      = Math.round(G.clientNPS[cid] ?? 50);

  // ── Базовый расчёт выплаты ──
  let payout = Math.round((c._totalBudget||0) * (1 - penaltyPct));

  // revenue_growth: бюджет растёт с каждым месяцем работы
  if (c.modifier?.type === 'revenue_growth') {
    payout = Math.round(payout * Math.pow(1 + c.modifier.val, c._monthsSigned||0));
  }

  // nps_penalty: снижаем выплату если NPS упал ниже порога
  if (c.modifier?.type === 'nps_penalty' && finalNPS < c.modifier.threshold) {
    const penAmount = hasRole('lawyer') ? Math.round(c.modifier.val * 0.5) : c.modifier.val;
    payout = Math.max(0, payout + penAmount); // val отрицательный
    addLog(`📋 KPI-штраф от «${c.name}»: ${fmtK(penAmount)}${hasRole('lawyer')?' (юрист −50%)':''}`, 'red');
  }

  // Бонус специализации
  const spec = SPECS[G.spec];
  const _specApplied = (c.type==='small' && spec.bonus==='small_income') ||
                       (c.type==='corp'  && spec.bonus==='corp_income')  ||
                       (c.type==='store' && spec.bonus==='store_income');
  if (_specApplied) payout = Math.round(payout * (1+spec.bonusVal));
  const _specTag = _specApplied ? ` | ★ ${spec.name} +${Math.round(spec.bonusVal*100)}%` : '';
  // п.13: бонус второй специализации к выплате
  const _spec2p = G.secondSpec ? SPECS[G.secondSpec] : null;
  if (_spec2p) {
    const _spec2Applied = (c.type==='small' && _spec2p.bonus==='small_income') ||
                          (c.type==='corp'  && _spec2p.bonus==='corp_income')  ||
                          (c.type==='store' && _spec2p.bonus==='store_income');
    if (_spec2Applied) payout = Math.round(payout * (1+_spec2p.bonusVal));
  }

  // Портфолио-мультипликатор
  payout = Math.round(payout * getPortfolioMultiplier());

  // п.9 (Р.2): Q-бонус к выплате — avgQ выше 40 → до +20% к итоговой выплате
  const _avgQ = G.staff.length > 0 ? Math.round(getQuality() / G.staff.length) : 50;
  const _qPayoutAdd = Math.min(0.20, Math.max(0, (_avgQ - 40) / 300));
  let _qPayoutTag = '';
  if (_qPayoutAdd > 0.001) {
    const _qBonus = Math.round(payout * _qPayoutAdd);
    payout += _qBonus;
    _qPayoutTag = ` | Q×${Math.round(_qPayoutAdd * 100)}%`;
  }
  // NPS-буст при высоком avgQ (Q>70 → до +8)
  const _qNpsBoost = _avgQ > 70 ? Math.min(8, Math.round((_avgQ - 70) / 5)) : 0;
  if (_qNpsBoost > 0) nudgeClientRating(c, _qNpsBoost);

  // payment_delay: шанс задержать часть выплаты на месяц
  let immediatePayment = payout;
  if (c.modifier?.type === 'payment_delay' && Math.random() < c.modifier.val) {
    const delayed = Math.round(payout * 0.30);
    immediatePayment -= delayed;
    G.delayedIncome = (G.delayedIncome||0) + delayed;
    addLog(`🕐 «${c.name}»: часть оплаты ${fmtK(delayed)} задержана — придёт в след. месяце`, 'amber');
  }

  G.money += immediatePayment;
  G.clientEarnings[cid] = payout;

  // Портфолио и репутация
  const pfBonus  = Math.round((c.portfolioWeight || c.tier || 1) * 3);
  const repGain  = onTime ? 3 : 0;
  G.portfolio    = (G.portfolio||0) + pfBonus;
  if (repGain > 0) G.reputation = clamp(G.reputation + repGain, 0, 100);

  // Push в completedProjects для кейсов
  G.completedProjects = G.completedProjects || [];
  G.completedProjects.push({
    id: cid, name: c.name, icon: c.icon, tier: c.tier,
    failed: false, terminated: false, completed: true, onTime: onTime,
    finalNPS: finalNPS, totalEarned: payout, _cased: false,
  });

  releaseProjectTeam(cid); // Б.9
  G.activeClients = G.activeClients.filter(a => a.id !== cid);
  delete G.clientNPS[cid];

  const timeTag  = onTime ? '✅ в срок' : '⚠️ с опозданием';
  const penTag   = penaltyPct > 0 ? ` (−${Math.round(penaltyPct*100)}% штраф)` : '';
  addLog(`🏁 «${c.name}» ${timeTag} → +${fmtK(immediatePayment)}${penTag}${_specTag}${_qPayoutTag} | NPS ${finalNPS} | Порт. +${pfBonus}${repGain>0?' | Реп +'+repGain:''}`, onTime ? 'green' : 'amber');
  notify(`🏁 «${c.name}» ${timeTag} → +${fmtK(immediatePayment)}`, onTime ? 'success' : 'info');
  rd(`Завершён: ${c.name} → +${fmtK(immediatePayment)} ${timeTag}`, 'event');

  renderPortfolioTab();
  _emitRender();
}

// ══════════════════════════════════════════════════════
//  CREDIT LINES
// ══════════════════════════════════════════════════════

// Все тиры с флагом доступности по текущей репутации
function getLoansInfo(rep) {
  return LOAN_TIERS.map(t => ({ ...t, available: rep >= t.minRep }));
}

// Обратная совместимость (используется в симуляторе)
function getLoanTier(rep) {
  return [...LOAN_TIERS].reverse().find(t => rep >= t.minRep) || null;
}

function takeLoanById(tierId) {
  if (G.loan) { notify('Активный кредит ещё не погашен', 'error'); return; }
  const tier = LOAN_TIERS.find(t => t.id === tierId);
  if (!tier) return;
  if (G.reputation < tier.minRep) { notify(`Нужна репутация ≥${tier.minRep}`, 'error'); return; }

  const _doTakeLoan = () => {
    G.money += tier.principal;
    G.loan = {
      principal:        tier.principal,
      monthlyPayment:   tier.monthlyPayment,
      monthsRemaining:  tier.months,
      label:            tier.label,
      icon:             tier.icon,
      debuff:           tier.debuff || null,
    };
    // Разовый дебафф репутации — применяется немедленно
    if (tier.debuff?.type === 'rep_penalty') {
      G.reputation = clamp(G.reputation + tier.debuff.val, 0, 100);
      addLog(`📉 Кредит «${tier.label}»: ${tier.debuff.label}`, 'red');
    }
    const debuffNote = tier.debuff ? ` ⚠️ ${tier.debuff.label}` : '';
    addLog(`${tier.icon} Кредит «${tier.label}»: +${fmtK(tier.principal)}, платёж ${fmtK(tier.monthlyPayment)}/мес × ${tier.months} мес.${debuffNote}`, 'teal');
    notify(`${tier.icon} Кредит ${fmtK(tier.principal)} одобрен`, 'success');
    rd(`Кредит «${tier.label}» +${fmtK(tier.principal)}`, 'event');
    _emitRender();
  };

  // Для кредитов с дебаффами — подтверждение
  if (tier.debuff) {
    showConfirm(
      tier.icon, `Взять кредит «${tier.label}»?`,
      `${fmtK(tier.principal)} сразу. Платёж: ${fmtK(tier.monthlyPayment)}/мес × ${tier.months} мес.\n⚠️ Дебафф: ${tier.debuff.label}`,
      `Взять — ${fmtK(tier.principal)}`, 'amber',
      _doTakeLoan
    );
  } else {
    _doTakeLoan();
  }
  _emitRender();
}

// ── Система фокуса удалена (v2.7) ─────────────────────
// Распределение мощности полностью перешло к назначению команды
// (assignStaffToProject / WU-система): прогресс проекта считается от
// getProjectThroughput, фокус-веса не имели игрового эффекта.
// Удалены: setFocus, liveUpdateFocus, adjustFocusBy, equalFocus,
// clearFocus, setFocusForMonths и сигнал 'focus_changed'.

// Бронирование разовых удалено (v3.0): разовые работают через назначение
// команды, как все проекты — выполняются за месяц при мощности >= нагрузки

// ── Календарь (v3.5): отложенные события с эффектом в будущем месяце ──
function scheduleCalendarEvent({ inMonths, label, money = 0, icon = '📌' }) {
  G.calendarEvents = G.calendarEvents || [];
  G.calendarEvents.push({
    month: G.month + Math.max(1, inMonths | 0),
    label, money, icon, done: false,
  });
  addLog(`${icon} Запланировано: ${label}${money ? ` (${money > 0 ? '+' : ''}${fmtK(money)})` : ''} — ${monthLabel(Math.max(1, inMonths | 0))}`, 'muted');
}

// ══════════════════════════════════════════════════════
//  ADVANCE MONTH
// ══════════════════════════════════════════════════════
function advanceMonth() {
  // ① Счётчик месяцев у каждого клиента + декремент кулдаунов
  G.activeClients.forEach(c=>{ c._monthsSigned=(c._monthsSigned||0)+1; });
  if ((G.oneTimeCooldown||0) > 0) G.oneTimeCooldown--;
  // Декремент кулдаунов действий восстановления усталости
  if (G.fatigueActionCooldowns) {
    Object.keys(G.fatigueActionCooldowns).forEach(k => {
      if (G.fatigueActionCooldowns[k] > 0) G.fatigueActionCooldowns[k]--;
    });
  }
  // Ф.3: сброс месячного заряда переговорщиков (1 авто-подписание/мес на спеца)
  G._negUsedThisMonth = 0;
  (G.staff || []).forEach(s => { if (s._negDealsMonth) s._negDealsMonth = 0; });
  // п.18 (Ф.2): декремент кулдаунов действий влияния на клиента (calendar-based)
  // Р.3: сброс месячного лимита действий на каждый проект (новый месяц — снова доступно действие)
  G.activeClients.forEach(c => {
    c._actionsUsedThisMonth = 0;
    if (c._actionCooldowns) {
      Object.keys(c._actionCooldowns).forEach(k => {
        if (c._actionCooldowns[k] > 0) c._actionCooldowns[k]--;
      });
    }
  });
  // Ф.6: сезонный натиск — лояльность (npsNudge) + риск активных проектов (riskMod)
  { const _seaM = getSeasonMod();
    const _liveClients = G.activeClients.filter(c=>!c.oneTime);
    if (_seaM.npsNudge !== 0 && _liveClients.length > 0) {
      nudgeAllNPS(G, _seaM.npsNudge);
      addLog(`${_seaM.icon} Сезон (${_seaM.label}): лояльность ${_seaM.npsNudge > 0 ? '+' : ''}${_seaM.npsNudge}`, 'muted');
    }
    if (_seaM.riskMod > 0) {
      const _dr = Math.round(_seaM.riskMod * 100);   // напр. 0.04 → +4 риска/мес
      G.activeClients.forEach(c => {
        if (c._lcPhase && c._lcPhase.startsWith('work_')) c._lcRisk = Math.min(100, (c._lcRisk || 0) + _dr);
      });
    } }

  // ② Прогресс проектов (не-разовые) — от назначенной команды (WU-система)
  const throughput = getTeamThroughput();
  const totalLoad  = getTotalLoad();         // учитывает payment_delay_fixed

  // Перегруз: когда суммарной мощности не хватает для всех проектов
  // (v3.0: разовые включены в totalLoad — бронирование упразднено)
  const overloaded = throughput < totalLoad * 0.95;
  const effectiveLoad = totalLoad;

  // ── Усталость команды (п.11, fix п.17, rework п.21, fix п.22) ─────
  {
    const hrGrade = G.staff.find(s => s.id === 'hr_sr') ? 'sr' : G.staff.find(s => s.id === 'hr') ? 'md' : G.staff.find(s => s.id === 'hr_jr') ? 'jr' : null;
    // loadPct = эффективная нагрузка / мощность; >1 = перегруз; учитывает фокус (п.22)
    const loadPct = throughput > 0 ? effectiveLoad / throughput : 0;
    // Улучшенная формула: порог восстановления поднят до <70%, скорость −8/мес (было −5 при <60%)
    let fd = loadPct >= 1.0 ? 10 : loadPct >= 0.85 ? 4 : loadPct >= 0.70 ? 1 : -8;
    // HR снижает рост усталости (только при положительном fd): Jr −20%, Md −30%, Sr −45%
    if (fd > 0 && hrGrade === 'jr') fd = Math.round(fd * 0.80);
    if (fd > 0 && hrGrade === 'md') fd = Math.round(fd * 0.70);
    if (fd > 0 && hrGrade === 'sr') fd = Math.round(fd * 0.55);
    // HR Sr дополнительно даёт пассивное восстановление −2/мес всегда
    if (hrGrade === 'sr') fd -= 2;
    // Пассивки дерева 2.0: перманентное замедление роста и ускорение отдыха
    if (fd > 0) fd = Math.round(fd * (G.perkFatigueMult ?? 1));
    if (fd < 0) fd -= (G.perkRecoveryBonus || 0);
    G.teamFatigue = clamp((G.teamFatigue||0) + fd, 0, 100);
  }
  const fatigueMult = getFatigueMult();

  // п.10 (Р.4): Кризисный месяц — перегруз + высокая усталость
  if (G.teamFatigue > 70 && overloaded && G.activeClients.length > 0) {
    nudgeAllNPS(G, -5);
    G.reputation = clamp((G.reputation||0) - 2, 0, 100);
    G._crisisMonths = (G._crisisMonths||0) + 1;
    addLog(`⚡ Кризисный месяц (усталость ${Math.round(G.teamFatigue)}, перегруз): лояльность всех −5, репутация −2`, 'red');
    notify('⚡ Кризисный месяц — команда на пределе', 'error');
  }

  // v3.0: тикают ВСЕ проекты, включая разовые — у них instant-цепочка
  // с одной work-фазой и _duration=1: при мощности >= нагрузки готовы за месяц
  G.activeClients.forEach(c=>{
    // LC-проекты: пропускаем тик пока не достигли work-фазы
    if (c._lcPhase && !c._lcPhase.startsWith('work_')) return;
    // payment_delay_fixed: прогресс не идёт пока не истёк период ожидания
    if (c.modifier?.type==='payment_delay_fixed' && (c._monthsSigned||0) <= c.modifier.val) return;
    // Per-project throughput: 2 (фаундер) + WU назначенных сотрудников
    // Нет сотрудников → efficiency ≈ 0.28 (очень медленно), Sr-разраб → ~1.0+
    // v3.7: прогрессивная отдача вместо жёсткого кэпа 1.5 (A/B/C: 42% побед
    // против 25%, темп сохранён) — перевыполнение ускоряет, но убывающе
    const pLoad        = getProjectLoad(c);
    const projThr      = getProjectThroughput(c);
    const efficiency   = pLoad > 0 ? effFromRatio(projThr / pLoad) : 1;
    const speedMult    = getSpeed();
    // LC-проекты: _duration — суммарное время всех work-фаз; делим на их количество
    // Обычные проекты: _lcChain отсутствует → workPhaseCnt=1 → поведение прежнее
    const workPhaseCnt = c._lcChain ? c._lcChain.filter(p => p.startsWith('work_')).length : 1;
    const phaseDur     = (c._duration || 3) / Math.max(1, workPhaseCnt);
    const monthProg    = (100 / phaseDur) * efficiency * fatigueMult * speedMult;
    // Округляем до 2 знаков — устраняет накопление float-погрешности (баг П.13)
    c._progress = Math.min(100, Math.round(((c._progress||0) + monthProg) * 100) / 100);
    // Пассивное накопление качества от команды (масштаб от эффективности проекта)
    if (c._lcChain) {
      const qGain = getProjectQualityGain(c) * Math.max(0.3, Math.min(1.2, efficiency));
      c._lcQualityBonus = Math.min(100, (c._lcQualityBonus || 0) + qGain);
    }
  });

  if (overloaded && G.activeClients.length > 0) {
    addLog(`⚠️ Команда перегружена (нужно ${Math.round(totalLoad)} мощн., есть ${Math.round(throughput)}) — недоукомплектованные проекты идут медленно`, 'amber');
  }

  // ② в) LC work-фазы: work-события + авто-переход при 100%
  if (typeof Projects !== 'undefined') {
    // Work-события + РИСК в процессе (связь риска с геймплеем):
    //  • высокий риск → шанс «критической ошибки» (−% прогресса) + удар по настроению
    //    (а упавшее настроение повышает вероятность ухода клиента — см. churn выше);
    //  • шанс обычного work-события тоже растёт с риском.
    G.activeClients.forEach(c => {
      if (!c._lcPhase || !c._lcPhase.startsWith('work_')) return;
      if (c._lcPendingDecision) return;
      const prog = c._progress || 0;
      if (prog < 20 || prog >= 95) return;
      const risk = c._lcRisk || 0;
      // Критическая ошибка из-за высокого риска (тематическое негативное событие со штрафом)
      if (risk >= 40 && Math.random() < (risk / 100) * 0.30) {
        const pen = 10 + Math.round((risk / 100) * 20);   // −10..−30% прогресса
        c._progress = Math.max(0, prog - pen);
        c._lcClientMood = Math.max(0, (c._lcClientMood || 60) - 10); // → повышает риск ухода
        if (typeof G !== 'undefined' && G.clientNPS) G.clientNPS[c.id] = c._lcClientMood;
        addLog(`🔥 ${c.name}: из-за высокого риска допущена критическая ошибка — −${pen}% прогресса`, 'red');
        notify(`🔥 ${c.icon} ${c.name}: критическая ошибка (риск ${Math.round(risk)}) — −${pen}% прогресса`, 'error');
        if (typeof rd === 'function') rd(`Критическая ошибка (риск): ${c.name} −${pen}%`, 'client');
        return; // в этот месяц обычное событие не дублируем
      }
      // Обычное work-событие: базовый шанс растёт с риском (20%..40%)
      const evChance = 0.20 + (risk / 100) * 0.20;
      if (Math.random() < evChance) Projects.triggerWorkEvent(c);
    });

    // Авто-переход при 100% (только если нет pending decision)
    const lcWork = G.activeClients.filter(c =>
      c._lcPhase && c._lcPhase.startsWith('work_') &&
      !c._lcPendingDecision &&
      Math.round(c._progress || 0) >= 100
    );
    lcWork.forEach(c => {
      // v3.0: количество work-фаз определяется цепочкой (1–5)
      const workOrder = (c._lcChain || []).filter(p => p.startsWith('work_'));
      const wIdx = workOrder.indexOf(c._lcPhase);
      if (wIdx >= 0 && wIdx < workOrder.length - 1) {
        c._progress = 0;       // следующая work-фаза — с нуля
        Projects.advancePhase(c);
      } else {
        Projects.advancePhase(c);  // последняя work — к Review/Delivery
      }
    });
  }

  // ── Milestone-выплаты T2/T3 ──────────────────────────
  G.activeClients.forEach(c => {
    if (!c._milestones || c._milestones.length === 0 || c.oneTime) return;
    // LC multi-phase: _progress сбрасывается на каждой work-фазе.
    // Нормализуем в «глобальный» прогресс 0–100 по всем work-фазам.
    // Обычные проекты (_lcChain отсутствует): используем _progress напрямую.
    let progress;
    const _wPhases = c._lcChain ? c._lcChain.filter(p => p.startsWith('work_')) : null;
    if (_wPhases && _wPhases.length > 0) {
      const _n       = _wPhases.length;
      const _curWIdx = c._lcPhase ? _wPhases.indexOf(c._lcPhase) : -1;
      progress = _curWIdx >= 0
        ? Math.min(100, ((_curWIdx * 100) + (c._progress || 0)) / _n)
        : 100;   // review/delivery — все work-фазы завершены
    } else {
      progress = c._progress || 0;
    }
    (c._milestones).forEach((threshold, idx) => {
      if (progress >= threshold && !(c._milestonesPaid||[]).includes(idx)) {
        const payout = Math.round((c._originalBudget||c._totalBudget) * (c._milestonePcts||[])[idx] / 5000) * 5000;
        c._totalBudget = Math.max(0, (c._totalBudget||0) - payout);
        G.money += payout;
        c._milestonesPaid = [...(c._milestonesPaid||[]), idx];
        addLog(`💵 Milestone «${c.name}» (${threshold}%): +${fmtK(payout)} получено`, 'green');
        notify(`💵 ${c.icon} ${c.name} — milestone ${threshold}%: +${fmtK(payout)}`, 'success');
        rd(`Milestone: ${c.name} +${fmtK(payout)}`,'client');
      }
    });
  });

  // ── Эффекты усталости ────────────────────────────────
  if (G.teamFatigue >= 30) {
    const npsHit = G.teamFatigue >= 85 ? -8 : G.teamFatigue >= 60 ? -5 : -3;
    const stateLabel = G.teamFatigue >= 85 ? '🔥 Кризис' : G.teamFatigue >= 60 ? '😓 Выгорание' : '😰 Напряжение';
    const victims = G.activeClients.filter(c => !c.oneTime);
    if (victims.length > 0) {
      const target = victims[Math.floor(Math.random() * victims.length)];
      nudgeClientRating(target, npsHit); // единый канал: LC → mood, обычные → NPS
      addLog(`${stateLabel} (усталость ${Math.round(G.teamFatigue)}): NPS «${target.name}» ${npsHit}`, 'amber');
    }
    // Уход сотрудника при выгорании/кризисе
    if (G.teamFatigue >= 60 && G.staff.length > 0) {
      const quitChance = G.teamFatigue >= 85 ? 0.20 : 0.10;
      const leaver = G.staff.find(() => Math.random() < quitChance);
      if (leaver) {
        // Б.4: emit до удаления — UI покажет модал с деталями
        EventBus.emit('staff_quit', {
          staff:   { ...leaver },                 // snapshot до удаления
          fatigue: Math.round(G.teamFatigue),
        });
        G.staff = G.staff.filter(s => s._iid !== leaver._iid);
        addLog(`🚪 ${leaver.name} уволился из-за усталости команды!`, 'red');
        checkCapacityExceeded(leaver.name);
      }
    }
    if (G.teamFatigue >= 85) {
      addLog(`🔥 Кризис: найм заблокирован до снижения усталости ниже 85`, 'red');
    }
  }

  // ③ Задержанные выплаты с прошлого месяца (от payment_delay при завершении)
  if (G.delayedIncome > 0) {
    G.money += G.delayedIncome;
    addLog(`✅ Задержанная оплата получена: +${fmt(G.delayedIncome)}`,'green');
    G.delayedIncome = 0;
  }

  // ④ Погашение кредита
  if (G.loan && G.loan.monthsRemaining > 0) {
    const pay = G.loan.monthlyPayment;
    if (G.money >= pay) {
      G.money -= pay;
      G.loan.monthsRemaining--;
      if (G.loan.monthsRemaining === 0) {
        addLog(`🏦 Кредит «${G.loan.label}» полностью погашен`, 'green');
        G.loan = null;
      } else {
        addLog(`🏦 Кредит «${G.loan.label}»: платёж −${fmtK(pay)}, осталось ${G.loan.monthsRemaining} мес.`, 'amber');
      }
    } else {
      // Не хватает средств — штраф репутации, месяц просто списывается
      G.loan.monthsRemaining--;
      const pen = 5;
      G.reputation = clamp(G.reputation - pen, 0, 100);
      addLog(`⚠️ Не удалось выплатить кредит «${G.loan.label}» — −${pen} репутации`, 'red');
      notify('⚠️ Нехватка средств на платёж по кредиту — −5 реп.', 'error');
      if (G.loan.monthsRemaining === 0) { G.loan = null; }
    }
  }

  // ⑤ random_bonus модификатор (разовый кэш-бонус, не зависит от выплаты)
  G.activeClients.forEach(c=>{
    if (c.modifier?.type==='random_bonus' && Math.random()<0.30){
      G.money+=c.modifier.val;
      addLog(`🎲 ${c.name}: неожиданный бонус +${fmt(c.modifier.val)}`,'teal');
    }
  });

  // ⑥ Ежемесячные расходы (+ Р.4: временный скачок overhead от кризиса)
  const staffCost = getTotalStaffCost();
  const dirOver   = (typeof getDirectorOverhead === 'function') ? getDirectorOverhead(G) : 0;
  const net       = -(staffCost + OVERHEAD + dirOver);
  G.money += net;
  G.monthsPlayed++;
  G.tempDiscount = 0;

  addLog(`расходы −${fmt(staffCost+OVERHEAD+dirOver)}${dirOver>0?` (вкл. кризис +${fmtK(dirOver)})`:''} → баланс ${fmt(G.money)}`, 'red');

  // ⑦ (v3.0) Завершение разовых перенесено в lifecycle-флоу:
  // instant-цепочка → work_0 → delivery → finishDelivery платит бюджет

  // ⑧ Штраф просрочки: дедлайн пройден, а проект ещё не сдан.
  // Дедлайн — от начала work_0 (_workStartMonth), не от подписания.
  // v3.0: буфер ×1.6 + 2 мес — _duration описывает идеальный темп (eff=1,
  // без work-событий и правок), реальный фазовый цикл закономерно длиннее;
  // штраф должен наказывать плохое ведение, а не сам факт фазового флоу
  G.activeClients.forEach(c=>{
    const _effMon = c._workStartMonth != null
      ? (c._monthsSigned||0) - c._workStartMonth
      : (c._monthsSigned||0);
    const _deadline = Math.round((c._duration||3) * 1.6) + 2;
    if (!c.oneTime && c._duration && _effMon > _deadline && (c._progress||0) < 100) {
      const pen = (hasRole('lawyer') || G.perkPenaltyShield) ? 1 : 2;
      G.reputation = clamp(G.reputation - pen, 0, 100);
      addLog(`⏰ ${c.name}: просрочен на ${_effMon - _deadline} мес. — −${pen} репутации${hasRole('lawyer')?' (юрист −50%)':''}`, 'red');
    }
  });

  // ⑨ Восстановление репутации
  const hasGrey = G.activeClients.some(c=>c.modifier?.type==='reputation');
  const repRecovery = (G.portfolio||0)>=25 ? 2 : 1;
  const totalRepRecovery = repRecovery + (G.caseRepBonus||0);
  if (!hasGrey && G.reputation<100) G.reputation = Math.min(100, G.reputation+totalRepRecovery);
  if ((G.caseRepPenalty||0)>0) G.reputation = clamp(G.reputation-(G.caseRepPenalty||0), 0, 100);

  // ⑩ NPS update
  updateAllNPS();

  // ⑩-б Staff: monthly state update (mood, loyalty, fast_learner growth, candidate pool decay)
  if (typeof processStaffMonth === 'function') processStaffMonth();

  G.month++;

  // Ф.6: смена сезона (квартала) — анонс + событие-вилка
  _maybeFireSeasonEvent();

  // Р.4: тик «директора давления» — оценка комфорта + возможный кризис
  _directorTick(G);

  // ⑪-а Календарь: применяем наступившие отложенные события
  (G.calendarEvents || []).forEach(ev => {
    if (ev.done || ev.month > G.month) return;
    ev.done = true;
    if (ev.money) G.money += ev.money;
    addLog(`${ev.icon} ${ev.label}${ev.money ? `: ${ev.money > 0 ? '+' : ''}${fmtK(ev.money)}` : ''}`, ev.money < 0 ? 'red' : 'green');
    notify(`${ev.icon} ${ev.label}`, ev.money < 0 ? 'warning' : 'info');
  });

  // ⑪ Сброс действий, временных бонусов, пула
  G.actions   = getWorkdays(G.month % 12);   // календарь нового месяца
  G.scoutPool = null;
  G.tempQBonus = 0;

  // ⑪-б ИИ-нейросеть: обучение, пассивные бонусы, доставка ответов
  if (G.ai && G.ai.purchased) {
    // Сброс лимита запросов
    G.ai.queriesThisMonth = 0;

    // Декремент таймера обучения
    if (G.ai.upgrading && G.ai.upgradeMonthsLeft > 0) {
      G.ai.upgradeMonthsLeft--;
      if (G.ai.upgradeMonthsLeft === 0) {
        G.ai.upgrading = false;
        const lvlDef = (SCENARIO.ai?.levels || [])[G.ai.level];
        addLog(`🤖 Нейросеть завершила обучение — уровень ${G.ai.level}: «${lvlDef?.name || ''}»`, 'purple');
        EventBus.emit('ai_training_complete', { level: G.ai.level });
        notify(`🤖 Нейросеть готова: ${lvlDef?.name || 'Уровень ' + G.ai.level}`, 'success');
      } else {
        addLog(`🤖 Обучение нейросети: осталось ${G.ai.upgradeMonthsLeft} мес.`, 'muted');
      }
    }

    // Пассивные бонусы от ИИ (только когда не идёт обучение)
    if (!G.ai.upgrading) {
      const lvlDef = (SCENARIO.ai?.levels || [])[G.ai.level];
      if (lvlDef) {
        G.ai.aiQBonus   = lvlDef.passiveQ   || 0;
        G.ai.aiRepBonus = lvlDef.passiveRep  || 0;
        G.ai.aiVBonus   = lvlDef.passiveV    || 0;
        if (lvlDef.passiveRep > 0) {
          G.reputation = clamp(G.reputation + lvlDef.passiveRep, 0, 100);
        }
      }
    } else {
      G.ai.aiQBonus = 0; G.ai.aiRepBonus = 0; G.ai.aiVBonus = 0;
    }

    // Доставка отложенного ответа
    if (G.ai.pendingResponse && G.month >= G.ai.pendingResponse.readyMonth) {
      const resp = G.ai.pendingResponse;
      G.ai.pendingResponse = null;
      G.ai.chat.push({ role: 'ai', text: resp.text, month: G.month, pending: false });
      EventBus.emit('ai_response_ready', { text: resp.text });
      notify('🤖 Нейросеть прислала ответ — загляни во вкладку', 'info');
      addLog('🤖 Получен ответ от нейросети', 'purple');
    }
  }

  // ⑫ Снимок истории
  G.history.push({month:G.month, money:G.money, label:monthLabel(-1)});

  // ⑬ Авто-сохранение (до win/lose чтобы откат работал с любого состояния)
  if (typeof autoSave === 'function') autoSave();

  // Win / Lose
  // v2.2.3: Победа = выбор бонуса на переходе в «Эндгейм» (финальный этап Run Map).
  //   Триггер живёт в runmap.js (_showMilestoneModal → fn(g)) чтобы win-экран
  //   появлялся ПОСЛЕ закрытия модала выбора бонуса, а не посреди него.
  //   Здесь только банкротство.
  if (G.money<=0) { _emitRender(); _emitEndGame(false); return; }

  // Случайное событие (40%, пропуск 1-го месяца; не когда идёт событие ИИ)
  if (G.monthsPlayed>1 && Math.random()<0.40){
    const hasActiveProjects = G.activeClients.filter(c=>!c.oneTime).length > 0;
    const evs=EVENTS.filter(e=>{
      if (e.id==='quit'        && G.staff.length===0)    return false;
      if (e.id==='conflict'    && G.staff.length<2)      return false;
      if (e.requiresClients    && !hasActiveProjects)    return false;
      if (e.minMonths          && G.monthsPlayed < e.minMonths) return false; // п.10: поздне-игровые события
      return true;
    });
    _emitShowEvent(evs[Math.floor(Math.random()*evs.length)]);
  } else {
    _emitRender();
  }
}

// ══════════════════════════════════════════════════════
//  НЕЙРОСЕТЬ — игровые действия
// ══════════════════════════════════════════════════════

function purchaseAI() {
  const cfg = SCENARIO.ai;
  if (!cfg) { notify('ИИ-модуль недоступен в этом сценарии', 'error'); return; }
  if (G.ai.purchased) { notify('Нейросеть уже куплена', 'error'); return; }
  if (G.reputation < cfg.purchaseMinRep) {
    notify(`Нужна репутация ≥${cfg.purchaseMinRep} (сейчас ${Math.round(G.reputation)})`, 'error'); return;
  }
  if (G.money < cfg.purchaseCost) { notify('Недостаточно средств', 'error'); return; }
  G.money -= cfg.purchaseCost;
  G.ai.purchased = true;
  G.ai.level = 0;
  addLog(`🤖 Нейросеть подключена (базовая модель). Ответы занимают ~${cfg.levels[0].responseMonths} мес.`, 'purple');
  notify('🤖 Нейросеть активирована!', 'success');
  rd('Куплена нейросеть', 'event');
  EventBus.emit('ai_purchased');
  _emitRender();
}

function upgradeAI() {
  if (!G.ai.purchased) { notify('Сначала купи нейросеть', 'error'); return; }
  if (G.ai.upgrading)  { notify(`Обучение уже идёт — осталось ${G.ai.upgradeMonthsLeft} мес.`, 'error'); return; }
  const nextLevel = G.ai.level + 1;
  const cfg = SCENARIO.ai;
  if (!cfg || nextLevel >= cfg.levels.length) { notify('Нейросеть уже на максимальном уровне', 'error'); return; }
  const lvl = cfg.levels[nextLevel];
  if (G.money < lvl.cost) { notify(`Нужно ${fmtK(lvl.cost)} для обучения`, 'error'); return; }
  G.money -= lvl.cost;
  G.ai.level = nextLevel;
  G.ai.upgrading = true;
  G.ai.upgradeMonthsLeft = lvl.trainingMonths;
  addLog(`🤖 Начато обучение нейросети — уровень ${nextLevel}: «${lvl.name}». Завершение через ${lvl.trainingMonths} мес.`, 'purple');
  notify(`🤖 Обучение начато — ${lvl.trainingMonths} мес.`, 'info');
  rd(`Апгрейд нейросети → Ур.${nextLevel}`, 'event');
  EventBus.emit('ai_upgrading', { level: nextLevel, months: lvl.trainingMonths });
  _emitRender();
}

// Получить текущий лимит запросов в месяц
function getAIQueriesLimit() {
  if (!G.ai?.purchased || G.ai.upgrading) return 0;
  return (SCENARIO.ai?.levels?.[G.ai.level]?.queriesPerMonth) || 0;
}

// Получить задержку ответа в месяцах (для текущего уровня)
function getAIResponseDelay() {
  if (!G.ai?.purchased) return 99;
  return (SCENARIO.ai?.levels?.[G.ai.level]?.responseMonths) || 0;
}
