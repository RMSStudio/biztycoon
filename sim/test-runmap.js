'use strict';
// ══════════════════════════════════════════════════════
//  Тест карты рана (src/runmap.js)
//  Проверяем:
//   - модуль грузится при включённом DLC и регистрирует API
//   - стартовый этап = Гараж, всего этапов 5
//   - на границе monthEnd выскакивает milestone с 3 бонусами
//   - выбор бонуса применяет эффект к G и продвигает этап
//   - milestone не дублируется при повторных тиках того же месяца
//   - финальный этап (endgame) больше не показывает milestone
//   - G.runMap переносится через snapshot (саунд _restore)
//   - без DLC roguelite модуль не активируется
//   - hard kill-switch RUN_MAP_ENABLED=false выключает
// ══════════════════════════════════════════════════════

const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

const ROOT = path.join(__dirname, '..');

function makeClassList() {
  const set = new Set();
  return {
    add: c => set.add(c), remove: c => set.delete(c),
    toggle: c => set.has(c) ? set.delete(c) : set.add(c),
    contains: c => set.has(c),
  };
}
function makeEl(id) {
  const el = {
    id: id || '', textContent: '', value: '', className: '', title: '',
    style: {}, dataset: {}, children: [], disabled: false, onclick: null,
    appendChild(c){ this.children.push(c); return c; },
    removeChild(c){ this.children = this.children.filter(x => x !== c); },
    remove(){}, insertBefore(c){ this.children.push(c); return c; },
    setAttribute(){}, getAttribute(){ return null; }, removeAttribute(){},
    addEventListener(){}, removeEventListener(){},
    querySelector(){ return makeEl(); }, querySelectorAll(){ return []; },
    closest(){ return null; }, focus(){}, blur(){}, click(){ if (this.onclick) this.onclick(); },
    getBoundingClientRect(){ return {top:0,left:0,width:0,height:0}; },
    scrollIntoView(){},
  };
  el.classList = makeClassList();
  let _html = '';
  Object.defineProperty(el, 'innerHTML', { get(){ return _html; }, set(v){ _html = v; el.children.length = 0; } });
  return el;
}
const REGISTRY = new Map();
const byId = id => { if (!REGISTRY.has(id)) REGISTRY.set(id, makeEl(id)); return REGISTRY.get(id); };
const fakeDocument = {
  getElementById: byId,
  createElement: () => makeEl(),
  querySelector(sel) { if (sel === '.game-header .game-logo') return byId('__game-logo'); return makeEl(); },
  querySelectorAll: () => [],
  body: makeEl('body'),
  addEventListener(){}, removeEventListener(){},
};

function makeSandbox(opts) {
  opts = opts || {};
  REGISTRY.clear();
  const _fakeLS = opts.noRoguelite
    ? {}
    : { 'bt_enabled_dlcs_v1': JSON.stringify(['roguelite']) };
  const sb = {
    console, Math, Date, JSON, Intl, setTimeout, clearTimeout,
    document: fakeDocument,
    localStorage: {
      getItem(k){ return Object.prototype.hasOwnProperty.call(_fakeLS, k) ? _fakeLS[k] : null; },
      setItem(k, v){ _fakeLS[k] = String(v); },
      removeItem(k){ delete _fakeLS[k]; },
    },
    navigator: {},
    renderPortfolioTab(){},
    __TR: { pass: 0, fail: 0, log: [] },
  };
  sb.window = sb; sb.globalThis = sb;
  return sb;
}

function loadEngineSrc(opts) {
  opts = opts || {};
  const FILES = [
    'src/constants.js', 'src/events.js',
    'scenarios/agency.data.js', 'src/scenario-loader.js',
    'src/engine.js', 'src/projects.js', 'src/staff.js',
  ];
  let src = FILES
    .map(f => '// ===== ' + f + ' =====\n' + fs.readFileSync(path.join(ROOT, f), 'utf8'))
    .join('\n;\n');
  let rm = fs.readFileSync(path.join(ROOT, 'src/runmap.js'), 'utf8');
  if (opts.killSwitch) rm = rm.replace('const RUN_MAP_ENABLED = true;', 'const RUN_MAP_ENABLED = false;');
  src += '\n;\n// ===== src/runmap.js =====\n' + rm;
  return src;
}

