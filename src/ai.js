// ══════════════════════════════════════════════════════
//  AI — LLM-клиент, промпты, управление чатом
//  Зависит от: events.js (EventBus), engine.js (G, SCENARIO, notify, addLog, rd, _emitRender)
//
//  API-ключ хранится в localStorage ('btz_ai_key').
//  Прямые запросы к Anthropic API из браузера (личное использование).
//  При отсутствии ключа — fallback на шаблонные советы.
// ══════════════════════════════════════════════════════

const AI_KEY_STORAGE = 'btz_ai_key';
const AI_MODEL       = 'claude-haiku-4-5-20251001';
const AI_MAX_TOKENS  = 400;

// ── API-ключ ──────────────────────────────────────────

function getAIKey() {
  return localStorage.getItem(AI_KEY_STORAGE) || '';
}

function setAIKey(key) {
  localStorage.setItem(AI_KEY_STORAGE, key.trim());
}

function hasAIKey() {
  return getAIKey().length > 10;
}

// ── Построение системного промпта из стейта ──────────

function buildAIPrompt(userQuestion) {
  const spec  = SCENARIO.specs[G.spec] || {};
  const staff = G.staff.map(s => `${s.name} (${s.role}, −${Math.round(s.cost/1000)}K/мес)`).join(', ') || 'нет сотрудников';
  const clients = G.activeClients.map(c =>
    `«${c.name}» T${c.tier} прогресс ${Math.round(c._progress||0)}%, бюджет ${Math.round((c._totalBudget||0)/1000)}K`
  ).join('; ') || 'нет активных проектов';

  const thr = typeof getTeamThroughput === 'function' ? getTeamThroughput() : '?';
  const load = typeof getTotalLoad === 'function' ? getTotalLoad() : '?';
  const fatigue = Math.round(G.teamFatigue || 0);
  const ftLabel = fatigue >= 85 ? 'Кризис' : fatigue >= 60 ? 'Выгорание' : fatigue >= 30 ? 'Напряжение' : 'Норма';

  const systemPrompt = `Ты — ИИ-советник внутри бизнес-симулятора BizTycoon. Твоя задача — давать конкретные, обоснованные советы, опираясь ТОЛЬКО на данные ниже.

ПРОФИЛЬ АГЕНТСТВА:
- Специализация: ${spec.name || G.spec}
- Месяц: ${monthLabel ? monthLabel() : G.month}
- Баланс: ${Math.round(G.money/1000)}K ₽
- Репутация: ${Math.round(G.reputation)}/100
- Портфолио: ${G.portfolio || 0} баллов

КОМАНДА: ${staff}

АКТИВНЫЕ ПРОЕКТЫ: ${clients}

МОЩНОСТЬ:
- Команда: ${thr} мощн. / Проекты требуют: ${load} мощн.
- Усталость команды: ${fatigue} (${ftLabel})
- Скорость: ${typeof getSpeed === 'function' ? Math.round(getSpeed()*100) : 100}%

ПРАВИЛА ИГРЫ (для контекста советов):
- Проекты T1 требуют 4 мощн./мес., T2 — 8, T3 — 14
- Сотрудники: junior ~1-2 мощн., middle ~2-4, senior ~4-7
- Усталость >60 = риск увольнений, >85 = найм заблокирован
- Репутация <40 = нет T2, <60 = нет T3
- Оплата приходит только при завершении проекта

ФОРМАТ ОТВЕТА — строго такой, без отступлений:
📊 Анализ: [2-3 предложения с конкретными цифрами из стейта]
⚠️ Риск: [1-2 предложения о главной угрозе]
✅ Рекомендация: [конкретное действие с обоснованием]

Отвечай по-русски. Будь краток и конкретен.`;

  return { system: systemPrompt, user: userQuestion };
}

// ── Основной запрос к API ─────────────────────────────

async function callLLM(question) {
  const key = getAIKey();
  if (!key) throw new Error('API ключ не задан');

  const { system, user } = buildAIPrompt(question);

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type':    'application/json',
      'x-api-key':       key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model:      AI_MODEL,
      max_tokens: AI_MAX_TOKENS,
      system:     system,
      messages:   [{ role: 'user', content: user }],
    }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error?.message || `HTTP ${resp.status}`);
  }

  const data = await resp.json();
  return data.content?.[0]?.text || '(пустой ответ)';
}

// ── Fallback — шаблонные советы без API ──────────────

