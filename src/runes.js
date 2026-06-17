// ══════════════════════════════════════════════════════
//  Стартовые перки-руны — реализация roguelite-механики
//
//  Активируются ТОЛЬКО когда включён DLC «Rogue-lite»
//  (тумблер на mode-screen, persistence в localStorage
//  под ключом 'bt_enabled_dlcs_v1'). Без DLC модуль молча
//  не регистрируется — игра ведёт себя как будто файла нет.
//
//  Hard kill-switch — флаг `RUNES_ENABLED` ниже (false
//  отключает даже при включённом DLC; для дебага/A-B-тестов).
//
//  Файл физически лежит в src/, чтобы при single-HTML
//  build всё было встроено в один файл; гейт по DLC сделан
//  через прямое чтение localStorage (не зависит от объекта
//  DLC, который объявляется в dlc/loader.js позже по порядку).
//
//  Принцип: ядро игры (engine.js/staff.js/projects.js/ui.js)
//  не модифицируется — модуль цепляется через EventBus и
//  обёртки глобальных функций (startGame, advanceMonth,
//  _generateOffers).
//
//  Поток: DLC включён → spec выбрана → «Начать дело» →
//  обёртка перехватывает первый вызов startGame → модал
//  с 3 рунами из общего пула (4) → выбор записывает
//  G.activeRune, применяет эффекты, продолжает оригинал.
//
//  Эффекты — пять каналов:
//   1) startMoneyDelta — разовое изменение G.money
//   2) scoutBonus     — G.caseScoutBonus (существующий канал)
//   3) payoutMult     — G.perkPayoutMult (существующий канал)
//   4) penaltyMult    — наш доп.штраф в обёртке advanceMonth
//   5) overheadBump   — наш доп.списания в обёртке advanceMonth
//      (не трогаем let OVERHEAD в engine.js — он недоступен
//      из этого скрипт-скоупа; вместо подмены делаем доплату)
//   + флаг insiderRare → обёртка _generateOffers
//   + флаг serialUnlock → доп.боост payoutMult при 15 портфолио
//
//  Бэклог: п.13 «Roguelite-механики», первый шаг
//  (стартовые перки-руны). Story Arcs / Run Map / мета-прогресс —
//  отдельные итерации, см. backlog/01_features.md.
// ══════════════════════════════════════════════════════

