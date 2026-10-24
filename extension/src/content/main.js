// Content script entry: picks the site module for this page and forwards mouse
// and keyboard actions to the background worker. Only action names and keys are
// sent, never typed text or page content.
(function () {
  'use strict';
  const QH = globalThis.QH;
  if (!QH || !QH.sites || window !== window.top || QH.started) return;
  QH.started = true; // the background may inject us again into an open tab

  const site = QH.sites.find((s) => s.matches(location));
  if (!site) return;

  const mac = QH.keys.isMac();
  const mouseEvent = site.mouseEvent || 'click';
  let stopped = false;

  // After the extension is reloaded or updated, scripts left in already-open tabs
  // lose their connection (chrome.runtime.id disappears). The background injects a
  // fresh copy, so the stale one just removes its listeners and goes quiet.
  function alive() {
    try {
      return !!chrome.runtime.id;
    } catch (e) {
      return false;
    }
  }

  function stop() {
    window.removeEventListener(mouseEvent, onMouse, true);
    window.removeEventListener('keydown', onKey, true);
    stopped = true;
  }

  function send(msg) {
    try {
      chrome.runtime.sendMessage(msg).catch(() => {});
    } catch (e) {
      stop();
    }
  }

  function toAction(found) {
    return {
      id: found.id,
      site: site.id,
      label: found.label,
      fallbackLabel: !!found.fallbackLabel,
      display: found.combos.map((c) => QH.keys.display(c, mac)),
    };
  }

  function onMouse(e) {
    if (stopped || e.button !== 0 || !e.isTrusted) return;
    if (!alive()) return stop();
    const found = site.fromMouse(e, mac);
    if (found) send({ type: 'qh-mouse', action: toAction(found), suppress: !!document.fullscreenElement });
  }

  function onKey(e) {
    if (stopped || !e.isTrusted || e.repeat) return;
    if (!alive()) return stop();
    const found = site.fromKey(e, mac);
    if (found) send({ type: 'qh-key', action: toAction(found) });
  }

  window.addEventListener(mouseEvent, onMouse, true);
  window.addEventListener('keydown', onKey, true);
  if (site.extraKeyTargets) site.extraKeyTargets((target) => target.addEventListener('keydown', onKey, true));

  // Lets the popup check that this tab is being watched, and whether the buttons
  // the site module expects are on the page.
  chrome.runtime.onMessage.addListener((msg, sender, respond) => {
    if (msg && msg.type === 'qh-ping') respond({ site: site.id, missing: site.missing ? site.missing() : [] });
  });
})();
