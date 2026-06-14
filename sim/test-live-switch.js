'use strict';
// ══════════════════════════════════════════════════════
//  Тест live-переключения сценария и сложности (v3.18)
//
//  Проверяем:
//   - rebindFromScenario() переписывает SPECS/PROJECT_POOL/UPGRADES/
//     OVERHEAD/SCOUT_COST из текущего SCENARIO
//   - смена SCENARIO (replace) + initState() обновляет let-биндинги
//     движка без перезапуска скрипта
//   - смена сложности через ScenarioLoader.applyDifficulty → новые
//     OVERHEAD/winCondition/startMoney/startReputation; initState
//     даёт G со стартовыми значениями нового пресета
// ══════════════════════════════════════════════════════

const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

const ROOT = path.join(__dirname, '..');

const BANK_DATA_SRC = fs.readFileSync(path.join(ROOT, 'scenarios/bank.data.js'), 'utf8');

function makeSandbox() {
  const sb = {
    console, Math, Date, JSON, Intl, setTimeout, clearTimeout,
    localStorage: {
      _s: {},
      getItem(k){ return Object.prototype.hasOwnProperty.call(this._s, k) ? this._s[k] : null; },
      setItem(k, v){ this._s[k] = String(v); },
      removeItem(k){ delete this._s[k]; },
    },
    navigator: {},
    __TR: { pass: 0, fail: 0, log: [] },
    BANK_DATA_SRC,
  };
  sb.window = sb; sb.globalThis = sb;
  return sb;
}

function loadEngineWith(scenarioFile) {
  const FILES = [
    'src/constants.js', 'src/events.js',
    scenarioFile, 'src/scenario-loader.js',
    'src/engine.js', 'src/projects.js', 'src/staff.js',
  ];
  return FILES
    .map(f => '// ===== ' + f + ' =====\n' + fs.readFileSync(path.join(ROOT, f), 'utf8'))
    .join('\n;\n');
}

// Каркас: грузим engine с agency, затем в той же vm-context подменяем
// SCENARIO_DATA через bank.data.js, вызываем hydrate+rebind+initState
// и проверяем что биндинги переехали.
const HARNESS = String.raw`
function _ok(c, m) { if (c) { __TR.pass++; __TR.log.push('✅ ' + m); } else { __TR.fail++; __TR.log.push('❌ ' + m); } }
function _eq(a, b, m) { _ok(a === b, m + ' (' + JSON.stringify(a) + ' === ' + JSON.stringify(b) + ')'); }
`;

const totals = { pass: 0, fail: 0 };
function add(r) { totals.pass += r.pass; totals.fail += r.fail; r.log.forEach(l => console.log(l)); }
function run(name, body) {
  console.log('── ' + name + ' ──');
  const sb = makeSandbox();
  vm.createContext(sb);
  try { vm.runInContext(loadEngineWith('scenarios/agency.data.js') + '\n;\n' + HARNESS + '\n;\n' + body, sb); }
  catch (e) { console.log('💥 ' + name + ':', e.message); sb.__TR.fail++; }
  add(sb.__TR);
}

// ── 1: rebindFromScenario / initState переписывают биндинги под текущий SCENARIO
run('Тест 1: rebindFromScenario доступен, инициализация на agency', `
_ok(typeof rebindFromScenario === 'function', 'rebindFromScenario есть');
_ok(typeof SCENARIO === 'object', 'SCENARIO объявлен');
_eq(SCENARIO.id, 'agency', 'стартовый сценарий — agency');
_ok(Array.isArray(SPECS) || typeof SPECS === 'object', 'SPECS из agency прокинут');
_ok(Object.keys(SPECS).includes('smm'), 'у agency есть spec smm');
const baseOverhead = SCENARIO.settings.overhead;
_eq(OVERHEAD, baseOverhead, 'OVERHEAD = agency.settings.overhead');
`);

