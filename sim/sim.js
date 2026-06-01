'use strict';
// ══════════════════════════════════════════════════════
//  BizTycoon v0.31 — Balance Simulator
//  Synced: 2026-06-01
//  Runs N games with different AI strategies, reports key metrics
// ══════════════════════════════════════════════════════

const TOTAL_RUNS   = 10;
const MAX_MONTHS   = 36;
const OVERHEAD     = 20000;
const START_MONEY  = 1000000;

// ── Бюджеты по тирам (из agency.js budgetRanges) ─────
const BUDGET_RANGES = {
  1: [90000,   165000],
  2: [220000,  440000],
  3: [550000,  1320000],
  4: [1500000, 3500000],
};

// Базовые длительности и нагрузки по тиру (переопределяются полем duration/load на проекте)
// engine.js: tier1=3, tier2=4, все остальные=5 месяцев по умолчанию
// engine.js getProjectLoad: tier2=14, tier3=24, остальные=7 (включая tier4)
const TIER_DUR  = { 1:3, 2:4, 3:5, 4:5 };
const TIER_LOAD = { 1:7, 2:14, 3:24, 4:7 };

// ══════════════════════════════════════════════════════
//  КОМАНДА — 21 сотрудник (из agency.js staff)
// ══════════════════════════════════════════════════════
const STAFF = [
  // Дизайнер
  { id:'designer_jr',   role:'designer',   grade:'jr', cost:30000, quality:10, volume:0,  capacity:0, throughput:4,  speedBonus:0    },
  { id:'designer',      role:'designer',   grade:'md', cost:48000, quality:20, volume:0,  capacity:0, throughput:7,  speedBonus:0    },
  { id:'designer_sr',   role:'designer',   grade:'sr', cost:72000, quality:35, volume:0,  capacity:0, throughput:10, speedBonus:0,   unlockRep:70 },
  // Копирайтер
  { id:'copywriter_jr', role:'copywriter', grade:'jr', cost:22000, quality:0,  volume:8,  capacity:0, throughput:3,  speedBonus:0    },
  { id:'copywriter',    role:'copywriter', grade:'md', cost:35000, quality:0,  volume:15, capacity:0, throughput:5,  speedBonus:0    },
  { id:'copywriter_sr', role:'copywriter', grade:'sr', cost:52000, quality:0,  volume:25, capacity:0, throughput:7,  speedBonus:0,   unlockRep:60 },
  // Менеджер
  { id:'manager_jr',    role:'manager',    grade:'jr', cost:33000, quality:0,  volume:0,  capacity:1, throughput:3,  speedBonus:0.03 },
  { id:'manager',       role:'manager',    grade:'md', cost:52000, quality:0,  volume:0,  capacity:2, throughput:5,  speedBonus:0.05 },
  { id:'manager_sr',    role:'manager',    grade:'sr', cost:80000, quality:0,  volume:0,  capacity:3, throughput:7,  speedBonus:0.08, unlockRep:70 },
  // Разработчик
  { id:'developer_jr',  role:'developer',  grade:'jr', cost:38000, quality:8,  volume:0,  capacity:0, throughput:4,  speedBonus:0.03 },
  { id:'developer',     role:'developer',  grade:'md', cost:60000, quality:15, volume:0,  capacity:0, throughput:7,  speedBonus:0.05 },
  { id:'developer_sr',  role:'developer',  grade:'sr', cost:90000, quality:25, volume:0,  capacity:0, throughput:10, speedBonus:0.08, unlockRep:80 },
  // SMM (3 грейда)
  { id:'smm_jr',        role:'smm',        grade:'jr', cost:22000, quality:0,  volume:5,  capacity:0, throughput:2,  speedBonus:0    },
  { id:'smm',           role:'smm',        grade:'md', cost:34000, quality:0,  volume:10, capacity:0, throughput:3,  speedBonus:0    },
  { id:'smm_sr',        role:'smm',        grade:'sr', cost:50000, quality:0,  volume:18, capacity:0, throughput:5,  speedBonus:0,   unlockRep:60 },
  // Юрист (3 грейда)
  { id:'lawyer_jr',     role:'lawyer',     grade:'jr', cost:28000, quality:0,  volume:0,  capacity:0, throughput:1,  speedBonus:0    },
  { id:'lawyer',        role:'lawyer',     grade:'md', cost:42000, quality:0,  volume:0,  capacity:0, throughput:2,  speedBonus:0    },
  { id:'lawyer_sr',     role:'lawyer',     grade:'sr', cost:65000, quality:0,  volume:0,  capacity:0, throughput:3,  speedBonus:0,   unlockRep:75 },
  // HR
  { id:'hr_jr',         role:'hr',         grade:'jr', cost:20000, quality:0,  volume:0,  capacity:0, throughput:1,  speedBonus:0    },
  { id:'hr',            role:'hr',         grade:'md', cost:30000, quality:0,  volume:0,  capacity:0, throughput:2,  speedBonus:0    },
  { id:'hr_sr',         role:'hr',         grade:'sr', cost:46000, quality:0,  volume:0,  capacity:0, throughput:3,  speedBonus:0,   unlockRep:65 },
];

