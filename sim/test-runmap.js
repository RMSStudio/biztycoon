'use strict';
// ══════════════════════════════════════════════════════
//  Тест бонус-чекпоинта «Прокачки» (src/runmap.js, Ф.9)
//
//  После Ф.9 модуль БОЛЬШЕ НЕ ведёт собственную месячную лестницу.
//  Прогрессию/победу ведёт ядро (livingmarket, стадии компании).
//  Здесь под DLC «Прокачка» (mastery) на core-эвент `stage_reached`
//  показывается выбор 1 из 3 бонусов; выбор применяет эффект и пишет
//  историю в G.runMap.choicesTaken. Победу runmap НЕ фаерит.
//
//  Проверяем:
//   - модуль грузится при включённом DLC и регистрирует API (без getStages)
//   - stage_reached (idx≥1) → модал с 3 бонусами; idx 0 (Гараж) — без бонуса
//   - выбор бонуса применяет эффект, пишет choicesTaken, НЕ фаерит end_game
//   - forceStageBonus (debug) показывает модал
//   - G.runMap.choicesTaken переносится через snapshot
//   - без DLC mastery / при kill-switch модуль не активируется
//   - пул бонусов и фильтр по стадии (getBonusesForStage/bonusFitsStage) целы
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
  const scenarioFile = opts.scenario === 'bank' ? 'scenarios/bank.data.js' : 'scenarios/agency.data.js';
  const FILES = [
    'src/constants.js', 'src/events.js',
    scenarioFile, 'src/scenario-loader.js',
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
var __won = null;
EventBus.on('show_event', function (p) { __lastEv = p.ev; });
EventBus.on('end_game',  function (e) { __won = e; });
// Эмуляция повышения стадии компании (core-эвент livingmarket)
function _stageUp(idx, id, name) {
  __lastEv = null;
  EventBus.emit('stage_reached', { stage: { id: id || 'studio', name: name || 'Студия', icon: '🛠', idx: idx, sub: 'тест' } });
}
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

// ── 1: API доступно (без лестницы) ──
add(run('Тест 1: модуль активирован, API доступно (Ф.9 — без getStages)', `
_ok(typeof RunMap === 'object', 'window.RunMap объявлен');
_ok(typeof RunMap.getBonuses === 'function', 'RunMap.getBonuses есть');
_ok(typeof RunMap.getBonusesForStage === 'function', 'RunMap.getBonusesForStage есть');
_ok(typeof RunMap.bonusFitsStage === 'function', 'RunMap.bonusFitsStage есть');
_ok(typeof RunMap.forceStageBonus === 'function', 'RunMap.forceStageBonus есть');
_ok(typeof RunMap.getStages === 'undefined', 'getStages убран (лестница удалена)');
_ok(typeof RunMap.forceMilestone === 'undefined', 'forceMilestone убран');
const bonuses = RunMap.getBonuses();
_ok(bonuses.length >= 10, 'пул бонусов ≥ 10 (' + bonuses.length + ')');
_ok(bonuses.every(b => Array.isArray(b.effects) && b.effects.length >= 1),
    'у каждого бонуса есть effects[] для applyOps');
`));

// ── 2: stage_reached (idx≥1) под DLC → модал с 3 бонусами ──
add(run('Тест 2: повышение стадии компании → бонус-модал с 3 вариантами', `
initState(); selectSpec('smm'); startGame();
_stageUp(1, 'studio', 'Студия');
_ok(__lastEv && __lastEv._runmap === true, 'выстрелил бонус-модал');
_ok((__lastEv.title || '').includes('Студия'), 'заголовок содержит имя стадии (Студия)');
_eq((__lastEv.choices || []).length, 3, 'ровно 3 варианта бонуса');
`));

// ── 3: idx 0 (Гараж) — без бонуса ──
add(run('Тест 3: стартовая стадия Гараж (idx 0) — бонус не предлагается', `
initState(); selectSpec('smm'); startGame();
_stageUp(0, 'garage', 'Гараж');
_ok(!__lastEv, 'на Гараже (idx 0) модал НЕ выстреливает');
`));

// ── 4: выбор бонуса применяет эффект, пишет choicesTaken, НЕ фаерит победу ──
add(run('Тест 4: выбор бонуса — эффект + choicesTaken, без end_game и без stageIdx-продвижения', `
initState(); selectSpec('smm'); startGame();
const before = G.money;
__won = null;
_stageUp(1, 'studio', 'Студия');
_pickChoice(0);
_ok(G.runMap && G.runMap.choicesTaken.length === 1, 'выбор записан в choicesTaken');
_eq((G.runMap && G.runMap.stageIdx) || 0, 0, 'stageIdx НЕ продвигается (прогресс ведёт ядро)');
_ok(__won === null, 'runmap НЕ фаерит end_game (победа в ядре)');
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

// ── 5: forceStageBonus (debug) ──
add(run('Тест 5: forceStageBonus показывает модал', `
initState(); selectSpec('smm'); startGame();
__lastEv = null;
_ok(RunMap.forceStageBonus({ id:'agency', name:'Агентство', icon:'📈', idx:2, sub:'' }), 'forceStageBonus вернул true');
_ok(__lastEv && __lastEv._runmap, 'модал выстрелил');
_ok((__lastEv.title || '').includes('Агентство'), 'заголовок содержит имя стадии');
`));

// ── 6: snapshot переносит choicesTaken ──
add(run('Тест 6: G.runMap.choicesTaken переносится через snapshot/restore', `
initState(); selectSpec('smm'); startGame();
_stageUp(1, 'studio', 'Студия');
_pickChoice(0);
const snapshot = JSON.parse(JSON.stringify({ G: G, DECISIONS: DECISIONS }));
initState(); selectSpec('smm'); startGame();
Object.keys(snapshot.G).forEach(k => { G[k] = snapshot.G[k]; });
_ok(G.runMap && G.runMap.choicesTaken.length === 1, 'после restore choicesTaken сохранён');
`));

// ── 7: без DLC mastery — модуль не активируется ──
add(run('Тест 7: без DLC mastery — модуль не активируется', `
_ok(typeof RunMap === 'undefined', 'window.RunMap НЕ объявлен');
initState(); selectSpec('smm'); startGame();
__lastEv = null;
EventBus.emit('stage_reached', { stage: { id:'studio', name:'Студия', icon:'🛠', idx:1 } });
_ok(!__lastEv, 'бонус-модал не выстреливает без DLC');
_ok(typeof G.runMap === 'undefined', 'G.runMap не появилась');
`, { noMastery: true }));

// ── 8: hard kill-switch ──
add(run('Тест 8: RUN_MAP_ENABLED=false — модуль выключен', `
_ok(typeof RunMap === 'undefined', 'window.RunMap НЕ объявлен (kill-switch)');
initState(); selectSpec('smm'); startGame();
__lastEv = null;
EventBus.emit('stage_reached', { stage: { id:'studio', name:'Студия', icon:'🛠', idx:1 } });
_ok(!__lastEv, 'бонус-модал не выстреливает (kill-switch)');
`, { killSwitch: true }));

// ── 9: bank-сценарий — свой пул бонусов (Тип C) ──
add(run('Тест 9: bank — свой тематический пул бонусов', `
_ok(typeof SCENARIO === 'object', 'SCENARIO загружен');
_eq(SCENARIO.id, 'bank', 'SCENARIO.id = bank');
const bonuses = RunMap.getBonuses();
_eq(bonuses.length, 23, 'у банка 12 универсальных + 11 этап-эксклюзивов = 23');
const ids = bonuses.map(b => b.id);
_ok(ids.includes('deposit_base'), 'есть deposit_base (Депозитная база)');
_ok(ids.includes('scoring'),      'есть scoring (Скоринг-модель)');
_ok(ids.includes('regulator'),    'есть regulator (Лобби в регуляторе)');
_ok(!ids.includes('cash'),        'нет агентского cash — банк свой пул');
_ok(ids.includes('core_banking'),    'есть core_banking (эксклюзив bank_retail)');
_ok(ids.includes('spo_capital'),     'есть spo_capital (эксклюзив bank_topten)');
`, { scenario: 'bank' }));

// ── 10: DSL-эффекты применяются — money, gAdd, gSet, overheadBump ──
add(run('Тест 10: DSL-эффекты бонусов через applyOps реально мутируют G', `
initState(); selectSpec('smm'); startGame();
const baseOverhead = SCENARIO.settings.overhead;
ScenarioLoader.applyOps([{ money: 250000 }], G);
_eq(G.money, SCENARIO.settings.startMoney + 250000, 'money +250 000');
const beforeMult = G.perkPayoutMult || 0;
ScenarioLoader.applyOps([{ gAdd: { perkPayoutMult: 0.05 } }], G);
_ok(Math.abs((G.perkPayoutMult || 0) - (beforeMult + 0.05)) < 1e-9, 'perkPayoutMult +0.05');
ScenarioLoader.applyOps([{ gAdd: { caseQBonus: 5 } }], G);
_eq(G.caseQBonus, 5, 'caseQBonus = 5');
ScenarioLoader.applyOps([{ gSet: { perkPenaltyShield: true } }], G);
_eq(G.perkPenaltyShield, true, 'gSet → perkPenaltyShield = true');
ScenarioLoader.applyOps([{ overheadBump: -0.10 }], G);
_eq(G.runeOverheadBump, -Math.round(baseOverhead * 0.10), 'overheadBump -10% → runeOverheadBump = -base×0.10');
`));

// ── 11: фильтр по СТАДИИ КОМПАНИИ — getBonusesForStage (bank, Ф.9 перепривязка) ──
// Эксклюзивы перепривязаны к стадиям компании: retail→agency, private→holding, topten→empire.
add(run('Тест 11: getBonusesForStage — эксклюзивы банка на стадиях компании', `
_ok(typeof RunMap.bonusFitsStage === 'function', 'API bonusFitsStage есть');
_ok(typeof RunMap.getBonusesForStage === 'function', 'API getBonusesForStage есть');
const onAgency  = RunMap.getBonusesForStage('agency').map(b => b.id);
const onEmpire  = RunMap.getBonusesForStage('empire').map(b => b.id);
const onHolding = RunMap.getBonusesForStage('holding').map(b => b.id);
_ok(onAgency.includes('deposit_base'),  'agency: universal deposit_base виден');
_ok(onAgency.includes('core_banking'),  'agency: эксклюзив core_banking (retail→agency) виден');
_ok(!onAgency.includes('spo_capital'),  'agency: SPO (empire-эксклюзив) НЕ виден');
_ok(onEmpire.includes('spo_capital'),   'empire: SPO (topten→empire) виден');
_ok(!onEmpire.includes('core_banking'), 'empire: core_banking (agency) НЕ виден');
_ok(onHolding.includes('vip_office'),   'holding: VIP (private→holding) виден');
_ok(!onHolding.includes('spo_capital'), 'holding: SPO НЕ виден');
`, { scenario: 'bank' }));

// ── 12: агентство — эксклюзивы на стадиях компании (Ф.9 перепривязка) ──
// garage-эра→studio, brand→holding, endgame→empire.
add(run('Тест 12: агентство — getBonusesForStage фильтрует эксклюзивы (стадии компании)', `
const onStudio  = RunMap.getBonusesForStage('studio').map(b => b.id);
const onHolding = RunMap.getBonusesForStage('holding').map(b => b.id);
const onEmpire  = RunMap.getBonusesForStage('empire').map(b => b.id);
_ok(onStudio.includes('word_of_mouth'),     'studio: word_of_mouth (garage→studio) виден');
_ok(!onStudio.includes('boutique_premium'), 'studio: бутик (empire) НЕ виден');
_ok(onHolding.includes('thought_leader'),   'holding: thought_leader (brand→holding) виден');
_ok(!onHolding.includes('boutique_premium'),'holding: бутик (empire) НЕ виден');
_ok(onEmpire.includes('boutique_premium'),  'empire: бутик (endgame→empire) виден');
_ok(onStudio.includes('cash') && onHolding.includes('cash') && onEmpire.includes('cash'),
    'универсальный cash виден на всех стадиях');
`));

// ── 13: агентство runMap бонусы НЕ регрессировали (страховка значений) ──
add(run('Тест 13: agency bonusy — значения не тронуты (страховка)', `
const byId = id => RunMap.getBonuses().find(b => b.id === id);
_eq(byId('cash').effects[0].money,                  250000, 'agency: cash money 250K не тронут');
_ok(Math.abs(byId('payout').effects[0].gAdd.perkPayoutMult - 0.05) < 1e-9, 'agency: payout +5% не тронут');
_ok(Math.abs(byId('overhead').effects[0].overheadBump - (-0.10)) < 1e-9, 'agency: overhead −10% не тронут');
_eq(byId('fatigue').effects[0].fatigue,                -15, 'agency: fatigue −15 не тронут');
_eq(byId('portfolio').effects[0].gAdd.portfolio,        10, 'agency: portfolio +10 не тронут');
`));

console.log(`\nИтог: ${totals.pass}/${totals.pass + totals.fail} проверок прошли`);
if (totals.fail > 0) process.exit(1);
