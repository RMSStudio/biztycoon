// ══════════════════════════════════════════════════════════════════════
//  ЭКРАН «СБОРКА ОСНОВАТЕЛЯ» — драфт-старт персонажа (§7-quater/quinque)
//
//  Обязательный шаг старта рана в режиме Rogue-lite (вместо автоподъёма
//  «Марка»): выбор ПРОТОТИПА из открытых метой (ярусы §3: Струггеры сразу,
//  Крепкие/Состоявшиеся — прогрессом) ИЛИ ручная сборка по пулам
//  (progressive disclosure) ИЛИ случайный. Внутренние индикаторы
//  (капитал/ноу-хау) скрыты — показываем характер и производную сложность.
//
//  Драфт → Founder.initState(G, draft): черта/порок в TraitEngine,
//  параметры, арка персонажа (founder-events по presetId).
//  DOM-инжект, ядро не тронуто. Вне режима не появляется.
// ══════════════════════════════════════════════════════════════════════
(function () {
  'use strict';
  if (typeof document === 'undefined') return;
  if (window.__FOUNDER_DRAFT_UI_LOADED) return;
  window.__FOUNDER_DRAFT_UI_LOADED = true;

  const TIER_ICO = { 'Струггер': '🌱', 'Крепкий': '🌿', 'Состоявшийся': '🌳' };

  function _injectCss() {
    if (document.getElementById('founder-draft-css')) return;
    const st = document.createElement('style');
    st.id = 'founder-draft-css';
    st.textContent = `
#founder-draft-modal{position:fixed;inset:0;background:rgba(5,6,10,.88);z-index:360;display:none;
  align-items:center;justify-content:center;padding:20px}
#founder-draft-modal.active{display:flex}
#founder-draft-modal .fd{width:min(1080px,96vw);max-height:92vh;display:flex;flex-direction:column;overflow:hidden;
  background:radial-gradient(900px 420px at 50% -10%,#141827,#0a0c12);border:1px solid rgba(255,255,255,.1);border-radius:16px}
.fd-head{display:flex;align-items:center;gap:12px;padding:14px 18px;border-bottom:1px solid rgba(255,255,255,.08);flex-shrink:0;flex-wrap:wrap}
.fd-head h2{margin:0;font-size:16px;font-weight:800;color:#e2e7f3}
.fd-head h2 b{color:#e1456a}
.fd-head .sub{font-size:11px;color:#8593ad}
.fd-tabs{margin-left:auto;display:flex;gap:5px}
.fd-tab{font-size:11.5px;font-weight:800;padding:6px 13px;border-radius:8px;cursor:pointer;border:1px solid transparent;color:#8593ad;background:transparent}
.fd-tab.on{color:#e2e7f3;background:#171b28;border-color:rgba(255,255,255,.1)}
.fd-body{flex:1;overflow-y:auto;padding:14px 18px;color:#e2e7f3}
.fd-sec{font-size:10.5px;text-transform:uppercase;letter-spacing:.08em;font-weight:800;color:#8593ad;margin:14px 2px 8px;display:flex;gap:8px;align-items:center}
.fd-sec:first-child{margin-top:0}
.fd-sec .rq{color:#4a5470;font-weight:700;text-transform:none;letter-spacing:0}
.fd-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(235px,1fr));gap:9px}
.fd-card{position:relative;background:linear-gradient(180deg,#171b28,#12151f);border:1px solid rgba(255,255,255,.08);
  border-radius:13px;padding:11px 12px;cursor:pointer;overflow:hidden;transition:transform .1s,border-color .1s}
.fd-card::before{content:'';position:absolute;left:0;top:0;bottom:0;width:4px;background:var(--tc,#17b8a6)}
.fd-card:hover{transform:translateY(-1px);border-color:rgba(255,255,255,.22)}
.fd-card.sel{border-color:#e1456a;box-shadow:0 0 0 1px #e1456a}
.fd-card.lock{opacity:.45;cursor:not-allowed}
.fd-card.lock:hover{transform:none;border-color:rgba(255,255,255,.08)}
.fd-card .nm{font-size:13px;font-weight:800;display:flex;align-items:center;gap:7px}
.fd-card .nm .tier{margin-left:auto;font-size:9px;font-weight:800;color:#8593ad}
.fd-card .cls{font-size:10px;color:#8593ad;margin:2px 0 7px}
.fd-card .row{display:flex;gap:5px;align-items:flex-start;font-size:10.5px;line-height:1.35;margin-bottom:4px}
.fd-card .row .k{color:#4a5470;flex-shrink:0;width:16px;text-align:center}
.fd-card .row .v{color:#c6cede}
.fd-card .row .v i{font-style:normal;color:#8593ad}
.fd-card .chal{margin-top:7px;font-size:9.5px;font-weight:800;display:inline-block;padding:2px 8px;border-radius:6px;
  background:rgba(232,162,58,.12);color:#e8a23a;border:1px solid rgba(232,162,58,.3)}
.fd-card .lockmsg{margin-top:7px;font-size:9.5px;font-weight:700;color:#e8a23a}
.fd-foot{display:flex;gap:10px;align-items:center;padding:12px 18px;border-top:1px solid rgba(255,255,255,.08);flex-shrink:0;flex-wrap:wrap}
.fd-foot .pick{font-size:11.5px;color:#8593ad;flex:1;min-width:200px}
.fd-foot .pick b{color:#e2e7f3}
.fd-btn{font-size:12.5px;font-weight:800;padding:9px 18px;border-radius:10px;cursor:pointer;border:1px solid rgba(255,255,255,.12);background:#171b28;color:#e2e7f3}
.fd-btn.pri{background:#e1456a;border-color:#e1456a;color:#fff}
.fd-btn.pri:disabled{opacity:.4;cursor:not-allowed}
/* ручная сборка */
.fd-man{display:grid;grid-template-columns:1fr 1fr;gap:9px 14px;max-width:760px}
.fd-man .fld label{display:block;font-size:10px;font-weight:800;color:#8593ad;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px}
.fd-man .fld select,.fd-man .fld input[type=range]{width:100%;background:#0b0d13;border:1px solid rgba(255,255,255,.1);
  border-radius:8px;color:#e2e7f3;font-size:12px;padding:7px 9px;outline:none}
.fd-man .fld .expv{font-size:11px;color:#e8a23a;font-weight:800;margin-left:8px}
.fd-prev{grid-column:1/-1;background:#12151f;border:1px solid rgba(255,255,255,.08);border-radius:11px;padding:10px 12px;font-size:11px;line-height:1.5;color:#8593ad}
.fd-prev b{color:#e2e7f3}`;
    document.head.appendChild(st);
  }

  let _tab = 'presets';       // presets | manual
  let _sel = null;            // выбранный пресет-id
  let _manual = null;         // текущий ручной драфт

  function _te(id) { return (window.TraitEngine && TraitEngine.get(id)) || null; }
  function _poolName(pool, key) { const e = Founder.POOLS[pool][key]; return e ? e.n : key; }

  function _presetCard(p) {
    const t = _te('f_' + p.trait), v = _te('fv_' + p.vice);
    const ch = Founder.challengeOf(p);
    const tierColor = p.tier === 'Струггер' ? '#17b8a6' : p.tier === 'Крепкий' ? '#4f7bf0' : '#9a6cf0';
    const drive = _poolName('drives', p.drive), bond = _poolName('bonds', p.bond);
    const origin = _poolName('origins', p.origin);
    return `<div class="fd-card ${p.unlocked ? '' : 'lock'} ${_sel === p.id ? 'sel' : ''}" style="--tc:${tierColor}"
        ${p.unlocked ? `onclick="FounderDraftUI._pick('${p.id}')"` : ''}>
      <div class="nm">👤 ${p.n}<span class="tier">${TIER_ICO[p.tier] || ''} ${p.tier}</span></div>
      <div class="cls">${Founder.classOf(p)} · ${origin} · опыт ${p.exp} лет</div>
      <div class="row"><span class="k">${t ? t.icon : '✦'}</span><span class="v"><b>${t ? t.name : p.trait}</b> — <i>${t ? t.desc : ''}</i></span></div>
      <div class="row"><span class="k">${v ? v.icon : '▪'}</span><span class="v"><b>${v ? v.name : p.vice}</b> — <i>${v ? v.desc : ''}</i></span></div>
      <div class="row"><span class="k">🧭</span><span class="v">Мотивация: <b>${drive}</b> · Связь: <b>${bond}</b></span></div>
      ${p.unlocked ? `<span class="chal">${ch.tier}</span>` : `<div class="lockmsg">🔒 Откроется: ${p.req}</div>`}
    </div>`;
  }

  function _renderPresets() {
    const list = Founder.presetsAvailable();
    let h = '';
    Founder.TIER_ORDER.forEach(tier => {
      const group = list.filter(p => p.tier === tier);
      if (!group.length) return;
      const locked = group.every(p => !p.unlocked);
      h += `<div class="fd-sec">${TIER_ICO[tier]} ${tier} <span class="rq">${locked ? '· ' + Founder.tierRequirement(tier) : ''}</span></div>
        <div class="fd-grid">${group.map(_presetCard).join('')}</div>`;
    });
    return h;
  }

  function _manualDraft() {
    if (!_manual) _manual = Founder.preset('mark');
    return _manual;
  }
  function _renderManual() {
    const d = _manualDraft();
    const sel = (pool, key, cur) => `<select onchange="FounderDraftUI._man('${key}', this.value)">
      ${Object.keys(Founder.POOLS[pool]).map(k =>
        `<option value="${k}" ${k === cur ? 'selected' : ''}>${Founder.POOLS[pool][k].n}</option>`).join('')}</select>`;
    const c = Founder.compute(d);
    const t = _te('f_' + d.trait), v = _te('fv_' + d.vice);
    return `<div class="fd-man">
      <div class="fld"><label>Возраст</label>${sel('ages', 'age', d.age)}</div>
      <div class="fld"><label>Опыт в индустрии <span class="expv">${d.exp} лет</span></label>
        <input type="range" min="0" max="12" value="${d.exp}" oninput="FounderDraftUI._man('exp', +this.value)"></div>
      <div class="fld"><label>Происхождение</label>${sel('origins', 'origin', d.origin)}</div>
      <div class="fld"><label>Стартовая связь</label>${sel('bonds', 'bond', d.bond)}</div>
      <div class="fld"><label>Черта характера</label>${sel('traits', 'trait', d.trait)}</div>
      <div class="fld"><label>Порок</label>${sel('vices', 'vice', d.vice)}</div>
      <div class="fld"><label>Мотивация</label>${sel('drives', 'drive', d.drive)}</div>
      <div class="fld"><label>&nbsp;</label><button class="fd-btn" style="width:100%" onclick="FounderDraftUI._roll()">🎲 Случайный основатель</button></div>
      <div class="fd-prev">
        <b>${Founder.classOf(d)}</b> · сложность: <b>${c.challenge.tier}</b><br>
        ${t ? t.icon + ' <b>' + t.name + '</b> — ' + t.desc + '<br>' : ''}
        ${v ? v.icon + ' <b>' + v.name + '</b> — ' + v.desc : ''}
      </div>
    </div>`;
  }

  function _render() {
    const body = document.getElementById('founder-draft-body');
    if (!body) return;
    document.querySelectorAll('#founder-draft-modal .fd-tab').forEach(el =>
      el.classList.toggle('on', el.dataset.t === _tab));
    body.innerHTML = _tab === 'presets' ? _renderPresets() : _renderManual();
    // футер: что выбрано + доступность старта
    const pickEl = document.getElementById('founder-draft-pick');
    const goBtn = document.getElementById('founder-draft-go');
    let d = null;
    if (_tab === 'presets') d = _sel ? Founder.preset(_sel) : null;
    else d = _manualDraft();
    if (pickEl) {
      if (d) {
        const t = _te('f_' + d.trait);
        pickEl.innerHTML = `Путь начнёт: <b>${d.n || 'Собранный вручную'}</b> · ${Founder.classOf(d)}${t ? ' · ' + t.icon + ' ' + t.name : ''}`;
      } else pickEl.innerHTML = 'Выбери прототип — или собери основателя вручную';
    }
    if (goBtn) goBtn.disabled = !d;
  }

  function _ensureModal() {
    _injectCss();
    let m = document.getElementById('founder-draft-modal');
    if (m) return m;
    m = document.createElement('div');
    m.id = 'founder-draft-modal';
    m.innerHTML = `<div class="fd">
      <div class="fd-head">
        <h2>👤 <b>Сборка основателя</b></h2>
        <span class="sub">кто начинает этот путь — характер задаёт билд на весь ран</span>
        <div class="fd-tabs">
          <div class="fd-tab on" data-t="presets" onclick="FounderDraftUI._tabTo('presets')">Прототипы</div>
          <div class="fd-tab" data-t="manual" onclick="FounderDraftUI._tabTo('manual')">Собрать вручную</div>
        </div>
      </div>
      <div class="fd-body" id="founder-draft-body"></div>
      <div class="fd-foot">
        <span class="pick" id="founder-draft-pick"></span>
        <button class="fd-btn" onclick="FounderDraftUI._roll(true)">🎲 Случайный</button>
        <button class="fd-btn pri" id="founder-draft-go" onclick="FounderDraftUI.confirm()">Начать путь →</button>
      </div>
    </div>`;
    document.body.appendChild(m);
    return m;
  }

  // ── Публичное API ─────────────────────────────────────────────────────
  function open() {
    if (typeof G === 'undefined' || !G || G.founder) return false;
    try { if (!window.Unlocks || !Unlocks.isActive()) return false; } catch (e) { return false; }
    const m = _ensureModal();
    _tab = 'presets'; _sel = null; _manual = null;
    _render();
    m.classList.add('active');
    return true;
  }
  function close() {
    const m = document.getElementById('founder-draft-modal');
    if (m) m.classList.remove('active');
  }
  function confirm() {
    const d = _tab === 'presets' ? (_sel ? Founder.preset(_sel) : null) : _manualDraft();
    if (!d || typeof G === 'undefined' || !G) return;
    const f = Founder.initState(G, d);
    if (!f) return;
    close();
    try {
      if (typeof addLog === 'function') {
        const t = _te(f.rlTraits[0]), v = _te(f.rlTraits[1]);
        addLog('👤 Путь начинает ' + f.name + ' (' + (f.cls || '') + '): ' +
          (t ? t.icon + ' ' + t.name : '') + (v ? ' · ' + v.icon + ' ' + v.name : ''), 'purple');
      }
      if (typeof notify === 'function') notify('👤 ' + f.name + ' — путь начат', 'success');
    } catch (e) {}
    try { if (typeof EventBus !== 'undefined') EventBus.emit('render'); } catch (e) {}
  }

  window.FounderDraftUI = {
    open, close, confirm,
    _tabTo(t) { _tab = t; _render(); },
    _pick(id) { _sel = id; _render(); },
    _man(key, val) { const d = _manualDraft(); d[key] = val; d.id = null; d.n = 'Свой основатель'; _render(); },
    _roll(andConfirmable) {
      _tab = 'manual';
      _manual = Founder.randomDraft();
      _render();
    },
  };
  try { console.log('[founder-draft-ui] экран «Сборка основателя» загружен'); } catch (e) {}
})();