// ══════════════════════════════════════════════════════
//  ПУЛ ПРОЕКТОВ — полная версия из agency.js
//  modifier: 'nps_penalty' | 'revenue_growth' | 'payment_delay' |
//            'payment_delay_fixed' | 'reputation' | 'nps_passive' (упрощённо)
//  requiresDev: true — требует Разработчика в команде
//  minPortfolio: N — требует накопленного портфолио
//  duration: N — переопределяет TIER_DUR[tier]
// ══════════════════════════════════════════════════════
const PROJECTS = [

  // ── TIER 1 — Разовые ────────────────────────────────
  { id:'audit_quick',   tier:1, minQ:0,  minV:0,  oneTime:true,  fixedBudget:[70000,90000],   cooldown:3, prob:0.80 },
  { id:'consult_once',  tier:1, minQ:0,  minV:0,  oneTime:true,  fixedBudget:[70000,90000],   cooldown:3, prob:0.75 },

  // ── TIER 1 — Регулярные ──────────────────────────────
  { id:'loyal',          tier:1, minQ:0,  minV:0,  prob:0.75 },
  { id:'referral',       tier:1, minQ:0,  minV:0,  prob:0.80 },
  { id:'late_pay',       tier:1, minQ:0,  minV:0,  prob:0.55, modifier:'payment_delay', modVal:0.40 },
  { id:'local_shop',     tier:1, minQ:0,  minV:0,  prob:0.70 },
  { id:'photographer',   tier:1, minQ:0,  minV:5,  prob:0.65 },
  { id:'blogger',        tier:1, minQ:0,  minV:8,  prob:0.60 },
  { id:'restaurant',     tier:1, minQ:0,  minV:5,  prob:0.60, modifier:'random_bonus', modVal:12000 },
  { id:'dental',         tier:1, minQ:10, minV:0,  prob:0.50 },
  { id:'language_school',tier:1, minQ:0,  minV:10, prob:0.55 },

  // ── TIER 2 ───────────────────────────────────────────
  { id:'perfectionist',  tier:2, minQ:15, minV:0,  prob:0.50 },
  { id:'startup_hype',   tier:2, minQ:0,  minV:10, prob:0.65, modifier:'random_bonus', modVal:18000 },
  { id:'urgent',         tier:2, minQ:10, minV:5,  oneTime:true, prob:0.60 },
  { id:'demanding_corp', tier:2, minQ:30, minV:10, prob:0.35, modifier:'nps_penalty', modVal:22000, modThreshold:65 },
  { id:'ecommerce',      tier:2, minQ:10, minV:10, prob:0.55 },
  { id:'edtech',         tier:2, minQ:15, minV:12, prob:0.45 },
  { id:'fitchain',       tier:2, minQ:0,  minV:15, prob:0.45, modifier:'revenue_growth', modVal:0.04 },
  { id:'lawfirm',        tier:2, minQ:20, minV:0,  prob:0.40 },
  { id:'hr_platform',    tier:2, minQ:0,  minV:18, prob:0.45 },
  { id:'agro',           tier:2, minQ:10, minV:5,  prob:0.50 },
  { id:'medical_center', tier:2, minQ:25, minV:0,  prob:0.30, minRep:60 },
  { id:'saas',           tier:2, minQ:20, minV:0,  prob:0.50, requiresDev:true },
  { id:'media_agency',   tier:2, minQ:15, minV:10, prob:0.55, minPortfolio:12, portfolioWeight:2 },

  // ── TIER 3 ───────────────────────────────────────────
  { id:'grey_zone',      tier:3, minQ:0,  minV:0,  prob:0.45, modifier:'reputation', modVal:-12 },
  { id:'state',          tier:3, minQ:30, minV:15, prob:0.25, minRep:60, duration:8,  modifier:'payment_delay_fixed', modVal:2 },
  { id:'retainer_plus',  tier:3, minQ:20, minV:15, prob:0.30, modifier:'revenue_growth', modVal:0.05 },
  { id:'federal_retail', tier:3, minQ:25, minV:15, prob:0.28, minRep:70, modifier:'nps_penalty', modVal:30000, modThreshold:70 },
  { id:'insurance',      tier:3, minQ:20, minV:10, prob:0.35 },
  { id:'media_holding',  tier:3, minQ:25, minV:20, prob:0.25, modifier:'revenue_growth', modVal:0.06 },
  { id:'auto_dealer',    tier:3, minQ:20, minV:10, prob:0.30, modifier:'payment_delay', modVal:0.20 },
  { id:'ministry',       tier:3, minQ:35, minV:20, prob:0.15, duration:10, modifier:'payment_delay_fixed', modVal:3 },
  { id:'international',  tier:3, minQ:25, minV:10, prob:0.38, minPortfolio:28,  portfolioWeight:3 },
  { id:'strategic_partner', tier:3, minQ:20, minV:15, prob:0.32, minPortfolio:50, portfolioWeight:3, modifier:'revenue_growth', modVal:0.08 },
  { id:'developer_estate',  tier:3, minQ:25, minV:15, prob:0.30, minPortfolio:20, portfolioWeight:2, modifier:'revenue_growth', modVal:0.05 },
  { id:'fintech',        tier:3, minQ:30, minV:10, prob:0.30, requiresDev:true, modifier:'payment_delay_fixed', modVal:1 },
  { id:'telecom',        tier:3, minQ:25, minV:10, prob:0.28, requiresDev:true },
  { id:'payment_sys',    tier:3, minQ:35, minV:15, prob:0.15, requiresDev:true, modifier:'nps_penalty', modVal:40000, modThreshold:70 },

  // ── TIER 4 — Эндгейм (rep ≥ 80, portfolio ≥ 20) ─────
  { id:'national_corp',  tier:4, minQ:40, minV:25, prob:0.20, minPortfolio:20, modifier:'nps_penalty', modVal:50000, modThreshold:70 },
  { id:'intl_holding',   tier:4, minQ:35, minV:25, prob:0.18, minPortfolio:30, modifier:'revenue_growth', modVal:0.07 },
  { id:'unicorn_startup',tier:4, minQ:40, minV:20, prob:0.15, requiresDev:true, modifier:'payment_delay_fixed', modVal:1 },
  { id:'state_mega',     tier:4, minQ:35, minV:30, prob:0.12, minPortfolio:25, duration:12, modifier:'payment_delay_fixed', modVal:3 },
  { id:'enterprise_anchor', tier:4, minQ:35, minV:20, prob:0.15, minPortfolio:40, portfolioWeight:4, modifier:'revenue_growth', modVal:0.10 },
  { id:'bank_digital',   tier:4, minQ:40, minV:20, prob:0.15, requiresDev:true, minPortfolio:20 },
];

