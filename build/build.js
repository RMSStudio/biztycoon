#!/usr/bin/env node
/**
 * BizTycoon Build Script
 * Собирает все исходники в единый portable HTML.
 *
 * Запуск:
 *   node build/build.js                    → использует сценарий по умолчанию (agency)
 *   node build/build.js --scenario=agency  → явно указать сценарий
 *
 * Результат: dist/BizTycoon.html
 *
 * Маркеры в index.html: <!-- BUILD:START --> ... <!-- BUILD:END -->
 * Всё между ними заменяется инлайн-блоком.
 */

const fs   = require('fs');
const path = require('path');

// ── Выбор сценария ────────────────────────────────────
const scenarioArg = process.argv.find(a => a.startsWith('--scenario='));
// Без флага — мульти-дист: ВСЕ сценарии встроены, выбор в меню (v3.1).
// С флагом --scenario=<id> — одиночный дист (B2B-поставки).
const SCENARIO_ID = scenarioArg ? scenarioArg.split('=')[1] : 'multi';

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

if (!fs.existsSync(DIST)) fs.mkdirSync(DIST);

// ── Проверяем сценарий ─────────────────────────────────
const scenarioPath = path.join(ROOT, 'scenarios', `${SCENARIO_ID}.data.js`);
if (SCENARIO_ID !== 'multi' && !fs.existsSync(scenarioPath)) {
  console.error(`❌  Сценарий не найден: scenarios/${SCENARIO_ID}.js`);
  process.exit(1);
}

// ── Читаем index.html ──────────────────────────────────
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// ── CSS: <link> → <style> ─────────────────────────────
const css = fs.readFileSync(path.join(ROOT, 'styles', 'game.css'), 'utf8');
let out = html.replace(
  '<link rel="stylesheet" href="styles/game.css">',
  `<style>\n${css}\n</style>`
);

// ── Читаем JS-исходники в правильном порядке ──────────
function read(relPath) {
  const p = path.join(ROOT, relPath);
  if (!fs.existsSync(p)) {
    console.warn(`⚠️  Файл не найден, пропускаем: ${relPath}`);
    return `/* MISSING: ${relPath} */`;
  }
  return fs.readFileSync(p, 'utf8');
}

// Порядок важен: SE.applyActiveScenario() вызывается ПОСЛЕ scenario-editor.js
// но ДО engine.js, т.к. он модифицирует SCENARIO in-place, который engine читает при загрузке.
// Реализуем через два отдельных <script>-тега.
// Сценарный блок: одиночный — исходник как есть; мульти — все сценарии
// строками + выбор по localStorage (new Function изолирует const SCENARIO)
function scenarioBlock() {
  if (SCENARIO_ID !== 'multi')
    return read(`scenarios/${SCENARIO_ID}.data.js`) + String.fromCharCode(10) + read('src/scenario-loader.js');
  const files = fs.readdirSync(path.join(ROOT, 'scenarios')).filter(f => f.endsWith('.data.js'));
  const map = {};
  files.forEach(f => { map[f.replace('.data.js', '')] = read('scenarios/' + f); });
  return [
    '// ── Мульти-сценарный блок (v3.1): выбор из меню, см. ui.js SCENARIO_REGISTRY ──',
    'var __SCEN_SRC = ' + JSON.stringify(map) + ';',
    'window.SCENARIO_DATA = (function () {',
    "  var id = localStorage.getItem('bt_scenario_v1') || 'agency';",
    "  if (!__SCEN_SRC[id]) id = 'agency';",
    "  (new Function(__SCEN_SRC[id]))();",
    "  return window.SCENARIO_DATA;",
    '})();',
    read('src/scenario-loader.js'),
  ].join(String.fromCharCode(10));
}

const preEngineBlocks = [
  read('src/constants.js'),
  read('src/events.js'),
  scenarioBlock(),
  read('scenarios/presets/index.js'),
  read('src/staff.js'),
  read('src/scenario-editor.js'),
];

const postEngineBlocks = [
  read('src/engine.js'),
  read('src/projects.js'),
  read('src/ui.js'),
  read('src/saves.js'),
  read('src/ai.js'),
  // Опциональные модули ядра — отключаются комментированием строки
  // (или флагом внутри файла; см. src/outsource.js → OUTSOURCE_ENABLED,
  // src/runes.js → RUNES_ENABLED)
  read('src/outsource.js'),
  read('src/runes.js'),
  read('dlc/loader.js'),
];

// ── Инлайн-блок (заменяет всё между маркерами) ────────
const inlined = [
  // Блок 1: до engine — сценарий + редактор
  `<script>`,
  ...preEngineBlocks,
  `</script>`,
  // SE модифицирует SCENARIO до того, как engine биндит константы
  `<script>SE.applyActiveScenario();</script>`,
  // Блок 2: engine + остальное
  `<script>`,
  ...postEngineBlocks,
  `</script>`,
  // Инициализация
  `<script>`,
  `  initState();`,
  `  initEventBus();`,
  `  initScenarioSelect();`,
  `  initDifficultySelect();`,
  `  renderSpecGrid();`,
  `  applyScenarioChrome();`,
  `  SE.syncIntroStats();`,
  `  (function() {`,
  `    const btn = document.getElementById('btn-load-save');`,
  `    if (btn && !hasSaves()) btn.disabled = true;`,
  `  })();`,
  `  DLC.init();`,
  `  DLC.renderModeScreen();`,
  `</script>`,
].join('\n');

// ── Маркерная замена ───────────────────────────────────
const markerRe = /<!-- BUILD:START -->[\s\S]*?<!-- BUILD:END -->/;
if (!markerRe.test(out)) {
  console.error('❌  Маркеры BUILD:START / BUILD:END не найдены в index.html');
  process.exit(1);
}
out = out.replace(markerRe, inlined);

// ── Пишем результат ───────────────────────────────────
const outPath = path.join(DIST, SCENARIO_ID === 'multi' ? 'BizTycoon.html' : `BizTycoon-${SCENARIO_ID}.html`);
fs.writeFileSync(outPath, out, 'utf8');

const kb = (fs.statSync(outPath).size / 1024).toFixed(1);
console.log(`✅  Build OK → dist/${require('path').basename(outPath)} (${kb} KB)  [scenario: ${SCENARIO_ID}]`);
