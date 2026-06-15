'use strict';
// ══════════════════════════════════════════════════════════════════════
//  Тест модуля «Живой рынок» (src/livingmarket.js, v0.1)
//
//  Проверяем:
//   - модуль грузится, API доступно (LivingMarket.*)
//   - LIVING_MARKET_ENABLED=false → модуль не активируется
//   - 6 стадий (3 живые + 3 требуют рынка)
//   - startGame инициализирует G.living + подменяет winCondition на Infinity
//   - оригинальный winCondition сохраняется в G.living.originalWinCondition
//   - engine.advanceMonth НЕ триггерит end_game{won:true} при больших деньгах
//   - переход Гараж→Студия по достижению гейта (3 сдачи + штат 2 + 2M)
//   - переход Студия→Агентство по гейту
//   - стадия не теряется при повторных вызовах _tickStages
//   - стадии 4–6 заблокированы requiresMarket
//   - майлстоуны срабатывают по cond + пишутся в journal + не дублируются
//   - обёртки идемпотентны (повторный load не дублирует wrap)
// ══════════════════════════════════════════════════════════════════════

const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

const ROOT = path.join(__dirname, '..');

function makeClassList() {
  const set = new Set();
  return { add: c => set.add(c), remove: c => set.delete(c), toggle: c => set.has(c)?set.delete(c):set.add(c), contains: c => set.has(c) };
}
function makeEl(id) {
  const el = {
    id: id||'', textContent:'', value:'', className:'', title:'', style:{}, dataset:{}, children:[], disabled:false, onclick:null, parentElement:null,
    appendChild(c){ this.children.push(c); c.parentElement=this; return c; },
    removeChild(c){ this.children = this.children.filter(x=>x!==c); c.parentElement=null; },
    remove(){}, insertBefore(c){ this.children.push(c); c.parentElement=this; return c; },
    setAttribute(){}, getAttribute(){return null;}, removeAttribute(){},
    addEventListener(){}, removeEventListener(){},
    querySelector(){return makeEl();}, querySelectorAll(){return [];},
    closest(){return null;}, focus(){}, blur(){}, click(){if(this.onclick)this.onclick();},
    getBoundingClientRect(){return{top:0,left:0,width:0,height:0};}, scrollIntoView(){},
  };
  el.classList = makeClassList();
  let _html='';
  Object.defineProperty(el,'innerHTML',{get(){return _html;},set(v){_html=v;el.children.length=0;}});
  return el;
}
const REGISTRY = new Map();
const byId = id => { if (!REGISTRY.has(id)) REGISTRY.set(id, makeEl(id)); return REGISTRY.get(id); };
const fakeDocument = {
  getElementById: byId,
  createElement: () => makeEl(),
  querySelector(sel){ if (sel === '.game-header .game-logo') return byId('__game-logo'); return makeEl(); },
  querySelectorAll: () => [],
  body: makeEl('body'),
  addEventListener(){}, removeEventListener(){},
};

function makeSandbox(opts) {
  opts = opts || {};
  REGISTRY.clear();
  const _fakeLS = {};
  if (!opts.noRoguelite) _fakeLS['bt_enabled_dlcs_v1'] = JSON.stringify(['roguelite']);
  const sb = {
    console, Math, Date, JSON, Intl, setTimeout, clearTimeout,
    document: fakeDocument,
    localStorage: {
      getItem(k){ return Object.prototype.hasOwnProperty.call(_fakeLS,k) ? _fakeLS[k] : null; },
      setItem(k,v){ _fakeLS[k] = String(v); },
      removeItem(k){ delete _fakeLS[k]; },
    },
    navigator: {},
    renderPortfolioTab(){},
    __TR: { pass: 0, fail: 0, log: [] },
  };
  sb.window = sb; sb.globalThis = sb;
  return sb;
}

function loadSrc(opts) {
  opts = opts || {};
  const FILES = [
    'src/constants.js', 'src/events.js',
    'scenarios/agency.data.js', 'src/scenario-loader.js',
    'src/engine.js', 'src/projects.js', 'src/staff.js',
  ];
  let src = FILES.map(f => '// ===== '+f+' =====\n'+fs.readFileSync(path.join(ROOT,f),'utf8')).join('\n;\n');
  let lm = fs.readFileSync(path.join(ROOT, 'src/livingmarket.js'), 'utf8');
  if (opts.killSwitch) lm = lm.replace('const LIVING_MARKET_ENABLED = true;', 'const LIVING_MARKET_ENABLED = false;');
  src += '\n;\n// ===== src/livingmarket.js =====\n' + lm;
  return src;
}

const HARNESS = String.raw`
function _ok(c, m) { if (c) { __TR.pass++; __TR.log.push('✅ ' + m); } else { __TR.fail++; __TR.log.push('❌ ' + m); } }
function _eq(a, b, m) { _ok(a === b, m + ' (' + JSON.stringify(a) + ' === ' + JSON.stringify(b) + ')'); }
`;

function run(name, body, opts) {
  const sb = makeSandbox(opts || {});
  const src = loadSrc(opts || {}) + '\n;\n' + HARNESS + '\n;\n' + body;
  vm.createContext(sb);
  try { vm.runInContext(src, sb); }
  catch (e) { console.log('💥 ['+name+']:', e.message); sb.__TR.fail++; }
  console.log('── ' + name + ' ──');
  sb.__TR.log.forEach(l => console.log(l));
  return sb.__TR;
}

const totals = { pass: 0, fail: 0 };
function add(r) { totals.pass += r.pass; totals.fail += r.fail; }

// ── 1: модуль грузится, API доступно ──
add(run('Тест 1: API LivingMarket доступно', `
_ok(typeof LivingMarket === 'object', 'window.LivingMarket объявлен');
_eq(LivingMarket.enabled, true, 'LivingMarket.enabled = true');
_ok(typeof LivingMarket.getStages === 'function', 'getStages есть');
_ok(typeof LivingMarket.getCurrentStage === 'function', 'getCurrentStage есть');
_ok(typeof LivingMarket.getNextStage === 'function', 'getNextStage есть');
_ok(typeof LivingMarket.showJournalModal === 'function', 'showJournalModal есть');
_ok(typeof LivingMarket.getMilestones === 'function', 'getMilestones есть');
const stages = LivingMarket.getStages();
_eq(stages.length, 6, '6 стадий');
_eq(stages[0].id, 'garage', 'первая = garage');
_eq(stages[5].id, 'empire', 'последняя = empire');
_ok(stages[3].requiresMarket && stages[4].requiresMarket && stages[5].requiresMarket, 'стадии 4–6 requiresMarket');
_ok(!stages[0].requiresMarket && !stages[1].requiresMarket && !stages[2].requiresMarket, 'стадии 1–3 живые (без requiresMarket)');
`));

// ── 2: LIVING_MARKET_ENABLED=false → модуль не активируется ──
add(run('Тест 2: kill-switch — модуль не регистрирует API', `
_ok(typeof LivingMarket === 'undefined', 'window.LivingMarket НЕ объявлен');
`, { killSwitch: true }));

// ── 3: startGame подменяет winCondition на Infinity ──
add(run('Тест 3: startGame → SCENARIO.settings.winCondition = Infinity', `
const origWin = SCENARIO.settings.winCondition;
_ok(origWin > 0 && origWin < Infinity, 'до startGame winCondition конечен (' + origWin + ')');
initState(); selectSpec('smm'); startGame();
_eq(SCENARIO.settings.winCondition, Infinity, 'после startGame winCondition = Infinity');
_eq(G.living.originalWinCondition, origWin, 'оригинал сохранён в G.living.originalWinCondition');
`));

