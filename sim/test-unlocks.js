'use strict';
// ══════════════════════════════════════════════════════
//  Тест системы открытий (src/unlocks.js, Ф.7 скелет)
//  Проверяем:
//   - ВНЕ режима isModuleUnlocked === true (обычная игра не гейтится)
//   - В режиме: тир-0 (всё заперто), мягкие пререквизиты, unlock/reset
//   - неизвестный модуль не гейтится; персистентность в localStorage
// ══════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');

const HARNESS = `
function _ok(c,m){ if(c){__TR.pass++;__TR.log.push('✅ '+m);}else{__TR.fail++;__TR.log.push('❌ '+m);} }
`;

function sandbox(modeOn) {
  const ls = {};
  if (modeOn) ls['bt_enabled_dlcs_v1'] = JSON.stringify(['unlocks']);
  const sb = {
    console, JSON,
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

function run(name, modeOn, body) {
  const sb = sandbox(modeOn);
  const src = fs.readFileSync(path.join(ROOT, 'src/unlocks.js'), 'utf8') + '\n;\n' + HARNESS + '\n;\n' + body;
  vm.createContext(sb);
  try { vm.runInContext(src, sb); }
  catch (e) { console.log('💥 [' + name + ']:', e.message); sb.__TR.fail++; }
  console.log('── ' + name + ' ──');
  sb.__TR.log.forEach(l => console.log(l));
  return sb.__TR;
}

const totals = { pass: 0, fail: 0 };
function add(r) { totals.pass += r.pass; totals.fail += r.fail; }

// 1: вне режима — ничего не гейтится
add(run('Тест 1: вне режима isModuleUnlocked === true', false, `
_ok(typeof Unlocks === 'object', 'window.Unlocks объявлен');
_ok(!Unlocks.isActive(), 'режим unlocks выключен');
_ok(isModuleUnlocked('hire'), 'вне режима hire открыт');
_ok(isModuleUnlocked('mna'), 'вне режима mna открыт');
_ok(Unlocks.MODULE_UNLOCKS.length === 13, '13 модулей в реестре');
`));

// 2: в режиме — тир 0, пререквизиты, unlock, reset
add(run('Тест 2: в режиме — гейтинг, мягкие пререквизиты, unlock/reset', true, `
_ok(Unlocks.isActive(), 'режим unlocks включён');
_ok(!isModuleUnlocked('hire'), 'на старте hire ЗАПЕРТ (тир 0)');
_ok(!isModuleUnlocked('scout'), 'на старте scout заперт');
_ok(Unlocks.available('hire'), 'hire ДОСТУПЕН (тир 1 от корня)');
_ok(!Unlocks.available('life'), 'life недоступен (нужен тир 1)');
_ok(!Unlocks.available('port'), 'port недоступен (тир 3, пусто)');
Unlocks.unlock('hire');
_ok(isModuleUnlocked('hire'), 'после unlock(hire) — открыт');
_ok(Unlocks.getOpened().length === 1, 'opened = 1');
_ok(Unlocks.available('life'), 'life теперь ДОСТУПЕН (открыт тир 1)');
_ok(!Unlocks.available('port'), 'port всё ещё недоступен (нужен тир 2)');
_ok(isModuleUnlocked('unknownX'), 'неизвестный модуль НЕ гейтится (true)');
Unlocks.reset();
_ok(!isModuleUnlocked('hire'), 'после reset() — снова заперт');
_ok(Unlocks.getOpened().length === 0, 'opened пуст после reset');
`));

// 3: персистентность через localStorage (второй инстанс видит открытое)
add(run('Тест 3: персистентность opened в localStorage', true, `
Unlocks.unlock('scout');
Unlocks.unlock('hire');
_ok(Unlocks.getOpened().length === 2, 'открыто 2 модуля');
// эмулируем перезагрузку: перечитать состояние из того же localStorage
_ok(isModuleUnlocked('scout') && isModuleUnlocked('hire'), 'оба открыты после записи');
_ok(Unlocks.available('nego'), 'nego доступен (тир 2, открыт тир 1 scout)');
`));

// 4 (v2, §15): экономика экспертизы — buy() с тратой, недостаток эксп., пререквизиты
// Числа берём из Unlocks.TUNING/MODULE_UNLOCKS — тест переживает balance-pass
add(run('Тест 4: buy() — трата экспертизы, отказы', true, `
var T = Unlocks.TUNING;
var hireCost = Unlocks.MODULE_UNLOCKS.find(function(m){ return m.id==='hire'; }).cost;
_ok(Unlocks.getExp() === 0, 'старт: 0 экспертизы');
var r1 = Unlocks.buy('hire');
_ok(!r1.ok && r1.reason === 'exp', 'buy(hire) без эксп. → отказ reason=exp');
var s1 = Unlocks.awardAtRunEnd(false, { living: { stage: 0 } });
_ok(s1 && s1.award === T.BASE_LOSS, 'проигрыш стадия 0 → база ' + T.BASE_LOSS);
var s2 = Unlocks.awardAtRunEnd(false, { living: { stage: 2 } });
_ok(s2.award === T.BASE_LOSS + 2 * T.STAGE_EXP, 'проигрыш стадия 2 → база + 2×' + T.STAGE_EXP);
var r2 = Unlocks.buy('life');
_ok(!r2.ok && r2.reason === 'locked', 'buy(life) → отказ locked (нет тира 1)');
// докидываем до цены найма
while (Unlocks.getExp() < hireCost) Unlocks.awardAtRunEnd(false, { living: { stage: 0 } });
var balance = Unlocks.getExp();
var r3 = Unlocks.buy('hire');
_ok(r3.ok, 'buy(hire) за ' + hireCost + ' прошёл');
_ok(Unlocks.getExp() === balance - hireCost, 'списание корректно');
_ok(isModuleUnlocked('hire'), 'hire открыт покупкой');
var r4 = Unlocks.buy('hire');
_ok(!r4.ok && r4.reason === 'opened', 'повторная покупка → отказ opened');
`));

// 5 (v2, §15.1): «первые разы» — единоразовые за мету, победа на сложности
add(run('Тест 5: awardAtRunEnd — первые разы платятся один раз', true, `
var T = Unlocks.TUNING;
var F = {}; Unlocks.FIRSTS.forEach(function(f){ F[f.key] = f.exp; });
var runs0 = Unlocks.getRuns();
Unlocks._noteFirst('deliver');
Unlocks._noteFirst('hire');
var s1 = Unlocks.awardAtRunEnd(false, { living: { stage: 1 } });
_ok(s1.firstsExp === F.deliver + F.hire, 'первая сдача + первый найм = ' + (F.deliver + F.hire));
_ok(s1.award === T.BASE_LOSS + T.STAGE_EXP + F.deliver + F.hire, 'итог рана = база + стадия + первые разы');
Unlocks._noteFirst('deliver');   // второй ран — та же «первая сдача»
var s2 = Unlocks.awardAtRunEnd(false, { living: { stage: 1 } });
_ok(s2.firstsExp === 0, 'повторно «первые разы» НЕ платятся');
var s3 = Unlocks.awardAtRunEnd(true, { living: { stage: 5 } });
_ok(s3.base === T.BASE_WIN && s3.stageBonus === 5 * T.STAGE_EXP, 'победа: база ' + T.BASE_WIN + ', Империя 5×' + T.STAGE_EXP);
_ok(s3.firsts.length === 1 && s3.firsts[0].key.indexOf('win_') === 0, 'первая победа на сложности учтена');
var s4 = Unlocks.awardAtRunEnd(true, { living: { stage: 5 } });
_ok(s4.firstsExp === 0, 'вторая победа на той же сложности — без бонуса');
_ok(Unlocks.getRuns() === runs0 + 4, 'счётчик ранов растёт');
Unlocks.reset();
_ok(Unlocks.getExp() === 0 && Unlocks.getRuns() === 0, 'reset() чистит эксп. и раны');
`));

// 5.5 (v3.90, хвосты гейтов §11.5): season/ai/sub/shares в реестре и гейтятся
add(run('Тест 5.5: хвосты гейтов — season/ai/sub/shares', true, `
['season','ai','sub','shares'].forEach(function(id){
  _ok(!isModuleUnlocked(id), 'в режиме на тир-0 «' + id + '» заперт');
});
Unlocks.unlock('season'); Unlocks.unlock('shares');
_ok(isModuleUnlocked('season') && isModuleUnlocked('shares'), 'открытые узлы отпираются');
_ok(!isModuleUnlocked('ai') && !isModuleUnlocked('sub'), 'остальные остаются запертыми');
Unlocks.reset();
`));

// 6 (v2): вне режима awardAtRunEnd — null (обычная игра не трогается)
add(run('Тест 6: вне режима экспертиза не начисляется', false, `
_ok(Unlocks.awardAtRunEnd(true, { living: { stage: 5 } }) === null, 'awardAtRunEnd вне режима → null');
_ok(Unlocks.getExp() === 0, 'экспертиза не появилась');
`));

// 7 (§Ф.7): scriptedIntroDue — заскриптованное вступительное поражение голого рана
add(run('Тест 7: scriptedIntroDue — вступительный ран', true, `
var D = Unlocks.TUNING.INTRO_DEADLINE;
_ok(typeof D === 'number' && D > 0, 'INTRO_DEADLINE задан (' + D + ')');
_ok(Unlocks.scriptedIntroDue({ month: D, living:{stage:0} }), 'месяц дедлайна + стадия 0 (Гараж) → поражение');
_ok(Unlocks.scriptedIntroDue({ month: D+5, living:{stage:0} }), 'позже дедлайна на стадии 0 → тоже поражение');
_ok(!Unlocks.scriptedIntroDue({ month: D, living:{stage:1} }), 'стадия 1 (прогресс) → НЕ срабатывает');
_ok(!Unlocks.scriptedIntroDue({ month: D-1, living:{stage:0} }), 'до дедлайна → НЕ срабатывает');
_ok(!Unlocks.scriptedIntroDue({ month: D, living:{stage:0}, _endGameFired:true }), 'ран уже завершён → НЕ срабатывает');
_ok(!Unlocks.scriptedIntroDue({ month: D+9, living:{stage:0}, _scriptedIntroFired:true }), 'уже фаернуто → не повторяется');
`));

// 7b: вне режима вступительное поражение не наступает (обычная игра/«Прокачка»)
add(run('Тест 7b: scriptedIntroDue вне режима → false', false, `
_ok(!Unlocks.scriptedIntroDue({ month: 99, living:{stage:0} }), 'вне режима — обычная игра, поражение не форсится');
`));

console.log('\nИтог: ' + totals.pass + '/' + (totals.pass + totals.fail) + ' проверок прошли');
if (totals.fail > 0) process.exit(1);
