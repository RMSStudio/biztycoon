'use strict';
// ══════════════════════════════════════════════════════════════════
//  Ф.7 §15.6 — BALANCE-PASS ПЕЙСИНГА МЕТЫ (headless-прогон ранов)
//
//  Гоняет РЕАЛЬНУЮ экономику src/unlocks.js (awardAtRunEnd + buy) по
//  скриптованной модели исходов ранов из §15.2:
//   • стадия компании за ран растёт с «собранностью» (открытые узлы дают
//     инструменты → глубже заходы) + случайный разброс
//   • «первые разы» случаются, когда открыт соответствующий модуль
//     (первый найм — после узла hire, первое поглощение — после mna…)
//   • победа возможна только на высокой собранности (11+/13) и стадии 5
//   • стратегия траты — жадная: покупаем самый дешёвый доступный узел
//
//  ЦЕЛИ (§15.1/§15.2):
//   • полное открытие 13/13 за 15–25 ранов (медиана по сидам)
//   • доход раннего рана ~80–120 ✦, позднего ~300–500 ✦
//
//  Запуск:  node sim/sim-unlocks-pacing.js [--seeds N] [--verbose]
//  Выход 0 = пейсинг в коридоре; 1 = вне коридора (для CI).
// ══════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');

const SEEDS   = +(process.argv.find(a => a.startsWith('--seeds')) || '').split('=')[1] || 40;
const VERBOSE = process.argv.includes('--verbose');

// ── песочница с реальным unlocks.js ────────────────────────────────
function makeWorld() {
  const ls = { 'bt_enabled_dlcs_v1': JSON.stringify(['unlocks']) };
  const sb = {
    console, JSON, Math,
    localStorage: {
      getItem: k => (Object.prototype.hasOwnProperty.call(ls, k) ? ls[k] : null),
      setItem: (k, v) => { ls[k] = String(v); },
      removeItem: k => { delete ls[k]; },
    },
  };
  sb.window = sb; sb.globalThis = sb;
  vm.createContext(sb);
  const src = fs.readFileSync(path.join(ROOT, 'src/unlocks.js'), 'utf8');
  vm.runInContext(src.replace(/console\.log\([^;]*\);?/g, ''), sb);   // глушим лог загрузки
  return sb;
}

// ── детерминированный PRNG (mulberry32) ────────────────────────────
function rng(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ── модель одного прогона меты (до 13/13 или maxRuns) ──────────────
function playMeta(seed, maxRuns) {
  const W = makeWorld();
  const U = W.Unlocks;
  const R = rng(seed);
  const log = [];

  for (let run = 1; run <= maxRuns; run++) {
    const opened  = U.getOpened();
    const n       = opened.length;
    const has     = id => opened.includes(id);

    // Стадия за ран (§15.2): база от собранности + разброс; без найма и
    // скаутинга выше «Гаража/Студии» не подняться.
    let stageCap;
    if (n === 0)      stageCap = 0;                       // голый тир-0
    else if (n <= 2)  stageCap = 1;                       // core собирается
    else if (n <= 4)  stageCap = 2;
    else if (n <= 6)  stageCap = 3;
    else if (n <= 9)  stageCap = 4;
    else              stageCap = 5;
    const stage = Math.max(0, Math.min(5, stageCap - (R() < 0.35 ? 1 : 0)));

    // Победа: реально только с почти собранной игрой на Империи
    const won = n >= 11 && stage === 5 && R() < 0.5;

    // «Первые разы» этого рана — зависят от открытых модулей (§15.3)
    const G = { living: { stage } };
    U._noteFirst('deliver');                                   // сдача есть почти в любом ране
    if (has('life') && R() < 0.8) U._noteFirst('t2');          // T2 после lifecycle
    if (has('life') && has('scout') && stage >= 2 && R() < 0.6) U._noteFirst('t3');
    if (has('hire'))   U._noteFirst('hire');
    if (has('market')) U._noteFirst('market');
    if (has('mna') && stage >= 3 && R() < 0.5) U._noteFirst('mna');

    const s = U.awardAtRunEnd(won, G);

    // Жадная скупка: самый дешёвый доступный узел, пока хватает ✦
    let bought = [];
    for (;;) {
      const avail = U.list().filter(m => m.avail && U.getExp() >= m.cost)
                     .sort((a, b) => a.cost - b.cost);
      if (!avail.length) break;
      const r = U.buy(avail[0].id);
      if (!r.ok) break;
      bought.push(avail[0].id);
    }

    log.push({ run, stage, won, award: s.award, firsts: s.firstsExp, exp: U.getExp(),
               bought, opened: U.getOpened().length });
    if (U.getOpened().length >= 13) return { runsToFull: run, log };
  }
  return { runsToFull: null, log };
}

// ── прогон по сидами + сводка ──────────────────────────────────────
const MAX_RUNS = 45;
const results = [];
for (let s = 1; s <= SEEDS; s++) results.push(playMeta(s * 7919, MAX_RUNS));

const fulls = results.map(r => r.runsToFull).filter(x => x != null);
fulls.sort((a, b) => a - b);
const median = fulls.length ? fulls[Math.floor(fulls.length / 2)] : null;
const p10 = fulls.length ? fulls[Math.floor(fulls.length * 0.1)] : null;
const p90 = fulls.length ? fulls[Math.floor(fulls.length * 0.9)] : null;

// доходы раннего/позднего рана (по всем сидам)
const early = [], late = [];
results.forEach(r => r.log.forEach(l => {
  if (l.run <= 2) early.push(l.award);
  if (l.opened >= 10) late.push(l.award);
}));
const avg = a => a.length ? Math.round(a.reduce((t, x) => t + x, 0) / a.length) : 0;

if (VERBOSE && results[0]) {
  console.log('── Пример прогона (сид 1) ──');
  console.log('ран | стадия | win | доход ✦ (перв.) | баланс | куплено                    | собр.');
  results[0].log.forEach(l => console.log(
    String(l.run).padStart(3) + ' |   ' + l.stage + '    |  ' + (l.won ? '✓' : '·') +
    '  | ' + String(l.award).padStart(4) + ' (' + String(l.firsts).padStart(3) + ')     | ' +
    String(l.exp).padStart(5) + '  | ' + (l.bought.join(',') || '—').padEnd(26) + ' | ' + l.opened + '/13'));
}

console.log('\n══ §15.6 ПЕЙСИНГ МЕТЫ (сидов: ' + SEEDS + ') ══');
console.log('Полное открытие 13/13: медиана ' + median + ' ранов · p10 ' + p10 + ' · p90 ' + p90 +
  ' · не успели за ' + MAX_RUNS + ': ' + (SEEDS - fulls.length));
console.log('Доход раннего рана (1–2): в среднем ' + avg(early) + ' ✦ (цель 80–120)');
console.log('Доход позднего рана (10+/13): в среднем ' + avg(late) + ' ✦ (цель 300–500)');

const okRuns  = median != null && median >= 15 && median <= 25;
const okEarly = avg(early) >= 60  && avg(early) <= 140;
const okLate  = avg(late)  >= 250 && avg(late)  <= 550;
console.log('\nКоридоры: раны ' + (okRuns ? '✅' : '❌') + ' · ранний доход ' + (okEarly ? '✅' : '❌') +
  ' · поздний доход ' + (okLate ? '✅' : '❌'));
process.exit(okRuns && okEarly && okLate ? 0 : 1);
