// ══════════════════════════════════════════════════════
//  Подрядчики (аутсорс) — опциональный модуль ядра
//
//  Включение/выключение — одна строка (флаг ниже).
//  Или просто закомментировать <script src="src/outsource.js">
//  в index.html / убрать из build/build.js postEngineBlocks.
//
//  Принцип: ядро игры (engine.js, staff.js, projects.js, ui.js)
//  не модифицируется — модуль цепляется через EventBus, обёртки
//  глобальных функций (advanceMonth, renderTeamCards) и DOM-инжект
//  в панель «Действия». При отключении игра ведёт себя так, будто
//  модуля никогда не было.
//
//  Godot-портируемость: математика и стейт лежат в G/обёртках,
//  UI-инжект → перенесётся в Godot как отдельная сцена-панель,
//  обёртки → в Godot как сигналы advanceMonth.
//
//  Бэклог: п.3 «Аутсорс-ресурс»
// ══════════════════════════════════════════════════════

(function () {
  'use strict';

  // ─── Флаг включения модуля ────────────────────────────
  // Выключить аутсорс целиком — поставить false (UI исчезнет, обёртки
  // не зарегистрируются, ядро работает без изменений).
  const OUTSOURCE_ENABLED = true;

  if (!OUTSOURCE_ENABLED) return;
  if (typeof EventBus === 'undefined') {
    console.error('[outsource] EventBus не найден — модуль не активирован');
    return;
  }
  if (window.__OS_LOADED) return;            // guard от двойной загрузки
  window.__OS_LOADED = true;

  // ── Каталог подрядчиков ───────────────────────────────
  // Подрядчик — это «арендованный» специалист высокого грейда.
  // Цена ~1.7–2× от месячного оклада senior за весь срок (3–4 мес).
  const TYPES = {
    studio: {
      id:      'studio',
      label:   'Студия-партнёр',
      icon:    '🏢',
      desc:    'Внешняя дизайн-студия на проектной поддержке. Сильный Q-буст и хорошая мощность.',
      role:    'designer',
      grade:   'senior',
      qStat:   9,   speedStat: 8,
      quality: 9,   volume: 5,    capacity: 0,
      months:  3,
      cost:    480000,
      colorHex:'#a78bfa',
    },
    copywriters: {
      id:      'copywriters',
      label:   'Контракт-копирайтеры',
      icon:    '🛰',
      desc:    'Удалённый пул копирайтеров. Серьёзный буст объёма работ (V) на короткой дистанции.',
      role:    'copywriter',
      grade:   'senior',
      qStat:   7,   speedStat: 7,
      quality: 7,   volume: 30,   capacity: 0,
      months:  3,
      cost:    360000,
      colorHex:'#f59e0b',
    },
    extPM: {
      id:      'extPM',
      label:   'Внешний PM',
      icon:    '📡',
      desc:    'Контрактный менеджер. Открывает +1 слот клиента — берёшь ещё один проект, не нанимая в штат.',
      role:    'manager',
      grade:   'senior',
      qStat:   6,   speedStat: 7,
      quality: 6,   volume: 4,    capacity: 1,
      months:  4,
      cost:    620000,
      colorHex:'#34d399',
    },
  };

  // ── Найм подрядчика ───────────────────────────────────
  function hire(typeId) {
    const t = TYPES[typeId];
    if (!t) return;
    if (typeof G === 'undefined' || !G) { _toast('Игра ещё не запущена', 'error'); return; }
    if (G.money < t.cost) { _toast(`Нужно ${_fmt(t.cost)} ₽ — недостаточно средств`, 'error'); return; }

    G.money -= t.cost;
    G._osCounter = (G._osCounter || 0) + 1;
    const iid = 'os_' + typeId + '_' + Date.now().toString(36) + '_' + G._osCounter;

    const s = {
      uid: iid, id: iid, _iid: iid,
      name: t.label + ' #' + G._osCounter,
      role: t.role, roleLabel: t.label,
      grade: t.grade, gradeLabel: 'Senior',
      icon: t.icon,
      cost: 0, salary: 0, salaryAsk: 0, salaryMin: 0,   // разовая оплата при найме
      qStat: t.qStat, speedStat: t.speedStat,
      quality: t.quality, volume: t.volume, capacity: t.capacity,
      speedBonus: 0, npsBonus: 0,
      traits: [],
      experience: 8,
      mood: 100, fatigue: 0, loyalty: 100,
      monthsWithAgency: 0, projectsCompleted: 0, starLevel: 0,
      state: 'hired', status: 'active', _assignedProjectId: null,
      _outsource: {
        type: typeId,
        monthsLeft: t.months,
        totalMonths: t.months,
        hiredMonth: G.month || 0,
        paid: t.cost,
        colorHex: t.colorHex,
      },
    };
    G.staff.push(s);

    if (typeof addLog === 'function') {
      addLog(`🤝 Подрядчик подключён: ${t.label} — контракт ${t.months} мес. (−${_fmt(t.cost)} ₽)`, 'purple');
    }
    _toast(`${t.icon} ${t.label}: в команде на ${t.months} мес.`, 'success');
    if (typeof rd === 'function') rd(`Подрядчик: ${t.label}`, 'hire');
    _closeModal();
    EventBus.emit('render');
  }

  // ── Обёртка advanceMonth: декремент срока + авто-выход ─
  if (typeof window.advanceMonth === 'function' && !window.advanceMonth.__osWrapped) {
    const _orig = window.advanceMonth;
    window.advanceMonth = function () {
      const r = _orig.apply(this, arguments);
      try { _tickOutsource(); } catch (e) { console.warn('[outsource] tick error:', e); }
      return r;
    };
    window.advanceMonth.__osWrapped = true;
  }

  function _tickOutsource() {
    if (typeof G === 'undefined' || !G || !Array.isArray(G.staff)) return;
    const leaving = [];
    G.staff.forEach(s => {
      if (s && s._outsource) {
        s._outsource.monthsLeft = (s._outsource.monthsLeft || 0) - 1;
        if (s._outsource.monthsLeft <= 0) leaving.push(s);
      }
    });
    if (!leaving.length) return;
    leaving.forEach(s => {
      const iid = s._iid || s.id;
      if (typeof unassignStaff === 'function') {
        try { unassignStaff(iid); } catch (e) {}
      }
      const idx = G.staff.indexOf(s);
      if (idx >= 0) G.staff.splice(idx, 1);
      const label = s.roleLabel || s.name;
      if (typeof addLog === 'function') addLog(`🤝 Контракт «${label}» завершён — подрядчик ушёл`, 'amber');
      _toast(`🤝 ${label}: контракт завершён`, 'info');
    });
    EventBus.emit('render');
  }

  // ── UI-инжект ─────────────────────────────────────────
  // Кнопка «Подрядчики» вставляется в панель «Действия» рядом со скаутингом.
  // Список активных контрактов рендерится тут же.
  function _injectPanel() {
    if (typeof G === 'undefined' || !G || !G.staff) return;
    // Якорь: панель «Действия» = родитель кнопки #btn-scout
    const scoutBtn = document.getElementById('btn-scout');
    if (!scoutBtn || !scoutBtn.parentElement) return;
    const panel = scoutBtn.parentElement;

    let host = document.getElementById('outsource-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'outsource-host';
      host.style.cssText = 'margin-top:6px';
      // Вставляем сразу после кнопки скаутинга, до loans-host (чтобы было ближе к скаутингу).
      const loans = document.getElementById('loans-host');
      if (loans) panel.insertBefore(host, loans);
      else panel.appendChild(host);
    }
    host.innerHTML = _renderPanelHtml();
  }

  function _renderPanelHtml() {
    const active = (G.staff || []).filter(s => s._outsource);
    const list = active.map(s => {
      const os = s._outsource;
      const t  = TYPES[os.type] || {};
      const col = os.colorHex || '#a78bfa';
      const pctLeft = Math.round(100 * (os.monthsLeft / Math.max(1, os.totalMonths)));
      return `<div style="display:flex;align-items:center;gap:7px;padding:5px 8px;border:1px solid ${col}33;background:${col}11;border-radius:6px">
        <span style="font-size:13px;line-height:1">${t.icon || '🤝'}</span>
        <div style="min-width:0;flex:1">
          <div style="font-size:11px;font-weight:700;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${s.roleLabel || s.name}</div>
          <div style="height:3px;background:rgba(255,255,255,.08);border-radius:2px;overflow:hidden;margin-top:2px">
            <div style="height:100%;width:${pctLeft}%;background:${col};border-radius:2px"></div>
          </div>
        </div>
        <span style="font-size:10px;color:${col};font-weight:700;white-space:nowrap">${os.monthsLeft}/${os.totalMonths} мес.</span>
      </div>`;
    }).join('');

    return `<button onclick="OS.openModal()"
        style="width:100%;background:rgba(167,139,250,.08);border:1px solid rgba(167,139,250,.28);
               color:#c4b5fd;border-radius:8px;padding:8px 10px;cursor:pointer;font-size:12px;font-weight:600;
               display:flex;align-items:center;justify-content:space-between;gap:6px">
        <span>🤝 Подрядчики ${active.length ? '· активны ' + active.length : ''}</span>
        <span style="font-size:10px;color:var(--muted);font-weight:400">разовая оплата</span>
      </button>
      ${list ? `<div style="display:flex;flex-direction:column;gap:4px;margin-top:5px">${list}</div>` : ''}`;
  }

  // ── Модал найма ───────────────────────────────────────
  function openModal() {
    let m = document.getElementById('os-modal');
    if (!m) {
      m = document.createElement('div');
      m.id = 'os-modal';
      m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.62);z-index:300;display:flex;align-items:center;justify-content:center';
      m.onclick = (e) => { if (e.target === m) _closeModal(); };
      document.body.appendChild(m);
    }
    m.innerHTML = _renderModalHtml();
    m.style.display = 'flex';
  }

  function _closeModal() {
    const m = document.getElementById('os-modal');
    if (m) m.style.display = 'none';
  }

  function _renderModalHtml() {
    const cards = Object.values(TYPES).map(t => {
      const canPay = (G && typeof G.money === 'number') ? G.money >= t.cost : false;
      const benefits = [];
      if (t.quality)  benefits.push(`Q +${t.quality}`);
      if (t.volume)   benefits.push(`V +${t.volume}`);
      if (t.capacity) benefits.push(`📂 +${t.capacity} слот`);
      benefits.push(`⚙ ~${t.qStat * 1} мощн.`);
      return `<div style="border:1px solid ${t.colorHex}55;background:${t.colorHex}0d;border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:6px;min-width:0">
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:22px">${t.icon}</span>
          <div style="min-width:0">
            <div style="font-size:14px;font-weight:700;color:var(--text)">${t.label}</div>
            <div style="font-size:10px;color:var(--sub)">Контракт ${t.months} мес. · senior-грейд</div>
          </div>
        </div>
        <div style="font-size:11px;color:var(--sub);line-height:1.35">${t.desc}</div>
        <div style="display:flex;flex-wrap:wrap;gap:4px">
          ${benefits.map(b => `<span style="font-size:10px;padding:2px 7px;border-radius:10px;background:${t.colorHex}22;color:${t.colorHex};font-weight:600">${b}</span>`).join('')}
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px;padding-top:6px;border-top:1px dashed ${t.colorHex}33">
          <div>
            <div style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">оплата разовая</div>
            <div style="font-size:13px;font-weight:700;color:var(--text)">−${_fmt(t.cost)} ₽</div>
          </div>
          <button onclick="OS.hire('${t.id}')" ${canPay ? '' : 'disabled style="opacity:.4"'}
            style="background:${t.colorHex};color:#0b0d12;border:none;border-radius:8px;padding:8px 14px;font-weight:700;font-size:12px;cursor:pointer">
            Подключить
          </button>
        </div>
      </div>`;
    }).join('');

    return `<div style="background:var(--bg2);border:1px solid var(--border);border-radius:12px;
      max-width:760px;width:94%;max-height:88vh;overflow:auto;padding:18px;
      display:flex;flex-direction:column;gap:12px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div>
          <b style="font-size:15px">🤝 Подрядчики (аутсорс)</b>
          <div style="font-size:11px;color:var(--sub);margin-top:2px">Разовая оплата за весь срок. По окончании контракта подрядчик автоматически уходит — никаких выходных пособий.</div>
        </div>
        <button onclick="OS.closeModal()" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:18px;padding:4px 8px">✕</button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px">${cards}</div>
      <div style="font-size:10px;color:var(--muted);line-height:1.45">Подрядчик не получает зарплату в ФОТ (контракт оплачен авансом), не накапливает усталость и не уходит сам. Не сказывается на лояльности штатной команды.</div>
    </div>`;
  }

  // ── Бейдж «контракт N мес.» на карточке команды ──────
  if (typeof window.renderTeamCards === 'function' && !window.renderTeamCards.__osWrapped) {
    const _orig = window.renderTeamCards;
    window.renderTeamCards = function (el) {
      _orig.apply(this, arguments);
      if (!el) return;
      // Сопоставление: первая карточка — фаундер, далее по порядку G.staff
      const cards = (el.querySelectorAll && el.querySelectorAll('.staff-char-card')) || [];
      // Может вернуть NodeList или массив (в fake-DOM — пустой массив)
      const cardsArr = Array.from(cards || []);
      cardsArr.forEach((card, i) => {
        const s = (G && G.staff) ? G.staff[i - 1] : null;
        if (!s || !s._outsource) return;
        const os = s._outsource;
        const t = TYPES[os.type] || {};
        const col = os.colorHex || '#a78bfa';

        // Бейдж "контракт N/M мес"
        const body = card.querySelector ? card.querySelector('.staff-char-body') : null;
        if (body && !body.querySelector('.os-badge')) {
          const b = document.createElement('div');
          b.className = 'os-badge';
          b.style.cssText = `display:inline-block;margin-top:4px;margin-right:4px;padding:2px 6px;border-radius:4px;background:${col}22;color:${col};font-size:10px;font-weight:700`;
          b.textContent = `🤝 контракт ${os.monthsLeft}/${os.totalMonths} мес.`;
          body.appendChild(b);
        }

        // Прячем «✕ Уволить» — у подрядчика нет выходного пособия, чтобы не путать
        const fireBtn = card.querySelector ? card.querySelector('.staff-fire-btn') : null;
        if (fireBtn) fireBtn.style.display = 'none';

        // Рамка карточки в цвет типа
        if (card.style) card.style.borderColor = col + '55';
      });
    };
    window.renderTeamCards.__osWrapped = true;
  }

  // ── Подписки ──────────────────────────────────────────
  EventBus.on('render', _injectPanel);
  // Если игра уже запущена при подключении модуля — попробуем сразу
  try { _injectPanel(); } catch (e) {}

  // ── Утилиты ───────────────────────────────────────────
  function _fmt(n) {
    if (typeof fmt === 'function') return fmt(n);
    return new Intl.NumberFormat('ru-RU').format(Math.round(n));
  }
  function _toast(msg, type) {
    if (typeof notify === 'function') { notify(msg, type); return; }
    EventBus.emit('notify', { msg, type });
  }

  // ── Публичный API (для onclick'ов) ────────────────────
  window.OS = {
    hire,
    openModal,
    closeModal: _closeModal,
    getTypes: () => TYPES,
    _tick: _tickOutsource,
    _renderPanel: _injectPanel,
  };

  console.log('[outsource] v0.1 активирован: 3 типа подрядчиков, обёртки advanceMonth + renderTeamCards');
})();