// ── 4: G.living инициализирован дефолтами ──
add(run('Тест 4: G.living создан с дефолтами', `
initState(); selectSpec('smm'); startGame();
_ok(G.living, 'G.living существует');
_eq(G.living.stage, 0, 'стартовая стадия = 0 (garage)');
_ok(Array.isArray(G.living.journal), 'journal — массив');
_ok(Array.isArray(G.living.milestonesFired), 'milestonesFired — массив');
`));

// ── 5: engine.advanceMonth при больших деньгах НЕ триггерит win ──
add(run('Тест 5: engine не выдаёт win при money >= оригинальной цели', `
let endGameSeen = false;
EventBus.on('end_game', () => { endGameSeen = true; });
initState(); selectSpec('smm'); startGame();
// Накручиваем деньги выше оригинального winCondition
G.money = 50000000;
advanceMonth();
_ok(!endGameSeen, 'end_game не выстрелил (winCondition подменён на Infinity)');
`));

// ── 6: переход Гараж→Студия по достижению всех условий гейта ──
add(run('Тест 6: гейт студии — 3 сдачи + штат 2 + 2M накопл. выручки', `
initState(); selectSpec('smm'); startGame();
_eq(G.living.stage, 0, 'стартуем с гаража');
// Накопленная выручка через completedProjects
G.completedProjects = [
  { id:'p1', revenue: 700000, tier:1 },
  { id:'p2', revenue: 800000, tier:1 },
  { id:'p3', revenue: 600000, tier:1 },
];
G.staff = [{ id:'s1' }, { id:'s2' }];
G.month = 5;
advanceMonth();
_eq(G.living.stage, 1, 'после гейта Studio: stage=1');
_ok(G.living.journal.some(j => j.id === 'stage_studio'), 'журнал содержит stage_studio');
`));

// ── 7: гейт студии — частичное выполнение не двигает стадию ──
add(run('Тест 7: 2 сдачи + штат 2 + 2M НЕ переводит на студию (нужно ровно 3 сдачи)', `
initState(); selectSpec('smm'); startGame();
G.completedProjects = [
  { id:'p1', revenue: 1000000, tier:1 },
  { id:'p2', revenue: 1200000, tier:1 },
];
G.staff = [{ id:'s1' }, { id:'s2' }];
advanceMonth();
_eq(G.living.stage, 0, 'стадия не двигается (только 2 сдачи из 3)');
`));

// ── 8: переход Студия→Агентство тоже работает ──
add(run('Тест 8: гейт агентства — 10 сдач + штат 5 + rep 75 + 15M', `
initState(); selectSpec('smm'); startGame();
G.completedProjects = [];
for (let i = 0; i < 10; i++) {
  G.completedProjects.push({ id:'p'+i, revenue: 1600000, tier:2 });
}
G.staff = [{},{},{},{},{}];
G.reputation = 80;
advanceMonth();
_ok(G.living.stage >= 2, 'стадия дошла до агентства (' + G.living.stage + ')');
_ok(G.living.journal.some(j => j.id === 'stage_studio'),  'журнал: stage_studio');
_ok(G.living.journal.some(j => j.id === 'stage_agency'), 'журнал: stage_agency');
`));

// ── 9: стадия не теряется при повторном advanceMonth ──
add(run('Тест 9: достигнутая стадия не откатывается даже если условия больше не выполнены', `
initState(); selectSpec('smm'); startGame();
// Достигаем студию
G.completedProjects = [
  { id:'p1', revenue: 700000 },
  { id:'p2', revenue: 800000 },
  { id:'p3', revenue: 700000 },
];
G.staff = [{}, {}];
advanceMonth();
_eq(G.living.stage, 1, 'студия достигнута');
// Удаляем команду — стадия должна остаться
G.staff = [];
advanceMonth();
_eq(G.living.stage, 1, 'стадия не откатывается');
`));

// ── 10: стадии 4–6 не достигаются (requiresMarket) ──
add(run('Тест 10: даже при огромных числах стадии 4–6 не открываются', `
initState(); selectSpec('smm'); startGame();
G.completedProjects = [];
for (let i = 0; i < 200; i++) G.completedProjects.push({ id:'p'+i, revenue: 5000000 });
G.staff = [];
for (let i = 0; i < 50; i++) G.staff.push({ id:'s'+i });
G.reputation = 100;
G.portfolio = 200;
advanceMonth();
// Дойти можно до агентства (idx=2), но не до сети (idx=3)
_eq(G.living.stage, 2, 'стадия упёрлась в агентство (3 живых)');
`));

// ── 11: майлстоуны срабатывают по cond + пишутся в журнал ──
add(run('Тест 11: майлстоун first_delivery срабатывает после 1 сдачи', `
initState(); selectSpec('smm'); startGame();
const fired0 = G.living.milestonesFired.slice();
_ok(!fired0.includes('first_delivery'), 'до старта first_delivery не сработал');
G.completedProjects = [{ id:'p1', revenue: 200000 }];
advanceMonth();
_ok(G.living.milestonesFired.includes('first_delivery'), 'после 1 сдачи first_delivery в milestonesFired');
_ok(G.living.journal.some(j => j.id === 'first_delivery'), 'first_delivery в journal');
`));

// ── 12: майлстоун не дублируется при повторном advanceMonth ──
add(run('Тест 12: майлстоун one-shot — повтор не пишет дубль', `
initState(); selectSpec('smm'); startGame();
G.completedProjects = [{ id:'p1', revenue: 200000 }];
advanceMonth();
advanceMonth();
advanceMonth();
const count = G.living.journal.filter(j => j.id === 'first_delivery').length;
_eq(count, 1, 'first_delivery в journal ровно 1 раз');
`));

// ── 13: майлстоун original_win срабатывает при достижении старого порога ──
add(run('Тест 13: original_win срабатывает при money >= оригинального winCondition', `
initState(); selectSpec('smm'); startGame();
const orig = G.living.originalWinCondition;
_ok(orig > 0 && orig < Infinity, 'orig сохранён (' + orig + ')');
// Меньше порога — не срабатывает
G.money = orig - 1;
advanceMonth();
_ok(!G.living.milestonesFired.includes('original_win'), 'до порога — не сработал');
// Равно/больше — срабатывает
G.money = orig;
advanceMonth();
_ok(G.living.milestonesFired.includes('original_win'), 'после порога — сработал');
_ok(G.living.journal.some(j => j.id === 'original_win'), 'в journal');
`));

// ── 14: обёртки идемпотентны (флаг __livingMarketWrapped защищает) ──
add(run('Тест 14: обёртки advanceMonth/startGame идемпотентны', `
_ok(window.advanceMonth.__livingMarketWrapped === true, 'флаг на window.advanceMonth');
_ok(window.startGame.__livingMarketWrapped === true,    'флаг на window.startGame');
initState(); selectSpec('smm'); startGame();
G.completedProjects = [{ id:'p1', revenue: 200000 }];
advanceMonth();
const firstDelCount = G.living.journal.filter(x => x.id === 'first_delivery').length;
_eq(firstDelCount, 1, 'first_delivery в журнале ровно 1 раз');
`));

