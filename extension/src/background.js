// Service worker: owns the stored state so every tab and frame goes through one
// place, applies the hint rules, and tells the page when to show a card.
importScripts('core/engine.js');

const { engine } = self.QH;

const DEFAULT_SETTINGS = {
  enabled: true,
  strength: 'normal',
  pauseUntil: 0,
  disabledSites: [],
  onboarded: false,
};

async function getSettings() {
  const { qh_settings } = await chrome.storage.sync.get('qh_settings');
  return Object.assign({}, DEFAULT_SETTINGS, qh_settings);
}

async function setSettings(patch) {
  const settings = Object.assign(await getSettings(), patch);
  await chrome.storage.sync.set({ qh_settings: settings });
  await updateBadge(settings);
  return settings;
}

async function getState() {
  const { qh_state } = await chrome.storage.local.get('qh_state');
  return qh_state || engine.emptyState(Date.now());
}

async function saveState(state) {
  await chrome.storage.local.set({ qh_state: state });
}

// Clicks from several tabs can arrive together; run state updates one at a time
// so a read-modify-write never overwrites another.
let queue = Promise.resolve();
function serial(task) {
  const run = queue.then(task, task);
  queue = run.catch(() => {});
  return run;
}

function isOff(settings) {
  return !settings.enabled || settings.pauseUntil > Date.now();
}

async function updateBadge(settings) {
  const off = isOff(settings || (await getSettings()));
  await chrome.action.setBadgeText({ text: off ? 'OFF' : '' });
  if (off) await chrome.action.setBadgeBackgroundColor({ color: '#173F4F' });
}

async function showCard(tabId, card) {
  try {
    await chrome.tabs.sendMessage(tabId, Object.assign({ type: 'qh-card' }, card), { frameId: 0 });
  } catch (e) {
    // The tab has no content script (e.g. it was open before the extension loaded).
  }
}

async function handle(msg, sender) {
  const tabId = sender.tab ? sender.tab.id : null;
  switch (msg.type) {
    case 'qh-mouse':
      return serial(async () => {
        const settings = await getSettings();
        if (settings.disabledSites.includes(msg.action.site)) return { ok: true };
        const state = await getState();
        const result = engine.recordMouse(state, msg.action, settings, Date.now(), { suppress: msg.suppress });
        await saveState(state);
        if (result.show && tabId !== null) {
          showCard(tabId, {
            variant: 'hint',
            kind: result.kind,
            id: result.action.id,
            site: result.action.site,
            label: result.action.label,
            display: result.action.display,
          });
        }
        await updateBadge(settings);
        return { ok: true };
      });
    case 'qh-key':
      return serial(async () => {
        const settings = await getSettings();
        if (settings.disabledSites.includes(msg.action.site)) return { ok: true };
        const state = await getState();
        const result = engine.recordKey(state, msg.action, Date.now());
        await saveState(state);
        if (result.learnedNow && !isOff(settings) && tabId !== null) {
          showCard(tabId, { variant: 'learned', label: result.action.label, display: result.action.display });
        }
        return { ok: true };
      });
    case 'qh-summary':
      return serial(async () => {
        const state = await getState();
        const day = state.day;
        const summary = engine.summary(state, Date.now());
        // Save only when the day rolled over; a write on every look would wake the
        // popup's change listener and ask for a summary again.
        if (state.day !== day) await saveState(state);
        const settings = await getSettings();
        await updateBadge(settings);
        return { summary, settings };
      });
    case 'qh-mute':
      return serial(async () => {
        const state = await getState();
        const ok = engine.setMuted(state, msg.id, msg.muted !== false, Date.now());
        await saveState(state);
        return { ok };
      });
    case 'qh-skip-observe':
      return serial(async () => {
        const state = await getState();
        await saveState(engine.skipObservation(state));
        return { ok: true };
      });
    case 'qh-settings':
      return setSettings(msg.patch);
    case 'qh-reset':
      return serial(async () => {
        await chrome.storage.local.remove('qh_state');
        return { ok: true };
      });
    default:
      return { error: 'unknown message' };
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handle(msg, sender).then(sendResponse, (err) => sendResponse({ error: String(err) }));
  return true;
});

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== 'toggle-alerts') return;
  const current = await getSettings();
  // Paused or off → turn on (and clear the pause); otherwise turn off.
  const next = await setSettings({ enabled: isOff(current), pauseUntil: 0 });
  if (tab && tab.id !== undefined) showCard(tab.id, { variant: 'toast', on: next.enabled });
});

chrome.runtime.onStartup.addListener(() => updateBadge());

// Tabs that were open before an install or update keep no working script (or a
// disconnected old one), so add the current scripts to them right away.
async function injectIntoOpenTabs() {
  for (const script of chrome.runtime.getManifest().content_scripts) {
    const tabs = await chrome.tabs.query({ url: script.matches });
    for (const tab of tabs) {
      try {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: script.js });
      } catch (e) {
        // Discarded or special tabs refuse injection; they get the script on reload.
      }
    }
  }
}

chrome.runtime.onInstalled.addListener(async (details) => {
  await updateBadge();
  if (details.reason === 'install' || details.reason === 'update') await injectIntoOpenTabs();
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/welcome/welcome.html') });
  }
});
