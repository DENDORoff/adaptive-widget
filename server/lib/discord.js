'use strict';

const http = require('http');
const https = require('https');
const { URL } = require('url');

let webhook = '';
let username = 'Adaptive Widget';
let avatar = '';
let insecure = false;

const TITLES = {
  chat_created: 'Новый чат',
  user_message: 'Сообщение клиента',
  handoff: 'Запрос оператора',
  unresolved: 'Нерешённый вопрос',
  agent_reply: 'Ответ оператора',
  resolved: 'Вопрос решён клиентом',
  resume: 'Возврат к ИИ-агенту',
  rating: 'Оценка диалога',
  ticket_expired: 'Тикет удалён (TTL)',
  email_sent: 'Письмо отправлено'
};

const COLORS = {
  chat_created: 0x3b82f6,
  user_message: 0x0ea5e9,
  handoff: 0xf59e0b,
  unresolved: 0xef4444,
  agent_reply: 0x22c55e,
  resolved: 0x10b981,
  resume: 0x6366f1,
  rating: 0xeab308,
  ticket_expired: 0x64748b,
  email_sent: 0x8b5cf6
};

const queue = [];
let sending = false;
const MIN_GAP = 350;
let lastSentAt = 0;

function configure(cfg) {
  const w = cfg && cfg.discordWebhook;
  webhook = typeof w === 'string' ? w.trim() : '';
  if (cfg && typeof cfg.discordUsername === 'string' && cfg.discordUsername.trim()) username = cfg.discordUsername.trim();
  if (cfg && typeof cfg.discordAvatar === 'string') avatar = cfg.discordAvatar.trim();
  insecure = !!(cfg && cfg.discordInsecure);
  return webhook;
}

function isOn() { return !!webhook; }

function short(v, n) {
  const s = String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  return s.length > (n || 300) ? s.slice(0, n || 300) + '…' : s;
}

function build(event, data) {
  data = data || {};
  const fields = [];
  const add = (name, value) => {
    if (value === undefined || value === null || value === '') return;
    fields.push({ name, value: short(value, 1000), inline: true });
  };
  add('Сайт', data.site || data.siteName);
  add('Email', data.email);
  add('Чат', data.chatId);
  add('Источник', data.source);
  add('Оценка', data.score ? data.score + ' / 5' : '');
  add('Режим', data.mode);
  if (data.title) add('Запись', data.title);
  if (data.to) add('Кому', data.to);

  const embed = {
    color: COLORS[event] || 0x64748b,
    title: TITLES[event] || event,
    timestamp: new Date().toISOString()
  };
  if (data.text) embed.description = short(data.text, 1500);
  if (fields.length) embed.fields = fields.slice(0, 25);

  const payload = { username: username, embeds: [embed] };
  if (avatar) payload.avatar_url = avatar;
  return payload;
}

function enqueue(payload) {
  queue.push(payload);
  if (queue.length > 100) queue.shift();
  pump();
}

function pump() {
  if (sending || !queue.length || !webhook) return;
  sending = true;
  const payload = queue.shift();
  const wait = Math.max(0, MIN_GAP - (Date.now() - lastSentAt));
  setTimeout(() => post(payload, () => { sending = false; lastSentAt = Date.now(); pump(); }), wait);
}

function post(payload, done) {
  let u;
  try { u = new URL(webhook); } catch (e) { done(); return; }
  const mod = u.protocol === 'http:' ? http : https;
  const body = JSON.stringify(payload);
  const req = mod.request({
    hostname: u.hostname,
    port: u.port || (u.protocol === 'http:' ? 80 : 443),
    path: u.pathname + (u.search || ''),
    method: 'POST',
    rejectUnauthorized: !insecure,
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
  }, (res) => {
    res.resume();
    res.on('end', () => {
      if (res.statusCode >= 400) console.error('[discord] webhook ' + res.statusCode);
      done();
    });
  });
  req.on('error', (e) => {
    if (/CERT|self.signed|issuer/i.test(e.code || e.message || '')) {
      console.error('[discord] ошибка сертификата (' + (e.code || e.message) + '). Установите discordInsecure: true в config.json, если у вас корпоративный прокси/антивирус подменяет сертификаты.');
    } else {
      console.error('[discord] ' + e.message);
    }
    done();
  });
  req.setTimeout(8000, () => req.destroy());
  req.write(body);
  req.end();
}

// Отправляет уведомление о событии (не блокирует вызывающий код).
function notify(event, data) {
  if (!webhook) return false;
  enqueue(build(event, data || {}));
  return true;
}

// Произвольное сообщение (используется в тестах/диагностике).
function sendText(text) {
  if (!webhook) return false;
  enqueue({ username: username, content: short(text, 1900) });
  return true;
}

module.exports = { configure, isOn, notify, sendText, build };
