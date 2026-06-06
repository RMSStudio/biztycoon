// ══════════════════════════════════════════════════════
//  ENGINE — стейт, хелперы, игровая логика
//  Зависит от: constants.js, scenarios/{id}.js
// ══════════════════════════════════════════════════════

// ── Scenario bindings ─────────────────────────────────
// SCENARIO объявляется в scenarios/{id}.js и загружается до engine.js.
// Алиасы дают обратную совместимость: весь код внутри engine.js
// продолжает использовать прежние имена без изменений.
const STAFF_DEFS        = SCENARIO.staff;
const STAFF_ROLES       = SCENARIO.staffRoles;
const ROLE_LABELS       = SCENARIO.roleLabels;
const PROJECT_POOL      = SCENARIO.projects;
const BUDGET_RANGES     = SCENARIO.budgetRanges;
const UPGRADES          = SCENARIO.upgrades;
const SPECS             = SCENARIO.specs;
const EVENTS            = SCENARIO.events;
// let (не const) — чтобы initState() ресинкал их после SE.applyActiveScenario()
let OVERHEAD          = SCENARIO.settings.overhead;
let ACTIONS_PER_MONTH = SCENARIO.settings.actionsPerMonth;
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
  // Применяем активный сценарий и ресинкаем let-биндинги.
  // Работает и при первом запуске, и при "Играть снова" без перезагрузки страницы.
  if (typeof SE !== 'undefined') SE.applyActiveScenario();
  OVERHEAD          = SCENARIO.settings.overhead;
  ACTIONS_PER_MONTH = SCENARIO.settings.actionsPerMonth;
  SCOUT_COST        = SCENARIO.settings.scoutCost;
  HIRE_COST         = SCENARIO.settings.hireCost;

  G = {
    spec:null, money:500000, month:0,
    staff:[], activeClients:[], log:[],
    tempDiscount:0, monthsPlayed:0,
    actions: ACTIONS_PER_MONTH,
    reputation: 100,
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
    loan: null,             // активный кредит { principal, monthlyPayment, monthsRemaining, label }
    teamFatigue: 0,              // усталость команды 0–100: 30+=напряжение, 60+=выгорание, 85+=кризис
    fatigueActionCooldowns: {},  // { paid_leave:N, teambuilding:N, corp_vacation:N } — мес. до доступности
    oneTimeCooldown: 0,          // мес. до следующего oneTime с cooldown (0 = доступен)
    speedUpgrades: 0,            // суммарный бонус Speed от перков (0.10/0.15/0.20 за Agile/Scrum/Auto)
  };
  DECISIONS = [];
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
  G.money=SCENARIO.settings.startMoney; G.month=0; G.staff=[]; G.activeClients=[]; G.log=[];
  G.tempDiscount=0; G.monthsPlayed=0;
  G.actions=ACTIONS_PER_MONTH; G.reputation=100;
  G.clientNPS={}; G.clientEarnings={}; G.delayedIncome=0; G.history=[];
  G.upgrades={}; G.qualityBonus=0; G.tempQBonus=0; G.portfolio=0;
  G.completedProjects=[]; G.cases=[]; G.caseQBonus=0; G.caseRepBonus=0; G.caseScoutBonus=0; G.caseRepPenalty=0; G.scoutPool=null; G.loan=null; G.teamFatigue=0; G.fatigueActionCooldowns={}; G.oneTimeCooldown=0; G.speedUpgrades=0;
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
  return 1.0 + staffBonus + (g.speedUpgrades||0) + loanDebuff + specBonus;
}
// +0.4% выручки за каждый балл портфолио, cap +20% при 50 баллах
function getPortfolioMultiplier(g=G){ return 1+Math.min((g.portfolio||0)*0.004, 0.20); }

// Множитель прогресса от усталости команды
function getFatigueMult(g=G) {
  const ft = g.teamFatigue || 0;
  return ft >= 85 ? 0.70 : ft >= 60 ? 0.85 : ft >= 30 ? 0.95 : 1.0;
}

// ── THROUGHPUT / LOAD ────────────────────────────────────
// Производительность команды (базовая = 10 у фаундера + throughput каждого сотрудника)
function getTeamThroughput(g=G) {
  return 10 + g.staff.reduce((s,x) => s + (x.throughput||0), 0);
}

