// ══════════════════════════════════════════════════════
//  Ф.7 — Система «Открытие механик» (режим Rogue-lite, DLC id 'unlocks')
//
//  v2 (§15): скелет + ЭКОНОМИКА ЭКСПЕРТИЗЫ.
//  Всегда загружается как <script>, но АКТИВНА только когда включён DLC
//  'unlocks' (тумблер на mode-screen). Вне режима isModuleUnlocked() === true
//  → обычная игра и «Прокачка» (mastery) НЕ меняются.
//
//  Межрановая мета в localStorage 'bt_unlocks_v1':
//    { opened:[id…], exp:N, firsts:{key:true…}, runs:N }
//
//  Экспертиза (§15.1):
//    • база по исходу рана: победа 100 / поражение-выход 30
//    • бонус за стадию компании: stage × 15 (Империя = 75)
//    • «первые разы» — единоразовые за всю мету (см. FIRSTS)
//  Начисление — awardAtRunEnd(won, g); дёргает DLC-координатор на end_game.
//  Трата — buy(id) с экрана «Дерево открытий» (dlc/unlocks/tree-ui.js).
//
//  «Первые разы» ловим сигналами EventBus (движок DOM-free, всё через
//  сигналы — совместимо с Godot-портированием):
//    staff_hired / project_delivered / assets_changed(acquisition) /
//    market_ticked / end_game(won)
//
//  Дизайн: backlog/design_roguelite_meta.md §11 (лестница), §14 (архитектура),
//  §15 (петля + экономика). Ядро DOM-free (localStorage + чистые функции).
// ══════════════════════════════════════════════════════

