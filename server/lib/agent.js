'use strict';

const { contextFor } = require('./ai.js');

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'search_knowledge',
      description: 'Ищет ответ в данных сайта (товары, цены, доставка, возврат, гарантия, контакты, FAQ) и возвращает релевантные фрагменты текста.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Что ищем, например: "цена наушников Aurora X" или "как вернуть товар"' }
        },
        required: ['query']
      }
    }
  }
];

async function ask(cfg, messages) {
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (cfg.apiKey) headers['Authorization'] = 'Bearer ' + cfg.apiKey;
    const r = await fetch(cfg.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: cfg.model,
        messages,
        tools: TOOLS,
        tool_choice: 'auto',
        temperature: 0.3,
        max_tokens: 300
      })
    });
    if (!r.ok) throw new Error('api status ' + r.status);
    return await r.json();
  } catch (e) {
    return null;
  }
}

function systemPrompt(cfg, instructions) {
  let p = 'Ты — ИИ-агент сайта «' + (cfg.siteName || 'Сайт') + '». Отвечай кратко и дружелюбно, только на основе данных сайта. Чтобы найти данные, используй инструмент search_knowledge. Если в данных сайта ответа нет — честно скажи, что не знаешь, и предложи связаться с поддержкой.';
  if (instructions) p += '\n\nДополнительные инструкции от поддержки:\n' + instructions;
  return p;
}

/**
 * Агент с инструментами. Модель сама решает, когда искать в данных сайта
 * (tool-calling цикл), вместо того чтобы получать весь контекст сразу.
 * Возвращает строку-ответ или null (модель недоступна / не дала ответ).
 */
async function agentAnswer(cfg, knowledge, q, instructions, maxRounds) {
  maxRounds = maxRounds || 4;
  const messages = [
    { role: 'system', content: systemPrompt(cfg, instructions) },
    { role: 'user', content: String(q) }
  ];
  for (let round = 0; round < maxRounds; round++) {
    const data = await ask(cfg, messages);
    if (!data || !data.choices || !data.choices[0]) return null;
    const msg = data.choices[0].message || {};
    const calls = (msg.tool_calls && Array.isArray(msg.tool_calls)) ? msg.tool_calls : [];
    if (msg.content && !calls.length) return String(msg.content).trim() || null;
    messages.push({ role: 'assistant', content: msg.content || null, tool_calls: calls });
    for (const call of calls) {
      let res;
      if (call.function && call.function.name === 'search_knowledge') {
        let query = '';
        try { query = String((JSON.parse(call.function.arguments || '{}').query) || '').trim(); } catch (e) { query = ''; }
        res = (knowledge && knowledge.length && query) ? contextFor(knowledge, query) : 'Нет данных сайта.';
      } else {
        res = 'Неизвестный инструмент: ' + (call.function && call.function.name);
      }
      messages.push({ role: 'tool', tool_call_id: call.id, content: String(res).slice(0, 2500) });
    }
  }
  const last = messages[messages.length - 1];
  return (last && last.role === 'assistant' && last.content) ? String(last.content).trim() : null;
}

module.exports = { agentAnswer, TOOLS };