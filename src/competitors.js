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

  // Русские имена архетипов живого ростра (ключи livingmarket).
  const ARCH_RU = { dumper:'Демпер', boutique:'Бутик', machine:'Машина найма', networker:'Сетевик', wildcard:'Дикая карта' };
  function _archName(key) { return ARCH_RU[key] || (ARCHETYPES[key] && ARCHETYPES[key].name) || key; }

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
      pill.onclick = (e) => { e.stopPropagation(); if (typeof switchTab === 'function') switchTab('market'); else showMarketModal(); };
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
    // Ф.7: гейт режима «Rogue-lite» (вне режима не блокирует)
    if (typeof isModuleUnlocked === 'function' && !isModuleUnlocked('market')) {
      if (typeof notify === 'function') notify('🔒 Живой рынок заперт — открой его в Дереве открытий', 'error');
      return;
    }
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
      const archLabel = c.isPlayer ? 'игрок' : _archName(c.archetype);
      const pf  = (c.portfolio != null) ? c.portfolio : Math.max(0, Math.round((c.deliveries || 0) / 6));
      const stf = (c.staff != null) ? c.staff : '—';
      const tradable = !c.isPlayer;
      const own = (!c.isPlayer && G.market && G.market.holdings && G.market.holdings[c.id]) || 0;
      const clickAttr = tradable
        ? ' onclick="Competitors.openAcquire(\'' + c.id + '\')" title="Доли · поглощение" style="cursor:pointer;'
        : ' style="';
      return '<div' + clickAttr + 'display:grid;grid-template-columns:36px 1fr 90px 64px 56px 48px 28px;gap:8px;align-items:center;padding:8px 10px;border:1px solid ' + rowBorder + ';border-left:3px solid ' + rowColor + ';background:' + rowBg + ';border-radius:7px' + (tradable ? ';transition:background .12s' : '') + '"' +
        (tradable ? ' onmouseover="this.style.background=\'rgba(167,139,250,.12)\'" onmouseout="this.style.background=\'' + rowBg + '\'"' : '') + '>' +
        '<div style="font-size:14px;font-weight:800;color:' + rowColor + ';text-align:center">' + medal + '</div>' +
        '<div style="min-width:0">' +
          '<div style="display:flex;align-items:center;gap:6px;font-size:12px;font-weight:700;color:var(--text)"><span>' + c.icon + '</span><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + c.name + '</span></div>' +
          '<div style="font-size:10px;color:var(--sub);margin-top:1px">' + archLabel + (own > 0 ? ' · <span style="color:#22d3ee">📈 ' + own + '%</span>' : '') + '</div>' +
        '</div>' +
        '<div style="text-align:right;font-size:11px;font-weight:700;color:var(--text)">' + _formatMoneyShort(c.revenue) + ' <span style="color:' + trendRevC + ';font-weight:800">' + trendRev + '</span></div>' +
        '<div style="text-align:right;font-size:11px;color:var(--text)">⭐ ' + Math.floor(c.reputation) + ' <span style="color:' + trendRepC + ';font-weight:800">' + trendRep + '</span></div>' +
        '<div style="text-align:right;font-size:11px;color:var(--text)">📚 ' + pf + '</div>' +
        '<div style="text-align:right;font-size:11px;color:var(--text)">👥 ' + stf + '</div>' +
        '<div style="text-align:center;font-size:12px;color:' + (tradable ? '#a78bfa' : 'transparent') + '">' + (tradable ? '🤝' : '') + '</div>' +
      '</div>';
    }).join('');
    const head = '<div style="display:grid;grid-template-columns:36px 1fr 90px 64px 56px 48px 28px;gap:8px;padding:0 10px 6px;font-size:9px;color:var(--muted);font-weight:700;letter-spacing:.08em;text-transform:uppercase">' +
        '<div></div><div>Конкурент</div><div style="text-align:right">Выручка</div><div style="text-align:right">Реп.</div><div style="text-align:right">Портф.</div><div style="text-align:right">Штат</div><div></div>' +
      '</div>';
    const acqHint = _canAcquire()
      ? '<div style="font-size:10px;color:#a78bfa;margin-top:8px;text-align:center">🤝 Кликните конкурента: доли и поглощение</div>'
      : '<div style="font-size:10px;color:#a78bfa;margin-top:8px;text-align:center">🤝 Кликните конкурента: доли с любой стадии · поглощение с «Сети»</div>';
    return '<div style="background:var(--panel);border:1px solid var(--border);border-radius:14px;padding:22px;max-width:660px;max-height:85vh;display:flex;flex-direction:column;width:96vw">' +
      '<div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">' +
        '<span style="font-size:28px">🏆</span>' +
        '<div>' +
          '<div style="font-size:11px;color:var(--muted);font-weight:700;letter-spacing:.13em;text-transform:uppercase">Рейтинг рынка</div>' +
          '<div style="font-size:18px;font-weight:800;color:var(--text);line-height:1.1">M' + (G.month || 0) + ' · ' + ranking.length + ' агентств</div>' +
        '</div>' +
      '</div>' +
      _devToggleHtml() +
      head +
      '<div style="display:flex;flex-direction:column;gap:5px;overflow-y:auto;flex:1">' + rows + '</div>' +
      '<div style="font-size:10px;color:var(--muted);margin-top:10px;text-align:center;font-style:italic">Скоринг: выручка × 50/M + репутация × 0.3 + портфолио × 0.5</div>' +
      acqHint +
      _renderSubsidiariesBlock() +
      '<button onclick="document.getElementById(\'cmp-market-modal\').style.display=\'none\'" style="margin-top:10px;background:rgba(255,255,255,.06);border:1px solid var(--border);color:var(--text);padding:8px 16px;border-radius:8px;cursor:pointer;font-size:11px;font-weight:700;align-self:center">Закрыть</button>' +
    '</div>';
  }

  // ── Дочерние компании (Ф.8 ребаланс) — поглощённые активы + ликвидация ──
  const LIQUIDATION_LOCK = 12;

  function _renderSubsidiariesBlock() {
    const lm   = _LM();
    const subs = (lm && lm.getSubsidiaries) ? lm.getSubsidiaries()
               : ((G && G.living && G.living.subsidiaries) || []);
    if (!subs || !subs.length) return '';
    const month = (G && G.month) || 0;
    const days  = (G && G.actions) || 0;
    const modeName = { integrate: 'интегр.', subbrand: 'саббренд' };
    const cards = subs.map(s => {
      const held    = month - (s.acquiredMonth || 0);
      const locked  = held < LIQUIDATION_LOCK;
      const left    = Math.max(0, LIQUIDATION_LOCK - held);
      const cash    = Math.max(0, Math.round((s.valuation || 0) * 0.5 / 1000) * 1000);
      const canDays = days >= 3;
      const can     = !locked && canDays;
      const sub     = locked
        ? '🔒 распродажа через ' + left + ' мес'
        : (canDays ? '💰 +' + _formatMoneyShort(cash) + ' · −3 дн.' : 'нужно ≥3 дн.');
      const btn = '<button ' + (can ? 'onclick="Competitors.doLiquidate(\'' + s.id + '\')"' : 'disabled') +
        ' style="padding:6px 10px;border-radius:7px;border:1px solid ' + (can ? 'rgba(251,191,36,.5)' : 'var(--border)') +
        ';background:' + (can ? 'rgba(251,191,36,.10)' : 'rgba(255,255,255,.02)') + ';color:' + (can ? '#fbbf24' : 'var(--muted)') +
        ';cursor:' + (can ? 'pointer' : 'not-allowed') + ';font-size:10px;font-weight:700;white-space:nowrap">' + sub + '</button>';
      return '<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid var(--border);border-left:3px solid #a78bfa;background:rgba(167,139,250,.05);border-radius:7px">' +
        '<span style="font-size:18px">' + (s.icon || '🏢') + '</span>' +
        '<div style="flex:1;min-width:0">' +
          '<div style="font-size:12px;font-weight:700;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + s.name + '</div>' +
          '<div style="font-size:10px;color:var(--sub)">' + (modeName[s.mode] || s.mode || '—') + ' · оценка ' + _formatMoneyShort(s.valuation || 0) + '</div>' +
        '</div>' + btn +
      '</div>';
    }).join('');
    return '<div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border)">' +
        '<div style="font-size:10px;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px">🏢 Дочерние компании · ' + subs.length + '</div>' +
        '<div style="display:flex;flex-direction:column;gap:5px">' + cards + '</div>' +
        '<div style="font-size:9px;color:var(--muted);margin-top:6px;text-align:center;font-style:italic">Ликвидация даёт ~50% оценки (убыток против вложенного) и открыта через ' + LIQUIDATION_LOCK + ' мес после поглощения.</div>' +
      '</div>';
  }

  function doLiquidate(id) {
    const lm = _LM();
    if (!lm || !lm.liquidateSubsidiary) return;
    const res = lm.liquidateSubsidiary(id);
    if (res && res.ok) {
      try { _renderRankPill(); } catch (_) {}
      if (document.getElementById('cmp-market-modal')) { try { showMarketModal(); } catch (_) {} }
    } else if (res && res.reason === 'locked') {
      if (typeof notify === 'function') notify('Ещё под локом — ' + (res.monthsLeft || 0) + ' мес', 'error');
    } else if (res && res.reason === 'no_days') {
      if (typeof notify === 'function') notify('Нужно ≥' + (res.days || 3) + ' рабочих дней', 'error');
    }
  }

  // ── Поглощения (Ф.8) — диалог с карточки конкурента ──────────────────

  function _LM() { return (typeof window !== 'undefined') ? window.LivingMarket : null; }

  // DEV/тест-тумблер активен?
  function _devOn() { const lm = _LM(); return !!(lm && lm.isMarketDevUnlocked && lm.isMarketDevUnlocked()); }
  // Эффективная стадия для UI-гейтов рынка (зеркало _gateStage из livingmarket).
  function _mktStage() {
    const s = (typeof G !== 'undefined' && G && G.living && (G.living.stage || 0)) || 0;
    return _devOn() ? Math.max(s, 4) : s;
  }

  // Доступны ли поглощения игроку (стадия «Сеть» = 3+, либо dev-тумблер)
  function _canAcquire() {
    return _mktStage() >= 3;
  }

  // DEV/тест-тумблер: компактный переключатель в шапке вкладки/модала рынка.
  // Разблокирует поглощения/доли/саббренды без стадии «Сеть» — только для тестов.
  function _devToggleHtml() {
    const on = _devOn();
    const knob = '<span style="position:absolute;top:2px;' + (on ? 'right:2px' : 'left:2px') + ';width:16px;height:16px;border-radius:50%;background:' + (on ? '#fff' : 'var(--sub)') + ';transition:all .12s"></span>';
    const sw = '<span style="position:relative;display:inline-block;width:36px;height:20px;border-radius:11px;background:' + (on ? 'rgba(167,139,250,.9)' : 'rgba(255,255,255,.1)') + ';border:1px solid ' + (on ? 'rgba(167,139,250,.9)' : 'var(--border)') + ';flex:0 0 auto">' + knob + '</span>';
    return '<div onclick="Competitors.toggleMarketDev()" title="Технический режим: доступ ко всему функционалу рынка без стадии «Сеть»" ' +
      'style="display:flex;align-items:center;gap:9px;padding:8px 11px;margin-bottom:12px;border-radius:10px;cursor:pointer;' +
      'border:1px dashed ' + (on ? 'rgba(167,139,250,.6)' : 'var(--border)') + ';background:' + (on ? 'rgba(167,139,250,.08)' : 'rgba(255,255,255,.02)') + '">' +
      sw +
      '<div style="flex:1;min-width:0">' +
        '<div style="font-size:11px;font-weight:800;color:' + (on ? '#c4b5fd' : 'var(--text)') + '">🔧 Тест-режим рынка' + (on ? ' · ВКЛ' : '') + '</div>' +
        '<div style="font-size:9px;color:var(--muted)">' + (on ? 'поглощения, доли и саббренды открыты без стадии «Сеть»' : 'разблокировать весь функционал рынка для тестов') + '</div>' +
      '</div>' +
    '</div>';
  }

  function toggleMarketDev() {
    const lm = _LM();
    if (!lm || !lm.setMarketDevUnlocked) return;
    const now = lm.setMarketDevUnlocked(!_devOn());
    if (typeof notify === 'function') notify('🔧 Тест-режим рынка: ' + (now ? 'ВКЛ' : 'выкл'), now ? 'success' : 'info');
    try { _renderRankPill(); } catch (_) {}
    // перерисовать активную поверхность рынка
    if (document.getElementById('cmp-market-modal') && document.getElementById('cmp-market-modal').style.display !== 'none') { try { showMarketModal(); } catch (_) {} }
    try { renderMarketTab(); } catch (_) {}
    // если открыт диалог сделки — обновить его
    const am = document.getElementById('cmp-acquire-modal');
    if (am && am.style.display !== 'none' && _lastAcquireId) { try { openAcquire(_lastAcquireId); } catch (_) {} }
  }

  let _lastAcquireId = null;
  function openAcquire(id) {
    // Ф.7: диалог общий для долей (узел shares) и поглощений (узел mna) —
    // блокируем, только если заперты ОБА; действия внутри гейтятся по своим узлам
    if (typeof isModuleUnlocked === 'function' && !isModuleUnlocked('mna') && !isModuleUnlocked('shares')) {
      if (typeof notify === 'function') notify('🔒 Инвест-слой заперт — открой «Доли/акции» или «Поглощения M&A» в Дереве открытий', 'error');
      return;
    }
    const lm   = _LM();
    const comp = (G.market && G.market.competitors || []).find(c => c.id === id);
    if (!comp || !lm) return;
    _lastAcquireId = id;
    let m = document.getElementById('cmp-acquire-modal');
    if (!m) {
      m = document.createElement('div');
      m.id = 'cmp-acquire-modal';
      m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.82);z-index:340;display:flex;align-items:center;justify-content:center';
      m.onclick = e => { if (e.target === m) m.style.display = 'none'; };
      document.body.appendChild(m);
    }
    m.innerHTML = _renderAcquireDialog(comp);
    m.style.display = 'flex';
  }

  function _renderAcquireDialog(comp) {
    const lm    = _LM();
    const cost  = lm.acquisitionCost ? lm.acquisitionCost(comp) : 0;
    const y     = lm.acquisitionYield ? lm.acquisitionYield(comp) : { staffN: 0, portfolio: 0, leads: 0, cash: 0 };
    const perk  = lm.hasMAdept && lm.hasMAdept();
    const money = (G && G.money) || 0;
    const DAYS_ACQUIRE = 6;
    const days  = (G && G.actions) || 0;
    const affordDays = days >= DAYS_ACQUIRE;
    const afford = money >= cost && affordDays;
    const stage  = _mktStage();
    const arch   = ARCHETYPES[comp.archetype];
    const pf     = (comp.portfolio != null) ? comp.portfolio : Math.max(0, Math.round((comp.deliveries || 0) / 6));

    const modeBtn = (mode, icon, title, sub, on) => {
      const dis = !on;
      return '<button ' + (dis ? 'disabled' : 'onclick="Competitors.doAcquire(\'' + comp.id + '\',\'' + mode + '\')"') +
        ' style="display:block;width:100%;text-align:left;margin-top:8px;padding:10px 12px;border-radius:9px;border:1px solid ' +
        (dis ? 'var(--border)' : 'rgba(167,139,250,.5)') + ';background:' + (dis ? 'rgba(255,255,255,.02)' : 'rgba(167,139,250,.10)') +
        ';color:' + (dis ? 'var(--muted)' : 'var(--text)') + ';cursor:' + (dis ? 'not-allowed' : 'pointer') + '">' +
        '<div style="font-size:12px;font-weight:800">' + icon + ' ' + title + '</div>' +
        '<div style="font-size:10px;color:var(--sub);margin-top:2px">' + sub + '</div>' +
      '</button>';
    };

    const stat = (label, val) => '<div style="flex:1;text-align:center"><div style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em">' + label + '</div><div style="font-size:13px;font-weight:700;color:var(--text);margin-top:1px">' + val + '</div></div>';
    const stf  = (comp.staff != null) ? comp.staff : '—';

    // ── Слой A: доли ──
    const owned   = lm.equityOwned   ? lm.equityOwned(comp.id)    : 0;
    const price1  = lm.equityPrice1pct ? lm.equityPrice1pct(comp) : 0;
    const divNow  = lm.equityDividend  ? lm.equityDividend(comp)  : 0;
    const cap     = lm.equityCap ? lm.equityCap() : 100;
    const control = owned >= 50;

    const buyBtn = (p) => {
      const c = p * price1;
      const can = money >= c && owned + p <= cap;
      return '<button ' + (can ? 'onclick="Competitors.doBuyEquity(\'' + comp.id + '\',' + p + ')"' : 'disabled') +
        ' style="flex:1;padding:7px 4px;border-radius:7px;border:1px solid ' + (can ? 'rgba(34,211,238,.5)' : 'var(--border)') +
        ';background:' + (can ? 'rgba(34,211,238,.10)' : 'rgba(255,255,255,.02)') + ';color:' + (can ? 'var(--text)' : 'var(--muted)') +
        ';cursor:' + (can ? 'pointer' : 'not-allowed') + ';font-size:10px;font-weight:700">+' + p + '%<div style="font-size:9px;color:var(--sub);font-weight:500">' + _formatMoneyShort(c) + '</div></button>';
    };
    const equityBlock =
      '<div style="margin-top:14px;padding:12px;background:rgba(34,211,238,.05);border:1px solid rgba(34,211,238,.18);border-radius:10px">' +
        '<div style="display:flex;justify-content:space-between;align-items:baseline">' +
          '<span style="font-size:11px;font-weight:800;color:var(--text)">📈 Доли' + (control ? ' <span style="color:#fde047">· контрольный пакет</span>' : '') + '</span>' +
          '<span style="font-size:10px;color:var(--muted)">Цена 1%: <b style="color:var(--text)">' + _formatMoneyShort(price1) + '</b></span>' +
        '</div>' +
        '<div style="height:8px;background:rgba(255,255,255,.06);border-radius:5px;margin:8px 0;overflow:hidden"><div style="height:100%;width:' + owned + '%;background:' + (control ? '#fde047' : '#22d3ee') + '"></div></div>' +
        '<div style="display:flex;justify-content:space-between;font-size:10px;color:var(--sub)"><span>Ваша доля: <b style="color:var(--text)">' + owned + '%</b></span>' +
          (owned > 0 ? '<span>Дивиденд: <b style="color:#86efac">+' + _formatMoneyShort(divNow) + '/мес</b></span>' : '<span style="font-style:italic">доли дают дивиденды и скидку при выкупе</span>') + '</div>' +
        '<div style="display:flex;gap:6px;margin-top:10px">' + buyBtn(5) + buyBtn(10) + buyBtn(25) + '</div>' +
        (cap < 100 ? '<div style="font-size:9px;color:var(--muted);margin-top:6px;text-align:center;font-style:italic">До стадии «Сеть» — миноритарный пакет, до ' + cap + '%</div>' : '') +
        (owned > 0 ? '<button onclick="Competitors.doSellEquity(\'' + comp.id + '\',' + owned + ')" style="width:100%;margin-top:6px;padding:6px;border-radius:7px;border:1px solid var(--border);background:rgba(255,255,255,.04);color:var(--sub);cursor:pointer;font-size:10px;font-weight:700">Продать всё (' + owned + '%)</button>' : '') +
      '</div>';

    return '<div style="background:var(--panel);border:1px solid var(--border);border-radius:14px;padding:22px;max-width:440px;width:94vw;max-height:88vh;overflow-y:auto">' +
      '<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">' +
        '<span style="font-size:26px">' + (comp.icon || '🏢') + '</span>' +
        '<div><div style="font-size:16px;font-weight:800;color:var(--text);line-height:1.1">' + comp.name + '</div>' +
        '<div style="font-size:10px;color:var(--sub)">' + _archName(comp.archetype) + (comp.tier ? ' · тир ' + comp.tier : '') + '</div></div>' +
      '</div>' +
      '<div style="display:flex;gap:6px;margin:14px 0;padding:10px;background:rgba(255,255,255,.03);border-radius:9px">' +
        stat('Выручка', _formatMoneyShort(comp.revenue)) + stat('Реп.', '⭐ ' + Math.floor(comp.reputation || 0)) + stat('Портф.', '📚 ' + pf) + stat('Штат', '👥 ' + stf) +
      '</div>' +
      equityBlock +
      '<div style="font-size:10px;color:var(--muted);margin-top:16px;font-weight:700;text-transform:uppercase;letter-spacing:.06em">Поглощение' + (stage < 3 ? ' · с «Сети»' : (owned > 0 ? ' · доплата за ' + (100 - owned) + '%' : '')) + '</div>' +
      (stage < 3
        ? '<div style="font-size:11px;color:var(--muted);margin-top:8px;padding:10px;background:rgba(255,255,255,.03);border-radius:8px;text-align:center;font-style:italic">Полный выкуп и присвоение активов откроются на стадии «Сеть». Сейчас — только доли.</div>'
        : '<div style="display:flex;align-items:baseline;justify-content:space-between;padding:8px 0;border-bottom:1px dashed var(--border)">' +
            '<span style="font-size:11px;color:var(--muted)">Цена выкупа контроля' + (perk ? ' <span style="color:#86efac">(−22%)</span>' : '') + ' · <b style="color:var(--text)">−' + DAYS_ACQUIRE + ' дн.</b></span>' +
            '<span style="font-size:16px;font-weight:800;color:' + (afford ? 'var(--text)' : '#fca5a5') + '">' + _formatMoneyShort(cost) + '</span>' +
          '</div>' +
          (money < cost ? '<div style="font-size:10px;color:#fca5a5;margin-top:6px;text-align:center">Недостаточно средств (есть ' + _formatMoneyShort(money) + ')</div>' : '') +
          (money >= cost && !affordDays ? '<div style="font-size:10px;color:#fca5a5;margin-top:6px;text-align:center">Нужно ≥' + DAYS_ACQUIRE + ' рабочих дней (осталось ' + days + ')</div>' : '') +
          modeBtn('__mna__', '🤝', 'Начать переговоры о поглощении', 'Подход → дью-дилидженс → условия сделки. Итоговая цена и режим (интеграция/саббренд) — в конце процесса.', afford) +
          '<div style="font-size:9px;color:var(--muted);margin-top:8px;text-align:center;font-style:italic">Распродать поглощённую компанию можно позже — из раздела «Дочерние» (лок 12 мес).</div>') +
      '<button onclick="document.getElementById(\'cmp-acquire-modal\').style.display=\'none\'" style="margin-top:14px;width:100%;background:rgba(255,255,255,.06);border:1px solid var(--border);color:var(--text);padding:8px;border-radius:8px;cursor:pointer;font-size:11px;font-weight:700">Закрыть</button>' +
    '</div>';
  }

  function doBuyEquity(id, pct) {
    const lm = _LM(); if (!lm || !lm.buyEquity) return;
    const res = lm.buyEquity(id, pct);
    if (res && res.ok) { openAcquire(id); try { _renderRankPill(); } catch (_) {} }
    else if (res && res.reason === 'insufficient_funds') { if (typeof notify === 'function') notify('Недостаточно средств', 'error'); }
  }

  function doSellEquity(id, pct) {
    const lm = _LM(); if (!lm || !lm.sellEquity) return;
    const res = lm.sellEquity(id, pct);
    if (res && res.ok) { openAcquire(id); try { _renderRankPill(); } catch (_) {} }
  }

  function doAcquire(id, mode, opts) {
    if (mode === '__mna__') { startMnA(id); return; }   // запуск ветвистого процесса
    const lm = _LM();
    if (!lm || !lm.acquireCompetitor) return;
    const res = lm.acquireCompetitor(id, mode, opts);
    if (res && res.ok) {
      const am = document.getElementById('cmp-acquire-modal'); if (am) am.style.display = 'none';
      try { _renderRankPill(); } catch (_) {}
      if (document.getElementById('cmp-market-modal')) { try { showMarketModal(); } catch (_) {} }
    } else if (res && res.reason === 'insufficient_funds') {
      if (typeof notify === 'function') notify('Недостаточно средств для поглощения', 'error');
    } else if (res && res.reason === 'no_days') {
      if (typeof notify === 'function') notify('Нужно ≥' + (res.days || 6) + ' рабочих дней', 'error');
    } else if (res && res.reason === 'stage_required') {
      if (typeof notify === 'function') notify('Поглощения откроются на стадии «Сеть»', 'error');
    }
  }

  // ── Ф.8 ребаланс: ВЕТВИСТЫЙ ПРОЦЕСС ПОГЛОЩЕНИЯ ───────────────────────
  // Подход → дью-дилидженс → находка (вилка) → условия сделки. Деньги/дни
  // тратятся ТОЛЬКО на финале (выход на любом шаге — без затрат). Итог
  // переговоров собирается в opts {costMult,yieldMult,extraDays} для acquireCompetitor.

  let _mna = null;   // { id, step, costMult, yieldMult, extraDays, approachLabel, finding }

  // Подходы к сделке: база цены/тон. «Через долю» дешевле и даёт бесплатную DD.
  function _mnaApproaches(owned) {
    const list = [
      { key: 'partner', icon: '🤝', title: 'Партнёрский подход', desc: 'Открытый разговор, без давления. Сделка пройдёт гладко, но за комфорт доплатишь.', eff: 'цена ×1.05', costMult: 1.05 },
      { key: 'hard',    icon: '⚔️', title: 'Жёсткий торг',        desc: 'Давишь по цене с позиции силы. Дешевле, но продавец прячет больше скелетов.', eff: 'цена ×0.90', costMult: 0.90 },
    ];
    if (owned >= 10)
      list.push({ key: 'insider', icon: '🔍', title: 'Через свою долю', desc: 'Ты уже внутри как акционер — знаешь компанию. Дью-дилидженс бесплатна.', eff: 'цена ×0.92 · DD без дней', costMult: 0.92, freeDD: true });
    return list;
  }

  // Находки дью-дилидженс — каждая с вилкой из двух реакций.
  const _MNA_FINDINGS = [
    { icon: '💎', title: 'Недооценённый бренд',
      text: 'Реальная репутация компании выше, чем в отчётности — её просто не умели «продавать».',
      opts: [
        { t: 'Не торговаться, забрать как есть', e: 'портфель ×1.2', yieldMult: 1.2, costMult: 1.0 },
        { t: 'Сбить цену, пока продавец не понял', e: 'цена ×0.93', yieldMult: 1.0, costMult: 0.93 },
      ] },
    { icon: '🕳', title: 'Скрытые долги',
      text: 'В балансе всплыли невидимые обязательства перед подрядчиками.',
      opts: [
        { t: 'Заложить долги в цену сделки', e: 'цена ×1.15', yieldMult: 1.0, costMult: 1.15 },
        { t: 'Потребовать дисконт, часть активов уйдёт кредиторам', e: 'цена ×0.95 · портфель ×0.85', yieldMult: 0.85, costMult: 0.95 },
      ] },
    { icon: '🚪', title: 'Команда на чемоданах',
      text: 'Ключевые спецы готовы уйти сразу после смены собственника.',
      opts: [
        { t: 'Golden handcuffs — удержать бонусами', e: 'цена ×1.10', yieldMult: 1.0, costMult: 1.10 },
        { t: 'Отпустить — взять бренд и кейсы', e: 'портфель ×0.6 · цена ×0.9', yieldMult: 0.6, costMult: 0.9 },
      ] },
    { icon: '📈', title: 'Тёплая клиентская база',
      text: 'У компании сильные аккаунт-менеджеры с лояльными клиентами.',
      opts: [
        { t: 'Сохранить менеджеров и контракты', e: 'портфель ×1.25 · цена ×1.05', yieldMult: 1.25, costMult: 1.05 },
        { t: 'Взять только бренд', e: 'портфель ×0.9 · цена ×0.95', yieldMult: 0.9, costMult: 0.95 },
      ] },
  ];

  function _mnaModal() {
    let m = document.getElementById('cmp-mna-modal');
    if (!m) {
      m = document.createElement('div');
      m.id = 'cmp-mna-modal';
      m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.84);z-index:360;display:flex;align-items:center;justify-content:center';
      m.onclick = e => { if (e.target === m) _mnaClose(); };
      document.body.appendChild(m);
    }
    m.style.display = 'flex';
    return m;
  }
  function _mnaClose() { const m = document.getElementById('cmp-mna-modal'); if (m) m.style.display = 'none'; _mna = null; }

  function startMnA(id) {
    // Ф.7: ветвистый процесс поглощения — гейт узла mna (вне режима не блокирует)
    if (typeof isModuleUnlocked === 'function' && !isModuleUnlocked('mna')) {
      if (typeof notify === 'function') notify('🔒 Поглощения заперты — открой «Поглощения M&A» в Дереве открытий', 'error');
      return;
    }
    const comp = (G.market && G.market.competitors || []).find(c => c.id === id);
    if (!comp) return;
    _mna = { id, step: 'approach', costMult: 1, yieldMult: 1, extraDays: 0, approachLabel: '', finding: null };
    _renderMnA();
  }

  // Универсальная обёртка-шаг: art-шапка + тело + кнопки выбора (стиль как в lifecycle).
  function _mnaShell({ comp, phase, title, atmosphere, body, choices }) {
    const art = '<div style="margin:-22px -22px 16px;height:104px;border-radius:14px 14px 0 0;background:linear-gradient(135deg,#3b2f63,#1e293b);position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;overflow:hidden">' +
        '<div style="position:absolute;inset:0;background:radial-gradient(circle at 50% 60%,rgba(255,255,255,.05),transparent 70%)"></div>' +
        '<span style="font-size:34px;position:relative">' + (comp.icon || '🏢') + '</span>' +
        (atmosphere ? '<span style="font-size:11px;color:rgba(255,255,255,.55);font-style:italic;position:relative">' + atmosphere + '</span>' : '') +
      '</div>';
    const btns = choices.map((ch, i) => {
      const dis = !!ch.disabled;
      const col = ch._danger ? 'rgba(239,68,68,.45)' : (ch.highlight ? 'rgba(45,212,191,.5)' : 'rgba(167,139,250,.45)');
      const bg  = ch._danger ? 'rgba(239,68,68,.05)' : (ch.highlight ? 'rgba(45,212,191,.07)' : 'rgba(167,139,250,.08)');
      return '<button ' + (dis ? 'disabled' : 'onclick="Competitors._mnaPick(' + i + ')"') +
        ' style="display:block;width:100%;text-align:left;margin-top:8px;padding:11px 13px;border-radius:10px;border:1px solid ' +
        (dis ? 'var(--border)' : col) + ';background:' + (dis ? 'rgba(255,255,255,.02)' : bg) + ';color:' + (dis ? 'var(--muted)' : 'var(--text)') +
        ';cursor:' + (dis ? 'not-allowed' : 'pointer') + '">' +
        '<div style="font-size:12px;font-weight:800">' + ch.icon + ' ' + ch.t + '</div>' +
        (ch.d ? '<div style="font-size:10px;color:var(--sub);margin-top:3px;line-height:1.4">' + ch.d + '</div>' : '') +
        (ch.e ? '<div style="font-size:10px;color:var(--muted);font-style:italic;margin-top:4px">' + ch.e + '</div>' : '') +
      '</button>';
    }).join('');
    _mnaModal().innerHTML =
      '<div style="background:var(--panel);border:1px solid var(--border);border-radius:16px;padding:22px;max-width:440px;width:94vw;max-height:90vh;overflow-y:auto">' +
        art +
        '<div style="font-size:10px;color:var(--muted);font-weight:700;letter-spacing:.1em;text-transform:uppercase">' + phase + ' · ' + comp.name + '</div>' +
        '<div style="font-size:16px;font-weight:800;color:var(--text);margin:3px 0 10px;line-height:1.15">' + title + '</div>' +
        (body || '') + btns +
        '<button onclick="Competitors._mnaExit()" style="margin-top:14px;width:100%;background:rgba(255,255,255,.05);border:1px solid var(--border);color:var(--sub);padding:8px;border-radius:9px;cursor:pointer;font-size:11px;font-weight:700">Выйти из переговоров (без затрат)</button>' +
      '</div>';
  }

  function _renderMnA() {
    if (!_mna) return;
    const lm = _LM();
    const comp = (G.market && G.market.competitors || []).find(c => c.id === _mna.id);
    if (!comp) { _mnaClose(); return; }
    const owned = (lm && lm.equityOwned) ? lm.equityOwned(comp.id) : 0;

    if (_mna.step === 'approach') {
      const choices = _mnaApproaches(owned).map(a => ({ icon: a.icon, t: a.title, d: a.desc, e: a.eff, _key: a }));
      _mnaShell({ comp, phase: 'Подход', title: 'Как заходим в сделку?',
        atmosphere: 'первый контакт', choices });
      return;
    }
    if (_mna.step === 'dd') {
      const free = _mna._freeDD;
      const choices = [
        { icon: '📋', t: 'Поверхностная проверка', d: 'Беглый просмотр отчётности. Никаких сюрпризов, но и скрытых выгод не найти.', e: 'без доп. дней', highlight: false, _dd: 'shallow' },
        { icon: '🔬', t: 'Глубокая дью-дилидженс', d: 'Поднять контракты, поговорить с командой, найти то, что прячут.', e: free ? 'бесплатно (ты акционер)' : '+2 рабочих дня', _dd: 'deep' },
      ];
      _mnaShell({ comp, phase: 'Дью-дилидженс', title: 'Насколько глубоко копаем?',
        atmosphere: 'проверка активов', choices });
      return;
    }
    if (_mna.step === 'finding') {
      const f = _mna.finding;
      const choices = f.opts.map(o => ({ icon: '▸', t: o.t, e: o.e, _opt: o }));
      _mnaShell({ comp, phase: 'Находка', title: f.icon + ' ' + f.title,
        atmosphere: 'на столе переговоров',
        body: '<div style="font-size:12px;color:var(--sub);line-height:1.5;margin-bottom:6px;padding:10px;background:rgba(255,255,255,.03);border-radius:9px">' + f.text + '</div>',
        choices });
      return;
    }
    if (_mna.step === 'final') {
      const baseCost = (lm && lm.acquisitionCost) ? lm.acquisitionCost(comp) : 0;
      const cost  = Math.max(100000, Math.round(baseCost * _mna.costMult / 1000) * 1000);
      const days  = 6 + _mna.extraDays;
      const stage = _mktStage();
      const money = (G && G.money) || 0;
      const have  = (G && G.actions) || 0;
      const afford = money >= cost && have >= days;
      const y = (lm && lm.acquisitionYield) ? lm.acquisitionYield(comp) : { staffN: 0, portfolio: 0, leads: 0 };
      const pf = Math.max(0, Math.round((y.portfolio || 0) * _mna.yieldMult));
      const ld = Math.max(0, Math.round((y.leads || 0) * _mna.yieldMult));
      const st = Math.max(0, Math.round((y.staffN || 0) * _mna.yieldMult));
      const terms = '<div style="padding:12px;background:rgba(167,139,250,.06);border:1px solid rgba(167,139,250,.2);border-radius:10px;margin-bottom:4px">' +
          '<div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:4px"><span style="color:var(--sub)">Подход</span><b style="color:var(--text)">' + _mna.approachLabel + '</b></div>' +
          (_mna.finding ? '<div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:4px"><span style="color:var(--sub)">Находка</span><b style="color:var(--text)">' + _mna.finding.title + '</b></div>' : '') +
          '<div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:4px"><span style="color:var(--sub)">Итоговая цена</span><b style="color:' + (money >= cost ? 'var(--text)' : '#fca5a5') + '">' + _formatMoneyShort(cost) + '</b></div>' +
          '<div style="display:flex;justify-content:space-between;font-size:11px"><span style="color:var(--sub)">Срок</span><b style="color:' + (have >= days ? 'var(--text)' : '#fca5a5') + '">−' + days + ' дн.</b></div>' +
        '</div>' +
        (afford ? '' : '<div style="font-size:10px;color:#fca5a5;margin:6px 0;text-align:center">' + (money < cost ? 'Недостаточно средств' : 'Недостаточно рабочих дней (осталось ' + have + ')') + '</div>');
      const choices = [
        { icon: '🧩', t: 'Интегрировать', d: 'Влить ~' + st + ' спец. (со сниж. лояльностью), +' + pf + ' портфолио, +' + ld + ' лид(ов).', disabled: !afford, _mode: 'integrate' },
        { icon: '🏷', t: 'Сделать саббрендом', d: stage >= 4 ? ('+' + pf + ' портфолио, +1 к скаутингу. Бренд живёт отдельно.') : 'Откроется на стадии «Холдинг»', disabled: !afford || stage < 4, _mode: 'subbrand' },
      ];
      _mnaShell({ comp, phase: 'Условия сделки', title: 'Закрываем сделку?',
        atmosphere: 'подпись', body: terms, choices });
      return;
    }
  }

  // Обработка выбора на текущем шаге.
  function _mnaPick(i) {
    if (!_mna) return;
    const lm = _LM();
    const comp = (G.market && G.market.competitors || []).find(c => c.id === _mna.id);
    if (!comp) { _mnaClose(); return; }
    const owned = (lm && lm.equityOwned) ? lm.equityOwned(comp.id) : 0;

    if (_mna.step === 'approach') {
      const a = _mnaApproaches(owned)[i];
      _mna.costMult     *= a.costMult;
      _mna.approachLabel = a.title;
      _mna._freeDD       = !!a.freeDD;
      _mna.step          = 'dd';
      _renderMnA();
      return;
    }
    if (_mna.step === 'dd') {
      const deep = i === 1;
      if (deep) {
        if (!_mna._freeDD) _mna.extraDays += 2;   // глубокая DD = +2 дня к сроку сделки
        _mna.finding = _MNA_FINDINGS[Math.floor(Math.random() * _MNA_FINDINGS.length)];
        _mna.step = 'finding';
      } else {
        _mna.step = 'final';
      }
      _renderMnA();
      return;
    }
    if (_mna.step === 'finding') {
      const o = _mna.finding.opts[i];
      _mna.costMult  *= o.costMult;
      _mna.yieldMult *= o.yieldMult;
      _mna.step = 'final';
      _renderMnA();
      return;
    }
    if (_mna.step === 'final') {
      const mode = (i === 0) ? 'integrate' : 'subbrand';
      const opts = { costMult: _mna.costMult, yieldMult: _mna.yieldMult, extraDays: _mna.extraDays };
      const id = _mna.id;
      _mnaClose();
      const am = document.getElementById('cmp-acquire-modal'); if (am) am.style.display = 'none';
      doAcquire(id, mode, opts);
      return;
    }
  }

  function _mnaExit() {
    if (typeof notify === 'function') notify('Переговоры прерваны — без затрат', 'info');
    _mnaClose();
  }

  // ── Бегущая строка (вариант B) ───────────────────────────────────────

  function _renderTicker() {
    const el = document.getElementById('mkt-ticker');
    if (!el) return;
    if (typeof G === 'undefined' || !G || !G.market || !Array.isArray(G.market.competitors) || !G.market.competitors.length) {
      el.style.display = 'none'; return;
    }
    el.style.display = 'flex';
    const comps = G.market.competitors;
    const quotes = comps.slice().sort((a, b) => (b.revenue || 0) - (a.revenue || 0)).map(c => {
      let pct = null;
      const h = c.history;
      if (Array.isArray(h) && h.length >= 2) {
        const a = h[h.length - 1].monthlyRevenue || 0, b = h[h.length - 2].monthlyRevenue || 0;
        if (b > 0) pct = (a - b) / b * 100;
      }
      const arrow = pct == null ? '·' : (pct >= 0 ? '▲' : '▼');
      const cls = pct == null ? '' : (pct >= 0 ? 'mkt-up' : 'mkt-dn');
      const own = (G.market.holdings && G.market.holdings[c.id]) || 0;
      const pctStr = pct == null ? '' : (' <span class="' + cls + '">' + (pct >= 0 ? '+' : '') + pct.toFixed(1) + '%</span>');
      return '<span><b class="' + cls + '">' + arrow + ' ' + c.name + '</b> ' + _formatMoneyShort(c.revenue) + pctStr + (own ? ' <span style="color:var(--teal)">📈' + own + '%</span>' : '') + '</span>';
    });
    const evts = (G.market.tickerFeed || []).map(e => '<span class="mkt-ev">' + e.msg + '</span>');
    const items = []; let qi = 0, ei = 0;
    while (qi < quotes.length || ei < evts.length) {
      for (let k = 0; k < 3 && qi < quotes.length; k++) items.push(quotes[qi++]);
      if (ei < evts.length) items.push(evts[ei++]);
    }
    const seq = items.join('');
    el.innerHTML = '<div class="mkt-tk-tag">📈 РЫНОК</div><div class="mkt-tk-view"><div class="mkt-tk-track">' + seq + seq + '</div></div>';
  }

  // ── Виджет-крючок на главном экране (вариант B) ──────────────────────

  function _portfolioStats() {
    const lm = _LM(); let pv = 0, div = 0, n = 0;
    const h = (G.market && G.market.holdings) || {};
    Object.keys(h).forEach(id => {
      const c = (G.market.competitors || []).find(x => x.id === id);
      if (!c) return;
      n++;
      pv  += (h[id] / 100) * (lm && lm.competitorValuation ? lm.competitorValuation(c) : 0);
      div += (lm && lm.equityDividend ? lm.equityDividend(c) : 0);
    });
    return { pv: Math.round(pv), div: Math.round(div), n };
  }

  function _renderMarketWidget() {
    const el = document.getElementById('g-market-widget');
    if (!el) return;
    if (typeof G === 'undefined' || !G || !G.market || !Array.isArray(G.market.competitors) || !G.market.competitors.length) {
      el.innerHTML = ''; return;
    }
    const rank = getPlayerRank(), size = getMarketSize();
    const ps = _portfolioStats();
    const acq = (G.market.acquisitions) || 0;
    const top = getRanking().filter(r => !r.isPlayer).slice(0, 3).map(r => {
      const arch = ARCHETYPES[r.archetype];
      return '<div style="display:flex;align-items:center;gap:7px;padding:5px 0;font-size:11px">' +
        '<span>' + (r.icon || '🏢') + '</span>' +
        '<span style="flex:1;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + r.name + '</span>' +
        '<span style="color:var(--sub)">' + _formatMoneyShort(r.revenue) + '</span></div>';
    }).join('');
    el.innerHTML =
      '<div class="panel" style="cursor:pointer;border-color:#2b3a52" onclick="switchTab(\'market\')" title="Открыть рынок">' +
        '<div class="panel-title" style="color:#8fb4ff">📈 Рынок <span style="margin-left:auto;font-size:10px;color:var(--muted);font-weight:600">19 агентств ▸</span></div>' +
        '<div style="display:flex;gap:8px;margin-bottom:8px">' +
          '<div style="flex:1;background:var(--bg3);border-radius:8px;padding:8px 10px"><div style="font-size:17px;font-weight:800">#' + (rank || '—') + '<span style="font-size:11px;color:var(--sub)"> / ' + (size || '—') + '</span></div><div style="font-size:9px;color:var(--sub);text-transform:uppercase;letter-spacing:.05em">место</div></div>' +
          '<div style="flex:1;background:var(--bg3);border-radius:8px;padding:8px 10px"><div style="font-size:15px;font-weight:800;color:var(--teal)">' + _formatMoneyShort(ps.pv) + '</div><div style="font-size:9px;color:var(--sub);text-transform:uppercase;letter-spacing:.05em">доли' + (ps.div > 0 ? ' · +' + _formatMoneyShort(ps.div) + '/мес' : '') + '</div></div>' +
        '</div>' +
        top +
      '</div>';
  }

  // ── Вкладка-дашборд «Рынок» (вариант C) ──────────────────────────────

  function renderMarketTab() {
    const el = document.getElementById('g-market-content');
    if (!el) return;
    if (typeof G === 'undefined' || !G || !G.market || !Array.isArray(G.market.competitors) || !G.market.competitors.length) {
      el.innerHTML = '<div style="padding:24px;text-align:center;color:var(--sub);font-style:italic">Рынок ещё не инициализирован.</div>'; return;
    }
    const rank = getPlayerRank(), size = getMarketSize();
    const ps = _portfolioStats();
    const acq = (G.market.acquisitions) || 0;
    const kpi = (v, l, color) => '<div style="flex:1;min-width:120px;background:var(--bg3);border-radius:10px;padding:12px 14px"><div style="font-size:20px;font-weight:800' + (color ? ';color:' + color : '') + '">' + v + '</div><div style="font-size:10px;color:var(--sub);text-transform:uppercase;letter-spacing:.06em;margin-top:2px">' + l + '</div></div>';
    const kpis = '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">' +
      kpi('#' + (rank || '—') + ' <span style="font-size:12px;color:var(--sub)">/ ' + size + '</span>', 'ваше место') +
      kpi(_formatMoneyShort(ps.pv), 'портфель долей', 'var(--teal)') +
      kpi('+' + _formatMoneyShort(ps.div), 'дивиденды/мес', 'var(--green)') +
      kpi(acq + ' / 3', 'поглощений') +
    '</div>';

    const ranked = getRanking();
    const cards = ranked.map(r => {
      if (r.isPlayer) {
        return '<div style="border:1px solid #fbbf24;border-radius:11px;padding:11px;background:rgba(251,191,36,.06)">' +
          '<div style="display:flex;align-items:center;gap:8px"><span style="font-size:18px">👑</span><div style="flex:1"><b style="font-size:13px">Вы</b><small style="display:block;font-size:10px;color:var(--sub)">ваше агентство</small></div><span style="font-size:12px;font-weight:800;color:#fbbf24">#' + r.rank + '</span></div>' +
          '<div style="display:flex;justify-content:space-between;font-size:11px;color:var(--sub);margin-top:8px"><span>Выручка</span><b style="color:var(--text)">' + _formatMoneyShort(r.revenue) + '</b></div>' +
        '</div>';
      }
      const arch = ARCHETYPES[r.archetype];
      const comp = G.market.competitors.find(x => x.id === r.id) || {};
      let pct = null; const h = comp.history;
      if (Array.isArray(h) && h.length >= 2) { const a = h[h.length-1].monthlyRevenue||0, b = h[h.length-2].monthlyRevenue||0; if (b>0) pct=(a-b)/b*100; }
      const arrow = pct == null ? '<span style="color:var(--sub)">·</span>' : (pct>=0?'<span class="mkt-up">▲</span>':'<span class="mkt-dn">▼</span>');
      const own = (G.market.holdings && G.market.holdings[r.id]) || 0;
      let medal = '#' + r.rank;
      if (r.rank === 1) medal = '🥇'; else if (r.rank === 2) medal = '🥈'; else if (r.rank === 3) medal = '🥉';
      return '<div onclick="Competitors.openAcquire(\'' + r.id + '\')" style="border:1px solid ' + (own?'rgba(45,212,191,.4)':'var(--border)') + ';border-radius:11px;padding:11px;background:rgba(255,255,255,.015);cursor:pointer;transition:border-color .12s,background .12s" onmouseover="this.style.borderColor=\'#3a4a66\';this.style.background=\'rgba(168,85,247,.06)\'" onmouseout="this.style.borderColor=\'' + (own?'rgba(45,212,191,.4)':'var(--border)') + '\';this.style.background=\'rgba(255,255,255,.015)\'">' +
        '<div style="display:flex;align-items:center;gap:8px"><span style="width:28px;height:28px;border-radius:8px;background:var(--bg3);display:flex;align-items:center;justify-content:center;font-size:15px">' + (r.icon||'🏢') + '</span>' +
          '<div style="flex:1;min-width:0"><b style="font-size:13px">' + r.name + '</b><small style="display:block;font-size:10px;color:var(--sub)">' + _archName(r.archetype) + (comp.tier?' · тир '+comp.tier:'') + (own?' · <span style="color:var(--teal)">📈'+own+'%</span>':'') + '</small></div>' +
          '<span style="font-size:12px;font-weight:800;color:var(--sub)">' + medal + '</span></div>' +
        '<div style="display:flex;justify-content:space-between;font-size:11px;color:var(--sub);margin-top:8px"><span>Выручка</span><b style="color:var(--text)">' + _formatMoneyShort(r.revenue) + ' ' + arrow + '</b></div>' +
        '<div style="display:flex;justify-content:space-between;font-size:11px;color:var(--sub);margin-top:2px"><span>Репутация</span><b style="color:var(--text)">⭐ ' + Math.floor(r.reputation||0) + '</b></div>' +
      '</div>';
    }).join('');

    const canAcq = _canAcquire();
    const hint = '<div style="font-size:11px;color:' + (canAcq?'#a78bfa':'var(--muted)') + ';margin:4px 0 12px">' + (canAcq ? '🤝 Кликни карточку — доли и поглощение' : '🤝 Кликни карточку — доли уже доступны, поглощение с «Сети»') + '</div>';

    el.innerHTML = _devToggleHtml() + kpis + hint +
      '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:10px">' + cards + '</div>' +
      _renderSubsidiariesBlock();
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
        _renderTicker();
        _renderMarketWidget();
        if (typeof EventBus !== 'undefined' && EventBus.emit) EventBus.emit('market_ticked', { month: G.month });
      } catch (e) { try { console.warn('[competitors] advanceMonth wrap', e); } catch (_) {} }
      return r;
    };
    window.advanceMonth.__competitorsWrapped = true;
  }

  if (typeof EventBus !== 'undefined' && EventBus.on) {
    EventBus.on('render', () => {
      try {
        // партия запущена (G._spec теряется при авто-резюме — проверяем надёжнее)
        if (typeof G !== 'undefined' && G && (G._spec || G.month != null || G.market)) {
          _initMarket();
          _renderRankPill();
          _renderTicker();
          _renderMarketWidget();
          const mt = document.getElementById('tab-panel-market');
          if (mt && mt.classList.contains('active')) renderMarketTab();
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
      openAcquire,
      doAcquire,
      doLiquidate,
      toggleMarketDev,
      startMnA,
      _mnaPick,
      _mnaExit,
      doBuyEquity,
      doSellEquity,
      renderMarketTab,
      renderTicker:   _renderTicker,
      renderWidget:   _renderMarketWidget,
      canAcquire:     _canAcquire,
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
