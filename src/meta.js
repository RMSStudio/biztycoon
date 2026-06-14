// ══════════════════════════════════════════════════════
//  Мета-прогресс между партиями — roguelite-механика
//
//  Активируется ТОЛЬКО когда включён DLC «Rogue-lite».
//  Без DLC модуль молча не регистрируется.
//
//  Идея: каждое завершение рана (победа/банкротство/выход) даёт
//  очки-«осколки» (shards). Накопленные shards разблокируют
//  новые стартовые руны (см. src/runes.js) и новые бонусы
//  Run Map (см. src/runmap.js). Параллельно засчитываются
//  ачивки — разовые награды за уникальные достижения.
//
//  Стейт хранится в localStorage отдельным ключом
//  'bt_roguelite_meta_v1' — переживает перезагрузку, сброс
//  партии и даже сброс сейвов (это межсессионный прогресс).
//
//  Принцип: модули runes/runmap при подготовке пула рандома
//  опрашивают RogueMeta.isRuneUnlocked / isBonusUnlocked —
//  заблокированные не попадают в выбор. Координатор
//  dlc/roguelite/roguelite.js дёргает RogueMeta.awardAtEndGame
//  при end_game и показывает сводку начисления.
//
//  Бэклог: п.13 «Roguelite-механики», четвёртый шаг
//  (мета-прогресс между партиями).
// ══════════════════════════════════════════════════════