// Нагрузка одного проекта по тиру
// payment_delay_fixed: в период ожидания проект не нагружает команду
function getProjectLoad(c) {
  if (c.modifier?.type==='payment_delay_fixed' && (c._monthsSigned||0) <= c.modifier.val) return 0;
  return c.tier === 3 ? 24 : c.tier === 2 ? 14 : 7;
}

// Суммарная нагрузка от активных не-разовых проектов
function getTotalLoad(g=G) {
  return g.activeClients.filter(c=>!c.oneTime).reduce((s,c) => s + getProjectLoad(c), 0);
}

// Суммарный пайплайн (ожидаемые выплаты при завершении)
function getPipelineValue(g=G) {
  return g.activeClients.reduce((s,c) => s + (c._totalBudget||0), 0);
}

function getTotalStaffCost(g=G) {
  let t=g.staff.reduce((s,x)=>s+x.cost,0);
  if (SPECS[g.spec].bonus==='staff_cost') t=Math.round(t*(1+SPECS[g.spec].bonusVal));
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
function _emitEndGame(won) { EventBus.emit('end_game',   { won }); }

function npsColor(v) {
  return v>=65?'var(--green)':v>=42?'var(--amber)':'var(--red)';
}

function repColor(v) {
  return v>=70?'var(--green)':v>=40?'var(--amber)':'var(--red)';
}

// ══════════════════════════════════════════════════════
//  NPS ENGINE
// ══════════════════════════════════════════════════════
function nudgeAllNPS(g,delta) {
  g.activeClients.forEach(c=>{ g.clientNPS[c.id]=clamp((g.clientNPS[c.id]||70)+delta,0,100); });
}

function updateAllNPS() {
  const quality=getQuality(), volume=getVolume();
  const overloaded=G.activeClients.length>=getCapacity();
  const hasManager=!!G.staff.find(s=>s.id==='manager');
  const hrBonus=countRole('hr')*3; // +3 NPS/мес per HR
  const churned=[];

  G.activeClients.forEach(c=>{
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
    else if (nps<45) addLog(`⚠️ ${c.name}: NPS ${Math.round(nps)} — клиент недоволен`,'amber');
  });

  churned.forEach(c=>{
    const finalNPS=Math.round(G.clientNPS[c.id]||20);
    G.completedProjects=G.completedProjects||[];
    G.completedProjects.push({
      id:c.id, name:c.name, icon:c.icon, revenue:c.revenue, tier:c.tier||1,
      finalNPS:finalNPS, monthCompleted:G.month, terminated:false, failed:true, _cased:false,
    });
    G.activeClients=G.activeClients.filter(a=>a.id!==c.id);
    delete G.clientNPS[c.id];
    addLog(`💔 ${c.name} расторг контракт (NPS обнулился)`,'red');
    notify(`${c.icon} ${c.name} ушёл сам`,'error');
    rd(`${c.name} ушёл органически`,'churn');
  });
}

function investInClient(cid) {
  if (G.money<20000){ notify('Мало денег','error'); return; }
  const c=G.activeClients.find(a=>a.id===cid);
  if (!c) return;
  G.money-=20000;
  const before=Math.round(G.clientNPS[cid]||70);
  G.clientNPS[cid]=clamp((G.clientNPS[cid]||70)+25,0,100);
  addLog(`💬 Инвестиция в ${c.name}: NPS ${before}→${Math.round(G.clientNPS[cid])}`,'teal');
  notify(`NPS ${c.name}: ${before}→${Math.round(G.clientNPS[cid])} 📈`,'success');
  rd(`Инвестиция в ${c.name}:  NPS+25`,'event');
  _emitRender();
}

// ══════════════════════════════════════════════════════
//  SCOUTING
// ══════════════════════════════════════════════════════
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

  const maxTier = G.reputation>=80?4 : G.reputation>=70?3 : G.reputation>=40?2 : 1;

  // Rarity weights: epic только при rep≥80, rare при rep≥60
  const rarityOk = r => {
    if (r==='epic')    return G.reputation >= 80;
    if (r==='rare')    return G.reputation >= 60;
    return true; // common/uncommon всегда
  };

  const pool=PROJECT_POOL.filter(p=>
    p.tier<=maxTier &&
    rarityOk(p.rarity||'common') &&
    (!p.requiresDev  || hasRole('developer')) &&
    (!p.minPortfolio || (G.portfolio||0)>=p.minPortfolio)
  );

  // Взвешенный выбор: вероятность из поля prob; epic/rare имеют меньший prob
  const offers=[];
  const available = pool.filter(p => !G.activeClients.find(c=>c.id.startsWith(p.id)));
  const shuffled  = [...available].sort(()=>Math.random()-0.5);
  for (let i=0; i<shuffled.length && offers.length<offerCount; i++){
    const p=shuffled[i];
    if (Math.random() < (p.prob||0.5))
      offers.push({ ...p, _prepaymentPossible: !p.oneTime && Math.random() < 0.25 });
  }
  // Если не набрали нужное количество — берём без prob-фильтра
  if (offers.length < offerCount) {
    for (let i=0; i<shuffled.length && offers.length<offerCount; i++){
      const p=shuffled[i];
      if (!offers.find(o=>o.id===p.id))
        offers.push({ ...p, _prepaymentPossible: !p.oneTime && Math.random() < 0.25 });
    }
  }
  return offers;
}

