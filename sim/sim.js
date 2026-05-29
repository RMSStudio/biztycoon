'use strict';
// ══════════════════════════════════════════════════════
//  BizTycoon v0.19 — Balance Simulator
//  Runs N games with different AI strategies, reports key metrics
// ══════════════════════════════════════════════════════

const TOTAL_RUNS    = 10;
const MAX_MONTHS    = 36;
const OVERHEAD      = 20000;
const ACTIONS_PM    = 10;
const SCOUT_COST    = 3;
const HIRE_COST     = 2;

// ── Game data ─────────────────────────────────────────
const BUDGET_RANGES = {
  1: [90000,   165000],
  2: [220000,  440000],
  3: [550000,  1320000],
  4: [1500000, 3500000],
};

// Tier durations (months)
const TIER_DUR  = { 1:3, 2:4, 3:5, 4:6 };
// Load per tier
const TIER_LOAD = { 1:7, 2:14, 3:24, 4:30 };

// Staff definitions (subset: id, role, grade, cost, quality, volume, capacity, throughput, speedBonus)
const STAFF = [
  { id:'designer_jr',   role:'designer',   grade:'jr', cost:30000, quality:10, volume:0,  capacity:0, throughput:4,  speedBonus:0    },
  { id:'designer',      role:'designer',   grade:'md', cost:48000, quality:20, volume:0,  capacity:0, throughput:7,  speedBonus:0    },
  { id:'designer_sr',   role:'designer',   grade:'sr', cost:72000, quality:35, volume:0,  capacity:0, throughput:10, speedBonus:0,   unlockRep:70 },
  { id:'copywriter_jr', role:'copywriter', grade:'jr', cost:22000, quality:0,  volume:8,  capacity:0, throughput:3,  speedBonus:0    },
  { id:'copywriter',    role:'copywriter', grade:'md', cost:35000, quality:0,  volume:15, capacity:0, throughput:5,  speedBonus:0    },
  { id:'copywriter_sr', role:'copywriter', grade:'sr', cost:52000, quality:0,  volume:25, capacity:0, throughput:7,  speedBonus:0,   unlockRep:60 },
  { id:'manager_jr',    role:'manager',    grade:'jr', cost:33000, quality:0,  volume:0,  capacity:1, throughput:3,  speedBonus:0.03 },
  { id:'manager',       role:'manager',    grade:'md', cost:52000, quality:0,  volume:0,  capacity:2, throughput:5,  speedBonus:0.05 },
  { id:'manager_sr',    role:'manager',    grade:'sr', cost:80000, quality:0,  volume:0,  capacity:3, throughput:7,  speedBonus:0.08, unlockRep:70 },
  { id:'developer_jr',  role:'developer',  grade:'jr', cost:38000, quality:8,  volume:0,  capacity:0, throughput:4,  speedBonus:0.03 },
  { id:'developer',     role:'developer',  grade:'md', cost:60000, quality:15, volume:0,  capacity:0, throughput:7,  speedBonus:0.05 },
  { id:'developer_sr',  role:'developer',  grade:'sr', cost:90000, quality:25, volume:0,  capacity:0, throughput:10, speedBonus:0.08, unlockRep:80 },
  { id:'smm',           role:'smm',        grade:'md', cost:34000, quality:0,  volume:10, capacity:0, throughput:3,  speedBonus:0    },
  { id:'lawyer',        role:'lawyer',     grade:'md', cost:42000, quality:0,  volume:0,  capacity:0, throughput:2,  speedBonus:0    },
  { id:'hr_jr',         role:'hr',         grade:'jr', cost:20000, quality:0,  volume:0,  capacity:0, throughput:1,  speedBonus:0    },
  { id:'hr',            role:'hr',         grade:'md', cost:30000, quality:0,  volume:0,  capacity:0, throughput:2,  speedBonus:0    },
  { id:'hr_sr',         role:'hr',         grade:'sr', cost:46000, quality:0,  volume:0,  capacity:0, throughput:3,  speedBonus:0,   unlockRep:65 },
];