// ── 15: журнал доступен через getJournal() ──
add(run('Тест 15: API getJournal/getFiredMilestoneIds', `
initState(); selectSpec('smm'); startGame();
G.completedProjects = [{ id:'p1', revenue: 200000 }];
G.staff = [{}];
advanceMonth();
const j = LivingMarket.getJournal();
_ok(Array.isArray(j), 'getJournal вернул массив');
_ok(j.length >= 2, 'после первого месяца ≥ 2 записи (first_hire + first_delivery)');
const ids = LivingMarket.getFiredMilestoneIds();
_ok(ids.includes('first_delivery'), 'fired содержит first_delivery');
_ok(ids.includes('first_hire'),     'fired содержит first_hire');
`));

// ── 16: getCurrentStage / getNextStage ──
add(run('Тест 16: getCurrentStage и getNextStage отражают G.living.stage', `
initState(); selectSpec('smm'); startGame();
_eq(LivingMarket.getCurrentStage().id, 'garage', 'стартовая = garage');
_eq(LivingMarket.getNextStage().id,    'studio', 'следующая = studio');
G.completedProjects = [
  { id:'p1', revenue: 700000 }, { id:'p2', revenue: 800000 }, { id:'p3', revenue: 700000 },
];
G.staff = [{}, {}];
advanceMonth();
_eq(LivingMarket.getCurrentStage().id, 'studio', 'после гейта = studio');
_eq(LivingMarket.getNextStage().id,    'agency', 'следующая = agency');
`));

// ── 17: композитный гейт — все условия должны быть выполнены ──
add(run('Тест 17: композитный гейт — каждое условие критично', `
const stage1 = LivingMarket.getStages()[1]; // studio
// Конструируем фейковый G с разными комбинациями
const make = (dels, staff, rev) => ({
  completedProjects: Array.from({length: dels}, (_, i) => ({ id:'p'+i, revenue: rev/Math.max(dels,1) })),
  staff: Array.from({length: staff}, (_, i) => ({ id:'s'+i })),
});
_ok(!stage1.gate(make(2, 2, 2000000)).ok, '2/3 сдач → !ok');
_ok(!stage1.gate(make(3, 1, 2000000)).ok, '1/2 штат → !ok');
_ok(!stage1.gate(make(3, 2, 1900000)).ok, '1.9M выручки → !ok');
_ok( stage1.gate(make(3, 2, 2000000)).ok, '3+2+2M → ok');
_ok( stage1.gate(make(5, 5, 5000000)).ok, 'все с запасом → ok');
`));

// ══════════════════════════════════════════════════════════════════════
//   v0.2 (Фаза B, шаг 1) — Древо 2.0 + ★XP
// ══════════════════════════════════════════════════════════════════════

// ── 18: API древа доступно ──
add(run('Тест 18: API древа 2.0 + XP', `
_ok(typeof LivingMarket.getXp === 'function', 'getXp есть');
_ok(typeof LivingMarket.getTreeNodes === 'function', 'getTreeNodes есть');
_ok(typeof LivingMarket.getTreeBranches === 'function', 'getTreeBranches есть');
_ok(typeof LivingMarket.isNodeUnlocked === 'function', 'isNodeUnlocked есть');
_ok(typeof LivingMarket.canPurchaseNode === 'function', 'canPurchaseNode есть');
_ok(typeof LivingMarket.purchaseTreeNode === 'function', 'purchaseTreeNode есть');
_ok(typeof LivingMarket.showTreeModal === 'function', 'showTreeModal есть');
_eq(LivingMarket.getTreeBranches().length, 5, '5 веток');
_eq(LivingMarket.getTreeNodes().length, 30, '30 узлов (5×5 + 5 альтернативных tier 4b)');
const branchIds = LivingMarket.getTreeBranches().map(b => b.id);
['craft','production','people','market','deals'].forEach(id => {
  _ok(branchIds.includes(id), 'ветка ' + id);
});
`));

// ── 19: tier-гейты по стадии ──
add(run('Тест 19: tier 1-2 открыты со старта, tier 3 — со стадии Студия', `
initState(); selectSpec('smm'); startGame();
_eq(G.living.stage, 0, 'стартовая стадия = гараж');
// Tier 1 — открыт
_ok(LivingMarket.isNodeUnlocked('craft1'), 'craft1 (tier 1) открыт');
_ok(LivingMarket.isNodeUnlocked('prod1'),  'prod1 (tier 1) открыт');
// Tier 2 — тоже открыт со старта
_ok(LivingMarket.isNodeUnlocked('craft2'), 'craft2 (tier 2) открыт');
// Tier 3 — заблокирован до Студии
_ok(!LivingMarket.isNodeUnlocked('craft3'), 'craft3 (tier 3) заблокирован на гараже');
// Tier 4 — до Агентства
_ok(!LivingMarket.isNodeUnlocked('craft4'), 'craft4 (tier 4) заблокирован на гараже');
// Tier 5 — всегда заблокирован (Фаза C)
_ok(!LivingMarket.isNodeUnlocked('craft5'), 'craft5 (tier 5) заблокирован — Фаза C');
`));

// ── 20: после достижения Студии открывается tier 3 ──
add(run('Тест 20: tier 3 узлы открываются на стадии Студия', `
initState(); selectSpec('smm'); startGame();
// Дотягиваем до Студии
G.completedProjects = [
  { id:'p1', revenue: 700000, tier: 1 },
  { id:'p2', revenue: 800000, tier: 1 },
  { id:'p3', revenue: 700000, tier: 1 },
];
G.staff = [{}, {}];
advanceMonth();
_eq(G.living.stage, 1, 'студия достигнута');
_ok(LivingMarket.isNodeUnlocked('craft3'), 'craft3 (tier 3) теперь открыт');
_ok(!LivingMarket.isNodeUnlocked('craft4'), 'craft4 (tier 4) пока заблокирован');
`));

// ── 21: XP начисляется за стадии (Студия = 300) ──
add(run('Тест 21: переход на стадию Студия начисляет 300 ★XP', `
initState(); selectSpec('smm'); startGame();
const xp0 = G.xp || 0;
G.completedProjects = [
  { id:'p1', revenue: 700000, tier: 1 },
  { id:'p2', revenue: 800000, tier: 1 },
  { id:'p3', revenue: 700000, tier: 1 },
];
G.staff = [{}, {}];
advanceMonth();
// Сдачи (3×10×tier 1=30) + милстоуны + стадия Студия (300)
_ok(G.xp >= 300, 'XP >= 300 после стадии (' + G.xp + ')');
_ok(G.living.xpEarned > 0, 'xpEarned > 0');
`));

// ── 22: XP за майлстоуны (15/40/120 по эшелонам) ──
add(run('Тест 22: майлстоуны дают XP по эшелонам', `
initState(); selectSpec('smm'); startGame();
const xp0 = G.xp || 0;
// Первая сдача — first_delivery (micro=15) + five_deliveries не сработает за 1 сдачу
G.completedProjects = [{ id:'p1', revenue: 200000, tier: 1 }];
advanceMonth();
// Прибавка >= 15 (first_delivery микро) + 10 за саму сдачу (tier 1 × 10)
const gain = (G.xp || 0) - xp0;
_ok(gain >= 25, 'gain >= 25 (15 first_delivery + 10 delivery) — фактически ' + gain);
`));

