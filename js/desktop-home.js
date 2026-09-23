(() => {
  'use strict';

  const DESKTOP_QUERY = '(min-width: 761px)';
  const AUTOPLAY_MS = 7000;
  const media = window.matchMedia(DESKTOP_QUERY);

  let experience = null;
  let track = null;
  let progress = null;
  let count = null;
  let prevButton = null;
  let nextButton = null;
  let autoTimer = null;
  let restartTimer = null;
  let renderTimer = null;
  let currentIndex = 0;
  let currentSignature = '';
  let sourceObserver = null;
  let dashboardObserver = null;
  let fontObserver = null;

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

  function isWindows() {
    const platform = navigator.userAgentData?.platform || navigator.platform || '';
    return /windows|win32|win64/i.test(`${platform} ${navigator.userAgent || ''}`);
  }

  function installCss() {
    if ($('#jmDesktopHomeStyle')) return;

    const style = document.createElement('style');
    style.id = 'jmDesktopHomeStyle';
    style.textContent = `
      .jm-desktop-home-experience {
        display: none;
      }

      /* La vecchia sfumatura laterale non deve ricomparire. */
      #homePage > .home-hero-news > .home-hero-highlights .highlight-slide::before,
      .home-inline-crop-fade,
      .home-fallback-preview::after {
        background: transparent !important;
      }

      @media (min-width: 761px) {
        /*
         * La hero originale resta nel DOM come sorgente dati per public.js,
         * ma la visualizzazione desktop usa il carosello dedicato.
         */
        #homePage > .home-hero-news {
          display: none !important;
        }

        .jm-desktop-home-experience {
          position: relative;
          display: block;
          width: 100%;
          height: clamp(480px, 58vh, 650px);
          min-height: 480px;
          margin: 0 0 24px;
          overflow: hidden;
          border: 1px solid #666258;
          background: #090909;
          color: #fff;
          isolation: isolate;
        }

        .jm-desktop-home-track {
          display: flex;
          width: 100%;
          height: 100%;
          overflow-x: auto;
          overflow-y: hidden;
          scroll-snap-type: x mandatory;
          scroll-behavior: smooth;
          overscroll-behavior-x: contain;
          scrollbar-width: none;
        }

        .jm-desktop-home-track::-webkit-scrollbar {
          display: none;
        }

        .jm-desktop-home-slide {
          position: relative;
          isolation: isolate;
          flex: 0 0 100%;
          width: 100%;
          height: 100%;
          overflow: hidden;
          scroll-snap-align: start;
          scroll-snap-stop: always;
          background: #0b0b0b;
        }

        .jm-desktop-home-bg,
        .jm-desktop-home-bg-fallback {
          position: absolute;
          z-index: -5;
          inset: 0;
          width: 100%;
          height: 100%;
        }

        .jm-desktop-home-bg {
          object-fit: cover;
        }

        .jm-desktop-home-bg-fallback {
          display: grid;
          place-items: center;
          background:
            radial-gradient(circle at 74% 24%, rgba(238,229,43,.12), transparent 28%),
            radial-gradient(circle at 20% 78%, rgba(242,168,205,.10), transparent 32%),
            #111;
        }

        .jm-desktop-home-bg-fallback img {
          width: min(31vw, 420px);
          height: auto;
          opacity: .14;
          filter: grayscale(1);
        }

        /*
         * SOLO ombra verticale dal basso.
         * Nessuna sfumatura orizzontale da sinistra.
         */
        .jm-desktop-home-slide::before {
          content: "";
          position: absolute;
          z-index: -3;
          inset: 0;
          pointer-events: none;
          background:
            linear-gradient(
              180deg,
              rgba(0,0,0,.22) 0%,
              rgba(0,0,0,.03) 28%,
              rgba(0,0,0,.08) 48%,
              rgba(0,0,0,.60) 78%,
              rgba(0,0,0,.94) 100%
            );
        }

        .jm-desktop-home-slide[data-slide="songs"]::before {
          background:
            linear-gradient(
              180deg,
              rgba(0,0,0,.18) 0%,
              rgba(0,0,0,.04) 32%,
              rgba(0,0,0,.38) 65%,
              rgba(0,0,0,.95) 100%
            );
        }

        .jm-desktop-home-slide[data-slide="fans"]::before {
          background:
            radial-gradient(circle at 72% 26%, rgba(238,229,43,.12), transparent 30%),
            linear-gradient(180deg, rgba(0,0,0,.24), rgba(0,0,0,.95));
        }

        .jm-desktop-home-signature {
          position: absolute;
          z-index: 12;
          top: 28px;
          left: 30px;
          pointer-events: none;
          text-shadow: 0 2px 12px rgba(0,0,0,.72);
        }

        .jm-desktop-home-signature strong {
          display: block;
          color: var(--gold);
          font: 900 12px/1 "Courier New", monospace;
          letter-spacing: .13em;
        }

        .jm-desktop-home-signature span {
          display: block;
          margin-top: 6px;
          color: rgba(255,255,255,.88);
          font-size: 12px;
          font-weight: 800;
          line-height: 1.2;
        }

        .jm-desktop-home-copy {
          position: absolute;
          z-index: 10;
          left: 30px;
          right: 30px;
          bottom: 52px;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          text-shadow: 0 2px 14px rgba(0,0,0,.76);
        }

        .jm-desktop-home-kicker {
          display: inline-flex;
          align-items: center;
          min-height: 27px;
          margin-bottom: 10px;
          padding: 6px 9px;
          background: var(--gold);
          color: #111;
          font: 900 9px/1 "Courier New", monospace;
          letter-spacing: .10em;
          text-shadow: none;
        }

        .jm-desktop-home-copy h2 {
          max-width: min(850px, 76%);
          margin: 0;
          color: #fff;
          font-family: Impact, Haettenschweiler, "Arial Narrow Bold", "Arial Narrow", sans-serif;
          font-size: clamp(58px, 6.2vw, 100px);
          font-weight: 400;
          line-height: .88;
          letter-spacing: -.025em;
          text-transform: uppercase;
        }

        .jm-desktop-home-copy > p {
          max-width: 680px;
          margin: 12px 0 0;
          color: rgba(255,255,255,.88);
          font-size: 14px;
          font-weight: 750;
          line-height: 1.35;
        }

        .jm-desktop-home-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 7px 12px;
          margin-top: 12px;
          color: rgba(255,255,255,.82);
          font: 800 10px/1.2 "Courier New", monospace;
        }

        .jm-desktop-home-meta b {
          color: var(--gold);
        }

        .jm-desktop-home-actions {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 9px;
          margin-top: 17px;
        }

        .jm-desktop-home-action {
          min-height: 40px;
          padding: 10px 13px;
          border: 1px solid rgba(255,255,255,.58);
          background: rgba(9,9,9,.67);
          color: #fff;
          font: 900 9px/1 "Courier New", monospace;
          letter-spacing: .04em;
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          cursor: pointer;
        }

        .jm-desktop-home-action.primary {
          border-color: var(--gold);
          background: var(--gold);
          color: #111;
          box-shadow: 4px 4px 0 #5e3047;
          backdrop-filter: none;
          -webkit-backdrop-filter: none;
        }

        .jm-desktop-home-action.text {
          border-color: transparent;
          background: transparent;
          color: var(--gold);
          padding-left: 3px;
          padding-right: 3px;
          backdrop-filter: none;
          -webkit-backdrop-filter: none;
        }

        .jm-desktop-song-list,
        .jm-desktop-fan-list {
          display: grid;
          width: min(100%, 560px);
          gap: 5px;
          margin-top: 15px;
        }

        .jm-desktop-song-row,
        .jm-desktop-fan-row {
          display: grid;
          grid-template-columns: 44px minmax(0,1fr) auto;
          gap: 10px;
          align-items: center;
          min-width: 0;
          padding: 9px 10px;
          border-top: 1px solid rgba(255,255,255,.28);
          background: linear-gradient(90deg,rgba(0,0,0,.54),rgba(0,0,0,.10));
          backdrop-filter: blur(5px);
          -webkit-backdrop-filter: blur(5px);
        }

        .jm-desktop-song-row:first-child,
        .jm-desktop-fan-row:first-child {
          border-top-color: var(--gold);
        }

        .jm-desktop-song-row em,
        .jm-desktop-fan-row em {
          color: var(--gold);
          font-family: Impact, Haettenschweiler, "Arial Narrow Bold", "Arial Narrow", sans-serif;
          font-size: 18px;
          font-weight: 400;
          line-height: 1;
          font-style: normal;
        }

        .jm-desktop-song-row b,
        .jm-desktop-fan-row b {
          min-width: 0;
          overflow: hidden;
          color: #fff;
          font-size: 13px;
          line-height: 1.05;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .jm-desktop-song-row strong,
        .jm-desktop-fan-row strong {
          color: var(--gold);
          font: 900 10px/1 "Courier New", monospace;
        }

        .jm-desktop-home-controls {
          position: absolute;
          z-index: 20;
          top: 24px;
          right: 28px;
          display: flex;
          align-items: center;
          gap: 7px;
        }

        .jm-desktop-home-controls button {
          width: 40px;
          height: 40px;
          display: grid;
          place-items: center;
          padding: 0;
          border: 1px solid rgba(255,255,255,.42);
          background: rgba(8,8,8,.58);
          color: #fff;
          font-size: 20px;
          line-height: 1;
          backdrop-filter: blur(5px);
          -webkit-backdrop-filter: blur(5px);
          cursor: pointer;
        }

        .jm-desktop-home-count {
          min-width: 52px;
          color: rgba(255,255,255,.88);
          font: 900 9px/1 "Courier New", monospace;
          text-align: center;
        }

        .jm-desktop-home-pager {
          position: absolute;
          z-index: 18;
          left: 30px;
          right: 30px;
          bottom: 20px;
          display: grid;
          grid-template-columns: auto minmax(0,1fr);
          align-items: center;
          gap: 12px;
          pointer-events: none;
        }

        .jm-desktop-home-pager-label {
          min-width: 52px;
          color: rgba(255,255,255,.78);
          font: 900 8px/1 "Courier New", monospace;
        }

        .jm-desktop-home-progress {
          position: relative;
          height: 2px;
          overflow: hidden;
          background: rgba(255,255,255,.26);
        }

        .jm-desktop-home-progress span {
          display: block;
          width: 0;
          height: 100%;
          background: var(--gold);
        }

        .jm-desktop-home-progress.running span {
          animation: jmDesktopHeroProgress 7s linear forwards;
        }

        @keyframes jmDesktopHeroProgress {
          from { width: 0; }
          to { width: 100%; }
        }

        /*
         * public.js richiama ensureHomeHeroNewsLayout più volte e usa appendChild
         * sui due widget esistenti. L'ordine grafico resta fisso comunque.
         */
        #homeDashboardGrid #homeNewsPreview { order: 1; }
        #homeDashboardGrid #homeMerchPreview { order: 2; }
        #homeDashboardGrid #homeContactsPreview { order: 3; }
        #homeDashboardGrid #homeNextShow { order: 4; }
        #homeDashboardGrid #homeRankingPreview { order: 5; }
      }

      @media (min-width: 761px) and (max-width: 1050px) {
        .jm-desktop-home-experience {
          height: 500px;
          min-height: 500px;
        }

        .jm-desktop-home-copy h2 {
          max-width: 88%;
          font-size: clamp(50px, 7vw, 72px);
        }

        .jm-desktop-home-signature,
        .jm-desktop-home-copy {
          left: 22px;
        }

        .jm-desktop-home-copy {
          right: 22px;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .jm-desktop-home-track {
          scroll-behavior: auto;
        }

        .jm-desktop-home-progress.running span {
          animation: none;
          width: 100%;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function fixImpactNode(root) {
    if (!isWindows() || !(root instanceof Element)) return;

    const nodes = [root, ...root.querySelectorAll('*')];

    for (const node of nodes) {
      if (node.dataset?.jmImpactFixed === '1') continue;

      const cs = getComputedStyle(node);

      if (!/impact/i.test(cs.fontFamily || '')) continue;

      node.dataset.jmImpactFixed = '1';
      node.style.setProperty('font-synthesis', 'none', 'important');
      node.style.setProperty('font-weight', '400', 'important');
    }
  }

  function installWindowsFontFix() {
    if (!isWindows()) return;

    const start = () => {
      fixImpactNode(document.body);

      fontObserver?.disconnect();
      fontObserver = new MutationObserver(records => {
        for (const record of records) {
          for (const node of record.addedNodes) {
            if (node.nodeType === 1) fixImpactNode(node);
          }
        }
      });

      fontObserver.observe(document.body, {
        childList: true,
        subtree: true
      });
    };

    if (document.body) start();
    else document.addEventListener('DOMContentLoaded', start, { once: true });
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

    return {
      title: title || 'Prossimo live',
      meta,
      place: place || 'Date e dettagli del prossimo concerto.',
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

    return {
      image: imageNode
        ? (imageNode.currentSrc || imageNode.getAttribute('src') || '')
        : ''
    };
  }

  function slideBackground(image, alt = '') {
    if (image) {
      return `<img class="jm-desktop-home-bg" src="${esc(image)}" alt="${esc(alt)}">`;
    }

    return `
      <div class="jm-desktop-home-bg-fallback" aria-hidden="true">
        <img src="IMG_6259.PNG" alt="">
      </div>
    `;
  }

  function signatureMarkup() {
    return `
      <div class="jm-desktop-home-signature">
        <strong>JOHN &amp; I MOLESTI</strong>
        <span>I classici italiani incontrano il Punk.</span>
      </div>
    `;
  }

  function liveSlide(live) {
    return `
      <article class="jm-desktop-home-slide" data-slide="live">
        ${slideBackground(live.image, live.title)}
        ${signatureMarkup()}

        <div class="jm-desktop-home-copy">
          <span class="jm-desktop-home-kicker">NEXT LIVE</span>
          <h2>${esc(live.title)}</h2>

          <div class="jm-desktop-home-meta">
            ${live.meta ? `<b>${esc(live.meta)}</b>` : ''}
            ${live.place ? `<span>${esc(live.place)}</span>` : ''}
          </div>

          <div class="jm-desktop-home-actions">
            <button class="jm-desktop-home-action primary" type="button" data-jm-desktop-action="live-detail">
              DETTAGLI DEL LIVE →
            </button>

            <button class="jm-desktop-home-action text" type="button" data-jm-desktop-action="tour">
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
          <div class="jm-desktop-song-row">
            <em>#${esc(song.rank)}</em>
            <b>${esc(song.title)}</b>
            <strong>${esc(song.score || '')}</strong>
          </div>
        `).join('')
      : `
          <div class="jm-desktop-song-row">
            <em>···</em>
            <b>Classifica in caricamento</b>
            <strong></strong>
          </div>
        `;

    return `
      <article class="jm-desktop-home-slide" data-slide="songs">
        ${slideBackground(background, 'Cover della canzone più popolare')}
        ${signatureMarkup()}

        <div class="jm-desktop-home-copy">
          <span class="jm-desktop-home-kicker">POPULAR SONGS</span>
          <h2>LE PIÙ POPOLARI</h2>

          <div class="jm-desktop-song-list">
            ${rows}
          </div>

          <div class="jm-desktop-home-actions">
            <button class="jm-desktop-home-action primary" type="button" data-jm-desktop-action="songs">
              SCOPRI LE SONGS →
            </button>

            <button class="jm-desktop-home-action text" type="button" data-jm-desktop-action="song-ranking">
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
          <div class="jm-desktop-fan-row">
            <em>#${esc(fan.rank || index + 1)}</em>
            <b>${esc(fan.name)}</b>
            <strong>${esc(fan.score || '')}</strong>
          </div>
        `).join('')
      : `
          <div class="jm-desktop-fan-row">
            <em>···</em>
            <b>Classifica fan in caricamento</b>
            <strong></strong>
          </div>
        `;

    return `
      <article class="jm-desktop-home-slide" data-slide="fans">
        ${slideBackground('', '')}
        ${signatureMarkup()}

        <div class="jm-desktop-home-copy">
          <span class="jm-desktop-home-kicker">COMMUNITY</span>
          <h2>TOP FAN</h2>

          <div class="jm-desktop-fan-list">
            ${rows}
          </div>

          <p>Vieni ai live, registrati e vota i brani per entrare in classifica.</p>

          <div class="jm-desktop-home-actions">
            <button class="jm-desktop-home-action primary" type="button" data-jm-desktop-action="fan-area">
              ENTRA / AREA FAN →
            </button>

            <button class="jm-desktop-home-action text" type="button" data-jm-desktop-action="vote">
              VOTA I BRANI →
            </button>
          </div>
        </div>
      </article>
    `;
  }

  function mediaSlide(mediaData, fallbackImage) {
    return `
      <article class="jm-desktop-home-slide" data-slide="media">
        ${slideBackground(mediaData.image || fallbackImage || '', 'Dal palco')}
        ${signatureMarkup()}

        <div class="jm-desktop-home-copy">
          <span class="jm-desktop-home-kicker">MEDIA</span>
          <h2>DAL PALCO</h2>
          <p>Foto, locandine e reperti di dubbio valore.</p>

          <div class="jm-desktop-home-actions">
            <button class="jm-desktop-home-action primary" type="button" data-jm-desktop-action="media">
              GUARDA I MEDIA →
            </button>
          </div>
        </div>
      </article>
    `;
  }

  function getSlideData() {
    return {
      live: readLive(),
      songs: readSongs(),
      fans: readFans(),
      mediaData: readMedia()
    };
  }

  function dataSignature(data) {
    return JSON.stringify(data);
  }

  function ensureExperience() {
    const home = $('#homePage');
    if (!home) return null;

    experience = $('#jmDesktopHomeExperience');

    if (!experience) {
      experience = document.createElement('section');
      experience.id = 'jmDesktopHomeExperience';
      experience.className = 'jm-desktop-home-experience';
      experience.setAttribute('aria-label', 'Home John & i Molesti — carosello');
      home.prepend(experience);
      experience.addEventListener('click', handleAction);
    }

    return experience;
  }

  function renderExperience(force = false) {
    if (!media.matches || !isHomeRoute()) return;

    const root = ensureExperience();
    if (!root) return;

    stabilizeDashboardOrder();

    const data = getSlideData();
    const signature = dataSignature(data);

    if (!force && signature === currentSignature && track) return;

    const previousType = track
      ? track.querySelectorAll('.jm-desktop-home-slide')[currentIndex]?.dataset.slide
      : 'live';

    currentSignature = signature;

    root.innerHTML = `
      <div
        class="jm-desktop-home-track"
        id="jmDesktopHomeTrack"
        tabindex="0"
        aria-label="Scorri i contenuti della Home">
        ${liveSlide(data.live)}
        ${songsSlide(data.songs, data.live.image)}
        ${fansSlide(data.fans)}
        ${mediaSlide(data.mediaData, data.live.image)}
      </div>

      <div class="jm-desktop-home-controls">
        <button id="jmDesktopHomePrev" type="button" aria-label="Slide precedente">←</button>
        <span class="jm-desktop-home-count" id="jmDesktopHomeCount">01 / 04</span>
        <button id="jmDesktopHomeNext" type="button" aria-label="Slide successiva">→</button>
      </div>

      <div class="jm-desktop-home-pager" aria-hidden="true">
        <span class="jm-desktop-home-pager-label">HOME</span>
        <span class="jm-desktop-home-progress" id="jmDesktopHomeProgress"><span></span></span>
      </div>
    `;

    track = $('#jmDesktopHomeTrack', root);
    progress = $('#jmDesktopHomeProgress', root);
    count = $('#jmDesktopHomeCount', root);
    prevButton = $('#jmDesktopHomePrev', root);
    nextButton = $('#jmDesktopHomeNext', root);

    const slides = $$('.jm-desktop-home-slide', track);
    const restored = Math.max(
      0,
      slides.findIndex(slide => slide.dataset.slide === previousType)
    );

    currentIndex = restored;

    bindTrack();

    prevButton.onclick = () => {
      goToSlide(detectIndex() - 1, true, true);
    };

    nextButton.onclick = () => {
      goToSlide(detectIndex() + 1, true, true);
    };

    requestAnimationFrame(() => {
      track.scrollLeft = currentIndex * track.clientWidth;
      updatePager(false);
      startAuto();
    });
  }

  function slideCount() {
    return track ? $$('.jm-desktop-home-slide', track).length : 0;
  }

  function detectIndex() {
    if (!track) return 0;

    const width = Math.max(1, track.clientWidth);

    return Math.max(
      0,
      Math.min(slideCount() - 1, Math.round(track.scrollLeft / width))
    );
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

      goToSlide(next, true, false);
    }, AUTOPLAY_MS);
  }

  function restartAutoSoon() {
    if (restartTimer) clearTimeout(restartTimer);

    restartTimer = setTimeout(startAuto, 1200);
  }

  function goToSlide(index, smooth = true, manual = false) {
    if (!track) return;

    const total = slideCount();
    let next = index;

    if (next < 0) next = total - 1;
    if (next >= total) next = 0;

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

    if (manual) restartAutoSoon();
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
    track.addEventListener('mouseenter', stopAuto);
    track.addEventListener('mouseleave', restartAutoSoon);
    track.addEventListener('focusin', stopAuto);
    track.addEventListener('focusout', restartAutoSoon);

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
    const button = event.target.closest('[data-jm-desktop-action]');
    if (!button) return;

    const action = button.dataset.jmDesktopAction;

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

  function stabilizeDashboardOrder() {
    const grid = $('#homeDashboardGrid');
    if (!grid) return;

    const desiredIds = [
      'homeNewsPreview',
      'homeMerchPreview',
      'homeContactsPreview',
      'homeNextShow',
      'homeRankingPreview'
    ];

    const desiredNodes = desiredIds
      .map(id => document.getElementById(id))
      .filter(node => node?.parentElement === grid);

    if (!desiredNodes.length) return;

    const actual = [...grid.children]
      .filter(node => desiredIds.includes(node.id))
      .map(node => node.id);

    const desired = desiredNodes.map(node => node.id);

    if (actual.join('|') === desired.join('|')) return;

    for (const node of desiredNodes) {
      grid.appendChild(node);
    }
  }

  function scheduleRender(force = false) {
    clearTimeout(renderTimer);

    renderTimer = setTimeout(() => {
      if (!media.matches || !isHomeRoute()) return;
      stabilizeDashboardOrder();
      renderExperience(force);
    }, 70);
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
      $('#homeMediaWall')
    ].filter(Boolean).forEach(node => {
      sourceObserver.observe(node, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['src', 'style']
      });
    });
  }

  function observeDashboard() {
    dashboardObserver?.disconnect();

    const grid = $('#homeDashboardGrid');
    if (!grid) return;

    dashboardObserver = new MutationObserver(() => {
      stabilizeDashboardOrder();
    });

    dashboardObserver.observe(grid, {
      childList: true
    });

    stabilizeDashboardOrder();
  }

  function syncRouteState() {
    if (!media.matches) {
      stopAuto();
      $('#jmDesktopHomeExperience')?.remove();
      experience = null;
      track = null;
      progress = null;
      count = null;
      prevButton = null;
      nextButton = null;
      currentSignature = '';
      return;
    }

    if (isHomeRoute()) {
      renderExperience(true);
    } else {
      stopAuto();
    }
  }

  function boot() {
    installCss();
    installWindowsFontFix();

    observeSources();
    observeDashboard();
    syncRouteState();

    /*
     * Nessun secondo pass programmato: gli observer reagiscono soltanto
     * ai dati realmente renderizzati da public.js. In questo modo non c'è
     * un secondo caricamento artificiale della Home.
     */
    addEventListener('hashchange', syncRouteState);

    addEventListener('resize', () => {
      if (!media.matches || !track) return;

      requestAnimationFrame(() => {
        track.scrollLeft = currentIndex * track.clientWidth;
      });
    });

    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', () => {
        syncRouteState();
        observeSources();
        observeDashboard();
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
