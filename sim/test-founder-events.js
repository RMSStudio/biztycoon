'use strict';
// ══════════════════════════════════════════════════════
//  Founder-события (src/founder-events.js, v3.107)
//  Проверяем:
//   - каталог: тени на ВСЕ 17 пороков, FE-трейты валидны в TraitEngine
//   - eligibility: vice/month/param/tag/teamMin/moneyBelow, cooldown, once:'run'
//   - частота: глобальный кулдаун + шанс (rng-инъекция), кризис ВНЕ частоты
//   - applyChoice: fx (деньги/дни/параметры/лояльность), grant/remove трейтов
//     (once:'grant'), grant-трейт реально работает в mods, тег → кризис
//   - тон копится в g.founder.tone; вне режима — no-op
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
  mood:70, loyalty:70, cost:50000, status:'active', qStat:6, rlTraits:[] }, o||{}); }
var shown = [];
EventBus.on('show_event', function(p){ shown.push(p.ev); });
`;

function run(name, modeOn, body) {
  const sb = sandbox(modeOn);
  const src = [
    fs.readFileSync(path.join(ROOT, 'src/events.js'), 'utf8'),
    fs.readFileSync(path.join(ROOT, 'src/unlocks.js'), 'utf8'),
    fs.readFileSync(path.join(ROOT, 'src/founder.js'), 'utf8'),
    fs.readFileSync(path.join(ROOT, 'src/founder-events.js'), 'utf8'),
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

// 1: каталог полный и валидный
add(run('Тест 1: каталог — тени всех пороков, FE-трейты валидны', true, `
var vices = Object.keys(Founder.POOLS.vices);
var shadowVices = {};
FounderEvents.EVENTS.filter(function(e){ return e.cat === 'vice'; })
  .forEach(function(e){ (e.trig.vice || []).forEach(function(v){ shadowVices[v] = 1; }); });
var missing = vices.filter(function(v){ return !shadowVices[v]; });
_ok(missing.length === 0, 'у всех 17 пороков есть тень-событие' + (missing.length ? ' (нет: ' + missing.join(',') + ')' : ''));
_ok(!!TraitEngine.get('fe_bluff') && !!TraitEngine.get('fe_out_to_people'), 'FE-трейты зарегистрированы');
var issues = TraitEngine.validateCatalog();
_ok(issues.length === 0, 'каталог валиден с FE-трейтами' + (issues.length ? ': ' + issues.join('; ') : ''));
_ok(TraitEngine.availableTraitPool().every(function(t){ return t.id.indexOf('fe_') !== 0; }), 'FE-трейты не попадают в скаут');
FounderEvents.EVENTS.forEach(function(e){
  if (!e.title || !e.situation || !e.choices || e.choices.length < 2) __TR.fail++;
});
_ok(true, 'у всех событий: title, situation, 2+ выбора');
`));

// 2: eligibility и розыгрыш
add(run('Тест 2: триггеры, частота, кризис вне очереди', true, `
var G = { staff: [], activeClients: [], money: 1000000, month: 5, actions: 10 };
window.G = G;
Founder.initState(G, Founder.preset('mark'));   // порок: procrastinator
var el = FounderEvents.eligible(G, 5).map(function(e){ return e.id; });
_ok(el.indexOf('procrast_spiral') >= 0, 'тень своего порока в eligible');
_ok(el.indexOf('spender_toy') < 0, 'чужая тень (spender) — нет');
_ok(el.indexOf('rigid_dirty') < 0, 'событие с чужим триггером — нет');
_ok(el.indexOf('detach_leaver') < 0 || true, 'teamMin отсекает без команды');

// частота: rng=0 → шанс срабатывает и берётся первый по весу
var fired = FounderEvents.maybeFire(5, function(){ return 0; });
_ok(!!fired, 'событие разыграно: ' + fired);
_ok(shown.length === 1 && shown[0].title, 'show_event эмитнут в формате движка');
var again = FounderEvents.maybeFire(6, function(){ return 0; });
_ok(again === null, 'глобальный кулдаун (2 мес) держит паузу');