// ── 23: XP за сдачу зависит от tier (10×tier) ──
add(run('Тест 23: XP за сдачи = 10 × tier', `
initState(); selectSpec('smm'); startGame();
const xp0 = G.xp || 0;
// Подкидываем сдачу tier 3 → +30 XP
G.completedProjects = [{ id:'p1', revenue: 5000000, tier: 3 }];
advanceMonth();
const gain1 = (G.xp || 0) - xp0;
// 30 за сдачу + милстоун first_delivery (15) + first_million (15, money>=1M) — НЕ сработает, money всё равно низкий
// Точная сверка тяжела (зависит от triggered milestones), но >=30 проверяем
_ok(gain1 >= 30, 'tier 3 сдача даёт ≥30 XP (фактически ' + gain1 + ')');
`));

// ── 24: покупка узла tier 1 — успех ──
add(run('Тест 24: покупка craft1 (50 XP) списывает XP и применяет эффект', `
initState(); selectSpec('smm'); startGame();
// Накачиваем XP вручную через _awardXp (некоторые стартовые милстоуны могли
// уже выдать XP — first_million/reputation_50, — поэтому сверяем дельту).
LivingMarket._awardXp(100, 'dev');
const xpBefore = LivingMarket.getXp();
_ok(xpBefore >= 100, 'XP пополнен (' + xpBefore + ')');
const qBonusBefore = G.caseQBonus || 0;
const r = LivingMarket.purchaseTreeNode('craft1');
_ok(r.ok, 'purchase ok');
_eq(r.node.id, 'craft1', 'узел craft1');
_eq(LivingMarket.getXp(), xpBefore - 50, 'XP = before - 50');
_ok(LivingMarket.getPurchasedNodeIds().includes('craft1'), 'узел в purchased');
// Эффект применился: caseQBonus прибавил 2
_eq(G.caseQBonus, qBonusBefore + 2, 'caseQBonus +2 (эффект craft1)');
`));

// ── 25: повторная покупка — already_owned ──
add(run('Тест 25: вторая покупка того же узла — already_owned', `
initState(); selectSpec('smm'); startGame();
LivingMarket._awardXp(500, 'dev');
LivingMarket.purchaseTreeNode('craft1');
const r2 = LivingMarket.purchaseTreeNode('craft1');
_ok(!r2.ok, 'отказ');
_eq(r2.reason, 'already_owned', 'причина: already_owned');
`));

// ── 26: покупка заблокированного узла — locked ──
add(run('Тест 26: покупка tier 3 на гараже — locked', `
initState(); selectSpec('smm'); startGame();
LivingMarket._awardXp(1000, 'dev');
const r = LivingMarket.purchaseTreeNode('craft3');
_ok(!r.ok, 'отказ');
_eq(r.reason, 'locked', 'причина: locked');
`));

// ── 27: tier 5 заблокирован даже при огромной стадии и XP ──
add(run('Тест 27: tier 5 (Фаза C) недоступен даже с гипотетической стадией Сеть', `
initState(); selectSpec('smm'); startGame();
// Принудительно поднимем стадию (минуя гейт) и навалим XP
G.living.stage = 3;  // Сеть
LivingMarket._awardXp(5000, 'dev');
_ok(!LivingMarket.isNodeUnlocked('craft5'), 'craft5 (tier 5) НЕ открыт даже на стадии Сеть');
const r = LivingMarket.purchaseTreeNode('craft5');
_ok(!r.ok, 'отказ');
_eq(r.reason, 'locked', 'причина: locked');
`));

// ── 28: not_enough_xp ──
add(run('Тест 28: покупка без XP — not_enough_xp', `
initState(); selectSpec('smm'); startGame();
G.xp = 10;
const r = LivingMarket.purchaseTreeNode('craft1');
_ok(!r.ok, 'отказ');
_eq(r.reason, 'not_enough_xp', 'причина: not_enough_xp');
`));

// ── 29: эффекты узлов корректно мутируют G ──
add(run('Тест 29: эффекты узлов разных веток корректно применяются', `
initState(); selectSpec('smm'); startGame();
LivingMarket._awardXp(5000, 'dev');
// prod1: +0.05 к speedUpgrades
const speed0 = G.speedUpgrades || 0;
LivingMarket.purchaseTreeNode('prod1');
_ok(Math.abs((G.speedUpgrades || 0) - (speed0 + 0.05)) < 1e-9, 'speedUpgrades +0.05');
// peop1: scoutSalaryMult × 0.9
const m0 = G.scoutSalaryMult || 1;
LivingMarket.purchaseTreeNode('peop1');
_ok(Math.abs((G.scoutSalaryMult || 0) - (m0 * 0.9)) < 1e-9, 'scoutSalaryMult × 0.9');
// mark1: portfolio +5
const pf0 = G.portfolio || 0;
LivingMarket.purchaseTreeNode('mark1');
_eq(G.portfolio, pf0 + 5, 'portfolio +5');
// deal1: perkPayoutMult +0.05
const pm0 = G.perkPayoutMult || 0;
LivingMarket.purchaseTreeNode('deal1');
_ok(Math.abs((G.perkPayoutMult || 0) - (pm0 + 0.05)) < 1e-9, 'perkPayoutMult +0.05');
`));

// ── 30: журнал получает запись о покупке узла ──
add(run('Тест 30: покупка узла пишется в journal', `
initState(); selectSpec('smm'); startGame();
LivingMarket._awardXp(500, 'dev');
LivingMarket.purchaseTreeNode('craft1');
const j = LivingMarket.getJournal();
_ok(j.some(x => x.id === 'tree_craft1'), 'journal содержит tree_craft1');
`));

// ══════════════════════════════════════════════════════════════════════
//   v0.3 (Фаза B, шаг 4 + 5) — Эксклюзивные пары tier 4 + persistence
// ══════════════════════════════════════════════════════════════════════

// ── 31: 5 альтернативных узлов tier 4 в API ──
add(run('Тест 31: 5 пар tier 4 (a/b) с excludes', `
const nodes = LivingMarket.getTreeNodes();
const tier4 = nodes.filter(n => n.tier === 4);
_eq(tier4.length, 10, 'на tier 4 ровно 10 узлов (5 пар a/b)');
// Каждая пара должна указывать на пару взаимно
['craft','prod','peop','mark','deal'].forEach(prefix => {
  const a = nodes.find(n => n.id === prefix + '4');
  const b = nodes.find(n => n.id === prefix + '4b');
  _ok(!!a && !!b, prefix + '4 и ' + prefix + '4b существуют');
  _ok(a && (a.excludes || []).includes(prefix + '4b'), prefix + '4 excludes ' + prefix + '4b');
  _ok(b && (b.excludes || []).includes(prefix + '4'),  prefix + '4b excludes ' + prefix + '4');
});
`));

// ── 32: getConflictingTreeNodes двунаправленно ──
add(run('Тест 32: getConflictingTreeNodes — двунаправленный поиск', `
_ok(typeof LivingMarket.getConflictingTreeNodes === 'function', 'API getConflictingTreeNodes есть');
_ok(LivingMarket.getConflictingTreeNodes('craft4').includes('craft4b'), 'craft4 ↔ craft4b (direct)');
_ok(LivingMarket.getConflictingTreeNodes('craft4b').includes('craft4'), 'craft4b ↔ craft4 (inverse)');
_eq(LivingMarket.getConflictingTreeNodes('craft1').length, 0, 'tier 1 узлы без конфликтов');
_eq(LivingMarket.getConflictingTreeNodes('mark5').length, 0, 'tier 5 узлы без конфликтов');
_eq(LivingMarket.getConflictingTreeNodes('unknown_id').length, 0, 'unknown → []');
`));

