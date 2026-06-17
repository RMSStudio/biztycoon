'use strict';
// ══════════════════════════════════════════════════════════════════════
//   src/competitors.js — Живой рынок: каркас конкурентов (Фаза C, шаг 1)
//   v0.1 (2026-06-15) · Тип A · опциональная подсистема ядра
//
//   Реализует первый кусок Фазы C из design_living_market.md:
//   - 4 архетипа ИИ-агентств: 🦈 Демпер, 💎 Бутик, 🏭 Машина найма,
//     🌐 Сетевик (Дикая карта добавляется в опц. шаге C.1+).
//   - Стейт `G.market.competitors[]` (id, name, archetype, revenue,
//     reputation, portfolio, staff, history).
//   - Тик `_tickMarket()` каждый месяц через обёртку advanceMonth —
//     каждый конкурент по своему политике-архетипу прирастает
//     revenue/rep/portfolio/staff с шумом (без полного движка,
//     по таблице из дизайн-дока).
//   - Композитный скор + рейтинг рынка с подмешанным игроком.
//   - Модал «🏆 Рынок» (таблица с трендами) + пилюля «🏆 место N/M»
//     в шапке рядом с пилюлей стадии.
//
//   Чего НЕ делает (запланировано на следующие шаги Фазы C):
//   - Конкуренция за офферы (питч-контест) — шаг C.2.
//   - Хантинг сотрудников против loyalty — шаг C.3.
//   - Демпинг-волны — шаг C.4.
//   - Ежегодные награды + церемония — шаг C.5.
//   - Гейты стадий 4–6 (Сеть/Холдинг/Империя) — шаг C.6, требует
//     наград и рейтинга из C.1–C.5.
//
//   Стартовый пул конкурентов берётся из `SCENARIO.competitors[]`
//   (Тип C — чистые данные), либо fallback на встроенный пул.
//   На этом шаге сценарии ещё не объявляют свой `competitors[]` —
//   используется DEFAULT_COMPETITORS (4 архетипа, нейтральные имена).
//
//   Godot-portability: модуль DOM-free снаружи `_renderXxx`-функций.
//   Все мутации только в `G.market`; engine ничего не знает о модуле.
// ══════════════════════════════════════════════════════════════════════

