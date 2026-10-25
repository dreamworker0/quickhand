const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = (file) => fs.readFileSync(path.join(__dirname, '../../src', file), 'utf8');

// Only the DOM surface used by recognition; real event behavior is checked in Chrome.
class Element {
  constructor(attrs = {}, text = '') {
    this.attrs = attrs;
    this.textContent = text;
    this.childElementCount = 0;
    this.parentElement = null;
    this.classList = { contains: () => false };
  }
  getAttribute(name) { return this.attrs[name] ?? null; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  closest(selector) {
    if (selector.includes('textarea')) return this.attrs.typing ? this : null;
    if (selector.startsWith('input') || selector.startsWith('a[') || selector === '.TO' || selector.includes('.docs-sheet-tab')) return null;
    return this.attrs.control ? this : null;
  }
}

function siteEnv(id) {
  const editor = ['docs', 'sheets', 'slides'].includes(id);
  const pathname = { docs: '/document/test/edit', sheets: '/spreadsheets/test/edit', slides: '/presentation/test/edit', youtube: '/watch' }[id] || '/';
  const listeners = {};
  const messages = [];
  const window = { addEventListener: (name, fn) => { listeners[name] = fn; }, removeEventListener() {} };
  window.top = window;
  const ctx = vm.createContext({
    window, Element, location: { hostname: editor ? 'docs.google.com' : id === 'youtube' ? 'www.youtube.com' : id + '.google.com', pathname, hash: '#inbox' },
    document: { fullscreenElement: null, querySelectorAll: () => [] },
    navigator: { platform: 'Win32' }, setInterval() {}, setTimeout,
    chrome: { i18n: { getMessage: (k) => k, getUILanguage: () => 'ko' }, runtime: {
      id: 'offline-test', sendMessage: async (msg) => { messages.push(msg); }, onMessage: { addListener() {} },
    } },
  });
  for (const file of ['core/keys.js', 'core/names.js', 'sites/' + (editor ? 'google-editors' : id) + '.js']) vm.runInContext(source(file), ctx);
  return { ctx, site: ctx.QH.sites.find((s) => s.id === id), listeners, messages,
    start: () => vm.runInContext(source('content/main.js'), ctx) };
}

function event(code, key, patch = {}) {
  return { code, key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false,
    target: new Element(), isTrusted: true, repeat: false, ...patch };
}

function backgroundEnv(storage = {}) {
  let listener, command;
  const area = (name) => ({
    async get(key) { const value = structuredClone(storage[name]?.[key]); await Promise.resolve(); return { [key]: value }; },
    async set(values) { storage[name] = { ...storage[name], ...structuredClone(values) }; },
    async remove(key) { if (storage[name]) delete storage[name][key]; },
  });
  const ctx = vm.createContext({
    console, chrome: { storage: { local: area('local'), sync: area('sync') },
      action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {} },
      runtime: { onMessage: { addListener: (fn) => { listener = fn; } }, onInstalled: { addListener() {} }, onStartup: { addListener() {} } },
      commands: { onCommand: { addListener: (fn) => { command = fn; } } },
    },
  });
  ctx.self = ctx;
  ctx.importScripts = (file) => vm.runInContext(source(file), ctx);
  vm.runInContext(source('background.js'), ctx);
  return { storage, command: () => command('toggle-alerts', null),
    request: (msg) => new Promise((resolve) => listener(msg, {}, resolve)) };
}

module.exports = { siteEnv, backgroundEnv, Element, event };
