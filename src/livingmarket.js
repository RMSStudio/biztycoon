'use strict';
// ══════════════════════════════════════════════════════════════════════
//   src/livingmarket.js — Живой рынок: бесконечная прогрессия
//   v0.1 (2026-06-15) · Тип A · Фаза A первый шаг (см. design_living_market.md)
//
//   Опциональный модуль БАЗОВОГО геймплея, актуальный для всех версий.
//   Не DLC — управляется обычным const-флагом, как outsource (v3.8.1).
//   Активен по умолчанию; чтобы выключить — поменять LIVING_MARKET_ENABLED
//   на false или закомментировать строку `<script src="src/livingmarket.js">`
//   в index.html и `read('src/livingmarket.js')` в build/build.js.
//
//   Что делает:
//   1. Снимает классический win-экран — выставляет SCENARIO.settings.
//      winCondition = Infinity в обёртке startGame.  Engine читает это
//      значение в advanceMonth, поэтому никаких правок ядра не нужно.
//      Оригинальное значение сохраняется и используется как порог для
//      майлстоуна «Первые N ₽ на счету».
//   2. Вводит лестницу стадий компании (Гараж → Студия → Агентство →
//      Сеть → Холдинг → Империя) с композитными гейтами.  В этом шаге
//      реализованы 1–3 (Гараж/Студия/Агентство) — гейты считаются по
//      завершённым проектам, штату, репутации, накопленной выручке.
//      Стадии 4–6 объявлены, но требуют рейтинга/наград/поглощений —
//      это придёт с модулем конкурентов (Фаза C+ из дизайн-дока).
//   3. Декларативный фреймворк майлстоунов: список { id, name, icon,
//      desc, cond(G,helpers), once } проверяется в обёртке advanceMonth,
//      сработавшие пишутся в G.living.journal и эмитят сигнал
//      `milestone_reached` через EventBus.  Сигнал использует existing
//      `notify` UI (тост), журнал виден в модале «Журнал».
//   4. Пилюля стадии в .game-header .game-logo с прогресс-индикатором
//      ближайшего гейта (например «2/3 сдач · 1/2 штат · …»).
//
//   Чего НЕ делает (запланировано на следующие шаги):
//   • Годовые итоги M12/M24/… — отдельная итерация (этот шаг — каркас).
//   • Живые конкуренты / рейтинг / награды — Фаза C дизайн-дока.
//   • Древо 2.0 (★XP, 5 веток) — Фаза B.
//   • Активы (офисы, саббренды) и M&A — Фаза E.
//   • Перенос milestones в данные сценария — пока встроенный пул.
//
//   Godot-portability: модуль DOM-free снаружи `_renderXxx`-функций;
//   стейт мутирует только `G`, все ре-рендеры через EventBus.emit.
//   Engine ничего не знает о модуле.
// ══════════════════════════════════════════════════════════════════════

