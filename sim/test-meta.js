'use strict';
// ══════════════════════════════════════════════════════
//  Тест мета-прогресса между партиями (src/meta.js)
//
//  Проверяем:
//   - модуль грузится при включённом DLC и регистрирует API
//   - дефолтное состояние (shards=0, history=[])
//   - awardAtEndGame: счётчики runs/wins, начисление shards,
//     ачивки first_run / first_win / endgame_reached,
//     master_5_wins / survivor / *_win, разблокировки рун и бонусов
//   - isRuneUnlocked/isBonusUnlocked отдают true только когда
//     накоплено достаточно осколков
//   - reset() стирает прогресс
//   - persistence через localStorage (новый sandbox видит старые shards)
//   - integration с runes: запираемые руны не попадают в пул
//     при свежем мета-прогрессе, появляются после набора осколков
//   - integration с runmap: запираемые бонусы аналогично
//   - hard kill-switch (META_ENABLED=false) выключает модуль
//   - без DLC roguelite модуль не активируется
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
    parentElement: null,
    appendChild(c){ this.children.push(c); c.parentElement = this; return c; },
    removeChild(c){ this.children = this.children.filter(x => x !== c); c.parentElement = null; },
    remove(){}, insertBefore(c, before){ this.children.push(c); c.parentElement = this; return c; },
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

// Общая «прошивка» localStorage между запусками — для проверки persistence
const _persistentLS = {};

function makeSandbox(opts) {
  opts = opts || {};
  REGISTRY.clear();
  const _fakeLS = {};
  if (!opts.noRoguelite) _fakeLS['bt_enabled_dlcs_v1'] = JSON.stringify(['roguelite']);
  if (opts.shareLS) Object.assign(_fakeLS, _persistentLS);
  const sb = {
    console, Math, Date, JSON, Intl, setTimeout, clearTimeout,
    document: fakeDocument,
    localStorage: {
      getItem(k){ return Object.prototype.hasOwnProperty.call(_fakeLS, k) ? _fakeLS[k] : null; },
      setItem(k, v){ _fakeLS[k] = String(v); if (opts.shareLS) _persistentLS[k] = String(v); },
      removeItem(k){ delete _fakeLS[k]; if (opts.shareLS) delete _persistentLS[k]; },
    },
    navigator: {},
    renderPortfolioTab(){},
    __TR: { pass: 0, fail: 0, log: [] },
    __LS: _fakeLS,
  };
  sb.window = sb; sb.globalThis = sb;
  return sb;
}

function loadEngineSrc(opts) {
  opts = opts || {};
  const FILES = [
    'src/constants.js', 'src/events.js',
    'scenarios/agency.data.js', 'src/scenario-loader.js',
    'src/engine.js', 'src/projects.js', 'src/staff.js',
  ];
  let src = FILES
    .map(f => '// ===== ' + f + ' =====\n' + fs.readFileSync(path.join(ROOT, f), 'utf8'))
    .join('\n;\n');
  if (opts.withRunes) {
    src += '\n;\n// ===== src/runes.js =====\n' + fs.readFileSync(path.join(ROOT, 'src/runes.js'), 'utf8');
  }
  if (opts.withRunMap) {
    src += '\n;\n// ===== src/runmap.js =====\n' + fs.readFileSync(path.join(ROOT, 'src/runmap.js'), 'utf8');
  }
  let meta = fs.readFileSync(path.join(ROOT, 'src/meta.js'), 'utf8');
  if (opts.killSwitch) meta = meta.replace('const META_ENABLED = true;', 'const META_ENABLED = false;');
  src += '\n;\n// ===== src/meta.js =====\n' + meta;
  return src;
}

const HARNESS = String.raw`
function _ok(c, m) { if (c) { __TR.pass++; __TR.log.push('✅ ' + m); } else { __TR.fail++; __TR.log.push('❌ ' + m); } }
function _eq(a, b, m) { _ok(a === b, m + ' (' + JSON.stringify(a) + ' === ' + JSON.stringify(b) + ')'); }
`;

