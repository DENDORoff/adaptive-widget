'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const store = require('./lib/store');
const mailer = require('./lib/mailer');
const ai = require('./lib/ai');
const agent = require('./lib/agent');
const kb = require('./lib/kb');
const discord = require('./lib/discord');
const fly = require('./lib/fly');

const ADMIN_DIR = path.join(__dirname, '..', 'admin');
const DEMO_DIR = path.join(__dirname, '..', 'demo');
const WIDGET_DIR = path.join(__dirname, '..', 'widget');

const CFG_PATH = process.env.AW_CONFIG || path.join(__dirname, 'config.json');

function loadConfig() {
  const def = {
    provider: 'ollama',
    endpoint: process.env.AW_ENDPOINT || 'http://localhost:11434/v1/chat/completions',
    model: process.env.AW_MODEL || 'qwen2.5:3b',
    apiKey: process.env.AW_API_KEY || '',
    from: 'support@deworld.su',
    adminToken: process.env.AW_ADMIN_TOKEN || '',
    instructions: '',
    askEmail: true,
    qa: [],
    qaThreshold: 0.45,
    agentMode: 'rag',
    ticketTtlDays: 14,
    smtp: null,
    discordWebhook: process.env.AW_DISCORD_WEBHOOK || '',
    discordUsername: 'Adaptive Widget',
    discordAvatar: '',
    discordInsecure: /^(1|true|yes)$/i.test(process.env.AW_DISCORD_INSECURE || ''),
    operatorsEnabled: true,
    flyEnabled: true,
    flyBase: process.env.AW_FLY_BASE || 'https://neuprint.janelia.org',
    siteUrl: process.env.AW_SITE_URL || 'http://127.0.0.1:8000',
    siteToken: process.env.AW_SITE_TOKEN || '',
    siteName: process.env.AW_SITE_NAME || '',
    hidePopular: false,
    hiddenPopular: []
  };
  try {
    if (fs.existsSync(CFG_PATH)) Object.assign(def, JSON.parse(fs.readFileSync(CFG_PATH, 'utf8')));
  } catch (e) {
    console.error('[server] config не прочитан:', e.message);
  }
  return def;
}

function saveConfigFile() {
  try {
    if (fs.existsSync(CFG_PATH)) {
      fs.writeFileSync(CFG_PATH, JSON.stringify(CFG, null, 2));
      return true;
    }
  } catch (e) {
    console.error('[server] config не сохранён:', e.message);
  }
  return false;
}

const CFG = loadConfig();
mailer.configure(CFG);
discord.configure(CFG);

function normQ(v) {
  return String(v || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function isHiddenQ(q) {
  const nq = normQ(q);
  return !!nq && (CFG.hiddenPopular || []).some((h) => normQ(h) === nq);
}

const CACHE_FILE = path.join(store.DATA_DIR, 'answers-cache.json');
const CACHE = { entries: {}, hits: 0 };

function loadCache() {
  try {
    if (fs.existsSync(CACHE_FILE)) Object.assign(CACHE.entries, JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')));
  } catch (e) { CACHE.entries = {}; }
}

function saveCache() {
  try {
    if (!fs.existsSync(path.dirname(CACHE_FILE))) fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(CACHE.entries, null, 2));
  } catch (e) { console.error('[server] cache не сохранён:', e.message); }
}

function cacheGet(q) {
  const k = ai.cacheKey(q);
  const e = k && CACHE.entries[k];
  if (!e) return null;
  e.count = (e.count || 0) + 1;
  CACHE.hits++;
  saveCache();
  return { text: e.text, source: 'cache' };
}

function cacheSet(q, text) {
  const k = ai.cacheKey(q);
  if (!k || !text) return;
  CACHE.entries[k] = { q: String(q).slice(0, 200), text, count: (CACHE.entries[k] || {}).count || 0, ts: now() };
  const keys = Object.keys(CACHE.entries);
  if (keys.length > 500) delete CACHE.entries[keys[0]];
  saveCache();
}

loadCache();

const SSE_CLIENTS = Object.create(null);

function sseClients(chatId) {
  if (!SSE_CLIENTS[chatId]) SSE_CLIENTS[chatId] = new Set();
  return SSE_CLIENTS[chatId];
}
function sseCount(chatId) { return SSE_CLIENTS[chatId] ? SSE_CLIENTS[chatId].size : 0; }
function sseSend(chatId, event, data) {
  const payload = 'event: ' + event + '\ndata: ' + JSON.stringify(data) + '\n\n';
  sseClients(chatId).forEach((res) => { try { res.write(payload); } catch (e) {} });
}

function readBody(req) {
  return new Promise((resolve) => {
    let b = '';
    req.on('data', (c) => (b += c));
    req.on('end', () => { try { resolve(b ? JSON.parse(b) : {}); } catch (e) { resolve({}); } });
  });
}

function json(res, code, data) {
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-admin-token'
  });
  res.end(JSON.stringify(data));
}

