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
// ══════════════════════════════════════════════════════

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
    if (op.nudgeAll != null){ nudgeAllNPS(g, op.nudgeAll); }
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
          g.activeClients = g.activeClients.filter(x => x.id !== c.id);
          delete g.clientNPS[c.id];
          addLog(`💔 «${c.name}» — контракт потерян`, 'red');
          break;
        }
        case 'collect': {
          const sum = c._totalBudget || 0;
          g.money += sum;
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

    return sc;
  }

  return { hydrate, applyOps };
})();

// Глобальный SCENARIO собирается из данных (data-файл загружен строкой выше)
var SCENARIO = ScenarioLoader.hydrate(
  typeof SCENARIO_DATA !== 'undefined' ? SCENARIO_DATA : undefined
);
