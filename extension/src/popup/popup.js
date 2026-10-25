'use strict';

const { t, el, keysNode, siteIcon, siteName, countBySite } = UI;
const mac = QH.keys.isMac();
const $ = (id) => document.getElementById(id);

const STRENGTHS = [
  ['gentle', 'strengthGentle', 'strengthGentleDesc'],
  ['normal', 'strengthNormal', 'strengthNormalDesc'],
  ['active', 'strengthActive', 'strengthActiveDesc'],
];

const LEARNED_IN_POPUP = 5;

// Learned shortcuts, filtered by the service tab chosen (null = all).
let learnedAll = [];
let learnedSite = null;

// Tabs "전체 7 | ▶ 4 | M 1 | 31 1": each shows how many were learned there.
function renderLearned() {
  const tabs = $('learned-sites');
  tabs.replaceChildren();
  const counts = countBySite(learnedAll);
  if (learnedSite && !counts.some(([s]) => s === learnedSite)) learnedSite = null;
  if (counts.length > 1) {
    const tab = (site, content, label) => {
      const b = el('button', 'site-count');
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(learnedSite === site));
      b.title = label;
      b.append(...content);
      b.addEventListener('click', () => {
        learnedSite = site;
        renderLearned();
      });
      tabs.append(b);
    };
    tab(null, [el('span', null, t('popAll') + ' ' + learnedAll.length)], t('popAll'));
    for (const [site, count] of counts) tab(site, [siteIcon(site), el('span', null, String(count))], siteName(site));
  }
  const shown = learnedSite ? learnedAll.filter((a) => a.site === learnedSite) : learnedAll;
  fillList($('learned'), shown, 'popLearnedEmpty', false, LEARNED_IN_POPUP);
  const more = $('learned-more');
  more.hidden = shown.length <= LEARNED_IN_POPUP;
  more.textContent = t('popLearnedMore', [String(shown.length)]);
}

function send(msg) {
  return chrome.runtime.sendMessage(msg);
}

// One row per action: icon, name (and today's count), keys. Rows show only the
// first of several alternative keys to stay on one line; the card shows them all.
function fillList(list, actions, emptyKey, withTimes, limit) {
  list.replaceChildren();
  if (!actions.length) {
    list.append(el('li', 'empty', t(emptyKey)));
    return;
  }
  for (const a of actions.slice(0, limit)) {
    const li = el('li');
    const name = el('span', 'name');
    const label = el('span', 'label', a.label);
    label.title = a.label;
    name.append(label);
    if (withTimes) name.append(el('span', 'times', t('popTimes', [String(a.todayMouse)])));
    li.append(siteIcon(a.site), name, keysNode(a.display.slice(0, 1)));
    list.append(li);
  }
}

// Why each recent action did or didn't bring up a card.
const WHY = {
  new: 'whyNew', repeat: 'whyRepeat', reminder: 'whyReminder', key: 'whyKey', 'learned-now': 'whyLearnedNow',
  muted: 'whyMuted', suppressed: 'whySuppressed', paused: 'whyPaused',
  learned: 'whyLearned', 'repeat-wait': 'whyRepeatWait', 'below-threshold': 'whyBelowThreshold',
  'daily-cap': 'whyDailyCap', gap: 'whyGap', 'new-waiting': 'whyNewWaiting',
};
const SHOWN = new Set(['new', 'repeat', 'reminder', 'learned-now']);

function clock(time, seconds) {
  return new Date(time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: seconds ? '2-digit' : undefined });
}

function whyText(e) {
  const key = WHY[e.outcome];
  if (!key) return e.outcome;
  // Waits are shown as the clock time they end, so they stay true when read later.
  const until = e.waitMs !== undefined ? clock(e.at + e.waitMs, e.waitMs < 10 * 60 * 1000) : '';
  const subs = {
    'below-threshold': [String(e.need), String(e.count)],
    'daily-cap': [String(e.need)],
    gap: [until],
    'repeat-wait': [until],
  }[e.outcome];
  return t(key, subs);
}

