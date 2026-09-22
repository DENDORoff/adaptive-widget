'use strict';
/**
 * Экспериментальная альфа-фича «Муха»: чат о коннектоме мозга плодовой мухи
 * и 3D-визуализация нейронов. Данные: живые запросы к NeuPrint (flyconnectome)
 * через прокси-сервер, при недоступности — встроенный офлайн-справочник
 * и демо-нейроны, чтобы демо и тесты работали всегда.
 */

const ai = require('./ai');

const NEUPRINT = 'https://neuprint.janelia.org';

const OFFLINE_FACTS = [
  'Полный коннектом мозга взрослой самки плодовой мухи Drosophila melanogaster (2024, Janelia / Flynn et al.) — это ~139 255 нейронов и ~50 млн синапсов.',
  'Срез гемибрейна (hemibrain:v1.2.1, Scheffer et al. 2020) содержит ~21 662 нейрона и ~14 млн синапсов.',
  'Грибовидное тело (mushroom body) — центр обучения и памяти. В одном полушарии ~2 200 клеток Кеньона (Kenyon cells, KC).',
  'Выходные нейроны грибовидного тела — MBON (mushroom body output neurons); дофаминовые нейроны — DAN (dopaminergic neurons).',
  'Проекционные нейроны (PN) передают обонятельные сигналы от антеннальной доли к грибовидному телу.',
  'Зрительная система: фоторецепторы R1–R8, ламина, медулла (Medulla), лобула (Lobula) и лобульная пластинка (Lobula Plate).',
  'Коннектом выгружается инструментами flyconnectome (neuprint-python — запросы к NeuPrint, матрицы синапсов, типы клеток, 3D-координаты) и navis (анализ скелетов нейронов, расстояния, графы связей, визуализация).',
  '«Оживит» мозг можно симуляторами биологических нейросетей: Brian2 или NEST — импульсы между нейронами по матрицам связей.',
  'Превратить биологический граф связей в искусственную нейросеть (для агента в игре) можно на PyTorch или TensorFlow.'
];

const DEMO_NEURONS = [
  { id: 'demokc1', type: 'Клетка Кеньона (KC)', info: 'Обучающийся нейрон грибовидного тела; ~2 200 таких клеток в полушарии. Именно их активность ассоциируют с обучением и памятью мухи.' },
  { id: 'demombon1', type: 'MBON (выход грибовидного тела)', info: 'MBON — выходные нейроны грибовидного тела. Сигнал KC -> MBON кодирует ценность выученного стимула.' },
  { id: 'demodan1', type: 'DAN (дофаминовый нейрон)', info: 'DAN — дофаминовые / октопаминовые нейроны; дают «сигнал ошибки» при обучении (как в TD-обучении).' },
  { id: 'demopn1', type: 'Проекционный нейрон (PN)', info: 'PN передаёт обонятельный сигнал от антеннальной доли в грибовидное тело.' },
  { id: 'demopr1', type: 'Зрительный нейрон (фоторецептор R7)', info: 'Распределённая зрительная система мухи: 8 фоторецепторов на омматидий (R1–R8).' }
];

function seededRng(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function buildDemoNeuron(seed) {
  const rnd = seededRng(seed);
  const points = { x: [], y: [], z: [] };
  const links = { connectTo: [], linkedNodes: [] };
  const nodes = [[0, 0, 0]];
  const arms = 3;
  for (let a = 0; a < arms; a++) {
    const ang = (a / arms) * Math.PI * 2 + rnd() * 0.8;
    let pos = [0, 0, 0];
    let dir = [Math.cos(ang), Math.sin(ang), (rnd() - 0.5) * 1.2];
    const len = 10 + Math.floor(rnd() * 8);
    let parentId = 0;
    for (let i = 0; i < len; i++) {
      dir = [
        dir[0] + (rnd() - 0.5) * 0.55,
        dir[1] + (rnd() - 0.5) * 0.55,
        dir[2] + (rnd() - 0.5) * 0.45
      ];
      const n = Math.sqrt(dir[0] * dir[0] + dir[1] * dir[1] + dir[2] * dir[2]) || 1;
      dir = [dir[0] / n, dir[1] / n, dir[2] / n];
      pos = [pos[0] + dir[0] * (4 + rnd() * 3), pos[1] + dir[1] * (4 + rnd() * 3), pos[2] + dir[2] * (4 + rnd() * 3)];
      nodes.push(pos);
      points.x.push(pos[0]);
      points.y.push(pos[1]);
      points.z.push(pos[2]);
      links.connectTo.push(parentId);
      links.linkedNodes.push(nodes.length - 1);
      parentId = nodes.length - 1;
    }
  }
  return points;
}

function sampleNeuron(id) {
  const hit = DEMO_NEURONS.find((n) => n.id === id);
  if (!hit) return null;
  const points = buildDemoNeuron(id.split('').reduce((s, c) => s + c.charCodeAt(0), 7));
  return {
    id,
    type: hit.type,
    info: hit.info,
    demo: true,
    nodeCount: points.x.length,
    pre: 248,
    post: 131,
    points,
    links: { connectTo: [], linkedNodes: [] }
  };
}

const flyCache = { t: 0, val: null };
const neuCache = Object.create(null);

function neuFetch(cfg, path, opts, timeoutMs) {
  const base = (cfg && cfg.flyBase) ? String(cfg.flyBase).replace(/\/$/, '') : NEUPRINT;
  const url = base + path;
  const timeout = timeoutMs || 3000;
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeout);
  return fetch(url, Object.assign({ signal: ctrl.signal }, opts || {}))
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error('http ' + r.status))))
    .finally(() => clearTimeout(to));
}