(function () {
  const COMPETITORS_ENABLED = true;
  if (!COMPETITORS_ENABLED) return;

  const VERSION = 'v0.1';

  // ── Архетипы ────────────────────────────────────────────────────────
  // Поведение задаётся декларативно: rev[min,max] / repDelta[min,max] /
  // portfolio[min,max] / staffProb (шанс +1 в месяц).  Wildcard не
  // помещаем в дефолтный пул — это опциональный архетип из дизайн-дока,
  // его подключаем позже отдельной флагованной фичей.

  const ARCHETYPES = {
    demper: {
      id:    'demper',
      name:  'Демпер',
      icon:  '🦈',
      color: '#ef4444',
      sub:   'Растёт за счёт цены, низкий Q',
      tick: () => ({
        revGain:  600000 + Math.floor(Math.random() * 900000),
        repDelta: Math.floor(Math.random() * 4) - 1,    // -1..+2
        pfGain:   1,
        staffP:   0.10,
      }),
    },
    boutique: {
      id:    'boutique',
      name:  'Бутик',
      icon:  '💎',
      color: '#22d3ee',
      sub:   'Мало проектов, высокий Q и реп',
      tick: () => ({
        revGain:  800000 + Math.floor(Math.random() * 1500000),
        repDelta: 1 + Math.floor(Math.random() * 3),    // +1..+3
        pfGain:   2,
        staffP:   0.05,
      }),
    },
    hireMachine: {
      id:    'hireMachine',
      name:  'Машина найма',
      icon:  '🏭',
      color: '#f59e0b',
      sub:   'Агрессивно растит штат',
      tick: (c) => ({
        revGain:  (c.staff >= 5 ? 1200000 : 700000) + Math.floor(Math.random() * 1200000),
        repDelta: Math.floor(Math.random() * 2),        // 0..+1
        pfGain:   1 + Math.floor(Math.random() * 2),
        staffP:   0.40,
      }),
    },
    networker: {
      id:    'networker',
      name:  'Сетевик',
      icon:  '🌐',
      color: '#a78bfa',
      sub:   'Масштаб, филиалы, много мелких',
      tick: () => ({
        revGain:  400000 + Math.floor(Math.random() * 700000),
        repDelta: Math.floor(Math.random() * 2),        // 0..+1
        pfGain:   1 + Math.floor(Math.random() * 3),    // 1..3
        staffP:   0.20,
      }),
    },
  };

  // Встроенный стартовый пул — 4 конкурента, по одному на архетип.
  const DEFAULT_COMPETITORS = [
    { id: 'comp_lean',    name: 'Lean Studio',     archetype: 'demper' },
    { id: 'comp_atelier', name: 'Atelier',         archetype: 'boutique' },
    { id: 'comp_factory', name: 'Factory Group',   archetype: 'hireMachine' },
    { id: 'comp_grid',    name: 'GridNet',         archetype: 'networker' },
  ];

  // ── Хелперы ──────────────────────────────────────────────────────────

  function _cumulativeRevenue(g) {
    if (!g || !Array.isArray(g.completedProjects)) return 0;
    let s = 0;
    for (let i = 0; i < g.completedProjects.length; i++) s += (g.completedProjects[i].revenue || 0);
    return s;
  }

  function _scenarioCompetitors() {
    if (typeof SCENARIO === 'undefined' || !SCENARIO || !Array.isArray(SCENARIO.competitors)) return null;
    return SCENARIO.competitors.slice();
  }

  // Композитный скор: revenue/1M × 50 + reputation × 0.3 + portfolio × 0.5
  function getScore(c) {
    const r = (c.revenue || 0) / 1000000;
    return r * 50 + (c.reputation || 0) * 0.3 + (c.portfolio || 0) * 0.5;
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

  // ── Инициализация ────────────────────────────────────────────────────

  function _initMarket() {
    if (typeof G === 'undefined' || !G) return;
    if (G.market && Array.isArray(G.market.competitors)) return; // уже инициализирован
    const list = _scenarioCompetitors() || DEFAULT_COMPETITORS;
    G.market = {
      version: VERSION,
      competitors: list.map(c => {
        const arch = ARCHETYPES[c.archetype] || ARCHETYPES.networker;
        return {
          id:         c.id,
          name:       c.name,
          archetype:  c.archetype,
          icon:       c.icon || arch.icon,
          revenue:    400000 + Math.floor(Math.random() * 600000),
          reputation: 35 + Math.floor(Math.random() * 25),
          portfolio: 2 + Math.floor(Math.random() * 5),
          staff:      2 + Math.floor(Math.random() * 3),
          history:    [],
        };
      }),
    };
  }

  // ── Тик конкурентов ─────────────────────────────────────────────────

  function _tickCompetitor(c) {
    const arch = ARCHETYPES[c.archetype];
    if (!arch || typeof arch.tick !== 'function') return;
    const dr = arch.tick(c);
    c.revenue    = Math.max(0, (c.revenue    || 0) + (dr.revGain  || 0));
    c.reputation = Math.max(0, Math.min(100, (c.reputation || 0) + (dr.repDelta || 0)));
    c.portfolio  = Math.max(0, (c.portfolio  || 0) + (dr.pfGain   || 0));
    if (Math.random() < (dr.staffP || 0)) c.staff = Math.max(0, (c.staff || 0) + 1);
    if (!c.history) c.history = [];
    c.history.push({
      month:      G.month || 0,
      revenue:    c.revenue,
      reputation: c.reputation,
      portfolio:  c.portfolio,
      staff:      c.staff,
    });
    if (c.history.length > 60) c.history = c.history.slice(-60);
  }

  function _tickMarket() {
    if (!G || !G.market || !Array.isArray(G.market.competitors)) return;
    for (let i = 0; i < G.market.competitors.length; i++) {
      _tickCompetitor(G.market.competitors[i]);
    }
  }

  // ── Рейтинг ──────────────────────────────────────────────────────────

  function _playerEntry() {
    if (!G) return null;
    return {
      id:         'player',
      name:       'Вы',
      icon:       '👑',
      archetype:  'player',
      revenue:    _cumulativeRevenue(G),
      reputation: G.reputation || 0,
      portfolio:  G.portfolio  || 0,
      staff:      (G.staff || []).length,
      isPlayer:   true,
    };
  }

  function getRanking() {
    if (!G || !G.market || !Array.isArray(G.market.competitors)) return [];
    const arr = G.market.competitors.slice();
    const me = _playerEntry();
    if (me) arr.push(me);
    arr.sort((a, b) => getScore(b) - getScore(a));
    return arr.map((c, i) => ({
      rank:       i + 1,
      score:      Math.round(getScore(c)),
      id:         c.id,
      name:       c.name,
      icon:       c.icon,
      archetype:  c.archetype,
      revenue:    c.revenue,
      reputation: c.reputation,
      portfolio:  c.portfolio,
      staff:      c.staff,
      isPlayer:   !!c.isPlayer,
    }));
  }

  function getPlayerRank() {
    const r = getRanking();
    const p = r.find(x => x.isPlayer);
    return p ? p.rank : null;
  }

  function getMarketSize() {
    return (G && G.market && Array.isArray(G.market.competitors)) ? G.market.competitors.length + 1 : 0;
  }

  // ── UI: пилюля «🏆 место N/M» в шапке ────────────────────────────────

  function _renderRankPill() {
    if (typeof document === 'undefined') return;
    const host = document.querySelector('.game-header .game-logo');
    if (!host) return;
    let pill = document.getElementById('cmp-rank-pill');
    if (!pill) {
      pill = document.createElement('div');
      pill.id = 'cmp-rank-pill';
      pill.style.cssText = 'display:inline-flex;align-items:center;gap:6px;margin-left:8px;padding:4px 10px;border-radius:999px;font-size:11px;font-weight:700;cursor:pointer;border:1px solid var(--border);background:rgba(255,255,255,.03);transition:background .15s';
      pill.onmouseover = () => { pill.style.background = 'rgba(255,255,255,.07)'; };
      pill.onmouseout  = () => { pill.style.background = 'rgba(255,255,255,.03)'; };
      pill.onclick = (e) => { e.stopPropagation(); showMarketModal(); };
      host.appendChild(pill);
    }
    const rank = getPlayerRank();
    const size = getMarketSize();
    if (!rank || !size) { pill.style.display = 'none'; return; }
    pill.style.display = 'inline-flex';
    let medal = '🏆';
    let color = 'var(--text)';
    if (rank === 1) { medal = '🥇'; color = '#fde047'; }
    else if (rank === 2) { medal = '🥈'; color = '#e2e8f0'; }
    else if (rank === 3) { medal = '🥉'; color = '#fbbf24'; }
    pill.innerHTML = '<span style="color:' + color + '">' + medal + '</span> <span style="color:' + color + '">' + rank + '/' + size + '</span> <span style="color:var(--muted);font-weight:500">место</span>';
  }

  // ── UI: модал «🏆 Рынок» ─────────────────────────────────────────────

  function showMarketModal() {
    if (typeof document === 'undefined') return;
    let m = document.getElementById('cmp-market-modal');
    if (!m) {
      m = document.createElement('div');
      m.id = 'cmp-market-modal';
      m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.78);z-index:336;display:flex;align-items:center;justify-content:center';
      m.onclick = e => { if (e.target === m) m.style.display = 'none'; };
      document.body.appendChild(m);
    }
    m.innerHTML = _renderMarketHtml();
    m.style.display = 'flex';
  }

  function _trendIcon(history, key) {
    if (!Array.isArray(history) || history.length < 2) return '—';
    const last = history[history.length - 1][key] || 0;
    const prev = history[history.length - 2][key] || 0;
    if (last > prev) return '▲';
    if (last < prev) return '▼';
    return '·';
  }
  function _trendColor(history, key) {
    if (!Array.isArray(history) || history.length < 2) return 'var(--muted)';
    const last = history[history.length - 1][key] || 0;
    const prev = history[history.length - 2][key] || 0;
    if (last > prev) return '#86efac';
    if (last < prev) return '#fca5a5';
    return 'var(--muted)';
  }

  function _renderMarketHtml() {
    const ranking = getRanking();
    if (!ranking.length) {
      return '<div style="background:var(--panel);border:1px solid var(--border);border-radius:14px;padding:24px;max-width:420px"><div style="font-size:12px;color:var(--muted);text-align:center;font-style:italic">Рынок ещё не инициализирован. Запустите партию.</div></div>';
    }
    const rows = ranking.map(c => {
      const arch = ARCHETYPES[c.archetype];
      const competitor = G.market.competitors.find(x => x.id === c.id);
      const trendRev   = competitor ? _trendIcon(competitor.history, 'revenue') : '—';
      const trendRevC  = competitor ? _trendColor(competitor.history, 'revenue') : 'var(--muted)';
      const trendRep   = competitor ? _trendIcon(competitor.history, 'reputation') : '—';
      const trendRepC  = competitor ? _trendColor(competitor.history, 'reputation') : 'var(--muted)';
      const rowColor = c.isPlayer ? '#fbbf24' : (arch ? arch.color : '#94a3b8');
      const rowBg    = c.isPlayer ? 'rgba(251,191,36,.07)' : 'rgba(255,255,255,.02)';
      const rowBorder= c.isPlayer ? '#fbbf24' : 'var(--border)';
      let medal = '#' + c.rank;
      if (c.rank === 1) medal = '🥇';
      else if (c.rank === 2) medal = '🥈';
      else if (c.rank === 3) medal = '🥉';
      const archLabel = c.isPlayer ? 'игрок' : (arch ? arch.name : c.archetype);
      return '<div style="display:grid;grid-template-columns:36px 1fr 90px 70px 70px 60px;gap:8px;align-items:center;padding:8px 10px;border:1px solid ' + rowBorder + ';border-left:3px solid ' + rowColor + ';background:' + rowBg + ';border-radius:7px">' +
        '<div style="font-size:14px;font-weight:800;color:' + rowColor + ';text-align:center">' + medal + '</div>' +
        '<div style="min-width:0">' +
          '<div style="display:flex;align-items:center;gap:6px;font-size:12px;font-weight:700;color:var(--text)"><span>' + c.icon + '</span><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + c.name + '</span></div>' +
          '<div style="font-size:10px;color:var(--sub);margin-top:1px">' + archLabel + '</div>' +
        '</div>' +
        '<div style="text-align:right;font-size:11px;font-weight:700;color:var(--text)">' + _formatMoneyShort(c.revenue) + ' <span style="color:' + trendRevC + ';font-weight:800">' + trendRev + '</span></div>' +
        '<div style="text-align:right;font-size:11px;color:var(--text)">⭐ ' + Math.floor(c.reputation) + ' <span style="color:' + trendRepC + ';font-weight:800">' + trendRep + '</span></div>' +
        '<div style="text-align:right;font-size:11px;color:var(--text)">📚 ' + c.portfolio + '</div>' +
        '<div style="text-align:right;font-size:11px;color:var(--text)">👥 ' + c.staff + '</div>' +
      '</div>';
    }).join('');
    const head = '<div style="display:grid;grid-template-columns:36px 1fr 90px 70px 70px 60px;gap:8px;padding:0 10px 6px;font-size:9px;color:var(--muted);font-weight:700;letter-spacing:.08em;text-transform:uppercase">' +
        '<div></div><div>Конкурент</div><div style="text-align:right">Выручка</div><div style="text-align:right">Реп.</div><div style="text-align:right">Портф.</div><div style="text-align:right">Штат</div>' +
      '</div>';
    return '<div style="background:var(--panel);border:1px solid var(--border);border-radius:14px;padding:22px;max-width:660px;max-height:85vh;display:flex;flex-direction:column;width:96vw">' +
      '<div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">' +
        '<span style="font-size:28px">🏆</span>' +
        '<div>' +
          '<div style="font-size:11px;color:var(--muted);font-weight:700;letter-spacing:.13em;text-transform:uppercase">Рейтинг рынка</div>' +
          '<div style="font-size:18px;font-weight:800;color:var(--text);line-height:1.1">M' + (G.month || 0) + ' · ' + ranking.length + ' агентств</div>' +
        '</div>' +
      '</div>' +
      head +
      '<div style="display:flex;flex-direction:column;gap:5px;overflow-y:auto;flex:1">' + rows + '</div>' +
      '<div style="font-size:10px;color:var(--muted);margin-top:10px;text-align:center;font-style:italic">Скоринг: выручка × 50/M + репутация × 0.3 + портфолио × 0.5</div>' +
      '<button onclick="document.getElementById(\'cmp-market-modal\').style.display=\'none\'" style="margin-top:10px;background:rgba(255,255,255,.06);border:1px solid var(--border);color:var(--text);padding:8px 16px;border-radius:8px;cursor:pointer;font-size:11px;font-weight:700;align-self:center">Закрыть</button>' +
    '</div>';
  }

  // ── Обёртки startGame / advanceMonth ─────────────────────────────────

  if (typeof window !== 'undefined' && typeof window.startGame === 'function' && !window.startGame.__competitorsWrapped) {
    const _orig = window.startGame;
    window.startGame = function () {
      const r = _orig.apply(this, arguments);
      try { _initMarket(); _renderRankPill(); }
      catch (e) { try { console.warn('[competitors] startGame wrap', e); } catch (_) {} }
      return r;
    };
    window.startGame.__competitorsWrapped = true;
  }

  if (typeof window !== 'undefined' && typeof window.advanceMonth === 'function' && !window.advanceMonth.__competitorsWrapped) {
    const _orig = window.advanceMonth;
    window.advanceMonth = function () {
      const r = _orig.apply(this, arguments);
      try {
        _initMarket();
        _tickMarket();
        _renderRankPill();
        if (typeof EventBus !== 'undefined' && EventBus.emit) EventBus.emit('market_ticked', { month: G.month });
      } catch (e) { try { console.warn('[competitors] advanceMonth wrap', e); } catch (_) {} }
      return r;
    };
    window.advanceMonth.__competitorsWrapped = true;
  }

  if (typeof EventBus !== 'undefined' && EventBus.on) {
    EventBus.on('render', () => {
      try {
        if (typeof G !== 'undefined' && G && G._spec) {
          _initMarket();
          _renderRankPill();
        }
      } catch (e) {}
    });
  }

  // ── Публичный API ────────────────────────────────────────────────────
  if (typeof window !== 'undefined') {
    window.Competitors = {
      version:        VERSION,
      enabled:        COMPETITORS_ENABLED,
      getArchetypes:  () => Object.assign({}, ARCHETYPES),
      getDefaults:    () => DEFAULT_COMPETITORS.slice(),
      getCompetitors: () => ((G && G.market && Array.isArray(G.market.competitors)) ? G.market.competitors.slice() : []),
      getRanking,
      getPlayerRank,
      getMarketSize,
      getScore,
      showMarketModal,
      // dev/test
      _initMarket,
      _tickMarket,
      _tickCompetitor,
      _renderRankPill,
      _cumulativeRevenue,
      _formatMoneyShort,
    };
  }

  try {
    console.log('[competitors] ' + VERSION + ' активирован: ' + Object.keys(ARCHETYPES).length + ' архетипов, дефолтный пул ' + DEFAULT_COMPETITORS.length);
  } catch (e) {}
})();