function doScouting() {
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

    // ── Load chip ──
    const tierLoad  = p.tier===3?24:p.tier===2?14:7;
    const hasDelay  = p.modifier?.type==='payment_delay_fixed';
    const curLoad   = getTotalLoad();
    const curThr    = getTeamThroughput();
    const projLoad  = curLoad + (hasDelay ? 0 : tierLoad);
    const willOvld  = !hasDelay && projLoad > curThr;
    const loadBg    = willOvld ? 'rgba(248,81,73,.12)' : 'rgba(45,212,191,.1)';
    const loadCol   = willOvld ? 'var(--red)' : 'var(--teal)';
    const loadNote  = hasDelay
      ? `<span style="font-size:10px;color:var(--muted)">загрузка начнётся через ${p.modifier.val} мес.</span>`
      : willOvld
        ? `<span style="font-size:10px;color:var(--red)">⚠ перегруз: ${projLoad}/${curThr} произв.</span>`
        : `<span style="font-size:10px;color:var(--muted)">${projLoad}/${curThr} произв. после подписания</span>`;
    const loadRow = `<div style="margin-top:6px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      <span style="font-size:11px;padding:2px 7px;border-radius:4px;background:${loadBg};color:${loadCol};font-weight:600">⚙️ ${tierLoad}</span>
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
        if (!p._prepaymentPossible) return '';
        const [bMin, bMax] = BUDGET_RANGES[p.tier] || [80000, 150000];
        const advMin = Math.round(bMin * 0.25 / 5000) * 5000;
        const advMax = Math.round(bMax * 0.35 / 5000) * 5000;
        const withLawyer = hasRole('lawyer');
        const chance = withLawyer ? 65 : 50;
        return `<div style="margin-top:6px;background:rgba(63,185,80,.08);border:1px solid rgba(63,185,80,.2);border-radius:6px;padding:5px 8px">
          <div style="font-size:11px;color:var(--green);font-weight:600;margin-bottom:2px">💰 Предоплата при подписании</div>
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
            <span style="font-size:10px;color:var(--sub)">~${fmtK(advMin)}–${fmtK(advMax)} сразу</span>
            <span style="font-size:10px;font-weight:700;color:var(--green)">${chance}% шанс${withLawyer?' <span style="font-weight:400;color:var(--muted)">(⚖️ +15%)</span>':''}</span>
          </div>
        </div>`;
      })()}
      ${reqRow}
      ${canTake?`<button class="btn btn-primary btn-sm" style="width:100%;justify-content:center;margin-top:10px;" onclick="signProject('${p.id}')">Подписать контракт</button>`:''}
    `;
    grid.appendChild(card);
  });

  modal.classList.add('active');
} // end _legacyShowScout

