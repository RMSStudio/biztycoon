'use strict';
// ══════════════════════════════════════════════════════
//  BizTycoon v2.3+ — Headless Balance Harness (sim2)
//  Запускает РЕАЛЬНЫЙ движок (constants → events → scenario →
//  engine → staff) в Node VM с fake-DOM и гоняет ботов-стратегии.
//  В отличие от sim.js (автономная модель v0.32) — здесь нет
//  дублирования формул: что в игре, то и в симуляции.
//
//  Запуск:  node sim/sim2.js [runsPerStrategy=30]
// ══════════════════════════════════════════════════════

const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

const ROOT = path.join(__dirname, '..');
const RUNS_PER_STRAT = parseInt(process.argv[2] || '30', 10);

// ── Fake DOM: толерантный элемент, переживающий любые render-вызовы ──
function fakeEl() {
  const el = {
    innerHTML: '', textContent: '', value: '', className: '', id: '',
    style: {}, dataset: {}, children: [],
    classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } },
    appendChild(c){ this.children.push(c); return c; },
    removeChild(){}, remove(){}, insertBefore(c){ this.children.push(c); return c; },
    setAttribute(){}, getAttribute(){ return null; }, removeAttribute(){},
    addEventListener(){}, removeEventListener(){},
    querySelector(){ return fakeEl(); }, querySelectorAll(){ return []; },
    closest(){ return null; }, focus(){}, blur(){}, click(){},
    getBoundingClientRect(){ return { top:0,left:0,width:0,height:0 }; },
    scrollIntoView(){},
  };
  return el;
}
const fakeDocument = {
  getElementById(){ return fakeEl(); },
  createElement(){ return fakeEl(); },
  querySelector(){ return fakeEl(); },
  querySelectorAll(){ return []; },
  body: fakeEl(),
  addEventListener(){}, removeEventListener(){},
};

