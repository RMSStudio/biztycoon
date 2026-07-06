'use strict';
// ══════════════════════════════════════════════════════
//  Слой основателя × TraitEngine (§7-quinque/sextus, v3.106)
//  Проверяем:
//   - FOUNDER_TRAITS регистрируются, каталог валиден, в скаут-пул НЕ попадают
//   - initState создаёт G.founder (черта f_* + порок fv_*), параметры с дефолтами
//   - характер РАБОТАЕТ: моды на проектах без назначения (основатель везде),
//     синергия с составом/узлами, порок-дебафы (onMonth/calcRisk), chance-правила
//   - вне режима Rogue-lite — полный no-op
//   - paramAdd клампит 0..100 и эмитит founder_param
// ══════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');

function sandbox(modeOn) {
  const ls = {};
  if (modeOn) ls['bt_enabled_dlcs_v1'] = JSON.stringify(['unlocks']);
  const sb = {
    console, JSON, Math: Object.create(Math),
    localStorage: {
      getItem: k => (Object.prototype.hasOwnProperty.call(ls, k) ? ls[k] : null),
      setItem: (k, v) => { ls[k] = String(v); },
      removeItem: k => { delete ls[k]; },
    },
    __TR: { pass: 0, fail: 0, log: [] },
  };
  sb.window = sb; sb.globalThis = sb;
  return sb;
}

const HARNESS = `
function _ok(c,m){ if(c){__TR.pass++;__TR.log.push('✅ '+m);}else{__TR.fail++;__TR.log.push('❌ '+m);} }
function _staff(o){ return Object.assign({ _iid:'s'+Math.random(), id:'x', role:'designer', grade:'middle',
  mood:70, cost:50000, status:'active', qStat:6, rlTraits:[] }, o||{}); }
function _proj(o){ return Object.assign({ id:'p1', tier:2, _assignedStaff:[], _monthsSigned:1, _duration:5 }, o||{}); }
`;

function run(name, modeOn, body) {
  const sb = sandbox(modeOn);
  const src = [
    fs.readFileSync(path.join(ROOT, 'src/events.js'), 'utf8'),
    fs.readFileSync(path.join(ROOT, 'src/unlocks.js'), 'utf8'),
    fs.readFileSync(path.join(ROOT, 'src/founder.js'), 'utf8'),
    fs.readFileSync(path.join(ROOT, 'src/traits-data.js'), 'utf8'),
    fs.readFileSync(path.join(ROOT, 'src/traits.js'), 'utf8'),
    HARNESS, body,
  ].join('\n;\n');
  vm.createContext(sb);
  try { vm.runInContext(src, sb); }
  catch (e) { console.log('💥 [' + name + ']:', e.message); sb.__TR.fail++; }
  console.log('── ' + name + ' ──');
  sb.__TR.log.forEach(l => console.log(l));
  return sb.__TR;
}

const totals = { pass: 0, fail: 0 };
function add(r) { totals.pass += r.pass; totals.fail += r.fail; }

// 1: регистрация и изоляция от скаут-пула
add(run('Тест 1: FOUNDER_TRAITS в движке, но не в скауте', true, `
_ok(Founder.FOUNDER_TRAITS.length === 31, '31 характер-трейт (14 черт + 17 пороков)');
_ok(!!TraitEngine.get('f_perfectionist') && !!TraitEngine.get('fv_burnout'), 'зарегистрированы в TraitEngine');
var issues = TraitEngine.validateCatalog();
_ok(issues.length === 0, 'каталог с характером валиден' + (issues.length ? ': ' + issues.join('; ') : ''));
['hire','life','port','tree','sub','scout','nego','market','shares','mna','ai','season','director']
  .forEach(function(id){ Unlocks.unlock(id); });   // открыли ВСЁ
_ok(TraitEngine.availableTraitPool().every(function(t){ return t.id.indexOf('f_') !== 0 && t.id.indexOf('fv_') !== 0; }),
  'скаут-пул НЕ содержит характер-трейтов даже при 13/13');
Unlocks.reset();
`));

