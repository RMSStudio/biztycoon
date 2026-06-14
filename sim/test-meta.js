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

// ── 3: первая победа → +stageBonus, +first_win + millionaire (v0.2) ──
// Финал 9M ≥ 5M → новая ачивка millionaire (+150 ✦) тоже срабатывает.
add(run('Тест 3: первая победа на endgame → base+stageBonus+ачивки', `
const fakeG = { money: 9000000, monthsPlayed: 28, runMap: { stageIdx: 4 } };
const s = RogueMeta.awardAtEndGame(true, fakeG);
_eq(s.base, 100, 'базовая награда 100 за победу');
_eq(s.stageBonus, 80, 'stageBonus = 4×20 (cap 80)');
_ok(s.newAchievements.some(a => a.id === 'first_run'), 'засчитан first_run');
_ok(s.newAchievements.some(a => a.id === 'first_win'), 'засчитан first_win');
_ok(s.newAchievements.some(a => a.id === 'endgame_reached'), 'засчитан endgame_reached');
_ok(s.newAchievements.some(a => a.id === 'millionaire'), 'засчитан millionaire (peakMoney фолбэк = 9M ≥ 5M)');
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
_eq(pool.length, 8, 'полный пул содержит 8 рун');
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

console.log(`\nИтог: ${totals.pass}/${totals.pass + totals.fail} проверок прошли`);
if (totals.fail > 0) process.exit(1);
