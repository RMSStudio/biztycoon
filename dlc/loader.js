// ══════════════════════════════════════════════════════
//  DLC LOADER
//  Реестр расширений и динамический загрузчик.
//  Загружается последним скриптом, до inline init.
//
//  Принцип изоляции:
//    • index.html и engine.js не знают о DLC
//    • DLC-скрипты сами цепляются через EventBus
//    • При ошибке загрузки DLC — основная игра не ломается
// ══════════════════════════════════════════════════════

const DLC = (() => {
  'use strict';

  // ── Реестр доступных расширений ───────────────────────
  // status: 'stable' | 'wip' | 'locked'
  // scripts[] — пути относительно корня game/
  const REGISTRY = [
    {
      id:      'mastery',
      name:    'Прокачка',
      icon:    '⚡',
      version: '0.4',
      desc:    'Стартовые перки-руны + сюжетные арки + карта рана + мета-прогресс между партиями (осколки, ачивки, разблокировки).',
      status:  'wip',
      // Реализация механик физически живёт в src/runes.js, src/storyarcs.js,
      // src/runmap.js, src/meta.js (встраивается в single-HTML билд), но
      // гейтуется проверкой включённости этого DLC через localStorage.
      // Файл ниже — координатор/индикатор + хук на end_game для мета-награды.
      scripts: ['dlc/mastery/mastery.js'],
      styles:  [],
    },
    {
      id:      'strategy',
      name:    'Стратегическая сессия',
      icon:    '🧭',
      version: '0.1',
      desc:    'B2B-режим: симулятор бизнес-гипотез — детерминированный seed, цифровой двойник компании, ветки гипотез со сравнением.',
      status:  'wip',
      scripts: ['dlc/strategy/strategy.js'],
      styles:  [],
    },
    // Место для будущих DLC:
    // { id:'hardcore', name:'Hardcore', icon:'💀', status:'locked', ... },
  ];

  const LS_KEY = 'bt_enabled_dlcs_v1';

  // ── Persistence ───────────────────────────────────────
  function _getEnabled() {
    try { return JSON.parse(localStorage.getItem(LS_KEY)) || []; }
    catch { return []; }
  }

  function _setEnabled(arr) {
    localStorage.setItem(LS_KEY, JSON.stringify(arr));
  }

  function isEnabled(id) {
    return _getEnabled().includes(id);
  }

  function enable(id) {
    const dlc = REGISTRY.find(d => d.id === id);
    if (!dlc || dlc.status === 'locked') return;
    const list = _getEnabled();
    if (!list.includes(id)) { list.push(id); _setEnabled(list); }
  }

  function disable(id) {
    _setEnabled(_getEnabled().filter(i => i !== id));
  }

  function toggle(id) {
    isEnabled(id) ? disable(id) : enable(id);
  }

  // ── Миграция id режима «Прокачка»: старый 'roguelite' → 'mastery' ──
  // Режим переименован (имя «Rogue-lite» отдано новому режиму — открытие
  // механик). Один раз переписываем сохранённый список, чтобы статические
  // гейты (runes/meta/runmap/storyarcs читают localStorage напрямую) увидели
  // новый id и тумблер у тех, кто уже включал режим, не слетел.
  (function _migrateMasteryId() {
    try {
      const raw = JSON.parse(localStorage.getItem(LS_KEY)) || [];
      if (Array.isArray(raw) && raw.includes('roguelite')) {
        const next = raw.map(i => (i === 'roguelite' ? 'mastery' : i))
                        .filter((v, i, a) => a.indexOf(v) === i);
        _setEnabled(next);
      }
    } catch (e) { /* no-op */ }
  })();

  // ── Динамическая загрузка ─────────────────────────────
  function _loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
      const s    = document.createElement('script');
      s.src      = src;
      s.onload   = resolve;
      s.onerror  = () => reject(new Error(`Не удалось загрузить: ${src}`));
      document.head.appendChild(s);
    });
  }

  function _loadStyle(href) {
    if (document.querySelector(`link[href="${href}"]`)) return;
    const l  = document.createElement('link');
    l.rel    = 'stylesheet';
    l.href   = href;
    document.head.appendChild(l);
  }

  async function load(id) {
    const dlc = REGISTRY.find(d => d.id === id);
    if (!dlc || dlc.status === 'locked') return false;
    for (const href of (dlc.styles  || [])) _loadStyle(href);
    for (const src  of (dlc.scripts || [])) await _loadScript(src);
    console.log(`[DLC] "${dlc.name}" загружен`);
    return true;
  }

  // ── Инициализация при старте ──────────────────────────
  // Вызывается после initEventBus() в inline-скрипте
  async function init() {
    const enabled = _getEnabled();
    for (const id of enabled) {
      const dlc = REGISTRY.find(d => d.id === id);
      if (!dlc) { disable(id); continue; } // DLC удалён из реестра
      try {
        await load(id);
      } catch(e) {
        console.warn(`[DLC] Ошибка загрузки "${id}":`, e.message);
        // НЕ отключаем автоматически — пусть юзер решает
      }
    }
  }

  // ── UI helpers ────────────────────────────────────────
  function getAll()    { return REGISTRY; }
  function getById(id) { return REGISTRY.find(d => d.id === id) || null; }

  // Рендер mode-screen: вызывается после DLC загружен в DOM
  function renderModeScreen() {
    const container = document.getElementById('dlc-cards');
    if (!container) return;

    const html = REGISTRY.map(dlc => {
      const on     = isEnabled(dlc.id);
      const locked = dlc.status === 'locked';
      const wip    = dlc.status === 'wip';

      return `
        <div class="dlc-card ${locked ? 'dlc-locked' : ''}" id="dlc-card-${dlc.id}">
          <div class="dlc-card-left">
            <span class="dlc-icon">${dlc.icon}</span>
            <div class="dlc-info">
              <div class="dlc-name">
                ${dlc.name}
                ${wip    ? '<span class="dlc-pill dlc-pill-wip">WIP</span>'    : ''}
                ${locked ? '<span class="dlc-pill dlc-pill-lock">Скоро</span>' : ''}
              </div>
              <div class="dlc-desc">${dlc.desc}</div>
            </div>
          </div>
          ${!locked ? `
          <label class="dlc-toggle" title="${on ? 'Отключить' : 'Включить'} ${dlc.name}">
            <input type="checkbox" ${on ? 'checked' : ''} onchange="DLC.onToggle('${dlc.id}', this.checked)">
            <span class="dlc-toggle-track"><span class="dlc-toggle-thumb"></span></span>
          </label>` : `
          <div class="dlc-toggle-placeholder"></div>`}
        </div>`;
    }).join('');

    container.innerHTML = html || '<p style="color:var(--muted);font-size:13px">Расширений пока нет</p>';
  }

  // Обработчик переключения (inline onchange)
  function onToggle(id, checked) {
    checked ? enable(id) : disable(id);
    // Визуальный фидбек: обновить карточку
    const card = document.getElementById('dlc-card-' + id);
    if (card) card.classList.toggle('dlc-active', checked);

    if (checked) {
      _activateLive(id);
    } else {
      _deactivateLive(id);
    }
  }

  // ── Live-деактивация DLC без перезагрузки страницы ────
  // Модули mastery уже подписаны на advanceMonth/startGame/render,
  // но их обёртки проверяют DLC.isEnabled() перед выполнением логики.
  // disable() выше уже убрал DLC из localStorage → guard вернёт false
  // → все рогалайт-эффекты заморожены немедленно.
  function _deactivateLive(id) {
    const dlc = REGISTRY.find(d => d.id === id);
    if (!dlc) return;

    // Для mastery: убираем pill-индикаторы из заголовка, если есть
    if (id === 'mastery') {
      document.getElementById('rune-active-pill')?.remove();
      document.getElementById('runmap-active-pill')?.remove();
    }

    renderModeScreen();
    if (typeof notify === 'function') {
      notify(`${dlc.icon} ${dlc.name} деактивирован — вступит в силу с этой партии`, 'info');
    }
  }

  // ── Live-активация DLC без перезагрузки страницы ─────
  // При включении DLC через тумблер на mode-screen статические модули
  // (runes/storyarcs/runmap/meta) уже загружены как <script> в index.html,
  // но вернулись на DLC-гейте (DLC был выключен на старте). Сбрасываем
  // __LOADED-флаги и реинжектируем скрипты с cache-buster — IIFE
  // перезапустится, пройдёт гейт (localStorage уже обновлён) и инициализируется.
  async function _activateLive(id) {
    const dlc = REGISTRY.find(d => d.id === id);
    if (!dlc) return;

    // 1) Загружаем DLC-координатор (mastery.js / strategy.js)
    try { await load(id); } catch (e) { console.warn('[DLC] coordinator load:', e); }

    // 2) Для mastery — реактивируем статические модули
    if (id === 'mastery') await _reactivateMasteryModules();

    // 3) Перерисовываем DLC-карточки и уведомляем
    renderModeScreen();
    if (typeof notify === 'function') {
      notify(`${dlc.icon} ${dlc.name} активирован — доступен с этой партии`, 'success');
    }
  }

  // Статические модули mastery — реинжект с cache-busting.
  // Только для модулей, которые ещё не инициализированы (флаг не установлен).
  function _reactivateMasteryModules() {
    const MODS = [
      { flag: '__RUNES_LOADED', src: 'src/runes.js'      },
      { flag: '__SA_LOADED',    src: 'src/storyarcs.js'  },
      { flag: '__RM_LOADED',    src: 'src/runmap.js'     },
      { flag: '__META_LOADED',  src: 'src/meta.js'       },
    ];
    const pending = MODS.filter(m => !window[m.flag]);
    if (!pending.length) return Promise.resolve();

    return Promise.all(pending.map(({ src }) => new Promise(resolve => {
      const s    = document.createElement('script');
      s.src      = `${src}?dlc_ts=${Date.now()}`;
      s.onload   = () => { console.log(`[DLC:mastery] реактивирован: ${src}`); resolve(); };
      s.onerror  = () => { console.warn(`[DLC:mastery] ошибка: ${src}`); resolve(); };
      document.head.appendChild(s);
    })));
  }

  return {
    init,
    load,
    isEnabled,
    enable,
    disable,
    toggle,
    getAll,
    getById,
    renderModeScreen,
    onToggle,
    _activateLive,               // для тестов / внешнего вызова
    _deactivateLive,             // для тестов / внешнего вызова
    _reactivateMasteryModules, // для тестов
  };
})();