// ── Утилиты ───────────────────────────────────────────
const clamp    = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const rndRange = (lo, hi)    => lo + Math.random() * (hi - lo);
const rndInt   = (lo, hi)    => Math.floor(rndRange(lo, hi + 1));

// ── Фабрика стейта ────────────────────────────────────
function makeState() {
  return {
    money:          START_MONEY,
    month:          0,
    staff:          [],
    active:         [],
    reputation:     100,
    teamFatigue:    0,
    fatigueCd:      {},
    oneTimeCooldown:0,
    portfolio:      0,   // сумма тиров завершённых проектов (для minPortfolio)
    completedCount: 0,
    bankrupt:       false,
    bankMonth:      null,
    moneyHistory:   [],
    fatigueHistory: [],
    events:         [],
  };
}

// ── Хелперы движка ────────────────────────────────────
const hasRole   = (g, role) => g.staff.some(s => s.role === role);
const getQ      = (g)       => g.staff.reduce((s, x) => s + (x.quality    || 0), 0);
const getV      = (g)       => g.staff.reduce((s, x) => s + (x.volume     || 0), 0);
const getThr    = (g)       => 10 + g.staff.reduce((s, x) => s + (x.throughput || 0), 0);
const getSpd    = (g)       => 1.0 + g.staff.reduce((s, x) => s + (x.speedBonus || 0), 0);
const getCap    = (g)       => 2 + g.staff.filter(s => s.role === 'manager').reduce((s, m) => s + (m.capacity || 0), 0);
const getSalary = (g)       => g.staff.reduce((s, x) => s + x.cost, 0);
// payment_delay_fixed: нагрузки нет пока идёт период ожидания (monthsSigned <= modVal)
const getLoad   = (g)       => g.active.filter(c => !c.oneTime).reduce((s, c) => {
  if (c.modifier === 'payment_delay_fixed' && c.monthsSigned <= (c.modVal || 0)) return s;
  return s + (TIER_LOAD[c.tier] || 7);
}, 0);
const getFatMul = (g)       => { const f = g.teamFatigue; return f >= 85 ? 0.70 : f >= 60 ? 0.85 : f >= 30 ? 0.95 : 1.0; };
// +0.4% выручки за каждый балл портфолио, cap +20% при 50 баллах (engine.js getPortfolioMultiplier)
const getPortMult = (g)     => 1 + Math.min((g.portfolio || 0) * 0.004, 0.20);

