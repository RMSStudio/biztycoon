/* ═══════════════════════════════════════════════════════════════════════
   ui2.js — Ф.5 НОВЫЙ слой отрисовки (v2), отдельный от ui.js.
   Рисует #v2-shell (макет из ui-prototype) поверх легаси-экрана из живого G.
   Логику/модалки переиспользует из engine.js / projects.js / ui.js — НЕ дублирует.
   Безопасно: подключается ТОЛЬКО в index-v2.html, в сборку (dist) не входит.
   Фаза 1: статус-бар · команда · активные проекты · скаутинг · завершить месяц.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const $  = id => document.getElementById(id);
  const G_ = () => (typeof G !== 'undefined' ? G : null);

  const ROLE_EMOJI = {
    designer: '🎨', developer: '💻', manager: '📋', copywriter: '✍️',
    smm: '📣', lawyer: '⚖️', salesrep: '💼', hr: '🧑‍💼', analyst: '📊',
  };
  const GRADE_LABEL = { junior: 'Jr', middle: 'Md', senior: 'Sr', lead: 'Ld', star: '★' };
  const ROLE_LABEL = {
    designer: 'Дизайнер', developer: 'Разраб.', manager: 'ПМ', copywriter: 'Копирайтер',
    smm: 'SMM', lawyer: 'Юрист', salesrep: 'Переговорщик', hr: 'HR', analyst: 'Аналитик',
  };

  function _money(n) { return Math.round(n || 0).toLocaleString('ru-RU'); }
  function _safe(fn, dflt) { try { return fn(); } catch (_) { return dflt; } }

  // ── STATUS BAR ────────────────────────────────────────────────────
  function renderStatusBar(g) {
    if ($('sb-money')) $('sb-money').textContent = _money(g.money);
    if ($('sb-month')) $('sb-month').textContent = _safe(() => monthLabel(), g.month || 0);
    if ($('sb-rep'))   $('sb-rep').textContent = Math.floor(g.reputation || 0);

    // Ключевой расходуемый ресурс — рабочие дни (создаём элемент, если нет)
    _safe(() => {
      const max = (typeof getWorkdays === 'function') ? getWorkdays((g.month || 0) % 12)
                : (typeof ACTIONS_PER_MONTH !== 'undefined' ? ACTIONS_PER_MONTH : 20);
      const cur = Math.max(0, g.actions || 0);
      let el = $('v2-days');
      if (!el) {
        const bar = $('statusbar'); const stage = bar && bar.querySelector('.sb-stage');
        if (bar) {
          el = document.createElement('div');
          el.id = 'v2-days';
          el.title = 'Рабочие дни месяца — тратятся на скаутинг, действия, сделки. Обновляются в начале месяца.';
          el.style.cssText = 'display:flex;align-items:center;gap:6px;padding:4px 11px;border-radius:8px;font-weight:700;font-size:13px;margin-left:6px;white-space:nowrap';
          if (stage) bar.insertBefore(el, stage); else bar.appendChild(el);
        }
      }
      if (el) {
        const ratio = max > 0 ? cur / max : 0;
        const col = ratio > 0.4 ? '#27c06b' : ratio > 0.15 ? '#f5a524' : '#e85252';
        el.style.background = col + '22';
        el.style.border = '1px solid ' + col + '66';
        el.style.color = col;
        el.innerHTML = '⚡ <b>' + cur + '</b><span style="opacity:.6;font-weight:500"> / ' + max + ' дн.</span>';
      }
    });

    // Чистый поток/мес (расходы; доход приходит при сдаче)
    const cf = _safe(() => getCashflow(g), 0);
    const cfEl = document.querySelector('#statusbar .sb-stat .val.pos');
    if (cfEl) {
      cfEl.textContent = (cf >= 0 ? '+' : '−') + _money(Math.abs(cf)) + ' ₽/мес';
      cfEl.classList.toggle('pos', cf >= 0);
      cfEl.style.color = cf >= 0 ? 'var(--green)' : 'var(--red)';
    }

    // Стадия + прогресс (зеркалим вычисленный легаси-прогресс, пока нет своего)
    const lm = (typeof window !== 'undefined') ? window.LivingMarket : null;
    const cur  = lm && lm.getCurrentStage ? lm.getCurrentStage() : null;
    const next = lm && lm.getNextStage ? lm.getNextStage() : null;
    const pill = document.querySelector('#statusbar .stage-pill');
    if (pill && cur) pill.textContent = (cur.icon ? cur.icon + ' ' : '') + (cur.name || cur.label || '');
    const nextSpan = document.querySelector('#statusbar .stage-next > span:first-child');
    if (nextSpan) nextSpan.textContent = next ? ('→ ' + (next.name || next.label || '')) : '— макс. стадия';
    // прогресс — из легаси g-goal-bar (ui.js уже посчитал в скрытом экране)
    const legacyPct = _safe(() => parseInt($('g-goal-pct') ? $('g-goal-pct').textContent : '0', 10), 0) || 0;
    if ($('sb-prog'))     $('sb-prog').style.width = legacyPct + '%';
    if ($('sb-prog-pct')) $('sb-prog-pct').textContent = legacyPct + '%';
  }

  // ── TEAM (left HUD) ───────────────────────────────────────────────
  function renderTeam(g) {
    const list = document.querySelector('#hud-left .staff-list');
    if (list) {
      const staff = (g.staff || []).filter(s => s.status !== 'fired');
      if (!staff.length) {
        list.innerHTML = '<div style="padding:18px 8px;text-align:center;color:var(--tm);font-size:12px">Команды пока нет.<br>Наймите специалистов.</div>';
      } else {
        list.innerHTML = staff.map(s => {
          const emo = ROLE_EMOJI[s.role] || '🧑';
          const role = ROLE_LABEL[s.role] || s.roleLabel || s.role || '';
          const grade = GRADE_LABEL[s.grade] || s.gradeLabel || s.grade || '';
          const q = (s.q != null) ? s.q : (s.qStat != null ? s.qStat : '—');
          const mood = Math.round(s.mood ?? 80);
          const moodE = mood >= 70 ? '😊' : mood >= 45 ? '😐' : '😟';
          const moodC = mood >= 70 ? 'var(--green)' : mood >= 45 ? 'var(--amber)' : 'var(--red)';
          const busy = s._assignedProjectId ? '<span title="назначен на проект" style="color:var(--teal);font-size:8px">●</span> ' : '';
          return '<div class="staff-row" onclick="Ui2.team()" style="cursor:pointer" title="Управление командой">' +
            '<div class="staff-av">' + emo + '</div>' +
            '<div class="staff-inf"><div class="staff-name">' + busy + (s.name || '—') + '</div>' +
            '<div class="staff-role">' + role + (grade ? ' · ' + grade : '') + '</div></div>' +
            '<span class="staff-q" title="настроение ' + mood + '"><span style="color:' + moodC + '">' + moodE + '</span> Q' + q + '</span></div>';
        }).join('');
      }
    }
    // действия команды (найм / управление) — переиспользуем легаси-модалки
    if (list) {
      list.insertAdjacentHTML('beforeend',
        '<div style="display:flex;gap:6px;margin-top:10px">' +
        '<button class="btn-sm pri" style="flex:1" onclick="Ui2.hire()">＋ Нанять</button>' +
        '<button class="btn-sm" style="flex:1" onclick="Ui2.team()">⚙ Команда</button></div>');
    }
    const ft = Math.round(g.teamFatigue || 0);
    const fv = document.querySelector('#hud-left .fatigue-val'); if (fv) fv.textContent = ft + '%';
    const ff = document.querySelector('#hud-left .fat-fill');    if (ff) ff.style.width = ft + '%';
    const fot = _safe(() => getTotalStaffCost(g), 0);
    const fotEl = document.querySelector('#hud-left .fot-val'); if (fotEl) fotEl.textContent = '−' + _money(fot) + ' ₽/мес';
  }

  // ── PROJECTS (center) — АККОРДЕОН (Ф.5) ───────────────────────────
  // Рендерим колонки из живого G.activeClients. Действия — через настоящие
  // функции движка (Projects.resolveWorkEvent/showPhasePopup, completeProject,
  // investInClient, terminateContract, assignAndRefresh/…/autoAssignAndRefresh,
  // openAssignModal). Раскрытая карточка/детали свёрстаны под мокап.
  const _f = (n) => (typeof fmtK === 'function' ? fmtK(n) : String(Math.round(n||0)));
  // pa — яркий-но-читаемый тон заливки раскрытой карточки (белый текст поверх),
  // pd — глубокий вариант (текст темой на белых кнопках/чипах).
  const _ACC_THEMES = [
    {pa:'#0e9384',pd:'#0a5f56'}, {pa:'#4061cf',pd:'#2c4699'},
    {pa:'#7d54d8',pd:'#573a99'}, {pa:'#c2641f',pd:'#8a4715'},
    {pa:'#d83e63',pd:'#9c2c47'}, {pa:'#cf5078',pd:'#973a58'},
  ];
  function _accTheme(c) {
    let i;
    if (c.tier) i = (c.tier - 1 + _ACC_THEMES.length) % _ACC_THEMES.length;
    else { let h = 0; const s = String(c.id || c.name || ''); for (let k=0;k<s.length;k++) h=(h*31+s.charCodeAt(k))>>>0; i = h % _ACC_THEMES.length; }
    return _ACC_THEMES[i];
  }
  let _accOpen = null;        // id раскрытого проекта (одиночный аккордеон)
  const _accDet = new Set();  // id проектов в режиме «Детали»
  function _accScrollOpenIntoView() {
    requestAnimationFrame(() => {
      const col = document.querySelector('#projects-zone .v2-acc .pcol.open');
      if (col && col.scrollIntoView) col.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
    });
  }

  function renderProjects(g) {
    const live = (g.activeClients || []);   // включая разовые (oneTime)
    const cntEl = document.querySelector('#projects-zone .zone-title .cnt');
    if (cntEl) cntEl.textContent = '(' + live.length + ')';
    renderProjectsAccordion(g);
  }

  function renderProjectsAccordion(g) {
    const zone = document.querySelector('#projects-zone');
    if (!zone) return;
    const grid = zone.querySelector('.proj-grid');
    if (grid && grid.style.display !== 'none') grid.style.display = 'none';
    let acc = zone.querySelector('.v2-acc');
    if (!acc) { acc = document.createElement('div'); acc.className = 'v2-acc'; zone.appendChild(acc); }
    const live = (g.activeClients || []);   // разовые тоже рисуем
    if (_accOpen && !live.some(c => String(c.id) === String(_accOpen))) _accOpen = null;
    if (!live.length) { acc.innerHTML = '<div class="v2-acc-empty">Активных проектов нет — возьми проект на бирже.</div>'; return; }
    acc.innerHTML = live.map(c => _accCol(c, g)).join('');
  }

  // ── вспомогательные блоки ──
  function _accWorkBar(c) {
    const wOrder = (c._lcChain || []).filter(p => p.startsWith('work_'));
    const prog = Math.round(c._progress || 0);
    if (!wOrder.length) return { segs:`<i><b style="width:${prog}%"></b></i>`, idx:0, len:1, total:prog };
    const wIdx = Math.max(0, wOrder.indexOf(c._lcPhase));
    const doneAll = (wIdx === wOrder.length - 1) && prog >= 100;
    const total = doneAll ? 100 : Math.min(99, Math.floor((wIdx*100 + prog) / wOrder.length));
    const segs = wOrder.map((_, i) => { const pct = i<wIdx?100:i===wIdx?prog:0; return `<i><b style="width:${pct}%;opacity:${i<wIdx?'.6':'1'}"></b></i>`; }).join('');
    return { segs, idx:wIdx, len:wOrder.length, total };
  }
  function _accTeam(c) {
    const G_ = (typeof G !== 'undefined') ? G : {staff:[],activeClients:[]};
    const team = (G_.staff || []).filter(s => s.status !== 'fired');
    const id = String(c.id);
    const pThr = (typeof getProjectThroughput === 'function') ? getProjectThroughput(c) : 2;
    const pLoad = (typeof getProjectLoad === 'function') ? getProjectLoad(c) : 0;
    const eff = pLoad>0 ? ((typeof effFromRatio==='function')?effFromRatio(pThr/pLoad):Math.min(1.5,pThr/pLoad)) : 1;
    const effPct = Math.round(eff*100);
    const barCol = effPct>=100?'#27c06b':effPct>=60?'#f5a524':'#e85252';
    let freeCount = 0; const chips = ['<span class="chip" style="opacity:.75" title="Фаундер на всех проектах">👤 Ты +2</span>'];
    team.forEach(s => {
      const iid = s._iid || s.uid || s.id;
      const here = (c._assignedStaff || []).includes(iid);
      const otherId = (s._assignedProjectId && s._assignedProjectId !== c.id) ? s._assignedProjectId : null;
      const other = otherId ? (G_.activeClients || []).find(x => x.id === otherId) : null;
      if (!here && !other) freeCount++;
      const wu = (typeof calcStaffWorkUnit==='function') ? calcStaffWorkUnit(s) : 1;
      const first = (s.name || '').split(' ')[0] || '?';
      const act = here ? `unassignAndRefresh('${iid}','${id}')` : `assignAndRefresh('${iid}','${id}')`;
      const suf = other ? ' ↪' : here ? ' ✕' : '';
      const hint = here ? 'Снять с проекта' : other ? ('Сейчас на «'+other.name+'» — перевести сюда') : 'Назначить';
      chips.push(`<button class="chip ${here?'on':''}" title="${hint}" onclick="event.stopPropagation();${act}">${s.icon||'👤'} ${first} +${wu}${suf}</button>`);
    });
    const warn = team.length===0 ? 'Команды нет — проект идёт на твоей мощности (+2)'
      : (pThr<pLoad ? ('⚠ не хватает '+Math.round(pLoad-pThr)+' ед. — кликни по свободным чипам') : '');
    return `<div class="lbl">Команда</div>
      <div class="teamhead"><span class="t">⚙ ${Math.round(pThr)}/${pLoad} мощн · <b style="color:${barCol}">${effPct}%</b></span>
        <span class="b"><button ${freeCount===0?'disabled':''} onclick="event.stopPropagation();autoAssignAndRefresh('${id}')">⚡ Авто</button>
        <button onclick="event.stopPropagation();openAssignModal('${id}')">Подробнее</button></span></div>
      <div class="chips">${chips.join('')}</div>
      ${warn?`<div class="warn">${warn}</div>`:''}`;
  }
  function _accPace(c) {
    const spd = (typeof getSpeed==='function')?getSpeed():1;
    const fat = (typeof getFatigueMult==='function')?getFatigueMult():1;
    const pLoad = (typeof getProjectLoad==='function')?getProjectLoad(c):0;
    const pThr = (typeof getProjectThroughput==='function')?getProjectThroughput(c):2;
    const eff = pLoad>0 ? ((typeof effFromRatio==='function')?effFromRatio(pThr/pLoad):Math.min(1.5,pThr/pLoad)) : 1;
    const workCnt = c._lcChain ? c._lcChain.filter(p=>p.startsWith('work_')).length : 1;
    const phaseDur = (c._duration||3)/Math.max(1,workCnt);
    const withF = Math.round((100/phaseDur)*eff*spd*fat);
    const rem = Math.max(0,100-(c._progress||0));
    const mths = withF>0?Math.ceil(rem/withF):99;
    return `<div class="pace">+${withF}%/мес · этап ~${mths} мес${spd>1.05?(' · ⚡×'+spd.toFixed(2)):''}</div>`;
  }
  function _accPayments(c, payout) {
    const orig = c._originalBudget || c._totalBudget || payout || 0;
    const pre = c._prepaidAmount || 0;
    const ms = c._milestones||[], msPaid = c._milestonesPaid||[], msPct = c._milestonePcts||[];
    const segs = [];
    if (pre>0) segs.push({l:'Аванс', amt:pre, done:true});
    ms.forEach((thr,idx) => segs.push({l:'Этап '+(idx+1), amt:Math.round(orig*(msPct[idx]||0)), done:msPaid.includes(idx)}));
    const accounted = segs.reduce((s,x)=>s+x.amt,0);
    segs.push({l:'Сдача', amt:Math.max(0,(payout||orig)-accounted), done:false});
    let nextDone=false; segs.forEach(s=>{ if(!s.done&&!nextDone){ s.next=true; nextDone=true; } });
    const totalAll = segs.reduce((s,x)=>s+x.amt,0)||1;
    const received = segs.filter(s=>s.done).reduce((s,x)=>s+x.amt,0);
    const track = segs.map(s=>`<div class="dp-seg ${s.done?'done':s.next?'next':''}" style="flex:${Math.max(10,Math.round(s.amt/totalAll*100))}"><b>${s.l}</b><span>${Math.round(s.amt/totalAll*100)}%</span><em>${_f(s.amt)}</em></div>`).join('');
    return `<div class="det-pay"><div class="dp-head"><span class="lbl" style="margin:0">Выплаты</span><span class="dp-sum">${_f(received)} <i>/ ${_f(totalAll)} получено</i></span></div>
      <div class="dp-track">${track}</div>
      <div class="dp-legend"><span><i class="d"></i>получено</span><span><i class="n"></i>следующая</span><span><i class="w"></i>ожидается</span></div></div>`;
  }
  function _accHistory(c) {
    const PL = (typeof Projects!=='undefined')?Projects:null;
    const hist = c._lcHistory || [];
    if (!hist.length) return '<div class="det-row"><span class="ph">—</span><span class="ch">Решений пока нет</span></div>';
    return hist.slice(-7).map(h => {
      const ph = (PL&&PL.PHASE_LABELS&&PL.PHASE_LABELS[h.phase])?PL.PHASE_LABELS[h.phase]:h.phase;
      const ch = (h.choice||'').replace(/^[^:]+:\s*/,'');
      return `<div class="det-row"><span class="ph">${ph}</span><span class="ch">${ch}${h.effect?(' · '+h.effect):''}</span></div>`;
    }).join('');
  }

  function _accCol(c, g) {
    const id = String(c.id);
    const th = _accTheme(c);
    const open = (String(_accOpen) === id);
    const det = open && _accDet.has(id);
    const nps = Math.round(((g.clientNPS && g.clientNPS[c.id]) != null ? g.clientNPS[c.id] : (c.npsStart != null ? c.npsStart : 70)));
    const progress = Math.round(c._progress || 0);
    const progCol = progress>=100?'#27c06b':progress>=60?'#13b8a6':'#f5a524';
    const budget = c._totalBudget || 0;
    const pfM = (typeof getPortfolioMultiplier==='function')?getPortfolioMultiplier():1;
    const pfPct = Math.round((pfM-1)*100);
    const payout = pfPct>0?Math.round(budget*pfM):budget;
    const isLC = !!c._lcPhase;
    const isLCEvent = isLC && !c._lcPhase.startsWith('work_');
    const PL = (typeof Projects!=='undefined')?Projects:null;
    const phaseLabel = (isLC && PL && PL.PHASE_LABELS && PL.PHASE_LABELS[c._lcPhase]) ? PL.PHASE_LABELS[c._lcPhase] : (progress>=100?'Готов к сдаче':'В работе');
    const phaseIcon = (isLC && PL && PL.PHASE_ICONS && PL.PHASE_ICONS[c._lcPhase]) ? PL.PHASE_ICONS[c._lcPhase] : '▶';
    const tierStr = c.tier ? ('T'+c.tier) : '';
    const payLabel = c.oneTime ? 'разово' : 'при сдаче';
    const subTag = c.oneTime ? 'Разовый' : tierStr;
    const pending = !!c._lcPendingDecision;
    const canComplete = !isLC && progress>=100;
    const mood = Math.round(c._lcClientMood != null ? c._lcClientMood : 60);
    const risk = Math.round(c._lcRisk || 0);
    const quality = Math.round(Math.min(100, c._lcQualityBonus || 0));
    let dl = '—'; if (c._duration) dl = (c._monthsSigned||0)+'/'+c._duration+' мес';
    let deadlineBadge = '';
    if (c._duration) { const mo=c._monthsSigned||0,dur=c._duration,over=mo>dur; deadlineBadge=`<span class="badge">📅 ${mo}/${dur} мес${over?(' +'+(mo-dur)):''}</span>`; }

    let phaseStatus, phaseCol;
    if (pending) { phaseStatus='⚡ требует решения'; phaseCol='#e85252'; }
    else if (isLCEvent) { phaseStatus=phaseIcon+' '+phaseLabel; phaseCol='#f5a524'; }
    else if (progress>=100) { phaseStatus='готов к сдаче'; phaseCol='#27c06b'; }
    else { phaseStatus='▶ в работе'; phaseCol='#9aa6bd'; }

    const wb = _accWorkBar(c);
    const progressBlock = `<div class="lbl">Прогресс</div><div class="seg">${wb.segs}</div><div class="seg-row"><span>${(isLC&&wb.len>1)?('Работа '+(wb.idx+1)+' из '+wb.len):'Выполнение'}</span><span>${wb.total}%</span></div>`;

    let pill = '';
    if (pending) pill = `<div class="pill">▶ ${phaseLabel} · требует решения <button class="go" onclick="event.stopPropagation();Projects.resolveWorkEvent('${id}')">⚡ Решить</button></div>`;
    else if (isLCEvent) pill = `<div class="pill">${phaseIcon} ${phaseLabel} <button class="go" onclick="event.stopPropagation();Projects.showPhasePopup((G.activeClients||[]).find(x=>String(x.id)==='${id}'))">Открыть</button></div>`;
    else if (canComplete) pill = `<div class="pill">Готов к сдаче <button class="go" onclick="event.stopPropagation();completeProject('${id}')">🏁 Завершить</button></div>`;

    const lcMetrics = (isLC && !isLCEvent) ? `<div class="lbl">Команда · Риск · Качество</div><div class="mrq"><span>😊 ${mood}</span><span>⚠ ${risk}</span><span>✨ ${quality}</span></div>` : '';
    const teamBlock = !isLCEvent ? (_accTeam(c) + _accPace(c)) : '';

    const npsFoot = `<div class="nps-foot"><div class="lbl">Оценка клиента</div><div class="frow"><div class="bar"><i style="width:${nps}%"></i></div><div class="val">${nps}</div><button onclick="event.stopPropagation();investInClient('${id}')" title="−20К → оценка клиента +25">💬 −20К</button><button onclick="event.stopPropagation();Ui2.toggleDet('${id}')">📋 Детали</button><button onclick="event.stopPropagation();terminateContract('${id}')" title="Досрочное расторжение">✕</button></div></div>`;

    const details = `<div class="pc-details">
      <button class="det-back" onclick="event.stopPropagation();Ui2.toggleDet('${id}')">← К проекту</button>
      <div class="lbl">Детали · ${c.name}</div>
      <div class="det-grid">
        <div class="det-cell"><div class="k">Бюджет</div><div class="v">${_f(c._originalBudget||budget)}</div></div>
        <div class="det-cell"><div class="k">При сдаче</div><div class="v">${_f(payout)}</div></div>
        <div class="det-cell"><div class="k">Дедлайн</div><div class="v">${dl}</div></div>
        <div class="det-cell"><div class="k">Оценка</div><div class="v">${nps}</div></div>
      </div>
      <div class="lbl">История решений</div>
      <div class="det-log">${_accHistory(c)}</div>
      <div style="flex:1"></div>
      ${_accPayments(c, payout)}
    </div>`;

    return `<div class="pcol ${open?'open':''} ${det?'det':''}" style="--pa:${th.pa};--pa-d:${th.pd}" onclick="Ui2.openProj('${id}')">
      <div class="pc-collapsed" style="display:flex;flex-direction:column;flex:1;min-height:0">
        <div class="pc-pay"><div class="v num">${_f(payout)}</div><div class="l">₽ ${payLabel}</div></div>
        <div class="pc-tick"></div>
        <div class="pc-name">${c.name}</div>
        <div class="pc-sub">${subTag}${isLC?(' · '+phaseLabel):(c.oneTime?'':'')}</div>
        <div class="pc-phase" style="color:${phaseCol}">${phaseStatus}</div>
        <div class="pc-art"><span class="ico">${c.icon||'🗂'}</span></div>
        <div class="pc-foot"><div class="pct"><span>${isLC?phaseLabel:'Прогресс'}</span><span>${progress}%</span></div><div class="pc-vbar"><i style="width:${progress}%;background:${progCol}"></i></div></div>
      </div>
      <button class="pc-close" onclick="event.stopPropagation();Ui2.closeProj()">свернуть ✕</button>
      <div class="pc-head-open"><div class="pay">${_f(payout)} ₽ <small>${payLabel}</small></div><div class="nm">${c.name}</div><div class="sb">${subTag}${isLC?(' · '+phaseLabel):''}</div></div>
      <div class="pc-full">
        <div class="badges">${pfPct>0?`<span class="badge">💎 +${pfPct}% портфолио → ${_f(payout)}</span>`:''}${deadlineBadge}</div>
        ${progressBlock}
        ${pill}
        ${lcMetrics}
        ${teamBlock}
        <div style="flex:1"></div>
        ${npsFoot}
      </div>
      ${details}
    </div>`;
  }

  // ── SCOUTING (center) ─────────────────────────────────────────────
  // Реальный скаут — легаси-модал (showScoutResults) с правильным подписанием
  // через startSign() (переговоры/lifecycle). Зона показывает только триггер.
  function renderScout(g) {
    const zone = $('scout-zone');
    if (!zone) return;
    const cost = (typeof SCOUT_COST !== 'undefined') ? SCOUT_COST : 6;
    const canScout = (g.actions || 0) >= cost;
    const has = (g.scoutPool || []).length;
    zone.innerHTML = '<div class="zone-hd"><span class="zone-title">Скаутинг проектов</span>' +
      '<button class="btn-sm pri" onclick="Ui2.scout()"' + (canScout || has ? '' : ' disabled') + '>' +
      (has ? '📋 Открыть найденные (' + has + ')' : '🔍 Искать заказы (−' + cost + ' дн.)') + '</button></div>' +
      '<div style="padding:22px;text-align:center;color:var(--tm);font-size:12px">' +
      (has ? 'Есть найденные заказы — откройте и подпишите контракт.' : 'Запустите скаутинг, чтобы найти заказы. Подписание идёт через переговоры.') + '</div>';
  }

  // ── CENTER VIEW: РЫНОК (нативно) ──────────────────────────────────
  function renderMarket(g) {
    const host = document.querySelector('#view-market');
    if (!host) return;
    const cmp = window.Competitors, lm = window.LivingMarket;
    const ranking = _safe(() => (cmp && cmp.getRanking ? cmp.getRanking() : []), []);
    if (!ranking || !ranking.length) {
      host.innerHTML = '<div class="zone-hd"><span class="zone-title">Живой рынок</span></div>' +
        '<div class="view-placeholder"><div class="ph-box"><div class="ph-ico">📊</div>' +
        '<div class="ph-title">Рынок ещё спит</div><div class="ph-desc">Конкуренты появятся по мере роста студии (со стадии «Агентство»).</div></div></div>';
      return;
    }
    const holdings = (g.market && g.market.holdings) || {};
    const acq = (g.market && g.market.acquisitions) || 0;
    const rows = ranking.map(c => {
      const medal = c.rank === 1 ? '🥇' : c.rank === 2 ? '🥈' : c.rank === 3 ? '🥉' : '#' + c.rank;
      const own = (!c.isPlayer && holdings[c.id]) || 0;
      const clickable = !c.isPlayer;
      return '<div ' + (clickable ? 'onclick="Ui2.deal(\'' + c.id + '\')" ' : '') +
        'style="' + (clickable ? 'cursor:pointer;' : '') +
        'display:grid;grid-template-columns:34px 1fr 84px 52px 40px;gap:10px;align-items:center;width:100%;' +
        'border:1px solid ' + (c.isPlayer ? '#fbbf24' : 'var(--bd)') + ';border-radius:9px;' +
        'background:' + (c.isPlayer ? 'rgba(251,191,36,.06)' : 'var(--bg-c)') + ';padding:9px 11px;margin:0 0 6px">' +
        '<div style="text-align:center;font-weight:800;font-size:14px">' + medal + '</div>' +
        '<div><div style="font-weight:700;font-size:12px">' + (c.icon || '🏢') + ' ' + (c.isPlayer ? 'Вы' : c.name) + '</div>' +
        '<div style="font-size:10px;color:var(--tm)">' + (c.isPlayer ? 'ваше агентство' : (c.archetype || '')) + (own > 0 ? ' · 📈 ' + own + '%' : '') + '</div></div>' +
        '<div style="text-align:right;font-size:11px;font-weight:600">' + _safe(() => fmtK(c.revenue), c.revenue) + '</div>' +
        '<div style="text-align:right;font-size:11px;color:var(--tm)">⭐ ' + Math.floor(c.reputation || 0) + '</div>' +
        '<div style="text-align:center;color:' + (clickable ? '#a78bfa' : 'transparent') + ';font-size:13px">' + (clickable ? '🤝' : '') + '</div>' +
      '</div>';
    }).join('');
    host.innerHTML =
      '<div class="zone-hd"><span class="zone-title">Живой рынок <span class="cnt">M' + (g.month || 0) + '</span></span>' +
        '<div class="zone-acts"><button class="btn-sm" onclick="Ui2.assets()">Дочерние / активы</button></div></div>' +
      '<div style="display:flex;gap:8px;margin-bottom:12px">' +
        '<div style="flex:1;padding:11px;border:1px solid var(--bd);border-radius:9px;background:var(--bg-c)"><div style="font-size:10px;color:var(--tm)">Поглощений</div><div style="font-size:18px;font-weight:800">' + acq + ' / 3</div></div>' +
        '<div style="flex:1;padding:11px;border:1px solid var(--bd);border-radius:9px;background:var(--bg-c)"><div style="font-size:10px;color:var(--tm)">Долей в студиях</div><div style="font-size:18px;font-weight:800">' + Object.keys(holdings).filter(k => holdings[k] > 0).length + '</div></div>' +
      '</div>' + rows +
      '<div style="font-size:10px;color:var(--tm);margin-top:10px;text-align:center;font-style:italic">🤝 Кликните конкурента — доли и поглощение</div>';
  }

  // ── CENTER VIEW: ДРЕВО ПЕРКОВ (нативно, переселённый легаси-рендер) ──
  function renderTree(g) {
    const host = document.querySelector('#view-tree');
    if (!host) return;
    const lm = window.LivingMarket;
    const xp = _safe(() => (lm && lm.getXp ? lm.getXp() : (g.xp || 0)), g.xp || 0);
    const nodes = _safe(() => (lm && lm.getTreeNodes ? lm.getTreeNodes() : []), []);
    const hd = host.querySelector('.zone-hd');
    if (hd) hd.innerHTML = '<span class="zone-title">Древо перков <span class="cnt">' + nodes.length + ' узлов</span></span>' +
      '<span style="font-size:13px;font-weight:800;color:#fbbf24">★ ' + xp + ' <span style="color:var(--tm);font-size:11px;font-weight:500">доступно</span></span>';
  }

  // ── CENTER VIEW: АКТИВЫ / КОМПАНИЯ (нативно) ───────────────────────
  function renderCompany(g) {
    const host = document.querySelector('#view-company');
    if (!host) return;
    const lm = window.LivingMarket;
    const offices = _safe(() => (lm && lm.getOwnedOffices ? lm.getOwnedOffices() : []), []);
    const subs    = _safe(() => (lm && lm.getOwnedSubBrands ? lm.getOwnedSubBrands() : []), []);
    const daughters = _safe(() => (lm && lm.getSubsidiaries ? lm.getSubsidiaries() : ((g.living && g.living.subsidiaries) || [])), []);
    const card = (icon, title, val) => '<div style="flex:1;padding:12px;border:1px solid var(--bd);border-radius:9px;background:var(--bg-c)"><div style="font-size:20px">' + icon + '</div>' +
      '<div style="font-size:11px;color:var(--tm);margin-top:4px">' + title + '</div><div style="font-size:16px;font-weight:800">' + val + '</div></div>';
    const list = (arr, empty, fmt) => arr && arr.length
      ? arr.map(fmt).join('')
      : '<div style="font-size:11px;color:var(--tm);padding:10px;font-style:italic">' + empty + '</div>';
    host.innerHTML =
      '<div class="zone-hd"><span class="zone-title">Компания и активы</span>' +
        '<div class="zone-acts"><button class="btn-sm" onclick="Ui2.journal()">Стадии / журнал</button>' +
        '<button class="btn-sm" onclick="Ui2.perks()">Древо перков</button></div></div>' +
      '<div style="display:flex;gap:8px;margin-bottom:14px">' +
        card('📁', 'Портфолио', (g.portfolio || 0)) +
        card('🗂', 'Кейсов', ((g.cases && g.cases.length) || 0)) +
        card('🏢', 'Офисов', offices.length) +
        card('🏷', 'Саббрендов', subs.length) +
      '</div>' +
      '<div class="rhud-section-lbl" style="margin:6px 0 8px">Дочерние компании · ' + (daughters.length || 0) + '</div>' +
      list(daughters, 'Поглощённых компаний пока нет.', s =>
        '<div style="display:flex;align-items:center;gap:10px;width:100%;border:1px solid var(--bd);border-radius:9px;background:var(--bg-c);padding:9px 11px;margin-bottom:7px">' +
        '<span style="font-size:18px">' + (s.icon || '🏢') + '</span>' +
        '<div style="flex:1"><div style="font-weight:700;font-size:12px">' + (s.name || '—') + '</div>' +
        '<div style="font-size:10px;color:var(--tm)">' + (s.mode || '') + ' · оценка ' + _safe(() => fmtK(s.valuation || 0), '') + '</div></div></div>');
  }

  // ── RIGHT CONTEXT HUD (P&L / рынок / лог) ─────────────────────────
  function renderContext(g) {
    const body = document.querySelector('#hud-right .hud-body');
    if (!body) return;
    const lm = (typeof window !== 'undefined') ? window.LivingMarket : null;
    const cmp = (typeof window !== 'undefined') ? window.Competitors : null;

    const burn = Math.round(_safe(() => -getCashflow(g), 0));   // ФОТ+overhead(+кредит)
    let income = 0;
    (g.activeClients || []).filter(c => !c.oneTime).forEach(c => {
      const dur = c._duration || 6;
      income += (c._totalBudget || 0) / dur;
    });
    income = Math.round(income);
    const div = Math.round(_safe(() => (lm && lm.totalDividends ? lm.totalDividends(g) : 0), 0));
    const profit = income + div - burn;
    const row = (lbl, val, cls) => '<div class="metric-row"><span class="m-lbl">' + lbl + '</span>' +
      '<span class="m-val ' + (cls || '') + '">' + val + '</span></div>';
    const money = v => (v >= 0 ? '+' : '−') + _money(Math.abs(v)) + ' ₽';

    // рынок
    const rank = _safe(() => cmp && cmp.getPlayerRank ? cmp.getPlayerRank() : null, null);
    const size = _safe(() => cmp && cmp.getMarketSize ? cmp.getMarketSize() : null, null);
    const acq  = _safe(() => (g.market && g.market.acquisitions) || 0, 0);
    const comps = _safe(() => (g.market && g.market.competitors ? g.market.competitors.length : 0), 0);

    // лог из G.log (новые сверху)
    const logItems = (g.log || []).slice(0, 6).map(l =>
      '<div class="log-item">' + (l.msg || '') + '</div>').join('') ||
      '<div class="log-item" style="color:var(--tm)">Событий пока нет.</div>';

    // Ф.6 сезон + Р.4 климат рынка (давление директора)
    const sea = _safe(() => (typeof getActiveSeason === 'function') ? getActiveSeason(g) : null, null);
    const nxt = _safe(() => (typeof getNextSeason === 'function') ? getNextSeason(g) : null, null);
    const d = g.director || {};
    const press = Math.min(3, d.pressure || 0);
    const pressDots = '●'.repeat(press) + '○'.repeat(3 - press);
    const pressC = press >= 2 ? '#e85252' : press >= 1 ? '#f5a524' : '#6b7a99';
    const seaBlock = sea ? (
      '<div class="rhud-section-lbl">Сейчас</div>' +
      '<div style="padding:9px 0">' +
        '<div style="font-size:12px;font-weight:700;color:' + (sea.color || 'var(--t)') + '">' + (sea.icon || '') + ' ' + (sea.label || '') + '</div>' +
        '<div style="font-size:10px;color:var(--tm);margin-top:4px;line-height:1.45">' + (sea.desc || '') + '</div>' +
        (nxt ? '<div style="font-size:9px;color:var(--td);margin-top:5px">Следующий через ' + nxt.monthsLeft + ' мес: ' + nxt.theme.icon + ' ' + nxt.theme.label + '</div>' : '') +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:9px;font-size:11px">' +
          '<span class="m-lbl">Климат рынка</span><span style="font-weight:700;color:' + pressC + '" title="Давление директора (Р.4)">' + pressDots + '</span></div>' +
      '</div>' +
      '<div class="hud-divider" style="margin:8px 0"></div>') : '';

    body.innerHTML =
      '<div class="rhud-section-lbl">P&L прогноз</div>' +
      row('Доход/мес (оценка)', money(income + div), income + div > 0 ? 'm-green' : '') +
      row('ФОТ + overhead', money(-burn), 'm-red') +
      row('Прибыль/мес', money(profit), profit >= 0 ? 'm-green' : 'm-red') +
      '<div class="hud-divider" style="margin:8px 0"></div>' +
      seaBlock +
      '<div class="rhud-section-lbl">Рынок</div>' +
      row('Рейтинг', '<span class="rank-badge">🏆 #' + (rank || '—') + (size ? ' / ' + size : '') + '</span>') +
      row('Поглощений', acq) +
      row('Конкурентов', comps + ' активных', 'm-amber') +
      '<div class="hud-divider" style="margin:8px 0"></div>' +
      '<div class="rhud-section-lbl">Лог событий</div>' + logItems;
  }

  // ── MAIN RENDER ───────────────────────────────────────────────────
  let _booted = false;
  function renderV2() {
    const g = G_();
    if (!g) return;
    _safe(() => renderStatusBar(g));
    _safe(() => renderTeam(g));
    _safe(() => renderProjects(g));
    _safe(() => renderScout(g));
    _safe(() => renderContext(g));
    // активный центральный альт-вид держим свежим
    _safe(() => { if (document.querySelector('#view-market.active')) renderMarket(g); });
    _safe(() => { if (document.querySelector('#view-company.active')) renderCompany(g); });
    _safe(() => { if (document.querySelector('#view-tree.active')) renderTree(g); });
  }

  // ── ACTIONS (через движок) ────────────────────────────────────────
  const Ui2 = {
    nextTurn() { _safe(() => { advanceMonth(); }); _safe(() => _emitRender()); },
    // реальный скаутинг — легаси-модал (showScoutResults), подписание через startSign()
    scout() { _safe(() => { if (typeof doScouting === 'function') doScouting(); }); _safe(() => _emitRender()); },
    openProject(cid) {
      // переиспользуем легаси-панель деталей проекта (lifecycle)
      _safe(() => { if (typeof Projects !== 'undefined' && Projects.showDetailPanel) Projects.showDetailPanel(cid);
                    else if (typeof Projects !== 'undefined' && Projects.openCard) Projects.openCard(cid); });
    },
    // ── аккордеон проектов (Ф.5): раскрытие/детали ──
    openProj(id) { id = String(id); if (String(_accOpen) === id) return; _accOpen = id; _accDet.delete(id); renderV2(); _accScrollOpenIntoView(); },
    closeProj()  { _accOpen = null; renderV2(); },
    toggleDet(id){ id = String(id); if (_accDet.has(id)) _accDet.delete(id); else _accDet.add(id); renderV2(); },
    // ── глубокие экраны через легаси-модалки ──
    hire() {
      const g = G_(); if (!g) return;
      // если пул кандидатов пуст — запускаем бесплатный скаутинг (−2 дня), затем модал
      if (!((g.candidatePool || []).length) && typeof scoutCandidates === 'function') _safe(() => scoutCandidates('free'));
      _safe(() => { if (typeof openStaffScoutModal === 'function') openStaffScoutModal(); });
      _safe(() => _emitRender());
    },
    team()    { _safe(() => { if (typeof openTeamModal === 'function') openTeamModal(); }); },
    market()  { _safe(() => { if (window.Competitors && Competitors.showMarketModal) Competitors.showMarketModal(); }); },
    // нативные центральные виды
    showMarket()  { Ui2.switchView('view-market', 'fab-market');   const g = G_(); if (g) _safe(() => renderMarket(g)); },
    showCompany() { Ui2.switchView('view-company', 'fab-company'); const g = G_(); if (g) _safe(() => renderCompany(g)); },
    showTree()    { Ui2.switchView('view-tree', 'fab-tree'); const g = G_(); if (g) _safe(() => renderTree(g)); },
    showGame()    { Ui2.switchView('view-game', 'fab-game'); },
    deal(id)      { _safe(() => { if (window.Competitors && Competitors.openAcquire) Competitors.openAcquire(id); }); },
    perks()   { _safe(() => { if (typeof openPerkModal === 'function') openPerkModal(); }); },
    assets()  { _safe(() => { if (window.LivingMarket && LivingMarket.showAssetsModal) LivingMarket.showAssetsModal(); }); },
    journal() { _safe(() => { if (window.LivingMarket && LivingMarket.showJournalModal) LivingMarket.showJournalModal(); }); },
    save()    { _safe(() => { if (typeof openSaveModal === 'function') openSaveModal(); }); },
    menu()    { _safe(() => { if (typeof confirmExitToMenu === 'function') confirmExitToMenu(); }); },
    toggleHud(side) { const el = $('hud-' + side); if (el) el.classList.toggle('collapsed'); },
    switchView(viewId, fabId) {
      document.querySelectorAll('#v2-shell .cview').forEach(v => v.classList.remove('active'));
      document.querySelectorAll('#v2-shell .fab').forEach(b => b.classList.remove('active'));
      const v = $(viewId); if (v) v.classList.add('active');
      const f = fabId && $(fabId); if (f) f.classList.add('active');
    },
  };
  window.Ui2 = Ui2;
  // совместимость с инлайн-onclick прототипа
  window.toggleHud = Ui2.toggleHud;
  window.switchView = Ui2.switchView;
  window.toggleCard = function (id) { const c = $(id); if (!c) return; const open = c.classList.contains('expanded'); document.querySelectorAll('#v2-shell .pc').forEach(x => x.classList.remove('expanded')); if (!open) c.classList.add('expanded'); };

  // ── BOOT ──────────────────────────────────────────────────────────
  function boot() {
    const g = G_();
    if (!g) { setTimeout(boot, 120); return; }   // движок ещё грузится
    if (_booted) return;
    _booted = true;
    // авто-старт партии для превью, если не идёт (легаси-резюм мог уже поднять)
    _safe(() => {
      if (!g.spec) { if (typeof selectSpec === 'function') selectSpec('smm'); }
      if (g.month == null && typeof startGame === 'function') startGame();
    });
    // показать v2-shell поверх легаси-экранов + спрятать сами легаси-экраны
    // (они остаются в DOM скрытыми — ui.js/модалки продолжают работать)
    _safe(() => document.querySelectorAll('.screen').forEach(s => { s.style.display = 'none'; }));
    // «Переселяем» легаси-контейнер активных проектов в зону HUD Shell.
    // Полнофункциональные карточки (фазы, действия, чипы команды, перейти-к-сдаче)
    // продолжает рисовать ui.js → #g-clients-list, но уже внутри нового макета.
    _safe(() => {
      // Проекты: НЕ переселяем легаси-список — рисуем аккордеон (renderProjectsAccordion)
      // в #projects-zone из живого G. Легаси #g-clients-list остаётся скрытым в своём
      // экране (ui.js продолжает его рисовать — безвредно, движок не трогаем).
      // То же для древа перков: легаси-рендер #g-upgrades-list → в #view-tree
      const tv = document.querySelector('#view-tree');
      const tph = tv && tv.querySelector('.view-placeholder');
      const tree = $('g-upgrades-list');
      if (tv && tree) {
        if (tph) tph.style.display = 'none';
        tree.classList.add('v2-tree');
        tv.appendChild(tree);
        tree.style.display = '';
      }
    });
    const shell = $('v2-shell');
    if (shell) {
      shell.style.display = '';
      shell.style.background = 'var(--bg, #0c0f15)';
    }
    // перехватываем кнопки прототипа → реальные действия движка
    _safe(() => {
      const bind = (sel, fn) => { const el = document.querySelector(sel); if (el) el.onclick = fn; };
      bind('#v2-shell .fab.go', Ui2.nextTurn);
      bind('#fab-game',    () => Ui2.showGame());
      bind('#fab-tree',    () => Ui2.showTree());     // нативный вид
      bind('#fab-market',  () => Ui2.showMarket());   // нативный вид
      bind('#fab-company', () => Ui2.showCompany());  // нативный вид
      // статус-бар: Сохранить / Меню
      const sbBtns = document.querySelectorAll('#statusbar .sb-btn');
      if (sbBtns[0]) sbBtns[0].onclick = Ui2.save;
      if (sbBtns[1]) sbBtns[1].onclick = Ui2.menu;
      // стадия-пилюля → журнал прогресса/требований
      const pill = document.querySelector('#statusbar .stage-pill'); if (pill) { pill.style.cursor = 'pointer'; pill.onclick = Ui2.journal; }
      // зона проектов: «+ Новый проект» → скаутинг, «Все проекты» → рынок-вкладка не нужна
      document.querySelectorAll('#projects-zone .zone-acts .btn-sm').forEach(b => {
        if (/Новый/.test(b.textContent)) b.onclick = () => Ui2.scout();
      });
    });
    // подписка на ререндер движка
    _safe(() => { if (typeof EventBus !== 'undefined') EventBus.on('render', renderV2); });
    renderV2();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 60));
  else setTimeout(boot, 60);
})();
