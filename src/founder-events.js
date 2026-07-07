'use strict';
// ══════════════════════════════════════════════════════════════════════
//  FOUNDER-СОБЫТИЯ — «тени», жизненные дилеммы и кризисы основателя
//  (design_founder_events.md §1–§4; слой основателя §7-sextus)
//
//  Данные-first + DOM-free раздатчик. Показ — через СУЩЕСТВУЮЩИЙ модал
//  движка (EventBus 'show_event'), формат вилок как WORK/SEASON_EVENTS.
//
//  Петля: month_advanced → (режим Rogue-lite + G.founder) → отбор eligible
//  по триггерам (§2: vice/trait/drive/bond/class/param/month/tag/chain) →
//  кризисы приоритетом → взвешенный розыгрыш 0–1 события. ЧАСТОТА — главная
//  ручка (FE.TUNING): базовый шанс + событийность драфта (Σ evt-весов),
//  глобальный кулдаун, чтобы не забивать бизнес-геймплей.
//
//  Выборы двигают ПАРАМЕТРЫ основателя (focus/confidence/energy/toughness),
//  метрики компании, дают/снимают трейты (рост И деградация — grant/remove),
//  ставят теги для будущих триггеров, запускают цепочки (chain). Тон выбора
//  (growth/degrade) копится в g.founder.tone — мета-скоринг «как вёл человека».
//
//  Вне режима / без основателя — полный no-op. Числа черновые (balance-pass).
// ══════════════════════════════════════════════════════════════════════
(function () {
  const root = (typeof window !== 'undefined') ? window : globalThis;
  if (root.__FOUNDER_EVENTS_LOADED) return;
  root.__FOUNDER_EVENTS_LOADED = true;

  // ── Ручки частоты (§5: «частота — главная ручка») ────────────────────
  const TUNING = {
    baseChance: 0.10,      // базовый шанс события в месяц
    perEvtWeight: 0.025,   // + за единицу «событийности» драфта (Σ evt-весов)
    maxChance: 0.45,       // потолок
    globalCooldown: 2,     // мин. месяцев между founder-событиями
    startMonth: 2,         // первые месяцы не трогаем (игрок осваивается)
  };

  // ── Трейты-последствия (рост/деградация) — регистрируются в TraitEngine ──
  const FE_TRAITS = [
    // деградация
    { id:'fe_bluff', name:'Блеф', icon:'🎭', family:'vice', founderOnly:true,
      hooks:{ calcRisk:[ { when:[], do:[ { riskMult:0.1 } ] } ] },
      desc:'Кивает в темах, которых не знает — рано или поздно проколется (+10% риск).' },
    { id:'fe_ponty', name:'Понты', icon:'🕶', family:'vice', founderOnly:true,
      hooks:{ onMonth:[ { when:[], do:[ { money:-4000 } ] } ] },
      desc:'Образ стоит денег: −4К/мес на поддержание статуса.' },
    { id:'fe_all_on_money', name:'Всё на деньгах', icon:'🧾', family:'vice', founderOnly:true,
      hooks:{ onMonth:[ { when:[], do:[ { moodAdd:-1, target:'staff_all' } ] } ] },
      desc:'Людей держит только зарплата: −1 морали всем каждый месяц.' },
    { id:'fe_faded', name:'Погас', icon:'🕳', family:'vice', founderOnly:true,
      hooks:{ calcQuality:[ { when:[], do:[ { qAdd:-1 } ] } ] },
      desc:'Бережёт себя от огня — и от искры тоже: −1 Q всем проектам.' },
    { id:'fe_never_ready', name:'Вечно не готов', icon:'⏳', family:'vice', founderOnly:true,
      hooks:{ calcSpeed:[ { when:[], do:[ { speedMult:-0.05 } ] } ] },
      desc:'Пересчитывает, пока поезд уходит: −5% темп.' },
    // рост
    { id:'fe_out_to_people', name:'Вышел к людям', icon:'🌤', family:'founder', founderOnly:true,
      hooks:{ calcPayout:[ { when:[], do:[ { payoutMult:0.05 } ] } ] },
      desc:'Созвоны больше не пытка: +5% выплата (перерос соц-тревогу).' },
    { id:'fe_pause_practice', name:'Пауза как практика', icon:'🌾', family:'founder', founderOnly:true,
      hooks:{ onMonth:[ { when:[], do:[ { fatigueAdd:-1 } ] } ] },
      desc:'Научился останавливаться ДО края: −1 усталости команды/мес.' },
    { id:'fe_boundaries', name:'Границы', icon:'🧱', family:'founder', founderOnly:true,
      hooks:{ calcUpkeep:[ { when:[], do:[ { upkeepMult:-0.03 } ] } ] },
      desc:'Умеет говорить «нет»: меньше бесплатной работы (−3% ФОТ-эквивалент).' },
    { id:'fe_hard_skin', name:'Держит удар', icon:'🛡', family:'founder', founderOnly:true,
      hooks:{ calcRisk:[ { when:[], do:[ { riskMult:-0.1 } ] } ] },
      desc:'Отказы больше не сбивают с ног: риск-события −10%.' },
    { id:'fe_delegator', name:'Отпустил', icon:'🕊', family:'founder', founderOnly:true,
      hooks:{ calcSpeed:[ { when:[ { teamSize:{ min:2 } } ], do:[ { speedMult:0.08 } ] } ] },
      desc:'Доверяет команде критичное: +8% темп при 2+ людях (перерос контроль).' },
  ];

  // ── КАТАЛОГ СОБЫТИЙ ───────────────────────────────────────────────────
  // Схема §1: trig-условия (все заданные должны совпасть), fx двигают мир,
  // grant/remove — трейты, tag — метки, chain — событие-следствие.
  const EVENTS = [

    // ══ 4A. «Тени» — сигнатурное событие каждого порока ═════════════════
    { id:'procrast_spiral', title:'Спираль отвлечений', icon:'🌀', cat:'vice',
      trig:{ vice:['procrastinator'] }, weight:3, cooldown:5,
      situation:'«Только гляну референсы» — и вот уже три часа в чужих кейсах, а макет не начат.',
      choices:[
        { text:'Закрыть всё и собраться', hint:'−5 энергии, но день спасён', fx:{ energy:-5, focus:+5 }, tone:'growth' },
        { text:'Ещё чуть-чуть…', hint:'−2 рабочих дня', fx:{ days:-2, focus:-5 }, tone:'degrade' } ] },

    { id:'spender_toy', title:'Дорогая игрушка', icon:'🛍', cat:'vice',
      trig:{ vice:['spender'] }, weight:3, cooldown:5,
      situation:'Лимитированный стол/кресло/девайс «для продуктивности». Красивый. Очень.',
      choices:[
        { text:'Устоять', hint:'+5 фокуса (дисциплина)', fx:{ focus:+5 }, tone:'growth' },
        { text:'Купить', hint:'−45К и привычка к понтам', fx:{ money:-45000 }, grant:['fe_ponty'], once:'grant', tone:'degrade' } ] },

    { id:'burnout_pause', title:'Ты давно не отдыхал', icon:'🕯', cat:'vice',
      trig:{ vice:['burnout'], month:'>=4' }, weight:3, cooldown:6,
      situation:'«Вот сдам это — и отдохну». Ты говоришь это третий месяц подряд.',
      choices:[
        { text:'Взять паузу сейчас', hint:'−3 дня, +15 энергии, навык останавливаться', fx:{ days:-3, energy:+15 }, grant:['fe_pause_practice'], once:'grant', tone:'growth' },
        { text:'Дожать, потом отдохну', hint:'−10 энергии, край ближе', fx:{ energy:-10 }, tag:'burnout_ignored', tone:'degrade' } ] },

    { id:'detach_leaver', title:'Нечем гореть', icon:'🧊', cat:'vice',
      trig:{ vice:['detached'], teamMin:1 }, weight:2, cooldown:6,
      situation:'Ключевой человек кладёт заявление: «Тебе же всё равно, у нас тут просто зарплата».',
      choices:[
        { text:'Впервые поговорить по-настоящему', hint:'−2 дня, +лояльность всем', fx:{ days:-2, loyaltyAll:+8, confidence:+3 }, tone:'growth' },
        { text:'Удержать деньгами', hint:'−30К и людей держит только счёт', fx:{ money:-30000 }, grant:['fe_all_on_money'], once:'grant', tone:'degrade' } ] },

    { id:'corners_quick', title:'По-быстрому', icon:'✂️', cat:'vice',
      trig:{ vice:['corner_cutter'] }, weight:3, cooldown:5,
      situation:'Дедлайн горит. Есть серая схемка: чужой шаблон, никто не заметит. Наверное.',
      choices:[
        { text:'Честно, с опозданием', hint:'+риск штрафа сейчас, чистое имя вдолгую', fx:{ reputation:+2, toughness:+3 }, tone:'growth' },
        { text:'Склеить по-быстрому', hint:'мина заложена', fx:{ energy:+3 }, tag:'corners', tone:'degrade' } ] },

    { id:'paralysis_window', title:'Окно возможности', icon:'🪟', cat:'vice',
      trig:{ vice:['analysis_paralysis'] }, weight:2, cooldown:6,
      situation:'Горячий клиент: «Решай сегодня — завтра отдаём другим». Табличка сравнения не готова.',
      choices:[
        { text:'Прыгнуть', hint:'+жёсткость, деньги вперёд', fx:{ toughness:+5, money:+20000 }, tone:'growth' },
        { text:'Мне нужно всё взвесить', hint:'окно закрылось', fx:{ confidence:-4 }, grant:['fe_never_ready'], once:'grant', tone:'degrade' } ] },

    { id:'social_call', title:'Клиент хочет созвон', icon:'📞', cat:'vice',
      trig:{ vice:['social_anxiety'] }, weight:3, cooldown:5,
      situation:'«Давайте голосом, на 15 минут». Ты полчаса репетируешь приветствие.',
      choices:[
        { text:'Заставить себя выйти', hint:'−5 энергии; так и перерастают тревогу', fx:{ energy:-5, confidence:+6 }, grant:['fe_out_to_people'], remove:['fv_social_anxiety'], once:'grant', tone:'growth' },
        { text:'Увести в переписку', hint:'клиент остыл', fx:{ money:-10000, confidence:-3 }, tone:'degrade' } ] },

    { id:'disillusion_believe', title:'Поверить снова', icon:'🌫', cat:'vice',
      trig:{ vice:['disillusioned'] }, weight:2, cooldown:6,
      situation:'Проект, от которого когда-то загорелся бы. Вложить душу — значит снова рискнуть ожогом.',
      choices:[
        { text:'Вложиться по-настоящему', hint:'−8 энергии, но живой', fx:{ energy:-8, confidence:+8 }, remove:['fv_disillusioned'], once:'grant', tone:'growth' },
        { text:'Сделать «нормально»', hint:'безопасно и пусто', fx:{}, grant:['fe_faded'], once:'grant', tone:'degrade' } ] },

    { id:'rigid_dirty', title:'Грязные деньги', icon:'🗿', cat:'vice',
      trig:{ vice:['inflexible'], moneyBelow:400000 }, weight:2, cooldown:6,
      situation:'Бренд, который ты презираешь, предлагает чек, который закрывает все дыры.',
      choices:[
        { text:'Отказать', hint:'принципы дороже', fx:{ confidence:+5, reputation:+2 }, tone:'growth' },
        { text:'Взять', hint:'+120К и осадок', fx:{ money:+120000, confidence:-6 }, tone:'degrade' } ] },

    { id:'hype_vs_work', title:'Хайп против дела', icon:'🎇', cat:'vice',
      trig:{ vice:['hype_addict'] }, weight:3, cooldown:5,
      situation:'Тренд взлетает прямо сейчас — успеть можно, если бросить горящий дедлайн.',
      choices:[
        { text:'Дожать проект', hint:'+репутация, охваты уйдут', fx:{ reputation:+3, focus:+4 }, tone:'growth' },
        { text:'Ловить волну', hint:'проект просел', fx:{ days:-2, reputation:-2, confidence:+3 }, tone:'degrade' } ] },

    { id:'avoid_talk', title:'Разговор, который откладывал', icon:'🙈', cat:'vice',
      trig:{ vice:['conflict_avoidant'], teamMin:2 }, weight:2, cooldown:6,
      situation:'Накопленное прорвало прямо при команде — тянуть больше некуда.',
      choices:[
        { text:'Выговориться и услышать', hint:'больно, но прорыв', fx:{ energy:-5, loyaltyAll:+10, toughness:+5 }, tone:'growth' },
        { text:'Хлопнуть дверью', hint:'раскол зреет', fx:{ moodAll:-8 }, tag:'team_rift', tone:'degrade' } ] },

    { id:'outsider_party', title:'Тусовка своих', icon:'🚷', cat:'vice',
      trig:{ vice:['outsider'] }, weight:2, cooldown:6,
      situation:'Позвали на закрытую встречу индустрии. Там все давно знакомы. Кроме тебя.',
      choices:[
        { text:'Пойти через силу', hint:'−энергия, +связи', fx:{ energy:-5, reputation:+3, confidence:+4 }, tone:'growth' },
        { text:'«В другой раз»', hint:'нетворк так и закрыт', fx:{ confidence:-3 }, tone:'degrade' } ] },

    { id:'undervalue_easy', title:'Это же просто', icon:'🎲', cat:'vice',
      trig:{ vice:['craft_underestimator'] }, weight:2, cooldown:6,
      situation:'«Да тут на вечер работы» — говоришь ты про то, на что мастер закладывает две недели.',
      choices:[
        { text:'Отдать мастеру', hint:'−25К, зато качество', fx:{ money:-25000, quality:+1 }, tone:'growth' },
        { text:'Сделать самому за вечер', hint:'вечер был оптимистичной оценкой', fx:{ days:-3, confidence:-3 }, tone:'degrade' } ] },

    { id:'outdated_bluff', title:'Ты вообще в теме?', icon:'📼', cat:'vice',
      trig:{ vice:['outdated'] }, weight:2, cooldown:6,
      situation:'Клиент вдвое младше сыплет терминами и смотрит выжидающе: узнаёшь или нет?',
      choices:[
        { text:'«Не знаю. Расскажешь?»', hint:'секунда неловкости, +уважение', fx:{ confidence:+6 }, tone:'growth' },
        { text:'Кивнуть, будто в теме', hint:'блеф придётся поддерживать', fx:{}, grant:['fe_bluff'], once:'grant', tone:'degrade' } ] },

    { id:'control_release', title:'Отпустить критичное', icon:'🔒', cat:'vice',
      trig:{ vice:['control_freak'], teamMin:2 }, weight:2, cooldown:6,
      situation:'Завтра сдача, а ключевой кусок — у сотрудника. Рука тянется переделать всё самому. Ночью.',
      choices:[
        { text:'Довериться и лечь спать', hint:'перерасти контроль', fx:{ energy:+5, loyaltyAll:+5 }, grant:['fe_delegator'], remove:['fv_control_freak'], once:'grant', tone:'growth' },
        { text:'Переделать самому', hint:'−энергия, команда видит', fx:{ energy:-8, moodAll:-4 }, tone:'degrade' } ] },

    { id:'messiah_save', title:'Спасти всех', icon:'🕊', cat:'vice',
      trig:{ vice:['messiah'] }, weight:2, cooldown:6,
      situation:'Три «очень нужных миру» просьбы за неделю — и все бесплатно, и все срочно.',
      choices:[
        { text:'Выбрать ОДНУ и сделать хорошо', hint:'фокус — тоже забота', fx:{ focus:+6, reputation:+2 }, tone:'growth' },
        { text:'Взять все три', hint:'распыление', fx:{ days:-3, energy:-8 }, tone:'degrade' } ] },

    { id:'smother_grown', title:'Он перерос тебя', icon:'🐣', cat:'vice',
      trig:{ vice:['smother'], teamMin:1 }, weight:2, cooldown:6,
      situation:'Твой джун сделал работу лучше, чем сделал бы ты. Первое чувство — не гордость.',
      choices:[
        { text:'Сказать это вслух и отдать проект', hint:'рост важнее контроля', fx:{ loyaltyAll:+8, confidence:-2 }, tone:'growth' },
        { text:'«Подстраховать» правками', hint:'рост задушен', fx:{ moodAll:-5 }, tone:'degrade' } ] },

    // ══ 4F. Общие / жизненные ═══════════════════════════════════════════
    { id:'life_bureaucracy', title:'Бумаги не ждут', icon:'📑', cat:'life',
      trig:{ month:'>=3' }, weight:2, cooldown:8,
      situation:'Налоги, договоры, отчётность — накопилось разом. Кто-то должен это разгрести.',
      choices:[
        { text:'Разгрести самому', hint:'−2 дня', fx:{ days:-2, focus:-3 }, tone:'neutral' },
        { text:'Нанять бухгалтера', hint:'−20К, зато голова свободна', fx:{ money:-20000, focus:+5 }, tone:'growth' } ] },

    { id:'life_friend_favor', title:'Друг просит «по дружбе»', icon:'🤙', cat:'life',
      trig:{ month:'>=2' }, weight:2, cooldown:8,
      situation:'«Слушай, ну тебе же несложно — лого для моего проекта, за вечерок?»',
      choices:[
        { text:'Помочь', hint:'−2 дня, дружба целее', fx:{ days:-2, energy:-3 }, tone:'neutral' },
        { text:'Мягко отказать', hint:'граница проведена', fx:{ toughness:+4 }, grant:['fe_boundaries'], once:'grant', tone:'growth' } ] },

    { id:'life_toxic_client', title:'Токсичный, но денежный', icon:'🐍', cat:'life',
      trig:{ month:'>=3', teamMin:0 }, weight:2, cooldown:8,
      situation:'Платит вовремя и хорошо. Разговаривает так, что после созвона хочется в душ.',
      choices:[
        { text:'Терпеть ради денег', hint:'+40К, минус ты', fx:{ money:+40000, energy:-8, confidence:-4 }, tone:'degrade' },
        { text:'Отказаться от клиента', hint:'−деньги, +самоуважение', fx:{ money:-15000, toughness:+6, confidence:+4 }, tone:'growth' } ] },

    { id:'life_first_no', title:'Первый жёсткий отказ', icon:'🚪', cat:'life',
      trig:{ month:'>=2' }, weight:2, cooldown:10, once:'run',
      situation:'Крупный клиент отказал. Не вежливо, не «мы подумаем» — просто: «Это слабо».',
      choices:[
        { text:'Держать удар', hint:'закалка', fx:{ toughness:+6 }, grant:['fe_hard_skin'], once:'grant', tone:'growth' },
        { text:'Просесть на неделю', hint:'−уверенность, −дни', fx:{ confidence:-6, days:-2 }, tone:'degrade' } ] },

    // ══ 4G. Кризисы (param-порог, приоритет) ════════════════════════════
    { id:'crisis_burnout', title:'Выгорание', icon:'🔥', cat:'crisis', priority:true,
      trig:{ param:{ energy:'<20' } }, weight:10, cooldown:8, once:'run',
      situation:'Утро. Ноутбук открыт. Ты смотришь на макет и не чувствуешь НИЧЕГО. Даже раздражения.',
      choices:[
        { text:'Признать и взять паузу', hint:'−5 дней, выходишь человеком', fx:{ days:-5, energy:+30, focus:+5 }, tone:'growth' },
        { text:'На морально-волевых', hint:'тихий спад продолжается', fx:{ energy:+5, confidence:-8 }, grant:['fe_faded'], once:'grant', tone:'degrade' } ] },

    { id:'crisis_reputation', title:'Всплыло', icon:'💥', cat:'crisis', priority:true,
      trig:{ tag:'corners' }, weight:10, cooldown:8, once:'run',
      situation:'Тот самый «быстрый» шаблон узнали. Скриншоты уже гуляют по чатам индустрии.',
      choices:[
        { text:'Признать и разгрести честно', hint:'−60К, −2 дня, но стоп', fx:{ money:-60000, days:-2, reputation:-3, toughness:+5 }, clearTag:'corners', tone:'growth' },
        { text:'Отрицать', hint:'обвал репутации', fx:{ reputation:-10, confidence:-6 }, tone:'degrade' } ] },
  ];

  // ── Раздатчик ─────────────────────────────────────────────────────────
  function _g() { return (typeof G !== 'undefined') ? G : null; }
  function _active(g) {
    try { return !!(root.Unlocks && root.Unlocks.isActive() && g && g.founder); } catch (e) { return false; }
  }
  function _fe(g) { return g.founder._fe = g.founder._fe || { last: -99, seen: {}, once: {}, granted: {}, tags: {} }; }

  function _cmp(val, expr) {   // '<20' / '>=3' / '>50'
    const m = /^(<=|>=|<|>|=)?\s*(-?\d+)$/.exec(String(expr).trim());
    if (!m) return false;
    const op = m[1] || '='; const n = +m[2];
    return op === '<' ? val < n : op === '<=' ? val <= n : op === '>' ? val > n
         : op === '>=' ? val >= n : val === n;
  }

  function eligible(g, month) {
    const f = g.founder, st = _fe(g), d = f.draft || {};
    return EVENTS.filter(ev => {
      const t = ev.trig || {};
      if (ev.once === 'run' && st.once[ev.id]) return false;
      const last = st.seen[ev.id];
      if (last != null && month - last < (ev.cooldown || 4)) return false;
      if (t.vice  && !t.vice.includes(d.vice))   return false;
      if (t.trait && !t.trait.includes(d.trait)) return false;
      if (t.drive && !t.drive.includes(d.drive)) return false;
      if (t.bond  && !t.bond.includes(d.bond))   return false;
      if (t.month && !_cmp(month, t.month))      return false;
      if (t.tag && !st.tags[t.tag])              return false;
      if (t.teamMin != null && (g.staff || []).filter(s => s.status !== 'fired').length < t.teamMin) return false;
      if (t.moneyBelow != null && (g.money || 0) >= t.moneyBelow) return false;
      if (t.param) {
        for (const k of Object.keys(t.param)) {
          const v = (f.params && typeof f.params[k] === 'number') ? f.params[k] : 50;
          if (!_cmp(v, t.param[k])) return false;
        }
      }
      return true;
    });
  }

  function _clamp(v) { return Math.max(0, Math.min(100, v)); }

  // Применение эффектов выбора (fx/grant/remove/tag/chain/tone)
  function applyChoice(g, ev, ch) {
    const fx = ch.fx || {};
    if (fx.money)      g.money = (g.money || 0) + fx.money;
    if (fx.days)       g.actions = Math.max(0, (g.actions || 0) + fx.days);
    if (fx.reputation) g.reputation = _clamp((g.reputation || 50) + fx.reputation);
    if (fx.fatigue)    g.teamFatigue = _clamp((g.teamFatigue || 0) + fx.fatigue);
    if (fx.quality)    g.qualityBonus = (g.qualityBonus || 0) + fx.quality;
    if (fx.loyaltyAll) (g.staff || []).forEach(s => { s.loyalty = _clamp((s.loyalty != null ? s.loyalty : 70) + fx.loyaltyAll); });
    if (fx.moodAll)    (g.staff || []).forEach(s => { s.mood = _clamp((s.mood != null ? s.mood : 70) + fx.moodAll); });
    ['focus', 'confidence', 'energy', 'toughness'].forEach(k => {
      if (fx[k] && root.Founder) root.Founder.paramAdd(g, k, fx[k]);
    });
    const st = _fe(g);
    // grant/remove трейтов (once:'grant' — не выдавать повторно)
    (ch.grant || []).forEach(id => {
      if (ch.once === 'grant' && st.granted[id]) return;
      if (!g.founder.rlTraits.includes(id)) g.founder.rlTraits.push(id);
      st.granted[id] = true;
    });
    (ch.remove || []).forEach(id => {
      const i = g.founder.rlTraits.indexOf(id);
      if (i >= 0) g.founder.rlTraits.splice(i, 1);
    });
    if (ch.tag)      st.tags[ch.tag] = true;
    if (ch.clearTag) delete st.tags[ch.clearTag];
    if (ch.chain)    st.chainNext = { id: ch.chain, month: (g.month || 0) + 1 };
    // тон — мета-скоринг «как вёл человека»
    g.founder.tone = g.founder.tone || { growth: 0, degrade: 0, neutral: 0 };
    g.founder.tone[ch.tone || 'neutral'] = (g.founder.tone[ch.tone || 'neutral'] || 0) + 1;
    try { if (typeof EventBus !== 'undefined') EventBus.emit('founder_event_choice', { event: ev.id, tone: ch.tone || 'neutral' }); } catch (e) {}
    try { if (typeof EventBus !== 'undefined') EventBus.emit('render'); } catch (e) {}
  }

  // Построить вилку в формате движкового модала (show_event)
  function _toEngineEvent(g, ev) {
    return {
      icon: ev.icon || '👤',
      title: ev.title,
      artIcon: ev.icon || '👤',
      atmosphere: '👤 ' + (g.founder.name || 'Основатель') + ' · личное',
      body: ev.situation,
      choices: ev.choices.map(ch => ({
        text: ch.text,
        desc: ch.hint || '',
        fn: () => { try { applyChoice(g, ev, ch); } catch (e) {} },
      })),
    };
  }

  // Розыгрыш месяца: chain → кризисы → обычные (взвешенно), 0–1 событие
  function maybeFire(month, rng) {
    const g = _g();
    if (!g || !_active(g)) return null;
    if (g._endGameFired) return null;
    rng = rng || Math.random;
    month = (month != null) ? month : (g.month || 0);
    if (month < TUNING.startMonth) return null;
    const st = _fe(g);

    // 1) цепочка-следствие — вне очереди и вне частоты
    let pick = null;
    if (st.chainNext && month >= st.chainNext.month) {
      pick = EVENTS.find(e => e.id === st.chainNext.id) || null;
      st.chainNext = null;
    }
    if (!pick) {
      const list = eligible(g, month);
      if (!list.length) return null;
      const crises = list.filter(e => e.priority);
      if (crises.length) {
        pick = crises[Math.floor(rng() * crises.length)];   // кризис — вне частоты
      } else {
        if (month - st.last < TUNING.globalCooldown) return null;
        const evtW = (root.Founder && g.founder.draft) ? root.Founder.eventWeightOf(g.founder.draft) : 6;
        const chance = Math.min(TUNING.maxChance, TUNING.baseChance + evtW * TUNING.perEvtWeight);
        if (rng() >= chance) return null;
        const totalW = list.reduce((t, e) => t + (e.weight || 1), 0);
        let roll = rng() * totalW;
        pick = list[0];
        for (const e of list) { roll -= (e.weight || 1); if (roll <= 0) { pick = e; break; } }
      }
    }
    st.last = month;
    st.seen[pick.id] = month;
    if (pick.once === 'run') st.once[pick.id] = true;
    const engineEv = _toEngineEvent(g, pick);
    try { if (typeof EventBus !== 'undefined') EventBus.emit('show_event', { ev: engineEv }); } catch (e) {}
    return pick.id;
  }

  // ── Подписка на месяц (сигнал движка) ─────────────────────────────────
  if (typeof EventBus !== 'undefined' && EventBus.on) {
    EventBus.on('month_advanced', (p) => { try { maybeFire(p && p.month); } catch (e) {} });
  }

  root.FounderEvents = { EVENTS, FE_TRAITS, TUNING, eligible, applyChoice, maybeFire, _toEngineEvent };
  root.FOUNDER_EVENT_TRAITS = FE_TRAITS;
  // Регистрация трейтов-последствий (порядок загрузки не важен)
  try { if (root.TraitEngine && root.TraitEngine.load) root.TraitEngine.load(FE_TRAITS); } catch (e) {}
  if (typeof module !== 'undefined' && module.exports) module.exports = root.FounderEvents;

  try { console.log('[founder-events] каталог: ' + EVENTS.length + ' событий (' +
    EVENTS.filter(e => e.cat === 'vice').length + ' теней, ' +
    EVENTS.filter(e => e.cat === 'life').length + ' жизненных, ' +
    EVENTS.filter(e => e.cat === 'crisis').length + ' кризиса) + ' + FE_TRAITS.length + ' трейтов-последствий'); } catch (e) {}
})();
