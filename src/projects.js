// ══════════════════════════════════════════════════════
//  projects.js — Project Lifecycle Module
//  Флоу проектов F1–F10 (design_project_lifecycle.md v0.3)
//
//  _negotiationTier:
//    'quick'     — 2 решения, бриф/планирование пропускаются
//    'standard'  — 4-5 решений: бриф (1 событие) + планирование
//    'challenge' — 5-шаговый пинг-понг переговоров + стандартный хвост
// ══════════════════════════════════════════════════════

const Projects = (() => {

  // ── Все возможные фазы по порядку ─────────────────────
  const ALL_PHASES = [
    'proposal',      // F1
    'negotiation',   // F2
    'brief',         // F3
    'legal',         // F4 — опционально, buildPhaseChain отфильтрует
    'planning',      // F5
    'work_0',        // F6
    'work_1',        // F7
    'work_2',        // F8
    'work_3',        // F8b — высокие тиры (v3.0)
    'work_4',        // F8c — эпические проекты (v3.0)
    'review',        // F9
    'delivery',      // F10
  ];

  const PHASE_LABELS = {
    proposal:    'КП',
    negotiation: 'Переговоры',
    brief:       'Бриф',
    legal:       'Юридика',
    planning:    'Планирование',
    work_0:      'Работа I',
    work_1:      'Работа II',
    work_2:      'Работа III',
    work_3:      'Работа IV',
    work_4:      'Работа V',
    review:      'Ревью',
    delivery:    'Сдача',
  };

  const PHASE_ICONS = {
    proposal:    '📝',
    negotiation: '🤝',
    brief:       '📋',
    legal:       '⚖️',
    planning:    '📌',
    work_0:      '▶',
    work_1:      '▶',
    work_2:      '▶',
    work_3:      '▶',
    work_4:      '▶',
    review:      '🔍',
    delivery:    '🏁',
  };

  // ── Арт-иллюстрации для каждой фазы ────────────────────
  const PHASE_ART = {
    proposal: {
      artGradient: 'linear-gradient(135deg, #080e1f 0%, #0d1a38 50%, #08101e 100%)',
      artIcon:     '📝',
      atmosphere:  'Белый лист и чистый шанс — первое впечатление формируется сейчас',
    },
    negotiation: {
      artGradient: 'linear-gradient(135deg, #120e05 0%, #1e1505 60%, #12100a 100%)',
      artIcon:     '🤝',
      atmosphere:  'Переговорный стол: каждая пауза что-то стоит',
    },
    brief: {
      artGradient: 'linear-gradient(135deg, #180900 0%, #2a1100 55%, #180a00 100%)',
      artIcon:     '📋',
      atmosphere:  'Бриф — договор о реальности: что хочет клиент vs. что возможно',
    },
    legal: {
      artGradient: 'linear-gradient(135deg, #080e12 0%, #0d1720 55%, #080c10 100%)',
      artIcon:     '⚖️',
      atmosphere:  'Юридика скучная, но именно она спасает в нужный момент',
    },
    planning: {
      artGradient: 'linear-gradient(135deg, #001218 0%, #001e26 55%, #001318 100%)',
      artIcon:     '📐',
      atmosphere:  'Дорожная карта ещё не реальность — но без неё дорога не начнётся',
    },
    review: {
      artGradient: 'linear-gradient(135deg, #181000 0%, #261800 55%, #181000 100%)',
      artIcon:     '🔍',
      atmosphere:  'Момент истины: клиент смотрит, команда ждёт, балансы сходятся',
    },
    delivery: {
      artGradient: 'linear-gradient(135deg, #001400 0%, #001e00 55%, #001400 100%)',
      artIcon:     '🚀',
      atmosphere:  'Финальный аккорд — всё вложенное переходит в руки клиента',
    },
  };

  // ── Профили цепочек (v3.0): длина флоу зависит от масштаба проекта ──
  // instant  — разовые/микро: подписал → 1 work-фаза → сдача (без ревью)
  // short    — T1: лёгкие переговоры, 1 work-фаза, ревью
  // standard — T2–T3: бриф + планирование, 2 work-фазы
  // full     — T4–T5: + юридика, 3 work-фазы
  // epic     — T6–T7: 5 work-фаз, полный контрактный цикл
  const CHAIN_PROFILES = {
    instant:  ['proposal', 'work_0', 'delivery'],
    short:    ['proposal', 'negotiation', 'work_0', 'review', 'delivery'],
    standard: ['proposal', 'negotiation', 'brief', 'planning', 'work_0', 'work_1', 'review', 'delivery'],
    full:     ['proposal', 'negotiation', 'brief', 'legal', 'planning', 'work_0', 'work_1', 'work_2', 'review', 'delivery'],
    epic:     ['proposal', 'negotiation', 'brief', 'legal', 'planning', 'work_0', 'work_1', 'work_2', 'work_3', 'work_4', 'review', 'delivery'],
  };

  function defaultProfile(def) {
    if (def.oneTime) return 'instant';
    const t = def.tier || 1;
    return t <= 1 ? 'short' : t <= 3 ? 'standard' : t <= 5 ? 'full' : 'epic';
  }

  // ── Строим цепочку фаз для конкретного проекта ─────────
  function buildPhaseChain(def) {
    const profile   = def.phaseProfile || defaultProfile(def);
    const needLegal = def.requiresLegal || hasRole('lawyer');
    let chain = [...(CHAIN_PROFILES[profile] || CHAIN_PROFILES.standard)];
    // Юридика — только если требуется проектом или в штате есть юрист
    if (!needLegal) chain = chain.filter(p => p !== 'legal');
    return chain;
  }

  // ── Инициализировать LC-стейт на объекте клиента ───────
  function initLCState(client) {
    const chain = buildPhaseChain(client);
    client._lcChain       = chain;
    client._lcPhaseIdx    = 0;
    client._lcPhase       = chain[0];     // 'proposal'
    client._lcTags        = {};           // накопленные теги из решений
    // Стартовое настроение — от npsStart проекта (единая система оценки клиента):
    // дифференциация клиентов (lc_simple 78, lc_risky 58) работает и в LC-флоу
    client._lcClientMood  = client.npsStart ?? 60;  // настроение клиента 0–100
    client._lcRisk        = 0;            // риск проекта 0–100
    client._lcQualityAcc  = 0;            // накопленное качество 0–100
    client._lcHistory     = [];           // лог: [{ phase, month, choice, effect }]
    client._lcQualityBonus = 0;           // бонус к качеству работы из ранних фаз
    // Базовые параметры до переговоров (для справки)
    client._lcBudgetBase   = client._totalBudget;
    client._lcTimelineBase = client._duration;
    client._assignedStaff  = client._assignedStaff || []; // назначенные сотрудники (WU-система)
  }

  // ── Перейти к следующей фазе ────────────────────────────
  function advancePhase(client) {
    const chain     = client._lcChain;
    const prevPhase = client._lcPhase;
    const nextIdx   = (client._lcPhaseIdx || 0) + 1;

    // п.27: поэтапная оплата — треть бюджета при завершении каждой work-фазы.
    // Гард _stagedPaid<3 защищает от повторной выплаты при возврате на правки.
    if (prevPhase && prevPhase.startsWith('work_') && hasTag(client, 'payment_staged')
        && (client._stagedPaid || 0) < 3) {
      const third = Math.round((client._originalBudget || client._totalBudget || 0) / 3 / 5000) * 5000;
      const payout = Math.min(third, client._totalBudget || 0);
      if (payout > 0) {
        client._totalBudget = Math.max(0, (client._totalBudget || 0) - payout);
        client._stagedPaid  = (client._stagedPaid || 0) + 1;
        G.money += payout;
        addLog(`💵 ${client.name}: поэтапная выплата ${client._stagedPaid}/3 — +${fmtK(payout)}`, 'green');
        notify(`💵 ${client.icon} ${client.name}: этап ${client._stagedPaid}/3 оплачен — +${fmtK(payout)}`, 'success');
        rd(`Этап ${client._stagedPaid}/3: ${client.name} +${fmtK(payout)}`, 'client');
      }
    }

    if (nextIdx >= chain.length) {
      finishDelivery(client);
      return;
    }

    client._lcPhaseIdx = nextIdx;
    client._lcPhase    = chain[nextIdx];
    client._phaseActionsUsed = {};  // Р.5: сброс кулдауна при смене фазы

    // Work-фазы: проект начинает тикать, поп-ап не нужен
    if (client._lcPhase.startsWith('work_')) {
      // Фиксируем момент старта первой work-фазы — для корректного дедлайн-отсчёта
      if (client._lcPhase === 'work_0' && client._workStartMonth == null) {
        client._workStartMonth = client._monthsSigned || 0;
      }
      // п.28: quick-цепочка не имеет фазы планирования — автоназначаем
      // свободных сотрудников при входе в work_0, иначе проект тянет один фаундер
      if (client._lcPhase === 'work_0' && !(client._assignedStaff || []).length
          && !chain.includes('planning') && typeof assignStaffToProject === 'function') {
        const free = (G.staff || []).filter(s => s.status !== 'fired' && !s._assignedProjectId);
        if (free.length) {
          free.forEach(s => assignStaffToProject(s._iid || s.id, client.id));
          addLog(`📌 ${client.name}: свободная команда (${free.length} чел.) подключена автоматически`, 'teal');
        }
      }
      addLog(`▶ ${client.name}: ${PHASE_LABELS[client._lcPhase]} — работа началась`, 'teal');
      _emitRender();
      return;
    }

    // Review/Delivery и event-фазы — сразу открываем поп-ап
    showPhasePopup(client);
  }

  // ── Ф.3: авто-переговоры переговорщиком ──────────────────
  // Применяет условия сделки по грейду спеца и пропускает фазы
  // КП (proposal) + Переговоры (negotiation), сажая проект на след. фазу.
  function autoResolveNegotiation(client, neg) {
    const grade = (neg && neg.grade) || 'middle';
    const T = ({
      junior: { budgetMul: 0.92, mood: -2, risk:  3, q: 0, advance: 0    },
      middle: { budgetMul: 1.00, mood:  0, risk:  0, q: 0, advance: 0    },
      senior: { budgetMul: 1.00, mood:  3, risk: -2, q: 2, advance: 0.15 },
      lead:   { budgetMul: 1.04, mood:  5, risk: -4, q: 3, advance: 0.20 },
      star:   { budgetMul: 1.08, mood:  8, risk: -6, q: 5, advance: 0.25 },
    })[grade] || { budgetMul: 1, mood: 0, risk: 0, q: 0, advance: 0 };

    client._totalBudget    = Math.round((client._totalBudget || 0) * T.budgetMul / 1000) * 1000;
    client._originalBudget = client._totalBudget;
    if (T.mood) moodDelta(client, T.mood);
    if (T.risk) riskDelta(client, T.risk);
    if (T.q)    client._lcQualityBonus = (client._lcQualityBonus || 0) + T.q;
    applyTag(client, 'neg_auto', { grade });

    // Аванс (предоплата) для senior+ — выбивается переговорщиком
    if (T.advance > 0) {
      const adv = Math.round((client._totalBudget || 0) * T.advance / 1000) * 1000;
      if (adv > 0) {
        client._totalBudget = Math.max(0, client._totalBudget - adv);
        if (typeof G !== 'undefined') G.money += adv;
        addLog(`💰 ${client.name}: аванс ${Math.round(T.advance * 100)}% выбит переговорщиком — +${fmtK(adv)}`, 'green');
      }
    }
    logDecision(client, 'negotiation', `Авто-переговоры (${grade})`, `бюджет ×${T.budgetMul}${T.advance ? ` · аванс ${Math.round(T.advance * 100)}%` : ''}`);

    // Пропуск proposal+negotiation → след. фаза после 'negotiation'
    const chain = client._lcChain || [];
    let idx = chain.indexOf('negotiation');
    if (idx < 0) idx = chain.indexOf('proposal');
    if (idx < 0) idx = 0;
    const nextIdx = Math.min(idx + 1, chain.length - 1);
    client._lcPhaseIdx = nextIdx;
    client._lcPhase    = chain[nextIdx];
    client._phaseActionsUsed = {};
    addLog(`💼 ${client.name}: переговоры закрыл переговорщик (${grade}) — далее ${PHASE_LABELS[client._lcPhase] || client._lcPhase}`, 'teal');

    if (client._lcPhase && client._lcPhase.startsWith('work_')) {
      if (client._workStartMonth == null) client._workStartMonth = client._monthsSigned || 0;
    }
    // Бриф/юридику игрок открывает сам с карточки (кнопка фазы) — не навязываем поп-ап
    _emitRender();
  }

  // ── Применить/проверить тег ─────────────────────────────
  function applyTag(client, tag, data = {}) {
    if (tag) client._lcTags[tag] = Object.assign({ month: G.month }, data);
  }

  function hasTag(client, tag) {
    return !!(client._lcTags && client._lcTags[tag]);
  }

  function moodDelta(client, delta) {
    client._lcClientMood = Math.max(0, Math.min(100, (client._lcClientMood || 60) + delta));
    // Зеркало в clientNPS (фикс п.26 + «Промежуточный показ»): карточка проекта
    // и все старые механики читают clientNPS — без синка изменение настроения
    // не было видно игроку и не влияло на churn-проверку
    if (typeof G !== 'undefined' && G.clientNPS) G.clientNPS[client.id] = client._lcClientMood;
  }

  function riskDelta(client, delta) {
    client._lcRisk = Math.max(0, Math.min(100, (client._lcRisk || 0) + delta));
  }

  function logDecision(client, phase, choice, effect) {
    (client._lcHistory = client._lcHistory || []).push({ phase, month: G.month, choice, effect });
  }

  // ══════════════════════════════════════════════════════
  //  LC POP-UP ENGINE
  // ══════════════════════════════════════════════════════

  let _lcState = null; // { client, step, ... }

  // Ф.1: выход из переговоров с возвратом на тот же шаг. При выходе сохраняем
  // снимок _lcState на клиенте; при повторном входе в ту же фазу — резюмим.
  function _exitLCFlow() {
    if (_lcState && _lcState.client) {
      const c = _lcState.client;
      const snap = Object.assign({}, _lcState);
      delete snap.client;
      c._lcResume = { phase: c._lcPhase, snap };
    }
    _closeLCModal();
    try { EventBus.emit('render'); } catch (_) {}
  }
  function _consumeResume(client, phase) {
    if (client && client._lcResume && client._lcResume.phase === phase) {
      const snap = client._lcResume.snap || {};
      client._lcResume = null;
      return snap;
    }
    return null;
  }

  function showPhasePopup(client) {
    switch (client._lcPhase) {
      case 'proposal':    _showProposal(client);    break;
      case 'negotiation': _showNegotiation(client); break;
      case 'brief':       _showBrief(client);       break;
      case 'legal':       _showLegal(client);       break;
      case 'planning':    _showPlanning(client);    break;
      case 'review':      _showReview(client);      break;
      case 'delivery':    finishDelivery(client);   break;
      default: break;
    }
  }

  // Главный рендер LC-модалки
  function _showLCModal({ client, icon, title, phaseLabel, body, choices, artGradient, artIcon, atmosphere, exitable }) {
    // Auto-inject phase art if caller didn't provide explicit art
    if (!artGradient && client?._lcPhase && PHASE_ART[client._lcPhase]) {
      const pa = PHASE_ART[client._lcPhase];
      artGradient = pa.artGradient;
      artIcon     = pa.artIcon;
      atmosphere  = pa.atmosphere;
    }

    const modal = document.getElementById('lc-modal');
    if (!modal) return;

    const mood = Math.round(client?._lcClientMood ?? 60);
    const risk = Math.round(client?._lcRisk ?? 0);
    const moodCol = mood >= 70 ? 'var(--green)' : mood >= 45 ? 'var(--amber)' : 'var(--red)';
    const riskCol = risk >= 60 ? 'var(--red)' : risk >= 30 ? 'var(--amber)' : 'var(--teal)';

    // Art-header block для work-событий (gradient + icon + atmosphere)
    const artHeaderHtml = artGradient ? `
      <div style="margin:-16px -16px 14px;height:110px;border-radius:10px 10px 0 0;
                  background:${artGradient};position:relative;display:flex;
                  flex-direction:column;align-items:center;justify-content:center;gap:4px;
                  overflow:hidden">
        <div style="position:absolute;inset:0;background:radial-gradient(circle at 50% 60%,rgba(255,255,255,.03),transparent 70%)"></div>
        <span style="font-size:36px;line-height:1;position:relative">${artIcon || icon}</span>
        ${atmosphere ? `<span style="font-size:11px;color:rgba(255,255,255,.5);font-style:italic;
                                     text-align:center;max-width:80%;position:relative">${atmosphere}</span>` : ''}
      </div>` : '';

    // Иконку скрываем если есть art-header (она переезжает туда)
    const iconEl = document.getElementById('lc-modal-icon');
    if (iconEl) iconEl.style.display = artGradient ? 'none' : '';
    if (iconEl && !artGradient) iconEl.textContent = icon || '📝';

    document.getElementById('lc-modal-phase').textContent = phaseLabel || '';
    document.getElementById('lc-modal-title').textContent = title || '';
    document.getElementById('lc-modal-body').innerHTML    = artHeaderHtml + (body || '');
    document.getElementById('lc-mood-val').innerHTML =
      `<span style="color:${moodCol};font-weight:700">😊 ${mood}</span>`;
    document.getElementById('lc-risk-val').innerHTML =
      `<span style="color:${riskCol};font-weight:700">⚠️ ${risk}</span>`;

    // Pre-work фазы: автоматически добавляем кнопку «Отказаться от проекта»
    const _preWorkPhases = ['proposal','negotiation','brief','legal','planning'];
    const _allChoices = [...(choices || [])];
    if (client?._lcPhase && _preWorkPhases.includes(client._lcPhase)) {
      _allChoices.push({
        text: 'Отказаться от проекта',
        desc: 'Прекратить сотрудничество на этой стадии.',
        effect: '−3 репутации',
        _danger: true,
        fn: () => _abandonProject(client),
      });
    }

    const choicesEl = document.getElementById('lc-modal-choices');
    choicesEl.innerHTML = '';
    if (exitable) {
      const ex = document.createElement('button');
      ex.className = 'modal-choice';
      ex.style.cssText = 'border-color:rgba(148,163,184,.25);background:rgba(255,255,255,.02);color:var(--sub);margin-bottom:6px';
      ex.innerHTML = '<div class="choice-title">↩ Выйти (вернуться к этому шагу позже)</div>'
        + '<div class="choice-desc" style="margin-top:3px;line-height:1.4">Прогресс переговоров сохранится — продолжите с текущего вопроса.</div>';
      ex.onclick = () => _exitLCFlow();
      choicesEl.appendChild(ex);
    }
    _allChoices.forEach(ch => {
      const btn = document.createElement('button');
      btn.className = 'modal-choice';
      if (ch.disabled) {
        btn.disabled = true;
        btn.style.cssText = 'opacity:0.38;cursor:not-allowed';
      } else if (ch._danger) {
        btn.style.cssText = 'border-color:rgba(239,68,68,.3);background:rgba(239,68,68,.04);color:var(--red);margin-top:4px';
      } else if (ch.highlight) {
        btn.style.cssText = 'border-color:rgba(45,212,191,.4);background:rgba(45,212,191,.06)';
      }
      btn.innerHTML = `
        <div class="choice-title">${ch.text}</div>
        ${ch.desc ? `<div class="choice-desc" style="margin-top:3px;line-height:1.4">${ch.desc}</div>` : ''}
        ${ch.effect ? `<div style="margin-top:4px;font-size:10px;color:var(--muted);font-style:italic">${ch.effect}</div>` : ''}
      `;
      btn.onclick = ch.disabled ? null : ch.fn;
      choicesEl.appendChild(btn);
    });

    modal.classList.add('active');
  }

  function _closeLCModal() {
    const m = document.getElementById('lc-modal');
    if (m) m.classList.remove('active');
  }

  // Отказ от проекта на pre-work стадии
  function _abandonProject(client) {
    _closeLCModal();
    const pen = 3;
    if (typeof G !== 'undefined') {
      G.reputation = Math.max(0, (G.reputation || 50) - pen);
      if (typeof releaseProjectTeam === 'function') releaseProjectTeam(client.id); // Б.9
      G.activeClients = G.activeClients.filter(a => a.id !== client.id);
      if (G.clientNPS) delete G.clientNPS[client.id];
    }
    const phaseLabel = (typeof PHASE_LABELS !== 'undefined' && PHASE_LABELS[client._lcPhase])
      || client._lcPhase || 'ранней стадии';
    if (typeof addLog === 'function')
      addLog(`🚫 ${client.name}: отказ на стадии «${phaseLabel}» — −${pen} репутации`, 'amber');
    if (typeof notify === 'function')
      notify(`${client.icon || ''} ${client.name} — проект отменён`, 'error');
    _emitRender();
  }

  // ══════════════════════════════════════════════════════
  //  F1 — PROPOSAL (КП)
  //  Три режима в зависимости от _negotiationTier:
  //    quick     — 1 вопрос (только позиционирование)
  //    standard  — 2 вопроса (позиционирование + сроки)
  //    challenge — 5-шаговый пинг-понг переговоров
  // ══════════════════════════════════════════════════════

  // Вопросы для standard-режима (2 из 3)
  const F1_QUESTIONS = [
    {
      key: 'positioning',
      icon: '📢', title: 'Позиционирование в КП',
      body: 'Как позиционировать агентство в коммерческом предложении?',
      choices: [
        {
          text: 'Давим на экспертизу',
          desc: 'Показываем кейсы и компетенции — клиент видит специалистов.',
          effect: '+5 настроения · +5 риска',
          tag: 'authority_pitch', mood: +5, risk: +5,
        },
        {
          text: 'Давим на цену (−10%)',
          desc: 'Снижаем ставку. Берём лояльностью, теряем маржу.',
          effect: 'Бюджет −10% · +10 настроения',
          tag: 'price_pitch', budgetPct: -0.10, mood: +10,
        },
        {
          text: 'Нейтрально, стандартное КП',
          desc: 'Без особых акцентов. Предсказуемо и без рисков.',
          effect: 'Без эффектов',
          tag: null,
        },
      ],
    },
    {
      key: 'timeline',
      icon: '📅', title: 'Сроки в КП',
      body: 'Какие сроки предложим клиенту?',
      choices: [
        {
          text: 'Реалистичные (×1.0)',
          desc: 'Честный прогноз. Без давления на команду.',
          effect: 'Без эффектов',
          tag: null,
          highlight: true,
        },
        {
          text: 'Агрессивные (−20%)',
          desc: 'Обещаем быстрее — клиент доволен, но давление растёт.',
          effect: 'Сроки −20% · +8 настроения · +15 риска',
          tag: 'tight_deadline', timelinePct: -0.20, mood: +8, risk: +15,
        },
        {
          text: 'С запасом (+30%)',
          desc: 'Берём буфер. Клиент ждёт дольше, зато дышим.',
          effect: 'Сроки +30% · −5 настроения',
          tag: 'padded_timeline', timelinePct: +0.30, mood: -5,
        },
      ],
    },
  ];

  // ─── Пинг-понг переговоров (challenge-tier) ──────────
  const CHALLENGE_FLOW = [
    {
      id: 'reaction',
      icon: '📬', title: 'Первый контакт',
      clientLine: 'Мы изучили ваше КП. Интересная работа. Но прежде чем двигаться дальше — несколько вопросов.',
      body: 'Клиент готов к диалогу, но настроен критично.',
      choices: [
        { text: 'Слушаем — готовы к диалогу', desc: 'Открытая позиция. Клиент чувствует партнёрство.', effect: '+5 настроения', mood: +5 },
        { text: 'Назовите ваши главные критерии', desc: 'Стратегический вопрос — помогает понять приоритеты.', effect: '+3 настроения · риск −3', mood: +3, risk: -3, highlight: true },
        { text: 'Уверены в нашем КП — задавайте', desc: 'Сильная позиция, клиент ждёт гибкости.', effect: '+5 риска', risk: +5 },
      ],
    },
    {
      id: 'timeline',
      icon: '⏱', title: 'Сроки под давлением',
      clientLine: 'Ваши сроки выглядят завышенными. Конкуренты называли вдвое меньше.',
      body: 'Клиент давит на скорость, апеллируя к рынку.',
      choices: [
        { text: 'Сократим на 15% — возьмём дополнительный риск', desc: 'Идём навстречу, рискуем качеством.', effect: 'Сроки −15% · +20 риска', timelinePct: -0.15, risk: +20 },
        { text: 'Быстрее — значит хуже или дороже. Покажем примеры', desc: 'Защищаем позицию с аргументами.', effect: '+8 настроения', mood: +8, highlight: true },
        { text: 'Мобилизуем команду, дадим ускорение', desc: 'Конкретное обещание, жёсткий темп.', effect: 'Сроки −20% · +25 риска · +5 настроения', timelinePct: -0.20, risk: +25, mood: +5, tag: 'tight_deadline' },
      ],
    },
    {
      id: 'budget',
      icon: '💰', title: 'Ценовое давление',
      clientLine: 'Бюджет у нас ограничен. Рассчитывали на 15–20% меньше вашей цены.',
      body: 'Клиент пытается выбить скидку. Как реагируем?',
      choices: [
        { text: 'Снизим на 10% — скорректируем объём', desc: 'Честный обмен: меньше цена, меньше объём.', effect: 'Бюджет −10%', budgetPct: -0.10 },
        { text: 'Предложим MVP первым этапом', desc: 'Минимальная версия за их бюджет + масштабирование после.', effect: '+5 настроения', mood: +5, tag: 'mvp_proposed' },
        { text: 'Держим цену — покажем ROI', desc: 'Оцифруем ценность: клиент видит возврат на инвестиции.', effect: '+8 настроения · +5% качество', mood: +8, qualityBonus: +5, highlight: true },
      ],
    },
    {
      id: 'team',
      icon: '👥', title: 'Вопрос о команде',
      clientLine: 'Нам важно знать кто конкретно работает над проектом. Что готовы предложить?',
      body: 'Клиент хочет конкретных людей, а не абстрактную "команду".',
      choices: [
        { text: 'Назначим арт-директора и ведущего специалиста', desc: 'Конкретные имена — клиент спокоен.', effect: '+8 настроения · +5% качество', mood: +8, qualityBonus: +5, tag: 'real_team_shown', highlight: true },
        { text: 'Соберём команду под задачу, покажем профили на старте', desc: 'Гибкость без жёстких обязательств сейчас.', effect: '+3 настроения', mood: +3 },
        { text: 'Сначала договор, потом детали по команде', desc: 'Неудобная позиция для клиента.', effect: '−5 настроения · +5 риска', mood: -5, risk: +5, tag: 'no_team_in_kp' },
      ],
    },
    {
      id: 'checkpoint',
      icon: '🔍', title: 'Промежуточный контроль',
      clientLine: 'Хотим точку контроля: если промежуточный результат не устроит — возможность скорректировать.',
      body: 'Клиент хочет гарантию выхода. Ваши условия?',
      choices: [
        { text: 'Добавим milestone-ревью после первой рабочей фазы', desc: 'Промежуточный показ с правом корректировки.', effect: '+5 настроения · +8 риска', mood: +5, risk: +8 },
        { text: 'Расширенное ТЗ + чёткие критерии приёмки', desc: 'Защищаемся документами, а не паузами.', effect: '+3 настроения · −5 риска', mood: +3, risk: -5, highlight: true, tag: 'detailed_tz' },
        { text: 'Стандартный контракт — ревью по завершении', desc: 'Держим стандарт, клиент не полностью доволен.', effect: '−5 настроения · +5 риска', mood: -5, risk: +5 },
      ],
    },
  ];

  function _showProposal(client) {
    // Разовые и микро-проекты — всегда быстрый вариант (1 комбинированный вопрос)
    const tier = client.oneTime ? 'quick' : (client._negotiationTier || 'standard');
    const r = _consumeResume(client, 'proposal');
    _lcState = r ? Object.assign({ client }, r) : { client, step: 0 };
    const at = _lcState.step || 0;
    if (tier === 'quick') {
      _showProposalQuick(client);
    } else if (tier === 'challenge') {
      _showChallengeStep(at);
    } else {
      _showProposalStep(at);
    }
  }

  // ─── Quick: один комбинированный вопрос ─────────────
  function _showProposalQuick(client) {
    _showLCModal({
      client,
      icon: '📝', title: 'Коммерческое предложение',
      phaseLabel: `${client.icon} ${client.name}  ·  КП`,
      body: `<span style="color:var(--sub)">Как подать агентство в КП? Выберите основной акцент.</span>`,
      choices: [
        {
          text: 'Давим на экспертизу',
          desc: 'Кейсы и компетенции на первом плане.',
          effect: '+5 настроения · +5 риска',
          fn: () => {
            applyTag(client, 'authority_pitch'); moodDelta(client, +5); riskDelta(client, +5);
            logDecision(client, 'proposal', 'Экспертиза в КП', '+5 настроения · +5 риска');
            _closeLCModal(); addLog(`📝 ${client.name}: КП отправлено`, 'teal'); advancePhase(client);
          },
        },
        {
          text: 'Давим на цену (−10%)',
          desc: 'Лояльность за счёт маржи.',
          effect: 'Бюджет −10% · +10 настроения',
          fn: () => {
            applyTag(client, 'price_pitch');
            client._totalBudget = Math.round(client._totalBudget * 0.90);
            moodDelta(client, +10);
            logDecision(client, 'proposal', 'Цена в КП −10%', 'Бюджет −10% · +10 настроения');
            _closeLCModal(); addLog(`📝 ${client.name}: КП отправлено`, 'teal'); advancePhase(client);
          },
        },
        {
          text: 'Нейтрально',
          desc: 'Стандартное предложение, без особых акцентов.',
          effect: 'Без эффектов',
          highlight: true,
          fn: () => {
            logDecision(client, 'proposal', 'Нейтральное КП', 'Без эффектов');
            _closeLCModal(); addLog(`📝 ${client.name}: КП отправлено`, 'teal'); advancePhase(client);
          },
        },
      ],
    });
  }

  // ─── Standard: 2 вопроса подряд ─────────────────────
  function _showProposalStep(stepIdx) {
    const { client } = _lcState;
    const q     = F1_QUESTIONS[stepIdx];
    const total = F1_QUESTIONS.length;

    _showLCModal({
      client,
      icon:       q.icon,
      title:      q.title,
      phaseLabel: `${client.icon} ${client.name}  ·  КП — ${stepIdx + 1}/${total}`,
      exitable:   true,
      body:       `<span style="color:var(--sub)">${q.body}</span>`,
      choices:    q.choices.map(ch => ({
        text: ch.text, desc: ch.desc, effect: ch.effect, highlight: ch.highlight,
        fn: () => {
          applyTag(client, ch.tag);
          if (ch.mood)         moodDelta(client, ch.mood);
          if (ch.risk)         riskDelta(client, ch.risk);
          if (ch.budgetPct)    client._totalBudget = Math.round(client._totalBudget * (1 + ch.budgetPct));
          if (ch.timelinePct)  client._duration    = Math.max(1, Math.round(client._duration * (1 + ch.timelinePct)));
          if (ch.qualityBonus) client._lcQualityBonus = (client._lcQualityBonus || 0) + ch.qualityBonus;
          logDecision(client, 'proposal', `${q.key}: ${ch.text}`, ch.effect || '');
          const next = stepIdx + 1;
          if (next < F1_QUESTIONS.length) {
            _lcState.step = next;
            _showProposalStep(next);
          } else {
            _closeLCModal();
            addLog(`📝 ${client.name}: КП отправлено — переходим к переговорам`, 'teal');
            advancePhase(client);
          }
        },
      })),
    });
  }

  // ─── Challenge: 5-шаговый пинг-понг ─────────────────
  function _showChallengeStep(stepIdx) {
    const { client } = _lcState;
    const step  = CHALLENGE_FLOW[stepIdx];
    const total = CHALLENGE_FLOW.length;
    const isLast = stepIdx === total - 1;

    _showLCModal({
      client,
      icon:       step.icon,
      title:      step.title,
      phaseLabel: `${client.icon} ${client.name}  ·  Переговоры — ${stepIdx + 1}/${total}`,
      exitable:   true,
      body: `<div>
        <div style="font-size:13px;font-style:italic;color:var(--text);margin-bottom:8px;
             line-height:1.5;padding:8px 10px;border-left:2px solid rgba(148,163,184,.3);
             background:rgba(255,255,255,.03);border-radius:0 4px 4px 0">
          «${step.clientLine}»
        </div>
        <div style="font-size:11px;color:var(--muted)">${step.body}</div>
      </div>`,
      choices: step.choices.map(ch => ({
        text: ch.text, desc: ch.desc, effect: ch.effect, highlight: ch.highlight,
        fn: () => {
          applyTag(client, ch.tag);
          if (ch.mood)         moodDelta(client, ch.mood);
          if (ch.risk)         riskDelta(client, ch.risk);
          if (ch.budgetPct)    client._totalBudget = Math.round(client._totalBudget * (1 + ch.budgetPct));
          if (ch.timelinePct)  client._duration    = Math.max(1, Math.round(client._duration * (1 + ch.timelinePct)));
          if (ch.qualityBonus) client._lcQualityBonus = (client._lcQualityBonus || 0) + ch.qualityBonus;
          logDecision(client, 'proposal', `${step.id}: ${ch.text}`, ch.effect || '');
          if (!isLast) {
            _lcState.step = stepIdx + 1;
            _showChallengeStep(stepIdx + 1);
          } else {
            _closeLCModal();
            addLog(`🤝 ${client.name}: переговоры завершены — идём дальше`, 'teal');
            advancePhase(client);
          }
        },
      })),
    });
  }

  // ══════════════════════════════════════════════════════
  //  F2 — NEGOTIATION (Переговоры)
  //  Шаг 1: реакция клиента на КП (из тегов F1)
  //  Шаг 2: условия оплаты
  // ══════════════════════════════════════════════════════

  // F2 — NEGOTIATION: только условия оплаты (1 вопрос)
  // Клиентская реакция убрана — для standard/quick она лишняя,
  // для challenge переговоры уже прошли в F1 пинг-понге.
  function _showNegotiation(client) {
    // Тихий штраф если в КП умолчали о команде (один раз на проект — не дублировать при возврате)
    if (hasTag(client, 'no_team_in_kp') && !client._negPenaltyApplied) {
      moodDelta(client, -5);
      client._negPenaltyApplied = true;
    }
    _consumeResume(client, 'negotiation');
    _lcState = { client, step: 0 };
    _negStep1(client);
  }

  function _negStep1(client) {
    _showLCModal({
      client,
      icon: '💰', title: 'Условия оплаты',
      phaseLabel: `${client.icon} ${client.name}  ·  Переговоры — 2/2`,
      exitable:   true,
      body: '<span style="color:var(--sub)">Как структурировать оплату по проекту?</span>',
      choices: [
        // v3.0: предоплата — не гарантия, а переговорный ролл с шансом проекта.
        // prepayChance задаётся в дефиниции (или тир-дефолт); 0 — вариант скрыт.
        ...(() => {
          const baseChance = client.prepayChance ?? [0, .25, .35, .45, .50, .55, .60, .65][client.tier || 1] ?? 0;
          if (baseChance <= 0) return [];
          // п.19 (Ф.3): буст от Переговорного аудита (если игрок выбрал «выбить аванс»)
          const auditBoost = client._negPrepayBoost || 0;
          const chance = Math.min(0.95, baseChance + (hasRole('lawyer') ? 0.15 : 0) + (G.perkPrepayBonus || 0) + auditBoost);
          const auditLabel = auditBoost > 0 ? ` 🤝 +${Math.round(auditBoost*100)}% (аудит)` : '';
          return [{
            text: `Попробовать выбить аванс 30% (шанс ~${Math.round(chance * 100)}%${auditLabel})`,
            desc: hasRole('lawyer')
              ? 'Юрист усиливает позицию (+15% к шансу). При отказе клиент слегка напряжётся.'
              : 'Если клиент согласится — деньги сразу. При отказе — слегка напряжётся.',
            effect: 'успех: аванс в кассу · −5 настроения / отказ: −3 настроения · +3 риска',
            fn: () => {
              if (Math.random() < chance) {
                const advance = Math.round(client._totalBudget * 0.30 / 5000) * 5000;
                client._prepaidAmount = advance;
                client._totalBudget   = Math.max(0, client._totalBudget - advance);
                G.money += advance;
                moodDelta(client, -5);
                applyTag(client, 'prepayment_30');
                logDecision(client, 'negotiation', 'payment: prepayment_30', `Аванс ${fmtK(advance)}`);
                addLog(`💰 ${client.name}: аванс ${fmtK(advance)} — клиент согласился`, 'green');
                notify(`💰 ${client.name}: аванс ${fmtK(advance)} выбит!`, 'success');
              } else {
                moodDelta(client, -3);
                riskDelta(client, +3);
                applyTag(client, 'prepayment_refused');
                logDecision(client, 'negotiation', 'payment: prepay refused', 'Клиент отказал в авансе');
                addLog(`💢 ${client.name}: в авансе отказано — оплата по ходу проекта`, 'amber');
              }
              _closeLCModal();
              advancePhase(client);
            },
          }];
        })(),
        {
          text: 'Поэтапная оплата (3 части)',
          desc: 'По завершении каждой рабочей фазы — треть суммы.',
          effect: '−5 риска · стабильный денежный поток',
          highlight: true,
          fn: () => {
            riskDelta(client, -5);
            applyTag(client, 'payment_staged');
            // п.27: поэтапная схема заменяет дефолтные tier-milestone —
            // иначе выплаты задвоятся (milestone 40% + трети)
            client._milestones     = [];
            client._milestonePcts  = [];
            client._milestonesPaid = [];
            client._stagedPaid     = 0;
            logDecision(client, 'negotiation', 'payment: staged', 'Поэтапная оплата');
            _closeLCModal();
            advancePhase(client);
          },
        },
        {
          text: 'Полная оплата по завершении',
          desc: 'Всё сразу при сдаче. Клиент доволен, мы рискуем.',
          effect: '+5 настроения · +10 риска',
          fn: () => {
            moodDelta(client, +5);
            riskDelta(client, +10);
            applyTag(client, 'payment_deferred');
            logDecision(client, 'negotiation', 'payment: deferred', 'Оплата при сдаче');
            _closeLCModal();
            advancePhase(client);
          },
        },
      ],
    });
  }

  // ══════════════════════════════════════════════════════
  //  F3 — BRIEF (Бриф)
  //  2 случайных события из пула
  // ══════════════════════════════════════════════════════

  const BRIEF_EVENTS = [
    {
      id: 'scope_creep',
      icon: '📐', title: 'Клиент расширил задание',
      body: 'В процессе брифинга добавились новые требования: дополнительные разделы, форматы или интеграции.',
      choices: [
        {
          text: 'Принять в рамках бюджета',
          desc: 'Берём доп. объём без пересмотра — хороший жест, но нагрузка растёт.',
          effect: '+15 риска',
          fn: c => { riskDelta(c, +15); applyTag(c, 'scope_expanded'); },
        },
        {
          text: 'Зафиксировать границы ТЗ',
          desc: 'Дополнения идут отдельным бюджетом. Клиент слегка разочарован.',
          effect: '−5 настроения',
          fn: c => { moodDelta(c, -5); applyTag(c, 'scope_fixed'); },
        },
        {
          text: 'Принять + пересмотреть бюджет',
          desc: 'Честный разговор: объём растёт — стоимость пропорционально.',
          effect: 'Бюджет +15% · риск не меняется',
          highlight: true,
          fn: c => { c._totalBudget = Math.round(c._totalBudget * 1.15); applyTag(c, 'scope_renegotiated'); },
        },
      ],
    },
    {
      id: 'contact_change',
      icon: '👤', title: 'Смена контактного лица',
      body: 'Менеджер на стороне клиента сменился. Новый человек — другие приоритеты и стиль коммуникации.',
      choices: [
        {
          text: 'Провести повторный брифинг',
          desc: 'Потратим время, но синхронизируемся с новым контактом.',
          effect: '+5 настроения · +10% к срокам',
          fn: c => {
            moodDelta(c, +5);
            c._duration = Math.max(1, Math.round(c._duration * 1.10));
            applyTag(c, 'rebriefed');
          },
        },
        {
          text: 'Работать по старому ТЗ',
          desc: 'Быстрее, но новый менеджер может быть удивлён результатом.',
          effect: '+15 риска',
          fn: c => { riskDelta(c, +15); applyTag(c, 'contact_ignored'); },
        },
      ],
    },
    {
      id: 'budget_cut',
      icon: '✂️', title: 'Клиент просит снизить бюджет',
      body: 'Финансовое давление внутри компании клиента — просят уложиться в меньшую сумму.',
      choices: [
        {
          text: 'Согласиться, сократим объём',
          desc: 'Честный обмен: меньше бюджет — меньше работ.',
          effect: 'Бюджет −15% · качество −5%',
          fn: c => {
            c._totalBudget = Math.round(c._totalBudget * 0.85);
            c._lcQualityBonus = (c._lcQualityBonus || 0) - 5;
            applyTag(c, 'budget_cut');
          },
        },
        {
          text: 'Предложить MVP-формат',
          desc: 'Выделить минимально жизнеспособный объём — клиент решает.',
          effect: '+5 риска · бюджет не меняется',
          fn: c => { riskDelta(c, +5); applyTag(c, 'mvp_proposed'); },
        },
        {
          text: 'Держать позицию — показать ценность',
          desc: 'Обосновать стоимость. Риска нет, но клиент может нервничать.',
          effect: '−5 настроения · качество не страдает',
          highlight: true,
          fn: c => { moodDelta(c, -5); applyTag(c, 'budget_defended'); },
        },
      ],
    },
    {
      id: 'vague_tz',
      icon: '❓', title: 'Нечёткое ТЗ',
      body: 'Бриф получен, но ключевые требования размыты: нет конкретики по функционалу, тону или ЦА.',
      choices: [
        {
          text: 'Провести дополнительную встречу',
          desc: 'Уточним детали — сделаем работу правильно с первого раза.',
          effect: '+5 настроения · +10% к срокам',
          fn: c => {
            moodDelta(c, +5);
            c._duration = Math.max(1, Math.round(c._duration * 1.10));
            applyTag(c, 'brief_clarified');
          },
        },
        {
          text: 'Принять как есть, интерпретируем сами',
          desc: 'Быстрее, но риск «не то, что хотели» на ревью.',
          effect: '+15 риска',
          fn: c => { riskDelta(c, +15); applyTag(c, 'brief_ambiguous'); },
        },
      ],
    },
    {
      id: 'ref_changed',
      icon: '🎨', title: 'Изменились референсы',
      body: 'Клиент прислал новые примеры — отличаются от изначальных. Визуальное направление под вопросом.',
      choices: [
        {
          text: 'Взять за основу новые',
          desc: 'Свежий взгляд поможет, но работу частично придётся переосмыслить.',
          effect: '+5% к качеству',
          highlight: true,
          fn: c => { c._lcQualityBonus = (c._lcQualityBonus || 0) + 5; applyTag(c, 'new_refs_adopted'); },
        },
        {
          text: 'Зафиксировать изначальные',
          desc: 'Держим курс. Клиент понимает — изменений больше не будет.',
          effect: '+10 риска',
          fn: c => { riskDelta(c, +10); applyTag(c, 'refs_locked'); },
        },
      ],
    },
    {
      id: 'deadline_pressure',
      icon: '⏰', title: 'Клиент хочет раньше',
      body: 'Появились внешние обстоятельства — клиент просит сократить сроки ещё на 15%.',
      choices: [
        {
          text: 'Принять — мобилизуем команду',
          desc: 'Возможно, но качество под угрозой.',
          effect: 'Сроки −15% · +20 риска',
          fn: c => {
            c._duration = Math.max(1, Math.round(c._duration * 0.85));
            riskDelta(c, +20);
            applyTag(c, 'deadline_rushed');
          },
        },
        {
          text: 'Объяснить риски, предложить компромисс',
          desc: 'Сдвинуть только отдельные этапы, не весь проект.',
          effect: '−5 настроения · сроки не меняются',
          fn: c => { moodDelta(c, -5); applyTag(c, 'deadline_negotiated'); },
        },
      ],
    },
  ];

  function _showBrief(client) {
    // challenge — 2 события (полный бриф), standard — 1 (оперативно)
    const r = _consumeResume(client, 'brief');
    if (r && Array.isArray(r.briefEvents)) {
      _lcState = Object.assign({ client }, r);
    } else {
      const count = client._negotiationTier === 'challenge' ? 2 : 1;
      const pool  = [...BRIEF_EVENTS].sort(() => Math.random() - 0.5).slice(0, count);
      _lcState = { client, step: 0, briefEvents: pool };
    }
    _showBriefStep(_lcState.step || 0);
  }

  function _showBriefStep(stepIdx) {
    const { client, briefEvents } = _lcState;
    const ev    = briefEvents[stepIdx];
    const total = briefEvents.length;

    _showLCModal({
      client,
      icon: ev.icon, title: ev.title,
      phaseLabel: `${client.icon} ${client.name}  ·  Бриф — ${stepIdx + 1}/${total}`,
      exitable:   true,
      body: `<span style="color:var(--sub)">${ev.body}</span>`,
      choices: ev.choices.map(ch => ({
        text: ch.text, desc: ch.desc, effect: ch.effect, highlight: ch.highlight,
        fn: () => {
          ch.fn(client);
          logDecision(client, 'brief', `${ev.id}: ${ch.text}`, ch.effect || '');
          const next = stepIdx + 1;
          if (next < briefEvents.length) {
            _lcState.step = next;
            _showBriefStep(next);
          } else {
            _closeLCModal();
            addLog(`📋 ${client.name}: бриф согласован`, 'teal');
            advancePhase(client);
          }
        },
      })),
    });
  }

  // ══════════════════════════════════════════════════════
  //  F4 — LEGAL (Юридика)
  //  Чеклист из 3 пунктов; юрист в команде снижает риски
  // ══════════════════════════════════════════════════════

  const LEGAL_POINTS = [
    {
      id: 'nda',
      icon: '🔒', title: 'НДА и конфиденциальность',
      body: 'Клиент требует строгое соглашение о неразглашении, включая запрет на публикацию кейсов.',
      choices: [
        {
          text: 'Подписать полностью',
          desc: 'Нельзя будет использовать проект в портфолио.',
          effect: '+5 настроения · −5% качество кейсов',
          mood: +5, risk: 0, qualityBonus: -5,
        },
        {
          text: 'Попросить исключение для портфолио',
          desc: 'Право публикации без раскрытия деталей клиента.',
          effect: '−5 настроения · портфолио сохраняется',
          mood: -5, risk: 0,
        },
        {
          text: 'Согласиться с отложенным раскрытием',
          desc: 'Через 12 месяцев — упоминать клиента без деталей проекта.',
          effect: '+5 риска · гибкий вариант',
          mood: 0, risk: +5,
        },
      ],
    },
    {
      id: 'licenses',
      icon: '📜', title: 'Лицензии на результаты работы',
      body: 'Клиент хочет полный переход прав на все созданные материалы.',
      choices: [
        {
          text: 'Полная передача прав',
          desc: 'Стандарт рынка. Без вопросов и оговорок.',
          effect: '+5 настроения',
          mood: +5, risk: 0,
        },
        {
          text: 'Лицензия без передачи',
          desc: 'Сохраняем право на фреймворк, передаём конкретный результат.',
          effect: '−5 настроения · −5 риска',
          mood: -5, risk: -5,
        },
      ],
    },
    {
      id: 'liability',
      icon: '⚠️', title: 'Ответственность за сроки',
      body: 'Клиент настаивает на штрафах за просрочку: 1% от суммы за каждую неделю задержки.',
      choices: [
        {
          text: 'Принять условия',
          desc: 'Мотивирует держать сроки, но давление растёт.',
          effect: '+5 настроения · +10 риска',
          mood: +5, risk: +10,
        },
        {
          text: 'Ограничить штраф (cap 5%)',
          desc: 'Ограничиваем максимальный риск до 5% суммы.',
          effect: '−5 настроения · риск ограничен',
          mood: -5, risk: +3,
        },
        {
          text: 'Убрать пункт полностью',
          desc: 'Жёсткая позиция. Клиент недоволен, но штрафов нет.',
          effect: '−10 настроения · нет рисковых штрафов',
          mood: -10, risk: 0,
        },
      ],
    },
  ];

  function _showLegal(client) {
    const r = _consumeResume(client, 'legal');
    if (r) {
      _lcState = Object.assign({ client }, r);
    } else {
      const hasLawyer = typeof hasRole !== 'undefined' && hasRole('lawyer');
      _lcState = { client, step: 0, hasLawyer };
    }
    _showLegalStep(_lcState.step || 0);
  }

  function _showLegalStep(stepIdx) {
    const { client, hasLawyer } = _lcState;
    const pt    = LEGAL_POINTS[stepIdx];
    const total = LEGAL_POINTS.length;

    const lawyerHint = hasLawyer
      ? `<div style="margin-top:6px;font-size:10px;color:var(--teal);font-weight:600">⚖️ Юрист в команде — риски снижены вдвое</div>`
      : '';

    _showLCModal({
      client,
      icon: pt.icon, title: pt.title,
      phaseLabel: `${client.icon} ${client.name}  ·  Юридика — ${stepIdx + 1}/${total}`,
      exitable:   true,
      body: `<span style="color:var(--sub)">${pt.body}</span>${lawyerHint}`,
      choices: pt.choices.map(ch => ({
        text: ch.text, desc: ch.desc, effect: ch.effect,
        fn: () => {
          let rv = ch.risk  || 0;
          let mv = ch.mood  || 0;
          if (hasLawyer && rv > 0) rv = Math.round(rv * 0.5);
          if (rv) riskDelta(client, rv);
          if (mv) moodDelta(client, mv);
          if (ch.qualityBonus) client._lcQualityBonus = (client._lcQualityBonus || 0) + ch.qualityBonus;
          applyTag(client, `legal_${pt.id}`);
          logDecision(client, 'legal', `${pt.id}: ${ch.text}`, ch.effect || '');

          const next = stepIdx + 1;
          if (next < LEGAL_POINTS.length) {
            _lcState.step = next;
            _showLegalStep(next);
          } else {
            _closeLCModal();
            addLog(`⚖️ ${client.name}: юридика оформлена`, 'teal');
            advancePhase(client);
          }
        },
      })),
    });
  }

  // ══════════════════════════════════════════════════════
  //  F5 — PLANNING (Планирование)
  //  Сборка команды; реагирует на тег real_team_shown
  // ══════════════════════════════════════════════════════

  // п.17 (Ф.1): интерактивный выбор команды с кнопкой «⚡ Авто»
  function _showPlanning(client) {
    const allStaff  = (G.staff || []).filter(s => s.status !== 'fired');
    const hasStaff  = allStaff.length > 0;
    const shownTeam = hasTag(client, 'real_team_shown');

    // Начальный выбор — все свободные (или уже назначенные на этот проект)
    const sel = new Set(
      allStaff
        .filter(s => !s._assignedProjectId || s._assignedProjectId === client.id)
        .map(s => s._iid || s.id)
    );

    function _cleanup() {
      delete window.__lcPlanSel;
      delete window.__lcPlanAuto;
    }

    function _refresh() {
      const selArr  = allStaff.filter(s => sel.has(s._iid || s.id));
      const pLoad   = getProjectLoad(client);
      const projThr = 2 + selArr.reduce((t, s) => t + calcStaffWorkUnit(s), 0);
      const thrColor = projThr >= pLoad
        ? 'var(--teal)'
        : projThr >= pLoad * 0.7 ? 'var(--amber)' : 'var(--red)';

      // Чипы сотрудников — кликабельные тоглы
      const staffChips = allStaff.map(s => {
        const key        = s._iid || s.id;
        const isSelected = sel.has(key);
        const wu         = calcStaffWorkUnit(s);
        const busy       = s._assignedProjectId && s._assignedProjectId !== client.id;
        return `<span onclick="${busy ? '' : `window.__lcPlanSel('${key}')`}"
          style="display:inline-flex;align-items:center;gap:3px;margin:2px 3px;padding:3px 9px;
            border-radius:5px;font-size:11px;user-select:none;
            ${busy ? 'opacity:.4;cursor:not-allowed' : 'cursor:pointer'};
            background:${isSelected && !busy ? 'rgba(45,212,191,.12)' : 'rgba(148,163,184,.06)'};
            border:1px solid ${isSelected && !busy ? 'rgba(45,212,191,.35)' : 'rgba(148,163,184,.15)'};
            color:${isSelected && !busy ? 'var(--fg)' : 'var(--muted)'}">
          ${s.icon || '👤'} ${s.name}
          <span style="font-size:9px;opacity:.65">(WU&nbsp;${wu})</span>
          ${busy ? '<span style="font-size:9px">·&nbsp;занят</span>' : ''}
        </span>`;
      }).join('');

      // Индикатор мощности vs нагрузки
      const thrBar = `
        <div style="margin-top:8px;display:flex;align-items:center;flex-wrap:wrap;gap:5px;font-size:11px">
          <span style="color:var(--muted)">Мощность выбранных:</span>
          <span style="color:${thrColor};font-weight:700">${projThr}</span>
          <span style="color:var(--muted)">/ нагрузка</span>
          <span style="font-weight:600">${pLoad}</span>
          ${projThr < pLoad
            ? `<span style="color:var(--red);font-size:10px">⚠ мощности может не хватить</span>`
            : `<span style="color:var(--teal);font-size:10px">✓ покрыто</span>`}
        </div>`;

      const teamWarning = shownTeam
        ? `<div style="margin-top:6px;padding:5px 8px;border-radius:5px;background:rgba(210,153,34,.08);
                border:1px solid rgba(210,153,34,.25);font-size:10px;color:var(--amber);font-weight:600">
             ⚠️ В КП была показана реальная команда — назначьте тех же людей
           </div>`
        : '';

      const body = hasStaff
        ? `<div>
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
              <span style="color:var(--sub);font-size:12px">Выберите состав команды:</span>
              <button onclick="window.__lcPlanAuto()"
                style="font-size:10px;padding:2px 10px;border-radius:4px;
                  background:rgba(168,85,247,.1);border:1px solid rgba(168,85,247,.3);
                  color:rgba(168,85,247,.9);cursor:pointer;font-weight:600">⚡ Авто</button>
            </div>
            <div>${staffChips}</div>
            ${thrBar}
            ${teamWarning}
          </div>`
        : `<div style="color:var(--muted);font-size:11px">— нет нанятых сотрудников —</div>`;

      // Параметры кнопки подтверждения зависят от выбора
      const selArrFinal = allStaff.filter(s => sel.has(s._iid || s.id));
      const hasSelection = selArrFinal.length > 0;
      const qBonus = shownTeam && selArrFinal.length === allStaff.length ? 10 : hasSelection ? 5 : 0;

      const confirmText = hasSelection
        ? `Подтвердить команду (${selArrFinal.length} чел.)`
        : (shownTeam ? 'Работать без команды (нарушаем КП)' : 'Работать самостоятельно');
      const confirmDesc = hasSelection
        ? selArrFinal.map(s => `${s.icon || '👤'} ${s.name}`).join(', ')
        : (shownTeam ? 'Обещание нарушено — клиент узнает на ревью.' : 'Без команды — скорость ниже, риск выше.');
      const confirmEffect = hasSelection
        ? `+${qBonus}% к качеству${shownTeam && selArrFinal.length === allStaff.length ? ' — команда совпадает с КП' : ''}`
        : (shownTeam ? '+10 риска · −10 настроения (нарушение КП)' : '+10 риска');

      _showLCModal({
        client,
        icon: '📌', title: 'Сборка команды на проект',
        phaseLabel: `${client.icon} ${client.name}  ·  Планирование`,
        body,
        choices: [{
          text:      confirmText,
          desc:      confirmDesc,
          effect:    confirmEffect,
          highlight: hasSelection,
          fn: () => {
            _cleanup();
            const finalSel = allStaff.filter(s => sel.has(s._iid || s.id));
            if (finalSel.length > 0) {
              const bonus = shownTeam && finalSel.length === allStaff.length ? 10 : 5;
              client._lcQualityBonus = (client._lcQualityBonus || 0) + bonus;
              finalSel.forEach(s => assignStaffToProject(s._iid || s.id, client.id));
              applyTag(client, 'team_assigned');
              logDecision(client, 'planning', `team: ${finalSel.length}/${allStaff.length}`, `+${bonus}% качество`);
              _closeLCModal();
              addLog(`📌 ${client.name}: команда назначена (${finalSel.length} чел.) — стартуем работу`, 'teal');
            } else {
              riskDelta(client, +10);
              if (shownTeam) {
                moodDelta(client, -10);
                applyTag(client, 'team_broken_promise');
                addLog(`⚠️ ${client.name}: обещанная команда не назначена`, 'amber');
              }
              logDecision(client, 'planning', 'team: none', '+10 риска');
              _closeLCModal();
            }
            advancePhase(client);
          },
        }],
      });
    }

    // Эфемерные глобальные хэндлеры для onclick в innerHTML
    window.__lcPlanSel = (key) => {
      if (sel.has(key)) sel.delete(key); else sel.add(key);
      _refresh();
    };
    window.__lcPlanAuto = () => {
      if (typeof autoAssignOptimal === 'function') {
        const optimal = autoAssignOptimal(client);
        sel.clear();
        optimal.forEach(s => sel.add(s._iid || s.id));
        _refresh();
      }
    };

    _refresh();
  }

  // ══════════════════════════════════════════════════════
  //  F9 — REVIEW (Ревью) — Этап 4: полный расчёт
  // ══════════════════════════════════════════════════════

  function _showReview(client) {
    const mood      = client._lcClientMood || 60;
    const risk      = client._lcRisk || 0;
    const quality   = client._lcQualityBonus || 0;
    const revisions = client._lcRevisionCount || 0;

    // Бонус/штраф за эффективность стаффинга
    // eff > 1 — over-deliver, клиент получает больше чем ожидал → бонус до +10
    // eff < 0.5 — критический андерстаф → штраф до −10
    let effBonus = 0;
    if (typeof getProjectThroughput === 'function' && typeof getProjectLoad === 'function') {
      const _thr  = getProjectThroughput(client);
      const _load = getProjectLoad(client);
      const _eff  = _load > 0 ? _thr / _load : 1;
      effBonus = Math.round(Math.min(10, Math.max(-10, (_eff - 1.0) * 20)));
    }

    // Итоговый счёт: настроение тянет вверх, качество даёт бонус, риск и правки тянут вниз
    const score = mood * 0.5 + quality * 0.3 - risk * 0.2 - revisions * 3 + effBonus;

    let outcome, label, labelCol, bodyText;
    if (score >= 55) {
      outcome = 'approved'; label = '🏆 Принято с похвалой';
      labelCol = 'var(--green)';
      bodyText = 'Клиент полностью доволен результатом. Принято без замечаний, возможен бонус.';
    } else if (score >= 30) {
      outcome = 'accepted'; label = '✅ Принято';
      labelCol = 'var(--teal)';
      bodyText = 'Работа принята. Небольшие замечания будут учтены при следующем проекте.';
    } else if (score >= 5) {
      outcome = 'revisions'; label = '⚠️ Нужны правки';
      labelCol = 'var(--amber)';
      bodyText = 'Клиент недоволен — часть работы требует переделки.';
    } else {
      outcome = 'rejected'; label = '❌ Отклонено';
      labelCol = 'var(--red)';
      bodyText = 'Серьёзное расхождение с ожиданиями. Значительная часть работы нуждается в переработке.';
    }

    const moodCol = mood >= 70 ? 'var(--green)' : mood >= 45 ? 'var(--teal)' : 'var(--amber)';

    const choices = [];

    if (outcome === 'approved' || outcome === 'accepted') {
      choices.push({
        text: 'Перейти к сдаче →',
        highlight: outcome === 'approved',
        fn: () => { client._lcReviewOutcome = outcome; _closeLCModal(); advancePhase(client); },
      });
    }

    if (outcome === 'revisions') {
      choices.push({
        text: 'Сделать правки',
        desc: 'Возврат к последней work-фазе. Прогресс сбрасывается.',
        effect: '−5 настроения · ещё один раунд',
        fn: () => {
          client._lcReviewOutcome = 'revisions';
          client._lcRevisionCount = (client._lcRevisionCount || 0) + 1;
          moodDelta(client, -5);
          _returnToWork(client, 'work_2');
          _closeLCModal();
          addLog(`🔄 ${client.name}: правки — возврат к финальной work-фазе`, 'amber');
          _emitRender();
        },
      });
      choices.push({
        text: 'Убедить принять как есть',
        desc: 'Настоять на результате — клиент раздражён, но без переделки.',
        effect: '−10 настроения',
        fn: () => {
          moodDelta(client, -10);
          client._lcReviewOutcome = 'accepted';
          _closeLCModal();
          advancePhase(client);
        },
      });
    }

    if (outcome === 'rejected') {
      choices.push({
        text: 'Переработать полностью',
        desc: 'Возврат к work_0 — серьёзные изменения направления.',
        effect: '−15 настроения · +10 риска',
        fn: () => {
          client._lcReviewOutcome = 'rejected';
          client._lcRevisionCount = (client._lcRevisionCount || 0) + 2;
          moodDelta(client, -15);
          riskDelta(client, +10);
          _returnToWork(client, 'work_0');
          _closeLCModal();
          addLog(`❌ ${client.name}: отклонено — переработка с нуля`, 'red');
          _emitRender();
        },
      });
      choices.push({
        text: 'Принять частично, доработать финал',
        desc: 'Возврат к work_2 с меньшими потерями.',
        effect: '−10 настроения · +5 риска',
        fn: () => {
          client._lcReviewOutcome = 'revisions';
          client._lcRevisionCount = (client._lcRevisionCount || 0) + 1;
          moodDelta(client, -10); riskDelta(client, +5);
          _returnToWork(client, 'work_2');
          _closeLCModal();
          addLog(`⚠️ ${client.name}: частичная переработка`, 'amber');
          _emitRender();
        },
      });
    }

    _showLCModal({
      client,
      icon: '🔍', title: 'Ревью проекта',
      phaseLabel: `${client.icon} ${client.name}  ·  Ревью${revisions > 0 ? ` (правки ×${revisions})` : ''}`,
      body: `<div>
        <div style="font-size:15px;font-weight:700;color:${labelCol};margin-bottom:10px">${label}</div>
        <div style="color:var(--sub);font-size:12px;margin-bottom:10px">${bodyText}</div>
        <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:5px;font-size:10px;color:var(--sub)">
          <div style="text-align:center;padding:5px;background:rgba(255,255,255,.04);border-radius:5px">
            😊 Настроение<br><b style="color:${moodCol};font-size:13px">${Math.round(mood)}</b>
          </div>
          <div style="text-align:center;padding:5px;background:rgba(255,255,255,.04);border-radius:5px">
            ⚠️ Риск<br><b style="color:var(--amber);font-size:13px">${Math.round(risk)}</b>
          </div>
          <div style="text-align:center;padding:5px;background:rgba(255,255,255,.04);border-radius:5px">
            ✨ Качество<br><b style="color:var(--teal);font-size:13px">+${Math.round(quality)}%</b>
          </div>
          <div style="text-align:center;padding:5px;background:rgba(255,255,255,.04);border-radius:5px">
            ⚡ Команда<br><b style="color:${effBonus >= 0 ? 'var(--green)' : 'var(--red)'};font-size:13px">${effBonus >= 0 ? '+' : ''}${effBonus}</b>
          </div>
          <div style="text-align:center;padding:5px;background:rgba(255,255,255,.04);border-radius:5px">
            🏆 Счёт<br><b style="color:${labelCol};font-size:13px">${Math.round(score)}</b>
          </div>
        </div>
      </div>`,
      choices,
    });
  }

  // Хелпер: возврат к work-фазе
  function _returnToWork(client, targetPhase) {
    const idx = client._lcChain.indexOf(targetPhase);
    if (idx >= 0) {
      client._lcPhaseIdx = idx;
      client._lcPhase    = targetPhase;
      client._progress   = 0;
    }
  }

  // ══════════════════════════════════════════════════════
  //  F10 — DELIVERY (Этап 4: полный расчёт)
  // ══════════════════════════════════════════════════════

  function finishDelivery(client) {
    _closeLCModal();

    const outcome   = client._lcReviewOutcome || 'accepted';
    const mood      = client._lcClientMood || 60;
    const quality   = client._lcQualityBonus || 0;
    const risk      = client._lcRisk || 0;
    const revisions = client._lcRevisionCount || 0;
    const payout    = Math.round((client._totalBudget || 0) * (1 + (G.perkPayoutMult || 0)));

    G.money += payout;
    G.clientEarnings = G.clientEarnings || {};
    G.clientEarnings[client.id] = (G.clientEarnings[client.id] || 0) + payout;

    // Бонус при отличном исходе
    let bonus = 0;
    if (outcome === 'approved' && mood >= 75) {
      bonus = Math.round(payout * (0.08 + Math.random() * 0.12) / 5000) * 5000;
      G.money += bonus;
      addLog(`🌟 ${client.name}: клиент в восторге — бонус +${fmtK(bonus)}`, 'green');
    }

    // Р.2: Качество окупается ТОЛЬКО при сдаче — бонус к выплате + репутации.
    let qPay = 0;
    if (quality > 0) {
      qPay = Math.round(payout * Math.min(quality, 50) * 0.004 / 1000) * 1000; // до +20% при Q≥50
      if (qPay > 0) {
        G.money += qPay;
        G.clientEarnings[client.id] = (G.clientEarnings[client.id] || 0) + qPay;
        addLog(`✨ ${client.name}: высокое качество (+${Math.round(quality)}%) — бонус к оплате +${fmtK(qPay)}`, 'green');
      }
      const qRep = Math.min(5, Math.round(quality / 12));
      if (qRep > 0) G.reputation = Math.min(100, (G.reputation || 50) + qRep);
    }

    // NPS: база 50, настроение ±, качество +, риск −, правки −
    const finalNPS = Math.min(100, Math.max(0, Math.round(
      50
      + (mood - 60) * 0.5
      + quality * 0.3
      - risk * 0.2
      - revisions * 5
    )));

    // Влияние на репутацию агентства
    if (finalNPS >= 85) {
      G.reputation = Math.min(100, (G.reputation || 50) + 3);
      addLog(`⭐ Репутация +3 — клиент очень доволен (оценка клиента ${finalNPS})`, 'green');
    } else if (finalNPS <= 35) {
      G.reputation = Math.max(0, (G.reputation || 50) - 5);
      addLog(`💔 Репутация −5 — провальная сдача (оценка клиента ${finalNPS})`, 'red');
    }

    // Портфолио (v3.0-фикс: LC-сдача не начисляла баллы вообще)
    const pfBonus = Math.round((client.portfolioWeight || client.tier || 1) * 3);
    G.portfolio   = (G.portfolio || 0) + pfBonus;

    G.completedProjects = G.completedProjects || [];
    G.completedProjects.push({
      id: client.id, name: client.name, icon: client.icon,
      revenue: payout + bonus + qPay, tier: client.tier || 1,
      finalNPS, monthCompleted: G.month,
      terminated: false, failed: false, _cased: false,
    });

    if (typeof releaseProjectTeam === 'function') releaseProjectTeam(client.id); // Б.9
    G.activeClients = G.activeClients.filter(a => a.id !== client.id);
    delete G.clientNPS[client.id];

    const bonusStr = (bonus > 0 ? ` + бонус ${fmtK(bonus)}` : '') + (qPay > 0 ? ` + качество ${fmtK(qPay)}` : '');
    addLog(`🏁 ${client.name}: сдан! +${fmtK(payout)}${bonusStr} · оценка клиента ${finalNPS}`, 'green');
    notify(`${client.icon} ${client.name} — сдан! +${fmtK(payout)}${bonusStr}`, 'success');
    rd(`Завершён: ${client.name} (LC) оценка клиента ${finalNPS}`, 'client');
    _emitRender();
  }

  // ══════════════════════════════════════════════════════
  //  ЭТАП 3 — WORK EVENTS
  //  Случайные события в work-фазах; решаются через поп-ап
  // ══════════════════════════════════════════════════════

  const WORK_EVENTS = [
    {
      id: 'client_feedback',
      icon: '💬', title: 'Клиент прислал правки',
      artGradient: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
      artIcon: '💬',
      atmosphere: 'Пинг-понг комментариев в чате не утихает с утра',
      context: c => `${c.name} прислал ${Math.floor(Math.random()*12)+3} замечания — часть критичных`,
      body: 'В середине работы пришли новые комментарии. Как реагируем?',
      choices: [
        {
          text: 'Принять все правки',
          desc: 'Клиент доволен, нагрузка растёт.',
          effect: '+8 настроения · +10 риска',
          fn: c => { moodDelta(c, +8); riskDelta(c, +10); },
        },
        {
          text: 'Принять приоритетные',
          desc: 'Берём важное, остальное — в следующую итерацию.',
          effect: '+3 настроения · +5 риска',
          fn: c => { moodDelta(c, +3); riskDelta(c, +5); },
        },
        {
          text: 'Зафиксировать на следующий проект',
          desc: 'Держим ТЗ, клиент немного разочарован.',
          effect: '−5 настроения',
          fn: c => { moodDelta(c, -5); },
        },
      ],
    },
    {
      id: 'staff_sick',
      icon: '🤒', title: 'Ключевой исполнитель заболел',
      artGradient: 'linear-gradient(135deg, #1a0a0a 0%, #2d1515 50%, #1a0a0a 100%)',
      artIcon: '🤒',
      atmosphere: 'Холодный офис, пустое рабочее место, дедлайн не двигается',
      context: c => `Выбыл на ~2 недели — прогресс по ${c.name} под угрозой`,
      body: 'Выбыл на две недели — прогресс под угрозой.',
      choices: [
        {
          text: 'Нанять фрилансера (−20К)',
          desc: 'Быстро закрываем дыру, платим из кармана.',
          effect: '−20 000₽ · прогресс не страдает',
          fn: c => { if (G.money >= 20000) G.money -= 20000; else moodDelta(c, -3); },
        },
        {
          text: 'Перераспределить нагрузку',
          desc: 'Команда тянет — прогресс проседает.',
          effect: 'Прогресс −20% · +8 риска',
          fn: c => { c._progress = Math.max(0, (c._progress || 0) - 20); riskDelta(c, +8); },
        },
        {
          text: 'Попросить клиента о паузе',
          desc: 'Честно предупреждаем — клиент понимает, но не рад.',
          effect: '−8 настроения',
          fn: c => { moodDelta(c, -8); },
        },
      ],
    },
    {
      id: 'tech_issue',
      icon: '⚙️', title: 'Технический сбой',
      artGradient: 'linear-gradient(135deg, #0a0a1a 0%, #1a1a0a 40%, #0d1520 100%)',
      artIcon: '⚙️',
      atmosphere: 'Терминал красный, бэкапы в тумане, тикает счётчик',
      context: c => `Критичный файл/зависимость проекта ${c.name} сломан`,
      body: 'Потеряны файлы или сломана критичная зависимость.',
      choices: [
        {
          text: 'Решить срочно (−15К)',
          desc: 'Платим за скорость, клиент ничего не замечает.',
          effect: '−15 000₽',
          fn: c => { if (G.money >= 15000) G.money -= 15000; else riskDelta(c, +10); },
        },
        {
          text: 'Восстановить из резервной копии',
          desc: 'Часть работы придётся переделать.',
          effect: 'Прогресс −15% · +5 риска',
          fn: c => { c._progress = Math.max(0, (c._progress || 0) - 15); riskDelta(c, +5); },
        },
      ],
    },
    {
      id: 'client_praise',
      icon: '⭐', title: 'Промежуточный результат понравился',
      artGradient: 'linear-gradient(135deg, #0a1a0a 0%, #0d2b0d 50%, #1a2e0a 100%)',
      artIcon: '⭐',
      atmosphere: 'Демо прошло — в воздухе лёгкость и аплодисменты',
      context: c => `${c.name} в восторге от промежуточной версии`,
      body: 'Показали промежуточную версию — клиент в восторге.',
      choices: [
        {
          text: 'Отлично — продолжаем!',
          desc: 'Подтверждаем курс, мотивация растёт.',
          effect: '+10 настроения · +5% качество',
          highlight: true,
          fn: c => { moodDelta(c, +10); c._lcQualityBonus = (c._lcQualityBonus || 0) + 5; },
        },
      ],
    },
    {
      id: 'competitor',
      icon: '🏃', title: 'Конкурент переманивает клиента',
      artGradient: 'linear-gradient(135deg, #1a0a1a 0%, #2d1228 50%, #150e20 100%)',
      artIcon: '🏃',
      atmosphere: 'Рядом другая витрина светится ярче — клиент оглядывается',
      context: c => `${c.name} намекнул: конкурент дал предложение дешевле`,
      body: 'Клиент намекает: другое агентство предложило дешевле.',
      choices: [
        {
          text: 'Обосновать ценность',
          desc: 'Показываем чем мы лучше — без скидок.',
          effect: '+5 риска',
          fn: c => { riskDelta(c, +5); },
        },
        {
          text: 'Предложить небольшой бонус (−10К)',
          desc: 'Делаем жест — клиент остаётся доволен.',
          effect: '+8 настроения · −10 000₽',
          fn: c => { moodDelta(c, +8); if (G.money >= 10000) G.money -= 10000; },
        },
        {
          text: 'Держать позицию, игнорировать',
          desc: 'Не идём на компромисс — рискуем потерять расположение.',
          effect: '−8 настроения',
          fn: c => { moodDelta(c, -8); },
        },
      ],
    },
    {
      id: 'scope_change',
      icon: '📐', title: 'Клиент хочет изменить концепцию',
      artGradient: 'linear-gradient(135deg, #1a1000 0%, #2b1e00 50%, #1a1a00 100%)',
      artIcon: '📐',
      atmosphere: 'Макет уже сдан, но клиент вдруг «нашёл вдохновение»',
      context: c => `${c.name} хочет переделать ключевую часть в середине работы`,
      body: 'На середине проекта — смена направления.',
      choices: [
        {
          text: 'Принять + пересчитать бюджет',
          desc: 'Честный разговор о цене изменений.',
          effect: 'Бюджет +10% · прогресс −20%',
          fn: c => {
            c._totalBudget = Math.round(c._totalBudget * 1.10);
            c._progress = Math.max(0, (c._progress || 0) - 20);
          },
        },
        {
          text: 'Принять без доплаты',
          desc: 'Хороший жест для клиента, работы больше.',
          effect: 'Прогресс −20% · +5 настроения',
          fn: c => { c._progress = Math.max(0, (c._progress || 0) - 20); moodDelta(c, +5); },
        },
        {
          text: 'Отказать — фиксируем ТЗ',
          desc: 'Держим рамки проекта. Клиент расстроен.',
          effect: '−10 настроения · +15 риска',
          fn: c => { moodDelta(c, -10); riskDelta(c, +15); },
        },
      ],
    },
    {
      id: 'unexpected_complexity',
      icon: '🔩', title: 'Неожиданная сложность',
      artGradient: 'linear-gradient(135deg, #0a0a0a 0%, #1a1020 50%, #0a1020 100%)',
      artIcon: '🔩',
      atmosphere: 'Под поверхностью задачи — лабиринт, которого никто не ждал',
      context: c => `Задача по ${c.name} оказалась в 2–3 раза объёмнее расчётной`,
      body: 'При детальной проработке выяснилось: задача сложнее, чем казалось.',
      choices: [
        {
          text: 'Предупредить клиента заранее',
          desc: 'Честная коммуникация — клиент ценит прозрачность.',
          effect: '−3 настроения · +8 риска',
          fn: c => { moodDelta(c, -3); riskDelta(c, +8); },
        },
        {
          text: 'Справиться своими силами',
          desc: 'Не говорим клиенту, решаем тихо. Риск ошибки выше.',
          effect: '+15 риска',
          fn: c => { riskDelta(c, +15); },
        },
        {
          text: 'Привлечь внешнего эксперта (−25К)',
          desc: 'Дорого, но надёжно.',
          effect: '−25 000₽ · +5% качество',
          fn: c => {
            if (G.money >= 25000) { G.money -= 25000; c._lcQualityBonus = (c._lcQualityBonus || 0) + 5; }
            else riskDelta(c, +10);
          },
        },
      ],
    },
  ];

  // Вызывается из advanceMonth при тике work-фазы
  function triggerWorkEvent(client) {
    if (client._lcPendingDecision) return; // уже есть ожидающее
    const ev = WORK_EVENTS[Math.floor(Math.random() * WORK_EVENTS.length)];
    client._lcPendingDecision = { eventId: ev.id };
    addLog(`🔔 ${client.name}: ${ev.title} — требуется решение`, 'amber');
    notify(`${client.icon} ${client.name} — требуется решение`, 'warning');
    _emitRender();
  }

  // Открывает поп-ап по ожидающему событию (вызывается из кнопки на карточке)
  function resolveWorkEvent(clientId) {
    const client = (G.activeClients || []).find(c => c.id === clientId);
    if (!client || !client._lcPendingDecision) return;
    const ev = WORK_EVENTS.find(e => e.id === client._lcPendingDecision.eventId);
    if (!ev) { client._lcPendingDecision = null; _emitRender(); return; }

    const _contextLine = ev.context ? ev.context(client) : '';
    _showLCModal({
      client,
      icon: ev.icon, title: ev.title,
      phaseLabel: `${client.icon} ${client.name}  ·  ${PHASE_LABELS[client._lcPhase] || 'Работа'}`,
      body: `<span style="color:var(--sub)">${ev.body}</span>${_contextLine ? `<div style="margin-top:6px;font-size:11px;color:rgba(255,255,255,.4);font-style:italic">${_contextLine}</div>` : ''}`,
      artGradient: ev.artGradient || null,
      artIcon:     ev.artIcon     || ev.icon,
      atmosphere:  ev.atmosphere  || null,
      choices: ev.choices.map(ch => ({
        text: ch.text, desc: ch.desc, effect: ch.effect, highlight: ch.highlight,
        fn: () => {
          ch.fn(client);
          logDecision(client, client._lcPhase, `event:${ev.id}: ${ch.text}`, ch.effect || '');
          client._lcPendingDecision = null;
          _closeLCModal();
          _emitRender();
        },
      })),
    });
  }

  // ══════════════════════════════════════════════════════
  //  HELPER: Бейдж текущей фазы для карточки проекта
  //  Учитывает _lcPendingDecision (work-событие)
  // ══════════════════════════════════════════════════════

  function renderPhaseBadge(client) {
    const phase   = client._lcPhase;
    if (!phase) return '';

    const isWork    = phase.startsWith('work_');
    const hasPending = !!client._lcPendingDecision;
    const label     = PHASE_LABELS[phase] || phase;
    const icon      = PHASE_ICONS[phase]  || '·';

    // Pending decision → оранжевый независимо от фазы
    const bg     = hasPending  ? 'rgba(248,81,73,.10)'
                 : isWork      ? 'rgba(45,212,191,.10)'
                               : 'rgba(210,153,34,.10)';
    const col    = hasPending  ? 'var(--red)'
                 : isWork      ? 'var(--teal)'
                               : 'var(--amber)';
    const border = hasPending  ? 'rgba(248,81,73,.35)'
                 : isWork      ? 'rgba(45,212,191,.3)'
                               : 'rgba(210,153,34,.3)';

    // Точки прогресса цепочки
    const chain = client._lcChain || [];
    const idx   = client._lcPhaseIdx || 0;
    const dotsHtml = chain.map((_, i) =>
      `<span style="
        display:inline-block;width:5px;height:5px;border-radius:50%;
        background:${i < idx ? 'var(--teal)' : i === idx ? col : 'rgba(255,255,255,.15)'};
        margin-right:2px;vertical-align:middle
      "></span>`
    ).join('');

    // Кнопка действия
    let actionBtn = '';
    if (hasPending) {
      actionBtn = `<button onclick="Projects.resolveWorkEvent('${client.id}')"
        style="margin-left:auto;font-size:10px;padding:2px 8px;border-radius:4px;
               background:rgba(248,81,73,.18);color:var(--red);border:1px solid rgba(248,81,73,.4);
               cursor:pointer;font-weight:700;animation:pulse 1.5s infinite">⚡ Решить</button>`;
    } else if (!isWork) {
      actionBtn = `<button onclick="Projects.showPhasePopup(G.activeClients.find(c=>c.id==='${client.id}'))"
        style="margin-left:auto;font-size:10px;padding:2px 7px;border-radius:4px;
               background:rgba(210,153,34,.15);color:var(--amber);border:1px solid rgba(210,153,34,.35);
               cursor:pointer;font-weight:600">Открыть →</button>`;
    }

    // Статус-строка
    const statusText = hasPending ? `<span style="font-size:10px;color:var(--red);font-weight:700">⚡ Требует решения</span>`
      : !isWork ? `<span style="font-size:10px;color:var(--amber);font-weight:600">Ждёт решения</span>` : '';

    return `
      <div style="
        margin-top:6px;padding:5px 8px;border-radius:6px;
        background:${bg};border:1px solid ${border};
        display:flex;align-items:center;gap:6px;flex-wrap:wrap
      ">
        <span style="font-size:10px;color:${col};font-weight:700">${icon} ${label}</span>
        <span>${dotsHtml}</span>
        ${statusText}
        ${actionBtn}
      </div>`;
  }

  // ══════════════════════════════════════════════════════
  //  PLAYER ACTIONS — активные действия игрока в work-фазах
  // ══════════════════════════════════════════════════════

  const PLAYER_ACTIONS = [
    {
      id: 'interim_demo',
      icon: '📊', title: 'Промежуточный показ',
      desc: 'Покажем клиенту текущую версию — настроение растёт.',
      costLabel: '−8К',
      effectLabel: '+10 😊',
      available: c => (c._lcClientMood || 60) < 90,
      naLabel: 'настроение макс.',
      whenLocked: c => (c._progress || 0) > 0 ? null : 'нет прогресса для показа',
      apply: c => {
        if ((G.money || 0) < 8000) { notify('Недостаточно средств для показа','error'); return false; }
        G.money -= 8000;
        moodDelta(c, +10);
        logDecision(c, c._lcPhase, 'Промежуточный показ клиенту', '+10 настроения · −8К');
        return true;
      },
    },
    {
      id: 'team_sprint',
      icon: '🚀', title: 'Рывок команды',
      desc: 'Форсированный темп — быстрее, но команда устаёт.',
      costLabel: '+15 усталость',
      effectLabel: '+20% прогресс',
      available: c => (c._progress || 0) < 80,
      naLabel: 'проект почти готов',
      apply: c => {
        c._progress = Math.min(100, (c._progress || 0) + 20);
        G.teamFatigue = Math.min(100, (G.teamFatigue || 0) + 15);
        logDecision(c, c._lcPhase, 'Рывок команды', '+20% прогресс · +15 усталость');
        return true;
      },
    },
    {
      id: 'quality_audit',
      icon: '🔍', title: 'Внешний аудит',
      desc: 'Эксперт проверяет работу со стороны — дорого, но надёжно.',
      costLabel: '−20К',
      effectLabel: '+10% качество',
      available: () => true,
      whenLocked: c => (c._progress || 0) > 0 ? null : 'нет работы для аудита',
      apply: c => {
        if ((G.money || 0) < 20000) { notify('Недостаточно средств для аудита','error'); return false; }
        G.money -= 20000;
        c._lcQualityBonus = (c._lcQualityBonus || 0) + 10;
        logDecision(c, c._lcPhase, 'Внешний аудит качества', '+10% качество · −20К');
        return true;
      },
    },
    {
      id: 'risk_review',
      icon: '🛡', title: 'Разбор рисков',
      desc: 'Командный разбор узких мест — снижаем риск.',
      costLabel: '−8К',
      effectLabel: '−15 ⚠️',
      available: c => (c._lcRisk || 0) > 10,
      naLabel: 'риск уже низкий',
      apply: c => {
        if ((G.money || 0) < 8000) { notify('Недостаточно средств','error'); return false; }
        G.money -= 8000;
        riskDelta(c, -15);
        logDecision(c, c._lcPhase, 'Разбор рисков с командой', '−15 риска · −8К');
        return true;
      },
    },
    // п.18 (Ф.2): действия влияния на клиента — calendar-кулдаун через _actionCooldowns
    {
      id: 'client_sync',
      icon: '🤝', title: 'Синхронизация',
      desc: 'Встреча по ожиданиям: клиент понимает прогресс, напряжение спадает.',
      costLabel: '−15К',
      effectLabel: '+15 😊 · −10 ⚠️',
      cooldownMonths: 2,
      bypassPhaseCheck: true,
      available: c => !((c._actionCooldowns || {}).client_sync > 0),
      apply: c => {
        if ((G.money || 0) < 15000) { notify('Недостаточно средств для встречи', 'error'); return false; }
        G.money -= 15000;
        moodDelta(c, +15);
        riskDelta(c, -10);
        c._actionCooldowns = c._actionCooldowns || {};
        c._actionCooldowns.client_sync = 2;
        logDecision(c, c._lcPhase, 'Синхронизация с клиентом', '+15 настроения · −10 риска · −15К');
        return true;
      },
    },
    {
      id: 'bonus_demo',
      icon: '🎬', title: 'Бонус-демо',
      desc: 'Мини-показ без штрафа к ходу — клиент видит прогресс, доверие растёт.',
      costLabel: '−12К',
      effectLabel: '+12 😊 · +5% качество',
      cooldownMonths: 1,
      bypassPhaseCheck: true,
      available: c => !((c._actionCooldowns || {}).bonus_demo > 0),
      whenLocked: c => (c._progress || 0) > 0 ? null : 'нет прогресса для показа',
      apply: c => {
        if ((G.money || 0) < 12000) { notify('Недостаточно средств для демо', 'error'); return false; }
        G.money -= 12000;
        moodDelta(c, +12);
        c._lcQualityBonus = (c._lcQualityBonus || 0) + 5;
        c._actionCooldowns = c._actionCooldowns || {};
        c._actionCooldowns.bonus_demo = 1;
        logDecision(c, c._lcPhase, 'Бонус-демо клиенту', '+12 настроения · +5% качество · −12К');
        return true;
      },
    },
    // ── Расширенный пул методов влияния (v3.57) ──
    {
      id: 'expectations',
      icon: '🗣', title: 'Управление ожиданиями',
      desc: 'Заранее проговорить рамки и приоритеты — клиент спокойнее. Доступно с самого начала.',
      costLabel: '−5К',
      effectLabel: '+10 😊',
      available: c => (c._lcClientMood || 60) < 90,
      naLabel: 'настроение макс.',
      apply: c => {
        if ((G.money || 0) < 5000) { notify('Недостаточно средств', 'error'); return false; }
        G.money -= 5000;
        moodDelta(c, +10);
        logDecision(c, c._lcPhase, 'Управление ожиданиями', '+10 настроения · −5К');
        return true;
      },
    },
    {
      id: 'crisis_meeting',
      icon: '🧯', title: 'Антикризисная встреча',
      desc: 'Серьёзный разбор проблем с командой и клиентом — сильно снижает риск.',
      costLabel: '−18К',
      effectLabel: '−25 ⚠️',
      cooldownMonths: 2,
      available: c => (c._lcRisk || 0) > 15 && !((c._actionCooldowns || {}).crisis_meeting > 0),
      naLabel: 'риск уже низкий',
      apply: c => {
        if ((G.money || 0) < 18000) { notify('Недостаточно средств', 'error'); return false; }
        G.money -= 18000;
        riskDelta(c, -25);
        c._actionCooldowns = c._actionCooldowns || {};
        c._actionCooldowns.crisis_meeting = 2;
        logDecision(c, c._lcPhase, 'Антикризисная встреча', '−25 риска · −18К');
        return true;
      },
    },
    {
      id: 'ux_review',
      icon: '🔬', title: 'UX-ревью / тест-группа',
      desc: 'Прогнать работу через тест-группу — заметный прирост качества. Нужна готовая работа.',
      costLabel: '−14К',
      effectLabel: '+8% качество',
      available: () => true,
      whenLocked: c => (c._progress || 0) > 0 ? null : 'нет работы для теста',
      apply: c => {
        if ((G.money || 0) < 14000) { notify('Недостаточно средств', 'error'); return false; }
        G.money -= 14000;
        c._lcQualityBonus = (c._lcQualityBonus || 0) + 8;
        logDecision(c, c._lcPhase, 'UX-ревью / тест-группа', '+8% качество · −14К');
        return true;
      },
    },
  ];

  // Р.3 / разблок: сколько действий в месяц доступно проекту. База 1.
  // Источники-бонусы (комбинация, НЕ со старта) — подключаются во 2-м проходе:
  //   • перк Древа 2.0 (G.perks.extraProjectAction)
  //   • спец-эффект назначенного специалиста (роль/трейт)
  //   • roguelite-открытие (G.runMap.bonusProjectAction)
  function getActionsPerMonth(client) {
    let n = 1;
    if (typeof G !== 'undefined') {
      // перк Древа 2.0 (хук — узел выставляет флаг)
      if (G.perks && G.perks.extraProjectAction) n += (G.perks.extraProjectAction | 0);
      // roguelite-открытие (хук — DLC выставляет бонус)
      if (G.runMap && G.runMap.bonusProjectAction) n += (G.runMap.bonusProjectAction | 0);
      // спец-эффект: Менеджер, назначенный на этот проект, даёт +1 действие/мес
      if (client && Array.isArray(G.staff)) {
        const onProj = G.staff.filter(s => s._assignedProjectId === client.id && s.status !== 'fired');
        n += onProj.reduce((a, s) => a + (s._extraProjectAction | 0) + (s.role === 'manager' ? 1 : 0), 0);
      }
    }
    return Math.max(1, n);
  }

  function triggerPlayerAction(clientId, actionId) {
    const client = (G.activeClients || []).find(c => c.id === clientId);
    if (!client) return;
    const action = PLAYER_ACTIONS.find(a => a.id === actionId);
    if (!action) return;

    // Р.3: лимит действий в месяц НА ПРОЕКТ (база 1, расширяется getActionsPerMonth).
    const perMonth = getActionsPerMonth(client);
    if ((client._actionsUsedThisMonth || 0) >= perMonth) {
      notify(`${action.icon} На этот месяц лимит действий по проекту исчерпан (${perMonth}/мес)`, 'warning');
      return;
    }
    // Ф.2: нарративный гейт — нечего показывать/аудировать без прогресса работы.
    const lockReason = action.whenLocked ? action.whenLocked(client) : null;
    if (lockReason) { notify(`${action.icon} ${lockReason}`, 'warning'); return; }
    // п.18 (Ф.2): calendar-кулдаун
    if ((client._actionCooldowns || {})[actionId] > 0) {
      const left = client._actionCooldowns[actionId];
      notify(`${action.icon} Доступно через ${left} мес.`, 'warning');
      return;
    }

    const ok = action.apply(client);
    if (ok) {
      client._actionsUsedThisMonth = (client._actionsUsedThisMonth || 0) + 1;  // Р.3: расход месячного лимита проекта
      addLog(`⚡ ${client.name}: ${action.title} — ${action.effectLabel}`, 'teal');
      notify(`${action.icon} ${action.title}: ${action.effectLabel}`, 'success');
      closeDetailPanel();
      _emitRender();
    }
  }

  // ══════════════════════════════════════════════════════
  //  ПАНЕЛЬ ДЕТАЛЕЙ ПРОЕКТА
  // ══════════════════════════════════════════════════════

  function showDetailPanel(clientId) {
    const client = (G.activeClients || []).find(c => c.id === clientId);
    const modal  = document.getElementById('lc-detail-modal');
    if (!client || !modal) return;

    const mood    = Math.round(client._lcClientMood || 60);
    const risk    = Math.round(client._lcRisk || 0);
    const quality = Math.round(client._lcQualityBonus || 0);
    const moodCol = mood >= 70 ? 'var(--green)' : mood >= 45 ? 'var(--teal)' : 'var(--amber)';
    const riskCol = risk >= 60 ? 'var(--red)' : risk >= 30 ? 'var(--amber)' : 'var(--teal)';

    // ── Цепочка фаз ──────────────────────────────────────
    const chain  = client._lcChain || [];
    const curIdx = client._lcPhaseIdx || 0;
    const chainHtml = chain.map((ph, i) => {
      const done    = i < curIdx;
      const current = i === curIdx;
      const col    = done ? 'var(--teal)' : current ? 'var(--amber)' : 'rgba(255,255,255,.2)';
      const bg     = done ? 'rgba(45,212,191,.10)' : current ? 'rgba(210,153,34,.10)' : 'rgba(255,255,255,.03)';
      const border = done ? 'rgba(45,212,191,.25)' : current ? 'rgba(210,153,34,.25)' : 'rgba(255,255,255,.06)';
      return `
        <div style="display:flex;align-items:center;gap:3px;padding:3px 6px;border-radius:4px;
                    background:${bg};border:1px solid ${border};white-space:nowrap">
          <span style="font-size:10px">${done ? '✓' : current ? '▶' : '○'}</span>
          <span style="font-size:10px;color:${col};font-weight:${current ? 700 : 400}">${PHASE_LABELS[ph] || ph}</span>
        </div>`;
    }).join('<span style="color:rgba(255,255,255,.15);font-size:9px;padding:0 1px">›</span>');

    // ── Активные действия (только в work-фазах) ──────────
    const isWork = (client._lcPhase || '').startsWith('work_');
    let actionsHtml = '';
    if (isWork && !client._lcPendingDecision) {
      const cdMap       = client._actionCooldowns || {};
      // Р.3: лимит действий в месяц НА ПРОЕКТ.
      const perMonth    = getActionsPerMonth(client);
      const monthLeft   = Math.max(0, perMonth - (client._actionsUsedThisMonth || 0));
      const monthOver   = monthLeft <= 0;
      // Б.6: показываем ВСЕ действия всегда; недоступные = disabled с причиной (не скрываем).
      const visibleActions = PLAYER_ACTIONS;
      if (visibleActions.length) {
        actionsHtml = `
          <div style="margin-bottom:14px">
            <div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.6px;margin-bottom:7px">⚡ Активные действия <span style="color:var(--teal);font-weight:500;text-transform:none;letter-spacing:0">· не тратят дни · осталось ${monthLeft}/${perMonth} в этом месяце</span></div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
              ${visibleActions.map(a => {
                const cdLeft     = cdMap[a.id] || 0;
                const lockReason = a.whenLocked ? a.whenLocked(client) : null;
                const naNow      = !cdLeft && !lockReason && !a.available(client);
                const disabled   = monthOver || cdLeft > 0 || !!lockReason || naNow;
                const statusTag = monthOver
                  ? `<span style="font-size:10px;padding:1px 5px;border-radius:3px;background:rgba(255,255,255,.06);color:var(--muted)">в этом месяце исчерпано</span>`
                  : cdLeft > 0
                  ? `<span style="font-size:10px;padding:1px 5px;border-radius:3px;background:rgba(168,85,247,.1);color:rgba(168,85,247,.8)">через ${cdLeft} мес.</span>`
                  : lockReason
                    ? `<span style="font-size:10px;padding:1px 5px;border-radius:3px;background:rgba(255,255,255,.06);color:var(--muted)">${lockReason}</span>`
                    : naNow
                      ? `<span style="font-size:10px;padding:1px 5px;border-radius:3px;background:rgba(255,255,255,.06);color:var(--muted)">${a.naLabel || 'недоступно сейчас'}</span>`
                      : `<span style="font-size:10px;padding:1px 5px;border-radius:3px;background:rgba(248,81,73,.12);color:var(--red)">${a.costLabel}</span>
                       <span style="font-size:10px;padding:1px 5px;border-radius:3px;background:rgba(45,212,191,.12);color:var(--teal)">${a.effectLabel}</span>`;
                if (disabled) {
                  return `
                    <div style="text-align:left;padding:8px 10px;border-radius:6px;border:1px solid rgba(255,255,255,.07);
                                background:rgba(255,255,255,.03);opacity:.55;cursor:not-allowed">
                      <div style="font-size:12px;font-weight:600;color:var(--sub)">${a.icon} ${a.title}</div>
                      <div style="font-size:10px;color:var(--muted);margin-top:2px">${a.desc}</div>
                      <div style="margin-top:5px;display:flex;gap:6px">${statusTag}</div>
                    </div>`;
                }
                return `
                  <button onclick="Projects.triggerPlayerAction('${client.id}','${a.id}')"
                    style="text-align:left;padding:8px 10px;border-radius:6px;border:1px solid rgba(45,212,191,.2);
                           background:rgba(45,212,191,.05);cursor:pointer;transition:background .15s"
                    onmouseover="this.style.background='rgba(45,212,191,.10)'"
                    onmouseout="this.style.background='rgba(45,212,191,.05)'">
                    <div style="font-size:12px;font-weight:600;color:var(--text)">${a.icon} ${a.title}</div>
                    <div style="font-size:10px;color:var(--muted);margin-top:2px">${a.desc}</div>
                    <div style="margin-top:5px;display:flex;gap:6px">${statusTag}</div>
                  </button>`;
              }).join('')}
            </div>
          </div>`;
      }
    }

    // ── История решений ───────────────────────────────────
    const hist     = client._lcHistory || [];
    // Группируем по фазе для читаемости
    const byPhase  = {};
    hist.forEach(h => {
      const key = h.phase;
      if (!byPhase[key]) byPhase[key] = [];
      byPhase[key].push(h);
    });
    const histHtml = Object.keys(byPhase).length
      ? Object.entries(byPhase).map(([ph, items]) => `
          <div style="margin-bottom:8px">
            <div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;
                 letter-spacing:.5px;margin-bottom:4px;padding-bottom:3px;
                 border-bottom:1px solid rgba(255,255,255,.06)">
              ${PHASE_ICONS[ph] || '·'} ${PHASE_LABELS[ph] || ph}
            </div>
            ${items.map(h => `
              <div style="padding:3px 0;display:flex;align-items:baseline;gap:6px">
                <span style="font-size:11px;color:var(--text);flex:1">${h.choice.replace(/^[^:]+:\s*/, '')}</span>
                ${h.effect ? `<span style="font-size:10px;color:var(--sub);white-space:nowrap;font-style:italic">${h.effect}</span>` : ''}
              </div>`).join('')}
          </div>`).join('')
      : '<div style="font-size:11px;color:var(--muted)">Решений пока нет.</div>';

    document.getElementById('lc-detail-name').textContent  = `${client.icon} ${client.name}`;
    document.getElementById('lc-detail-tier').textContent  = `T${client.tier || 1} · ${fmtK(client._totalBudget || 0)}`;
    document.getElementById('lc-detail-chain').innerHTML   = `<div style="display:flex;flex-wrap:wrap;gap:3px;align-items:center">${chainHtml}</div>`;
    document.getElementById('lc-detail-mood').innerHTML    = `<span style="color:${moodCol};font-weight:700;font-size:15px">${mood}</span>`;
    document.getElementById('lc-detail-risk').innerHTML    = `<span style="color:${riskCol};font-weight:700;font-size:15px">${risk}</span>`;
    document.getElementById('lc-detail-quality').innerHTML = `<span style="color:var(--teal);font-weight:700;font-size:15px">+${quality}%</span>`;
    // lc-detail-tags скрыт через display:none в HTML — JS ничего не трогает
    document.getElementById('lc-detail-history').innerHTML = actionsHtml + histHtml;

    modal.classList.add('active');
  }

  function closeDetailPanel() {
    const m = document.getElementById('lc-detail-modal');
    if (m) m.classList.remove('active');
  }

  // ══════════════════════════════════════════════════════
  //  п.19 (Ф.3) — ПЕРЕГОВОРНЫЙ АУДИТ (pre-sign)
  //  Разблокируется пёрком negotiator. Вызывается из startSign()
  //  в engine.js — до signProject(). Выбор записывается в
  //  G._pendingNegAudit и применяется к объекту клиента внутри
  //  signProject при создании.
  // ══════════════════════════════════════════════════════
  function preSignAudit(pid) {
    const def = (typeof PROJECT_POOL !== 'undefined' ? PROJECT_POOL : []).find(p => p.id === pid);
    if (!def) { signProject(pid); return; }

    const hasCloser  = G.upgrades && G.upgrades['closer'];
    const budgetApprox = (() => {
      const fb = def.fixedBudget;
      if (Array.isArray(fb)) return Math.round((fb[0] + fb[1]) / 2 / 1000) * 1000;
      if (fb) return fb;
      const rng = (typeof BUDGET_RANGES !== 'undefined' ? BUDGET_RANGES : {})[def.tier];
      return rng ? Math.round((rng[0] + rng[1]) / 2 / 5000) * 5000 : 0;
    })();

    _showLCModal({
      client: { ...def, id: pid },
      icon: '🤝', title: 'Переговорный аудит',
      phaseLabel: `${def.icon||'📄'} ${def.name}  ·  До подписания`,
      body: `<div style="font-size:11px;color:var(--muted);margin-bottom:8px">
        Переговорщик в команде — можно согласовать условия <em>до</em> подписания контракта.
        ${budgetApprox ? `Ориентировочный бюджет: <strong style="color:var(--text)">${fmtK(budgetApprox)}</strong>.` : ''}
      </div>`,
      choices: [
        {
          text: 'Подписать стандартно',
          desc: 'Без переговоров — быстро, без риска.',
          effect: 'Без изменений',
          highlight: true,
          fn: () => { _closeLCModal(); signProject(pid); },
        },
        {
          text: 'Выбить улучшенный аванс',
          desc: 'Агрессивный запрос предоплаты. Клиент слегка напряжётся, но шанс аванса вырастет.',
          effect: 'Аванс-шанс +25% · −5 настроения',
          fn: () => {
            G._pendingNegAudit = { pid, prepayBoost: 0.25, moodHit: -5 };
            _closeLCModal();
            signProject(pid);
          },
        },
        {
          text: 'Предложить расширенный скоуп',
          desc: 'Включаем допуслугу в контракт. Бюджет вырастет, сроки чуть растянутся.',
          effect: 'Бюджет +15% · Сроки +1 мес · −8 настроения',
          fn: () => {
            G._pendingNegAudit = { pid, scopeBoost: true, moodHit: -8 };
            _closeLCModal();
            signProject(pid);
          },
        },
        ...(hasCloser ? [{
          text: '💼 Закрыть с нажимом',
          desc: 'Переговорщик + Клоузер: улучшенный аванс и выше итоговая выплата.',
          effect: 'Аванс-шанс +20% · Бюджет +8% · −6 настроения',
          fn: () => {
            G._pendingNegAudit = { pid, prepayBoost: 0.20, budgetBoost: 0.08, moodHit: -6 };
            _closeLCModal();
            signProject(pid);
          },
        }] : []),
      ],
    });
  }

  // ── Публичный API ───────────────────────────────────────
  return {
    buildPhaseChain,
    initLCState,
    advancePhase,
    autoResolveNegotiation,
    showPhasePopup,
    renderPhaseBadge,
    triggerWorkEvent,
    resolveWorkEvent,
    triggerPlayerAction,
    showDetailPanel,
    closeDetailPanel,
    preSignAudit,
    PHASE_LABELS,
    PHASE_ICONS,
  };

})();

// Б.8 (2026-06-18): inline-обработчики (onclick="Projects.*") резолвят имена
// только по свойствам window, а top-level `const Projects` туда не попадает.
// Без этого все кнопки «Детали» и действия проекта молча падают с ReferenceError.
if (typeof window !== 'undefined') window.Projects = Projects;