const HARNESS = String.raw`
function _ok(c, m) { if (c) { __TR.pass++; __TR.log.push('✅ ' + m); } else { __TR.fail++; __TR.log.push('❌ ' + m); } }
function _eq(a, b, m) { _ok(a === b, m + ' (' + JSON.stringify(a) + ' === ' + JSON.stringify(b) + ')'); }
var __lastEv = null;
EventBus.on('show_event', function (p) { __lastEv = p.ev; });
function _pickChoice(idx) {
  if (!__lastEv) throw new Error('show_event ещё не выстрелил');
  const ch = (__lastEv.choices || [])[idx];
  if (!ch || typeof ch.fn !== 'function') throw new Error('choice без fn (idx=' + idx + ')');
  ch.fn(G);
  __lastEv = null;
}
`;

function run(name, body, opts) {
  opts = opts || {};
  const sb = makeSandbox({ noRoguelite: opts.noRoguelite });
  const src = loadEngineSrc(opts) + '\n;\n' + HARNESS + '\n;\n' + body;
  vm.createContext(sb);
  try { vm.runInContext(src, sb); }
  catch (e) { console.log('💥 [' + name + ']:', e.message); sb.__TR.fail++; }
  console.log('── ' + name + ' ──');
  sb.__TR.log.forEach(l => console.log(l));
  return sb.__TR;
}

const totals = { pass: 0, fail: 0 };
function add(r) { totals.pass += r.pass; totals.fail += r.fail; }

// ── 1: API доступно, этапы и бонусы ──
add(run('Тест 1: модуль активирован, API доступно', `
_ok(typeof RunMap === 'object', 'window.RunMap объявлен');
_ok(typeof RunMap.getStages === 'function', 'RunMap.getStages есть');
const stages = RunMap.getStages();
_eq(stages.length, 5, 'в карте 5 этапов');
_eq(stages[0].id, 'startup', 'первый этап = startup');
_eq(stages[stages.length - 1].id, 'endgame', 'последний = endgame');
const bonuses = RunMap.getBonuses();
_ok(bonuses.length >= 10, 'пул бонусов ≥ 10 (' + bonuses.length + ')');
_ok(bonuses.every(b => typeof b.apply === 'function'), 'у каждого бонуса есть apply');
`));

// ── 2: стартовый этап и пилюля ──
add(run('Тест 2: стартовый этап = Гараж, состояние инициализируется', `
initState(); selectSpec('smm'); startGame();
const cur = RunMap.getCurrent();
_eq(cur.id, 'startup', 'на старте — этап startup');
// G.runMap появляется после первого тика (advanceMonth)
advanceMonth();
_ok(G.runMap, 'G.runMap инициализирован');
_eq(G.runMap.stageIdx, 0, 'stageIdx = 0');
`));

// ── 3: milestone на границе monthEnd ──
add(run('Тест 3: на M6 (граница startup) выстреливает milestone foothold', `
initState(); selectSpec('smm'); startGame();
G.month = 6;
__lastEv = null;
advanceMonth();
_ok(__lastEv && __lastEv._runmap === true, 'выстрелил milestone-модал');
_ok((__lastEv.title || '').includes('Закрепление'), 'заголовок про новый этап');
_eq((__lastEv.choices || []).length, 3, 'ровно 3 варианта бонуса');
`));

