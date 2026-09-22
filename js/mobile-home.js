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

  function openFansRanking() {
    openRoute('rankings');
    setTimeout(() => {
      $('#fansRankingBlock')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    }, 80);
  }

  function openVoteFlow() {
    /*
     * public.js mantiene currentFan e openFanCatalog privati nel suo IIFE.
     * Passiamo quindi dall'area utente già esistente:
     * - fan loggato -> il modal espone "VOTA I BRANI", che clicchiamo;
     * - guest -> resta aperto il login fan.
     */
    const userEntry = $('#userEntry');

    if (!userEntry) {
      openRoute('rankings');
      return;
    }

    userEntry.click();

    setTimeout(() => {
      const voteButton = $('#openFanCatalog');
      if (voteButton) voteButton.click();
    }, 0);
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
      shell.setAttribute('aria-label', 'Anteprima del sito');
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

        const actionNode = event.target.closest('[data-mobile-home-action]');
        if (!actionNode) return;

        const action = actionNode.dataset.mobileHomeAction;

        if (action === 'tour') return openRoute('tour');
        if (action === 'rankings') return openRoute('rankings');
        if (action === 'fans') return openFansRanking();
        if (action === 'contacts') return openRoute('contacts');
        if (action === 'vote') return openVoteFlow();
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
      <button class="mobile-widget mobile-widget-dates"
              type="button"
              data-mobile-home-action="tour">
        <span class="mobile-widget-kicker">CALENDARIO</span>
        <strong class="mobile-widget-title">Prossime date</strong>
        <span class="mobile-widget-arrow" aria-hidden="true">›</span>
        <span class="mobile-dates-list">${rows}</span>
      </button>`;
  }

  function socialLink(type, label, icon) {
    const href = socialHref(type);

    return `
      <a class="mobile-social-icon"
         href="${esc(href || '#')}"
         ${href ? 'target="_blank" rel="noopener noreferrer"' : ''}
         data-mobile-social="${esc(type)}"
         aria-label="${esc(label)}">
        ${icon}
      </a>`;
  }

  function socialMarkup() {
    return `
      <article class="mobile-widget mobile-widget-social">
        <span class="mobile-widget-kicker">BOOKING / SOCIAL</span>
        <strong class="mobile-widget-title">Contatti</strong>

        <div class="mobile-social-icons">
          ${socialLink('instagram', 'Instagram', instagramIcon())}
          ${socialLink('youtube', 'YouTube', youtubeIcon())}
          <button class="mobile-social-booking"
                  type="button"
                  data-mobile-home-action="contacts">BOOKING →</button>
        </div>
      </article>`;
  }

  function songRows() {
    const rankingRows = $$('#songsRanking .ranking-row').slice(0, 3);

    if (rankingRows.length) {
      return rankingRows.map((row, index) => ({
        rank: `#${index + 1}`,
        title: cleanText(row.querySelector('.ranking-title')) || 'Brano',
        score: cleanText(row.querySelector('.ranking-score')) || '—',
        cover: row.querySelector('.ranking-cover')?.getAttribute('src') || ''
      }));
    }

    return $$('#homeRankingPreview .mini-rank-row').slice(0, 3).map((row, index) => ({
      rank: cleanText(row.querySelector('span')) || `#${index + 1}`,
      title: cleanText(row.querySelector('b')) || 'Brano',
      score: cleanText(row.querySelector('strong')) || '—',
      cover: ''
    }));
  }

  function songsMarkup() {
    const rows = songRows();

    const content = rows.length
      ? rows.map(item => `
          <span class="mobile-song-tile">
            ${item.cover
              ? `<img src="${esc(item.cover)}" alt="" loading="lazy">`
              : ''}
            <span class="mobile-song-tile-copy">
              <em class="mobile-song-tile-rank">${esc(item.rank)}</em>
              <b>${esc(item.title)}</b>
              <strong>${esc(item.score)}</strong>
            </span>
          </span>`).join('')
      : `
        <span class="mobile-date-empty">
          Classifica in caricamento.
        </span>`;

    return `
      <button class="mobile-widget mobile-widget-songs"
              type="button"
              data-mobile-home-action="rankings">
        <span class="mobile-widget-kicker">HITS / TOP 3</span>
        <strong class="mobile-widget-title">Canzoni più popolari</strong>
        <span class="mobile-widget-arrow" aria-hidden="true">›</span>
        <span class="mobile-song-tiles">${content}</span>
      </button>`;
  }

  function fanRows() {
    return $$('#fansRanking .ranking-row').slice(0, 3).map((row, index) => ({
      rank: cleanText(row.querySelector('.ranking-pos')) || String(index + 1),
      name: cleanText(row.querySelector('.ranking-title')) || 'Fan',
      points: cleanText(row.querySelector('.ranking-score')) || '0'
    }));
  }

  function fansMarkup() {
    const rows = fanRows();

    if (!rows.length) {
      return `
        <button class="mobile-widget mobile-widget-fans"
                type="button"
                data-mobile-home-action="fans">
          <span class="mobile-widget-kicker">COMMUNITY</span>
          <strong class="mobile-widget-title">Top fan</strong>
          <span class="mobile-widget-arrow" aria-hidden="true">›</span>
          <span class="mobile-date-empty">Classifica fan in caricamento.</span>
        </button>`;
    }

    const leader = rows[0];
    const runners = rows.slice(1);

    return `
      <button class="mobile-widget mobile-widget-fans"
              type="button"
              data-mobile-home-action="fans">
        <span class="mobile-widget-kicker">COMMUNITY / TOP 3</span>
        <strong class="mobile-widget-title">Top fan</strong>
        <span class="mobile-widget-arrow" aria-hidden="true">›</span>

        <span class="mobile-fan-leader">
          <em>#${esc(leader.rank)}</em>
          <b>${esc(leader.name)}</b>
          <strong>${esc(leader.points)}</strong>
        </span>

        <span class="mobile-fan-runners">
          ${runners.map(item => `
            <span class="mobile-fan-runner">
              <i>#${esc(item.rank)}</i>
              <b>${esc(item.name)}</b>
            </span>`).join('')}
        </span>
      </button>`;
  }

  function voteMarkup() {
    return `
      <button class="mobile-widget mobile-widget-vote"
              type="button"
              data-mobile-home-action="vote">
        <span class="mobile-widget-kicker">FAN AREA</span>
        <strong>ENTRA<br>IN CLASSIFICA</strong>
        <small>Registrati, vota i brani e scala la Top Fan.</small>
        <span class="mobile-vote-arrow" aria-hidden="true">↗</span>
      </button>`;
  }

  function render() {
    ensureNextStrip();

    const shell = ensureShell();
    if (!shell) return;

    shell.innerHTML =
      upcomingDatesMarkup() +
      socialMarkup() +
      songsMarkup() +
      fansMarkup() +
      voteMarkup();
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
      $('#songsRanking'),
      $('#fansRanking'),
      $('#contactsSocialActions'),
      $('#highlightTrack')
    ].filter(Boolean).forEach(node => {
      observer.observe(node, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'href', 'src']
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
