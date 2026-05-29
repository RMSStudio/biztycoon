#!/usr/bin/env node
/**
 * BizTycoon Build Script
 * Собирает constants + scenario + engine + ui + styles в единый portable HTML.
 *
 * Запуск:
 *   node build/build.js                    → использует сценарий по умолчанию (agency)
 *   node build/build.js --scenario=agency  → явно указать сценарий
 *
 * Результат: dist/BizTycoon.html
 */

const fs   = require('fs');
const path = require('path');

// ── Выбор сценария ────────────────────────────────────
const scenarioArg = process.argv.find(a => a.startsWith('--scenario='));
const SCENARIO_ID = scenarioArg ? scenarioArg.split('=')[1] : 'agency';

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

if (!fs.existsSync(DIST)) fs.mkdirSync(DIST);

// ── Читаем исходники в правильном порядке ─────────────
const scenarioPath = path.join(ROOT, 'scenarios', `${SCENARIO_ID}.js`);
if (!fs.existsSync(scenarioPath)) {
  console.error(`❌  Сценарий не найден: scenarios/${SCENARIO_ID}.js`);
  process.exit(1);
}

const html      = fs.readFileSync(path.join(ROOT, 'index.html'),          'utf8');
const css       = fs.readFileSync(path.join(ROOT, 'styles', 'game.css'), 'utf8');
const constants = fs.readFileSync(path.join(ROOT, 'src', 'constants.js'), 'utf8');
const scenario  = fs.readFileSync(scenarioPath,                           'utf8');
const eng       = fs.readFileSync(path.join(ROOT, 'src', 'engine.js'),   'utf8');
const ui        = fs.readFileSync(path.join(ROOT, 'src', 'ui.js'),       'utf8');
const saves     = fs.readFileSync(path.join(ROOT, 'src', 'saves.js'),    'utf8');

// ── CSS: <link> → <style> ─────────────────────────────
let out = html.replace(
  '<link rel="stylesheet" href="styles/game.css">',
  `<style>\n${css}\n</style>`
);

// ── JS: 4 тега → 1 инлайн-блок ───────────────────────
const scriptBlock = [
  '<script src="src/constants.js"></script>',
  `<script src="scenarios/${SCENARIO_ID}.js"></script>`,
  '<script src="src/engine.js"></script>',
  '<script src="src/ui.js"></script>',
  '<script src="src/saves.js"></script>',
  '<script>initState();</script>',
].join('\n');

const inlined = [
  `<script>`,
  constants,
  scenario,
  eng,
  ui,
  saves,
  `</script>`,
  `<script>initState();</script>`,
].join('\n\n');

out = out.replace(scriptBlock, inlined);

// ── Пишем результат ───────────────────────────────────
const outPath = path.join(DIST, 'BizTycoon.html');
fs.writeFileSync(outPath, out, 'utf8');

const kb = (fs.statSync(outPath).size / 1024).toFixed(1);
console.log(`✅  Build OK → dist/BizTycoon.html (${kb} KB)  [scenario: ${SCENARIO_ID}]`);
