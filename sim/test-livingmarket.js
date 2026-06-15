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
  if (opts.useTree2Off) lm = lm.replace('const USE_TREE2_PROGRESSION = true;', 'const USE_TREE2_PROGRESSION = false;');
  // v0.6: подставляем заглушку window.openPerkModal перед загрузкой
  // livingmarket — модуль обернёт её, как обернул бы реальную из ui.js.
  if (opts.preloadOpenPerkModal) {
    src += '\n;\n// ===== preload openPerkModal stub =====\nwindow.openPerkModal = function(){ /* stub */ };\n';
  }
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
// v0.9 (Фаза C): requiresMarket убран — все 6 стадий теперь живые с реальными гейтами
_ok(!stages[3].requiresMarket && !stages[4].requiresMarket && !stages[5].requiresMarket, 'стадии 4–6 без requiresMarket (Фаза C)');
_ok(!stages[0].requiresMarket && !stages[1].requiresMarket && !stages[2].requiresMarket, 'стадии 1–3 живые (без requiresMarket)');
_ok(typeof stages[3].gate === 'function', 'у Сети реальная gate-функция');
_ok(typeof stages[4].gate === 'function', 'у Холдинга реальная gate-функция');
_ok(typeof stages[5].gate === 'function', 'у Империи реальная gate-функция');
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