function run(name, body, opts) {
  const sb = makeSandbox(opts || {});
  const src = loadEngineSrc(opts || {}) + '\n;\n' + HARNESS + '\n;\n' + body;
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
add(run('Тест 1: API мета-прогресса доступно', `
_ok(typeof RogueMeta === 'object', 'window.RogueMeta объявлен');
_ok(typeof RogueMeta.awardAtEndGame === 'function', 'awardAtEndGame есть');
_ok(typeof RogueMeta.isRuneUnlocked === 'function', 'isRuneUnlocked есть');
_ok(typeof RogueMeta.isBonusUnlocked === 'function', 'isBonusUnlocked есть');
_ok(typeof RogueMeta.reset === 'function', 'reset есть');
_eq(RogueMeta.getShards(), 0, 'стартовые осколки = 0');
const meta = RogueMeta.getMeta();
_eq(meta.totalRuns, 0, 'totalRuns = 0');
_eq(meta.wins, 0, 'wins = 0');
_ok(Array.isArray(meta.achievements) && meta.achievements.length === 0, 'achievements пуст');
_ok(Array.isArray(meta.history) && meta.history.length === 0, 'history пуст');
`));

// ── 2: первое поражение → first_run + base 30 ──
add(run('Тест 2: банкротство первого рана → first_run, +30 base +50 ачивка', `
const fakeG = { money: 0, monthsPlayed: 5, runMap: { stageIdx: 0 } };
const s = RogueMeta.awardAtEndGame(false, fakeG);
_eq(s.base, 30, 'базовая награда 30 за поражение');
_ok(s.newAchievements.some(a => a.id === 'first_run'), 'засчитана ачивка first_run');
_eq(s.award, 80, 'итого 30 + 50 (first_run) = 80');
_eq(s.meta.totalRuns, 1, 'totalRuns = 1');
_eq(s.meta.wins, 0, 'wins = 0');
_ok(s.meta.history.length === 1 && s.meta.history[0].bankrupt === true, 'история записана с bankrupt=true');
`));

// ── 3: первая победа → +stageBonus, +first_win + millionaire (v0.2) + v0.4 комбо ──
// Финал 9M ≥ 5M → millionaire (+150 ✦). FakeG без staff/runMap.choicesTaken →
// staffCount=0, choicesTaken=0 → v0.4 ачивки solo_win/no_milestones срабатывают.
// v0.5: staffCount=0 ещё и triggerит minimalist; отсутствие _loanTakenEver triggerит
// debt_free. Чтобы тест держал ту же сумму 540, блокируем все комбо: staff:[{},{}]
// (length 2 — НЕ minimalist, НЕ solo_win), choicesTaken:['x'] (НЕ no_milestones)
// и _loanTakenEver:true (НЕ debt_free). Сценарий agency, побед в bank нет —
// scenario_master тоже не выпадает.
add(run('Тест 3: первая победа на endgame → base+stageBonus+ачивки', `
const fakeG = { money: 9000000, monthsPlayed: 28, staff: [{},{}], _loanTakenEver: true, runMap: { stageIdx: 4, choicesTaken: ['x'] } };
const s = RogueMeta.awardAtEndGame(true, fakeG);
_eq(s.base, 100, 'базовая награда 100 за победу');
_eq(s.stageBonus, 80, 'stageBonus = 4×20 (cap 80)');
_ok(s.newAchievements.some(a => a.id === 'first_run'), 'засчитан first_run');
_ok(s.newAchievements.some(a => a.id === 'first_win'), 'засчитан first_win');
_ok(s.newAchievements.some(a => a.id === 'endgame_reached'), 'засчитан endgame_reached');
_ok(s.newAchievements.some(a => a.id === 'millionaire'), 'засчитан millionaire (peakMoney фолбэк = 9M ≥ 5M)');
_ok(!s.newAchievements.some(a => a.id === 'solo_win'),       'solo_win НЕ засчитан (staff.length=2)');
_ok(!s.newAchievements.some(a => a.id === 'no_milestones'),  'no_milestones НЕ засчитан (choicesTaken=1)');
_ok(!s.newAchievements.some(a => a.id === 'minimalist'),     'v0.5: minimalist НЕ засчитан (staff.length=2)');
_ok(!s.newAchievements.some(a => a.id === 'debt_free'),      'v0.5: debt_free НЕ засчитан (_loanTakenEver=true)');
_ok(!s.newAchievements.some(a => a.id === 'scenario_master'),'v0.5: scenario_master НЕ засчитан (только agency)');
// 100 + 80 + 50 (first_run) + 100 (first_win) + 60 (endgame_reached) + 150 (millionaire) = 540
_eq(s.award, 540, 'суммарное начисление 540');
_eq(s.meta.shards, 540, 'shards = 540');
`));

// ── 4: разблокировки по порогам ──
add(run('Тест 4: накопление до 150 ✦ → откроется hardened', `
_ok(!RogueMeta.isRuneUnlocked('hardened'), 'hardened пока заперт');
_ok(RogueMeta.isRuneUnlocked('connections'), 'connections всегда открыт');
_ok(RogueMeta.isBonusUnlocked('cash'), 'cash всегда открыт');
_ok(!RogueMeta.isBonusUnlocked('prepay'), 'prepay пока заперт (нужно 100)');
// Прокачиваем 2 победы на эндгейме → 100+80+100(win)+? раз; накапливаем
let total = 0;
for (let i = 0; i < 3; i++) {
  const s = RogueMeta.awardAtEndGame(true, { money: 9000000, monthsPlayed: 25, runMap: { stageIdx: 4 } });
  total = s.meta.shards;
}
_ok(total >= 150, 'накопилось ≥150 ✦ (' + total + ')');
_ok(RogueMeta.isRuneUnlocked('hardened'), 'после прокачки hardened открыта');
_ok(RogueMeta.isBonusUnlocked('prepay'), 'после прокачки prepay открыт');
`));

// ── 5: ачивка-«серийный» master_5_wins ──
add(run('Тест 5: 5 побед подряд → master_5_wins', `
let gotMaster = false;
for (let i = 0; i < 5; i++) {
  const s = RogueMeta.awardAtEndGame(true, { money: 9000000, monthsPlayed: 25, runMap: { stageIdx: 4 } });
  if (s.newAchievements.some(a => a.id === 'master_5_wins')) gotMaster = true;
}
_ok(gotMaster, 'на 5-й победе вылетела ачивка master_5_wins');
const m = RogueMeta.getMeta();
_eq(m.wins, 5, 'wins = 5');
_ok((m.achievements || []).includes('master_5_wins'), 'master_5_wins сохранилась');
`));

// ── 6: ачивка survivor — 3 рана подряд без банкротства ──
add(run('Тест 6: 3 рана без банкротства → survivor', `
// Победа дает bankrupt=false. Делаем три победы → последний даёт survivor.
let gotSurv = false;
for (let i = 0; i < 3; i++) {
  const s = RogueMeta.awardAtEndGame(true, { money: 9000000, monthsPlayed: 22, runMap: { stageIdx: 4 } });
  if (s.newAchievements.some(a => a.id === 'survivor')) gotSurv = true;
}
_ok(gotSurv, 'survivor засчитан');
`));

// ── 7: ачивки за конкретные руны ──
add(run('Тест 7: победа с руной connections → social_win', `
const fakeG = { money: 9000000, monthsPlayed: 25, runMap: { stageIdx: 2 },
               activeRune: { id: 'connections' } };
const s = RogueMeta.awardAtEndGame(true, fakeG);
_ok(s.newAchievements.some(a => a.id === 'social_win'), 'social_win засчитана');
`));

// ── 8: история ограничена 50 ──
add(run('Тест 8: история обрезается до 50 ранов', `
for (let i = 0; i < 55; i++) {
  RogueMeta.awardAtEndGame(false, { money: 0, monthsPlayed: 1, runMap: { stageIdx: 0 } });
}
const m = RogueMeta.getMeta();
_ok(m.history.length === 50, 'история = 50 (' + m.history.length + ')');
_eq(m.totalRuns, 55, 'totalRuns = 55');
`));

// ── 9: reset стирает прогресс ──
add(run('Тест 9: reset() возвращает дефолт', `
RogueMeta.awardAtEndGame(true, { money: 9000000, monthsPlayed: 25, runMap: { stageIdx: 4 } });
_ok(RogueMeta.getShards() > 0, 'shards > 0 до reset');
RogueMeta.reset();
_eq(RogueMeta.getShards(), 0, 'после reset shards = 0');
const m = RogueMeta.getMeta();
_eq(m.totalRuns, 0, 'totalRuns = 0');
_eq((m.achievements || []).length, 0, 'achievements пуст');
`));

// ── 10: kill-switch META_ENABLED=false ──
add(run('Тест 10: META_ENABLED=false → модуль не активирован', `
_ok(typeof RogueMeta === 'undefined', 'window.RogueMeta НЕ объявлен');
`, { killSwitch: true }));

// ── 11: без DLC roguelite модуль не активируется ──
add(run('Тест 11: без DLC roguelite → модуль не активирован', `
_ok(typeof RogueMeta === 'undefined', 'window.RogueMeta НЕ объявлен');
`, { noRoguelite: true }));

// ── 12: интеграция с runes — без осколков запираемые руны вне пула ──
add(run('Тест 12: integration runes — запираемые руны вне пула при 0 ✦', `
const lockedIds = ['hardened','scholar','networker','outsider'];
const pool = Runes.getPool();
_eq(pool.length, 10, 'полный пул содержит 10 рун (4 базовые + 4 ранние + 2 поздние v0.6)');
// При 0 ✦ запираемые не должны проходить isRuneUnlocked
const unlockedNow = pool.filter(r => RogueMeta.isRuneUnlocked(r.id)).map(r => r.id);
_eq(unlockedNow.length, 4, 'открыты ровно 4 базовые руны');
lockedIds.forEach(id => _ok(!unlockedNow.includes(id), id + ' пока заперт'));
`, { withRunes: true }));

// ── 13: интеграция с runmap — запираемые бонусы вне пула при 0 ✦ ──
// С v3.19 в агентстве 12 универсальных + 10 этап-эксклюзивов (по 2 на каждый из 5 этапов:
// garage word_of_mouth/startup_grant; team team_spirit/process_standards; growth media_feature/strategic_partner;
// brand thought_leader/design_awards; endgame boutique_premium/agency_franchise) = 22.
// Эксклюзивы не запираемые (нет в BONUS_UNLOCKS) → при 0 ✦ открыто 8 базовых + 10 эксклюзивов = 18.
add(run('Тест 13: integration runmap — запираемые бонусы вне пула при 0 ✦', `
const lockedBonus = ['prepay','penalty_shield','fatigue','portfolio'];
const all = RunMap.getBonuses();
_eq(all.length, 22, 'полный пул содержит 22 бонуса (12 универсальных + 10 этап-эксклюзивов)');
const openNow = all.filter(b => RogueMeta.isBonusUnlocked(b.id)).map(b => b.id);
_eq(openNow.length, 18, 'открыто 8 базовых + 10 этап-эксклюзивов = 18 (эксклюзивы не запираемые)');
lockedBonus.forEach(id => _ok(!openNow.includes(id), 'бонус ' + id + ' пока заперт'));
`, { withRunMap: true }));

// ── 14: persistence через localStorage ──
{
  // первый sandbox: накапливаем shards
  const sb1 = makeSandbox({ shareLS: true });
  const src1 = loadEngineSrc({}) + '\n;\n' + HARNESS + '\n;\n' +
               'RogueMeta.awardAtEndGame(true, { money:9000000, monthsPlayed:25, runMap:{stageIdx:4} });' +
               'RogueMeta.awardAtEndGame(true, { money:9000000, monthsPlayed:25, runMap:{stageIdx:4} });';
  vm.createContext(sb1);
  vm.runInContext(src1, sb1);
  // второй sandbox: новый запуск, прежний localStorage — shards должны сохраниться
  const sb2 = makeSandbox({ shareLS: true });
  const src2 = loadEngineSrc({}) + '\n;\n' + HARNESS + '\n;\n' +
               '_ok(RogueMeta.getShards() > 0, "после перезапуска shards > 0 (" + RogueMeta.getShards() + ")");' +
               '_ok(RogueMeta.getMeta().wins >= 2, "wins >= 2 (" + RogueMeta.getMeta().wins + ")");';
  vm.createContext(sb2);
  vm.runInContext(src2, sb2);
  console.log('── Тест 14: persistence через localStorage ──');
  sb2.__TR.log.forEach(l => console.log(l));
  add(sb2.__TR);
  // подчищаем после теста
  Object.keys(_persistentLS).forEach(k => { if (k !== 'bt_enabled_dlcs_v1') delete _persistentLS[k]; });
}

// ═════════════════════════════════════════════════════
//   v0.2 (2026-06-14): расширение мета-прогресса
//   — новые ачивки + геттеры getNextRuneUnlock/Bonus
// ═════════════════════════════════════════════════════

// ── 15: API геттеров getNextRuneUnlock / getNextBonusUnlock ──
add(run('Тест 15: getNextRuneUnlock возвращает ближайший порог', `
_ok(typeof RogueMeta.getNextRuneUnlock === 'function', 'getNextRuneUnlock есть');
_ok(typeof RogueMeta.getNextBonusUnlock === 'function', 'getNextBonusUnlock есть');
const nrune  = RogueMeta.getNextRuneUnlock();
_eq(nrune.id, 'hardened', 'первая запертая руна — hardened');
_eq(nrune.shards, 150, 'порог 150 ✦');
_eq(nrune.remaining, 150, 'осталось 150 (0/150)');
const nbon = RogueMeta.getNextBonusUnlock();
_eq(nbon.id, 'prepay', 'первый запертый бонус — prepay');
_eq(nbon.shards, 100, 'порог 100 ✦');
`));

// ── 16: ачивка millionaire — пик ≥ 5M ──
add(run('Тест 16: millionaire срабатывает при peakMoney ≥ 5M, не на низком', `
// При money < 5M (поражение) — millionaire НЕ срабатывает
RogueMeta.awardAtEndGame(false, { money: 800000, monthsPlayed: 8, runMap: { stageIdx: 1 } });
_ok(!RogueMeta.getMeta().achievements.includes('millionaire'), 'на 800K millionaire не падает');
// При peakMoney ≥ 5M — срабатывает (фолбэк на g.money если _runMaxMoney не задан)
const s = RogueMeta.awardAtEndGame(false, { money: 5500000, monthsPlayed: 12, runMap: { stageIdx: 2 } });
_ok(s.newAchievements.some(a => a.id === 'millionaire'), 'на 5.5M millionaire выпала');
`));

// ── 17: ачивка rune_collector — все 4 базовые руны ──
add(run('Тест 17: rune_collector — все 4 базовые руны хотя бы по разу', `
const RUNES = ['connections','perfectionist','insider','serial'];
let last = null;
for (const id of RUNES) {
  last = RogueMeta.awardAtEndGame(false, { money: 0, monthsPlayed: 5, runMap: { stageIdx: 1 }, activeRune: { id } });
}
_ok(last.newAchievements.some(a => a.id === 'rune_collector'), 'rune_collector выпала на 4-й руне');
const meta = RogueMeta.getMeta();
_eq((meta.playedRuneIds || []).length, 4, 'playedRuneIds содержит 4 id');
RUNES.forEach(id => _ok(meta.playedRuneIds.includes(id), 'playedRuneIds содержит ' + id));
`));

// ── 18: ачивка speedrun — победа на M ≤ 20 ──
add(run('Тест 18: speedrun — победа на M ≤ 20', `
// Победа на M22 — не speedrun
const s1 = RogueMeta.awardAtEndGame(true, { money: 9000000, monthsPlayed: 22, runMap: { stageIdx: 4 } });
_ok(!s1.newAchievements.some(a => a.id === 'speedrun'), 'M22 победа — speedrun НЕ срабатывает');
// Победа на M18 — speedrun
const s2 = RogueMeta.awardAtEndGame(true, { money: 8000000, monthsPlayed: 18, runMap: { stageIdx: 3 } });
_ok(s2.newAchievements.some(a => a.id === 'speedrun'), 'M18 победа — speedrun засчитана');
`));

// ── 19: ачивка phoenix — победа после провала до ≤ 50K ──
add(run('Тест 19: phoenix — победа после lowestMoney ≤ 50K', `
// Победа без провала (lowestMoney фолбэк = finalMoney, высокая) → не phoenix
const s1 = RogueMeta.awardAtEndGame(true, { money: 8000000, monthsPlayed: 22, runMap: { stageIdx: 4 } });
_ok(!s1.newAchievements.some(a => a.id === 'phoenix'), 'без провала phoenix НЕ срабатывает');
// Победа с трекером _runMinMoney = 30K → phoenix
const fake = { money: 8000000, _runMinMoney: 30000, monthsPlayed: 25, runMap: { stageIdx: 4 } };
const s2 = RogueMeta.awardAtEndGame(true, fake);
_ok(s2.newAchievements.some(a => a.id === 'phoenix'), 'phoenix засчитан при провале до 30K + победе');
`));

// ── 20: ачивка no_breakdowns — финал ≥ 80 реп ──
add(run('Тест 20: no_breakdowns — финальная репутация ≥ 80', `
const s1 = RogueMeta.awardAtEndGame(false, { money: 1000000, reputation: 65, monthsPlayed: 10, runMap: { stageIdx: 1 } });
_ok(!s1.newAchievements.some(a => a.id === 'no_breakdowns'), 'реп 65 — no_breakdowns НЕ срабатывает');
const s2 = RogueMeta.awardAtEndGame(false, { money: 200000, reputation: 85, monthsPlayed: 12, runMap: { stageIdx: 2 } });
_ok(s2.newAchievements.some(a => a.id === 'no_breakdowns'), 'реп 85 — no_breakdowns засчитан');
`));

// ── 21: ачивка win_streak_3 — три победы подряд ──
add(run('Тест 21: win_streak_3 — три победы подряд', `
let got = false;
for (let i = 0; i < 3; i++) {
  const s = RogueMeta.awardAtEndGame(true, { money: 8000000, monthsPlayed: 22, runMap: { stageIdx: 4 } });
  if (s.newAchievements.some(a => a.id === 'win_streak_3')) got = true;
}
_ok(got, 'на третьей победе подряд — win_streak_3');
// Прерванная серия не даёт стрик заново (он one-shot)
RogueMeta.reset();
RogueMeta.awardAtEndGame(true,  { money: 8000000, monthsPlayed: 22, runMap: { stageIdx: 4 } });
RogueMeta.awardAtEndGame(false, { money: 0,       monthsPlayed: 5,  runMap: { stageIdx: 0 } }); // банкрот разрывает
RogueMeta.awardAtEndGame(true,  { money: 8000000, monthsPlayed: 22, runMap: { stageIdx: 4 } });
RogueMeta.awardAtEndGame(true,  { money: 8000000, monthsPlayed: 22, runMap: { stageIdx: 4 } });
const meta = RogueMeta.getMeta();
_ok(!(meta.achievements || []).includes('win_streak_3'), 'банкрот посередине не даёт стрик (всего 2 победы подряд)');
`));

// ── 22: peakMoney/lowestMoney трекаются через advanceMonth-обёртку ──
add(run('Тест 22: обёртка advanceMonth ведёт _runMaxMoney/_runMinMoney', `
initState(); selectSpec('smm'); startGame();
const start = G.money;
_eq(G._runMaxMoney, start, '_runMaxMoney инициализирован при startGame');
_eq(G._runMinMoney, start, '_runMinMoney инициализирован при startGame');
G.money = start - 100000;
advanceMonth();
_ok(G._runMinMoney <= start - 100000 || G._runMinMoney <= G.money,
    '_runMinMoney обновлён после провала');
const peakBefore = G._runMaxMoney;
G.money = peakBefore + 500000;
advanceMonth();
_ok(G._runMaxMoney >= peakBefore + 500000 || G._runMaxMoney >= G.money,
    '_runMaxMoney обновлён после роста');
`, { withRunes: true }));

// ── 23: v0.3/v0.4/v0.5 мета-перки — API доступно, дефолт пуст ──
add(run('Тест 23: META_PERKS — API и дефолтное состояние (3 v0.3 + 3 v0.4 + 2 v0.5 = 8)', `
_ok(typeof RogueMeta.getMetaPerks === 'function',        'API getMetaPerks есть');
_ok(typeof RogueMeta.purchaseMetaPerk === 'function',    'API purchaseMetaPerk есть');
_ok(typeof RogueMeta.isMetaPerkUnlocked === 'function',  'API isMetaPerkUnlocked есть');
_ok(typeof RogueMeta.getBonusRerolls === 'function',     'API getBonusRerolls есть');
_ok(typeof RogueMeta.getConflictingPerks === 'function', 'v0.5: API getConflictingPerks есть');
const perks = RogueMeta.getMetaPerks();
_eq(perks.length, 10, 'в пуле 10 мета-перков (3 v0.3 + 3 v0.4 + 2 v0.5 + 2 v0.6)');
_ok(perks.some(p => p.id === 'extra_reroll'),   'v0.3: extra_reroll');
_ok(perks.some(p => p.id === 'seed_money'),     'v0.3: seed_money');
_ok(perks.some(p => p.id === 'brand_starter'),  'v0.3: brand_starter');
_ok(perks.some(p => p.id === 'penalty_grace'),  'v0.4: penalty_grace');
_ok(perks.some(p => p.id === 'signature_lead'), 'v0.4: signature_lead');
_ok(perks.some(p => p.id === 'wise_consult'),   'v0.4: wise_consult');
_ok(perks.some(p => p.id === 'early_advance'),  'v0.5: early_advance');
_ok(perks.some(p => p.id === 'solo_genius'),    'v0.5: solo_genius');
_eq(RogueMeta.getBonusRerolls(), 0, 'по дефолту bonusRerolls = 0');
_eq(RogueMeta.getUnlockedMetaPerkIds().length, 0, 'по дефолту перки не куплены');
`));

// ── 24: покупка перка — недостаточно ✦ ──
add(run('Тест 24: покупка при 0 ✦ → not_enough_shards', `
const r = RogueMeta.purchaseMetaPerk('extra_reroll');
_ok(!r.ok, 'покупка отклонена');
_eq(r.reason, 'not_enough_shards', 'причина: not_enough_shards');
_ok(!RogueMeta.isMetaPerkUnlocked('extra_reroll'), 'extra_reroll НЕ куплен');
`));

// ── 25: покупка перка — успех после набора ✦ ──
add(run('Тест 25: покупка перка после набора ✦', `
// Накопим 400 ✦ (extra_reroll 250 + запас)
for (let i = 0; i < 14; i++) RogueMeta.awardAtEndGame(false, { money: 0, runMap: { stageIdx: 0 } });
const before = RogueMeta.getShards();
_ok(before >= 250, 'набрали достаточно ✦ (' + before + ')');
const r = RogueMeta.purchaseMetaPerk('extra_reroll');
_ok(r.ok, 'покупка успешна');
_eq(r.perk.id, 'extra_reroll', 'купленный перк = extra_reroll');
_ok(RogueMeta.isMetaPerkUnlocked('extra_reroll'), 'extra_reroll отмечен куплен');
_eq(RogueMeta.getShards(), before - 250, '✦ списаны (' + before + ' → ' + RogueMeta.getShards() + ')');
_eq(RogueMeta.getBonusRerolls(), 1, 'после покупки bonusRerolls = 1');
`));

// ── 26: повторная покупка отклоняется ──
add(run('Тест 26: повторная покупка → already_owned', `
for (let i = 0; i < 14; i++) RogueMeta.awardAtEndGame(false, { money: 0, runMap: { stageIdx: 0 } });
RogueMeta.purchaseMetaPerk('extra_reroll');
const r2 = RogueMeta.purchaseMetaPerk('extra_reroll');
_ok(!r2.ok, 'вторая покупка отклонена');
_eq(r2.reason, 'already_owned', 'причина: already_owned');
`));

// ── 27: seed_money применяется в startGame ──
add(run('Тест 27: seed_money перк добавляет +100K к стартовому капиталу', `
// Базовый старт без перка
initState(); selectSpec('smm'); startGame();
const moneyBase = G.money;
// Покупаем seed_money (300 ✦)
for (let i = 0; i < 14; i++) RogueMeta.awardAtEndGame(false, { money: 0, runMap: { stageIdx: 0 } });
const r = RogueMeta.purchaseMetaPerk('seed_money');
_ok(r.ok, 'seed_money куплен');
// Новый ран — старт +100K
initState(); selectSpec('smm'); startGame();
_eq(G.money, moneyBase + 100000, 'после seed_money: +100K к стартовому капиталу');
`));

// ── 28: brand_starter применяется в startGame ──
add(run('Тест 28: brand_starter перк добавляет +5 к стартовой репутации', `
initState(); selectSpec('smm'); startGame();
const repBase = G.reputation;
// Покупаем brand_starter (200 ✦)
for (let i = 0; i < 10; i++) RogueMeta.awardAtEndGame(false, { money: 0, runMap: { stageIdx: 0 } });
const r = RogueMeta.purchaseMetaPerk('brand_starter');
_ok(r.ok, 'brand_starter куплен');
initState(); selectSpec('smm'); startGame();
_eq(G.reputation, repBase + 5, 'после brand_starter: +5 к стартовой репутации');
`));

// ── 29: difficulty_master — без всех 4 сложностей не выдаётся ──
add(run('Тест 29: difficulty_master — победа на 1 сложности недостаточна', `
// Симулируем easy в localStorage
localStorage.setItem('bt_difficulty_v1', 'easy');
const s = RogueMeta.awardAtEndGame(true, { money: 8000000, monthsPlayed: 25, runMap: { stageIdx: 4 } });
_ok(!s.newAchievements.some(a => a.id === 'difficulty_master'), 'после 1 победы на easy difficulty_master НЕ выдан');
const m = RogueMeta.getMeta();
_ok((m.wonDifficulties || []).includes('easy'), 'easy записан в wonDifficulties');
_eq((m.wonDifficulties || []).length, 1, 'wonDifficulties = [easy]');
`));

// ── 30: difficulty_master — победа на всех 4 сложностях выдаёт ачивку ──
add(run('Тест 30: difficulty_master — выдаётся на 4-й сложности', `
const diffs = ['easy', 'normal', 'hard', 'nightmare'];
let lastSummary;
diffs.forEach(d => {
  localStorage.setItem('bt_difficulty_v1', d);
  lastSummary = RogueMeta.awardAtEndGame(true, { money: 8000000, monthsPlayed: 25, runMap: { stageIdx: 4 } });
});
_ok(lastSummary.newAchievements.some(a => a.id === 'difficulty_master'),
    'difficulty_master выдан на 4-й сложности');
const m = RogueMeta.getMeta();
_eq((m.wonDifficulties || []).length, 4, 'все 4 сложности в wonDifficulties');
_ok((m.achievements || []).includes('difficulty_master'), 'ачивка в achievements');
`));

// ── 31: difficulty_master — повторные победы не дублируют запись ──
add(run('Тест 31: wonDifficulties уникален (повторы не дублируются)', `
localStorage.setItem('bt_difficulty_v1', 'hard');
RogueMeta.awardAtEndGame(true, { money: 8000000, monthsPlayed: 25, runMap: { stageIdx: 4 } });
RogueMeta.awardAtEndGame(true, { money: 8000000, monthsPlayed: 25, runMap: { stageIdx: 4 } });
RogueMeta.awardAtEndGame(true, { money: 8000000, monthsPlayed: 25, runMap: { stageIdx: 4 } });
const m = RogueMeta.getMeta();
_eq((m.wonDifficulties || []).length, 1, '3 победы подряд на hard → 1 запись');
_eq((m.wonDifficulties || [])[0], 'hard', 'запись = hard');
`));

// ── 32: difficulty запись в history ──
add(run('Тест 32: difficulty записывается в каждую запись history', `
localStorage.setItem('bt_difficulty_v1', 'nightmare');
RogueMeta.awardAtEndGame(false, { money: 0, runMap: { stageIdx: 1 } });
const m = RogueMeta.getMeta();
const last = m.history[m.history.length - 1];
_eq(last.difficulty, 'nightmare', 'последняя запись history.difficulty = nightmare');
`));

// ── 33: v0.4 penalty_grace — выставляет G.perkPenaltyShield в startGame ──
add(run('Тест 33: penalty_grace перк → G.perkPenaltyShield=true с старта', `
initState(); selectSpec('smm'); startGame();
_ok(!G.perkPenaltyShield, 'без перка G.perkPenaltyShield не выставлен');
for (let i = 0; i < 16; i++) RogueMeta.awardAtEndGame(false, { money: 0, runMap: { stageIdx: 0 } });
const r = RogueMeta.purchaseMetaPerk('penalty_grace');
_ok(r.ok, 'penalty_grace куплен');
initState(); selectSpec('smm'); startGame();
_ok(G.perkPenaltyShield === true, 'с купленным penalty_grace: shield=true с самого старта');
`));

// ── 34: v0.4 signature_lead — +1 caseScoutBonus с старта ──
add(run('Тест 34: signature_lead перк → +caseScoutBonus с старта', `
initState(); selectSpec('smm'); startGame();
const scoutBase = G.caseScoutBonus || 0;
for (let i = 0; i < 12; i++) RogueMeta.awardAtEndGame(false, { money: 0, runMap: { stageIdx: 0 } });
const r = RogueMeta.purchaseMetaPerk('signature_lead');
_ok(r.ok, 'signature_lead куплен');
initState(); selectSpec('smm'); startGame();
_eq(G.caseScoutBonus, scoutBase + 1, '+1 к caseScoutBonus');
`));

// ── 35: v0.4 wise_consult — +3 caseQBonus с старта ──
add(run('Тест 35: wise_consult перк → +caseQBonus с старта', `
initState(); selectSpec('smm'); startGame();
const qBase = G.caseQBonus || 0;
for (let i = 0; i < 10; i++) RogueMeta.awardAtEndGame(false, { money: 0, runMap: { stageIdx: 0 } });
const r = RogueMeta.purchaseMetaPerk('wise_consult');
_ok(r.ok, 'wise_consult куплен');
initState(); selectSpec('smm'); startGame();
_eq(G.caseQBonus, qBase + 3, '+3 к caseQBonus');
`));

// ── 36: solo_win — победа без найма команды ──
add(run('Тест 36: solo_win — победа с пустым G.staff', `
const fakeG = { money: 8000000, monthsPlayed: 18, staff: [], runMap: { stageIdx: 4, choicesTaken: [] } };
const s = RogueMeta.awardAtEndGame(true, fakeG);
_ok(s.newAchievements.some(a => a.id === 'solo_win'), 'solo_win засчитан (staff=0)');
// Контр-пример: победа с командой → solo_win НЕ засчитан
RogueMeta.reset();
const fakeG2 = { money: 8000000, monthsPlayed: 18, staff: [{}, {}], runMap: { stageIdx: 4, choicesTaken: [] } };
const s2 = RogueMeta.awardAtEndGame(true, fakeG2);
_ok(!s2.newAchievements.some(a => a.id === 'solo_win'), 'с командой solo_win НЕ засчитан');
`));

// ── 37: no_milestones — победа без выбора бонусов на milestones ──
add(run('Тест 37: no_milestones — победа с choicesTaken=[]', `
const fakeG = { money: 8000000, monthsPlayed: 18, staff: [{}], runMap: { stageIdx: 4, choicesTaken: [] } };
const s = RogueMeta.awardAtEndGame(true, fakeG);
_ok(s.newAchievements.some(a => a.id === 'no_milestones'), 'no_milestones засчитан (choicesTaken=0)');
// Контр-пример: с выбранными бонусами → НЕ засчитан
RogueMeta.reset();
const fakeG2 = { money: 8000000, monthsPlayed: 18, staff: [{}], runMap: { stageIdx: 4, choicesTaken: ['cash','rep'] } };
const s2 = RogueMeta.awardAtEndGame(true, fakeG2);
_ok(!s2.newAchievements.some(a => a.id === 'no_milestones'), 'с выбранными бонусами no_milestones НЕ засчитан');
`));

// ── 38: progress API — master_5_wins показывает прогресс ──
add(run('Тест 38: master_5_wins.progress → {cur:0..5, max:5}', `
const a = RogueMeta.getAchievements().find(x => x.id === 'master_5_wins');
_ok(typeof a.progress === 'function', 'progress API у master_5_wins');
const meta0 = RogueMeta.getMeta();
const p0 = a.progress({ meta: meta0 });
_eq(p0.cur, 0, 'до побед: cur=0');
_eq(p0.max, 5, 'максимум: max=5');
// 2 победы → cur=2
for (let i = 0; i < 2; i++) RogueMeta.awardAtEndGame(true, { money: 8000000, runMap: { stageIdx: 4 } });
const p1 = a.progress({ meta: RogueMeta.getMeta() });
_eq(p1.cur, 2, 'после 2 побед: cur=2');
`));

// ── 39: progress API — rune_collector показывает прогресс ──
add(run('Тест 39: rune_collector.progress отражает playedRuneIds', `
const a = RogueMeta.getAchievements().find(x => x.id === 'rune_collector');
_ok(typeof a.progress === 'function', 'progress API у rune_collector');
const p0 = a.progress({ meta: RogueMeta.getMeta() });
_eq(p0.cur, 0, 'до игр: cur=0');
_eq(p0.max, 4, 'максимум: 4 базовые руны');
// Симулируем ран с руной
RogueMeta.awardAtEndGame(false, { money: 0, runMap: { stageIdx: 0 }, activeRune: { id: 'connections' } });
const p1 = a.progress({ meta: RogueMeta.getMeta() });
_eq(p1.cur, 1, 'после рана с connections: cur=1');
`));

// ── 40: progress API — difficulty_master отражает wonDifficulties ──
add(run('Тест 40: difficulty_master.progress отражает wonDifficulties', `
const a = RogueMeta.getAchievements().find(x => x.id === 'difficulty_master');
_ok(typeof a.progress === 'function', 'progress API у difficulty_master');
const p0 = a.progress({ meta: RogueMeta.getMeta() });
_eq(p0.cur, 0, 'до побед: cur=0');
_eq(p0.max, 4, 'максимум: 4 сложности');
// Победа на easy и hard
localStorage.setItem('bt_difficulty_v1', 'easy');
RogueMeta.awardAtEndGame(true, { money: 8000000, runMap: { stageIdx: 4 } });
localStorage.setItem('bt_difficulty_v1', 'hard');
RogueMeta.awardAtEndGame(true, { money: 8000000, runMap: { stageIdx: 4 } });
const p1 = a.progress({ meta: RogueMeta.getMeta() });
_eq(p1.cur, 2, 'после 2 разных сложностей: cur=2');
`));

// ═════════════════════════════════════════════════════
//   v0.5 (2026-06-15): дерево выбора мета-перков
//   (взаимоисключения) + третья волна комбо-ачивок
// ═════════════════════════════════════════════════════

// ── 41: getConflictingPerks отдаёт корректный список конфликтов ──
add(run('Тест 41: getConflictingPerks — двунаправленность excludes', `
// early_advance объявлен с excludes:['seed_money'] → прямой конфликт
const cEarly = RogueMeta.getConflictingPerks('early_advance');
_ok(cEarly.includes('seed_money'), 'early_advance конфликтует с seed_money (direct)');
// seed_money сам не указывает excludes, но inverse-search должен его найти
const cSeed = RogueMeta.getConflictingPerks('seed_money');
_ok(cSeed.includes('early_advance'), 'seed_money конфликтует с early_advance (inverse)');
// solo_genius vs wise_consult аналогично
const cGenius = RogueMeta.getConflictingPerks('solo_genius');
_ok(cGenius.includes('wise_consult'), 'solo_genius конфликтует с wise_consult (direct)');
const cWise = RogueMeta.getConflictingPerks('wise_consult');
_ok(cWise.includes('solo_genius'), 'wise_consult конфликтует с solo_genius (inverse)');
// Перки без excludes — пустой список
_eq(RogueMeta.getConflictingPerks('extra_reroll').length, 0, 'extra_reroll без конфликтов');
_eq(RogueMeta.getConflictingPerks('brand_starter').length, 1, 'brand_starter конфликтует с brand_force (v0.6)');
// Несуществующий id → пустой список
_eq(RogueMeta.getConflictingPerks('nonexistent_perk').length, 0, 'unknown perk → []');
`));

// ── 42: попытка купить взаимоисключающий перк → excluded_by ──
add(run('Тест 42: покупка взаимоисключающего перка блокируется', `
// Накопим достаточно ✦ для обоих покупок
for (let i = 0; i < 30; i++) RogueMeta.awardAtEndGame(false, { money: 0, runMap: { stageIdx: 0 } });
const r1 = RogueMeta.purchaseMetaPerk('seed_money');
_ok(r1.ok, 'seed_money куплен');
// Попытка купить early_advance — должна быть отклонена
const r2 = RogueMeta.purchaseMetaPerk('early_advance');
_ok(!r2.ok, 'early_advance отклонён');
_eq(r2.reason, 'excluded_by', 'причина: excluded_by');
_eq(r2.blocker, 'seed_money', 'blocker = seed_money');
// Обратное направление: попробуем сценарий solo_genius → wise_consult
RogueMeta.reset();
for (let i = 0; i < 30; i++) RogueMeta.awardAtEndGame(false, { money: 0, runMap: { stageIdx: 0 } });
const r3 = RogueMeta.purchaseMetaPerk('wise_consult');
_ok(r3.ok, 'wise_consult куплен');
const r4 = RogueMeta.purchaseMetaPerk('solo_genius');
_ok(!r4.ok, 'solo_genius отклонён (inverse-блок)');
_eq(r4.reason, 'excluded_by', 'причина: excluded_by');
_eq(r4.blocker, 'wise_consult', 'blocker = wise_consult (через inverse-поиск)');
`));

// ── 43: early_advance применяется в startGame → +0.30 к perkPrepayBonus ──
add(run('Тест 43: early_advance перк → +0.30 к G.perkPrepayBonus с старта', `
initState(); selectSpec('smm'); startGame();
const baseBonus = G.perkPrepayBonus || 0;
for (let i = 0; i < 16; i++) RogueMeta.awardAtEndGame(false, { money: 0, runMap: { stageIdx: 0 } });
const r = RogueMeta.purchaseMetaPerk('early_advance');
_ok(r.ok, 'early_advance куплен');
initState(); selectSpec('smm'); startGame();
const after = G.perkPrepayBonus || 0;
_ok(Math.abs(after - (baseBonus + 0.30)) < 0.001,
    'после early_advance: perkPrepayBonus = base + 0.30 (' + baseBonus + ' → ' + after + ')');
`));

// ── 44: solo_genius применяется в startGame → +5 к qualityBonus ──
add(run('Тест 44: solo_genius перк → +5 к G.qualityBonus с старта', `
initState(); selectSpec('smm'); startGame();
const qBase = G.qualityBonus || 0;
for (let i = 0; i < 14; i++) RogueMeta.awardAtEndGame(false, { money: 0, runMap: { stageIdx: 0 } });
const r = RogueMeta.purchaseMetaPerk('solo_genius');
_ok(r.ok, 'solo_genius куплен');
initState(); selectSpec('smm'); startGame();
_eq(G.qualityBonus, qBase + 5, '+5 к qualityBonus');
`));

// ── 45: scenario_master — победа в agency + bank ──
add(run('Тест 45: scenario_master — победа в обоих сценариях', `
// agency-сценарий: после загрузки SCENARIO.id = 'agency' (HARNESS гидрирует agency.data.js)
// Победа на agency
const sA = RogueMeta.awardAtEndGame(true, { money: 8000000, monthsPlayed: 25, staff: [{},{}], _loanTakenEver: true, runMap: { stageIdx: 4, choicesTaken: ['x'] } });
_ok(!sA.newAchievements.some(a => a.id === 'scenario_master'), 'после 1 победы на agency scenario_master НЕ выдан');
let m = RogueMeta.getMeta();
_ok((m.wonScenarios || []).includes('agency'), 'agency записан в wonScenarios');
// Симулируем bank — подмена localStorage
localStorage.setItem('bt_scenario_v1', 'bank');
// Также обновим SCENARIO.id, чтобы _currentScenarioId предпочёл его (но он защищён try/catch)
try { SCENARIO.id = 'bank'; } catch (e) {}
const sB = RogueMeta.awardAtEndGame(true, { money: 8000000, monthsPlayed: 25, staff: [{},{}], _loanTakenEver: true, runMap: { stageIdx: 4, choicesTaken: ['x'] } });
_ok(sB.newAchievements.some(a => a.id === 'scenario_master'), 'после bank-победы scenario_master выдан');
m = RogueMeta.getMeta();
_eq((m.wonScenarios || []).length, 2, 'wonScenarios = 2');
_ok((m.achievements || []).includes('scenario_master'), 'ачивка в achievements');
`));

// ── 46: scenario_master.progress отражает wonScenarios ──
add(run('Тест 46: scenario_master.progress → {cur, max:2}', `
const a = RogueMeta.getAchievements().find(x => x.id === 'scenario_master');
_ok(typeof a.progress === 'function', 'progress API у scenario_master');
const p0 = a.progress({ meta: RogueMeta.getMeta() });
_eq(p0.cur, 0, 'до побед: cur=0');
_eq(p0.max, 2, 'максимум: 2 сценария');
// Победа на agency
RogueMeta.awardAtEndGame(true, { money: 8000000, runMap: { stageIdx: 4 } });
const p1 = a.progress({ meta: RogueMeta.getMeta() });
_eq(p1.cur, 1, 'после agency-победы: cur=1');
`));

// ── 47: debt_free — победа без кредита ──
add(run('Тест 47: debt_free — победа с loanTaken=false', `
// Победа без кредита: _loanTakenEver не выставлен → loanTaken=false → ачивка
const s1 = RogueMeta.awardAtEndGame(true, { money: 8000000, monthsPlayed: 25, staff: [{},{}], runMap: { stageIdx: 4, choicesTaken: ['x'] } });
_ok(s1.newAchievements.some(a => a.id === 'debt_free'), 'без кредита debt_free засчитан');
// Контр-пример: с _loanTakenEver=true ачивка не выдаётся
RogueMeta.reset();
const s2 = RogueMeta.awardAtEndGame(true, { money: 8000000, monthsPlayed: 25, staff: [{},{}], _loanTakenEver: true, runMap: { stageIdx: 4, choicesTaken: ['x'] } });
_ok(!s2.newAchievements.some(a => a.id === 'debt_free'), 'с кредитом (_loanTakenEver=true) debt_free НЕ засчитан');
const m = RogueMeta.getMeta();
const last = m.history[m.history.length - 1];
_eq(last.loanTaken, true, 'в history.loanTaken записан флаг');
`));

// ── 48: _updateMoneyTrack выставляет _loanTakenEver при наличии G.loan ──
add(run('Тест 48: обёртка advanceMonth выставляет _loanTakenEver при g.loan', `
initState(); selectSpec('smm'); startGame();
_ok(!G._loanTakenEver, 'после startGame _loanTakenEver отсутствует');
// Симулируем взятие кредита: ставим G.loan = объект и вызываем advanceMonth
G.loan = { amount: 50000, rate: 0.20, monthsLeft: 6 };
advanceMonth();
_ok(G._loanTakenEver === true, 'после advanceMonth с g.loan: _loanTakenEver=true');
// Даже если кредит позже погасили, флаг остаётся (once-and-for-all)
G.loan = null;
advanceMonth();
_ok(G._loanTakenEver === true, '_loanTakenEver не сбрасывается после погашения');
`, { withRunes: true }));

// ── 49: minimalist — победа с командой ≤1 ──
add(run('Тест 49: minimalist — победа с staff.length ≤ 1', `
// staffCount=0 → minimalist
const s1 = RogueMeta.awardAtEndGame(true, { money: 8000000, monthsPlayed: 25, staff: [], _loanTakenEver: true, runMap: { stageIdx: 4, choicesTaken: ['x'] } });
_ok(s1.newAchievements.some(a => a.id === 'minimalist'), 'staff=[] → minimalist засчитан');
// staffCount=1 → тоже minimalist
RogueMeta.reset();
const s2 = RogueMeta.awardAtEndGame(true, { money: 8000000, monthsPlayed: 25, staff: [{}], _loanTakenEver: true, runMap: { stageIdx: 4, choicesTaken: ['x'] } });
_ok(s2.newAchievements.some(a => a.id === 'minimalist'), 'staff.length=1 → minimalist засчитан');
// staffCount=2 → НЕ minimalist
RogueMeta.reset();
const s3 = RogueMeta.awardAtEndGame(true, { money: 8000000, monthsPlayed: 25, staff: [{},{}], _loanTakenEver: true, runMap: { stageIdx: 4, choicesTaken: ['x'] } });
_ok(!s3.newAchievements.some(a => a.id === 'minimalist'), 'staff.length=2 → minimalist НЕ засчитан');
`));

// ── 50: scenarioId записан в history ──
add(run('Тест 50: scenarioId записывается в каждую запись history', `
localStorage.setItem('bt_scenario_v1', 'bank');
try { SCENARIO.id = 'bank'; } catch (e) {}
RogueMeta.awardAtEndGame(false, { money: 0, runMap: { stageIdx: 1 } });
const m = RogueMeta.getMeta();
const last = m.history[m.history.length - 1];
_eq(last.scenarioId, 'bank', 'последняя запись history.scenarioId = bank');
`));

// ── 51: v0.6 ачивки — nightmare_clean ──
add(run('Тест 51: nightmare_clean — Nightmare без займов', `
// nightmare + no loan → засчитывается
const g1 = { money: 5e6, monthsPlayed: 30, staff: [], runMap: { stageIdx: 4, choicesTaken: [] }, _loanTakenEver: false };
__LS['bt_difficulty_v1'] = 'nightmare';
const s1 = RogueMeta.awardAtEndGame(true, g1);
_ok(s1.newAchievements.some(a => a.id === 'nightmare_clean'), 'nightmare + no_loan → nightmare_clean засчитан');

// nightmare + loan → НЕ засчитывается
RogueMeta.reset();
const g2 = { money: 4e6, monthsPlayed: 32, staff: [{},{}], runMap: { stageIdx: 4, choicesTaken: ['x'] }, _loanTakenEver: true };
__LS['bt_difficulty_v1'] = 'nightmare';
const s2 = RogueMeta.awardAtEndGame(true, g2);
_ok(!s2.newAchievements.some(a => a.id === 'nightmare_clean'), 'nightmare + loan → nightmare_clean НЕ засчитан');

// normal + no loan → НЕ засчитывается
RogueMeta.reset();
const g3 = { money: 4e6, monthsPlayed: 25, staff: [{},{}], runMap: { stageIdx: 4, choicesTaken: ['x'] }, _loanTakenEver: false };
__LS['bt_difficulty_v1'] = 'normal';
const s3 = RogueMeta.awardAtEndGame(true, g3);
_ok(!s3.newAchievements.some(a => a.id === 'nightmare_clean'), 'normal + no loan → nightmare_clean НЕ засчитан');
`));

// ── 52: v0.6 ачивки — bank_sprint ──
add(run('Тест 52: bank_sprint — bank ≤25 мес', `
// bank + M22 → засчитывается
localStorage.setItem('bt_scenario_v1', 'bank');
try { SCENARIO.id = 'bank'; } catch (e) {}
const g1 = { money: 5e6, monthsPlayed: 22, staff: [{},{}], runMap: { stageIdx: 4, choicesTaken: ['x'] }, _loanTakenEver: true };
const s1 = RogueMeta.awardAtEndGame(true, g1);
_ok(s1.newAchievements.some(a => a.id === 'bank_sprint'), 'bank M22 → bank_sprint засчитан');

// bank + M26 → НЕ засчитывается
RogueMeta.reset();
const g2 = { money: 5e6, monthsPlayed: 26, staff: [{},{}], runMap: { stageIdx: 4, choicesTaken: ['x'] }, _loanTakenEver: true };
const s2 = RogueMeta.awardAtEndGame(true, g2);
_ok(!s2.newAchievements.some(a => a.id === 'bank_sprint'), 'bank M26 → bank_sprint НЕ засчитан');

// agency + M20 → НЕ засчитывается (wrong scenario)
RogueMeta.reset();
localStorage.setItem('bt_scenario_v1', 'agency');
try { SCENARIO.id = 'agency'; } catch (e) {}
const g3 = { money: 5e6, monthsPlayed: 20, staff: [{},{}], runMap: { stageIdx: 4, choicesTaken: ['x'] }, _loanTakenEver: false };
const s3 = RogueMeta.awardAtEndGame(true, g3);
_ok(!s3.newAchievements.some(a => a.id === 'bank_sprint'), 'agency scenario → bank_sprint НЕ засчитан');

// bank + ровно M25 → засчитывается (граница включена)
RogueMeta.reset();
localStorage.setItem('bt_scenario_v1', 'bank');
try { SCENARIO.id = 'bank'; } catch (e) {}
const g4 = { money: 5e6, monthsPlayed: 25, staff: [{},{}], runMap: { stageIdx: 4, choicesTaken: ['x'] }, _loanTakenEver: true };
const s4 = RogueMeta.awardAtEndGame(true, g4);
_ok(s4.newAchievements.some(a => a.id === 'bank_sprint'), 'bank M25 (граница) → bank_sprint засчитан');
`));

// ── 53: v0.6 ачивки — rep_master ──
add(run('Тест 53: rep_master — репутация ≥ 95 при победе', `
// победа + rep 95 → засчитывается
const fakeG = { money: 5e6, monthsPlayed: 30, staff: [{},{}], runMap: { stageIdx: 4, choicesTaken: ['x'] }, _loanTakenEver: true, reputation: 95 };
const s1 = RogueMeta.awardAtEndGame(true, fakeG);
_ok(s1.newAchievements.some(a => a.id === 'rep_master'), 'rep=95 победа → rep_master засчитан');

// победа + rep 94 → НЕ засчитывается
RogueMeta.reset();
const fakeG2 = { money: 5e6, monthsPlayed: 30, staff: [{},{}], runMap: { stageIdx: 4, choicesTaken: ['x'] }, _loanTakenEver: true, reputation: 94 };
const s2 = RogueMeta.awardAtEndGame(true, fakeG2);
_ok(!s2.newAchievements.some(a => a.id === 'rep_master'), 'rep=94 → rep_master НЕ засчитан');

// поражение + rep 100 → НЕ засчитывается
RogueMeta.reset();
const fakeG3 = { money: 0, monthsPlayed: 20, staff: [], runMap: { stageIdx: 2, choicesTaken: [] }, _loanTakenEver: false, reputation: 100 };
const s3 = RogueMeta.awardAtEndGame(false, fakeG3);
_ok(!s3.newAchievements.some(a => a.id === 'rep_master'), 'поражение + rep=100 → rep_master НЕ засчитан');
`));

// ── 54: v0.6 мета-перки — market_edge ──
add(run('Тест 54: market_edge — prepay +20% + Q+2, excludes early_advance/wise_consult', `
const perks = RogueMeta.getMetaPerks();
const me = perks.find(p => p.id === 'market_edge');
_ok(!!me, 'market_edge существует в пуле');
_eq(me.cost, 400, 'цена market_edge = 400');
_eq(me.effects.startPrepayBonus, 0.20, 'startPrepayBonus = 0.20');
_eq(me.effects.startQBonus, 2, 'startQBonus = 2');
_ok(Array.isArray(me.excludes) && me.excludes.includes('early_advance'), 'excludes early_advance');
_ok(me.excludes.includes('wise_consult'), 'excludes wise_consult');

// купить market_edge → нельзя затем купить early_advance
const meta = RogueMeta.getMeta();
meta.shards = 2000; // имитируем достаточно
RogueMeta.reset(); // сбрасываем, затем накапливаем через awardAtEndGame
// Покупаем через прямой вызов purchaseMetaPerk после накопления shards
const g1 = { money: 5e6, monthsPlayed: 30, staff:[{},{}], runMap:{stageIdx:4,choicesTaken:['x']}, _loanTakenEver:true };
for (let i=0; i<8; i++) RogueMeta.awardAtEndGame(true, g1); // набрать shards
_ok(RogueMeta.getShards() >= 400, 'набрали достаточно shards для market_edge');
const r1 = RogueMeta.purchaseMetaPerk('market_edge');
_ok(r1.ok, 'market_edge куплен');
const r2 = RogueMeta.purchaseMetaPerk('early_advance');
_ok(!r2.ok && (r2.reason === 'excluded_by' || r2.blocker === 'market_edge'), 'early_advance заблокирован после market_edge');
const r3 = RogueMeta.purchaseMetaPerk('wise_consult');
_ok(!r3.ok && (r3.reason === 'excluded_by' || r3.blocker === 'market_edge'), 'wise_consult заблокирован после market_edge');
`));

// ── 55: v0.6 мета-перки — brand_force ──
add(run('Тест 55: brand_force — rep+10 + penaltyShield, excludes brand_starter/penalty_grace', `
const perks = RogueMeta.getMetaPerks();
const bf = perks.find(p => p.id === 'brand_force');
_ok(!!bf, 'brand_force существует в пуле');
_eq(bf.cost, 300, 'цена brand_force = 300');
_eq(bf.effects.startRep, 10, 'startRep = 10');
_ok(bf.effects.startPenaltyShield === true, 'startPenaltyShield = true');
_ok(Array.isArray(bf.excludes) && bf.excludes.includes('brand_starter'), 'excludes brand_starter');
_ok(bf.excludes.includes('penalty_grace'), 'excludes penalty_grace');

// купить brand_force → нельзя brand_starter / penalty_grace
const g1 = { money:5e6, monthsPlayed:30, staff:[{},{}], runMap:{stageIdx:4,choicesTaken:['x']}, _loanTakenEver:true };
for (let i=0;i<6;i++) RogueMeta.awardAtEndGame(true, g1);
const r1 = RogueMeta.purchaseMetaPerk('brand_force');
_ok(r1.ok, 'brand_force куплен');
const r2 = RogueMeta.purchaseMetaPerk('brand_starter');
_ok(!r2.ok, 'brand_starter заблокирован после brand_force');
const r3 = RogueMeta.purchaseMetaPerk('penalty_grace');
_ok(!r3.ok, 'penalty_grace заблокирован после brand_force');

// brand_force применяется к G через _applyMetaPerksToG (через startGame)
// Проверяем эффект через прямой доступ к эффектам купленного перка
const ids = RogueMeta.getUnlockedMetaPerkIds();
_ok(ids.includes('brand_force'), 'brand_force в списке купленных');
const perkData = RogueMeta.getMetaPerks().find(p=>p.id==='brand_force');
_eq(perkData.effects.startRep, 10, 'эффект startRep=10 читается корректно');
`));

// ── 56: v0.6 руны — architect и hustler в пуле ──
add(run('Тест 56: architect и hustler в пуле рун v0.6', `
const pool = Runes.getPool();
const arch = pool.find(r => r.id === 'architect');
const hust = pool.find(r => r.id === 'hustler');
_ok(!!arch, 'architect есть в пуле');
_ok(!!hust, 'hustler есть в пуле');
_eq(arch.effects.qualityBonus, 8, 'architect.qualityBonus = 8');
_eq(arch.effects.startMoneyDelta, -100000, 'architect.startMoneyDelta = -100K');
_eq(hust.effects.scoutBonus, 1, 'hustler.scoutBonus = 1');
_eq(hust.effects.payoutMult, 0.08, 'hustler.payoutMult = 0.08');
_eq(hust.effects.startMoneyDelta, -200000, 'hustler.startMoneyDelta = -200K');

// architect и hustler заблокированы без нужного мета-прогресса (shards 900 / 1100)
_ok(!RogueMeta.isRuneUnlocked('architect'), 'architect заперт при 0 shards');
_ok(!RogueMeta.isRuneUnlocked('hustler'), 'hustler заперт при 0 shards');
`, { withRunes: true }));

console.log(`\nИтог: ${totals.pass}/${totals.pass + totals.fail} проверок прошли`);
if (totals.fail > 0) process.exit(1);