(function () {
  'use strict';
  if (window.__UNLOCKS_LOADED) return;
  window.__UNLOCKS_LOADED = true;

  const MODE_ID  = 'unlocks';
  const LS_MODE  = 'bt_enabled_dlcs_v1';   // общий список включённых DLC/режимов
  const LS_STATE = 'bt_unlocks_v1';        // межрановая мета режима

  // 13 модулей (§11.3). tier — для мягких пререквизитов, cost — экспертиза (заглушки).
  // Роман планирует поменять конкретные пункты позже — важна структура, не имена.
  const MODULE_UNLOCKS = [
    { id:'hire',     branch:'A', tier:1, name:'Найм',             cost:100, ico:'🧑‍💻', un:'Роли/грейды/ФОТ/мощность команды' },
    { id:'life',     branch:'A', tier:2, name:'Lifecycle-фазы',   cost:200, ico:'📋', un:'Бриф/планирование/мульти-work' },
    { id:'port',     branch:'A', tier:3, name:'Портфолио/Кейсы',  cost:300, ico:'📁', un:'Пассив Q/реп/лиды' },
    { id:'tree',     branch:'A', tier:4, name:'Древо перков 2.0', cost:400, ico:'🌳', un:'In-run узлы + bonusProjectAction' },
    { id:'sub',      branch:'A', tier:5, name:'Саббренды/Офисы',  cost:600, ico:'🏢', un:'Параллельные команды, +capacity' },
    { id:'scout',    branch:'B', tier:1, name:'Скаутинг',         cost:100, ico:'🔍', un:'Пул офферов вместо одного заказа' },
    { id:'nego',     branch:'B', tier:2, name:'Переговоры',       cost:200, ico:'💬', un:'КП/условия-вилки + Переговорщик' },
    { id:'market',   branch:'B', tier:3, name:'Живой рынок',      cost:350, ico:'📈', un:'Конкуренты/рейтинг/тикер' },
    { id:'shares',   branch:'B', tier:4, name:'Доли/акции',       cost:450, ico:'📊', un:'Инвест-слой' },
    { id:'mna',      branch:'B', tier:5, name:'Поглощения M&A',   cost:650, ico:'🤝', un:'Ветвистый процесс поглощений' },
    { id:'ai',       branch:'C', tier:2, name:'Нейросеть',        cost:250, ico:'🧠', un:'AI-ассистент/чат' },
    { id:'season',   branch:'C', tier:3, name:'Сезоны',           cost:400, ico:'🌦', un:'Тематические кварталы (Ф.6)' },
    { id:'director', branch:'C', tier:4, name:'Директор давления',cost:550, ico:'🌡', un:'Динамическая сложность (Р.4)' },
  ];
  const BY_ID = {};
  MODULE_UNLOCKS.forEach(m => { BY_ID[m.id] = m; });

  // «Первые разы» (§15.1) — единоразовые бонусы за всю мету, не за ран.
  // Ключи win_<difficulty> добавляются динамически (первая победа на сложности).
  // Числа — balance-pass v3.93 (sim-unlocks-pacing.js): медиана 13/13 за ~20
  // ранов, ранний доход ~100 ✦, поздний ~300+ ✦ (коридоры §15.2).
  const FIRSTS = [
    { key:'deliver', exp:60,  name:'Первая сдача проекта',   ico:'🏁' },
    { key:'t2',      exp:50,  name:'Первый T2-проект',       ico:'🥈' },
    { key:'t3',      exp:80,  name:'Первый T3-проект',       ico:'🥇' },
    { key:'hire',    exp:40,  name:'Первый найм',            ico:'👥' },
    { key:'market',  exp:60,  name:'Первый выход на рынок',  ico:'📈' },
    { key:'mna',     exp:100, name:'Первое поглощение',      ico:'🤝' },
  ];
  const FIRST_WIN_EXP = 150;   // первая победа на каждой сложности
  const STAGE_EXP     = 50;    // × стадия компании (0..5) — главный «поздний» доход
  const BASE_WIN      = 150;
  const BASE_LOSS     = 40;
  // §Ф.7 — «Вступительный ран» (заскриптованное поражение). Голый тир-0 нельзя
  // выиграть: без команды/инструментов студию не удержать. Чтобы это не тянулось
  // (и не «уходило в плюс по чуть-чуть»), ран, застрявший на стадии 0 (Гараж),
  // принудительно завершается поражением к INTRO_DEADLINE месяцу — как вступительная
  // миссия / очень сильный «босс» в начале. Оформляется ободряюще (это начало пути).
  const INTRO_DEADLINE = 14;   // мес. — потолок голого рана (тюнинг §15.6)
  // §Ф.7 — «операционная перегрузка» голого рана: чтобы бюджет не полз в плюс
  // по чуть-чуть, каждый месяц голого тир-0 списывается растущая сумма (нет
  // команды → фаундер не тянет объём: срывы, штрафы, простой). Ран закономерно
  // уходит в минус к ~10–13 месяцу (банкротство движка), а таймер INTRO_DEADLINE
  // остаётся страховкой. Ручка §15.6.
  const INTRO_STRAIN = 5000;   // ₽/мес × номер месяца (линейный рост)

  function _lsGet(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function _lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  // Режим включён? (читаем localStorage живьём — тумблер работает без перезагрузки)
  function isActive() {
    const arr = _lsGet(LS_MODE) || [];
    return Array.isArray(arr) && arr.includes(MODE_ID);
  }

  function _state() {
    const s = _lsGet(LS_STATE) || {};
    return {
      opened: Array.isArray(s.opened) ? s.opened : [],
      exp:    (typeof s.exp === 'number' && isFinite(s.exp)) ? s.exp : 0,
      firsts: (s.firsts && typeof s.firsts === 'object') ? s.firsts : {},
      runs:   (typeof s.runs === 'number') ? s.runs : 0,
    };
  }
  function getOpened() { return _state().opened.slice(); }
  function getExp()    { return _state().exp; }
  function getRuns()   { return _state().runs; }

  // ГЛАВНЫЙ ГЕЙТ: вне режима — true (ничего не гейтим). В режиме — по открытым.
  function isModuleUnlocked(id) {
    if (!isActive()) return true;
    if (!BY_ID[id])  return true;          // неизвестный модуль — не гейтим
    return _state().opened.includes(id);
  }

  // Мягкий пререквизит (§11.3): узел доступен для открытия, если открыт
  // любой узел предыдущего тира (любая ветка); тир 1 — от тир-0 корня.
  function available(id) {
    const m = BY_ID[id]; if (!m) return false;
    if (isModuleUnlocked(id)) return false;
    if (m.tier <= 1) return true;
    const opened = _state().opened;
    return MODULE_UNLOCKS.some(x => x.tier === m.tier - 1 && opened.includes(x.id));
  }

  // Сырое открытие БЕЗ траты (dev/тесты/миграции). Экран использует buy().
  function unlock(id) {
    if (!BY_ID[id]) return false;
    const s = _state();
    if (!s.opened.includes(id)) { s.opened.push(id); _lsSet(LS_STATE, s); _emit('unlocks_changed', { id, via:'unlock' }); }
    return true;
  }

  // ПОКУПКА узла за экспертизу (§15.0 шаг 4). Возврат {ok, reason?}.
  function buy(id) {
    const m = BY_ID[id];
    if (!m)                       return { ok:false, reason:'unknown' };
    const s = _state();
    if (s.opened.includes(id))    return { ok:false, reason:'opened' };
    if (!available(id))           return { ok:false, reason:'locked' };
    if (s.exp < m.cost)           return { ok:false, reason:'exp' };
    s.exp -= m.cost;
    s.opened.push(id);
    _lsSet(LS_STATE, s);
    _emit('unlocks_changed', { id, via:'buy', exp: s.exp });
    return { ok:true, exp: s.exp };
  }

  function reset() { _lsSet(LS_STATE, { opened: [], exp: 0, firsts: {}, runs: 0 }); _emit('unlocks_changed', { via:'reset' }); }

  function list() {
    return MODULE_UNLOCKS.map(m => ({
      ...m,
      open:  _state().opened.includes(m.id),
      avail: available(m.id),
    }));
  }

  // ── §15.1: трекинг «первых разов» ВНУТРИ рана (сигналы движка) ────────
  // Флаги копятся в _run, платятся в awardAtRunEnd и помечаются в мете.
  let _run = {};
  function _noteFirst(key) {
    if (!isActive()) return;
    const s = _state();
    if (s.firsts[key]) return;   // уже оплачен за мету
    _run[key] = true;
  }

  function _emit(ev, payload) {
    try { if (typeof EventBus !== 'undefined' && EventBus.emit) EventBus.emit(ev, payload || {}); } catch (e) {}
  }

  if (typeof EventBus !== 'undefined' && EventBus.on) {
    EventBus.on('staff_hired',       ()      => _noteFirst('hire'));
    EventBus.on('project_delivered', (p)     => {
      _noteFirst('deliver');
      const t = (p && p.tier) || 1;
      if (t >= 2) _noteFirst('t2');
      if (t >= 3) _noteFirst('t3');
    });
    EventBus.on('assets_changed',    (p)     => { if (p && p.type === 'acquisition') _noteFirst('mna'); });
    // «Выход на рынок»: первый месячный тик живого рынка при ОТКРЫТОМ модуле market
    EventBus.on('market_ticked',     ()      => { if (isActive() && _state().opened.includes('market')) _noteFirst('market'); });
  }

  function _difficulty() {
    try { return localStorage.getItem('bt_difficulty_v1') || 'normal'; } catch (e) { return 'normal'; }
  }

  // ── §15.1: начисление экспертизы по итогам рана ───────────────────────
  // Дёргает DLC-координатор на end_game. Возвращает сводку для нотификаций.
  function awardAtRunEnd(won, g) {
    if (!isActive()) return null;
    g = g || {};
    const s = _state();

    const stage      = (g.living && typeof g.living.stage === 'number') ? g.living.stage : 0;
    const base       = won ? BASE_WIN : BASE_LOSS;
    const stageBonus = Math.max(0, Math.min(5, stage)) * STAGE_EXP;

    // «Первые разы» из текущего рана (ещё не оплаченные в мете)
    const paidFirsts = [];
    FIRSTS.forEach(f => {
      if (_run[f.key] && !s.firsts[f.key]) {
        s.firsts[f.key] = true;
        paidFirsts.push({ ...f });
      }
    });
    // Первая победа на текущей сложности
    if (won) {
      const wk = 'win_' + _difficulty();
      if (!s.firsts[wk]) {
        s.firsts[wk] = true;
        paidFirsts.push({ key: wk, exp: FIRST_WIN_EXP, name: 'Первая победа (' + _difficulty() + ')', ico: '🏆' });
      }
    }

    const firstsExp = paidFirsts.reduce((t, f) => t + f.exp, 0);
    const award     = base + stageBonus + firstsExp;

    s.exp  += award;
    s.runs += 1;
    _lsSet(LS_STATE, s);
    _run = {};   // ран закрыт — сброс внутрирановых флагов

    const summary = { won: !!won, base, stageBonus, stage, firsts: paidFirsts, firstsExp, award, exp: s.exp, runs: s.runs };
    _emit('unlocks_award', summary);
    return summary;
  }

  // ── §Ф.7: «голый» вступительный ран ──────────────────────────────────
  // Голый ран = режим активен, найм команды ещё не открыт (тир-0) и компания
  // застряла на стадии 0 (Гараж). Такой ран нельзя вывести — это вступительная
  // «миссия». Признак единый для утечки бюджета, скриптового потолка и фрейминга.
  function isBareIntro(g) {
    if (!isActive() || !g) return false;
    if (isModuleUnlocked('hire')) return false;              // найм открыт → это уже «настоящая» попытка
    const stage = (g.living && typeof g.living.stage === 'number') ? g.living.stage : 0;
    return stage <= 0;
  }

  // Операционная перегрузка голого рана: растущее ежемесячное списание,
  // чтобы бюджет закономерно уходил в минус (а не полз в плюс). Чистая функция.
  function introBleed(g) {
    if (!isBareIntro(g)) return 0;
    const month = Math.max(1, (g.month || 0));
    return INTRO_STRAIN * month;                             // линейный рост нагрузки
  }

  // Заскриптованный потолок (страховка): голый ран, доживший до INTRO_DEADLINE,
  // принудительно проигрывается — чтобы поражение не тянулось, если утечки не хватило.
  function scriptedIntroDue(g) {
    if (!g || g._endGameFired || g._scriptedIntroFired) return false;
    return isBareIntro(g) && (g.month || 0) >= INTRO_DEADLINE;
  }

  // Обёртка advanceMonth: после месяца проверяем дедлайн голого рана.
  // unlocks.js грузится после engine.js → advanceMonth уже определён.
  if (typeof window.advanceMonth === 'function' && !window.advanceMonth.__unlWrapped) {
    const _origAdvance = window.advanceMonth;
    window.advanceMonth = function () {
      const r = _origAdvance.apply(this, arguments);
      try {
        if (typeof G !== 'undefined' && G && scriptedIntroDue(G)) {
          G._scriptedIntroFired = true;
          G._scriptedIntro = true;                          // флаг для фрейминга экрана
          if (typeof G._endGameFired !== 'undefined') G._endGameFired = true;
          setTimeout(() => {
            try { if (typeof EventBus !== 'undefined' && EventBus.emit) EventBus.emit('end_game', { won: false, scriptedIntro: true }); } catch (e) {}
          }, 300);
        }
      } catch (e) {}
      return r;
    };
    window.advanceMonth.__unlWrapped = true;
  }

  window.Unlocks = {
    MODE_ID, MODULE_UNLOCKS, FIRSTS,
    TUNING: { BASE_WIN, BASE_LOSS, STAGE_EXP, FIRST_WIN_EXP, INTRO_DEADLINE, INTRO_STRAIN },   // ручки §15.6 (для тестов/сима)
    isActive, isModuleUnlocked, available,
    unlock, buy, getOpened, getExp, getRuns, reset, list,
    awardAtRunEnd, scriptedIntroDue, isBareIntro, introBleed,
    _noteFirst,   // для тестов/отладки
  };
  // Глобальный шорткат — на него навешивают гейты системы (staff/projects/…):
  //   if (!isModuleUnlocked('hire')) { …заблокировать… }
  window.isModuleUnlocked = isModuleUnlocked;

  try {
    console.log('[unlocks] Ф.7 v2 (экспертиза) загружена. Режим активен: ' + isActive() +
      (isActive() ? (' · открыто ' + getOpened().length + '/' + MODULE_UNLOCKS.length + ' · ✦ ' + getExp()) : ' (обычная игра — всё доступно)'));
  } catch (e) {}
})();
