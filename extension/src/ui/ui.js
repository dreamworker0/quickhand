// Small building blocks shared by the extension's own pages (popup, collection).
// Both pages live two folders below the extension root, so asset paths match.
'use strict';

const UI = (() => {
  const t = (key, subs) => chrome.i18n.getMessage(key, subs) || key;

  const SITE_NAMES = {
    youtube: 'siteYoutube', gmail: 'siteGmail', calendar: 'siteCalendar', drive: 'siteDrive',
    docs: 'siteDocs', sheets: 'siteSheets', slides: 'siteSlides',
  };

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // display: alternatives, each a list of keys; "→" marks the second step of a
  // sequence ("G then I").
  function keysNode(display) {
    const wrap = el('span', 'keys');
    (display || []).forEach((combo, i) => {
      if (i) wrap.append(el('span', 'sep', t('cardOr')));
      combo.forEach((k, j) => {
        if (k === '→' && j < combo.length - 1) { // a trailing "→" is the arrow key itself
          wrap.append(el('span', 'sep', t('cardThen')));
          return;
        }
        if (j && combo[j - 1] !== '→') wrap.append(el('span', 'sep', '+'));
        wrap.append(el('kbd', null, k));
      });
    });
    return wrap;
  }

  // Small service icon; its name shows on hover and to screen readers.
  function siteIcon(site) {
    if (!SITE_NAMES[site]) return el('span', 'site-icon');
    const img = el('img', 'site-icon');
    img.src = '../../assets/sites/' + site + '.svg';
    img.alt = t(SITE_NAMES[site]);
    img.title = img.alt;
    return img;
  }

  function siteName(site) {
    return SITE_NAMES[site] ? t(SITE_NAMES[site]) : site;
  }

  // Counts per service, in the services' usual order.
  function countBySite(actions) {
    const counts = {};
    for (const a of actions) counts[a.site] = (counts[a.site] || 0) + 1;
    return Object.keys(SITE_NAMES).filter((s) => counts[s]).map((s) => [s, counts[s]]);
  }

  function applyI18n() {
    for (const node of document.querySelectorAll('[data-i18n]')) node.textContent = t(node.dataset.i18n);
  }

  return { t, SITE_NAMES, el, keysNode, siteIcon, siteName, countBySite, applyI18n };
})();
