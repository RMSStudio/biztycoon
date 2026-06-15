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
//  Статус: v0.4 — реализованы первый (руны), второй (Story Arcs),
//  третий (Run Map) и четвёртый (мета-прогресс между партиями) шаги.
//  См. backlog/01_features.md п.13: следующие итерации — полноценный
//  выбор второй специализации, расширение контента арок, кастомизация
//  Run Map по сценарию.
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
  const metaLive   = !!window.__META_LOADED;

  const RL = {
    runCount: 0,
    components: {
      runes:      runesLive,
      storyArcs:  arcsLive,
      runMap:     mapLive,
      meta:       metaLive,
    },
  };

  if (!runesLive || !arcsLive || !mapLive || !metaLive) {
    console.warn(`[DLC:${ID}] Внимание: часть механик не загрузилась — ` +
      `runes=${runesLive} storyArcs=${arcsLive} runMap=${mapLive} meta=${metaLive}. ` +
      `Возможно DLC включили в этой же сессии — перезагрузите страницу.`);
  }

  // Хук на конец игры — счётчик ранов + начисление мета-прогресса.
  // RogueMeta.awardAtEndGame обновит localStorage, посчитает ачивки и
  // вернёт сводку для нотификаций; модал-сводку показываем поверх
  // экрана конца игры (если модуль meta доступен).
  EventBus.on('end_game', ({ won }) => {
    RL.runCount++;
    let summary = null;
    if (window.RogueMeta && typeof window.RogueMeta.awardAtEndGame === 'function') {
      try {
        summary = window.RogueMeta.awardAtEndGame(!!won, (typeof G !== 'undefined') ? G : null);
        _announceMetaAward(summary);
        // Обновляем подпись «X ✦» на кнопке мета-прогресса (если она уже в DOM)
        if (typeof window.RogueMeta._injectModeButton === 'function') {
          // Удаляем кэшированную кнопку и пересоздаём (внутри инжектор сам поставит свежее значение)
          const btn = (typeof document !== 'undefined') ? document.getElementById('meta-mode-btn') : null;
          if (btn && btn.parentElement) btn.parentElement.removeChild(btn);
          try { window.RogueMeta._injectModeButton(); } catch (e) {}
        }
      } catch (e) {
        console.warn(`[DLC:${ID}] meta award error:`, e);
      }
    }
    console.log(`[DLC:${ID}] end_game (won=${won}), runs=${RL.runCount}` +
      (summary ? `, +${summary.award}✦ → ${summary.meta.shards}✦` : ''));
  });

  // Нотификации/лог-сводка по итогам начисления мета-прогресса
  function _announceMetaAward(s) {
    if (!s) return;
    if (typeof addLog === 'function') {
      addLog(`⚡ Мета-прогресс: +${s.award} ✦ (база ${s.base}${s.stageBonus ? ' + этап ' + s.stageBonus : ''}). Всего ${s.meta.shards} ✦.`, 'purple');
      (s.newAchievements || []).forEach(a => {
        addLog(`${a.icon} Ачивка «${a.name}»: ${a.desc} · +${a.shards} ✦`, 'green');
      });
      (s.newRunes || []).forEach(id => {
        addLog(`🔓 Открыта руна: ${id}`, 'green');
      });
      (s.newBonuses || []).forEach(id => {
        addLog(`🔓 Открыт бонус Run Map: ${id}`, 'green');
      });
    }
    if (typeof notify === 'function') {
      const parts = [`⚡ +${s.award} ✦`];
      if (s.newAchievements && s.newAchievements.length) parts.push(`${s.newAchievements.length} ачивок`);
      const unlocks = (s.newRunes?.length || 0) + (s.newBonuses?.length || 0);
      if (unlocks) parts.push(`+${unlocks} разблок.`);
      notify(parts.join(' · '), 'success');
    }
  }

  // п.29: beforeunload — запись мета-прогресса при закрытии/обновлении страницы
  // Вызываем awardAtEndGame синхронно (не через EventBus, т.к. слушатели async-like)
  window.addEventListener('beforeunload', function () {
    if (typeof G === 'undefined' || !G || (G.month || 0) < 1) return;
    if (G._endGameFired) return; // уже записано
    if (window.RogueMeta && typeof window.RogueMeta.awardAtEndGame === 'function') {
      try {
        RL.runCount++;
        G._endGameFired = true;
        window.RogueMeta.awardAtEndGame(false, G);
      } catch (e) { /* silently ignore — нельзя логировать в beforeunload */ }
    }
  });

  window._RL = RL;

  console.log(`[DLC:${ID}] v0.5 активирован — компоненты: ` +
    `руны=${runesLive ? 'on' : 'off'} · арки=${arcsLive ? 'on' : 'off'} · карта=${mapLive ? 'on' : 'off'} · мета=${metaLive ? 'on' : 'off'}`);
})();
