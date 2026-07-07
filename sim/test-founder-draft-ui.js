'use strict';
// ══════════════════════════════════════════════════════
//  DOM-смоук экрана «Сборка основателя» (src/founder-draft-ui.js, v3.109)
//  Проверяем: открытие на чистом ране, ярусы (6 открытых струггеров + локи
//  с условиями), выбор пресета → подтверждение → G.founder, вкладка ручной
//  сборки (селекты+превью), случайный, повторное открытие при созданном
//  основателе не происходит, вне режима не открывается.
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

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { runScripts: 'outside-only', url: 'http://localhost/' });
const w = dom.window;
w.localStorage.setItem('bt_enabled_dlcs_v1', JSON.stringify(['unlocks']));

function load(f) { return fs.readFileSync(path.join(ROOT, f), 'utf8'); }
const src = [
  load('src/events.js'),
  'var G = { staff: [], activeClients: [], month: 0, money: 500000, actions: 10 };',
  load('src/unlocks.js'),
  load('src/founder.js'),
  load('src/founder-events.js'),
  load('src/traits-data.js'),
  load('src/traits.js'),
  load('src/founder-draft-ui.js'),
  'window.G = G; window.EventBus = EventBus;',
].join('\n;\n');
w.eval(src);

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('✅ ' + m); } else { fail++; console.log('❌ ' + m); } };
const d = w.document;

// открытие
ok(w.eval('FounderDraftUI.open()') === true, 'драфт открылся на чистом ране');
const modal = d.getElementById('founder-draft-modal');
ok(modal && modal.classList.contains('active'), 'модал активен');
ok(d.querySelectorAll('.fd-card').length === 17, 'все 17 прототипов на экране');
ok(d.querySelectorAll('.fd-card:not(.lock)').length === 6, '6 доступных (струггеры), остальные под локом');
ok(d.body.textContent.includes('3 рана или 1 победа'), 'условия открытия ярусов видны');
ok(d.getElementById('founder-draft-go').disabled, 'кнопка «Начать путь» заблокирована до выбора');

// выбор пресета и подтверждение
w.eval(`FounderDraftUI._pick('tema')`);
ok(!d.getElementById('founder-draft-go').disabled, 'выбор пресета разблокировал кнопку');
ok(d.getElementById('founder-draft-pick').textContent.includes('Тёма'), 'футер показывает выбор');
w.eval('FounderDraftUI.confirm()');
ok(w.eval('!!G.founder && G.founder.presetId') === 'tema', 'подтверждение создало G.founder (Тёма)');
ok(!modal.classList.contains('active'), 'модал закрылся');
ok(w.eval('G.founder.rlTraits.join()') === 'f_deep_focus,fv_social_anxiety', 'черта+порок Тёмы в rlTraits');

// повторное открытие при живом основателе — нет
ok(w.eval('FounderDraftUI.open()') === false, 'при созданном основателе драфт не открывается');

// ручная сборка на новом ране
w.eval('delete G.founder; FounderDraftUI.open(); FounderDraftUI._tabTo("manual")');
ok(d.querySelectorAll('#founder-draft-body select').length >= 6, 'ручная сборка: селекты пулов');
ok(d.querySelector('.fd-prev').textContent.length > 20, 'живое превью класса/сложности');
w.eval(`FounderDraftUI._man('trait', 'charismatic'); FounderDraftUI._man('vice', 'spender')`);
ok(d.querySelector('.fd-prev').textContent.includes('Харизматик'), 'превью обновилось на выбор черты');
w.eval('FounderDraftUI.confirm()');
ok(w.eval('G.founder.rlTraits.join()') === 'f_charismatic,fv_spender', 'ручной драфт создал основателя');

// вне режима не открывается
w.eval(`delete G.founder; localStorage.setItem('bt_enabled_dlcs_v1', '[]')`);
ok(w.eval('FounderDraftUI.open()') === false, 'вне режима драфт не открывается');

console.log('\nИтог: ' + pass + '/' + (pass + fail) + ' проверок прошли');
process.exit(fail > 0 ? 1 : 0);
