// ══════════════════════════════════════════════════════
//  STAFF v2 — система персонажей-специалистов
//
//  Зависит от: engine.js (G, notify, EventBus, fmt, addLog, rd)
//
//  Совместимость с engine.js:
//    s.role        → English ID (для hasRole / countRole)
//    s.quality     → бонус к Q (суммируется в getQuality)
//    s.volume      → бонус к V (суммируется в getVolume)
//    s.capacity    → бонус к слотам (суммируется в getCapacity)
//    s.npsBonus    → NPS-бонус
//    s.speedBonus  → множитель скорости
//    s.cost        → месячная зарплата
//    s._iid        → уникальный instance ID
//    s.id          → = s._iid (для обратной совместимости)
// ══════════════════════════════════════════════════════

// ── Name Pool ─────────────────────────────────────────

const _NM = ['Артём','Иван','Михаил','Дмитрий','Александр','Никита','Сергей',
  'Андрей','Кирилл','Павел','Роман','Денис','Максим','Евгений','Илья',
  'Владимир','Алексей','Антон','Виктор','Тимур'];
const _NF = ['Анна','Мария','Елена','Ольга','Наталья','Екатерина','Дарья',
  'Виктория','Юлия','Ксения','Алина','Полина','Татьяна','Ирина','Светлана',
  'Валерия','Анастасия','Надежда','Вера','Зоя'];
const _LM = ['Иванов','Петров','Сидоров','Козлов','Новиков','Морозов','Попов',
  'Лебедев','Волков','Соколов','Зайцев','Павлов','Семёнов','Богданов',
  'Воробьёв','Фёдоров','Михайлов','Захаров','Дмитриев','Кузнецов'];
const _LF = ['Иванова','Петрова','Сидорова','Козлова','Новикова','Морозова','Попова',
  'Лебедева','Волкова','Соколова','Зайцева','Павлова','Семёнова','Богданова',
  'Воробьёва','Фёдорова','Михайлова','Захарова','Дмитриева','Кузнецова'];

// ── Role Meta ─────────────────────────────────────────
// id — English (engine compat), label — русский (UI)

// Data-хук сценария (v3.1): сценарий может переопределить мету ролей
// (scenarios/bank.js → roleMeta) — генерация кандидатов получает
// тематические лейблы/иконки без правок этого модуля
const _SCEN_ROLE_META = (typeof SCENARIO !== 'undefined' && SCENARIO.roleMeta) || null;
const ROLE_META = _SCEN_ROLE_META || {
  designer:   { id:'designer',   label:'Дизайнер',   emoji:'🎨', color:'#ec4899' },
  copywriter: { id:'copywriter', label:'Копирайтер', emoji:'✍️', color:'#f59e0b' },
  manager:    { id:'manager',    label:'Менеджер',   emoji:'📋', color:'#6366f1' },
  developer:  { id:'developer',  label:'Разработчик',emoji:'💻', color:'#06b6d4' },
  smm:        { id:'smm',        label:'SMM',         emoji:'📱', color:'#10b981' },
  lawyer:     { id:'lawyer',     label:'Юрист',       emoji:'⚖️', color:'#8b5cf6' },
  hr:         { id:'hr',         label:'HR',          emoji:'🤝', color:'#f97316' },
};
const ROLE_IDS = Object.keys(ROLE_META);

// ── Role Categories (для найма-фильтра) ───────────────
const ROLE_CATEGORIES = (typeof SCENARIO !== 'undefined' && SCENARIO.roleCategories) || [
  { id: 'creative',   label: 'Дизайн',    emoji: '🎨', roles: ['designer','copywriter','smm'] },
  { id: 'tech',       label: 'Разработка', emoji: '💻', roles: ['developer'] },
  { id: 'management', label: 'Управление', emoji: '📋', roles: ['manager','hr'] },
  { id: 'legal',      label: 'Юридика',    emoji: '⚖️', roles: ['lawyer'] },
];

// ── Candidate pool filter state ────────────────────────
let _candidateFilter = null; // null = все; 'creative' | 'tech' | 'management' | 'legal'

// ── Grade Config ───────────────────────────────────────

// Зарплаты пересмотрены в v2.6 под LC-экономику (цикл 6–10 мес, доход
// аванс+milestone+сдача): junior/middle/senior снижены ~20%, чтобы команда
// из 2–3 специалистов окупалась LC-проектами; lead/star — премиальный тир
const GRADE_CFG = {
  junior: { label:'Junior',    exp:[1,3],   q:[3,5],  speed:[3,5],  salary:[20000,35000],  traits:1, sBonus:0 },
  middle: { label:'Middle',    exp:[3,7],   q:[5,7],  speed:[5,7],  salary:[40000,70000],  traits:2, sBonus:0.05 },
  senior: { label:'Senior',    exp:[7,12],  q:[7,9],  speed:[6,8],  salary:[80000,130000], traits:2, sBonus:0.10 },
  lead:   { label:'Lead',      exp:[10,17], q:[8,10], speed:[7,9],  salary:[170000,280000],traits:3, sBonus:0.15 },
  star:   { label:'★ Звезда', exp:[8,20],  q:[9,10], speed:[8,10], salary:[250000,480000],traits:3, sBonus:0.20 },
};

// ── Traits ─────────────────────────────────────────────

const TRAITS = {
  perfectionist: { label:'Перфекционист',     icon:'🎯', type:'pos', hidden:false,
    desc:'+15% качества на проектах длиннее 2 месяцев' },
  team_player:   { label:'Командный игрок',   icon:'🤜', type:'pos', hidden:false,
    desc:'+8% качества при команде 2+ человек' },
  client_charm:  { label:'Клиентский магнит', icon:'✨', type:'pos', hidden:true,
    desc:'+8 NPS на проектах с его участием' },
  fast_learner:  { label:'Быстро растёт',     icon:'📈', type:'pos', hidden:true,
    desc:'+1 к качеству каждые 3 месяца работы' },
  crisis_mgr:    { label:'Антикризисник',     icon:'💧', type:'pos', hidden:true,
    desc:'−20% потерь от негативных событий' },
  loyal_trait:   { label:'Лоялен',            icon:'🏅', type:'pos', hidden:false,
    desc:'Никогда не уходит без предупреждения' },
  multitasker:   { label:'Многозадачник',     icon:'⚡', type:'pos', hidden:true,
    desc:'Работает эффективно на нескольких задачах' },
  burns_out:     { label:'Выгорает',          icon:'😮‍💨', type:'neg', hidden:true,
    desc:'−20% скорости после 3 мес. на одном проекте' },
  prima_donna:   { label:'Примадонна',        icon:'👑', type:'neg', hidden:true,
    desc:'−10 настроения, если не на ключевых проектах' },
  salary_hunter: { label:'Зарплатный охотник',icon:'💰', type:'neg', hidden:true,
    desc:'Просит повышения каждые 4–6 месяцев' },
  job_hopper:    { label:'Летун',             icon:'🪶', type:'neg', hidden:true,
    desc:'Лояльность падает быстрее, риск ухода выше' },
  conflict_prone:{ label:'Конфликтный',       icon:'⚡', type:'neg', hidden:true,
    desc:'Создаёт напряжение в команде (3+ мес.)' },
  slow_starter:  { label:'Долго раскачивается',icon:'⏳',type:'neg', hidden:false,
    desc:'−15% скорости в первый месяц на проекте' },
};

