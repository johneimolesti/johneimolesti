(() => {
  'use strict';

  const MOBILE_QUERY = '(max-width: 760px)';
  const AUTOPLAY_MS = 7000;
  const media = window.matchMedia(MOBILE_QUERY);

  let experience = null;
  let track = null;
  let progress = null;
  let count = null;
  let autoTimer = null;
  let restartTimer = null;
  let renderTimer = null;
  let observer = null;
  let headerObserver = null;
  let currentIndex = 0;
  let currentSignature = '';

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

  function isHomeRoute() {
    const hash = String(location.hash || '');
    return !hash || hash === '#' || hash === '#/' || hash.startsWith('#/home');
  }

  function openRoute(route) {
    const button = document.querySelector(`.main-nav [data-route="${route}"]`);

    if (button) {
      button.click();
      return;
    }

    location.hash = `#/${route}`;
  }

  function extractCssUrl(value) {
    const raw = String(value || '').trim();
    const match = raw.match(/url\((['"]?)(.*?)\1\)/i);
    return match ? match[2] : '';
  }

  function readLive() {
    const source = $('#homeNextShow');
    const title = cleanText(source?.querySelector('h3'));
    const meta = cleanText(source?.querySelector('.section-kicker'));
    const place = cleanText(source?.querySelector('p'));

    let image = extractCssUrl(source?.style.getPropertyValue('--dash-bg'));

    if (!image && source) {
      image = extractCssUrl(getComputedStyle(source).getPropertyValue('--dash-bg'));
    }

    if (!title && !meta && !place) {
      return {
        title: 'Nuove date in arrivo',
        meta: '',
        place: 'Apri il tour per vedere tutte le date.',
        image: ''
      };
    }

    return {
      title: title || 'Prossimo live',
      meta,
      place,
      image
    };
  }

  function readSongs() {
    let rows = $$('#songsRanking .ranking-row').slice(0, 3).map((row, index) => ({
      rank: index + 1,
      title: cleanText(row.querySelector('.ranking-title')) || 'Brano',
      score: cleanText(row.querySelector('.ranking-score')) || '',
      cover: row.querySelector('.ranking-cover')?.getAttribute('src') || ''
    }));

    if (!rows.length) {
      rows = $$('#homeRankingPreview .mini-rank-row').slice(0, 3).map((row, index) => ({
        rank: index + 1,
        title: cleanText(row.querySelector('b')) || 'Brano',
        score: cleanText(row.querySelector('strong')) || '',
        cover: ''
      }));
    }

    return rows;
  }

  function readFans() {
    return $$('#fansRanking .ranking-row').slice(0, 3).map((row, index) => ({
      rank: cleanText(row.querySelector('.ranking-pos')).replace(/^#/, '') || String(index + 1),
      name: cleanText(row.querySelector('.ranking-title')) || 'Fan',
      score: cleanText(row.querySelector('.ranking-score')) || ''
    }));
  }

  function readMedia() {
    const candidates = [
      ...$$('#mediaGallery .gallery-item img'),
      ...$$('#mediaGallery img'),
      ...$$('#homeMediaWall img'),
      ...$$('.media-gallery img')
    ];

    const imageNode = candidates.find(node => {
      const src = node.currentSrc || node.getAttribute('src') || '';
      return /^https?:\/\//i.test(src) || src.startsWith('/');
    }) || candidates[0];

    const image = imageNode
      ? (imageNode.currentSrc || imageNode.getAttribute('src') || '')
      : '';

    return { image };
  }

  function readContacts() {
    const links = $$('#contactsSocialActions .contact-tile');

    return links.map(link => {
      const icon = link.querySelector('.contact-tile-icon');
      const href = link.getAttribute('href') || '';
      const label = cleanText(link.querySelector('.contact-tile-copy strong')) || 'Contatto';

      if (!icon || !href) return null;

      return {
        href,
        label,
        iconHtml: icon.outerHTML,
        external: link.getAttribute('target') === '_blank'
      };
    }).filter(Boolean);
  }

  function slideBackground(image, alt = '') {
    if (image) {
      return `<img class="jm-mobile-home-bg" src="${esc(image)}" alt="${esc(alt)}">`;
    }

    return `
      <div class="jm-mobile-home-bg-fallback" aria-hidden="true">
        <img src="IMG_6259.PNG" alt="">
      </div>
    `;
  }

  function signatureMarkup() {
    return `
      <div class="jm-mobile-home-signature">
        <strong>JOHN &amp; I MOLESTI</strong>
        <span>I classici italiani incontrano il Punk.</span>
      </div>
    `;
  }

  function liveSlide(live) {
    return `
      <article class="jm-mobile-home-slide" data-slide="live">
        ${slideBackground(live.image, live.title)}
        ${signatureMarkup()}

        <div class="jm-mobile-home-copy">
          <span class="jm-mobile-home-kicker">NEXT LIVE</span>
          <h2>${esc(live.title)}</h2>

          <div class="jm-mobile-home-meta">
            ${live.meta ? `<b>${esc(live.meta)}</b>` : ''}
            ${live.place ? `<span>${esc(live.place)}</span>` : ''}
          </div>

          <div class="jm-mobile-home-actions">
            <button class="jm-mobile-home-action primary" type="button" data-jm-action="live-detail">
              DETTAGLI DEL LIVE →
            </button>

            <button class="jm-mobile-home-action text" type="button" data-jm-action="tour">
              TOUR · TUTTE LE DATE →
            </button>
          </div>
        </div>
      </article>
    `;
  }

  function songsSlide(songs, fallbackImage) {
    const background = songs.find(song => song.cover)?.cover || fallbackImage || '';

    const rows = songs.length
      ? songs.map(song => `
          <div class="jm-mobile-song-row">
            <em>#${esc(song.rank)}</em>
            <b>${esc(song.title)}</b>
            <strong>${esc(song.score || '')}</strong>
          </div>
        `).join('')
      : `
          <div class="jm-mobile-song-row">
            <em>···</em>
            <b>Classifica in caricamento</b>
            <strong></strong>
          </div>
        `;

    return `
      <article class="jm-mobile-home-slide" data-slide="songs">
        ${slideBackground(background, 'Cover della canzone più popolare')}
        ${signatureMarkup()}

        <div class="jm-mobile-home-copy">
          <span class="jm-mobile-home-kicker">POPULAR SONGS</span>
          <h2>LE PIÙ POPOLARI</h2>

          <div class="jm-mobile-song-list">
            ${rows}
          </div>

          <div class="jm-mobile-home-actions">
            <button class="jm-mobile-home-action primary" type="button" data-jm-action="songs">
              SCOPRI LE SONGS →
            </button>

            <button class="jm-mobile-home-action text" type="button" data-jm-action="song-ranking">
              CLASSIFICA COMPLETA →
            </button>
          </div>
        </div>
      </article>
    `;
  }

  function fansSlide(fans) {
    const rows = fans.length
      ? fans.map((fan, index) => `
          <div class="jm-mobile-fan-row">
            <em>#${esc(fan.rank || index + 1)}</em>
            <b>${esc(fan.name)}</b>
            <strong>${esc(fan.score || '')}</strong>
          </div>
        `).join('')
      : `
          <div class="jm-mobile-fan-row">
            <em>···</em>
            <b>Classifica fan in caricamento</b>
            <strong></strong>
          </div>
        `;

    return `
      <article class="jm-mobile-home-slide" data-slide="fans">
        ${slideBackground('', '')}
        ${signatureMarkup()}

        <div class="jm-mobile-home-copy">
          <span class="jm-mobile-home-kicker">COMMUNITY</span>
          <h2>TOP FAN</h2>

          <div class="jm-mobile-fan-list">
            ${rows}
          </div>

          <p>Vieni ai live, registrati e vota i brani per entrare in classifica.</p>

          <div class="jm-mobile-home-actions">
            <button class="jm-mobile-home-action primary" type="button" data-jm-action="fan-area">
              ENTRA / AREA FAN →
            </button>

            <button class="jm-mobile-home-action text" type="button" data-jm-action="vote">
              VOTA I BRANI →
            </button>
          </div>
        </div>
      </article>
    `;
  }

  function mediaSlide(mediaData, fallbackImage) {
    return `
      <article class="jm-mobile-home-slide" data-slide="media">
        ${slideBackground(mediaData.image || fallbackImage || '', 'Dal palco')}
        ${signatureMarkup()}

        <div class="jm-mobile-home-copy">
          <span class="jm-mobile-home-kicker">MEDIA</span>
          <h2>DAL PALCO</h2>
          <p>Foto, locandine e reperti di dubbio valore.</p>

          <div class="jm-mobile-home-actions">
            <button class="jm-mobile-home-action primary" type="button" data-jm-action="media">
              GUARDA I MEDIA →
            </button>
          </div>
        </div>
      </article>
    `;
  }

  function socialMarkup(contacts) {
    return contacts.map(item => `
      <a
        class="jm-mobile-social-link"
        href="${esc(item.href)}"
        aria-label="${esc(item.label)}"
        title="${esc(item.label)}"
        ${item.external ? 'target="_blank" rel="noopener noreferrer"' : ''}>
        ${item.iconHtml}
      </a>
    `).join('');
  }

  function getSlideData() {
    const live = readLive();
    const songs = readSongs();
    const fans = readFans();
    const mediaData = readMedia();
    const contacts = readContacts();

    return { live, songs, fans, mediaData, contacts };
  }

  function dataSignature(data) {
    return JSON.stringify({
      live: data.live,
      songs: data.songs,
      fans: data.fans,
      media: data.mediaData,
      contacts: data.contacts.map(x => ({
        href: x.href,
        label: x.label,
        iconHtml: x.iconHtml
      }))
    });
  }

  function ensureExperience() {
    const home = $('#homePage');
    if (!home) return null;

    experience = $('#jmMobileHomeExperience');

    if (!experience) {
      experience = document.createElement('section');
      experience.id = 'jmMobileHomeExperience';
      experience.className = 'jm-mobile-home-experience';
      experience.setAttribute('aria-label', 'Home John & i Molesti');
      home.prepend(experience);

      experience.addEventListener('click', handleAction);
    }

    return experience;
  }

  function renderExperience(force = false) {
    if (!media.matches || !isHomeRoute()) return;

    const root = ensureExperience();
    if (!root) return;

    const data = getSlideData();
    const signature = dataSignature(data);

    if (!force && signature === currentSignature && track) {
      renderSocialOnly(data.contacts);
      return;
    }

    const previousType = track
      ? track.querySelectorAll('.jm-mobile-home-slide')[currentIndex]?.dataset.slide
      : 'live';

    currentSignature = signature;

    root.innerHTML = `
      <div class="jm-mobile-home-hero">
        <div
          class="jm-mobile-home-track"
          id="jmMobileHomeTrack"
          tabindex="0"
          aria-label="Scorri i contenuti della Home">
          ${liveSlide(data.live)}
          ${songsSlide(data.songs, data.live.image)}
          ${fansSlide(data.fans)}
          ${mediaSlide(data.mediaData, data.live.image)}
        </div>

        <div class="jm-mobile-home-pager" aria-hidden="true">
          <span class="jm-mobile-home-count" id="jmMobileHomeCount">01 / 04</span>
          <span class="jm-mobile-home-progress" id="jmMobileHomeProgress"><span></span></span>
        </div>
      </div>

      <div
        class="jm-mobile-home-social"
        id="jmMobileHomeSocial"
        aria-label="Contatti e social">
        ${socialMarkup(data.contacts)}
      </div>
    `;

    track = $('#jmMobileHomeTrack', root);
    progress = $('#jmMobileHomeProgress', root);
    count = $('#jmMobileHomeCount', root);

    const slides = $$('.jm-mobile-home-slide', track);
    const restored = Math.max(
      0,
      slides.findIndex(slide => slide.dataset.slide === previousType)
    );

    currentIndex = restored;

    bindTrack();

    requestAnimationFrame(() => {
      track.scrollLeft = currentIndex * track.clientWidth;
      updatePager(false);
      startAuto();
    });
  }

  function renderSocialOnly(contacts = readContacts()) {
    const social = $('#jmMobileHomeSocial');
    if (!social) return;

    const next = socialMarkup(contacts);

    if (social.innerHTML !== next) {
      social.innerHTML = next;
    }
  }

  function slideCount() {
    return track ? $$('.jm-mobile-home-slide', track).length : 0;
  }

  function detectIndex() {
    if (!track) return 0;
    const width = Math.max(1, track.clientWidth);
    return Math.max(0, Math.min(slideCount() - 1, Math.round(track.scrollLeft / width)));
  }

  function updatePager(restart = true) {
    currentIndex = detectIndex();
    const total = Math.max(1, slideCount());

    if (count) {
      count.textContent =
        String(currentIndex + 1).padStart(2, '0') +
        ' / ' +
        String(total).padStart(2, '0');
    }

    if (restart) restartAutoSoon();
    restartProgress();
  }

  function restartProgress() {
    if (!progress) return;

    progress.classList.remove('running');
    void progress.offsetWidth;

    if (
      !matchMedia('(prefers-reduced-motion: reduce)').matches &&
      media.matches &&
      isHomeRoute()
    ) {
      progress.classList.add('running');
    }
  }

  function stopAuto() {
    if (autoTimer) {
      clearInterval(autoTimer);
      autoTimer = null;
    }

    if (restartTimer) {
      clearTimeout(restartTimer);
      restartTimer = null;
    }

    progress?.classList.remove('running');
  }

  function startAuto() {
    stopAuto();

    if (
      !track ||
      slideCount() <= 1 ||
      !media.matches ||
      !isHomeRoute() ||
      matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      restartProgress();
      return;
    }

    restartProgress();

    autoTimer = setInterval(() => {
      if (document.hidden || !media.matches || !isHomeRoute()) return;

      const total = slideCount();
      const next = (detectIndex() + 1) % total;
      goToSlide(next, true);
    }, AUTOPLAY_MS);
  }

  function restartAutoSoon() {
    if (restartTimer) clearTimeout(restartTimer);

    restartTimer = setTimeout(() => {
      startAuto();
    }, 1200);
  }

  function goToSlide(index, smooth = true) {
    if (!track) return;

    const total = slideCount();
    const next = Math.max(0, Math.min(total - 1, index));

    currentIndex = next;
    track.scrollTo({
      left: next * track.clientWidth,
      behavior:
        smooth && !matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'smooth'
          : 'auto'
    });

    if (count) {
      count.textContent =
        String(next + 1).padStart(2, '0') +
        ' / ' +
        String(total).padStart(2, '0');
    }

    restartProgress();
  }

  function bindTrack() {
    if (!track || track.dataset.jmBound === '1') return;
    track.dataset.jmBound = '1';

    let scrollTimer = null;

    track.addEventListener('scroll', () => {
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => updatePager(true), 80);
    }, { passive: true });

    track.addEventListener('pointerdown', stopAuto, { passive: true });
    track.addEventListener('pointerup', restartAutoSoon, { passive: true });
    track.addEventListener('pointercancel', restartAutoSoon, { passive: true });

    track.addEventListener('keydown', event => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;

      event.preventDefault();
      goToSlide(
        detectIndex() + (event.key === 'ArrowRight' ? 1 : -1),
        true
      );
      restartAutoSoon();
    });
  }

  function openFanArea(voteDirectly = false) {
    const userEntry = $('#userEntry');

    if (!userEntry) {
      openRoute('rankings');
      return;
    }

    userEntry.click();

    if (!voteDirectly) return;

    setTimeout(() => {
      const voteButton = $('#openFanCatalog');
      if (voteButton) voteButton.click();
    }, 50);
  }

  function handleAction(event) {
    const button = event.target.closest('[data-jm-action]');
    if (!button) return;

    const action = button.dataset.jmAction;

    if (action === 'live-detail') {
      const sourceButton = $('#homeNextShow [data-home-live-detail]');
      if (sourceButton) sourceButton.click();
      else openRoute('tour');
      return;
    }

    if (action === 'tour') {
      openRoute('tour');
      return;
    }

    if (action === 'songs') {
      openRoute('repertoire');
      return;
    }

    if (action === 'song-ranking') {
      openRoute('rankings');
      setTimeout(() => {
        $('#songsRankingBlock')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 90);
      return;
    }

    if (action === 'fan-area') {
      openFanArea(false);
      return;
    }

    if (action === 'vote') {
      openFanArea(true);
      return;
    }

    if (action === 'media') {
      openRoute('more');
      setTimeout(() => {
        ($('#galleryBlock') || $('#photosBlock'))?.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      }, 90);
    }
  }

  function measureHeader() {
    if (!media.matches) return;

    const header = $('#siteHeader');
    const height = Math.ceil(header?.getBoundingClientRect().height || 112);

    document.documentElement.style.setProperty(
      '--jm-mobile-header-h',
      `${height}px`
    );
  }

  function scheduleRender(force = false) {
    clearTimeout(renderTimer);

    renderTimer = setTimeout(() => {
      if (!media.matches || !isHomeRoute()) return;
      measureHeader();
      renderExperience(force);
    }, 70);
  }

  function installObserver() {
    observer?.disconnect();

    observer = new MutationObserver(mutations => {
      const onlyOwnMutations = mutations.every(mutation => {
        const node = mutation.target?.nodeType === 1
          ? mutation.target
          : mutation.target?.parentElement;

        return node?.closest?.('#jmMobileHomeExperience');
      });

      if (onlyOwnMutations) return;
      scheduleRender(false);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['href', 'src', 'style', 'class']
    });
  }

  function syncRouteState() {
    const active = media.matches && isHomeRoute();

    document.body.classList.toggle('jm-mobile-home-active', active);

    if (!media.matches) {
      stopAuto();
      $('#jmMobileHomeExperience')?.remove();
      experience = null;
      track = null;
      progress = null;
      count = null;
      currentSignature = '';
      document.documentElement.style.removeProperty('--jm-mobile-header-h');
      return;
    }

    measureHeader();

    if (active) {
      renderExperience(true);
    } else {
      stopAuto();
    }
  }

  function watchHeader() {
    headerObserver?.disconnect();

    const header = $('#siteHeader');
    if (!header || typeof ResizeObserver === 'undefined') return;

    headerObserver = new ResizeObserver(() => {
      measureHeader();

      if (media.matches && isHomeRoute()) {
        requestAnimationFrame(() => {
          if (track) track.scrollLeft = currentIndex * track.clientWidth;
        });
      }
    });

    headerObserver.observe(header);
  }

  function boot() {
    installObserver();
    watchHeader();
    syncRouteState();

    addEventListener('hashchange', syncRouteState);
    addEventListener('resize', () => {
      measureHeader();

      if (media.matches && isHomeRoute()) {
        requestAnimationFrame(() => {
          if (track) track.scrollLeft = currentIndex * track.clientWidth;
        });
      }
    }, { passive: true });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) stopAuto();
      else if (media.matches && isHomeRoute()) startAuto();
    });

    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', syncRouteState);
    } else if (typeof media.addListener === 'function') {
      media.addListener(syncRouteState);
    }

    [180, 500, 900, 1500, 2500].forEach(delay => {
      setTimeout(() => scheduleRender(false), delay);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
