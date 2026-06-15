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

console.log(`\nИтог: ${totals.pass}/${totals.pass + totals.fail} проверок прошли`);
if (totals.fail > 0) process.exit(1);