// Representative project pool (tier, minQ, minV, oneTime, fixedBudget, cooldown)
const PROJECTS = [
  // T1 oneTime
  { id:'audit_quick',  tier:1, minQ:0,  minV:0,  oneTime:true, fixedBudget:[70000,90000], cooldown:3, prob:0.80 },
  { id:'consult_once', tier:1, minQ:0,  minV:0,  oneTime:true, fixedBudget:[70000,90000], cooldown:3, prob:0.75 },
  // T1 regular
  { id:'loyal',        tier:1, minQ:0,  minV:0,  oneTime:false, prob:0.75 },
  { id:'referral',     tier:1, minQ:0,  minV:0,  oneTime:false, prob:0.80 },
  { id:'local_shop',   tier:1, minQ:0,  minV:0,  oneTime:false, prob:0.70 },
  { id:'photographer', tier:1, minQ:0,  minV:5,  oneTime:false, prob:0.65 },
  { id:'blogger',      tier:1, minQ:0,  minV:8,  oneTime:false, prob:0.60 },
  { id:'restaurant',   tier:1, minQ:0,  minV:5,  oneTime:false, prob:0.60 },
  { id:'dental',       tier:1, minQ:10, minV:0,  oneTime:false, prob:0.50 },
  { id:'late_pay',     tier:1, minQ:0,  minV:0,  oneTime:false, prob:0.55 },
  // T2
  { id:'startup_hype',   tier:2, minQ:0,  minV:10, oneTime:false, prob:0.65 },
  { id:'perfectionist',  tier:2, minQ:15, minV:0,  oneTime:false, prob:0.50 },
  { id:'urgent',         tier:2, minQ:10, minV:5,  oneTime:true,  prob:0.60 },
  { id:'ecommerce',      tier:2, minQ:10, minV:10, oneTime:false, prob:0.55 },
  { id:'edtech',         tier:2, minQ:15, minV:12, oneTime:false, prob:0.45 },
  { id:'fitchain',       tier:2, minQ:0,  minV:15, oneTime:false, prob:0.45 },
  { id:'lawfirm',        tier:2, minQ:20, minV:0,  oneTime:false, prob:0.40 },
  { id:'hr_platform',    tier:2, minQ:0,  minV:18, oneTime:false, prob:0.45 },
  { id:'agro',           tier:2, minQ:10, minV:5,  oneTime:false, prob:0.50 },
  { id:'demanding_corp', tier:2, minQ:30, minV:10, oneTime:false, prob:0.35 },
  // T3
  { id:'grey_zone',      tier:3, minQ:0,  minV:0,  oneTime:false, prob:0.45 },
  { id:'retainer_plus',  tier:3, minQ:20, minV:15, oneTime:false, prob:0.30 },
  { id:'federal_retail', tier:3, minQ:25, minV:15, oneTime:false, prob:0.28, minRep:70 },
  { id:'state',          tier:3, minQ:30, minV:15, oneTime:false, prob:0.25, minRep:60 },
];

// ── Utility ───────────────────────────────────────────
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const rndRange = (lo, hi) => lo + Math.random() * (hi - lo);
const rndInt  = (lo, hi) => Math.floor(rndRange(lo, hi + 1));

// ── State factory ─────────────────────────────────────
function makeState() {
  return {
    money: 1000000,
    month: 0,
    staff: [],
    active: [],        // active projects
    reputation: 100,
    teamFatigue: 0,
    fatigueCd: {},     // { id: months_remaining }
    oneTimeCooldown: 0,
    qualityBonus: 0,
    speedUpgrades: 0,
    portfolio: 0,
    completedCount: 0,
    events: [],        // log of notable events
    bankrupt: false,
    bankMonth: null,
    moneyHistory: [],
    fatigueHistory: [],
  };
}

// ── Engine helpers ────────────────────────────────────
const hasRole   = (g, role)  => g.staff.some(s => s.role === role);
const getQ      = (g)        => g.qualityBonus + g.staff.reduce((s,x) => s+(x.quality||0), 0);
const getV      = (g)        => g.staff.reduce((s,x) => s+(x.volume||0), 0);
const getThr    = (g)        => 10 + g.staff.reduce((s,x) => s+(x.throughput||0), 0);
const getSpd    = (g)        => 1.0 + g.staff.reduce((s,x)=>s+(x.speedBonus||0),0) + (g.speedUpgrades||0);
const getCap    = (g)        => 2 + g.staff.filter(s=>s.role==='manager').reduce((s,m)=>s+(m.capacity||0),0);
const getSalary = (g)        => g.staff.reduce((s,x) => s+x.cost, 0);
const getLoad   = (g)        => g.active.reduce((s,c) => s+(TIER_LOAD[c.tier]||7), 0);
const getFatMul = (g)        => { const ft=g.teamFatigue; return ft>=85?.70:ft>=60?.85:ft>=30?.95:1.0; };