// ── 4: выбор бонуса применяет эффект ──
add(run('Тест 4: выбор бонуса применяет эффект и продвигает этап', `
initState(); selectSpec('smm'); startGame();
G.month = 6;
advanceMonth();
const before = G.money;
// Берём первый бонус — какой бы он ни был, побочный эффект должен быть
const evRef = __lastEv;
_pickChoice(0);
_eq(G.runMap.stageIdx, 1, 'этап продвинулся на foothold');
_ok(G.runMap.choicesTaken.length === 1, 'выбор записан в choicesTaken');
// Какой-то G-канал должен был измениться (money/rep/perkPayoutMult/etc) — собирательная проверка
const changed = G.money !== before
  || G.reputation !== 60
  || (G.perkPayoutMult || 0) > 0
  || (G.runeOverheadBump || 0) !== 0
  || (G.caseQBonus || 0) > 0
  || (G.caseScoutBonus || 0) > 0
  || (G.caseRepBonus || 0) > 0
  || (G.speedUpgrades || 0) > 0
  || (G.perkPrepayBonus || 0) > 0
  || G.perkPenaltyShield === true
  || (G.portfolio || 0) > 0;
_ok(changed, 'хотя бы один G-канал изменился после применения бонуса');
`));

// ── 5: дубль milestone не выстреливает ──
add(run('Тест 5: повторные тики того же месяца не дублируют milestone', `
initState(); selectSpec('smm'); startGame();
G.month = 6;
advanceMonth();
const first = __lastEv;
_ok(first && first._runmap, 'первый тик: milestone выстрелил');
__lastEv = null;
// Повторный тик без выбора бонуса
G.month = 6;
RunMap._tick();
_ok(!__lastEv, 'повторный тик того же месяца — milestone НЕ дублируется');
`));

// ── 6: финальный этап не выкидывает milestone ──
add(run('Тест 6: финальный этап (endgame) — milestone больше не нужен', `
initState(); selectSpec('smm'); startGame();
advanceMonth();
// Проходим все этапы forced'ом
for (let i = 0; i < 4; i++) {
  _ok(RunMap.forceMilestone(), 'forceMilestone[' + i + '] вызвался');
  _pickChoice(0);
}
_eq(G.runMap.stageIdx, 4, 'дошли до endgame (idx=4)');
__lastEv = null;
G.month = 40;
advanceMonth();
_ok(!__lastEv || !__lastEv._runmap, 'на эндгейме milestone не выстреливает');
_ok(!RunMap.forceMilestone(), 'forceMilestone на эндгейме возвращает false');
`));

// ── 7: snapshot переносит G.runMap ──
add(run('Тест 7: G.runMap переносится через snapshot/restore', `
initState(); selectSpec('smm'); startGame();
G.month = 6; advanceMonth();
_pickChoice(0);
const snapshot = JSON.parse(JSON.stringify({ G: G, DECISIONS: DECISIONS }));
initState(); selectSpec('smm'); startGame();
_ok(!G.runMap || G.runMap.stageIdx === 0, 'после reset stageIdx=0');
Object.keys(snapshot.G).forEach(k => { G[k] = snapshot.G[k]; });
_eq(G.runMap.stageIdx, 1, 'после restore stageIdx=1');
`));

// ── 8: без DLC roguelite — модуль не активируется ──
add(run('Тест 8: без DLC roguelite — модуль не активируется', `
_ok(typeof RunMap === 'undefined', 'window.RunMap НЕ объявлен');
initState(); selectSpec('smm'); startGame();
__lastEv = null;
G.month = 6; advanceMonth();
_ok(!__lastEv || !__lastEv._runmap, 'milestone не выстреливает');
_ok(typeof G.runMap === 'undefined', 'G.runMap не появилась');
`, { noRoguelite: true }));

// ── 9: hard kill-switch ──
add(run('Тест 9: RUN_MAP_ENABLED=false — модуль выключен', `
_ok(typeof RunMap === 'undefined', 'window.RunMap НЕ объявлен (kill-switch)');
initState(); selectSpec('smm'); startGame();
G.month = 6; advanceMonth();
_ok(typeof G.runMap === 'undefined', 'G.runMap не появилась');
`, { killSwitch: true }));

console.log(`\nИтог: ${totals.pass}/${totals.pass + totals.fail} проверок прошли`);
if (totals.fail > 0) process.exit(1);
