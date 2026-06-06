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
      return `
        <p class="se-section-note">Бюджетный множитель применяется к тировым диапазонам и разовым проектам.</p>
        <div class="se-fields">
          ${_multField('Бюджеты проектов',  'projectBudgetMult',  ov.projectBudgetMult,  0.3, 3.0, 0.1, 'Итоговая выплата при завершении')}
          ${_multField('Помесячный доход',  'projectRevenueMult', ov.projectRevenueMult, 0.3, 3.0, 0.1, 'Revenue от длинных клиентов каждый месяц')}
        </div>
        <div class="se-budget-preview" id="se-budget-preview">
          ${_budgetPreviewRows(ov.projectBudgetMult)}
        </div>`;
    }

    if (section === 'events') {
      return `
        <p class="se-section-note">×0 = события отключены; ×1 = стандарт; ×2 = хаотичная игра.</p>
        <div class="se-fields">
          ${_multField('Частота событий', 'eventChanceMult', ov.eventChanceMult, 0, 3.0, 0.1, 'Влияет на chance каждого события в пуле')}
        </div>`;
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
          <button class="btn btn-teal se-add-btn" onclick="SE._addStaff()">+ Добавить роль</button>
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
    const map = { rub:'₽', rub_mo:'₽/мес', days:'дн.', q:'Q', nps:'NPS', pct:'%' };
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
  };

})();