function fillLog(entries) {
  const list = $('log');
  list.replaceChildren();
  if (!entries.length) {
    list.append(el('li', 'empty', t('popLogEmpty')));
    return;
  }
  for (const e of entries) {
    const li = el('li', SHOWN.has(e.outcome) ? 'shown' : e.input === 'key' ? 'by-key' : '');
    const name = el('span', 'name');
    const label = el('span', 'label', e.label);
    label.title = e.label;
    name.append(label, el('span', 'times', clock(e.at)));
    li.append(siteIcon(e.site), name, keysNode(e.display.slice(0, 1)), el('span', 'why', whyText(e)));
    list.append(li);
  }
}

// Shortcuts muted from the card, each with a button to hint them again.
function fillMuted(actions) {
  const list = $('muted');
  list.replaceChildren();
  if (!actions.length) {
    list.append(el('li', 'empty', t('popMutedEmpty')));
    return;
  }
  for (const a of actions) {
    const li = el('li');
    const name = el('span', 'name');
    const label = el('span', 'label', a.label);
    label.title = a.label;
    name.append(label);
    const unmute = el('button', 'btn small', t('popUnmute'));
    unmute.type = 'button';
    unmute.setAttribute('aria-label', t('popUnmuteLabel', [a.label]));
    unmute.addEventListener('click', async () => render(await refreshAfter({ type: 'qh-mute', id: a.id, muted: false })));
    li.append(siteIcon(a.site), name, keysNode(a.display.slice(0, 1)), unmute);
    list.append(li);
  }
}

// The feedback form: its preview is exactly what "copy" puts on the clipboard.
const FEEDBACK_KINDS = ['fbKindBroken', 'fbKindWrong', 'fbKindMissed', 'fbKindSite', 'fbKindOther'];
let feedbackLog = [];

const chosen = (select) => select.selectedOptions[0].textContent;

function feedbackText(withLog = $('fb-log').checked) {
  const env = QH.feedback.environment(navigator.userAgent, chrome.runtime.getManifest().version, chrome.i18n.getUILanguage());
  const log = withLog
    ? feedbackLog.map((e) => ({
      time: clock(e.at, true),
      site: siteName(e.site),
      label: e.label,
      keys: QH.feedback.keysText(e.display, t('cardThen')),
      input: t(e.input === 'key' ? 'fbInputKey' : 'fbInputMouse'),
      why: whyText(e),
    }))
    : null;
  return QH.feedback.compose({ kind: chosen($('fb-kind')), site: chosen($('fb-site')), message: $('fb-message').value, env, log }, t);
}

function updateFeedback() {
  $('fb-preview').value = feedbackText();
}

// Opens Gmail's compose window to the feedback address with the text in its body,
// and copies the text too (for another mail, or when the body had to be cut).
// Nothing is sent by the extension itself.
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    $('fb-preview').select();
    return document.execCommand('copy');
  }
}

async function sendFeedback() {
  const text = feedbackText();
  const paste = mac ? '⌘V' : 'Ctrl+V';
  $('fb-preview').value = text;
  const copied = await copyText(text);
  const subject = t('fbSubject', [chosen($('fb-kind'))]);
  let url = QH.feedback.composeUrl(subject, text);
  let note = 'fbFilled';
  if (url.length > QH.feedback.MAX_URL) {
    url = QH.feedback.composeUrl(subject, feedbackText(false) + '\n\n' + t('fbLogPaste', [paste]));
    note = 'fbFilledShort';
  }
  $('fb-status').textContent = t(note, [paste]) + (copied ? '' : ' ' + t('fbCopyFailed'));
  chrome.tabs.create({ url });
}

function initFeedback(tabSite) {
  const kind = $('fb-kind');
  for (const key of FEEDBACK_KINDS) kind.append(el('option', null, t(key)));
  const site = $('fb-site');
  site.append(el('option', null, t('fbSiteNone')));
  for (const s of Object.keys(UI.SITE_NAMES)) {
    const option = el('option', null, siteName(s));
    option.selected = s === tabSite;
    site.append(option);
  }
  for (const id of ['fb-kind', 'fb-site', 'fb-log']) $(id).addEventListener('change', updateFeedback);
  $('fb-message').addEventListener('input', updateFeedback);
  $('fb-send').addEventListener('click', sendFeedback);
  $('fb-address').textContent = t('fbAddress', [QH.feedback.ADDRESS]);
  updateFeedback();
}

