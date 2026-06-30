'use strict';
// ══════════════════════════════════════════════════════
//  Тест сюжетных арок (src/storyarcs.js)
//  Проверяем:
//   - модуль грузится и регистрирует API window.StoryArcs
//   - арки видны из SCENARIO.storyArcs
//   - гидрация даёт choice.fn после первого тика
//   - StoryArcs.fire() запускает арку (детерминистично)
//   - выбор choice применяет эффекты + продвигает стадию
//   - end:true завершает арку, переводит в completed
//   - триггер по minMonth работает (не стреляет раньше)
//   - кулдаун между арками работает
//   - сейв/лоад: G.arcState переносится через _restore
//   - STORY_ARCS_ENABLED=false выключает всё
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
  // Гейт DLC «Rogue-lite»: арки активируются только если включён DLC
  // (по умолчанию включён в тестах; передать noMastery:true для negative-test)
  const _fakeLS = opts.noMastery
    ? {}
    : { 'bt_enabled_dlcs_v1': JSON.stringify(['mastery']) };
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
  const scenarioFile = opts.scenario || 'scenarios/agency.data.js';
  const FILES = [
    'src/constants.js', 'src/events.js',
    scenarioFile, 'src/scenario-loader.js',
    'src/engine.js', 'src/projects.js', 'src/staff.js',
  ];
  let src = FILES
    .map(f => '// ===== ' + f + ' =====\n' + fs.readFileSync(path.join(ROOT, f), 'utf8'))
    .join('\n;\n');
  let arcs = fs.readFileSync(path.join(ROOT, 'src/storyarcs.js'), 'utf8');
  if (opts.disabled) arcs = arcs.replace('const STORY_ARCS_ENABLED = true;', 'const STORY_ARCS_ENABLED = false;');
  src += '\n;\n// ===== src/storyarcs.js =====\n' + arcs;
  return src;
}

