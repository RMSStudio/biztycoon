// ══════════════════════════════════════════════════════
//  ENGINE — стейт, хелперы, игровая логика
//  Зависит от: data.js
// ══════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════
//  STATE
// ══════════════════════════════════════════════════════
let G = {};
let DECISIONS = [];

// ── КРЕДИТНЫЕ ЛИНИИ ─────────────────────────────────
// Условия: rep ≥ minRep; нельзя взять второй кредит пока не погашен первый
const LOAN_TIERS = [
  { id:'basic',    minRep:30, label:'Базовый',  principal:50000,  monthlyPayment:10000, months:6 },
  { id:'standard', minRep:50, label:'Стандарт', principal:150000, monthlyPayment:25000, months:7 },
  { id:'premium',  minRep:70, label:'Премиум',  principal:300000, monthlyPayment:42000, months:8 },
];

function initState() {
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
    teamFatigue: 0,         // усталость команды 0–100: 30+=напряжение, 60+=выгорание, 85+=кризис
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
function goTo(id) {
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  window.scrollTo(0,0);
}

function selectSpec(id) {
  document.querySelectorAll('.spec-card').forEach(c=>c.classList.remove('selected'));
  document.getElementById('spec-'+id).classList.add('selected');
  G.spec=id;
  document.getElementById('btn-start-game').disabled=false;
}

function startGame() {
  if (!G.spec) return;
  G.money=750000; G.month=0; G.staff=[]; G.activeClients=[]; G.log=[];
  G.tempDiscount=0; G.monthsPlayed=0;
  G.actions=ACTIONS_PER_MONTH; G.reputation=100;
  G.clientNPS={}; G.clientEarnings={}; G.delayedIncome=0; G.history=[];
  G.upgrades={}; G.qualityBonus=0; G.tempQBonus=0; G.portfolio=0;
  G.completedProjects=[]; G.cases=[]; G.caseQBonus=0; G.caseRepBonus=0; G.caseScoutBonus=0; G.caseRepPenalty=0; G.scoutPool=null; G.loan=null; G.teamFatigue=0;
  DECISIONS=[];
  G.history.push({month:0, money:750000, label:'Старт'});
  addLog('Агентство открыто. Найди первый проект через Скаутинг!','amber');
  addLog(`Выручка начисляется при завершении проекта. Overhead −${fmt(OVERHEAD)}/мес`,'red');
  renderGame(); goTo('screen-game');
}

// ══════════════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════════════
function fmt(n)  { return Math.round(n).toLocaleString('ru-RU')+'₽'; }
function fmtK(n) { return Math.abs(n)>=1000000?(n/1000000).toFixed(1)+'M₽':Math.abs(n)>=1000?Math.round(n/1000)+'K₽':Math.round(n)+'₽'; }
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }

function getQuality(g=G){ return g.staff.reduce((s,x)=>s+(x.quality||0),0)+(g.qualityBonus||0)+(g.tempQBonus||0)+(g.caseQBonus||0); }
function getVolume(g=G) { return g.staff.reduce((s,x)=>s+(x.volume||0),0); }
function getCapacity(g=G){ return 2+g.staff.reduce((s,x)=>s+(x.capacity||0),0); }
function hasRole(id,g=G){ return !!g.staff.find(s=>s.id===id); }
function countRole(id,g=G){ return g.staff.filter(s=>s.id===id).length; }
// +0.4% выручки за каждый балл портфолио, cap +20% при 50 баллах
function getPortfolioMultiplier(g=G){ return 1+Math.min((g.portfolio||0)*0.004, 0.20); }

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

function notify(msg, type='info') {
  const el=document.getElementById('notif');
  el.textContent=msg; el.className='notif show '+type;
  clearTimeout(el._t); el._t=setTimeout(()=>el.classList.remove('show'),3000);
}

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
  renderGame();
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

  if (hasRole('smm')) offerCount=Math.min(3, offerCount+1);
  if (G.caseScoutBonus>0) offerCount=Math.min(3, offerCount+(G.caseScoutBonus||0));

  const maxTier = G.reputation>=70?3 : G.reputation>=40?2 : 1;
  const pool=PROJECT_POOL.filter(p=>
    p.tier<=maxTier &&
    (!p.requiresDev  || hasRole('developer')) &&
    (!p.minPortfolio || (G.portfolio||0)>=p.minPortfolio)
  );

  const offers=[];
  const shuffled=[...pool].sort(()=>Math.random()-0.5);
  for (let i=0; i<shuffled.length && offers.length<offerCount; i++){
    const p=shuffled[i];
    if (!G.activeClients.find(c=>c.id.startsWith(p.id)))
      offers.push({ ...p, _prepaymentPossible: !p.oneTime && Math.random() < 0.25 });
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
  renderGame();
}

