'use strict';
// ══════════════════════════════════════════════════════
//  Контракт-тесты TraitEngine (Ф.7 §14, шаги 1–3)
//  Проверяем:
//   - вне режима Rogue-lite слой = no-op (mods нейтрален, fire молчит)
//   - в режиме: предикаты/эффекты каталога применяются корректно
//   - каждый стартовый трейт/синергия читается и работает (§14.8)
//   - stackPer-скейлер копит и капится; расширение через register-API
// ══════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');

function sandbox(modeOn) {
  const ls = {};
  if (modeOn) ls['bt_enabled_dlcs_v1'] = JSON.stringify(['unlocks']);
  const sb = {
    console, JSON, Math,
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
function _staff(over){ return Object.assign({ _iid:'s'+Math.random(), id:'x', role:'designer', grade:'middle',
  mood:70, cost:50000, status:'active', qStat:6, rlTraits:[] }, over||{}); }
function _proj(over){ return Object.assign({ id:'p1', tier:2, _assignedStaff:[], _monthsSigned:1, _duration:5 }, over||{}); }
`;

function run(name, modeOn, body) {
  const sb = sandbox(modeOn);
  const src = [
    fs.readFileSync(path.join(ROOT, 'src/events.js'), 'utf8'),
    fs.readFileSync(path.join(ROOT, 'src/unlocks.js'), 'utf8'),
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

// 1: вне режима — полный no-op
add(run('Тест 1: вне режима слой = no-op', false, `
_ok(!TraitEngine.isActive(), 'слой неактивен вне режима');
var s = _staff({ rlTraits:['star_ego'] });
var G = { staff:[s], activeClients:[] };
var m = TraitEngine.mods('calcQuality', { G:G, project:_proj({ _assignedStaff:[s._iid] }) });
_ok(m.add === 0 && m.mult === 1, 'mods нейтрален (add 0, mult 1)');
_ok(TraitEngine.activeSynergies({ G:G }).length === 0, 'activeSynergies пуст');
var mood0 = s.mood;
TraitEngine.fire('onMonth', { G:G });
_ok(s.mood === mood0, 'fire(onMonth) ничего не меняет');
_ok(TraitEngine.catalog().traits.length >= 12, 'каталог при этом загружен (' + TraitEngine.catalog().traits.length + ' трейтов)');
`));

// 2: условные множители и синерго-трейты (проектные хуки)
add(run('Тест 2: условные трейты — предикаты работают', true, `
var lone = _staff({ _iid:'lone', rlTraits:['loner'] });
var G = { staff:[lone], activeClients:[] };
var pSolo = _proj({ _assignedStaff:['lone'] });
var m1 = TraitEngine.mods('calcSpeed', { G:G, project:pSolo });
_ok(Math.abs(m1.mult - 1.4) < 1e-9, 'Одиночка соло: ×1.4 скорость');
var mate = _staff({ _iid:'mate' });
G.staff.push(mate); pSolo._assignedStaff.push('mate');
var m2 = TraitEngine.mods('calcSpeed', { G:G, project:pSolo });
_ok(m2.mult === 1, 'Одиночка не один — бонус пропал');

var niche = _staff({ _iid:'n1', rlTraits:['niche_expert'] });
G.staff.push(niche);
var pT3 = _proj({ id:'p3', tier:3, _assignedStaff:['n1'] });
_ok(Math.abs(TraitEngine.mods('calcQuality', { G:G, project:pT3 }).mult - 1.5) < 1e-9, 'Нишевый на T3: ×1.5 Q');
var pT1 = _proj({ id:'p4', tier:1, _assignedStaff:['n1'] });
_ok(TraitEngine.mods('calcQuality', { G:G, project:pT1 }).mult === 1, 'Нишевый на T1: нет бонуса');

// свежий состав (иначе 3 дизайнера выше случайно включают «Дизайн-бутик»)
var tl = _staff({ _iid:'tl', role:'manager', rlTraits:['teamlead'] });
var d1 = _staff({ _iid:'d1', role:'developer' }), d2 = _staff({ _iid:'d2', role:'developer' });
var G4 = { staff:[tl, d1, d2], activeClients:[] };
var pDev = _proj({ id:'p5', _assignedStaff:['tl','d1','d2'] });
_ok(TraitEngine.mods('calcQuality', { G:G4, project:pDev }).add === 3, 'Тимлид + 2 разраба: +3 Q');
var mUp = TraitEngine.mods('calcPayout', { G:G4, project:pDev });
_ok(mUp.mult === 1, 'носитель платного трейта не на проекте — нет эффекта');
`));

// 3: синергии штата и проекта (без rlTraits)
add(run('Тест 3: синергии состава', true, `
var st = [ _staff({ role:'designer' }), _staff({ role:'designer' }), _staff({ role:'designer' }) ];
var G = { staff:st, activeClients:[] };
var p = _proj({ _assignedStaff:[] });
_ok(TraitEngine.mods('calcQuality', { G:G, project:p }).add === 4, 'Дизайн-бутик (3 дизайнера): +4 Q');
var names = TraitEngine.activeSynergies({ G:G }).map(function(s){ return s.id; });
_ok(names.indexOf('design_boutique') >= 0, 'activeSynergies видит Дизайн-бутик');
_ok(names.indexOf('tech_shop') < 0, 'Тех-шоп не активен');

// пирамида: 1 sr + 2 md + 3 jr → −5% ФОТ
var pyr = [ _staff({ grade:'senior' }), _staff({ grade:'middle' }), _staff({ grade:'middle' }),
            _staff({ grade:'junior' }), _staff({ grade:'junior' }), _staff({ grade:'junior' }) ];
var G2 = { staff:pyr, activeClients:[] };
_ok(Math.abs(TraitEngine.mods('calcUpkeep', { G:G2 }).mult - 0.95) < 1e-9, 'Здоровая студия: ФОТ ×0.95');

// продуктовая команда (scope: project, вложенный when на тир)
var trio = [ _staff({ _iid:'a', role:'designer' }), _staff({ _iid:'b', role:'developer' }), _staff({ _iid:'c', role:'copywriter' }) ];
var G3 = { staff:trio, activeClients:[] };
var pT3 = _proj({ tier:3, _assignedStaff:['a','b','c'] });
_ok(Math.abs(TraitEngine.mods('calcPayout', { G:G3, project:pT3 }).mult - 1.1) < 1e-9, 'Продуктовая команда на T3: ×1.1 выплата');
var pT1 = _proj({ id:'q', tier:1, _assignedStaff:['a','b','c'] });
_ok(TraitEngine.mods('calcPayout', { G:G3, project:pT1 }).mult === 1, 'на T1 вложенный when отсекает');
`));

// 4: событийные хуки + stackPer-скейлер
add(run('Тест 4: события (onDeliver/onMonth) и скейлер', true, `
var perf = _staff({ _iid:'pf', rlTraits:['perfectionist'] });
var G = { staff:[perf], activeClients:[], money:100000, teamFatigue:0 };
window.G = G;
// три сдачи его проекта → стек 3
for (var i = 0; i < 3; i++) EventBus.emit('project_delivered', { id:'p'+i, tier:1, team:['pf'] });
_ok((perf._rlStacks||{}).perfectionist === 3, 'Перфекционист: стек 3 после 3 сдач');
var p = _proj({ _assignedStaff:['pf'] });
_ok(TraitEngine.mods('calcQuality', { G:G, project:p }).add === 3, 'скейлер даёт +3 Q (1×стек)');
// сдача ЧУЖОГО проекта — стек не растёт
EventBus.emit('project_delivered', { id:'px', tier:1, team:['other'] });
_ok(perf._rlStacks.perfectionist === 3, 'чужая сдача не копит стек');

// Ментор: сдача с джуном в команде → джун +1 qStat
var mentor = _staff({ _iid:'m', rlTraits:['mentor'] });
var jr = _staff({ _iid:'j', grade:'junior', qStat:4 });
G.staff.push(mentor, jr);
EventBus.emit('project_delivered', { id:'pm', tier:2, team:['m','j'] });
_ok(jr.qStat === 5, 'Ментор: джун вырос до 5 qStat');

// Финишер: сдача T3+ → +40к денег
var fin = _staff({ _iid:'f', rlTraits:['finisher'] });
G.staff.push(fin);
var money0 = G.money;
EventBus.emit('project_delivered', { id:'pf3', tier:3, team:['f'] });
_ok(G.money === money0 + 40000, 'Финишер: +40 000 за T3');

// HR-душа + Звезда: месяц → мораль +2−1=+1 всем
var hr = _staff({ _iid:'h', rlTraits:['hr_soul'] });
var star = _staff({ _iid:'st', rlTraits:['star_ego'] });
G.staff.push(hr, star);
var mood0 = jr.mood;
EventBus.emit('month_advanced', { month: 5 });
_ok(jr.mood === mood0 + 1, 'onMonth: HR-душа (+2) и Звезда (−1) сложились в +1');
`));

// 5: расширяемость (§14.0) — новые записи/предикат/глагол без правки движка
add(run('Тест 5: расширение через данные и register-API', true, `
TraitEngine.registerTrait({ id:'night_owl', name:'Сова', family:'conditional',
  hooks:{ calcSpeed:[ { when:[ { projectTier:{ max:1 } } ], do:[ { speedMult:0.5 } ] } ] }, desc:'t' });
var owl = _staff({ _iid:'o', rlTraits:['night_owl'] });
var G = { staff:[owl], activeClients:[] };
_ok(Math.abs(TraitEngine.mods('calcSpeed', { G:G, project:_proj({ tier:1, _assignedStaff:['o'] }) }).mult - 1.5) < 1e-9,
  'новый трейт из данных работает без правки движка');

TraitEngine.Predicates.register('isFriday', function(){ return true; });
TraitEngine.Effects.register('luck', { home:'calcPayout', calc:function(v){ return { mult:v }; } });
TraitEngine.registerSynergy({ id:'tgif', name:'t', scope:'staff', when:[ { isFriday:true } ], do:[ { luck:0.05 } ], desc:'t' });
_ok(Math.abs(TraitEngine.mods('calcPayout', { G:G, project:_proj() }).mult - 1.05) < 1e-9,
  'новый предикат + глагол зарегистрированы и исполняются');

// мусорная запись не роняет движок
TraitEngine.registerTrait({ id:'broken', hooks:{ calcQuality:[ { when:[ { noSuchPredicate:1 } ], do:[ { qAdd:99 } ] } ] } });
owl.rlTraits.push('broken');
var m = TraitEngine.mods('calcQuality', { G:G, project:_proj({ _assignedStaff:['o'] }) });
_ok(m.add === 0, 'неизвестный предикат → правило просто не срабатывает (движок жив)');
`));

console.log('\nИтог: ' + totals.pass + '/' + (totals.pass + totals.fail) + ' проверок прошли');
if (totals.fail > 0) process.exit(1);