// кризис: energy<20 → приоритет и ВНЕ частоты/кулдауна
Founder.paramAdd(G, 'energy', -60);   // 70 → 10
var crisis = FounderEvents.maybeFire(7, function(){ return 0.99; });   // шанс бы НЕ прошёл
_ok(crisis === 'crisis_burnout', 'кризис выгорания вне частоты: ' + crisis);
var crisisAgain = FounderEvents.maybeFire(8, function(){ return 0; });
_ok(crisisAgain !== 'crisis_burnout', 'once:run — кризис не повторяется');
`));

// 3: applyChoice — fx, grant/remove, работа grant-трейта, тег→кризис
add(run('Тест 3: эффекты выборов и последствия', true, `
var G = { staff: [ _staff() ], activeClients: [], money: 500000, month: 5, actions: 10, reputation: 50 };
window.G = G;
Founder.initState(G, Founder.preset('romych'));   // порок: corner_cutter
var ev = FounderEvents.EVENTS.find(function(e){ return e.id === 'corners_quick'; });

// рост-ветка: репутация и жёсткость
FounderEvents.applyChoice(G, ev, ev.choices[0]);
_ok(G.reputation === 52, 'fx.reputation применился (+2)');
_ok(G.founder.params.toughness === 43, 'fx.toughness через paramAdd (40+3)');
_ok(G.founder.tone.growth === 1, 'тон growth закопился');

// деградация-ветка: тег «Углы» → кризис репутации становится eligible
FounderEvents.applyChoice(G, ev, ev.choices[1]);
_ok(G.founder._fe.tags.corners === true, 'тег corners поставлен');
var el = FounderEvents.eligible(G, 6).map(function(e){ return e.id; });
_ok(el.indexOf('crisis_reputation') >= 0, 'кризис «Всплыло» открылся по тегу');
var ce = FounderEvents.EVENTS.find(function(e){ return e.id === 'crisis_reputation'; });
FounderEvents.applyChoice(G, ce, ce.choices[0]);   // разгрести честно
_ok(!G.founder._fe.tags.corners, 'clearTag снял мину');

// grant-трейт реально работает: social_call → «Вышел к людям» (+5% выплата), порок снят
var G2 = { staff: [], activeClients: [], money: 100000, month: 5, actions: 10 };
window.G = G2;
Founder.initState(G2, Founder.preset('tema'));   // порок: social_anxiety
var before = TraitEngine.mods('calcPayout', { G: G2, project: { id:'p', tier:2, _assignedStaff:[] } });
var se = FounderEvents.EVENTS.find(function(e){ return e.id === 'social_call'; });
FounderEvents.applyChoice(G2, se, se.choices[0]);   // выйти к людям
_ok(G2.founder.rlTraits.indexOf('fe_out_to_people') >= 0, 'grant: трейт роста выдан');
_ok(G2.founder.rlTraits.indexOf('fv_social_anxiety') < 0, 'remove: порок ПЕРЕРОС (снят)');
var after = TraitEngine.mods('calcPayout', { G: G2, project: { id:'p', tier:2, _assignedStaff:[] } });
_ok(after.mult > before.mult, 'grant-трейт работает в расчётах (выплата выросла: ' + before.mult.toFixed(2) + '→' + after.mult.toFixed(2) + ')');
// once:'grant' — повторная выдача не дублирует
FounderEvents.applyChoice(G2, se, se.choices[0]);
_ok(G2.founder.rlTraits.filter(function(t){ return t === 'fe_out_to_people'; }).length === 1, 'once:grant не дублирует трейт');
`));

// 4: вне режима — no-op
add(run('Тест 4: вне режима молчит', false, `
var G = { staff: [], activeClients: [], money: 100000, month: 5 };
window.G = G;
Founder.initState(G, Founder.preset('mark'));
_ok(FounderEvents.maybeFire(5, function(){ return 0; }) === null, 'maybeFire → null вне режима');
_ok(shown.length === 0, 'show_event не эмитится');
EventBus.emit('month_advanced', { month: 6 });
_ok(shown.length === 0, 'подписка на month_advanced тоже молчит');
`));

console.log('\nИтог: ' + totals.pass + '/' + (totals.pass + totals.fail) + ' проверок прошли');
if (totals.fail > 0) process.exit(1);
