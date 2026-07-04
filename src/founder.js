'use strict';
// ══════════════════════════════════════════════════════════════════════
//  СЛОЙ ОСНОВАТЕЛЯ — скелет (данные-first, DOM-free, Godot-portable)
//  Реализует модель драфта из дизайн-доков (design_founder_*):
//   • пулы: возраст · опыт · происхождение · черта · порок · мотивация · связь
//   • 3 валюты на КАЖДЫЙ параметр: капитал (cap) / системы (opens) / события (evt)
//     — тангибл-фон крен в капитал+системы, личность — в события.
//   • производные: капитал = Σ cap; ноу-хау = union(opens) узлов дерева;
//     событийность = Σ evt; сложность = f(капитал + число открытых).
//  ⚠️ СКЕЛЕТ: чистые данные+функции + тесты. В движок/UI/сборку НЕ вплетён.
//     Веса синхронны с макетом game/ui-founder-lab-mockup.html (единый источник —
//     здесь; макет позже можно перевести на этот модуль).
// ══════════════════════════════════════════════════════════════════════
(function () {
  const root = (typeof window !== 'undefined') ? window : globalThis;

  // ── Дерево систем (13 узлов, 3 ветки) — ключи совпадают с unlocks.js ──
  const TREE = [
    { id: 'hire', n: 'Найм', br: 'A' }, { id: 'life', n: 'Процесс', br: 'A' },
    { id: 'port', n: 'Кейсы', br: 'A' }, { id: 'tree', n: 'Перки', br: 'A' },
    { id: 'sub', n: 'Саббренды', br: 'A' },
    { id: 'scout', n: 'Скаутинг', br: 'B' }, { id: 'nego', n: 'Переговоры', br: 'B' },
    { id: 'market', n: 'Рынок', br: 'B' }, { id: 'shares', n: 'Доли', br: 'B' },
    { id: 'mna', n: 'M&A', br: 'B' },
    { id: 'ai', n: 'Нейросеть', br: 'C' }, { id: 'season', n: 'Сезоны', br: 'C' },
    { id: 'director', n: 'Директор', br: 'C' },
  ];
  const BRANCHES = { A: 'Доставка', B: 'Рынок', C: 'Системы' };

  // ── ПУЛЫ (n = имя, cap/opens/evt = вклад в 3 валюты) ──────────────────
  // Возраст (тангибл: капитал/системы, событий мало)
  const AGES = {
    young:  { n: 'Молодой (18–25)', cap: 0, opens: [],       evt: 1 },
    adult:  { n: 'Взрослый (26–38)', cap: 1, opens: [],       evt: 0 },
    mature: { n: 'Матёрый (39+)',    cap: 2, opens: ['life'], evt: 0 },
  };
  // Происхождение (тангибл-база капитала+систем)
  const ORIGINS = {
    student:   { n: 'Студент',                 cap: 1, opens: [],                              evt: 1 },
    selfmade:  { n: 'Самоучка с нуля',          cap: 0, opens: [],                              evt: 1 },
    savings:   { n: 'Сбережения фрилансера',    cap: 2, opens: [],                              evt: 0 },
    returner:  { n: 'Возвращенец',              cap: 2, opens: ['life'],                        evt: 1 },
    senior:    { n: 'Senior-опыт',              cap: 2, opens: ['life', 'port'],                evt: 0 },
    severance: { n: 'Выходное пособие',         cap: 3, opens: ['life', 'nego'],                evt: 0 },
    brand:     { n: 'Личный бренд',             cap: 2, opens: ['scout'],                       evt: 1 },
    wealthy:   { n: 'Богатая семья',            cap: 4, opens: [],                              evt: 1 },
    operator:  { n: 'Операционист',             cap: 3, opens: ['life', 'hire', 'nego'],        evt: 0 },
    serial:    { n: 'Серийный предприниматель', cap: 3, opens: ['hire', 'scout', 'life', 'nego'], evt: 1 },
    impact:    { n: 'Импакт-капитал',           cap: 3, opens: ['life', 'market'],              evt: 1 },
  };
  // Черта (личность: события ↑, аптитюд-узел, cap слабый)
  const TRAITS = {
    perfectionist: { n: 'Перфекционист',   fx: '+качество, −скорость',        syn: 'бутик-качество', cls: 'Мастер',    cap: 0, opens: ['port'],   evt: 3 },
    charismatic:   { n: 'Харизматик',      fx: '+конверсия офферов, −маржа',  syn: 'воронка продаж', cls: 'Торговец',  cap: 1, opens: ['nego'],   evt: 2 },
    empath:        { n: 'Эмпат',           fx: '+лояльность, −жёсткость',     syn: '«Семья»',        cls: 'Наставник', cap: 0, opens: ['hire'],   evt: 3 },
    strategist:    { n: 'Стратег',         fx: '+эффект. систем/плана',       syn: 'масштаб',        cls: 'Строитель', cap: 1, opens: ['market'], evt: 1 },
    pusher:        { n: 'Пробивной',       fx: '+темп сделок, +риск',         syn: 'вал',            cls: 'Хастлер',   cap: 0, opens: ['scout'],  evt: 2 },
    systematic:    { n: 'Системная',       fx: '+стабильность, −гибкость',    syn: 'процесс/HR',     cls: 'Строитель', cap: 1, opens: ['life'],   evt: 1 },
    composed:      { n: 'Собранная',       fx: '+эффект. в границах',         syn: 'антивыгорание',  cls: 'Прагматик', cap: 1, opens: ['life'],   evt: 1 },
    deep_focus:    { n: 'Глубокий фокус',  fx: '+качество сложного, −продажи', syn: 'tech/продукт',   cls: 'Мастер',    cap: 0, opens: ['ai'],     evt: 2 },
    taste:         { n: 'Насмотренность',  fx: '+оценка/качество вкуса',      syn: 'портфолио+премиум', cls: 'Мастер', cap: 1, opens: ['port'],   evt: 2 },
    principled:    { n: 'Принципиальная',  fx: '+репутация-ниша, −деньги',    syn: 'миссия/репутация', cls: 'Подвижник', cap: -1, opens: ['port'], evt: 3 },
    mediagenic:    { n: 'Медийный',        fx: '+входящие лиды, −доставка',   syn: 'маркетинг/аудитория', cls: 'Торговец', cap: 1, opens: ['scout'], evt: 3 },
    team_player:   { n: 'Командные',       fx: '+синергия команды',          syn: 'наставник+со-фаундер', cls: 'Наставник', cap: 0, opens: ['hire'], evt: 2 },
    hungry:        { n: 'Голодный',        fx: '+темп за меньше денег',       syn: 'андердог/вал',   cls: 'Хастлер',   cap: 0, opens: ['scout'],  evt: 2 },
    client_eye:    { n: 'Взгляд заказчика', fx: '+конверсия/удержание',       syn: 'продажи/переговоры', cls: 'Торговец', cap: 0, opens: ['nego'], evt: 2 },
  };
  // Порок (личность: события ↑↑, систем НЕ открывает)
  const VICES = {
    procrastinator:       { n: 'Прокрастинатор',        fx: 'шанс −дни/мес',        sh: 'Спираль отвлечений',          cap: -1, opens: [], evt: 3 },
    spender:              { n: 'Транжира',              fx: '+личный бёрн',         sh: 'Дорогая игрушка',             cap: -2, opens: [], evt: 2 },
    burnout:              { n: 'Выгорание-склонность',  fx: 'быстрее устаёт',       sh: 'Ты давно не отдыхал',         cap: 0,  opens: [], evt: 3 },
    detached:             { n: 'Отстранённость',        fx: '−лояльность',          sh: 'Нечем гореть',                cap: 0,  opens: [], evt: 2 },
    corner_cutter:        { n: 'Срезает углы',          fx: 'копит риск скандала',  sh: 'По-быстрому',                 cap: 1,  opens: [], evt: 3 },
    analysis_paralysis:   { n: 'Паралич анализа',       fx: 'упускает возможности', sh: 'Окно возможности',            cap: 0,  opens: [], evt: 2 },
    outdated:             { n: '«Отстал(а)»',           fx: '−уверенность/цены',    sh: 'Ты вообще в теме?',           cap: -1, opens: [], evt: 2 },
    social_anxiety:       { n: 'Соц-тревога',           fx: '−конверсия',           sh: 'Клиент хочет созвон',         cap: 0,  opens: [], evt: 3 },
    disillusioned:        { n: 'Разочарование',         fx: '−потолок вовлечённости', sh: 'Поверить снова',            cap: 0,  opens: [], evt: 3 },
    inflexible:           { n: 'Негибкость',            fx: 'отказ от денег',       sh: 'Грязные деньги',              cap: -1, opens: [], evt: 3 },
    hype_addict:          { n: 'Зависимость от хайпа',  fx: 'проседает без внимания', sh: 'Хайп против дела',          cap: 0,  opens: [], evt: 3 },
    conflict_avoidant:    { n: 'Избегание конфликта',   fx: 'копит «обиды»',        sh: 'Разговор, который откладывал', cap: 0, opens: [], evt: 3 },
    outsider:             { n: 'Синдром чужака',        fx: '−нетворк/статус',      sh: 'Тусовка своих',               cap: -1, opens: [], evt: 2 },
    craft_underestimator: { n: 'Недооценка ремесла',    fx: 'риск провала production', sh: 'Это же просто',            cap: 0,  opens: [], evt: 2 },
    control_freak:        { n: 'Контроль-фрик',         fx: '−делегирование',       sh: 'Отпустить критичное',         cap: 1,  opens: [], evt: 2 },
    messiah:              { n: 'Мессианство',           fx: 'распыление',           sh: 'Спасти всех',                 cap: 0,  opens: [], evt: 3 },
    smother:              { n: 'Мать-наседка',          fx: '−рост команды',        sh: 'Он перерос тебя',             cap: 0,  opens: [], evt: 2 },
  };
  // Мотивация (личность: события, часть даёт аптитюд)
  const DRIVES = {
    prove:          { n: 'Доказать',         fx: '+ за престиж',            cap: 0,  opens: [],         evt: 2 },
    freedom:        { n: 'Свобода',          fx: '− за клетку/перегруз',   cap: 0,  opens: [],         evt: 2 },
    legacy:         { n: 'Наследие',         fx: '+ за долгое/устойчивое', cap: 1,  opens: [],         evt: 1 },
    builder_thrill: { n: 'Азарт билдера',    fx: '+ за масштаб',           cap: 1,  opens: ['market'], evt: 2 },
    money:          { n: 'Деньги',           fx: '+ за прибыль/выплаты',   cap: 1,  opens: ['market'], evt: 1 },
    balance:        { n: 'Баланс',           fx: '+ устойчивость',         cap: 1,  opens: [],         evt: 1 },
    make_great:     { n: 'Сделать крутое',   fx: '+ за качество',          cap: 0,  opens: ['port'],   evt: 2 },
    my_way:         { n: 'Сделать по-своему', fx: '+ независимый путь',    cap: 0,  opens: [],         evt: 2 },
    change_world:   { n: 'Изменить мир',     fx: '+ за этичное',           cap: -1, opens: [],         evt: 2 },
    fame:           { n: 'Охваты/слава',     fx: '+ за бренд',             cap: 1,  opens: ['scout'],  evt: 3 },
    together:       { n: 'Вместе',           fx: '+ партнёрство',          cap: 0,  opens: [],         evt: 2 },
    escape:         { n: 'Вырваться',        fx: '+ из низов',             cap: 0,  opens: [],         evt: 2 },
    do_it_right:    { n: 'Сделать как надо', fx: '+ «правильно» клиенту',  cap: 0,  opens: ['nego'],   evt: 2 },
  };
  // Связь-опенер (тангибл-актив: капитал+система, e ниже кроме драматичных)
  const BONDS = {
    dev_friend:     { n: 'Друг-разработчик',     fx: '1 бесплатный джун',            cap: 0,  opens: ['hire'],   evt: 1 },
    dad_network:    { n: 'Отцовский нетворк',    fx: 'изредка крупный клиент',       cap: 2,  opens: [],         evt: 2 },
    loyal_client:   { n: 'Лояльный клиент',      fx: '1 гарант-проект',              cap: 1,  opens: [],         evt: 1 },
    mercenaries:    { n: 'Команда варягов',      fx: 'сильный ростер, −лояльность',  cap: 1,  opens: ['hire'],   evt: 1 },
    shady_partner:  { n: 'Сомнительный партнёр', fx: 'поток мелких + мутные сделки', cap: 1,  opens: [],         evt: 3 },
    ex_colleague:   { n: 'Бывший коллега',       fx: 'контракт от работодателя',     cap: 1,  opens: ['nego'],   evt: 1 },
    word_of_mouth:  { n: 'Сарафан',              fx: 'слабый стабильный поток',      cap: 0,  opens: [],         evt: 0 },
    fan_client:     { n: 'Фанат-заказчик',       fx: '1 проект от поклонника',       cap: 0,  opens: [],         evt: 1 },
    old_contacts:   { n: 'Старые контакты',      fx: 'доступ к индустрии',           cap: 1,  opens: ['market'], evt: 1 },
    community:      { n: 'Комьюнити/НКО',        fx: 'соц-заказы, +лояльность-ниша', cap: -1, opens: [],         evt: 2 },
    own_audience:   { n: 'Своя аудитория',       fx: 'регулярные лиды из бренда',    cap: 1,  opens: ['scout'],  evt: 2 },
    cofounder:      { n: 'Со-основатель',        fx: '2-й юнит + арка партнёрства',  cap: 1,  opens: ['hire'],   evt: 3 },
    hometown_tie:   { n: 'Земляк',               fx: 'первый заказ, вход в город',   cap: 0,  opens: [],         evt: 1 },
    market_insider: { n: 'Инсайд рынка',         fx: 'эмпатия-бонус к продажам',     cap: 1,  opens: ['market'], evt: 1 },
  };

  // ── Пресеты (17 портретов) — драфт по ключам пулов ────────────────────
  const PRESETS = [
    { id: 'mark',   n: 'Марк',   tier: 'Струггер',     age: 'young',  exp: 1,  origin: 'student',   trait: 'perfectionist', vice: 'procrastinator',     drive: 'prove',          bond: 'dev_friend' },
    { id: 'dania',  n: 'Даня',   tier: 'Крепкий',      age: 'adult',  exp: 2,  origin: 'wealthy',   trait: 'charismatic',   vice: 'spender',            drive: 'freedom',        bond: 'dad_network' },
    { id: 'ira',    n: 'Ира',    tier: 'Крепкий',      age: 'adult',  exp: 7,  origin: 'senior',    trait: 'empath',        vice: 'burnout',            drive: 'legacy',         bond: 'loyal_client' },
    { id: 'victor', n: 'Виктор', tier: 'Состоявшийся', age: 'mature', exp: 12, origin: 'serial',    trait: 'strategist',    vice: 'detached',           drive: 'builder_thrill', bond: 'mercenaries' },
    { id: 'romych', n: 'Ромыч',  tier: 'Струггер',     age: 'young',  exp: 3,  origin: 'selfmade',  trait: 'pusher',        vice: 'corner_cutter',      drive: 'money',          bond: 'shady_partner' },
    { id: 'pavel',  n: 'Павел',  tier: 'Крепкий',      age: 'adult',  exp: 12, origin: 'severance', trait: 'systematic',    vice: 'analysis_paralysis', drive: 'freedom',        bond: 'ex_colleague' },
    { id: 'olya',   n: 'Оля',    tier: 'Крепкий',      age: 'adult',  exp: 6,  origin: 'returner',  trait: 'composed',      vice: 'outdated',           drive: 'balance',        bond: 'word_of_mouth' },
    { id: 'tema',   n: 'Тёма',   tier: 'Струггер',     age: 'young',  exp: 2,  origin: 'student',   trait: 'deep_focus',    vice: 'social_anxiety',     drive: 'make_great',     bond: 'fan_client' },
    { id: 'gleb',   n: 'Глеб',   tier: 'Состоявшийся', age: 'mature', exp: 12, origin: 'senior',    trait: 'taste',         vice: 'disillusioned',      drive: 'my_way',         bond: 'old_contacts' },
    { id: 'sonya',  n: 'Соня',   tier: 'Струггер',     age: 'young',  exp: 2,  origin: 'selfmade',  trait: 'principled',    vice: 'inflexible',         drive: 'change_world',   bond: 'community' },
    { id: 'vlad',   n: 'Влад',   tier: 'Крепкий',      age: 'adult',  exp: 3,  origin: 'brand',     trait: 'mediagenic',    vice: 'hype_addict',        drive: 'fame',           bond: 'own_audience' },
    { id: 'dvoe',   n: '«Двое»', tier: 'Струггер',     age: 'young',  exp: 1,  origin: 'student',   trait: 'team_player',   vice: 'conflict_avoidant',  drive: 'together',       bond: 'cofounder' },
    { id: 'zhenya', n: 'Женя',   tier: 'Струггер',     age: 'young',  exp: 3,  origin: 'selfmade',  trait: 'hungry',        vice: 'outsider',           drive: 'escape',         bond: 'hometown_tie' },
    { id: 'nastya', n: 'Настя',  tier: 'Крепкий',      age: 'adult',  exp: 6,  origin: 'savings',   trait: 'client_eye',    vice: 'craft_underestimator', drive: 'do_it_right',  bond: 'market_insider' },
    { id: 'marina', n: 'Марина', tier: 'Состоявшийся', age: 'mature', exp: 12, origin: 'operator',  trait: 'systematic',    vice: 'control_freak',      drive: 'balance',        bond: 'old_contacts' },
    { id: 'artur',  n: 'Артур',  tier: 'Состоявшийся', age: 'mature', exp: 12, origin: 'impact',    trait: 'strategist',    vice: 'messiah',            drive: 'change_world',   bond: 'community' },
    { id: 'tamara', n: 'Тамара', tier: 'Состоявшийся', age: 'mature', exp: 12, origin: 'senior',    trait: 'empath',        vice: 'smother',            drive: 'legacy',         bond: 'loyal_client' },
  ];

  // ── ЧИСТЫЕ ФУНКЦИИ РАСЧЁТА ────────────────────────────────────────────
  const POOL = { age: AGES, origin: ORIGINS, trait: TRAITS, vice: VICES, drive: DRIVES, bond: BONDS };
  const nz = v => (typeof v === 'number' && isFinite(v)) ? v : 0;
  const clampExp = y => Math.max(0, Math.min(12, Math.round(nz(y))));

  function expCap(y) { return Math.floor(clampExp(y) / 4); }          // 0..3
  function expOpens(y) { const a = []; y = clampExp(y);
    if (y >= 3) a.push('life'); if (y >= 6) a.push('hire');
    if (y >= 9) a.push('nego'); if (y >= 12) a.push('port'); return a; }

  function _entry(kind, id) { return POOL[kind] && POOL[kind][id]; }

  function capitalOf(d) {
    return nz(AGES[d.age] && AGES[d.age].cap) + expCap(d.exp)
      + nz(ORIGINS[d.origin] && ORIGINS[d.origin].cap)
      + nz(TRAITS[d.trait] && TRAITS[d.trait].cap)
      + nz(VICES[d.vice] && VICES[d.vice].cap)
      + nz(DRIVES[d.drive] && DRIVES[d.drive].cap)
      + nz(BONDS[d.bond] && BONDS[d.bond].cap);
  }
  function openedOf(d) {
    const s = new Set();
    [AGES[d.age], ORIGINS[d.origin], TRAITS[d.trait], DRIVES[d.drive], BONDS[d.bond]]
      .forEach(e => { if (e && Array.isArray(e.opens)) e.opens.forEach(x => s.add(x)); });
    expOpens(d.exp).forEach(x => s.add(x));
    return [...s];
  }
  function eventWeightOf(d) {
    return nz(AGES[d.age] && AGES[d.age].evt)
      + nz(ORIGINS[d.origin] && ORIGINS[d.origin].evt)
      + nz(TRAITS[d.trait] && TRAITS[d.trait].evt)
      + nz(VICES[d.vice] && VICES[d.vice].evt)
      + nz(DRIVES[d.drive] && DRIVES[d.drive].evt)
      + nz(BONDS[d.bond] && BONDS[d.bond].evt);
  }
  function classOf(d) { return (TRAITS[d.trait] && TRAITS[d.trait].cls) || '—'; }

  // Сложность — производная (капитал + число открытых узлов). Не выбирается.
  function challengeOf(d) {
    const s = Math.max(0, Math.round(capitalOf(d))) + openedOf(d).length;
    if (s <= 2)  return { tier: 'Брутальный старт', reward: 2.2, score: s };
    if (s <= 6)  return { tier: 'Крутой подъём',    reward: 1.7, score: s };
    if (s <= 11) return { tier: 'Уверенный старт',  reward: 1.4, score: s };
    return { tier: 'Мягкий вход', reward: 1.0, score: s };
  }

  function compute(d) {
    return {
      capital: capitalOf(d),
      opened: openedOf(d),
      eventWeight: eventWeightOf(d),
      cls: classOf(d),
      challenge: challengeOf(d),
    };
  }

  const KEYS = ['age', 'exp', 'origin', 'trait', 'vice', 'drive', 'bond'];
  function validate(d) {
    if (!d || typeof d !== 'object') return { ok: false, reason: 'no_draft' };
    for (const k of KEYS) {
      if (k === 'exp') { if (typeof d.exp !== 'number') return { ok: false, reason: 'exp' }; continue; }
      if (!_entry(k, d[k])) return { ok: false, reason: k };
    }
    return { ok: true };
  }

  function preset(id) { const p = PRESETS.find(x => x.id === id); return p ? Object.assign({}, p) : null; }
  function list() { return PRESETS.map(p => p.id); }

  root.Founder = {
    TREE, BRANCHES,
    POOLS: { ages: AGES, origins: ORIGINS, traits: TRAITS, vices: VICES, drives: DRIVES, bonds: BONDS },
    PRESETS,
    // расчёт
    compute, capitalOf, openedOf, eventWeightOf, classOf, challengeOf,
    expCap, expOpens, validate, preset, list, nodeName: id => (TREE.find(n => n.id === id) || {}).n || id,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = root.Founder;
})();
