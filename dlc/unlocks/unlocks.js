// DLC-координатор режима «Rogue-lite» (id 'unlocks', Ф.7).
// Реальная система — src/unlocks.js (window.Unlocks: реестр модулей + гейт
// isModuleUnlocked), грузится как <script> в index.html и читает localStorage
// живьём. Здесь — только маркер активации (лог), чтобы соответствовать паттерну DLC.
(function () {
  'use strict';
  const ID = 'unlocks';
  if (window.__UNLOCKS_DLC_LOADED) return;
  window.__UNLOCKS_DLC_LOADED = true;
  try {
    const U = window.Unlocks;
    console.log('[DLC:' + ID + '] активирован. ' +
      (U ? ('Открыто модулей: ' + U.getOpened().length + '/' + U.MODULE_UNLOCKS.length) : 'src/unlocks.js не загружен!'));
  } catch (e) {}
})();