function genBudget(p) {
  if (p.fixedBudget) {
    const [lo,hi] = p.fixedBudget;
    return Math.round(rndRange(lo,hi)/1000)*1000;
  }
  const [lo,hi] = BUDGET_RANGES[p.tier]||BUDGET_RANGES[1];
  return Math.round(rndRange(lo,hi)/5000)*5000;
}

// ── advanceMonth ──────────────────────────────────────
function advanceMonth(g) {
  // cooldown decrements
  if (g.oneTimeCooldown > 0) g.oneTimeCooldown--;
  Object.keys(g.fatigueCd).forEach(k => { if (g.fatigueCd[k]>0) g.fatigueCd[k]--; });

  const thr     = getThr(g);
  const load    = getLoad(g);
  const loadPct = thr > 0 ? load / thr : 0;

  // Fatigue delta
  let fd = loadPct >= 1.0 ? 10 : loadPct >= 0.85 ? 4 : loadPct >= 0.70 ? 1 : -8;
  const hrSr = g.staff.some(s=>s.id==='hr_sr');
  const hrMd = g.staff.some(s=>s.id==='hr');
  const hrJr = g.staff.some(s=>s.id==='hr_jr');
  if (fd > 0) {
    if (hrSr) fd = Math.round(fd*0.55);
    else if (hrMd) fd = Math.round(fd*0.70);
    else if (hrJr) fd = Math.round(fd*0.80);
  }
  if (hrSr) fd -= 2;
  g.teamFatigue = clamp(g.teamFatigue + fd, 0, 100);

  const fatMul = getFatMul(g);
  const spdMul = getSpd(g);
  const lratio = load > 0 ? Math.min(1, thr / load) : 1;

  // Progress all non-oneTime active projects (equal focus)
  const focusable = g.active.filter(c => !c.oneTime);
  const n = focusable.length;
  focusable.forEach(c => {
    c.monthsSigned++;
    const fMul = 1.0; // equal focus
    const prog = (100 / (TIER_DUR[c.tier]||3)) * lratio * fMul * fatMul * spdMul;
    c.progress = Math.min(100, Math.round((c.progress + prog)*100)/100);
  });

  // Milestone payments
  focusable.forEach(c => {
    (c.milestones||[]).forEach((thr, idx) => {
      if (c.progress >= thr && !(c.milestonesPaid||[]).includes(idx)) {
        const payout = Math.round((c.originalBudget||c.budget) * c.milestonePcts[idx] / 5000) * 5000;
        c.budget = Math.max(0, c.budget - payout);
        g.money += payout;
        c.milestonesPaid.push(idx);
        g.events.push(`M${g.month+1}: milestone ${thr}% «${c.id}» +${Math.round(payout/1000)}K`);
      }
    });
  });

  // Staff quit from burnout
  if (g.teamFatigue >= 60 && g.staff.length > 0) {
    const quitChance = g.teamFatigue >= 85 ? 0.20 : 0.10;
    const idx = g.staff.findIndex(() => Math.random() < quitChance);
    if (idx >= 0) {
      const quitter = g.staff.splice(idx, 1)[0];
      g.events.push(`M${g.month+1}: ${quitter.id} уволился (усталость ${Math.round(g.teamFatigue)})`);
    }
  }

  // Pay costs
  const costs = OVERHEAD + getSalary(g);
  g.money -= costs;
  g.month++;

  // Reputation drift from fatigue
  if (g.teamFatigue >= 30) g.reputation = clamp(g.reputation - 1, 0, 100);

  g.moneyHistory.push(g.money);
  g.fatigueHistory.push(g.teamFatigue);

  if (g.money < 0) {
    g.bankrupt = true;
    g.bankMonth = g.month;
  }
}