(function () {
  const LIVING_MARKET_ENABLED = true;
  if (!LIVING_MARKET_ENABLED) return;

  const VERSION = 'v0.1';

  // ── Стадии компании ────────────────────────────────────────────────
  // Гейт — функция G → { ok: boolean, progress: [{ label, cur, max }] }.
  // progress нужен для пилюли «следующий гейт N/M ✓»; даже выполненные
  // условия остаются в массиве (визуально перечёркнуты) — это явно
  // показывает игроку, какие именно требования у стадии.
  //
  // requiresMarket: true — гейт нельзя выполнить без модуля рынка
  // (награды/рейтинг/поглощения), стадия не достигается в этом шаге.
  // Подпись в UI: «Откроется с модулем «Живой рынок» (фаза C)».

  const STAGES = [
    {
      id: 'garage',
      idx: 0,
      name: 'Гараж',
      icon: '🏚',
      color: '#94a3b8',
      sub: 'Старт. Базовый цикл, T1–T2, никаких требований.',
      gate: () => ({ ok: true, progress: [] }),
      unlocks: 'базовый цикл, T1–T2 — стартовое состояние',
    },
    {
      id: 'studio',
      idx: 1,
      name: 'Студия',
      icon: '🛠',
      color: '#22d3ee',
      sub: '3 сдачи · штат 2 · накопленная выручка 2M ₽',
      gate: (g) => {
        const dels = _countDeliveries(g);
        const staff = _countStaff(g);
        const rev = _cumulativeRevenue(g);
        return _composite([
          { label: 'сдач', cur: dels,  max: 3 },
          { label: 'штат', cur: staff, max: 2 },
          { label: 'выручка', cur: rev, max: 2000000, fmt: 'money' },
        ]);
      },
      unlocks: 'древо прокачки, кейсы, T3-сделки',
    },
    {
      id: 'agency',
      idx: 2,
      name: 'Агентство',
      icon: '📈',
      color: '#a78bfa',
      sub: '10 сдач · штат 5 · репутация 75 · накопл. выручка 15M ₽',
      gate: (g) => {
        const dels = _countDeliveries(g);
        const staff = _countStaff(g);
        const rep = (g.reputation || 0);
        const rev = _cumulativeRevenue(g);
        return _composite([
          { label: 'сдач', cur: dels,  max: 10 },
          { label: 'штат', cur: staff, max: 5 },
          { label: 'реп.', cur: rep,   max: 75 },
          { label: 'выручка', cur: rev, max: 15000000, fmt: 'money' },
        ]);
      },
      unlocks: 'менеджер-слоты, рейтинг рынка, награды, T4-сделки',
    },
    // Стадии 4–6: гейты требуют живого рынка (награды/рейтинг/поглощения).
    // В этом шаге не достижимы. Декларируем заранее, чтобы UI показывал
    // полную лестницу и игрок видел, куда движется прогрессия.
    {
      id: 'network',
      idx: 3,
      name: 'Сеть',
      icon: '🌐',
      color: '#f59e0b',
      sub: '25 сдач · штат 10 · награда года ИЛИ топ-3 рейтинга · 60M ₽',
      gate: () => ({ ok: false, progress: [{ label: 'требуется модуль «Живой рынок»', cur: 0, max: 1, locked: true }] }),
      unlocks: 'второй офис (+capacity), хантинг у конкурентов, T5-сделки',
      requiresMarket: true,
    },
    {
      id: 'holding',
      idx: 4,
      name: 'Холдинг',
      icon: '🏛',
      color: '#facc15',
      sub: '50 сдач · штат 18 · №1 рейтинга ≥3 мес · 200M ₽',
      gate: () => ({ ok: false, progress: [{ label: 'требуется модуль «Живой рынок»', cur: 0, max: 1, locked: true }] }),
      unlocks: 'саббренды (параллельные команды), поглощение конкурентов, T6',
      requiresMarket: true,
    },
    {
      id: 'empire',
      idx: 5,
      name: 'Империя',
      icon: '👑',
      color: '#fde047',
      sub: '100 сдач · поглощён ≥1 конкурент · 500M ₽',
      gate: () => ({ ok: false, progress: [{ label: 'требуется модуль «Живой рынок»', cur: 0, max: 1, locked: true }] }),
      unlocks: 'T7, престиж-цели, режим «легаси»',
      requiresMarket: true,
    },
  ];

  // ── Майлстоуны (встроенный пул v0.1) ────────────────────────────────
  // В следующей итерации переедет в `scenarios/<id>.data.js → milestones[]`.
  // Каждый майлстоун — `cond(g, helpers)` → bool.  Срабатывает один раз,
  // id попадает в `g.living.journal`.  Заходит через обёртку advanceMonth.

  function _milestones(g) {
    const orig = (g.living && g.living.originalWinCondition) || 7500000;
    return [
      // Эшелон «Микро»
      { id: 'first_delivery', icon: '🏁', name: 'Первая сдача',
        desc: 'Завершить первый проект',
        tier: 'micro',
        cond: () => _countDeliveries(g) >= 1 },
      { id: 'reputation_50', icon: '⭐', name: 'Репутация 50',
        desc: 'Поднять репутацию агентства до 50',
        tier: 'micro',
        cond: () => (g.reputation || 0) >= 50 },
      { id: 'first_hire',    icon: '🤝', name: 'Первый найм',
        desc: 'Нанять хотя бы одного сотрудника',
        tier: 'micro',
        cond: () => _countStaff(g) >= 1 },
      { id: 'first_million', icon: '💵', name: 'Первый миллион',
        desc: 'Достичь баланса 1 000 000 ₽',
        tier: 'micro',
        cond: () => (g.money || 0) >= 1000000 },
      { id: 'five_deliveries', icon: '📦', name: 'Пять сдач',
        desc: 'Завершить 5 проектов суммарно',
        tier: 'micro',
        cond: () => _countDeliveries(g) >= 5 },
      // Эшелон «Средние»
      { id: 'team_5',         icon: '👥', name: 'Команда из пяти',
        desc: 'Штат вырос до 5 человек',
        tier: 'middle',
        cond: () => _countStaff(g) >= 5 },
      { id: 'revenue_5m',     icon: '📊', name: 'Выручка 5M',
        desc: 'Накопленная выручка преодолела 5 000 000 ₽',
        tier: 'middle',
        cond: () => _cumulativeRevenue(g) >= 5000000 },
      { id: 'portfolio_25',   icon: '📚', name: 'Портфолио 25',
        desc: 'Набрать 25 баллов портфолио',
        tier: 'middle',
        cond: () => (g.portfolio || 0) >= 25 },
      // Эшелон «Крупные» (стадии + бывший win)
      { id: 'original_win', icon: '💰', name: 'Старый порог',
        desc: 'Достичь капитала ' + _formatMoneyShort(orig) + ' (классический win-порог)',
        tier: 'large',
        // Используем пик кассы за партию (`_peakMoney`), а не текущий
        // баланс — иначе майлстоун теряется, если в тот же тик овердрафт
        // съел расходов и баланс снова упал ниже порога.
        cond: () => (g.living && g.living._peakMoney != null ? g.living._peakMoney : (g.money || 0)) >= orig },
      { id: 'stage_studio',  icon: '🛠', name: 'Стадия «Студия»',
        desc: 'Перейти на стадию Студия',
        tier: 'large',
        cond: () => _stageIdx(g) >= 1 },
      { id: 'stage_agency',  icon: '📈', name: 'Стадия «Агентство»',
        desc: 'Перейти на стадию Агентство',
        tier: 'large',
        cond: () => _stageIdx(g) >= 2 },
    ];
  }

  // ── Хелперы (DOM-free) ───────────────────────────────────────────────

  function _countDeliveries(g) {
    if (!g || !Array.isArray(g.completedProjects)) return 0;
    return g.completedProjects.length;
  }
  function _countStaff(g) { return (g && Array.isArray(g.staff)) ? g.staff.length : 0; }
  function _cumulativeRevenue(g) {
    if (!g || !Array.isArray(g.completedProjects)) return 0;
    let sum = 0;
    for (let i = 0; i < g.completedProjects.length; i++) {
      sum += (g.completedProjects[i].revenue || 0);
    }
    return sum;
  }
  function _stageIdx(g) { return (g && g.living && typeof g.living.stage === 'number') ? g.living.stage : 0; }

  // Композитный гейт: ok=true если ВСЕ условия выполнены.
  // Возвращает { ok, progress[] } чтобы UI мог показать прогресс-бары.
  function _composite(items) {
    let ok = true;
    for (let i = 0; i < items.length; i++) {
      if ((items[i].cur || 0) < items[i].max) { ok = false; break; }
    }
    return { ok, progress: items };
  }

  function _formatMoneyShort(n) {
    n = n || 0;
    if (n >= 1000000) {
      const m = n / 1000000;
      return (m === Math.floor(m) ? m.toFixed(0) : m.toFixed(1)) + 'M ₽';
    }
    if (n >= 1000) return Math.round(n / 1000) + 'K ₽';
    return n + ' ₽';
  }

  // ── Стейт ────────────────────────────────────────────────────────────
  // G.living = { stage, journal, originalWinCondition, milestonesFired }
  // — переживает сейв (saves.js сохраняет G целиком, _restore копирует поля).

  function _defaults() {
    return {
      version:               VERSION,
      stage:                 0,          // индекс текущей стадии в STAGES
      journal:               [],         // [{ id, icon, name, desc, tier, month, ts }]
      milestonesFired:       [],         // id зафиксированных майлстоунов (быстрая проверка)
      originalWinCondition:  null,       // запоминаем до подмены, для майлстоуна
    };
  }

  function _initLiving() {
    if (typeof G === 'undefined' || !G) return;
    if (!G.living) G.living = _defaults();
    else {
      // Back-compat: добиваем недостающие поля при загрузке старого сейва
      const d = _defaults();
      for (const k in d) if (!(k in G.living)) G.living[k] = d[k];
    }
  }

  // Пик кассы за партию — для майлстоунов, которые проверяют «крест порога»
  // (например original_win). Обновляется до того, как engine успеет списать
  // расходы и сбросить баланс ниже целевого числа. Не пишется в сейв
  // намеренно (это рантайм-трекер; сейв заранее не знает фактический пик).
  function _updateMoneyPeak() {
    if (typeof G === 'undefined' || !G || !G.living) return;
    const m = G.money || 0;
    if (G.living._peakMoney == null || m > G.living._peakMoney) G.living._peakMoney = m;
  }

  // ── Подмена winCondition (главный спецэффект модуля) ─────────────────
  // Сохраняем оригинал в G.living.originalWinCondition (для майлстоуна
  // «Старый порог»), затем выставляем Infinity в SCENARIO.settings.
  // Engine читает это значение в advanceMonth → win больше не сработает.
  // При отключённом флаге (см. начало файла) этот блок вообще не выполнится,
  // и engine продолжит триггерить win как раньше.

  function _suppressWin() {
    if (typeof SCENARIO === 'undefined' || !SCENARIO || !SCENARIO.settings) return;
    if (!G.living.originalWinCondition) {
      G.living.originalWinCondition = SCENARIO.settings.winCondition;
    }
    SCENARIO.settings.winCondition = Infinity;
  }

  // ── Тик: стадии + майлстоуны ─────────────────────────────────────────

  function _tickStages() {
    const cur = _stageIdx(G);
    // Пытаемся продвинуться на следующую достижимую стадию (несколько за тик
    // на случай, если за один месяц выполнились гейты сразу двух стадий —
    // например, на старте после _restore сейва).
    for (let i = cur + 1; i < STAGES.length; i++) {
      const st = STAGES[i];
      if (st.requiresMarket) break;       // дальше — заблокировано
      const r = st.gate(G);
      if (!r.ok) break;
      G.living.stage = i;
      _logStageReached(st);
    }
  }

  function _logStageReached(st) {
    const entry = {
      id: 'stage_' + st.id,
      icon: st.icon,
      name: 'Стадия «' + st.name + '»',
      desc: st.unlocks,
      tier: 'large',
      month: G.month || 0,
      ts:    Date.now(),
    };
    G.living.journal.push(entry);
    // Стадия — это тоже майлстоун с тем же id, помечаем чтобы _tickMilestones
    // не выдал второй раз через декл. правила (stage_studio/stage_agency)
    if (!G.living.milestonesFired.includes('stage_' + st.id)) {
      G.living.milestonesFired.push('stage_' + st.id);
    }
    // EventBus + UI
    if (typeof EventBus !== 'undefined' && EventBus.emit) {
      EventBus.emit('stage_reached', { stage: st, entry });
    }
    if (typeof notify === 'function') {
      notify(st.icon + ' Стадия «' + st.name + '» — ' + st.unlocks, 'success');
    }
    if (typeof addLog === 'function') {
      addLog(st.icon + ' Достигнута стадия «' + st.name + '»: ' + st.unlocks, 'green');
    }
    _showStageCeremony(st);
  }

  function _tickMilestones() {
    const fired = new Set(G.living.milestonesFired);
    const milestones = _milestones(G);
    for (let i = 0; i < milestones.length; i++) {
      const m = milestones[i];
      if (fired.has(m.id)) continue;
      let ok = false;
      try { ok = !!m.cond(G); } catch (e) { ok = false; }
      if (!ok) continue;
      G.living.milestonesFired.push(m.id);
      G.living.journal.push({
        id:   m.id,
        icon: m.icon,
        name: m.name,
        desc: m.desc,
        tier: m.tier,
        month: G.month || 0,
        ts:    Date.now(),
      });
      if (typeof EventBus !== 'undefined' && EventBus.emit) {
        EventBus.emit('milestone_reached', { milestone: m });
      }
      if (typeof notify === 'function') {
        notify(m.icon + ' ' + m.name, 'success');
      }
      if (typeof addLog === 'function') {
        addLog(m.icon + ' Майлстоун: ' + m.name + ' — ' + m.desc, 'purple');
      }
    }
  }

  // ── UI: пилюля стадии в шапке ────────────────────────────────────────

  function _renderStagePill() {
    if (typeof document === 'undefined') return;
    const host = document.querySelector('.game-header .game-logo');
    if (!host) return;
    let pill = document.getElementById('lm-stage-pill');
    if (!pill) {
      pill = document.createElement('div');
      pill.id = 'lm-stage-pill';
      pill.style.cssText = 'display:inline-flex;align-items:center;gap:6px;margin-left:10px;padding:4px 10px;border-radius:999px;font-size:11px;font-weight:700;cursor:pointer;border:1px solid var(--border);background:rgba(255,255,255,.03);transition:background .15s';
      pill.onmouseover = () => { pill.style.background = 'rgba(255,255,255,.07)'; };
      pill.onmouseout  = () => { pill.style.background = 'rgba(255,255,255,.03)'; };
      pill.onclick = () => showJournalModal();
      host.appendChild(pill);
    }
    const idx = _stageIdx(G);
    const st = STAGES[idx];
    let nextStr = '';
    if (idx + 1 < STAGES.length) {
      const next = STAGES[idx + 1];
      if (next.requiresMarket) {
        nextStr = ' · след.: 🔒 ' + next.name;
      } else {
        const r = next.gate(G);
        const parts = (r.progress || []).map(p => {
          const cur = p.fmt === 'money' ? _formatMoneyShort(p.cur) : Math.floor(p.cur);
          const max = p.fmt === 'money' ? _formatMoneyShort(p.max) : p.max;
          const done = (p.cur || 0) >= p.max;
          return (done ? '✓ ' : '') + cur + '/' + max + ' ' + p.label;
        });
        nextStr = ' · след. ' + next.name + ': ' + parts.join(' · ');
      }
    } else {
      nextStr = ' · финальная стадия';
    }
    pill.innerHTML = '<span style="color:' + st.color + '">' + st.icon + '</span> ' + st.name + '<span style="color:var(--muted);font-weight:500">' + nextStr + '</span>';
  }

  // ── UI: модал церемонии при достижении стадии ────────────────────────

  function _showStageCeremony(st) {
    if (typeof document === 'undefined') return;
    let m = document.getElementById('lm-stage-modal');
    if (!m) {
      m = document.createElement('div');
      m.id = 'lm-stage-modal';
      m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:340;display:flex;align-items:center;justify-content:center';
      m.onclick = e => { if (e.target === m) m.style.display = 'none'; };
      document.body.appendChild(m);
    }
    m.innerHTML =
      '<div style="background:var(--panel);border:2px solid ' + st.color + ';border-radius:14px;padding:32px;max-width:480px;text-align:center;box-shadow:0 0 60px ' + st.color + '44">' +
        '<div style="font-size:64px;line-height:1;margin-bottom:14px">' + st.icon + '</div>' +
        '<div style="font-size:12px;color:var(--muted);font-weight:700;letter-spacing:.15em;text-transform:uppercase;margin-bottom:6px">Стадия достигнута</div>' +
        '<div style="font-size:28px;font-weight:800;color:' + st.color + ';margin-bottom:14px">' + st.name + '</div>' +
        '<div style="font-size:13px;color:var(--text);margin-bottom:6px">' + st.sub + '</div>' +
        '<div style="font-size:12px;color:var(--sub);margin-bottom:22px;font-style:italic">Открыто: ' + st.unlocks + '</div>' +
        '<button onclick="document.getElementById(\'lm-stage-modal\').style.display=\'none\'" style="background:' + st.color + ';border:none;color:#0a0a0a;font-weight:700;padding:10px 28px;border-radius:8px;cursor:pointer;font-size:13px">Продолжить</button>' +
      '</div>';
    m.style.display = 'flex';
  }

  // ── UI: модал журнала ────────────────────────────────────────────────

  function showJournalModal() {
    if (typeof document === 'undefined') return;
    let m = document.getElementById('lm-journal-modal');
    if (!m) {
      m = document.createElement('div');
      m.id = 'lm-journal-modal';
      m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:330;display:flex;align-items:center;justify-content:center';
      m.onclick = e => { if (e.target === m) m.style.display = 'none'; };
      document.body.appendChild(m);
    }
    m.innerHTML = _renderJournalHtml();
    m.style.display = 'flex';
  }

  function _renderJournalHtml() {
    const journal = (G.living && G.living.journal) || [];
    const tierColors = { micro: '#94a3b8', middle: '#22d3ee', large: '#facc15' };
    const tierLabels = { micro: 'Микро', middle: 'Средние', large: 'Крупные' };
    const rows = journal.slice().reverse().map(j => {
      const c = tierColors[j.tier] || '#94a3b8';
      return '<div style="border:1px solid var(--border);border-left:3px solid ' + c + ';background:rgba(255,255,255,.02);border-radius:8px;padding:10px 13px;display:flex;align-items:center;gap:11px">' +
        '<span style="font-size:22px">' + j.icon + '</span>' +
        '<div style="min-width:0;flex:1">' +
          '<div style="font-size:12px;font-weight:700;color:var(--text)">' + j.name + '</div>' +
          '<div style="font-size:10px;color:var(--sub);margin-top:2px;line-height:1.4">' + j.desc + '</div>' +
        '</div>' +
        '<span style="font-size:10px;color:' + c + ';font-weight:700;background:rgba(255,255,255,.04);border:1px solid var(--border);border-radius:6px;padding:3px 8px;white-space:nowrap">M' + j.month + ' · ' + (tierLabels[j.tier] || j.tier) + '</span>' +
      '</div>';
    }).join('');

    const idx = _stageIdx(G);
    const st  = STAGES[idx];
    const next = STAGES[idx + 1];
    let nextHtml = '';
    if (next) {
      if (next.requiresMarket) {
        nextHtml = '<div style="border:1px dashed var(--border);background:rgba(255,255,255,.02);border-radius:8px;padding:11px 13px;margin-top:12px;font-size:11px;color:var(--muted)">🔒 ' + next.icon + ' <b>' + next.name + '</b> — откроется с модулем «Живой рынок» (фаза C дизайн-дока)</div>';
      } else {
        const r = next.gate(G);
        const parts = (r.progress || []).map(p => {
          const cur = p.fmt === 'money' ? _formatMoneyShort(p.cur) : Math.floor(p.cur);
          const max = p.fmt === 'money' ? _formatMoneyShort(p.max) : p.max;
          const done = (p.cur || 0) >= p.max;
          return '<div style="display:flex;justify-content:space-between;font-size:11px;line-height:1.6">' +
                   '<span style="color:var(--sub)">' + (done ? '✓ ' : '○ ') + p.label + '</span>' +
                   '<span style="color:' + (done ? '#86efac' : 'var(--text)') + ';font-weight:700">' + cur + ' / ' + max + '</span>' +
                 '</div>';
        }).join('');
        nextHtml =
          '<div style="border:1px solid ' + next.color + '55;background:rgba(255,255,255,.02);border-radius:8px;padding:11px 13px;margin-top:12px">' +
            '<div style="font-size:11px;color:var(--muted);font-weight:700;margin-bottom:6px">' + next.icon + ' Следующая стадия: <span style="color:' + next.color + '">' + next.name + '</span></div>' +
            parts +
          '</div>';
      }
    }

    const empty = rows ? '' : '<div style="font-size:11px;color:var(--muted);text-align:center;padding:24px;font-style:italic">Журнал пуст. Первые записи появятся при сдаче проектов, найме команды и росте репутации.</div>';
    return '<div style="background:var(--panel);border:1px solid var(--border);border-radius:14px;padding:22px;max-width:540px;max-height:80vh;display:flex;flex-direction:column;width:90vw">' +
      '<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">' +
        '<span style="font-size:24px">' + st.icon + '</span>' +
        '<div><div style="font-size:11px;color:var(--muted);font-weight:700;letter-spacing:.1em;text-transform:uppercase">Журнал прогресса</div>' +
        '<div style="font-size:18px;font-weight:800;color:' + st.color + '">' + st.name + ' · M' + (G.month || 0) + '</div></div>' +
      '</div>' +
      '<div style="font-size:11px;color:var(--sub);margin-bottom:12px">' + st.sub + '</div>' +
      nextHtml +
      '<div style="font-size:11px;font-weight:700;color:var(--muted);margin:14px 0 6px">Достижения (' + journal.length + ')</div>' +
      '<div style="display:flex;flex-direction:column;gap:5px;overflow-y:auto;flex:1">' + (rows || empty) + '</div>' +
      '<button onclick="document.getElementById(\'lm-journal-modal\').style.display=\'none\'" style="margin-top:14px;background:rgba(255,255,255,.06);border:1px solid var(--border);color:var(--text);padding:8px 16px;border-radius:8px;cursor:pointer;font-size:11px;font-weight:700;align-self:center">Закрыть</button>' +
    '</div>';
  }

  // ── Подключаем обёртки ───────────────────────────────────────────────

  // 1) startGame: инициализация стейта + подмена winCondition.
  if (typeof window.startGame === 'function' && !window.startGame.__livingMarketWrapped) {
    const _orig = window.startGame;
    window.startGame = function () {
      const r = _orig.apply(this, arguments);
      try {
        _initLiving();
        _suppressWin();
        _tickStages();
        _tickMilestones();
        _renderStagePill();
      } catch (e) { try { console.warn('[livingmarket] startGame wrap', e); } catch (_) {} }
      return r;
    };
    window.startGame.__livingMarketWrapped = true;
  }

  // 2) advanceMonth: проверка стадий + майлстоунов после каждого тика.
  // Пик кассы фиксируем ДО оригинальной advanceMonth (чтобы зафиксировать
  // значение, которое могло быть выше до списания overhead/зарплат) и
  // повторно ПОСЛЕ (на случай поступления денег внутри тика — события,
  // milestone-выплаты, переходы по фазам lifecycle).
  if (typeof window.advanceMonth === 'function' && !window.advanceMonth.__livingMarketWrapped) {
    const _orig = window.advanceMonth;
    window.advanceMonth = function () {
      try { _initLiving(); _updateMoneyPeak(); } catch (_) {}
      const r = _orig.apply(this, arguments);
      try {
        _initLiving();
        _updateMoneyPeak();
        _tickStages();
        _tickMilestones();
        _renderStagePill();
      } catch (e) { try { console.warn('[livingmarket] advanceMonth wrap', e); } catch (_) {} }
      return r;
    };
    window.advanceMonth.__livingMarketWrapped = true;
  }

  // 3) При каждом «render» — обновляем пилюлю (стейт мог поменяться
  // вне advanceMonth: ручной найм/увольнение, апгрейды и т.д.)
  if (typeof EventBus !== 'undefined' && EventBus.on) {
    EventBus.on('render', () => {
      try {
        if (typeof G !== 'undefined' && G && G._spec) {  // партия запущена
          _initLiving();
          _renderStagePill();
        }
      } catch (e) {}
    });
  }

  // ── Публичный API (для тестов и UI-кнопок) ──────────────────────────
  window.LivingMarket = {
    version:           VERSION,
    enabled:           LIVING_MARKET_ENABLED,
    getStages:         () => STAGES.slice(),
    getCurrentStage:   () => STAGES[_stageIdx(G)],
    getNextStage:      () => STAGES[_stageIdx(G) + 1] || null,
    getJournal:        () => ((G && G.living && G.living.journal) || []).slice(),
    getMilestones:     () => _milestones(G || {}),
    getFiredMilestoneIds: () => ((G && G.living && G.living.milestonesFired) || []).slice(),
    showJournalModal,
    // dev/test
    _initLiving,
    _suppressWin,
    _tickStages,
    _tickMilestones,
    _countDeliveries,
    _countStaff,
    _cumulativeRevenue,
    _formatMoneyShort,
  };

  try { console.log('[livingmarket] ' + VERSION + ' активирован: ' + STAGES.length + ' стадий (3 живых, 3 требуют модуль рынка)'); } catch (e) {}
})();