function signProject(pid) {
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
    if (Array.isArray(fb)) return Math.round((fb[0] + Math.random() * (fb[1] - fb[0])) / 1000) * 1000;
    if (fb) return fb;
    const [bMin, bMax] = BUDGET_RANGES[def.tier] || BUDGET_RANGES[1];
    return Math.round((bMin + Math.random() * (bMax - bMin)) / 5000) * 5000;
  })();

  // Milestone-выплаты: T2 — 30% при 50%; T3 — 25% при 33% и 25% при 66%
  const _mThresholds = def.oneTime ? [] : def.tier===2 ? [50] : def.tier===3 ? [33,66] : [];
  const _mPayPcts    = def.oneTime ? [] : def.tier===2 ? [0.30] : def.tier===3 ? [0.25,0.25] : [];

  const client={
    ...def,
    id: pid+'_'+G.month,
    _monthsSigned: 0,
    // Дедлайн: явный duration из дефиниции или тир-дефолт (tier1=3, tier2=4, tier3=5 мес.)
    _duration: def.oneTime ? 1 : (def.duration || (def.tier===1 ? 3 : def.tier===2 ? 4 : 5)),
    _originalBudget: totalBudget,  // для расчёта milestone — до вычета аванса
    _totalBudget: totalBudget,
    _progress: 0,   // 0–100%
    _focus: 50,       // вес фокуса для регулярных проектов; перераспределяется ниже
    _scheduled: def.oneTime ? false : undefined, // разовые: true = запланировано на этот месяц
    _milestones: _mThresholds,     // массив порогов прогресса [%]
    _milestonePcts: _mPayPcts,     // доля от _originalBudget для каждого milestone
    _milestonesPaid: [],           // индексы уже выплаченных milestone
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

  G.activeClients.push(client);
  G.clientNPS[client.id]=client.npsStart||70;
  G.clientEarnings[client.id]=0;

  // Redistribute focus equally among all non-oneTime projects (sum = 100%)
  const _fAll = G.activeClients.filter(c=>!c.oneTime);
  if (_fAll.length > 0) {
    const _base = Math.floor(100 / _fAll.length);
    let   _rem  = 100 - _base * _fAll.length;
    _fAll.forEach(fc => { fc._focus = _base + (_rem-- > 0 ? 1 : 0); });
  }

  // Immediate modifier effects
  if (client.modifier.type==='reputation'){
    const repHit=hasRole('lawyer') ? Math.round(client.modifier.val*0.5) : client.modifier.val;
    G.reputation=clamp(G.reputation+repHit,0,100);
    addLog(`⚠️ Репутация: ${repHit} (серая зона${hasRole('lawyer')?' — юрист −50%':''})`,'red');
  }

  addLog(`✅ Подписан: ${client.name} — бюджет ${fmtK(totalBudget)} при сдаче`,'green');
  notify(`${client.icon} ${client.name} — контракт подписан!`,'success');
  rd(`Подписан: ${client.name}`,'client');

  // ── Предоплата ──────────────────────────────────────
  // _prepaymentPossible задаётся в _generateOffers на записи scoutPool, а не в PROJECT_POOL
  const poolEntry = G.scoutPool ? G.scoutPool.find(p => p.id === pid) : null;
  if (poolEntry?._prepaymentPossible) {
    const boost = hasRole('lawyer') ? 0.15 : 0;  // юрист даёт +15% к шансу
    if (Math.random() < 0.50 + boost) {
      const pct = 0.25 + Math.random() * 0.10;   // аванс 25–35% от бюджета
      const adv = Math.round(totalBudget * pct / 5000) * 5000;
      client._prepaidAmount  = adv;
      client._totalBudget    = Math.max(0, client._totalBudget - adv);
      G.money += adv;
      addLog(`💰 Предоплата «${client.name}»: +${fmtK(adv)} — остаток при сдаче ${fmtK(client._totalBudget)}`, 'green');
      notify(`💰 Аванс одобрен: +${fmtK(adv)}`, 'success');
    }
  }

  // Устанавливаем кулдаун для oneTime-проектов с ограничением
  if (def.oneTime && def.cooldown) {
    G.oneTimeCooldown = def.cooldown;
    addLog(`⏳ Следующий разовый заказ доступен через ${def.cooldown} мес.`, 'muted');
  }

  // Убираем подписанный проект из пула; пул остаётся открытым если ещё есть офферы
  if (G.scoutPool) G.scoutPool=G.scoutPool.filter(p=>p.id!==pid);
  _emitRender();
  if (G.scoutPool && G.scoutPool.length>0) {
    showScoutResults(G.scoutPool);
  } else {
    G.scoutPool=null;
    closeScout();
  }
}

