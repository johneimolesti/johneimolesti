(() => {
  'use strict';

  const MOBILE_QUERY = '(max-width: 760px)';
  const AUTOPLAY_MS = 7000;
  const PUBLIC_CACHE_KEY = 'jm_public_cache_v3';
  const PUBLIC_CACHE_MAX_STALE_MS = 7 * 24 * 60 * 60 * 1000;
  const SUPABASE_URL = 'https://etzwybamvfpeitkttwrc.supabase.co';

  const media = window.matchMedia(MOBILE_QUERY);

  let experience = null;
  let track = null;
  let progress = null;
  let count = null;
  let renderTimer = null;
  let sourceObserver = null;
  let headerObserver = null;

  let currentIndex = 0;
  let currentSignature = '';

  let autoTimer = null;
  let autoStartedAt = 0;
  let autoRemaining = AUTOPLAY_MS;
  let autoPaused = false;
  let resumeTimer = null;

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

  function storageUrl(bucket, path) {
    const raw = String(path || '').trim();
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw)) return raw;

    return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${
      raw.split('/').map(encodeURIComponent).join('/')
    }`;
  }

  function posterPaths(value) {
    if (Array.isArray(value)) {
      return [...new Set(value.filter(Boolean).map(String))];
    }

    const raw = String(value || '').trim();
    if (!raw) return [];

    if (raw.startsWith('[')) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return [...new Set(parsed.filter(Boolean).map(String))];
        }
      } catch {}
    }

    return [raw];
  }

  function concertStartMs(c) {
    if (!c?.concert_date) return NaN;

    const time = String(c.start_time || '21:30').slice(0, 5);
    const local = Date.parse(`${String(c.concert_date).slice(0, 10)}T${time}:00`);

    return Number.isFinite(local)
      ? local
      : Date.parse(String(c.concert_date).slice(0, 10));
  }

  function formatDate(value) {
    if (!value) return '';
    const [y, m, d] = String(value).slice(0, 10).split('-');
    return [d, m, y].filter(Boolean).join('/');
  }

  function formatTime(value) {
    return value ? String(value).slice(0, 5) : '';
  }

  function prettyPlace(c) {
    return [c?.venue, c?.city].filter(Boolean).join(' · ');
  }

  function readPublicCache() {
    try {
      const raw = localStorage.getItem(PUBLIC_CACHE_KEY);
      if (!raw) return null;

      const cached = JSON.parse(raw);
      const savedAt = Number(cached?.saved_at || 0);

      if (!savedAt || Date.now() - savedAt > PUBLIC_CACHE_MAX_STALE_MS) {
        return null;
      }

      return cached;
    } catch {
      return null;
    }
  }

  function cachedSlideData() {
    const cached = readPublicCache();
    if (!cached) return null;

    const now = Date.now();

    const concerts = (Array.isArray(cached.concerts) ? cached.concerts : [])
      .filter(c => !c?.private_show && c?.status !== 'cancelled');

    const future = concerts
      .filter(c => {
        if (c.status === 'completed') return false;
        const start = concertStartMs(c);
        return !Number.isFinite(start) || start >= now - 6 * 60 * 60 * 1000;
      })
      .sort((a, b) => concertStartMs(a) - concertStartMs(b));

    const next = future[0] || null;

    const live = next
      ? {
          title: next.name || 'Prossimo live',
          meta: [
            formatDate(next.concert_date),
            formatTime(next.start_time)
          ].filter(Boolean).join(' · '),
          place: prettyPlace(next) || 'Dettagli del prossimo concerto.',
          image: storageUrl(
            'concert-posters',
            posterPaths(next.poster_path)[0] || ''
          )
        }
      : {
          title: 'Nuove date in arrivo',
          meta: '',
          place: 'Apri il tour per vedere tutte le date.',
          image: ''
        };

    const songs = (cached.rankingData?.songs || [])
      .slice(0, 3)
      .map((row, index) => ({
        rank: Number(row.ranking_position || index + 1),
        title: row.title || 'Brano',
        score: row.ranking_score ?? row.score ?? '',
        cover: storageUrl('concert-posters', row.cover_path || '')
      }));

    const fans = (cached.rankingData?.fans || [])
      .slice(0, 3)
      .map((row, index) => ({
        rank: row.ranking_position || index + 1,
        name: row.fan_name || 'Fan',
        score: row.points ?? row.score ?? ''
      }));

    const mediaItem = (Array.isArray(cached.publicMedia) ? cached.publicMedia : [])
      .find(item => item?.kind === 'photo' && item?.storage_path);

    const mediaData = {
      image: mediaItem
        ? storageUrl('public-media', mediaItem.storage_path)
        : ''
    };

    return {live, songs, fans, mediaData};
  }

  function warmCachedAssets() {
    if (!media.matches) return;

    const data = cachedSlideData();
    if (!data) return;

    const urls = [
      data.live?.image,
      data.songs?.find(song => song.cover)?.cover,
      data.mediaData?.image
    ].filter(Boolean);

    urls.forEach((src, index) => {
      const img = new Image();
      img.decoding = 'async';

      if ('fetchPriority' in img) {
        img.fetchPriority = index === 0 ? 'high' : 'low';
      }

      img.src = src;
    });
  }

  // Precarica subito gli asset disponibili nella cache.
  warmCachedAssets();

  function readLiveFromDom() {
    const source = $('#homeNextShow');
    const title = cleanText(source?.querySelector('h3'));
    const meta = cleanText(source?.querySelector('.section-kicker'));
    const place = cleanText(source?.querySelector('p'));

    let image = extractCssUrl(source?.style.getPropertyValue('--dash-bg'));

    if (!image && source) {
      image = extractCssUrl(
        getComputedStyle(source).getPropertyValue('--dash-bg')
      );
    }

    return {
      valid: !!title,
      value: title
        ? {
            title,
            meta,
            place: place || 'Dettagli del prossimo concerto.',
            image
          }
        : null
    };
  }

  function readSongsFromDom() {
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

  function readFansFromDom() {
    return $$('#fansRanking .ranking-row').slice(0, 3).map((row, index) => ({
      rank:
        cleanText(row.querySelector('.ranking-pos')).replace(/^#/, '') ||
        String(index + 1),
      name: cleanText(row.querySelector('.ranking-title')) || 'Fan',
      score: cleanText(row.querySelector('.ranking-score')) || ''
    }));
  }

  function readMediaFromDom() {
    const candidates = [
      ...$$('#mediaGallery .gallery-item img'),
      ...$$('#mediaGallery img'),
      ...$$('#homeMediaWall img'),
      ...$$('.media-gallery img')
    ];

    const imageNode =
      candidates.find(node => {
        const src = node.currentSrc || node.getAttribute('src') || '';
        return /^https?:\/\//i.test(src) || src.startsWith('/');
      }) ||
      candidates[0];

    return {
      image: imageNode
        ? imageNode.currentSrc || imageNode.getAttribute('src') || ''
        : ''
    };
  }

  function readContacts() {
    return $$('#contactsSocialActions .contact-tile')
      .map(link => {
        const icon = link.querySelector('.contact-tile-icon');
        const href = link.getAttribute('href') || '';
        const label =
          cleanText(link.querySelector('.contact-tile-copy strong')) ||
          link.getAttribute('aria-label') ||
          link.getAttribute('title') ||
          'Contatto';

        if (!icon || !href) return null;

        return {
          href,
          label,
          iconHtml: icon.outerHTML,
          external: link.getAttribute('target') === '_blank'
        };
      })
      .filter(Boolean);
  }

  function getSlideData() {
    const cached = cachedSlideData();

    const domLive = readLiveFromDom();
    const domSongs = readSongsFromDom();
    const domFans = readFansFromDom();
    const domMedia = readMediaFromDom();

    return {
      live:
        domLive.valid
          ? domLive.value
          : cached?.live || {
              title: 'Nuove date in arrivo',
              meta: '',
              place: 'Apri il tour per vedere tutte le date.',
              image: ''
            },

      songs: domSongs.length ? domSongs : cached?.songs || [],
      fans: domFans.length ? domFans : cached?.fans || [],

      mediaData:
        domMedia.image
          ? domMedia
          : cached?.mediaData || {image: ''},

      contacts: readContacts()
    };
  }

  function dataSignature(data) {
    return JSON.stringify({
      live: data.live,
      songs: data.songs,
      fans: data.fans,
      media: data.mediaData,
      contacts: data.contacts.map(item => ({
        href: item.href,
        label: item.label,
        iconHtml: item.iconHtml
      }))
    });
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
    const background =
      songs.find(song => song.cover)?.cover ||
      fallbackImage ||
      '';

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

    const wasPaused = autoPaused;
    const previousRemaining = autoRemaining;

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

    document.documentElement.classList.remove('jm-mobile-home-pending');
    window.dispatchEvent(new CustomEvent('jm:mobile-home-ready'));

    const slides = $$('.jm-mobile-home-slide', track);
    const restored = Math.max(
      0,
      slides.findIndex(slide => slide.dataset.slide === previousType)
    );

    currentIndex = restored;
    bindTrack();

    requestAnimationFrame(() => {
      if (!track) return;

      track.scrollLeft = currentIndex * track.clientWidth;
      updateCount();

      autoRemaining = Math.max(1, previousRemaining || AUTOPLAY_MS);
      autoPaused = wasPaused;

      if (autoPaused) paintProgress(true);
      else resumeAuto();
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

    return Math.max(
      0,
      Math.min(
        Math.max(0, slideCount() - 1),
        Math.round(track.scrollLeft / width)
      )
    );
  }

  function updateCount() {
    currentIndex = detectIndex();
    const total = Math.max(1, slideCount());

    if (count) {
      count.textContent =
        String(currentIndex + 1).padStart(2, '0') +
        ' / ' +
        String(total).padStart(2, '0');
    }
  }

  function progressBar() {
    return progress?.querySelector('span') || null;
  }

  function paintProgress(paused = autoPaused) {
    if (!progress) return;

    const bar = progressBar();
    if (!bar) return;

    const elapsed = Math.max(
      0,
      Math.min(AUTOPLAY_MS, AUTOPLAY_MS - autoRemaining)
    );

    progress.classList.remove('running');
    void progress.offsetWidth;

    if (
      matchMedia('(prefers-reduced-motion: reduce)').matches ||
      !media.matches ||
      !isHomeRoute()
    ) {
      bar.style.animation = 'none';
      bar.style.width = '100%';
      return;
    }

    bar.style.removeProperty('width');
    bar.style.animationDuration = `${AUTOPLAY_MS}ms`;
    bar.style.animationDelay = `-${elapsed}ms`;
    bar.style.animationPlayState = paused ? 'paused' : 'running';

    progress.classList.add('running');
  }

  function clearAutoTimer() {
    if (autoTimer) {
      clearTimeout(autoTimer);
      autoTimer = null;
    }

    if (resumeTimer) {
      clearTimeout(resumeTimer);
      resumeTimer = null;
    }
  }

  function pauseAuto() {
    if (autoPaused) return;

    if (autoTimer) {
      const elapsed = Math.max(0, Date.now() - autoStartedAt);
      autoRemaining = Math.max(0, autoRemaining - elapsed);
    }

    clearAutoTimer();
    autoPaused = true;
    paintProgress(true);
  }

  function resumeAuto() {
    clearAutoTimer();

    if (
      !track ||
      slideCount() <= 1 ||
      !media.matches ||
      !isHomeRoute() ||
      document.hidden ||
      matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      autoPaused = true;
      paintProgress(true);
      return;
    }

    if (autoRemaining <= 0 || autoRemaining > AUTOPLAY_MS) {
      autoRemaining = AUTOPLAY_MS;
    }

    autoPaused = false;
    autoStartedAt = Date.now();
    paintProgress(false);

    autoTimer = setTimeout(() => {
      autoTimer = null;
      autoRemaining = AUTOPLAY_MS;

      const total = slideCount();
      const next = total
        ? (detectIndex() + 1) % total
        : 0;

      goToSlide(next, true, false);
    }, autoRemaining);
  }

  function resumeAutoSoon(delay = 180) {
    if (resumeTimer) clearTimeout(resumeTimer);

    resumeTimer = setTimeout(() => {
      resumeTimer = null;
      resumeAuto();
    }, delay);
  }

  function goToSlide(index, smooth = true, manual = true) {
    if (!track) return;

    const total = slideCount();
    if (!total) return;

    let next = index;

    if (next < 0) next = total - 1;
    if (next >= total) next = 0;

    currentIndex = next;

    track.scrollTo({
      left: next * track.clientWidth,
      behavior:
        smooth &&
        !matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'smooth'
          : 'auto'
    });

    if (count) {
      count.textContent =
        String(next + 1).padStart(2, '0') +
        ' / ' +
        String(total).padStart(2, '0');
    }

    clearAutoTimer();
    autoRemaining = AUTOPLAY_MS;
    autoPaused = manual;
    paintProgress(manual);

    if (manual) resumeAutoSoon();
    else resumeAuto();
  }

  function bindTrack() {
    if (!track || track.dataset.jmBound === '1') return;

    track.dataset.jmBound = '1';

    let scrollTimer = null;
    let lastDetected = currentIndex;

    track.addEventListener(
      'scroll',
      () => {
        clearTimeout(scrollTimer);

        scrollTimer = setTimeout(() => {
          const detected = detectIndex();
          updateCount();

          if (detected !== lastDetected) {
            lastDetected = detected;

            if (autoPaused) {
              autoRemaining = AUTOPLAY_MS;
              paintProgress(true);
            }
          }
        }, 80);
      },
      {passive: true}
    );

    track.addEventListener('pointerdown', pauseAuto, {passive: true});
    track.addEventListener('pointerup', () => resumeAutoSoon(), {passive: true});
    track.addEventListener('pointercancel', () => resumeAutoSoon(), {passive: true});

    track.addEventListener('keydown', event => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;

      event.preventDefault();

      goToSlide(
        detectIndex() + (event.key === 'ArrowRight' ? 1 : -1),
        true,
        true
      );
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
        $('#songsRankingBlock')?.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
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
    const height = Math.ceil(
      header?.getBoundingClientRect().height || 112
    );

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
    }, 24);
  }

  function observeSources() {
    sourceObserver?.disconnect();

    sourceObserver = new MutationObserver(() => {
      scheduleRender(false);
    });

    [
      $('#homeNextShow'),
      $('#songsRanking'),
      $('#fansRanking'),
      $('#homeRankingPreview'),
      $('#mediaGallery'),
      $('#homeMediaWall'),
      $('#contactsSocialActions')
    ]
      .filter(Boolean)
      .forEach(node => {
        sourceObserver.observe(node, {
          childList: true,
          subtree: true,
          characterData: true,
          attributes: true,
          attributeFilter: [
            'href',
            'src',
            'style',
            'target',
            'aria-label',
            'title'
          ]
        });
      });
  }

  function syncRouteState() {
    const active = media.matches && isHomeRoute();

    document.body.classList.toggle(
      'jm-mobile-home-active',
      active
    );

    if (!media.matches) {
      document.documentElement.classList.remove('jm-mobile-home-pending');
      pauseAuto();

      $('#jmMobileHomeExperience')?.remove();

      experience = null;
      track = null;
      progress = null;
      count = null;
      currentSignature = '';

      document.documentElement.style.removeProperty(
        '--jm-mobile-header-h'
      );

      return;
    }

    measureHeader();

    if (active) renderExperience(true);
    else {
      document.documentElement.classList.remove('jm-mobile-home-pending');
      pauseAuto();
    }
  }

  function watchHeader() {
    headerObserver?.disconnect();

    const header = $('#siteHeader');

    if (!header || typeof ResizeObserver === 'undefined') {
      return;
    }

    headerObserver = new ResizeObserver(() => {
      measureHeader();

      if (media.matches && isHomeRoute()) {
        requestAnimationFrame(() => {
          if (track) {
            track.scrollLeft =
              currentIndex * track.clientWidth;
          }
        });
      }
    });

    headerObserver.observe(header);
  }

  function handleCacheUpdate() {
    warmCachedAssets();
    scheduleRender(false);
  }

  function boot() {
    if (!media.matches) return;

    watchHeader();
    syncRouteState();
    observeSources();

    addEventListener('hashchange', syncRouteState);

    addEventListener(
      'resize',
      () => {
        measureHeader();

        if (media.matches && isHomeRoute()) {
          requestAnimationFrame(() => {
            if (track) {
              track.scrollLeft =
                currentIndex * track.clientWidth;
            }
          });
        }
      },
      {passive: true}
    );

    document.addEventListener(
      'visibilitychange',
      () => {
        if (document.hidden) {
          pauseAuto();
        } else if (media.matches && isHomeRoute()) {
          resumeAuto();
        }
      }
    );

    window.addEventListener(
      'jm:public-cache-updated',
      handleCacheUpdate
    );

    window.addEventListener('storage', event => {
      if (event.key === PUBLIC_CACHE_KEY) {
        handleCacheUpdate();
      }
    });

    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', syncRouteState);
    } else if (typeof media.addListener === 'function') {
      media.addListener(syncRouteState);
    }

    // Un solo pass iniziale: nessuna raffica di render programmati.
    scheduleRender(true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      boot,
      {once: true}
    );
  } else {
    boot();
  }
})();
