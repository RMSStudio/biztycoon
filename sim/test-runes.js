'use strict';
// ══════════════════════════════════════════════════════
//  Тест стартовых перок-рун (src/runes.js)
//
//  let G в engine.js — лексическая переменная скрипта,
//  снаружи через sb.G недоступна, поэтому проверки делаем
//  ВНУТРИ VM-скрипта (как BOT_SRC в sim2-lc.js).
//  Из ноды читаем только сводку через window.__TR.
// ══════════════════════════════════════════════════════

const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

const ROOT = path.join(__dirname, '..');

// ── Fake DOM ──────────────────────────────────────────
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
  querySelector(sel) {
    if (sel === '.game-header .game-logo') return byId('__game-logo');
    return makeEl();
  },
  querySelectorAll: () => [],
  body: makeEl('body'),
  addEventListener(){}, removeEventListener(){},
};

function makeSandbox(opts) {
  opts = opts || {};
  REGISTRY.clear();
  // Гейт DLC «Rogue-lite»: руны активируются только если включён DLC
  // (по умолчанию включён в тестах; передать noRoguelite:true для negative-test)
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

function loadEngineSrc(extraRunesPatch) {
  const FILES = [
    'src/constants.js', 'src/events.js',
    'scenarios/agency.data.js', 'src/scenario-loader.js',
    'src/engine.js', 'src/projects.js', 'src/staff.js',
  ];
  let src = FILES
    .map(f => '// ===== ' + f + ' =====\n' + fs.readFileSync(path.join(ROOT, f), 'utf8'))
    .join('\n;\n');
  let runes = fs.readFileSync(path.join(ROOT, 'src/runes.js'), 'utf8');
  if (extraRunesPatch) runes = extraRunesPatch(runes);
  src += '\n;\n// ===== src/runes.js =====\n' + runes;
  return src;
}

const HARNESS = String.raw`
function _ok(cond, msg) {
  if (cond) { __TR.pass++; __TR.log.push('✅ ' + msg); }
  else      { __TR.fail++; __TR.log.push('❌ ' + msg); }
}
function _eq(a, b, msg) { _ok(a === b, msg + ' (' + JSON.stringify(a) + ' === ' + JSON.stringify(b) + ')'); }
`;

function run(name, body, extraRunesPatch, sandboxOpts) {
  const sb = makeSandbox(sandboxOpts);
  const src = loadEngineSrc(extraRunesPatch) + '\n;\n' + HARNESS + '\n;\n' + body;
  vm.createContext(sb);
  try { vm.runInContext(src, sb); }
  catch (e) {
    console.log('💥 [' + name + ']:', e.message);
    sb.__TR.fail++;
  }
  console.log('── ' + name + ' ──');
  sb.__TR.log.forEach(l => console.log(l));
  return sb.__TR;
}

const totals = { pass: 0, fail: 0 };
function add(r) { totals.pass += r.pass; totals.fail += r.fail; }

// ── 1: модуль грузится, API доступно ──
// С v3.14 пул расширен 4 запираемыми рунами под мета-прогресс (src/meta.js):
// hardened, scholar, networker, outsider. В тесте — только модуль рун без meta,
// поэтому фильтрация по RogueMeta не применяется (back-compat фолбэк).
add(run('Тест 1: модуль грузится, API доступно', `
_ok(typeof Runes === 'object', 'window.Runes объявлен');
_ok(typeof Runes.pick === 'function', 'Runes.pick есть');
_ok(typeof Runes.getPool === 'function', 'Runes.getPool есть');
const pool = Runes.getPool();
_eq(pool.length, 10, 'в пуле 10 рун (4 базовых + 4 ранних + 2 поздних v0.6)');
const ids = pool.map(r => r.id).sort();
const expected = ['architect','connections','hardened','hustler','insider','networker','outsider','perfectionist','scholar','serial'];
_ok(JSON.stringify(ids) === JSON.stringify(expected),
   'id рун: 4 базовых + 4 ранних + architect/hustler (v0.6)');
`));

// ── 2: connections ──
add(run('Тест 2: connections — −150K старт, +1 лид', `
initState(); selectSpec('smm');
const startMoney = SCENARIO.settings.startMoney;
Runes.pick('connections');
_ok(G.activeRune && G.activeRune.id === 'connections', 'G.activeRune = connections');
_eq(G.money, startMoney - 150000, 'G.money = startMoney − 150K');
_eq(G.caseScoutBonus, 1, 'G.caseScoutBonus = 1');
`));

// ── 3: perfectionist ──
add(run('Тест 3: perfectionist — +5% payout, penaltyMult=2', `
initState(); selectSpec('smm');
Runes.pick('perfectionist');
_ok(G.activeRune.id === 'perfectionist', 'G.activeRune = perfectionist');
_ok(Math.abs(G.perkPayoutMult - 0.05) < 1e-9, 'perkPayoutMult = 0.05 (' + G.perkPayoutMult + ')');
_eq(G.runePenaltyMult, 2, 'runePenaltyMult = 2');
`));

// ── 4: insider — флаг + overheadBump ──
add(run('Тест 4: insider — флаг + overheadBump', `
initState(); selectSpec('smm');
const baseOverhead = SCENARIO.settings.overhead;
Runes.pick('insider');
_eq(G.activeRune.id, 'insider', 'G.activeRune = insider');
_ok(G.runeInsiderRare === true, 'G.runeInsiderRare = true');
_eq(G.runeOverheadBump, Math.round(baseOverhead * 0.15), 'overheadBump = round(overhead × 0.15)');
`));

// ── 5: insider инжектит rare/epic ──
add(run('Тест 5: insider _generateOffers инжектит rare/epic', `
initState(); selectSpec('smm');
Runes.pick('insider');
G.reputation = 95;
G.portfolio  = 50;
let hadRareUp = 0;
for (let i = 0; i < 12; i++) {
  const offers = _generateOffers();
  if (offers.some(o => ['rare','epic','legendary'].includes(o.rarity))) hadRareUp++;
}
_ok(hadRareUp >= 9, '≥75% скаутингов содержат rare/epic при инсайдере (' + hadRareUp + '/12)');
`));

// ── 6: serial ──
add(run('Тест 6: serial — флаг, активация при 15 портфолио', `
initState(); selectSpec('smm');
Runes.pick('serial');
_ok(G.runeSerialUnlock === true, 'runeSerialUnlock = true');
_ok(!G.runeSerialApplied, 'до 15 порт. — не активирована');
G.portfolio = 20;
advanceMonth();
_ok(G.runeSerialApplied === true, 'после advanceMonth с порт.20 — активирована');
_ok(G.perkPayoutMult >= 0.2 - 1e-9, 'perkPayoutMult += 0.20 (' + G.perkPayoutMult + ')');
`));

// ── 7: перфекционист удваивает штраф ──
add(run('Тест 7: перфекционист удваивает штраф просрочки', `
initState(); selectSpec('smm');
Runes.pick('perfectionist');
G.activeClients = [{
  id: 'test_1', name: 'Test', _duration: 3, _monthsSigned: 12,
  _workStartMonth: 0, _progress: 50, oneTime: false,
  _lcChain: ['planning','work_0','delivery'], _lcPhase: 'work_0',
  _lcClientMood: 60,
}];
G.clientNPS = { 'test_1': 50 };
const repBefore = G.reputation;
advanceMonth();
const delta = repBefore - G.reputation;
_ok(delta >= 2, 'reputation просел минимум на 2 (delta=' + delta + ')');
`));

// ── 8: insider overhead bump списывается ──
add(run('Тест 8: insider overhead bump списывается в advanceMonth', `
initState(); selectSpec('smm');
Runes.pick('insider');
const bump = G.runeOverheadBump;
const moneyBefore = G.money;
advanceMonth();
const drop = moneyBefore - G.money;
const baseOverhead8 = SCENARIO.settings.overhead;
_ok(drop >= baseOverhead8 + bump * 0.95,
   'списано базовый overhead + bump (' + drop + ' ≥ ' + (baseOverhead8 + bump) + ')');
`));

// ── 9: RUNES_ENABLED=false (hard kill-switch) ──
add(run('Тест 9: модуль выкл. при RUNES_ENABLED=false (kill-switch)', `
_ok(typeof Runes === 'undefined', 'window.Runes НЕ объявлен');
initState(); selectSpec('smm');
startGame();
_eq(G.month, 0, 'startGame работает без рун (G.month=0 после старта)');
_ok(typeof G.activeRune === 'undefined', 'G.activeRune не появилась');
`, s => s.replace('const RUNES_ENABLED = true;', 'const RUNES_ENABLED = false;')));

// ── 10: DLC roguelite не включён — руны не активируются ──
add(run('Тест 10: без DLC roguelite — руны не активируются', `
_ok(typeof Runes === 'undefined', 'window.Runes НЕ объявлен (DLC выключен)');
initState(); selectSpec('smm'); startGame();
_eq(G.month, 0, 'startGame работает без рун');
_ok(typeof G.activeRune === 'undefined', 'G.activeRune не появилась');
`, null, { noRoguelite: true }));

console.log(`\nИтог: ${totals.pass}/${totals.pass + totals.fail} проверок прошли`);
if (totals.fail > 0) process.exit(1);
