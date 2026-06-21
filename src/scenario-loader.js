// ══════════════════════════════════════════════════════
//  SCENARIO LOADER (v3.2)
//  Сценарий = ЧИСТЫЕ ДАННЫЕ (JSON-совместимый объект в
//  scenarios/<id>.data.js, присваивание window.SCENARIO_DATA).
//  Никакого кода в сценариях: события описаны декларативными
//  эффектами, этот модуль «гидрирует» их в функции.
//
//  Godot-портируемость: те же данные читаются как JSON,
//  интерпретатор эффектов переписывается 1-в-1 на GDScript.
//
//  ── DSL эффектов (массив операций, выполняются по порядку) ──
//  { "money": N }                      — деньги ±N
//  { "rep": N }                        — репутация ±N
//  { "fatigue": N }                    — усталость команды ±N
//  { "nudgeAll": N }                   — лояльность всех клиентов ±N
//  { "nudgeRandom": N }                — лояльность случайного активного клиента ±N
//  { "notify": ["текст","type"] }      — тост (info|success|warning|error)
//  { "log": ["текст","cls"] }          — запись в игровой лог
//  { "rd": ["текст","type"] }          — запись в журнал решений
//  { "client": { "sel":"biggest|last", "op":"budgetMulPct|rating|remove|collect", "val":N } }
//  { "staff":  { "sel":"last|strongest", "op":"raise|remove", "val":N } }
//  { "roll":   { "chance":0..1, "roleBonus":{"role":"lawyer","add":0.15},
//                "success":[ops], "fail":[ops] } }
//  { "ifRole": { "role":"developer", "then":[ops], "else":[ops] } }
//  { "scoutInject": { ...дефиниция проекта... } }
//  { "schedule": { "inMonths":2, "label":"...", "money":-40000, "icon":"💳" } } — отложенный эффект (календарь)
//  { "gAdd":   { "perkPayoutMult":0.05, "caseQBonus":5 } } — прибавить к G[ключ] (для перков/бонусов Run Map)
//  { "gSet":   { "perkPenaltyShield":true } }              — присвоить G[ключ] (для bool-флагов)
//  { "overheadBump": -0.10 } — runeOverheadBump += round(базовый overhead × коэффициент); отрицательное = экономия
//
//  ── СЛОЖНОСТЬ (v3.9) ──
//  Пресеты в DEFAULT_DIFFICULTIES, выбор пользователя в localStorage
//  под ключом LS_DIFFICULTY_KEY. Mods применяются к settings ДО того,
//  как engine.js биндит let-константы (overhead/startMoney и т.п.).
//  Каждый сценарий может переопределить пресеты через data.difficulties.
// ══════════════════════════════════════════════════════

const LS_DIFFICULTY_KEY = 'bt_difficulty_v1';

// Базовые пресеты — одинаковы для всех сценариев, переопределяется data.difficulties.
const DEFAULT_DIFFICULTIES = {
  easy: {
    label: '🌱 Лёгкая',
    desc: 'Старт больше, расходы меньше, цель ближе',
    perks: ['Старт +40%', 'Overhead −25%', 'Цель −30%', '+10 репутации'],
    mods: {
      startMoneyMul:      1.4,
      overheadMul:        0.75,
      winConditionMul:    0.7,
      startReputationAdd: 10,
    },
  },
  normal: {
    label: '🎯 Нормальная',
    desc: 'Базовый баланс — рекомендуется для первого захода',
    perks: ['Эталонная экономика'],
    mods: {},
  },
  hard: {
    label: '🔥 Сложная',
    desc: 'Меньше денег, выше расходы, цель дальше',
    perks: ['Старт −20%', 'Overhead +35%', 'Цель +20%', '−10 репутации'],
    mods: {
      startMoneyMul:      0.8,
      overheadMul:        1.35,
      winConditionMul:    1.2,
      startReputationAdd: -10,
    },
  },
  nightmare: {
    label: '💀 Кошмар',
    desc: 'Минимум денег, агрессивный overhead, далёкая цель',
    perks: ['Старт −45%', 'Overhead +70%', 'Цель +40%', '−20 репутации'],
    mods: {
      startMoneyMul:      0.55,
      overheadMul:        1.7,
      winConditionMul:    1.4,
      startReputationAdd: -20,
    },
  },
};

