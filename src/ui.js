// ══════════════════════════════════════════════════════
//  UI — рендер, скаутинг-модал, события, дашборд
//  Зависит от: events.js (EventBus), constants.js, scenarios/{id}.js, engine.js
//
//  Godot-совместимая архитектура:
//    UI не вызывается из engine напрямую.
//    Engine emit-ит сигналы → UI подписывается и рендерит.
//    При переносе: заменить EventBus.on → connect("signal", ...)
// ══════════════════════════════════════════════════════

// Scenario bindings объявлены в engine.js (загружается раньше).
// ui.js использует те же алиасы: STAFF_DEFS, PROJECT_POOL, UPGRADES, SPECS и др.

// ── Accordion state — переживает renderGame(), сбрасывается при перезагрузке ─
const _acc = {
  upg_quality:  false,  // Качество — закрыт
  upg_speed:    false,  // Скорость — закрыт
  upg_recovery: false,  // Восстановление — закрыт
  hire:         true,   // Найм — открыт
  metrics:      true,   // Метрики — открыты
};

function toggleAcc(key) {
  _acc[key] = !_acc[key];
  const body  = document.getElementById('acc-' + key);
  const arrow = document.getElementById('acc-arrow-' + key);
  if (body)  body.style.display  = _acc[key] ? 'block' : 'none';
  if (arrow) arrow.textContent   = _acc[key] ? '▾' : '▸';
}

// Тултип метрики — показывается по клику на "?"
function toggleMetricTip(id) {
  const el = document.getElementById('mtip-' + id);
  if (!el) return;
  const isOpen = el.style.display !== 'none';
  // Закрыть все открытые тултипы метрик
  document.querySelectorAll('[id^="mtip-"]').forEach(t => { t.style.display = 'none'; });
  if (!isOpen) el.style.display = 'block';
}

// ── DOM-реализации сигналов (Godot: обработчики connect) ─
// В Godot эти функции становятся методами UI-нода, подключёнными через connect()

function _uiNotify(msg, type = 'info') {
  const el = document.getElementById('notif');
  if (!el) return;
  el.textContent = msg;
  el.className = 'notif show ' + type;
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 3000);
}

function _uiNavigate(screen) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(screen);
  if (el) el.classList.add('active');
  window.scrollTo(0, 0);
}

function _uiSelectSpec(id) {
  document.querySelectorAll('.spec-card').forEach(c => c.classList.remove('selected'));
  const card = document.getElementById('spec-' + id);
  if (card) card.classList.add('selected');
  const btn = document.getElementById('btn-start-game');
  if (btn) btn.disabled = false;
}

function _uiShowScout(offers) {
  const modal = document.getElementById('scout-modal');
  document.getElementById('scout-title').textContent =
    offers.length ? `Найдено проектов: ${offers.length}` : 'Скаутинг не дал результатов';
  document.getElementById('scout-sub').textContent =
    offers.length
      ? 'Можно взять несколько. Пул сохраняется — закрой, докупи перки и вернись.'
      : 'На рынке тишина. Попробуй снова в следующем месяце или улучши репутацию.';
  // Рендер карточек скаутинга делегируем legacy-функции из engine (временно)
  // В Godot: заменить на GDScript-метод, строящий карточки из offers[]
  _legacyShowScout(offers);
}

function _uiCloseScout() {
  document.getElementById('scout-modal').classList.remove('active');
}

function _uiShowConfirm(icon, title, body, confirmText, confirmClass, onConfirm) {
  document.getElementById('modal-icon').textContent  = icon;
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').textContent  = body;
  const div = document.getElementById('modal-choices');
  div.innerHTML = '';

  const borderMap = { red:'rgba(248,81,73,.4)', amber:'rgba(210,153,34,.4)', teal:'rgba(45,212,191,.4)', green:'rgba(74,222,128,.4)' };
  const btnOk = document.createElement('button');
  btnOk.className = 'modal-choice';
  btnOk.style.borderColor = borderMap[confirmClass] || borderMap.amber;
  btnOk.innerHTML = `<div class="choice-title" style="color:var(--${confirmClass})">${confirmText}</div>`;
  btnOk.onclick = () => { document.getElementById('event-modal').classList.remove('active'); onConfirm(); };

  const btnCancel = document.createElement('button');
  btnCancel.className = 'modal-choice';
  btnCancel.innerHTML = `<div class="choice-title">Отмена</div><div class="choice-desc">Ничего не менять</div>`;
  btnCancel.onclick = () => document.getElementById('event-modal').classList.remove('active');

  div.appendChild(btnOk);
  div.appendChild(btnCancel);
  document.getElementById('event-modal').classList.add('active');
}

function _uiFocusChanged({ cid, pct, totalPct, isOver, preview, focusableIds }) {
  const rangeEl = document.getElementById('focus-range-' + cid);
  const valEl   = document.getElementById('focus-val-'   + cid);
  const prevEl  = document.getElementById('focus-prev-'  + cid);
  if (rangeEl) { rangeEl.value = pct; rangeEl.style.setProperty('--fill', pct + '%'); }
  if (valEl)   valEl.value = pct;

  const warnEl = document.getElementById('focus-total-warn');
  const resEl  = document.getElementById('focus-reserve');
  if (warnEl) {
    warnEl.style.display = isOver ? 'flex' : 'none';
    if (isOver) { const sp = warnEl.querySelector('span'); if (sp) sp.textContent = `⚠ Суммарный фокус: ${totalPct}% — освободи ${totalPct - 100}% у других проектов`; }
  }
  if (resEl) {
    resEl.style.display = isOver ? 'none' : 'flex';
    if (!isOver) { const sp = resEl.querySelector('span'); if (sp) sp.textContent = `✦ Резерв: ${100 - totalPct}%`; }
  }
  (focusableIds || []).forEach(fid => {
    const rowEl = document.getElementById('focus-row-' + fid);
    if (rowEl) rowEl.style.borderColor = isOver ? 'rgba(248,81,73,.3)' : 'transparent';
  });
  if (prevEl) {
    prevEl.style.color = pct >= 60 ? 'var(--green)' : pct >= 30 ? 'var(--teal)' : 'var(--amber)';
    prevEl.textContent = `+${preview.perMonth}%/мес · ~${preview.mthsLeft} мес. до завершения`;
  }
}

// ── EventBus → DOM биндинги (Godot: вызовы connect в _ready) ─
function initEventBus() {
  EventBus.on('notify',       ({ msg, type })                              => _uiNotify(msg, type));
  EventBus.on('navigate',     ({ screen })                                 => _uiNavigate(screen));
  EventBus.on('render',       ()                                           => renderGame());
  EventBus.on('show_event',   ({ ev })                                     => showEvent(ev));
  EventBus.on('end_game',     ({ won })                                    => endGame(won));
  EventBus.on('spec_selected',({ id })                                     => _uiSelectSpec(id));
  EventBus.on('show_scout',   ({ offers })                                 => _uiShowScout(offers));
  EventBus.on('close_scout',  ()                                           => _uiCloseScout());
  EventBus.on('show_confirm', ({ icon, title, body, confirmText, confirmClass, onConfirm }) =>
    _uiShowConfirm(icon, title, body, confirmText, confirmClass, onConfirm));
  EventBus.on('focus_changed', data => _uiFocusChanged(data));
}
// ══════════════════════════════════════════════════════
//  CAPABILITY BAR HELPER  (Q / V visual meter)
// ══════════════════════════════════════════════════════
// thresholds: [{val, label}]  — vertical marker lines
// col: CSS color for the fill
// hint: shown in amber below bar when current val is 0
function makeCapBar(cur, maxV, thresholds, col, hint) {
  const pct = Math.min(100, cur / maxV * 100);
  const marks = thresholds.map(t => {
    const x = Math.min(99, t.val / maxV * 100);
    const reached = cur >= t.val;
    return `<div style="position:absolute;left:${x}%;top:0;transform:translateX(-50%);text-align:center;pointer-events:none">
      <div style="width:1px;height:8px;background:${reached ? col : 'var(--border)'};margin:0 auto"></div>
      <div style="font-size:9px;color:${reached ? col : 'var(--muted)'};white-space:nowrap;margin-top:1px">${t.label}</div>
    </div>`;
  }).join('');
  return `
    <div style="position:relative;height:5px;background:var(--bg3);border-radius:3px;margin-bottom:2px">
      <div style="height:100%;width:${pct}%;background:${col};border-radius:3px;transition:width .4s"></div>
    </div>
    <div style="position:relative;height:22px">${marks}</div>
    ${cur === 0 && hint ? `<div style="font-size:10px;color:var(--amber);margin-top:-2px;margin-bottom:4px">↑ ${hint}</div>` : ''}`;
}