function genBudget(p) {
  if (p.fixedBudget) {
    const [lo, hi] = p.fixedBudget;
    return Math.round(rndRange(lo, hi) / 1000) * 1000;
  }
  const [lo, hi] = BUDGET_RANGES[p.tier] || BUDGET_RANGES[1];
  return Math.round(rndRange(lo, hi) / 5000) * 5000;
}

// ── advanceMonth ──────────────────────────────────────
function advanceMonth(g) {
  // Кулдауны
  if (g.oneTimeCooldown > 0) g.oneTimeCooldown--;
  Object.keys(g.fatigueCd).forEach(k => { if (g.fatigueCd[k] > 0) g.fatigueCd[k]--; });

  // Инкремент счётчика месяцев ДО расчёта нагрузки (как в engine.js)
  g.active.filter(c => !c.oneTime).forEach(c => c.monthsSigned++);

  const thr     = getThr(g);
  const load    = getLoad(g);   // теперь использует актуальный monthsSigned
  const loadPct = thr > 0 ? load / thr : 0;

  // Усталость — delta (engine.js logic)
  let fd = loadPct >= 1.0 ? 10 : loadPct >= 0.85 ? 4 : loadPct >= 0.70 ? 1 : -8;
  const hrSr = g.staff.some(s => s.id === 'hr_sr');
  const hrMd = g.staff.some(s => s.id === 'hr');
  const hrJr = g.staff.some(s => s.id === 'hr_jr');
  if (fd > 0) {
    if      (hrSr) fd = Math.round(fd * 0.55);
    else if (hrMd) fd = Math.round(fd * 0.70);
    else if (hrJr) fd = Math.round(fd * 0.80);
  }
  if (hrSr) fd -= 2; // пассивное восстановление от HR Sr
  g.teamFatigue = clamp(g.teamFatigue + fd, 0, 100);

  const fatMul = getFatMul(g);
  const spdMul = getSpd(g);
  // v0.31: overloadPenalty от ПОЛНОЙ нагрузки (не от фокус-взвешенной)
  const overloadPenalty = load > 0 ? Math.min(1, thr / load) : 1;

  // Прогресс проектов — равный фокус (1/N) × overloadPenalty × fatigue × speed
  // payment_delay_fixed исключены пока идёт период ожидания (engine.js v0.31)
  const focusActive = g.active.filter(c =>
    !c.oneTime &&
    !(c.modifier === 'payment_delay_fixed' && c.monthsSigned <= (c.modVal || 0))
  );
  const N          = focusActive.length;
  const equalFocus = N > 0 ? 1 / N : 1;

  focusActive.forEach(c => {
    const dur  = c.duration || TIER_DUR[c.tier] || 3;
    const prog = (100 / dur) * overloadPenalty * equalFocus * fatMul * spdMul;
    c.progress = Math.min(100, Math.round((c.progress + prog) * 100) / 100);
  });

  // revenue_growth: бюджет растёт каждый месяц (упрощённый аналог compound-выплаты в engine.js)
  g.active.filter(c => c.modifier === 'revenue_growth').forEach(c => {
    const growth = Math.round(c.originalBudget * c.modVal / 5000) * 5000;
    c.budget += growth;
    c.originalBudget += growth;
  });

  // random_bonus: 30% шанс каждый месяц получить бонус от клиента (engine.js ⑤)
  g.active.filter(c => c.modifier === 'random_bonus').forEach(c => {
    if (Math.random() < 0.30) {
      g.money += c.modVal || 0;
      g.events.push(`M${g.month + 1}: бонус +${Math.round((c.modVal || 0) / 1000)}K от «${c.id}»`);
    }
  });

  // Milestone-выплаты: payment_delay_fixed пропускает до истечения задержки
  g.active.filter(c => !c.oneTime).forEach(c => {
    if (c.modifier === 'payment_delay_fixed' && c.monthsSigned <= (c.modVal || 0)) return;
    (c.milestones || []).forEach((thr, idx) => {
      if (c.progress >= thr && !(c.milestonesPaid || []).includes(idx)) {
        const payout = Math.round((c.originalBudget || c.budget) * c.milestonePcts[idx] / 5000) * 5000;
        c.budget = Math.max(0, c.budget - payout);
        g.money += payout;
        c.milestonesPaid.push(idx);
      }
    });
  });

  // nps_penalty: штраф если команда перегружена (proxy для падения NPS)
  g.active.filter(c => c.modifier === 'nps_penalty').forEach(c => {
    if (loadPct >= 0.90) {
      g.money -= c.modVal;
      g.events.push(`M${g.month + 1}: NPS-штраф «${c.id}» −${Math.round(c.modVal / 1000)}K (перегруз)`);
    }
  });

  // Уход сотрудника при выгорании
  if (g.teamFatigue >= 60 && g.staff.length > 0) {
    const quitChance = g.teamFatigue >= 85 ? 0.20 : 0.10;
    const idx = g.staff.findIndex(() => Math.random() < quitChance);
    if (idx >= 0) {
      const quitter = g.staff.splice(idx, 1)[0];
      g.events.push(`M${g.month + 1}: ${quitter.id} уволился (усталость ${Math.round(g.teamFatigue)})`);
    }
  }

  // Расходы
  g.money -= OVERHEAD + getSalary(g);
  g.month++;

  // Репутация — дрейф от усталости
  if (g.teamFatigue >= 30) g.reputation = clamp(g.reputation - 1, 0, 100);

  g.moneyHistory.push(g.money);
  g.fatigueHistory.push(g.teamFatigue);

  if (g.money < 0) {
    g.bankrupt  = true;
    g.bankMonth = g.month;
  }
}

