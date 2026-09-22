(() => {
  'use strict';

  let renderTimer = null;
  let observer = null;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[ch]));
  }

  function cleanText(node) {
    return String(node?.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function openRoute(route) {
    const button = document.querySelector(`.main-nav [data-route="${route}"]`);
    if (button) return button.click();
    location.hash = `#/${route}`;
  }

  function instagramIcon() {
    return `<svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5"></rect>
      <circle cx="12" cy="12" r="4"></circle>
      <circle class="fill" cx="17.4" cy="6.7" r="1"></circle>
    </svg>`;
  }

  function youtubeIcon() {
    return `<svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M21 8.2c-.2-1.6-.9-2.4-2.4-2.6C16.8 5.3 14.4 5.2 12 5.2s-4.8.1-6.6.4C3.9 5.8 3.2 6.6 3 8.2a24.3 24.3 0 0 0 0 7.6c.2 1.6.9 2.4 2.4 2.6 1.8.3 4.2.4 6.6.4s4.8-.1 6.6-.4c1.5-.2 2.2-1 2.4-2.6a24.3 24.3 0 0 0 0-7.6z"></path>
      <path class="fill" d="m10 9 5 3-5 3z"></path>
    </svg>`;
  }

  function socialHref(type) {
    const tiles = $$('#contactsSocialActions a.contact-tile');

    const tile = tiles.find(node => {
      const href = String(node.getAttribute('href') || '').toLowerCase();
      const text = cleanText(node).toLowerCase();

      if (type === 'instagram') {
        return href.includes('instagram.com') || text.includes('instagram');
      }

      return href.includes('youtube.com') ||
        href.includes('youtu.be') ||
        text.includes('youtube');
    });

    return tile?.getAttribute('href') || '';
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
          const href = social.getAttribute('href');

          if (!href || href === '#') {
            event.preventDefault();
            openRoute('contacts');
          }

          return;
        }

        const band = event.target.closest('[data-mobile-home-action]');
        if (!band) return;

        if (band.dataset.mobileHomeAction === 'tour') return openRoute('tour');
        if (band.dataset.mobileHomeAction === 'rankings') return openRoute('rankings');
        if (band.dataset.mobileHomeAction === 'contacts') return openRoute('contacts');
      });
    }

    return shell;
  }

  function ensureNextStrip() {
    const hero = $('#homePage .home-hero-news');
    if (!hero) return;

    let strip = $('#mobileHeroNextStrip');

    if (!strip) {
      strip = document.createElement('button');
      strip.id = 'mobileHeroNextStrip';
      strip.className = 'mobile-hero-next-strip';
      strip.type = 'button';

      strip.onclick = event => {
        event.preventDefault();

        const detail = $('#homeNextShow [data-home-live-detail]');
        if (detail) return detail.click();

        openRoute('tour');
      };

      hero.appendChild(strip);
    }

    const source = $('#homeNextShow');
    const title = cleanText(source?.querySelector('h3')) || 'Nuove date in arrivo';
    const meta = cleanText(source?.querySelector('.section-kicker')) || 'PROSSIMO LIVE';

    strip.innerHTML = `
      <span class="mobile-hero-next-strip-tag">PROSSIMO LIVE</span>
      <span class="mobile-hero-next-strip-copy">${esc(meta)} · ${esc(title)}</span>
      <span class="mobile-hero-next-strip-arrow" aria-hidden="true">›</span>`;
  }

  function upcomingDatesMarkup() {
    const cards = $$('#upcomingConcerts .concert-card').slice(1, 3);

    const rows = cards.length
      ? cards.map(card => {
          const day = cleanText(card.querySelector('.concert-date-block strong'));
          const month = cleanText(card.querySelector('.concert-date-block span'));
          const name = cleanText(card.querySelector('h4')) || 'Live';

          return `
            <span class="mobile-date-item">
              <b>${esc([day, month].filter(Boolean).join(' '))}</b>
              <span>${esc(name)}</span>
            </span>`;
        }).join('')
      : '<span class="mobile-date-empty">Nessun’altra data pubblicata al momento.</span>';

    return `
      <button class="mobile-home-band mobile-home-dates"
              type="button"
              data-mobile-home-action="tour">
        <span class="mobile-band-head">
          <span>
            <span class="mobile-band-kicker">CALENDARIO</span>
            <strong>Prossime date</strong>
          </span>
          <span class="mobile-band-arrow" aria-hidden="true">›</span>
        </span>
        <span class="mobile-dates-list">${rows}</span>
      </button>`;
  }

  function songsMarkup() {
    const rows = $$('#homeRankingPreview .mini-rank-row').slice(0, 3);

    const content = rows.length
      ? rows.map((row, index) => `
          <span class="mobile-song-row">
            <em>${esc(cleanText(row.querySelector('span')) || `#${index + 1}`)}</em>
            <b>${esc(cleanText(row.querySelector('b')) || 'Brano')}</b>
            <strong>${esc(cleanText(row.querySelector('strong')) || '—')}</strong>
          </span>`).join('')
      : '<span class="mobile-date-empty">Classifica in caricamento.</span>';

    return `
      <button class="mobile-home-band mobile-home-songs"
              type="button"
              data-mobile-home-action="rankings">
        <span class="mobile-band-head">
          <span>
            <span class="mobile-band-kicker">TOP SONGS</span>
            <strong>Canzoni più popolari</strong>
          </span>
          <span class="mobile-band-arrow" aria-hidden="true">›</span>
        </span>
        <span class="mobile-song-list">${content}</span>
      </button>`;
  }

  function socialLink(type, label, icon) {
    const href = socialHref(type);

    return `
      <a class="mobile-social-icon"
         href="${esc(href || '#')}"
         ${href ? 'target="_blank" rel="noopener noreferrer"' : ''}
         data-mobile-social="${esc(type)}"
         aria-label="${esc(label)}">${icon}</a>`;
  }

  function contactsMarkup() {
    return `
      <div class="mobile-home-band mobile-home-contacts">
        <button class="mobile-home-contacts-copy"
                type="button"
                data-mobile-home-action="contacts"
                style="border:0;background:transparent;color:inherit;text-align:left;padding:0;font:inherit">
          <span class="mobile-band-kicker">BOOKING / SOCIAL</span>
          <strong>Contatti</strong>
          <small>Serate, disponibilità e canali della band</small>
        </button>

        <span class="mobile-social-icons">
          ${socialLink('instagram', 'Instagram', instagramIcon())}
          ${socialLink('youtube', 'YouTube', youtubeIcon())}
        </span>
      </div>`;
  }

  function render() {
    ensureNextStrip();

    const shell = ensureShell();
    if (!shell) return;

    shell.innerHTML =
      upcomingDatesMarkup() +
      songsMarkup() +
      contactsMarkup();
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
      $('#upcomingConcerts'),
      $('#contactsSocialActions'),
      $('#highlightTrack')
    ].filter(Boolean).forEach(node => {
      observer.observe(node, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'href']
      });
    });
  }

  function init() {
    render();
    installObservers();

    addEventListener('hashchange', scheduleRender);
    addEventListener('resize', scheduleRender);

    setTimeout(scheduleRender, 250);
    setTimeout(scheduleRender, 800);
    setTimeout(() => {
      installObservers();
      scheduleRender();
    }, 1600);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, {once:true});
  } else {
    init();
  }
})();
