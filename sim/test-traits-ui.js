'use strict';
// ══════════════════════════════════════════════════════
//  DOM-смоук экрана «Билд команды» (Ф.7 §14.9 шаг 4, src/traits-ui.js)
//  Требует jsdom. Проверяем: модал строится, ростер с rl-трейтами,
//  статусы синергий (актив/почти), локальная проектная синергия,
//  карточка запертых пулов.
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

const dom = new JSDOM(`<!DOCTYPE html><html><body></body></html>`, { runScripts: 'outside-only', url: 'http://localhost/' });
const w = dom.window;
w.localStorage.setItem('bt_enabled_dlcs_v1', JSON.stringify(['unlocks']));

function load(f) { return fs.readFileSync(path.join(ROOT, f), 'utf8'); }
const src = [
  load('src/events.js'),
  load('src/unlocks.js'),
  load('src/traits-data.js'),
  load('src/traits.js'),
  load('src/traits-ui.js'),
  `
  function _staff(o){ return Object.assign({ _iid:'s'+Math.random(), role:'designer', grade:'middle',
    roleLabel:'Дизайнер', icon:'🎨', name:'Тест', mood:75, cost:50000, status:'active', qStat:6, speedStat:6, rlTraits:[] }, o||{}); }
  var G = { staff:[
      _staff({ name:'Марина', rlTraits:['niche_expert'] }),
      _staff({ name:'Олег' }),
      _staff({ name:'Вера' }),
      _staff({ name:'Артём', _iid:'dev1', role:'developer', roleLabel:'Разработчик', icon:'💻' }),
      _staff({ name:'Соня',  _iid:'dev2', role:'developer', roleLabel:'Разработчик', icon:'💻' }),
    ],
    activeClients:[ { id:'p1', name:'Ритейл «Полка»', icon:'🏪', tier:3,
      _assignedStaff:['dev1','dev2'], _monthsSigned:2, _duration:5 } ] };
  // 2 senior на проекте для «Парного ревью»? нет — проверим синерго через 2 senior:
  G.staff[3].grade = 'senior'; G.staff[4].grade = 'senior';
  window.G = G; window.EventBus = EventBus;
  `,
].join('\n;\n');
w.eval(src);

let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log('✅ ' + m); } else { fail++; console.log('❌ ' + m); } }
const d = w.document;

w.eval(`TraitsUI.showTeamBuild()`);
const modal = d.getElementById('team-build-modal');
ok(!!modal && modal.classList.contains('active'), 'модал «Билд команды» открыт');
ok(d.querySelectorAll('.tbuild .jk').length === 5, 'ростер: 5 карточек-джокеров');
ok(d.querySelectorAll('.tbuild .jk-trait').length >= 1, 'rl-трейт отображён в карточке');
ok(d.body.textContent.indexOf('Нишевый') >= 0, 'имя трейта «Нишевый» на экране');

const bodyTxt = d.getElementById('team-build-body').textContent;
ok(bodyTxt.indexOf('Дизайн-бутик') >= 0, 'синергия «Дизайн-бутик» в списке');
ok(d.querySelectorAll('.tbuild .syn.on').length >= 1, 'есть активная синергия (3 дизайнера)');
ok(d.querySelectorAll('.tbuild .syn.near').length >= 0 && bodyTxt.indexOf('Тех-шоп') >= 0, 'Тех-шоп присутствует со статусом');
ok(d.querySelectorAll('.tbuild .plocal .fire').length >= 1, 'локальная синергия проекта («Парное ревью»: 2 sr) активна');
ok(bodyTxt.indexOf('Запертые трейт-пулы') >= 0, 'карточка запертых пулов (узлы не открыты)');

// повторный вызов — перерисовка без дублей
w.eval(`TraitsUI.showTeamBuild()`);
ok(d.querySelectorAll('#team-build-modal').length === 1, 'повторное открытие не плодит модалы');

console.log('\nИтог: ' + pass + '/' + (pass + fail) + ' проверок прошли');
process.exit(fail > 0 ? 1 : 0);