// ── signProject ───────────────────────────────────────
function signProject(g, p) {
  if (!p.oneTime && g.active.length >= getCap(g)) return false;
  if (p.oneTime && p.cooldown && g.oneTimeCooldown > 0) return false;

  const budget = genBudget(p);

  // Репутационный штраф при подписании (серая зона)
  if (p.modifier === 'reputation') {
    g.reputation = clamp(g.reputation + p.modVal, 0, 100);
    g.events.push(`M${g.month + 1}: репутация ${p.modVal} (${p.id})`);
  }

  if (p.oneTime) {
    g.money += budget;
    if (p.cooldown) g.oneTimeCooldown = p.cooldown;
    // engine.js oneTime: pfBonus = (portfolioWeight || tier) * 2
    g.portfolio += (p.portfolioWeight || p.tier) * 2;
    g.completedCount++;
    return true;
  }

  // Предоплата (25% шанс, 30% бюджета)
  let prepaid = 0;
  if (Math.random() < 0.25) {
    prepaid = Math.round(budget * 0.30 / 5000) * 5000;
    g.money += prepaid;
  }

  // Milestone-выплаты: T2 → [50%]=30%, T3/T4 → [33%,66%]=25%+25%
  const mThresholds = p.tier >= 3 ? [33, 66] : p.tier === 2 ? [50] : [];
  const mPcts       = p.tier >= 3 ? [0.25, 0.25] : p.tier === 2 ? [0.30] : [];

  g.active.push({
    id:              p.id,
    tier:            p.tier,
    portfolioWeight: p.portfolioWeight || null,
    originalBudget:  budget,
    budget:          budget - prepaid,
    prepaid,
    progress:        0,
    monthsSigned:    0,
    duration:        p.duration || TIER_DUR[p.tier] || 3,
    modifier:        p.modifier  || null,
    modVal:          p.modVal    || 0,
    modThreshold:    p.modThreshold || 0,
    milestones:      mThresholds,
    milestonePcts:   mPcts,
    milestonesPaid:  [],
  });
  return true;
}

// ── completeProject ───────────────────────────────────
function completeProject(g, c) {
  const overdue      = Math.max(0, c.monthsSigned - c.duration);
  const penaltyMult  = Math.max(0.60, 1 - overdue * 0.10);
  let payout         = Math.round(c.budget * penaltyMult);
  // Портфолио-мультипликатор: +0.4%/балл, cap +20% при 50 баллах (engine.js getPortfolioMultiplier)
  payout             = Math.round(payout * getPortMult(g));
  g.money           += payout;
  // engine.js: pfBonus = (portfolioWeight || tier) * 3
  g.portfolio       += (c.portfolioWeight || c.tier) * 3;
  g.completedCount++;
  g.active           = g.active.filter(x => x !== c);
  return payout;
}