function now() { return new Date().toISOString(); }
function logChat(action, chatId, extra) {
  store.appendLog(Object.assign({ at: now(), action, chatId }, extra || {}));
}

function pruneTickets(forceNow) {
  const ttl = Number(CFG.ticketTtlDays);
  if (!isFinite(ttl) || ttl <= 0) return 0;
  const cutoff = (forceNow || Date.now()) - ttl * 86400000;
  const chats = store.getChats();
  const doomed = [];
  Object.keys(chats).forEach((id) => {
    const c = chats[id];
    const ts = Date.parse(c.updatedAt || '') || Date.parse(c.createdAt || '') || 0;
    if (ts && ts < cutoff) doomed.push(id);
  });
  if (!doomed.length) return 0;
  store.mutate((s) => {
    doomed.forEach((id) => delete s.chats[id]);
    return { removed: doomed.length };
  });
  doomed.forEach((id) => logChat('ticket_expired', id, { ttlDays: ttl }));
  return doomed.length;
}

const FALLBACK_TEXT = 'Не нашёл точного ответа по данным этого сайта. Переформулируйте вопрос или напишите в поддержку: ';

function computeStats() {
  const chats = store.getChats();
  const nowMs = Date.now();
  const activeWindow = 60 * 1000;
  let onlineUsers = 0, activeChats = 0, answers = 0, unresolved = 0, ratedCount = 0, ratingSum = 0;
  const sites = new Set();
  const queryList = [];
  const unresolvedList = [];
  Object.keys(chats).forEach((id) => {
    const c = chats[id];
    if (c.siteName) sites.add(c.siteName);
    const sse = sseCount(id);
    if (sse > 0) onlineUsers += sse;
    const last = c.lastSeen ? Date.parse(c.lastSeen) : Date.parse(c.updatedAt || 0);
    if (sse > 0 || nowMs - last < activeWindow) activeChats++;
    (c.messages || []).forEach((m) => { if (m.role === 'bot') answers++; });
    (c.hits || []).forEach((h) => {
      queryList.push(h.q);
      if (!h.resolved) unresolvedList.push({ q: h.q, site: h.site || '', chatId: h.chatId || null, ts: h.ts });
    });
    if (c.rating) { ratedCount++; ratingSum += c.rating; }
  });
  const popularMap = {};
  queryList.forEach((q) => {
    const k = String(q || '').trim().toLowerCase();
    if (k) {
      if (!popularMap[k]) popularMap[k] = { q: String(q).trim().slice(0, 120), count: 0 };
      popularMap[k].count++;
    }
  });
  const popular = Object.keys(popularMap).map((k) => popularMap[k]).sort((a, b) => b.count - a.count).slice(0, 10)
    .map((p) => Object.assign({}, p, { hidden: isHiddenQ(p.q) }));
  unresolvedList.reverse();
  return {
    generatedAt: now(),
    totalSites: sites.size,
    totalChats: Object.keys(chats).length,
    activeChats,
    onlineUsers,
    answers,
    unresolved: unresolvedList.length,
    ratings: { count: ratedCount, avg: ratedCount ? ratingSum / ratedCount : 0 },
    popular,
    hidePopular: !!CFG.hidePopular,
    hiddenPopular: Array.isArray(CFG.hiddenPopular) ? CFG.hiddenPopular.slice(0, 100) : [],
    unresolvedQueries: unresolvedList.slice(0, 25),
    ai: { provider: CFG.provider, endpoint: CFG.endpoint, model: CFG.model, from: mailer.from, instructionsSet: !!CFG.instructions, qaCount: (CFG.qa || []).length, qaThreshold: CFG.qaThreshold, agentMode: CFG.agentMode },
    cache: { size: Object.keys(CACHE.entries).length, hits: CACHE.hits }
  };
}