// ── signProject ───────────────────────────────────────
function signProject(g, p) {
  if (!p.oneTime && g.active.length >= getCap(g)) return false;
  if (p.oneTime && p.cooldown && g.oneTimeCooldown > 0) return false;

  const budget = genBudget(p);

  if (p.oneTime) {
    g.money += budget;
    if (p.cooldown) g.oneTimeCooldown = p.cooldown;
    g.portfolio += p.tier;
    g.completedCount++;
    return true;
  }

  // Prepayment chance (25%)
  let prepaid = 0;
  if (Math.random() < 0.25) {
    prepaid = Math.round(budget * 0.30 / 5000)*5000;
    g.money += prepaid;
  }

  // Milestone thresholds and pcts: T2→[50%]→30%, T3→[33%,66%]→25%+25%
  const mThresholds = p.tier===2 ? [50] : p.tier===3 ? [33,66] : [];
  const mPcts       = p.tier===2 ? [0.30] : p.tier===3 ? [0.25,0.25] : [];

  g.active.push({
    id: p.id, tier: p.tier,
    originalBudget: budget,
    budget: budget - prepaid,
    prepaid,
    progress: 0, monthsSigned: 0,
    duration: TIER_DUR[p.tier]||3,
    milestones: mThresholds,
    milestonePcts: mPcts,
    milestonesPaid: [],
  });
  return true;
}

// ── completeProject ───────────────────────────────────
function completeProject(g, c) {
  const overdue = Math.max(0, c.monthsSigned - c.duration);
  const penaltyMult = Math.max(0.60, 1 - overdue * 0.10);
  // c.budget уже уменьшен на prepaid и milestone-выплаты
  const payout = Math.round(c.budget * penaltyMult);
  g.money += payout;
  g.portfolio += c.tier;
  g.completedCount++;
  g.active = g.active.filter(x => x !== c);
  return payout;
}

// ── hire ──────────────────────────────────────────────
function hire(g, staffId) {
  const def = STAFF.find(s=>s.id===staffId);
  if (!def) return false;
  if (def.unlockRep && g.reputation < def.unlockRep) return false;
  if (g.teamFatigue >= 85) return false; // crisis blocks hiring
  // Cost: first-month salary paid upfront (no separate hiring fee in sim)
  if (g.money < def.cost * 2) return false; // need 2 months runway
  g.staff.push({ ...def, _iid: Math.random() });
  return true;
}

// ── useFatigueRecovery ────────────────────────────────
function useFatigueRecovery(g, toolId) {
  const tools = {
    paid_leave:   { cost:12000, reduce:12, cd:1, days:1 },
    teambuilding: { cost:28000, reduce:22, cd:2, days:2 },
    corp_vacation:{ cost:55000, reduce:38, cd:3, days:3, minFatigue:40 },
  };
  const t = tools[toolId];
  if (!t) return false;
  if ((g.fatigueCd[toolId]||0) > 0) return false;
  if (t.minFatigue && g.teamFatigue < t.minFatigue) return false;
  if (g.money < t.cost) return false;
  g.money -= t.cost;
  g.teamFatigue = clamp(g.teamFatigue - t.reduce, 0, 100);
  g.fatigueCd[toolId] = t.cd;
  return true;
}

// ── generateOffers ────────────────────────────────────
function generateOffers(g) {
  const Q = getQ(g), V = getV(g);
  const maxTier = g.reputation>=80?4 : g.reputation>=70?3 : g.reputation>=40?2 : 1;

  const eligible = PROJECTS.filter(p => {
    if (p.tier > maxTier) return false;
    if ((p.minQ||0) > Q) return false;
    if ((p.minV||0) > V) return false;
    if (p.minRep && g.reputation < p.minRep) return false;
    if (p.oneTime && p.cooldown && g.oneTimeCooldown > 0) return false;
    return Math.random() < (p.prob||0.5);
  });

  // Pick up to 5 offers (shuffle)
  const shuffled = eligible.sort(() => Math.random()-0.5);
  return shuffled.slice(0, 5);
}

// ══════════════════════════════════════════════════════
//  AI STRATEGIES
// ══════════════════════════════════════════════════════

// Strategy: lean — no staff, only oneTime + safe T1, survive on low burn
function strategyLean(g, offers) {
  const Q=getQ(g), V=getV(g);
  // Never hire regular staff
  // Use fatigue recovery if needed
  if (g.teamFatigue >= 50 && !g.bankrupt) {
    useFatigueRecovery(g, 'paid_leave') || useFatigueRecovery(g, 'teambuilding');
  }
  // Sign only oneTime or T1 with no requirements
  const cap = getCap(g);
  for (const p of offers) {
    if (g.active.length >= cap && !p.oneTime) break;
    if (p.tier > 1 && !p.oneTime) continue;
    if ((p.minQ||0) > Q || (p.minV||0) > V) continue;
    signProject(g, p);
  }
}