// ── hire ──────────────────────────────────────────────
function hire(g, staffId) {
  const def = STAFF.find(s => s.id === staffId);
  if (!def)                                        return false;
  if (def.unlockRep && g.reputation < def.unlockRep) return false;
  if (g.teamFatigue >= 85)                         return false; // кризис блокирует найм
  if (g.money < def.cost * 2)                      return false; // нужен запас на 2 мес.
  g.staff.push({ ...def, _iid: Math.random() });
  return true;
}

// ── useFatigueRecovery ────────────────────────────────
function useFatigueRecovery(g, toolId) {
  const tools = {
    paid_leave:    { cost:12000, reduce:12, cd:1, minFatigue:0  },
    teambuilding:  { cost:28000, reduce:22, cd:2, minFatigue:0  },
    corp_vacation: { cost:55000, reduce:38, cd:3, minFatigue:40 },
  };
  const t = tools[toolId];
  if (!t)                                    return false;
  if ((g.fatigueCd[toolId] || 0) > 0)        return false;
  if (t.minFatigue && g.teamFatigue < t.minFatigue) return false;
  if (g.money < t.cost)                      return false;
  g.money      -= t.cost;
  g.teamFatigue = clamp(g.teamFatigue - t.reduce, 0, 100);
  g.fatigueCd[toolId] = t.cd;
  return true;
}

// ── generateOffers ────────────────────────────────────
function generateOffers(g) {
  const Q   = getQ(g);
  const V   = getV(g);
  const hasDev = hasRole(g, 'developer');
  const maxTier = g.reputation >= 80 ? 4
                : g.reputation >= 70 ? 3
                : g.reputation >= 40 ? 2
                : 1;

  const eligible = PROJECTS.filter(p => {
    if (p.tier > maxTier)                                      return false;
    if ((p.minQ || 0) > Q)                                     return false;
    if ((p.minV || 0) > V)                                     return false;
    if (p.minRep && g.reputation < p.minRep)                   return false;
    if (p.requiresDev && !hasDev)                              return false;
    if (p.minPortfolio && g.portfolio < p.minPortfolio)        return false;
    if (p.oneTime && p.cooldown && g.oneTimeCooldown > 0)      return false;
    return Math.random() < (p.prob || 0.5);
  });

  return eligible.sort(() => Math.random() - 0.5).slice(0, 5);
}

// ══════════════════════════════════════════════════════
//  AI СТРАТЕГИИ
// ══════════════════════════════════════════════════════

// Lean — никакого штата, только oneTime + безопасные T1
function strategyLean(g, offers) {
  const Q = getQ(g), V = getV(g);

  if (g.teamFatigue >= 50) {
    useFatigueRecovery(g, 'paid_leave') || useFatigueRecovery(g, 'teambuilding');
  }

  const cap = getCap(g);
  for (const p of offers) {
    if (g.active.length >= cap && !p.oneTime) break;
    if (p.tier > 1 && !p.oneTime) continue;
    if ((p.minQ || 0) > Q || (p.minV || 0) > V) continue;
    signProject(g, p);
  }
}

// Balanced — дизайнер + копирайтер, T1–T2
function strategyBalanced(g, offers) {
  const Q = getQ(g), V = getV(g);

  if (g.teamFatigue >= 55) {
    useFatigueRecovery(g, 'teambuilding') || useFatigueRecovery(g, 'paid_leave');
  }
  if (g.teamFatigue >= 75) {
    useFatigueRecovery(g, 'corp_vacation') || useFatigueRecovery(g, 'teambuilding');
  }

  if (!hasRole(g, 'designer')   && g.money > 250000) hire(g, 'designer');
  if (Q >= 10 && !hasRole(g, 'copywriter') && g.money > 200000) hire(g, 'copywriter');
  if (g.active.length >= getCap(g) && !hasRole(g, 'manager') && g.money > 350000) hire(g, 'manager');

  const cap  = getCap(g);
  const thr  = getThr(g);
  const load = getLoad(g);
  for (const p of offers) {
    if (!p.oneTime && g.active.length >= cap) break;
    if (p.tier > 2 && !p.oneTime) continue;
    if ((p.minQ || 0) > Q || (p.minV || 0) > V) continue;
    const newLoad = p.oneTime ? load : load + (TIER_LOAD[p.tier] || 7);
    if (!p.oneTime && newLoad > thr * 1.25) continue;
    signProject(g, p);
  }
}