// ── 33: покупка a блокирует b с reason excluded_by ──
add(run('Тест 33: покупка craft4 блокирует craft4b (excluded_by + blocker)', `
initState(); selectSpec('smm'); startGame();
// Двигаемся до Агентства (idx 2) — открывает tier 4
G.living.stage = 2;
LivingMarket._awardXp(2000, 'dev');
const r1 = LivingMarket.purchaseTreeNode('craft4');
_ok(r1.ok, 'craft4 куплен');
const r2 = LivingMarket.purchaseTreeNode('craft4b');
_ok(!r2.ok, 'craft4b отклонён');
_eq(r2.reason, 'excluded_by', 'reason = excluded_by');
_eq(r2.blocker, 'craft4', 'blocker = craft4');
`));

// ── 34: симметрия — покупка b блокирует a ──
add(run('Тест 34: покупка peop4b блокирует peop4 (inverse-direction)', `
initState(); selectSpec('smm'); startGame();
G.living.stage = 2;
LivingMarket._awardXp(2000, 'dev');
const r1 = LivingMarket.purchaseTreeNode('peop4b');
_ok(r1.ok, 'peop4b куплен');
const r2 = LivingMarket.purchaseTreeNode('peop4');
_ok(!r2.ok, 'peop4 отклонён');
_eq(r2.reason, 'excluded_by', 'reason = excluded_by');
_eq(r2.blocker, 'peop4b', 'blocker = peop4b');
`));

// ── 35: эффекты узлов tier 4b корректно применяются ──
add(run('Тест 35: эффекты 4b отличаются от 4a (стиль билда)', `
initState(); selectSpec('smm'); startGame();
G.living.stage = 2;
LivingMarket._awardXp(2000, 'dev');
// craft4b: Q+5, repBonus+1, portfolio+5
const q0 = G.caseQBonus || 0, rb0 = G.caseRepBonus || 0, pf0 = G.portfolio || 0;
LivingMarket.purchaseTreeNode('craft4b');
_eq(G.caseQBonus, q0 + 5, 'craft4b: Q +5');
_eq(G.caseRepBonus, rb0 + 1, 'craft4b: caseRepBonus +1');
_eq(G.portfolio, pf0 + 5, 'craft4b: portfolio +5');
`));

// ── 36 (шаг 5): persistence — purchased[] и эффекты переживают reload ──
// saves.js сохраняет G целиком. После _restore G.caseQBonus и G.living
// возвращаются к значениям на момент сохранения. Это значит, что эффекты
// tree 2.0 НЕ нужно переприменять после load — они уже в G. Проверяем
// этот контракт явно (если кто-то изменит сейв-логику — упадёт).
add(run('Тест 36: эффекты узла переживают save+restore G целиком', `
initState(); selectSpec('smm'); startGame();
LivingMarket._awardXp(200, 'dev');
LivingMarket.purchaseTreeNode('craft1');
const beforeQ        = G.caseQBonus;
const beforeXp       = G.xp;
const beforePurchase = LivingMarket.getPurchasedNodeIds().slice();
// Эмулируем save → restore: сериализуем G целиком (как делает saves.js),
// потом обнуляем G, потом восстанавливаем из снапшота.
const snap = JSON.parse(JSON.stringify(G));
// Полный reset движка
initState();
// «Восстановление» — копируем поля обратно (упрощённый _restore-проход)
Object.keys(snap).forEach(k => { G[k] = snap[k]; });
// После restore: caseQBonus сохранился, purchased[] сохранился
_eq(G.caseQBonus, beforeQ, 'caseQBonus сохранился после save+restore');
_eq(G.xp,        beforeXp, 'XP сохранился');
_eq(JSON.stringify(LivingMarket.getPurchasedNodeIds()), JSON.stringify(beforePurchase),
    'purchased[] сохранился');
// Повторная покупка того же узла блокируется after-restore
const r = LivingMarket.purchaseTreeNode('craft1');
_eq(r.reason, 'already_owned', 'after-restore: повторная покупка → already_owned');
`));

// ── 37: tier 5 узлы по-прежнему не имеют excludes (не парные) ──
add(run('Тест 37: tier 5 узлы — без excludes (Фаза C перерешит)', `
const tier5 = LivingMarket.getTreeNodes().filter(n => n.tier === 5);
_eq(tier5.length, 5, 'на tier 5 — 5 узлов');
tier5.forEach(n => {
  _ok(!n.excludes || n.excludes.length === 0, n.id + ' без excludes');
});
`));

// ══════════════════════════════════════════════════════════════════════
//   v0.4 (Фаза B, шаг 3) — Респец ветки
// ══════════════════════════════════════════════════════════════════════

// ── 38: API респека ──
add(run('Тест 38: API респека доступен', `
_ok(typeof LivingMarket.canRespecBranch === 'function', 'canRespecBranch есть');
_ok(typeof LivingMarket.respecBranch === 'function',    'respecBranch есть');
_ok(typeof LivingMarket.getRespecsUsed === 'function',  'getRespecsUsed есть');
_ok(typeof LivingMarket.getNodeDelta === 'function',    'getNodeDelta есть');
`));

// ── 39: canRespecBranch — no_nodes_owned до покупок ──
add(run('Тест 39: до покупок canRespecBranch → no_nodes_owned', `
initState(); selectSpec('smm'); startGame();
const r = LivingMarket.canRespecBranch('craft');
_ok(!r.ok, 'отказ');
_eq(r.reason, 'no_nodes_owned', 'reason = no_nodes_owned');
`));

// ── 40: респец возвращает XP и обнуляет numeric-каналы ──
add(run('Тест 40: respec возвращает XP и снимает numeric-эффект', `
initState(); selectSpec('smm'); startGame();
LivingMarket._awardXp(500, 'dev');
// Запомним baseline ПОСЛЕ startGame (там уже могли отстреляться милстоуны)
const qBase  = G.caseQBonus || 0;
const xpBase = G.xp;
LivingMarket.purchaseTreeNode('craft1');     // +2 caseQBonus, −50 XP
_eq(G.caseQBonus, qBase + 2, 'craft1 применился');
_eq(G.xp, xpBase - 50,        'XP списан');
// Сохранили delta
const d = LivingMarket.getNodeDelta('craft1');
_eq(d.caseQBonus, 2, 'delta содержит caseQBonus: 2');
// Респец
const r = LivingMarket.respecBranch('craft');
_ok(r.ok, 'respec ok');
_eq(r.refunded, 50, 'возвращено ★50');
_eq(G.caseQBonus, qBase, 'caseQBonus вернулся к baseline');
_eq(G.xp, xpBase,         'XP вернулся к pre-purchase значению');
_ok(!LivingMarket.getPurchasedNodeIds().includes('craft1'), 'craft1 убран из purchased');
`));

// ── 41: respec mul-канала: scoutSalaryMult делится обратно ──
add(run('Тест 41: respec корректно инвертирует mul-канал (scoutSalaryMult)', `
initState(); selectSpec('smm'); startGame();
LivingMarket._awardXp(500, 'dev');
const m0 = G.scoutSalaryMult || 1;
LivingMarket.purchaseTreeNode('peop1');    // scoutSalaryMult × 0.9
_ok(Math.abs((G.scoutSalaryMult || 1) - m0 * 0.9) < 1e-9, 'после покупки × 0.9');
LivingMarket.respecBranch('people');
_ok(Math.abs((G.scoutSalaryMult || 1) - m0) < 1e-9, 'после респека вернулось к baseline');
`));

