// ══════════════════════════════════════════════════════
//  Ф.7 — Петля рана + UI «Дерево открытий» (режим Rogue-lite)
//
//  Слой над src/unlocks.js (window.Unlocks). Живёт в src/ (а не в dlc/),
//  чтобы single-HTML dist работал без папки dlc/ — паттерн mastery
//  (src/meta.js). АКТИВЕН только при Unlocks.isActive() — проверка живьём
//  в каждом хуке, обычная игра и «Прокачка» не затрагиваются.
//
//  Содержит:
//   • петлю рана (§15.0): end_game → Unlocks.awardAtRunEnd → анонс в лог
//     → кнопка «Дерево открытий» на экране результатов; beforeunload-страховка
//   • модал «Дерево открытий» (по мокапу ui-unlock-tree-mockup.html):
//     3 ветки × тиры, покупка узлов за экспертизу (Unlocks.buy)
//   • кнопку с прогрессом на mode-screen (паттерн meta-mode-btn)
//
//  Дизайн: backlog/design_roguelite_meta.md §11/§15.
// ══════════════════════════════════════════════════════

(function () {
  'use strict';
  if (typeof document === 'undefined') return;          // headless (sim) — слой не нужен
  if (window.__UNLOCKS_UI_LOADED) return;
  window.__UNLOCKS_UI_LOADED = true;

  const BR = { A:{ n:'Студия', s:'команда · ремесло' }, B:{ n:'Рынок', s:'экспансия' }, C:{ n:'Технологии', s:'сложность' } };

  // ── Скоупленные стили (палитра мокапа, префикс .utree) ─────────────
  function _injectCss() {
    if (document.getElementById('unlocks-tree-css')) return;
    const st = document.createElement('style');
    st.id = 'unlocks-tree-css';
    st.textContent = `
#unlock-tree-modal .modal{max-width:1040px;width:94vw;max-height:88vh;display:flex;flex-direction:column;overflow:hidden;
  background:radial-gradient(900px 420px at 50% -10%,#141827,#0a0c12);border:1px solid rgba(255,255,255,.09)}
.utree{--line:rgba(255,255,255,.08);--t:#e2e7f3;--tm:#8593ad;--td:#454f6b;--acc:#e1456a;--exp:#f5c451;
  --A:#17b8a6;--B:#4f7bf0;--C:#9a6cf0;color:var(--t);overflow-y:auto;padding:4px 18px 20px;flex:1}
.utree .uhead{display:flex;align-items:center;gap:16px;margin:6px 0 4px}
.utree .uhead h2{font-size:16px;font-weight:800;margin:0}
.utree .uhead h2 b{color:var(--acc)}
.utree .exp-pill{margin-left:auto;display:flex;align-items:center;gap:8px;background:rgba(245,196,81,.10);
  border:1px solid rgba(245,196,81,.32);padding:6px 13px;border-radius:11px}
.utree .exp-pill .v{font-size:19px;font-weight:900;color:var(--exp)}
.utree .exp-pill .l{font-size:10px;color:var(--tm);text-transform:uppercase;letter-spacing:.06em;font-weight:800}
.utree .prog{display:flex;align-items:center;gap:12px;margin:6px 0 16px}
.utree .prog .bar{flex:1;height:7px;background:rgba(255,255,255,.07);border-radius:4px;overflow:hidden}
.utree .prog .bar>i{display:block;height:100%;background:linear-gradient(90deg,var(--A),var(--B),var(--C));border-radius:4px;transition:width .3s}
.utree .prog .lbl{font-size:11px;color:var(--tm);font-weight:700;white-space:nowrap}
.utree .root{display:flex;justify-content:center}
.utree .rootnode{background:#171b28;border:1px solid var(--line);border-radius:12px;padding:8px 16px;text-align:center;font-size:11.5px;color:var(--tm)}
.utree .rootnode b{color:var(--t);font-weight:800;display:block;font-size:12.5px}
.utree .stem{width:2px;height:14px;background:var(--line);margin:0 auto}
.utree .branches{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
.utree .branch{background:linear-gradient(180deg,rgba(255,255,255,.015),transparent);border:1px solid var(--line);border-radius:14px;padding:12px 11px 14px}
.utree .branch h3{font-size:11.5px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;display:flex;align-items:center;gap:8px;
  margin:0 0 12px;padding-bottom:9px;border-bottom:1px solid var(--line)}
.utree .branch.A h3{color:var(--A)} .utree .branch.B h3{color:var(--B)} .utree .branch.C h3{color:var(--C)}
.utree .branch h3 .bd{margin-left:auto;font-size:10px;color:var(--td);font-weight:700}
.utree .node{position:relative;background:#12151f;border:1px solid var(--line);border-radius:12px;padding:10px 11px;margin-bottom:11px}
.utree .node:last-child{margin-bottom:0}
.utree .node .tier{position:absolute;top:8px;right:10px;font-size:9px;color:var(--td);font-weight:800}
.utree .node .nh{display:flex;align-items:center;gap:9px;margin-bottom:5px}
.utree .node .ico{width:30px;height:30px;border-radius:8px;background:rgba(255,255,255,.05);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}
.utree .node .nm{font-size:12.5px;font-weight:800;line-height:1.15}
.utree .node .un{font-size:10.5px;color:var(--tm);line-height:1.35;margin-bottom:8px}
.utree .node .foot{display:flex;align-items:center;gap:8px}
.utree .node .cost{font-size:12px;font-weight:800;color:var(--exp);display:flex;align-items:center;gap:4px}
.utree .node .buy{margin-left:auto;font-size:11px;font-weight:800;padding:5px 12px;border-radius:8px;cursor:pointer;
  border:1px solid transparent;background:var(--acc);color:#fff}
.utree .node .buy:hover{filter:brightness(1.08)}
.utree .node .buy.dis{background:rgba(255,255,255,.05);color:var(--td);cursor:not-allowed;border-color:var(--line)}
.utree .node .st{margin-left:auto;font-size:11px;font-weight:800}
.utree .node.open{border-color:rgba(47,189,110,.4);background:linear-gradient(180deg,rgba(47,189,110,.08),rgba(47,189,110,.02))}
.utree .node.open .st{color:#2fbd6e}
.utree .node.avail{border-color:var(--nc,rgba(255,255,255,.28));box-shadow:0 0 0 1px var(--nc,transparent)}
.utree .node.locked{opacity:.52}
.utree .node .lockmsg{margin-left:auto;font-size:10px;color:#e8a23a;font-weight:700}
.utree .branch.A .node.avail{--nc:rgba(23,184,166,.5)}
.utree .branch.B .node.avail{--nc:rgba(79,123,240,.5)}
.utree .branch.C .node.avail{--nc:rgba(154,108,240,.5)}
.utree .uflash{animation:uifl .5s ease}
@keyframes uifl{0%{box-shadow:0 0 0 0 rgba(47,189,110,.5)}100%{box-shadow:0 0 0 12px rgba(47,189,110,0)}}
.utree .foot-note{margin-top:14px;font-size:10.5px;color:var(--td);line-height:1.5;display:flex;gap:14px;align-items:center;flex-wrap:wrap}
.utree .foot-note b{color:var(--tm)}
.utree .legend{display:flex;gap:12px}
.utree .legend span{display:flex;align-items:center;gap:5px}
.utree .legend i{width:9px;height:9px;border-radius:3px;display:inline-block}`;
    document.head.appendChild(st);
  }

  // ── Рендер тела дерева ──────────────────────────────────────────────
  function _renderBody() {
    const U = window.Unlocks; if (!U) return '';
    const nodes = U.list();
    const exp   = U.getExp();
    const op    = nodes.filter(n => n.open).length;

    let cols = '';
    ['A', 'B', 'C'].forEach(br => {
      const bn = nodes.filter(n => n.branch === br);
      const opened = bn.filter(n => n.open).length;
      let items = '';
      bn.sort((a, b) => a.tier - b.tier).forEach(n => {
        const can = n.avail && exp >= n.cost;
        const cls = n.open ? 'open' : (n.avail ? 'avail' : 'locked');
        let foot;
        if (n.open)       foot = `<span class="st">✓ Открыт</span>`;
        else if (n.avail) foot = `<span class="cost">✦ ${n.cost}</span><button class="buy ${can ? '' : 'dis'}" data-buy="${n.id}" ${can ? '' : 'disabled'}>${can ? 'Открыть' : 'мало эксп.'}</button>`;
        else              foot = `<span class="cost">✦ ${n.cost}</span><span class="lockmsg">🔒 нужен узел тира ${n.tier - 1}</span>`;
        items += `<div class="node ${cls}" id="unode-${n.id}"><span class="tier">T${n.tier}</span>
          <div class="nh"><div class="ico">${n.ico || '▫️'}</div><div class="nm">${n.name}</div></div>
          <div class="un">${n.un || ''}</div><div class="foot">${foot}</div></div>`;
      });
      cols += `<div class="branch ${br}"><h3>${br} · ${BR[br].n}<span class="bd">${BR[br].s} · ${opened}/${bn.length}</span></h3>${items}</div>`;
    });

    return `
      <div class="uhead"><h2>🌐 <b>Дерево открытий</b> · Rogue-lite · ран #${U.getRuns() + 1}</h2>
        <div class="exp-pill"><span class="v">${exp}</span><span class="l">экспертиза</span></div></div>
      <div class="prog"><span class="lbl">Собранность игры</span>
        <div class="bar"><i style="width:${Math.round(op / nodes.length * 100)}%"></i></div>
        <span class="lbl">${op} / ${nodes.length} модулей</span></div>
      <div class="root"><div class="rootnode"><b>🧰 Ручной проект</b>тир 0 · открыт всегда · один заказ руками</div></div>
      <div class="stem"></div>
      <div class="branches">${cols}</div>
      <div class="foot-note">
        <div class="legend">
          <span><i style="background:#2fbd6e"></i>открыт</span>
          <span><i style="background:#17b8a6"></i>доступен</span>
          <span><i style="background:#454f6b"></i>заперт</span>
        </div>
        <b>Мягкие пререквизиты:</b> узел тира N доступен, когда открыт любой узел тира N−1 (любая ветка) — путь выбираешь сам.
      </div>`;
  }

  function _refresh(flashId) {
    const body = document.getElementById('unlock-tree-body');
    if (!body) return;
    body.innerHTML = _renderBody();
    _wireBuys(body);
    if (flashId) {
      const el = document.getElementById('unode-' + flashId);
      if (el) { el.classList.add('uflash'); setTimeout(() => el.classList.remove('uflash'), 500); }
    }
    _refreshModeButton();   // кнопка на mode-screen тоже показывает ✦/прогресс
  }

  function _wireBuys(root) {
    root.querySelectorAll('[data-buy]').forEach(btn => {
      btn.onclick = () => {
        const id = btn.getAttribute('data-buy');
        const U  = window.Unlocks; if (!U) return;
        const r  = U.buy(id);
        if (r.ok) {
          const m = U.MODULE_UNLOCKS.find(x => x.id === id);
          if (typeof notify === 'function') notify(`🌐 Открыт модуль «${m ? m.name : id}»!`, 'success');
          _refresh(id);
        } else if (r.reason === 'exp' && typeof notify === 'function') {
          notify('Недостаточно экспертизы — доиграй ран, «первые разы» дают всплеск ✦', 'error');
        }
      };
    });
  }

  // ── Модал ───────────────────────────────────────────────────────────
  function showTree() {
    _injectCss();
    let modal = document.getElementById('unlock-tree-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'unlock-tree-modal';
      modal.className = 'modal-overlay';
      modal.innerHTML = `
        <div class="modal">
          <div class="modal-header" style="flex-shrink:0">
            <h2 style="margin:0;font-size:15px">🌐 Дерево открытий</h2>
            <button class="btn btn-ghost" style="padding:4px 10px"
              onclick="document.getElementById('unlock-tree-modal').classList.remove('active')">✕</button>
          </div>
          <div class="utree" id="unlock-tree-body"></div>
        </div>`;
      modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('active'); });
      document.body.appendChild(modal);
    }
    _refresh();
    modal.classList.add('active');
  }

  // ── Кнопка на mode-screen (паттерн meta-mode-btn) ───────────────────
  function _refreshModeButton() {
    const U = window.Unlocks;
    if (!U) return;
    const existing = document.getElementById('unlocks-mode-btn');
    if (!U.isActive()) { if (existing) existing.remove(); return; }   // режим выключили — кнопку убираем
    const dlcCards = document.getElementById('dlc-cards');
    if (!dlcCards || !dlcCards.parentElement) return;
    let btn = existing;
    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'unlocks-mode-btn';
      btn.onclick = showTree;
      btn.style.cssText = 'margin-top:10px;background:rgba(225,69,106,.08);border:1px solid rgba(225,69,106,.35);color:#f5a3b6;' +
        'border-radius:8px;padding:11px 14px;font-size:12px;font-weight:700;cursor:pointer;width:100%;text-align:left;display:flex;flex-direction:column;gap:7px';
      dlcCards.parentElement.insertBefore(btn, dlcCards.nextSibling);
    }
    const total = U.MODULE_UNLOCKS.length;
    const op    = U.getOpened().length;
    const pct   = Math.round(op / total * 100);
    btn.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
        <span>🌐 Дерево открытий Rogue-lite</span>
        <span style="font-size:13px;font-weight:800;color:#f5c451">${U.getExp()} ✦ · ${op}/${total}</span>
      </div>
      <div style="height:4px;border-radius:3px;background:rgba(255,255,255,.08);overflow:hidden">
        <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,#17b8a6,#4f7bf0,#9a6cf0);border-radius:3px;transition:width .2s"></div>
      </div>`;
  }

  // ── Кнопка на экране результатов (конец рана, §15.0 шаг 4) ─────────
  function injectResultsButton(awardText) {
    const U = window.Unlocks;
    if (!U || !U.isActive()) return;
    const screen = document.getElementById('screen-results');
    if (!screen) return;
    const row = screen.querySelector('div[style*="text-align:center"]');
    if (!row) return;
    let btn = document.getElementById('unlocks-results-btn');
    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'unlocks-results-btn';
      btn.className = 'btn';
      btn.style.cssText = 'background:rgba(225,69,106,.14);border:1px solid rgba(225,69,106,.45);color:#f5a3b6;font-weight:800';
      btn.onclick = showTree;
      row.insertBefore(btn, row.firstChild);
    }
    btn.textContent = '🌐 Дерево открытий' + (awardText ? ' · ' + awardText : ` · ${U.getExp()} ✦`);
  }

  // ── §15.0 п.1 / §11.5: СКРЫТИЕ запертых систем (легаси-UI) ──────────
  // «Игра сама объявляет, что доступно» — вместо кликабельных кнопок с
  // ошибкой запертые системы полностью исчезают из UI до открытия узла.
  // Механизм: body-классы rl-lock-<id> + CSS (работает и для элементов,
  // создаваемых динамически: пилюля рейтинга, виджет рынка, кнопка активов).
  // Вне режима Rogue-lite классы сняты — обычная игра не меняется.
  // v2-слой (index-v2) сознательно НЕ трогаем (решение Романа 2026-07-02).
  const HIDE_IDS = ['hire', 'tree', 'port', 'ai', 'market', 'sub'];
  // scout НЕ скрываем: тир-0 живёт «одним разовым заказом руками» (§11.2) —
  // кнопка остаётся, движок в запертом состоянии даёт 1 oneTime-оффер
  // (лейбл меняем ниже). life/nego — фазы внутри проектного флоу (UI-входа
  // нет), season — бейдж сам гаснет (нейтральный сезон), director — фоновая
  // система без кнопки, shares/mna — входы внутри рынка (свои гейты).

  function _injectHideCss() {
    if (document.getElementById('unlocks-hide-css')) return;
    const st = document.createElement('style');
    st.id = 'unlocks-hide-css';
    st.textContent = `
