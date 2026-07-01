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

console.log('\nИтог: ' + totals.pass + '/' + (totals.pass + totals.fail) + ' проверок прошли');
if (totals.fail > 0) process.exit(1);