// ══════════════════════════════════════════════════════
//  RENDER GAME
// ══════════════════════════════════════════════════════
function renderGame() {
  const spec=SPECS[G.spec];
  document.getElementById('g-spec-name').textContent=spec.name;
  document.getElementById('g-month').textContent=monthLabel();

  // Money
  const mEl=document.getElementById('g-money');
  mEl.textContent=fmt(G.money);
  mEl.className='v '+(G.money>100000?'green':G.money>0?'amber':'red');

  // Cashflow
  const cf=getCashflow();
  const cfEl=document.getElementById('g-cashflow');
  cfEl.textContent=(cf>=0?'+':'')+fmt(cf);
  cfEl.className='v '+(cf>=0?'green':'red');

  // Reputation
  const repEl=document.getElementById('g-rep');
  repEl.textContent=Math.round(G.reputation);
  repEl.className='v '+(G.reputation>=70?'teal':G.reputation>=40?'amber':'red');

  // Portfolio
  document.getElementById('g-portfolio').textContent=G.portfolio||0;

  // Actions pips
  const pipsDiv=document.getElementById('g-action-pips');
  pipsDiv.innerHTML='';
  for (let i=0;i<ACTIONS_PER_MONTH;i++){
    const d=document.createElement('div');
    d.className='pip'+(i>=G.actions?' used':'');
    pipsDiv.appendChild(d);
  }
  document.getElementById('g-action-val').textContent=`${G.actions} / ${ACTIONS_PER_MONTH}`;
  const hasPool=G.scoutPool && G.scoutPool.length>0;
  const scoutBtn=document.getElementById('btn-scout');
  scoutBtn.disabled=!hasPool && G.actions<SCOUT_COST;
  scoutBtn.innerHTML=hasPool
    ? `📋 Открыть пул <span style="color:rgba(255,255,255,.6);font-size:11px">${G.scoutPool.length} ${G.scoutPool.length===1?'проект':'проекта'}</span>`
    : `🔍 Скаутинг проектов <span style="color:rgba(255,255,255,.5);font-size:11px">−3 дня</span>`;

  // ── Active clients ──
  document.getElementById('g-client-count').textContent=G.activeClients.length+'/'+getCapacity();
  let chtml='';

  if (G.activeClients.length===0){
    chtml=`<div style="text-align:center;padding:18px 0;color:var(--sub);">
      <div style="font-size:26px;margin-bottom:6px">🔍</div>
      <div style="font-weight:600;color:var(--text);margin-bottom:4px">Нет активных проектов</div>
      <div style="font-size:11px">Используй Скаутинг в боковой панели</div>
    </div>`;
  }

  const focusable    = G.activeClients.filter(c => !c.oneTime);
  const totalFocusW  = focusable.reduce((s,c) => s + (c._focus??50), 0);
  const totalFocusPct= focusable.reduce((s,c) => s + (c._focus??50), 0); // raw сумма %
  const showFocus    = focusable.length >= 2;
  const focusIsOver  = showFocus && totalFocusPct > 100;
  const focusReserve = 100 - totalFocusPct;

  // Баннер суммарного фокуса (показывается над карточками)
  if (showFocus) {
    chtml += focusIsOver
      ? `<div id="focus-total-warn" style="display:flex;align-items:center;gap:6px;background:rgba(248,81,73,.1);border:1px solid rgba(248,81,73,.3);border-radius:7px;padding:6px 10px;margin-bottom:8px">
          <span style="font-size:18px;line-height:1">⚠️</span>
          <span style="font-size:11px;color:var(--red);font-weight:600">Суммарный фокус: ${totalFocusPct}% — освободи ${totalFocusPct - 100}% у других проектов</span>
         </div>
         <div id="focus-reserve" style="display:none"></div>`
      : `<div id="focus-total-warn" style="display:none"></div>
         <div id="focus-reserve" style="display:flex;align-items:center;gap:6px;background:rgba(45,212,191,.07);border:1px solid rgba(45,212,191,.2);border-radius:7px;padding:5px 10px;margin-bottom:8px">
          <span style="font-size:11px;color:var(--teal)">✦ Резерв фокуса: <strong>${focusReserve}%</strong></span>
         </div>`;
  }

  G.activeClients.forEach(c=>{
    const nps       = Math.round(G.clientNPS[c.id]??c.npsStart??70);
    const nc        = npsColor(nps);
    const warn      = nps<25?'critical':nps<45?'at-risk':'';
    const ml        = c.modifier?.label||'';
    const mb        = c.modBadge||'mb-teal';
    const affordable= G.money>=20000;

    // Прогресс проекта
    const progress  = Math.round(c._progress||0);
    const progColor = progress>=100?'var(--green)':progress>=60?'var(--teal)':'var(--amber)';

    // Дедлайн-бейдж
    let deadlineBadge='';
    if (!c.oneTime && c._duration) {
      const mo=c._monthsSigned||0, dur=c._duration, overdue=mo>dur;
      const penPct=overdue?Math.min(40,Math.round((mo-dur)*10)):0;
      if (overdue) {
        deadlineBadge=`<span class="tag red" style="font-size:10px;">⏰ +${mo-dur} мес.${penPct?` (−${penPct}%)`:''}</span>`;
      } else {
        const col=mo>=dur?'var(--green)':mo>=(dur-1)?'var(--amber)':'var(--teal)';
        deadlineBadge=`<span style="font-size:10px;color:${col};font-weight:600;">📅 ${mo}/${dur} мес.</span>`;
      }
    }

    // Ожидание старта (payment_delay_fixed)
    const isWaiting = c.modifier?.type==='payment_delay_fixed' && (c._monthsSigned||0)<=c.modifier.val;
    const waitMos   = isWaiting ? c.modifier.val-(c._monthsSigned||0) : 0;

    // Бюджет (П.9: показываем portfolio-бонус чтобы игрок видел эффект мультипликатора)
    const budget    = c._totalBudget||0;
    const pfM       = getPortfolioMultiplier();
    const pfBoostPct= Math.round((pfM - 1) * 100);
    const budgetStr = c.oneTime
      ? `${fmtK(budget)}<small> разово</small>`
      : isWaiting
        ? `<span style="color:var(--muted);font-size:12px">${fmtK(budget)}</span><small style="color:var(--amber)"> старт через ${waitMos} мес.</small>`
        : (() => {
            const origStr = (c._originalBudget && c._originalBudget !== budget && (c._milestonesPaid||[]).length > 0)
              ? `<div style="font-size:9px;color:var(--sub);text-decoration:line-through">${fmtK(c._originalBudget)} полный</div>` : '';
            const pfStr = pfBoostPct > 0 ? `<div style="font-size:9px;color:var(--purple);font-weight:600;margin-top:1px">+${pfBoostPct}% портфолио</div>` : '';
            return `${origStr}${fmtK(budget)}<small> при сдаче</small>${pfStr}`;
          })();

    // Кнопка «Завершить» — только при progress === 100
    const canComplete = !c.oneTime && progress >= 100;

    // Milestone-маркеры и инфо
    const hasMilestones = (c._milestones||[]).length > 0;
    const milestoneMarkers = hasMilestones
      ? (c._milestones).map((thr, idx) => {
          const paid = (c._milestonesPaid||[]).includes(idx);
          const col  = paid ? 'var(--green)' : 'var(--amber)';
          const amt  = Math.round((c._originalBudget||c._totalBudget) * (c._milestonePcts||[])[idx] / 5000) * 5000;
          return `<div style="position:absolute;left:${thr}%;top:-2px;width:2px;height:8px;background:${col};border-radius:1px" title="${paid?'✅':'⏳'} Milestone ${thr}%: ${fmtK(amt)}"></div>`;
        }).join('')
      : '';
    const milestoneSummary = hasMilestones ? (()=>{
      const totalPaid = (c._milestonesPaid||[]).reduce((s, idx) => {
        return s + Math.round((c._originalBudget||0) * (c._milestonePcts||[])[idx] / 5000) * 5000;
      }, 0);
      const next = (c._milestones).find((thr, idx) => !(c._milestonesPaid||[]).includes(idx));
      if (totalPaid > 0) {
        return `<div style="font-size:9px;color:var(--green);margin-top:2px">💵 Получено milestone: +${fmtK(totalPaid)}</div>`;
      } else if (next != null) {
        const nextAmt = Math.round((c._originalBudget||0) * (c._milestonePcts||[])[0] / 5000) * 5000;
        return `<div style="font-size:9px;color:var(--amber);margin-top:2px">⏳ Milestone при ${next}%: +${fmtK(nextAmt)}</div>`;
      }
      return '';
    })() : '';

    // Прогресс-бар (не для разовых)
    const progressBar = !c.oneTime ? `
      <div style="margin-top:6px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px">
          <span style="font-size:10px;color:var(--sub)">Прогресс</span>
          <span style="font-size:10px;font-weight:700;color:${progColor}">${progress}%</span>
        </div>
        <div style="position:relative;height:4px;background:var(--bg3);border-radius:2px;overflow:visible">
          <div style="height:100%;width:${progress}%;background:${progColor};border-radius:2px;transition:width .4s"></div>
          ${milestoneMarkers}
        </div>
        ${milestoneSummary}
      </div>` : '';

    // Контролы фокуса (показываем только когда 2+ активных не-разовых проекта)
    const myFocus = c._focus != null ? c._focus : Math.floor(100 / Math.max(1, focusable.length));
    const focusBar = (!c.oneTime && showFocus) ? (()=>{
      // Превью прогресса при текущем фокусе (фикс п.22: нормируем через 100)
      const thr      = getTeamThroughput();
      const totLoad  = getTotalLoad();
      // Эффективная нагрузка = полная нагрузка × доля реально использованного фокуса
      const _activeFocusPct = focusable.length > 0 ? Math.min(1, totalFocusW / 100) : 1;
      const _effectiveLoad  = totLoad * _activeFocusPct;
      const lratio   = _effectiveLoad > 0 ? Math.min(1, thr / _effectiveLoad) : 1;
      // focusMult = доля фокуса конкретного проекта от 100% (не от суммы выставленных)
      const fMult    = myFocus / 100;
      // П.10: учитываем fatigueMult; П.13: целочисленный результат (без десятых)
      const _fatigueMult = getFatigueMult();
      const basePerMonth = Math.round((100 / (c._duration||3)) * lratio * fMult);
      const perMonth     = Math.round(basePerMonth * _fatigueMult);
      const remain       = Math.max(0, 100 - (c._progress||0));
      const mthsLeft     = perMonth > 0 ? Math.ceil(remain / perMonth) : 99;
      // П.16: конкретный дельта усталости (если есть)
      const fatigueDelta  = basePerMonth - perMonth;
      const fatigueLabel  = fatigueDelta > 0 ? ` <span style="color:var(--red);font-size:9px">(Усталость: −${fatigueDelta}%)</span>` : '';
      const previewColor  = myFocus >= 60 ? 'var(--green)' : myFocus >= 30 ? 'var(--teal)' : 'var(--amber)';
      const rowBorder = focusIsOver ? 'rgba(248,81,73,.3)' : 'transparent';
      return `
      <div id="focus-row-${c.id}" style="margin-top:7px;border:1px solid ${rowBorder};border-radius:6px;padding:${focusIsOver?'6px 7px':'0'};transition:border-color .2s,padding .2s">
        <!-- Ряд 1: слайдер + ввод % + пресет -->
        <div style="display:flex;align-items:center;gap:5px;margin-bottom:4px">
          <span style="font-size:10px;color:var(--sub);flex-shrink:0">Фокус</span>
          <input type="range" min="0" max="100" value="${myFocus}"
            id="focus-range-${c.id}" class="focus-range" style="--fill:${myFocus}%"
            oninput="liveUpdateFocus('${c.id}',this.value)"
            onchange="renderGame()">
          <input type="number" min="0" max="100" step="1" value="${myFocus}"
            id="focus-val-${c.id}" class="focus-val"
            onchange="setFocus('${c.id}',this.value)"
            onclick="this.select()">
          <span style="font-size:10px;color:var(--sub);flex-shrink:0">%</span>
          <select class="focus-preset" onchange="setFocus('${c.id}',this.value)">
            <option value="" disabled selected>···</option>
            <option value="0">0%</option>
            <option value="20">20%</option>
            <option value="40">40%</option>
            <option value="60">60%</option>
            <option value="80">80%</option>
            <option value="100">100%</option>
          </select>
        </div>
        <!-- Ряд 2: кнопки ±1/±10 + превью -->
        <div style="display:flex;align-items:center;gap:3px">
          <button class="btn btn-xs btn-ghost" style="padding:1px 5px;font-size:10px;letter-spacing:-.5px" onclick="adjustFocusBy('${c.id}',-10)">−10</button>
          <button class="btn btn-xs btn-ghost" style="padding:1px 5px;font-size:10px" onclick="adjustFocusBy('${c.id}',-1)">−1</button>
          <span style="flex:1;text-align:center;font-size:10px;color:${previewColor}" id="focus-prev-${c.id}">+${perMonth}%/мес${fatigueLabel} · ~${mthsLeft} мес. до завершения</span>
          <button class="btn btn-xs btn-ghost" style="padding:1px 5px;font-size:10px" onclick="adjustFocusBy('${c.id}',+1)">+1</button>
          <button class="btn btn-xs btn-ghost" style="padding:1px 5px;font-size:10px;letter-spacing:-.5px" onclick="adjustFocusBy('${c.id}',+10)">+10</button>
        </div>
      </div>`;
    })() : '';

    chtml+=`<div class="client-card ${warn}">
      <div class="client-row1">
        <div class="client-icon">${c.icon}</div>
        <div class="client-info">
          <div class="client-name">
            ${c.name}
            ${warn==='critical'?'<span class="tag red" style="font-size:10px;">⚠ Уходит</span>':
              warn==='at-risk'?'<span class="tag amber" style="font-size:10px;">Недоволен</span>':''}
            ${c.oneTime?'<span class="tag purple" style="font-size:10px;">Разовый</span>':''}
            ${deadlineBadge}
          </div>
          <div class="client-desc">
            <span class="modifier-badge ${mb}" style="font-size:10px;padding:2px 6px">${ml}</span>
          </div>
          ${progressBar}
          ${focusBar}
        </div>
        <div class="client-rev">
          ${budgetStr}
          ${c._prepaidAmount ? `
            <div style="font-size:10px;color:var(--green);margin-top:3px;white-space:nowrap;font-weight:600">💰 ${fmtK(c._prepaidAmount)}</div>
            <div style="font-size:9px;color:var(--muted);white-space:nowrap">получено авансом</div>` : ''}
        </div>
      </div>
      <div class="nps-row">
        <span class="nps-label">NPS</span>
        <div class="nps-wrap"><div class="nps-fill" style="width:${nps}%;background:${nc}"></div></div>
        <span class="nps-val" style="color:${nc}">${nps}</span>
        <span class="nps-btn" style="display:flex;gap:5px;align-items:center;flex-wrap:wrap;">
          ${canComplete?`<button class="btn btn-xs" style="background:rgba(45,212,191,.12);color:var(--teal);border:1px solid rgba(45,212,191,.3);padding:4px 8px;font-size:10px;border-radius:5px;font-weight:600;cursor:pointer" onclick="completeProject('${c.id}')" title="Проект выполнен — получить оплату">🏁 Завершить</button>`:''}
          <button class="btn btn-xs btn-ghost" onclick="investInClient('${c.id}')" ${!affordable?'disabled':''} title="−20 000₽ → NPS +25">💬 −20К</button>
          <button class="btn btn-xs" style="background:rgba(248,81,73,.1);color:var(--red);border:1px solid rgba(248,81,73,.25);padding:4px 8px;font-size:10px;border-radius:5px;font-weight:600;cursor:pointer" onclick="terminateContract('${c.id}')" title="Досрочное расторжение (−10 реп.)">✕</button>
        </span>
      </div>
    </div>`;
  });

  document.getElementById('g-clients-list').innerHTML=chtml;

  // П.8 — блокировка «Завершить месяц» при суммарном фокусе >100%
  const advBtn = document.getElementById('btn-advance');
  if (advBtn) {
    advBtn.disabled = focusIsOver;
    advBtn.title = focusIsOver ? 'Суммарный фокус превышает 100% — скорректируй распределение' : '';
  }

  // ── P&L ──
  const staffCost = getTotalStaffCost();
  const loanCost  = G.loan ? G.loan.monthlyPayment : 0;
  const burnRate  = staffCost + OVERHEAD + loanCost;
  const pipeline  = G.activeClients.filter(c=>!c.oneTime).reduce((s,c)=>s+(c._totalBudget||0),0);
  const oneTimeV  = G.activeClients.filter(c=>c.oneTime).reduce((s,c)=>s+(c._totalBudget||0),0);

  document.getElementById('g-pnl').innerHTML=`
    ${pipeline>0?`<div class="pnl-row"><span style="color:var(--sub)">Пайплайн проектов</span><span style="color:var(--teal);font-weight:700">${fmtK(pipeline)}</span></div>`:''}
    ${oneTimeV>0?`<div class="pnl-row"><span style="color:var(--purple)">Разовые заказы</span><span style="color:var(--purple)">${fmtK(oneTimeV)}</span></div>`:''}
    ${G.delayedIncome>0?`<div class="pnl-row"><span style="color:var(--amber)">🕐 В пути (задержано)</span><span style="color:var(--amber)">+${fmt(G.delayedIncome)}</span></div>`:''}
    ${(pipeline>0||oneTimeV>0)?'<div class="divider"></div>':''}
    <div class="pnl-row"><span>Зарплаты</span><span class="neg">−${fmt(staffCost)}</span></div>
    <div class="pnl-row"><span>Overhead</span><span class="neg">−${fmt(OVERHEAD)}</span></div>
    ${G.loan ? `<div class="pnl-row">
        <span style="color:var(--amber)">🏦 Кредит «${G.loan.label}»</span>
        <span style="color:var(--amber);font-weight:600">−${fmt(G.loan.monthlyPayment)}</span>
      </div>
      <div style="font-size:10px;color:var(--muted);margin-bottom:3px;padding-left:2px">ещё ${G.loan.monthsRemaining} мес. · остаток долга ${fmtK(G.loan.monthlyPayment * G.loan.monthsRemaining)}</div>` : ''}
    <div class="divider"></div>
    <div class="pnl-row total"><span>Расход/мес</span><span class="neg">−${fmt(burnRate)}</span></div>
    <div style="font-size:10px;color:var(--muted);margin-top:5px">Выручка — при завершении проектов</div>
    ${(()=>{
      if (!G.loan) {
        const loanTier = getLoanTier(G.reputation);
        if (loanTier) {
          return `<div class="divider" style="margin:8px 0"></div>
            <div style="display:flex;align-items:center;justify-content:space-between;gap:6px">
              <div>
                <div style="font-size:11px;color:var(--sub)">🏦 Кредитная линия</div>
                <div style="font-size:10px;color:var(--muted);margin-top:2px">${fmtK(loanTier.principal)} · ${fmtK(loanTier.monthlyPayment)}/мес × ${loanTier.months} мес. (${loanTier.label})</div>
              </div>
              <button class="btn btn-sm btn-ghost" style="font-size:10px;padding:4px 10px;flex-shrink:0;white-space:nowrap" onclick="takeLoan()">Взять кредит</button>
            </div>`;
        }
      }
      return '';
    })()}`;

  const pct=Math.min(100,Math.round(G.money/3000000*100));
  document.getElementById('g-progress-pct').textContent=pct+'%';
  const bar=document.getElementById('g-progress-bar');
  bar.style.width=pct+'%';
  bar.className='progress-fill '+(pct>=80?'green':pct>=40?'amber':'');

  // ── Team ──
  let thtml=`<div class="staff-item">
    <div class="staff-avatar" style="background:rgba(79,110,247,.2)">👤</div>
    <div class="staff-info"><div class="staff-name">Ты (Фаундер)</div><div class="staff-role">Продажи + Скаутинг</div></div>
    <div class="staff-cost" style="color:var(--sub)">бесплатно</div>
  </div>`;
  G.staff.forEach(s=>{
    const iid=s._iid||s.id; // fallback для старых объектов
    thtml+=`<div class="staff-item">
      <div class="staff-avatar" style="background:rgba(79,110,247,.15)">${s.icon}</div>
      <div class="staff-info"><div class="staff-name">${s.name}</div><div class="staff-role">${s.role}</div></div>
      <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
        <div class="staff-cost">−${fmt(s.cost)}</div>
        <button class="btn btn-xs" style="background:rgba(248,81,73,.08);color:var(--red);border:1px solid rgba(248,81,73,.2);font-size:10px;padding:3px 7px;border-radius:5px;font-weight:600;cursor:pointer" onclick="fireStaff('${iid}')" title="Выходное пособие: ${fmt(Math.round(s.cost*0.5))}">Уволить</button>
      </div>
    </div>`;
  });
  document.getElementById('g-team-list').innerHTML=thtml;

  // ── Hire — сгруппировано по роли, коллапсируемые секции ──
  const dayCostHire=hasRole('hr') ? 1 : HIRE_COST;
  let hhtml='';
  STAFF_ROLES.forEach(role=>{
    const rl = ROLE_LABELS[role];
    const grades = STAFF_DEFS.filter(d=>d.role===role);
    const totalInTeam = countRole(role);
    const roleBadge = totalInTeam > 0
      ? `<span style="font-size:10px;background:rgba(79,110,247,.18);color:var(--accent2);border-radius:4px;padding:1px 6px;margin-left:6px">×${totalInTeam}</span>`
      : '';
    hhtml += `<div style="margin-bottom:6px;border:1px solid rgba(255,255,255,.06);border-radius:8px;overflow:hidden">
      <button onclick="(function(el){var b=el.nextElementSibling;b.style.display=b.style.display==='none'?'block':'none';})(this)"
        style="width:100%;background:rgba(255,255,255,.03);border:none;color:var(--fg);padding:8px 10px;display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;font-weight:600;text-align:left">
        <span>${rl.icon}</span><span>${rl.name}</span>${roleBadge}
        <span style="margin-left:auto;font-size:10px;color:var(--muted)">▾</span>
      </button>
      <div style="display:none;padding:4px 6px 6px">`;

    grades.forEach(def=>{
      const gradeColor = def.grade==='sr'?'var(--purple)':def.grade==='jr'?'var(--muted)':'var(--sub)';
      const locked = def.unlockCond && (
        (def.unlockCond.minRep       && G.reputation    < def.unlockCond.minRep) ||
        (def.unlockCond.minPortfolio && (G.portfolio||0) < def.unlockCond.minPortfolio)
      );
      const ok = !locked && G.money >= def.cost*2 && G.actions >= dayCostHire;
      const alreadyCount = G.staff.filter(s=>s.id===def.id).length;

      const bonuses=[];
      if (def.quality)    bonuses.push(`Q +${def.quality}`);
      if (def.volume)     bonuses.push(`V +${def.volume}`);
      if (def.capacity)   bonuses.push(`+${def.capacity} слот`);
      if (def.throughput) bonuses.push(`Произв. +${def.throughput}`);
      if (def.speedBonus) bonuses.push(`<span style="color:var(--green)">Speed +${Math.round(def.speedBonus*100)}%</span>`);
      if (role==='lawyer')    bonuses.push(`<span style="color:var(--amber);font-size:10px">риски −${def.grade==='sr'?70:def.grade==='jr'?30:50}%</span>`);
      if (role==='smm')       bonuses.push(`<span style="color:var(--teal);font-size:10px">+1 лид/скаут</span>`);
      if (role==='hr')        bonuses.push(`<span style="color:var(--teal);font-size:10px">NPS +${def.grade==='sr'?4:def.grade==='jr'?2:3}/мес · найм 1 дн</span>`);
      if (role==='developer') bonuses.push(`<span style="color:var(--accent2);font-size:10px">тех-проекты</span>`);

      let lockHint = '';
      if (def.unlockCond?.minRep)       lockHint = `🔒 Реп ≥${def.unlockCond.minRep} (сейчас ${Math.round(G.reputation)})`;
      if (def.unlockCond?.minPortfolio) lockHint = `🔒 Портфолио ≥${def.unlockCond.minPortfolio}`;

      const countBadge = alreadyCount > 0
        ? `<span style="font-size:10px;background:rgba(79,110,247,.18);color:var(--accent2);border-radius:4px;padding:1px 5px;margin-right:4px">×${alreadyCount}</span>`
        : '';

      hhtml += `<div class="hire-item" style="${locked?'opacity:.55':''}">
        <div style="width:6px;border-radius:3px;background:${gradeColor};align-self:stretch;margin-right:4px;flex-shrink:0"></div>
        <div class="hire-info">
          <div class="hire-name" style="font-size:12px">${countBadge}${def.name}
            <span style="font-size:10px;color:${gradeColor};font-weight:700;margin-left:4px">${def.gradeLabel}</span>
          </div>
          <div class="hire-desc" style="font-size:10px">${bonuses.join(' · ')}${locked?` · <span style="color:var(--red)">${lockHint}</span>`:''}</div>
        </div>
        <div style="display:flex;align-items:center;gap:5px;flex-shrink:0;margin-left:auto">
          <div class="hire-cost" style="font-size:11px">−${fmt(def.cost)}/мес</div>
          <button class="btn btn-sm btn-primary" onclick="hireStaff('${def.id}')" ${!ok?'disabled':''}>${alreadyCount>0?'Ещё':'Нанять'}</button>
        </div>
      </div>`;
    });
    hhtml += `</div></div>`;
  });
  document.getElementById('g-hire-list').innerHTML=hhtml;

  // Синхронизируем видимость секции найма с _acc.hire
  { const el = document.getElementById('acc-hire'); if (el) el.style.display = _acc.hire ? 'block' : 'none'; }
  { const el = document.getElementById('acc-arrow-hire'); if (el) el.textContent = _acc.hire ? '▾' : '▸'; }

  // Синхронизируем видимость блока метрик с _acc.metrics
  { const el = document.getElementById('acc-metrics'); if (el) el.style.display = _acc.metrics ? 'block' : 'none'; }
  { const el = document.getElementById('acc-arrow-metrics'); if (el) el.textContent = _acc.metrics ? '▾' : '▸'; }

  // ── Upgrades — аккордеон по категориям ──
  const upgradeGroups = [
    { key: 'upg_quality',  label: '🎯 Качество',       ids: ['tools_q','training_q','consultant_q','freelance_q'] },
    { key: 'upg_speed',    label: '⚡ Скорость',        ids: ['agile','scrum','automation'] },
    { key: 'upg_recovery', label: '😴 Восстановление',  ids: ['paid_leave','teambuilding','corp_vacation'] },
  ];

  const renderUpgradeItem = u => {
    const bought      = u.oneTime && G.upgrades[u.id];
    const tempActive  = !u.oneTime && !u.fatigueReduce && G.tempQBonus >= u.qBonus;
    const fatigueCd   = u.fatigueReduce ? ((G.fatigueActionCooldowns||{})[u.id] || 0) : 0;
    const onCooldown  = fatigueCd > 0;
    const ftGate      = u.minFatigue && (G.teamFatigue||0) < u.minFatigue;
    const canAfford   = G.money >= u.cost && G.actions >= u.days;
    const disabled    = bought || tempActive || onCooldown || ftGate || !canAfford;

    let statusBadge='';
    if (bought) {
      const bl = u.speedBonus ? `Speed +${Math.round(u.speedBonus*100)}%` : `+${u.qBonus}Q`;
      statusBadge=`<span style="font-size:10px;color:var(--green);font-weight:700;white-space:nowrap">✓ ${bl}</span>`;
    } else if (tempActive) {
      statusBadge=`<span style="font-size:10px;color:var(--teal);font-weight:700;white-space:nowrap">↻ активен</span>`;
    } else if (onCooldown) {
      statusBadge=`<span style="font-size:10px;color:var(--muted);font-weight:700;white-space:nowrap">⏳ через ${fatigueCd} мес.</span>`;
    }

    const costLabel=`−${fmtK(u.cost)} · −${u.days}дн`;
    const btnLabel = bought ? 'Куплено' : tempActive ? 'Активен' : onCooldown ? `${fatigueCd} мес.`
      : ftGate ? `≥${u.minFatigue} уст.` : u.oneTime ? 'Купить' : 'Провести';

    const effectBadge = u.fatigueReduce
      ? `<span style="background:rgba(63,185,80,.12);color:var(--green);border-radius:4px;padding:1px 6px;font-size:10px;font-weight:700;white-space:nowrap">😴 −${u.fatigueReduce}</span>`
      : u.speedBonus
        ? `<span style="background:rgba(63,185,80,.12);color:var(--green);border-radius:4px;padding:1px 6px;font-size:10px;font-weight:700;white-space:nowrap">⚡ +${Math.round(u.speedBonus*100)}%</span>`
        : `<span style="background:rgba(45,212,191,.15);color:var(--teal);border-radius:4px;padding:1px 6px;font-size:10px;font-weight:700;white-space:nowrap">Q +${u.qBonus}</span>`;

    const cdNote = u.fatigueReduce && u.cooldownMonths
      ? `<span style="color:var(--muted);font-size:10px">· кд ${u.cooldownMonths} мес.</span>` : '';
    const ftGateNote = u.minFatigue
      ? `<span style="color:var(--amber);font-size:10px">· при уст. ≥${u.minFatigue}</span>` : '';

    return `<div class="hire-item" style="${bought||tempActive?'opacity:.7':''}">
      <div class="hire-icon">${u.icon}</div>
      <div class="hire-info">
        <div class="hire-name" style="display:flex;align-items:center;gap:6px">${u.name} ${statusBadge}</div>
        <div class="hire-desc" style="display:flex;align-items:center;gap:5px;flex-wrap:wrap">
          <span>${u.desc}</span>
          ${effectBadge}
          ${u.repBonus?`<span style="background:rgba(79,110,247,.15);color:var(--accent2);border-radius:4px;padding:1px 6px;font-size:10px;font-weight:700;white-space:nowrap">Реп +${u.repBonus}</span>`:''}
          ${cdNote}${ftGateNote}
          ${!u.oneTime && !u.fatigueReduce?'<span style="color:var(--amber);font-size:10px">· до конца мес.</span>':''}
        </div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:3px;flex-shrink:0">
        <div class="hire-cost" style="font-size:10px">${costLabel}</div>
        <button class="btn btn-sm ${bought||tempActive||onCooldown||ftGate?'btn-ghost':'btn-teal'}" onclick="buyUpgrade('${u.id}')" ${disabled?'disabled':''}
          style="font-size:11px;padding:5px 10px">${btnLabel}</button>
      </div>
    </div>`;
  };

  let uhtml = upgradeGroups.map(grp => {
    const items = UPGRADES.filter(u => grp.ids.includes(u.id));
    const isOpen = _acc[grp.key];
    // Считаем сколько активных/купленных в группе для суммарного бейджа
    const activeCount = items.filter(u =>
      (u.oneTime && G.upgrades[u.id]) ||
      (!u.oneTime && !u.fatigueReduce && G.tempQBonus >= u.qBonus) ||
      (u.fatigueReduce && ((G.fatigueActionCooldowns||{})[u.id]||0) === 0 && G.money >= u.cost)
    ).length;
    const boughtCount = items.filter(u => u.oneTime && G.upgrades[u.id]).length;
    const groupBadge = boughtCount > 0
      ? `<span style="font-size:10px;background:rgba(63,185,80,.15);color:var(--green);border-radius:4px;padding:1px 6px;margin-left:6px">✓ ${boughtCount}</span>` : '';

    return `
    <div style="margin-bottom:6px;border:1px solid rgba(255,255,255,.06);border-radius:8px;overflow:hidden">
      <button onclick="toggleAcc('${grp.key}')"
        style="width:100%;background:rgba(255,255,255,.03);border:none;color:var(--fg);padding:8px 10px;display:flex;align-items:center;gap:6px;cursor:pointer;font-size:12px;font-weight:600;text-align:left">
        <span>${grp.label}</span>${groupBadge}
        <span style="margin-left:auto;font-size:11px" id="acc-arrow-${grp.key}">${isOpen?'▾':'▸'}</span>
      </button>
      <div id="acc-${grp.key}" style="display:${isOpen?'block':'none'};padding:4px 4px 6px">
        ${items.map(renderUpgradeItem).join('')}
      </div>
    </div>`;
  }).join('');

  document.getElementById('g-upgrades-list').innerHTML=uhtml;

  // ── Metrics ──
  const avgNps=G.activeClients.length?Math.round(G.activeClients.reduce((s,c)=>s+(G.clientNPS[c.id]||70),0)/G.activeClients.length):'—';
  const npsCl=typeof avgNps==='number'?npsColor(avgNps):'var(--sub)';
  const qv=getQuality(), vv=getVolume();
  const qCl=qv>=20?'var(--green)':qv>=10?'var(--amber)':'var(--red)';
  const vCl=vv>=15?'var(--green)':vv>=5?'var(--amber)':'var(--red)';
  const repC=repColor(G.reputation);
  // Q/V премия к выручке убрана (нет помесячной выручки в новой модели)

  // Q bar: thresholds at 10 (разблокирует стартапы), 20 (корпораты), 30 (госконтракт)
  const qThresholds = [
    { val:10, label:'Стартап' },
    { val:20, label:'Корп.' },
    { val:30, label:'Гос.' },
  ];
  // V bar: thresholds at 5 (стартапы), 10 (корпораты), 15 (ретейнер/гос)
  const vThresholds = [
    { val:5,  label:'Стартап' },
    { val:10, label:'Корп.' },
    { val:15, label:'Гос./Рет.' },
  ];
  const staffQ = G.staff.reduce((s,x)=>s+(x.quality||0),0);
  const qBar = makeCapBar(qv, 40, qThresholds, qCl, 'Нанять Дизайнера (+20 Q)');
  const vBar = makeCapBar(vv, 20, vThresholds, vCl, 'Нанять Копирайтера (+15 V)');

  // Q breakdown hint
  const qBreakdown=[];
  if (staffQ>0)           qBreakdown.push(`команда +${staffQ}`);
  if (G.qualityBonus>0)   qBreakdown.push(`апгрейды +${G.qualityBonus}`);
  if (G.tempQBonus>0)     qBreakdown.push(`<span style="color:var(--amber)">фриланс +${G.tempQBonus}</span>`);
  const qBreakdownHtml = qBreakdown.length>1
    ? `<div style="font-size:10px;color:var(--muted);margin-top:-2px;margin-bottom:3px">${qBreakdown.join(' · ')}</div>` : '';

  // Portfolio bar
  const pf=G.portfolio||0;
  const pfMult=Math.round((getPortfolioMultiplier()-1)*100);
  const pfCl=pf>=50?'var(--purple)':pf>=28?'var(--accent2)':pf>=12?'var(--teal)':'var(--muted)';
  const pfThresholds=[
    {val:12, label:'📊 Медиа'},
    {val:28, label:'🌍 Меж.'},
    {val:50, label:'🤝 Партн.'},
  ];
  const pfBar=makeCapBar(pf, 60, pfThresholds, pfCl, '');
  // Next unlock hint
  const nextPfUnlock=[12,28,50].find(v=>pf<v);
  const pfHint=nextPfUnlock
    ? `<div style="font-size:10px;color:var(--muted);margin-top:-2px;margin-bottom:2px">до следующего проекта: ${nextPfUnlock-pf} балл${(nextPfUnlock-pf)===1?'':'а'}</div>`
    : `<div style="font-size:10px;color:var(--purple);margin-top:-2px;margin-bottom:2px">все портфолио-проекты открыты 🏆</div>`;

  // ── Метрики — grid-карточки ──────────────────────────
  // Вспомогательная функция: одна метрика-карточка
  const mc = ({ id, label, value, valueColor='var(--fg)', sub='', bar='', tip='', full=false }) => `
    <div style="background:var(--bg2);border:1px solid rgba(255,255,255,.07);border-radius:8px;padding:8px 10px;position:relative;${full?'grid-column:1/-1;':''}">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:2px">
        <span style="font-size:9px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.06em">${label}</span>
        <button onclick="toggleMetricTip('${id}')"
          style="background:none;border:1px solid rgba(255,255,255,.14);border-radius:50%;width:15px;height:15px;color:var(--muted);font-size:8px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;padding:0;line-height:1">?</button>
      </div>
      <div style="font-size:${full?'17':'19'}px;font-weight:700;color:${valueColor};line-height:1.1;margin-bottom:${sub||bar?'3':'0'}px">${value}</div>
      ${sub?`<div style="font-size:10px;color:var(--muted);margin-bottom:${bar?'3':'0'}px">${sub}</div>`:''}
      ${bar}
      <div id="mtip-${id}" style="display:none;margin-top:5px;font-size:10px;color:var(--sub);background:rgba(255,255,255,.04);border-radius:5px;padding:5px 7px;line-height:1.4;border-left:2px solid rgba(79,110,247,.4)">${tip}</div>
    </div>`;

  // Данные нагрузки
  const thr=getTeamThroughput(), tld=getTotalLoad();
  const fMult=getFatigueMult();
  const effThr=Math.round(thr*fMult);
  const fatDelta=thr-effThr;
  const ratio=tld>0?effThr/tld:1, overloaded=tld>0&&ratio<0.95;
  const loadCol=overloaded?'var(--red)':tld===0?'var(--muted)':ratio<1.1?'var(--amber)':'var(--green)';
  const loadPct=Math.round(ratio*100);
  const loadBar=tld>0?`<div style="height:3px;background:var(--bg3);border-radius:2px;overflow:hidden"><div style="height:100%;width:${Math.min(100,loadPct)}%;background:${loadCol};border-radius:2px"></div></div>`:'';
  const loadSub=tld===0?'нет активных проектов':overloaded?`⚠ прогресс ×${loadPct}%`:`эффективность ${loadPct}%`;
  const loadSubCol=overloaded?'color:var(--red)':'color:var(--muted)';
  const loadVal=tld===0?`${effThr}`:`${Math.round(tld)} / ${effThr}${fatDelta>0?` <span style="font-size:11px;color:var(--red);font-weight:400">−${fatDelta}уст.</span>`:''}`;

  // Данные усталости
  const ft = G.teamFatigue || 0;
  const ftCol = ft>=85?'var(--red)':ft>=60?'var(--amber)':ft>=30?'#e8a838':'var(--green)';
  const ftLabel = ft>=85?'Кризис':ft>=60?'Выгорание':ft>=30?'Напряжение':'Норма';
  const _focusableLen = G.activeClients.filter(c=>!c.oneTime).length;
  const _totalFocusW  = G.activeClients.filter(c=>!c.oneTime).reduce((s,c)=>s+(c._focus??50),0);
  const _activeFocusPct = _focusableLen>0?Math.min(1,_totalFocusW/100):1;
  const _effectiveLoad = getTotalLoad()*_activeFocusPct;
  const _loadPct2 = getTeamThroughput()>0?_effectiveLoad/getTeamThroughput():0;
  let _fd = _loadPct2>=1.0?10:_loadPct2>=0.85?4:_loadPct2>=0.70?1:-8;
  const _hrSr=G.staff.some(s=>s.id==='hr_sr'),_hrMd=G.staff.some(s=>s.id==='hr'),_hrJr=G.staff.some(s=>s.id==='hr_jr');
  if (_fd>0&&_hrSr) _fd=Math.round(_fd*0.55); else if(_fd>0&&_hrMd)_fd=Math.round(_fd*0.70); else if(_fd>0&&_hrJr)_fd=Math.round(_fd*0.80);
  if (_hrSr) _fd-=2;
  const _fdSign=_fd>=0?`+${_fd}`:`${_fd}`;
  const _fdCol=_fd>0?'var(--red)':_fd<0?'var(--green)':'var(--muted)';
  let _forecast='';
  if(_fd<0&&ft>30) _forecast=`· Норма ~${Math.ceil((ft-30)/Math.abs(_fd))} мес.`;
  else if(_fd<0&&ft<=30) _forecast='· восстановление';
  else if(_fd>0&&ft>=60) _forecast='· нужен Тимбилдинг';
  const ftBar=`<div style="height:3px;background:var(--bg3);border-radius:2px;margin-bottom:2px;overflow:hidden"><div style="height:100%;width:${ft}%;background:${ftCol};border-radius:2px;transition:width .3s"></div></div>`;
  const ftSub=`<span style="color:${_fdCol};font-weight:600">${_fdSign}/мес</span>${_forecast?` <span style="color:var(--sub)">${_forecast}</span>`:''}`;

  // Скорость
  const spd=getSpeed(), spdPct=Math.round(spd*100);
  const spdCol=spdPct>=130?'var(--purple)':spdPct>=115?'var(--green)':spdPct>=105?'var(--teal)':'var(--muted)';
  const staffSpdBonus=G.staff.reduce((s,x)=>s+(x.speedBonus||0),0);
  const spdHint=[
    staffSpdBonus>0?`специалисты +${Math.round(staffSpdBonus*100)}%`:null,
    (G.speedUpgrades||0)>0?`перки +${Math.round(G.speedUpgrades*100)}%`:null,
  ].filter(Boolean).join(', ')||'базовая';

  // Репутация
  const repBar=`<div style="height:3px;background:var(--bg3);border-radius:2px;overflow:hidden"><div style="height:100%;width:${G.reputation}%;background:${repC};border-radius:2px"></div></div>`;

  document.getElementById('g-metrics').innerHTML=`
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">

      ${mc({ id:'q', label:'Качество (Q)', value:qv, valueColor:qCl, full:true,
        sub: qBreakdown.length>0 ? qBreakdown.join(' · ') : '',
        bar: qBar,
        tip: 'Открывает доступ к проектам: Стартап ≥10, Корп. ≥20, Гос. ≥30. Растёт от Дизайнера, апгрейдов и фриланс-помощи.' })}

      ${mc({ id:'v', label:'Объём (V)', value:vv, valueColor:vCl, full:true,
        bar: vBar,
        tip: 'Нужен для контент-проектов: Стартап ≥5, Корп. ≥10, Гос./Ретейнер ≥15. Даёт Копирайтер и SMM.' })}

      ${mc({ id:'pf', label:'Портфолио', value:pf, valueColor:pfCl, full:true,
        sub: pfMult>0 ? `+${pfMult}% к выручке · ${nextPfUnlock?`до следующего клиента: ${nextPfUnlock-pf} балл${(nextPfUnlock-pf)===1?'':'а'}`:'все клиенты открыты 🏆'}` : (nextPfUnlock?`до следующего: ${nextPfUnlock-pf}`:''),
        bar: pfBar,
        tip: 'Накапливается с завершёнными проектами. Открывает закрытых клиентов при 12/28/50 баллах. Даёт +0.4%/балл к выручке (макс +20%).' })}

      ${mc({ id:'slots', label:'Слоты', value:`${G.activeClients.length} / ${getCapacity()}`,
        tip: 'Параллельные проекты. База: 2 слота. Менеджер Jr +1 · Md +2 · Sr +3.' })}

      ${mc({ id:'nps', label:'Средний NPS', value:avgNps, valueColor:npsCl,
        tip: 'Удовлетворённость клиентов (0–100). При NPS < 40 клиент расторгает контракт. Повышается инвестицией и бонус-событиями.' })}

      ${mc({ id:'rep', label:'Репутация', value:Math.round(G.reputation), valueColor:repC,
        bar: repBar,
        tip: 'Открывает тиры проектов и специалистов. Т2 ≥40, Т3 ≥60, Эндгейм ≥80. Падает при серой зоне, просрочках и невыплате кредита.' })}

      ${mc({ id:'spd', label:'Скорость', value:spdPct+'%', valueColor:spdCol,
        sub: spdHint,
        tip: 'Множитель скорости выполнения проектов. Прокачивается Agile (+10%) / Scrum (+15%) / Автоматизация (+20%) и грейдами Менеджера/Разработчика.' })}

      ${mc({ id:'load', label:'Нагрузка / Произв.', value:loadVal, valueColor:loadCol,
        bar: loadBar,
        sub: `<span style="${loadSubCol}">${loadSub}</span>`,
        tip: 'Суммарная нагрузка проектов vs эффективная производительность команды. При перегрузе (нагрузка > произв.) прогресс замедляется. Усталость снижает производительность.' })}

      ${mc({ id:'fat', label:`Усталость · ${ftLabel}`, value:`${Math.round(ft)}`, valueColor:ftCol,
        bar: ftBar,
        sub: ftSub,
        tip: 'Норма (0–30): без эффектов. Напряжение (30–60): −5% прогресс, −3 NPS/мес. Выгорание (60–85): −15% прогресс, сотрудники уходят. Кризис (85+): −30%, найм заблокирован.' })}

      <div style="grid-column:1/-1;padding:4px 2px">
        <span style="font-size:10px;color:var(--muted)">Overhead/мес</span>
        <span style="font-size:10px;color:var(--red);font-weight:600;margin-left:6px">−${fmt(OVERHEAD)}</span>
      </div>
    </div>`;

  // ── Log ──
  const lhtml=G.log.map(l=>`<div class="log-item"><span class="log-month">${l.month} — </span><span class="log-msg ${l.cls}">${l.msg}</span></div>`).join('');
  document.getElementById('g-log').innerHTML=lhtml||'<div class="log-item"><span class="log-msg">Пока всё тихо…</span></div>';

  // ── Portfolio tab badge ──
  // П.18: отмененные и провальные проекты не идут в портфолио
  const available=(G.completedProjects||[]).filter(p=>!p._cased && !p.terminated && !p.failed).length;
  const tabBadge=document.getElementById('tab-portfolio-badge');
  if (tabBadge){
    tabBadge.textContent=available;
    tabBadge.style.display=available>0?'inline-flex':'none';
  }
}