const _POS = Object.keys(TRAITS).filter(k => TRAITS[k].type === 'pos');
const _NEG = Object.keys(TRAITS).filter(k => TRAITS[k].type === 'neg');

// ── Interview Questions ────────────────────────────────

const ITV_QS = [
  {
    id: 'q_intro',
    text: '«Расскажи о проекте, которым особенно гордишься.»',
    opts: [
      { text:'Задать уточняющий вопрос об их конкретной роли', effect:'pos' },
      { text:'Покивать одобрительно, не углубляясь',           effect:null },
      { text:'Похвалить выбор — создать тёплую атмосферу',    effect:'mood' },
    ],
  },
  {
    id: 'q_stress',
    text: '«Дедлайн через 2 дня, задача неожиданно усложнилась. Что делаешь?»',
    opts: [
      { text:'Копнуть: «А что именно пошло не так в прошлый раз?»', effect:'neg' },
      { text:'Принять ответ, оценить по интонации',                  effect:null },
      { text:'Показать понимание, снизить напряжение',              effect:'mood' },
    ],
  },
  {
    id: 'q_client',
    text: '«Клиент кардинально меняет задачу в последний момент. Реакция?»',
    opts: [
      { text:'Попросить конкретный кейс из их практики',            effect:'pos' },
      { text:'Слушать и оценивать самостоятельно',                   effect:null },
      { text:'«Такое бывает — ты с этим справляешься нормально?»',  effect:'neg' },
    ],
  },
  {
    id: 'q_growth',
    text: '«Какие у тебя ожидания по росту в ближайший год?»',
    opts: [
      { text:'Уточнить карьерные ожидания детально',            effect:'loyalty' },
      { text:'Рассказать о возможностях агентства',              effect:'mood' },
      { text:'Спросить напрямую про зарплатные ожидания',       effect:'salary' },
    ],
  },
];

// ── Helpers ────────────────────────────────────────────