// A background worker still running older code (until the extension is reloaded)
// can leave out a list; draw the rest instead of stopping at the first gap.
const LISTS = ['missed', 'learned', 'tracked', 'muted', 'log'];
function complete(summary) {
  const out = Object.assign({}, summary);
  for (const key of LISTS) if (!Array.isArray(out[key])) out[key] = [];
  return out;
}

function render(res) {
  const summary = complete(res.summary);
  const settings = res.settings;
  const now = Date.now();
  const paused = settings.pauseUntil > now;
  const on = settings.enabled && !paused;

  const status = $('status');
  status.className = 'status' + (on ? ' on' : '');
  status.textContent = !settings.enabled
    ? t('popStatusOff')
    : paused
      ? t('popPausedUntil', [new Date(settings.pauseUntil).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })])
      : t('popStatusOn');
  $('toggle').textContent = on ? t('popTurnOff') : t(paused ? 'popResume' : 'popTurnOn');
  $('toggle').className = 'btn ' + (on ? 'is-on' : 'is-off');
  $('toggle').onclick = async () => render(await refreshAfter({ type: 'qh-settings', patch: { enabled: !on, pauseUntil: 0 } }));

  $('today-mouse').textContent = summary.todayMouse;
  $('today-key').textContent = summary.todayKey;

  fillList($('missed'), summary.missed, 'popMissedEmpty', true, 5);
  $('waiting').hidden = !summary.waiting;
  $('waiting').textContent = t('popWaiting', [String(summary.waiting)]);

  // The newest few here; the whole collection opens in its own page.
  $('learned-count').textContent = summary.learned.length ? String(summary.learned.length) : '';
  learnedAll = summary.learned;
  renderLearned();

  fillLog(summary.log);
  feedbackLog = summary.log;
  if ($('fb-kind').options.length) updateFeedback();

  const strengths = $('strengths');
  strengths.replaceChildren();
  for (const [value, nameKey, descKey] of STRENGTHS) {
    const label = el('label', 'choice');
    const input = el('input');
    input.type = 'radio';
    input.name = 'strength';
    input.value = value;
    input.checked = settings.strength === value;
    input.addEventListener('change', () => send({ type: 'qh-settings', patch: { strength: value } }));
    const text = el('span');
    text.append(el('strong', null, t(nameKey)), el('small', null, t(descKey)));
    label.append(input, text);
    strengths.append(label);
  }

  $('praise').checked = settings.praise !== false;

  for (const box of document.querySelectorAll('[data-site]')) {
    box.checked = !settings.disabledSites.includes(box.dataset.site);
  }

  fillMuted(summary.muted);

  const records = $('records');
  records.replaceChildren();
  if (!summary.tracked.length) {
    const row = el('tr');
    const cell = el('td', null, t('popRecordsEmpty'));
    cell.colSpan = 3;
    row.append(cell);
    records.append(row);
  }
  for (const a of summary.tracked) {
    const row = el('tr');
    const name = el('td');
    name.append(siteIcon(a.site), a.label);
    row.append(name, el('td', null, String(a.mouse)), el('td', null, String(a.key)));
    records.append(row);
  }
}

async function refreshAfter(msg) {
  if (msg) await send(msg);
  return send({ type: 'qh-summary' });
}

