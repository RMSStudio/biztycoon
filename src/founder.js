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

  // ══════════════════════════════════════════════════════════════════════
  //  ХАРАКТЕР → TraitEngine (§7-quinque killer-связка, гибрид-модель)
  //
  //  Основатель = особый юнит-носитель трейтов: его черта (f_*) и порок (fv_*)
  //  исполняются TraitEngine НА ВСЕХ проектах (виртуальный юнит в traits.js).
  //  Гибрид: «мод» = безусловные правила (±числа), «синергия» = условные
  //  билдообразующие (состав команды × открытые узлы). founderOnly:true —
  //  НЕ попадает в скаут-пул кандидатов. Часть пороков — заготовки с пустыми
  //  hooks: их дебафы раскроются событийным слоем (design_founder_events).
  //  Числа черновые — под balance-pass.
  // ══════════════════════════════════════════════════════════════════════

  // Параметры основателя (§7-sextus характер-лист): 0..100, поля G (DOM-free)
  const PARAM_DEFAULTS = { focus: 50, confidence: 50, energy: 70, toughness: 40 };
  const PARAM_NAMES = { focus: 'Фокус', confidence: 'Уверенность', energy: 'Энергия', toughness: 'Жёсткость' };

  const FOUNDER_TRAITS = [
    // ── ЧЕРТЫ (мод + синергия) ──────────────────────────────────────────
    { id:'f_perfectionist', name:'Перфекционист', icon:'💎', family:'founder', founderOnly:true,
      hooks:{ calcQuality:[ { when:[], do:[ { qAdd:2 } ] },
                            { when:[ { countGradeInStaff:{ grade:'senior', min:2 } }, { moduleOpen:'port' } ], do:[ { qAdd:2 } ] } ],
              calcSpeed:  [ { when:[], do:[ { speedMult:-0.08 } ] } ] },
      desc:'+2 Q всем проектам, −8% скорость. Билд «Эталон»: 2+ senior и Кейсы → ещё +2 Q.' },
    { id:'f_charismatic', name:'Харизматик', icon:'😎', family:'founder', founderOnly:true,
      hooks:{ calcPayout:[ { when:[], do:[ { payoutMult:-0.05 } ] },
                           { when:[ { moduleOpen:'scout' }, { moduleOpen:'nego' } ], do:[ { payoutMult:0.12 } ] } ],
              onDeliver: [ { when:[], do:[ { rep:1 } ] } ] },
      desc:'Имя растёт с каждой сдачей (+1 реп), но маржа −5%. Воронка: Скаутинг+Переговоры → +12% выплата.' },
    { id:'f_empath', name:'Эмпат', icon:'🫂', family:'founder', founderOnly:true,
      hooks:{ onMonth:    [ { when:[], do:[ { moodAdd:2, target:'staff_all' } ] } ],
              calcQuality:[ { when:[ { teamMood:{ min:75 } } ], do:[ { qAdd:2 } ] } ] },
      desc:'+2 морали команде каждый месяц. «Семья»: при морали 75+ проекты получают +2 Q.' },
    { id:'f_strategist', name:'Стратег', icon:'♟️', family:'founder', founderOnly:true,
      hooks:{ calcUpkeep:[ { when:[], do:[ { upkeepMult:-0.03 } ] } ],
              calcPayout:[ { when:[ { moduleOpen:'market' } ], do:[ { payoutMult:0.08 } ] } ] },
      desc:'Планирование: −3% ФОТ. Масштаб: с Живым рынком +8% выплата.' },
    { id:'f_pusher', name:'Пробивной', icon:'🥊', family:'founder', founderOnly:true,
      hooks:{ calcSpeed: [ { when:[], do:[ { speedMult:0.12 } ] } ],
              calcRisk:  [ { when:[], do:[ { riskMult:0.2 } ] } ],
              calcPayout:[ { when:[ { moduleOpen:'scout' } ], do:[ { payoutAdd:8000 } ] } ] },
      desc:'+12% темп всех проектов, но риск-события бьют на 20% сильнее. Со Скаутингом +8К к выплатам.' },
    { id:'f_systematic', name:'Системная', icon:'📐', family:'founder', founderOnly:true,
      hooks:{ calcRisk: [ { when:[], do:[ { riskMult:-0.15 } ] } ],
              calcSpeed:[ { when:[], do:[ { speedMult:-0.05 } ] },
                          { when:[ { moduleOpen:'life' } ], do:[ { speedMult:0.12 } ] } ] },
      desc:'Порядок гасит риски (−15%), но −5% гибкости. С Процессом (Lifecycle) +12% скорость.' },
    { id:'f_composed', name:'Собранная', icon:'🧊', family:'founder', founderOnly:true,
      hooks:{ onMonth:  [ { when:[], do:[ { fatigueAdd:-1 } ] } ],
              calcSpeed:[ { when:[ { teamMood:{ min:70 } } ], do:[ { speedMult:0.05 } ] } ] },
      desc:'Границы: −1 усталости команды/мес; при морали 70+ ещё +5% темп.' },
    { id:'f_deep_focus', name:'Глубокий фокус', icon:'🔬', family:'founder', founderOnly:true,
      hooks:{ calcQuality:[ { when:[ { projectTier:{ min:3 } } ], do:[ { qMult:0.15 } ] } ],
              calcPayout: [ { when:[], do:[ { payoutMult:-0.05 } ] } ] },
      desc:'×1.15 качество на сложных T3+, но продажи хромают: −5% выплата.' },
    { id:'f_taste', name:'Насмотренность', icon:'🖼', family:'founder', founderOnly:true,
      hooks:{ calcQuality:[ { when:[], do:[ { qAdd:2 } ] } ],
              onDeliver:  [ { when:[ { moduleOpen:'port' } ], do:[ { rep:1 } ] } ] },
      desc:'+2 Q всем проектам. С Кейсами каждая сдача добавляет +1 репутации.' },
    { id:'f_principled', name:'Принципиальная', icon:'🧭', family:'founder', founderOnly:true,
      hooks:{ calcPayout:[ { when:[], do:[ { payoutMult:-0.08 } ] },
                           { when:[ { companyStage:{ min:2 } } ], do:[ { payoutMult:0.12 } ] } ],
              onDeliver: [ { when:[], do:[ { rep:1 } ] } ] },
      desc:'Не берёт «любые» деньги (−8%), зато имя растёт (+1 реп/сдача); со стадии «Студия» ниша платит +12%.' },
    { id:'f_mediagenic', name:'Медийный', icon:'📣', family:'founder', founderOnly:true,
      hooks:{ calcSpeed: [ { when:[], do:[ { speedMult:-0.07 } ] } ],
              onDeliver: [ { when:[], do:[ { rep:1 } ] } ],
              calcPayout:[ { when:[ { moduleOpen:'scout' } ], do:[ { payoutMult:0.08 } ] } ] },
      desc:'Вечно на сцене: −7% доставка, +1 реп за сдачу. Со Скаутингом аудитория конвертится: +8% выплата.' },
    { id:'f_team_player', name:'Командный', icon:'🤝', family:'founder', founderOnly:true,
      hooks:{ calcQuality:[ { when:[ { teamSize:{ min:3 } } ], do:[ { qAdd:2 } ] } ],
              calcSpeed:  [ { when:[ { teamSize:{ max:0 } } ], do:[ { speedMult:-0.15 } ] } ] },
      desc:'В команде 3+ человек раскрывается (+2 Q), в одиночку буксует (−15% темп).' },
    { id:'f_hungry', name:'Голодный', icon:'🔥', family:'founder', founderOnly:true,
      hooks:{ calcSpeed: [ { when:[], do:[ { speedMult:0.1 } ] },
                           { when:[ { projectTier:{ max:1 } } ], do:[ { speedMult:0.15 } ] } ],
              calcUpkeep:[ { when:[], do:[ { upkeepMult:-0.05 } ] } ] },
      desc:'+10% темп и −5% ФОТ (все стараются). Андердог-вал: мелкие T1 ещё +15% быстрее.' },
    { id:'f_client_eye', name:'Взгляд заказчика', icon:'👁', family:'founder', founderOnly:true,
      hooks:{ calcPayout: [ { when:[], do:[ { payoutMult:0.05 } ] },
                            { when:[ { moduleOpen:'nego' } ], do:[ { payoutMult:0.08 } ] } ],
              calcQuality:[ { when:[], do:[ { qAdd:-1 } ] } ] },
      desc:'Знает, за что платят: +5% выплата (с Переговорами +8%), но production — слепая зона (−1 Q).' },

    // ── ПОРОКИ (дебаф; часть — заготовки под тень-события) ──────────────
    { id:'fv_procrastinator', name:'Прокрастинатор', icon:'🌀', family:'vice', founderOnly:true,
      hooks:{ calcSpeed:[ { when:[], do:[ { speedMult:-0.07 } ] } ] },
      desc:'Сроки тянутся: −7% темп всех проектов (потерянные дни).' },
    { id:'fv_spender', name:'Транжира', icon:'💸', family:'vice', founderOnly:true,
      hooks:{ onMonth:[ { when:[], do:[ { money:-8000 } ] },
                        { when:[ { chance:0.2 } ], do:[ { money:-15000 } ] } ] },
      desc:'Личный бёрн −8К/мес; иногда (20%) импульс-покупка ещё −15К.' },
    { id:'fv_burnout', name:'Выгорание-склонность', icon:'🕯', family:'vice', founderOnly:true,
      hooks:{ onMonth:[ { when:[], do:[ { fatigueAdd:2 } ] } ] },
      desc:'Горит сам и поджигает команду: +2 усталости каждый месяц.' },
    { id:'fv_detached', name:'Отстранённость', icon:'🧱', family:'vice', founderOnly:true,
      hooks:{ onMonth:[ { when:[], do:[ { moodAdd:-1, target:'staff_all' } ] } ] },
      desc:'Холоден с людьми: −1 морали всем каждый месяц.' },
    { id:'fv_corner_cutter', name:'Срезает углы', icon:'✂️', family:'vice', founderOnly:true,
      hooks:{ calcRisk:[ { when:[], do:[ { riskMult:0.25 } ] } ] },
      desc:'«По-быстрому»: риск-события бьют проекты на 25% сильнее.' },
    { id:'fv_analysis_paralysis', name:'Паралич анализа', icon:'🔁', family:'vice', founderOnly:true,
      hooks:{ calcSpeed:[ { when:[], do:[ { speedMult:-0.08 } ] } ] },
      desc:'Решения зависают: −8% темп (упущенные окна — в событиях).' },
    { id:'fv_outdated', name:'«Отстал(а)»', icon:'📼', family:'vice', founderOnly:true,
      hooks:{ calcPayout:[ { when:[], do:[ { payoutMult:-0.06 } ] } ] },
      desc:'Занижает цены, не веря в себя: −6% выплата.' },
    { id:'fv_social_anxiety', name:'Соц-тревога', icon:'🚪', family:'vice', founderOnly:true,
      hooks:{ calcPayout:[ { when:[], do:[ { payoutMult:-0.05 } ] } ] },
      desc:'Избегает созвонов и дожимов: −5% выплата (главная цена — в событиях).' },
    { id:'fv_disillusioned', name:'Разочарование', icon:'🌫', family:'vice', founderOnly:true,
      hooks:{ calcQuality:[ { when:[], do:[ { qAdd:-1 } ] } ] },
      desc:'Потолок вовлечённости: −1 Q всем проектам, пока не «поверит снова».' },
    { id:'fv_inflexible', name:'Негибкость', icon:'🗿', family:'vice', founderOnly:true,
      hooks:{ calcPayout:[ { when:[], do:[ { payoutMult:-0.05 } ] } ] },
      desc:'Отказывается от «не тех» денег: −5% выплата.' },
    { id:'fv_hype_addict', name:'Зависимость от хайпа', icon:'🎇', family:'vice', founderOnly:true,
      hooks:{},
      desc:'Проседает без внимания — раскроется founder-событиями («Хайп против дела»).' },
    { id:'fv_conflict_avoidant', name:'Избегание конфликта', icon:'🙈', family:'vice', founderOnly:true,
      hooks:{},
      desc:'Копит «обиды» в команде — раскроется founder-событиями (риск раскола).' },
    { id:'fv_outsider', name:'Синдром чужака', icon:'🚷', family:'vice', founderOnly:true,
      hooks:{},
      desc:'Не «свой» в тусовке — раскроется founder-событиями (нетворк/статус).' },
    { id:'fv_craft_underestimator', name:'Недооценка ремесла', icon:'🎲', family:'vice', founderOnly:true,
      hooks:{ calcRisk:[ { when:[], do:[ { riskMult:0.15 } ] } ] },
      desc:'«Это же просто»: недооценивает production — риск-события +15%.' },
    { id:'fv_control_freak', name:'Контроль-фрик', icon:'🔒', family:'vice', founderOnly:true,
      hooks:{ calcSpeed:[ { when:[ { teamSize:{ min:2 } } ], do:[ { speedMult:-0.06 } ] } ] },
      desc:'Не делегирует: с командой 2+ человек все ждут его апрува (−6% темп).' },
    { id:'fv_messiah', name:'Мессианство', icon:'🕊', family:'vice', founderOnly:true,
      hooks:{ onMonth:[ { when:[], do:[ { fatigueAdd:1 } ] } ] },
      desc:'Спасает всех разом — распыление: +1 усталости команды/мес.' },
    { id:'fv_smother', name:'Мать-наседка', icon:'🐣', family:'vice', founderOnly:true,
      hooks:{},
      desc:'Опекает до удушья — рост команды тормозится (раскроется founder-событиями).' },
  ];

  // ── Рантайм-состояние основателя в G (создание/параметры) ─────────────
  function initState(g, draft) {
    if (!g) return null;
    const d = draft ? Object.assign({}, draft) : preset('mark');
    const v = validate(d);
    if (!v.ok) return null;
    const c = compute(d);
    g.founder = {
      draft: d,
      name: d.n || (PRESETS.find(p => p.id === d.id) || {}).n || 'Основатель',
      presetId: d.id || null,
      cls: c.cls,
      rlTraits: ['f_' + d.trait, 'fv_' + d.vice],
      params: Object.assign({}, PARAM_DEFAULTS),
      _rlStacks: {},
    };
    try { if (typeof EventBus !== 'undefined' && EventBus.emit) EventBus.emit('founder_init', { founder: g.founder }); } catch (e) {}
    return g.founder;
  }
  function param(g, key) {
    return (g && g.founder && g.founder.params && typeof g.founder.params[key] === 'number')
      ? g.founder.params[key] : null;
  }
  function paramAdd(g, key, delta) {
    if (!g || !g.founder || !(key in PARAM_DEFAULTS)) return null;
    const p = g.founder.params;
    const before = typeof p[key] === 'number' ? p[key] : PARAM_DEFAULTS[key];
    p[key] = Math.max(0, Math.min(100, before + (delta || 0)));
    try { if (typeof EventBus !== 'undefined' && EventBus.emit) EventBus.emit('founder_param', { key, value: p[key], delta: p[key] - before }); } catch (e) {}
    return p[key];
  }

  root.Founder = {
    TREE, BRANCHES,
    POOLS: { ages: AGES, origins: ORIGINS, traits: TRAITS, vices: VICES, drives: DRIVES, bonds: BONDS },
    PRESETS,
    // расчёт
    compute, capitalOf, openedOf, eventWeightOf, classOf, challengeOf,
    expCap, expOpens, validate, preset, list, nodeName: id => (TREE.find(n => n.id === id) || {}).n || id,
    // характер → TraitEngine + параметры (§7-quinque/sextus)
    FOUNDER_TRAITS, PARAM_DEFAULTS, PARAM_NAMES,
    initState, param, paramAdd,
  };

  // Регистрация характер-трейтов в TraitEngine (порядок загрузки не важен:
  // если движок ещё не поднят — он сам подберёт из root.FOUNDER_TRAITS)
  root.FOUNDER_TRAITS = FOUNDER_TRAITS;
  try { if (root.TraitEngine && root.TraitEngine.load) root.TraitEngine.load(FOUNDER_TRAITS); } catch (e) {}

  if (typeof module !== 'undefined' && module.exports) module.exports = root.Founder;
})();
