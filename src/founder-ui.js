// ══════════════════════════════════════════════════════════════════════
//  ПАНЕЛЬ ОСНОВАТЕЛЯ в UI рана (слой основателя §7-sextus, v3.108)
//
//  Виджет в правой колонке легаси-UI: живой трекер «прокачки персонажа» —
//  параметры (Фокус/Уверенность/Энергия/Жёсткость), характер-трейты
//  (черта/пороки/накопленные последствия событий), тон-счётчик рана
//  (🌱 рост / 🌀 срывы). Клик по шапке → полная карточка в «Билд команды».
//
//  DOM-инжект перед панелью «Команда» (ядро не трогаем, паттерн unlocks-ui).
//  Виден ТОЛЬКО в режиме Rogue-lite при созданном G.founder; обновляется на
//  render / founder_init / founder_param / founder_event_choice / dlc_toggled.
// ══════════════════════════════════════════════════════════════════════
(function () {
  'use strict';
  if (typeof document === 'undefined') return;          // headless — не нужен
  if (window.__FOUNDER_UI_LOADED) return;
  window.__FOUNDER_UI_LOADED = true;

  const PARAM_META = {
    focus:      { ico: '🎯', warnLow: 30 },
    confidence: { ico: '🪞', warnLow: 30 },
    energy:     { ico: '🔋', warnLow: 20 },   // <20 = кризис «Выгорание»
    toughness:  { ico: '🛡', warnLow: 25 },
  };

  function _active() {
    try {
      return !!(window.Unlocks && Unlocks.isActive() && typeof G !== 'undefined' && G && G.founder);
    } catch (e) { return false; }
  }

  function _injectCss() {
    if (document.getElementById('founder-panel-css')) return;
    const st = document.createElement('style');
    st.id = 'founder-panel-css';
    st.textContent = `
#founder-panel .fp-head{display:flex;align-items:center;gap:8px;cursor:pointer}
#founder-panel .fp-av{width:30px;height:30px;border-radius:8px;background:rgba(225,69,106,.12);
  border:1px solid rgba(225,69,106,.35);display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0}
#founder-panel .fp-name{font-size:12.5px;font-weight:700;color:var(--text)}
#founder-panel .fp-cls{font-size:10px;color:var(--sub)}
#founder-panel .fp-tone{margin-left:auto;font-size:9.5px;color:var(--muted);font-weight:700;text-align:right;line-height:1.3}
#founder-panel .fp-bars{display:grid;grid-template-columns:1fr 1fr;gap:5px 10px;margin-top:8px}
#founder-panel .fp-bar .l{display:flex;justify-content:space-between;font-size:9px;color:var(--sub);font-weight:700;margin-bottom:2px}
#founder-panel .fp-bar .l b{color:var(--text)}
#founder-panel .fp-bar .t{height:4px;border-radius:3px;background:rgba(255,255,255,.07);overflow:hidden}
#founder-panel .fp-bar .t i{display:block;height:100%;border-radius:3px;transition:width .25s}
#founder-panel .fp-traits{display:flex;flex-wrap:wrap;gap:4px;margin-top:8px}
#founder-panel .fp-chip{font-size:9.5px;font-weight:700;padding:2px 7px;border-radius:6px;cursor:help;line-height:1.4;
  background:rgba(225,69,106,.10);color:#f5a3b6;border:1px solid rgba(225,69,106,.3)}
#founder-panel .fp-chip.vice{background:rgba(232,120,58,.10);color:#e8a06a;border-color:rgba(232,120,58,.32)}
#founder-panel .fp-chip.growth{background:rgba(47,189,110,.10);color:#6fd39a;border-color:rgba(47,189,110,.32)}`;
    document.head.appendChild(st);
  }

  function _barColor(key, v) {
    const warn = PARAM_META[key].warnLow;
    if (v < warn) return '#e8524f';
    if (v < warn + 20) return '#e8a23a';
    return '#2fbd6e';
  }

  function _chipClass(t) {
    if (t.family === 'vice') return 'vice';
    if (t.id.indexOf('fe_') === 0 && t.family === 'founder') return 'growth';   // выращенные
    return '';
  }

  function render() {
    let panel = document.getElementById('founder-panel');
    if (!_active()) { if (panel) panel.remove(); return; }
    _injectCss();
    // точка инжекта: перед панелью «Команда» (правая колонка)
    if (!panel) {
      const teamList = document.getElementById('g-team-list');
      const host = teamList && teamList.closest ? teamList.closest('.panel') : null;
      if (!host || !host.parentElement) return;
      panel = document.createElement('div');
      panel.id = 'founder-panel';
      panel.className = 'panel';
      host.parentElement.insertBefore(panel, host);
    }
    const f = G.founder;
    const TE = window.TraitEngine;
    const P = (window.Founder && Founder.PARAM_NAMES) || {};
    const tone = f.tone || {};

    const bars = Object.keys(PARAM_META).map(k => {
      const v = Math.round((f.params && f.params[k] != null) ? f.params[k] : 50);
      return `<div class="fp-bar">
        <div class="l"><span>${PARAM_META[k].ico} ${P[k] || k}</span><b>${v}</b></div>
        <div class="t"><i style="width:${v}%;background:${_barColor(k, v)}"></i></div></div>`;
    }).join('');

    const chips = (f.rlTraits || []).map(id => {
      const t = TE && TE.get(id);
      if (!t) return '';
      return `<span class="fp-chip ${_chipClass(t)}" data-tip="${(t.name + ' — ' + (t.desc || '')).replace(/"/g, '&quot;')}">${t.icon || '✦'} ${t.name}</span>`;
    }).join('');

    panel.innerHTML = `
      <div class="fp-head" onclick="if(window.TraitsUI)TraitsUI.showTeamBuild()" title="Открыть «Билд команды» — полная карточка">
        <div class="fp-av">👤</div>
        <div><div class="fp-name">${f.name || 'Основатель'}</div>
          <div class="fp-cls">${f.cls || ''} · основатель</div></div>
        <div class="fp-tone" data-tip="Тон решений в личных событиях: рост / срывы">
          🌱 ${tone.growth || 0}<br>🌀 ${tone.degrade || 0}</div>
      </div>
      <div class="fp-bars">${bars}</div>
      ${chips ? `<div class="fp-traits">${chips}</div>` : ''}`;
  }

  // ── подписки ──────────────────────────────────────────────────────────
  if (typeof EventBus !== 'undefined' && EventBus.on) {
    EventBus.on('render',               () => { setTimeout(() => { try { render(); } catch (e) {} }, 0); });
    EventBus.on('founder_init',         () => { try { render(); } catch (e) {} });
    EventBus.on('founder_param',        () => { try { render(); } catch (e) {} });
    EventBus.on('founder_event_choice', () => { try { render(); } catch (e) {} });
    EventBus.on('dlc_toggled',          () => { try { render(); } catch (e) {} });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { try { render(); } catch (e) {} });
  } else {
    try { render(); } catch (e) {}
  }

  window.FounderUI = { render };
  try { console.log('[founder-ui] панель основателя загружена'); } catch (e) {}
})();