// ══════════════════════════════════════════════════════
//  EVENTS
// ══════════════════════════════════════════════════════
function showEvent(ev) {
  document.getElementById('modal-icon').textContent=ev.icon;
  document.getElementById('modal-title').textContent=ev.title;
  document.getElementById('modal-body').textContent=ev.body;
  const div=document.getElementById('modal-choices'); div.innerHTML='';
  ev.choices.forEach(ch=>{
    const btn=document.createElement('button');
    btn.className='modal-choice';
    btn.innerHTML=`<div class="choice-title">${ch.text}</div><div class="choice-desc">${ch.desc}</div>`;
    btn.onclick=()=>{
      ch.fn(G);
      document.getElementById('event-modal').classList.remove('active');
      renderGame();
      if (G.money<=0){endGame(false);return;}
      if (G.money>=3000000){endGame(true);}
    };
    div.appendChild(btn);
  });
  document.getElementById('event-modal').classList.add('active');
}

// ══════════════════════════════════════════════════════
//  END / DASHBOARD
// ══════════════════════════════════════════════════════
function endGame(won) { buildDashboard(won); _uiNavigate('screen-results'); }

function buildDashboard(won) {
  const spec=SPECS[G.spec];
  document.getElementById('r-icon').textContent=won?'🏆':'💸';
  document.getElementById('r-title').textContent=won?'Агентство вышло на 3M!':'Деньги кончились';
  document.getElementById('r-title').style.color=won?'var(--green)':'var(--red)';
  document.getElementById('r-sub').textContent=won
    ?`${spec.name} — ${G.monthsPlayed} мес. Инвесторы уже звонят.`
    :G.monthsPlayed<4?'Кассовый разрыв: расходы съели стартовый капитал до появления стабильных проектов.'
    :'Рынок суров. NPS деградировал, клиенты ушли раньше, чем выросла выручка.';

  const peak=Math.max(...G.history.map(h=>h.money));
  const churned=DECISIONS.filter(d=>d.type==='churn').length;
  const scouts=DECISIONS.filter(d=>d.type==='client').length;
  document.getElementById('r-kpis').innerHTML=`
    <div class="kpi-box"><div class="kv" style="color:${won?'var(--green)':'var(--red)'}">${fmtK(G.money)}</div><div class="kl">Итоговый баланс</div></div>
    <div class="kpi-box"><div class="kv">${G.monthsPlayed}</div><div class="kl">Месяцев</div></div>
    <div class="kpi-box"><div class="kv" style="color:var(--accent2)">${fmtK(peak)}</div><div class="kl">Пик баланса</div></div>
    <div class="kpi-box"><div class="kv">${churned}</div><div class="kl">Ушло клиентов</div></div>`;

  buildChart();

  // Breakdown
  const totalE=Object.values(G.clientEarnings).reduce((s,v)=>s+v,0)||1;
  const byName={};
  Object.entries(G.clientEarnings).forEach(([id,e])=>{
    const def=PROJECT_POOL.find(p=>id.startsWith(p.id))||{name:id,icon:'🏢'};
    byName[def.name]=(byName[def.name]||{name:def.name,icon:def.icon,e:0});
    byName[def.name].e+=e;
  });
  let bhtml=Object.values(byName).sort((a,b)=>b.e-a.e).map(t=>{
    const pct=Math.round(t.e/totalE*100);
    return `<div class="breakdown-row">
      <div class="breakdown-icon">${t.icon}</div>
      <div class="breakdown-info">
        <div class="breakdown-name">${t.name}</div>
        <div class="breakdown-bar-wrap"><div class="breakdown-bar-fill" style="width:${pct}%;background:var(--accent)"></div></div>
      </div>
      <div class="breakdown-val">${fmtK(t.e)}</div>
    </div>`;
  }).join('');
  document.getElementById('r-breakdown').innerHTML=bhtml||'<div style="color:var(--sub);font-size:13px">Нет данных</div>';

  // Timeline
  const dc={hire:'var(--accent)',client:'var(--green)',event:'var(--amber)',churn:'var(--red)'};
  document.getElementById('r-timeline').innerHTML=DECISIONS.length
    ?DECISIONS.map(d=>`<div class="tl-item"><div class="tl-dot" style="background:${dc[d.type]||'var(--sub)'}"></div><div class="tl-month">${d.label}</div><div class="tl-text">${d.text}</div></div>`).join('')
    :'<div style="color:var(--sub);font-size:13px">Решений не зафиксировано</div>';

  // Insights
  document.getElementById('r-insights').innerHTML=generateInsights(won).map(i=>
    `<div class="insight-row"><div class="insight-icon">${i.icon}</div><div class="insight-text">${i.text}</div></div>`
  ).join('');
}

