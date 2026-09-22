'use strict';

const STOP = new Set('и,в,на,с,у,о,об,по,за,из,от,до,к,для,что,как,где,когда,почему,зачем,это,то,все,если,но,или,при,можно,не,уж,ли,есть,уже,было,будет,будут,а,так,ведь,вот,да,нет,его,её,их,мой,меня,вас,ваш,этот,эта,это,сколько'.split(','));

function tokenize(t) {
  return String(t || '').toLowerCase().replace(/[^a-zа-яё0-9\.\-@\s]/gi, ' ').split(/\s+/).filter((w) => w.length > 1);
}

function terms(t) {
  return tokenize(t).filter((w) => !STOP.has(w));
}

function uniqueArr(a) {
  const o = {};
  a.forEach((x) => (o[x] = 1));
  return Object.keys(o);
}

function normalize(s) {
  return String(s || '').toLowerCase().replace(/[^a-zа-яё0-9\s]/gi, ' ').replace(/\s+/g, ' ').trim();
}

function tokenMatch(a, b) {
  if (a === b) return true;
  if (a.length < 4 || b.length < 4) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  const need = Math.max(3, Math.floor(Math.min(a.length, b.length) * 0.6));
  return i >= need;
}

function qaSimilarity(q, item) {
  const qTokens = uniqueArr(terms(q));
  const aTokens = uniqueArr(terms(String(item.q) + ' ' + (item.keys || []).join(' ')));
  const nq = normalize(q);
  const nItem = normalize(item.q);
  if (!qTokens.length) return 0;
  if (nq && nq === nItem) return 1;
  let matched = 0;
  qTokens.forEach((w) => { if (aTokens.some((t) => tokenMatch(w, t))) matched++; });
  const dice = (2 * matched) / Math.max(1, qTokens.length + aTokens.length);
  const precision = matched / Math.max(1, qTokens.length);
  let score = Math.max(dice, precision);
  if (nq && nItem && (nq.indexOf(nItem) !== -1 || nItem.indexOf(nq) !== -1)) score = Math.max(score, 0.75);
  return score;
}

function matchQA(cfg, q) {
  const thr = (typeof cfg.qaThreshold === 'number' && cfg.qaThreshold > 0 && cfg.qaThreshold <= 0.99) ? cfg.qaThreshold : 0.45;
  let best = null;
  let bestScore = 0;
  (cfg.qa || []).forEach((item) => {
    if (!item || !item.a) return;
    const s = qaSimilarity(q, item);
    if (s > bestScore) { bestScore = s; best = item; }
  });
  if (best && bestScore >= thr) return { text: best.a, source: 'qa', score: Math.round(bestScore * 100) / 100 };
  return null;
}

function cacheKey(q) {
  return normalize(q);
}

function indexItems(knowledge) {
  return knowledge.map((item) => {
    const t = uniqueArr(tokenize(item.title));
    const a = uniqueArr(tokenize(item.title).concat(tokenize(item.content)));
    return { item, _t: new Set(t), _a: new Set(a) };
  });
}

function findBest(knowledge, q) {
  const ids = indexItems(knowledge);
  const qt = uniqueArr(terms(q));
  if (!qt.length) return null;
  const results = [];
  ids.forEach((entry, i) => {
    let matched = 0;
    qt.forEach((w) => { if (entry._t.has(w) || entry._a.has(w)) matched++; });
    if (!matched) return;
    results.push({ idx: i, item: entry.item, conf: matched / qt.length, matched });
  });
  results.sort((a, b) => (b.conf - a.conf) || (b.matched - a.matched));
  const best = results[0];
  if (!best) return null;
  if (best.conf < 0.35 && best.matched < 2 && results[1] && results[1].matched >= 2) return results[1];
  return best;
}

function contextFor(knowledge, q) {
  const ids = indexItems(knowledge);
  const qt = uniqueArr(terms(q));
  const scored = [];
  ids.forEach((entry, i) => {
    let matched = 0;
    qt.forEach((w) => { if (entry._t.has(w) || entry._a.has(w)) matched++; });
    if (matched > 0) scored.push({ i, m: matched });
  });
  scored.sort((a, b) => b.m - a.m);
  if (!scored.length) ids.slice(0, 6).forEach((entry, i) => scored.push({ i, m: 0 }));
  const top = scored.slice(0, 6).map((s) => ids[s.i].item);
  return top.map((it) => '[' + it.title + '] ' + String(it.content).slice(0, 600)).join('\n\n');
}

function buildPrompt({ siteName, instructions }, knowledge, q) {
  let msg = 'Ты — ИИ-агент сайта «' + (siteName || 'Сайт') + '». Отвечай кратко, дружелюбно, только на основе данных сайта. Если ответа нет — честно скажи, что не знаешь, и предложи связаться с поддержкой.\n\nДанные сайта:\n' + contextFor(knowledge, q);
  if (instructions) msg += '\n\nДополнительные инструкции от поддержки:\n' + instructions;
  return msg;
}

async function askLLM(cfg, sysMsg, userText) {
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (cfg.apiKey) headers['Authorization'] = 'Bearer ' + cfg.apiKey;
    const r = await fetch(cfg.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: cfg.model,
        messages: [{ role: 'system', content: sysMsg }, { role: 'user', content: userText }],
        temperature: 0.3
      })
    });
    if (!r.ok) throw new Error('api status ' + r.status);
    const data = await r.json();
    return (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || null;
  } catch (e) {
    return null;
  }
}

/**
 * Полный ответ: пробуем LLM, при неудаче — локальный взвешенный поиск (fallback),
 * чтобы демо работало даже без запущенной модели.
 */
async function answer(cfg, chat, q, instructions) {
  const sysMsg = buildPrompt({ siteName: chat.siteName, instructions: instructions != null ? instructions : chat.instructions }, chat.knowledge || [], q);
  const llm = await askLLM(cfg, sysMsg, q);
  if (llm) return { text: llm, source: 'llm' };
  const best = findBest(chat.knowledge || [], q);
  if (best) return { text: best.item.content, source: 'search' };
  return { text: null, source: null };
}

module.exports = { answer, buildPrompt, findBest, contextFor, tokenize, terms, matchQA, qaSimilarity, normalize, cacheKey, askLLM };