function _rnd(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
function _pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function _suid()    { return Math.random().toString(36).slice(2, 9); }
function _fs(n)     { return new Intl.NumberFormat('ru-RU').format(Math.round(n)) + ' ₽'; }

// Derived legacy fields for engine compatibility
function _legacyFields(roleId, grade, qStat, speedStat) {
  const cfg = GRADE_CFG[grade] || GRADE_CFG.middle;
  // quality: direct stat (engine sums these as Q bonus)
  const quality = qStat;
  // volume (фикс v3.1): ролевой стат, а не speedStat−5 (давал 0–3 всем подряд —
  // V-капы проектов «Наймите копирайтера» были невыполнимы в принципе).
  // Шкала от легаси-staff: копирайтер jr8/md15/sr25, SMM jr5/md10/sr18
  const _volByGrade = {
    copywriter: { junior:8, middle:15, senior:22, lead:28, star:35 },
    smm:        { junior:5, middle:10, senior:16, lead:22, star:28 },
  };
  const volume = _volByGrade[roleId]
    ? (_volByGrade[roleId][grade] ?? 10) + Math.max(0, speedStat - 6)
    : Math.max(0, speedStat - 5);
  // capacity: only managers give project slots
  const capacity = roleId === 'manager'
    ? (grade === 'senior' || grade === 'lead' || grade === 'star' ? 2 : 1)
    : 0;
  // speedBonus: grade-based multiplier
  const speedBonus = cfg.sBonus;
  // npsBonus: star/lead get positive, juniors might be negative
  const npsBonus = grade === 'star' ? _rnd(5, 12)
    : grade === 'lead'   ? _rnd(2, 6)
    : grade === 'senior' ? _rnd(0, 4)
    : grade === 'middle' ? _rnd(-1, 3)
    : _rnd(-3, 1);
  return { quality, volume, capacity, speedBonus, npsBonus };
}

// ── Generate Candidate ─────────────────────────────────

function generateCandidate(roleId, grade) {
  const meta = ROLE_META[roleId] || ROLE_META.designer;
  const cfg  = GRADE_CFG[grade]  || GRADE_CFG.middle;
  const isFemale = Math.random() > 0.5;

  const firstName = _pick(isFemale ? _NF : _NM);
  const lastName  = _pick(isFemale ? _LF : _LM);
  const exp       = _rnd(cfg.exp[0], cfg.exp[1]);
  const qStat     = _rnd(cfg.q[0],   cfg.q[1]);
  const speedStat = _rnd(cfg.speed[0], cfg.speed[1]);

  const salaryAsk = _rnd(cfg.salary[0], cfg.salary[1]);
  const salaryMin = Math.round(salaryAsk * _rnd(75, 92) / 100);

  // Traits: posCount ceil(n/2), negCount floor(n/2)
  const n        = cfg.traits;
  const posCount = Math.ceil(n / 2);
  const negCount = n - posCount;
  const traits   = [];
  [..._POS].sort(() => Math.random() - .5).slice(0, posCount).forEach(id => {
    traits.push({ id, revealed: !TRAITS[id].hidden });
  });
  [..._NEG].sort(() => Math.random() - .5).slice(0, negCount).forEach(id => {
    traits.push({ id, revealed: !TRAITS[id].hidden });
  });

  const leg = _legacyFields(roleId, grade, qStat, speedStat);
  const uid = `cand_${_suid()}`;

  return {
    // Identity
    uid,
    id:          uid,        // engine compat: s.id
    _iid:        uid,        // engine compat: s._iid
    name:        `${firstName} ${lastName}`,
    age:         exp + _rnd(20, 24),
    gender:      isFemale ? 'f' : 'm',
    // Role (English for hasRole compat)
    role:        roleId,
    roleLabel:   meta.label,
    grade,
    gradeLabel:  cfg.label,
    icon:        meta.emoji,   // engine compat: s.icon
    // Engine-compat stats
    quality:     leg.quality,
    volume:      leg.volume,
    capacity:    leg.capacity,
    speedBonus:  leg.speedBonus,
    npsBonus:    leg.npsBonus,
    // Character stats (display)
    qStat,
    speedStat,
    experience:  exp,
    // Traits
    traits,
    // Offer
    salaryAsk,
    salaryMin,
    // State
    state:          'candidate',
    interviewDone:  false,
    mood:           _rnd(60, 90),
    fatigue:        0,
    loyalty:        70,
    monthsWithAgency: 0,
    projectsCompleted: 0,
    starLevel:      0,
    // Set on hire:
    cost:    null,   // engine compat: monthly salary
    salary:  null,
    // WU-система назначений
    _assignedProjectId: null,     // id проекта, на который назначен (null = свободен)
  };
}

// Вычислить _wu для уже сгенерированного кандидата/сотрудника.
// Единый источник правды — calcStaffWorkUnit из engine.js (фикс п.25:
// раньше здесь была дублирующая формула с расхождением qStat-шкалы).
function _recomputeWU(s) {
  s._wu = calcStaffWorkUnit(s);
  return s._wu;
}

// ── Scout ─────────────────────────────────────────────

function scoutCandidates(tier) {
  const costs  = { free:0, paid:25000, premium:60000 };
  const cost   = costs[tier] ?? 0;
  // v3.6: время поиска зависит от тира — дешёвый быстрый, дорогой дольше
  const SCOUT_DAYS = { free:2, paid:4, premium:6 };
  const days = SCOUT_DAYS[tier] ?? 2;
  if (G.actions < days) { notify(`Нужно ≥${days} рабочих дн. — осталось ${G.actions}`, 'error'); return; }
  G.actions -= days;

  if (cost > 0) {
    if (G.money < cost) { notify(`Недостаточно средств (нужно ${_fs(cost)})`, 'error'); return; }
    G.money -= cost;
    addLog(`🔍 Скаутинг специалистов (${tier}): −${_fs(cost)} · −${days} дн.`, 'amber');
    EventBus.emit('render');
  }

  const configs = {
    free:    { count:4, grades:['junior','junior','middle','middle'] },
    paid:    { count:5, grades:['middle','middle','senior','senior','middle'] },
    premium: { count:3, grades:['senior','lead', Math.random()<.3?'star':'lead'] },
  };
  const cfg = configs[tier] || configs.free;

  // Подбор ролей (фикс v3.1): раньше — чистый рандом из всех 7 ролей,
  // ключевые специальности тонули среди юристов/HR (жалоба: «копирайтеров
  // в пуле нет»). Теперь: первый кандидат — недостающая команде core-роль,
  // остальные — взвешенный рандом (core ×3, сервисные ×1)
  const CORE_ROLES = ['designer', 'copywriter', 'developer', 'manager', 'smm'];
  const _teamRoles = new Set((G.staff || []).filter(s => s.status !== 'fired').map(s => s.role));
  const _missing   = CORE_ROLES.filter(r => !_teamRoles.has(r));
  const _weighted  = [...CORE_ROLES, ...CORE_ROLES, ...CORE_ROLES, ...ROLE_IDS];
  const _pickRole  = i => (i === 0 && _missing.length)
    ? _pick(_missing)
    : _pick(_weighted);

  const pool = cfg.grades.map((g, i) => generateCandidate(_pickRole(i), g));
  G.candidatePool = [...(G.candidatePool || []), ...pool];

  _renderCandidatePool();
  notify(`Найдено ${pool.length} кандидатов`, 'success');
  if (typeof autoSave === 'function') autoSave();
}

// ── Migration from old format ─────────────────────────

function migrateStaffArr(arr) {
  if (!arr || !arr.length) return [];
  return arr.map(s => {
    // Already new format
    if (s.uid) return s;
    // Old format: has _iid but no uid
    const roleId = ROLE_IDS.find(r => r === s.role || r === s.id?.split('_')[0]) || 'designer';
    const gradeMap = { jr:'junior', md:'middle', sr:'senior' };
    const grade = gradeMap[s.grade] || s.grade || 'middle';
    const candidate = generateCandidate(roleId, grade in GRADE_CFG ? grade : 'middle');
    // Override with existing values
    candidate.uid    = s._iid || `staff_${_suid()}`;
    candidate.id     = candidate.uid;
    candidate._iid   = candidate.uid;
    candidate.name   = s.name || candidate.name;
    candidate.icon   = s.icon || candidate.icon;
    candidate.quality    = s.quality    ?? candidate.quality;
    candidate.volume     = s.volume     ?? candidate.volume;
    candidate.capacity   = s.capacity   ?? candidate.capacity;
    candidate.speedBonus = s.speedBonus ?? candidate.speedBonus;
    candidate.npsBonus   = s.npsBonus   ?? candidate.npsBonus;
    candidate.cost       = s.cost       ?? candidate.salaryAsk;
    candidate.salary     = candidate.cost;
    candidate.state      = 'hired';
    candidate.interviewDone = true;
    candidate.traits.forEach(t => { t.revealed = true; }); // existing staff fully revealed
    return candidate;
  });
}

// ── Hire ──────────────────────────────────────────────

function hireCandidate(id, salary) {
  const pool = G.candidatePool || [];
  const idx  = pool.findIndex(c => c.uid === id || c.id === id);
  if (idx < 0) { notify('Кандидат не найден', 'error'); return; }

  const c = { ...pool[idx] };
  c.state      = 'hired';
  c.cost       = salary ?? c.salaryAsk;
  c.salary     = c.cost;
  c.monthsWithAgency = 0;

  G.staff          = [...(G.staff || []), c];
  G.candidatePool  = pool.filter((_, i) => i !== idx);

  addLog(`👥 Нанят ${c.name} (${c.roleLabel}, ${c.gradeLabel}) — ${_fs(c.cost)}/мес`, 'amber');
  rd(`Нанят ${c.name}`, 'hire');
  _renderCandidatePool();   // фикс: открытый попап обновляется сразу, карточка исчезает
  EventBus.emit('render');
  notify(`${c.name} принят в команду! ${c.icon}`, 'success');
  if (typeof autoSave === 'function') autoSave();
}

// ── Fire ──────────────────────────────────────────────

function fireStaffById(id) {
  const s = (G.staff || []).find(x => x._iid === id || x.uid === id || x.id === id);
  if (!s) return;
  const severance = Math.round((s.cost || 0) * 0.5);
  // Reuse engine's showConfirm if available, else native confirm
  const msg = `Выходное пособие: ${_fs(severance)}. Потеряете все бонусы этого сотрудника.`;
  if (typeof showConfirm === 'function') {
    showConfirm('👋', `Уволить ${s.name}?`, msg, `Уволить — выплатить ${_fs(severance)}`, 'red', () => {
      if (G.money < severance) { notify('Недостаточно средств для выходного пособия', 'error'); return; }
      G.money -= severance;
      G.staff = G.staff.filter(x => x._iid !== s._iid && x.uid !== s.uid);
      addLog(`👋 Уволен ${s.name}: −${_fs(severance)} (выходное пособие)`, 'red');
      rd(`Уволен ${s.name}`, 'fire');
      EventBus.emit('render');
      notify(`${s.name} покинул команду`, 'info');
      if (typeof autoSave === 'function') autoSave();
    });
  } else {
    if (!confirm(`Уволить ${s.name}?\n${msg}`)) return;
    if (G.money < severance) { notify('Недостаточно средств', 'error'); return; }
    G.money -= severance;
    G.staff = G.staff.filter(x => x._iid !== s._iid && x.uid !== s.uid);
    EventBus.emit('render');
    notify(`${s.name} покинул команду`, 'info');
  }
}

// ── Monthly Processing ─────────────────────────────────

function processStaffMonth() {
  const _loyaltyLeavers = [];
  (G.staff || []).forEach(s => {
    if (s.state !== 'hired') return;
    s.monthsWithAgency = (s.monthsWithAgency || 0) + 1;

    // Base loyalty decay
    s.loyalty = Math.max(0, (s.loyalty || 70) - 2);

    // job_hopper: faster decay
    if (_hasTrait(s, 'job_hopper')) s.loyalty = Math.max(0, s.loyalty - 3);

    // fast_learner: quality growth every 3 months
    if (_hasTrait(s, 'fast_learner') && s.monthsWithAgency % 3 === 0) {
      s.quality    = Math.min(10, (s.quality || 5) + 1);
      s.qStat      = s.quality;
    }

    // Р.1: настроение сотрудника само убывает со временем (быстрее при усталости команды).
    // mood влияет на эффективность (moodMult в calcStaffWorkUnit) — игроку надо его поддерживать.
    const _fat = (typeof G !== 'undefined' && G.teamFatigue) || 0;
    const _moodDecay = 3 + (_fat >= 60 ? 2 : 0) + (_fat >= 85 ? 2 : 0);
    s.mood = Math.min(100, Math.max(10, (s.mood ?? 80) - _moodDecay));

    // Р.1: низкая лояльность → риск ухода к конкуренту (последствие падения лояльности).
    // Трейт «reliable» (никогда не уходит без предупреждения) — иммунитет.
    if (!_hasTrait(s, 'reliable') && (s.loyalty || 0) < 25) {
      const leaveChance = (25 - (s.loyalty || 0)) / 100 * 0.5; // до ~12% при лояльности 0
      if (Math.random() < leaveChance) _loyaltyLeavers.push(s);
    }
  });

  // Р.1: обработка уходов по лояльности (инфраструктура — как у fatigue-quit)
  _loyaltyLeavers.forEach(s => {
    if (typeof EventBus !== 'undefined') EventBus.emit('staff_quit', { staff: { ...s }, reason: 'loyalty' });
    G.staff = G.staff.filter(x => x._iid !== s._iid);
    if (typeof addLog === 'function') addLog(`🚪 ${s.name} ушёл к конкуренту — низкая лояльность`, 'red');
    if (typeof checkCapacityExceeded === 'function') checkCapacityExceeded(s.name);
  });

  // Remove candidates that "went to competitors" (30% per month if pool > 2)
  if ((G.candidatePool || []).length > 2) {
    G.candidatePool = G.candidatePool.filter(() => Math.random() > 0.3);
  }
}

function _hasTrait(staff, traitId) {
  return (staff.traits || []).some(t => t.id === traitId && t.revealed);
}

// ── Р.1: персональные действия заботы (из окна «Команда») ──
function _findStaffByIid(iid) {
  return (G.staff || []).find(s => String(s._iid || s.uid || s.id) === String(iid));
}
function praiseStaff(iid) {
  const s = _findStaffByIid(iid);
  if (!s) return;
  if (s._praiseMonth === G.month) { notify('👏 Уже хвалили в этом месяце', 'warning'); return; }
  s.mood = Math.min(100, (s.mood ?? 80) + 10);
  s._praiseMonth = G.month;
  if (typeof addLog === 'function') addLog(`👏 ${s.name}: похвала — +10 настроения`, 'teal');
  notify(`👏 ${s.name}: +10 настроения`, 'success');
  if (typeof renderGame === 'function') renderGame();
}
function bonusStaff(iid) {
  const s = _findStaffByIid(iid);
  if (!s) return;
  if (s._bonusMonth === G.month) { notify('💰 Премия уже выдана в этом месяце', 'warning'); return; }
  const cost = Math.round((s.cost || s.salary || 0) * 0.5);
  if ((G.money || 0) < cost) { notify('Недостаточно средств для премии', 'error'); return; }
  G.money -= cost;
  s.mood    = Math.min(100, (s.mood ?? 80) + 12);
  s.loyalty = Math.min(100, (s.loyalty ?? 70) + 12);
  s._bonusMonth = G.month;
  if (typeof addLog === 'function') addLog(`💰 ${s.name}: премия −${_fmtStaffMoney(cost)} — +12 настроения, +12 лояльности`, 'teal');
  notify(`💰 ${s.name}: +12 😊 · +12 🏅`, 'success');
  if (typeof renderGame === 'function') renderGame();
}

// ── Team Panel Render ─────────────────────────────────
// Вызывается из ui.js вместо встроенного рендера команды

// ── Хелперы цветов/денег (общие для сайдбара и модала) ──
const _fmtStaffMoney = n => new Intl.NumberFormat('ru-RU').format(Math.round(n)) + ' ₽';
const _moodColor = v => v >= 75 ? 'var(--green)' : v >= 50 ? 'var(--amber)' : 'var(--red)';
const _loyColor  = v => v >= 70 ? 'var(--teal)'  : v >= 40 ? 'var(--amber)' : 'var(--red)';

// Б.10: разметка одной rich-карточки специалиста (используется в модале «Команда»)
function _staffCardHTML(s) {
  const meta  = ROLE_META[s.role] || {};
  const color = meta.color || '#6366f1';
  const emoji = s.icon || meta.emoji || '👤';
  const grade = s.gradeLabel || s.grade || '';
  const cost  = s.cost || s.salary || 0;
  const mood  = s.mood  ?? 80;
  const loy   = s.loyalty ?? 70;
  const iid   = s._iid || s.uid || s.id;

  // Р.1: персональные действия заботы (раз в месяц на сотрудника)
  const curMonth   = (typeof G !== 'undefined' ? G.month : 0);
  const praiseUsed = s._praiseMonth === curMonth;
  const bonusUsed  = s._bonusMonth  === curMonth;
  const bonusCost  = Math.round((cost || 0) * 0.5);

  _recomputeWU(s);
  const wu = s._wu || 0;

  const assignedClient = s._assignedProjectId
    ? (G.activeClients || []).find(c => c.id === s._assignedProjectId)
    : null;
  const assignBadge = assignedClient
    ? `<span style="display:inline-block;margin-top:4px;padding:2px 6px;border-radius:4px;
         background:rgba(99,102,241,.18);color:var(--teal);font-size:10px;font-weight:600">
         📂 ${assignedClient.name || assignedClient.id}</span>` : '';

  const visTraits = (s.traits || []).filter(t => t.revealed);
  const traitBadges = visTraits.slice(0, 3).map(t => {
    const td = TRAITS[t.id] || {};
    const cls = td.type === 'pos' ? 'trait-badge trait-pos' : 'trait-badge trait-neg';
    return `<span class="${cls}" title="${td.desc || ''}">${td.icon || '?'} ${td.label || t.id}</span>`;
  }).join('');

  const hidCount = (s.traits || []).filter(t => !t.revealed).length;
  const hidBadge = hidCount > 0
    ? `<span class="trait-badge trait-hidden" title="Раскрываются в работе">❓ ×${hidCount}</span>` : '';

  return `<div class="staff-char-card">
    <div class="staff-char-avatar" style="background:${color}20;border:1.5px solid ${color}40">
      <span>${emoji}</span>
    </div>
    <div class="staff-char-body">
      <div class="staff-char-top">
        <div>
          <div class="staff-char-name">${s.name || s.id}</div>
          <div class="staff-char-role">${s.roleLabel || s.role}
            <span class="staff-grade-badge">${grade}</span>
          </div>
        </div>
        <div class="staff-char-cost">−${_fmtStaffMoney(cost)}</div>
      </div>
      <div class="staff-char-stats">
        <span data-tip="Качество специалиста (0–10): вклад в итоговое Качество проектов." style="cursor:help">Кач ${s.quality || s.qStat || '—'}</span>
        <span data-tip="Скорость специалиста (0–10): вклад в темп выполнения проектов." style="cursor:help">⚡ ${s.speedStat || '—'}</span>
        <span data-tip="Мощность — вклад специалиста в прогресс проекта за месяц (грейд × качество × настроение)." style="color:var(--teal);cursor:help">⚙ ${wu} мощн.</span>
        ${s.capacity > 0 ? `<span data-tip="Слоты проектов: Менеджер даёт +${s.capacity} — больше проектов одновременно." style="cursor:help">📂 +${s.capacity}</span>` : ''}
      </div>
      ${assignBadge}
      <div class="staff-char-bars">
        <div class="staff-bar-row" title="Настроение: ${mood}%">
          <span class="staff-bar-lbl">😊</span>
          <div class="staff-bar-track"><div class="staff-bar-fill" style="width:${mood}%;background:${_moodColor(mood)}"></div></div>
        </div>
        <div class="staff-bar-row" title="Лояльность: ${loy}%">
          <span class="staff-bar-lbl">🏅</span>
          <div class="staff-bar-track"><div class="staff-bar-fill" style="width:${loy}%;background:${_loyColor(loy)}"></div></div>
        </div>
      </div>
      ${traitBadges || hidBadge
        ? `<div class="staff-char-traits">${traitBadges}${hidBadge}</div>` : ''}
      <div style="display:flex;gap:5px;margin-top:7px">
        <button onclick="praiseStaff('${iid}')" ${praiseUsed ? 'disabled' : ''}
          data-tip="Похвалить: +10 настроения. Бесплатно, раз в месяц на сотрудника."
          style="flex:1;font-size:10px;padding:4px 6px;border-radius:5px;cursor:${praiseUsed ? 'default' : 'pointer'};
                 border:1px solid rgba(45,212,191,.25);background:rgba(45,212,191,.06);color:var(--text);opacity:${praiseUsed ? '.45' : '1'}">
          👏 Похвала${praiseUsed ? ' ✓' : ''}</button>
        <button onclick="bonusStaff('${iid}')" ${bonusUsed ? 'disabled' : ''}
          data-tip="Премия: +12 настроения и +12 лояльности. Стоит ${_fmtStaffMoney(bonusCost)} (≈половина оклада), раз в месяц на сотрудника."
          style="flex:1;font-size:10px;padding:4px 6px;border-radius:5px;cursor:${bonusUsed ? 'default' : 'pointer'};
                 border:1px solid rgba(99,102,241,.25);background:rgba(99,102,241,.06);color:var(--text);opacity:${bonusUsed ? '.45' : '1'}">
          💰 Премия${bonusUsed ? ' ✓' : ''}</button>
      </div>
    </div>
    <button class="staff-fire-btn" onclick="fireStaffById('${iid}')" data-tip="Уволить сотрудника. Выходное пособие: ${_fmtStaffMoney(cost*0.5)} (≈половина оклада).">✕</button>
  </div>`;
}

function _founderCardHTML() {
  return `<div class="staff-char-card founder-card">
    <div class="staff-char-avatar" style="background:rgba(79,110,247,.25)"><span>🧑‍💼</span></div>
    <div class="staff-char-body">
      <div class="staff-char-name">Ты (Фаундер)</div>
      <div class="staff-char-role">Продажи · Скаутинг</div>
    </div>
    <div class="staff-char-cost" style="color:var(--sub);font-size:11px">бесплатно</div>
  </div>`;
}

// ══════════════════════════════════════════════════════
//  Б.10 — Сайдбар: компактная сводка команды + кнопка окна
// ══════════════════════════════════════════════════════
function renderTeamCards(el) {
  if (!el) return;
  const staff = (G.staff || []).filter(s => s.status !== 'fired');
  const n   = staff.length;
  const fot = staff.reduce((a, s) => a + (s.cost || s.salary || 0), 0);
  const avg = (key, def) => n ? Math.round(staff.reduce((a, s) => a + (s[key] ?? def), 0) / n) : def;
  const avgMood = avg('mood', 80);
  const avgLoy  = avg('loyalty', 70);
  const bar = (val, col, icon, label) => `
    <div class="staff-bar-row" title="${label}: ${val}%" style="margin-top:3px">
      <span class="staff-bar-lbl">${icon}</span>
      <div class="staff-bar-track"><div class="staff-bar-fill" style="width:${val}%;background:${col}"></div></div>
      <span style="font-size:10px;color:var(--sub);min-width:26px;text-align:right">${val}%</span>
    </div>`;

  el.innerHTML = `
    ${_founderCardHTML()}
    <div style="display:flex;align-items:baseline;justify-content:space-between;margin-top:8px">
      <span style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">В штате</span>
      <span style="font-size:13px;font-weight:700;color:var(--text)">${n} чел.</span>
    </div>
    <div style="display:flex;align-items:baseline;justify-content:space-between;margin-top:2px">
      <span style="font-size:11px;color:var(--muted)">ФОТ</span>
      <span style="font-size:12px;font-weight:600;color:var(--red)">−${_fmtStaffMoney(fot)}/мес</span>
    </div>
    ${n ? bar(avgMood, _moodColor(avgMood), '😊', 'Средняя мораль') + bar(avgLoy, _loyColor(avgLoy), '🏅', 'Средняя лояльность') : ''}
    <button onclick="openTeamModal()" style="margin-top:10px;width:100%;background:rgba(99,102,241,.10);
      border:1px solid rgba(99,102,241,.30);border-radius:8px;padding:9px 12px;cursor:pointer;
      display:flex;align-items:center;justify-content:center;gap:8px;color:var(--text);font-weight:600;font-size:12px;
      transition:background .15s" onmouseover="this.style.background='rgba(99,102,241,.18)'"
      onmouseout="this.style.background='rgba(99,102,241,.10)'">
      👥 Управление командой <span style="color:var(--muted);font-weight:500">(${n})</span>
    </button>`;

  // если окно команды открыто — синхронизируем его содержимое
  if (document.getElementById('team-modal')) _renderTeamGrid();
}

// ══════════════════════════════════════════════════════
//  Б.10 — Модал «Команда»: сетка карточек + сортировка/поиск
// ══════════════════════════════════════════════════════
let _teamSort  = 'role';
let _teamQuery = '';

function openTeamModal() {
  if (typeof document === 'undefined') return;
  let m = document.getElementById('team-modal');
  if (!m) {
    m = document.createElement('div');
    m.id = 'team-modal';
    m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:330;display:flex;align-items:center;justify-content:center;padding:24px';
    m.onclick = e => { if (e.target === m) closeTeamModal(); };
    document.body.appendChild(m);
  }
  const sortOpts = [
    ['role', 'по роли'], ['power', 'по мощности'], ['mood', 'по морали'],
    ['loyalty', 'по лояльности'], ['salary', 'по окладу'], ['name', 'по имени'],
  ].map(([v, l]) => `<option value="${v}" ${v === _teamSort ? 'selected' : ''}>${l}</option>`).join('');

  m.innerHTML = `
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:14px;width:100%;max-width:900px;
                max-height:86vh;display:flex;flex-direction:column;overflow:hidden">
      <div style="display:flex;align-items:center;gap:12px;padding:16px 20px;border-bottom:1px solid var(--border);flex-wrap:wrap">
        <div style="font-size:16px;font-weight:800;color:var(--text)">👥 Команда</div>
        <span id="team-modal-count" style="font-size:12px;color:var(--muted)"></span>
        <div style="flex:1"></div>
        <input id="team-search" type="text" placeholder="🔍 Поиск по имени" value="${_teamQuery.replace(/"/g,'&quot;')}"
          oninput="setTeamQuery(this.value)"
          style="background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);
                 font-size:12px;padding:7px 10px;width:180px;outline:none">
        <select onchange="setTeamSort(this.value)"
          style="background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:12px;padding:7px 10px;cursor:pointer">
          ${sortOpts}
        </select>
        <button onclick="closeTeamModal()" title="Закрыть"
          style="background:transparent;border:1px solid var(--border);border-radius:8px;color:var(--sub);
                 cursor:pointer;font-size:14px;padding:6px 11px">✕</button>
      </div>
      <div id="team-modal-grid" style="padding:16px 20px;overflow-y:auto;display:grid;
           grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:10px;align-content:start"></div>
    </div>
    <style>
      #team-modal-grid .staff-char-card{border:1px solid var(--border);border-radius:10px;
        background:rgba(255,255,255,.02);padding:10px 12px;margin:0}
      #team-modal-grid .staff-char-card:last-child{border-bottom:1px solid var(--border)}
    </style>`;
  m.style.display = 'flex';
  _renderTeamGrid();
}

function closeTeamModal() {
  const m = document.getElementById('team-modal');
  if (m) m.remove();
}

function _renderTeamGrid() {
  const grid = document.getElementById('team-modal-grid');
  if (!grid) return;
  let staff = (G.staff || []).filter(s => s.status !== 'fired');

  const q = (_teamQuery || '').trim().toLowerCase();
  if (q) staff = staff.filter(s => (s.name || s.id || '').toLowerCase().includes(q));

  const byKey = {
    role:    (a, b) => (a.roleLabel || a.role || '').localeCompare(b.roleLabel || b.role || ''),
    name:    (a, b) => (a.name || '').localeCompare(b.name || ''),
    mood:    (a, b) => (b.mood ?? 80) - (a.mood ?? 80),
    loyalty: (a, b) => (b.loyalty ?? 70) - (a.loyalty ?? 70),
    salary:  (a, b) => (b.cost || b.salary || 0) - (a.cost || a.salary || 0),
    power:   (a, b) => { _recomputeWU(a); _recomputeWU(b); return (b._wu || 0) - (a._wu || 0); },
  };
  staff.sort(byKey[_teamSort] || byKey.role);

  const cnt = document.getElementById('team-modal-count');
  if (cnt) cnt.textContent = `${staff.length} чел.${q ? ' (фильтр)' : ''} · фаундер +1`;

  grid.innerHTML = _founderCardHTML() + staff.map(_staffCardHTML).join('');
  if (staff.length === 0) {
    grid.innerHTML += `<div style="grid-column:1/-1;text-align:center;color:var(--muted);font-size:13px;padding:18px 0">
      ${q ? 'Никто не найден по запросу' : 'В штате пока никого — наймите специалистов'}</div>`;
  }
}

function setTeamSort(v)  { _teamSort = v;  _renderTeamGrid(); }
function setTeamQuery(v) { _teamQuery = v; _renderTeamGrid(); }

// ══════════════════════════════════════════════════════
//  MODAL UI — Scout
// ══════════════════════════════════════════════════════

function openStaffScoutModal() {
  _renderCandidatePool();
  document.getElementById('staff-scout-modal')?.classList.add('active');
}

function closeStaffScoutModal() {
  document.getElementById('staff-scout-modal')?.classList.remove('active');
}

function _renderCandidatePool() {
  const el = document.getElementById('candidate-pool-list');
  if (!el) return;
  const pool = G.candidatePool || [];

  if (pool.length === 0) {
    el.innerHTML = `<div class="cand-empty">
      <div style="font-size:48px;margin-bottom:12px">🔍</div>
      <p>Пул кандидатов пуст</p>
      <p style="font-size:12px;color:var(--muted);margin-top:6px">Запусти скаутинг выше, чтобы найти специалистов</p>
    </div>`;
    return;
  }

  // Count per category for chip badges
  const catCounts = {};
  ROLE_CATEGORIES.forEach(cat => {
    catCounts[cat.id] = pool.filter(c => cat.roles.includes(c.role)).length;
  });

  // Filter chips
  const allChip = `<button onclick="setCandidateFilter(null)"
    style="padding:4px 11px;border-radius:20px;border:1.5px solid ${!_candidateFilter ? 'var(--teal)' : 'rgba(255,255,255,.12)'};
           background:${!_candidateFilter ? 'rgba(0,212,170,.12)' : 'transparent'};
           color:var(--fg);font-size:11px;cursor:pointer;white-space:nowrap;transition:all .15s">
    Все <span style="opacity:.6">${pool.length}</span>
  </button>`;

  const catChips = ROLE_CATEGORIES.map(cat => {
    const cnt   = catCounts[cat.id];
    const act   = _candidateFilter === cat.id;
    const empty = cnt === 0;
    return `<button onclick="setCandidateFilter('${cat.id}')"
      style="padding:4px 11px;border-radius:20px;border:1.5px solid ${act ? 'var(--teal)' : 'rgba(255,255,255,.12)'};
             background:${act ? 'rgba(0,212,170,.12)' : 'transparent'};
             color:${empty ? 'var(--muted)' : 'var(--fg)'};
             font-size:11px;cursor:pointer;white-space:nowrap;transition:all .15s;display:inline-flex;align-items:center;gap:5px">
      ${cat.emoji} ${cat.label}
      ${cnt > 0 ? `<span style="background:rgba(255,255,255,.1);border-radius:8px;padding:0 5px;font-size:10px;color:var(--sub)">${cnt}</span>` : ''}
    </button>`;
  }).join('');

  const filterBar = `<div style="display:flex;flex-wrap:wrap;gap:5px;padding-bottom:10px;border-bottom:1px solid rgba(255,255,255,.06);margin-bottom:10px">
    ${allChip}${catChips}
  </div>`;

  // Render: grouped when "Все", flat when category filter active
  let cardsHtml;
  if (!_candidateFilter) {
    // Grouped by category
    cardsHtml = ROLE_CATEGORIES.map(cat => {
      const group = pool.filter(c => cat.roles.includes(c.role));
      if (group.length === 0) return '';
      return `<div style="margin-bottom:12px">
        <div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;
                    letter-spacing:.7px;margin-bottom:6px;padding:0 2px;display:flex;align-items:center;gap:6px">
          <span>${cat.emoji}</span><span>${cat.label}</span>
          <span style="font-weight:400;opacity:.6">${group.length}</span>
        </div>
        <div>${group.map(c => _candidateCard(c)).join('')}</div>
      </div>`;
    }).join('');
    if (!cardsHtml) cardsHtml = `<div style="text-align:center;padding:24px;color:var(--muted);font-size:13px">Нет кандидатов</div>`;
  } else {
    const cat      = ROLE_CATEGORIES.find(rc => rc.id === _candidateFilter);
    const filtered = cat ? pool.filter(c => cat.roles.includes(c.role)) : [];
    cardsHtml = filtered.length > 0
      ? filtered.map(c => _candidateCard(c)).join('')
      : `<div style="text-align:center;padding:32px 16px;color:var(--muted)">
           <div style="font-size:32px;margin-bottom:8px">${cat?.emoji || '🔍'}</div>
           <div style="font-size:13px">Нет кандидатов в этой категории</div>
           <div style="font-size:11px;margin-top:4px;opacity:.7">Запусти скаутинг или выбери другую категорию</div>
         </div>`;
  }

  el.innerHTML = filterBar + cardsHtml;
}

function setCandidateFilter(catId) {
  _candidateFilter = catId || null;
  _renderCandidatePool();
}

function _candidateCard(c) {
  const meta  = ROLE_META[c.role] || {};
  const color = meta.color || '#6366f1';
  const cfg   = GRADE_CFG[c.grade] || {};

  // Вычислить мощность кандидата
  _recomputeWU(c);
  const wu = c._wu || 0;

  const vis    = (c.traits || []).filter(t => t.revealed);
  const hidden = (c.traits || []).filter(t => !t.revealed).length;

  const traitHtml = vis.map(t => {
    const td = TRAITS[t.id] || {};
    const cls = td.type === 'pos' ? 'trait-badge trait-pos' : 'trait-badge trait-neg';
    return `<span class="${cls}" title="${td.desc || ''}">${td.icon || '?'} ${td.label || t.id}</span>`;
  }).join('') + (hidden > 0 ? `<span class="trait-badge trait-hidden">❓ ×${hidden}</span>` : '');

  const id = c.uid || c.id;
  return `
    <div class="cand-card">
      <div class="cand-avatar" style="background:${color}20;border:1.5px solid ${color}50">
        <span>${meta.emoji || '👤'}</span>
      </div>
      <div class="cand-info">
        <div class="cand-header">
          <div>
            <div class="cand-name">${c.name}<span class="cand-age"> · ${c.age} л</span></div>
            <div class="cand-role">${c.roleLabel || c.role} · <span class="cand-grade-lbl">${cfg.label || c.grade}</span></div>
          </div>
          <div class="cand-salary">${_fs(c.salaryAsk)}/мес</div>
        </div>
        <div class="cand-stats">
          <span data-tip="Качество специалиста (0–10): вклад в итоговое Качество проектов." style="cursor:help">Кач <strong>${c.qStat || c.quality}</strong></span>
          <span data-tip="Скорость специалиста (0–10): вклад в темп выполнения проектов." style="cursor:help">⚡ <strong>${c.speedStat}</strong></span>
          <span data-tip="Опыт работы, лет." style="cursor:help">🕐 ${c.experience} л</span>
          <span data-tip="Мощность — вклад специалиста в прогресс проекта за месяц." style="color:var(--teal);cursor:help">⚙ <strong>${wu}</strong> мощн.</span>
        </div>
        <div class="cand-traits">${traitHtml}</div>
      </div>
      <button class="btn btn-teal cand-btn" style="font-size:11px;padding:6px 12px;flex-shrink:0"
              onclick="openCandidateProfile('${id}')">Профиль →</button>
    </div>`;
}

// ══════════════════════════════════════════════════════
//  MODAL UI — Profile + Interview + Offer
// ══════════════════════════════════════════════════════

let _itvId  = null; // current candidate id in profile modal
let _itvSalaryRevealed = false;

function openCandidateProfile(id) {
  _itvId = id;
  _itvSalaryRevealed = false;
  const pool = G.candidatePool || [];
  const c = pool.find(x => x.uid === id || x.id === id);
  if (!c) return;
  _renderProfileContent(c, null);
  document.getElementById('staff-profile-modal')?.classList.add('active');
}

function closeStaffProfileModal() {
  document.getElementById('staff-profile-modal')?.classList.remove('active');
  _itvId = null;
}

function _renderProfileContent(c, result) {
  const body = document.getElementById('staff-profile-body');
  if (!body) return;

  const meta   = ROLE_META[c.role] || {};
  const color  = meta.color || '#6366f1';
  const cfg    = GRADE_CFG[c.grade] || {};
  const vis    = (c.traits || []).filter(t => t.revealed);
  const hidCnt = (c.traits || []).filter(t => !t.revealed).length;

  // Trait blocks
  const traitBlocks = vis.map(t => {
    const td  = TRAITS[t.id] || {};
    const cls = td.type === 'pos' ? 'profile-trait-pos' : 'profile-trait-neg';
    return `<div class="profile-trait ${cls}">
      <span class="trait-icon">${td.icon || '?'}</span>
      <div>
        <div class="trait-name">${td.label || t.id}</div>
        <div class="trait-desc">${td.desc || ''}</div>
      </div>
    </div>`;
  }).join('');

  const hiddenBlock = hidCnt > 0
    ? `<div class="profile-trait profile-trait-hidden">
        <span class="trait-icon">❓</span>
        <div>
          <div class="trait-name">${hidCnt} ${hidCnt === 1 ? 'скрытый трейт' : 'скрытых трейта'}</div>
          <div class="trait-desc">Раскрываются в собеседовании или в процессе совместной работы</div>
        </div>
      </div>`
    : '';

  // Interview result
  let revealHtml = '';
  if (result?.revealed?.length > 0) {
    const badges = result.revealed.map(t => {
      const td = TRAITS[t.id] || {};
      const cls = td.type === 'pos' ? 'trait-badge trait-pos' : 'trait-badge trait-neg';
      return `<span class="${cls}">${td.icon || '?'} ${td.label || t.id}</span>`;
    }).join('');
    revealHtml = `<div class="itv-reveal-block">
      <div class="itv-reveal-title">🔍 Раскрыто:</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">${badges}</div>
      ${result.salaryRevealed
        ? `<div class="itv-salary-hint">💡 Минимальный оффер: ~${_fs(Math.round(c.salaryMin * 1.05))} (±5%)</div>`
        : ''}
    </div>`;
  }

  // Interview form or done
  const itvHtml = c.interviewDone
    ? `<div class="itv-done">✅ Собеседование проведено</div>`
    : `<div class="itv-section">
        <div class="itv-title">💬 Собеседование</div>
        <div class="itv-hint">Выбери тактику — правильный подход раскроет скрытые трейты кандидата</div>
        ${ITV_QS.map(q => `
          <div class="itv-question">
            <div class="itv-q-text">${q.text}</div>
            <div class="itv-options">
              ${q.opts.map((o, oi) => `
                <label class="itv-option">
                  <input type="radio" name="itv_${q.id}" value="${oi}">
                  <span>${o.text}</span>
                </label>`).join('')}
            </div>
          </div>`).join('')}
        <button class="btn btn-primary" style="width:100%;justify-content:center;margin-top:12px"
                onclick="submitInterviewForm()">Провести собеседование →</button>
      </div>`;

  // Offer (only after interview)
  const offerHtml = c.interviewDone
    ? `<div class="offer-section">
        <div class="offer-title">💼 Оффер</div>
        <div class="offer-row">
          <span>Запрос кандидата:</span>
          <strong>${_fs(c.salaryAsk)}/мес</strong>
        </div>
        <div class="offer-row" style="margin-top:10px;align-items:center">
          <label for="offer-inp">Ваш оффер (₽/мес):</label>
          <input id="offer-inp" type="number" class="offer-input"
            value="${c.salaryAsk}" min="15000" step="5000">
        </div>
        <div class="offer-hint">Предложите ниже запроса — есть риск отказа. Выше — кандидат точно согласится.</div>
        <button class="btn btn-teal" style="width:100%;justify-content:center;margin-top:12px"
                onclick="submitOffer()">Сделать оффер →</button>
      </div>`
    : '';

  body.innerHTML = `
    <div class="profile-header">
      <div class="profile-avatar" style="background:${color}20;border:2px solid ${color}60">
        <span>${meta.emoji || '👤'}</span>
      </div>
      <div class="profile-meta">
        <div class="profile-name">${c.name}</div>
        <div class="profile-subrole">${c.roleLabel || c.role}
          <span class="staff-grade-badge">${cfg.label || c.grade}</span>
        </div>
        <div class="profile-age">${c.age} лет · ${c.experience} ${c.experience >= 5 ? 'лет' : 'года'} опыта</div>
      </div>
    </div>

    <div class="profile-stats-row">
      <div class="profile-stat">
        <div class="profile-stat-val">${c.qStat || c.quality}</div>
        <div class="profile-stat-lbl">Качество</div>
      </div>
      <div class="profile-stat">
        <div class="profile-stat-val">${c.speedStat}</div>
        <div class="profile-stat-lbl">Скорость</div>
      </div>
      <div class="profile-stat">
        <div class="profile-stat-val">${c.npsBonus > 0 ? '+' : ''}${c.npsBonus}</div>
        <div class="profile-stat-lbl">NPS</div>
      </div>
      ${c.capacity > 0
        ? `<div class="profile-stat">
            <div class="profile-stat-val">+${c.capacity}</div>
            <div class="profile-stat-lbl">Слоты</div>
          </div>`
        : ''}
    </div>

    <div class="profile-section-lbl">Особенности</div>
    <div class="profile-traits-list">
      ${traitBlocks || '<div style="color:var(--muted);font-size:12px">Трейты не видны в резюме</div>'}
      ${hiddenBlock}
    </div>

    ${revealHtml}
    ${itvHtml}
    ${offerHtml}`;
}

function submitInterviewForm() {
  const pool = G.candidatePool || [];
  const cIdx = pool.findIndex(x => x.uid === _itvId || x.id === _itvId);
  if (cIdx < 0) return;
  const c = pool[cIdx];

  const revealed = [];
  let salaryRevealed = false;
  let moodBoost = 0;

  ITV_QS.forEach(q => {
    const sel = document.querySelector(`input[name="itv_${q.id}"]:checked`);
    if (!sel) return;
    const opt = q.opts[parseInt(sel.value)];
    if (!opt) return;

    switch (opt.effect) {
      case 'pos': case 'neg': {
        const hidden = c.traits.filter(t => !t.revealed);
        const target = hidden.find(t => TRAITS[t.id]?.type === (opt.effect === 'pos' ? 'pos' : 'neg'))
                    || hidden[0];
        if (target) { target.revealed = true; revealed.push(target); }
        break;
      }
      case 'loyalty': {
        const hidden = c.traits.filter(t => !t.revealed);
        const target = hidden.find(t => t.id === 'job_hopper' || t.id === 'loyal_trait') || hidden[0];
        if (target) { target.revealed = true; revealed.push(target); }
        break;
      }
      case 'salary':
        salaryRevealed = true;
        _itvSalaryRevealed = true;
        break;
      case 'mood':
        moodBoost += 10;
        break;
    }
  });

  if (moodBoost > 0) {
    c.mood = Math.min(100, (c.mood || 70) + moodBoost);
    c.salaryMin = Math.round(c.salaryMin * 0.95);
  }

  c.interviewDone = true;
  G.candidatePool[cIdx] = c;

  _renderProfileContent(c, { revealed, salaryRevealed });
}

function submitOffer() {
  const pool = G.candidatePool || [];
  const cIdx = pool.findIndex(x => x.uid === _itvId || x.id === _itvId);
  if (cIdx < 0) return;
  const c = pool[cIdx];

  const input   = document.getElementById('offer-inp');
  const offered = parseInt(input?.value || '0');

  if (!offered || offered < 10000) {
    notify('Введи корректную сумму оффера', 'error');
    return;
  }

  if (offered < c.salaryMin) {
    notify(`${c.name} отклонил оффер — слишком низко`, 'error');
    G.candidatePool = pool.filter((_, i) => i !== cIdx);
    _renderCandidatePool();
    closeStaffProfileModal();
    return;
  }

  const agreedSalary = Math.min(offered, c.salaryAsk); // не платим больше запроса
  hireCandidate(c.uid || c.id, agreedSalary);
  closeStaffProfileModal();
}
