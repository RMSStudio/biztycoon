// ══════════════════════════════════════════════════════
//  STRATEGY MODE — B2B-режим «Стратегическая сессия» (DLC)
//  Симулятор проверки бизнес-гипотез поверх основной игры.
//
//  Принцип изоляции (как у DLC-лоадера): ядро НЕ редактируется.
//  Модуль цепляется через EventBus, переопределение глобальных
//  биндингов (Math.random при активной сессии) и DOM-инжект.
//  Выключен DLC — игра работает как обычно.
//
//  Шаг 1: сидируемый RNG (детерминированные сессии, состояние в G)
//  Шаг 2: импорт цифрового двойника компании (JSON)
//  Шаг 3: ветки гипотез + сравнение (поверх _snap/_restore из saves.js)
// ══════════════════════════════════════════════════════

const STRAT = (() => {
  'use strict';

  const LS_BRANCHES = 'bt_strategy_branches_v1';

  // ════════════════════════════════════════════════════
  //  ШАГ 1 — Сидируемый RNG (mulberry32)
  //  Состояние живёт в G._rngState → сериализуется сейвами,
  //  загрузка ветки продолжает ТОТ ЖЕ поток случайности.
  // ════════════════════════════════════════════════════
  const _nativeRandom = Math.random.bind(Math);

  function _seededRandom() {
    if (typeof G === 'undefined' || !G || G._rngState == null) return _nativeRandom();
    G._rngState = (G._rngState + 0x6D2B79F5) | 0;
    let t = G._rngState;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function _activateRNG(seed) {
    G._rngState = (seed | 0) || 1;
    Math.random = _seededRandom;
  }

  function _deactivateRNG() {
    Math.random = _nativeRandom;
    if (typeof G !== 'undefined' && G) delete G._rngState;
  }

  // ════════════════════════════════════════════════════
  //  ШАГ 2 — Цифровой двойник (импорт JSON)
  //  Формат: dlc/strategy/twin_example.json
  // ════════════════════════════════════════════════════
  let _twin = null;   // загруженный и проверенный двойник

  function _validateTwin(t) {
    const errs = [];
    if (!t || typeof t !== 'object') return ['Файл не является объектом JSON'];
    if (typeof t.money !== 'number' || t.money <= 0) errs.push('money: положительное число (остаток на счёте)');
    if (t.overhead != null && typeof t.overhead !== 'number') errs.push('overhead: число (фикс-косты/мес)');
    (t.staff || []).forEach((s, i) => {
      if (!s.name)   errs.push(`staff[${i}]: нет name`);
      if (!s.role)   errs.push(`staff[${i}]: нет role (designer/copywriter/manager/developer/smm/lawyer/hr)`);
      if (!s.salary) errs.push(`staff[${i}]: нет salary`);
    });
    (t.contracts || []).forEach((c, i) => {
      if (!c.name) errs.push(`contracts[${i}]: нет name`);
      if (typeof c.budgetLeft !== 'number') errs.push(`contracts[${i}]: budgetLeft — остаток к оплате, число`);
      if (typeof c.monthsLeft !== 'number') errs.push(`contracts[${i}]: monthsLeft — месяцев работы осталось, число`);
    });
    return errs;
  }

  // Сотрудник двойника → staff v2-совместимый объект
  function _twinStaff(s, i) {
    const grade = s.grade || 'middle';
    const iid   = 'twin_s' + i;
    return {
      uid: iid, id: iid, _iid: iid,
      name: s.name, role: s.role,
      roleLabel: (typeof ROLE_LABELS !== 'undefined' && ROLE_LABELS[s.role]?.name) || s.role,
      grade, gradeLabel: grade,
      icon: (typeof ROLE_LABELS !== 'undefined' && ROLE_LABELS[s.role]?.icon) || '👤',
      cost: s.salary, salary: s.salary, salaryAsk: s.salary, salaryMin: Math.round(s.salary * 0.85),
      qStat: s.qStat ?? 6, speedStat: 6,
      quality: s.qStat ?? 6, volume: s.volume ?? 0,
      capacity: s.role === 'manager' ? 1 : 0,
      speedBonus: 0, npsBonus: 0,
      traits: [], experience: s.experience ?? 4,
      mood: 80, fatigue: 0, loyalty: s.loyalty ?? 70,
      monthsWithAgency: s.monthsWithAgency ?? 6, projectsCompleted: 0, starLevel: 0,
      state: 'hired', status: 'active', _assignedProjectId: null,
    };
  }

  // Контракт двойника → активный клиент в work-фазе (без попапов фаз)
  function _twinContract(c, i) {
    const tier  = c.tier || 1;
    const total = c.budgetLeft + (c.paidAlready || 0);
    const client = {
      id: 'twin_c' + i + '_' + (G.month || 0),
      name: c.name, icon: c.icon || '📦',
      tier, type: 'corp', oneTime: false,
      npsStart: c.clientMood ?? 70,
      modifier: { type: 'none', val: 0, label: c.note || 'Действующий контракт' },
      modBadge: 'mb-green',
      prepayChance: 0,
      _monthsSigned: 0,
      _duration: Math.max(1, c.monthsLeft),
      _originalBudget: total,
      _totalBudget: c.budgetLeft,
      _prepaidAmount: c.paidAlready || 0,
      _progress: Math.max(0, Math.min(99, c.progressPct ?? 0)),
      _milestones: [], _milestonePcts: [], _milestonesPaid: [],
      _assignedStaff: [],
    };
    if (typeof Projects !== 'undefined') {
      Projects.initLCState(client);
      // Контракт уже в работе: проматываем event-фазы без попапов
      const w0 = client._lcChain.indexOf('work_0');
      if (w0 >= 0) {
        client._lcPhaseIdx   = w0;
        client._lcPhase      = 'work_0';
        client._workStartMonth = 0;
      }
      client._lcClientMood = c.clientMood ?? 70;
    }
    return client;
  }

  function _applyTwin(t) {
    // Настройки сценария — ДО startGame (initState читает SCENARIO.settings)
    SCENARIO.settings.startMoney = t.money;
    if (t.overhead != null)        SCENARIO.settings.overhead = t.overhead;
    if (t.startReputation != null) SCENARIO.settings.startReputation = t.startReputation;
    SCENARIO.settings.winCondition = Infinity;   // сессия завершается отчётом, не «победой»
  }

  function _injectTwinState(t) {
    (t.staff || []).forEach((s, i) => G.staff.push(_twinStaff(s, i)));
    (t.contracts || []).forEach((c, i) => {
      const client = _twinContract(c, i);
      G.activeClients.push(client);
      G.clientNPS[client.id] = client._lcClientMood ?? 70;
      G.clientEarnings[client.id] = c.paidAlready || 0;
    });
    addLog(`🧭 Двойник загружен: ${t.company || 'компания'} — штат ${ (t.staff||[]).length }, контрактов ${ (t.contracts||[]).length }`, 'purple');
  }

  // ════════════════════════════════════════════════════
  //  ШАГ 3 — Ветки гипотез + сравнение
  //  Поверх _snap()/_restore() из saves.js
  // ════════════════════════════════════════════════════
  function _branches() {
    try { return JSON.parse(localStorage.getItem(LS_BRANCHES)) || []; }
    catch { return []; }
  }
  function _saveBranches(arr) {
    // Держим не больше 8 веток — это сессионный инструмент, не архив
    localStorage.setItem(LS_BRANCHES, JSON.stringify(arr.slice(-8)));
  }

  function createBranch(name) {
    if (typeof _snap !== 'function') { notify('Система сейвов недоступна', 'error'); return; }
    const br = {
      id: 'br_' + Date.now().toString(36),
      name: name || ('Ветка ' + (_branches().length + 1)),
      month: G.month,
      ts: Date.now(),
      snap: _snap(),
    };
    const arr = _branches(); arr.push(br); _saveBranches(arr);
    addLog(`⑂ Создана ветка «${br.name}» (месяц ${G.month + 1})`, 'purple');
    notify(`⑂ Ветка «${br.name}» сохранена — играй вариант, потом сравни`, 'success');
    _renderPanel();
  }

  function openBranch(id) {
    const br = _branches().find(b => b.id === id);
    if (!br || typeof _restore !== 'function') return;
    // Текущее состояние фиксируем как результат предыдущей ветки
    _stampResult();
    _restore(br.snap);
    G._strategyBranchId = br.id;   // вернулись на развилку — новая линия этой же ветки
    Math.random = _seededRandom;   // RNG-обёртка переживает рестор (состояние в G)
    notify(`⑂ Возврат к развилке «${br.name}» — месяц ${br.month + 1}`, 'info');
    EventBus.emit('render');
    _closeModal();
  }

  // Результат проигранной линии: метрики, привязанные к ветке-родителю
  function _stampResult() {
    const arr = _branches();
    const cur = arr.find(b => b.id === G._strategyBranchId);
    if (!cur) return;
    cur.results = cur.results || [];
    cur.results.push(_metrics());
    _saveBranches(arr);
  }

  function _metrics() {
    return {
      label:    G._strategyLineName || ('Линия ' + new Date().toLocaleTimeString().slice(0, 5)),
      month:    G.month,
      money:    Math.round(G.money),
      rep:      Math.round(G.reputation),
      staff:    G.staff.filter(s => s.status !== 'fired').length,
      payroll:  (typeof getTotalStaffCost === 'function') ? getTotalStaffCost() : 0,
      active:   G.activeClients.length,
      done:     (G.completedProjects || []).filter(p => !p.failed).length,
      failed:   (G.completedProjects || []).filter(p => p.failed).length,
      history:  (G.history || []).map(h => Math.round(h.money)),
    };
  }

  // Зафиксировать текущую линию вручную (кнопка «Зафиксировать исход»)
  function stampCurrentLine() {
    const name = prompt('Название проигранного варианта (напр. «Наняли двух разработчиков»):');
    if (name === null) return;
    G._strategyLineName = name || undefined;
    _stampResult();
    notify('📌 Исход зафиксирован — доступен в сравнении веток', 'success');
    _renderPanel();
  }

  function markCurrentBranch(id) { G._strategyBranchId = id; }

  // ── Сравнение: таблица метрик + кэшфлоу по месяцам ──
  function _compareHtml(br) {
    const lines = (br.results || []);
    if (!lines.length) return '<div style="color:var(--sub);padding:14px">По этой ветке ещё нет зафиксированных исходов. Сыграй вариант и нажми «Зафиксировать исход».</div>';

    const fmtM = n => Math.abs(n) >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : Math.round(n / 1000) + 'K';
    const rows = [
      ['Финал, ₽',        l => `<b style="color:${l.money >= br.snap.money ? 'var(--green)' : 'var(--red)'}">${fmtM(l.money)}</b>`],
      ['Месяц фиксации',  l => 'M' + (l.month + 1)],
      ['Репутация',       l => l.rep],
      ['Штат / ФОТ',      l => `${l.staff} чел. · ${fmtM(l.payroll)}/мес`],
      ['Активных',        l => l.active],
      ['Сдано / провалено', l => `${l.done} / ${l.failed}`],
    ];

    let html = `<div style="font-size:11px;color:var(--sub);margin-bottom:8px">
      Развилка «${br.name}» · месяц ${br.month + 1} · баланс на развилке ${fmtM(br.snap.money || 0)}</div>
      <table style="width:100%;border-collapse:collapse;font-size:12px">
      <tr><td></td>${lines.map(l => `<th style="text-align:left;padding:4px 8px;color:var(--teal)">${l.label}</th>`).join('')}</tr>`;
    rows.forEach(([t, fn]) => {
      html += `<tr><td style="padding:4px 8px;color:var(--sub);white-space:nowrap">${t}</td>` +
        lines.map(l => `<td style="padding:4px 8px;border-top:1px solid rgba(255,255,255,.06)">${fn(l)}</td>`).join('') + '</tr>';
    });
    html += '</table>';

    // Кэшфлоу по месяцам от точки развилки
    const maxLen = Math.max(...lines.map(l => l.history.length));
    html += `<div style="font-size:11px;color:var(--sub);margin:12px 0 4px">Баланс по месяцам (от развилки):</div>
      <table style="width:100%;border-collapse:collapse;font-size:11px">
      <tr><td style="color:var(--sub);padding:2px 8px">мес</td>${lines.map(l => `<td style="padding:2px 8px;color:var(--teal)">${l.label}</td>`).join('')}</tr>`;
    for (let m = br.month; m < maxLen; m++) {
      html += `<tr><td style="padding:2px 8px;color:var(--sub)">M${m + 1}</td>` + lines.map(l => {
        const v = l.history[m];
        return `<td style="padding:2px 8px;border-top:1px solid rgba(255,255,255,.04);color:${v < 0 ? 'var(--red)' : 'var(--text)'}">${v != null ? fmtM(v) : '—'}</td>`;
      }).join('') + '</tr>';
    }
    html += '</table>';
    return html;
  }

  // ════════════════════════════════════════════════════
  //  MONTE-CARLO — N прогонов от текущего состояния
  //  Синхронный цикл: браузер не перерисовывается, мерцания нет.
  //  Рендер глушится временной подменой EventBus.emit (ядро не трогаем).
  // ════════════════════════════════════════════════════
  const MC_RUNS_DEFAULT = 60;

  // Автопилот «консервативный»: ведёт текущие контракты, добирает проекты
  // в свободные слоты (T1–T3, проходные по Q/V), НЕ нанимает — моделирует
  // «продолжаем текущую линию без новых управленческих решений»
  function _mcBotMonth() {
    // решения work-событий: первый безопасный вариант
    (G.activeClients || []).filter(c => c._lcPendingDecision).forEach(c => {
      Projects.resolveWorkEvent(c.id);
      _pumpLC();
    });
    // завершённые → сдаём (LC сам через advanceMonth), добор проектов
    if ((G.activeClients || []).length < Math.min(2, getCapacity()) && G.actions >= SCOUT_COST) {
      doScouting(); _pumpLC();
      const Q = getQuality(), V = getVolume();
      const pool = (G.scoutPool || []).filter(p =>
        (p.minQ || 0) <= Q && (p.minV || 0) <= V && (p.tier || 1) <= 3 &&
        !(G.activeClients || []).find(c => c.id.startsWith(p.id)));
      if (pool.length) {
        pool.sort((a, b) => ((b.oneTime?1:0)-(a.oneTime?1:0)) || ((b.tier||1)-(a.tier||1)));
        signProject(pool[0].id); _pumpLC();
      }
    }
    // расстановка: жадно по дефициту
    const regular = (G.activeClients || []).filter(c => c._lcPhase && c._lcPhase.startsWith('work_'));
    if (regular.length) {
      G.staff.filter(s => s.status !== 'fired').forEach(s => unassignStaff(s._iid || s.id));
      G.staff.filter(s => s.status !== 'fired')
        .sort((a, b) => calcStaffWorkUnit(b) - calcStaffWorkUnit(a))
        .forEach(s => {
          let best = null, gap = -Infinity;
          regular.forEach(c => { const g = getProjectLoad(c) - getProjectThroughput(c); if (g > gap) { gap = g; best = c; } });
          if (best && gap > 0) assignStaffToProject(s._iid || s.id, best.id);
        });
    }
  }

  // Насос LC-модалки для автопилота (политика: команда → highlight → первый)
  function _pumpLC() {
    const modal = _el('lc-modal'), box = _el('lc-modal-choices');
    if (!modal || !box) return;
    let guard = 30;
    while (modal.classList.contains('active') && guard-- > 0) {
      const btns = [...box.children].filter(b => b.onclick && !b.disabled &&
        !(b.innerHTML || '').includes('Отказаться от проекта'));
      if (!btns.length) { modal.classList.remove('active'); break; }
      const btn = btns.find(b => (b.innerHTML || '').includes('Назначить всю команду'))
        || btns.find(b => (b.style.cssText || '').includes('45,212,191'))
        || btns[0];
      try { btn.onclick(); } catch (e) { modal.classList.remove('active'); break; }
    }
    if (guard <= 0) modal.classList.remove('active');
  }

  function runMonteCarlo(runs) {
    runs = runs || MC_RUNS_DEFAULT;
    if (typeof _snap !== 'function') { notify('Сейвы недоступны', 'error'); return; }
    const base    = _snap();
    const horizon = (G._strategyMode?.months || 6);
    const fromM   = G.monthsPlayed || 0;
    const left    = Math.max(1, horizon - fromM) ;

    const origEmit = EventBus.emit;
    const results = [];
    let ended = false, won = false;
    EventBus.emit = (sig, data) => {
      if (sig === 'end_game') { ended = true; won = !!(data && data.won); return; }
      if (sig === 'show_event' && data && data.ev && data.ev.choices) {
        try { data.ev.choices[0].fn(G); } catch (e) {}
      }
      // остальные сигналы глушим: ни рендера, ни модалок
    };

    try {
      for (let i = 0; i < runs; i++) {
        _restore(base);
        G._rngState = ((G._strategyMode?.seed || 42) + i * 7919) | 0;
        ended = false; won = false;
        let minCash = G.money, minCashM = G.month;
        for (let m = 0; m < left && !ended; m++) {
          _mcBotMonth();
          advanceMonth();
          _pumpLC();
          if (G.money < minCash) { minCash = G.money; minCashM = G.month; }
          if (G.money <= 0) { ended = true; }
        }
        results.push({
          money: Math.round(G.money), rep: Math.round(G.reputation),
          bankrupt: ended && !won && G.money <= 0,
          done: (G.completedProjects || []).filter(p => !p.failed).length,
          minCash: Math.round(minCash), minCashM,
        });
      }
    } finally {
      EventBus.emit = origEmit;
      _restore(base);
      Math.random = _seededRandom;
      EventBus.emit('render');
    }

    G._strategyMode.lastMC = _mcStats(results, left);
    _openModal(`🎲 Monte-Carlo · ${runs} прогонов · ${left} мес. вперёд`, _mcHtml(G._strategyMode.lastMC));
  }

  function _mcStats(rs, horizon) {
    const money = rs.map(r => r.money).sort((a, b) => a - b);
    const q = p => money[Math.min(money.length - 1, Math.floor(money.length * p))];
    const bankrupts = rs.filter(r => r.bankrupt).length;
    // месяц максимального кассового напряжения (мода минимумов)
    const mFreq = {};
    rs.forEach(r => { mFreq[r.minCashM] = (mFreq[r.minCashM] || 0) + 1; });
    const stressM = Object.entries(mFreq).sort((a, b) => b[1] - a[1])[0]?.[0];
    return {
      runs: rs.length, horizon,
      bankruptPct: Math.round(bankrupts / rs.length * 100),
      median: q(0.5), p25: q(0.25), p75: q(0.75), min: money[0], max: money[money.length - 1],
      negCashPct: Math.round(rs.filter(r => r.minCash < 0).length / rs.length * 100),
      stressMonth: stressM != null ? +stressM + 1 : null,
      avgRep: Math.round(rs.reduce((s, r) => s + r.rep, 0) / rs.length),
      avgDone: (rs.reduce((s, r) => s + r.done, 0) / rs.length).toFixed(1),
      raw: money,
    };
  }

  function _mcHtml(s) {
    const fmtM = n => Math.abs(n) >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : Math.round(n / 1000) + 'K';
    const risk = s.bankruptPct >= 25 ? ['var(--red)', 'ВЫСОКИЙ РИСК'] :
                 s.bankruptPct >= 10 ? ['var(--amber)', 'УМЕРЕННЫЙ РИСК'] : ['var(--green)', 'УСТОЙЧИВО'];
    // гистограмма 10 корзин
    const lo = s.min, hi = Math.max(s.max, lo + 1), buckets = new Array(10).fill(0);
    s.raw.forEach(v => buckets[Math.min(9, Math.floor((v - lo) / (hi - lo) * 10))]++);
    const bMax = Math.max(...buckets, 1);
    const hist = buckets.map((b, i) => `<div title="${fmtM(lo + (hi - lo) * i / 10)}…" style="flex:1;display:flex;flex-direction:column;justify-content:flex-end">
      <div style="height:${Math.round(b / bMax * 48)}px;background:${(lo + (hi - lo) * (i + .5) / 10) < 0 ? 'var(--red)' : 'var(--teal)'};border-radius:2px 2px 0 0;opacity:.85"></div></div>`).join('');

    return `
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px">
        <div style="background:var(--bg);border:1px solid ${risk[0]};border-radius:8px;padding:8px;text-align:center">
          <div style="font-size:20px;font-weight:800;color:${risk[0]}">${s.bankruptPct}%</div>
          <div style="font-size:9px;color:var(--sub)">банкротство<br><b style="color:${risk[0]}">${risk[1]}</b></div></div>
        <div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:8px;text-align:center">
          <div style="font-size:20px;font-weight:800;color:var(--teal)">${fmtM(s.median)}</div>
          <div style="font-size:9px;color:var(--sub)">медианный финал<br>(P25 ${fmtM(s.p25)} · P75 ${fmtM(s.p75)})</div></div>
        <div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:8px;text-align:center">
          <div style="font-size:20px;font-weight:800;color:${s.negCashPct > 20 ? 'var(--amber)' : 'var(--text)'}">${s.negCashPct}%</div>
          <div style="font-size:9px;color:var(--sub)">кассовый разрыв<br>(минимум ниже нуля)</div></div>
        <div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:8px;text-align:center">
          <div style="font-size:20px;font-weight:800;color:var(--amber)">${s.stressMonth ? 'M' + s.stressMonth : '—'}</div>
          <div style="font-size:9px;color:var(--sub)">месяц пикового<br>напряжения кассы</div></div>
      </div>
      <div style="display:flex;gap:2px;height:52px;align-items:flex-end;margin-bottom:4px">${hist}</div>
      <div style="display:flex;justify-content:space-between;font-size:9px;color:var(--sub);margin-bottom:10px">
        <span>${fmtM(s.min)}</span><span>распределение финального баланса (${s.runs} прогонов · автопилот без новых решений)</span><span>${fmtM(s.max)}</span></div>
      <div style="font-size:11px;color:var(--sub);line-height:1.7">
        Детализация: диапазон ${fmtM(s.min)} … ${fmtM(s.max)} · средняя репутация ${s.avgRep} ·
        сдано в среднем ${s.avgDone} проектов за горизонт ${s.horizon} мес.<br>
        <span style="color:var(--muted)">Автопилот ведёт текущие контракты и добирает проекты в свободные слоты, но не нанимает —
        прогноз отвечает на вопрос «что будет, если продолжать как есть».</span>
      </div>`;
  }

  // ════════════════════════════════════════════════════
  //  СКРИПТОВАННЫЕ СОБЫТИЯ ФАСИЛИТАТОРА
  //  Обёртка advanceMonth (ядро не редактируется) — работают и в MC
  // ════════════════════════════════════════════════════
  const SHOCK_LIB = {
    budget_cut:   { label: 'Клиент урезает бюджет', params: 'pct',
      apply: p => { const c = _biggestClient(); if (!c) return 'нет активных';
        const cut = Math.round((c._totalBudget || 0) * (p.pct || 30) / 100);
        c._totalBudget = Math.max(0, c._totalBudget - cut);
        return `«${c.name}»: бюджет −${Math.round(cut / 1000)}K`; } },
    client_leaves: { label: 'Ключевой клиент уходит', params: null,
      apply: () => { const c = _biggestClient(); if (!c) return 'нет активных';
        G.activeClients = G.activeClients.filter(x => x.id !== c.id);
        delete G.clientNPS[c.id];
        return `«${c.name}» расторг контракт`; } },
    staff_offer:  { label: 'Сотруднику делают оффер (уходит)', params: null,
      apply: () => { const ss = G.staff.filter(s => s.status !== 'fired');
        if (!ss.length) return 'нет штата';
        const s = ss.sort((a, b) => calcStaffWorkUnit(b) - calcStaffWorkUnit(a))[0];
        G.staff = G.staff.filter(x => x !== s);
        return `${s.name} ушёл к конкуренту`; } },
    pay_delay:    { label: 'Задержка оплаты (milestone → след. мес)', params: null,
      apply: () => { G.delayedIncome = (G.delayedIncome || 0) + 0; // мягкий вариант: −20% mood всем
        nudgeAllNPS(G, -8); return 'клиенты нервничают: настроение −8 у всех'; } },
    market_dip:   { label: 'Рынок просел (бюджеты новых −20%, 3 мес)', params: null,
      apply: () => { G._strategyMarketDip = (G.month || 0) + 3; return 'демпинг-период до M' + ((G.month || 0) + 4); } },
    hot_lead:     { label: 'Горячий лид (жирный T2 в пуле)', params: null,
      apply: () => { G.scoutPool = G.scoutPool || [];
        G.scoutPool.push({ id: 'hot_lead_' + G.month, tier: 2, icon: '🔥', name: 'Горячий лид',
          desc: 'Входящий клиент по рекомендации.', revenue: 0, minQ: 0, minV: 0, type: 'corp',
          npsStart: 80, oneTime: false, rarity: 'rare', prepayChance: 0.8,
          modifier: { type: 'none', val: 0, label: 'Входящий' }, modBadge: 'mb-green', prob: 1,
          fixedBudget: [2500000, 3000000] });
        return 'в пуле скаутинга появился «Горячий лид»'; } },
  };

  function _biggestClient() {
    return [...(G.activeClients || [])].sort((a, b) => (b._totalBudget || 0) - (a._totalBudget || 0))[0];
  }

  const _origAdvanceMonth = (typeof advanceMonth === 'function') ? advanceMonth : null;
  if (_origAdvanceMonth) {
    advanceMonth = function () {
      _origAdvanceMonth();
      // после хода: применяем запланированные на наступивший месяц шоки
      const evs = G._strategyMode && G._strategyMode.events;
      if (evs) evs.forEach(ev => {
        if (ev.fired || ev.month !== G.month) return;
        const def = SHOCK_LIB[ev.type];
        if (!def) { ev.fired = true; return; }
        const res = def.apply(ev.params || {});
        ev.fired = true;
        addLog(`⚡ [Сценарий] ${def.label}: ${res}`, 'red');
        notify(`⚡ ${def.label}`, 'warning');
      });
    };
  }

  function openEventEditor() {
    if (!G._strategyMode) return;
    G._strategyMode.events = G._strategyMode.events || [];
    const opts = Object.entries(SHOCK_LIB).map(([id, d]) => `<option value="${id}">${d.label}</option>`).join('');
    const rows = G._strategyMode.events.map((e, i) => `
      <div style="display:flex;gap:6px;align-items:center;font-size:11px;padding:3px 0">
        <span style="color:${e.fired ? 'var(--muted)' : 'var(--amber)'}">M${e.month + 1} · ${SHOCK_LIB[e.type]?.label || e.type}${e.params?.pct ? ' (' + e.params.pct + '%)' : ''}${e.fired ? ' · ✓ сработало' : ''}</span>
        ${!e.fired ? `<button class="btn btn-xs btn-ghost" onclick="STRAT.removeEvent(${i})">✕</button>` : ''}
      </div>`).join('') || '<div style="font-size:11px;color:var(--sub)">Пока пусто — добавь шок ниже.</div>';

    _openModal('⚡ События сценария (фасилитатор)', `
      ${rows}
      <div style="display:flex;gap:6px;margin-top:12px;align-items:center;flex-wrap:wrap">
        <span style="font-size:11px;color:var(--sub)">Месяц</span>
        <input id="strat-ev-month" type="number" min="${G.month + 2}" value="${G.month + 2}"
          style="width:52px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:11px;padding:3px 6px">
        <select id="strat-ev-type" style="background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:11px;padding:3px 6px">${opts}</select>
        <input id="strat-ev-pct" type="number" placeholder="%" value="30"
          style="width:48px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:11px;padding:3px 6px">
        <button class="btn btn-xs" style="background:rgba(168,85,247,.15);color:rgba(168,85,247,.95);border:1px solid rgba(168,85,247,.4)"
          onclick="STRAT.addEvent()">+ Добавить</button>
      </div>
      <div style="font-size:10px;color:var(--muted);margin-top:8px">События применяются в конце указанного месяца. Действуют и в Monte-Carlo — стресс-тест стратегии с учётом запланированных шоков.</div>`);
  }

  function addEvent() {
    const month = Math.max(G.month + 1, (parseInt(_el('strat-ev-month')?.value, 10) || G.month + 2) - 1);
    const type  = _el('strat-ev-type')?.value;
    const pct   = parseInt(_el('strat-ev-pct')?.value, 10) || 30;
    if (!SHOCK_LIB[type]) return;
    G._strategyMode.events.push({ month, type, params: { pct }, fired: false });
    openEventEditor();
  }
  function removeEvent(i) { G._strategyMode.events.splice(i, 1); openEventEditor(); }

  // ════════════════════════════════════════════════════
  //  ОТЧЁТ-АРТЕФАКТ СЕССИИ (markdown, скачивается файлом)
  // ════════════════════════════════════════════════════
  function exportReport() {
    const sm = G._strategyMode || {};
    const m  = _metrics();
    const fmtM = n => Math.abs(n) >= 1e6 ? (n / 1e6).toFixed(2) + 'M₽' : Math.round(n / 1000) + 'K₽';
    const lines = [];
    lines.push(`# Отчёт стратегической сессии — ${sm.twin && sm.twin !== true ? sm.twin : 'BizTycoon'}`);
    lines.push(`Дата: ${new Date().toLocaleDateString('ru-RU')} · seed ${sm.seed} · горизонт ${sm.months} мес. · сыграно ${G.monthsPlayed} мес.\n`);
    lines.push(`## Текущая линия\n`);
    lines.push(`| Показатель | Значение |\n|---|---|`);
    lines.push(`| Баланс | **${fmtM(m.money)}** |`);
    lines.push(`| Репутация | ${m.rep} |`);
    lines.push(`| Штат / ФОТ | ${m.staff} чел. · ${fmtM(m.payroll)}/мес |`);
    lines.push(`| Активные контракты | ${m.active} |`);
    lines.push(`| Сдано / провалено | ${m.done} / ${m.failed} |\n`);

    const brs = _branches();
    if (brs.length) {
      lines.push(`## Ветки гипотез\n`);
      brs.forEach(b => {
        lines.push(`### ⑂ ${b.name} (развилка на M${b.month + 1})`);
        (b.results || []).forEach(r => {
          lines.push(`- **${r.label}** → финал ${fmtM(r.money)} · реп ${r.rep} · штат ${r.staff} · сдано ${r.done}/пров. ${r.failed} (M${r.month + 1})`);
        });
        if (!(b.results || []).length) lines.push(`- (исходы не зафиксированы)`);
        lines.push('');
      });
    }

    if (sm.lastMC) {
      const s = sm.lastMC;
      lines.push(`## Monte-Carlo (${s.runs} прогонов · ${s.horizon} мес. вперёд)\n`);
      lines.push(`- **Вероятность банкротства: ${s.bankruptPct}%**`);
      lines.push(`- **Медианный финал: ${fmtM(s.median)}** (P25 ${fmtM(s.p25)} · P75 ${fmtM(s.p75)} · диапазон ${fmtM(s.min)}…${fmtM(s.max)})`);
      lines.push(`- Кассовый разрыв (минимум ниже нуля): ${s.negCashPct}% прогонов`);
      lines.push(`- Месяц пикового напряжения: ${s.stressMonth ? 'M' + s.stressMonth : '—'} · средняя репутация ${s.avgRep} · сдано в среднем ${s.avgDone}\n`);
    }

    const evs = (sm.events || []);
    if (evs.length) {
      lines.push(`## Заложенные события сценария\n`);
      evs.forEach(e => lines.push(`- M${e.month + 1}: ${SHOCK_LIB[e.type]?.label || e.type}${e.fired ? ' ✓' : ''}`));
      lines.push('');
    }

    if (typeof DECISIONS !== 'undefined' && DECISIONS.length) {
      lines.push(`## Журнал решений (последние 30)\n`);
      DECISIONS.slice(-30).forEach(d => lines.push(`- ${d.label}: ${d.text}`));
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `strategy-report-${Date.now()}.md`;
    document.body.appendChild(a); a.click(); a.remove();
    notify('📄 Отчёт сессии скачан (.md)', 'success');
  }

  // ════════════════════════════════════════════════════
  //  UI — панель режима и модалка (DOM-инжект, ядро не трогаем)
  // ════════════════════════════════════════════════════
  function _el(id) { return document.getElementById(id); }

  function _ensureModal() {
    if (_el('strat-modal')) return;
    const div = document.createElement('div');
    div.id = 'strat-modal';
    div.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:300;align-items:center;justify-content:center';
    div.innerHTML = `<div style="background:var(--bg2);border:1px solid var(--border);border-radius:12px;
        max-width:720px;width:92%;max-height:84vh;overflow:auto;padding:18px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <b id="strat-modal-title" style="font-size:15px">🧭 Стратегическая сессия</b>
        <button class="btn btn-xs btn-ghost" onclick="STRAT.closeModal()">✕</button>
      </div>
      <div id="strat-modal-body"></div>
    </div>`;
    document.body.appendChild(div);
  }

  function _openModal(title, html) {
    _ensureModal();
    _el('strat-modal-title').textContent = title;
    _el('strat-modal-body').innerHTML = html;
    _el('strat-modal').style.display = 'flex';
  }
  function _closeModal() { const m = _el('strat-modal'); if (m) m.style.display = 'none'; }

  function openCompare(id) {
    const br = _branches().find(b => b.id === id);
    if (br) _openModal(`⑂ Сравнение — ${br.name}`, _compareHtml(br));
  }

  // Панель в правой колонке игрового экрана
  function _renderPanel() {
    const host = _el('btn-scout')?.parentElement;
    if (!host) return;
    let panel = _el('strat-panel');
    if (!G._strategyMode) { if (panel) panel.remove(); return; }
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'strat-panel';
      panel.style.cssText = 'margin-top:8px;padding:8px;border:1px solid rgba(168,85,247,.3);border-radius:8px;background:rgba(168,85,247,.06)';
      host.appendChild(panel);
    }
    const brs = _branches();
    panel.innerHTML = `
      <div style="font-size:11px;font-weight:700;color:rgba(168,85,247,.9);margin-bottom:6px">
        🧭 Сессия · seed ${G._strategyMode.seed} · горизонт ${G._strategyMode.months} мес.</div>
      <div style="display:flex;gap:4px;flex-wrap:wrap">
        <button class="btn btn-xs btn-ghost" onclick="STRAT.branchPrompt()">⑂ Развилка</button>
        <button class="btn btn-xs btn-ghost" onclick="STRAT.stampCurrentLine()">📌 Исход</button>
        <button class="btn btn-xs btn-ghost" onclick="STRAT.runMonteCarlo()">🎲 Monte-Carlo</button>
        <button class="btn btn-xs btn-ghost" onclick="STRAT.openEventEditor()">⚡ События</button>
        <button class="btn btn-xs btn-ghost" onclick="STRAT.exportReport()">📄 Отчёт</button>
      </div>
      ${brs.length ? `<div style="margin-top:6px;display:flex;flex-direction:column;gap:3px">` +
        brs.map(b => `<div style="display:flex;gap:4px;align-items:center;font-size:10px">
          <span style="flex:1;color:var(--sub)">⑂ ${b.name} · M${b.month + 1} · исходов: ${(b.results || []).length}</span>
          <button class="btn btn-xs btn-ghost" style="padding:1px 6px" onclick="STRAT.openBranch('${b.id}')">↩</button>
          <button class="btn btn-xs btn-ghost" style="padding:1px 6px" onclick="STRAT.openCompare('${b.id}')">⚖</button>
        </div>`).join('') + '</div>' : ''}`;
  }

  function branchPrompt() {
    const name = prompt('Название развилки (напр. «Февраль: вопрос найма»):');
    if (name === null) return;
    createBranch(name);
    const arr = _branches();
    markCurrentBranch(arr[arr.length - 1].id);
  }

  // ── Карточка режима на экране выбора специализации ──
  function _renderModeCard() {
    const specGrid = document.querySelector('.spec-grid');
    if (!specGrid || _el('strat-mode-card')) return;
    const card = document.createElement('div');
    card.id = 'strat-mode-card';
    card.style.cssText = 'margin:0 0 16px;padding:10px 14px;border:1px dashed rgba(168,85,247,.4);border-radius:10px;background:rgba(168,85,247,.05);display:flex;gap:10px;align-items:center;flex-wrap:wrap';
    card.innerHTML = `
      <span style="font-size:12px;color:rgba(168,85,247,.9);font-weight:700">🧭 Стратегическая сессия (B2B)</span>
      <span style="font-size:11px;color:var(--sub);flex:1">детерминированный seed · импорт двойника компании · ветки гипотез</span>
      <label class="btn btn-xs btn-ghost" style="cursor:pointer">📥 Двойник (JSON)
        <input type="file" accept=".json" style="display:none" onchange="STRAT.loadTwinFile(this)"></label>
      <input id="strat-seed" type="number" placeholder="seed" value="42"
        style="width:64px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:11px;padding:3px 6px">
      <input id="strat-months" type="number" placeholder="мес" value="6"
        style="width:48px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:11px;padding:3px 6px">
      <button class="btn btn-xs" style="background:rgba(168,85,247,.15);color:rgba(168,85,247,.95);border:1px solid rgba(168,85,247,.4)"
        onclick="STRAT.startSession()">▶ Начать сессию</button>
      <span id="strat-twin-status" style="font-size:10px;color:var(--sub);width:100%"></span>`;
    specGrid.parentElement.insertBefore(card, specGrid);
  }

  function loadTwinFile(input) {
    const f = input.files && input.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        const errs = _validateTwin(data);
        const st = _el('strat-twin-status');
        if (errs.length) {
          _twin = null;
          if (st) { st.style.color = 'var(--red)'; st.textContent = '⚠ ' + errs.slice(0, 3).join(' · '); }
        } else {
          _twin = data;
          if (st) { st.style.color = 'var(--green)';
            st.textContent = `✓ ${data.company || 'Компания'}: ${(data.staff || []).length} чел., ${(data.contracts || []).length} контрактов, ${Math.round(data.money / 1000)}K на счёте`; }
        }
      } catch (e) {
        _twin = null;
        const st = _el('strat-twin-status');
        if (st) { st.style.color = 'var(--red)'; st.textContent = '⚠ Невалидный JSON: ' + e.message; }
      }
    };
    reader.readAsText(f);
  }

  function startSession() {
    const seed   = parseInt(_el('strat-seed')?.value, 10) || 42;
    const months = Math.max(3, Math.min(36, parseInt(_el('strat-months')?.value, 10) || 6));
    if (!G.spec) {
      const first = Object.keys(SPECS)[0];
      if (typeof selectSpec === 'function') selectSpec(first);
    }
    if (_twin) _applyTwin(_twin);
    else SCENARIO.settings.winCondition = Infinity;

    startGame();
    _activateRNG(seed);
    G._strategyMode = { seed, months, twin: _twin ? (_twin.company || true) : false };
    if (_twin) _injectTwinState(_twin);
    addLog(`🧭 Стратегическая сессия: seed ${seed}, горизонт ${months} мес.`, 'purple');
    EventBus.emit('render');
  }

  // ── Горизонт сессии: мягкая остановка с отчётом ──
  function _checkHorizon() {
    if (!G._strategyMode) return;
    if (G.monthsPlayed === G._strategyMode.months && !G._strategyHorizonShown) {
      G._strategyHorizonShown = true;
      const m = _metrics();
      _openModal('🏁 Горизонт сессии достигнут', `
        <div style="font-size:13px;line-height:1.6">
          <b>${G._strategyMode.months} мес. сыграно.</b> Ключевые показатели линии:<br>
          💰 Баланс: <b>${Math.round(m.money / 1000)}K</b> · ⭐ Репутация: <b>${m.rep}</b> ·
          👥 Штат: <b>${m.staff}</b> (ФОТ ${Math.round(m.payroll / 1000)}K/мес)<br>
          📦 Сдано: <b>${m.done}</b> · провалено: <b>${m.failed}</b> · активных: <b>${m.active}</b><br><br>
          <span style="color:var(--sub);font-size:12px">Зафиксируй исход (📌) для сравнения веток —
          или продолжай играть дальше за горизонтом.</span>
        </div>`);
    }
  }

  // ════════════════════════════════════════════════════
  //  ИНИЦИАЛИЗАЦИЯ — только подписки, ядро не трогаем
  // ════════════════════════════════════════════════════
  function init() {
    EventBus.on('render',   () => { _renderModeCard(); _renderPanel(); _checkHorizon(); });
    EventBus.on('navigate', () => setTimeout(_renderModeCard, 0));
    // На случай, если экран спеков уже отрисован к моменту загрузки DLC
    setTimeout(_renderModeCard, 200);
    console.log('🧭 Strategy DLC загружен');
  }

  init();

  return {
    startSession, loadTwinFile,
    branchPrompt, createBranch, openBranch, openCompare, stampCurrentLine,
    runMonteCarlo, openEventEditor, addEvent, removeEvent, exportReport,
    closeModal: _closeModal,
    _seededRandom, // для тестов
  };
})();
