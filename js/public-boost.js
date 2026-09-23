(() => {
  'use strict';

  /*
   * JOHN & I MOLESTI — public boost
   *
   * Scopi:
   * 1) correggere il faux-bold di Impact su Windows/Edge;
   * 2) mostrare subito dati pubblici dalla cache locale;
   * 3) anticipare le chiamate più importanti della Home;
   * 4) condividere le stesse risposte con public.js, evitando doppie richieste;
   * 5) togliere il booking dalla corsia critica iniziale: parte quando si apre
   *    Contatti oppure in background quando il browser è libero.
   *
   * Questo file deve essere caricato PRIMA di js/public.js.
   */

  const SUPABASE_URL = 'https://etzwybamvfpeitkttwrc.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_CtyexwjoW375UXpjInOuDA_Uz28wWJx';
  const FAN_API = `${SUPABASE_URL}/functions/v1/fan-api`;

  const CACHE_KEY = 'jm_public_fast_cache_v3';
  const CACHE_MAX_AGE = 24 * 60 * 60 * 1000;
  const FETCH_SHARE_MS = 12_000;
  const BOOKING_IDLE_DELAY = 2400;

  const $ = id => document.getElementById(id);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  let client = null;
  let cache = readCache();
  let windowsFontObserver = null;

  /* =========================================================
     FONT WINDOWS / EDGE
     ========================================================= */

  function isWindows() {
    const uaPlatform = navigator.userAgentData?.platform || '';
    const legacyPlatform = navigator.platform || '';
    const ua = navigator.userAgent || '';
    return /windows|win32|win64/i.test(`${uaPlatform} ${legacyPlatform} ${ua}`);
  }

  function installFontFix() {
    /*
     * Impact su Windows normalmente esiste in un solo peso reale.
     * Chiedere font-weight:900 può portare Chromium/Edge a sintetizzare
     * un secondo grassetto e a produrre il bordo/ombra visibile.
     */
    const style = document.createElement('style');
    style.id = 'jmWindowsImpactFix';
    style.textContent = `
      html { font-synthesis: none; }

      .jm-windows-impact-fix {
        font-synthesis: none !important;
      }
    `;
    document.head.appendChild(style);

    if (!isWindows()) return;

    const fixNode = node => {
      if (!(node instanceof Element)) return;

      const candidates = [node, ...node.querySelectorAll('*')];

      for (const el of candidates) {
        if (el.dataset?.jmImpactFixed === '1') continue;

        const cs = getComputedStyle(el);
        if (!/impact/i.test(cs.fontFamily || '')) continue;

        el.dataset.jmImpactFixed = '1';
        el.classList.add('jm-windows-impact-fix');

        /*
         * Impact è già un carattere molto pesante.
         * 400 seleziona il volto reale senza faux-bold.
         */
        el.style.setProperty('font-weight', '400', 'important');
      }
    };

    const start = () => {
      fixNode(document.body);

      windowsFontObserver?.disconnect();
      windowsFontObserver = new MutationObserver(records => {
        for (const record of records) {
          for (const node of record.addedNodes) {
            if (node.nodeType === 1) fixNode(node);
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
     FETCH SHARING / PRIORITY
     ========================================================= */

  const nativeFetch = window.fetch.bind(window);
  const sharedFetches = new Map();
  const deferredBooking = new Map();

  function requestInfo(input, init = {}) {
    const isRequest = typeof Request !== 'undefined' && input instanceof Request;
    const url = isRequest ? input.url : String(input || '');
    const method = String(init.method || (isRequest ? input.method : 'GET') || 'GET').toUpperCase();

    let body = init.body;
    if (body == null && isRequest) {
      /* Non leggiamo il body del Request: potremmo consumarne lo stream. */
      body = '';
    }

    return {
      url,
      method,
      body: typeof body === 'string' ? body : ''
    };
  }

  function isSafeSharedRequest(info) {
    const {url, method, body} = info;

    if (method === 'GET' || method === 'HEAD') {
      return url.startsWith(SUPABASE_URL);
    }

    if (method !== 'POST') return false;

    if (url === FAN_API) {
      if (!body.includes('"guest":true')) return false;
      return /"action":"(?:permissions|list_concerts|rankings)"/.test(body);
    }

    if (!url.startsWith(`${SUPABASE_URL}/rest/v1/`)) return false;

    return (
      url.includes('/rpc/get_public_repertoire') ||
      url.includes('/rpc/get_public_unavailable_dates')
    );
  }

  function isBookingRequest(info) {
    return (
      info.method === 'POST' &&
      info.url.includes('/rest/v1/rpc/get_public_unavailable_dates')
    );
  }

  function currentRoute() {
    return location.hash.replace(/^#\/?/, '').split('/')[0] || 'home';
  }

  function cloneFetchArgs(input, init) {
    try {
      if (typeof Request !== 'undefined' && input instanceof Request) {
        return [input.clone(), init ? {...init} : undefined];
      }
    } catch {}
    return [input, init ? {...init} : undefined];
  }

  function keepSharedResponse(key, responsePromise) {
    const entry = {
      startedAt: Date.now(),
      promise: responsePromise,
      response: null
    };

    sharedFetches.set(key, entry);

    responsePromise
      .then(response => {
        try { entry.response = response.clone(); } catch {}
      })
      .catch(() => sharedFetches.delete(key));

    setTimeout(() => {
      if (sharedFetches.get(key) === entry) sharedFetches.delete(key);
    }, FETCH_SHARE_MS);

    return entry;
  }

  function sharedResponse(entry) {
    if (entry.response) {
      try { return Promise.resolve(entry.response.clone()); } catch {}
    }

    return entry.promise.then(response => response.clone());
  }

  function makeKey(info) {
    return `${info.method}\n${info.url}\n${info.body}`;
  }

  function startDeferredBooking(key) {
    const entry = deferredBooking.get(key);
    if (!entry || entry.started) return;

    entry.started = true;

    const requestPromise = nativeFetch(entry.input, entry.init);
    const shared = keepSharedResponse(key, requestPromise);

    requestPromise
      .then(response => entry.resolve(response.clone()))
      .catch(entry.reject)
      .finally(() => deferredBooking.delete(key));

    return shared;
  }

  function releaseDeferredBookings() {
    for (const key of deferredBooking.keys()) startDeferredBooking(key);
  }

  function deferBookingRequest(key, input, init) {
    const existing = deferredBooking.get(key);
    if (existing) return existing.promise;

    const [savedInput, savedInit] = cloneFetchArgs(input, init);

    let resolve;
    let reject;

    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });

    deferredBooking.set(key, {
      input: savedInput,
      init: savedInit,
      resolve,
      reject,
      promise,
      started: false
    });

    const startIfStillPending = () => startDeferredBooking(key);

    if (currentRoute() === 'contacts') {
      queueMicrotask(startIfStillPending);
    } else if ('requestIdleCallback' in window) {
      requestIdleCallback(startIfStillPending, {timeout: BOOKING_IDLE_DELAY});
    } else {
      setTimeout(startIfStillPending, BOOKING_IDLE_DELAY);
    }

    return promise;
  }

  window.fetch = function jmSharedFetch(input, init) {
    const info = requestInfo(input, init);

    if (!isSafeSharedRequest(info)) {
      return nativeFetch(input, init);
    }

    const key = makeKey(info);
    const existing = sharedFetches.get(key);

    if (existing && Date.now() - existing.startedAt < FETCH_SHARE_MS) {
      return sharedResponse(existing);
    }

    if (isBookingRequest(info) && currentRoute() !== 'contacts') {
      return deferBookingRequest(key, input, init);
    }

    const entry = keepSharedResponse(key, nativeFetch(input, init));
    return sharedResponse(entry);
  };

  window.addEventListener('hashchange', () => {
    if (currentRoute() === 'contacts') releaseDeferredBookings();
  });

  /* =========================================================
     CACHE
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
    if (!value) return {day:'—', month:'', year:''};

    const [year, month, day] = String(value).slice(0,10).split('-');
    const months = ['GEN','FEB','MAR','APR','MAG','GIU','LUG','AGO','SET','OTT','NOV','DIC'];

    return {
      day: day || '—',
      month: months[(Number(month) || 1) - 1] || '',
      year: year || ''
    };
  }

  function formatDate(value) {
    if (!value) return '—';
    const [year, month, day] = String(value).slice(0,10).split('-');
    return [day, month, year].filter(Boolean).join('/');
  }

  function formatTime(value) {
    return value ? String(value).slice(0,5) : '';
  }

  function prettyPlace(concert) {
    return [concert?.venue, concert?.city].filter(Boolean).join(' · ');
  }

  function concertStartMs(concert) {
    if (concert?.live_unlock_at) {
      const parsed = Date.parse(concert.live_unlock_at);
      if (Number.isFinite(parsed)) return parsed;
    }

    if (!concert?.concert_date) return NaN;

    const time = String(concert.start_time || '21:30').slice(0,5);
    return Date.parse(`${String(concert.concert_date).slice(0,10)}T${time}:00+02:00`);
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

  function posterUrl(value) {
    const path = posterPaths(value)[0];
    if (!path || !client) return '';

    try {
      return client.storage.from('concert-posters').getPublicUrl(path).data.publicUrl || '';
    } catch {
      return '';
    }
  }

  function siteAssetUrl(path) {
    if (!path || !client) return '';

    try {
      return client.storage.from('public-site').getPublicUrl(path).data.publicUrl || '';
    } catch {
      return '';
    }
  }

  function upcomingConcerts(rows = []) {
    const now = Date.now();

    return [...rows]
      .filter(concert => {
        if (concert.private_show) return false;
        if (concert.status === 'completed' || concert.status === 'cancelled') return false;

        const start = concertStartMs(concert);
        return !Number.isFinite(start) || start >= now - 6 * 60 * 60 * 1000;
      })
      .sort((a,b) => concertStartMs(a) - concertStartMs(b));
  }

  /* =========================================================
     FAST RENDER — DOM usato anche come sorgente da mobile-home.js
     ========================================================= */

  function renderFastConcerts(rows) {
    if (!Array.isArray(rows)) return;

    const upcoming = upcomingConcerts(rows);
    const next = upcoming[0] || null;
    const nextBox = $('homeNextShow');

    if (nextBox) {
      if (!next) {
        nextBox.style.removeProperty('--dash-bg');
        nextBox.innerHTML = `
          <div class="section-kicker">PROSSIMO LIVE</div>
          <h3>Nuove date in arrivo</h3>
          <p>Apri il tour per vedere tutte le date.</p>
          <span class="home-dash-arrow">LIVE →</span>`;
      } else {
        const date = dateParts(next.concert_date);
        const poster = posterUrl(next.poster_path);

        if (poster) {
          nextBox.style.setProperty(
            '--dash-bg',
            `url("${String(poster).replace(/["\\]/g, '\\$&')}")`
          );
        }

        nextBox.innerHTML = `
          <div class="home-dash-live-shade"></div>
          <div class="home-dash-live-copy">
            <div class="section-kicker">
              ${esc(date.day)} ${esc(date.month)} ${esc(date.year)}
              ${next.start_time ? ` · ${esc(formatTime(next.start_time))}` : ''}
            </div>
            <h3>${esc(next.name || 'Live')}</h3>
            <p>${esc(prettyPlace(next) || 'Dettagli in arrivo')}</p>
            <button class="text-button" type="button" data-fast-live>DETTAGLI →</button>
          </div>`;

        nextBox.querySelector('[data-fast-live]')?.addEventListener('click', event => {
          event.stopPropagation();
          location.hash = '#/tour';
        });
      }
    }

    const upcomingBox = $('upcomingConcerts');
    if (upcomingBox && !upcomingBox.dataset.jmFastTouched) {
      upcomingBox.dataset.jmFastTouched = '1';
      upcomingBox.innerHTML = upcoming.slice(0,6).map(concert => {
        const date = dateParts(concert.concert_date);

        return `
          <article class="concert-card" data-fast-tour>
            <div class="concert-date-block">
              <strong>${esc(date.day)}</strong>
              <span>${esc(`${date.month} ${date.year}`)}</span>
            </div>
            <div class="concert-card-main">
              <h4>${esc(concert.name || 'Live')}</h4>
              <div class="concert-meta-line">
                <b>${esc(prettyPlace(concert) || 'Dettagli in arrivo')}</b>
                ${concert.start_time ? `<br>${esc(formatTime(concert.start_time))}` : ''}
              </div>
            </div>
          </article>`;
      }).join('') || '<div class="empty-state">Nessuna data futura pubblicata.</div>';

      $$('[data-fast-tour]', upcomingBox).forEach(node => {
        node.onclick = () => { location.hash = '#/tour'; };
      });
    }

    renderFastHighlight(next);
  }

  function renderFastHighlight(next) {
    const track = $('highlightTrack');
    if (!track || !next) return;

    const cachedNews = Array.isArray(cache.news) ? cache.news : [];
    const news = cachedNews[0] || null;

    let title = news?.title || next.name || 'Prossimo live';
    let body = news?.body || prettyPlace(next);
    let kicker = news ? 'NOVITÀ' : 'PROSSIMO LIVE';
    let meta = news?.published_at
      ? formatDate(news.published_at)
      : `${formatDate(next.concert_date)}${next.start_time ? ` · ${formatTime(next.start_time)}` : ''}`;

    let image = news?.image_path ? siteAssetUrl(news.image_path) : '';
    if (!image) image = posterUrl(next.poster_path);

    track.innerHTML = `
      <article class="highlight-slide" data-jm-fast-highlight>
        ${image ? `<img class="highlight-bg-image" src="${esc(image)}" alt="" aria-hidden="true">` : ''}
        <div class="highlight-copy">
          <span class="section-kicker">${esc(kicker)}${meta ? ` · ${esc(meta)}` : ''}</span>
          <h3>${esc(title)}</h3>
          ${body ? `<p>${esc(body)}</p>` : ''}
        </div>
      </article>`;

    if ($('highlightCount')) $('highlightCount').textContent = '1 / 1';
  }

  function rankingSongRow(row, index) {
    const cover = row.cover_path ? posterUrl(row.cover_path) : '';
    const artists = [row.base_artist, row.lyrics_artist].filter(Boolean).join(' / ');

    return `
      <div class="ranking-row${cover ? ' has-cover' : ''}">
        ${cover ? `<div class="ranking-row-bg" style="background-image:url('${esc(cover)}')"></div>` : ''}
        <div class="ranking-pos">${index + 1}</div>
        ${cover ? `<img class="ranking-cover" src="${esc(cover)}" alt="" loading="lazy">` : ''}
        <div class="ranking-main">
          <div class="ranking-title">${esc(row.title || 'Brano')}</div>
          <div class="ranking-meta">${esc(artists || 'Dettagli brano')}</div>
        </div>
        <div class="ranking-score">${esc(row.ranking_score ?? '—')}<small>SCORE</small></div>
      </div>`;
  }

  function rankingFanRow(row, index) {
    return `
      <div class="ranking-row">
        <div class="ranking-pos">${esc(row.ranking_position ?? index + 1)}</div>
        <div class="ranking-main">
          <div class="ranking-title">${esc(String(row.fan_name || '').toUpperCase())}</div>
          <div class="ranking-meta">${esc(Number(row.attendance_count || 0))} presenze</div>
        </div>
        <div class="ranking-score">${esc(row.points ?? 0)}<small>PT</small></div>
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
          <div><span class="section-kicker">TOP SONGS</span><h3>Migliori canzoni</h3></div>
        </div>
        <div class="mini-ranking">
          ${songs.slice(0,3).map((row,index) => `
            <div class="mini-rank-row">
              <span>#${index + 1}</span>
              <b>${esc(row.title || 'Brano')}</b>
              <strong>${esc(row.ranking_score ?? '—')}</strong>
            </div>`).join('') || '<div class="empty-state">Classifica in aggiornamento.</div>'}
        </div>
        <span class="home-dash-arrow">CLASSIFICHE →</span>`;
    }

    const songsBox = $('songsRanking');
    if (songsBox) {
      songsBox.innerHTML = songs.slice(0,10).map(rankingSongRow).join('')
        || '<div class="empty-state">Classifica in aggiornamento.</div>';
    }

    const fansBox = $('fansRanking');
    if (fansBox) {
      fansBox.innerHTML = fans.slice(0,10).map(rankingFanRow).join('')
        || '<div class="empty-state">Classifica fan in aggiornamento.</div>';
    }
  }

  /* =========================================================
     NETWORK HIGH PRIORITY
     ========================================================= */

  async function fanApiGuest(action) {
    const response = await fetch(FAN_API, {
      method: 'POST',
      headers: {
        'Content-Type':'application/json',
        'apikey':SUPABASE_KEY,
        'Authorization':`Bearer ${SUPABASE_KEY}`
      },
      body: JSON.stringify({action, guest:true})
    });

    let data = {};
    try { data = await response.json(); } catch {}

    if (!response.ok) {
      throw new Error(data.error || `fan-api HTTP ${response.status}`);
    }

    return data;
  }

  async function warmCopy() {
    try {
      await client
        .from('site_content')
        .select('content,revision')
        .eq('id','public')
        .maybeSingle();
    } catch {}
  }

  async function loadFastConcerts() {
    try {
      const data = await fanApiGuest('list_concerts');
      const rows = Array.isArray(data.concerts) ? data.concerts : [];
      writeCache({concerts:rows});
      renderFastConcerts(rows);
    } catch (error) {
      console.warn('Fast load concerti non disponibile', error);
    }
  }

  async function loadFastRankings() {
    try {
      const data = await fanApiGuest('rankings');
      writeCache({rankings:data});
      renderFastRankings(data);
    } catch (error) {
      console.warn('Fast load classifiche non disponibile', error);
    }
  }

  async function loadFastNews() {
    try {
      const now = new Date().toISOString();

      const [newsResult, settingsResult] = await Promise.all([
        client
          .from('site_news')
          .select('id,kind,title,body,link_url,published,published_at,expires_at,source_type,source_id,image_path,image_position_x,image_position_y,image_zoom,action_label,sort_order,updated_at')
          .eq('published',true)
          .lte('published_at',now)
          .or(`expires_at.is.null,expires_at.gt.${now}`)
          .order('sort_order',{ascending:true})
          .order('published_at',{ascending:false})
          .limit(20),
        client
          .from('site_home_settings')
          .select('fallback_image_position_x,fallback_image_position_y,fallback_image_zoom')
          .eq('id','home')
          .maybeSingle()
      ]);

      const update = {};

      if (!newsResult.error) update.news = newsResult.data || [];
      if (!settingsResult.error && settingsResult.data) update.homeSettings = settingsResult.data;

      if (Object.keys(update).length) {
        writeCache(update);

        if (Array.isArray(cache.concerts)) {
          renderFastHighlight(upcomingConcerts(cache.concerts)[0] || null);
        }
      }
    } catch (error) {
      console.warn('Fast load novità non disponibile', error);
    }
  }

  async function loadFastRepertoire() {
    try {
      const result = await client.rpc('get_public_repertoire');
      if (result.error) throw result.error;

      writeCache({repertoire:result.data || []});
    } catch (error) {
      console.warn('Fast warm repertorio non disponibile', error);
    }
  }

  async function warmPermissions() {
    try {
      await fanApiGuest('permissions');
    } catch {}
  }

  function hydrateCachedHome() {
    if (Array.isArray(cache.concerts)) renderFastConcerts(cache.concerts);
    if (cache.rankings) renderFastRankings(cache.rankings);
  }

  function startPriorityLoads() {
    /*
     * Non aspettiamo un unico Promise.all.
     * Ogni blocco aggiorna il DOM appena la sua risposta è pronta.
     */
    void warmCopy();
    void warmPermissions();
    void loadFastConcerts();
    void loadFastRankings();
    void loadFastNews();
    void loadFastRepertoire();
  }

  /* =========================================================
     START
     ========================================================= */

  installFontFix();

  if (!window.supabase?.createClient) {
    return;
  }

  /*
   * I defer script vengono eseguiti a DOM già parsato.
   * Creiamo quindi subito il client, mostriamo la cache e avviamo
   * le richieste prioritarie prima che public.js entri nel suo init.
   */
  client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  hydrateCachedHome();
  startPriorityLoads();

})();