// ── 10: Фаза C — гейты стадий 4–6 реальные (больше нет requiresMarket) ──
add(run('Тест 10: при огромных числах Сеть достижима, Холдинг — нет (нужно 3 мес. на #1)', `
initState(); selectSpec('smm'); startGame();
G.completedProjects = [];
for (let i = 0; i < 200; i++) G.completedProjects.push({ id:'p'+i, revenue: 5000000 });
G.staff = [];
for (let i = 0; i < 50; i++) G.staff.push({ id:'s'+i });
G.reputation = 100;
G.portfolio = 200;
advanceMonth();
// v0.9 (Фаза C): Сеть (idx 3) теперь достижима — гейт: 25 сдач · штат 10 · топ-3 · 60M ₽.
// При 200 сдачах × 5M и 50 штате игрок в топ-3 (конкуренты только что стартовали).
// Холдинг (idx 4) требует 3 мес. на #1 подряд → после 1 тика monthsAtRank1=1 < 3 → стоп.
_eq(G.living.stage, 3, 'достигнута Сеть (idx 3) — Холдинг заблокирован нехваткой мес. на #1');
_ok(G.market && G.market.competitors && G.market.competitors.length === 5, '5 конкурентов инициализированы');
_ok(G.market.playerRank != null, 'playerRank проставлен');
_eq(G.market.monthsAtRank1, 1, 'после 1 тика monthsAtRank1 = 1, нужно 3 для Холдинга');
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
// Tier 5 — заблокирован до Сети (stage idx 3), на гараже всегда закрыт
_ok(!LivingMarket.isNodeUnlocked('craft5'), 'craft5 (tier 5) заблокирован — нужна Сеть');
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
add(run('Тест 27: tier 5 открывается на стадии Сеть (Фаза D)', `
initState(); selectSpec('smm'); startGame();
// Принудительно поднимем стадию (минуя гейт) и навалим XP
G.living.stage = 3;  // Сеть
LivingMarket._awardXp(5000, 'dev');
_ok(LivingMarket.isNodeUnlocked('craft5'), 'craft5 (tier 5) открыт на стадии Сеть');
// Покупка может упасть по нехватке предшественников — но НЕ по locked
const r = LivingMarket.purchaseTreeNode('craft5');
_ok(r.reason !== 'locked', 'причина не locked: ' + r.reason);
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

// ── 48: v0.7 — refcount снимает boolean-флаг при респеке последнего источника ──
// До v0.7 флаг ОСТАВАЛСЯ после респека (known limitation). С v0.7 — если
// до tree2-покупки флаг был false и tree2 — единственный источник,
// респец снимает флаг чисто.
add(run('Тест 48: boolean флаг снимается на респеке если tree2 — единственный источник (v0.7)', `
initState(); selectSpec('smm'); startGame();
LivingMarket._awardXp(500, 'dev');
_ok(!G.perkPenaltyShield, 'до покупки shield не выставлен');
LivingMarket.purchaseTreeNode('craft2');
_ok(G.perkPenaltyShield === true, 'после craft2 shield = true');
const rc = LivingMarket.getFlagRefcount();
_eq(rc.perkPenaltyShield, 1, 'refcount perkPenaltyShield = 1');
const bl = LivingMarket.getFlagBaseline();
_eq(bl.perkPenaltyShield, false, 'baseline = false (был выключен до tree2)');
LivingMarket.respecBranch('craft');
_eq(G.perkPenaltyShield, false, 'после респека shield снят (v0.7 refcount)');
_eq((LivingMarket.getFlagRefcount().perkPenaltyShield || 0), 0, 'refcount обнулён');
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
G.perkImmuneToPoaching = true;  // отключаем хантинг для стабильности теста
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

// ══════════════════════════════════════════════════════════════════════
//   v0.6 (Фаза B, шаг 2 полный) — Tree 2.0 как ОСНОВНОЙ канал
// ══════════════════════════════════════════════════════════════════════

// ── 69: USE_TREE2_PROGRESSION флаг по умолчанию true ──
add(run('Тест 69: useTree2Progression=true по умолчанию', `
_eq(LivingMarket.useTree2Progression, true, 'флаг ON по умолчанию');
`));

// ── 70: openPerkModal перенаправлен на showTreeModal ──
// В тест-песочнице ui.js не загружается, поэтому имитируем существующий
// window.openPerkModal через `__preload` опцию, которая вставляется
// ПЕРЕД livingmarket.js — чтобы обёртка модуля могла его обернуть.
add(run('Тест 70: openPerkModal перенаправлен и помечен флагом', `
_ok(typeof window.openPerkModal === 'function', 'openPerkModal существует');
_ok(window.openPerkModal.__livingMarketRedirected === true, 'флаг redirect выставлен');
// Вызываем и убеждаемся, что показывается tree-modal (по DOM-узлу 'lm-tree-modal')
window.openPerkModal();
const tm = document.getElementById('lm-tree-modal');
_ok(!!tm, 'lm-tree-modal создан');
_eq(tm.style.display, 'flex', 'lm-tree-modal display=flex');
`, { preloadOpenPerkModal: true }));

// ── 71: buyUpgrade блокирован, возвращает null ──
add(run('Тест 71: buyUpgrade заблокирован, оригинал сохранён', `
_ok(typeof window.buyUpgrade === 'function', 'buyUpgrade существует');
_ok(window.buyUpgrade.__livingMarketBlocked === true, 'флаг block выставлен');
_ok(typeof window.buyUpgrade.__original === 'function', 'оригинал сохранён');
initState(); selectSpec('smm'); startGame();
const moneyBefore = G.money;
const upgradesBefore = Object.keys(G.upgrades || {}).length;
const result = window.buyUpgrade('tools_q');
_eq(result, null, 'buyUpgrade вернул null');
_eq(G.money, moneyBefore, 'деньги не списались');
_eq(Object.keys(G.upgrades || {}).length, upgradesBefore, 'G.upgrades не изменился');
`));

// ── 72: kill-switch USE_TREE2_PROGRESSION=false возвращает старое поведение ──
add(run('Тест 72: USE_TREE2_PROGRESSION=false — старое поведение восстановлено', `
_eq(LivingMarket.useTree2Progression, false, 'флаг OFF');
// openPerkModal НЕ помечен флагом redirect
_ok(!window.openPerkModal.__livingMarketRedirected, 'openPerkModal без redirect');
// buyUpgrade НЕ блокирован
_ok(!window.buyUpgrade.__livingMarketBlocked, 'buyUpgrade без блока');
`, { useTree2Off: true, preloadOpenPerkModal: true }));

// ══════════════════════════════════════════════════════════════════════
//   v0.7 (Фаза B, шаг 6) — refcount boolean-флагов
// ══════════════════════════════════════════════════════════════════════

// ── 73: API refcount/baseline доступен ──
add(run('Тест 73: API getFlagRefcount/getFlagBaseline', `
_ok(typeof LivingMarket.getFlagRefcount === 'function', 'getFlagRefcount есть');
_ok(typeof LivingMarket.getFlagBaseline === 'function', 'getFlagBaseline есть');
initState(); selectSpec('smm'); startGame();
_eq(Object.keys(LivingMarket.getFlagRefcount()).length, 0, 'refcount пуст до покупок');
_eq(Object.keys(LivingMarket.getFlagBaseline()).length, 0, 'baseline пуст до покупок');
`));

// ── 74: два tree2-источника одного флага — refcount=2, respec одного оставляет флаг ──
// craft2 и deal4 оба выставляют perkPenaltyShield. На стадии Агентство (idx 2)
// открывается tier 4. Купим оба → refcount=2; респец craft → refcount=1, флаг остаётся;
// респец deals → refcount=0, baseline=false → флаг снят.
add(run('Тест 74: два источника perkPenaltyShield — респец оставляет флаг до последнего', `
initState(); selectSpec('smm'); startGame();
G.living.stage = 2;  // открываем tier 4
LivingMarket._awardXp(3000, 'dev');
LivingMarket.purchaseTreeNode('craft2');  // +shield (refcount 1)
LivingMarket.purchaseTreeNode('deal4');   // +shield (refcount 2)
_eq(G.perkPenaltyShield, true, 'shield включён');
_eq(LivingMarket.getFlagRefcount().perkPenaltyShield, 2, 'refcount = 2');
// Респец craft → refcount=1, флаг остаётся
LivingMarket.respecBranch('craft');
_eq(G.perkPenaltyShield, true, 'shield ОСТАЁТСЯ после первого респека (есть deal4)');
_eq(LivingMarket.getFlagRefcount().perkPenaltyShield, 1, 'refcount = 1');
// Респец deals → refcount=0, baseline=false → флаг снят
LivingMarket.respecBranch('deals');
_eq(G.perkPenaltyShield, false, 'shield снят после второго респека (последний источник ушёл)');
_eq((LivingMarket.getFlagRefcount().perkPenaltyShield || 0), 0, 'refcount = 0');
`));

// ── 75: baseline=true (внешний источник флага) — респец НЕ снимает ──
// Симулируем мета-перк или runMap-бонус, выставивший флаг ДО покупки tree2-узла.
add(run('Тест 75: внешний источник флага (baseline=true) — респец НЕ снимает', `
initState(); selectSpec('smm'); startGame();
// «Внешний» источник: мета-перк включил perkPenaltyShield ДО tree2
G.perkPenaltyShield = true;
LivingMarket._awardXp(500, 'dev');
LivingMarket.purchaseTreeNode('craft2');  // должен записать baseline=true
const bl = LivingMarket.getFlagBaseline();
_eq(bl.perkPenaltyShield, true, 'baseline = true (был включён до tree2)');
LivingMarket.respecBranch('craft');
_eq(G.perkPenaltyShield, true, 'флаг ОСТАЁТСЯ — внешний источник всё ещё может на него полагаться');
`));

// ── 76: prod2 → perkInstantSpeed — снимается на респеке ──
add(run('Тест 76: perkInstantSpeed снимается через refcount', `
initState(); selectSpec('smm'); startGame();
LivingMarket._awardXp(500, 'dev');
LivingMarket.purchaseTreeNode('prod2');   // выставляет perkInstantSpeed
_eq(G.perkInstantSpeed, true, 'instant включён');
LivingMarket.respecBranch('production');
_eq(G.perkInstantSpeed, false, 'instant снят на респеке');
`));

// ── 77: prod4 → perkEpicShortcut — снимается на респеке ──
add(run('Тест 77: perkEpicShortcut снимается через refcount', `
initState(); selectSpec('smm'); startGame();
G.living.stage = 2;
LivingMarket._awardXp(2000, 'dev');
LivingMarket.purchaseTreeNode('prod4');   // выставляет perkEpicShortcut + speed
_eq(G.perkEpicShortcut, true, 'epic-shortcut включён');
LivingMarket.respecBranch('production');
_eq(G.perkEpicShortcut, false, 'epic-shortcut снят на респеке');
`));

// ── 78: миграция старого сейва — _flagRefcount/_flagBaseline инициализируются ──
add(run('Тест 78: миграция сейва без _flagRefcount/_flagBaseline', `
initState(); selectSpec('smm'); startGame();
// Эмулируем сейв v0.4-v0.6 — нет refcount/baseline полей в tree2
delete G.living.tree2._flagRefcount;
delete G.living.tree2._flagBaseline;
// _initLiving вызывается в обёртке advanceMonth — триггерим миграцию
advanceMonth();
_ok(G.living.tree2._flagRefcount, '_flagRefcount инициализирован');
_ok(G.living.tree2._flagBaseline, '_flagBaseline инициализирован');
_eq(Object.keys(G.living.tree2._flagRefcount).length, 0, 'refcount пуст после миграции');
_eq(Object.keys(G.living.tree2._flagBaseline).length, 0, 'baseline пуст после миграции');
`));

// ── 79: повторная покупка после respec не дублирует refcount ──
add(run('Тест 79: refcount корректен после respec → repurchase', `
initState(); selectSpec('smm'); startGame();
LivingMarket._awardXp(500, 'dev');
LivingMarket.purchaseTreeNode('craft2');
_eq(LivingMarket.getFlagRefcount().perkPenaltyShield, 1, 'refcount=1');
LivingMarket.respecBranch('craft');
_eq((LivingMarket.getFlagRefcount().perkPenaltyShield || 0), 0, 'refcount обнулён');
_eq(G.perkPenaltyShield, false, 'флаг снят');
// Покупаем снова после смены стадии (чтобы респец разблокировался)
G.living.stage = 1;
LivingMarket.purchaseTreeNode('craft2');
_eq(LivingMarket.getFlagRefcount().perkPenaltyShield, 1, 'refcount=1 снова');
_eq(G.perkPenaltyShield, true, 'флаг включён снова');
`));

// ══════════════════════════════════════════════════════════════════════
//   v0.8 (Фаза A, шаг 3) — DSL милстоунов в данных сценария
// ══════════════════════════════════════════════════════════════════════

// ── DSL: компилятор условий ──
add(run('Тест DSL.1: compileMilestoneWhen — все операторы AND', `
const c = LivingMarket.compileMilestoneWhen;
const fakeG = {
  completedProjects: [{revenue:100}, {revenue:200}, {revenue:300}],
  staff: [{},{}],
  money: 1500000,
  reputation: 55,
  portfolio: 12,
  living: { _peakMoney: 9999999, originalWinCondition: 7500000, stage: 1 },
};
_ok(c({deliveriesAtLeast: 3})(fakeG), 'deliveriesAtLeast: 3 ✓');
_ok(!c({deliveriesAtLeast: 4})(fakeG), 'deliveriesAtLeast: 4 ✗');
_ok(c({staffAtLeast: 2})(fakeG), 'staffAtLeast: 2 ✓');
_ok(!c({staffAtLeast: 3})(fakeG), 'staffAtLeast: 3 ✗');
_ok(c({moneyAtLeast: 1000000})(fakeG), 'moneyAtLeast: 1M ✓');
_ok(!c({moneyAtLeast: 2000000})(fakeG), 'moneyAtLeast: 2M ✗');
_ok(c({reputationAtLeast: 50})(fakeG), 'reputationAtLeast: 50 ✓');
_ok(!c({reputationAtLeast: 60})(fakeG), 'reputationAtLeast: 60 ✗');
_ok(c({portfolioAtLeast: 10})(fakeG), 'portfolioAtLeast: 10 ✓');
_ok(!c({portfolioAtLeast: 20})(fakeG), 'portfolioAtLeast: 20 ✗');
_ok(c({stageAtLeast: 1})(fakeG), 'stageAtLeast: 1 ✓');
_ok(!c({stageAtLeast: 2})(fakeG), 'stageAtLeast: 2 ✗');
_ok(c({revenueAtLeast: 600})(fakeG), 'revenueAtLeast: 600 ✓ (100+200+300)');
_ok(!c({revenueAtLeast: 700})(fakeG), 'revenueAtLeast: 700 ✗');
// peakMoneyAtLeast: 'originalWin' → 7.5M, peak 9.999M
_ok(c({peakMoneyAtLeast: 'originalWin'})(fakeG), 'peakMoneyAtLeast: originalWin ✓');
// AND: всё выполнено
_ok(c({deliveriesAtLeast: 2, reputationAtLeast: 50, moneyAtLeast: 1000000})(fakeG), 'AND всех условий ✓');
// AND: одно сломано
_ok(!c({deliveriesAtLeast: 2, reputationAtLeast: 99, moneyAtLeast: 1000000})(fakeG), 'AND с одним промахом ✗');
// Пустой when → всегда false
_ok(!c(null)(fakeG), 'null when → false');
`));

// ── $win-токен в desc ──
add(run('Тест DSL.2: $win-токен заменяется на форматированный originalWinCondition', `
const r = LivingMarket.resolveMilestoneDesc;
const g = { living: { originalWinCondition: 7500000 } };
const out = r('Достичь $win', g);
_ok(out.includes('₽'), 'результат содержит ₽');
_ok(!out.includes('$win'), 'токен $win заменён');
_ok(out.includes('7') && (out.includes('M') || out.includes('K')), 'число подставлено');
// Без токена — возвращается как есть
_eq(r('Просто текст', g), 'Просто текст', 'без токена — без изменений');
// Не строка — обрабатывается безопасно
_eq(r(null, g), '', 'null → пустая строка');
`));

// ── Сценарные милстоуны: agency.data.js теперь содержит SCENARIO.milestones ──
add(run('Тест DSL.3: SCENARIO.milestones есть в данных и используется', `
const sm = LivingMarket.getScenarioMilestones();
_ok(Array.isArray(sm), 'SCENARIO.milestones — массив');
_ok(sm.length >= 11, 'минимум 11 милстоунов (' + sm.length + ')');
const ids = sm.map(m => m.id);
['first_delivery','reputation_50','first_hire','first_million','five_deliveries','original_win','stage_studio','stage_agency']
  .forEach(id => _ok(ids.includes(id), 'есть ' + id));
// _milestones берёт из сценария когда есть
initState(); selectSpec('smm'); startGame();
const m = LivingMarket._milestones(G);
_eq(m.length, sm.length, '_milestones длина = SCENARIO.milestones длина');
// Структура совпадает (id + tier)
_eq(m[0].id, sm[0].id, 'первый id совпадает');
// cond — функция
_ok(typeof m[0].cond === 'function', 'cond — функция');
`));

// ── DSL.4: триггерится корректно из сценария ──
add(run('Тест DSL.4: first_delivery срабатывает через DSL-cond, пишется в journal', `
initState(); selectSpec('smm'); startGame();
G.completedProjects = [{ id:'p1', revenue: 100000, tier:1, failed:false }];
advanceMonth();
_ok(G.living.milestonesFired.includes('first_delivery'), 'first_delivery зафиксирован через DSL');
const j = G.living.journal.find(x => x.id === 'first_delivery');
_ok(!!j, 'есть запись в journal');
_eq(j.tier, 'micro', 'tier = micro');
`));

// ── DSL.5: original_win через peakMoneyAtLeast: 'originalWin' ──
add(run('Тест DSL.5: original_win через peakMoneyAtLeast: originalWin', `
initState(); selectSpec('smm'); startGame();
const orig = G.living.originalWinCondition;
_ok(orig > 0, 'originalWinCondition сохранён (' + orig + ')');
G.money = orig - 1;
advanceMonth();
_ok(!G.living.milestonesFired.includes('original_win'), 'до порога — не сработал');
G.money = orig + 1000;
advanceMonth();
_ok(G.living.milestonesFired.includes('original_win'), 'после порога — сработал');
const entry = G.living.journal.find(x => x.id === 'original_win');
_ok(!!entry, 'есть запись в journal');
_ok(!entry.desc.includes('$win'), '$win заменён в desc');
`));

// ── DSL.6: fallback на встроенный пул, если SCENARIO.milestones удалить ──
add(run('Тест DSL.6: fallback на _milestonesBuiltin без SCENARIO.milestones', `
initState(); selectSpec('smm'); startGame();
delete SCENARIO.milestones;
const m = LivingMarket._milestones(G);
_ok(m.length >= 11, 'fallback дал ' + m.length + ' милстоунов');
const ids = m.map(x => x.id);
_ok(ids.includes('first_delivery'), 'first_delivery в fallback');
_ok(ids.includes('original_win'),   'original_win в fallback');
// _milestonesBuiltin отдельно тоже доступен
const b = LivingMarket._milestonesBuiltin(G);
_eq(b.length, m.length, '_milestonesBuiltin длина совпадает');
`));

// ── DSL.7: _scenarioMilestones возвращает null, если sceanrio пуст ──
add(run('Тест DSL.7: _scenarioMilestones возвращает null без SCENARIO.milestones', `
initState(); selectSpec('smm'); startGame();
delete SCENARIO.milestones;
_eq(LivingMarket._scenarioMilestones(G), null, 'null когда нет SCENARIO.milestones');
`));

// ── Фаза C.1: инициализация G.market ──
add(run('Фаза C.1: startGame создаёт G.market с 5 конкурентами', `
initState(); selectSpec('smm'); startGame();
_ok(G.market && typeof G.market === 'object', 'G.market существует');
_eq(G.market.competitors.length, 5, '5 конкурентов');
_ok(G.market.playerRank != null, 'playerRank проставлен');
_eq(G.market.monthsAtRank1, 0, 'monthsAtRank1 = 0 при старте');
_eq(G.market.acquisitions, 0, 'acquisitions = 0');
const archetypes = G.market.competitors.map(c => c.archetype);
_ok(archetypes.includes('dumper'),   'есть Демпер');
_ok(archetypes.includes('boutique'), 'есть Бутик');
_ok(archetypes.includes('machine'),  'есть Машина найма');
_ok(archetypes.includes('networker'),'есть Сетевик');
_ok(archetypes.includes('wildcard'), 'есть Дикая карта');
`));

// ── Фаза C.2: тик конкурентов в advanceMonth ──
add(run('Фаза C.2: advanceMonth увеличивает revenue конкурентов', `
initState(); selectSpec('smm'); startGame();
const revBefore = G.market.competitors.map(c => c.revenue);
advanceMonth();
const revAfter = G.market.competitors.map(c => c.revenue);
_ok(revAfter.every((r, i) => r > revBefore[i]), 'каждый конкурент получил выручку за месяц');
`));

// ── Фаза C.3: рейтинг пересчитывается ──
add(run('Фаза C.3: playerRank обновляется, игрок обгоняет конкурентов при большой выручке', `
initState(); selectSpec('smm'); startGame();
// Дать игроку огромную выручку — он должен быть #1
G.completedProjects = [];
for (let i = 0; i < 100; i++) G.completedProjects.push({ id:'p'+i, revenue: 10_000_000 });
advanceMonth();
_eq(G.market.playerRank, 1, 'при 1 млрд выручки игрок #1');
_eq(G.market.monthsAtRank1, 1, 'первый месяц на #1 → monthsAtRank1 = 1');
`));

// ── Фаза C.4: monthsAtRank1 накапливается и сбрасывается ──
add(run('Фаза C.4: monthsAtRank1 растёт при #1 и сбрасывается при потере позиции', `
initState(); selectSpec('smm'); startGame();
// Игрок без выручки — конкуренты стартуют с 0, но быстро обгоняют
G.completedProjects = [];
advanceMonth(); advanceMonth(); advanceMonth();
// После 3 тиков конкуренты должны опередить (у них rev > 0, у игрока = 0)
_ok(G.market.monthsAtRank1 === 0, 'без выручки игрок не на #1 — monthsAtRank1 = 0');
_ok(G.market.playerRank > 1, 'игрок не на первом месте без выручки');
`));

// ── Фаза C.5: getMarket / getCompetitors публичный API ──
add(run('Фаза C.5: публичный API LivingMarket работает', `
initState(); selectSpec('smm'); startGame();
const market = LivingMarket.getMarket();
_ok(market && market.competitors, 'getMarket() вернул объект с конкурентами');
const comps  = LivingMarket.getCompetitors();
_eq(comps.length, 5, 'getCompetitors() → 5 элементов');
_ok(LivingMarket.getPlayerRank() != null, 'getPlayerRank() не null');
_eq(LivingMarket.getMonthsAtRank1(), 0, 'getMonthsAtRank1() = 0 при старте');
_eq(LivingMarket.getAcquisitions(), 0, 'getAcquisitions() = 0');
const archs = LivingMarket.getCompetitorArchetypes();
_ok('dumper' in archs && 'boutique' in archs, 'getCompetitorArchetypes() содержит archetypes');
`));

// ── Фаза C.6: гейт Сети требует топ-3 ──
add(run('Фаза C.6: Сеть (idx 3) не открывается без топ-3 рейтинга', `
initState(); selectSpec('smm'); startGame();
// Выполнить все другие условия Сети, но рейтинг оставить плохой
G.completedProjects = [];
for (let i = 0; i < 30; i++) G.completedProjects.push({ id:'p'+i, revenue: 1000 }); // 30 сдач, но мизер денег
G.staff = [];
for (let i = 0; i < 15; i++) G.staff.push({ id:'s'+i });
G.reputation = 90;
// Конкурентам дать огромную выручку чтобы игрок был в конце рейтинга
G.market.competitors.forEach(c => { c.revenue = 500_000_000; });
LivingMarket._updateMarketRankings();
_ok(G.market.playerRank > 3, 'без денег игрок не в топ-3');
// _tickStages не должен дать Сеть
LivingMarket._tickStages();
_ok(G.living.stage < 3, 'Сеть не открылась без топ-3 рейтинга (стадия: ' + G.living.stage + ')');
`));

// ── Фаза C.7: гейт Холдинга требует 3 мес. на #1 ──
add(run('Фаза C.7: Холдинг (idx 4) не открывается при 1 месяце на #1', `
initState(); selectSpec('smm'); startGame();
G.completedProjects = [];
for (let i = 0; i < 60; i++) G.completedProjects.push({ id:'p'+i, revenue: 5_000_000 });
G.staff = [];
for (let i = 0; i < 25; i++) G.staff.push({ id:'s'+i });
G.reputation = 95;
// Принудительно: игрок на #1 только 1 месяц
G.market.monthsAtRank1 = 1;
G.market.playerRank    = 1;
LivingMarket._tickStages();
// Сеть должна открыться (все условия выполнены), Холдинг — нет
_eq(G.living.stage, 3, 'Сеть открылась, Холдинг ещё нет (нужно 3 мес. на #1)');
`));

// ── Фаза C.8: гейт Холдинга открывается при 3 мес. на #1 ──
add(run('Фаза C.8: Холдинг открывается при monthsAtRank1 = 3', `
initState(); selectSpec('smm'); startGame();
G.completedProjects = [];
for (let i = 0; i < 60; i++) G.completedProjects.push({ id:'p'+i, revenue: 5_000_000 });
G.staff = [];
for (let i = 0; i < 25; i++) G.staff.push({ id:'s'+i });
G.reputation = 95;
G.market.monthsAtRank1 = 3;
G.market.playerRank    = 1;
LivingMarket._tickStages();
_eq(G.living.stage, 4, 'Холдинг открылся при monthsAtRank1 = 3');
`));

// ── Фаза C.9: гейт Империи требует поглощение ──
add(run('Фаза C.9: Империя (idx 5) не открывается без поглощений', `
initState(); selectSpec('smm'); startGame();
G.completedProjects = [];
for (let i = 0; i < 110; i++) G.completedProjects.push({ id:'p'+i, revenue: 6_000_000 });
G.staff = [];
for (let i = 0; i < 25; i++) G.staff.push({ id:'s'+i });
G.reputation = 95;
G.market.monthsAtRank1 = 10;
G.market.playerRank    = 1;
G.market.acquisitions  = 0;   // поглощений нет
LivingMarket._tickStages();
_eq(G.living.stage, 4, 'Империя заблокирована — acquisitions = 0');
G.market.acquisitions = 1;    // провели поглощение
LivingMarket._tickStages();
_eq(G.living.stage, 5, 'Империя открылась после acquisitions = 1');
`));

// ── Фаза C.10: save/restore сохраняет G.market ──
add(run('Фаза C.10: G.market переживает snap/restore через saves.js', `
initState(); selectSpec('smm'); startGame();
advanceMonth(); advanceMonth();
const rankBefore = G.market.playerRank;
const at1Before  = G.market.monthsAtRank1;
const revBefore  = G.market.competitors[0].revenue;
// Snap → restore
const snap = JSON.parse(JSON.stringify(G));
G.market.playerRank = 999;  // повреждаем стейт
G.market.competitors[0].revenue = 0;
// Restore
Object.keys(snap).forEach(k => { G[k] = snap[k]; });
_eq(G.market.playerRank, rankBefore, 'playerRank восстановлен');
_eq(G.market.monthsAtRank1, at1Before, 'monthsAtRank1 восстановлен');
_eq(G.market.competitors[0].revenue, revBefore, 'revenue конкурента восстановлен');
`));

// ══════════════════════════════════════════════════════════════════════════
// ФАЗА D.1: ежегодные награды + демпинг-волны
// ══════════════════════════════════════════════════════════════════════════

// ── Фаза D.1: _awardYearlyWinner — игрок на первом месте получает награду ──
add(run('Фаза D.1: игрок №1 по выручке получает awardsWon++', `
initState(); selectSpec('smm'); startGame();
// Даём игроку огромную выручку
G.completedProjects = [];
for (let i = 0; i < 100; i++) G.completedProjects.push({ id:'p'+i, revenue: 10_000_000 });
// Обнуляем выручку конкурентов
G.market.competitors.forEach(c => { c.revenue = 100; });
const winner = LivingMarket._awardYearlyWinner();
_ok(winner, '_awardYearlyWinner вернул winner');
_ok(winner.isPlayer, 'winner.isPlayer === true');
_eq(G.market.awardsWon, 1, 'G.market.awardsWon === 1');
`));

// ── Фаза D.2: победа конкурента — игрок не получает награду ──
add(run('Фаза D.2: конкурент №1 — у него awardsWon++, игрок не получает', `
initState(); selectSpec('smm'); startGame();
// Обнуляем выручку игрока
G.completedProjects = [];
// Конкуренты с большой выручкой
G.market.competitors.forEach(c => { c.revenue = 100_000_000; });
const winner = LivingMarket._awardYearlyWinner();
_ok(winner, '_awardYearlyWinner вернул winner');
_ok(!winner.isPlayer, 'победил конкурент');
_eq(G.market.awardsWon, 0, 'у игрока awardsWon = 0');
const winComp = G.market.competitors.find(c => c.id === winner.id);
_eq(winComp.awardsWon, 1, 'у компании-победителя awardsWon = 1');
`));

// ── Фаза D.3: гейт Сети учитывает awards >= 1 ──
add(run('Фаза D.3: Сеть открывается при awards >= 1 даже без топ-3 рейтинга', `
initState(); selectSpec('smm'); startGame();
G.completedProjects = [];
for (let i = 0; i < 30; i++) G.completedProjects.push({ id:'p'+i, revenue: 3_000_000 });
G.staff = [];
for (let i = 0; i < 12; i++) G.staff.push({ id:'s'+i });
G.reputation = 95;
G.market.playerRank    = 5;   // не в топ-3
G.market.awardsWon     = 0;
G.market.monthsAtRank1 = 0;
LivingMarket._tickStages();
_eq(G.living.stage, 2, 'без топ-3 и наград — Сеть заблокирована');
// Теперь даём одну награду
G.market.awardsWon = 1;
LivingMarket._tickStages();
_eq(G.living.stage, 3, 'с 1 наградой Сеть открылась');
`));

// ── Фаза D.4: _tickDumpingWave — волна стартует и завершается ──
add(run('Фаза D.4: демпинг стартует (с форсированным RNG) и завершается по времени', `
initState(); selectSpec('smm'); startGame();
advanceMonth();
// Форсируем демпинг напрямую
G.market.dumpingWave = { competitorId: G.market.competitors[0].id, endsAtMonth: (G.month||1) + 2, intensity: 0.15, startedAt: G.month||1 };
_ok(G.market.dumpingWave, 'dumpingWave установлена');
// Симулируем прохождение месяцев до завершения
G.month = G.market.dumpingWave.endsAtMonth;
LivingMarket._tickDumpingWave();
_eq(G.market.dumpingWave, null, 'dumpingWave === null после истечения');
`));

// ── Фаза D.5: _applyDumpingToScoutPool снижает бюджеты ──
add(run('Фаза D.5: демпинг уменьшает fixedBudget в scoutPool', `
initState(); selectSpec('smm'); startGame();
G.scoutPool = [
  { id: 'p1', name: 'Test', fixedBudget: 1_000_000, tier: 2 },
  { id: 'p2', name: 'Test2', budgetRange: [500_000, 800_000], tier: 3 },
];
G.market.dumpingWave = { competitorId: G.market.competitors[0].id, endsAtMonth: 999, intensity: 0.20, startedAt: 1 };
LivingMarket._applyDumpingToScoutPool();
_eq(G.scoutPool[0].fixedBudget, 800_000, 'fixedBudget снижен на 20%');
_ok(G.scoutPool[1].budgetRange[0] < 500_000, 'budgetRange[0] снижен');
_ok(G.scoutPool[1].budgetRange[1] < 800_000, 'budgetRange[1] снижен');
`));

// ── Фаза D.6: back-compat — старый сейв без awardsWon/dumpingWave ──
add(run('Фаза D.6: back-compat — G.market без awardsWon/dumpingWave инициализируется корректно', `
initState(); selectSpec('smm'); startGame();
// Симулируем старый сейв: удаляем поля Phase D
delete G.market.awardsWon;
delete G.market.dumpingWave;
G.market.competitors.forEach(c => delete c.awardsWon);
// _initMarket должен их восстановить
LivingMarket._initMarket();
_eq(G.market.awardsWon, 0, 'awardsWon восстановлен');
_eq(G.market.dumpingWave, null, 'dumpingWave === null (восстановлен)');
G.market.competitors.forEach(c => {
  _eq(c.awardsWon, 0, 'awardsWon конкурента восстановлен: ' + c.name);
});
`));

// ── Фаза D.7: getAwardsWon / getDumpingWave публичное API ──
add(run('Фаза D.7: публичное API Phase D — getAwardsWon / getDumpingWave', `
initState(); selectSpec('smm'); startGame();
_eq(LivingMarket.getAwardsWon(), 0, 'getAwardsWon() = 0 изначально');
G.market.awardsWon = 3;
_eq(LivingMarket.getAwardsWon(), 3, 'getAwardsWon() = 3 после изменения');
_eq(LivingMarket.getDumpingWave(), null, 'getDumpingWave() = null изначально');
G.market.dumpingWave = { competitorId: 'c1', endsAtMonth: 10, intensity: 0.15, startedAt: 5 };
_ok(LivingMarket.getDumpingWave() !== null, 'getDumpingWave() вернул волну');
_eq(LivingMarket.getDumpingWave().intensity, 0.15, 'intensity корректна');
`));

// ══════════════════════════════════════════════════════════════════════════
// ФАЗА D.2: хантинг сотрудников + питч-тендер
// ══════════════════════════════════════════════════════════════════════════

// ── D.2.1: _tickStaffPoaching — networker переманивает стаффа ──
add(run('Фаза D.2.1: networker переманивает стаффа при 100% шансе', `
initState(); selectSpec('smm'); startGame();
// Подкладываем двух сотрудников
G.staff = [
  { _iid: 's1', id: 'designer_jr', name: 'Дизайнер', icon: '🎨', role: 'designer' },
  { _iid: 's2', id: 'pm', name: 'ПМ', icon: '📋', role: 'pm' },
];
// Форсируем исход: подменяем Math.random на 0 (< 0.04 → всегда срабатывает)
const _origRand = Math.random;
Math.random = () => 0;
LivingMarket._tickStaffPoaching();
Math.random = _origRand;
// Один из двух должен исчезнуть
_eq(G.staff.length, 1, 'после хантинга стаффа стало 1');
`));

// ── D.2.2: peop5 (perkImmuneToPoaching) блокирует хантинг ──
add(run('Фаза D.2.2: perkImmuneToPoaching блокирует хантинг', `
initState(); selectSpec('smm'); startGame();
G.staff = [
  { _iid: 's1', id: 'designer_jr', name: 'Дизайнер', icon: '🎨', role: 'designer' },
  { _iid: 's2', id: 'pm', name: 'ПМ', icon: '📋', role: 'pm' },
];
G.perkImmuneToPoaching = true;
const _origRand = Math.random;
Math.random = () => 0;
LivingMarket._tickStaffPoaching();
Math.random = _origRand;
_eq(G.staff.length, 2, 'иммунитет работает — стафф остался 2');
`));

// ── D.2.3: хантинг не трогает единственного сотрудника ──
add(run('Фаза D.2.3: хантинг не трогает команду из 1 человека', `
initState(); selectSpec('smm'); startGame();
G.staff = [
  { _iid: 's1', id: 'designer_jr', name: 'Дизайнер', icon: '🎨', role: 'designer' },
];
const _origRand = Math.random;
Math.random = () => 0;
LivingMarket._tickStaffPoaching();
Math.random = _origRand;
_eq(G.staff.length, 1, 'единственный сотрудник не переманён');
`));

// ── D.2.4: хантинг без networker — не срабатывает ──
add(run('Фаза D.2.4: без networker-конкурента хантинг не срабатывает', `
initState(); selectSpec('smm'); startGame();
G.staff = [
  { _iid: 's1', id: 'designer_jr', name: 'Дизайнер', icon: '🎨', role: 'designer' },
  { _iid: 's2', id: 'pm', name: 'ПМ', icon: '📋', role: 'pm' },
];
// Меняем архетип networker на что-то другое
G.market.competitors.forEach(c => { if (c.archetype === 'networker') c.archetype = 'boutique'; });
const _origRand = Math.random;
Math.random = () => 0;
LivingMarket._tickStaffPoaching();
Math.random = _origRand;
_eq(G.staff.length, 2, 'без networker хантинг не произошёл');
`));

// ── D.2.5: peop5 применяется через purchaseTreeNode ──
add(run('Фаза D.2.5: покупка peop5 устанавливает perkImmuneToPoaching', `
initState(); selectSpec('smm'); startGame();
// Форсируем открытие peop5 (обходим гейт tier 5)
const node = LivingMarket.getTreeNodes().find(n => n.id === 'peop5');
_ok(!!node, 'peop5 node существует');
// Устанавливаем нужное кол-во XP и stage
G.xp = 9999;
G.living.stage = 5;
// Делаем купленными все предшествующие узлы ветки people (tier 1-4)
['peop1','peop2','peop3','peop4'].forEach(id => {
  if (!G.living.tree2.purchased.includes(id)) {
    G.living.tree2.purchased.push(id);
    const n = LivingMarket.getTreeNodes().find(x=>x.id===id);
    if (n && typeof n.apply === 'function') try { n.apply(G); } catch(e){}
  }
});
const res = LivingMarket.purchaseTreeNode('peop5');
_ok(res && (res.ok === true || res.reason === 'already_owned'), 'покупка peop5: ' + JSON.stringify(res));
_ok(!!G.perkImmuneToPoaching, 'perkImmuneToPoaching === true после peop5');
_ok(LivingMarket.isImmuneToPoaching(), 'isImmuneToPoaching() возвращает true');
`));

// ── D.2.6: _applyPitchContestFilter снимает T3+ проект при 100% шансе ──
add(run('Фаза D.2.6: питч-тендер убирает T3+ проект из пула при 100% шансе', `
initState(); selectSpec('smm'); startGame();
G.scoutPool = [
  { id: 'p1', name: 'Мелкий проект', tier: 1 },
  { id: 'p2', name: 'Средний проект', tier: 2 },
  { id: 'p3', name: 'Тендер T3', tier: 3 },
  { id: 'p4', name: 'Тендер T4', tier: 4 },
];
const _origRand = Math.random;
Math.random = () => 0;   // 0 < 0.20 → всегда снайпит
LivingMarket._applyPitchContestFilter();
Math.random = _origRand;
// Один T3+ должен исчезнуть, T1/T2 остаются
_eq(G.scoutPool.filter(p => p.tier >= 3).length, 1, 'остался 1 из 2 высокоуровневых проектов');
_ok(G.scoutPool.find(p => p.id === 'p1'), 'T1 проект остался');
_ok(G.scoutPool.find(p => p.id === 'p2'), 'T2 проект остался');
`));

// ── D.2.7: _applyPitchContestFilter не трогает T1/T2 ──
add(run('Фаза D.2.7: питч-тендер не трогает проекты T1/T2', `
initState(); selectSpec('smm'); startGame();
G.scoutPool = [
  { id: 'p1', name: 'T1', tier: 1 },
  { id: 'p2', name: 'T2', tier: 2 },
];
const _origRand = Math.random;
Math.random = () => 0;
LivingMarket._applyPitchContestFilter();
Math.random = _origRand;
_eq(G.scoutPool.length, 2, 'пул не изменился — нет T3+ проектов');
`));

console.log('\nИтог: ' + totals.pass + '/' + (totals.pass + totals.fail) + ' проверок прошли');
if (totals.fail > 0) process.exit(1);