function buildChart() {
  const hist=G.history;
  if (hist.length<2){ document.getElementById('r-chart').innerHTML='<div style="color:var(--sub);padding:16px;text-align:center">Недостаточно данных</div>'; return; }
  const W=600,H=180,PL=52,PR=12,PT=12,PB=28,cW=W-PL-PR,cH=H-PT-PB;
  const ms=hist.map(h=>h.money), maxM=Math.max(...ms,500000)*1.08, minM=Math.min(...ms,0), rng=maxM-minM||1;
  const px=i=>PL+(i/(hist.length-1))*cW, py=m=>PT+cH-((m-minM)/rng)*cH;
  const pts=hist.map((h,i)=>`${px(i).toFixed(1)},${py(h.money).toFixed(1)}`).join(' ');
  const area=`M${px(0).toFixed(1)},${(PT+cH).toFixed(1)} `+hist.map((h,i)=>`L${px(i).toFixed(1)},${py(h.money).toFixed(1)}`).join(' ')+` L${px(hist.length-1).toFixed(1)},${(PT+cH).toFixed(1)} Z`;
  const goalY=py(3000000), showGoal=goalY>=PT&&goalY<=PT+cH;
  const dc2={hire:'#4F6EF7',client:'#3FB950',event:'#D29922',churn:'#F85149'};
  const dots=DECISIONS.map(d=>{
    const idx=Math.min(d.monthIdx,hist.length-1);
    return `<circle cx="${px(idx).toFixed(1)}" cy="${py(hist[idx]?.money??0).toFixed(1)}" r="5" fill="${dc2[d.type]||'#8B949E'}" stroke="#161B22" stroke-width="2"><title>${d.label}: ${d.text}</title></circle>`;
  }).join('');
  const ticks=[minM,(minM+maxM)/2,maxM].map(v=>{
    const lbl=Math.abs(v)>=1000000?(v/1000000).toFixed(1)+'M':Math.abs(v)>=1000?Math.round(v/1000)+'K':'0';
    return `<text x="${PL-6}" y="${py(v).toFixed(1)}" fill="#484F58" font-size="10" text-anchor="end" dominant-baseline="middle">${lbl}</text>`;
  }).join('');
  const step=Math.max(1,Math.floor(hist.length/5));
  const xlbls=hist.map((h,i)=>{
    if (i%step!==0&&i!==hist.length-1) return '';
    return `<text x="${px(i).toFixed(1)}" y="${PT+cH+14}" fill="#484F58" font-size="9" text-anchor="middle">${h.label.slice(0,3)}</text>`;
  }).join('');
  document.getElementById('r-chart').innerHTML=`<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="cg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#4F6EF7" stop-opacity=".25"/><stop offset="100%" stop-color="#4F6EF7" stop-opacity=".01"/></linearGradient></defs>
    <line x1="${PL}" y1="${PT}" x2="${W-PR}" y2="${PT}" stroke="#1C2330" stroke-width="1"/>
    <line x1="${PL}" y1="${PT+cH/2}" x2="${W-PR}" y2="${PT+cH/2}" stroke="#1C2330" stroke-width="1"/>
    <line x1="${PL}" y1="${PT+cH}" x2="${W-PR}" y2="${PT+cH}" stroke="#30363D" stroke-width="1"/>
    ${minM<0?`<line x1="${PL}" y1="${py(0).toFixed(1)}" x2="${W-PR}" y2="${py(0).toFixed(1)}" stroke="#F85149" stroke-width=".8" stroke-dasharray="3,3" opacity=".5"/>`:''}
    ${showGoal?`<line x1="${PL}" y1="${goalY.toFixed(1)}" x2="${W-PR}" y2="${goalY.toFixed(1)}" stroke="#3FB950" stroke-width="1" stroke-dasharray="4,3" opacity=".6"/><text x="${W-PR-2}" y="${goalY-4}" fill="#3FB950" font-size="9" text-anchor="end" opacity=".8">Цель 3M</text>`:''}
    <path d="${area}" fill="url(#cg)"/>
    <polyline points="${pts}" fill="none" stroke="#4F6EF7" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    ${dots}${ticks}${xlbls}
  </svg>`;
}