function refreshScoutPool() {
  if (G.actions<SCOUT_COST){ notify(`Нужно ≥${SCOUT_COST} дней — осталось ${G.actions}`,'error'); return; }
  G.actions-=SCOUT_COST;
  G.scoutPool=null;
  addLog(`🔄 Пул заказов обновлён (−${SCOUT_COST} дня)`,'teal');
  G.scoutPool=_generateOffers();
  showScoutResults(G.scoutPool);
  renderGame();
}

function showScoutResults(offers) {
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
    const canTake = slotOk && qOk && vOk && devOk && portOk;

    // Build req row: always show when there are any requirements
    const hasReqs = p.minQ > 0 || p.minV > 0 || p.requiresDev || p.minPortfolio > 0;
    let reqRow = '';
    if (!slotOk) {
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

    const card=document.createElement('div');
    card.className='project-card'+(canTake?'':' unavailable');
    card.innerHTML=`
      <div class="project-top">
        <div class="project-icon">${p.icon}</div>
        <div class="project-meta">
          <div class="project-name">${p.name}</div>
          <div class="project-desc">${p.desc}</div>
        </div>
      </div>
      <div class="project-bottom">
        <span class="project-rev">${fmt(p.revenue)}</span>
        <span class="project-rev-label">${p.oneTime?'разово':'/мес'}</span>
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
}

function signProject(pid) {
  const def=PROJECT_POOL.find(p=>p.id===pid);
  if (!def) return;
  if (G.activeClients.length>=getCapacity()){ notify('Нет свободного слота','error'); return; }

  // Генерируем бюджет проекта из диапазона тира
  const [bMin, bMax] = BUDGET_RANGES[def.tier] || BUDGET_RANGES[1];
  const totalBudget = Math.round((bMin + Math.random() * (bMax - bMin)) / 5000) * 5000;

  const client={
    ...def,
    id: pid+'_'+G.month,
    _monthsSigned: 0,
    // Дедлайн: явный duration из дефиниции или тир-дефолт (tier1=3, tier2=4, tier3=5 мес.)
    _duration: def.oneTime ? 1 : (def.duration || (def.tier===1 ? 3 : def.tier===2 ? 4 : 5)),
    _totalBudget: totalBudget,
    _progress: 0,   // 0–100%
    _focus: 50,     // вес фокуса 0–100; итоговый % = _focus / Σ(active _focus) * 100
  };

  // nps_start: override starting NPS
  if (client.modifier.type==='nps_start') {
    client.npsStart=Math.min(100, (def.npsStart||70)+def.modifier.val);
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
  if (def._prepaymentPossible) {
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

  // Убираем подписанный проект из пула; пул остаётся открытым если ещё есть офферы
  if (G.scoutPool) G.scoutPool=G.scoutPool.filter(p=>p.id!==pid);
  renderGame();
  if (G.scoutPool && G.scoutPool.length>0) {
    showScoutResults(G.scoutPool);
  } else {
    G.scoutPool=null;
    closeScout();
  }
}

function closeScout() {
  document.getElementById('scout-modal').classList.remove('active');
}

// ══════════════════════════════════════════════════════
//  HIRE
// ══════════════════════════════════════════════════════
function hireStaff(id) {
  const def=STAFF_DEFS.find(d=>d.id===id);
  if (!def) return;
  if ((G.teamFatigue||0) >= 85) { notify('🔥 Кризис усталости — найм временно недоступен','error'); return; }
  const dayCost=hasRole('hr') ? 1 : HIRE_COST;
  if (G.actions<dayCost){ notify(`Нужно ≥${dayCost} рабочих дня`,'error'); return; }
  if (G.money<def.cost*2){ notify('Мало денег — нужен запас ≥2 зарплаты','error'); return; }
  const instance={...def, _iid: def.id+'_m'+G.month+'_n'+G.staff.length};
  G.staff.push(instance);
  G.actions-=dayCost;
  addLog(`👥 Нанят ${def.name} (−${fmt(def.cost)}/мес, −${dayCost} дня)`,'amber');
  notify(`${def.name} принят! ${def.icon}`,'success');
  rd(`Нанят ${def.name}`,'hire');
  renderGame();
}

// ══════════════════════════════════════════════════════
//  Q UPGRADES
// ══════════════════════════════════════════════════════
function buyUpgrade(id) {
  const def = UPGRADES.find(u => u.id === id);
  if (!def) return;
  if (def.oneTime && G.upgrades[id]) { notify('Уже куплено ✓','error'); return; }
  if (!def.oneTime && G.tempQBonus >= def.qBonus) { notify('Фриланс уже активен этот месяц','error'); return; }
  if (G.actions < def.days) { notify(`Нужно ≥${def.days} дн.`,'error'); return; }
  if (G.money < def.cost)   { notify('Мало денег','error'); return; }

  G.money   -= def.cost;
  G.actions -= def.days;

  if (def.oneTime) {
    G.upgrades[id]    = true;
    G.qualityBonus   += def.qBonus;
    if (def.repBonus) G.reputation = clamp(G.reputation + def.repBonus, 0, 100);
    const extra = def.repBonus ? `, Реп +${def.repBonus}` : '';
    addLog(`${def.icon} ${def.name}: Q постоянно +${def.qBonus}${extra}`, 'teal');
    notify(`${def.icon} ${def.name} — Q +${def.qBonus}!`, 'success');
  } else {
    G.tempQBonus += def.qBonus;
    addLog(`${def.icon} ${def.name}: Q +${def.qBonus} до конца месяца`, 'teal');
    notify(`${def.icon} Фриланс-дизайнер — +${def.qBonus} Q этот месяц`, 'success');
  }
  rd(`${def.name} (Q+${def.qBonus})`, 'event');
  renderGame();
}

// ══════════════════════════════════════════════════════
//  CONFIRM HELPER  (reuses event-modal)
// ══════════════════════════════════════════════════════
function showConfirm(icon, title, body, confirmText, confirmClass, onConfirm) {
  document.getElementById('modal-icon').textContent = icon;
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').textContent = body;
  const div = document.getElementById('modal-choices'); div.innerHTML = '';

  const btnOk = document.createElement('button');
  btnOk.className = 'modal-choice';
  const borderMap = { red:'rgba(248,81,73,.4)', amber:'rgba(210,153,34,.4)', teal:'rgba(45,212,191,.4)', green:'rgba(74,222,128,.4)' };
  btnOk.style.borderColor = borderMap[confirmClass] || borderMap.amber;
  btnOk.innerHTML = `<div class="choice-title" style="color:var(--${confirmClass})">${confirmText}</div>`;
  btnOk.onclick = () => {
    document.getElementById('event-modal').classList.remove('active');
    onConfirm();
  };

  const btnCancel = document.createElement('button');
  btnCancel.className = 'modal-choice';
  btnCancel.innerHTML = `<div class="choice-title">Отмена</div><div class="choice-desc">Ничего не менять</div>`;
  btnCancel.onclick = () => document.getElementById('event-modal').classList.remove('active');

  div.appendChild(btnOk);
  div.appendChild(btnCancel);
  document.getElementById('event-modal').classList.add('active');
}

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
      renderGame();
    }
  );
}

// ══════════════════════════════════════════════════════
//  TERMINATE CONTRACT
// ══════════════════════════════════════════════════════
function terminateContract(cid) {
  const c = G.activeClients.find(a => a.id === cid);
  if (!c) return;
  showConfirm(
    '🚫', `Расторгнуть контракт с ${c.name}?`,
    `Досрочное расторжение: −10 репутации. Клиент уходит недовольным — это повлияет на входящие предложения.`,
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
      notify(`${c.icon} Контракт с ${c.name} расторгнут`, 'error');
      rd(`Расторгнут: ${c.name}`, 'churn');
      renderGame();
    }
  );
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
  renderGame();
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
      renderGame();
    }
  );
}

function completeProject(cid) {
  const c = G.activeClients.find(a => a.id === cid);
  if (!c) return;

  // Блокировка: прогресс должен быть 100%
  if ((c._progress||0) < 100) {
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
  if (c.type==='small' && spec.bonus==='small_income') payout = Math.round(payout * (1+spec.bonusVal));
  if (c.type==='corp'  && spec.bonus==='corp_income')  payout = Math.round(payout * (1+spec.bonusVal));
  if (c.type==='store' && spec.bonus==='store_income') payout = Math.round(payout * (1+spec.bonusVal));

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
  addLog(`🏁 «${c.name}» ${timeTag} → +${fmtK(immediatePayment)}${penTag} | NPS ${finalNPS} | Порт. +${pfBonus}${repGain>0?' | Реп +'+repGain:''}`, onTime ? 'green' : 'amber');
  notify(`🏁 «${c.name}» ${timeTag} → +${fmtK(immediatePayment)}`, onTime ? 'success' : 'info');
  rd(`Завершён: ${c.name} → +${fmtK(immediatePayment)} ${timeTag}`, 'event');

  renderPortfolioTab();
  renderGame();
}

// ══════════════════════════════════════════════════════
//  CREDIT LINES
// ══════════════════════════════════════════════════════

// Возвращает лучший доступный тир по текущей репутации
function getLoanTier(rep) {
  return [...LOAN_TIERS].reverse().find(t => rep >= t.minRep) || null;
}

function takeLoan() {
  if (G.loan) { notify('Активный кредит ещё не погашен', 'error'); return; }
  const tier = getLoanTier(G.reputation);
  if (!tier) { notify('Репутация слишком низкая — нужно ≥ 30', 'error'); return; }
  G.money += tier.principal;
  G.loan = {
    principal: tier.principal,
    monthlyPayment: tier.monthlyPayment,
    monthsRemaining: tier.months,
    label: tier.label,
  };
  addLog(`🏦 Кредит «${tier.label}»: +${fmtK(tier.principal)}, платёж ${fmtK(tier.monthlyPayment)}/мес × ${tier.months} мес.`, 'teal');
  notify(`🏦 Кредит ${fmtK(tier.principal)} одобрен`, 'success');
  rd(`Кредит «${tier.label}» +${fmtK(tier.principal)}`, 'event');
  renderGame();
}

function setFocus(cid, pct) {
  pct = Math.max(0, Math.min(100, Math.round(+pct)));
  const c = G.activeClients.find(a => a.id === cid);
  if (!c) return;
  c._focus = pct;
  renderGame();
}

// Живое обновление фокуса во время дрэга — без полного re-render, без авто-перераспределения
function liveUpdateFocus(cid, pct) {
  pct = Math.max(0, Math.min(100, Math.round(+pct)));
  const c = G.activeClients.find(a => a.id === cid);
  if (!c) return;
  c._focus = pct;

  // Обновляем DOM текущего проекта
  const rangeEl = document.getElementById('focus-range-' + cid);
  const valEl   = document.getElementById('focus-val-'   + cid);
  const prevEl  = document.getElementById('focus-prev-'  + cid);
  if (rangeEl) { rangeEl.value = pct; rangeEl.style.setProperty('--fill', pct + '%'); }
  if (valEl)   valEl.value = pct;

  // Пересчитываем суммарный фокус и обновляем баннер
  const focusable  = G.activeClients.filter(c2 => !c2.oneTime);
  const totalPct   = focusable.reduce((s, c2) => s + (c2._focus ?? 50), 0);
  const isOver     = totalPct > 100;
  const warnEl     = document.getElementById('focus-total-warn');
  const resEl      = document.getElementById('focus-reserve');
  if (warnEl) {
    warnEl.style.display = isOver ? 'flex' : 'none';
    if (isOver) warnEl.querySelector('span').textContent =
      `⚠ Суммарный фокус: ${totalPct}% — освободи ${totalPct - 100}% у других проектов`;
  }
  if (resEl) {
    resEl.style.display = isOver ? 'none' : 'flex';
    if (!isOver) resEl.querySelector('span').textContent = `✦ Резерв: ${100 - totalPct}%`;
  }
  // Обновляем подсветку строк фокуса у всех проектов
  focusable.forEach(fc => {
    const rowEl = document.getElementById('focus-row-' + fc.id);
    if (rowEl) rowEl.style.borderColor = isOver ? 'rgba(248,81,73,.3)' : 'transparent';
  });

  // Обновляем превью текущего проекта
  if (prevEl) {
    const thr      = getTeamThroughput();
    const totLoad  = getTotalLoad();
    const lratio   = totLoad > 0 ? Math.min(1, thr / totLoad) : 1;
    const totalFocusW = focusable.reduce((s, c2) => s + (c2._focus ?? 50), 0);
    const fMult    = totalFocusW > 0 ? (pct / totalFocusW) * focusable.length : 1;
    const perMonth = Math.round((100 / (c._duration||3)) * lratio * fMult * 10) / 10;
    const remain   = Math.max(0, 100 - (c._progress||0));
    const mthsLeft = perMonth > 0 ? Math.ceil(remain / perMonth) : 99;
    prevEl.style.color = pct >= 60 ? 'var(--green)' : pct >= 30 ? 'var(--teal)' : 'var(--amber)';
    prevEl.textContent = '+' + perMonth + '%/мес · ~' + mthsLeft + ' мес. до завершения';
  }
}

function adjustFocusBy(cid, delta) {
  const c = G.activeClients.find(a => a.id === cid);
  if (!c) return;
  setFocus(cid, (c._focus || 0) + delta);
}

// ══════════════════════════════════════════════════════
//  ADVANCE MONTH
// ══════════════════════════════════════════════════════
function advanceMonth() {
  // ① Счётчик месяцев у каждого клиента
  G.activeClients.forEach(c=>{ c._monthsSigned=(c._monthsSigned||0)+1; });

  // ② Прогресс проектов (не-разовые) с учётом фокуса команды
  const throughput = getTeamThroughput();
  const totalLoad  = getTotalLoad();         // учитывает payment_delay_fixed
  const loadRatio  = totalLoad > 0 ? throughput / totalLoad : 1;
  const overloaded = loadRatio < 0.95;

  // ── Усталость команды (п.11) ─────────────────────────
  {
    const hasHR = hasRole('hr');
    let fd = loadRatio >= 1.0 ? 10 : loadRatio >= 0.85 ? 4 : loadRatio >= 0.60 ? 1 : -5;
    if (fd > 0 && hasHR) fd = Math.round(fd * 0.7);  // HR снижает рост на 30%
    G.teamFatigue = clamp((G.teamFatigue||0) + fd, 0, 100);
  }
  const fatigueMult = G.teamFatigue >= 85 ? 0.70 : G.teamFatigue >= 60 ? 0.85 : G.teamFatigue >= 30 ? 0.95 : 1.0;

  // Фокус: список активных проектов, получающих производительность в этом месяце
  const focusActive = G.activeClients.filter(c =>
    !c.oneTime && !(c.modifier?.type==='payment_delay_fixed' && (c._monthsSigned||0) <= c.modifier.val)
  );
  const focusCount  = focusActive.length;
  const totalFocusW = focusActive.reduce((s,c) => s + (c._focus ?? Math.floor(100/Math.max(1,focusActive.length))), 0);

  G.activeClients.filter(c=>!c.oneTime).forEach(c=>{
    // payment_delay_fixed: прогресс не идёт пока не истёк период ожидания
    if (c.modifier?.type==='payment_delay_fixed' && (c._monthsSigned||0) <= c.modifier.val) return;
    // focusMult: нормализован так, что при равном фокусе = 1.0x у всех
    const _cFocus = c._focus ?? Math.floor(100/Math.max(1,focusCount));
    const focusMult = (focusCount > 0 && totalFocusW > 0)
      ? (_cFocus / totalFocusW) * focusCount
      : 1;
    const monthProg = (100 / (c._duration||3)) * Math.min(1, loadRatio) * focusMult * fatigueMult;
    c._progress = Math.min(100, (c._progress||0) + monthProg);
  });

  if (overloaded && G.activeClients.filter(c=>!c.oneTime).length > 0) {
    const eff = Math.round(loadRatio * 100);
    addLog(`⚠️ Команда перегружена (нагрузка ${Math.round(totalLoad)} > произв. ${Math.round(throughput)}) — прогресс ×${eff}%`, 'amber');
  }

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

  addLog(`${monthLabel()}: расходы −${fmt(staffCost+OVERHEAD)} → баланс ${fmt(G.money)}`, 'red');

  // ⑦ Разовые клиенты: авто-завершение после 1 месяца
  G.activeClients = G.activeClients.filter(c=>{
    if (!c.oneTime || c._monthsSigned < 1) return true;
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

  // ⑫ Снимок истории
  G.history.push({month:G.month, money:G.money, label:monthLabel(-1)});

  // Win / Lose
  if (G.money>=3000000){ renderGame(); endGame(true); return; }
  if (G.money<=0)       { renderGame(); endGame(false); return; }

  // Случайное событие (40%, пропуск 1-го месяца)
  if (G.monthsPlayed>1 && Math.random()<0.40){
    const evs=EVENTS.filter(e=>{
      if (e.id==='quit'     && G.staff.length===0) return false;
      if (e.id==='conflict' && G.staff.length<2)  return false;
      return true;
    });
    showEvent(evs[Math.floor(Math.random()*evs.length)]);
  } else {
    renderGame();
  }
}

