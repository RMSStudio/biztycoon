// ══════════════════════════════════════════════════════
//  Ф.7 — UI «Билд команды» (§14.9 шаг 4, по мокапу ui-team-build-mockup.html)
//
//  Читает TraitEngine (src/traits.js): ростер-«джокеры» с rl-трейтами,
//  синергии штата (актив/почти/заперт), локальные синергии по проектам,
//  запертые трейт-пулы (узлы «Дерева открытий»). ТОЛЬКО отображение —
//  никакой игровой логики (§14.9: «читает activeSynergies»).
//
//  В src/ (не в dlc/), чтобы dist работал без папки dlc/ — паттерн mastery.
//  Активен только при Unlocks.isActive(); вход — кнопка «🎛 Билд» в модале
//  команды (staff.js) и TraitsUI.showTeamBuild().
// ══════════════════════════════════════════════════════

(function () {
  'use strict';
  if (typeof document === 'undefined') return;          // headless (sim) — UI не нужен
  if (window.__TRAITS_UI_LOADED) return;
  window.__TRAITS_UI_LOADED = true;

  const FAMILY_TAG = {
    scaler:      { l:'скейл',    c:'#2fbd6e' },
    conditional: { l:'услов.',   c:'#e8a23a' },
    trigger:     { l:'триггер',  c:'#e8524f' },
    synergy:     { l:'синерг.',  c:'#9a6cf0' },
    economic:    { l:'эконом.',  c:'#17b8a6' },
    enabler:     { l:'энейблер', c:'#4f7bf0' },
    drawback:    { l:'цена',     c:'#e8524f' },
  };
  const GRADE_SHORT = { junior:'JR', middle:'MD', senior:'SR', lead:'LEAD', star:'★' };

  function _injectCss() {
    if (document.getElementById('team-build-css')) return;
    const st = document.createElement('style');
    st.id = 'team-build-css';
    st.textContent = `
#team-build-modal .modal{max-width:1120px;width:95vw;max-height:88vh;display:flex;flex-direction:column;overflow:hidden;
  background:#0b0d13;border:1px solid rgba(255,255,255,.09)}
.tbuild{--line:rgba(255,255,255,.07);--t:#e2e7f3;--tm:#8593ad;--td:#4a5470;--acc:#e1456a;
  color:var(--t);overflow-y:auto;padding:6px 18px 20px;flex:1}
.tbuild .sub{font-size:11.5px;color:var(--tm);margin:2px 0 14px}
.tbuild .wrap{display:grid;grid-template-columns:1fr 330px;gap:14px}
.tbuild .col-lbl{font-size:10.5px;text-transform:uppercase;letter-spacing:.09em;font-weight:800;color:var(--tm);margin:0 2px 9px;display:flex;gap:8px}
.tbuild .col-lbl .cnt{color:var(--td);font-weight:600}
.tbuild .roster{display:grid;grid-template-columns:repeat(auto-fill,minmax(215px,1fr));gap:10px}
.tbuild .jk{position:relative;background:linear-gradient(180deg,#171b28,#12151f);border:1px solid var(--line);border-radius:13px;padding:12px;overflow:hidden}
.tbuild .jk::before{content:'';position:absolute;left:0;top:0;bottom:0;width:4px;background:var(--rc,#17b8a6)}
.tbuild .jk-top{display:flex;align-items:flex-start;gap:8px;margin-bottom:8px}
.tbuild .jk-av{width:35px;height:35px;border-radius:9px;background:rgba(255,255,255,.05);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0}
.tbuild .jk-name{font-size:12.5px;font-weight:800;line-height:1.15}
.tbuild .jk-role{font-size:9.5px;color:var(--tm);font-weight:700;text-transform:uppercase;letter-spacing:.04em;margin-top:2px}
.tbuild .jk-grade{font-size:9px;font-weight:800;padding:2px 6px;border-radius:5px;margin-left:auto;flex-shrink:0;background:rgba(154,108,240,.16);color:#b895f5}
.tbuild .jk-stats{display:flex;gap:10px;font-size:9.5px;color:var(--tm);margin-bottom:8px;font-weight:700}
.tbuild .jk-stats b{color:var(--t)}
.tbuild .jk-trait{background:rgba(255,255,255,.035);border:1px solid var(--line);border-radius:9px;padding:7px 8px;margin-bottom:6px}
.tbuild .jk-trait:last-child{margin-bottom:0}
.tbuild .jk-trait .tt{font-size:10.5px;font-weight:800;display:flex;align-items:center;gap:5px;margin-bottom:2px}
.tbuild .jk-trait .tt .tag{margin-left:auto;font-size:8px;font-weight:800;padding:1px 5px;border-radius:4px;text-transform:uppercase}
.tbuild .jk-trait .td{font-size:9.5px;color:var(--tm);line-height:1.3}
.tbuild .jk-none{font-size:10px;color:var(--td);font-style:normal;padding:6px 2px}
.tbuild .side{display:flex;flex-direction:column;gap:12px}
.tbuild .card{background:#12151f;border:1px solid var(--line);border-radius:13px;padding:13px}
.tbuild .card h3{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;margin:0 0 10px;display:flex;align-items:center;gap:7px;color:var(--tm)}
.tbuild .card h3 .r{margin-left:auto;font-size:9.5px;color:var(--td);font-weight:700}
.tbuild .syn{border-radius:10px;padding:9px 10px;margin-bottom:8px;border:1px solid var(--line)}
.tbuild .syn:last-child{margin-bottom:0}
.tbuild .syn.on{background:linear-gradient(180deg,rgba(47,189,110,.10),rgba(47,189,110,.03));border-color:rgba(47,189,110,.32)}
.tbuild .syn.near{background:rgba(232,162,58,.06);border-color:rgba(232,162,58,.26)}
.tbuild .syn.off{opacity:.55}
.tbuild .syn-h{display:flex;align-items:center;gap:7px;margin-bottom:3px}
.tbuild .syn-h .nm{font-size:11.5px;font-weight:800}
.tbuild .syn-h .st{margin-left:auto;font-size:8.5px;font-weight:800;padding:2px 7px;border-radius:5px;text-transform:uppercase}
.tbuild .st-on{background:#2fbd6e;color:#062615} .tbuild .st-near{background:rgba(232,162,58,.2);color:#e8a23a} .tbuild .st-off{background:rgba(255,255,255,.06);color:var(--td)}
.tbuild .syn-d{font-size:10px;color:var(--tm);line-height:1.35}
.tbuild .plocal{background:#171b28;border:1px solid var(--line);border-radius:10px;padding:9px 10px;margin-bottom:8px}
.tbuild .plocal:last-child{margin-bottom:0}
.tbuild .plocal .ph{display:flex;justify-content:space-between;font-size:10.5px;font-weight:800;margin-bottom:5px}
.tbuild .plocal .ph .pt{color:var(--tm);font-weight:700;font-size:9.5px}
.tbuild .plocal .fire{font-size:10px;color:#2fbd6e;font-weight:700}
.tbuild .plocal .fire.tension{color:#e1456a}
.tbuild .lockcard{border:1px dashed rgba(255,255,255,.14);border-radius:10px;padding:9px 10px;font-size:10px;color:var(--tm);line-height:1.4}
.tbuild .lockcard b{color:var(--t)}`;
    document.head.appendChild(st);
  }

  function _roleColor(role) {
    try { if (typeof ROLE_META !== 'undefined' && ROLE_META[role]) return ROLE_META[role].color; } catch (e) {}
    return '#17b8a6';
  }
  function _fmtK(v) {
    try { if (typeof fmtK === 'function') return fmtK(v); } catch (e) {}
    return Math.round(v / 1000) + 'К';
  }

  function _traitBlock(t) {
    const tag = FAMILY_TAG[t.family] || { l: t.family || '—', c: '#8593ad' };
    return `<div class="jk-trait"><div class="tt">${t.icon || '✦'} ${t.name}
        <span class="tag" style="background:${tag.c}22;color:${tag.c}">${tag.l}</span></div>
      <div class="td">${t.desc || ''}</div></div>`;
  }

  function _renderBody() {
    const TE = window.TraitEngine, U = window.Unlocks;
    if (!TE) return '<div class="sub">TraitEngine не загружен</div>';
    const g     = (typeof G !== 'undefined') ? G : {};
    const staff = (g.staff || []).filter(s => s.status !== 'fired');
    const fot   = staff.reduce((t, s) => t + (s.cost || 0), 0);
    const mood  = staff.length ? Math.round(staff.reduce((t, s) => t + (s.mood != null ? s.mood : 70), 0) / staff.length) : 0;

    // ростер-«джокеры»
    let roster = staff.map(s => {
      const traits = (s.rlTraits || []).map(id => TE.get(id)).filter(Boolean);
      const q = s.qStat != null ? s.qStat : (s.quality != null ? s.quality : '—');
      return `<div class="jk" style="--rc:${_roleColor(s.role)}">
        <div class="jk-top"><div class="jk-av">${s.icon || '👤'}</div>
          <div style="flex:1;min-width:0"><div class="jk-name">${s.name || s.id}</div>
            <div class="jk-role">${s.roleLabel || s.role || ''}</div></div>
          <span class="jk-grade">${GRADE_SHORT[s.grade] || s.grade || ''}</span></div>
        <div class="jk-stats"><span>Кач <b>${q}</b></span><span>⚡ <b>${s.speedStat != null ? s.speedStat : '—'}</b></span><span>😊 <b>${s.mood != null ? Math.round(s.mood) : '—'}</b></span></div>
        ${traits.length ? traits.map(_traitBlock).join('') : '<div class="jk-none">Без джокера — трейты приходят с новыми кандидатами в скауте</div>'}
      </div>`;
    }).join('');
    if (!staff.length) roster = '<div class="jk-none" style="padding:16px">Штат пуст — джокеры появятся с наймом (узел «Найм» в Дереве открытий)</div>';

    // запертые пулы (сколько трейтов ждёт за узлами)
    const lockedByNode = {};
    TE.catalog().traits.forEach(t => {
      if (!TE.poolOpen(t.pool)) {
        const node = TE.POOL_NODE[t.pool] || t.pool;
        lockedByNode[node] = (lockedByNode[node] || 0) + 1;
      }
    });
    const lockedLines = Object.keys(lockedByNode).map(node => {
      const m = U && U.MODULE_UNLOCKS.find(x => x.id === node);
      return `<b>${m ? m.name : node}</b> — ещё ${lockedByNode[node]} тр.`;
    }).join(' · ');
    const lockCard = lockedLines
      ? `<div class="lockcard">🔒 Запертые трейт-пулы: ${lockedLines}. Открой узлы в «Дереве открытий» — скаут начнёт приносить этих джокеров.</div>` : '';

    // синергии штата
    const over = TE.synergiesOverview({ G: g }).filter(sy => sy.scope === 'staff');
    const stLbl = { on: ['актив', 'st-on'], near: ['почти', 'st-near'], off: ['нет', 'st-off'] };
    const synHtml = over.map(sy => {
      const [l, cls] = stLbl[sy.status] || stLbl.off;
      return `<div class="syn ${sy.status}"><div class="syn-h"><span class="nm">${sy.icon || '🧬'} ${sy.name}</span>
        <span class="st ${cls}">${l}</span></div><div class="syn-d">${sy.desc || ''}</div></div>`;
    }).join('') || '<div class="syn-d">Каталог синергий пуст</div>';
    const onCnt = over.filter(s => s.status === 'on').length;

    // локальные синергии по активным проектам (scope: project)
    const projHtml = (g.activeClients || []).map(c => {
      const active = TE.synergiesOverview({ G: g, project: c })
        .filter(sy => sy.scope === 'project' && sy.status === 'on');
      if (!active.length) return '';
      return `<div class="plocal"><div class="ph"><span>${c.icon || '📂'} ${c.name || c.id}</span>
          <span class="pt">T${c.tier || 1}</span></div>
        ${active.map(sy => sy.kind === 'tension'
          ? `<div class="fire tension">⚠ ${sy.icon || ''} ${sy.name} — ${sy.desc || ''}</div>`
          : `<div class="fire">✦ ${sy.icon || ''} ${sy.name} — ${sy.desc || ''}</div>`).join('')}</div>`;
    }).join('') || '<div class="syn-d" style="font-size:10px;color:#4a5470">Нет активных локальных синергий — они включаются расстановкой спецов по проектам.</div>';

    return `
      <div class="sub">Каждый спец — «джокер» с трейтом. Сила рана — в сочетании трейтов (штат) и расстановке (проект). Новые джокеры приходят в скауте из открытых узлов дерева.</div>
      <div class="wrap">
        <div>
          <div class="col-lbl">Твоя команда <span class="cnt">· ${staff.length} в штате · ФОТ −${_fmtK(fot)}/мес · мораль ${mood}</span></div>
          <div class="roster">${roster}</div>
          <div style="margin-top:10px">${lockCard}</div>
        </div>
        <div class="side">
          <div class="card"><h3>🧬 Синергии штата <span class="r">актив ${onCnt} / ${over.length}</span></h3>${synHtml}</div>
          <div class="card"><h3>🎯 Локальные · на проектах</h3>${projHtml}</div>
        </div>
      </div>`;
  }

  function showTeamBuild() {
    _injectCss();
    let modal = document.getElementById('team-build-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'team-build-modal';
      modal.className = 'modal-overlay';
      modal.style.zIndex = 340;   // поверх team-modal (330)
      modal.innerHTML = `
        <div class="modal">
          <div class="modal-header" style="flex-shrink:0">
            <h2 style="margin:0;font-size:15px">🎛 Билд команды · Rogue-lite</h2>
            <button class="btn btn-ghost" style="padding:4px 10px"
              onclick="document.getElementById('team-build-modal').classList.remove('active')">✕</button>
          </div>
          <div class="tbuild" id="team-build-body"></div>
        </div>`;
      modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('active'); });
      document.body.appendChild(modal);
    }
    document.getElementById('team-build-body').innerHTML = _renderBody();
    modal.classList.add('active');
  }

  window.TraitsUI = { showTeamBuild };
  try { console.log('[traits-ui] экран «Билд команды» загружен'); } catch (e) {}
})();