// ── 42: лимит — один респец на ветку на стадию ──
add(run('Тест 42: повторный респец той же ветки на той же стадии → already_used_at_stage', `
initState(); selectSpec('smm'); startGame();
LivingMarket._awardXp(500, 'dev');
LivingMarket.purchaseTreeNode('craft1');
LivingMarket.respecBranch('craft');
// Купим ещё раз и попробуем респец снова на той же стадии
LivingMarket.purchaseTreeNode('craft1');
const r = LivingMarket.canRespecBranch('craft');
_ok(!r.ok, 'отказ');
_eq(r.reason, 'already_used_at_stage', 'reason = already_used_at_stage');
const r2 = LivingMarket.respecBranch('craft');
_ok(!r2.ok, 'функция тоже отказывает');
_eq(r2.reason, 'already_used_at_stage', 'reason тот же');
`));

// ── 43: переход стадии разрешает респец снова ──
add(run('Тест 43: переход на новую стадию даёт респец заново', `
initState(); selectSpec('smm'); startGame();
LivingMarket._awardXp(2000, 'dev');
LivingMarket.purchaseTreeNode('craft1');
LivingMarket.respecBranch('craft');
LivingMarket.purchaseTreeNode('craft1');
// Принудительно открываем Студию
G.living.stage = 1;
// На новой стадии респец доступен снова
const r = LivingMarket.canRespecBranch('craft');
_ok(r.ok, 'на новой стадии респец доступен');
const r2 = LivingMarket.respecBranch('craft');
_ok(r2.ok, 'респец выполнен');
_eq(r2.stage, 1, 'stage в журнале использования = 1');
`));

// ── 44: respec разных веток независимы ──
add(run('Тест 44: респец «craft» не блокирует респец «deals»', `
initState(); selectSpec('smm'); startGame();
LivingMarket._awardXp(2000, 'dev');
LivingMarket.purchaseTreeNode('craft1');
LivingMarket.purchaseTreeNode('deal1');
LivingMarket.respecBranch('craft');
const r = LivingMarket.canRespecBranch('deals');
_ok(r.ok, 'deals можно респекнуть после craft');
const r2 = LivingMarket.respecBranch('deals');
_ok(r2.ok, 'респец deals выполнен');
_eq(r2.refunded, 60, 'возвращено ★60 (deal1.cost)');
`));

// ── 45: респец двух узлов одной ветки возвращает суммарный XP ──
add(run('Тест 45: респец возвращает XP всех узлов ветки', `
initState(); selectSpec('smm'); startGame();
LivingMarket._awardXp(500, 'dev');
LivingMarket.purchaseTreeNode('craft1');  // 50
LivingMarket.purchaseTreeNode('craft2');  // 150
const xpBeforeRespec = G.xp;
const r = LivingMarket.respecBranch('craft');
_ok(r.ok, 'respec ok');
_eq(r.refunded, 200, 'возвращено ★200 (50+150)');
_eq(G.xp, xpBeforeRespec + 200, 'XP вырос на 200');
_eq(r.removed.length, 2, 'оба узла удалены');
`));

// ── 46: getRespecsUsed возвращает журнал использований ──
add(run('Тест 46: getRespecsUsed возвращает массив записей с branch/stage', `
initState(); selectSpec('smm'); startGame();
LivingMarket._awardXp(500, 'dev');
LivingMarket.purchaseTreeNode('craft1');
LivingMarket.respecBranch('craft');
const log = LivingMarket.getRespecsUsed();
_eq(log.length, 1, '1 запись');
_eq(log[0].branch, 'craft', 'branch');
_eq(log[0].stage, 0, 'stage = 0 (Гараж)');
_eq(log[0].refunded, 50, 'refunded = 50');
_ok(Array.isArray(log[0].nodes) && log[0].nodes.includes('craft1'), 'nodes список содержит craft1');
`));

// ── 47: после респека снова можно купить ранее проданный узел ──
add(run('Тест 47: после респека узел снова покупается', `
initState(); selectSpec('smm'); startGame();
LivingMarket._awardXp(500, 'dev');
LivingMarket.purchaseTreeNode('craft1');
LivingMarket.respecBranch('craft');
const r = LivingMarket.purchaseTreeNode('craft1');
_ok(r.ok, 'покупка после респека работает');
`));

// ── 48: known limitation — флаг perkPenaltyShield не снимается ──
// Это документированное ограничение: refcount по nodes не делается, чтобы
// не сломать другие источники того же флага (мета-перки/runMap-бонусы).
// Покупаем craft2 (выставляет perkPenaltyShield=true), респец — флаг
// остаётся true. Тест явно фиксирует контракт.
add(run('Тест 48: boolean флаг (perkPenaltyShield) после респека остаётся (known limitation)', `
initState(); selectSpec('smm'); startGame();
LivingMarket._awardXp(500, 'dev');
_ok(!G.perkPenaltyShield, 'до покупки shield не выставлен');
LivingMarket.purchaseTreeNode('craft2');
_ok(G.perkPenaltyShield === true, 'после craft2 shield = true');
LivingMarket.respecBranch('craft');
_ok(G.perkPenaltyShield === true, 'после респека shield ОСТАЁТСЯ true (known limitation)');
`));

// ══════════════════════════════════════════════════════════════════════
//   v0.5 (Фаза B, шаги 2-lite + 7) — engine.UPGRADES awareness + Summary
// ══════════════════════════════════════════════════════════════════════

// ── 49: API доступен ──
add(run('Тест 49: API getDuplicatedEngineUpgrades + getEffectsSummary', `
_ok(typeof LivingMarket.getDuplicatedEngineUpgrades === 'function', 'getDuplicatedEngineUpgrades есть');
_ok(typeof LivingMarket.getEffectsSummary === 'function',           'getEffectsSummary есть');
_ok(typeof LivingMarket.getChannelLabels === 'function',            'getChannelLabels есть');
`));

// ── 50: upgradeAlias объявлен у 10 узлов tier 1-2 ──
add(run('Тест 50: узлы tier 1-2 имеют upgradeAlias к engine.UPGRADES', `
const nodes = LivingMarket.getTreeNodes();
const aliased = nodes.filter(n => n.upgradeAlias && n.upgradeAlias.length > 0);
// Покрытие: craft1/craft2/prod1/prod2/peop2/mark1/mark2/deal1/deal2 — 9 узлов с алиасами
_ok(aliased.length >= 8, 'минимум 8 узлов с upgradeAlias (' + aliased.length + ')');
// Конкретные ожидаемые алиасы
const byId = id => nodes.find(n => n.id === id);
_ok(byId('craft1').upgradeAlias.includes('tools_q'),       'craft1 → tools_q');
_ok(byId('prod1').upgradeAlias.includes('agile'),          'prod1 → agile');
_ok(byId('mark1').upgradeAlias.includes('portfolio_site'), 'mark1 → portfolio_site');
_ok(byId('deal1').upgradeAlias.includes('contracts'),      'deal1 → contracts');
_ok(byId('deal2').upgradeAlias.includes('negotiator'),     'deal2 → negotiator');
// tier 3-5 узлы НЕ имеют алиаса (на этой итерации маппится только 1-2)
_ok(!byId('craft3').upgradeAlias || byId('craft3').upgradeAlias.length === 0, 'craft3 (tier 3) без alias');
_ok(!byId('craft5').upgradeAlias || byId('craft5').upgradeAlias.length === 0, 'craft5 (tier 5) без alias');
`));