// 2: initState + параметры
add(run('Тест 2: initState и параметры основателя', true, `
var G = { staff: [], activeClients: [] };
var f = Founder.initState(G, Founder.preset('mark'));
_ok(!!f && G.founder === f, 'G.founder создан');
_ok(f.rlTraits.join(',') === 'f_perfectionist,fv_procrastinator', 'Марк: черта+порок → rlTraits');
_ok(f.cls === 'Мастер', 'класс от черты (Мастер)');
_ok(f.params.focus === 50 && f.params.energy === 70, 'параметры с дефолтами');
Founder.paramAdd(G, 'energy', -100);
_ok(f.params.energy === 0, 'paramAdd клампит снизу (0)');
var evs = [];
EventBus.on('founder_param', function(p){ evs.push(p); });
Founder.paramAdd(G, 'confidence', 999);
_ok(f.params.confidence === 100, 'клампит сверху (100)');
_ok(evs.length === 1 && evs[0].key === 'confidence' && evs[0].delta === 50, 'founder_param эмитится с дельтой');
_ok(Founder.initState(G, { age:'young' }) === null, 'битый драфт → null');
`));

// 3: характер работает — моды без команды и назначения
add(run('Тест 3: моды черты/порока на проектах (основатель везде)', true, `
var G = { staff: [], activeClients: [] };
window.G = G;
Founder.initState(G, Founder.preset('mark'));   // Перфекционист + Прокрастинатор
var p = _proj();
var mq = TraitEngine.mods('calcQuality', { G: G, project: p });
_ok(mq.add === 2, 'Перфекционист: +2 Q без единого назначенного (' + mq.add + ')');
var ms = TraitEngine.mods('calcSpeed', { G: G, project: p });
_ok(Math.abs(ms.mult - 0.92 * 0.93) < 1e-9, 'скорость: 0.92 (черта) × 0.93 (порок) = ' + ms.mult.toFixed(3));
// синергия «Эталон»: 2 senior + узел Кейсы
var s1 = _staff({ grade:'senior' }), s2 = _staff({ grade:'senior', role:'developer' });
G.staff.push(s1, s2);
Unlocks.unlock('port');
var mq2 = TraitEngine.mods('calcQuality', { G: G, project: p });
_ok(mq2.add === 4, 'билд «Эталон» (2 Sr + Кейсы): +2 базы +2 синергии = 4');
Unlocks.reset();
`));

// 4: пороки — onMonth и риск; chance-правила
add(run('Тест 4: пороки в деле (Транжира/Выгорание/Углы)', true, `
var G = { staff: [ _staff() ], activeClients: [], money: 100000, teamFatigue: 0 };
window.G = G;
Founder.initState(G, Founder.preset('dania'));   // Харизматик + Транжира
Math.random = function(){ return 0.9; };          // импульс-трата НЕ срабатывает
EventBus.emit('month_advanced', { month: 2 });
_ok(G.money === 92000, 'Транжира: −8К/мес (без импульса) → ' + G.money);
Math.random = function(){ return 0.1; };          // 20%-шанс срабатывает
EventBus.emit('month_advanced', { month: 3 });
_ok(G.money === 92000 - 8000 - 15000, 'импульс-трата по chance: ещё −23К → ' + G.money);

var G2 = { staff: [], activeClients: [], teamFatigue: 10 };
window.G = G2;
Founder.initState(G2, Founder.preset('ira'));     // Эмпат + Выгорание-склонность
EventBus.emit('month_advanced', { month: 2 });
_ok(G2.teamFatigue === 12, 'Выгорание-склонность: +2 усталости/мес');

var G3 = { staff: [], activeClients: [] };
window.G = G3;
Founder.initState(G3, Founder.preset('romych'));  // Пробивной + Срезает углы
var mr = TraitEngine.mods('calcRisk', { G: G3, project: _proj() });
_ok(Math.abs(mr.mult - 1.2 * 1.25) < 1e-9, 'риск: Пробивной ×1.2 × Углы ×1.25 = ' + mr.mult.toFixed(2));
`));

// 5: вне режима — полный no-op
add(run('Тест 5: вне режима характер молчит', false, `
var G = { staff: [], activeClients: [], money: 100000 };
window.G = G;
Founder.initState(G, Founder.preset('mark'));     // состояние создаётся (данные)
_ok(!!G.founder, 'G.founder есть (сам слой данных не гейтится)');
_ok(TraitEngine.mods('calcQuality', { G: G, project: _proj() }).add === 0, 'модов нет');
EventBus.emit('month_advanced', { month: 2 });
_ok(G.money === 100000, 'onMonth-пороки молчат');
`));

console.log('\nИтог: ' + totals.pass + '/' + (totals.pass + totals.fail) + ' проверок прошли');
if (totals.fail > 0) process.exit(1);