const HARNESS = String.raw`
function _ok(c, m) { if (c) { __TR.pass++; __TR.log.push('✅ ' + m); } else { __TR.fail++; __TR.log.push('❌ ' + m); } }
function _eq(a, b, m) { _ok(a === b, m + ' (' + JSON.stringify(a) + ' === ' + JSON.stringify(b) + ')'); }
// Перехват show_event: запоминаем последнее ev и кликаем choice по индексу
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
  const sb = makeSandbox({ noMastery: opts.noMastery });
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

// ── 1: модуль грузится, API ──
add(run('Тест 1: модуль грузится, API доступно', `
_ok(typeof StoryArcs === 'object', 'window.StoryArcs объявлен');
_ok(typeof StoryArcs.fire === 'function', 'StoryArcs.fire есть');
_ok(typeof StoryArcs.getArcs === 'function', 'StoryArcs.getArcs есть');
const arcs = StoryArcs.getArcs();
_ok(arcs.length >= 2, 'agency: минимум 2 арки в сценарии (' + arcs.length + ')');
_ok(arcs.some(a => a.id === 'old_friend'), 'есть арка old_friend');
_ok(arcs.some(a => a.id === 'burnout_signal'), 'есть арка burnout_signal');
`));

// ── 2: гидрация — choice.fn появляется ──
add(run('Тест 2: гидрация — choice.fn после первого тика', `
initState(); selectSpec('smm');
// До тика — fn не привязаны
const arc = StoryArcs.getArcs().find(a => a.id === 'old_friend');
_ok(typeof arc.stages[0].choices[0].fn !== 'function', 'до тика fn ещё нет');
StoryArcs._hydrate();
_ok(typeof arc.stages[0].choices[0].fn === 'function', 'после гидрации fn привязан');
`));

// ── 3: StoryArcs.fire запускает арку ──
add(run('Тест 3: StoryArcs.fire запускает арку и эмитит show_event', `
initState(); selectSpec('smm');
// G нужно инициализировать с минимумом полей — startGame
startGame();
StoryArcs.fire('old_friend');
_ok(__lastEv && __lastEv._arc === true, 'выстрелил show_event с _arc=true');
_eq(__lastEv && __lastEv.arcId, 'old_friend', 'arcId = old_friend');
_eq(__lastEv && __lastEv.stage, 'intro', 'стадия = intro');
_ok((__lastEv.choices || []).length >= 2, 'есть варианты выбора');
const st = StoryArcs.getState();
_ok(st && st.inProgress && st.inProgress.arcId === 'old_friend', 'арка в G.arcState.inProgress');
`));

// ── 4: choice применяет эффекты и продвигает стадию ──
add(run('Тест 4: choice продвигает стадию по next', `
initState(); selectSpec('smm'); startGame();
StoryArcs.fire('old_friend');
const repBefore = G.reputation;
_pickChoice(0);  // 'Согласиться' — next: 'meeting', rep +2
_ok(G.reputation === repBefore + 2, 'rep вырос на +2 (' + G.reputation + ' vs ' + repBefore + ')');
const st = StoryArcs.getState();
_eq(st.inProgress.stageId, 'meeting', 'inProgress.stageId = meeting');
_ok(st.inProgress.nextMonth >= G.month + 1, 'nextMonth отложен (stageDelayMonths=2)');
`));

// ── 5: end:true завершает арку ──
add(run('Тест 5: end:true завершает арку, попадает в completed', `
initState(); selectSpec('smm'); startGame();
StoryArcs.fire('old_friend');
_pickChoice(1);  // 'Отказаться' — end:true
const st = StoryArcs.getState();
_ok(!st.inProgress, 'inProgress = null после end');
_ok(st.completed.includes('old_friend'), 'old_friend в completed');
_ok(st.cooldown > 0, 'cooldown активен (' + st.cooldown + ')');
`));

// ── 6: триггер minMonth — не стреляет раньше ──
add(run('Тест 6: minMonth — арка не появляется раньше срока', `
initState(); selectSpec('smm'); startGame();
G.month = 0; G.reputation = 100; G.portfolio = 50;
// 50 попыток тика на месяц 0 — minMonth=3 для old_friend
let fired = 0;
for (let i = 0; i < 50; i++) {
  __lastEv = null;
  StoryArcs._tick();
  if (__lastEv && __lastEv._arc) fired++;
}
_eq(fired, 0, 'до minMonth=3 арки не стреляли');
// Сдвигаем месяц вперёд — должны иметь возможность выстрелить
G.month = 5;
let firedLater = 0;
for (let i = 0; i < 30; i++) {
  // Сбрасываем кулдаун и прогресс для каждой попытки
  G.arcState = { completed: [], inProgress: null, cooldown: 0 };
  __lastEv = null;
  StoryArcs._tick();
  if (__lastEv && __lastEv._arc) firedLater++;
}
_ok(firedLater > 0, 'после minMonth — арки начали стрелять (' + firedLater + '/30)');
`));

// ── 7: кулдаун — между арками пауза ──
add(run('Тест 7: cooldown между арками', `
initState(); selectSpec('smm'); startGame();
G.month = 5; G.reputation = 100; G.portfolio = 50;
StoryArcs.fire('old_friend');
_pickChoice(1);  // end:true
const st = StoryArcs.getState();
const cd0 = st.cooldown;
_ok(cd0 > 0, 'кулдаун стартовый > 0 (' + cd0 + ')');
// Тикаем — кулдаун должен убывать
StoryArcs._tick();
_ok(st.cooldown === cd0 - 1, 'кулдаун уменьшился на 1');
// Пока кулдаун > 0 — новая арка не должна стрелять
__lastEv = null;
for (let i = 0; i < 4; i++) StoryArcs._tick();
_ok(!__lastEv, 'во время кулдауна арка не стартует');
`));

// ── 8: сейв/лоад G.arcState переносится ──
add(run('Тест 8: G.arcState переносится через сериализацию (snapshot)', `
initState(); selectSpec('smm'); startGame();
StoryArcs.fire('old_friend');
_pickChoice(0);  // next: 'meeting'
const snapshot = JSON.parse(JSON.stringify({ G: G, DECISIONS: DECISIONS }));
// Чистая инициализация — арки сброшены
initState(); selectSpec('smm'); startGame();
_ok(!StoryArcs.getState() || !StoryArcs.getState().inProgress, 'после reset — arcState чист');
// Восстанавливаем (имитация _restore из saves.js)
Object.keys(snapshot.G).forEach(k => { G[k] = snapshot.G[k]; });
const st = StoryArcs.getState();
_ok(st && st.inProgress && st.inProgress.arcId === 'old_friend', 'после restore арка снова inProgress');
_eq(st.inProgress.stageId, 'meeting', 'stageId сохранён');
`));

// ── 9: STORY_ARCS_ENABLED=false ──
add(run('Тест 9: модуль выкл. при STORY_ARCS_ENABLED=false', `
_ok(typeof StoryArcs === 'undefined', 'window.StoryArcs НЕ объявлен');
initState(); selectSpec('smm'); startGame();
__lastEv = null;
G.month = 5; G.reputation = 100;
advanceMonth();
const wasArc = __lastEv && __lastEv._arc;
_ok(!wasArc, 'после advanceMonth ни одна арка не выстрелила');
_ok(typeof G.arcState === 'undefined', 'G.arcState не появилась');
`, { disabled: true }));

// ── 10: bank сценарий — арки видны ──
add(run('Тест 10: bank сценарий — storyArcs подключены', `
initState(); selectSpec(Object.keys(SPECS)[0]); startGame();
const arcs = StoryArcs.getArcs();
_ok(arcs.length >= 2, 'bank: минимум 2 арки (' + arcs.length + ')');
_ok(arcs.some(a => a.id === 'regulator_call'), 'есть арка regulator_call');
StoryArcs.fire('regulator_call');
_ok(__lastEv && __lastEv._arc === true, 'regulator_call запустился');
_pickChoice(0);  // Подготовиться — next: 'audit_result'
const st = StoryArcs.getState();
_eq(st.inProgress.stageId, 'audit_result', 'стадия audit_result');
`, { scenario: 'scenarios/bank.data.js' }));

// ── 11: DLC mastery не включён — арки не активируются ──
add(run('Тест 11: без DLC mastery — арки не активируются', `
_ok(typeof StoryArcs === 'undefined', 'window.StoryArcs НЕ объявлен (DLC выключен)');
initState(); selectSpec('smm'); startGame();
__lastEv = null;
G.month = 5; G.reputation = 100;
advanceMonth();
const wasArc = __lastEv && __lastEv._arc;
_ok(!wasArc, 'после advanceMonth ни одна арка не выстрелила');
_ok(typeof G.arcState === 'undefined', 'G.arcState не появилась');
`, { noMastery: true }));

// ── 12: v3.20 — новые арки агентства подключены ──
add(run('Тест 12: v3.20 agency — pivot_offer / tender_invite в пуле', `
const arcs = StoryArcs.getArcs();
_ok(arcs.some(a => a.id === 'pivot_offer'),   'агентство: арка pivot_offer есть');
_ok(arcs.some(a => a.id === 'tender_invite'), 'агентство: арка tender_invite есть');
_eq(arcs.length, 4, 'агентство: всего 4 арки (old_friend, burnout_signal, pivot_offer, tender_invite)');
const pivot = arcs.find(a => a.id === 'pivot_offer');
_eq((pivot.trigger || {}).requires, 'old_friend', 'pivot_offer.trigger.requires = old_friend');
const tender = arcs.find(a => a.id === 'tender_invite');
_ok(!(tender.trigger && tender.trigger.requires), 'tender_invite БЕЗ requires (стартует независимо)');
_eq((tender.trigger || {}).minPortfolio, 5, 'tender_invite требует minPortfolio 5');
`));

// ── 13: pivot_offer.requires — без old_friend не появляется (по поведению) ──
add(run('Тест 13: pivot_offer.requires — гейт через completed', `
initState(); selectSpec('smm'); startGame();
G.month = 15; G.reputation = 70; G.portfolio = 12;
let firedWithout = 0;
for (let i = 0; i < 80; i++) {
  G.arcState = { completed: [], inProgress: null, cooldown: 0 };
  __lastEv = null;
  StoryArcs._tick();
  if (__lastEv && __lastEv._arc && __lastEv.arcId === 'pivot_offer') firedWithout++;
}
_eq(firedWithout, 0, 'без old_friend в completed pivot_offer НЕ стреляет (80 попыток)');
// С old_friend в completed — должна иметь шанс выстрелить
let firedWith = 0;
for (let i = 0; i < 80; i++) {
  G.arcState = { completed: ['old_friend'], inProgress: null, cooldown: 0 };
  __lastEv = null;
  StoryArcs._tick();
  if (__lastEv && __lastEv._arc && __lastEv.arcId === 'pivot_offer') firedWith++;
}
_ok(firedWith > 0, 'с old_friend в completed pivot_offer стреляет (' + firedWith + '/80)');
`));

// ── 14: tender_invite — ветвление через 3 choices ──
add(run('Тест 14: tender_invite — 3 ветки в первой стадии', `
initState(); selectSpec('smm'); startGame();
G.month = 8; G.reputation = 50; G.portfolio = 8;
StoryArcs.fire('tender_invite');
_ok(__lastEv && __lastEv._arc && __lastEv.arcId === 'tender_invite', 'tender_invite запустился');
_eq(__lastEv.choices.length, 3, 'первая стадия имеет 3 ветки');
_ok(__lastEv.choices[0].text.toLowerCase().includes('соло'),       'ветка 0 — соло');
_ok(__lastEv.choices[1].text.toLowerCase().includes('консорциум'), 'ветка 1 — консорциум');
_ok(__lastEv.choices[2].text.toLowerCase().includes('отказ'),      'ветка 2 — отказ');
`));

// ── 15: tender_invite solo → solo_resolve ──
add(run('Тест 15: tender_invite solo → solo_resolve', `
initState(); selectSpec('smm'); startGame();
G.month = 8; G.reputation = 50; G.portfolio = 8;
StoryArcs.fire('tender_invite');
_pickChoice(0);  // solo
const st = StoryArcs.getState();
_ok(st.inProgress, 'арка in progress после solo');
_eq(st.inProgress.stageId, 'solo_resolve', 'переход на solo_resolve');
`));

// ── 16: tender_invite consortium → consortium_resolve ──
add(run('Тест 16: tender_invite consortium → consortium_resolve', `
initState(); selectSpec('smm'); startGame();
G.month = 8; G.reputation = 50; G.portfolio = 8;
StoryArcs.fire('tender_invite');
_pickChoice(1);  // consortium
const st = StoryArcs.getState();
_ok(st.inProgress, 'арка in progress после consortium');
_eq(st.inProgress.stageId, 'consortium_resolve', 'переход на consortium_resolve');
`));

// ── 17: tender_invite decline → end сразу ──
add(run('Тест 17: tender_invite decline → end сразу', `
initState(); selectSpec('smm'); startGame();
G.month = 8; G.reputation = 50; G.portfolio = 8;
StoryArcs.fire('tender_invite');
_pickChoice(2);  // decline
const st = StoryArcs.getState();
_ok(!st.inProgress, 'арка завершена (inProgress = null)');
_ok(st.completed.includes('tender_invite'), 'tender_invite в completed');
_ok(st.cooldown > 0, 'кулдаун выставлен');
`));

// ── 18: v3.20 — новые арки банка подключены ──
add(run('Тест 18: v3.20 bank — data_breach / regional_expansion в пуле', `
const arcs = StoryArcs.getArcs();
_ok(arcs.some(a => a.id === 'data_breach'),         'банк: арка data_breach есть');
_ok(arcs.some(a => a.id === 'regional_expansion'),  'банк: арка regional_expansion есть');
_eq(arcs.length, 4, 'банк: всего 4 арки (regulator_call, vip_client_pivot, data_breach, regional_expansion)');
const reg = arcs.find(a => a.id === 'regional_expansion');
_eq((reg.trigger || {}).requires, 'regulator_call', 'regional_expansion.requires = regulator_call');
const breach = arcs.find(a => a.id === 'data_breach');
_ok(!(breach.trigger && breach.trigger.requires), 'data_breach БЕЗ requires');
`, { scenario: 'scenarios/bank.data.js' }));

// ── 19: data_breach leak → apology ──
add(run('Тест 19: data_breach leak → apology', `
initState(); selectSpec(Object.keys(SPECS)[0]); startGame();
G.month = 10; G.reputation = 60; G.portfolio = 8;
StoryArcs.fire('data_breach');
_ok(__lastEv && __lastEv._arc, 'data_breach запустился');
_eq(__lastEv.stage, 'leak', 'стартовая стадия leak');
_eq(__lastEv.choices.length, 2, 'leak имеет 2 ветки');
_pickChoice(0);  // apology
const st = StoryArcs.getState();
_eq(st.inProgress.stageId, 'apology', 'ветка 0 → apology');
`, { scenario: 'scenarios/bank.data.js' }));

// ── 20: data_breach leak → silence ──
add(run('Тест 20: data_breach leak → silence (альтернативная ветка)', `
initState(); selectSpec(Object.keys(SPECS)[0]); startGame();
G.month = 10; G.reputation = 60; G.portfolio = 8;
StoryArcs.fire('data_breach');
_pickChoice(1);  // silence
const st = StoryArcs.getState();
_eq(st.inProgress.stageId, 'silence', 'ветка 1 → silence');
`, { scenario: 'scenarios/bank.data.js' }));

console.log(`\nИтог: ${totals.pass}/${totals.pass + totals.fail} проверок прошли`);
if (totals.fail > 0) process.exit(1);