(function () {
  'use strict';

  // ─── Hard kill-switch ─────────────────────────────────
  // Выключить руны целиком даже при включённом DLC — false.
  const RUNES_ENABLED = true;
  if (!RUNES_ENABLED) return;

  // ─── Гейт по DLC «Rogue-lite» ─────────────────────────
  // Без DLC механика не запускается (правило: roguelite-фичи
  // только при активном DLC). Чтение напрямую из localStorage:
  // DLC.isEnabled читать нельзя — dlc/loader.js загружается
  // позже по порядку.
  if (!_rogueliteEnabled()) return;

  if (typeof EventBus === 'undefined') {
    console.error('[runes] EventBus не найден — модуль не активирован');
    return;
  }
  if (window.__RUNES_LOADED) return;
  window.__RUNES_LOADED = true;

  function _rogueliteEnabled() {
    try {
      const raw = (typeof localStorage !== 'undefined' && localStorage.getItem('bt_enabled_dlcs_v1')) || '[]';
      const arr = JSON.parse(raw);
      return Array.isArray(arr) && arr.includes('roguelite');
    } catch (e) { return false; }
  }

  // ── Каталог рун (общий пул) ───────────────────────────
  // На старте показываем 3 случайные из этого пула.
  // Чтобы добавить новую руну — допиши объект и опиши эффект
  // ниже в _applyRuneEffects() / обёртках. Балансные числа
  // вынесены в поля карточки, без констант в обёртках.
  const RUNES = [
    {
      id:    'connections',
      icon:  '🤝',
      name:  'Связи в отрасли',
      desc:  '+1 лид при скаутинге проектов на весь ран. Старт −150 000 ₽ — пришлось проставиться.',
      color: '#34d399',
      effects: { startMoneyDelta: -150000, scoutBonus: 1 },
    },
    {
      id:    'perfectionist',
      icon:  '🎯',
      name:  'Перфекционист',
      desc:  'Завершённые проекты +5% к выплате. Просрочка бьёт по репутации в 2 раза сильнее.',
      color: '#a78bfa',
      effects: { payoutMult: 0.05, penaltyMult: 2 },
    },
    {
      id:    'insider',
      icon:  '🕵',
      name:  'Инсайдер рынка',
      desc:  'В каждом скаутинге гарантированно виден 1 rare/epic-оффер. Overhead +15% — нужно платить за контакты.',
      color: '#f59e0b',
      effects: { insiderRare: true, overheadBumpPct: 0.15 },
    },
    {
      id:    'serial',
      icon:  '🚀',
      name:  'Серийный предприниматель',
      desc:  'При 15 баллах портфолио открывается «вторая специализация» — все выплаты +20%. Первая итерация: полноценный выбор второй спеки — в следующей версии.',
      color: '#22d3ee',
      effects: { serialUnlock: true },
    },
    // ── Запираемые руны (открываются мета-прогрессом, см. src/meta.js) ──
    {
      id:    'hardened',
      icon:  '🛡',
      name:  'Закалённый',
      desc:  'Просрочка бьёт по репутации в 2 раза меньше (penalty shield). Зато overhead +10% — закалка не бесплатна.',
      color: '#fb7185',
      effects: { penaltyShield: true, overheadBumpPct: 0.10 },
    },
    {
      id:    'scholar',
      icon:  '🎓',
      name:  'Стипендиат',
      desc:  '+10 к качеству от стартовых апгрейдов. Но выплаты −5% — академия не подружила со скоростью бизнеса.',
      color: '#60a5fa',
      effects: { qualityBonus: 10, payoutMult: -0.05 },
    },
    {
      id:    'networker',
      icon:  '🌐',
      name:  'Сетевик',
      desc:  '+2 лида при каждом скаутинге. Стартовый кэш −300 000 ₽ — много заплатил за интро и абонементы конференций.',
      color: '#10b981',
      effects: { scoutBonus: 2, startMoneyDelta: -300000 },
    },
    {
      id:    'outsider',
      icon:  '🌪',
      name:  'Аутсайдер',
      desc:  'Overhead −20% (работаешь из подвала, экономишь на всём). Стартовая репутация −15 — тебя пока никто не знает.',
      color: '#facc15',
      effects: { overheadBumpPct: -0.20, startReputationDelta: -15 },
    },
    // ── v0.6: руны второго поколения (shards 900 / 1100) ──
    {
      id:    'architect',
      icon:  '🏗',
      name:  'Архитектор',
      desc:  '+8 Q к стартовой команде — сильная база с первого месяца. Старт −100 000 ₽ — дорогие инструменты и онбординг.',
      color: '#818cf8',
      effects: { qualityBonus: 8, startMoneyDelta: -100000 },
    },
    {
      id:    'hustler',
      icon:  '💨',
      name:  'Хастлер',
      desc:  '+1 лид при скаутинге и +8% к выплатам — гибрид связей и перфекционизма. Старт −200 000 ₽ — вложил в сеть контактов.',
      color: '#f97316',
      effects: { scoutBonus: 1, payoutMult: 0.08, startMoneyDelta: -200000 },
    },
  ];

  // ── Внутренний стейт модуля ───────────────────────────
  let _pendingRune = null;   // выбран в модале, ждёт startGame
  let _modalOpen   = false;

  // ── Обёртка startGame: перехват первого вызова ───────
  const _origStartGame = window.startGame;
  window.startGame = function () {
    if (!G || !G.spec) {
      // оригинал сам отбьёт по `if (!G.spec) return;`
      return _origStartGame.apply(this, arguments);
    }
    if (!_pendingRune) {
      _showRuneModal();
      return;
    }
    // Запускаем оригинал — он сбросит G в стартовое состояние
    _origStartGame.apply(this, arguments);
    // Дальше применяем эффекты руны поверх свежего G
    _applyRuneToG(_pendingRune);
    // Пилюлю отрисуем при ближайшем рендере
    EventBus.emit('render');
  };

  // ── Обёртка resetGame: чистим pending и историю ──────
  if (typeof window.resetGame === 'function' && !window.resetGame.__runesWrapped) {
    const _origReset = window.resetGame;
    window.resetGame = function () {
      _pendingRune = null;
      return _origReset.apply(this, arguments);
    };
    window.resetGame.__runesWrapped = true;
  }

  // ── Обёртка advanceMonth: доп.списания / доп.штраф ───
  if (typeof window.advanceMonth === 'function' && !window.advanceMonth.__runesWrapped) {
    const _origAdvance = window.advanceMonth;
    window.advanceMonth = function () {
      const r = _origAdvance.apply(this, arguments);
      if (typeof DLC !== 'undefined' && !DLC.isEnabled('roguelite')) return r;
      try { _postAdvance(); } catch (e) { console.warn('[runes] postAdvance:', e); }
      return r;
    };
    window.advanceMonth.__runesWrapped = true;
  }

  // ── Обёртка _generateOffers: insider-инжект ──────────
  if (typeof window._generateOffers === 'function' && !window._generateOffers.__runesWrapped) {
    const _origGen = window._generateOffers;
    window._generateOffers = function () {
      const offers = _origGen.apply(this, arguments) || [];
      if (typeof DLC !== 'undefined' && !DLC.isEnabled('roguelite')) return offers;
      try {
        if (G && G.runeInsiderRare) _injectRareOffer(offers);
      } catch (e) { console.warn('[runes] insider:', e); }
      return offers;
    };
    window._generateOffers.__runesWrapped = true;
  }

  // ── Применение эффектов руны к свежему G ─────────────
  function _applyRuneToG(rune) {
    if (!rune || !G) return;
    const e = rune.effects || {};

    if (typeof e.startMoneyDelta === 'number' && e.startMoneyDelta !== 0) {
      G.money = Math.max(0, (G.money || 0) + e.startMoneyDelta);
    }
    if (typeof e.scoutBonus === 'number' && e.scoutBonus !== 0) {
      G.caseScoutBonus = (G.caseScoutBonus || 0) + e.scoutBonus;
    }
    if (typeof e.payoutMult === 'number' && e.payoutMult !== 0) {
      G.perkPayoutMult = Math.round(((G.perkPayoutMult || 0) + e.payoutMult) * 100) / 100;
    }
    if (typeof e.penaltyMult === 'number' && e.penaltyMult > 1) {
      G.runePenaltyMult = e.penaltyMult;
    }
    if (typeof e.overheadBumpPct === 'number' && e.overheadBumpPct !== 0) {
      // OVERHEAD-let в engine.js недоступен из этого скоупа.
      // Поэтому сохраняем абсолютную величину доп.списания и вычитаем
      // её каждый месяц в обёртке advanceMonth (после оригинального advance).
      // Отрицательное значение → экономия (Аутсайдер): runeOverheadBump уйдёт в минус,
      // и в _postAdvance ветка `G.money -= bump` фактически вернёт часть.
      const baseOverhead = (typeof SCENARIO !== 'undefined' && SCENARIO?.settings?.overhead) || 0;
      G.runeOverheadBump = (G.runeOverheadBump || 0) + Math.round(baseOverhead * e.overheadBumpPct);
    }
    // Новые каналы для запираемых рун (открываются мета-прогрессом)
    if (typeof e.qualityBonus === 'number' && e.qualityBonus !== 0) {
      G.caseQBonus = (G.caseQBonus || 0) + e.qualityBonus;
    }
    if (typeof e.startReputationDelta === 'number' && e.startReputationDelta !== 0) {
      G.reputation = Math.max(0, Math.min(100, (G.reputation || 0) + e.startReputationDelta));
    }
    if (e.penaltyShield)  G.perkPenaltyShield = true;
    if (e.insiderRare)    G.runeInsiderRare   = true;
    if (e.serialUnlock)   G.runeSerialUnlock  = true;

    // Карточка руны в стейте — для UI и сейвов
    G.activeRune = {
      id: rune.id, name: rune.name, icon: rune.icon,
      desc: rune.desc, color: rune.color,
    };

    if (typeof addLog === 'function') {
      addLog(`${rune.icon} Руна «${rune.name}»: ${rune.desc}`, 'purple');
    }
  }

  // ── Пост-месячные эффекты ─────────────────────────────
  function _postAdvance() {
    if (!G) return;

    // (а) Доп.overhead / экономия — отдельной строкой в логе,
    //     не дублирует базовый overhead (он уже списан движком).
    //     Положительный bump → доп.списание (Инсайдер).
    //     Отрицательный bump → возврат части (Аутсайдер — подвальный режим).
    if (G.runeOverheadBump && G.money > 0) {
      G.money -= G.runeOverheadBump;
      if (typeof addLog === 'function') {
        if (G.runeOverheadBump > 0) {
          const tag = G.activeRune ? G.activeRune.icon + ' ' + G.activeRune.name : '🕵 Инсайдер';
          addLog(`${tag}: контакты −${_fmt(G.runeOverheadBump)} (доп.overhead)`, 'red');
        } else {
          const tag = G.activeRune ? G.activeRune.icon + ' ' + G.activeRune.name : '🌪 Подвал';
          addLog(`${tag}: экономия +${_fmt(-G.runeOverheadBump)} (overhead)`, 'green');
        }
      }
    }

    // (б) Перфекционист: для каждого просроченного проекта база
    //     уже списала pen репутации; добавляем ещё столько же, чтобы
    //     получился ×2. Формула pen — копия из engine.js, чтобы не
    //     зависеть от внутренних хелперов.
    if ((G.runePenaltyMult || 1) > 1 && Array.isArray(G.activeClients)) {
      G.activeClients.forEach(c => {
        const effMon = c._workStartMonth != null
          ? (c._monthsSigned || 0) - c._workStartMonth
          : (c._monthsSigned || 0);
        const deadline = Math.round((c._duration || 3) * 1.6) + 2;
        if (!c.oneTime && c._duration && effMon > deadline && (c._progress || 0) < 100) {
          const basePen = (typeof hasRole === 'function' && (hasRole('lawyer') || G.perkPenaltyShield)) ? 1 : 2;
          const extra   = basePen * ((G.runePenaltyMult || 1) - 1);
          G.reputation  = Math.max(0, Math.min(100, (G.reputation || 0) - extra));
          if (typeof addLog === 'function') {
            addLog(`🎯 Перфекционист: ${c.name} — доп.штраф −${extra} реп. за просрочку`, 'red');
          }
        }
      });
    }

    // (в) Серийный предприниматель: при пересечении 15 портфолио —
    //     п.13: полноценный выбор второй специализации через UI.
    if (G.runeSerialUnlock && !G.runeSerialApplied && (G.portfolio || 0) >= 15) {
      G.runeSerialApplied = true; // флаг — больше не триггерить
      if (typeof showSecondSpecPicker === 'function') {
        showSecondSpecPicker();
      } else {
        // fallback: если ui.js ещё не загружен
        G.perkPayoutMult = Math.round(((G.perkPayoutMult || 0) + 0.20) * 100) / 100;
        if (typeof addLog === 'function') addLog('🚀 Серийный предприниматель: выплаты +20%', 'green');
      }
    }
  }

  // ── Инсайдер: гарантия rare/epic в скаутинге ──────────
  function _injectRareOffer(offers) {
    const hasRareUp = offers.some(o => ['rare', 'epic', 'legendary'].includes(o?.rarity));
    if (hasRareUp) return;
    if (typeof PROJECT_POOL === 'undefined' || !Array.isArray(PROJECT_POOL)) return;
    // Берём rare/epic не выше T3, ещё не активный, не в текущем оффер-сете
    const pool = PROJECT_POOL.filter(p =>
      ['rare', 'epic'].includes(p.rarity) &&
      (p.tier || 1) <= 3 &&
      !(G.activeClients || []).find(c => (c.id || '').startsWith(p.id)) &&
      !offers.find(o => o.id === p.id) &&
      (!p.requiresDev  || (typeof hasRole === 'function' && hasRole('developer'))) &&
      (!p.minPortfolio || (G.portfolio || 0) >= p.minPortfolio)
    );
    if (!pool.length) return;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    offers.unshift({ ...pick, _runeInsider: true });
  }

  // ── Модал выбора руны ─────────────────────────────────
  function _showRuneModal() {
    let m = document.getElementById('rune-modal');
    if (!m) {
      m = document.createElement('div');
      m.id = 'rune-modal';
      m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:320;display:flex;align-items:center;justify-content:center';
      m.onclick = (e) => { if (e.target === m) _closeModal(); };
      document.body.appendChild(m);
    }
    // 3 случайные из ОТКРЫТОЙ части общего пула.
    // Запираемые руны (hardened/scholar/networker/outsider) появятся в пуле
    // только когда мета-прогресс наберёт нужные осколки (см. src/meta.js).
    // Если RogueMeta недоступен — все руны считаются открытыми (back-compat).
    const meta = (typeof window !== 'undefined') ? window.RogueMeta : null;
    const pool = [...RUNES].filter(r =>
      !meta || typeof meta.isRuneUnlocked !== 'function' || meta.isRuneUnlocked(r.id)
    );
    if (pool.length < 3) {
      // Если открыто меньше 3 — добавляем «свободные» руны без проверки,
      // чтобы пользователь всегда получил 3 варианта (фолбэк безопасности).
      for (const r of RUNES) {
        if (pool.length >= 3) break;
        if (!pool.includes(r)) pool.push(r);
      }
    }
    const shown = [];
    while (shown.length < 3 && pool.length) {
      const idx = Math.floor(Math.random() * pool.length);
      shown.push(pool.splice(idx, 1)[0]);
    }
    m.dataset.rerollCount = m.dataset.rerollCount || '0';
    m.innerHTML = _renderModalHtml(shown, parseInt(m.dataset.rerollCount, 10));
    m.style.display = 'flex';
    _modalOpen = true;
  }

  function _closeModal() {
    const m = document.getElementById('rune-modal');
    if (m) m.style.display = 'none';
    _modalOpen = false;
  }

  // v3.21: лимит перебросов с учётом мета-перка extra_reroll
  function _maxRerolls() {
    try {
      const bonus = (typeof window !== 'undefined' && window.RogueMeta && typeof window.RogueMeta.getBonusRerolls === 'function')
        ? window.RogueMeta.getBonusRerolls() : 0;
      return 2 + (bonus || 0);
    } catch (e) { return 2; }
  }

  function _renderModalHtml(runes, rerolls) {
    const max = _maxRerolls();
    const canReroll = rerolls < max;
    const cards = runes.map(r => {
      const fx = r.effects || {};
      const tags = [];
      if (fx.startMoneyDelta) tags.push(`${fx.startMoneyDelta > 0 ? '+' : ''}${_fmt(fx.startMoneyDelta)} старт`);
      if (fx.scoutBonus)      tags.push(`+${fx.scoutBonus} лид`);
      if (fx.payoutMult)      tags.push(`+${Math.round(fx.payoutMult * 100)}% выплаты`);
      if (fx.penaltyMult)     tags.push(`×${fx.penaltyMult} штраф`);
      if (fx.overheadBumpPct) tags.push(`+${Math.round(fx.overheadBumpPct * 100)}% overhead`);
      if (fx.insiderRare)     tags.push('rare/epic гарант.');
      if (fx.serialUnlock)    tags.push('вторая спека на 15 порт.');

      return `<div onclick="Runes.pick('${r.id}')"
        style="border:1px solid ${r.color}55;background:${r.color}0d;border-radius:12px;
               padding:14px 14px 12px;cursor:pointer;display:flex;flex-direction:column;gap:8px;
               min-width:0;transition:transform .12s,border-color .12s,background .12s"
        onmouseover="this.style.transform='translateY(-2px)';this.style.borderColor='${r.color}'"
        onmouseout="this.style.transform='';this.style.borderColor='${r.color}55'">
        <div style="display:flex;align-items:center;gap:9px">
          <span style="font-size:26px;line-height:1">${r.icon}</span>
          <div style="min-width:0">
            <div style="font-size:14px;font-weight:700;color:var(--text)">${r.name}</div>
            <div style="font-size:10px;color:${r.color};font-weight:600;letter-spacing:.3px;text-transform:uppercase">руна</div>
          </div>
        </div>
        <div style="font-size:12px;color:var(--sub);line-height:1.4">${r.desc}</div>
        <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:auto">
          ${tags.map(t => `<span style="font-size:10px;padding:2px 7px;border-radius:10px;background:${r.color}22;color:${r.color};font-weight:600">${t}</span>`).join('')}
        </div>
      </div>`;
    }).join('');

    return `<div style="background:var(--bg2);border:1px solid var(--border);border-radius:14px;
      max-width:840px;width:94%;max-height:90vh;overflow:auto;padding:22px 22px 18px;
      display:flex;flex-direction:column;gap:14px">
      <div>
        <div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap">
          <b style="font-size:17px">🎲 Выбери стартовую руну</b>
          <span style="font-size:11px;color:var(--muted)">первый шаг roguelite-петли · действует весь ран</span>
        </div>
        <div style="font-size:12px;color:var(--sub);margin-top:4px;line-height:1.45">
          Каждый ран начинается с уникального набора условий. Выбери одну из трёх рун — её эффекты держатся до конца партии. Отказаться нельзя: руна задаёт асимметрию рана.
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px">${cards}</div>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:4px;padding-top:8px;border-top:1px dashed var(--border)">
        <span style="font-size:10px;color:var(--muted)">Перебросов осталось: ${Math.max(0, max - rerolls)} / ${max}${max > 2 ? ' ✨' : ''}</span>
        <div style="display:flex;gap:8px">
          <button ${canReroll ? '' : 'disabled style="opacity:.4"'} onclick="Runes._reroll()"
            style="background:rgba(99,102,241,.12);border:1px solid rgba(99,102,241,.35);color:#c7d2fe;
                   border-radius:8px;padding:7px 14px;font-size:12px;font-weight:600;cursor:pointer">
            🎲 Перебросить
          </button>
        </div>
      </div>
    </div>`;
  }

  function _reroll() {
    const m = document.getElementById('rune-modal');
    if (!m) return;
    const n = parseInt(m.dataset.rerollCount || '0', 10);
    if (n >= _maxRerolls()) return;
    m.dataset.rerollCount = String(n + 1);
    _showRuneModal();   // перерисовка с тем же счётчиком
  }

  function pick(id) {
    const r = RUNES.find(x => x.id === id);
    if (!r) return;
    _pendingRune = r;
    _closeModal();
    // Сбрасываем счётчик перебросов для следующего рана
    const m = document.getElementById('rune-modal');
    if (m) m.dataset.rerollCount = '0';
    // Запускаем игру через обёрнутый startGame — он увидит _pendingRune и пройдёт
    window.startGame();
  }

  // ── Пилюля активной руны в game-header ───────────────
  function _injectPill() {
    if (typeof DLC !== 'undefined' && !DLC.isEnabled('roguelite')) return;
    if (!G || !G.activeRune) return;
    const header = document.querySelector('.game-header .game-logo');
    if (!header) return;
    let pill = document.getElementById('rune-active-pill');
    if (!pill) {
      pill = document.createElement('span');
      pill.id = 'rune-active-pill';
      pill.style.cssText = 'margin-left:8px;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;letter-spacing:.3px;vertical-align:middle';
      header.appendChild(pill);
    }
    const r = G.activeRune;
    pill.style.background = `${r.color}22`;
    pill.style.color      = r.color;
    pill.title            = r.desc;
    pill.textContent      = `${r.icon} ${r.name}`;
  }

  EventBus.on('render', _injectPill);
  // Если страница уже загружена с активным G (загрузка сейва) — попробуем сразу
  try { _injectPill(); } catch (e) {}

  // ── Утилиты ───────────────────────────────────────────
  function _fmt(n) {
    if (typeof fmt === 'function') return fmt(n);
    return new Intl.NumberFormat('ru-RU').format(Math.round(n)) + '₽';
  }

  // ── Публичный API (для onclick'ов) ────────────────────
  window.Runes = {
    pick,
    _reroll,
    _showModal:  _showRuneModal,
    _closeModal: _closeModal,
    getPool: () => RUNES.slice(),
    getPending: () => _pendingRune,
  };

  console.log('[runes] v0.2 активирован: пул из ' + RUNES.length + ' рун (4 базовые + 4 ранние + 2 поздние), модал показывает 3 случайные, 2 переброса');
})();
