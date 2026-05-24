// ══════════════════════════════════════════════════════
//  UI — рендер, скаутинг-модал, события, дашборд
//  Зависит от: data.js, engine.js
// ══════════════════════════════════════════════════════
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

    // Бюджет
    const budget    = c._totalBudget||0;
    const budgetStr = c.oneTime
      ? `${fmtK(budget)}<small> разово</small>`
      : isWaiting
        ? `<span style="color:var(--muted);font-size:12px">${fmtK(budget)}</span><small style="color:var(--amber)"> старт через ${waitMos} мес.</small>`
        : `${fmtK(budget)}<small> при сдаче</small>`;

    // Кнопка «Завершить» — только при progress === 100
    const canComplete = !c.oneTime && progress >= 100;

    // Прогресс-бар (не для разовых)
    const progressBar = !c.oneTime ? `
      <div style="margin-top:6px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px">
          <span style="font-size:10px;color:var(--sub)">Прогресс</span>
          <span style="font-size:10px;font-weight:700;color:${progColor}">${progress}%</span>
        </div>
        <div style="height:4px;background:var(--bg3);border-radius:2px;overflow:hidden">
          <div style="height:100%;width:${progress}%;background:${progColor};border-radius:2px;transition:width .4s"></div>
        </div>
      </div>` : '';

    // Контролы фокуса (показываем только когда 2+ активных не-разовых проекта)
    const myFocus = c._focus != null ? c._focus : Math.floor(100 / Math.max(1, focusable.length));
    const focusBar = (!c.oneTime && showFocus) ? (()=>{
      // Превью прогресса при текущем фокусе
      const thr      = getTeamThroughput();
      const totLoad  = getTotalLoad();
      const lratio   = totLoad > 0 ? Math.min(1, thr / totLoad) : 1;
      const fMult    = totalFocusW > 0 ? (myFocus / totalFocusW) * focusable.length : 1;
      const perMonth = Math.round((100 / (c._duration||3)) * lratio * fMult * 10) / 10;
      const remain   = Math.max(0, 100 - (c._progress||0));
      const mthsLeft = perMonth > 0 ? Math.ceil(remain / perMonth) : 99;
      const previewColor = myFocus >= 60 ? 'var(--green)' : myFocus >= 30 ? 'var(--teal)' : 'var(--amber)';
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
          <input type="number" min="0" max="100" value="${myFocus}"
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
          <span style="flex:1;text-align:center;font-size:10px;color:${previewColor}" id="focus-prev-${c.id}">+${perMonth}%/мес · ~${mthsLeft} мес. до завершения</span>
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

  // ── Hire ──
  const dayCostHire=hasRole('hr') ? 1 : HIRE_COST;
  let hhtml='';
  STAFF_DEFS.forEach(def=>{
    const alreadyCount=countRole(def.id);
    const ok=G.money>=def.cost*2 && G.actions>=dayCostHire;
    const bonuses=[];
    if (def.quality){
      bonuses.push(`Кач +${def.quality} <span style="color:var(--teal);font-size:10px">(улучшает Q-гейтинг проектов)</span>`);
    }
    if (def.volume){
      bonuses.push(`Объём +${def.volume} <span style="color:var(--teal);font-size:10px">(V-гейтинг проектов)</span>`);
    }
    if (def.throughput){
      const curT=getTeamThroughput(), newT=curT+def.throughput;
      const tl=getTotalLoad();
      const hint=tl>0?`нагрузка ${Math.round(tl)} → произв. ${newT}`:`произв. +${def.throughput}`;
      bonuses.push(`Произв. +${def.throughput} <span style="color:var(--accent2);font-size:10px">(${hint})</span>`);
    }
    if (def.capacity) bonuses.push(`+${def.capacity} слот`);
    // Unique passive bonuses for specialist roles
    if (def.id==='lawyer')  bonuses.push(`<span style="color:var(--amber);font-size:10px">штрафы/репутация −50%</span>`);
    if (def.id==='smm')     bonuses.push(`<span style="color:var(--teal);font-size:10px">+1 лид при скаутинге</span>`);
    if (def.id==='hr')      bonuses.push(`<span style="color:var(--teal);font-size:10px">+3 NPS/мес · найм за 1 день</span>`);
    if (def.id==='developer') bonuses.push(`<span style="color:var(--accent2);font-size:10px">открывает тех-проекты</span>`);

    const countBadge=alreadyCount>0
      ? `<span style="font-size:10px;background:rgba(79,110,247,.18);color:var(--accent2);border-radius:4px;padding:1px 6px;margin-right:4px">×${alreadyCount}</span>`
      : '';
    hhtml+=`<div class="hire-item">
      <div class="hire-icon">${def.icon}</div>
      <div class="hire-info">
        <div class="hire-name">${countBadge}${def.name}</div>
        <div class="hire-desc">${bonuses.join(' · ')}</div>
      </div>
      <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;margin-left:auto;">
        <div class="hire-cost">−${fmt(def.cost)}/мес</div>
        <button class="btn btn-sm btn-primary" onclick="hireStaff('${def.id}')" ${!ok?'disabled':''}>${alreadyCount>0?'Ещё':'Нанять'}</button>
      </div>
    </div>`;
  });
  document.getElementById('g-hire-list').innerHTML=hhtml;

  // ── Upgrades (Q) ──
  let uhtml='';
  UPGRADES.forEach(u=>{
    const bought      = u.oneTime && G.upgrades[u.id];
    const tempActive  = !u.oneTime && G.tempQBonus >= u.qBonus;
    const canAfford   = G.money >= u.cost && G.actions >= u.days;
    const disabled    = bought || tempActive || !canAfford;

    let statusBadge='';
    if (bought)          statusBadge=`<span style="font-size:10px;color:var(--green);font-weight:700;white-space:nowrap">✓ +${u.qBonus}Q</span>`;
    else if (tempActive) statusBadge=`<span style="font-size:10px;color:var(--teal);font-weight:700;white-space:nowrap">↻ активен</span>`;

    const costLabel=`−${fmtK(u.cost)} · −${u.days}дн`;
    const btnLabel=bought?'Куплено':tempActive?'Активен':u.oneTime?'Купить':'Нанять';

    uhtml+=`<div class="hire-item">
      <div class="hire-icon">${u.icon}</div>
      <div class="hire-info">
        <div class="hire-name" style="display:flex;align-items:center;gap:6px">${u.name} ${statusBadge}</div>
        <div class="hire-desc" style="display:flex;align-items:center;gap:5px;flex-wrap:wrap">
          <span>${u.desc}</span>
          <span style="background:rgba(45,212,191,.15);color:var(--teal);border-radius:4px;padding:1px 6px;font-size:10px;font-weight:700;white-space:nowrap">Q +${u.qBonus}</span>
          ${u.repBonus?`<span style="background:rgba(79,110,247,.15);color:var(--accent2);border-radius:4px;padding:1px 6px;font-size:10px;font-weight:700;white-space:nowrap">Реп +${u.repBonus}</span>`:''}
          ${!u.oneTime?'<span style="color:var(--amber);font-size:10px">· до конца мес.</span>':''}
        </div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:3px;flex-shrink:0">
        <div class="hire-cost" style="font-size:10px">${costLabel}</div>
        <button class="btn btn-sm ${bought||tempActive?'btn-ghost':'btn-teal'}" onclick="buyUpgrade('${u.id}')" ${disabled?'disabled':''}
          style="font-size:11px;padding:5px 10px">${btnLabel}</button>
      </div>
    </div>`;
  });
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

  document.getElementById('g-metrics').innerHTML=`
    <div style="margin-bottom:10px">
      <div class="pnl-row" style="margin-bottom:3px">
        <span style="font-size:12px;color:var(--sub)" title="Накапливается с каждым завершённым месяцем и проектом. Открывает новых клиентов и даёт премию к выручке.">Портфолио</span>
        <span style="color:${pfCl};font-weight:700;font-size:15px">${pf}</span>
      </div>
      ${pfBar}
      ${pfHint}
      ${pfMult>0?`<div style="font-size:10px;color:var(--purple);font-weight:600">↑ +${pfMult}% к выручке всех клиентов</div>`:''}
    </div>
    <div class="divider" style="margin-bottom:8px"></div>
    <div style="margin-bottom:8px">
      <div class="pnl-row" style="margin-bottom:3px">
        <span style="font-size:12px;color:var(--sub)" title="+0.7%/пункт выше минимума клиента. Влияет на NPS и допуск к проектам.">Качество <span style="font-size:10px">(Q)</span></span>
        <span style="color:${qCl};font-weight:700;font-size:15px">${qv}</span>
      </div>
      ${qBreakdownHtml}
      ${qBar}
    </div>
    <div style="margin-bottom:10px">
      <div class="pnl-row" style="margin-bottom:3px">
        <span style="font-size:12px;color:var(--sub)" title="+0.5%/пункт выше минимума клиента. Больше — выше пропускная способность.">Объём <span style="font-size:10px">(V)</span></span>
        <span style="color:${vCl};font-weight:700;font-size:15px">${vv}</span>
      </div>
      ${vBar}
    </div>
    <div class="divider"></div>
    <div class="pnl-row"><span>Слоты</span><span>${G.activeClients.length}/${getCapacity()}</span></div>
    <div class="pnl-row"><span>Средний NPS</span><span style="color:${npsCl};font-weight:700">${avgNps}</span></div>
    <div class="pnl-row">
      <span>Репутация</span>
      <span style="color:${repC};font-weight:700">${Math.round(G.reputation)}</span>
    </div>
    <div class="rep-row" style="padding-bottom:4px;">
      <div class="rep-bar-wrap"><div class="rep-bar-fill" style="width:${G.reputation}%;background:${repC}"></div></div>
    </div>
    <div class="divider" style="margin:6px 0"></div>
    ${(()=>{
      const thr=getTeamThroughput(), tld=getTotalLoad();
      if(tld===0) return `<div class="pnl-row"><span style="color:var(--sub);font-size:12px">Производительность</span><span style="font-weight:700">${thr}</span></div><div style="font-size:10px;color:var(--muted)">нет активных проектов</div>`;
      const ratio=thr/tld, overloaded=ratio<0.95;
      const loadCol=overloaded?'var(--red)':ratio<1.1?'var(--amber)':'var(--green)';
      const loadPct=Math.round(ratio*100);
      return `<div class="pnl-row"><span style="color:var(--sub);font-size:12px">Нагрузка / Произв.</span><span style="color:${loadCol};font-weight:700">${Math.round(tld)} / ${thr}</span></div>
        <div style="height:4px;background:var(--bg3);border-radius:2px;margin-bottom:3px;overflow:hidden"><div style="height:100%;width:${Math.min(100,loadPct)}%;background:${loadCol};border-radius:2px"></div></div>
        ${overloaded?`<div style="font-size:10px;color:var(--red)">⚠ Перегруз — прогресс ×${loadPct}%</div>`:`<div style="font-size:10px;color:var(--muted)">эффективность ${loadPct}%</div>`}`;
    })()}
    <div class="divider" style="margin:6px 0"></div>
    ${(()=>{
      const ft = G.teamFatigue || 0;
      const ftCol = ft >= 85 ? 'var(--red)' : ft >= 60 ? 'var(--amber)' : ft >= 30 ? '#e8a838' : 'var(--green)';
      const ftLabel = ft >= 85 ? 'Кризис' : ft >= 60 ? 'Выгорание' : ft >= 30 ? 'Напряжение' : 'Норма';
      const ftMult  = ft >= 85 ? '×70%' : ft >= 60 ? '×85%' : ft >= 30 ? '×95%' : '';
      return `<div class="pnl-row" style="margin-bottom:3px">
        <span style="font-size:12px;color:var(--sub)" title="Усталость команды. Норма (0–30): нет эффектов. Напряжение (30–60): −5% прогресс, NPS снижается. Выгорание (60–85): −15% прогресс, сотрудники уходят. Кризис (85+): −30% прогресс, найм заблокирован.">Усталость</span>
        <span style="color:${ftCol};font-weight:700;font-size:13px">${Math.round(ft)} <span style="font-size:11px;font-weight:400">${ftLabel}${ftMult ? ' ' + ftMult : ''}</span></span>
      </div>
      <div style="height:4px;background:var(--bg3);border-radius:2px;margin-bottom:4px;overflow:hidden">
        <div style="height:100%;width:${ft}%;background:${ftCol};border-radius:2px;transition:width 0.3s"></div>
      </div>`;
    })()}
    <div class="divider" style="margin:6px 0"></div>
    <div class="pnl-row"><span>Overhead/мес</span><span style="color:var(--red)">−${fmt(OVERHEAD)}</span></div>`;

  // ── Log ──
  const lhtml=G.log.map(l=>`<div class="log-item"><span class="log-month">${l.month} — </span><span class="log-msg ${l.cls}">${l.msg}</span></div>`).join('');
  document.getElementById('g-log').innerHTML=lhtml||'<div class="log-item"><span class="log-msg">Пока всё тихо…</span></div>';

  // ── Portfolio tab badge ──
  const available=(G.completedProjects||[]).filter(p=>!p._cased).length;
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
function endGame(won) { buildDashboard(won); goTo('screen-results'); }

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
  const available=(G.completedProjects||[]).filter(p=>!p._cased);
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
  document.querySelectorAll('.spec-card').forEach(c=>c.classList.remove('selected'));
  document.getElementById('btn-start-game').disabled=true;
  goTo('screen-intro');
}

initState();