// ── Sandbox ───────────────────────────────────────────
const sandbox = {
  console, Math, Date, JSON, Intl, setTimeout, clearTimeout,
  document: fakeDocument,
  localStorage: { getItem(){ return null; }, setItem(){}, removeItem(){} },
  navigator: {},
  // UI-функции, вызываемые движком напрямую (DOM-слой, в Node не нужны)
  renderPortfolioTab(){},
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

// ── Загрузка реального движка ─────────────────────────
// Порядок как в index.html. Пропущены: ui.js, saves.js, ai.js,
// scenario-editor.js, projects.js (lifecycle активен только у
// _lifecycleTest-проектов — typeof-guard в engine их обходит).
const FILES = [
  'src/constants.js',
  'src/events.js',
  'scenarios/agency.js',
  'src/engine.js',
  'src/staff.js',
];
const engineSrc = FILES
  .map(f => `// ===== ${f} =====\n` + fs.readFileSync(path.join(ROOT, f), 'utf8'))
  .join('\n;\n');

// ── Бот и раннер (исполняются в том же контексте, видят G/engine) ──
const BOT_SRC = String.raw`
// ───────────────────────────────────────────────────────
//  BOT RUNNER
// ───────────────────────────────────────────────────────
const __SETTINGS = SCENARIO.settings;
const __SPEC_IDS = Object.keys(SPECS);

const STRATS = {
  lean:       { team:0, scoutTier:'free',    roles:[],                                              maxTier:1, loadCap:1.00, reserve:3 },
  balanced:   { team:2, scoutTier:'free',    roles:['designer','copywriter'],                       maxTier:2, loadCap:1.10, reserve:4 },
  trio_t3:    { team:3, scoutTier:'free',    roles:['designer','copywriter','manager'],             maxTier:3, loadCap:1.15, reserve:4 },
  growth:     { team:4, scoutTier:'paid',    roles:['designer','copywriter','manager','developer'], maxTier:3, loadCap:1.20, reserve:3 },
  aggressive: { team:6, scoutTier:'premium', roles:['designer','copywriter','manager','developer','smm','hr'], maxTier:4, loadCap:1.35, reserve:2 },
};

let __run = null; // { ended, won }

EventBus.on('end_game', ({ won }) => { if (__run) { __run.ended = true; __run.won = won; } });

// Событийный модал: бот выбирает вариант
EventBus.on('show_event', ({ ev }) => {
  const e = ev;
  if (!e || !e.choices || !e.choices.length) return;
  let idx = 0;
  if (e.title === 'Превышен лимит проектов') {
    // расторгаем проект с минимальным остатком бюджета
    const act = G.activeClients.filter(c => !c.oneTime);
    let min = Infinity;
    act.forEach((c, i) => { if ((c._totalBudget||0) < min) { min = c._totalBudget||0; idx = i; } });
  } else if (e.id === 'quit') {
    const burn = getTotalStaffCost() + (SCENARIO.settings.overhead||0);
    idx = G.money > burn * 6 ? 0 : 1;            // удерживаем если есть запас
  } else if (e.id === 'discount') {
    idx = 0;                                      // соглашаемся — бережём NPS
  } else if (e.id === 'algo') {
    idx = G.money > 200000 ? 0 : 1;
  } else {
    idx = G.money > 300000 ? 0 : e.choices.length - 1;
  }
  const ch = e.choices[Math.min(idx, e.choices.length - 1)];
  try { ch.fn(G); } catch (err) { /* событие не критично */ }
  // win/lose после события — как в ui.js showEvent.onclick
  if (__run && !__run.ended) {
    if (G.money <= 0) { __run.ended = true; __run.won = false; }
    else if (G.money >= __SETTINGS.winCondition) { __run.ended = true; __run.won = true; }
  }
});

function tryRecovery(ids) {
  for (const id of ids) {
    const def = UPGRADES.find(u => u.id === id);
    if (!def) continue;
    if ((G.fatigueActionCooldowns||{})[id] > 0) continue;
    if (def.minFatigue && G.teamFatigue < def.minFatigue) continue;
    if (G.money < def.cost + 100000) continue;
    if (G.actions < def.days) continue;
    const before = G.teamFatigue;
    buyUpgrade(id);
    if (G.teamFatigue < before) return true;
  }
  return false;
}

function botHire(plan) {
  const active = () => G.staff.filter(s => s.status !== 'fired');
  if (active().length >= plan.team) return;
  const burn    = getTotalStaffCost() + (SCENARIO.settings.overhead||0);
  const reserve = Math.max(250000, burn * plan.reserve);
  if (G.money < reserve) return;

  // пополняем пул кандидатов
  if (!(G.candidatePool||[]).length) {
    const tier = plan.scoutTier === 'premium' && G.money < 600000 ? 'paid' : plan.scoutTier;
    scoutCandidates(tier);
  }
  const pool = G.candidatePool || [];
  if (!pool.length) return;

  // какие роли ещё не закрыты (в порядке приоритета стратегии)
  const have = new Set(active().map(s => s.role));
  const needRoles = plan.roles.filter(r => !have.has(r));

  let pick = null;
  for (const r of needRoles) {
    const cands = pool.filter(c => c.role === r)
      .sort((a,b) => (calcStaffWorkUnit(b)/(b.salaryAsk||1)) - (calcStaffWorkUnit(a)/(a.salaryAsk||1)));
    if (cands.length) { pick = cands[0]; break; }
  }
  // роли закрыты, но команда меньше цели — берём лучшего по WU/цене
  if (!pick && active().length < plan.team) {
    pick = [...pool].sort((a,b) => (calcStaffWorkUnit(b)/(b.salaryAsk||1)) - (calcStaffWorkUnit(a)/(a.salaryAsk||1)))[0];
  }
  if (!pick) return;
  if ((pick.salaryAsk||0) * 3 > G.money - reserve + (pick.salaryAsk||0)) return; // не тянем зарплату
  hireCandidate(pick.uid || pick.id, pick.salaryAsk);
}

function botSign(plan) {
  // подписываем из текущего пула; новый скаутинг — пока хватает дней
  let guard = 8;
  while (guard-- > 0) {
    if (!G.scoutPool || !G.scoutPool.length) {
      if (G.actions < SCOUT_COST) break;
      doScouting();
      if (!G.scoutPool || !G.scoutPool.length) continue; // пустой ролл — дни уже списаны
    }
    const Q = getQuality(), V = getVolume();
    const thr  = getTeamThroughput();
    const load = getTotalLoad();
    const slotsUsed = G.activeClients.filter(c => !c.oneTime).length;

    const pool = [...G.scoutPool].sort((a,b) => (b.tier||1) - (a.tier||1));
    let signed = false;
    for (const p of pool) {
      if ((p.minQ||0) > Q || (p.minV||0) > V) continue;             // честная политика
      if (p.oneTime) {
        if ((G.oneTimeCooldown||0) > 0) continue;
        if (G.activeClients.length >= getCapacity()) continue;
        signProject(p.id); signed = true; break;
      }
      if ((p.tier||1) > plan.maxTier) continue;
      if (slotsUsed >= getCapacity()) continue;
      const newLoad = load + (p.tier === 3 ? 14 : p.tier === 2 ? 8 : 4);
      if (newLoad > thr * plan.loadCap) continue;
      signProject(p.id); signed = true; break;
    }
    if (!signed) break; // из этого пула брать нечего — дни на ре-ролл не жжём
  }
}

function botAssign() {
  // перераспределяем сотрудников: жадно закрываем самые тяжёлые проекты
  G.staff.forEach(s => unassignStaff(s._iid || s.id));
  const regular = G.activeClients
    .filter(c => !c.oneTime)
    .sort((a,b) => getProjectLoad(b) - getProjectLoad(a));
  if (!regular.length) return;
  const free = G.staff.filter(s => s.status !== 'fired')
    .sort((a,b) => calcStaffWorkUnit(b) - calcStaffWorkUnit(a));
  for (const s of free) {
    let best = null, bestGap = -Infinity;
    for (const c of regular) {
      const gap = getProjectLoad(c) - getProjectThroughput(c);
      if (gap > bestGap) { bestGap = gap; best = c; }
    }
    if (!best || bestGap <= 0) break; // всё закрыто
    assignStaffToProject(s._iid || s.id, best.id);
  }
}

function botScheduleOneTime() {
  const thr  = getTeamThroughput();
  const load = getTotalLoad();
  for (const c of G.activeClients.filter(c => c.oneTime && !c._scheduled)) {
    const otLoad = getScheduledOneTimeLoad() + getProjectLoad(c);
    if (thr - otLoad >= load * 0.5 || load === 0) toggleOneTimeSchedule(c.id);
  }
}

function runGame(stratName, specIdx) {
  const plan = STRATS[stratName];
  __run = { ended: false, won: false };

  initState();
  selectSpec(__SPEC_IDS[specIdx % __SPEC_IDS.length]);
  startGame();

  const fatigueHist = [];
  let safety = 60;
  while (!__run.ended && G.month < 36 && safety-- > 0) {
    // 1) завершаем готовые
    [...G.activeClients].forEach(c => {
      if (!c.oneTime && Math.round(c._progress||0) >= 100) completeProject(c.id);
      if (__run.ended) return;
    });
    if (__run.ended) break;
    if (G.money >= __SETTINGS.winCondition) { __run.ended = true; __run.won = true; break; }

    // 2) усталость
    if (G.teamFatigue >= 60)      tryRecovery(['corp_vacation','teambuilding','paid_leave']);
    else if (G.teamFatigue >= 40) tryRecovery(['teambuilding','paid_leave']);

    // 3) найм
    botHire(plan);

    // 4) скаутинг и подписание
    botSign(plan);

    // 5) расстановка и разовые
    botAssign();
    botScheduleOneTime();

    fatigueHist.push(G.teamFatigue);

    // 6) ход
    advanceMonth();
  }

  const finalMoney = Math.round(G.money);
  const hist = (G.history||[]).map(h => h.money);
  return {
    strategy:  stratName,
    won:       __run.won || finalMoney >= __SETTINGS.winCondition,
    bankrupt:  __run.ended && !__run.won && finalMoney <= 0,
    months:    G.month,
    finalMoney,
    peak:      hist.length ? Math.max(...hist) : finalMoney,
    completed: (G.completedProjects||[]).length,
    staff:     G.staff.filter(s => s.status !== 'fired').length,
    rep:       Math.round(G.reputation),
    portfolio: G.portfolio||0,
    avgFt:     fatigueHist.length ? Math.round(fatigueHist.reduce((s,v)=>s+v,0)/fatigueHist.length) : 0,
    maxFt:     fatigueHist.length ? Math.max(...fatigueHist) : 0,
  };
}

// ── Серия ─────────────────────────────────────────────
const RUNS = __RUNS_PER_STRAT;
const all = [];
for (const strat of Object.keys(STRATS)) {
  for (let i = 0; i < RUNS; i++) all.push(runGame(strat, i));
}
__RESULTS.push(...all);
`;

// ── What-if патч: --fix-wu ────────────────────────────
// Исправляет рассинхрон calcStaffWorkUnit (engine.js) со staff v2:
// 1) грейды junior/middle/senior/lead/star (как в _recomputeWU из staff.js)
// 2) qStat-шкала 0–10 нормализуется к 0–100 (формула делит на 75)
const FIX_WU = process.argv.includes('--fix-wu');
const WU_PATCH = `
function calcStaffWorkUnit(s) {
  if (!s || s.status === 'fired') return 0;
  const gradeWU  = { jr:2, junior:2, md:4, middle:4, sr:7, senior:7, lead:9, star:12 }[s.grade] || 3;
  const rawQ     = (s.qStat || s.quality || 50);
  const q100     = rawQ <= 10 ? rawQ * 10 : rawQ;   // staff v2 qStat 3–10 → 30–100
  const qualMult = Math.max(0.4, q100 / 75);
  const moodMult = Math.max(0.5, ((s.mood ?? 80) / 100));
  return Math.round(gradeWU * qualMult * moodMult);
}`;

// ── Запуск ────────────────────────────────────────────
sandbox.__RUNS_PER_STRAT = RUNS_PER_STRAT;
sandbox.__RESULTS = [];

try {
  vm.runInContext(engineSrc + (FIX_WU ? '\n;\n' + WU_PATCH : '') + '\n;\n' + BOT_SRC, sandbox, { filename: 'sim2-bundle.js' });
} catch (e) {
  console.error('💥 Ошибка симуляции:', e);
  process.exit(1);
}

// ── Отчёт ─────────────────────────────────────────────
const results = sandbox.__RESULTS;
const fmtK = n => Math.abs(n) >= 1e6 ? (n/1e6).toFixed(2)+'M' : Math.round(n/1000)+'K';

console.log('');
console.log('══════════════════════════════════════════════════════════════════════════════════');
console.log(`  BizTycoon v2.3+wip — HEADLESS sim2 (реальный движок) · ${RUNS_PER_STRAT} партий/стратегия${FIX_WU ? ' · [WU-FIX]' : ''}`);
console.log(`  Цель: 7.5M за 36 мес · overhead 35K · бюджеты WIP-ребаланса`);
console.log('══════════════════════════════════════════════════════════════════════════════════');

for (const strat of ['lean','balanced','trio_t3','growth','aggressive']) {
  const rs = results.filter(r => r.strategy === strat);
  if (!rs.length) continue;
  const wins  = rs.filter(r => r.won).length;
  const bank  = rs.filter(r => r.bankrupt).length;
  const alive = rs.length - wins - bank;
  const avg   = a => a.reduce((s,v)=>s+v,0)/a.length;
  const med   = a => { const x=[...a].sort((p,q)=>p-q); return x[Math.floor(x.length/2)]; };
  const fin   = rs.map(r=>r.finalMoney);
  console.log('');
  console.log(`▸ ${strat.toUpperCase().padEnd(11)} 🏆 ${wins}/${rs.length} побед · 💀 ${bank} банкротств · ⏰ ${alive} таймаутов`);
  console.log(`  Финал: средн. ${fmtK(avg(fin))} · медиана ${fmtK(med(fin))} · мин ${fmtK(Math.min(...fin))} · макс ${fmtK(Math.max(...fin))}`);
  console.log(`  Завершено проектов: ${avg(rs.map(r=>r.completed)).toFixed(1)} · команда в конце: ${avg(rs.map(r=>r.staff)).toFixed(1)} · портфолио: ${Math.round(avg(rs.map(r=>r.portfolio)))}`);
  console.log(`  Репутация: ${Math.round(avg(rs.map(r=>r.rep)))} · усталость средн./макс: ${Math.round(avg(rs.map(r=>r.avgFt)))}/${Math.round(avg(rs.map(r=>r.maxFt)))}`);
  const winMonths = rs.filter(r=>r.won).map(r=>r.months);
  if (winMonths.length) console.log(`  Победа в среднем на M${Math.round(avg(winMonths))}`);
}

console.log('');
console.log('──────────────────────────────────────────────────────────────────────────────────');
const totW = results.filter(r=>r.won).length, totB = results.filter(r=>r.bankrupt).length;
console.log(`ИТОГО: побед ${totW}/${results.length} (${Math.round(totW/results.length*100)}%) · банкротств ${totB} (${Math.round(totB/results.length*100)}%)`);
console.log('');
