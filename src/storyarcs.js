// ══════════════════════════════════════════════════════
//  Сюжетные арки (Story Arcs) — реализация mastery-механики
//
//  Активируются ТОЛЬКО когда включён DLC «Rogue-lite»
//  (тумблер на mode-screen, persistence в localStorage
//  под ключом 'bt_enabled_dlcs_v1'). Без DLC модуль молча
//  не регистрируется — игра ведёт себя как будто файла нет.
//
//  Hard kill-switch — флаг `STORY_ARCS_ENABLED` ниже (false
//  отключает даже при включённом DLC; для дебага/A-B-тестов).
//
//  Файл физически лежит в src/, чтобы при single-HTML
//  build всё было встроено в один файл; гейт по DLC сделан
//  через прямое чтение localStorage (не зависит от объекта
//  DLC, который объявляется в dlc/loader.js позже по порядку).
//
//  Принцип: контент живёт в данных сценария (SCENARIO.storyArcs),
//  движок не модифицируется — модуль цепляется обёрткой
//  advanceMonth и пушит арку через существующий 'show_event'
//  EventBus (тот же модал, что и обычные события). При выборе
//  стадии — продвижение по графу stages, эффекты применяются
//  через ScenarioLoader.applyOps (тот же DSL, что и SCENARIO.events).
//
//  Godot-портируемость: данные арок — чистый JSON (читаются
//  идентично в Godot), диспетчер переносится 1-в-1 на GDScript.
//
//  Структура арки в сценарии (storyArcs: []):
//    {
//      id: 'first_contract',
//      name: 'Первый крупный контракт',
//      trigger: {                       // все поля опциональны
//        minMonth: 2, maxMonth: 18,     // окно появления (мес.)
//        minRep: 30, minPortfolio: 0,   // гейты состояния
//        requires: 'prevArcId',         // должна быть завершена другая арка
//        chance: 0.5,                   // вероятность ролла в месяц
//      },
//      stageDelayMonths: 2,             // через сколько мес. следующая стадия
//      cooldown: 4,                     // мес. до следующей арки после завершения
//      stages: [
//        {
//          id: 'intro', icon: '📞',
//          title: '...', body: '...',
//          choices: [
//            { text:'...', desc:'...', effects:[DSL], next:'meeting' },
//            { text:'...', desc:'...', effects:[DSL], end:true },
//          ],
//        },
//        ...
//      ],
//    }
//
//  Бэклог: п.13 (Story Arcs) — вторая итерация п.13 после
//  стартовых рун (v3.10).
// ══════════════════════════════════════════════════════