const SUPPORTED = [
  [/^https:\/\/www\.youtube\.com\//, 'youtube'],
  [/^https:\/\/mail\.google\.com\//, 'gmail'],
  [/^https:\/\/calendar\.google\.com\//, 'calendar'],
  [/^https:\/\/drive\.google\.com\//, 'drive'],
  [/^https:\/\/docs\.google\.com\/document\//, 'docs'],
  [/^https:\/\/docs\.google\.com\/spreadsheets\//, 'sheets'],
  [/^https:\/\/docs\.google\.com\/presentation\//, 'slides'],
];

const siteOf = (tab) => (SUPPORTED.find(([re]) => re.test((tab && tab.url) || '')) || [])[1] || null;

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve(null), ms))]);
}

// Tells the person whether the tab they are looking at is being watched, and
// offers a reload when it should be but isn't.
async function showTabStatus(settings, tab) {
  const box = $('tab-status');
  const site = siteOf(tab);
  box.replaceChildren();
  box.className = 'tab-status';
  box.hidden = false;
  if (!site) {
    box.textContent = t('tabUnsupported');
    return;
  }
  const name = siteName(site);
  if (settings.disabledSites.includes(site)) {
    box.textContent = t('tabSiteOff', [name]);
    return;
  }
  let reply = null;
  try {
    reply = await withTimeout(chrome.tabs.sendMessage(tab.id, { type: 'qh-ping' }), 800);
  } catch (e) {
    // No script in the tab yet.
  }
  if (reply && !(reply.missing && reply.missing.length)) {
    box.classList.add('ok');
    box.textContent = t('tabWorking', [name]);
    return;
  }
  // Not running, or running without some of the buttons it looks for. A reload
  // fixes the first and a page that was still loading.
  box.classList.add('warn');
  const reload = el('button', 'btn', t('tabReloadButton'));
  reload.type = 'button';
  reload.addEventListener('click', () => {
    chrome.tabs.reload(tab.id);
    window.close();
  });
  box.append(el('span', null, reply ? t('tabMissing', [name, reply.missing.join(', ')]) : t('tabReload')), reload);
}

function endOfToday() {
  const d = new Date();
  d.setHours(24, 0, 0, 0);
  return d.getTime();
}

// The keys the user really has: another extension may hold the suggested ones,
// and then Chrome leaves ours unset until the user picks some.
async function showToggleKeys() {
  const command = (await chrome.commands.getAll()).find((c) => c.name === 'toggle-alerts');
  const hint = $('toggle-hint');
  if (command && command.shortcut) {
    hint.textContent = t('popToggle', [command.shortcut]);
    return;
  }
  const set = UI.el('button', 'btn small', t('popToggleSet'));
  set.type = 'button';
  set.addEventListener('click', () => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }));
  hint.replaceChildren(t('popToggleNone') + ' ', set);
}

function init() {
  UI.applyI18n();
  showToggleKeys();

  for (const button of document.querySelectorAll('[data-pause]')) {
    button.addEventListener('click', async () => {
      const v = button.dataset.pause;
      const until = v === 'today' ? endOfToday() : Date.now() + Number(v) * 60 * 1000;
      render(await refreshAfter({ type: 'qh-settings', patch: { pauseUntil: until } }));
    });
  }

  $('praise').addEventListener('change', () => send({ type: 'qh-settings', patch: { praise: $('praise').checked } }));

  for (const box of document.querySelectorAll('[data-site]')) {
    box.addEventListener('change', async () => {
      const { settings } = await send({ type: 'qh-summary' });
      const off = new Set(settings.disabledSites);
      if (box.checked) off.delete(box.dataset.site);
      else off.add(box.dataset.site);
      await send({ type: 'qh-settings', patch: { disabledSites: [...off] } });
    });
  }

  $('learned-more').addEventListener('click', () => {
    const hash = learnedSite ? '#site-' + learnedSite : '';
    chrome.tabs.create({ url: chrome.runtime.getURL('src/collection/collection.html') + hash });
    window.close();
  });

  $('reset').addEventListener('click', async () => {
    if (!confirm(t('popResetConfirm'))) return;
    render(await refreshAfter({ type: 'qh-reset' }));
  });

  const tabQuery = chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => tab);
  tabQuery.then((tab) => initFeedback(siteOf(tab)));
  Promise.all([refreshAfter(), tabQuery]).then(([res, tab]) => {
    render(res);
    showTabStatus(res.settings, tab);
  });

  // Keeps the numbers current while the popup stays open (kept open with DevTools,
  // or opened in its own tab) and clicks in other tabs keep being recorded.
  let refreshTimer = 0;
  chrome.storage.onChanged.addListener((changes) => {
    if (!changes.qh_state && !changes.qh_settings) return;
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(async () => render(await refreshAfter()), 150);
  });
}

init();
