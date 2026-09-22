'use strict';

const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.AW_DATA_DIR || path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'instructions.json');

let items = [];

function ensure() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function load() {
  ensure();
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    items = Array.isArray(raw) ? raw : [];
  } catch (e) {
    items = [];
  }
}

function persist() {
  ensure();
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(items, null, 2));
  fs.renameSync(tmp, FILE);
}

function genId() {
  return 'ins_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

function list() {
  return items.slice();
}

function add({ title, text, site, source }) {
  const item = {
    id: genId(),
    title: String(title || '').slice(0, 300),
    text: String(text || '').slice(0, 4000),
    site: String(site || '').slice(0, 200),
    source: source === 'chat' ? 'chat' : 'manual',
    ts: new Date().toISOString()
  };
  if (!item.text) return null;
  items.push(item);
  if (items.length > 500) items.splice(0, items.length - 500);
  persist();
  return item;
}

function upsert(title, patch) {
  const hit = items.find((x) => x.title === title);
  if (hit) {
    hit.text = String(patch.text || hit.text).slice(0, 4000);
    hit.site = patch.site || hit.site;
    hit.ts = new Date().toISOString();
    persist();
    return hit;
  }
  return add({ title, text: patch.text, site: patch.site, source: 'chat' });
}

function remove(id) {
  const before = items.length;
  items = items.filter((x) => x.id !== id);
  if (items.length !== before) persist();
  return items.length !== before;
}

load();

module.exports = { list, add, upsert, remove, FILE };