/* Ф.7: запертые системы скрыты целиком (классы ставит applyModuleVisibility) */
body.rl-lock-hire   #acc-hire,
body.rl-lock-hire   button[onclick="toggleAcc('hire')"],
body.rl-lock-tree   .panel:has(button[onclick="openPerkModal()"]),
body.rl-lock-port   #tab-btn-portfolio,
body.rl-lock-port   #tab-panel-portfolio,
body.rl-lock-ai     #tab-btn-ai,
body.rl-lock-ai     #tab-panel-ai,
body.rl-lock-market #tab-btn-market,
body.rl-lock-market #tab-panel-market,
body.rl-lock-market #g-market-widget,
body.rl-lock-market #cmp-rank-pill,
body.rl-lock-sub    #btn-assets { display:none !important; }`;
    document.head.appendChild(st);
  }

  function applyModuleVisibility() {
    const b = document.body;
    if (!b) return;
    _injectHideCss();
    const U = window.Unlocks;
    const locked = id => !!(U && U.isActive() && typeof isModuleUnlocked === 'function' && !isModuleUnlocked(id));
    HIDE_IDS.forEach(id => b.classList.toggle('rl-lock-' + id, locked(id)));
    // Скаутинг на тир-0 не скрыт, а ПЕРЕОДЕТ: «один разовый заказ руками» (§11.2).
    // Основную наклейку рендерит сам ui.js (единый источник правды). Здесь —
    // страховка: ui.js перерисовывает кнопку на каждый render и мог затереть
    // наклейку до нашего setTimeout(0); проверяем по СОДЕРЖИМОМУ (не по dataset —
    // прежний guard клоббился, т.к. ui.js менял innerHTML, а dataset оставался).
    const sb = document.getElementById('btn-scout');
    if (sb) {
      const wantT0 = locked('scout');
      const hasT0  = sb.innerHTML.indexOf('Найти разовый заказ') !== -1;
      const hasPool = sb.innerHTML.indexOf('Открыть пул') !== -1;
      if (wantT0 && !hasT0 && !hasPool) {
        sb.innerHTML = `📦 Найти разовый заказ <span style="color:rgba(255,255,255,.5);font-size:11px" id="scout-cost-label">тир-0 · один за раз</span>`;
      }
    }
    // Запертая вкладка не должна оставаться активной (редкий кейс: открыли ран
    // на вкладке, которой в этом ране нет) — уводим на «Проекты»
    [['port', 'tab-btn-portfolio'], ['ai', 'tab-btn-ai'], ['market', 'tab-btn-market']].forEach(([m, tid]) => {
      const t = document.getElementById(tid);
      if (t && b.classList.contains('rl-lock-' + m) && t.classList.contains('active')) {
        try { if (typeof switchTab === 'function') switchTab('main'); } catch (e) {}
      }
    });
  }

  // ── ПЕТЛЯ РАНА (§15.0) — хуки активны только при isActive() ────────
  let _awardedThisRun = false;

  function _announce(s, scriptedIntro) {
    if (!s) return;
    if (typeof addLog === 'function') {
      if (scriptedIntro) addLog('🌱 Вступительный ран — так и должно быть. Без команды студию не удержать; это начало пути. Открой первый модуль в «Дереве открытий» — следующий заход будет глубже.', 'amber');
      addLog(`🌐 Экспертиза за ран: +${s.award} ✦ (исход ${s.base}${s.stageBonus ? ' + стадия ' + s.stageBonus : ''}${s.firstsExp ? ' + первые разы ' + s.firstsExp : ''}). Всего ${s.exp} ✦.`, 'purple');
      (s.firsts || []).forEach(f => addLog(`${f.ico} Впервые: «${f.name}» · +${f.exp} ✦`, 'green'));
    }
    if (typeof notify === 'function') {
      const extra = (s.firsts && s.firsts.length) ? ` · ${s.firsts.length} «первых раз»` : '';
      notify(scriptedIntro
        ? `🌱 Вступительный ран пройден · +${s.award} ✦ — открой Дерево открытий`
        : `🌐 +${s.award} ✦ экспертизы${extra} — открой Дерево открытий`, 'success');
    }
  }

  if (typeof EventBus !== 'undefined' && EventBus.on) {
    // Конец рана: победа / банкротство / ручной выход (через end_game)
    EventBus.on('end_game', (ev) => {
      const won = ev && ev.won;
      const scriptedIntro = !!((ev && ev.scriptedIntro) || (typeof G !== 'undefined' && G && G._scriptedIntro));
      const U = window.Unlocks;
      if (!U || !U.isActive() || _awardedThisRun) return;
      _awardedThisRun = true;
      let summary = null;
      try {
        summary = U.awardAtRunEnd(!!won, (typeof G !== 'undefined') ? G : null);
        _announce(summary, scriptedIntro);
      } catch (e) { console.warn('[unlocks-ui] award error:', e); }
      try { injectResultsButton(summary ? `+${summary.award} ✦` : null); } catch (e) {}
      // Мета персонажей (§3): наигрыш/победы/тон → открытие ярусов прототипов
      try {
        if (window.Founder && Founder.metaRecord && typeof G !== 'undefined' && G) Founder.metaRecord(G, !!won);
      } catch (e) {}
    });

    // Страховка: ран идёт, а основателя нет (обошли драфт) — поднимаем «Марка»
    EventBus.on('month_advanced', () => {
      try {
        const U = window.Unlocks;
        if (U && U.isActive() && typeof G !== 'undefined' && G && !G.founder && window.Founder) {
          if (window.FounderDraftUI) FounderDraftUI.close();
          window.Founder.initState(G, window.Founder.preset('mark'));
        }
      } catch (e) {}
    });

    // Новый ран начался — флаг начисления снимается
    EventBus.on('navigate', ({ screen }) => {
      if (screen === 'screen-game' && typeof G !== 'undefined' && G && (G.month || 0) <= 1) {
        _awardedThisRun = false;
        // Слой основателя: на старте рана в режиме — экран «Сборка основателя»
        // (драфт §7-quater). Страховка на случай пропуска — в month_advanced.
        try {
          const U = window.Unlocks;
          if (U && U.isActive() && window.Founder && !G.founder) {
            if (window.FounderDraftUI && FounderDraftUI.open()) { /* драфт открыт */ }
            else window.Founder.initState(G, window.Founder.preset('mark'));   // headless/фолбэк
          }
        } catch (e) {}
      }
    });

    // Кнопка mode-screen — держим актуальной (покупка/начисление/сброс/тумблер DLC)
    EventBus.on('unlocks_changed', () => { try { _refreshModeButton(); } catch (e) {} });
    EventBus.on('unlocks_award',   () => { try { _refreshModeButton(); } catch (e) {} });

    // Скрытие запертых систем: после КАЖДОГО рендера (setTimeout 0 — чтобы
    // отработать ПОСЛЕ остальных render-слушателей, создающих кнопки/пилюли)
    EventBus.on('render',          () => { setTimeout(() => { try { applyModuleVisibility(); } catch (e) {} }, 0); });
    EventBus.on('navigate',        () => { setTimeout(() => { try { applyModuleVisibility(); } catch (e) {} }, 0); });
    EventBus.on('unlocks_changed', () => { try { applyModuleVisibility(); } catch (e) {} });

    // Тумблер режима на mode-screen переключили БЕЗ перезагрузки (сигнал
    // dlc/loader.js): при выключении убираем ВСЁ инжектированное сразу —
    // кнопку дерева, rl-lock-скрытия, кнопку на results, открытые модалы
    EventBus.on('dlc_toggled', (p) => {
      if (p && p.id && p.id !== 'unlocks') return;   // чужие режимы не трогаем
      try {
        _refreshModeButton();
        applyModuleVisibility();
        const U = window.Unlocks;
        if (!U || !U.isActive()) {
          const tree = document.getElementById('unlock-tree-modal');
          if (tree) tree.classList.remove('active');
          const build = document.getElementById('team-build-modal');
          if (build) build.classList.remove('active');
          const rbtn = document.getElementById('unlocks-results-btn');
          if (rbtn && rbtn.parentElement) rbtn.parentElement.removeChild(rbtn);
        }
      } catch (e) {}
    });
  }

  // Страховка: закрытие/обновление страницы среди рана = «ручной выход» (база 30 ✦).
  // Свой флаг, НЕ только G._endGameFired — им управляет mastery-мета (активны могут быть оба DLC).
  window.addEventListener('beforeunload', function () {
    if (typeof G === 'undefined' || !G || (G.month || 0) < 1) return;
    if (_awardedThisRun || G._endGameFired) return;
    const U = window.Unlocks;
    if (U && U.isActive()) {
      try { _awardedThisRun = true; U.awardAtRunEnd(false, G); } catch (e) {}
    }
  });

  window.UnlocksUI = { showTree, injectResultsButton, refreshModeButton: _refreshModeButton, applyModuleVisibility };

  // Инжект кнопки на mode-screen + первичное скрытие при старте
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { try { _refreshModeButton(); applyModuleVisibility(); } catch (e) {} });
  } else {
    try { _refreshModeButton(); applyModuleVisibility(); } catch (e) {}
  }

  try { console.log('[unlocks-ui] Ф.7 петля рана + дерево открытий загружены (активен: ' + (window.Unlocks ? window.Unlocks.isActive() : '—') + ')'); } catch (e) {}
})();
