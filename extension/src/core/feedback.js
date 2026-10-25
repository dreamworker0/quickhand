// The text the popup's "Send feedback" form copies for an email: the kind of
// feedback, the site, the person's own words, versions and, when chosen, the
// recent actions they can already see in the popup. Nothing is sent from here: the
// person pastes it into their own mail and decides whether to send it.
(function (root) {
  'use strict';
  const QH = (root.QH = root.QH || {});

  const ADDRESS = 'ehsheh@gmail.com';

  // Versions only: the Chrome major version and the operating system's family.
  function environment(userAgent, version, language) {
    const ua = userAgent || '';
    const chrome = (ua.match(/Chrome\/(\d+)/) || [])[1] || '?';
    const os = /CrOS/.test(ua) ? 'ChromeOS' : /Macintosh|Mac OS X/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : '?';
    return { version, chrome, os, language: language || '?' };
  }

  // One action's keys as text, like the popup shows them: alternatives split by
  // " / ", keys by "+", and "→" (not last) as the "then" of a two-step key.
  function keysText(display, then) {
    return (display || []).map((combo) => {
      let out = '';
      combo.forEach((k, j) => {
        if (k === '→' && j < combo.length - 1) out += ' ' + then + ' ';
        else out += (j && combo[j - 1] !== '→' ? '+' : '') + k;
      });
      return out;
    }).join(' / ');
  }

  // parts: { kind, site, message, env, log } where log is null (left out) or a list
  // of { time, site, label, keys, input, why }, all already in the UI's words.
  // t(key, subs) returns those words for this extension's own lines.
  function compose(parts, t) {
    const env = parts.env;
    const lines = [
      t('fbTitle'),
      '',
      t('fbLineKind', [parts.kind]),
      t('fbLineSite', [parts.site]),
      '',
      t('fbLineMessage'),
      (parts.message || '').trim() || t('fbNoMessage'),
      '',
      t('fbLineEnv', [env.version, env.chrome, env.os, env.language]),
    ];
    if (parts.log) {
      lines.push('', t('fbLineLog'));
      if (!parts.log.length) lines.push(t('fbNoLog'));
      for (const e of parts.log) lines.push([e.time, e.site, e.label, e.keys, e.input, e.why].filter(Boolean).join(' · '));
    }
    return lines.join('\n');
  }

  // Gmail's compose window in a new tab, with the text already in its body. A mailto:
  // link shows only its own address in a tab when Chrome has no mail handler set, so
  // the web page is opened instead. The text rides in the address, so it also lands
  // in the browser's history; it holds only what the person saw in the preview.
  function composeUrl(subject, body) {
    const q = (v) => encodeURIComponent(v);
    return 'https://mail.google.com/mail/?view=cm&fs=1&to=' + q(ADDRESS) + '&su=' + q(subject) + (body ? '&body=' + q(body) : '');
  }

  // Longer addresses risk being refused by Gmail; then the body goes without the
  // recent actions, which stay on the clipboard to paste.
  const MAX_URL = 8000;

  QH.feedback = { ADDRESS, MAX_URL, environment, keysText, compose, composeUrl };
  if (typeof module !== 'undefined' && module.exports) module.exports = QH.feedback;
})(typeof globalThis !== 'undefined' ? globalThis : this);