(function () {
  'use strict';

  // ─── Hard kill-switch ─────────────────────────────────
  // Выключить арки целиком даже при включённом DLC — false.
  const STORY_ARCS_ENABLED = true;
  if (!STORY_ARCS_ENABLED) return;

  // ─── Гейт по DLC «Rogue-lite» ─────────────────────────
  // Без DLC механика не запускается. Чтение localStorage напрямую
  // (DLC.isEnabled здесь недоступна — loader.js парсится позже).
  if (!_masteryEnabled()) return;

  if (typeof EventBus === 'undefined') {
    console.error('[storyarcs] EventBus не найден — модуль не активирован');
    return;
  }
  if (window.__SA_LOADED) return;
  window.__SA_LOADED = true;

  function _masteryEnabled() {
    try {
      const raw = (typeof localStorage !== 'undefined' && localStorage.getItem('bt_enabled_dlcs_v1')) || '[]';
      const arr = JSON.parse(raw);
      return Array.isArray(arr) && arr.includes('mastery');
    } catch (e) { return false; }
  }

  const DEFAULTS = {
    stageDelayMonths: 1,
    cooldown:         4,
    chance:           0.4,
  };

  // ── Гидрация арок: choice.effects (данные) → choice.fn (код) ──
  // Запускается лениво, когда SCENARIO уже доступен и G готов
  // (вызывается из обёртки advanceMonth — первый месяц-проверка).
  let _hydrated = false;
  function _hydrateArcs() {
    if (_hydrated) return;
    if (typeof SCENARIO === 'undefined' || !SCENARIO) return;
    if (typeof ScenarioLoader === 'undefined' || !ScenarioLoader.applyOps) return;
    const arcs = SCENARIO.storyArcs;
    if (!Array.isArray(arcs)) { _hydrated = true; return; }

    arcs.forEach(arc => {
      (arc.stages || []).forEach(stage => {
        (stage.choices || []).forEach(ch => {
          if (typeof ch.fn === 'function') return;     // повторная гидрация
          const effects = ch.effects || [];
          const _next   = ch.next || null;
          const _end    = !!ch.end;
          ch.fn = (g) => {
            try { ScenarioLoader.applyOps(effects, g); }
            catch (e) { console.warn('[storyarcs] applyOps fail', e); }
            // Продвижение по графу
            if (_end || !_next) _completeArc(arc, g);
            else                _advanceArc(arc, _next, g);
          };
        });
      });
    });
    _hydrated = true;
  }

  // ── Обёртка advanceMonth: после хода — тик арок ──────
  if (typeof window.advanceMonth === 'function' && !window.advanceMonth.__saWrapped) {
    const _origAdvance = window.advanceMonth;
    window.advanceMonth = function () {
      const r = _origAdvance.apply(this, arguments);
      if (typeof DLC !== 'undefined' && !DLC.isEnabled('mastery')) return r;
      try { _tickArcs(); } catch (e) { console.warn('[storyarcs] tick error:', e); }
      return r;
    };
    window.advanceMonth.__saWrapped = true;
  }

  // ── Стейт ────────────────────────────────────────────
  function _ensureState(g) {
    g.arcState = g.arcState || { completed: [], inProgress: null, cooldown: 0 };
    return g.arcState;
  }

  // ── Тик арок: либо двигаем активную, либо ролим новую ─
  function _tickArcs() {
    if (typeof G === 'undefined' || !G) return;
    _hydrateArcs();
    if (typeof SCENARIO === 'undefined' || !Array.isArray(SCENARIO.storyArcs)) return;

    const st = _ensureState(G);

    // (а) Активная арка — пора ли стадию?
    if (st.inProgress) {
      if ((G.month || 0) >= (st.inProgress.nextMonth || 0)) {
        const arc   = SCENARIO.storyArcs.find(a => a.id === st.inProgress.arcId);
        const stage = arc && (arc.stages || []).find(s => s.id === st.inProgress.stageId);
        if (!arc || !stage) {
          // Невалидный стейт (сейв со старой версией) — сбрасываем
          st.inProgress = null;
          return;
        }
        _fireArcEvent(arc, stage);
      }
      return;
    }

    // (б) Кулдаун между арками
    if ((st.cooldown || 0) > 0) {
      st.cooldown = Math.max(0, st.cooldown - 1);
      return;
    }

    // (в) Поиск подходящей арки
    const candidates = SCENARIO.storyArcs.filter(a => _matchTrigger(a, st));
    if (!candidates.length) return;
    const arc    = candidates[Math.floor(Math.random() * candidates.length)];
    const chance = (arc.trigger && arc.trigger.chance != null) ? arc.trigger.chance : DEFAULTS.chance;
    if (Math.random() > chance) return;

    // Старт: первая стадия — прямо сейчас
    const first = (arc.stages || [])[0];
    if (!first) return;
    st.inProgress = { arcId: arc.id, stageId: first.id, nextMonth: G.month || 0 };
    _fireArcEvent(arc, first);
  }

  function _matchTrigger(arc, st) {
    if (!arc || !arc.id) return false;
    if ((st.completed || []).includes(arc.id)) return false;
    const t = arc.trigger || {};
    const m = G.month || 0;
    if (t.minMonth != null && m < t.minMonth) return false;
    if (t.maxMonth != null && m > t.maxMonth) return false;
    if (t.minRep   != null && (G.reputation || 0) < t.minRep) return false;
    if (t.minPortfolio != null && (G.portfolio || 0) < t.minPortfolio) return false;
    if (t.requires && !(st.completed || []).includes(t.requires)) return false;
    return true;
  }

  function _fireArcEvent(arc, stage) {
    // Эмиттим существующий канал 'show_event' — модал #event-modal
    // (тот же, что у обычных событий) сам рендерит choices и вызывает fn.
    // Помечаем _arc, чтобы при желании UI/боты могли отличать.
    EventBus.emit('show_event', { ev: {
      id:    'arc_' + arc.id + '_' + stage.id,
      _arc:  true,
      arcId: arc.id,
      stage: stage.id,
      icon:  stage.icon || '📖',
      title: stage.title || arc.name || 'Сюжетная развилка',
      body:  stage.body  || '',
      choices: stage.choices || [],
    }});
  }

  function _advanceArc(arc, nextStageId, g) {
    const st = _ensureState(g);
    const stage = (arc.stages || []).find(s => s.id === nextStageId);
    if (!stage) { _completeArc(arc, g); return; }
    const delay = arc.stageDelayMonths != null ? arc.stageDelayMonths : DEFAULTS.stageDelayMonths;
    st.inProgress = {
      arcId:     arc.id,
      stageId:   nextStageId,
      nextMonth: (g.month || 0) + Math.max(0, delay),
    };
  }

  function _completeArc(arc, g) {
    const st = _ensureState(g);
    if (!(st.completed || []).includes(arc.id)) {
      st.completed = (st.completed || []).concat(arc.id);
    }
    st.inProgress = null;
    st.cooldown   = arc.cooldown != null ? arc.cooldown : DEFAULTS.cooldown;
    if (typeof addLog === 'function') {
      addLog(`📖 Сюжетная арка «${arc.name || arc.id}» завершена`, 'purple');
    }
  }

  // ── Публичный API ────────────────────────────────────
  window.StoryArcs = {
    _tick:       _tickArcs,
    _hydrate:    _hydrateArcs,
    getState:    () => (typeof G !== 'undefined' && G ? G.arcState || null : null),
    getArcs:     () => (typeof SCENARIO !== 'undefined' && SCENARIO.storyArcs) || [],
    fire:        (arcId) => {
      if (typeof SCENARIO === 'undefined') return;
      const arc = (SCENARIO.storyArcs || []).find(a => a.id === arcId);
      if (!arc || !arc.stages || !arc.stages.length) return;
      _hydrateArcs();
      const st = _ensureState(G);
      st.inProgress = { arcId: arc.id, stageId: arc.stages[0].id, nextMonth: G.month || 0 };
      _fireArcEvent(arc, arc.stages[0]);
    },
  };

  console.log('[storyarcs] v0.1 активирован: диспетчер арок, контент из SCENARIO.storyArcs');
})();