function generateInsights(won) {
  const ins=[];
  const churned=DECISIONS.filter(d=>d.type==='churn').length;
  const scouts=DECISIONS.filter(d=>d.type==='client').length;
  const hired=DECISIONS.filter(d=>d.type==='hire').length;
  const ms=G.history.map(h=>h.money);
  const peak=Math.max(...ms);
  const peakM=G.history.findIndex(h=>h.money===peak);

  if (scouts===0) ins.push({icon:'🔍',text:'<strong>Ни одного проекта не подписано через скаутинг.</strong> Без активного поиска агентство живёт только на overhead — деньги утекают каждый месяц.'});
  if (scouts>0)   ins.push({icon:'📋',text:`<strong>Подписано ${scouts} проект${scouts===1?'':scouts<5?'а':'ов'} через скаутинг.</strong> Качество скаутинга зависит от репутации — чем выше, тем лучше пул предложений.`});
  if (churned>0)  ins.push({icon:'💔',text:`<strong>${churned} клиент${churned===1?'':churned<5?'а':'ов'} ушли органически.</strong> NPS падает без качества и объёма — Дизайнер и Копирайтер напрямую снижают риск оттока.`});
  if (churned===0&&scouts>0) ins.push({icon:'✅',text:'<strong>Ни одного органического оттока.</strong> NPS держался выше критического уровня на протяжении всей игры.'});
  if (hired===0) ins.push({icon:'👤',text:'<strong>Команда так и не собрана.</strong> Без Дизайнера и Копирайтера качество/объём равны нулю — это блокирует дорогие проекты и ускоряет NPS-деградацию.'});
  if (peakM>0&&peakM<G.history.length-2) ins.push({icon:'📉',text:`<strong>Пик достигнут в ${G.history[peakM].label}</strong>, затем кривая пошла вниз. Вероятная причина: отток клиентов или рост постоянных расходов без новых проектов.`});
  if (won) ins.push({icon:'📊',text:`<strong>Победа за ${G.monthsPlayed} мес. — специализация: ${SPECS[G.spec].name}.</strong> В реальном агентстве этот путь занимает 18–36 месяцев.`});
  if (!won&&G.monthsPlayed<5) ins.push({icon:'⚡',text:`<strong>Банкротство за ${G.monthsPlayed} мес.</strong> Overhead ${fmt(OVERHEAD)}/мес + зарплаты без выручки — классический кассовый разрыв первого года.`});
  return ins.slice(0,4);
}

