'use strict';
// ══════════════════════════════════════════════════════
//  Тест слоя основателя (src/founder.js, скелет)
//  Проверяем: расчёт 3 валют (капитал/системы/события), пресеты, сложность,
//  монотонность опыта, детерминизм, полноту весов, валидацию.
// ══════════════════════════════════════════════════════
const path = require('path');
const F = require(path.join(__dirname, '..', 'src', 'founder.js'));

let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; } else { fail++; console.log('❌ ' + m); } }
function eq(a, b, m) { ok(a === b, m + ` (ожидалось ${b}, получено ${a})`); }

// 1. Пресеты вычисляются; контраст Марк ↔ Виктор (значения совпадают с макетом)
const mark = F.compute(F.preset('mark'));
eq(mark.capital, 0, 'Марк: капитал');
eq(mark.opened.length, 2, 'Марк: открыто узлов');
eq(mark.eventWeight, 11, 'Марк: событийность');
eq(mark.challenge.tier, 'Брутальный старт', 'Марк: сложность');
ok(mark.opened.includes('port') && mark.opened.includes('hire'), 'Марк открывает port+hire (перфекц.+друг-раз)');

const victor = F.compute(F.preset('victor'));
eq(victor.capital, 11, 'Виктор: капитал');
eq(victor.opened.length, 6, 'Виктор: открыто узлов');
eq(victor.eventWeight, 7, 'Виктор: событийность');
eq(victor.challenge.tier, 'Мягкий вход', 'Виктор: сложность');

// 2. Обмен валют: личность-тяжёлый Марк драматичнее, но беднее; тангибл Виктор наоборот
ok(mark.eventWeight > victor.eventWeight, 'Марк драматичнее Виктора (обмен валют)');
ok(victor.capital > mark.capital && victor.opened.length > mark.opened.length, 'Виктор богаче стартом');

// 3. Монотонность опыта: больше лет → не меньше капитала и открытых узлов
const base = F.preset('mark');
let prevCap = -Infinity, prevOpen = -1, mono = true;
for (let y = 0; y <= 12; y++) {
  const d = Object.assign({}, base, { exp: y });
  const c = F.capitalOf(d), o = F.openedOf(d).length;
  if (c < prevCap || o < prevOpen) mono = false;
  prevCap = c; prevOpen = o;
}
ok(mono, 'опыт монотонен по капиталу и открытым узлам');
ok(F.expOpens(12).length === 4 && F.expOpens(2).length === 0, 'опыт: пороги 3/6/9/12 открывают узлы');
ok(F.expCap(12) === 3 && F.expCap(0) === 0, 'опыт: капитал floor(y/4)');
// клэмп опыта
ok(F.expCap(99) === 3 && F.expCap(-5) === 0, 'опыт клэмпится в 0..12');

// 4. Детерминизм
const d1 = F.compute(F.preset('ira')), d2 = F.compute(F.preset('ira'));
ok(JSON.stringify(d1) === JSON.stringify(d2), 'compute детерминирован');

// 5. Полнота весов: у КАЖДОГО параметра во всех пулах заданы cap и evt (числа)
let complete = true;
['traits', 'vices', 'drives', 'bonds', 'origins', 'ages'].forEach(pk => {
  const pool = F.POOLS[pk];
  Object.keys(pool).forEach(id => {
    const e = pool[id];
    if (typeof e.cap !== 'number' || typeof e.evt !== 'number') { complete = false; console.log('  ⚠ нет cap/evt у ' + pk + '.' + id); }
    if (e.opens && !Array.isArray(e.opens)) complete = false;
  });
});
ok(complete, 'у всех записей пулов заданы cap+evt (полное распределение)');

// 6. opens ссылаются только на существующие узлы дерева
const nodeIds = new Set(F.TREE.map(n => n.id));
let opensValid = true;
['traits', 'drives', 'bonds', 'origins', 'ages'].forEach(pk => {
  Object.values(F.POOLS[pk]).forEach(e => (e.opens || []).forEach(x => { if (!nodeIds.has(x)) opensValid = false; }));
});
ok(opensValid, 'все opens ссылаются на существующие узлы дерева');
eq(F.TREE.length, 13, 'дерево = 13 узлов');

// 7. Все 17 пресетов валидны и считаются без ошибок
let allPresets = true;
F.list().forEach(id => { const v = F.validate(F.preset(id)); if (!v.ok) { allPresets = false; console.log('  ⚠ невалидный пресет ' + id + ': ' + v.reason); } });
eq(F.list().length, 17, 'пресетов 17');
ok(allPresets, 'все пресеты валидны');

// 8. Валидация ловит битый драфт
ok(!F.validate({ age: 'zzz', exp: 1, origin: 'student', trait: 'perfectionist', vice: 'burnout', drive: 'prove', bond: 'dev_friend' }).ok, 'битый age → невалидно');
ok(!F.validate({ age: 'young', exp: 'x', origin: 'student', trait: 'perfectionist', vice: 'burnout', drive: 'prove', bond: 'dev_friend' }).ok, 'нечисловой exp → невалидно');
ok(F.validate(F.preset('victor')).ok, 'валидный драфт → ок');

console.log('\nИтог: ' + pass + '/' + (pass + fail) + ' проверок прошли');
if (fail > 0) process.exit(1);
