#!/usr/bin/env node
/**
 * BizTycoon Build Script
 * Собирает src/ + styles/ + index.html в единый portable HTML.
 * Запуск: node build/build.js
 * Результат: dist/BizTycoon.html
 */

const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

if (!fs.existsSync(DIST)) fs.mkdirSync(DIST);

// 1. Читаем исходники
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const css  = fs.readFileSync(path.join(ROOT, 'styles', 'game.css'), 'utf8');
const data = fs.readFileSync(path.join(ROOT, 'src', 'data.js'),   'utf8');
const eng  = fs.readFileSync(path.join(ROOT, 'src', 'engine.js'), 'utf8');
const ui   = fs.readFileSync(path.join(ROOT, 'src', 'ui.js'),     'utf8');

// 2. Подставляем CSS вместо <link>
let out = html.replace(
  '<link rel="stylesheet" href="styles/game.css">',
  `<style>\n${css}\n</style>`
);

// 3. Подставляем JS вместо трёх <script src="..."> + инициализация
const scripts = [
  '<script src="src/data.js"></script>',
  '<script src="src/engine.js"></script>',
  '<script src="src/ui.js"></script>',
  '<script>initState();</script>',
].join('\n');

const inlined = `<script>\n${data}\n\n${eng}\n\n${ui}\n</script>\n<script>initState();</script>`;
out = out.replace(scripts, inlined);

// 4. Пишем результат
const outPath = path.join(DIST, 'BizTycoon.html');
fs.writeFileSync(outPath, out, 'utf8');

const kb = (fs.statSync(outPath).size / 1024).toFixed(1);
console.log(`✅  Build OK → dist/BizTycoon.html (${kb} KB)`);