// ── 51: getDuplicatedEngineUpgrades — пусто если апгрейд не куплен ──
add(run('Тест 51: getDuplicatedEngineUpgrades возвращает [] до покупки engine-апгрейда', `
initState(); selectSpec('smm'); startGame();
_eq(LivingMarket.getDuplicatedEngineUpgrades('craft1').length, 0, 'до покупки tools_q — пусто');
// Имитируем покупку engine-апгрейда (минуя UI/checks)
G.upgrades = G.upgrades || {};
G.upgrades['tools_q'] = true;
const dups = LivingMarket.getDuplicatedEngineUpgrades('craft1');
_eq(dups.length, 1, 'после покупки tools_q — 1 дубль');
_eq(dups[0], 'tools_q', 'дубль = tools_q');
// Узел без alias — всегда []
_eq(LivingMarket.getDuplicatedEngineUpgrades('craft3').length, 0, 'craft3 (без alias) — []');
_eq(LivingMarket.getDuplicatedEngineUpgrades('unknown_id').length, 0, 'unknown — []');
`));

// ── 52: getEffectsSummary — пустой до покупок ──
add(run('Тест 52: getEffectsSummary без покупок — пустые секции', `
initState(); selectSpec('smm'); startGame();
const s = LivingMarket.getEffectsSummary();
_eq(Object.keys(s.numeric).length, 0, 'numeric пуст');
_eq(Object.keys(s.mul).length, 0,     'mul пуст');
_eq(Object.keys(s.flags).length, 0,   'flags пуст');
`));

// ── 53: getEffectsSummary — суммирует numeric ──
add(run('Тест 53: getEffectsSummary numeric суммирует вклады нескольких узлов', `
initState(); selectSpec('smm'); startGame();
LivingMarket._awardXp(500, 'dev');
LivingMarket.purchaseTreeNode('craft1');  // +2 caseQBonus
const s1 = LivingMarket.getEffectsSummary();
_ok(s1.numeric.caseQBonus, 'caseQBonus присутствует');
_eq(s1.numeric.caseQBonus.total, 2, 'caseQBonus total = 2');
_eq(s1.numeric.caseQBonus.contributors.length, 1, '1 contributor');
_eq(s1.numeric.caseQBonus.contributors[0].id, 'craft1', 'contributor = craft1');
`));

// ── 54: getEffectsSummary — mul-канал в произведении ──
add(run('Тест 54: getEffectsSummary mul перемножает', `
initState(); selectSpec('smm'); startGame();
LivingMarket._awardXp(500, 'dev');
LivingMarket.purchaseTreeNode('peop1');  // scoutSalaryMult × 0.9
const s = LivingMarket.getEffectsSummary();
_ok(s.mul.scoutSalaryMult, 'mul.scoutSalaryMult присутствует');
_ok(Math.abs(s.mul.scoutSalaryMult.total - 0.9) < 1e-9, 'total = 0.9');
_eq(s.mul.scoutSalaryMult.contributors.length, 1, '1 contributor');
`));

// ── 55: getEffectsSummary — flags ──
add(run('Тест 55: getEffectsSummary flags перечисляет узлы-источники', `
initState(); selectSpec('smm'); startGame();
LivingMarket._awardXp(500, 'dev');
LivingMarket.purchaseTreeNode('craft2');  // выставляет perkPenaltyShield
const s = LivingMarket.getEffectsSummary();
_ok(s.flags.perkPenaltyShield, 'flags.perkPenaltyShield присутствует');
_eq(s.flags.perkPenaltyShield.value, true, 'value = true');
_eq(s.flags.perkPenaltyShield.contributors.length, 1, '1 contributor');
_eq(s.flags.perkPenaltyShield.contributors[0].id, 'craft2', 'contributor = craft2');
`));

// ── 56: после респека Effects Summary обновляется ──
add(run('Тест 56: после респека ветки EffectsSummary очищается для её узлов', `
initState(); selectSpec('smm'); startGame();
LivingMarket._awardXp(500, 'dev');
LivingMarket.purchaseTreeNode('craft1');
const sBefore = LivingMarket.getEffectsSummary();
_ok(sBefore.numeric.caseQBonus, 'до респека есть caseQBonus');
LivingMarket.respecBranch('craft');
const sAfter = LivingMarket.getEffectsSummary();
_ok(!sAfter.numeric.caseQBonus, 'после респека caseQBonus убран из summary');
`));

// ── 57: getChannelLabels возвращает русские названия каналов ──
add(run('Тест 57: getChannelLabels — карта канал→русская подпись', `
const labels = LivingMarket.getChannelLabels();
_ok(labels.caseQBonus.includes('Качество'),     'caseQBonus → Качество');
_ok(labels.perkPayoutMult.includes('Выплаты'),  'perkPayoutMult → Выплаты');
_ok(labels.speedUpgrades.includes('Скорость'),  'speedUpgrades → Скорость');
_ok(labels.perkPenaltyShield.includes('Штраф'), 'perkPenaltyShield упомянут');
`));

// ══════════════════════════════════════════════════════════════════════
//   v0.5 (Фаза A, шаг 2) — Годовые итоги M12/M24/…
// ══════════════════════════════════════════════════════════════════════

// ── 58: API годовых итогов доступен ──
add(run('Тест 58: API годовых итогов', `
_ok(typeof LivingMarket.getYearlyReports === 'function', 'getYearlyReports есть');
_ok(typeof LivingMarket.getCurrentYearProgress === 'function', 'getCurrentYearProgress есть');
_ok(typeof LivingMarket.showYearlyReport === 'function', 'showYearlyReport есть');
_ok(typeof LivingMarket._maybeTriggerYearly === 'function', '_maybeTriggerYearly есть');
_ok(typeof LivingMarket._buildYearlyReport === 'function', '_buildYearlyReport есть');
`));

// ── 59: триггер ровно на M12 — 1 отчёт в массиве ──
add(run('Тест 59: триггер ровно на M12 — 1 отчёт', `
initState(); selectSpec('smm'); startGame();
_eq(LivingMarket.getYearlyReports().length, 0, 'до тиков — 0 отчётов');
for (let i = 0; i < 11; i++) advanceMonth();
_eq(LivingMarket.getYearlyReports().length, 0, 'после 11 тиков — всё ещё 0');
advanceMonth(); // M12
_eq(LivingMarket.getYearlyReports().length, 1, 'после 12 тиков — 1 отчёт');
const r = LivingMarket.getYearlyReports()[0];
_eq(r.yearIdx, 1, 'yearIdx = 1');
_eq(r.monthFrom, 1, 'monthFrom = 1');
_eq(r.monthTo, 12, 'monthTo = 12');
`));