// Growth — 4 специалиста, T2–T3
function strategyGrowth(g, offers) {
  const Q = getQ(g), V = getV(g);

  if (g.teamFatigue >= 45) {
    useFatigueRecovery(g, 'corp_vacation') ||
    useFatigueRecovery(g, 'teambuilding')  ||
    useFatigueRecovery(g, 'paid_leave');
  }

  if (!hasRole(g, 'designer')   && g.money > 200000)             hire(g, 'designer');
  if (!hasRole(g, 'copywriter') && g.money > 180000)             hire(g, 'copywriter');
  if (!hasRole(g, 'manager')    && g.money > 300000)             hire(g, 'manager');
  if (!hasRole(g, 'developer')  && Q >= 15 && g.money > 400000)  hire(g, 'developer');
  if (!g.staff.some(s => s.id === 'designer_sr') && g.reputation >= 70 && g.money > 500000) hire(g, 'designer_sr');

  const cap  = getCap(g);
  const thr  = getThr(g);
  const load = getLoad(g);
  for (const p of offers) {
    if (!p.oneTime && g.active.length >= cap) break;
    if ((p.minQ || 0) > Q || (p.minV || 0) > V) continue;
    const newLoad = p.oneTime ? load : load + (TIER_LOAD[p.tier] || 7);
    if (!p.oneTime && newLoad > thr * 1.35) continue;
    signProject(g, p);
  }
}

// Aggressive — Developer + T3 с первых возможностей
function strategyAggressive(g, offers) {
  const Q = getQ(g), V = getV(g);

  if (g.teamFatigue >= 40) {
    useFatigueRecovery(g, 'corp_vacation') ||
    useFatigueRecovery(g, 'teambuilding');
  }

  // Нанимаем быстро и широко
  if (!hasRole(g, 'designer')   && g.money > 150000)             hire(g, 'designer');
  if (!hasRole(g, 'copywriter') && g.money > 130000)             hire(g, 'copywriter');
  if (!hasRole(g, 'manager')    && g.money > 220000)             hire(g, 'manager');
  if (!hasRole(g, 'developer')  && Q >= 10 && g.money > 280000)  hire(g, 'developer');
  if (!hasRole(g, 'smm')        && V >= 10 && g.money > 250000)  hire(g, 'smm');
  if (!hasRole(g, 'hr_jr')      && g.staff.length >= 3 && g.money > 200000) hire(g, 'hr_jr');

  const cap  = getCap(g);
  const thr  = getThr(g);
  const load = getLoad(g);
  for (const p of offers) {
    if (!p.oneTime && g.active.length >= cap) break;
    if ((p.minQ || 0) > Q || (p.minV || 0) > V) continue;
    // Избегаем серую зону — репутация нужна для T3/T4
    if (p.modifier === 'reputation') continue;
    const newLoad = p.oneTime ? load : load + (TIER_LOAD[p.tier] || 7);
    if (!p.oneTime && newLoad > thr * 1.40) continue;
    signProject(g, p);
  }
}

// ══════════════════════════════════════════════════════
//  RUNNER
// ══════════════════════════════════════════════════════
function runGame(strategyName) {
  const g      = makeState();
  const stratFn = strategyName === 'lean'       ? strategyLean
                : strategyName === 'growth'     ? strategyGrowth
                : strategyName === 'aggressive' ? strategyAggressive
                : strategyBalanced;

  for (let m = 0; m < MAX_MONTHS && !g.bankrupt; m++) {
    // Завершаем готовые проекты
    [...g.active].forEach(c => {
      if (c.progress >= 100) completeProject(g, c);
    });

    const offers = generateOffers(g);
    stratFn(g, offers);
    advanceMonth(g);
  }

  const peaked     = g.moneyHistory.length ? Math.max(...g.moneyHistory) : g.money;
  const minMoney   = g.moneyHistory.length ? Math.min(...g.moneyHistory) : g.money;
  const avgFatigue = g.fatigueHistory.length
    ? Math.round(g.fatigueHistory.reduce((s, v) => s + v, 0) / g.fatigueHistory.length)
    : 0;
  const maxFatigue = g.fatigueHistory.length ? Math.max(...g.fatigueHistory) : 0;

  return {
    strategy:    strategyName,
    survived:    !g.bankrupt,
    months:      g.month,
    bankMonth:   g.bankMonth,
    finalMoney:  Math.round(g.money),
    peakMoney:   Math.round(peaked),
    minMoney:    Math.round(minMoney),
    staffCount:  g.staff.length,
    completed:   g.completedCount,
    portfolio:   g.portfolio,
    reputation:  Math.round(g.reputation),
    avgFatigue,
    maxFatigue,
    events:      g.events,
  };
}