// Strategy: balanced — hire designer+copywriter, mix T1-T2
function strategyBalanced(g, offers) {
  const Q=getQ(g), V=getV(g);

  // Fatigue control
  if (g.teamFatigue >= 55) {
    useFatigueRecovery(g,'teambuilding') || useFatigueRecovery(g,'paid_leave');
  }
  if (g.teamFatigue >= 75) {
    useFatigueRecovery(g,'corp_vacation') || useFatigueRecovery(g,'teambuilding');
  }

  // Hire: designer first, then copywriter, then maybe manager
  if (!hasRole(g,'designer') && g.money > 250000) hire(g,'designer');
  if (Q >= 10 && !hasRole(g,'copywriter') && g.money > 200000) hire(g,'copywriter');
  if (g.active.length >= getCap(g) && !hasRole(g,'manager') && g.money > 350000) hire(g,'manager');

  // Sign T1 + T2 if requirements met
  const cap = getCap(g);
  const thr = getThr(g);
  const load = getLoad(g);
  for (const p of offers) {
    if (!p.oneTime && g.active.length >= cap) break;
    if (p.tier > 2 && !p.oneTime) continue;
    if ((p.minQ||0) > Q || (p.minV||0) > V) continue;
    const newLoad = p.oneTime ? load : load + (TIER_LOAD[p.tier]||7);
    if (!p.oneTime && newLoad > thr * 1.25) continue; // avoid severe overload
    signProject(g, p);
  }
}

// Strategy: growth — hire 3-4 staff fast, push T2-T3
function strategyGrowth(g, offers) {
  const Q=getQ(g), V=getV(g);

  // Aggressive fatigue control
  if (g.teamFatigue >= 45) {
    useFatigueRecovery(g,'corp_vacation') ||
    useFatigueRecovery(g,'teambuilding')  ||
    useFatigueRecovery(g,'paid_leave');
  }

  // Hire aggressively: designer → copywriter → manager → developer
  if (!hasRole(g,'designer') && g.money > 200000)    hire(g,'designer');
  if (!hasRole(g,'copywriter') && g.money > 180000)   hire(g,'copywriter');
  if (!hasRole(g,'manager') && g.money > 300000)      hire(g,'manager');
  if (!hasRole(g,'developer') && Q >= 15 && g.money > 400000) hire(g,'developer');
  // Upgrade designer to Sr when possible
  if (Q >= 20 && !g.staff.some(s=>s.id==='designer_sr') && g.reputation >= 70 && g.money > 500000) hire(g,'designer_sr');

  // Sign any tier the team can handle
  const cap = getCap(g);
  const thr = getThr(g);
  const load = getLoad(g);
  for (const p of offers) {
    if (!p.oneTime && g.active.length >= cap) break;
    if ((p.minQ||0) > Q || (p.minV||0) > V) continue;
    const newLoad = p.oneTime ? load : load + (TIER_LOAD[p.tier]||7);
    if (!p.oneTime && newLoad > thr * 1.35) continue;
    signProject(g, p);
  }
}

// ══════════════════════════════════════════════════════
//  SIMULATION RUNNER
// ══════════════════════════════════════════════════════
function runGame(strategyName) {
  const g = makeState();
  const stratFn = strategyName==='lean' ? strategyLean
                : strategyName==='growth' ? strategyGrowth
                : strategyBalanced;

  for (let m = 0; m < MAX_MONTHS && !g.bankrupt; m++) {
    // Complete finished projects first
    [...g.active].forEach(c => {
      if (c.progress >= 100) completeProject(g, c);
    });

    // Scout
    const offers = generateOffers(g);

    // AI decides: hire + sign
    stratFn(g, offers);

    // Advance month
    advanceMonth(g);
  }

  const peaked = g.moneyHistory.length ? Math.max(...g.moneyHistory) : g.money;
  const minMoney = g.moneyHistory.length ? Math.min(...g.moneyHistory) : g.money;
  const avgFatigue = g.fatigueHistory.length
    ? Math.round(g.fatigueHistory.reduce((s,v)=>s+v,0)/g.fatigueHistory.length)
    : 0;
  const maxFatigue = g.fatigueHistory.length ? Math.max(...g.fatigueHistory) : 0;

  return {
    strategy: strategyName,
    survived: !g.bankrupt,
    months: g.month,
    bankMonth: g.bankMonth,
    finalMoney: Math.round(g.money),
    peakMoney: Math.round(peaked),
    minMoney: Math.round(minMoney),
    staffCount: g.staff.length,
    completed: g.completedCount,
    portfolio: g.portfolio,
    reputation: Math.round(g.reputation),
    avgFatigue,
    maxFatigue,
    events: g.events,
  };
}