(function () {
  'use strict';

  const META_ENABLED = true;
  if (!META_ENABLED) return;
  if (!_rogueliteEnabled()) return;
  if (typeof EventBus === 'undefined') {
    console.error('[meta] EventBus не найден — модуль не активирован');
    return;
  }
  if (window.__META_LOADED) return;
  window.__META_LOADED = true;

  function _rogueliteEnabled() {
    try {
      const raw = (typeof localStorage !== 'undefined' && localStorage.getItem('bt_enabled_dlcs_v1')) || '[]';
      const arr = JSON.parse(raw);
      return Array.isArray(arr) && arr.includes('roguelite');
    } catch (e) { return false; }
  }

  const LS_KEY  = 'bt_roguelite_meta_v1';
  const VERSION = 1;

  // ── Реестры разблокировок ─────────────────────────────
  // Руны: id → требуется shards. 0 = всегда открыта.
  const RUNE_UNLOCKS = [
    { id: 'connections',   shards: 0 },
    { id: 'perfectionist', shards: 0 },
    { id: 'insider',       shards: 0 },
    { id: 'serial',        shards: 0 },
    { id: 'hardened',      shards: 150 },
    { id: 'scholar',       shards: 300 },
    { id: 'networker',     shards: 500 },
    { id: 'outsider',      shards: 750 },
  ];

  // Бонусы Run Map: id → требуется shards. 0 = всегда открыт.
  const BONUS_UNLOCKS = [
    { id: 'cash',           shards: 0 },
    { id: 'rep',            shards: 0 },
    { id: 'payout',         shards: 0 },
    { id: 'overhead',       shards: 0 },
    { id: 'cases',          shards: 0 },
    { id: 'scout',          shards: 0 },
    { id: 'rep_recovery',   shards: 0 },
    { id: 'speed',          shards: 0 },
    { id: 'prepay',         shards: 100 },
    { id: 'penalty_shield', shards: 200 },
    { id: 'fatigue',        shards: 400 },
    { id: 'portfolio',      shards: 600 },
  ];

  // ── Ачивки ────────────────────────────────────────────
  // check получает контекст { run, totalRunsAfter, winsAfter,
  //   lastN, meta } и возвращает true, если выдача засчитана.
  // Каждая выдаётся только один раз (id попадает в meta.achievements).
  const BASE_RUNE_IDS = ['connections', 'perfectionist', 'insider', 'serial'];
  const ACHIEVEMENTS = [
    { id: 'first_run',        icon: '🌱', name: 'Первый ран',        desc: 'Завершить любой ран',                            shards: 50,
      check: ctx => ctx.totalRunsAfter >= 1 },
    { id: 'first_win',        icon: '🏆', name: 'Первая победа',     desc: 'Первая победа в любой партии',                    shards: 100,
      check: ctx => ctx.run.won && ctx.winsAfter === 1 },
    { id: 'endgame_reached',  icon: '👑', name: 'До эндгейма',       desc: 'Дойти до финального этапа Run Map',               shards: 60,
      check: ctx => (ctx.run.stageReached || 0) >= 4 },
    { id: 'social_win',       icon: '🤝', name: 'Социалист',         desc: 'Победа с руной «Связи в отрасли»',                shards: 50,
      check: ctx => ctx.run.won && ctx.run.runeId === 'connections' },
    { id: 'perfectionist_win',icon: '🎯', name: 'Без огрехов',       desc: 'Победа с руной «Перфекционист»',                  shards: 50,
      check: ctx => ctx.run.won && ctx.run.runeId === 'perfectionist' },
    { id: 'insider_win',      icon: '🕵', name: 'Кто-то всегда знает',desc: 'Победа с руной «Инсайдер рынка»',                shards: 50,
      check: ctx => ctx.run.won && ctx.run.runeId === 'insider' },
    { id: 'master_5_wins',    icon: '💎', name: 'Мастер агентства',  desc: '5 побед суммарно',                                 shards: 200,
      check: ctx => ctx.winsAfter >= 5 },
    { id: 'survivor',         icon: '🛟', name: 'Выживший',          desc: 'Завершить 3 рана подряд без банкротства',         shards: 75,
      check: ctx => ctx.lastN(3).length === 3 && ctx.lastN(3).every(r => !r.bankrupt) },

    // ── v0.2 (2026-06-14): расширение мета-прогресса ──
    { id: 'millionaire',      icon: '💰', name: 'Миллионщик',        desc: 'Достичь пика 5 000 000 ₽ за партию',              shards: 150,
      check: ctx => (ctx.run.peakMoney || ctx.run.finalMoney || 0) >= 5000000 },
    { id: 'rune_collector',   icon: '🎲', name: 'Коллекционер рун',  desc: 'Сыграть со всеми 4 базовыми рунами хотя бы по разу', shards: 200,
      check: ctx => {
        const played = new Set(ctx.meta.playedRuneIds || []);
        return BASE_RUNE_IDS.every(id => played.has(id));
      } },
    { id: 'speedrun',         icon: '⚡', name: 'Скоростной ран',     desc: 'Победа до 20-го месяца включительно',             shards: 150,
      check: ctx => ctx.run.won && (ctx.run.monthsPlayed || 0) > 0 && (ctx.run.monthsPlayed || 0) <= 20 },
    { id: 'phoenix',          icon: '🔥', name: 'Феникс',            desc: 'Победа после провала до ≤ 50 000 ₽',              shards: 100,
      check: ctx => ctx.run.won && (ctx.run.lowestMoney != null) && ctx.run.lowestMoney <= 50000 },
    { id: 'no_breakdowns',    icon: '🛡', name: 'Без срывов',        desc: 'Финишировать ран с репутацией ≥ 80',              shards: 80,
      check: ctx => (ctx.run.finalReputation || 0) >= 80 },
    { id: 'win_streak_3',     icon: '🔄', name: 'Серия из трёх',     desc: '3 победы подряд (без банкротств между ними)',     shards: 250,
      check: ctx => ctx.lastN(3).length === 3 && ctx.lastN(3).every(r => r.won) },
  ];

  // ── Загрузка/сохранение ──────────────────────────────
  function _defaults() {
    return {
      version:        VERSION,
      shards:         0,
      totalRuns:      0,
      wins:           0,
      achievements:   [],
      // v0.2: playedRuneIds — все рунные id, с которыми завершались раны
      // (для ачивки rune_collector). Хранится отдельно от runeId конкретного
      // рана в history, потому что коллекционер собирает накопительно
      // и история обрезается до 50.
      playedRuneIds:  [],
      history:        [],   // [{ won, bankrupt, monthsPlayed, stageReached, runeId, finalMoney, peakMoney, lowestMoney, finalReputation, ts }]
    };
  }

  function _loadMeta() {
    try {
      if (typeof localStorage === 'undefined') return _defaults();
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return _defaults();
      const obj = JSON.parse(raw);
      if (!obj || obj.version !== VERSION) return _defaults();
      return Object.assign(_defaults(), obj);
    } catch (e) { return _defaults(); }
  }

  function _saveMeta(meta) {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(LS_KEY, JSON.stringify(meta));
    } catch (e) {}
  }

  // ── Публичные ридеры ─────────────────────────────────
  function getShards()       { return _loadMeta().shards; }
  function getMeta()         { return _loadMeta(); }
  function isRuneUnlocked(id) {
    const u = RUNE_UNLOCKS.find(r => r.id === id);
    if (!u) return true;  // незнакомая руна — не блокируем
    return _loadMeta().shards >= u.shards;
  }
  function isBonusUnlocked(id) {
    const u = BONUS_UNLOCKS.find(b => b.id === id);
    if (!u) return true;
    return _loadMeta().shards >= u.shards;
  }
  function getUnlockedRuneIds()  { return RUNE_UNLOCKS.filter(r => isRuneUnlocked(r.id)).map(r => r.id); }
  function getUnlockedBonusIds() { return BONUS_UNLOCKS.filter(b => isBonusUnlocked(b.id)).map(b => b.id); }
  function getRuneUnlocks()      { return RUNE_UNLOCKS.slice(); }
  function getBonusUnlocks()     { return BONUS_UNLOCKS.slice(); }
  function getAchievements()     { return ACHIEVEMENTS.slice(); }

  // v0.2: следующая запертая руна/бонус по возрастанию порога.
  // Возвращает { id, shards, remaining } либо null если всё открыто.
  function _nextLocked(list) {
    const shards = _loadMeta().shards;
    const locked = list.filter(x => x.shards > shards).sort((a, b) => a.shards - b.shards);
    if (!locked.length) return null;
    const x = locked[0];
    return { id: x.id, shards: x.shards, remaining: Math.max(0, x.shards - shards) };
  }
  function getNextRuneUnlock()  { return _nextLocked(RUNE_UNLOCKS); }
  function getNextBonusUnlock() { return _nextLocked(BONUS_UNLOCKS); }

  // ── Начисление по результату рана ────────────────────
  function awardAtEndGame(won, g) {
    const meta = _loadMeta();
    g = g || (typeof G !== 'undefined' ? G : {});
    const stage  = (g.runMap && g.runMap.stageIdx) || 0;
    const runeId = (g.activeRune && g.activeRune.id) || null;
    const bankrupt = !won && ((g.money || 0) <= 0);

    const baseAward  = won ? 100 : 30;
    const stageBonus = Math.min(80, stage * 20);
    let totalAward   = baseAward + stageBonus;

    meta.totalRuns++;
    if (won) meta.wins++;

    // v0.2: коллекционер рун — копим список всех использованных рун
    if (runeId) {
      meta.playedRuneIds = (meta.playedRuneIds || []).slice();
      if (!meta.playedRuneIds.includes(runeId)) meta.playedRuneIds.push(runeId);
    }

    const run = {
      won, bankrupt,
      monthsPlayed:    g.monthsPlayed || 0,
      stageReached:    stage,
      runeId,
      finalMoney:      Math.round(g.money || 0),
      // v0.2: трекинг пика/провала money + финальной репутации.
      // _runMaxMoney / _runMinMoney наполняются обёрткой advanceMonth ниже.
      peakMoney:       Math.round(g._runMaxMoney != null ? g._runMaxMoney : (g.money || 0)),
      lowestMoney:     Math.round(g._runMinMoney != null ? g._runMinMoney : (g.money || 0)),
      finalReputation: Math.round(g.reputation || 0),
      ts: Date.now(),
    };

    // Ачивки — после обновления счётчиков
    const lastN = (n) => meta.history.slice(-(n - 1)).concat([run]);
    const ctx   = { run, totalRunsAfter: meta.totalRuns, winsAfter: meta.wins, lastN, meta };
    const newAch = [];
    ACHIEVEMENTS.forEach(a => {
      if ((meta.achievements || []).includes(a.id)) return;
      try {
        if (a.check(ctx)) {
          meta.achievements = (meta.achievements || []).concat(a.id);
          totalAward += a.shards;
          newAch.push(a);
        }
      } catch (e) { console.warn('[meta] check error', a.id, e); }
    });

    // Запоминаем разблокировки ДО начисления
    const beforeRunes  = getUnlockedRuneIds();
    const beforeBonus  = getUnlockedBonusIds();
    meta.shards = (meta.shards || 0) + totalAward;
    meta.history = (meta.history || []).concat(run);
    if (meta.history.length > 50) meta.history = meta.history.slice(-50);
    _saveMeta(meta);
    const afterRunes  = getUnlockedRuneIds();
    const afterBonus  = getUnlockedBonusIds();
    const newRunes  = afterRunes.filter(id => !beforeRunes.includes(id));
    const newBonus  = afterBonus.filter(id => !beforeBonus.includes(id));

    return { award: totalAward, base: baseAward, stageBonus, run, newAchievements: newAch, newRunes, newBonuses: newBonus, meta };
  }

  // ── Сброс мета-прогресса ─────────────────────────────
  function reset() {
    _saveMeta(_defaults());
  }

  // ── Трекинг пиков money в течение партии ──────────────
  // Используется ачивками «Миллионщик» (peakMoney ≥ 5M) и «Феникс»
  // (lowestMoney ≤ 50K + победа). Не трогаем engine: просто оборачиваем
  // advanceMonth и при необходимости startGame, чтобы сбросить треки.
  function _updateMoneyTrack(g) {
    if (!g) return;
    const m = g.money || 0;
    if (g._runMaxMoney == null || m > g._runMaxMoney) g._runMaxMoney = m;
    if (g._runMinMoney == null || m < g._runMinMoney) g._runMinMoney = m;
  }
  if (typeof window.advanceMonth === 'function' && !window.advanceMonth.__metaWrapped) {
    const _origAdv = window.advanceMonth;
    window.advanceMonth = function () {
      const r = _origAdv.apply(this, arguments);
      try { _updateMoneyTrack(typeof G !== 'undefined' ? G : null); } catch (e) {}
      return r;
    };
    window.advanceMonth.__metaWrapped = true;
  }
  if (typeof window.startGame === 'function' && !window.startGame.__metaWrapped) {
    const _origStart = window.startGame;
    window.startGame = function () {
      const r = _origStart.apply(this, arguments);
      try {
        if (typeof G !== 'undefined' && G) {
          G._runMaxMoney = G.money || 0;
          G._runMinMoney = G.money || 0;
        }
      } catch (e) {}
      return r;
    };
    window.startGame.__metaWrapped = true;
  }

  // ── UI: модал мета-прогресса ─────────────────────────
  function showModal() {
    if (typeof document === 'undefined') return;
    let m = document.getElementById('meta-modal');
    if (!m) {
      m = document.createElement('div');
      m.id = 'meta-modal';
      m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:330;display:flex;align-items:center;justify-content:center';
      m.onclick = e => { if (e.target === m) _closeModal(); };
      document.body.appendChild(m);
    }
    m.innerHTML = _renderModalHtml(_loadMeta());
    m.style.display = 'flex';
  }

  function _closeModal() {
    const m = document.getElementById('meta-modal');
    if (m) m.style.display = 'none';
  }

  function _renderModalHtml(meta) {
    const ach = ACHIEVEMENTS.map(a => {
      const got = (meta.achievements || []).includes(a.id);
      return `<div style="border:1px solid ${got ? '#f59e0b66' : 'var(--border)'};background:${got ? 'rgba(245,158,11,.08)' : 'rgba(255,255,255,.02)'};border-radius:8px;padding:9px 11px;display:flex;align-items:center;gap:10px;${got ? '' : 'opacity:.55'}">
        <span style="font-size:22px;filter:${got ? 'none' : 'grayscale(1)'}">${a.icon}</span>
        <div style="min-width:0;flex:1">
          <div style="font-size:12px;font-weight:700;color:var(--text)">${a.name}</div>
          <div style="font-size:10px;color:var(--sub);margin-top:2px">${a.desc}</div>
        </div>
        <span style="font-size:10px;font-weight:700;color:#f59e0b;white-space:nowrap">+${a.shards}</span>
      </div>`;
    }).join('');

    // v0.2: визуальный прогресс-бар на запертых строках —
    // показываем сколько уже накоплено к порогу и сколько ещё осталось.
    function _renderLockRow(item, accent) {
      const open = meta.shards >= item.shards;
      if (open) {
        return `<div style="display:flex;justify-content:space-between;padding:5px 9px;border-radius:5px;background:${accent.bgOpen};border:1px solid ${accent.brOpen}">
          <span style="font-size:11px;color:var(--text);font-weight:600">✓ ${item.id}</span>
          <span style="font-size:10px;color:var(--muted)">открыто на ${item.shards} ✦</span>
        </div>`;
      }
      const pct = item.shards > 0 ? Math.max(0, Math.min(100, Math.round(meta.shards / item.shards * 100))) : 100;
      const remain = Math.max(0, item.shards - meta.shards);
      return `<div style="padding:5px 9px;border-radius:5px;background:rgba(255,255,255,.02);border:1px solid var(--border)">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:11px;color:var(--muted);font-weight:600">🔒 ${item.id}</span>
          <span style="font-size:10px;color:var(--muted)">${meta.shards} / ${item.shards} ✦ · −${remain}</span>
        </div>
        <div style="height:4px;border-radius:3px;background:rgba(255,255,255,.06);margin-top:5px;overflow:hidden">
          <div style="height:100%;width:${pct}%;background:${accent.bar};border-radius:3px;transition:width .2s"></div>
        </div>
      </div>`;
    }
    const runeRows  = RUNE_UNLOCKS.map(r => _renderLockRow(r, {
      bgOpen: 'rgba(34,211,238,.06)', brOpen: 'rgba(34,211,238,.2)', bar: '#22d3ee',
    })).join('');
    const bonusRows = BONUS_UNLOCKS.map(b => _renderLockRow(b, {
      bgOpen: 'rgba(167,139,250,.06)', brOpen: 'rgba(167,139,250,.2)', bar: '#a78bfa',
    })).join('');

    const histLast = (meta.history || []).slice(-5).reverse();
    const hist = histLast.length
      ? histLast.map(r => {
          const tag = r.won ? '<span style="color:var(--green)">🏆 победа</span>'
                    : r.bankrupt ? '<span style="color:var(--red)">💀 банкротство</span>'
                    : '<span style="color:var(--amber)">🏳 завершён</span>';
          return `<div style="font-size:11px;color:var(--sub);padding:3px 0">M${r.monthsPlayed} · этап ${r.stageReached + 1}/5 · ${tag}${r.runeId ? ` · ${r.runeId}` : ''}</div>`;
        }).join('')
      : '<div style="font-size:11px;color:var(--muted)">История пуста</div>';

    // v0.2: подсказка про ближайшую разблокировку
    const nextRune  = getNextRuneUnlock();
    const nextBonus = getNextBonusUnlock();
    const nextLine = (nextRune || nextBonus)
      ? `<div style="font-size:11px;color:var(--sub);margin-top:6px;display:flex;flex-wrap:wrap;gap:12px">
          ${nextRune  ? `<span>🔒 руна <b style="color:var(--text)">${nextRune.id}</b> — ещё <b style="color:#22d3ee">${nextRune.remaining} ✦</b></span>` : ''}
          ${nextBonus ? `<span>🔒 бонус <b style="color:var(--text)">${nextBonus.id}</b> — ещё <b style="color:#a78bfa">${nextBonus.remaining} ✦</b></span>` : ''}
        </div>`
      : '<div style="font-size:11px;color:var(--green);margin-top:6px">✨ Все руны и бонусы открыты</div>';

    return `<div style="background:var(--bg2);border:1px solid var(--border);border-radius:14px;
      max-width:780px;width:94%;max-height:90vh;overflow:auto;padding:22px;
      display:flex;flex-direction:column;gap:14px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
        <div style="min-width:0;flex:1">
          <div style="display:flex;align-items:baseline;gap:10px">
            <b style="font-size:18px">⚡ Мета-прогресс Rogue-lite</b>
            <span style="font-size:18px;font-weight:800;color:#f59e0b">${meta.shards} ✦</span>
          </div>
          <div style="font-size:11px;color:var(--sub);margin-top:4px">Ранов: ${meta.totalRuns} · побед: ${meta.wins} · ачивок: ${(meta.achievements || []).length}/${ACHIEVEMENTS.length} · собрано рун: ${(meta.playedRuneIds || []).length}/${BASE_RUNE_IDS.length}</div>
          ${nextLine}
        </div>
        <button onclick="RogueMeta.closeModal()" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:18px;padding:4px 8px">✕</button>
      </div>

      <div>
        <div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.6px;margin-bottom:6px">🏅 Достижения</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:6px">${ach}</div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
        <div>
          <div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.6px;margin-bottom:6px">🎲 Руны</div>
          <div style="display:flex;flex-direction:column;gap:4px">${runeRows}</div>
        </div>
        <div>
          <div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.6px;margin-bottom:6px">🎁 Бонусы Run Map</div>
          <div style="display:flex;flex-direction:column;gap:4px">${bonusRows}</div>
        </div>
      </div>

      <div>
        <div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.6px;margin-bottom:6px">📜 Последние раны</div>
        ${hist}
      </div>

      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding-top:8px;border-top:1px dashed var(--border)">
        <span style="font-size:10px;color:var(--muted)">Мета-прогресс хранится в localStorage. Сброс необратим.</span>
        <button onclick="RogueMeta._confirmReset()"
          style="background:rgba(248,81,73,.1);border:1px solid rgba(248,81,73,.35);color:#fca5a5;
                 border-radius:7px;padding:6px 12px;font-size:11px;font-weight:600;cursor:pointer">
          Сбросить мета-прогресс
        </button>
      </div>
    </div>`;
  }

  function _confirmReset() {
    const msg = 'Сбросить весь мета-прогресс Rogue-lite? Все накопленные осколки, разблокированные руны/бонусы и ачивки будут потеряны.';
    if (typeof window.confirm === 'function' && window.confirm(msg)) {
      reset();
      showModal();
    }
  }

  // ── UI: кнопка на mode-screen ────────────────────────
  // v0.2: вместо однострочного «Мета-прогресс [N ✦]» — двухстрочная
  // кнопка с прогресс-баром до ближайшей разблокировки.
  function _injectModeButton() {
    if (typeof document === 'undefined') return;
    const dlcCards = document.getElementById('dlc-cards');
    if (!dlcCards || !dlcCards.parentElement) return;
    if (document.getElementById('meta-mode-btn')) return;
    const meta = _loadMeta();
    const next = getNextRuneUnlock() || getNextBonusUnlock();
    const pct  = next ? Math.max(0, Math.min(100, Math.round(meta.shards / next.shards * 100))) : 100;
    const subText = next
      ? `Следующая разблокировка: 🔒 ${next.id} — ещё ${next.remaining} ✦`
      : '✨ Все руны и бонусы открыты';

    const btn = document.createElement('button');
    btn.id = 'meta-mode-btn';
    btn.onclick = showModal;
    btn.style.cssText = 'margin-top:10px;background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.35);color:#fbbf24;border-radius:8px;padding:11px 14px;font-size:12px;font-weight:700;cursor:pointer;width:100%;text-align:left;display:flex;flex-direction:column;gap:7px';
    btn.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
        <span>⚡ Мета-прогресс Rogue-lite</span>
        <span style="font-size:13px;font-weight:800">${meta.shards} ✦</span>
      </div>
      <div style="height:4px;border-radius:3px;background:rgba(255,255,255,.08);overflow:hidden">
        <div style="height:100%;width:${pct}%;background:#fbbf24;border-radius:3px;transition:width .2s"></div>
      </div>
      <span style="font-size:10px;font-weight:500;color:rgba(251,191,36,.85)">${subText}</span>
    `;
    dlcCards.parentElement.insertBefore(btn, dlcCards.nextSibling);
  }

  // Пробуем сразу + откладываем (на случай если DOM ещё не достроен)
  try { _injectModeButton(); } catch (e) {}
  if (typeof setTimeout === 'function') {
    setTimeout(() => { try { _injectModeButton(); } catch (e) {} }, 50);
  }

  // ── Публичный API ────────────────────────────────────
  window.RogueMeta = {
    // Чтение
    getShards, getMeta,
    isRuneUnlocked, isBonusUnlocked,
    getUnlockedRuneIds, getUnlockedBonusIds,
    getRuneUnlocks, getBonusUnlocks,
    getAchievements,
    // v0.2: визуальный прогресс
    getNextRuneUnlock, getNextBonusUnlock,
    // Запись (через игровой цикл)
    awardAtEndGame,
    reset,
    // UI
    showModal,
    closeModal: _closeModal,
    _confirmReset,
    _injectModeButton,
  };

  console.log('[meta] v0.2 активирован: ' + RUNE_UNLOCKS.length + ' рун, ' + BONUS_UNLOCKS.length + ' бонусов, ' + ACHIEVEMENTS.length + ' ачивок · текущие ✦ ' + getShards());
})();
