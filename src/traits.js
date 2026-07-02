// ══════════════════════════════════════════════════════
//  Ф.7 — TraitEngine: движок-интерпретатор трейтов/синергий (§14)
//
//  Слой 2 из трёх (§14.1): данные (src/traits-data.js) → ЭТОТ ДВИЖОК →
//  тонкие хук-вызовы в системах (§14.2). Никакой логики конкретного
//  трейта в коде — только интерпретация каталога.
//
//  Контракт расширяемости (§14.0):
//   • новый трейт/синергия = запись в данные (STAFF_TRAITS/TEAM_SYNERGIES)
//   • новый предикат = Predicates.register('name', (ctx,arg)=>bool)
//   • новый эффект   = Effects.register('name', {home, calc|apply})
//   • новый хук      = TraitEngine.eval/mods в нужном расчёте (редко)
//
//  Активность (§14.8): слой работает ТОЛЬКО при активном режиме «Rogue-lite»
//  (Unlocks.isActive()); вне режима mods() нейтрален, событийные хуки молчат —
//  обычная игра и «Прокачка» не меняются. Пустой каталог = no-op.
//
//  Трейты живут на спецах: staff.rlTraits = ['id', …] (выдача в скауте —
//  шаг 5, §13.6; до этого назначаются вручную/тестами). Синергии считаются
//  от состава штата (scope:'staff') или команды проекта (scope:'project') —
//  им rlTraits не нужны.
//
//  DOM-free (Godot-portability): чистые функции + EventBus. UI отдельно
//  (экран «Билд команды» — шаг 4) читает activeSynergies()/describe().
//
//  Числовые хуки (движок системы спрашивает дельту):
//    mods(hook, ctx) → { add, mult }   // hook: calcQuality|calcSpeed|calcPayout|calcUpkeep|calcRisk
//  Событийные хуки (движок применяет эффекты сам):
//    fire(hook, ctx)                    // onDeliver|onHire|onMonth|onAssign|scoutCandidate|filterOffers
//  ctx: { G, staff, project, team, candidate, offers, … } (§14.2)
// ══════════════════════════════════════════════════════