function publicConfig() {
  return {
    provider: CFG.provider,
    endpoint: CFG.endpoint,
    model: CFG.model,
    apiKey: CFG.apiKey ? String(CFG.apiKey).slice(0, 3) + '…' + String(CFG.apiKey).slice(-4) : '',
    from: CFG.from,
    instructions: CFG.instructions || '',
    askEmail: CFG.askEmail !== undefined ? !!CFG.askEmail : true,
    operatorsEnabled: !!CFG.operatorsEnabled,
    flyEnabled: !!CFG.flyEnabled,
    qa: (CFG.qa || []).slice(0, 200).map((x) => ({ q: x.q || '', a: x.a || '', keys: Array.isArray(x.keys) ? x.keys.slice(0, 20) : [] })),
    qaThreshold: CFG.qaThreshold,
    agentMode: CFG.agentMode,
    ticketTtlDays: CFG.ticketTtlDays,
    smtp: (CFG.smtp && CFG.smtp.host) ? { on: true, host: CFG.smtp.host, port: CFG.smtp.port || 465, secure: CFG.smtp.secure !== false, user: CFG.smtp.user || '' } : { on: false },
    hidePopular: !!CFG.hidePopular,
    hiddenPopular: Array.isArray(CFG.hiddenPopular) ? CFG.hiddenPopular.slice(0, 100) : [],
    discord: {
      on: !!CFG.discordWebhook,
      webhook: CFG.discordWebhook ? String(CFG.discordWebhook).replace(/\/[^/]{6,}$/, '/…') : '',
      username: CFG.discordUsername || 'Adaptive Widget',
      avatar: CFG.discordAvatar || '',
      insecure: !!CFG.discordInsecure
    }
  };
}

function chip(chat) {
  const ms = chat.messages || [];
  let waiting = false;
  if (chat.status === 'human') {
    for (let i = ms.length - 1; i >= 0; i--) {
      if (ms[i].role === 'agent') { waiting = false; break; }
      if (ms[i].role === 'user') { waiting = true; break; }
    }
  }
  return {
    id: chat.id,
    email: chat.email || '',
    siteName: chat.siteName || '',
    status: chat.status,
    waiting,
    createdAt: chat.createdAt,
    updatedAt: chat.updatedAt,
    messageCount: ms.length,
    unresolvedCount: (chat.hits || []).filter((h) => !h.resolved).length,
    lastText: ms.length ? String(ms[ms.length - 1].text).slice(0, 80) : ''
  };
}

function serveAdmin(res, p) {
  let file = p;
  if (file === '/' || file === '/admin' || file === '/admin/') file = '/admin/index.html';
  const fp = path.join(ADMIN_DIR, path.normalize(file.replace(/^\/admin/, '')));
  if (!fp.startsWith(ADMIN_DIR) || !fs.existsSync(fp)) { res.writeHead(404); res.end('not found'); return; }
  const ext = path.extname(fp);
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
  res.writeHead(200, { 'Content-Type': types[ext] || 'text/plain' });
  fs.createReadStream(fp).pipe(res);
}

function serveDir(res, p, root, prefix) {
  let file = p;
  if (file === prefix || file === prefix + '/') file = prefix + '/index.html';
  const fp = path.join(root, path.normalize(file.replace(prefix, '')));
  if (!fp.startsWith(root) || !fs.existsSync(fp)) { res.writeHead(404); res.end('not found'); return; }
  const ext = path.extname(fp);
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };
  res.writeHead(200, { 'Content-Type': types[ext] || 'text/plain' });
  fs.createReadStream(fp).pipe(res);
}

function adminGuard(req, res) {
  if (CFG.adminToken && req.headers['x-admin-token'] !== CFG.adminToken) { json(res, 401, { error: 'forbidden' }); return false; }
  return true;
}

function widgetOnline() {
  const out = [];
  const cuf = Date.now();
  Object.keys(store.getChats()).forEach((id) => {
    const c = store.getChat(id);
    if (!c || c.status === 'closed') return;
    const t = typeof c.updatedAt === 'string' ? new Date(c.updatedAt).getTime() : 0;
    if (t && cuf - t < 10 * 60 * 1000) out.push({ id, siteName: c.siteName || '', page: c.page || '', updatedAt: c.updatedAt });
  });
  out.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  return { total: out.length, chats: out };
}

