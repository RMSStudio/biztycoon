// ══════════════════════════════════════════════════════
//  SCENARIO EDITOR  v2
//  Редактор и менеджер кастомных сценариев.
//  Зависит от: scenarios/agency.js (SCENARIO)
//  Загружается до engine.js — модифицирует SCENARIO in-place
// ══════════════════════════════════════════════════════

const SE = (() => {
  'use strict';

  const LS_SCENARIOS = 'bt_scenarios_v1';
  const LS_ACTIVE    = 'bt_active_scenario_v1';

  // ── Persistence ───────────────────────────────────────
  function _all()     { try { return JSON.parse(localStorage.getItem(LS_SCENARIOS)) || []; } catch { return []; } }
  function _save(arr) { localStorage.setItem(LS_SCENARIOS, JSON.stringify(arr)); }
  function _activeId(){ return localStorage.getItem(LS_ACTIVE) || null; }
  function _setActiveId(id) {
    if (id) localStorage.setItem(LS_ACTIVE, id);
    else    localStorage.removeItem(LS_ACTIVE);
  }

  function getActive() {
    const id = _activeId();
    if (!id) return null;
    return _all().find(s => s.meta.id === id) || null;
  }
  function getAll() { return _all(); }

  function _uid()  { return 'sc_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,6); }
  function _suid() { return 'cs_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,6); }

  // ── Default overrides ─────────────────────────────────
  function _defaultOverrides() {
    return {
      settings: {
        startMoney:      1_000_000,
        overhead:           20_000,
        actionsPerMonth:        10,
        scoutCost:               3,
        hireCost:                2,
        winCondition:    7_500_000,
      },
      staffCostMult:      1.0,
      staffQualityMult:   1.0,
      projectBudgetMult:  1.0,
      projectRevenueMult: 1.0,
      eventChanceMult:    1.0,
      customStaff:        [],   // кастомные роли для сценария
      customProjects:     [],   // кастомные проекты для сценария
      customEvents:       [],   // кастомные события для сценария
    };
  }

  // ── Event/choice defaults ─────────────────────────────
  function _defaultChoice() {
    return { text:'', desc:'', effects:[] };
  }

  function _defaultEvent(preset) {
    const base = {
      id:              _suid(),
      icon:            '⚡',
      title:           '',
      body:            '',
      requiresClients: false,
      chance:          0.15,
      choices:         [_defaultChoice(), _defaultChoice()],
    };
    const P = EVENT_PRESETS[preset] || {};
    return Object.assign(base, P.data || {}, { id: base.id });
  }

  // ── Effect fn builder (вызывается в applyActiveScenario) ─
  function _buildEffectFn(effects) {
    return function(g) {
      (effects || []).forEach(eff => {
        const v = Number(eff.val) || 0;
        switch (eff.type) {
          case 'money_add':
            g.money = (g.money || 0) + v;
            break;
          case 'nps_all':
            Object.keys(g.clientNPS || {}).forEach(id => {
              g.clientNPS[id] = Math.min(100, Math.max(0, (g.clientNPS[id] || 60) + v));
            });
            break;
          case 'reputation':
            g.reputation = Math.min(100, Math.max(0, (g.reputation || 0) + v));
            break;
          case 'fatigue':
            g.teamFatigue = Math.min(100, Math.max(0, (g.teamFatigue || 0) + v));
            break;
          case 'portfolio':
            g.portfolio = Math.max(0, (g.portfolio || 0) + v);
            break;
          case 'random_money':
            if (Math.random() < 0.5) g.money = (g.money || 0) + v;
            break;
          case 'random_nps':
            if (Math.random() < 0.5) {
              Object.keys(g.clientNPS || {}).forEach(id => {
                g.clientNPS[id] = Math.min(100, Math.max(0, (g.clientNPS[id] || 60) + v));
              });
            }
            break;
        }
      });
    };
  }

  function _defaultProject() {
    return {
      id:           _suid(),
      name:         '',
      desc:         '',
      icon:         '📁',
      tier:         1,
      type:         'small',    // small | store | corp | brand
      rarity:       'common',   // common | uncommon | rare | epic
      prob:         0.70,
      npsStart:     78,
      minQ:         0,
      minV:         0,
      oneTime:      false,
      cooldown:     0,
      // Бюджет
      useRangeBudget: true,     // true = берём диапазон тира; false = кастомный
      budgetMin:    100_000,
      budgetMax:    200_000,
      revenue:      0,          // ежемесячный доход
      // Модификатор
      modifier: {
        type:  'none',          // none | nps_passive | nps_start | payment_delay | random_bonus | revenue_growth
        val:   0,
        val2:  0,               // доп. параметр (шанс для random_bonus и т.п.)
      },
      // Предоплата
      prepayment: {
        enabled: false,
        prob:    0.50,          // вероятность получения предоплаты
        pct:     0.30,          // % от бюджета
      },
    };
  }

  function _defaultStaff() {
    return {
      id:         _suid(),
      role:       '',
      grade:      'middle',
      cost:       60_000,
      quality:    5,
      npsBonus:   0,
      speedBonus: 0,
      desc:       '',
    };
  }

  function _createScenario(name) {
    return {
      meta: {
        id:        _uid(),
        name:      name || 'Новый сценарий',
        desc:      '',
        created:   Date.now(),
        gameMode:  'classic',
      },
      overrides: _defaultOverrides(),
    };
  }

  // ── Apply active scenario to SCENARIO object ──────────
  // Вызывается дважды:
  //   1) В inline-скрипте между agency.js и engine.js
  //   2) В initState() при каждом старте игры
  function applyActiveScenario() {
    const active = getActive();
    if (!active || !active.overrides) return;
    const ov = active.overrides;

    if (ov.settings) {
      Object.assign(SCENARIO.settings, ov.settings);
    }

    const scm = ov.staffCostMult ?? 1;
    if (scm !== 1) {
      SCENARIO.staff.forEach(s => {
        if (s._baseCost === undefined) s._baseCost = s.cost;
        s.cost = Math.round(s._baseCost * scm);
      });
    } else {
      SCENARIO.staff.forEach(s => { if (s._baseCost !== undefined) s.cost = s._baseCost; });
    }

    const sqm = ov.staffQualityMult ?? 1;
    if (sqm !== 1) {
      SCENARIO.staff.forEach(s => {
        if (s._baseQuality === undefined) s._baseQuality = s.quality;
        s.quality = Math.round(s._baseQuality * sqm);
      });
    } else {
      SCENARIO.staff.forEach(s => { if (s._baseQuality !== undefined) s.quality = s._baseQuality; });
    }

    const pbm = ov.projectBudgetMult ?? 1;
    if (pbm !== 1) {
      const br = SCENARIO.budgetRanges;
      for (const tier in br) {
        const bk = `_base${tier}`;
        if (!br[bk]) br[bk] = [...br[tier]];
        br[tier] = [Math.round(br[bk][0] * pbm), Math.round(br[bk][1] * pbm)];
      }
      SCENARIO.projects.forEach(p => {
        if (p.fixedBudget) {
          if (!p._baseFixedBudget) p._baseFixedBudget = [...p.fixedBudget];
          p.fixedBudget = p._baseFixedBudget.map(v => Math.round(v * pbm));
        }
      });
    } else {
      const br = SCENARIO.budgetRanges;
      for (const tier in br) { if (br[`_base${tier}`]) br[tier] = [...br[`_base${tier}`]]; }
      SCENARIO.projects.forEach(p => { if (p._baseFixedBudget) p.fixedBudget = [...p._baseFixedBudget]; });
    }

    const prm = ov.projectRevenueMult ?? 1;
    if (prm !== 1) {
      SCENARIO.projects.forEach(p => {
        if (p.revenue) {
          if (p._baseRevenue === undefined) p._baseRevenue = p.revenue;
          p.revenue = Math.round(p._baseRevenue * prm);
        }
      });
    } else {
      SCENARIO.projects.forEach(p => { if (p._baseRevenue !== undefined) p.revenue = p._baseRevenue; });
    }

    const ecm = ov.eventChanceMult ?? 1;
    if (typeof SCENARIO.events !== 'undefined') {
      SCENARIO.events.forEach(ev => {
        if (ev.chance === undefined) return;
        if (ev._baseChance === undefined) ev._baseChance = ev.chance;
        ev.chance = Math.min(1, Math.max(0, ev._baseChance * ecm));
      });
    }

    // Inject custom events — rebuild fn from effects each time
    if (ov.customEvents && ov.customEvents.length > 0 && typeof SCENARIO.events !== 'undefined') {
      ov.customEvents.forEach(ev => {
        SCENARIO.events = SCENARIO.events.filter(e => e.id !== ev.id);
        SCENARIO.events.push({
          ...ev,
          chance: Math.min(1, (ev.chance || 0.15) * ecm),
          choices: (ev.choices || []).map(c => ({
            ...c,
            fn: _buildEffectFn(c.effects),
          })),
        });
      });
    }
  }

  // ── UI State ──────────────────────────────────────────
  let _editingId     = null;
  let _activeSection = 'finance';

  // ── Main render ───────────────────────────────────────
  function render() {
    const el = document.getElementById('screen-scenario-editor');
    if (!el) return;
    el.innerHTML = _buildShell();
    const all      = _all();
    const toSelect = _editingId && all.find(s => s.meta.id === _editingId)
      ? _editingId
      : (all.length > 0 ? all[0].meta.id : null);
    if (toSelect) _selectScenario(toSelect);
    else          _renderRight(null);
  }

  function _buildShell() {
    const all      = _all();
    const activeId = _activeId();
    const items = all.map(s => `
      <div class="se-scenario-item ${s.meta.id === _editingId ? 'selected' : ''}"
           data-id="${s.meta.id}"
           onclick="SE._selectScenario('${s.meta.id}')">
        <span class="se-scenario-name">${_esc(s.meta.name)}</span>
        ${s.meta.id === activeId ? '<span class="se-active-pip">▶</span>' : ''}
      </div>`).join('');

    return `
      <div class="se-layout">
        <div class="se-header">
          <button class="btn btn-ghost se-back-btn" onclick="goTo('screen-mode')">← Режим игры</button>
          <span class="se-title">📋 Редактор сценариев</span>
          <div style="flex:1"></div>
          <label class="btn btn-ghost" style="cursor:pointer;font-size:12px;padding:8px 14px">
            📂 Импорт
            <input type="file" accept=".json,.scenario.json" style="display:none"
                   onchange="SE._importJSON(event)">
          </label>
        </div>
        <div class="se-body">
          <div class="se-sidebar">
            <div class="se-sidebar-label">Сценарии</div>
            <div class="se-list" id="se-list">
              ${items || '<div class="se-list-empty">Нет сценариев</div>'}
            </div>
            <button class="btn btn-teal se-new-btn" onclick="SE._createNew()"
                    style="font-size:13px;padding:9px 0;justify-content:center">
              + Новый сценарий
            </button>
          </div>
          <div class="se-right" id="se-right"></div>
        </div>
      </div>`;
  }

  function _renderRight(sc) {
    const panel = document.getElementById('se-right');
    if (!panel) return;
    if (!sc) {
      panel.innerHTML = `
        <div class="se-empty-state">
          <div style="font-size:40px;margin-bottom:14px">📋</div>
          <div class="se-empty-hint">Выбери сценарий для редактирования<br>или создай новый</div>
        </div>`;
      return;
    }

    const activeId = _activeId();
    const isActive = sc.meta.id === activeId;

    panel.innerHTML = `
      <div class="se-editor">
        <div class="se-editor-top">
          <div class="se-editor-meta">
            <input class="se-name-input" id="se-name" value="${_esc(sc.meta.name)}"
                   placeholder="Название сценария"
                   oninput="SE._fieldChange('name', this.value)">
            <input class="se-desc-input" id="se-desc" value="${_esc(sc.meta.desc||'')}"
                   placeholder="Описание (необязательно)"
                   oninput="SE._fieldChange('desc', this.value)">
          </div>
          <div class="se-editor-btns">
            <button class="btn ${isActive ? 'se-btn-active' : 'btn-ghost'} se-activate-btn"
                    onclick="SE._toggleActive('${sc.meta.id}')">
              ${isActive ? '▶ Активен' : 'Активировать'}
            </button>
            <button class="btn btn-ghost" onclick="SE._exportJSON('${sc.meta.id}')"
                    style="font-size:12px;padding:8px 12px">↓ JSON</button>
            <button class="btn btn-ghost se-del-btn" onclick="SE._deleteScenario('${sc.meta.id}')"
                    title="Удалить">🗑</button>
          </div>
        </div>
        ${isActive ? '<div class="se-active-notice">✓ Этот сценарий активен — изменения применяются при старте следующей игры</div>' : ''}
        <div class="se-tabs">
          ${['finance','team','projects','events'].map(s => `
            <button class="se-tab ${_activeSection === s ? 'active' : ''}"
                    onclick="SE._switchSection('${s}')">
              ${{finance:'💰 Финансы', team:'👥 Команда', projects:'📁 Проекты', events:'⚡ События'}[s]}
            </button>`).join('')}
        </div>
        <div class="se-tab-body" id="se-tab-body">
          ${_renderSection(_activeSection, sc)}
        </div>
      </div>`;
  }

  // ── Section renderers ─────────────────────────────────
  function _renderSection(section, sc) {
    const ov = sc.overrides;
    const st = ov.settings;

    if (section === 'finance') {
      return `<div class="se-fields">
        ${_numField('Стартовый капитал',      'settings.startMoney',      st.startMoney,      100000,   5000000,  50000,  'rub')}
        ${_numField('Цель выигрыша',           'settings.winCondition',    st.winCondition,   1000000,  20000000, 500000, 'rub')}
        ${_numField('Постоянные расходы/мес',  'settings.overhead',        st.overhead,             0,    200000,   2500,  'rub')}
        ${_numField('Рабочих дней/мес',        'settings.actionsPerMonth', st.actionsPerMonth,      6,        20,      1,  'days')}
        ${_numField('Скаутинг стоит',          'settings.scoutCost',       st.scoutCost,            1,         7,      1,  'days')}
        ${_numField('Найм стоит',              'settings.hireCost',        st.hireCost,             1,         5,      1,  'days')}
      </div>`;
    }

    if (section === 'team') {
      return _renderTeamSection(sc);
    }

    if (section === 'projects') {
      return _renderProjectsSection(sc);
    }

    if (section === 'events') {
      return _renderEventsSection(sc);
    }

    return '<p style="color:var(--muted)">Раздел в разработке</p>';
  }

  // ── Team section ──────────────────────────────────────
  const GRADES = { junior:'Junior', middle:'Middle', senior:'Senior', lead:'Lead' };

  function _renderTeamSection(sc) {
    const ov    = sc.overrides;
    const staff = ov.customStaff || [];

    return `
      <div class="se-team-section">
        <div class="se-subsection-title">Глобальные множители</div>
        <p class="se-section-note">Применяются ко всем базовым ролям сценария</p>
        <div class="se-fields">
          ${_multField('Зарплаты команды',      'staffCostMult',    ov.staffCostMult,    0.3, 3.0, 0.1, 'Дорогая команда замедляет рост; дешёвая — снижает сложность')}
          ${_multField('Качество специалистов', 'staffQualityMult', ov.staffQualityMult, 0.3, 3.0, 0.1, 'Q-бонусы всех ролей; влияет на доступность проектов с minQ')}
        </div>

        <div class="se-subsection-title" style="margin-top:28px">
          Кастомные сотрудники
          <div style="display:flex;gap:8px;margin-left:auto">
            <button class="se-lib-btn" onclick="SE._openPresetModal('staff')">📚 Из библиотеки</button>
            <button class="btn btn-teal se-add-btn" style="margin-left:0" onclick="SE._addStaff()">+ Добавить</button>
          </div>
        </div>
        ${staff.length === 0
          ? `<p class="se-section-note">Роли под конкретный бизнес-сценарий — добавляются в пул найма поверх базовых.</p>`
          : ''}
        <div class="se-staff-list" id="se-staff-list">
          ${staff.map(s => _staffCard(s)).join('')}
        </div>
      </div>`;
  }

  function _staffCard(s) {
    const id = s.id;
    return `
      <div class="se-staff-card" id="se-staff-${id}">
        <div class="se-staff-header">
          <input class="se-staff-role" type="text"
                 value="${_esc(s.role)}"
                 placeholder="Название должности..."
                 oninput="SE._staffFieldChange('${id}','role',this.value)">
          <select class="se-staff-grade-sel"
                  onchange="SE._staffFieldChange('${id}','grade',this.value)">
            ${Object.entries(GRADES).map(([k,v]) =>
              `<option value="${k}" ${s.grade===k ? 'selected' : ''}>${v}</option>`
            ).join('')}
          </select>
          <button class="se-staff-del" onclick="SE._removeStaff('${id}')" title="Удалить">✕</button>
        </div>
        <div class="se-staff-fields">
          ${_staffField(id, 'cost',       'Зарплата/мес', s.cost,       5000, 500000, 5000, 'rub')}
          ${_staffField(id, 'quality',    'Q-бонус',      s.quality,       0,     20,    1, 'q')}
          ${_staffField(id, 'npsBonus',   'NPS-бонус',    s.npsBonus,    -10,     30,    1, 'nps')}
          ${_staffField(id, 'speedBonus', 'Скорость',     s.speedBonus,  -50,    100,    5, 'pct')}
        </div>
        <input class="se-staff-desc" type="text"
               value="${_esc(s.desc||'')}"
               placeholder="Описание роли (необязательно)"
               oninput="SE._staffFieldChange('${id}','desc',this.value)">
      </div>`;
  }

  // ── Events section ────────────────────────────────────
  const EFFECT_TYPES = {
    money_add:    { label:'Деньги ±₽',          unit:'rub', min:-500000, max:500000, step:5000 },
    nps_all:      { label:'NPS всех клиентов',  unit:'nps', min:-30,     max:30,     step:1    },
    reputation:   { label:'Репутация ±',         unit:'rep', min:-20,     max:20,     step:1    },
    fatigue:      { label:'Усталость команды ±', unit:'pct', min:-30,     max:30,     step:5    },
    portfolio:    { label:'Портфолио ±',         unit:'q',   min:-10,     max:10,     step:1    },
    random_money: { label:'Случайно: деньги ±₽', unit:'rub', min:0,      max:500000, step:5000 },
    random_nps:   { label:'Случайно: к оценке клиента ±',     unit:'nps', min:-20,    max:20,     step:1    },
  };

  // Пресеты для быстрого старта
  const EVENT_PRESETS = {
    blank:   { label:'Пустое',           data:{} },
    money:   { label:'Финансовый шок',   data:{ icon:'💸', title:'Внезапный счёт', body:'Непредвиденные расходы. Решение за тобой.', requiresClients:false, chance:0.15,
               choices:[
                 { text:'Оплатить сейчас (−50 000 ₽)', desc:'Устраняет проблему быстро', effects:[{type:'money_add', val:-50000}] },
                 { text:'Отложить', desc:'Репутация немного падает', effects:[{type:'reputation', val:-5}] },
               ]}},
    nps:     { label:'Кризис оценки клиента',       data:{ icon:'📉', title:'Клиенты недовольны', body:'Что-то пошло не так. оценка клиента просела у всех.', requiresClients:true, chance:0.15,
               choices:[
                 { text:'Антикризисный аудит (−30 000 ₽)', desc:'оценка клиента +15 у всех', effects:[{type:'money_add', val:-30000},{type:'nps_all', val:15}] },
                 { text:'Переждать', desc:'оценка клиента −18 у всех', effects:[{type:'nps_all', val:-18}] },
               ]}},
    bonus:   { label:'Неожиданный бонус', data:{ icon:'🎉', title:'Удача на рынке', body:'Рынок поднялся, клиент доволен.', requiresClients:false, chance:0.10,
               choices:[
                 { text:'Принять бонус', desc:'Дополнительный доход', effects:[{type:'random_money', val:60000}] },
                 { text:'Реинвестировать', desc:'Репутация растёт', effects:[{type:'reputation', val:8}] },
               ]}},
    team:    { label:'Конфликт в команде', data:{ icon:'⚡', title:'Напряжение в команде', body:'Усталость сказывается на работе.', requiresClients:false, chance:0.12,
               choices:[
                 { text:'Тимбилдинг (−25 000 ₽)', desc:'оценка клиента +10, усталость −15', effects:[{type:'money_add', val:-25000},{type:'nps_all', val:10},{type:'fatigue', val:-15}] },
                 { text:'Поговорить самому', desc:'50% шанс — к оценке клиента ±8', effects:[{type:'random_nps', val:-8}] },
               ]}},
  };

  function _renderEventsSection(sc) {
    const ov     = sc.overrides;
    const events = ov.customEvents || [];
    const presetOpts = Object.entries(EVENT_PRESETS).map(([k,v]) =>
      `<option value="${k}">${v.label}</option>`).join('');

    return `
      <div class="se-team-section">
        <div class="se-subsection-title">Глобальный множитель</div>
        <p class="se-section-note">×0 = события отключены · ×1 = стандарт · ×2 = хаотичная игра</p>
        <div class="se-fields">
          ${_multField('Частота событий', 'eventChanceMult', ov.eventChanceMult, 0, 3.0, 0.1, 'Влияет на шанс каждого события в пуле')}
        </div>

        <div class="se-subsection-title" style="margin-top:28px">
          Кастомные события
          <div style="display:flex;gap:8px;margin-left:auto;align-items:center">
            <button class="se-lib-btn" onclick="SE._openPresetModal('events')">📚 Из библиотеки</button>
            <select class="se-staff-grade-sel" id="se-event-preset-sel" style="font-size:11px">
              ${presetOpts}
            </select>
            <button class="btn btn-teal se-add-btn" style="margin-left:0"
                    onclick="SE._addEvent(document.getElementById('se-event-preset-sel').value)">
              + Добавить
            </button>
          </div>
        </div>
        ${events.length === 0
          ? `<p class="se-section-note">События появляются случайно раз в несколько месяцев и предлагают игроку выбор с последствиями.</p>`
          : ''}
        <div class="se-staff-list" id="se-event-list">
          ${events.map(ev => _eventCard(ev)).join('')}
        </div>
      </div>`;
  }

  function _eventCard(ev) {
    const id = ev.id;
    return `
      <div class="se-staff-card se-event-card" id="se-event-${id}">
        <!-- Шапка -->
        <div class="se-staff-header">
          <input class="se-project-icon" type="text" maxlength="4"
                 value="${_esc(ev.icon||'⚡')}" placeholder="⚡"
                 oninput="SE._eventFieldChange('${id}','icon',this.value)">
          <input class="se-staff-role" type="text"
                 value="${_esc(ev.title)}" placeholder="Название события..."
                 oninput="SE._eventFieldChange('${id}','title',this.value)">
          <button class="se-staff-del" onclick="SE._removeEvent('${id}')" title="Удалить">✕</button>
        </div>

        <!-- Описание события -->
        <textarea class="se-event-body" rows="2"
                  placeholder="Описание ситуации, которую увидит игрок..."
                  oninput="SE._eventFieldChange('${id}','body',this.value)">${_esc(ev.body||'')}</textarea>

        <!-- Шанс + флаг клиентов -->
        <div class="se-project-row" style="align-items:flex-end;gap:20px">
          <div class="se-project-sel-group" style="flex:1">
            <span class="se-field-lbl">Шанс появления/мес</span>
            <div class="se-field-row">
              <input type="range" class="se-slider" min="0.02" max="0.8" step="0.02"
                     value="${ev.chance||0.15}"
                     oninput="document.getElementById('se-ev-${id}-ch-num').value=Math.round(this.value*100);
                              SE._eventFieldChange('${id}','chance',+this.value)">
              <input type="number" class="se-num-input" id="se-ev-${id}-ch-num"
                     min="2" max="80" step="2" value="${Math.round((ev.chance||0.15)*100)}"
                     oninput="SE._eventFieldChange('${id}','chance',Math.min(80,Math.max(2,+this.value||2))/100)">
              <span class="se-field-unit">%</span>
            </div>
          </div>
          <label class="se-toggle-opt" style="padding-bottom:6px">
            <input type="checkbox" ${ev.requiresClients?'checked':''}
                   onchange="SE._eventFieldChange('${id}','requiresClients',this.checked)">
            Требует активных клиентов
          </label>
        </div>

        <!-- Варианты выбора -->
        <div class="se-project-subsection">Варианты выбора</div>
        <div class="se-choices-list" id="se-choices-${id}">
          ${(ev.choices||[]).map((c,ci) => _choiceBlock(id, ci, c)).join('')}
        </div>
        ${(ev.choices||[]).length < 3
          ? `<button class="se-add-choice-btn" onclick="SE._addChoice('${id}')">+ Добавить вариант</button>`
          : ''}
      </div>`;
  }

  function _choiceBlock(evId, ci, c) {
    return `
      <div class="se-choice-block" id="se-choice-${evId}-${ci}">
        <div class="se-choice-header">
          <span class="se-choice-num">Вариант ${ci+1}</span>
          ${ci >= 2 ? `<button class="se-staff-del" onclick="SE._removeChoice('${evId}',${ci})" style="font-size:11px;padding:3px 7px">✕</button>` : ''}
        </div>
        <input class="se-staff-role" type="text" style="font-size:13px"
               value="${_esc(c.text||'')}" placeholder="Текст кнопки выбора..."
               oninput="SE._choiceFieldChange('${evId}',${ci},'text',this.value)">
        <input class="se-staff-desc" type="text" style="border-top:1px solid var(--border);padding-top:6px"
               value="${_esc(c.desc||'')}" placeholder="Подсказка под кнопкой..."
               oninput="SE._choiceFieldChange('${evId}',${ci},'desc',this.value)">
        <div class="se-effects-list" id="se-effects-${evId}-${ci}">
          ${(c.effects||[]).map((eff,ei) => _effectRow(evId, ci, ei, eff)).join('')}
        </div>
        <button class="se-add-effect-btn" onclick="SE._addEffect('${evId}',${ci})">+ эффект</button>
      </div>`;
  }

  function _effectRow(evId, ci, ei, eff) {
    const def  = EFFECT_TYPES[eff.type] || EFFECT_TYPES.money_add;
    const opts = Object.entries(EFFECT_TYPES).map(([k,v]) =>
      `<option value="${k}" ${eff.type===k?'selected':''}>${v.label}</option>`).join('');
    const fid = `se-eff-${evId}-${ci}-${ei}`;
    return `
      <div class="se-effect-row" id="${fid}">
        <select class="se-staff-grade-sel" style="flex:1.5;font-size:11px"
                onchange="SE._effectFieldChange('${evId}',${ci},${ei},'type',this.value,'${fid}')">
          ${opts}
        </select>
        <input type="range" class="se-slider" id="${fid}-slider"
               min="${def.min}" max="${def.max}" step="${def.step}" value="${eff.val||0}"
               oninput="document.getElementById('${fid}-num').value=this.value;
                        SE._effectFieldChange('${evId}',${ci},${ei},'val',+this.value,'${fid}')">
        <input type="number" class="se-num-input" id="${fid}-num"
               min="${def.min}" max="${def.max}" step="${def.step}" value="${eff.val||0}"
               oninput="document.getElementById('${fid}-slider').value=this.value;
                        SE._effectFieldChange('${evId}',${ci},${ei},'val',+this.value,'${fid}')">
        <span class="se-field-unit" style="min-width:24px">${_unitSuffix(def.unit)}</span>
        <button class="se-staff-del" style="padding:3px 7px;font-size:11px"
                onclick="SE._removeEffect('${evId}',${ci},${ei})">✕</button>
      </div>`;
  }

  // ── Events CRUD ────────────────────────────────────────
  function _addEvent(preset) {
    if (!_editingId) return;
    const all = _all();
    const sc  = all.find(s => s.meta.id === _editingId);
    if (!sc) return;
    if (!sc.overrides.customEvents) sc.overrides.customEvents = [];
    const ev = _defaultEvent(preset);
    sc.overrides.customEvents.push(ev);
    _save(all);
    const list = document.getElementById('se-event-list');
    if (list) list.insertAdjacentHTML('beforeend', _eventCard(ev));
  }

  function _removeEvent(evId) {
    if (!_editingId) return;
    const all = _all();
    const sc  = all.find(s => s.meta.id === _editingId);
    if (!sc || !sc.overrides.customEvents) return;
    sc.overrides.customEvents = sc.overrides.customEvents.filter(e => e.id !== evId);
    _save(all);
    const card = document.getElementById('se-event-' + evId);
    if (card) card.remove();
  }

  function _eventFieldChange(evId, field, value) {
    if (!_editingId) return;
    const all = _all();
    const sc  = all.find(s => s.meta.id === _editingId);
    if (!sc || !sc.overrides.customEvents) return;
    const ev = sc.overrides.customEvents.find(e => e.id === evId);
    if (!ev) return;
    ev[field] = value;
    _save(all);
  }

  function _addChoice(evId) {
    if (!_editingId) return;
    const all = _all();
    const sc  = all.find(s => s.meta.id === _editingId);
    if (!sc || !sc.overrides.customEvents) return;
    const ev = sc.overrides.customEvents.find(e => e.id === evId);
    if (!ev || (ev.choices||[]).length >= 3) return;
    ev.choices.push(_defaultChoice());
    _save(all);
    // Re-render choices block
    const cList = document.getElementById('se-choices-' + evId);
    if (cList) cList.innerHTML = ev.choices.map((c,ci) => _choiceBlock(evId, ci, c)).join('');
    // Hide add button if 3 choices now
    if (ev.choices.length >= 3) {
      const btn = cList?.nextElementSibling;
      if (btn && btn.classList.contains('se-add-choice-btn')) btn.style.display = 'none';
    }
  }

  function _removeChoice(evId, ci) {
    if (!_editingId) return;
    const all = _all();
    const sc  = all.find(s => s.meta.id === _editingId);
    if (!sc || !sc.overrides.customEvents) return;
    const ev = sc.overrides.customEvents.find(e => e.id === evId);
    if (!ev || !ev.choices || ci < 2) return;
    ev.choices.splice(ci, 1);
    _save(all);
    const cList = document.getElementById('se-choices-' + evId);
    if (cList) cList.innerHTML = ev.choices.map((c,ci) => _choiceBlock(evId, ci, c)).join('');
    const btn = cList?.nextElementSibling;
    if (btn && btn.classList.contains('se-add-choice-btn')) btn.style.display = '';
  }

  function _choiceFieldChange(evId, ci, field, value) {
    if (!_editingId) return;
    const all = _all();
    const sc  = all.find(s => s.meta.id === _editingId);
    if (!sc || !sc.overrides.customEvents) return;
    const ev = sc.overrides.customEvents.find(e => e.id === evId);
    if (!ev || !ev.choices[ci]) return;
    ev.choices[ci][field] = value;
    _save(all);
  }

  function _addEffect(evId, ci) {
    if (!_editingId) return;
    const all = _all();
    const sc  = all.find(s => s.meta.id === _editingId);
    if (!sc || !sc.overrides.customEvents) return;
    const ev = sc.overrides.customEvents.find(e => e.id === evId);
    if (!ev || !ev.choices[ci]) return;
    const newEff = { type:'money_add', val:0 };
    ev.choices[ci].effects.push(newEff);
    const ei = ev.choices[ci].effects.length - 1;
    _save(all);
    const efList = document.getElementById(`se-effects-${evId}-${ci}`);
    if (efList) efList.insertAdjacentHTML('beforeend', _effectRow(evId, ci, ei, newEff));
  }

  function _removeEffect(evId, ci, ei) {
    if (!_editingId) return;
    const all = _all();
    const sc  = all.find(s => s.meta.id === _editingId);
    if (!sc || !sc.overrides.customEvents) return;
    const ev = sc.overrides.customEvents.find(e => e.id === evId);
    if (!ev || !ev.choices[ci]) return;
    ev.choices[ci].effects.splice(ei, 1);
    _save(all);
    // Re-render all effects to fix indices
    const efList = document.getElementById(`se-effects-${evId}-${ci}`);
    if (efList) efList.innerHTML = ev.choices[ci].effects.map((e,i) => _effectRow(evId, ci, i, e)).join('');
  }

  function _effectFieldChange(evId, ci, ei, field, value, fid) {
    if (!_editingId) return;
    const all = _all();
    const sc  = all.find(s => s.meta.id === _editingId);
    if (!sc || !sc.overrides.customEvents) return;
    const ev = sc.overrides.customEvents.find(e => e.id === evId);
    if (!ev || !ev.choices[ci] || !ev.choices[ci].effects[ei]) return;
    ev.choices[ci].effects[ei][field] = field === 'val' ? Number(value) : value;
    _save(all);
    // If type changed — update slider/num bounds
    if (field === 'type') {
      const def = EFFECT_TYPES[value] || EFFECT_TYPES.money_add;
      const slider = document.getElementById(fid + '-slider');
      const num    = document.getElementById(fid + '-num');
      if (slider) { slider.min = def.min; slider.max = def.max; slider.step = def.step; slider.value = 0; }
      if (num)    { num.min = def.min; num.max = def.max; num.step = def.step; num.value = 0; }
      ev.choices[ci].effects[ei].val = 0;
      _save(all);
    }
  }

  // ── Projects section ──────────────────────────────────
  const PROJECT_TYPES   = { small:'Small', store:'Brand/Store', corp:'Corp', brand:'Брендинг' };
  const PROJECT_RARITY  = { common:'Common', uncommon:'Uncommon', rare:'Rare', epic:'Epic' };
  const MOD_TYPES = {
    none:           'Нет',
    nps_passive:    'NPS каждый месяц',
    nps_start:      'NPS при старте',
    payment_delay:  'Задержка платежа (%)',
    random_bonus:   'Случайный бонус',
    revenue_growth: 'Рост дохода',
  };

  function _renderProjectsSection(sc) {
    const ov       = sc.overrides;
    const projects = ov.customProjects || [];
    return `
      <div class="se-team-section">
        <div class="se-subsection-title">Глобальные множители</div>
        <p class="se-section-note">Применяются ко всем проектам сценария, включая кастомные</p>
        <div class="se-fields">
          ${_multField('Бюджеты проектов',  'projectBudgetMult',  ov.projectBudgetMult,  0.3, 3.0, 0.1, 'Итоговая выплата при завершении')}
          ${_multField('Помесячный доход',  'projectRevenueMult', ov.projectRevenueMult, 0.3, 3.0, 0.1, 'Revenue от длинных клиентов каждый месяц')}
        </div>
        <div class="se-budget-preview" id="se-budget-preview">
          ${_budgetPreviewRows(ov.projectBudgetMult)}
        </div>

        <div class="se-subsection-title" style="margin-top:28px">
          Кастомные проекты
          <div style="display:flex;gap:8px;margin-left:auto">
            <button class="se-lib-btn" onclick="SE._openPresetModal('projects')">📚 Из библиотеки</button>
            <button class="btn btn-teal se-add-btn" style="margin-left:0" onclick="SE._addProject()">+ Добавить</button>
          </div>
        </div>
        ${projects.length === 0
          ? `<p class="se-section-note">Проекты под конкретный бизнес-сценарий — добавляются в пул скаутинга.</p>`
          : ''}
        <div class="se-staff-list" id="se-project-list">
          ${projects.map(p => _projectCard(p)).join('')}
        </div>
      </div>`;
  }

  function _projectCard(p) {
    const id  = p.id;
    const mod = p.modifier || { type:'none', val:0, val2:0 };
    const pre = p.prepayment || { enabled:false, prob:0.5, pct:0.3 };

    return `
      <div class="se-staff-card se-project-card" id="se-project-${id}">

        <!-- Шапка: иконка + название + тир + удалить -->
        <div class="se-staff-header">
          <input class="se-project-icon" type="text" maxlength="4"
                 value="${_esc(p.icon)}" placeholder="📁"
                 oninput="SE._projectFieldChange('${id}','icon',this.value)">
          <input class="se-staff-role" type="text"
                 value="${_esc(p.name)}" placeholder="Название проекта..."
                 oninput="SE._projectFieldChange('${id}','name',this.value)">
          <label class="se-inline-label">T
            <select class="se-staff-grade-sel" style="width:52px"
                    onchange="SE._projectFieldChange('${id}','tier',+this.value)">
              ${[1,2,3,4].map(t => `<option value="${t}" ${p.tier===t?'selected':''}>${t}</option>`).join('')}
            </select>
          </label>
          <button class="se-staff-del" onclick="SE._removeProject('${id}')" title="Удалить">✕</button>
        </div>

        <!-- Описание -->
        <input class="se-staff-desc" type="text" style="border-top:none;padding-top:0"
               value="${_esc(p.desc||'')}" placeholder="Описание проекта..."
               oninput="SE._projectFieldChange('${id}','desc',this.value)">

        <!-- Тип / Rarity / Вероятность -->
        <div class="se-project-row">
          <div class="se-project-sel-group">
            <span class="se-field-lbl">Тип</span>
            <select class="se-staff-grade-sel"
                    onchange="SE._projectFieldChange('${id}','type',this.value)">
              ${Object.entries(PROJECT_TYPES).map(([k,v]) =>
                `<option value="${k}" ${p.type===k?'selected':''}>${v}</option>`).join('')}
            </select>
          </div>
          <div class="se-project-sel-group">
            <span class="se-field-lbl">Rarity</span>
            <select class="se-staff-grade-sel"
                    onchange="SE._projectFieldChange('${id}','rarity',this.value)">
              ${Object.entries(PROJECT_RARITY).map(([k,v]) =>
                `<option value="${k}" ${p.rarity===k?'selected':''}>${v}</option>`).join('')}
            </select>
          </div>
          <div class="se-project-sel-group" style="flex:1">
            <span class="se-field-lbl">Вероятность появления</span>
            <div class="se-field-row">
              <input type="range" class="se-slider" min="0.05" max="1" step="0.05" value="${p.prob}"
                     oninput="document.getElementById('se-pf-${id}-prob-num').value=Math.round(this.value*100);
                              SE._projectFieldChange('${id}','prob',+this.value)">
              <input type="number" class="se-num-input" id="se-pf-${id}-prob-num"
                     min="5" max="100" step="5" value="${Math.round(p.prob*100)}"
                     oninput="var v=Math.min(100,Math.max(5,+this.value||5));
                              SE._projectFieldChange('${id}','prob',v/100)">
              <span class="se-field-unit">%</span>
            </div>
          </div>
        </div>

        <!-- Бюджет -->
        <div class="se-project-subsection">Бюджет</div>
        <div class="se-project-budget-toggle">
          <label class="se-toggle-opt">
            <input type="radio" name="budget-${id}" value="range" ${p.useRangeBudget?'checked':''}
                   onchange="SE._projectFieldChange('${id}','useRangeBudget',true); SE._projectRerenderBudget('${id}')">
            Использовать диапазон тира
          </label>
          <label class="se-toggle-opt">
            <input type="radio" name="budget-${id}" value="custom" ${!p.useRangeBudget?'checked':''}
                   onchange="SE._projectFieldChange('${id}','useRangeBudget',false); SE._projectRerenderBudget('${id}')">
            Кастомный диапазон
          </label>
        </div>
        <div id="se-pf-${id}-budget-custom" style="${p.useRangeBudget?'display:none':''}">
          <div class="se-staff-fields" style="grid-template-columns:1fr 1fr">
            ${_staffField(id+'_bmin', 'budgetMin', 'Бюджет от', p.budgetMin, 10000, 5000000, 10000, 'rub')}
            ${_staffField(id+'_bmax', 'budgetMax', 'Бюджет до', p.budgetMax, 10000, 5000000, 10000, 'rub')}
          </div>
        </div>
        <div class="se-staff-fields" style="grid-template-columns:1fr 1fr;margin-top:8px">
          ${_staffField(id+'_rev', 'revenue', 'Доход/мес', p.revenue, 0, 500000, 5000, 'rub')}
          ${_staffField(id+'_nps', 'npsStart', 'оценка клиента — старт', p.npsStart, 40, 100, 1, 'nps')}
        </div>

        <!-- Требования -->
        <div class="se-project-subsection">Требования</div>
        <div class="se-staff-fields" style="grid-template-columns:1fr 1fr 1fr">
          ${_staffField(id+'_mq', 'minQ', 'Мин. Q', p.minQ, 0, 30, 1, 'q')}
          ${_staffField(id+'_mv', 'minV', 'Мин. V', p.minV, 0, 40, 1, 'q')}
          ${_staffField(id+'_cd', 'cooldown', 'Кулдаун', p.cooldown, 0, 12, 1, 'days')}
        </div>
        <div class="se-project-row" style="margin-top:10px;gap:20px">
          <label class="se-toggle-opt">
            <input type="checkbox" ${p.oneTime?'checked':''}
                   onchange="SE._projectFieldChange('${id}','oneTime',this.checked)">
            Разовый проект
          </label>
        </div>

        <!-- Модификатор -->
        <div class="se-project-subsection">Условия</div>
        <div class="se-project-row" style="align-items:flex-end;gap:16px">
          <div class="se-project-sel-group">
            <span class="se-field-lbl">Модификатор</span>
            <select class="se-staff-grade-sel"
                    onchange="SE._projectModChange('${id}','type',this.value)">
              ${Object.entries(MOD_TYPES).map(([k,v]) =>
                `<option value="${k}" ${mod.type===k?'selected':''}>${v}</option>`).join('')}
            </select>
          </div>
          <div id="se-mod-val-${id}" style="flex:1;${mod.type==='none'?'display:none':''}">
            ${_staffField(id+'_mv1', 'modVal', _modValLabel(mod.type), mod.val, _modMin(mod.type), _modMax(mod.type), _modStep(mod.type), _modUnit(mod.type))}
          </div>
          <div id="se-mod-val2-${id}" style="flex:1;${!_needsVal2(mod.type)?'display:none':''}">
            ${_staffField(id+'_mv2', 'modVal2', 'Шанс', mod.val2||0, 0, 100, 5, 'pct')}
          </div>
        </div>

        <!-- Предоплата -->
        <div class="se-project-subsection">Предоплата</div>
        <div class="se-project-row" style="gap:20px;align-items:flex-end">
          <label class="se-toggle-opt" style="align-self:center">
            <input type="checkbox" id="se-pre-toggle-${id}" ${pre.enabled?'checked':''}
                   onchange="SE._projectPreChange('${id}','enabled',this.checked)">
            Включить
          </label>
          <div id="se-pre-fields-${id}" style="${pre.enabled?'':'display:none'};display:${pre.enabled?'flex':'none'};gap:16px;flex:1">
            ${_staffField(id+'_pp', 'preProb', 'Вероятность', Math.round(pre.prob*100), 5, 100, 5, 'pct')}
            ${_staffField(id+'_pa', 'preAmt',  '% от бюджета', Math.round(pre.pct*100), 5, 80, 5, 'pct')}
          </div>
        </div>

      </div>`;
  }

  // Helpers для модификаторов
  function _modValLabel(t) {
    const m = { nps_passive:'оценки клиента/мес', nps_start:'NPS бонус', payment_delay:'Шанс задержки', random_bonus:'Бонус (₽)', revenue_growth:'Рост/мес (₽)' };
    return m[t] || 'Значение';
  }
  function _modMin(t)  { return t==='nps_passive'||t==='nps_start' ? -20 : 0; }
  function _modMax(t)  { return t==='random_bonus'||t==='revenue_growth' ? 500000 : (t==='payment_delay' ? 100 : 30); }
  function _modStep(t) { return t==='random_bonus'||t==='revenue_growth' ? 5000 : 1; }
  function _modUnit(t) { return t==='random_bonus'||t==='revenue_growth' ? 'rub' : (t==='payment_delay' ? 'pct' : 'nps'); }
  function _needsVal2(t) { return t === 'random_bonus'; }

  // ── Field builders ────────────────────────────────────

  // Числовое поле с слайдером + number input
  function _numField(label, key, value, min, max, step, unit) {
    const id  = 'se-v-' + key.replace(/\./g,'-');
    const suf = _unitSuffix(unit);
    return `
      <div class="se-field">
        <div class="se-field-lbl">${label}</div>
        <div class="se-field-row">
          <input type="range" class="se-slider" id="${id}-slider"
                 min="${min}" max="${max}" step="${step}" value="${value}"
                 oninput="
                   document.getElementById('${id}-num').value = this.value;
                   SE._fieldChange('${key}', +this.value)">
          <input type="number" class="se-num-input" id="${id}-num"
                 min="${min}" max="${max}" step="${step}" value="${value}"
                 oninput="
                   var v = Math.min(${max}, Math.max(${min}, +this.value || ${min}));
                   document.getElementById('${id}-slider').value = v;
                   SE._fieldChange('${key}', v)">
          <span class="se-field-unit">${suf}</span>
        </div>
      </div>`;
  }

  // Множительное поле с слайдером + number input
  function _multField(label, key, value, min, max, step, hint) {
    const id = 'se-v-' + key;
    return `
      <div class="se-field">
        <div class="se-field-lbl">${label}</div>
        ${hint ? `<div class="se-field-hint">${hint}</div>` : ''}
        <div class="se-field-row">
          <input type="range" class="se-slider" id="${id}-slider"
                 min="${min}" max="${max}" step="${step}" value="${value}"
                 oninput="
                   document.getElementById('${id}-num').value = this.value;
                   SE._fieldChange('${key}', +this.value);
                   SE._onMultChange('${key}', +this.value)">
          <span class="se-mult-prefix">×</span>
          <input type="number" class="se-num-input se-num-input--mult" id="${id}-num"
                 min="${min}" max="${max}" step="${step}" value="${value}"
                 oninput="
                   var v = Math.min(${max}, Math.max(${min}, +this.value || ${min}));
                   document.getElementById('${id}-slider').value = v;
                   SE._fieldChange('${key}', v);
                   SE._onMultChange('${key}', v)">
        </div>
      </div>`;
  }

  // Поле внутри карточки сотрудника
  function _staffField(staffId, field, label, value, min, max, step, unit) {
    const id  = `se-sf-${staffId}-${field}`;
    const suf = _unitSuffix(unit);
    return `
      <div class="se-staff-field">
        <div class="se-field-lbl">${label}</div>
        <div class="se-field-row">
          <input type="range" class="se-slider" id="${id}-slider"
                 min="${min}" max="${max}" step="${step}" value="${value}"
                 oninput="
                   document.getElementById('${id}-num').value = this.value;
                   SE._staffFieldChange('${staffId}','${field}',+this.value)">
          <input type="number" class="se-num-input" id="${id}-num"
                 min="${min}" max="${max}" step="${step}" value="${value}"
                 oninput="
                   var v = Math.min(${max}, Math.max(${min}, +this.value || ${min}));
                   document.getElementById('${id}-slider').value = v;
                   SE._staffFieldChange('${staffId}','${field}',v)">
          <span class="se-field-unit">${suf}</span>
        </div>
      </div>`;
  }

  // ── Unit helpers ──────────────────────────────────────
  function _unitSuffix(unit) {
    const map = { rub:'₽', rub_mo:'₽/мес', days:'дн.', q:'кач.', nps:'оценка', pct:'%' };
    return map[unit] || '';
  }

  function _fmtRub(n) {
    if (n >= 1_000_000) return (n/1_000_000).toFixed(1) + 'M ₽';
    if (n >= 1_000)     return Math.round(n/1_000) + 'K ₽';
    return n + ' ₽';
  }

  function _esc(str) {
    return String(str)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function _budgetPreviewRows(mult) {
    const m = mult || 1;
    const rows = [1,2,3,4].map(tier => {
      const base = SCENARIO.budgetRanges[tier];
      return `<div class="se-budget-row">
        <span class="se-budget-tier">T${tier}</span>
        <span>${_fmtRub(Math.round(base[0]*m))} — ${_fmtRub(Math.round(base[1]*m))}</span>
      </div>`;
    }).join('');
    return `<div class="se-budget-preview-title">Предпросмотр бюджетных диапазонов</div>${rows}`;
  }

  // ── Staff CRUD ────────────────────────────────────────
  function _addStaff() {
    if (!_editingId) return;
    const all = _all();
    const sc  = all.find(s => s.meta.id === _editingId);
    if (!sc) return;
    if (!sc.overrides.customStaff) sc.overrides.customStaff = [];
    const newStaff = _defaultStaff();
    sc.overrides.customStaff.push(newStaff);
    _save(all);

    // Append card без полного перерендера
    const list = document.getElementById('se-staff-list');
    if (list) {
      // Убрать «пустую» подсказку если была
      list.querySelectorAll('.se-section-note').forEach(el => el.remove());
      list.insertAdjacentHTML('beforeend', _staffCard(newStaff));
    }
  }

  function _removeStaff(staffId) {
    if (!_editingId) return;
    const all = _all();
    const sc  = all.find(s => s.meta.id === _editingId);
    if (!sc || !sc.overrides.customStaff) return;
    sc.overrides.customStaff = sc.overrides.customStaff.filter(s => s.id !== staffId);
    _save(all);
    const card = document.getElementById('se-staff-' + staffId);
    if (card) card.remove();
  }

  function _staffFieldChange(staffId, field, value) {
    if (!_editingId) return;
    const all = _all();
    const sc  = all.find(s => s.meta.id === _editingId);
    if (!sc || !sc.overrides.customStaff) return;
    const staff = sc.overrides.customStaff.find(s => s.id === staffId);
    if (!staff) return;
    staff[field] = value;
    _save(all);
  }

  // ── Projects CRUD ─────────────────────────────────────
  function _addProject() {
    if (!_editingId) return;
    const all = _all();
    const sc  = all.find(s => s.meta.id === _editingId);
    if (!sc) return;
    if (!sc.overrides.customProjects) sc.overrides.customProjects = [];
    const np = _defaultProject();
    sc.overrides.customProjects.push(np);
    _save(all);
    const list = document.getElementById('se-project-list');
    if (list) list.insertAdjacentHTML('beforeend', _projectCard(np));
  }

  function _removeProject(projectId) {
    if (!_editingId) return;
    const all = _all();
    const sc  = all.find(s => s.meta.id === _editingId);
    if (!sc || !sc.overrides.customProjects) return;
    sc.overrides.customProjects = sc.overrides.customProjects.filter(p => p.id !== projectId);
    _save(all);
    const card = document.getElementById('se-project-' + projectId);
    if (card) card.remove();
  }

  function _projectFieldChange(projectId, field, value) {
    if (!_editingId) return;
    const all = _all();
    const sc  = all.find(s => s.meta.id === _editingId);
    if (!sc || !sc.overrides.customProjects) return;
    const p = sc.overrides.customProjects.find(p => p.id === projectId);
    if (!p) return;
    // Поля внутри nested объектов
    if (field === 'modVal')       { p.modifier.val  = value; }
    else if (field === 'modVal2') { p.modifier.val2 = value; }
    else if (field === 'preProb') { p.prepayment.prob = value / 100; }
    else if (field === 'preAmt')  { p.prepayment.pct  = value / 100; }
    else                          { p[field] = value; }
    _save(all);
  }

  function _projectModChange(projectId, field, value) {
    if (!_editingId) return;
    const all = _all();
    const sc  = all.find(s => s.meta.id === _editingId);
    if (!sc || !sc.overrides.customProjects) return;
    const p = sc.overrides.customProjects.find(p => p.id === projectId);
    if (!p) return;
    p.modifier[field] = value;
    _save(all);
    // Show/hide modifier value fields
    const valEl  = document.getElementById('se-mod-val-'  + projectId);
    const val2El = document.getElementById('se-mod-val2-' + projectId);
    if (valEl)  valEl.style.display  = (value === 'none') ? 'none' : '';
    if (val2El) val2El.style.display = _needsVal2(value) ? '' : 'none';
  }

  function _projectPreChange(projectId, field, value) {
    if (!_editingId) return;
    const all = _all();
    const sc  = all.find(s => s.meta.id === _editingId);
    if (!sc || !sc.overrides.customProjects) return;
    const p = sc.overrides.customProjects.find(p => p.id === projectId);
    if (!p) return;
    p.prepayment[field] = value;
    _save(all);
    // Show/hide prepayment fields
    if (field === 'enabled') {
      const el = document.getElementById('se-pre-fields-' + projectId);
      if (el) el.style.display = value ? 'flex' : 'none';
    }
  }

  function _projectRerenderBudget(projectId) {
    // Show/hide custom budget fields
    const all = _all();
    const sc  = all.find(s => s.meta.id === _editingId);
    if (!sc || !sc.overrides.customProjects) return;
    const p = sc.overrides.customProjects.find(p => p.id === projectId);
    if (!p) return;
    const el = document.getElementById('se-pf-' + projectId + '-budget-custom');
    if (el) el.style.display = p.useRangeBudget ? 'none' : '';
  }

  // ── Public event handlers ─────────────────────────────
  function _selectScenario(id) {
    _editingId = id;
    document.querySelectorAll('.se-scenario-item').forEach(el => {
      el.classList.toggle('selected', el.dataset.id === id);
    });
    const sc = _all().find(s => s.meta.id === id);
    _renderRight(sc || null);
  }

  function _createNew() {
    const sc  = _createScenario('Сценарий ' + (_all().length + 1));
    const all = _all();
    all.push(sc);
    _save(all);
    _editingId = sc.meta.id;
    render();
  }

  function _deleteScenario(id) {
    if (!confirm('Удалить сценарий без возможности восстановления?')) return;
    const all = _all().filter(s => s.meta.id !== id);
    _save(all);
    if (_activeId() === id) _setActiveId(null);
    _editingId = all.length > 0 ? all[0].meta.id : null;
    render();
  }

  function _toggleActive(id) {
    _setActiveId(_activeId() === id ? null : id);
    const sc = _all().find(s => s.meta.id === id);
    _renderRight(sc || null);
    document.querySelectorAll('.se-scenario-item').forEach(el => {
      const pip = el.querySelector('.se-active-pip');
      if (el.dataset.id === id && _activeId() === id) {
        if (!pip) el.insertAdjacentHTML('beforeend', '<span class="se-active-pip">▶</span>');
      } else {
        if (pip) pip.remove();
      }
    });
    _syncIntroStats();
  }

  function _fieldChange(key, value) {
    if (!_editingId) return;
    const all = _all();
    const sc  = all.find(s => s.meta.id === _editingId);
    if (!sc) return;

    if      (key === 'name') sc.meta.name = value;
    else if (key === 'desc') sc.meta.desc = value;
    else if (key.startsWith('settings.')) sc.overrides.settings[key.replace('settings.','')] = value;
    else sc.overrides[key] = value;

    _save(all);

    if (key === 'name') {
      const nameEl = document.querySelector(`.se-scenario-item[data-id="${_editingId}"] .se-scenario-name`);
      if (nameEl) nameEl.textContent = value;
    }
  }

  function _onMultChange(key, value) {
    if (key !== 'projectBudgetMult') return;
    const preview = document.getElementById('se-budget-preview');
    if (preview) preview.innerHTML = _budgetPreviewRows(value);
  }

  function _switchSection(section) {
    _activeSection = section;
    document.querySelectorAll('.se-tab').forEach(t => {
      t.classList.toggle('active', t.getAttribute('onclick').includes(`'${section}'`));
    });
    const body = document.getElementById('se-tab-body');
    const sc   = _all().find(s => s.meta.id === _editingId);
    if (body && sc) body.innerHTML = _renderSection(section, sc);
  }

  function _exportJSON(id) {
    const sc = _all().find(s => s.meta.id === id);
    if (!sc) return;
    const blob = new Blob([JSON.stringify(sc, null, 2)], { type:'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = (sc.meta.name || 'scenario').replace(/[^a-zа-яёA-ZА-ЯЁ0-9_\-]/gi, '_') + '.scenario.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  function _importJSON(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const sc = JSON.parse(e.target.result);
        if (!sc.meta || !sc.overrides) throw new Error('Неверный формат: нет meta/overrides');
        sc.meta.id = _uid();
        const all = _all();
        all.push(sc);
        _save(all);
        _editingId = sc.meta.id;
        render();
      } catch(err) {
        alert('Ошибка импорта: ' + err.message);
      }
      event.target.value = '';
    };
    reader.readAsText(file);
  }

  // ── Preset modal ─────────────────────────────────────

  const PRESET_CAT_LABELS = { staff:'Персонал', projects:'Проекты', events:'События' };

  function _openPresetModal(cat) {
    if (!_editingId) return;
    const presets = (window.SE_PRESETS || {})[cat] || [];
    if (!presets.length) return;

    // Group by _label
    const groups = {};
    presets.forEach((p, idx) => {
      const lbl = p._label || 'Прочее';
      if (!groups[lbl]) groups[lbl] = [];
      groups[lbl].push({ p, idx });
    });

    const groupHtml = Object.entries(groups).map(([lbl, items]) => `
      <div class="se-modal-group">
        <div class="se-modal-group-title">${lbl}</div>
        <div class="se-modal-cards">
          ${items.map(({ p, idx }) => `
            <div class="se-modal-card">
              <div class="se-modal-card-icon">${p.icon || ''}</div>
              <div class="se-modal-card-body">
                <div class="se-modal-card-name">${_esc(p.name || p.role || p.title || '')}</div>
                <div class="se-modal-card-desc">${_esc(p.desc || p.body || '')}</div>
              </div>
              <button class="se-modal-add-btn" onclick="SE._addFromPreset('${cat}',${idx})">＋</button>
            </div>`).join('')}
        </div>
      </div>`).join('');

    const overlay = document.createElement('div');
    overlay.id = 'se-preset-overlay';
    overlay.className = 'se-preset-overlay';
    overlay.innerHTML = `
      <div class="se-preset-modal">
        <div class="se-preset-modal-header">
          <span>${PRESET_CAT_LABELS[cat] || cat} — библиотека пресетов</span>
          <button class="se-preset-close" onclick="SE._closePresetModal()">×</button>
        </div>
        <div class="se-preset-modal-body">
          ${groupHtml}
        </div>
      </div>`;
    overlay.addEventListener('click', e => { if (e.target === overlay) SE._closePresetModal(); });
    document.body.appendChild(overlay);
    // Animate in
    requestAnimationFrame(() => overlay.classList.add('se-preset-overlay--visible'));
  }

  function _closePresetModal() {
    const overlay = document.getElementById('se-preset-overlay');
    if (!overlay) return;
    overlay.classList.remove('se-preset-overlay--visible');
    overlay.addEventListener('transitionend', () => overlay.remove(), { once:true });
  }

  function _addFromPreset(cat, idx) {
    const preset = ((window.SE_PRESETS || {})[cat] || [])[idx];
    if (!preset || !_editingId) return;

    // Strip internal _* keys, assign new id
    const base = Object.fromEntries(Object.entries(preset).filter(([k]) => !k.startsWith('_')));
    base.id = _suid();

    const all = _all();
    const sc  = all.find(s => s.meta.id === _editingId);
    if (!sc) return;

    if (cat === 'staff') {
      if (!sc.overrides.customStaff) sc.overrides.customStaff = [];
      sc.overrides.customStaff.push(base);
      _save(all);
      const list = document.getElementById('se-staff-list');
      if (list) list.insertAdjacentHTML('beforeend', _staffCard(base));
    } else if (cat === 'projects') {
      if (!sc.overrides.customProjects) sc.overrides.customProjects = [];
      // Deep-clone modifier/prepayment/requirements
      base.modifier     = { ...(base.modifier     || { type:'none', val:0, val2:0 }) };
      base.prepayment   = { ...(base.prepayment   || { enabled:false, prob:0.5, pct:0.3 }) };
      base.requirements = { ...(base.requirements || { minQ:0, minV:0, minPortfolio:0, requiresDev:false }) };
      // Fallback budget range from tier
      if (!base.budgetMin) {
        const _tr = { 1:[90000,165000], 2:[220000,440000], 3:[550000,1320000], 4:[1500000,3500000] };
        const [bMin, bMax] = _tr[base.tier] || [90000, 165000];
        base.budgetMin = bMin; base.budgetMax = bMax;
      }
      sc.overrides.customProjects.push(base);
      _save(all);
      const list = document.getElementById('se-project-list');
      if (list) list.insertAdjacentHTML('beforeend', _projectCard(base));
    } else if (cat === 'events') {
      if (!sc.overrides.customEvents) sc.overrides.customEvents = [];
      // Deep-clone choices & effects
      base.choices = (base.choices || []).map(c => ({
        ...c,
        effects: (c.effects || []).map(e => ({ ...e })),
      }));
      sc.overrides.customEvents.push(base);
      _save(all);
      const list = document.getElementById('se-event-list');
      if (list) list.insertAdjacentHTML('beforeend', _eventCard(base));
    }

    _closePresetModal();
  }

  // ── Sync intro stats ──────────────────────────────────
  function _syncIntroStats() {
    const active   = getActive();
    const money    = active?.overrides?.settings?.startMoney   ?? SCENARIO.settings.startMoney;
    const goal     = active?.overrides?.settings?.winCondition ?? SCENARIO.settings.winCondition;
    const moneyEl  = document.getElementById('intro-stat-money');
    const goalEl   = document.getElementById('intro-stat-goal');
    if (moneyEl) moneyEl.textContent = _fmtRub(money);
    if (goalEl)  goalEl.textContent  = _fmtRub(goal);
  }

  // ── Public surface ────────────────────────────────────
  return {
    applyActiveScenario,
    render,
    getActive,
    getAll,
    syncIntroStats: _syncIntroStats,
    // HTML handlers
    _selectScenario,
    _createNew,
    _deleteScenario,
    _toggleActive,
    _fieldChange,
    _onMultChange,
    _switchSection,
    _exportJSON,
    _importJSON,
    _addStaff,
    _removeStaff,
    _staffFieldChange,
    _addProject,
    _removeProject,
    _projectFieldChange,
    _projectModChange,
    _projectPreChange,
    _projectRerenderBudget,
    _openPresetModal,
    _closePresetModal,
    _addFromPreset,
    _addEvent,
    _removeEvent,
    _eventFieldChange,
    _addChoice,
    _removeChoice,
    _choiceFieldChange,
    _addEffect,
    _removeEffect,
    _effectFieldChange,
  };

})();
