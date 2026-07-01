// ══════════════════════════════════════════════════════
//  Ф.7 — Система «Открытие механик» (режим Rogue-lite, DLC id 'unlocks')
//
//  Скелет (§11.7 шаг 1). Всегда загружается как <script>, но АКТИВНА только
//  когда включён DLC 'unlocks' (тумблер на mode-screen). Вне режима
//  isModuleUnlocked() === true → обычная игра и «Прокачка» (mastery) НЕ меняются.
//
//  Хранит межрановую мету режима (какие модули открыты) в localStorage
//  'bt_unlocks_v1'. Экспертизу/траты добавит следующий шаг; здесь — реестр,
//  состояние и гейт-хелпер, на который системы навешивают проверки.
//
//  Дизайн: backlog/design_roguelite_meta.md §11 (лестница), §14 (архитектура),
//  §15 (петля). Ядро DOM-free (только localStorage + чистые функции).
// ══════════════════════════════════════════════════════

(function () {
  'use strict';
  if (window.__UNLOCKS_LOADED) return;
  window.__UNLOCKS_LOADED = true;

  const MODE_ID  = 'unlocks';
  const LS_MODE  = 'bt_enabled_dlcs_v1';   // общий список включённых DLC/режимов
  const LS_STATE = 'bt_unlocks_v1';        // { opened:[id,…] } — межрановая мета режима

  // 13 модулей (§11.3). tier — для мягких пререквизитов, cost — экспертиза (заглушки).
  // Роман планирует поменять конкретные пункты позже — важна структура, не имена.
  const MODULE_UNLOCKS = [
    { id:'hire',     branch:'A', tier:1, name:'Найм',             cost:100 },
    { id:'life',     branch:'A', tier:2, name:'Lifecycle-фазы',   cost:200 },
    { id:'port',     branch:'A', tier:3, name:'Портфолио/Кейсы',  cost:300 },
    { id:'tree',     branch:'A', tier:4, name:'Древо перков 2.0', cost:450 },
    { id:'sub',      branch:'A', tier:5, name:'Саббренды/Офисы',  cost:650 },
    { id:'scout',    branch:'B', tier:1, name:'Скаутинг',         cost:100 },
    { id:'nego',     branch:'B', tier:2, name:'Переговоры',       cost:200 },
    { id:'market',   branch:'B', tier:3, name:'Живой рынок',      cost:350 },
    { id:'shares',   branch:'B', tier:4, name:'Доли/акции',       cost:500 },
    { id:'mna',      branch:'B', tier:5, name:'Поглощения M&A',   cost:700 },
    { id:'ai',       branch:'C', tier:2, name:'Нейросеть',        cost:250 },
    { id:'season',   branch:'C', tier:3, name:'Сезоны',           cost:400 },
    { id:'director', branch:'C', tier:4, name:'Директор давления',cost:600 },
  ];
  const BY_ID = {};
  MODULE_UNLOCKS.forEach(m => { BY_ID[m.id] = m; });

  function _lsGet(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function _lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  // Режим включён? (читаем localStorage живьём — тумблер работает без перезагрузки)
  function isActive() {
    const arr = _lsGet(LS_MODE) || [];
    return Array.isArray(arr) && arr.includes(MODE_ID);
  }

  function _state() {
    const s = _lsGet(LS_STATE);
    return (s && Array.isArray(s.opened)) ? s : { opened: [] };
  }
  function getOpened() { return _state().opened.slice(); }

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

  function unlock(id) {
    if (!BY_ID[id]) return false;
    const s = _state();
    if (!s.opened.includes(id)) { s.opened.push(id); _lsSet(LS_STATE, s); }
    return true;
  }
  function reset() { _lsSet(LS_STATE, { opened: [] }); }
  function list() { return MODULE_UNLOCKS.map(m => ({ ...m, open: isModuleUnlocked(m.id), avail: available(m.id) })); }

  window.Unlocks = { MODE_ID, MODULE_UNLOCKS, isActive, isModuleUnlocked, available, unlock, getOpened, reset, list };
  // Глобальный шорткат — на него навешивают гейты системы (staff/projects/…):
  //   if (!isModuleUnlocked('hire')) { …заблокировать… }
  window.isModuleUnlocked = isModuleUnlocked;

  try {
    console.log('[unlocks] Ф.7 система открытий загружена. Режим активен: ' + isActive() +
      (isActive() ? (' · открыто ' + getOpened().length + '/' + MODULE_UNLOCKS.length) : ' (обычная игра — всё доступно)'));
  } catch (e) {}
})();
