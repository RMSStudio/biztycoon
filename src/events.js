// ══════════════════════════════════════════════════════
//  EVENTBUS — шина событий (Godot-совместимый паттерн)
//
//  В Godot этот модуль заменяется встроенными сигналами:
//    EventBus.emit('render')         → emit_signal("render")
//    EventBus.on('render', fn)       → connect("render", fn)
//
//  Загружается первым — до engine.js и ui.js.
//  Engine только emit-ит, UI только подписывается.
//  Прямых вызовов между engine↔ui нет.
// ══════════════════════════════════════════════════════

const EventBus = {
  _listeners: {},

  // Подписаться на событие
  on(event, fn) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(fn);
    return this; // для чейнинга
  },

  // Отписаться
  off(event, fn) {
    this._listeners[event] = (this._listeners[event] || []).filter(f => f !== fn);
  },

  // Отправить событие всем подписчикам
  emit(event, data = {}) {
    (this._listeners[event] || []).forEach(fn => {
      try { fn(data); }
      catch (e) { console.error(`EventBus [${event}] handler error:`, e); }
    });
  },
};

// ── Справочник всех сигналов игры ────────────────────
// (для удобства поиска и документации переноса в Godot)
//
//  Сигнал           Данные                              Godot-эквивалент
//  ─────────────────────────────────────────────────────────────────────
//  'notify'         {msg, type}                         emit_signal("notify", msg, type)
//  'navigate'       {screen}                            emit_signal("navigate", screen)
//  'render'         {}                                  emit_signal("render")
//  'show_event'     {ev}                                emit_signal("show_event", ev)
//  'end_game'       {won}                               emit_signal("end_game", won)
//  'spec_selected'  {id}                                emit_signal("spec_selected", id)
//  'show_scout'     {offers}                            emit_signal("show_scout", offers)
//  'close_scout'    {}                                  emit_signal("close_scout")
//  'show_confirm'   {icon,title,body,                   emit_signal("show_confirm", ...)
//                    confirmText,confirmClass,onConfirm}
//  ('focus_changed' удалён в v2.7 — система фокуса упразднена)
//  'ai_purchased'        {}                             emit_signal("ai_purchased")
//  'ai_upgrading'        {level, months}               emit_signal("ai_upgrading", ...)
//  'ai_training_complete' {level}                      emit_signal("ai_training_complete", ...)
//  'ai_thinking'         {delay}                       emit_signal("ai_thinking", ...)
//  'ai_response_ready'   {text}                        emit_signal("ai_response_ready", ...)