async function tryNeuprint(cfg) {
  const nowMs = Date.now();
  if (flyCache.val && nowMs - flyCache.t < 60000) return flyCache.val;
  const probe = { ok: false, dataset: '', at: nowMs };
  try {
    const data = await neuFetch(cfg, '/api/datasets');
    const list = Array.isArray(data) ? data.map((d) => (d && d.name) || d) : [];
    if (list.length) {
      probe.ok = true;
      probe.dataset = String(list[0]).slice(0, 40);
    }
  } catch (e) {
    probe.err = String(e.message || e).slice(0, 80);
  }
  flyCache.val = probe;
  flyCache.t = nowMs;
  return probe;
}

function normalizeTrace(raw, id) {
  const r = raw && (raw.trace || raw.data || raw);
  const out = { id: String(id), type: null, demo: false, nodeCount: 0, pre: 0, post: 0, info: '', points: { x: [], y: [], z: [] }, links: { connectTo: [], linkedNodes: [] } };
  if (!r) return out;
  out.type = r.type || r.cellType || null;
  out.pre = (typeof r.pre === 'number') ? r.pre : (r.preCount || 0);
  out.post = (typeof r.post === 'number') ? r.post : (r.postCount || 0);
  if (r.nodes && r.nodes.length && r.nodes[0].pos) {
    const step = Math.max(1, Math.ceil(r.nodes.length / 600));
    let j = 0;
    for (let i = 0; i < r.nodes.length; i += step) {
      const n = r.nodes[i];
      out.points.x.push(n.pos.x); out.points.y.push(n.pos.y); out.points.z.push(n.pos.z);
      out.links.connectTo.push((typeof n.parent === 'number') ? j - 1 : -1);
      out.links.linkedNodes.push(j);
      j++;
    }
  } else if (r.points && Array.isArray(r.points.x)) {
    const step = Math.max(1, Math.ceil(r.points.x.length / 600));
    for (let i = 0; i < r.points.x.length; i += step) {
      out.points.x.push(r.points.x[i]); out.points.y.push(r.points.y[i]); out.points.z.push(r.points.z[i]);
    }
    if (r.links && Array.isArray(r.links.connectTo)) out.links.connectTo = r.links.connectTo;
    if (r.links && Array.isArray(r.links.linkedNodes)) out.links.linkedNodes = r.links.linkedNodes;
  }
  out.nodeCount = out.points.x.length;
  return out;
}

const neuCacheKey = (k) => 'n|' + k;

async function neuron(cfg, id) {
  const key = neuCacheKey(id);
  if (neuCache[key] && Date.now() - neuCache[key].t < 300000) return neuCache[key].val;
  let out = sampleNeuron(id);
  if (!out && String(id).indexOf('demo') !== 0) {
    try {
      const raw = await neuFetch(cfg, '/api/trace/' + encodeURIComponent(id));
      const n = normalizeTrace(raw, id);
      if (n.points.x.length > 2) out = n;
    } catch (e) {
      const fallback = DEMO_NEURONS[Math.abs(Number(id) || 0) % DEMO_NEURONS.length];
      out = sampleNeuron(fallback.id);
      if (out) out.info = 'Не удалось получить нейрон ' + id + ' из NeuPrint, показан демо-нейрон: ' + fallback.type;
    }
  }
  if (!out) return null;
  neuCache[key] = { t: Date.now(), val: out };
  return out;
}

