'use strict';

// The whole collection of learned shortcuts, grouped by service.
const { t, el, keysNode, siteIcon, siteName, countBySite } = UI;

function render(learned) {
  document.getElementById('total').textContent = t('colTotal', [String(learned.length)]);
  document.getElementById('empty').hidden = learned.length > 0;

  const nav = document.getElementById('site-counts');
  nav.setAttribute('aria-label', t('colBySite'));
  nav.replaceChildren();
  const sections = document.getElementById('sections');
  sections.replaceChildren();

  for (const [site, count] of countBySite(learned)) {
    const link = el('a');
    link.href = '#site-' + site;
    link.append(siteIcon(site), el('span', null, siteName(site) + ' ' + count));
    nav.append(link);

    const section = el('section');
    section.id = 'site-' + site;
    const heading = el('h2');
    heading.append(siteIcon(site), el('span', null, siteName(site)), el('span', 'count', String(count)));
    const list = el('ul', 'list');
    for (const a of learned.filter((x) => x.site === site)) {
      const li = el('li');
      li.append(el('span', 'label', a.label), keysNode(a.display), el('span', 'uses', t('colUses', [String(a.key)])));
      list.append(li);
    }
    section.append(heading, list);
    sections.append(section);
  }
}

UI.applyI18n();
document.documentElement.lang = chrome.i18n.getUILanguage();
chrome.runtime.sendMessage({ type: 'qh-summary' }).then((res) => render(res.summary.learned));
