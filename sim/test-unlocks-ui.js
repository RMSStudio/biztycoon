'use strict';
// ══════════════════════════════════════════════════════
//  DOM-смоук петли рана + экрана «Дерево открытий» (Ф.7 v2, src/unlocks-ui.js)
//  Требует jsdom (npm i jsdom). Проверяем:
//   - модал строится, 13 узлов, состояния open/avail/locked
//   - покупка кликом по кнопке: списание ✦, узел открыт, флеш
//   - end_game → петля начисляет ✦ и инжектит кнопку на results
//   - кнопка на mode-screen (dlc-cards) появляется и обновляется
// ══════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let JSDOM;
try { ({ JSDOM } = require('/tmp/node_modules/jsdom')); }
catch (e) {
  try { ({ JSDOM } = require('jsdom')); }
  catch (e2) { console.log('⚠️ jsdom не установлен — DOM-смоук пропущен (не ошибка)'); process.exit(0); }
}

const dom = new JSDOM(`<!DOCTYPE html><html><body>
  <div id="mode-extra"><div id="dlc-cards"></div></div>
  <div id="screen-results"><div style="text-align:center;display:flex"></div></div>
</body></html>`, { runScripts: 'outside-only', url: 'http://localhost/' });

const w = dom.window;
// localStorage: режим включён
w.localStorage.setItem('bt_enabled_dlcs_v1', JSON.stringify(['unlocks']));

// Мини-окружение игры
const sandboxGlobals = `
  var addLogCalls = []; var notifyCalls = [];
  function addLog(m, c) { addLogCalls.push(m); }
  function notify(m, t)  { notifyCalls.push(m); }
  var G = { month: 5, living: { stage: 1 } };
`;

function load(f) { return fs.readFileSync(path.join(ROOT, f), 'utf8'); }
const src = [
  load('src/events.js'),
  sandboxGlobals,
  load('src/unlocks.js'),
  load('src/unlocks-ui.js'),
  load('dlc/unlocks/unlocks.js'),
  // const/var из eval-скоупа не видны следующим w.eval — прокидываем в window
  'window.EventBus = EventBus; window.G = G; window.addLogCalls = addLogCalls; window.notifyCalls = notifyCalls;',
].join('\n;\n');

w.eval(src);

let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log('✅ ' + m); } else { fail++; console.log('❌ ' + m); } }
const d = w.document;

// 1: кнопка на mode-screen инжектится при загрузке DLC
ok(!!d.getElementById('unlocks-mode-btn'), 'кнопка «Дерево открытий» на mode-screen');

// 2: модал дерева
w.eval(`UnlocksUI.showTree()`);
const modal = d.getElementById('unlock-tree-modal');
ok(!!modal && modal.classList.contains('active'), 'модал открыт (.active)');
ok(d.querySelectorAll('.utree .node').length === 13, '13 узлов в дереве');
ok(d.querySelectorAll('.utree .node.avail').length === 2, '2 доступных узла (тир 1: hire+scout)');
ok(d.querySelectorAll('.utree .node.locked').length === 11, '11 запертых');
ok(d.querySelectorAll('.utree [data-buy]:not([disabled])').length === 0, 'без ✦ покупка недоступна');

// 3: end_game → начисление + кнопка на results
w.eval(`EventBus.emit('end_game', { won: false })`);
ok(w.eval(`Unlocks.getExp()`) >= 45, 'экспертиза начислена (база 30 + стадия 15)');
ok(!!d.getElementById('unlocks-results-btn'), 'кнопка на экране результатов');
ok(w.eval(`addLogCalls.some(m => m.indexOf('Экспертиза за ран') >= 0)`), 'анонс в лог');

// 4: докидываем ✦ и покупаем узел кликом
w.eval(`Unlocks.awardAtRunEnd(false, { living: { stage: 4 } })`);   // +90
w.eval(`UnlocksUI.showTree()`);
const buyBtn = d.querySelector('.utree [data-buy="hire"]:not([disabled])');
ok(!!buyBtn, 'кнопка «Открыть» активна при достатке ✦');
const expBefore = w.eval(`Unlocks.getExp()`);
buyBtn.click();
ok(w.eval(`Unlocks.getExp()`) === expBefore - 100, 'покупка списала 100 ✦');
ok(w.eval(`Unlocks.getOpened().includes('hire')`), 'hire открыт кликом');
ok(!!d.querySelector('#unode-hire.open'), 'узел перерисован как открытый');
ok(d.querySelectorAll('.utree .node.avail').length >= 2, 'тир 2 стал доступен (мягкий пререквизит)');
ok(w.eval(`notifyCalls.some(m => m.indexOf('Открыт модуль') >= 0)`), 'нотификация о покупке');

// 5: кнопка mode-screen обновилась
ok(d.getElementById('unlocks-mode-btn').innerHTML.indexOf('1/13') >= 0, 'кнопка mode-screen показывает 1/13');

// чистим за собой
w.eval(`Unlocks.reset()`);

console.log('\nИтог: ' + pass + '/' + (pass + fail) + ' проверок прошли');
process.exit(fail > 0 ? 1 : 0);