// ══════════════════════════════════════════════════════
//  HIRE
// ══════════════════════════════════════════════════════
function hireStaff(id) {
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
    const parts = [];
    if (def.qBonus)    parts.push(`Q +${def.qBonus}`);
    if (def.speedBonus) parts.push(`Speed +${Math.round(def.speedBonus*100)}%`);
    if (def.repBonus)  parts.push(`Реп +${def.repBonus}`);
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

  // Time factor (1–3)
  score+=Math.min(3, daysSpent);

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

  // Портфолио-мультипликатор
  payout = Math.round(payout * getPortfolioMultiplier());

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

  G.activeClients = G.activeClients.filter(a => a.id !== cid);
  delete G.clientNPS[cid];

  const timeTag  = onTime ? '✅ в срок' : '⚠️ с опозданием';
  const penTag   = penaltyPct > 0 ? ` (−${Math.round(penaltyPct*100)}% штраф)` : '';
  addLog(`🏁 «${c.name}» ${timeTag} → +${fmtK(immediatePayment)}${penTag}${_specTag} | NPS ${finalNPS} | Порт. +${pfBonus}${repGain>0?' | Реп +'+repGain:''}`, onTime ? 'green' : 'amber');
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

function setFocus(cid, pct) {
  pct = Math.max(0, Math.min(100, Math.round(+pct)));
  const c = G.activeClients.find(a => a.id === cid);
  if (!c) return;
  c._focus = pct;
  _emitRender();
}

// Живое обновление фокуса — чистая логика + сигнал с данными для UI
// Godot: emit_signal("focus_changed", data)
function liveUpdateFocus(cid, pct) {
  pct = Math.max(0, Math.min(100, Math.round(+pct)));
  const c = G.activeClients.find(a => a.id === cid);
  if (!c) return;
  c._focus = pct;

  // ── Вычисляем данные для UI (чистая математика из стейта) ─
  // Все регулярные проекты участвуют в бюджете фокуса — включая payment_delay_fixed
  // в периоде ожидания: их _focus резервирует мощность заранее.
  // Это предотвращает «скрытый перегруз», когда отложенный проект активируется
  // с 34%+ фокуса поверх уже занятых 100%.
  const allRegular = G.activeClients.filter(c2 => !c2.oneTime);
  const totalPct   = allRegular.reduce((s, c2) => s + (c2._focus ?? 50), 0);
  const isOver     = totalPct > 100;
  // focusable — только активно прогрессирующие (для focusableIds и live-превью)
  const focusable = G.activeClients.filter(c2 =>
    !c2.oneTime && !(c2.modifier?.type==='payment_delay_fixed' && (c2._monthsSigned||0) <= c2.modifier.val)
  );

  const thr     = getTeamThroughput();
  const totLoad = getTotalLoad();
  // Мощность за вычетом запланированных разовых — синхронно с advanceMonth
  const schedOTLoad   = getScheduledOneTimeLoad();
  const availForReg   = Math.max(0, thr - schedOTLoad);
  const overloadPenalty = totLoad > 0 ? Math.min(1, availForReg / totLoad) : 1;
  const fatMult = getFatigueMult();
  const spdMult = getSpeed();

  // Превью для всех focusable проектов (regular + oneTime)
  const allFocusable = G.activeClients.filter(c2 =>
    !(c2.modifier?.type==='payment_delay_fixed' && (c2._monthsSigned||0) <= c2.modifier.val)
  );
  const previews = {};
  allFocusable.forEach(fc => {
    const fM  = (fc._focus ?? (fc.oneTime ? 100 : 50)) / 100;
    let raw;
    if (fc.oneTime) {
      raw = 100 * fM * spdMult;
    } else {
      // Та же формула что в advanceMonth: efficiency без кэпа min=1 — избыток ускоряет
      const allocThr  = fM * availForReg;
      const pLoad     = getProjectLoad(fc);
      const efficiency = pLoad > 0 ? (allocThr / pLoad) : 1;
      raw = (100 / (fc._duration||3)) * efficiency * spdMult;
    }
    const base        = Math.round(raw);
    const withFatigue = Math.round(raw * fatMult);
    const rem         = Math.max(0, 100 - (fc._progress||0));
    previews[fc.id] = {
      perMonth:    withFatigue,
      perMonthRaw: base,
      mthsLeft:    withFatigue > 0 ? Math.ceil(rem / withFatigue) : 99,
    };
  });

  // ── Сигнал → UI обновляет слайдеры и превью ──────────
  EventBus.emit('focus_changed', {
    cid, pct, totalPct, isOver,
    previews,                          // превью для всех проектов
    preview: previews[cid] || { perMonth:0, mthsLeft:99 }, // обратная совместимость
    focusableIds: focusable.map(fc => fc.id),
  });
}

function adjustFocusBy(cid, delta) {
  const c = G.activeClients.find(a => a.id === cid);
  if (!c) return;
  setFocus(cid, (c._focus || 0) + delta);
}

// Равномерное распределение фокуса среди регулярных проектов (сумма = 100%)
function equalFocus() {
  const fAll = G.activeClients.filter(c => !c.oneTime);
  if (!fAll.length) return;
  const base = Math.floor(100 / fAll.length);
  let rem = 100 - base * fAll.length;
  fAll.forEach(fc => { fc._focus = base + (rem-- > 0 ? 1 : 0); });
  _emitRender();
}

// Сбросить фокус у всех регулярных проектов до 0%
function clearFocus() {
  G.activeClients.filter(c => !c.oneTime).forEach(c => { c._focus = 0; });
  _emitRender();
}

// Выставить фокус для завершения проекта cid за targetMonths месяцев
function setFocusForMonths(cid, targetMonths) {
  targetMonths = Math.max(1, Math.round(+targetMonths));
  const c = G.activeClients.find(a => a.id === cid);
  if (!c) return;
  const remaining = Math.max(1, 100 - (c._progress || 0));
  const thr    = getTeamThroughput();
  const avail  = Math.max(0, thr - getScheduledOneTimeLoad());
  const pLoad  = getProjectLoad(c);
  const spdMult = getSpeed();
  const fatMult = getFatigueMult();
  const needPerMonth = remaining / targetMonths;
  // monthProg = (100/dur) * min(1, fMult*avail/pLoad) * fat * spd = needPerMonth
  // → fMult = needPerMonth * pLoad / ((100/dur) * fat * spd * avail)
  const baseRatePerUnit = (100 / (c._duration||3)) * fatMult * spdMult / Math.max(1, pLoad);
  const requiredFocus = avail > 0 && baseRatePerUnit > 0
    ? Math.min(100, Math.ceil(needPerMonth / (baseRatePerUnit * avail) * 100))
    : 100;
  setFocus(cid, requiredFocus);
}

// Суммарная нагрузка запланированных разовых проектов
function getScheduledOneTimeLoad(g=G) {
  return g.activeClients
    .filter(c => c.oneTime && c._scheduled)
    .reduce((s, c) => s + getProjectLoad(c), 0);
}

// Переключить бронирование разового проекта на этот месяц
function toggleOneTimeSchedule(cid) {
  const c = G.activeClients.find(a => a.id === cid);
  if (!c || !c.oneTime) return;
  c._scheduled = !c._scheduled;
  _emitRender();
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

  // ② Прогресс проектов (не-разовые) с учётом фокуса команды
  const throughput = getTeamThroughput();
  const totalLoad  = getTotalLoad();         // учитывает payment_delay_fixed

  // Фокус: список активных проектов, получающих производительность в этом месяце
  const focusActive = G.activeClients.filter(c =>
    !c.oneTime && !(c.modifier?.type==='payment_delay_fixed' && (c._monthsSigned||0) <= c.modifier.val)
  );
  const focusCount  = focusActive.length;
  // totalFocusW — сумма выставленных фокусов (0–100 каждый); дефолт — равномерное распределение
  const totalFocusW    = focusActive.reduce((s,c) => s + (c._focus ?? Math.floor(100/Math.max(1,focusActive.length))), 0);
  // Защитная нормализация: если суммарный фокус > 100% (edge-case — отложенный проект
  // активировался с «зарезервированным» фокусом поверх уже занятых 100%), масштабируем вниз,
  // чтобы суммарная аллокация не превысила availableForRegular.
  const focusNorm = totalFocusW > 100 ? (100 / totalFocusW) : 1;
  // Нагрузка запланированных разовых — резервируют мощность из пула
  const scheduledOneTimeLoad = getScheduledOneTimeLoad();
  const availableForRegular  = Math.max(0, throughput - scheduledOneTimeLoad);
  // Перегруз: когда суммарно доступной мощности не хватает для всех проектов
  const overloaded = availableForRegular < totalLoad * 0.95;
  // Эффективная нагрузка (фокус-взвешенная + разовые) — для расчёта усталости
  const activeFocusPct  = focusCount > 0 ? clamp(totalFocusW / 100, 0, 1) : 1;
  const effectiveLoad   = totalLoad * activeFocusPct + scheduledOneTimeLoad;
  const loadRatio       = effectiveLoad > 0 ? throughput / effectiveLoad : 1; // для лога

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
    G.teamFatigue = clamp((G.teamFatigue||0) + fd, 0, 100);
  }
  const fatigueMult = getFatigueMult();

  G.activeClients.filter(c=>!c.oneTime).forEach(c=>{
    // payment_delay_fixed: прогресс не идёт пока не истёк период ожидания
    if (c.modifier?.type==='payment_delay_fixed' && (c._monthsSigned||0) <= c.modifier.val) return;
    // focusMult: доля фокуса проекта от 100 (фикс п.22: нормируем через 100, а не totalFocusW)
    // При равном фокусе 3 проектов (33%+33%+33%) → ×0.33 каждый, суммарно ×1.0 команды
    // При 20%+0%+0% → проект A ×0.20, остальные 0, эффективная нагрузка 20%
    const _cFocus      = c._focus ?? Math.floor(100/Math.max(1,focusCount));
    const focusMult    = (_cFocus / 100) * focusNorm;  // нормализован если total > 100%
    // Правильная формула: фокус делит availableForRegular, эффективность = доля покрытия нагрузки
    // При фокус 50% и thr=14, load_project=7: allocThr=7 → efficiency=1.0 → проект в срок ✓
    // При фокус 50% и thr=10, load_project=7: allocThr=5 → efficiency=5/7=0.71 → перегруз ✓
    // При фокус 100% и thr=13, load_project=7: allocThr=13 → efficiency=13/7=1.86 → ускорение ✓
    // Кэп min(1,...) убран: избыток throughput честно ускоряет проект (прогресс cap=100 ниже)
    const allocThr     = focusMult * availableForRegular;
    const pLoad        = getProjectLoad(c);
    const efficiency   = pLoad > 0 ? (allocThr / pLoad) : 1;
    const speedMult    = getSpeed();
    const monthProg    = (100 / (c._duration||3)) * efficiency * fatigueMult * speedMult;
    // Округляем до 2 знаков — устраняет накопление float-погрешности (баг П.13)
    c._progress = Math.min(100, Math.round(((c._progress||0) + monthProg) * 100) / 100);
  });

  if (overloaded && G.activeClients.filter(c=>!c.oneTime).length > 0) {
    const eff    = Math.round(Math.min(1, availableForRegular / Math.max(1, totalLoad)) * 100);
    const otNote = scheduledOneTimeLoad > 0 ? ` (разовые −${Math.round(scheduledOneTimeLoad)} ед.)` : '';
    addLog(`⚠️ Команда перегружена (нагрузка ${Math.round(totalLoad)} > доступно ${Math.round(availableForRegular)}${otNote}) — прогресс ×${eff}%`, 'amber');
  }

  // ② б) Разовые проекты: выполняются только если запланированы на этот месяц (_scheduled)
  // Не накапливают прогресс пассивно — только по явному бронированию ресурса
  G.activeClients.filter(c => c.oneTime && c._scheduled).forEach(c => {
    c._progress = 100;
  });

  // ── Milestone-выплаты T2/T3 ──────────────────────────
  G.activeClients.forEach(c => {
    if (!c._milestones || c._milestones.length === 0 || c.oneTime) return;
    const progress = c._progress || 0;
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
      G.clientNPS[target.id] = clamp((G.clientNPS[target.id]||70) + npsHit, 0, 100);
      addLog(`${stateLabel} (усталость ${Math.round(G.teamFatigue)}): NPS «${target.name}» ${npsHit}`, 'amber');
    }
    // Уход сотрудника при выгорании/кризисе
    if (G.teamFatigue >= 60 && G.staff.length > 0) {
      const quitChance = G.teamFatigue >= 85 ? 0.20 : 0.10;
      const leaver = G.staff.find(() => Math.random() < quitChance);
      if (leaver) {
        G.staff = G.staff.filter(s => s._iid !== leaver._iid);
        addLog(`🚪 ${leaver.name} уволился из-за усталости команды!`, 'red');
        notify(`${leaver.name} уволился — команда выгорает!`, 'error');
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

  // ⑥ Ежемесячные расходы
  const staffCost = getTotalStaffCost();
  const net       = -(staffCost + OVERHEAD);
  G.money += net;
  G.monthsPlayed++;
  G.tempDiscount = 0;

  addLog(`расходы −${fmt(staffCost+OVERHEAD)} → баланс ${fmt(G.money)}`, 'red');

  // ⑦ Разовые клиенты: завершение при прогрессе 100% (зависит от выставленного фокуса)
  G.activeClients = G.activeClients.filter(c=>{
    if (!c.oneTime || (c._progress||0) < 100) return true;
    const payout = Math.round((c._totalBudget||c.revenue) * getPortfolioMultiplier());
    G.money += payout;
    G.clientEarnings[c.id] = payout;
    const pfBonus = (c.portfolioWeight||c.tier||1) * 2;
    G.portfolio   = (G.portfolio||0) + pfBonus;
    G.completedProjects = G.completedProjects||[];
    G.completedProjects.push({
      id:c.id, name:c.name, icon:c.icon, tier:c.tier||1,
      finalNPS:Math.round(G.clientNPS[c.id]||70), monthCompleted:G.month,
      terminated:false, failed:false, _cased:false, totalEarned:payout,
    });
    delete G.clientNPS[c.id];
    addLog(`📦 ${c.name}: разовый заказ выполнен → +${fmtK(payout)} (+${pfBonus} портфолио)`,'green');
    rd(`${c.name} — разовый (+${fmtK(payout)})`,'client');
    return false;
  });

  // ⑧ Штраф просрочки: прогресс < 100% и дедлайн пройден
  G.activeClients.forEach(c=>{
    if (!c.oneTime && c._duration && (c._monthsSigned||0) > c._duration && (c._progress||0) < 100) {
      const pen = hasRole('lawyer') ? 1 : 2;
      G.reputation = clamp(G.reputation - pen, 0, 100);
      addLog(`⏰ ${c.name}: просрочен на ${(c._monthsSigned||0)-c._duration} мес. — −${pen} репутации${hasRole('lawyer')?' (юрист −50%)':''}`, 'red');
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

  G.month++;

  // ⑪ Сброс действий, временных бонусов, пула
  G.actions   = ACTIONS_PER_MONTH;
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
  if (G.money>=SCENARIO.settings.winCondition){ _emitRender(); _emitEndGame(true); return; }
  if (G.money<=0)       { _emitRender(); _emitEndGame(false); return; }

  // Случайное событие (40%, пропуск 1-го месяца; не когда идёт событие ИИ)
  if (G.monthsPlayed>1 && Math.random()<0.40){
    const hasActiveProjects = G.activeClients.filter(c=>!c.oneTime).length > 0;
    const evs=EVENTS.filter(e=>{
      if (e.id==='quit'        && G.staff.length===0)    return false;
      if (e.id==='conflict'    && G.staff.length<2)      return false;
      if (e.requiresClients    && !hasActiveProjects)    return false;
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