// ── 60: за год корректно агрегируются сдачи (по slice yearStartCompletedLen) ──
add(run('Тест 60: revenue/deliveries фильтруются срезом completedProjects', `
initState(); selectSpec('smm'); startGame();
for (let i = 0; i < 5; i++) advanceMonth();
G.completedProjects.push({ id:'pY1_1', name:'Брендинг', icon:'🎨', revenue: 1200000, tier: 2, finalNPS: 80, monthCompleted: G.month, failed:false });
for (let i = 0; i < 4; i++) advanceMonth();
G.completedProjects.push({ id:'pY1_2', name:'Лендинг', icon:'🌐', revenue: 3000000, tier: 3, finalNPS: 75, monthCompleted: G.month, failed:false });
while ((G.month || 0) < 12) advanceMonth();
const reports = LivingMarket.getYearlyReports();
_eq(reports.length, 1, '1 отчёт');
const r = reports[0];
_eq(r.deliveries, 2, '2 сдачи');
_eq(r.revenue, 4200000, 'выручка 1.2M + 3M = 4.2M');
_eq(r.byTier[2], 1, 'T2 ×1');
_eq(r.byTier[3], 1, 'T3 ×1');
_eq(r.topTier, 3, 'top-tier 3');
_ok(r.bestProject && r.bestProject.name === 'Лендинг', 'best project = Лендинг (3M > 1.2M)');
`));

// ── 61: staff diff — найм + увольнение между year-start и end ──
add(run('Тест 61: hires/leaves считаются через diff staff.ids', `
initState(); selectSpec('smm'); startGame();
_eq(G.staff.length, 0, 'на старте 0 сотрудников');
G.staff.push({ id:'sA' });
G.staff.push({ id:'sB' });
G.staff.push({ id:'sC' });
for (let i = 0; i < 6; i++) advanceMonth();
G.staff = G.staff.filter(s => s.id !== 'sA');
while ((G.month || 0) < 12) advanceMonth();
const r = LivingMarket.getYearlyReports()[0];
_eq(r.startStaff, 0, 'startStaff = 0 (M0 yearStartStaffIds был пуст)');
_eq(r.endStaff, 2, 'endStaff = 2 (sB+sC)');
_eq(r.hires, 2, 'hires = 2 (новые id не было в начале года)');
_eq(r.leaves, 0, 'leaves = 0 (sA не было в начале года)');
`));

// ── 62: не дублируется на M13, следующий ровно на M24 ──
add(run('Тест 62: после M12 — следующий ровно на M24', `
initState(); selectSpec('smm'); startGame();
for (let i = 0; i < 12; i++) advanceMonth();
_eq(LivingMarket.getYearlyReports().length, 1, 'на M12 — 1 отчёт');
advanceMonth(); // M13
_eq(LivingMarket.getYearlyReports().length, 1, 'на M13 — всё ещё 1');
for (let i = 0; i < 10; i++) advanceMonth();  // → M23
_eq(LivingMarket.getYearlyReports().length, 1, 'на M23 — 1');
advanceMonth(); // M24
_eq(LivingMarket.getYearlyReports().length, 2, 'на M24 — 2 отчёта');
const r2 = LivingMarket.getYearlyReports()[1];
_eq(r2.yearIdx, 2, 'второй yearIdx = 2');
_eq(r2.monthFrom, 13, 'monthFrom = 13');
_eq(r2.monthTo, 24, 'monthTo = 24');
`));

// ── 63: getCurrentYearProgress показывает прогресс текущего года ──
add(run('Тест 63: getCurrentYearProgress отдаёт monthsElapsed/Left', `
initState(); selectSpec('smm'); startGame();
const p0 = LivingMarket.getCurrentYearProgress();
_eq(p0.monthsElapsed, 0, 'до тиков elapsed = 0');
_eq(p0.monthsLeft, 12, 'до тиков осталось 12 мес');
for (let i = 0; i < 5; i++) advanceMonth();
const p5 = LivingMarket.getCurrentYearProgress();
_eq(p5.monthsElapsed, 5, 'после 5 тиков elapsed = 5');
_eq(p5.monthsLeft, 7, 'осталось 7');
for (let i = 0; i < 7; i++) advanceMonth();
const p12 = LivingMarket.getCurrentYearProgress();
_eq(p12.monthsElapsed, 0, 'после триггера база сдвинулась — elapsed=0');
_eq(p12.monthsLeft, 12, 'до следующего отчёта 12');
`));

// ── 64: yearlyReports переживают save+restore (контракт persistence) ──
add(run('Тест 64: G.living.yearlyReports переживает save+restore', `
initState(); selectSpec('smm'); startGame();
for (let i = 0; i < 12; i++) advanceMonth();
const before = JSON.stringify(LivingMarket.getYearlyReports());
const snap = JSON.parse(JSON.stringify(G));
initState();
Object.keys(snap).forEach(k => { G[k] = snap[k]; });
const after = JSON.stringify(LivingMarket.getYearlyReports());
_eq(after, before, 'отчёты идентичны после restore');
_eq(LivingMarket.getYearlyReports().length, 1, '1 отчёт сохранился');
`));

// ── 65: back-compat — старый сейв без G.living.yearly мигрирует ──
add(run('Тест 65: миграция старого сейва без yearly/yearlyReports', `
initState(); selectSpec('smm'); startGame();
delete G.living.yearly;
delete G.living.yearlyReports;
LivingMarket._initLiving();
_ok(!!G.living.yearly, 'yearly восстановлен');
_ok(Array.isArray(G.living.yearlyReports), 'yearlyReports = []');
_eq(G.living.yearlyReports.length, 0, 'отчётов 0');
advanceMonth();
advanceMonth();
_eq(G.living.yearlyReports.length, 0, 'пока 0 (не прошло 12 мес.)');
`));

// ── 66: newMilestones содержит только обычные milestone, фильтрует tree_/respec_/year_ ──
add(run('Тест 66: newMilestones содержит milestone, не содержит tree_/respec_/year_', `
initState(); selectSpec('smm'); startGame();
for (let i = 0; i < 2; i++) advanceMonth();
G.completedProjects.push({ id:'p1', revenue: 100000, tier:1, failed:false });
advanceMonth();
_ok(G.living.milestonesFired.includes('first_delivery'), 'first_delivery зафиксирован');
LivingMarket._awardXp(200, 'dev');
LivingMarket.purchaseTreeNode('craft1');
while ((G.month || 0) < 12) advanceMonth();
const r = LivingMarket.getYearlyReports()[0];
_ok(Array.isArray(r.newMilestones), 'newMilestones — массив');
_ok(r.newMilestones.some(m => m.id === 'first_delivery'), 'first_delivery в годовых');
_ok(!r.newMilestones.some(m => String(m.id).startsWith('tree_')),  'tree_* НЕ попал');
_ok(!r.newMilestones.some(m => String(m.id).startsWith('year_')),  'year_* НЕ попал');
`));

// ── 67: showYearlyReport безопасен на пустом списке ──
add(run('Тест 67: showYearlyReport возвращает null если отчётов нет', `
initState(); selectSpec('smm'); startGame();
const r = LivingMarket.showYearlyReport();
_ok(r === null, 'возвращает null когда отчётов нет');
`));

// ── 68: запись 'year_N' добавляется в journal при триггере ──
add(run('Тест 68: триггер пишет компактную запись year_N в journal', `
initState(); selectSpec('smm'); startGame();
for (let i = 0; i < 12; i++) advanceMonth();
const j = LivingMarket.getJournal();
const yearEntry = j.find(x => x.id === 'year_1');
_ok(!!yearEntry, 'year_1 запись в журнале');
_eq(yearEntry.icon, '📅', 'icon 📅');
_eq(yearEntry.tier, 'large', 'tier large');
_eq(yearEntry.month, 12, 'month = 12');
`));

console.log('\nИтог: ' + totals.pass + '/' + (totals.pass + totals.fail) + ' проверок прошли');
if (totals.fail > 0) process.exit(1);
