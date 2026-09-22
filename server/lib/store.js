'use strict';

const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.AW_DATA_DIR || path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'chats.json');
const CHATLOG = path.join(DATA_DIR, 'chatlog.ndjson');

function ensure() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

let state = { chats: {} };

function load() {
  ensure();
  try {
    state = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    if (!state.chats) state = { chats: {} };
  } catch (e) {
    state = { chats: {} };
  }
}

function persist() {
  ensure();
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state));
  fs.renameSync(tmp, FILE);
}

function appendLog(entry) {
  ensure();
  fs.appendFileSync(CHATLOG, JSON.stringify(entry) + '\n');
}

function getChats() {
  return state.chats;
}

function getChat(id) {
  return state.chats[id] || null;
}

function mutate(fn) {
  const r = fn(state);
  persist();
  return r;
}

function genId(prefix) {
  return (prefix || 'id') + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
}

load();

module.exports = { mutate, getChat, getChats, genId, appendLog, DATA_DIR, FILE, CHATLOG };