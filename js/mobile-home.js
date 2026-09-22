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
        const band = event.target.closest('[data-mobile-home-action]');
        if (!band) return;

        const action = band.dataset.mobileHomeAction;
        if (action === 'next-live') {
          const sourceButton = $('#homeNextShow [data-home-live-detail]');
          if (sourceButton) sourceButton.click();
          else openRoute('tour');
          return;
        }
        if (action === 'tour') return openRoute('tour');
        if (action === 'rankings') return openRoute('rankings');
        if (action === 'contacts') openRoute('contacts');
      });
    }

    return shell;
  }

  function nextLiveMarkup() {
    const source = $('#homeNextShow');
    const title = cleanText(source?.querySelector('h3')) || 'Nuove date in arrivo';
    const meta = cleanText(source?.querySelector('.section-kicker')) || 'PROSSIMO LIVE';
    const place = cleanText(source?.querySelector('p')) || 'Apri la sezione live';
    const poster = posterFromNextBox(source);

    return `
      <button class="mobile-home-band mobile-home-next" type="button" data-mobile-home-action="next-live">
        ${poster
          ? `<img class="mobile-home-next-poster" src="${esc(poster)}" alt="Locandina ${esc(title)}">`
          : `<img class="mobile-home-next-poster" src="IMG_6259.PNG" alt="">`}
        <span class="mobile-home-next-copy">
          <span class="mobile-band-kicker">${esc(meta)}</span>
          <h2>${esc(title)}</h2>
          <p>${esc(place)}</p>
          <small>PROSSIMO LIVE</small>
        </span>
        <span class="mobile-band-arrow" aria-hidden="true">›</span>
      </button>`;
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

  function contactsMarkup() {
    return `
      <button class="mobile-home-band mobile-home-contacts" type="button" data-mobile-home-action="contacts">
        <span>
          <span class="mobile-band-kicker">BOOKING / SOCIAL</span>
          <strong>Contatti</strong>
          <small>Serate, disponibilità e canali della band</small>
        </span>
        <span class="mobile-band-arrow" aria-hidden="true">›</span>
      </button>`;
  }

  function render() {
    const shell = ensureShell();
    if (!shell) return;
    shell.innerHTML = nextLiveMarkup() + upcomingDatesMarkup() + popularSongsMarkup() + contactsMarkup();
  }

  function scheduleRender() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(render, 40);
  }

  function installObservers() {
    if (observer) observer.disconnect();
    observer = new MutationObserver(scheduleRender);
    [$('#homeNextShow'), $('#homeRankingPreview'), $('#upcomingConcerts')]
      .filter(Boolean)
      .forEach(node => observer.observe(node, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style']
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
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