// ══════════════════════════════════════════════════════
//  PORTFOLIO TAB
// ══════════════════════════════════════════════════════

function switchTab(tab) {
  document.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.gtab').forEach(t=>t.classList.remove('active'));
  document.getElementById('tab-panel-'+tab).classList.add('active');
  document.getElementById('tab-btn-'+tab).classList.add('active');
  if (tab==='portfolio') renderPortfolioTab();
}

function renderPortfolioTab() {
  const container=document.getElementById('g-portfolio-content');
  if (!container) return;

  const cases=G.cases||[];
  // П.18: расторгнутые и провальные — не в портфолио
  const available=(G.completedProjects||[]).filter(p=>!p._cased && !p.terminated && !p.failed);
  const cased=(G.completedProjects||[]).filter(p=>p._cased);

  // ── Total bonuses summary ──
  const totalQ=G.caseQBonus||0;
  const totalRep=G.caseRepBonus||0;
  const totalScout=G.caseScoutBonus||0;
  const hasBonuses=totalQ>0||totalRep>0||totalScout>0;
  const bonusSummary=hasBonuses
    ? `<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px;padding:10px 14px;background:rgba(168,85,247,.08);border:1px solid rgba(168,85,247,.2);border-radius:9px;align-items:center">
        <span style="font-size:11px;color:var(--sub)">Суммарные бонусы портфолио:</span>
        ${totalQ>0?`<span style="font-size:12px;color:var(--teal);font-weight:700">Q +${totalQ}</span>`:''}
        ${totalRep>0?`<span style="font-size:12px;color:var(--green);font-weight:700">Реп +${totalRep}/мес</span>`:''}
        ${totalScout>0?`<span style="font-size:12px;color:var(--purple);font-weight:700">+${totalScout} лид/скаутинг</span>`:''}
      </div>` : '';

  // ── Cases in portfolio ──
  let casesHtml='';
  if (cases.length===0){
    casesHtml=`<div style="text-align:center;padding:20px 0;color:var(--sub)">
      <div style="font-size:26px;margin-bottom:8px">📁</div>
      <div style="font-weight:600;color:var(--text);margin-bottom:4px">Кейсов пока нет</div>
      <div style="font-size:12px">Собери первый кейс из завершённых проектов справа</div>
    </div>`;
  } else {
    casesHtml=cases.map(c=>{
      const gd=CASE_GRADES[c.grade];
      const bonusPills=[
        c.qBonus>0?`<span style="font-size:10px;color:var(--teal);font-weight:700;background:rgba(45,212,191,.12);padding:2px 7px;border-radius:4px">Q +${c.qBonus}</span>`:'',
        c.repBonus>0?`<span style="font-size:10px;color:var(--green);font-weight:700;background:rgba(63,185,80,.1);padding:2px 7px;border-radius:4px">Реп +${c.repBonus}/мес</span>`:'',
        c.scoutBonus>0?`<span style="font-size:10px;color:var(--purple);font-weight:700;background:rgba(168,85,247,.12);padding:2px 7px;border-radius:4px">+${c.scoutBonus} лид</span>`:'',
      ].filter(Boolean).join('');
      return `<div class="staff-item" style="border-left:3px solid ${gd.color};padding-left:12px;margin-bottom:8px">
        <div class="staff-avatar" style="background:rgba(168,85,247,.12);font-size:18px">${c.icon}</div>
        <div class="staff-info">
          <div class="staff-name" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            ${c.name}
            <span style="font-size:10px;padding:2px 8px;border-radius:4px;background:rgba(168,85,247,.15);color:${gd.color};font-weight:700">${gd.icon} ${gd.label}</span>
          </div>
          <div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:4px">${bonusPills||`<span style="font-size:10px;color:var(--muted)">без бонусов</span>`}</div>
          <div style="font-size:10px;color:var(--muted);margin-top:3px">NPS при закрытии: ${c.finalNPS} · сборка: ${c.daysSpent} дн.</div>
        </div>
        <button class="btn btn-xs" style="background:rgba(248,81,73,.08);color:var(--red);border:1px solid rgba(248,81,73,.2);flex-shrink:0" onclick="removeCase('${c.id}')">Убрать</button>
      </div>`;
    }).join('');
    if (cased.length>0){
      casesHtml+=`<div style="font-size:10px;color:var(--muted);margin-top:4px;text-align:center">${cased.length} проект${cased.length<5?'а':'ов'} в кейсах — убери чтобы пересобрать</div>`;
    }
  }

  // ── Available to build ──
  let buildHtml='';
  if (available.length===0 && (G.completedProjects||[]).length===0){
    buildHtml=`<div style="text-align:center;padding:20px 0;color:var(--sub)">
      <div style="font-size:22px;margin-bottom:8px">⏳</div>
      <div style="font-size:13px">Здесь появятся завершённые проекты.<br>Закрой разовый заказ или дождись ухода клиента.</div>
    </div>`;
  } else if (available.length===0){
    buildHtml=`<div style="text-align:center;padding:14px 0;color:var(--sub);font-size:13px">Все завершённые проекты уже оформлены в кейсы.</div>`;
  } else {
    buildHtml=`<div style="font-size:11px;color:var(--muted);margin-bottom:10px">Потрать рабочие дни на сборку. Больше дней + выше Q + лучший NPS → выше грейд.</div>`;
    buildHtml+=available.map(p=>{
      const g1=CASE_GRADES[calcCaseGrade(p,1)];
      const g2=CASE_GRADES[calcCaseGrade(p,2)];
      const g3=CASE_GRADES[calcCaseGrade(p,3)];
      const statusBadge=p.failed
        ?`<span style="font-size:10px;color:var(--red);font-weight:600">💔 Клиент ушёл</span>`
        :p.terminated
        ?`<span style="font-size:10px;color:var(--amber);font-weight:600">🚫 Расторгнут</span>`
        :`<span style="font-size:10px;color:var(--green);font-weight:600">✅ Выполнен</span>`;

      const btnStyle=(gd)=>{
        if (gd.id==='excellent') return 'btn-primary';
        if (gd.id==='good') return 'btn-teal';
        return 'btn-ghost';
      };

      return `<div class="client-card" style="margin-bottom:10px">
        <div class="client-row1">
          <div class="client-icon">${p.icon}</div>
          <div class="client-info">
            <div class="client-name">${p.name} ${statusBadge}</div>
            <div class="client-desc">NPS при завершении: <strong style="color:${p.finalNPS>=55?'var(--green)':p.finalNPS>=40?'var(--amber)':'var(--red)'}">${p.finalNPS}</strong> · Tier ${p.tier}</div>
          </div>
        </div>
        <div style="margin-top:10px">
          <div style="font-size:10px;color:var(--muted);margin-bottom:6px">Выбери время на сборку кейса:</div>
          <div style="display:flex;gap:6px">
            <button class="btn btn-sm ${btnStyle(g1)}" onclick="buildCase('${p.id}',1)" ${G.actions<1?'disabled':''}
              style="flex:1;flex-direction:column;gap:2px;align-items:center;padding:8px 6px;text-align:center">
              <span>1 день</span><span style="font-size:9px;opacity:.75">${g1.icon} ${g1.label}</span>
            </button>
            <button class="btn btn-sm ${btnStyle(g2)}" onclick="buildCase('${p.id}',2)" ${G.actions<2?'disabled':''}
              style="flex:1;flex-direction:column;gap:2px;align-items:center;padding:8px 6px;text-align:center">
              <span>2 дня</span><span style="font-size:9px;opacity:.75">${g2.icon} ${g2.label}</span>
            </button>
            <button class="btn btn-sm ${btnStyle(g3)}" onclick="buildCase('${p.id}',3)" ${G.actions<3?'disabled':''}
              style="flex:1;flex-direction:column;gap:2px;align-items:center;padding:8px 6px;text-align:center">
              <span>3 дня</span><span style="font-size:9px;opacity:.75">${g3.icon} ${g3.label}</span>
            </button>
          </div>
        </div>
      </div>`;
    }).join('');
  }

  container.innerHTML=`
    ${bonusSummary}
    <div class="portfolio-grid">
      <div class="panel">
        <div class="panel-title">Кейсы в портфолио <span class="badge badge-spec">${cases.length}</span></div>
        ${casesHtml}
      </div>
      <div class="panel">
        <div class="panel-title">Завершённые проекты <span class="badge badge-spec">${available.length}</span></div>
        ${buildHtml}
      </div>
    </div>`;
}

// ══════════════════════════════════════════════════════
//  RESET
// ══════════════════════════════════════════════════════
function resetGame() {
  initState();
  initEventBus();
  document.querySelectorAll('.spec-card').forEach(c=>c.classList.remove('selected'));
  document.getElementById('btn-start-game').disabled=true;
  _uiNavigate('screen-intro');
}