// ══════════════════════════════════════════════════════
//  ЗАПУСК И ОТЧЁТ
// ══════════════════════════════════════════════════════
const strategies = [
  'lean', 'lean', 'lean',
  'balanced', 'balanced', 'balanced',
  'growth', 'growth',
  'aggressive', 'aggressive',
];

const results = strategies.map((s, i) => ({ run: i + 1, ...runGame(s) }));

const fmtK = n => {
  if (Math.abs(n) >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  return `${Math.round(n / 1000)}K`;
};

console.log('\n════════════════════════════════════════════════════════════════════════════════');
console.log('  BizTycoon v0.31 — Balance Simulation (10 runs, MAX 36 months, synced 2026-06-01)');
console.log('════════════════════════════════════════════════════════════════════════════════');
console.log(`${'#'.padEnd(3)} ${'Strategy'.padEnd(11)} ${'Result'.padEnd(16)} ${'Final'.padStart(7)} ${'Peak'.padStart(7)} ${'Min'.padStart(7)} ${'Done'.padStart(5)} ${'Stf'.padStart(4)} ${'Rep'.padStart(4)} ${'Port'.padStart(5)} ${'AvgFt'.padStart(6)} ${'MaxFt'.padStart(6)}`);
console.log('─'.repeat(98));

results.forEach(r => {
  const result = r.survived ? `✅ Выжил M${r.months}` : `💀 Банкрот M${r.bankMonth}`;
  console.log(
    `${String(r.run).padEnd(3)} ${r.strategy.padEnd(11)} ${result.padEnd(16)} ` +
    `${fmtK(r.finalMoney).padStart(7)} ${fmtK(r.peakMoney).padStart(7)} ${fmtK(r.minMoney).padStart(7)} ` +
    `${String(r.completed).padStart(5)} ${String(r.staffCount).padStart(4)} ` +
    `${String(r.reputation).padStart(4)} ${String(r.portfolio).padStart(5)} ` +
    `${String(r.avgFatigue).padStart(6)} ${String(r.maxFatigue).padStart(6)}`
  );
  if (r.events.length > 0) {
    r.events.slice(0, 3).forEach(e => console.log(`   ↳ ${e}`));
    if (r.events.length > 3) console.log(`   ↳ ... ещё ${r.events.length - 3} событий`);
  }
});

console.log('─'.repeat(98));

// Сводка по стратегиям
['lean', 'balanced', 'growth', 'aggressive'].forEach(strat => {
  const runs     = results.filter(r => r.strategy === strat);
  if (!runs.length) return;
  const survived = runs.filter(r => r.survived);
  const avgFinal = Math.round(runs.reduce((s, r) => s + r.finalMoney, 0) / runs.length);
  const avgFt    = Math.round(runs.reduce((s, r) => s + r.avgFatigue, 0) / runs.length);
  const avgDone  = (runs.reduce((s, r) => s + r.completed, 0) / runs.length).toFixed(1);
  const avgPort  = Math.round(runs.reduce((s, r) => s + r.portfolio, 0) / runs.length);
  console.log(
    `  ${strat.padEnd(11)} Выжив: ${survived.length}/${runs.length} · ` +
    `Ср.баланс: ${fmtK(avgFinal)} · Усталость: ${avgFt} · ` +
    `Проектов: ${avgDone} · Портфолио: ${avgPort}`
  );
});

console.log('════════════════════════════════════════════════════════════════════════════════\n');

// Аналитика
const allSurvived = results.filter(r => r.survived).length;
console.log(`📋 Аналитика:`);
console.log(`  Выживаемость: ${allSurvived}/${strategies.length} (${Math.round(allSurvived / strategies.length * 100)}%)`);

const bankrupt = results.filter(r => !r.survived);
if (bankrupt.length > 0) {
  const avgBankMonth = Math.round(bankrupt.reduce((s, r) => s + r.bankMonth, 0) / bankrupt.length);
  console.log(`  Среднее банкротство: M${avgBankMonth}`);
}

const crisisGames = results.filter(r => r.maxFatigue >= 85);
if (crisisGames.length > 0) {
  console.log(`  Кризис усталости (≥85): ${crisisGames.length}/${strategies.length} игр`);
}

const highFinal = results.filter(r => r.finalMoney > 1000000);
console.log(`  Финальный баланс >1M: ${highFinal.length}/${strategies.length} игр`);

const t4Games = results.filter(r => r.portfolio >= 20);
if (t4Games.length > 0) {
  console.log(`  Доступ к T4 (portfolio≥20): ${t4Games.length}/${strategies.length} игр`);
}
console.log('');
