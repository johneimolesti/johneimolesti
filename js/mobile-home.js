(() => {
  'use strict';

  const mobileMedia = window.matchMedia('(max-width: 760px)');
  let renderTimer = null;
  let observer = null;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
  }

  function cleanText(node) {
    return String(node?.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function openRoute(route) {
    const button = document.querySelector(`.main-nav [data-route="${route}"]`);
    if (button) {
      button.click();
      return;
    }
    window.location.hash = `#/${route}`;
  }

  function posterFromNextBox(box) {
    if (!box) return '';
    const raw = box.style.getPropertyValue('--dash-bg') ||
      getComputedStyle(box).getPropertyValue('--dash-bg') || '';
    const match = String(raw).match(/url\((['"]?)(.*?)\1\)/i);
    return match?.[2] || '';
  }

  function instagramIcon() {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"></rect><circle cx="12" cy="12" r="4"></circle><circle class="fill" cx="17.4" cy="6.7" r="1"></circle></svg>`;
  }

  function youtubeIcon() {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 8.2c-.2-1.6-.9-2.4-2.4-2.6C16.8 5.3 14.4 5.2 12 5.2s-4.8.1-6.6.4C3.9 5.8 3.2 6.6 3 8.2a24.3 24.3 0 0 0 0 7.6c.2 1.6.9 2.4 2.4 2.6 1.8.3 4.2.4 6.6.4s4.8-.1 6.6-.4c1.5-.2 2.2-1 2.4-2.6a24.3 24.3 0 0 0 0-7.6z"></path><path class="fill" d="m10 9 5 3-5 3z"></path></svg>`;
  }

  function socialHref(type) {
    const tiles = $$('#contactsSocialActions a.contact-tile');
    const match = tiles.find(tile => {
      const href = String(tile.getAttribute('href') || '').toLowerCase();
      const text = cleanText(tile).toLowerCase();
      if (type === 'instagram') return href.includes('instagram.com') || text.includes('instagram');
      if (type === 'youtube') return href.includes('youtube.com') || href.includes('youtu.be') || text.includes('youtube');
      return false;
    });
    return match?.getAttribute('href') || '';
  }

  function ensureShell() {
    const home = $('#homePage');
    if (!home) return null;

    let shell = $('#mobileHomeBands');
    if (!shell) {
      shell = document.createElement('section');
      shell.id = 'mobileHomeBands';
      shell.className = 'mobile-home-bands';
      shell.setAttribute('aria-label', 'Home in breve');
    }

    const hero = home.querySelector('.home-hero-news, .hero');
    if (hero && hero.nextElementSibling !== shell) {
      hero.insertAdjacentElement('afterend', shell);
    } else if (!hero && shell.parentElement !== home) {
      home.prepend(shell);
    }

    if (!shell.dataset.bound) {
      shell.dataset.bound = '1';
      shell.addEventListener('click', event => {
        const social = event.target.closest('[data-mobile-social]');
        if (social) {
          if (social.dataset.fallbackContact === '1') {
            event.preventDefault();
            openRoute('contacts');
          }
          return;
        }

        const actionNode = event.target.closest('[data-mobile-home-action]');
        if (!actionNode) return;

        const action = actionNode.dataset.mobileHomeAction;
        if (action === 'next-live') {
          const sourceButton = $('#homeNextShow [data-home-live-detail]');
          if (sourceButton) sourceButton.click();
          else openRoute('tour');
          return;
        }
        if (action === 'news') {
          const source = $('#homeNewsPreview [data-home-news-preview]') ||
            $('#highlightTrack [data-highlight-action]');
          if (source) source.click();
          else openRoute('home');
          return;
        }
        if (action === 'tour') return openRoute('tour');
        if (action === 'rankings') return openRoute('rankings');
        if (action === 'contacts') return openRoute('contacts');
      });
    }

    return shell;
  }

  function currentNews() {
    const preview = $('#homeNewsPreview [data-home-news-preview]');
    if (preview) {
      return {
        kicker: cleanText(preview.querySelector('span')) || 'NOVITÀ',
        title: cleanText(preview.querySelector('strong')) || 'Ultime novità',
        meta: cleanText(preview.querySelector('small'))
      };
    }

    const slide = $('#highlightTrack .highlight-slide');
    if (slide) {
      return {
        kicker: cleanText(slide.querySelector('.section-kicker')) || 'NOVITÀ',
        title: cleanText(slide.querySelector('h3')) || 'Ultime novità',
        meta: ''
      };
    }

    return { kicker: 'NOVITÀ', title: 'Ultimi aggiornamenti della band', meta: '' };
  }

  function leadMarkup() {
    const source = $('#homeNextShow');
    const title = cleanText(source?.querySelector('h3')) || 'Nuove date in arrivo';
    const meta = cleanText(source?.querySelector('.section-kicker')) || 'PROSSIMO LIVE';
    const place = cleanText(source?.querySelector('p')) || 'Apri la sezione live';
    const poster = posterFromNextBox(source);
    const news = currentNews();

    return `
      <section class="mobile-home-lead">
        ${poster
          ? `<img class="mobile-home-lead-bg" src="${esc(poster)}" alt="" aria-hidden="true">`
          : `<img class="mobile-home-lead-bg" src="IMG_6259.PNG" alt="" aria-hidden="true">`}
        <button class="mobile-home-lead-main" type="button" data-mobile-home-action="next-live">
          <span class="mobile-home-lead-top">
            <span class="mobile-home-lead-label">PROSSIMO LIVE</span>
            <span class="mobile-home-lead-date">${esc(meta)}</span>
          </span>
          <h1>${esc(title)}</h1>
          <p>${esc(place)}</p>
          <span class="mobile-home-lead-cta">DETTAGLI →</span>
        </button>
        <button class="mobile-home-lead-news" type="button" data-mobile-home-action="news">
          <span class="mobile-home-lead-news-tag">NOVITÀ</span>
          <span class="mobile-home-lead-news-copy">
            <b>${esc(news.title)}</b>
            <small>${esc([news.kicker, news.meta].filter(Boolean).join(' · '))}</small>
          </span>
          <span class="mobile-band-arrow" aria-hidden="true">›</span>
        </button>
      </section>`;
  }

  function upcomingDatesMarkup() {
    const cards = $$('#upcomingConcerts .concert-card');
    const upcoming = cards.slice(1, 3);

    const rows = upcoming.length
      ? upcoming.map(card => {
          const day = cleanText(card.querySelector('.concert-date-block strong'));
          const monthYear = cleanText(card.querySelector('.concert-date-block span'));
          const name = cleanText(card.querySelector('h4')) || 'Live';
          return `
            <span class="mobile-date-item">
              <b>${esc([day, monthYear].filter(Boolean).join(' '))}</b>
              <span>${esc(name)}</span>
            </span>`;
        }).join('')
      : '<span class="mobile-date-empty">Nessun’altra data pubblicata al momento.</span>';

    return `
      <button class="mobile-home-band mobile-home-dates" type="button" data-mobile-home-action="tour">
        <span class="mobile-band-head">
          <span><span class="mobile-band-kicker">CALENDARIO</span><strong>Prossime date</strong></span>
          <span class="mobile-band-arrow" aria-hidden="true">›</span>
        </span>
        <span class="mobile-dates-list">${rows}</span>
      </button>`;
  }

  function popularSongsMarkup() {
    const rows = $$('#homeRankingPreview .mini-rank-row').slice(0, 3);
    const items = rows.length
      ? rows.map((row, index) => {
          const pos = cleanText(row.querySelector('span')) || `#${index + 1}`;
          const title = cleanText(row.querySelector('b')) || 'Brano';
          const score = cleanText(row.querySelector('strong')) || '—';
          return `
            <span class="mobile-song-row">
              <em>${esc(pos)}</em><b>${esc(title)}</b><strong>${esc(score)}</strong>
            </span>`;
        }).join('')
      : '<span class="mobile-date-empty">Classifica in caricamento.</span>';

    return `
      <button class="mobile-home-band mobile-home-songs" type="button" data-mobile-home-action="rankings">
        <span class="mobile-band-head">
          <span><span class="mobile-band-kicker">TOP SONGS</span><strong>Canzoni più popolari</strong></span>
          <span class="mobile-band-arrow" aria-hidden="true">›</span>
        </span>
        <span class="mobile-song-list">${items}</span>
      </button>`;
  }

  function socialIconMarkup(type, label, iconMarkup) {
    const href = socialHref(type);
    const external = !!href;
    return `<a class="mobile-social-icon" data-mobile-social="${esc(type)}" ${external ? '' : 'data-fallback-contact="1"'} href="${esc(href || '#/contacts')}" ${external ? 'target="_blank" rel="noopener noreferrer"' : ''} aria-label="${esc(label)}">${iconMarkup}</a>`;
  }

  function contactsMarkup() {
    return `
      <section class="mobile-home-band mobile-home-contacts" data-mobile-home-action="contacts">
        <button class="mobile-home-contacts-copy" type="button" data-mobile-home-action="contacts" style="border:0;background:none;color:inherit;padding:0;text-align:left">
          <span class="mobile-band-kicker">BOOKING / SOCIAL</span>
          <strong>Contatti</strong>
          <small>Serate e canali della band</small>
        </button>
        <span class="mobile-social-icons">
          ${socialIconMarkup('instagram','Instagram',instagramIcon())}
          ${socialIconMarkup('youtube','YouTube',youtubeIcon())}
        </span>
      </section>`;
  }

  function render() {
    const shell = ensureShell();
    if (!shell) return;
    shell.innerHTML = leadMarkup() + upcomingDatesMarkup() + popularSongsMarkup() + contactsMarkup();
  }

  function scheduleRender() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(render, 40);
  }

  function installObservers() {
    if (observer) observer.disconnect();
    observer = new MutationObserver(scheduleRender);
    [
      $('#homeNextShow'),
      $('#homeRankingPreview'),
      $('#homeNewsPreview'),
      $('#highlightTrack'),
      $('#upcomingConcerts'),
      $('#contactsSocialActions')
    ].filter(Boolean).forEach(node => observer.observe(node, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style','href']
    }));
  }

  function init() {
    ensureShell();
    render();
    installObservers();

    window.addEventListener('hashchange', scheduleRender);
    window.addEventListener('resize', scheduleRender);
    if (typeof mobileMedia.addEventListener === 'function') mobileMedia.addEventListener('change', scheduleRender);

    setTimeout(scheduleRender, 250);
    setTimeout(scheduleRender, 900);
    setTimeout(() => {
      installObservers();
      scheduleRender();
    }, 1800);
    setTimeout(() => {
      installObservers();
      scheduleRender();
    }, 3200);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
