'use strict';

const t = (key, subs) => chrome.i18n.getMessage(key, subs) || key;

const STRENGTHS = [
  ['gentle', 'strengthGentle', 'strengthGentleDesc'],
  ['normal', 'strengthNormal', 'strengthNormalDesc'],
  ['active', 'strengthActive', 'strengthActiveDesc'],
];

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

document.documentElement.lang = chrome.i18n.getUILanguage();
for (const node of document.querySelectorAll('[data-i18n]')) node.textContent = t(node.dataset.i18n);
// The keys the user really has: another extension may hold the suggested ones.
chrome.commands.getAll().then((commands) => {
  const command = commands.find((c) => c.name === 'toggle-alerts');
  document.getElementById('toggle-hint').textContent = command && command.shortcut ? t('welToggle', [command.shortcut]) : t('welToggleNone');
});

const strengths = document.getElementById('strengths');
for (const [value, nameKey, descKey] of STRENGTHS) {
  const label = el('label', 'choice');
  const input = el('input');
  input.type = 'radio';
  input.name = 'strength';
  input.value = value;
  input.checked = value === 'normal';
  const text = el('span');
  text.append(el('strong', null, t(nameKey)), el('small', null, t(descKey)));
  label.append(input, text);
  strengths.append(label);
}

const start = document.getElementById('start');
const done = document.getElementById('done');
const error = document.getElementById('error');

start.addEventListener('click', async () => {
  const strength = document.querySelector('input[name="strength"]:checked').value;
  start.disabled = true;
  error.hidden = true;
  try {
    const saved = await chrome.runtime.sendMessage({ type: 'qh-settings', patch: { strength, onboarded: true } });
    if (!saved || saved.error) throw new Error(saved ? saved.error : 'no response');
  } catch (err) {
    start.disabled = false;
    error.hidden = false;
    return;
  }
  start.hidden = true;
  done.hidden = false;
  done.scrollIntoView({ behavior: 'smooth', block: 'center' });
  done.focus({ preventScroll: true });
});

document.getElementById('close').addEventListener('click', () => {
  chrome.tabs.getCurrent((tab) => (tab ? chrome.tabs.remove(tab.id) : window.close()));
});
