'use strict';
// ══════════════════════════════════════════════════════
//  Мета персонажей + арки (v3.109)
//  Проверяем:
//   - мета: гейт ярусов (Струггер сразу, Крепкий 3 рана/победа,
//     Состоявшийся победа/8 ранов), metaRecord копит раны/победы/тон
//   - у ВСЕХ 6 струггеров есть полная арка (2 звена + 2 развязки)
//   - движок арок: preset-триггер, afterEvent-этапность, развязка по
//     доминирующему тону, арка вне шанса (но с кулдауном), once:'run'
//   - randomDraft валиден; чужая арка не выпадает
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

// 1: мета и гейт ярусов
add(run('Тест 1: мета персонажей — ярусы открываются прогрессом', true, `
var m0 = Founder.loadMeta();
_ok(m0.runs === 0 && m0.wins === 0, 'чистая мета: 0 ранов');
_ok(Founder.tierUnlocked('Струггер'), 'Струггеры открыты сразу');
_ok(!Founder.tierUnlocked('Крепкий'), 'Крепкие заперты на старте');
_ok(!Founder.tierUnlocked('Состоявшийся'), 'Состоявшиеся заперты');
var av = Founder.presetsAvailable();
_ok(av.filter(function(p){ return p.unlocked; }).length === 6, '6 доступных прототипов-струггеров');
_ok(av.find(function(p){ return p.id === 'ira'; }).req.length > 0, 'у запертого — условие открытия');

// 3 рана → Крепкие; победа → Состоявшиеся; тон копится
var G1 = { founder: { presetId: 'mark', tone: { growth: 2, degrade: 1 } } };
Founder.metaRecord(G1, false);
Founder.metaRecord(G1, false);
Founder.metaRecord(G1, false);
_ok(Founder.tierUnlocked('Крепкий'), 'после 3 ранов Крепкие открыты');
_ok(!Founder.tierUnlocked('Состоявшийся'), 'Состоявшиеся ещё нет');
Founder.metaRecord(G1, true);
_ok(Founder.tierUnlocked('Состоявшийся'), 'после победы — открыты все');
var m = Founder.loadMeta();
_ok(m.runs === 4 && m.wins === 1, 'мета: 4 рана, 1 победа');
_ok(m.byPreset.mark.runs === 4 && m.byPreset.mark.growth === 8, 'по-пресетная статистика и тон копятся');

// randomDraft валиден
for (var i = 0; i < 5; i++) {
  var rd = Founder.randomDraft(function(){ return i / 7; });
  _ok(Founder.validate(rd).ok, 'randomDraft #' + i + ' валиден');
}
`));

// 2: полнота арок струггеров
add(run('Тест 2: у всех струггеров полная арка', true, `
var struggers = Founder.PRESETS.filter(function(p){ return p.tier === 'Струггер'; });
_ok(struggers.length === 6, '6 струггеров в ростере');
struggers.forEach(function(p) {
  var arc = FounderEvents.EVENTS.filter(function(e){
    return e.cat === 'arc' && e.trig.preset && e.trig.preset.includes(p.id); });
  var finals = arc.filter(function(e){ return e.trig.toneDom; });
  _ok(arc.length === 4 && finals.length === 2 &&
      finals.some(function(e){ return e.trig.toneDom === 'growth'; }) &&
      finals.some(function(e){ return e.trig.toneDom === 'degrade'; }),
    p.n + ': 2 звена + развязки рост/хаос');
});
var issues = TraitEngine.validateCatalog();
_ok(issues.length === 0, 'каталог валиден с арками');
`));

