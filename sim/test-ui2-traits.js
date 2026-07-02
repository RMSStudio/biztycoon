'use strict';
// ══════════════════════════════════════════════════════
//  DOM-смоук: бейджи джокеров в v2-слое (Ф.7 → HUD Shell, src/ui2.js)
//  Требует jsdom. Проверяем:
//   - строки команды в левом HUD несут .staff-jokers с иконкой и именем трейта
//   - кнопка «🎛 Билд» появляется в действиях команды (режим Rogue-lite)
//   - вне режима — ни бейджей, ни кнопки (v2 не меняется)
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

function load(f) { return fs.readFileSync(path.join(ROOT, f), 'utf8'); }

function makePage(modeOn) {
  const dom = new JSDOM(`<!DOCTYPE html><html><body>
    <div id="v2-shell" style="display:none">
      <div id="statusbar"><span class="sb-stage"></span></div>
      <div id="hud-left"><div class="staff-list"></div>
        <span class="fatigue-val"></span><div class="fat-fill"></div><span class="fot-val"></span></div>
      <div id="projects-zone"></div>
    </div>
  </body></html>`, { runScripts: 'outside-only', url: 'http://localhost/' });
  const w = dom.window;
  w.localStorage.setItem('bt_enabled_dlcs_v1', JSON.stringify(modeOn ? ['unlocks'] : []));
  const env = `
    function _staff(o){ return Object.assign({ _iid:'s'+Math.random(), role:'designer', grade:'middle',
      name:'Тест', mood:75, cost:50000, status:'active', qStat:6, rlTraits:[] }, o||{}); }
    var G = { month: 3, money: 100000, reputation: 50, actions: 10, staff: [
        _staff({ name:'Марина К.', rlTraits:['niche_expert','loner'] }),
        _staff({ name:'Олег Д.', role:'developer' }),
      ], activeClients: [], teamFatigue: 10, clientNPS: {} };
    function getTotalStaffCost(){ return 100000; }
    function monthLabel(){ return 'Март'; }
  `;
  const src = [ load('src/events.js'), env, load('src/unlocks.js'), load('src/traits-data.js'),
                load('src/traits.js'), load('src/traits-ui.js'), load('src/ui2.js'),
                'window.EventBus = EventBus; window.G = G;' ].join('\n;\n');
  w.eval(src);
  return { dom, w };
}

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('✅ ' + m); } else { fail++; console.log('❌ ' + m); } };

// ── режим ВКЛючен ──
const A = makePage(true);
setTimeout(() => {
  const d = A.w.document;
  const jokers = d.querySelectorAll('#hud-left .staff-jokers .joker');
  ok(jokers.length === 2, 'бейджи джокеров у носителя (2 трейта): ' + jokers.length);
  ok(d.querySelector('#hud-left .staff-jokers') && d.body.textContent.includes('Нишевый'), 'имя трейта «Нишевый» в бейдже');
  ok((jokers[0] && jokers[0].getAttribute('title') || '').includes('—'), 'тултип с описанием трейта');
  const rows = d.querySelectorAll('#hud-left .staff-row');
  ok(rows.length === 2 && !rows[1].querySelector('.staff-jokers'), 'у спеца без трейтов бейджей нет');
  const btns = Array.from(d.querySelectorAll('#hud-left button')).map(b => b.textContent);
  ok(btns.some(t => t.includes('Билд')), 'кнопка «🎛 Билд» в действиях команды: ' + btns.join(' | '));

  // ── режим ВЫКЛючен ──
  const B = makePage(false);
  setTimeout(() => {
    const d2 = B.w.document;
    ok(d2.querySelectorAll('#hud-left .staff-jokers').length === 0, 'вне режима бейджей нет');
    const btns2 = Array.from(d2.querySelectorAll('#hud-left button')).map(b => b.textContent);
    ok(!btns2.some(t => t.includes('Билд')), 'вне режима кнопки «Билд» нет');
    ok(d2.querySelectorAll('#hud-left .staff-row').length === 2, 'строки команды рисуются как раньше');

    console.log('\nИтог: ' + pass + '/' + (pass + fail) + ' проверок прошли');
    process.exit(fail > 0 ? 1 : 0);
  }, 250);
}, 250);
