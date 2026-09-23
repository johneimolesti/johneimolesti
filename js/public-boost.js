(() => {
  'use strict';

  /*
   * JOHN & I MOLESTI — PUBLIC BOOST
   *
   * Questa versione NON effettua chiamate backend proprie.
   * Osserva soltanto le richieste che public.js esegue già:
   * - nessun doppio caricamento/rete;
   * - cache locale dei soli dati pubblici guest;
   * - Home aggiornata appena concerti / classifiche / news arrivano,
   *   senza aspettare che termini tutto il Promise.all di public.js;
   * - correzione faux-bold Impact su Windows / Edge;
   * - nuova hero desktop full-image, derivata dalla logica mobile.
   */

  const SUPABASE_URL = 'https://etzwybamvfpeitkttwrc.supabase.co';
  const FAN_API = `${SUPABASE_URL}/functions/v1/fan-api`;

  const CACHE_KEY = 'jm_public_fast_cache_v4';
  const CACHE_MAX_AGE = 12 * 60 * 60 * 1000;

  const $ = id => document.getElementById(id);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  let cache = readCache();
  let windowsFontObserver = null;
  let lastFastHighlightSignature = '';

  /* =========================================================
     CSS — HERO DESKTOP + FIX FONT WINDOWS
     ========================================================= */

  function installCss() {
    if ($('jmPublicBoostStyle')) return;

    const style = document.createElement('style');
    style.id = 'jmPublicBoostStyle';
    style.textContent = `
      /* Edge/Windows: evita la sintesi artificiale del bold di Impact. */
      html.jm-windows-impact-fix,
      html.jm-windows-impact-fix * {
        font-synthesis: none !important;
      }

      /* La sfumatura laterale resta SEMPRE rimossa, anche nell'editor ritaglio. */
      #homePage > .home-hero-news > .home-hero-highlights .highlight-slide::before {
        background: transparent !important;
      }

      .home-inline-crop-fade,
      .home-fallback-preview::after {
        background: transparent !important;
      }

      /* =====================================================
         DESKTOP HOME HERO
         Stessa logica della Home mobile:
         immagine full-bleed + firma + contenuto slide.
         ===================================================== */
      @media (min-width: 761px) {
        #homePage > .home-hero-news {
          position: relative !important;
          display: block !important;
          min-height: clamp(470px, 56vh, 620px) !important;
          height: clamp(470px, 56vh, 620px) !important;
          overflow: hidden !important;
          isolation: isolate !important;
          border: 1px solid #656259 !important;
          background: #090909 !important;
        }

        #homePage > .home-hero-news > .hero-copy {
          position: absolute !important;
          z-index: 12 !important;
          top: 28px !important;
          left: 30px !important;
          right: auto !important;
          bottom: auto !important;
          width: min(480px, 45%) !important;
          min-height: 0 !important;
          height: auto !important;
          padding: 0 !important;
          display: block !important;
          background: transparent !important;
          text-shadow: 0 2px 12px rgba(0,0,0,.78) !important;
          pointer-events: none !important;
        }

        #homePage > .home-hero-news > .hero-copy h1 {
          display: flex !important;
          align-items: baseline !important;
          flex-wrap: nowrap !important;
          gap: 7px !important;
          width: auto !important;
          max-width: none !important;
          margin: 0 !important;
          color: var(--gold) !important;
          font-family: Impact, Haettenschweiler, "Arial Narrow Bold", "Arial Narrow", sans-serif !important;
          font-size: clamp(25px, 2.15vw, 36px) !important;
          font-weight: 400 !important;
          line-height: .95 !important;
          letter-spacing: .015em !important;
          text-transform: uppercase !important;
        }

        #homePage > .home-hero-news > .hero-copy .title-john,
        #homePage > .home-hero-news > .hero-copy .title-and,
        #homePage > .home-hero-news > .hero-copy .title-molesti {
          display: inline !important;
          flex: 0 0 auto !important;
          width: auto !important;
          max-width: none !important;
          margin: 0 !important;
          padding: 0 !important;
          border: 0 !important;
          background: transparent !important;
          color: var(--gold) !important;
          box-shadow: none !important;
          transform: none !important;
          letter-spacing: inherit !important;
        }

        #homePage > .home-hero-news > .hero-copy .title-and {
          font-family: Georgia, serif !important;
          font-size: .72em !important;
          font-style: italic !important;
          font-weight: 700 !important;
        }

        #homePage > .home-hero-news > .hero-copy .hero-lead {
          max-width: 430px !important;
          margin: 7px 0 0 !important;
          color: rgba(255,255,255,.88) !important;
          font-size: 12px !important;
          font-weight: 700 !important;
          line-height: 1.25 !important;
        }

        /* Le azioni sono già nel contenuto della slide: niente doppioni. */
        #homePage > .home-hero-news > .hero-copy .hero-actions {
          display: none !important;
        }

        #homePage > .home-hero-news > .home-hero-highlights {
          position: absolute !important;
          z-index: 1 !important;
          inset: 0 !important;
          width: 100% !important;
          height: 100% !important;
          min-height: 0 !important;
          margin: 0 !important;
          overflow: hidden !important;
        }

        #homePage > .home-hero-news > .home-hero-highlights .highlight-track,
        #homePage > .home-hero-news > .home-hero-highlights .highlight-slide {
          width: 100% !important;
          height: 100% !important;
          min-height: 100% !important;
        }

        #homePage > .home-hero-news > .home-hero-highlights .highlight-slide {
          position: relative !important;
          isolation: isolate !important;
          display: block !important;
          padding: 0 !important;
          overflow: hidden !important;
          background: #090909 !important;
        }

        #homePage > .home-hero-news > .home-hero-highlights .highlight-bg-image {
          position: absolute !important;
          z-index: -4 !important;
          inset: 0 !important;
          width: 100% !important;
          height: 100% !important;
          object-fit: cover !important;
        }

        /*
         * Nessuna sfumatura da sinistra.
         * Rimane soltanto una leggera ombra VERTICALE dal basso,
         * come sulla versione mobile, per leggere i testi.
         */
        #homePage > .home-hero-news > .home-hero-highlights .highlight-slide::before {
          content: "" !important;
          position: absolute !important;
          z-index: -3 !important;
          inset: 0 !important;
          background: transparent !important;
          pointer-events: none !important;
        }

        #homePage > .home-hero-news > .home-hero-highlights .highlight-slide::after {
          content: "" !important;
          position: absolute !important;
          z-index: -2 !important;
          inset: 0 !important;
          background:
            linear-gradient(
              0deg,
              rgba(0,0,0,.82) 0%,
              rgba(0,0,0,.48) 22%,
              rgba(0,0,0,.12) 50%,
              rgba(0,0,0,.03) 72%,
              rgba(0,0,0,.12) 100%
            ) !important;
          pointer-events: none !important;
        }

        #homePage > .home-hero-news > .home-hero-highlights .highlights-heading {
          position: absolute !important;
          z-index: 14 !important;
          top: 24px !important;
          left: auto !important;
          right: 28px !important;
          width: auto !important;
          max-width: 430px !important;
          display: flex !important;
          align-items: center !important;
          justify-content: flex-end !important;
          gap: 12px !important;
          margin: 0 !important;
          pointer-events: none !important;
        }

        #homePage > .home-hero-news > .home-hero-highlights .highlights-heading h2 {
          margin: 0 !important;
          color: var(--gold) !important;
          font: 900 10px/1 "Courier New", monospace !important;
          letter-spacing: .13em !important;
          text-align: right !important;
          text-transform: uppercase !important;
        }

        #homePage > .home-hero-news > .home-hero-highlights .highlights-controls {
          display: flex !important;
          align-items: center !important;
          gap: 6px !important;
          margin: 0 !important;
          pointer-events: auto !important;
        }

        #homePage > .home-hero-news > .home-hero-highlights .highlights-controls button {
          width: 38px !important;
          height: 38px !important;
          padding: 0 !important;
          border: 1px solid rgba(255,255,255,.42) !important;
          background: rgba(8,8,8,.58) !important;
          color: #fff !important;
          backdrop-filter: blur(5px) !important;
          -webkit-backdrop-filter: blur(5px) !important;
        }

        #homePage > .home-hero-news > .home-hero-highlights #highlightCount {
          min-width: 42px !important;
          color: #fff !important;
          font: 900 9px/1 monospace !important;
          text-align: center !important;
        }

        #homePage > .home-hero-news > .home-hero-highlights .highlight-copy {
          position: absolute !important;
          z-index: 10 !important;
          left: 30px !important;
          right: auto !important;
          bottom: 34px !important;
          width: min(760px, 64%) !important;
          max-width: 760px !important;
          margin: 0 !important;
          padding: 0 !important;
          display: flex !important;
          flex-direction: column !important;
          align-items: flex-start !important;
          color: #fff !important;
          text-align: left !important;
          text-shadow: 0 2px 14px rgba(0,0,0,.75) !important;
        }

        #homePage > .home-hero-news > .home-hero-highlights .highlight-copy .section-kicker {
          display: inline-flex !important;
          align-items: center !important;
          min-height: 25px !important;
          max-width: 100% !important;
          margin: 0 0 9px !important;
          padding: 5px 8px !important;
          background: var(--gold) !important;
          color: #111 !important;
          font: 900 9px/1 "Courier New", monospace !important;
          letter-spacing: .08em !important;
          text-align: left !important;
          text-shadow: none !important;
        }

        #homePage > .home-hero-news > .home-hero-highlights .highlight-copy h3 {
          max-width: 100% !important;
          margin: 0 0 9px !important;
          color: #fff !important;
          font-family: Impact, Haettenschweiler, "Arial Narrow Bold", "Arial Narrow", sans-serif !important;
          font-size: clamp(54px, 5.8vw, 92px) !important;
          font-weight: 400 !important;
          line-height: .88 !important;
          letter-spacing: -.015em !important;
          text-align: left !important;
          text-transform: uppercase !important;
        }

        #homePage > .home-hero-news > .home-hero-highlights .highlight-copy p {
          max-width: 620px !important;
          margin: 0 0 15px !important;
          color: rgba(255,255,255,.88) !important;
          font-size: 14px !important;
          line-height: 1.35 !important;
          text-align: left !important;
        }

        #homePage > .home-hero-news > .home-hero-highlights .highlight-action {
          align-self: flex-start !important;
          min-width: 0 !important;
          min-height: 38px !important;
          padding: 9px 13px !important;
          border-color: var(--gold) !important;
          background: var(--gold) !important;
          color: #111 !important;
          font-size: 10px !important;
          text-shadow: none !important;
        }

        #homePage > .home-hero-news > .home-hero-highlights .highlight-action:hover {
          transform: translate(-2px,-2px) !important;
        }

        .home-fallback-crop-button {
          top: 75px !important;
          right: 28px !important;
          bottom: auto !important;
        }

        .home-inline-crop-copy {
          left: 22px !important;
          right: auto !important;
          bottom: 22px !important;
          width: min(620px, 62%) !important;
          justify-items: start !important;
          text-align: left !important;
        }

        .home-inline-crop-copy strong,
        .home-fallback-preview-copy strong {
          font-family: Impact, Haettenschweiler, "Arial Narrow Bold", "Arial Narrow", sans-serif !important;
          font-weight: 400 !important;
        }
      }

      @media (min-width: 761px) and (max-width: 1050px) {
        #homePage > .home-hero-news {
          min-height: 455px !important;
          height: 455px !important;
        }

        #homePage > .home-hero-news > .hero-copy {
          top: 22px !important;
          left: 22px !important;
          width: 48% !important;
        }

        #homePage > .home-hero-news > .home-hero-highlights .highlight-copy {
          left: 22px !important;
          bottom: 28px !important;
          width: min(650px, 72%) !important;
        }

        #homePage > .home-hero-news > .home-hero-highlights .highlight-copy h3 {
          font-size: clamp(45px, 6vw, 68px) !important;
        }

        #homePage > .home-hero-news > .home-hero-highlights .highlights-heading {
          top: 18px !important;
          right: 20px !important;
        }
      }
    `;

    document.head.appendChild(style);
  }

  /* =========================================================
     WINDOWS / EDGE — IMPACT
     ========================================================= */

  function isWindows() {
    const uaPlatform = navigator.userAgentData?.platform || '';
    const legacyPlatform = navigator.platform || '';
    const ua = navigator.userAgent || '';
    return /windows|win32|win64/i.test(`${uaPlatform} ${legacyPlatform} ${ua}`);
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

      /*
       * Impact non ha bisogno di un falso 900:
       * il volto reale è già molto pesante.
       */
      node.style.setProperty('font-weight', '400', 'important');
    }
  }

  function installWindowsFontFix() {
    if (!isWindows()) return;

    document.documentElement.classList.add('jm-windows-impact-fix');

    const start = () => {
      fixImpactNode(document.body);

      windowsFontObserver?.disconnect();
      windowsFontObserver = new MutationObserver(records => {
        for (const record of records) {
          for (const node of record.addedNodes) {
            if (node.nodeType === 1) fixImpactNode(node);
          }
        }
      });

      windowsFontObserver.observe(document.body, {
        childList: true,
        subtree: true
      });
    };

    if (document.body) start();
    else document.addEventListener('DOMContentLoaded', start, {once:true});
  }

  /* =========================================================
     CACHE PUBBLICA
     ========================================================= */

  function readCache() {
    try {
      const parsed = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');

      if (!parsed || typeof parsed !== 'object') return {};
      if (!Number.isFinite(Number(parsed.savedAt))) return {};
      if (Date.now() - Number(parsed.savedAt) > CACHE_MAX_AGE) return {};

      return parsed;
    } catch {
      return {};
    }
  }

  function writeCache(partial) {
    cache = {
      ...cache,
      ...partial,
      savedAt: Date.now()
    };

    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch {}
  }

  /* =========================================================
     UTILS
     ========================================================= */

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
      '&':'&amp;',
      '<':'&lt;',
      '>':'&gt;',
      '"':'&quot;',
      "'":'&#39;'
    }[ch]));
  }

  function dateParts(value) {
    if (!value) return {day:'—',month:'',year:''};

    const [y,m,d] = String(value).slice(0,10).split('-');
    const months = ['GEN','FEB','MAR','APR','MAG','GIU','LUG','AGO','SET','OTT','NOV','DIC'];

    return {
      day:d || '—',
      month:months[(Number(m) || 1) - 1] || '',
      year:y || ''
    };
  }

  function formatDate(value) {
    if (!value) return '—';
    const [y,m,d] = String(value).slice(0,10).split('-');
    return [d,m,y].filter(Boolean).join('/');
  }

  function formatTime(value) {
    return value ? String(value).slice(0,5) : '';
  }

  function prettyPlace(c) {
    return [c?.venue,c?.city].filter(Boolean).join(' · ');
  }

  function concertStartMs(c) {
    if (c?.live_unlock_at) {
      const t = Date.parse(c.live_unlock_at);
      if (Number.isFinite(t)) return t;
    }

    if (!c?.concert_date) return NaN;

    const time = String(c.start_time || '21:30').slice(0,5);
    return Date.parse(`${String(c.concert_date).slice(0,10)}T${time}:00+02:00`);
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

  function storageUrl(bucket,path) {
    if (!path) return '';

    const clean = String(path)
      .split('/')
      .map(part => encodeURIComponent(part))
      .join('/');

    return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${clean}`;
  }

  function posterUrl(value) {
    const path = posterPaths(value)[0];
    return path ? storageUrl('concert-posters',path) : '';
  }

  function publicSiteAssetUrl(path) {
    return path ? storageUrl('public-site',path) : '';
  }

  function upcomingConcerts(rows = []) {
    const now = Date.now();

    return [...rows]
      .filter(c => {
        if (c?.private_show) return false;
        if (c?.status === 'completed' || c?.status === 'cancelled') return false;

        const start = concertStartMs(c);
        return !Number.isFinite(start) || start >= now - 6 * 60 * 60 * 1000;
      })
      .sort((a,b) => concertStartMs(a) - concertStartMs(b));
  }

  /* =========================================================
     FAST RENDER
     Nessuna richiesta aggiuntiva: usa solo cache o risposte intercettate.
     ========================================================= */

  function renderFastConcerts(rows) {
    if (!Array.isArray(rows)) return;

    const next = upcomingConcerts(rows)[0] || null;
    const box = $('homeNextShow');

    if (box) {
      if (!next) {
        box.style.removeProperty('--dash-bg');
        box.innerHTML = `
          <div class="section-kicker">PROSSIMO LIVE</div>
          <h3>Nuove date in arrivo</h3>
          <p>Apri l'archivio dei live.</p>
          <span class="home-dash-arrow">LIVE →</span>`;
      } else {
        const d = dateParts(next.concert_date);
        const poster = posterUrl(next.poster_path);

        if (poster) {
          box.style.setProperty(
            '--dash-bg',
            `url("${String(poster).replace(/["\\]/g,'\\$&')}")`
          );
        } else {
          box.style.removeProperty('--dash-bg');
        }

        box.innerHTML = `
          <div class="home-dash-live-shade"></div>
          <div class="home-dash-live-copy">
            <div class="section-kicker">
              ${esc(d.day)} ${esc(d.month)} ${esc(d.year)}
              ${next.start_time ? ` · ${esc(formatTime(next.start_time))}` : ''}
            </div>
            <h3>${esc(next.name || 'Live')}</h3>
            <p>${esc(prettyPlace(next) || 'Dettagli in arrivo')}</p>
            <button class="text-button" type="button" data-jm-fast-tour>DETTAGLI →</button>
          </div>`;

        box.querySelector('[data-jm-fast-tour]')?.addEventListener('click',e => {
          e.preventDefault();
          e.stopPropagation();
          location.hash = '#/tour';
        });
      }
    }

    renderFastHighlight();
  }

  function rankingSongMarkup(r,i) {
    const artists = [r.base_artist,r.lyrics_artist].filter(Boolean).join(' / ');
    const cover = posterUrl(r.cover_path);

    return `
      <div class="ranking-row ranking-row-clickable${cover?' has-cover':''}">
        ${cover ? `<div class="ranking-row-bg" style="background-image:url('${esc(cover)}')"></div>` : ''}
        <div class="ranking-pos">${i+1}</div>
        ${cover ? `<img class="ranking-cover" src="${esc(cover)}" alt="Cover di ${esc(r.title || '')}" loading="lazy">` : ''}
        <div class="ranking-main">
          <div class="ranking-title">${esc(r.title || 'Brano')}</div>
          <div class="ranking-meta">${esc(artists || 'Dettagli brano')}</div>
        </div>
        <div class="ranking-score">${esc(r.ranking_score ?? '—')}<small>SCORE</small></div>
      </div>`;
  }

  function rankingFanMarkup(r,i) {
    return `
      <div class="ranking-row ranking-row-clickable">
        <div class="ranking-pos">${esc(r.ranking_position ?? i+1)}</div>
        <div class="ranking-main">
          <div class="ranking-title">${esc(String(r.fan_name || 'Fan').toUpperCase())}</div>
          <div class="ranking-meta">${esc(Number(r.attendance_count || 0))} presenze</div>
        </div>
        <div class="ranking-score">${esc(r.points ?? 0)}<small>PT</small></div>
      </div>`;
  }

  function renderFastRankings(data) {
    if (!data || typeof data !== 'object') return;

    const songs = Array.isArray(data.songs) ? data.songs : [];
    const fans = Array.isArray(data.fans) ? data.fans : [];

    const preview = $('homeRankingPreview');

    if (preview) {
      preview.innerHTML = `
        <div class="home-dash-head">
          <div>
            <span class="section-kicker">TOP SONGS</span>
            <h3>Migliori canzoni</h3>
          </div>
        </div>

        <div class="mini-ranking">
          ${songs.slice(0,3).map((r,i) => `
            <div class="mini-rank-row">
              <span>#${i+1}</span>
              <b>${esc(r.title || 'Brano')}</b>
              <strong>${esc(r.ranking_score ?? '—')}</strong>
            </div>
          `).join('') || '<div class="empty-state">Classifica non disponibile.</div>'}
        </div>

        <span class="home-dash-arrow">CLASSIFICHE →</span>`;
    }

    if ($('songsRanking')) {
      $('songsRanking').innerHTML =
        songs.slice(0,8).map(rankingSongMarkup).join('') ||
        '<div class="empty-state">Classifica brani non disponibile.</div>';
    }

    if ($('fansRanking')) {
      $('fansRanking').innerHTML =
        fans.slice(0,8).map(rankingFanMarkup).join('') ||
        '<div class="empty-state">Classifica fan non disponibile.</div>';
    }
  }

  function newsToFastSlide(row,next) {
    if (!row) {
      if (!next) return null;

      return {
        id:`fallback-${next.id || next.concert_date || 'live'}`,
        kicker:'Prossimo live',
        title:next.name || 'Live',
        body:prettyPlace(next),
        meta:`${formatDate(next.concert_date)}${next.start_time ? ` · ${formatTime(next.start_time)}` : ''}`,
        image:posterUrl(next.poster_path)
      };
    }

    let title = String(row.title || '').trim();
    let body = String(row.body || '').trim();
    let meta = formatDate(row.published_at);
    let kicker = ({song:'Nuova canzone',event:'Live',news:'Novità'})[row.kind] || 'Novità';
    let image = row.image_path ? publicSiteAssetUrl(row.image_path) : '';

    if (row.source_type === 'concert' && Array.isArray(cache.concerts)) {
      const concert = cache.concerts.find(c => String(c.id) === String(row.source_id));

      if (concert) {
        if (!title) title = concert.name || 'Live';
        if (!body) body = prettyPlace(concert);
        meta = `${formatDate(concert.concert_date)}${concert.start_time ? ` · ${formatTime(concert.start_time)}` : ''}`;
        kicker = 'Live';
        if (!image) image = posterUrl(concert.poster_path);
      }
    }

    return {
      id:row.id || `${row.kind || 'news'}-${title}`,
      kicker,
      title:title || 'Novità',
      body,
      meta,
      image
    };
  }

  function renderFastHighlight() {
    const track = $('highlightTrack');
    if (!track) return;

    const next = Array.isArray(cache.concerts)
      ? (upcomingConcerts(cache.concerts)[0] || null)
      : null;

    const news = Array.isArray(cache.news) ? cache.news : [];
    const slides = news.length
      ? news.slice(0,6).map(row => newsToFastSlide(row,next)).filter(Boolean)
      : [newsToFastSlide(null,next)].filter(Boolean);

    if (!slides.length) return;

    const signature = JSON.stringify(
      slides.map(s => [s.id,s.title,s.meta,s.image])
    );

    if (signature === lastFastHighlightSignature) return;
    lastFastHighlightSignature = signature;

    track.innerHTML = slides.map(item => `
      <article class="highlight-slide">
        ${item.image
          ? `<img class="highlight-bg-image" src="${esc(item.image)}" alt="" aria-hidden="true">`
          : ''}
        <div class="highlight-copy">
          <span class="section-kicker">
            ${esc(item.kicker)}${item.meta ? ` · ${esc(item.meta)}` : ''}
          </span>
          <h3>${esc(item.title)}</h3>
          ${item.body ? `<p>${esc(item.body)}</p>` : ''}
        </div>
      </article>
    `).join('');

    if ($('highlightCount')) {
      $('highlightCount').textContent = `1 / ${slides.length}`;
    }

    const newsBox = $('homeNewsPreview')?.querySelector('.home-news-preview-list');

    if (newsBox) {
      newsBox.innerHTML = slides.slice(0,3).map(item => `
        <button class="home-news-mini-row" type="button" data-jm-fast-news>
          <span>${esc(item.kicker || 'Novità')}</span>
          <strong>${esc(item.title || 'Novità')}</strong>
          <small>${esc(item.meta || '')}</small>
        </button>
      `).join('');

      $$('[data-jm-fast-news]',newsBox).forEach(button => {
        button.onclick = e => {
          e.preventDefault();
          e.stopPropagation();
          track.scrollIntoView({behavior:'smooth',block:'center'});
        };
      });
    }
  }

  function hydrateCache() {
    if (Array.isArray(cache.concerts)) renderFastConcerts(cache.concerts);
    if (cache.rankings) renderFastRankings(cache.rankings);
    renderFastHighlight();
  }

  /* =========================================================
     FETCH OBSERVER
     public.js continua a fare UNA SOLA serie di richieste.
     Noi leggiamo una clone della risposta e aggiorniamo la Home subito.
     ========================================================= */

  function parseBody(body) {
    if (typeof body !== 'string' || !body) return null;
    try { return JSON.parse(body); } catch { return null; }
  }

  function inspectResponse(input,init,response) {
    const request = input instanceof Request ? input : null;
    const url = request ? request.url : String(input || '');
    const method = String(init?.method || request?.method || 'GET').toUpperCase();

    let body = init?.body;
    const parsedBody = parseBody(body);

    /* FAN API — solo richieste guest, quindi nessun dato personale in cache. */
    if (url === FAN_API && method === 'POST' && parsedBody?.guest === true) {
      if (parsedBody.action === 'list_concerts') {
        response.clone().json().then(data => {
          const concerts = Array.isArray(data?.concerts) ? data.concerts : [];
          writeCache({concerts});
          renderFastConcerts(concerts);
        }).catch(() => {});
      }

      if (parsedBody.action === 'rankings') {
        response.clone().json().then(data => {
          if (!data || typeof data !== 'object') return;
          writeCache({rankings:data});
          renderFastRankings(data);
        }).catch(() => {});
      }

      return;
    }

    /* NEWS pubbliche Supabase REST. */
    if (
      method === 'GET' &&
      url.includes('/rest/v1/site_news?')
    ) {
      response.clone().json().then(rows => {
        if (!Array.isArray(rows)) return;
        writeCache({news:rows});
        renderFastHighlight();
      }).catch(() => {});
    }
  }

  function installFetchObserver() {
    if (window.fetch.__jmPublicBoostObserver) return;

    const nativeFetch = window.fetch.bind(window);

    const wrapped = async function(input,init) {
      const response = await nativeFetch(input,init);

      if (response?.ok) {
        try { inspectResponse(input,init,response); } catch {}
      }

      return response;
    };

    wrapped.__jmPublicBoostObserver = true;
    wrapped.__jmNativeFetch = nativeFetch;
    window.fetch = wrapped;
  }

  /* =========================================================
     START
     ========================================================= */

  installCss();
  installWindowsFontFix();
  installFetchObserver();

  /*
   * Mostra subito l'ultima risposta pubblica valida.
   * Nessuna rete parte da questo file.
   */
  hydrateCache();

  /*
   * public.js crea #homeDashboard dinamicamente prima delle chiamate.
   * Aspettiamo SOLO quella creazione e poi stacchiamo l'observer:
   * niente loop di rendering.
   */
  const hydrateDynamicHome = () => {
    if (!$('homeDashboard')) return false;
    hydrateCache();
    if (isWindows()) fixImpactNode(document.body);
    return true;
  };

  if (!hydrateDynamicHome()) {
    const homeBootstrapObserver = new MutationObserver(() => {
      if (!hydrateDynamicHome()) return;
      homeBootstrapObserver.disconnect();
    });

    const startBootstrapObserver = () => {
      homeBootstrapObserver.observe(document.body,{
        childList:true,
        subtree:true
      });
    };

    if (document.body) startBootstrapObserver();
    else document.addEventListener('DOMContentLoaded',startBootstrapObserver,{once:true});
  }
})();