async function proxySite(req, res, u) {
  const sub = u.pathname.slice('/api/site'.length) || '/';
  const dest = (CFG.siteUrl || 'http://127.0.0.1:8000') + '/api/site' + sub + u.search;
  let body;
  if (req.method === 'POST' || req.method === 'PUT') body = JSON.stringify(await readBody(req));
  try {
    const up = await fetch(dest, {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-Site-Token': CFG.siteToken || ''
      },
      body
    });
    const text = await up.text();
    res.writeHead(up.status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(text);
  } catch (e) {
    json(res, 502, { ok: false, error: 'site_unreachable', detail: String(e && e.message || e) });
  }
}

async function handle(req, res) {
  const u = new URL(req.url, 'http://localhost');

  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-admin-token' });
    res.end();
    return;
  }

  if ((u.pathname === '/demo' || u.pathname === '/demo/' || u.pathname.indexOf('/demo/') === 0) && req.method === 'GET') {
    return serveDir(res, u.pathname, DEMO_DIR, '/demo');
  }

  if (u.pathname === '/widget/adaptive-widget.js' && req.method === 'GET') {
    return serveDir(res, u.pathname, WIDGET_DIR, '/widget');
  }

  if (u.pathname === '/' || u.pathname === '/admin' || u.pathname === '/admin/' || u.pathname.indexOf('/admin/') === 0) {
    return serveAdmin(res, u.pathname);
  }

  if (u.pathname === '/api/health') {
    return json(res, 200, { ok: true, from: mailer.from });
  }

  if (u.pathname === '/api/init' && req.method === 'POST') {
    const body = await readBody(req);
    const chatId = String(body.chatId || '').slice(0, 120) || store.genId('c');
    const snap = {
      email: String(body.email || '').slice(0, 200),
      siteName: String(body.siteName || '').slice(0, 200),
      page: String(body.page || '').slice(0, 500),
      instructions: String(body.instructions || '').slice(0, 4000),
      promptSnap: String(body.prompt || '').slice(0, 8000)
    };
    const chat = store.getChat(chatId);
    if (chat) {
      Object.keys(snap).forEach((k) => { if (snap[k]) chat[k] = snap[k]; });
      if (Array.isArray(body.knowledge)) chat.knowledge = body.knowledge.slice(0, 80);
      chat.updatedAt = now();
      logChat('chat_refresh', chatId, { email: snap.email });
    } else {
      store.mutate((s) => {
        s.chats[chatId] = Object.assign({
          id: chatId,
          createdAt: now(),
          updatedAt: now(),
          status: 'ai',
          knowledge: Array.isArray(body.knowledge) ? body.knowledge.slice(0, 80) : [],
          messages: []
        }, snap);
        return s;
      });
      logChat('chat_created', chatId, { email: snap.email, site: snap.siteName });
      discord.notify('chat_created', { chatId, site: snap.siteName, email: snap.email, page: snap.page });
    }
    return json(res, 200, { ok: true, chatId, operatorsEnabled: !!CFG.operatorsEnabled, flyEnabled: !!CFG.flyEnabled, askEmail: CFG.askEmail === true, aiEnabled: CFG.aiEnabled !== false });
  }

  if (u.pathname === '/api/flags' && req.method === 'GET') {
    return json(res, 200, {
      ok: true,
      operatorsEnabled: !!CFG.operatorsEnabled,
      flyEnabled: !!CFG.flyEnabled,
      askEmail: CFG.askEmail === true,
      aiEnabled: CFG.aiEnabled !== false
    });
  }

  if (u.pathname === '/api/chats' && req.method === 'GET') {
    if (!adminGuard(req, res)) return;
    const list = Object.keys(store.getChats()).map((id) => chip(store.getChat(id)));
    list.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    return json(res, 200, list);
  }

  if (u.pathname === '/api/stats' && req.method === 'GET') {
    if (!adminGuard(req, res)) return;
    return json(res, 200, computeStats());
  }

  if (u.pathname === '/api/faq' && req.method === 'GET') {
    const seen = new Set();
    const items = [];
    const push = (q, source) => {
      const k = ai.cacheKey(q);
      if (!q || !k || seen.has(k)) return;
      if (isHiddenQ(q)) return;
      seen.add(k);
      items.push({ q: String(q).slice(0, 120), source });
    };
    if (!CFG.hidePopular) computeStats().popular.forEach((p) => push(p.q, 'popular'));
    (CFG.qa || []).forEach((item) => { if (item && item.q) push(item.q, 'qa'); });
    return json(res, 200, { items: items.slice(0, 8) });
  }

  if (u.pathname === '/api/fly/status' && req.method === 'GET') {
    return json(res, 200, await fly.status(CFG));
  }

  if (u.pathname === '/api/fly/neurons' && req.method === 'GET') {
    return json(res, 200, { items: fly.neuronsList(), enabled: !!CFG.flyEnabled });
  }

  if (u.pathname === '/api/fly/chat' && req.method === 'POST') {
    if (CFG.flyEnabled === false) return json(res, 400, { error: 'fly_disabled' });
    const body = await readBody(req);
    const q = String(body.text || '').slice(0, 2000);
    if (!q.trim()) return json(res, 400, { error: 'empty text' });
    const ans = await fly.chat(CFG, q);
    return json(res, 200, { ok: true, text: ans.text, source: ans.source });
  }

  const fm = u.pathname.match(/^\/api\/fly\/neuron\/([^/]+)$/);
  if (fm && req.method === 'GET') {
    if (CFG.flyEnabled === false) return json(res, 400, { error: 'fly_disabled' });
    const data = await fly.neuron(CFG, decodeURIComponent(fm[1]));
    if (!data) return json(res, 404, { error: 'neuron not found' });
    return json(res, 200, data);
  }

  if (u.pathname === '/api/site/overview' && req.method === 'GET') {
    if (!adminGuard(req, res)) return;
    return proxySite(req, res, u);
  }

  if (u.pathname === '/api/site/widget/online' && req.method === 'GET') {
    if (!adminGuard(req, res)) return;
    return json(res, 200, widgetOnline());
  }

  if (u.pathname === '/api/site/online' && req.method === 'GET') {
    if (!adminGuard(req, res)) return;
    return proxySite(req, res, u);
  }

  if (u.pathname === '/api/site/cache/clear' && req.method === 'POST') {
    if (!adminGuard(req, res)) return;
    return proxySite(req, res, u);
  }

  if (u.pathname.startsWith('/api/site/news') && (req.method === 'GET' || req.method === 'POST' || req.method === 'PUT' || req.method === 'DELETE')) {
    if (!adminGuard(req, res)) return;
    return proxySite(req, res, u);
  }

  if (u.pathname.startsWith('/api/site/sections')) {
    if (!adminGuard(req, res)) return;
    return proxySite(req, res, u);
  }

  if (u.pathname === '/api/instructions' && req.method === 'GET') {
    if (!adminGuard(req, res)) return;
    return json(res, 200, { items: kb.list() });
  }

  if (u.pathname === '/api/instructions' && req.method === 'POST') {
    if (!adminGuard(req, res)) return;
    const body = await readBody(req);
    const item = kb.add({ title: body.title, text: body.text, site: body.site, source: 'manual' });
    if (!item) return json(res, 400, { error: 'empty instruction' });
    logChat('instruction_added', 'global', { title: item.title.slice(0, 120) });
    return json(res, 200, { ok: true, item });
  }

  if (u.pathname === '/api/instructions' && req.method === 'DELETE') {
    if (!adminGuard(req, res)) return;
    const id = String(u.searchParams.get('id') || '');
    const removed = kb.remove(id);
    if (!removed) return json(res, 404, { error: 'not found' });
    logChat('instruction_removed', 'global', { id });
    return json(res, 200, { ok: true });
  }

  if (u.pathname === '/api/smtp/test' && req.method === 'POST') {
    if (!adminGuard(req, res)) return;
    const body = await readBody(req);
    const to = String(body.to || '').trim() || CFG.from;
    const rec = await mailer.sendEmail({
      to,
      subject: 'Тест Adaptive Widget',
      text: 'Это тестовое письмо от Adaptive Widget. Если вы его видите — SMTP настроен верно.'
    });
    logChat('smtp_test', 'global', { to, mode: mailer.smtpConfig ? 'smtp' : 'outbox' });
    return json(res, 200, { ok: true, to: rec.to, mode: mailer.smtpConfig ? 'smtp' : 'outbox' });
  }

  if (u.pathname === '/api/config' && req.method === 'GET') {
    if (!adminGuard(req, res)) return;
    return json(res, 200, publicConfig());
  }

  if (u.pathname === '/api/config' && req.method === 'PUT') {
    if (!adminGuard(req, res)) return;
    const body = await readBody(req);
    const oldFrom = CFG.from;
    ['provider', 'endpoint', 'model', 'from', 'instructions'].forEach((k) => {
      if (typeof body[k] === 'string') CFG[k] = body[k].trim();
    });
    if (typeof body.apiKey === 'string' && body.apiKey.trim()) CFG.apiKey = body.apiKey.trim();
    if (body.askEmail !== undefined) CFG.askEmail = !!body.askEmail;
    if (Array.isArray(body.qa)) {
      CFG.qa = body.qa.slice(0, 300).map((x) => ({
        q: String(x.q || '').trim().slice(0, 300),
        a: String(x.a || '').trim().slice(0, 2000),
        keys: Array.isArray(x.keys) ? x.keys.map((k) => String(k).trim().slice(0, 40)).filter(Boolean).slice(0, 20) : []
      })).filter((x) => x.q && x.a);
    }
    if (typeof body.qaThreshold === 'number' && isFinite(body.qaThreshold)) CFG.qaThreshold = Math.min(0.99, Math.max(0, body.qaThreshold));
    if (body.agentMode === 'rag' || body.agentMode === 'tools') CFG.agentMode = body.agentMode;
    if (body.ticketTtlDays !== undefined) {
      const t = Math.round(Number(body.ticketTtlDays));
      CFG.ticketTtlDays = isFinite(t) ? Math.min(365, Math.max(0, t)) : 0;
    }
    if (body.smtp === null || (body.smtp && typeof body.smtp === 'object')) {
      const sm = body.smtp || {};
      if (!sm.host) {
        CFG.smtp = null;
      } else if (typeof sm.host === 'string' && sm.host.trim()) {
        CFG.smtp = {
          host: sm.host.trim(),
          port: Math.max(1, parseInt(sm.port, 10) || 465),
          secure: sm.secure !== false,
          user: String(sm.user || ''),
          pass: String(sm.pass || ''),
          from: String(sm.from || '').trim() || CFG.from
        };
      }
      mailer.configure(CFG);
    }
    if (typeof body.discordWebhook === 'string') CFG.discordWebhook = body.discordWebhook.trim();
    if (typeof body.discordUsername === 'string' && body.discordUsername.trim()) CFG.discordUsername = body.discordUsername.trim();
    if (typeof body.discordAvatar === 'string') CFG.discordAvatar = body.discordAvatar.trim();
    if (body.discordInsecure !== undefined) CFG.discordInsecure = !!body.discordInsecure;
    if (body.operatorsEnabled !== undefined) CFG.operatorsEnabled = !!body.operatorsEnabled;
    if (body.flyEnabled !== undefined) CFG.flyEnabled = !!body.flyEnabled;
    if (body.hidePopular !== undefined) CFG.hidePopular = !!body.hidePopular;
    if (Array.isArray(body.hiddenPopular)) {
      CFG.hiddenPopular = body.hiddenPopular.map((x) => String(x).trim().slice(0, 120)).filter(Boolean).slice(0, 100);
    }
    if (typeof body.flyBase === 'string' && body.flyBase.trim()) CFG.flyBase = body.flyBase.trim();
    discord.configure(CFG);
    if (CFG.from !== oldFrom) mailer.configure(CFG);
    const persisted = saveConfigFile();
    logChat('config_changed', 'global', { fields: Object.keys(body).join(','), persisted });
    return json(res, 200, Object.assign({ ok: true, persisted }, publicConfig()));
  }

  const m = u.pathname.match(/^\/api\/chat\/([^/]+)\/([a-z]+)$/);
  if (m) {
    let chatId;
    try { chatId = decodeURIComponent(m[1]); } catch (e) { return json(res, 400, { error: 'bad chat id' }); }
    const action = m[2];
    const chat = store.getChat(chatId);

    if (action === 'events' && req.method === 'GET') {
      if (!chat) return json(res, 404, { error: 'chat not found' });
      chat.lastSeen = now();
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
      });
      res.write('event: ready\ndata: {"ok":true}\n\n');
      sseClients(chatId).add(res);
      req.on('close', () => { sseClients(chatId).delete(res); });
      return;
    }

    if (!chat) return json(res, 404, { error: 'chat not found' });

    if (action === 'message' && req.method === 'POST') {
      const body = await readBody(req);
      const text = String(body.text || '').trim().slice(0, 2000);
      if (!text) return json(res, 400, { error: 'empty message' });
      chat.messages.push({ id: store.genId('m'), role: 'user', text, ts: now() });
      chat.updatedAt = now();
      chat.lastSeen = now();
      logChat('user_message', chatId, { text: text.slice(0, 120) });

      let out = [];
      if (chat.status === 'ai') {
        let a = cacheGet(text);
        if (!a) {
          const qa = ai.matchQA(CFG, text);
          if (qa) { a = qa; cacheSet(text, qa.text); }
        }
        if (!a) {
          if (CFG.agentMode === 'tools') {
            const txt = await agent.agentAnswer(CFG, chat.knowledge || [], text, chat.instructions || CFG.instructions);
            a = txt ? { text: txt, source: 'tools' } : null;
          } else {
            a = await ai.answer(CFG, chat, text, chat.instructions || CFG.instructions);
          }
          if (a && a.text) cacheSet(text, a.text);
        }
        if (!a) a = { text: null, source: null };
        chat.lastAnswerSource = a.source || null;
        chat.hits = chat.hits || [];
        chat.hits.push({ q: text, resolved: !!a.text, source: a.source || null, site: chat.siteName || '', chatId, ts: now() });
        logChat('ai_answer', chatId, { source: a.source || null, fallback: a.source === 'search', text: text.slice(0, 120) });
        if (a.text) {
          const botMsg = { id: store.genId('m'), role: 'bot', text: a.text, ts: now() };
          chat.messages.push(botMsg);
          out.push({ id: botMsg.id, from: 'bot', text: botMsg.text });
        } else {
          const fb = { id: store.genId('m'), role: 'bot', text: FALLBACK_TEXT + mailer.from, ts: now() };
          chat.messages.push(fb);
          out.push({ id: fb.id, from: 'bot', text: fb.text });
          logChat('unresolved', chatId, { text: text.slice(0, 120) });
          discord.notify('unresolved', { chatId, text, site: chat.siteName, email: chat.email });
        }
      }
      chat.updatedAt = now();
      return json(res, 200, { mode: chat.status, messages: out });
    }

    if (action === 'rating' && req.method === 'POST') {
      const body = await readBody(req);
      const score = Math.round(Number(body.score));
      if (isFinite(score) && score >= 1 && score <= 5) {
        chat.rating = score;
        chat.ratedAt = now();
        chat.lastSeen = now();
        logChat('rating', chatId, { score });
        discord.notify('rating', { chatId, score, site: chat.siteName, email: chat.email });
        return json(res, 200, { ok: true, score });
      }
      return json(res, 400, { error: 'score must be 1..5' });
    }

    if (action === 'handoff' && req.method === 'POST') {
      if (CFG.operatorsEnabled === false) {
        logChat('handoff_blocked', chatId, { email: chat.email });
        return json(res, 400, { error: 'operators_disabled' });
      }
      chat.status = 'human';
      chat.lastSeen = now();
      chat.messages.push({ id: store.genId('m'), role: 'system', text: 'Чат передан оператору', ts: now() });
      chat.updatedAt = now();
      logChat('handoff', chatId, { email: chat.email });
      discord.notify('handoff', { chatId, site: chat.siteName, email: chat.email, text: chat.messages.slice(-3).map((x) => x.text).join('\n') });
      sseSend(chatId, 'mode', { mode: 'human' });
      return json(res, 200, { ok: true, mode: 'human' });
    }

    if (action === 'resume' && req.method === 'POST') {
      chat.status = 'ai';
      chat.lastSeen = now();
      chat.messages.push({ id: store.genId('m'), role: 'system', text: 'Клиент вернулся к ИИ-агенту', ts: now() });
      chat.updatedAt = now();
      logChat('mode_change', chatId, { mode: 'ai' });
      discord.notify('resume', { chatId, site: chat.siteName, email: chat.email });
      sseSend(chatId, 'mode', { mode: 'ai' });
      return json(res, 200, { ok: true, mode: 'ai' });
    }

    if (action === 'resolve' && req.method === 'POST') {
      chat.status = 'closed';
      chat.resolved = true;
      chat.lastSeen = now();
      chat.messages.push({ id: store.genId('m'), role: 'system', text: 'Клиент подтвердил, что вопрос решён', ts: now() });
      chat.updatedAt = now();
      logChat('resolved', chatId, {});
      discord.notify('resolved', { chatId, site: chat.siteName, email: chat.email, text: chat.messages.slice(-4).map((x) => x.text).join('\n') });
      sseSend(chatId, 'mode', { mode: 'closed' });
      return json(res, 200, { ok: true, mode: 'closed' });
    }

    if (action === 'reply' && req.method === 'POST') {
      if (!adminGuard(req, res)) return;
      if (CFG.operatorsEnabled === false) return json(res, 400, { error: 'operators_disabled' });
      const body = await readBody(req);
      const text = String(body.text || '').trim().slice(0, 2000);
      if (!text) return json(res, 400, { error: 'empty reply' });
      const msg = { id: store.genId('m'), role: 'agent', text, ts: now() };
      chat.messages.push(msg);
      chat.status = chat.status === 'closed' ? 'closed' : 'human';
      chat.updatedAt = now();
      chat.lastSeen = now();
      logChat('agent_reply', chatId, { text: text.slice(0, 120) });
      discord.notify('agent_reply', { chatId, text, site: chat.siteName, email: chat.email });

      if (sseCount(chatId) === 0 && chat.email) {
        const tail = chat.messages.slice(-6).map((x) => (x.role === 'user' ? 'Пользователь: ' : 'Оператор: ') + x.text).join('\n');
        mailer.sendEmail({
          to: chat.email,
          subject: 'Ответ оператора — ' + (chat.siteName || 'ваш чат'),
          text: 'Новый ответ в вашем чате:\n\n' + text + '\n\n--- История ---\n' + tail
        }).then((rec) => logChat('email_sent', chatId, { id: rec.id, to: rec.to }));
      }

      sseSend(chatId, 'reply', { id: msg.id, from: 'agent', text });
      return json(res, 200, { ok: true });
    }

    if (action === 'instructions' && req.method === 'POST') {
      if (!adminGuard(req, res)) return;
      const body = await readBody(req);
      chat.instructions = String(body.instructions || '').slice(0, 4000);
      chat.updatedAt = now();
      chat.lastSeen = now();
      if (chat.instructions.trim()) {
        kb.upsert('chat:' + chatId, { text: chat.instructions, site: chat.siteName });
      }
      logChat('instructions', chatId);
      return json(res, 200, { ok: true });
    }

    if (action === 'mode' && req.method === 'POST') {
      if (!adminGuard(req, res)) return;
      const body = await readBody(req);
      chat.status = body.mode === 'ai' ? 'ai' : 'human';
      chat.lastSeen = now();
      chat.messages.push({ id: store.genId('m'), role: 'system', text: 'Режим: ' + (chat.status === 'ai' ? 'ИИ-агент' : 'оператор'), ts: now() });
      chat.updatedAt = now();
      logChat('mode_change', chatId, { mode: chat.status });
      sseSend(chatId, 'mode', { mode: chat.status });
      return json(res, 200, { ok: true });
    }

    if (action === 'close' && req.method === 'POST') {
      if (!adminGuard(req, res)) return;
      chat.status = 'closed';
      chat.updatedAt = now();
      chat.lastSeen = now();
      logChat('closed', chatId);
      sseSend(chatId, 'mode', { mode: 'closed' });
      return json(res, 200, { ok: true });
    }

    if (action === 'full' && req.method === 'GET') {
      if (!adminGuard(req, res)) return;
      return json(res, 200, chat);
    }

    return json(res, 404, { error: 'unknown action' });
  }

  return json(res, 404, { error: 'not found' });
}

function start(port) {
  pruneTickets();
  const timer = setInterval(pruneTickets, 60 * 60 * 1000);
  if (timer.unref) timer.unref();
  const server = http.createServer(handle);
  server.listen(port, () => {
    console.log('[server] Адаптивный виджет: http://localhost:' + port);
    console.log('[server] Админ-панель:   http://localhost:' + port + '/admin');
    console.log('[server] AI endpoint: ' + CFG.endpoint + ' (' + CFG.model + ')');
    console.log('[server] TTL удаления тикетов: ' + CFG.ticketTtlDays + ' дн. (' + (CFG.ticketTtlDays > 0 ? 'автоочистка' : 'выкл') + ')');
    console.log('[server] Discord-уведомления: ' + (discord.isOn() ? 'включены' : 'выключены'));
  });
  return server;
}

if (require.main === module) {
  start(Number(process.env.PORT || 3000));
}

module.exports = { start, store, ai, mailer, kb, loadConfig, pruneTickets };