// ══════════════════════════════════════════════════════
//  RUN & REPORT
// ══════════════════════════════════════════════════════
const strategies = [
  'lean','lean','lean',
  'balanced','balanced','balanced','balanced',
  'growth','growth','growth',
];

const results = strategies.map((s, i) => ({ run: i+1, ...runGame(s) }));

// Format money
const fmtK = n => {
  if (Math.abs(n) >= 1000000) return `${(n/1000000).toFixed(1)}M`;
  return `${Math.round(n/1000)}K`;
};

console.log('\n════════════════════════════════════════════════════════════════════════════');
console.log('  BizTycoon v0.18 — Balance Simulation Results (10 games, MAX 36 months)');
console.log('════════════════════════════════════════════════════════════════════════════');
console.log(`${'#'.padEnd(3)} ${'Strategy'.padEnd(10)} ${'Result'.padEnd(16)} ${'Final'.padStart(7)} ${'Peak'.padStart(7)} ${'Min'.padStart(7)} ${'Done'.padStart(5)} ${'Stf'.padStart(4)} ${'Rep'.padStart(4)} ${'AvgFt'.padStart(6)} ${'MaxFt'.padStart(6)}`);
console.log('─'.repeat(90));

results.forEach(r => {
  const result = r.survived ? `✅ Выжил M${r.months}` : `💀 Банкрот M${r.bankMonth}`;
  console.log(
    `${String(r.run).padEnd(3)} ${r.strategy.padEnd(10)} ${result.padEnd(16)} ` +
    `${fmtK(r.finalMoney).padStart(7)} ${fmtK(r.peakMoney).padStart(7)} ${fmtK(r.minMoney).padStart(7)} ` +
    `${String(r.completed).padStart(5)} ${String(r.staffCount).padStart(4)} ` +
    `${String(r.reputation).padStart(4)} ${String(r.avgFatigue).padStart(6)} ${String(r.maxFatigue).padStart(6)}`
  );
  if (r.events.length > 0) {
    r.events.forEach(e => console.log(`   ↳ ${e}`));
  }
});

console.log('─'.repeat(90));

// Summary by strategy
['lean','balanced','growth'].forEach(strat => {
  const runs = results.filter(r => r.strategy === strat);
  const survived = runs.filter(r => r.survived);
  const avgFinal = Math.round(runs.reduce((s,r)=>s+r.finalMoney,0)/runs.length);
  const avgFt    = Math.round(runs.reduce((s,r)=>s+r.avgFatigue,0)/runs.length);
  const avgDone  = (runs.reduce((s,r)=>s+r.completed,0)/runs.length).toFixed(1);
  console.log(`  ${strat.padEnd(10)} Выживаемость: ${survived.length}/${runs.length} · Ср.баланс: ${fmtK(avgFinal)} · Ср.усталость: ${avgFt} · Ср.проектов: ${avgDone}`);
});

console.log('════════════════════════════════════════════════════════════════════════════\n');

// Detailed notes
console.log('📋 Аналитика:\n');
const allSurvived = results.filter(r=>r.survived).length;
console.log(`  Общая выживаемость: ${allSurvived}/${TOTAL_RUNS} (${Math.round(allSurvived/TOTAL_RUNS*100)}%)`);
const bankrupt = results.filter(r=>!r.survived);
if (bankrupt.length > 0) {
  const avgBankMonth = Math.round(bankrupt.reduce((s,r)=>s+r.bankMonth,0)/bankrupt.length);
  console.log(`  Среднее время банкротства: M${avgBankMonth}`);
}
const maxFatGames = results.filter(r=>r.maxFatigue>=85);
if (maxFatGames.length > 0) {
  console.log(`  Кризис усталости (≥85) достигался в ${maxFatGames.length}/${TOTAL_RUNS} играх`);
}
const highFinal = results.filter(r=>r.finalMoney>1000000);
if (highFinal.length > 0) {
  console.log(`  Финальный баланс >1M: ${highFinal.length}/${TOTAL_RUNS} игр`);
}
console.log('');