function neuronsList() {
  return DEMO_NEURONS;
}

async function cypherCount(cfg, q) {
  try {
    const dataset = (await tryNeuprint(cfg)).dataset;
    const cypher = dataset
      ? 'MATCH (n:Neuron) RETURN count(n) AS c'
      : 'MATCH (n:Neuron) RETURN count(n) AS c';
    const body = JSON.stringify({ cypher });
    const data = await neuFetch(cfg, '/api/cypher/basic?dataset=' + encodeURIComponent(dataset), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }, 5000);
    const rows = data && (data.data || data.rows);
    if (Array.isArray(rows) && rows[0]) {
      const v = Array.isArray(rows[0]) ? rows[0][0] : rows[0].c;
      const n = Number(v);
      if (isFinite(n)) return n;
    }
  } catch (e) {}
  return null;
}

function localAnswer(q) {
  const s = String(q || '').toLowerCase();
  if (/(сколько|количество|число|много)\s.*нейрон|нейрон.*(сколько|количество)/.test(s)) {
    return { text: OFFLINE_FACTS[0] + ' ' + OFFLINE_FACTS[1], source: 'offline' };
  }
  if (/синапс/.test(s)) return { text: OFFLINE_FACTS[1], source: 'offline' };
  if (/гемибрейн|hemibrain/.test(s)) return { text: OFFLINE_FACTS[1], source: 'offline' };
  if (/кеньон|грибовидн|мушрум|mushroom|kc\b/.test(s)) return { text: OFFLINE_FACTS[2] + ' ' + OFFLINE_FACTS[3], source: 'offline' };
  if (/mbon/.test(s)) return { text: OFFLINE_FACTS[3], source: 'offline' };
  if (/проекцион|pn\b|обоняни/.test(s)) return { text: OFFLINE_FACTS[4], source: 'offline' };
  if (/зрительн|фоторецептор|медулл|глаз/.test(s)) return { text: OFFLINE_FACTS[5], source: 'offline' };
  if (/инструмент|библиотек|python|navis|neuprint|brian|nest|pytorch|tensorflow|как.*анализир|как.*выгруж/.test(s)) {
    return { text: OFFLINE_FACTS[6] + ' ' + OFFLINE_FACTS[7] + ' ' + OFFLINE_FACTS[8], source: 'offline' };
  }
  if (/2024|полный.*мозг|весь.*мозг/.test(s)) return { text: OFFLINE_FACTS[0], source: 'offline' };
  return null;
}

/**
 * Чат с «Мухой»: контекст = офлайн-факты + (если NeuPrint жив) результат
 * запроса по количеству нейронов. Ответ генерирует LLM; при недоступности
 * модели — локальный поиск по фактам.
 */
async function chat(cfg, text, llm) {
  const q = String(text || '').trim();
  const ctx = [];
  const live = await tryNeuprint(cfg);
  if (live.ok && live.dataset) {
    ctx.push('Доступен живой NeuPrint, датасет: ' + live.dataset + '.');
    const cnt = await cypherCount(cfg, q);
    if (cnt) ctx.push('Живой запрос по NeuPrint: всего нейронов — ' + cnt + '.');
  } else {
    ctx.push('NeuPrint недоступен, отвечаем из встроенного офлайн-справочника.');
  }
  ctx.push(OFFLINE_FACTS.join('\n'));
  const sys = 'Ты — ИИ-агент «Муха», эксперт по коннектому мозга плодовой мухи (Drosophila melanogaster). Отвечай кратко, по делу, на русском. Используй только данные ниже:\n\n' + ctx.join('\n\n');
  const fn = llm || ai.askLLM;
  const got = await fn(cfg, sys, q);
  if (got) return { text: got, source: 'llm' };
  const local = localAnswer(q);
  if (local) return local;
  return { text: 'Не нашёл данных по этому вопросу в коннектоме. Попробуйте спросить про число нейронов, синапсы, клетки Кеньона, MBON, зрительную систему или инструменты (neuprint-python, navis, Brian2, PyTorch).', source: 'offline' };
}

async function status(cfg) {
  const probe = await tryNeuprint(cfg);
  return Object.assign({ enabled: cfg.flyEnabled !== false }, probe, { neurons: DEMO_NEURONS.length });
}

module.exports = { chat, neuron, neuronsList, status, OFFLINE_FACTS, localAnswer };