(function () {
  'use strict';
  if (typeof window !== 'undefined' && window.__TRAITS_LOADED) return;
  const W = (typeof window !== 'undefined') ? window : globalThis;
  W.__TRAITS_LOADED = true;

  // ── Активность слоя ──────────────────────────────────────────────────
  function _active() {
    try { return !!(W.Unlocks && W.Unlocks.isActive()); } catch (e) { return false; }
  }

  // ── Каталог (данные грузятся из traits-data.js или register-API) ────
  const _traits    = [];   // §14.5
  const _synergies = [];   // §14.6
  const _byId      = {};

  function registerTrait(t)   { if (t && t.id && !_byId['t:' + t.id]) { _traits.push(t);    _byId['t:' + t.id] = t; } }
  function registerSynergy(s) { if (s && s.id && !_byId['s:' + s.id]) { _synergies.push(s); _byId['s:' + s.id] = s; } }
  function load(traitsArr, synArr) {
    (traitsArr || []).forEach(registerTrait);
    (synArr    || []).forEach(registerSynergy);
  }
  function catalog() { return { traits: _traits.slice(), synergies: _synergies.slice() }; }

  // ── Вспомогательное: состав/команда ─────────────────────────────────
  function _g(ctx)     { return (ctx && ctx.G) || (typeof G !== 'undefined' ? G : {}); }
  function _staffAll(ctx) { return (_g(ctx).staff || []).filter(s => s.status !== 'fired'); }
  function _team(ctx) {
    if (ctx && ctx.team) return ctx.team;
    const c = ctx && ctx.project;
    if (!c) return [];
    const ids = c._assignedStaff || [];
    return _staffAll(ctx).filter(s => ids.includes(s._iid || s.id));
  }
  function _sid(s) { return s ? (s._iid || s.id) : null; }

  // ── Словарь ПРЕДИКАТОВ (§14.3): имя → (ctx, arg) => bool ────────────
  const Predicates = {
    _m: {},
    register(name, fn) { this._m[name] = fn; },
    check(when, ctx) {   // when: [{name:arg}, …] — AND
      if (!when || !when.length) return true;
      return when.every(cond => Object.keys(cond).every(k => {
        const fn = this._m[k];
        if (!fn) { try { console.warn('[traits] неизвестный предикат: ' + k); } catch (e) {} return false; }
        try { return !!fn(ctx, cond[k]); } catch (e) { return false; }
      }));
    },
  };

  Predicates.register('role',  (ctx, arg) => ctx.staff && ctx.staff.role === arg);
  Predicates.register('grade', (ctx, arg) => ctx.staff && ctx.staff.grade === arg);
  Predicates.register('projectTier', (ctx, arg) => {
    const t = (ctx.project && (ctx.project.tier || 1)) || 0;
    if (!ctx.project) return false;
    if (arg.min != null && t < arg.min) return false;
    if (arg.max != null && t > arg.max) return false;
    return true;
  });
  Predicates.register('projectType', (ctx, arg) => ctx.project && ctx.project.type === arg);
  Predicates.register('soloOnProject', (ctx) => {
    if (!ctx.project || !ctx.staff) return false;
    const team = _team(ctx);
    return team.length === 1 && _sid(team[0]) === _sid(ctx.staff);
  });
  Predicates.register('countRoleOnProject', (ctx, arg) =>
    _team(ctx).filter(s => s.role === arg.role && (!arg.excludeSelf || _sid(s) !== _sid(ctx.staff))).length >= (arg.min || 1));
  Predicates.register('countRoleInStaff', (ctx, arg) =>
    _staffAll(ctx).filter(s => s.role === arg.role).length >= (arg.min || 1));
  Predicates.register('countGradeInStaff', (ctx, arg) =>
    _staffAll(ctx).filter(s => s.grade === arg.grade).length >= (arg.min || 1));
  Predicates.register('countGradeOnProject', (ctx, arg) =>
    _team(ctx).filter(s => s.grade === arg.grade && (!arg.excludeSelf || _sid(s) !== _sid(ctx.staff))).length >= (arg.min || 1));
  Predicates.register('distinctRolesOnProject', (ctx, arg) =>
    new Set(_team(ctx).map(s => s.role)).size >= (arg.min || 2));
  Predicates.register('teamSize', (ctx, arg) => {
    const n = _staffAll(ctx).length;
    if (arg.min != null && n < arg.min) return false;
    if (arg.max != null && n > arg.max) return false;
    return true;
  });
  Predicates.register('teamMood', (ctx, arg) => {
    const all = _staffAll(ctx); if (!all.length) return false;
    const avg = all.reduce((t, s) => t + (s.mood != null ? s.mood : 70), 0) / all.length;
    return avg >= (arg.min || 0);
  });
  Predicates.register('monthsOnProject', (ctx, arg) =>
    ctx.project && (ctx.project._monthsSigned || 0) >= (arg.min || 1));
  Predicates.register('overdue', (ctx) =>
    ctx.project && (ctx.project._monthsSigned || 0) > (ctx.project._duration || 99));
  Predicates.register('companyStage', (ctx, arg) => {
    const st = (_g(ctx).living && _g(ctx).living.stage) || 0;
    return st >= (arg.min || 0);
  });
  Predicates.register('teamHasGrade', (ctx, arg) => _team(ctx).some(s => s.grade === arg));
  Predicates.register('moduleOpen', (ctx, arg) => {
    try { return typeof isModuleUnlocked === 'function' ? isModuleUnlocked(arg) : true; } catch (e) { return true; }
  });

  // ── Словарь ЭФФЕКТОВ (§14.4): имя → { home, calc | apply } ──────────
  //  calc-глаголы возвращают дельту {add, mult} для числовых хуков;
  //  apply-глаголы мутируют мир на событийных хуках (target-резолвинг).
  //  home — «родной» хук глагола (для плоских записей синергий §14.6).
  const Effects = {
    _m: {},
    register(name, def) { this._m[name] = def; },
    get(name) { return this._m[name]; },
  };

  // числовые (calc)
  Effects.register('qAdd',       { home:'calcQuality', calc: v => ({ add: v }) });
  Effects.register('qMult',      { home:'calcQuality', calc: v => ({ mult: v }) });
  Effects.register('speedAdd',   { home:'calcSpeed',   calc: v => ({ add: v }) });
  Effects.register('speedMult',  { home:'calcSpeed',   calc: v => ({ mult: v }) });
  Effects.register('payoutAdd',  { home:'calcPayout',  calc: v => ({ add: v }) });
  Effects.register('payoutMult', { home:'calcPayout',  calc: v => ({ mult: v }) });
  Effects.register('upkeepAdd',  { home:'calcUpkeep',  calc: v => ({ add: v }) });
  Effects.register('upkeepMult', { home:'calcUpkeep',  calc: v => ({ mult: v }) });
  Effects.register('riskAdd',    { home:'calcRisk',    calc: v => ({ add: v }) });
  Effects.register('riskMult',   { home:'calcRisk',    calc: v => ({ mult: v }) });

  // target-резолвинг для событийных глаголов:
  //   'self' | 'team' | 'staff_all' | 'role:<id>' | 'grade:<id>' (на команде проекта)
  function _targets(ctx, target) {
    if (!target || target === 'self') return ctx.staff ? [ctx.staff] : [];
    if (target === 'team')      return _team(ctx);
    if (target === 'staff_all') return _staffAll(ctx);
    if (target.indexOf('role:') === 0)  return _team(ctx).filter(s => s.role  === target.slice(5));
    if (target.indexOf('grade:') === 0) return _team(ctx).filter(s => s.grade === target.slice(6));
    return [];
  }

  // событийные (apply)
  Effects.register('moodAdd', { apply: (ctx, v, op) => {
    _targets(ctx, op.target || 'team').forEach(s => { s.mood = Math.max(0, Math.min(100, (s.mood != null ? s.mood : 70) + v)); });
  }});
  Effects.register('fatigueAdd', { apply: (ctx, v) => {
    const g = _g(ctx); g.teamFatigue = Math.max(0, Math.min(100, (g.teamFatigue || 0) + v));
  }});
  Effects.register('statAdd', { apply: (ctx, v, op) => {   // {statAdd:{stat:'qStat', v:1}, target:'grade:junior'}
    const stat = v.stat || 'qStat';
    _targets(ctx, op.target || 'self').forEach(s => { s[stat] = (s[stat] || 0) + (v.v || 1); });
  }});
  Effects.register('money', { apply: (ctx, v) => { const g = _g(ctx); g.money = (g.money || 0) + v; } });
  Effects.register('rep',   { apply: (ctx, v) => { const g = _g(ctx); g.reputation = Math.max(0, Math.min(100, (g.reputation || 50) + v)); } });
  // stateful-скейлер (§14.4): {stackPer:{event:'project_delivered', cap:15}} —
  // движок сам копит счётчик на спеце (staff._rlStacks[traitId]); величина
  // вклада задаётся в do рядом (qAdd и т.п. умножается на счётчик через stackOf)
  Effects.register('stackPer', { apply: () => {} });   // маркер; обрабатывается в _onStackEvent

  // ── Итераторы правил ─────────────────────────────────────────────────
  // Трейт (§14.5): hooks:{ hookName:[ {when, do} … ] }; владелец — спец.
  // Синергия (§14.6, плоская): {scope, when, do:[{verb…, when?, target?}]} —
  // хук берётся из home родного глагола.

  // Проектные хуки — носитель трейта должен быть НА проекте (ось расстановки,
  // §13.4); глобальные (апкип/месяц/найм/скаут) — весь штат.
  const _PROJECT_HOOKS = { calcQuality:1, calcSpeed:1, calcPayout:1, calcRisk:1, onDeliver:1, onAssign:1 };
  function _traitRules(hook, ctx, cb) {
    const pool = _PROJECT_HOOKS[hook] ? _team(ctx) : _staffAll(ctx);
    pool.forEach(s => {
      (s.rlTraits || []).forEach(tid => {
        const t = _byId['t:' + tid]; if (!t || !t.hooks) return;
        const rules = t.hooks[hook]; if (!rules) return;
        const sctx = Object.assign({}, ctx, { staff: s, trait: t });
        rules.forEach(rule => { if (Predicates.check(rule.when, sctx)) cb(rule, sctx, t, s); });
      });
    });
  }

  function _synRules(hook, ctx, cb) {
    _synergies.forEach(sy => {
      const sctx = Object.assign({}, ctx);
      if (sy.scope === 'project' && !sctx.project) return;
      if (!Predicates.check(sy.when, sctx)) return;
      (sy.do || []).forEach(op => {
        const verb = Object.keys(op).find(k => Effects.get(k));
        if (!verb) return;
        const home = (Effects.get(verb).home || _EVENT_HOME[verb] || 'onMonth');
        if ((op.on || home) !== hook) return;
        if (op.when && !Predicates.check(op.when, sctx)) return;
        cb({ do: [op] }, sctx, sy, null);
      });
    });
  }
  const _EVENT_HOME = { moodAdd:'onMonth', fatigueAdd:'onMonth', money:'onDeliver', rep:'onDeliver', statAdd:'onDeliver' };

  // ── Числовые хуки: mods(hook, ctx) → {add, mult} ─────────────────────
  function mods(hook, ctx) {
    const out = { add: 0, mult: 1 };
    if (!_active() || (!_traits.length && !_synergies.length)) return out;
    ctx = ctx || {};
    const applyRule = (rule, sctx, src, owner) => {
      (rule.do || []).forEach(op => {
        const verb = Object.keys(op).find(k => Effects.get(k) && Effects.get(k).calc);
        if (!verb) return;
        if (op.when && !Predicates.check(op.when, sctx)) return;
        let v = op[verb];
        // stackOf: величина умножается на накопленный счётчик скейлера
        if (op.stackOf && owner) v = v * ((owner._rlStacks || {})[op.stackOf] || 0);
        const d = Effects.get(verb).calc(v);
        if (d.add)  out.add  += d.add;
        if (d.mult) out.mult *= (1 + d.mult);
      });
    };
    _traitRules(hook, ctx, applyRule);
    _synRules(hook, ctx, applyRule);
    return out;
  }

  // ── Событийные хуки: fire(hook, ctx) — применяет apply-глаголы ──────
  function fire(hook, ctx) {
    if (!_active() || (!_traits.length && !_synergies.length)) return;
    ctx = ctx || {};
    const applyRule = (rule, sctx) => {
      (rule.do || []).forEach(op => {
        const verb = Object.keys(op).find(k => Effects.get(k) && Effects.get(k).apply);
        if (!verb) return;
        if (op.when && !Predicates.check(op.when, sctx)) return;
        try { Effects.get(verb).apply(sctx, op[verb], op); } catch (e) {}
      });
    };
    _traitRules(hook, ctx, applyRule);
    _synRules(hook, ctx, applyRule);
  }

  // ── Stateful-скейлеры: счётчики по событиям (§14.4 stackPer) ─────────
  function _onStackEvent(eventName, ctx) {
    if (!_active()) return;
    _staffAll(ctx).forEach(s => {
      (s.rlTraits || []).forEach(tid => {
        const t = _byId['t:' + tid]; if (!t || !t.stackPer) return;
        if (t.stackPer.event !== eventName) return;
        // опц. условие: событие касается этого спеца (напр. сдача ЕГО проекта);
        // команда события — ctx.team (слепок из сигнала) или _assignedStaff
        if (t.stackPer.ownProject) {
          const ids = ctx.team ? ctx.team.map(_sid)
                    : (ctx.project && ctx.project._assignedStaff) || [];
          if (!ids.includes(_sid(s))) return;
        }
        s._rlStacks = s._rlStacks || {};
        const cur = s._rlStacks[tid] || 0;
        const cap = t.stackPer.cap != null ? t.stackPer.cap : 99;
        s._rlStacks[tid] = Math.min(cap, cur + 1);
      });
    });
  }

  // ── Активные синергии (для UI «Билд команды», шаг 4) ────────────────
  function activeSynergies(ctx) {
    if (!_active()) return [];
    ctx = ctx || {};
    return _synergies
      .filter(sy => (sy.scope !== 'project' || ctx.project) && Predicates.check(sy.when, ctx))
      .map(sy => ({ id: sy.id, name: sy.name, icon: sy.icon, desc: sy.desc, scope: sy.scope || 'staff' }));
  }

  // ── Подписка на сигналы движка (событийные хуки без врезок) ─────────
  if (typeof EventBus !== 'undefined' && EventBus.on) {
    EventBus.on('project_delivered', (p) => {
      const g = (typeof G !== 'undefined') ? G : {};
      // Команда к моменту сигнала уже распущена (releaseProjectTeam) —
      // сигнал несёт слепок p.team (ids); резолвим в объекты штата.
      const ids  = (p && p.team) || [];
      const team = (g.staff || []).filter(s => ids.includes(s._iid || s.id));
      const ctx  = { G: g, project: p || {}, team };
      _onStackEvent('project_delivered', ctx);
      fire('onDeliver', ctx);
    });
    EventBus.on('staff_hired',    () => { const g = (typeof G !== 'undefined') ? G : {}; _onStackEvent('staff_hired', { G: g }); fire('onHire',  { G: g }); });
    EventBus.on('month_advanced', () => { const g = (typeof G !== 'undefined') ? G : {}; _onStackEvent('month_advanced', { G: g }); fire('onMonth', { G: g }); });
    EventBus.on('stage_reached',  (p) => { const g = (typeof G !== 'undefined') ? G : {}; fire('onStageUp', { G: g, stage: p && p.stage }); });
  }

  W.TraitEngine = { mods, fire, activeSynergies, load, registerTrait, registerSynergy, catalog, isActive: _active,
                    Predicates, Effects, _onStackEvent };

  // Автозагрузка каталога, если данные уже объявлены (traits-data.js грузится раньше)
  try { if (W.STAFF_TRAITS || W.TEAM_SYNERGIES) load(W.STAFF_TRAITS, W.TEAM_SYNERGIES); } catch (e) {}

  try {
    console.log('[traits] TraitEngine загружен: трейтов ' + _traits.length + ', синергий ' + _synergies.length +
      ' · слой активен: ' + _active());
  } catch (e) {}
})();