function generateFallbackAdvice(question) {
  const money   = G.money;
  const fatigue = G.teamFatigue || 0;
  const rep     = G.reputation;
  const load    = typeof getTotalLoad === 'function' ? getTotalLoad() : 0;
  const thr     = typeof getTeamThroughput === 'function' ? getTeamThroughput() : 10;

  if (fatigue >= 60) {
    return `📊 Анализ: Команда в состоянии выгорания (усталость ${Math.round(fatigue)}). Производительность снижена, есть риск увольнений.\n⚠️ Риск: При усталости выше 85 найм будет заблокирован, прогресс проектов упадёт до ×70%.\n✅ Рекомендация: Срочно снизи нагрузку — сократи фокус на тяжёлых проектах до 20–30%. Используй Тимбилдинг (28K) для быстрого снижения усталости.`;
  }
  if (money < 150000) {
    return `📊 Анализ: Баланс агентства критически низкий (${Math.round(money/1000)}K ₽). При текущих расходах runway составляет менее 2 месяцев.\n⚠️ Риск: Банкротство при отсутствии входящих платежей в ближайший месяц.\n✅ Рекомендация: Немедленно завершите ближайший к 100% проект. Рассмотри кредитную линию если репутация ≥30.`;
  }
  if (load > thr) {
    return `📊 Анализ: Команда перегружена — нагрузка ${Math.round(load)} превышает производительность ${Math.round(thr)}. Прогресс всех проектов замедлен.\n⚠️ Риск: Просрочки по дедлайнам приведут к штрафам репутации и сниженной выплате.\n✅ Рекомендация: Перераспредели фокус в пользу наиболее близких к завершению проектов. Или нанми дополнительного специалиста.`;
  }
  if (rep < 50) {
    return `📊 Анализ: Репутация ${Math.round(rep)} — ниже порога для доступа к T2-проектам.\n⚠️ Риск: Ограниченный пул проектов замедляет рост дохода.\n✅ Рекомендация: Завершай текущие проекты в срок и избегай серых схем. Добавь кейсы из портфолио — они дают +1–2 реп/мес.`;
  }
  return `📊 Анализ: Агентство работает в штатном режиме. Баланс ${Math.round(money/1000)}K, усталость ${Math.round(fatigue)}, репутация ${Math.round(rep)}.\n⚠️ Риск: При текущей загрузке ${Math.round(load)}/${Math.round(thr)} есть небольшой запас прочности.\n✅ Рекомендация: Хороший момент для скаутинга нового T${rep>=60?'3':rep>=40?'2':'1'}-проекта или прокачки нейросети.`;
}

// ── Публичная функция: задать вопрос ─────────────────

async function askAI(question) {
  if (!G.ai?.purchased) { notify('Нейросеть не подключена', 'error'); return; }
  if (G.ai.upgrading)   { notify(`Нейросеть на обучении — ещё ${G.ai.upgradeMonthsLeft} мес.`, 'error'); return; }

  const limit = getAIQueriesLimit();
  if ((G.ai.queriesThisMonth || 0) >= limit) {
    notify(`Лимит запросов на этот месяц исчерпан (${limit}/мес на уровне ${G.ai.level})`, 'error');
    return;
  }
  if (G.ai.pendingResponse) {
    notify('Уже есть ожидающий ответ — дождись его', 'error');
    return;
  }

  // Добавляем вопрос в чат
  G.ai.chat.push({ role: 'user', text: question, month: G.month });
  G.ai.queriesThisMonth = (G.ai.queriesThisMonth || 0) + 1;

  const delay = getAIResponseDelay();

  // Если delay > 0 — ставим в очередь
  if (delay > 0) {
    G.ai.chat.push({
      role: 'ai',
      text: `⏳ Обрабатываю запрос... Ответ будет готов через ~${delay} мес. (${monthLabel ? monthLabel(delay) : `месяц ${G.month + delay}`})`,
      month: G.month,
      pending: true,
    });
    notify(`🤖 Запрос принят — ответ придёт через ${delay} мес.`, 'info');
    EventBus.emit('ai_thinking', { delay });
    _emitRender();

    // Получаем ответ асинхронно и сохраняем в pendingResponse
    try {
      const text = hasAIKey()
        ? await callLLM(question)
        : generateFallbackAdvice(question);
      G.ai.pendingResponse = { text, readyMonth: G.month + delay };
    } catch (e) {
      const text = generateFallbackAdvice(question);
      G.ai.pendingResponse = { text, readyMonth: G.month + delay };
      console.warn('AI API error, using fallback:', e.message);
    }
    return;
  }

  // delay === 0 — отвечаем в текущем месяце
  const thinkingIdx = G.ai.chat.length;
  G.ai.chat.push({ role: 'ai', text: '⏳ Анализирую данные...', month: G.month, pending: true });
  EventBus.emit('ai_thinking', { delay: 0 });
  _emitRender();

  try {
    const text = hasAIKey()
      ? await callLLM(question)
      : generateFallbackAdvice(question);
    G.ai.chat[thinkingIdx] = { role: 'ai', text, month: G.month, pending: false };
  } catch (e) {
    const text = generateFallbackAdvice(question);
    G.ai.chat[thinkingIdx] = { role: 'ai', text, month: G.month, pending: false };
    console.warn('AI API error, using fallback:', e.message);
  }

  EventBus.emit('ai_response_ready', { text: G.ai.chat[thinkingIdx].text });
  _emitRender();
}
