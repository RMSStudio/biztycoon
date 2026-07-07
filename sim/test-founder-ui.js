'use strict';
// ══════════════════════════════════════════════════════
//  DOM-смоук панели основателя (src/founder-ui.js, v3.108)
//  Проверяем: панель инжектится перед «Командой» в режиме, бары параметров,
//  чипы характера (порок/рост-окраска), тон-счётчик, живое обновление на
//  founder_param/founder_event_choice, исчезновение вне режима.
// ══════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let JSDOM;
try { ({ JSDOM } = require('/tmp/node_modules/jsdom')); }
catch (e) {
  try { ({ JSDOM } = require('jsdom')); }
  catch (e2) { console.log('⚠️ jsdom не установлен — смоук пропущен (не ошибка)'); process.exit(0); }
}

const dom = new JSDOM(`<!DOCTYPE html><html><body>
  <div class="col-side"><div class="panel"><div class="panel-title">👥 Команда</div><div id="g-team-list"></div></div></div>
</body></html>`, { runScripts: 'outside-only', url: 'http://localhost/' });
const w = dom.window;
w.localStorage.setItem('bt_enabled_dlcs_v1', JSON.stringify(['unlocks']));

function load(f) { return fs.readFileSync(path.join(ROOT, f), 'utf8'); }
const src = [
  load('src/events.js'),
  'var G = { staff: [], activeClients: [], month: 3, money: 500000, actions: 10 };',
  load('src/unlocks.js'),
  load('src/founder.js'),
  load('src/founder-events.js'),
  load('src/traits-data.js'),
  load('src/traits.js'),
  load('src/founder-ui.js'),
  'window.G = G; window.EventBus = EventBus;',
].join('\n;\n');
w.eval(src);

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('✅ ' + m); } else { fail++; console.log('❌ ' + m); } };
const d = w.document;

// без основателя — панели нет
w.eval('FounderUI.render()');
ok(!d.getElementById('founder-panel'), 'без G.founder панели нет');

// поднимаем основателя (Тёма: Глубокий фокус + Соц-тревога)
w.eval(`Founder.initState(G, Founder.preset('tema')); FounderUI.render()`);
const panel = d.getElementById('founder-panel');
ok(!!panel, 'панель инжектнулась');
ok(panel.nextElementSibling && panel.nextElementSibling.textContent.includes('Команда'), 'стоит ПЕРЕД панелью «Команда»');
ok(panel.textContent.includes('Тёма') && panel.textContent.includes('Мастер'), 'имя и класс на месте');
ok(d.querySelectorAll('#founder-panel .fp-bar').length === 4, '4 бара параметров');
ok(panel.textContent.includes('Энергия') && panel.textContent.includes('70'), 'энергия 70 по дефолту');
ok(d.querySelectorAll('#founder-panel .fp-chip').length === 2, '2 чипа характера (черта+порок)');
ok(!!d.querySelector('#founder-panel .fp-chip.vice'), 'порок окрашен как vice');

// живое обновление: параметр и событие-выбор
w.eval(`Founder.paramAdd(G, 'energy', -55)`);   // 70 → 15 (красная зона)
ok(d.getElementById('founder-panel').textContent.includes('15'), 'бар обновился по founder_param (15)');
const barColor = d.querySelector('#founder-panel .fp-bar:nth-child(3) .t i').style.background;
ok(barColor.includes('232, 82, 79') || barColor.includes('#e8524f'), 'энергия в красной зоне');

// событие: вышел к людям → порок снят, рост-чип появился, тон 🌱
w.eval(`
  var se = FounderEvents.EVENTS.find(function(e){ return e.id === 'social_call'; });
  FounderEvents.applyChoice(G, se, se.choices[0]);
  FounderUI.render();
`);
ok(!!d.querySelector('#founder-panel .fp-chip.growth'), 'рост-трейт «Вышел к людям» отображён зелёным');
ok(d.querySelectorAll('#founder-panel .fp-chip.vice').length === 0, 'порок исчез (перерос)');
ok(d.getElementById('founder-panel').textContent.includes('🌱 1'), 'тон-счётчик 🌱 1');

// вне режима — панель убирается
w.eval(`localStorage.setItem('bt_enabled_dlcs_v1', '[]'); FounderUI.render()`);
ok(!d.getElementById('founder-panel'), 'вне режима панель исчезла');

console.log('\nИтог: ' + pass + '/' + (pass + fail) + ' проверок прошли');
process.exit(fail > 0 ? 1 : 0);