// 3: движок арок — этапность и развязка по тону
add(run('Тест 3: арка Марка от завязки до развязки', true, `
var G = { staff: [], activeClients: [], money: 500000, actions: 10, reputation: 50, month: 3 };
window.G = G;
Founder.initState(G, Founder.preset('mark'));

// чужие арки не в eligible
var el3 = FounderEvents.eligible(G, 3).map(function(e){ return e.id; });
_ok(el3.indexOf('arc_mark_1') >= 0, 'завязка арки Марка доступна с 3-го мес');
_ok(el3.indexOf('arc_romych_1') < 0, 'арка Ромыча Марку не выпадает');
_ok(el3.indexOf('arc_mark_2') < 0, 'звено 2 заперто до звена 1 (afterEvent)');

// арка приоритетнее обычных: rng=0.99 (шанс бы зарубил) — но арка выпадает
var fired = FounderEvents.maybeFire(3, function(){ return 0.99; });
_ok(fired === 'arc_mark_1', 'арка разыграна ВНЕ шанса: ' + fired);
var ev1 = FounderEvents.EVENTS.find(function(e){ return e.id === 'arc_mark_1'; });
FounderEvents.applyChoice(G, ev1, ev1.choices[0]);   // growth: «выкатить и отпустить»

// звено 2 открылось после звена 1
var el5 = FounderEvents.eligible(G, 5).map(function(e){ return e.id; });
_ok(el5.indexOf('arc_mark_2') >= 0, 'звено 2 открылось (afterEvent)');
var ev2 = FounderEvents.EVENTS.find(function(e){ return e.id === 'arc_mark_2'; });
FounderEvents.maybeFire(5, function(){ return 0.99; });
FounderEvents.applyChoice(G, ev2, ev2.choices[0]);   // growth: полная цена
_ok(G.founder.tone.growth === 2, 'тон growth 2/0');

// развязка: только growth-финал в eligible
var el8 = FounderEvents.eligible(G, 8).map(function(e){ return e.id; });
_ok(el8.indexOf('arc_mark_fin_g') >= 0, 'рост-финал доступен');
_ok(el8.indexOf('arc_mark_fin_d') < 0, 'хаос-финал закрыт (тон growth доминирует)');
var fin = FounderEvents.maybeFire(8, function(){ return 0.99; });
_ok(fin === 'arc_mark_fin_g', 'развязка по тону: ' + fin);
_ok(FounderEvents.maybeFire(10, function(){ return 0.99; }) !== 'arc_mark_fin_g', 'once:run — финал не повторяется');
`));

// 4: деградационная ветка арки (кризис по ходу вклинивается приоритетом)
add(run('Тест 4: арка Ромыча уходит в хаос', true, `
var G = { staff: [], activeClients: [], money: 500000, actions: 10, reputation: 50, month: 3 };
window.G = G;
Founder.initState(G, Founder.preset('romych'));
var byId = function(id){ return FounderEvents.EVENTS.find(function(e){ return e.id === id; }); };

var p1 = FounderEvents.maybeFire(3, function(){ return 0.99; });
_ok(p1 === 'arc_romych_1', 'звено 1: ' + p1);
FounderEvents.applyChoice(G, byId(p1), byId(p1).choices[1]);   // серая схема (degrade + tag)
_ok(G.founder._fe.tags.corners === true, 'тег corners взведён аркой');

// на следующем розыгрыше кризис «Всплыло» бьёт РАНЬШЕ продолжения арки
var p2 = FounderEvents.maybeFire(5, function(){ return 0.99; });
_ok(p2 === 'crisis_reputation', 'кризис приоритетнее арки: ' + p2);
FounderEvents.applyChoice(G, byId(p2), byId(p2).choices[1]);   // «Отрицать» (degrade, тег остаётся)
_ok(G.founder._fe.tags.corners === true, 'отрицание не сняло мину');

var p3 = FounderEvents.maybeFire(7, function(){ return 0.99; });
_ok(p3 === 'arc_romych_2', 'арка продолжилась после кризиса: ' + p3);
FounderEvents.applyChoice(G, byId(p3), byId(p3).choices[1]);   // взять мутную (degrade)
_ok(G.founder.tone.degrade === 3, 'тон degrade 3/0');

var el = FounderEvents.eligible(G, 9).map(function(e){ return e.id; });
_ok(el.indexOf('arc_romych_fin_d') >= 0 && el.indexOf('arc_romych_fin_g') < 0, 'открыт только хаос-финал');
var fin = FounderEvents.maybeFire(9, function(){ return 0.99; });
_ok(fin === 'arc_romych_fin_d', 'развязка-хаос разыграна: ' + fin);
// в финале есть выкуп: «сказать нет» чистит тег
FounderEvents.applyChoice(G, byId(fin), byId(fin).choices[0]);
_ok(!G.founder._fe.tags.corners, 'рост-выбор в финале снял тег corners');
`));

console.log('\nИтог: ' + totals.pass + '/' + (totals.pass + totals.fail) + ' проверок прошли');
if (totals.fail > 0) process.exit(1);
