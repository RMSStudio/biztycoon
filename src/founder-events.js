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

    // ══ 4H. АРКИ ПЕРСОНАЖЕЙ (портреты → 3 звена: завязка → узел → развязка
    //    по доминирующему тону). Ярус «Струггеры» — 6 арок; Крепкие и
    //    Состоявшиеся доедут тем же форматом (§5 чек-лист). ═══════════════

    // ── МАРК: «Ремесленник, который боится сдать» ────────────────────────
    { id:'arc_mark_1', title:'Дедлайн против совести', icon:'⚖️', cat:'arc',
      trig:{ preset:['mark'], month:'>=3' }, weight:5, once:'run',
      situation:'Клиент пишет: «Выглядит супер, давай выкатывать?». А ты видишь пять вещей, которые не так. Никто, кроме тебя, их не заметит. Наверное.',
      choices:[
        { text:'Выкатить и отпустить', hint:'+20К сразу; учишься говорить «готово»', fx:{ money:+20000, toughness:+4 }, tone:'growth' },
        { text:'Довести до идеала', hint:'−2 дня, −энергия; идеал не отпускает', fx:{ days:-2, quality:+1, energy:-6 }, tone:'degrade' } ] },
    { id:'arc_mark_2', title:'Похвала и ценник', icon:'🪞', cat:'arc',
      trig:{ preset:['mark'], afterEvent:'arc_mark_1', month:'>=5' }, weight:5, once:'run',
      situation:'Прошлый клиент назвал работу «лучшим, что у нас было». Новый спрашивает цену — и ты ловишь себя на желании назвать поменьше. Вдруг спугнёшь.',
      choices:[
        { text:'Назвать полную цену', hint:'ты столько стоишь', fx:{ money:+15000, confidence:+8 }, tone:'growth' },
        { text:'Скинуть «для верности»', hint:'−15К и осадок', fx:{ money:-15000, confidence:-6 }, tone:'degrade' } ] },
    { id:'arc_mark_fin_g', title:'«Готово.»', icon:'🏆', cat:'arc',
      trig:{ preset:['mark'], afterEvent:'arc_mark_2', toneDom:'growth', month:'>=8' }, weight:6, once:'run',
      situation:'Бывший арт-директор — тот самый — зовёт тебя на свой подкаст рассказать про студию. Перфекционизм молчит. Ты просто говоришь «да».',
      choices:[
        { text:'Прийти и рассказать', hint:'имя работает на тебя', fx:{ reputation:+5, confidence:+10 }, tone:'growth' },
        { text:'Прийти и слушать', hint:'скромно, но ты там', fx:{ reputation:+2, confidence:+4 }, tone:'neutral' } ] },
    { id:'arc_mark_fin_d', title:'Переделываю проданное', icon:'🕳', cat:'arc',
      trig:{ preset:['mark'], afterEvent:'arc_mark_2', toneDom:'degrade', month:'>=8' }, weight:6, once:'run',
      situation:'Три часа ночи. Ты переделываешь лого, которое клиент принял месяц назад. Он не просил. Он даже не узнает.',
      choices:[
        { text:'Закрыть макет усилием воли', hint:'остановился на краю', fx:{ energy:+10, toughness:+5 }, tone:'growth' },
        { text:'Ещё один прогон', hint:'выгорание рядом', fx:{ money:-20000, energy:-12 }, grant:['fe_faded'], once:'grant', tone:'degrade' } ] },

    // ── РОМЫЧ: «Хастлер, который срезает углы» ───────────────────────────
    { id:'arc_romych_1', title:'Клиент хочет вчера', icon:'🏎', cat:'arc',
      trig:{ preset:['romych'], month:'>=3' }, weight:5, once:'run',
      situation:'Сдача через два дня, работы — на неделю. Есть вариант: чужая сборка, слегка перекрашенная. Никто не докопается. Сегодня.',
      choices:[
        { text:'Честно: не успеваем', hint:'−10К штраф, но спишь спокойно', fx:{ money:-10000, reputation:+2 }, tone:'growth' },
        { text:'Склеить на серой схеме', hint:'+25К и мина под репутацией', fx:{ money:+25000 }, tag:'corners', tone:'degrade' } ] },
    { id:'arc_romych_2', title:'Мутная сделка партнёра', icon:'🤫', cat:'arc',
      trig:{ preset:['romych'], afterEvent:'arc_romych_1', month:'>=5' }, weight:5, once:'run',
      situation:'Партнёр заносит жирный заказ: «Только не спрашивай, откуда клиент. Тебе какая разница?»',
      choices:[
        { text:'Соскочить', hint:'−20К упущенных, +характер', fx:{ money:-20000, toughness:+5 }, tone:'growth' },
        { text:'Взять и не спрашивать', hint:'+80К; разница, вообще-то, есть', fx:{ money:+80000, confidence:-2 }, tag:'corners', tone:'degrade' } ] },
    { id:'arc_romych_fin_g', title:'Первым — по-честному', icon:'🏁', cat:'arc',
      trig:{ preset:['romych'], afterEvent:'arc_romych_2', toneDom:'growth', month:'>=8' }, weight:6, once:'run',
      situation:'Тендер. Все привычно заносят и договариваются, а ты просто приносишь лучшую цену и скорость. И выигрываешь.',
      choices:[
        { text:'Забрать и отработать', hint:'злой, быстрый, уважаемый', fx:{ money:+50000, reputation:+5 }, tone:'growth' },
        { text:'Забрать и поднять цены', hint:'дерзко, рынок стерпит', fx:{ money:+70000, reputation:+1 }, tone:'neutral' } ] },
    { id:'arc_romych_fin_d', title:'Схема зовёт обратно', icon:'🕸', cat:'arc',
      trig:{ preset:['romych'], afterEvent:'arc_romych_2', toneDom:'degrade', month:'>=8' }, weight:6, once:'run',
      situation:'Очередная «верняковая» схема. Прошлые сходили с рук — почти. Внутри что-то подсказывает: эта — лишняя.',
      choices:[
        { text:'Сказать «нет» — впервые', hint:'вырасти вдолгую', fx:{ toughness:+6, confidence:+4 }, clearTag:'corners', tone:'growth' },
        { text:'Последний раз', hint:'они всегда последние', fx:{ money:+60000 }, tag:'corners', tone:'degrade' } ] },

    // ── ТЁМА: «Гений, который боится созвона» ────────────────────────────
    { id:'arc_tema_1', title:'Фанат приводит друга', icon:'🎮', cat:'arc',
      trig:{ preset:['tema'], month:'>=3' }, weight:5, once:'run',
      situation:'Твой фанат-заказчик привёл друга с деньгами. Друг «просто хочет созвониться познакомиться». Ты уже придумал три причины отказаться.',
      choices:[
        { text:'Выйти на звонок', hint:'полчаса ужаса, +заказ', fx:{ money:+25000, confidence:+6, energy:-4 }, tone:'growth' },
        { text:'«Давайте в переписке»', hint:'друг растворился', fx:{ money:-10000, confidence:-3 }, tone:'degrade' } ] },
    { id:'arc_tema_2', title:'Позвали выступить', icon:'🎤', cat:'arc',
      trig:{ preset:['tema'], afterEvent:'arc_tema_1', month:'>=5' }, weight:5, once:'run',
      situation:'Локальный митап зовёт рассказать про твой пет-проект. Двадцать человек. Живых. Смотрящих.',
      choices:[
        { text:'Выступить', hint:'−энергия, +имя и уверенность', fx:{ energy:-8, reputation:+4, confidence:+8 }, tone:'growth' },
        { text:'Прийти слушателем', hint:'безопасно и незаметно', fx:{ confidence:-2 }, tone:'degrade' } ] },
    { id:'arc_tema_fin_g', title:'Продукт говорит сам', icon:'🚀', cat:'arc',
      trig:{ preset:['tema'], afterEvent:'arc_tema_2', toneDom:'growth', month:'>=8' }, weight:6, once:'run',
      situation:'Твою работу шарят люди, которых ты не знаешь. Входящие сами пишут первыми. Оказывается, для этого не нужно было становиться экстравертом.',
      choices:[
        { text:'Принять поток', hint:'глубина победила', fx:{ money:+30000, reputation:+5 }, tone:'growth' },
        { text:'Выбрать одного, лучшего', hint:'фокус прежде всего', fx:{ money:+15000, focus:+6 }, tone:'growth' } ] },
    { id:'arc_tema_fin_d', title:'Гений в столе', icon:'🗄', cat:'arc',
      trig:{ preset:['tema'], afterEvent:'arc_tema_2', toneDom:'degrade', month:'>=8' }, weight:6, once:'run',
      situation:'Лучшая твоя работа лежит в папке «later». Показывать страшно, а не показывать — привычно.',
      choices:[
        { text:'Выложить как есть', hint:'страшно = туда', fx:{ confidence:+8, reputation:+3 }, tone:'growth' },
        { text:'Довести и... потом', hint:'папка пополнилась', fx:{ confidence:-6 }, grant:['fe_never_ready'], once:'grant', tone:'degrade' } ] },

    // ── СОНЯ: «Принципы против кассы» ────────────────────────────────────
    { id:'arc_sonya_1', title:'Грант или заказ', icon:'🌍', cat:'arc',
      trig:{ preset:['sonya'], month:'>=3' }, weight:5, once:'run',
      situation:'НКО предлагает проект мечты — почти бесплатно. Параллельно висит скучный, но денежный заказ. Времени — на один.',
      choices:[
        { text:'Проект мечты', hint:'−деньги, +имя в нише', fx:{ money:-20000, reputation:+4, confidence:+5 }, tone:'growth' },
        { text:'Скучный, но денежный', hint:'касса важнее, миссия подождёт', fx:{ money:+40000, confidence:-4 }, tone:'degrade' } ] },
    { id:'arc_sonya_2', title:'Бренд-грязнуля', icon:'🏭', cat:'arc',
      trig:{ preset:['sonya'], afterEvent:'arc_sonya_1', month:'>=5' }, weight:5, once:'run',
      situation:'Корпорация с репутацией токсичного гиганта хочет «освежить образ». Твоими руками. Чек — годовой бюджет студии.',
      choices:[
        { text:'Отказать публично', hint:'ниша запомнит', fx:{ money:-30000, reputation:+4, toughness:+5 }, tone:'growth' },
        { text:'Взять тихо', hint:'+100К и бессонница', fx:{ money:+100000, confidence:-6 }, tone:'degrade' } ] },
    { id:'arc_sonya_fin_g', title:'Ниша поверила', icon:'🌱', cat:'arc',
      trig:{ preset:['sonya'], afterEvent:'arc_sonya_2', toneDom:'growth', month:'>=8' }, weight:6, once:'run',
      situation:'Тебя рекомендуют со словами «эти не возьмут что попало». Оказалось, принципы — это тоже позиционирование.',
      choices:[
        { text:'Поднять цены для «своих» тоже', hint:'миссия ≠ бесплатно', fx:{ money:+35000, toughness:+4 }, tone:'growth' },
        { text:'Держать соц-тариф', hint:'верность корням', fx:{ reputation:+4 }, tone:'neutral' } ] },
    { id:'arc_sonya_fin_d', title:'Принципы съели студию', icon:'🥀', cat:'arc',
      trig:{ preset:['sonya'], afterEvent:'arc_sonya_2', toneDom:'degrade', month:'>=8' }, weight:6, once:'run',
      situation:'Касса пустая, а ты опять на созвоне объясняешь, почему «этот заказ мы морально не можем взять».',
      choices:[
        { text:'Пересобрать рамки: что МОЖНО', hint:'гибкость ≠ предательство', fx:{ money:+30000, confidence:+4 }, remove:['fv_inflexible'], once:'grant', tone:'growth' },
        { text:'Стоять до конца', hint:'красиво, но голодно', fx:{ money:-30000 }, tone:'degrade' } ] },

    // ── ЖЕНЯ: «Вырваться из своего города» ───────────────────────────────
    { id:'arc_zhenya_1', title:'Свои просят по-свойски', icon:'🏘', cat:'arc',
      trig:{ preset:['zhenya'], month:'>=3' }, weight:5, once:'run',
      situation:'Земляки шлют заказы один за другим — и все «ну ты же свой, сделай по-братски». Портфолио растёт, счёт — нет.',
      choices:[
        { text:'Поднять цену и для своих', hint:'уважение вместо скидки', fx:{ money:+15000, toughness:+5 }, tone:'growth' },
        { text:'Своим — по-свойски', hint:'слава хорошего парня', fx:{ money:-15000 }, tone:'degrade' } ] },
    { id:'arc_zhenya_2', title:'Столичный конкурс', icon:'🌆', cat:'arc',
      trig:{ preset:['zhenya'], afterEvent:'arc_zhenya_1', month:'>=5' }, weight:5, once:'run',
      situation:'Большой конкурс, столичные студии, известные имена. «Куда нам» — говорит внутренний голос голосом родного города.',
      choices:[
        { text:'Заявиться', hint:'страшно — значит туда', fx:{ energy:-5, reputation:+4, confidence:+6 }, tone:'growth' },
        { text:'«Не в этот раз»', hint:'потолок остался на месте', fx:{ confidence:-5 }, tone:'degrade' } ] },
    { id:'arc_zhenya_fin_g', title:'Свой среди своих', icon:'🌉', cat:'arc',
      trig:{ preset:['zhenya'], afterEvent:'arc_zhenya_2', toneDom:'growth', month:'>=8' }, weight:6, once:'run',
      situation:'В жюри того самого конкурса тебя представляют: «студия из региона, за которой стоит следить». Город в тебе больше не потолок — он бэкграунд.',
      choices:[
        { text:'Взять столичный заказ', hint:'новый уровень чеков', fx:{ money:+50000, reputation:+4 }, remove:['fv_outsider'], once:'grant', tone:'growth' },
        { text:'Остаться базой в родном', hint:'корни — сила', fx:{ money:+25000, confidence:+5 }, tone:'growth' } ] },
    { id:'arc_zhenya_fin_d', title:'Потолок родного города', icon:'🧱', cat:'arc',
      trig:{ preset:['zhenya'], afterEvent:'arc_zhenya_2', toneDom:'degrade', month:'>=8' }, weight:6, once:'run',
      situation:'Все заказы города — твои. Все — мелкие. Ты первый парень на районе, и район кончился.',
      choices:[
        { text:'Ва-банк: месяц на столичный рынок', hint:'−30К, шанс пробить', fx:{ money:-30000, confidence:+6, toughness:+4 }, tone:'growth' },
        { text:'Досиживать королём', hint:'уютно и тесно', fx:{ money:+10000, confidence:-5 }, tone:'degrade' } ] },

    // ── «ДВОЕ»: партнёрство на прочность ─────────────────────────────────
    { id:'arc_dvoe_1', title:'Кто из вас главный?', icon:'👥', cat:'arc',
      trig:{ preset:['dvoe'], month:'>=3' }, weight:5, once:'run',
      situation:'Клиент на встрече спрашивает в лоб: «А решает кто?» Вы переглядываетесь на секунду дольше, чем надо.',
      choices:[
        { text:'Договориться о ролях в тот же вечер', hint:'взрослый разговор', fx:{ focus:+5, loyaltyAll:+5 }, tone:'growth' },
        { text:'«Мы решаем вместе» (замять)', hint:'вопрос никуда не делся', fx:{}, tag:'rift_seed', tone:'degrade' } ] },
    { id:'arc_dvoe_2', title:'Деньги делим как?', icon:'💳', cat:'arc',
      trig:{ preset:['dvoe'], afterEvent:'arc_dvoe_1', month:'>=5' }, weight:5, once:'run',
      situation:'Первый серьёзный чек. Один тащил продажи, второй — производство. Каждый втайне считает, что тащил больше.',
      choices:[
        { text:'Прописать доли на бумаге', hint:'−день, +фундамент', fx:{ days:-1, toughness:+4, loyaltyAll:+4 }, tone:'growth' },
        { text:'«Потом разберёмся»', hint:'копилка обид пополняется', fx:{}, tag:'rift_seed', tone:'degrade' } ] },
    { id:'arc_dvoe_fin_g', title:'Партнёрство++', icon:'🤝', cat:'arc',
      trig:{ preset:['dvoe'], afterEvent:'arc_dvoe_2', toneDom:'growth', month:'>=8' }, weight:6, once:'run',
      situation:'Вы спорите на планёрке — громко, азартно и по делу. Команда уже не пугается: знает, что через час вы вынесете решение лучше, чем предлагал каждый.',
      choices:[
        { text:'Закрепить: партнёрское соглашение', hint:'скучно и надёжно', fx:{ loyaltyAll:+8, moodAll:+5, money:+20000 }, tone:'growth' },
        { text:'Работаем дальше, и так ясно', hint:'доверие как капитал', fx:{ loyaltyAll:+5, confidence:+4 }, tone:'neutral' } ] },
    { id:'arc_dvoe_fin_d', title:'Раскол', icon:'🪓', cat:'arc',
      trig:{ preset:['dvoe'], afterEvent:'arc_dvoe_2', toneDom:'degrade', month:'>=8' }, weight:6, once:'run',
      situation:'Он написал в общий чат «нам надо поговорить». Вы оба знаете, о чём. Копилка обид полная.',
      choices:[
        { text:'Честный развод по ролям', hint:'больно, но по-людски', fx:{ money:-40000, moodAll:-5, toughness:+6 }, tone:'growth' },
        { text:'Хлопнуть дверью', hint:'команда смотрит и делает выводы', fx:{ money:-40000, moodAll:-10, loyaltyAll:-10 }, tone:'degrade' } ] },
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
      // ── триггеры арок персонажей (§4H + портреты) ──
      if (t.preset && !t.preset.includes(f.presetId)) return false;
      if (t.afterEvent && st.seen[t.afterEvent] == null) return false;   // предыдущее звено отыграно
      if (t.toneDom) {   // развязка по доминирующему тону рана
        const tn = f.tone || { growth: 0, degrade: 0 };
        if (t.toneDom === 'growth'  && !((tn.growth || 0) >  (tn.degrade || 0))) return false;
        if (t.toneDom === 'degrade' && !((tn.degrade || 0) >= (tn.growth || 0))) return false;
      }
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
    if (ch.chain) {   // строка или {id, delay} — событие-следствие через N месяцев
      const c = typeof ch.chain === 'string' ? { id: ch.chain, delay: 1 } : ch.chain;
      st.chainNext = { id: c.id, month: (g.month || 0) + (c.delay || 1) };
    }
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
      const arcs   = list.filter(e => e.cat === 'arc');
      if (crises.length) {
        pick = crises[Math.floor(rng() * crises.length)];   // кризис — вне частоты
      } else if (arcs.length && month - st.last >= TUNING.globalCooldown) {
        pick = arcs[Math.floor(rng() * arcs.length)];       // арка — сюжет, вне шанса (но с кулдауном)
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
    EVENTS.filter(e => e.cat === 'crisis').length + ' кризиса, ' +
    EVENTS.filter(e => e.cat === 'arc').length + ' арк-звеньев) + ' + FE_TRAITS.length + ' трейтов-последствий'); } catch (e) {}
})();
