// DLC-координатор режима «Rogue-lite» (id 'unlocks', Ф.7) — v0.2.
// Реальная система — src/unlocks.js (window.Unlocks: реестр модулей, гейт
// isModuleUnlocked, экономика экспертизы §15). Петля рана + UI дерева —
// src/unlocks-ui.js (window.UnlocksUI). Оба в src/, чтобы dist работал
// без папки dlc/ (паттерн mastery). Здесь — маркер активации + пинок UI
// (кейс «режим включили тумблером без перезагрузки»).
(function () {
  'use strict';
  const ID = 'unlocks';
  if (window.__UNLOCKS_DLC_LOADED) return;
  window.__UNLOCKS_DLC_LOADED = true;
  // Режим только что включили — обновить кнопку «Дерево открытий» на mode-screen
  try { if (window.UnlocksUI) window.UnlocksUI.refreshModeButton(); } catch (e) {}
  try {
    const U = window.Unlocks;
    console.log('[DLC:' + ID + '] v0.2 активирован. ' +
      (U ? ('Открыто модулей: ' + U.getOpened().length + '/' + U.MODULE_UNLOCKS.length + ' · ✦ ' + U.getExp() + ' · ранов: ' + U.getRuns()) : 'src/unlocks.js не загружен!'));
  } catch (e) {}
})();