const DIFFICULTY_ORDER = ['easy', 'normal', 'hard', 'nightmare'];

const ScenarioLoader = (() => {
  'use strict';

  // ── Селекторы ─────────────────────────────────────────
  function _pickClient(g, sel) {
    const list = (g.activeClients || []);
    if (!list.length) return null;
    if (sel === 'last') return list[list.length - 1];
    return [...list].sort((a, b) => (b._totalBudget || 0) - (a._totalBudget || 0))[0]; // biggest
  }

  function _pickStaff(g, sel) {
    const list = (g.staff || []).filter(s => s.status !== 'fired');
    if (!list.length) return null;
    if (sel === 'last') return list[list.length - 1];
    return [...list].sort((a, b) => calcStaffWorkUnit(b) - calcStaffWorkUnit(a))[0]; // strongest
  }

  // ── Интерпретатор операций ────────────────────────────
  function applyOps(ops, g) {
    (ops || []).forEach(op => {
      try { _applyOp(op, g); }
      catch (e) { console.warn('ScenarioLoader: эффект упал', op, e); }
    });
  }

  function _applyOp(op, g) {
    if (op.money != null)   { g.money += op.money; }
    if (op.rep != null)     { g.reputation = clamp(g.reputation + op.rep, 0, 100); }
    if (op.fatigue != null) { g.teamFatigue = clamp((g.teamFatigue || 0) + op.fatigue, 0, 100); }
    if (op.nudgeAll != null)   { nudgeAllNPS(g, op.nudgeAll); }
    if (op.nudgeRandom != null){ const _nr = (g.activeClients||[]).filter(c=>!c.oneTime); if (_nr.length>0) nudgeClientRating(_nr[Math.floor(Math.random()*_nr.length)], op.nudgeRandom, g); }
    if (op.notify)          { notify(op.notify[0], op.notify[1] || 'info'); }
    if (op.log)             { addLog(op.log[0], op.log[1] || ''); }
    if (op.rd)              { rd(op.rd[0], op.rd[1] || 'event'); }

    if (op.client) {
      const c = _pickClient(g, op.client.sel);
      if (!c) return;
      const v = op.client.val || 0;
      switch (op.client.op) {
        case 'budgetMulPct': {
          const delta = Math.round((c._totalBudget || 0) * v / 100);
          c._totalBudget = Math.max(0, (c._totalBudget || 0) + delta);
          addLog(`${v > 0 ? '📈' : '✂️'} «${c.name}»: доход сделки ${v > 0 ? '+' : ''}${fmtK(delta)}`, v > 0 ? 'green' : 'amber');
          break;
        }
        case 'rating': nudgeClientRating(c, v, g); break;
        case 'remove': {
          if (typeof releaseProjectTeam === 'function') releaseProjectTeam(c.id); // Б.9
          g.activeClients = g.activeClients.filter(x => x.id !== c.id);
          delete g.clientNPS[c.id];
          addLog(`💔 «${c.name}» — контракт потерян`, 'red');
          break;
        }
        case 'collect': {
          const sum = c._totalBudget || 0;
          g.money += sum;
          if (typeof releaseProjectTeam === 'function') releaseProjectTeam(c.id); // Б.9
          g.activeClients = g.activeClients.filter(x => x.id !== c.id);
          delete g.clientNPS[c.id];
          addLog(`💪 «${c.name}»: взыскано полностью +${fmtK(sum)}`, 'green');
          break;
        }
      }
    }

    if (op.staff) {
      const s = _pickStaff(g, op.staff.sel);
      if (!s) return;
      switch (op.staff.op) {
        case 'raise':
          s.cost = (s.cost || 0) + (op.staff.val || 0);
          if (s.salary != null) s.salary = s.cost;
          addLog(`💰 ${s.name}: зарплата повышена до ${fmt(s.cost)}/мес`, 'amber');
          break;
        case 'remove':
          g.staff = g.staff.filter(x => x !== s);
          addLog(`🚪 ${s.name} покинул команду`, 'red');
          break;
      }
    }

    if (op.roll) {
      let chance = op.roll.chance ?? 0.5;
      const rb = op.roll.roleBonus;
      if (rb && hasRole(rb.role)) chance = Math.min(0.95, chance + (rb.add || 0));
      applyOps(Math.random() < chance ? op.roll.success : op.roll.fail, g);
    }

    if (op.ifRole) {
      applyOps(hasRole(op.ifRole.role) ? op.ifRole.then : op.ifRole.else, g);
    }

    if (op.schedule) {
      if (typeof scheduleCalendarEvent === 'function') scheduleCalendarEvent(op.schedule);
    }

    if (op.scoutInject) {
      g.scoutPool = g.scoutPool || [];
      g.scoutPool.push(JSON.parse(JSON.stringify(op.scoutInject)));
      addLog(`🔥 В пуле заявок появился «${op.scoutInject.name}»`, 'teal');
    }

    // ── Универсальные G-каналы (для перков, рунных эффектов, бонусов Run Map) ──
    // gAdd: складывает дельты с округлением до 2 знаков (валюты — целые).
    if (op.gAdd && typeof op.gAdd === 'object') {
      Object.keys(op.gAdd).forEach(k => {
        const delta = Number(op.gAdd[k]) || 0;
        if (!delta) return;
        const cur = Number(g[k]) || 0;
        const next = cur + delta;
        // Простое округление, чтобы не плодить плавающую точку
        g[k] = (k === 'money' || k === 'portfolio' || k === 'reputation')
          ? Math.round(next)
          : Math.round(next * 100) / 100;
      });
    }
    // gSet: жёсткое присваивание (булевые флаги вроде perkPenaltyShield)
    if (op.gSet && typeof op.gSet === 'object') {
      Object.keys(op.gSet).forEach(k => { g[k] = op.gSet[k]; });
    }
    // overheadBump: добавка к runeOverheadBump пропорционально базовому overhead.
    // Отрицательное значение → экономия (см. _postAdvance в src/runes.js).
    if (op.overheadBump != null) {
      const pct = Number(op.overheadBump) || 0;
      const base = (typeof SCENARIO !== 'undefined' && SCENARIO && SCENARIO.settings && SCENARIO.settings.overhead) || 0;
      g.runeOverheadBump = (g.runeOverheadBump || 0) + Math.round(base * pct);
    }
  }

  // ── Сложность: чтение выбора и применение модов ──────
  function getDifficultyId() {
    try {
      if (typeof localStorage !== 'undefined') {
        const v = localStorage.getItem(LS_DIFFICULTY_KEY);
        if (v && DIFFICULTY_ORDER.includes(v)) return v;
      }
    } catch (e) { /* SSR/sandbox без localStorage — фолбэк ниже */ }
    return 'normal';
  }

  function resolveDifficulties(sc) {
    // Слияние: пресеты по умолчанию + переопределения сценария
    const merged = JSON.parse(JSON.stringify(DEFAULT_DIFFICULTIES));
    const own = sc.difficulties || {};
    Object.keys(own).forEach(k => {
      merged[k] = Object.assign({}, merged[k] || {}, own[k]);
      if (own[k] && own[k].mods) merged[k].mods = Object.assign({}, (merged[k] && merged[k].mods) || {}, own[k].mods);
    });
    return merged;
  }

  function _fmtRubText(n) {
    // 7500000 → "7 500 000 ₽" (как форматирует ru-RU); неразрывный пробел
    return Math.round(n).toLocaleString('ru-RU') + ' ₽';
  }

  function applyDifficulty(sc, id) {
    const all = resolveDifficulties(sc);
    const cfg = all[id] || all.normal;
    const m = cfg.mods || {};
    const s = sc.settings;
    const oldWin = s.winCondition;
    // Снимок базовых настроек (один раз) — множители сложности всегда
    // считаются ОТ базы, а не от уже изменённого значения. Иначе повторные
    // вызовы applyDifficulty компаундят (1M→550k→302k→…→~50k) — баланс ломался.
    if (!sc._baseSettings) {
      sc._baseSettings = {
        startMoney:     s.startMoney,
        overhead:       s.overhead,
        winCondition:   s.winCondition,
        startReputation: s.startReputation ?? 60,
      };
    }
    const base = sc._baseSettings;
    // Всегда переустанавливаем от базы (сброс при смене сложности на «normal» и т.п.)
    s.startMoney      = (m.startMoneyMul   != null) ? Math.round(base.startMoney   * m.startMoneyMul)   : base.startMoney;
    s.overhead        = (m.overheadMul     != null) ? Math.round(base.overhead     * m.overheadMul)     : base.overhead;
    s.winCondition    = (m.winConditionMul != null) ? Math.round(base.winCondition * m.winConditionMul) : base.winCondition;
    s.startReputation = (m.startReputationAdd != null) ? Math.max(0, Math.min(100, base.startReputation + m.startReputationAdd)) : base.startReputation;
    // Синхронизируем число цели в introText, если сложность сдвинула winCondition
    if (s.introText && s.winCondition !== oldWin) {
      const oldStr = _fmtRubText(oldWin);
      const newStr = _fmtRubText(s.winCondition);
      // Учитываем варианты: с пробелом (7 500 000 ₽), с неразрывным ( ), без пробела перед ₽
      const variants = [oldStr, oldStr.replace(/ /g, ' '), oldStr.replace(' ₽', '₽')];
      variants.forEach(v => {
        if (s.introText.includes(v)) s.introText = s.introText.split(v).join(newStr);
      });
    }
    sc._activeDifficulty = { id, label: cfg.label, perks: cfg.perks || [], desc: cfg.desc || '' };
    sc._difficulties = all;
    return sc;
  }

  // ── Гидрация: данные → рабочий SCENARIO ───────────────
  function hydrate(data) {
    const errs = [];
    if (!data || typeof data !== 'object') errs.push('SCENARIO_DATA отсутствует');
    else {
      ['id', 'name', 'settings', 'specs', 'staff', 'projects', 'upgrades'].forEach(k => {
        if (!data[k]) errs.push(`нет обязательного поля «${k}»`);
      });
    }
    if (errs.length) {
      console.error('ScenarioLoader: сценарий не прошёл валидацию —', errs.join('; '));
      throw new Error('Scenario validation failed: ' + errs.join('; '));
    }

    const sc = data; // мутируем на месте: SE/движок работают с этим же объектом

    // События: choices[].effects (данные) → choices[].fn (код)
    (sc.events || []).forEach(ev => {
      (ev.choices || []).forEach(ch => {
        if (typeof ch.fn === 'function') return;        // legacy-совместимость
        const effects = ch.effects || [];
        ch.fn = g => applyOps(effects, g);
      });
    });

    // Сложность — последним шагом, чтобы движок при инициализации увидел
    // уже применённые startMoney/overhead/winCondition/startReputation
    applyDifficulty(sc, getDifficultyId());

    return sc;
  }

  return { hydrate, applyOps, applyDifficulty, getDifficultyId, resolveDifficulties, DIFFICULTY_ORDER };
})();

// Глобальный SCENARIO собирается из данных (data-файл загружен строкой выше)
var SCENARIO = ScenarioLoader.hydrate(
  typeof SCENARIO_DATA !== 'undefined' ? SCENARIO_DATA : undefined
);