// ── 2: подмена SCENARIO_DATA на bank → hydrate+rebind+initState
run('Тест 2: live-смена сценария agency → bank без перезапуска скрипта', `
// Подгружаем data банка как новый SCENARIO_DATA — ровно так же,
// как это делает switchScenarioLive() в multi-дисте: через new Function
// над исходником из __SCEN_SRC. В тесте исходник прокидывается как BANK_DATA_SRC.
(new Function(BANK_DATA_SRC))();
SCENARIO = ScenarioLoader.hydrate(window.SCENARIO_DATA);
rebindFromScenario();
_eq(SCENARIO.id, 'bank', 'SCENARIO.id переключился на bank');
_ok(!Object.keys(SPECS).includes('smm'),     'agency-spec smm более не доступен (SPECS обновлён)');
_ok(Object.keys(SPECS).length > 0,           'у bank есть свои specs');
_eq(OVERHEAD, SCENARIO.settings.overhead,    'OVERHEAD пересчитан под bank');
_eq(PROJECT_POOL, SCENARIO.projects,         'PROJECT_POOL указывает на bank.projects');
_eq(UPGRADES, SCENARIO.upgrades,             'UPGRADES обновлён');
_eq(EVENTS, SCENARIO.events,                 'EVENTS обновлён');
// initState + selectSpec + startGame — G строится из bank.settings
initState();
const bankSpec = Object.keys(SPECS)[0];
selectSpec(bankSpec);
startGame();
_eq(G.money, SCENARIO.settings.startMoney, 'после startGame G.money = bank.settings.startMoney');
_eq(G.reputation, SCENARIO.settings.startReputation ?? 100, 'G.reputation = bank.settings.startReputation');
`);

// ── 3: live-смена сложности (без перезапуска)
run('Тест 3: live-смена сложности — applyDifficulty + rebindFromScenario', `
const baseOverhead = SCENARIO.settings.overhead;
const baseStart    = SCENARIO.settings.startMoney;
const baseWin      = SCENARIO.settings.winCondition;
// easy: startMoneyMul=1.4, overheadMul=0.75, winConditionMul=0.7
ScenarioLoader.applyDifficulty(SCENARIO, 'easy');
rebindFromScenario();
_ok(SCENARIO.settings.overhead     < baseOverhead, 'overhead уменьшился (easy×0.75)');
_ok(SCENARIO.settings.startMoney   > baseStart,    'startMoney вырос (easy×1.4)');
_ok(SCENARIO.settings.winCondition < baseWin,      'winCondition стал меньше (easy×0.7)');
_eq(OVERHEAD, SCENARIO.settings.overhead, 'OVERHEAD пересинхронизирован');
initState();
const sp = Object.keys(SPECS)[0];
selectSpec(sp); startGame();
_eq(G.money, SCENARIO.settings.startMoney, 'после startGame G.money отражает новый старт easy');

// hard: overheadMul=1.35
ScenarioLoader.applyDifficulty(SCENARIO, 'hard');
rebindFromScenario();
_ok(OVERHEAD > baseOverhead * 0.75, 'после hard OVERHEAD больше easy-значения');
`);

// ── 4: rebindFromScenario устойчив к повторному вызову
run('Тест 4: rebindFromScenario идемпотентен (повторный вызов не ломает)', `
const before = { OVERHEAD, ACTIONS_PER_MONTH, SCOUT_COST, HIRE_COST };
rebindFromScenario();
rebindFromScenario();
_eq(OVERHEAD, before.OVERHEAD, 'OVERHEAD стабилен');
_eq(ACTIONS_PER_MONTH, before.ACTIONS_PER_MONTH, 'ACTIONS_PER_MONTH стабилен');
_eq(SCOUT_COST, before.SCOUT_COST, 'SCOUT_COST стабилен');
_eq(HIRE_COST, before.HIRE_COST, 'HIRE_COST стабилен');
`);

console.log('\nИтог: ' + totals.pass + '/' + (totals.pass + totals.fail) + ' проверок прошли');
if (totals.fail > 0) process.exit(1);
