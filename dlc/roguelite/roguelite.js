// ══════════════════════════════════════════════════════
//  DLC: Rogue-lite — координатор
//
//  Сами механики физически живут в:
//    src/runes.js      — стартовые перки-руны (v3.10)
//    src/storyarcs.js  — сюжетные арки Story Arcs (v3.11)
//    src/runmap.js     — карта рана с milestone-бонусами (v3.13)
//
//  Они встроены в single-HTML build, чтобы dist работал без
//  отдельной папки dlc/. Активация — гейтом по localStorage
//  ('bt_enabled_dlcs_v1' содержит 'roguelite'), который
//  включается через тумблер этого DLC на mode-screen.
//
//  Этот файл — точка входа DLC по реестру `dlc/loader.js`.
//  При активации DLC после перезагрузки страницы (или при
//  следующей загрузке) перечисленные модули сами увидят флаг
//  в localStorage и зарегистрируются.
//
//  Статус: v0.3 — реализованы первый (руны), второй (Story Arcs)
//  и третий (Run Map) шаги. См. backlog/01_features.md п.13:
//  следующие итерации — мета-прогресс между партиями,
//  полноценный выбор второй специализации, расширение контента арок.
// ══════════════════════════════════════════════════════

(function () {
  'use strict';

  const ID = 'roguelite';

  if (typeof EventBus === 'undefined') {
    console.error(`[DLC:${ID}] EventBus не найден — DLC не активирован`);
    return;
  }

  // Проверка: реальные модули загрузились?
  const runesLive  = !!window.__RUNES_LOADED;
  const arcsLive   = !!window.__SA_LOADED;
  const mapLive    = !!window.__RM_LOADED;

  const RL = {
    runCount: 0,
    components: {
      runes:      runesLive,
      storyArcs:  arcsLive,
      runMap:     mapLive,
    },
  };

  if (!runesLive || !arcsLive || !mapLive) {
    console.warn(`[DLC:${ID}] Внимание: часть механик не загрузилась — ` +
      `runes=${runesLive} storyArcs=${arcsLive} runMap=${mapLive}. ` +
      `Возможно DLC включили в этой же сессии — перезагрузите страницу.`);
  }

  // Хук на конец игры — счётчик ранов (под мета-прогресс в будущем)
  EventBus.on('end_game', ({ won }) => {
    RL.runCount++;
    console.log(`[DLC:${ID}] end_game (won=${won}), runs=${RL.runCount}`);
  });

  window._RL = RL;

  console.log(`[DLC:${ID}] v0.3 активирован — компоненты: ` +
    `руны=${runesLive ? 'on' : 'off'} · арки=${arcsLive ? 'on' : 'off'} · карта=${mapLive ? 'on' : 'off'}`);
})();
