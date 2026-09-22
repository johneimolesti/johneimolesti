() => {
  'use strict';

  const STORAGE_KEY = 'jm_songs_view';
  const VIEW_LIST = 'list';
  const VIEW_DISCS = 'discs';

  const SUPABASE_URL = 'https://etzwybamvfpeitkttwrc.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_CtyexwjoW375UXpjInOuDA_Uz28wWJx';
  const AUDIO_API_PATH = '/functions/v1/demo-audio-api';

  let repertoireClient = null;
  let repertoireStats = new Map();
  let repertoireStatsBusy = false;
  let gridObserver = null;

  const nativeFetch = window.fetch.bind(window);
  const playTrackers = new Map();

  function esc(value) {
    return String(value ?? '').replace(/[&<>'"]/g, ch => ({
      '&':'&amp;',
      '<':'&lt;',
      '>':'&gt;',
      "'":'&#39;',
      '"':'&quot;'
    }[ch]));
  }

  function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function currentView() {
    return localStorage.getItem(STORAGE_KEY) === VIEW_DISCS
      ? VIEW_DISCS
      : VIEW_LIST;
  }

  function setView(view) {
    localStorage.setItem(
      STORAGE_KEY,
      view === VIEW_DISCS ? VIEW_DISCS : VIEW_LIST
    );
    applyView();
  }

  function getClient() {
    if (repertoireClient) return repertoireClient;
    if (!window.supabase?.createClient) return null;

    repertoireClient = window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_KEY,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false
        }
      }
    );

    return repertoireClient;
  }

  async function refreshRepertoireStats(force = false) {
    if (repertoireStatsBusy && !force) return;

    const sb = getClient();
    if (!sb) return;

    repertoireStatsBusy = true;

    try {
      const { data, error } = await sb.rpc('get_public_repertoire');

      if (error) throw error;

      repertoireStats = new Map(
        (data || []).map(song => [String(song.id), song])
      );

      updateCatalogueTotal();
      decorateAllCards();
      enhanceOpenSongDetail();
    } catch (error) {
      console.warn('Statistiche SONGS non disponibili', error);
    } finally {
      repertoireStatsBusy = false;
    }
  }

  function ensureStyles() {
    if (document.getElementById('jmSongsDiscViewStyles')) return;

    const style = document.createElement('style');
    style.id = 'jmSongsDiscViewStyles';

    style.textContent = `
      .repertoire-toolbar{
        flex-wrap:wrap;
      }

      .songs-view-switch{
        display:flex;
        align-items:center;
        gap:4px;
        margin-left:auto;
        border:1px solid #777568;
        padding:3px;
        background:#171717;
      }

      .songs-view-button{
        appearance:none;
        border:0;
        min-height:34px;
        padding:7px 10px;
        background:transparent;
        color:var(--muted);
        font:900 10px/1 monospace;
        letter-spacing:.06em;
        cursor:pointer;
      }

      .songs-view-button:hover,
      .songs-view-button.active{
        background:var(--gold);
        color:#171717;
      }

      .song-listen-stats{
        display:flex;
        align-items:center;
        gap:5px;
        flex-wrap:wrap;
        margin-top:7px;
        font:900 9px/1.2 monospace;
        letter-spacing:.03em;
      }

      .song-listen-stat{
        display:inline-flex;
        align-items:center;
        min-height:20px;
        padding:3px 6px;
        border:1px solid #625f56;
        background:#181817;
        color:#d6d1c3;
        white-space:nowrap;
      }

      .song-listen-stat.is-recent{
        color:#e7c66c;
        border-color:#7a6839;
      }

      .song-listen-stat.is-global{
        color:var(--gold);
        border-color:color-mix(in srgb,var(--gold) 75%,#625f56);
      }

      .repertoire-grid.repertoire-discs-view{
        grid-template-columns:repeat(auto-fill,minmax(170px,1fr));
        gap:22px 18px;
        align-items:start;
      }

      .repertoire-grid.repertoire-discs-view .repertoire-card{
        display:grid;
        grid-template-columns:1fr;
        gap:10px;
        align-items:start;
        padding:12px;
        min-width:0;
        background:transparent;
        border-color:transparent;
        box-shadow:none;
        cursor:default;
      }

      .repertoire-grid.repertoire-discs-view .repertoire-card:hover{
        background:color-mix(in srgb,var(--gold) 7%,transparent);
      }

      .repertoire-grid.repertoire-discs-view .repertoire-cover{
        position:relative;
        width:min(100%,220px);
        height:auto;
        aspect-ratio:1;
        margin:0 auto;
        border-radius:50%;
        border:2px solid #171717;
        cursor:pointer;
        overflow:hidden;
        transform:translateZ(0);
        transition:transform .18s ease,box-shadow .18s ease;
      }

      .repertoire-grid.repertoire-discs-view .repertoire-cover::before{
        content:"▶";
        position:absolute;
        z-index:3;
        inset:50% auto auto 50%;
        transform:translate(-50%,-50%);
        width:42px;
        height:42px;
        display:grid;
        place-items:center;
        border-radius:50%;
        background:rgba(0,0,0,.72);
        color:#fff;
        font:900 15px/1 Arial,sans-serif;
        padding-left:2px;
        opacity:0;
        transition:opacity .15s ease;
        pointer-events:none;
      }

      .repertoire-grid.repertoire-discs-view .repertoire-cover::after{
        content:"";
        position:absolute;
        z-index:4;
        left:50%;
        top:50%;
        width:13%;
        aspect-ratio:1;
        transform:translate(-50%,-50%);
        border-radius:50%;
        background:#111;
        border:2px solid rgba(255,255,255,.72);
        box-shadow:0 0 0 4px rgba(0,0,0,.22);
        pointer-events:none;
      }

      .repertoire-grid.repertoire-discs-view
      .repertoire-card:not(.is-disc-playing)
      .repertoire-cover:hover::before{
        opacity:1;
      }

      .repertoire-grid.repertoire-discs-view
      .repertoire-card.is-disc-playing
      .repertoire-cover{
        animation:jm-song-disc-spin 2.2s linear infinite;
        box-shadow:
          0 0 0 2px var(--gold),
          0 12px 30px rgba(0,0,0,.35);
      }

      .repertoire-grid.repertoire-discs-view
      .repertoire-card.is-disc-playing
      .repertoire-cover::before{
        content:"❚❚";
        opacity:1;
        background:rgba(0,0,0,.58);
        font-size:13px;
        letter-spacing:-2px;
        padding-left:0;
      }

      .repertoire-grid.repertoire-discs-view .repertoire-cover img{
        width:100%;
        height:100%;
        object-fit:cover;
        border-radius:50%;
        pointer-events:none;
        user-select:none;
        -webkit-user-drag:none;
      }

      .repertoire-grid.repertoire-discs-view .repertoire-copy{
        display:block;
        min-width:0;
        text-align:center;
      }

      .repertoire-grid.repertoire-discs-view .repertoire-copy h3{
        margin:0;
        white-space:normal;
        overflow:visible;
        text-overflow:clip;
        font-size:16px;
        line-height:1.15;
        cursor:pointer;
      }

      .repertoire-grid.repertoire-discs-view .repertoire-copy h3:hover{
        color:var(--gold);
        text-decoration:underline;
        text-underline-offset:3px;
      }

      .repertoire-grid.repertoire-discs-view .repertoire-copy p,
      .repertoire-grid.repertoire-discs-view .repertoire-copy > span,
      .repertoire-grid.repertoire-discs-view .repertoire-player{
        display:none !important;
      }

      .repertoire-grid.repertoire-discs-view .song-listen-stats{
        justify-content:center;
        margin-top:8px;
      }

      @keyframes jm-song-disc-spin{
        from{transform:rotate(0deg)}
        to{transform:rotate(360deg)}
      }

      @media (prefers-reduced-motion:reduce){
        .repertoire-grid.repertoire-discs-view
        .repertoire-card.is-disc-playing
        .repertoire-cover{
          animation:none;
        }
      }

      @media(max-width:760px){
        .songs-view-switch{
          margin-left:0;
        }

        .repertoire-grid.repertoire-discs-view{
          grid-template-columns:repeat(2,minmax(0,1fr));
          gap:18px 10px;
        }

        .repertoire-grid.repertoire-discs-view .repertoire-card{
          padding:7px;
        }

        .repertoire-grid.repertoire-discs-view .repertoire-copy h3{
          font-size:14px;
        }

        .song-listen-stats{
          gap:4px;
          font-size:8px;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function renameSection() {
    const navLabel = document.querySelector(
      '.main-nav [data-route="repertoire"] span'
    );

    if (navLabel) {
      delete navLabel.dataset.copy;
      navLabel.textContent = 'SONGS';
    }

    const page = document.getElementById('repertoirePage');
    if (!page) return;

    const title = page.querySelector('.page-hero h2');
    const ornament = page.querySelector('.page-hero-ornament');
    const heading = page.querySelector('.repertoire-heading h3');

    if (title) {
      delete title.dataset.copy;
      title.textContent = 'SONGS';
    }

    if (ornament) {
      delete ornament.dataset.copy;
      ornament.textContent = 'SONGS';
    }

    if (heading) {
      delete heading.dataset.copy;
      heading.textContent = 'Tutte le songs';
    }
  }

  function ensureViewSwitch() {
    const toolbar = document.querySelector('.repertoire-toolbar');
    if (!toolbar) return;

    let wrap = document.getElementById('songsViewSwitch');

    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'songsViewSwitch';
      wrap.className = 'songs-view-switch';
      wrap.setAttribute('role', 'group');
      wrap.setAttribute(
        'aria-label',
        'Modalità di visualizzazione songs'
      );

      wrap.innerHTML = `
        <button
          class="songs-view-button"
          type="button"
          data-songs-view="list"
          aria-pressed="false"
        >LISTA</button>
        <button
          class="songs-view-button"
          type="button"
          data-songs-view="discs"
          aria-pressed="false"
        >DISCHI</button>
      `;

      const jukebox = toolbar.querySelector('#openJukeboxMode');

      if (jukebox) toolbar.insertBefore(wrap, jukebox);
      else toolbar.appendChild(wrap);

      wrap.querySelectorAll('[data-songs-view]').forEach(button => {
        button.addEventListener('click', () => {
          setView(button.dataset.songsView);
        });
      });
    }
  }

  function updateCatalogueTotal() {
    const counter = document.getElementById('repertoireCount');
    if (!counter || !repertoireStats.size) return;

    let totalPlays = 0;

    repertoireStats.forEach(song => {
      totalPlays += Number(song.weighted_play_count || 0);
    });

    counter.textContent =
      `${repertoireStats.size} BRANI · ${totalPlays} ASCOLTI`;
  }

  function songStatsTooltip(song) {
    if (!song) return 'Nessun ascolto conteggiato';

    return [
      `Fan: ${Number(song.fan_play_count || 0)}`,
      `Ospiti: ${Number(song.guest_play_count || 0)}`,
      `Band/admin: ${Number(song.member_play_count || 0)} riproduzioni × 0,5`,
      `Ultimi 30 giorni: ${Number(song.recent_weighted_play_count || 0)}`,
      song.recent_popularity_score == null
        ? ''
        : `Popolarità 30 giorni: ${Number(song.recent_popularity_score)}/100`,
      song.global_popularity_score == null
        ? ''
        : `Popolarità globale: ${Number(song.global_popularity_score)}/100`
    ].filter(Boolean).join(' · ');
  }

  function addSongStats(card) {
    const id = String(card?.dataset?.repertoireSong || '');
    const copy = card?.querySelector('.repertoire-copy');
    const title = copy?.querySelector('h3');

    if (!id || !copy || !title) return;

    const song = repertoireStats.get(id);

    let box = copy.querySelector('.song-listen-stats');

    if (!box) {
      box = document.createElement('div');
      box.className = 'song-listen-stats';
      title.insertAdjacentElement('afterend', box);
    }

    const plays = Number(song?.weighted_play_count || 0);
    const recent = song?.recent_popularity_score;
    const global = song?.global_popularity_score;

    box.innerHTML = `
      <span class="song-listen-stat">
        ASCOLTI ${plays}
      </span>
      ${recent == null ? '' : `
        <span class="song-listen-stat is-recent">
          POP 30G ${Number(recent)}
        </span>
      `}
      ${global == null ? '' : `
        <span class="song-listen-stat is-global">
          POP GLOBALE ${Number(global)}
        </span>
      `}
    `;

    box.title = songStatsTooltip(song);
  }

  function hidePublicTechnicalData(card) {
    /*
      public.js mette BPM + tonalità + durata nella riga tecnica.
      Nel sito pubblico la rimuoviamo integralmente.
      La parte tecnica resta disponibile nel gestionale membri.
    */
    card?.querySelector('.repertoire-copy > span')?.remove();
  }

  function syncPlayingState(card) {
    const player = card?.querySelector('.demo-site-player');
    const toggle = card?.querySelector('[data-demo-toggle]');

    const playing = !!(
      player &&
      toggle &&
      /PAUSA/i.test(toggle.textContent || '')
    );

    card?.classList.toggle('is-disc-playing', playing);

    return playing;
  }

  async function waitForFreshDemoButton(card, timeoutMs = 2500) {
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      const button = card?.querySelector(
        '.demo-player-button:not([disabled])'
      );

      const stalePlayer = card?.querySelector('.demo-site-player');

      if (button && !stalePlayer) return button;

      await wait(80);
    }

    return null;
  }

  async function rebuildPlayerAndPlay(card) {
    const host = card?.querySelector('.repertoire-player');
    if (!host) return;

    delete host.dataset.demoState;

    window.dispatchEvent(
      new CustomEvent('jm:repertoire-rendered')
    );

    const button = await waitForFreshDemoButton(card);

    if (button) button.click();
  }

  async function triggerCoverPlay(card) {
    if (!card) return;

    const spotify = card.querySelector('.repertoire-stream-link');

    if (spotify) {
      spotify.click();
      return;
    }

    const toggle = card.querySelector('[data-demo-toggle]');

    if (toggle) {
      const wasResume = /RIPRENDI/i.test(
        toggle.textContent || ''
      );

      toggle.click();

      if (wasResume) {
        await wait(180);

        const stillSameToggle =
          card.querySelector('[data-demo-toggle]') === toggle;

        const resumed = syncPlayingState(card);

        /*
          Fix A -> B -> A:
          demo-audio-access.js distrugge l'Audio precedente quando
          viene avviato un altro brano. La vecchia card può però
          mantenere il controllo RIPRENDI. Se rileviamo quel controllo
          orfano, ricostruiamo davvero il player e facciamo ripartire A.
        */
        if (
          stillSameToggle &&
          !resumed &&
          /RIPRENDI/i.test(toggle.textContent || '')
        ) {
          await rebuildPlayerAndPlay(card);
        }
      }

      return;
    }

    const demoButton = card.querySelector(
      '.demo-player-button:not([disabled])'
    );

    if (demoButton) {
      demoButton.click();
    }
  }

  function decorateCard(card) {
    if (!card) return;

    hidePublicTechnicalData(card);
    addSongStats(card);

    if (card.dataset.songsDiscBound === '1') {
      syncPlayingState(card);
      return;
    }

    card.dataset.songsDiscBound = '1';

    const cover = card.querySelector('.repertoire-cover');
    const title = card.querySelector('.repertoire-copy h3');

    if (cover) {
      cover.setAttribute('role', 'button');
      cover.tabIndex = 0;
      cover.setAttribute(
        'aria-label',
        'Riproduci o metti in pausa il brano'
      );

      const activate = event => {
        if (currentView() !== VIEW_DISCS) return;

        event.preventDefault();
        event.stopPropagation();

        triggerCoverPlay(card);
      };

      cover.addEventListener('click', activate);

      cover.addEventListener('keydown', event => {
        if (
          event.key === 'Enter' ||
          event.key === ' '
        ) {
          activate(event);
        }
      });
    }

    /*
      Modalità DISCHI:
      cover = play/pausa
      titolo = dettaglio song
      resto della card = nessuna apertura dettaglio
    */
    card.addEventListener(
      'click',
      event => {
        if (currentView() !== VIEW_DISCS) return;

        if (event.target.closest('.repertoire-cover')) return;
        if (event.target.closest('.repertoire-copy h3')) return;
        if (event.target.closest('a,button,input,audio')) return;

        event.stopImmediatePropagation();
      },
      true
    );

    if (title) {
      title.setAttribute('role', 'button');
      title.tabIndex = 0;
      title.setAttribute(
        'aria-label',
        `Apri dettagli: ${title.textContent.trim()}`
      );

      title.addEventListener('keydown', event => {
        if (currentView() !== VIEW_DISCS) return;
        if (
          event.key !== 'Enter' &&
          event.key !== ' '
        ) {
          return;
        }

        event.preventDefault();
        title.click();
      });
    }

    syncPlayingState(card);
  }

  function decorateAllCards() {
    document
      .querySelectorAll('#repertoireGrid .repertoire-card')
      .forEach(decorateCard);
  }

  function applyView() {
    renameSection();
    ensureViewSwitch();

    const grid = document.getElementById('repertoireGrid');
    if (!grid) return;

    const view = currentView();

    grid.classList.toggle(
      'repertoire-discs-view',
      view === VIEW_DISCS
    );

    document
      .querySelectorAll('[data-songs-view]')
      .forEach(button => {
        const active =
          button.dataset.songsView === view;

        button.classList.toggle('active', active);
        button.setAttribute(
          'aria-pressed',
          active ? 'true' : 'false'
        );
      });

    decorateAllCards();
    updateCatalogueTotal();
  }

  function songFromOpenDetail() {
    const modal = document.getElementById('rankingDetailModal');

    if (!modal || modal.hidden) return null;

    const kicker = modal
      .querySelector('#rankingDetailKicker')
      ?.textContent
      ?.trim();

    if (kicker !== 'BRANO') return null;

    const title = modal
      .querySelector('#rankingDetailTitle')
      ?.textContent
      ?.trim();

    if (!title) return null;

    for (const song of repertoireStats.values()) {
      if (
        String(song.title || '').trim() === title
      ) {
        return song;
      }
    }

    return null;
  }

  function songRankingPosition(songId) {
    const ranked = [...repertoireStats.values()]
      .filter(song => song.ranking_score != null)
      .sort((a, b) => {
        const scoreDiff =
          Number(b.ranking_score) -
          Number(a.ranking_score);

        if (scoreDiff) return scoreDiff;

        return String(a.title || '').localeCompare(
          String(b.title || ''),
          'it',
          { sensitivity:'base' }
        );
      });

    const index = ranked.findIndex(
      song => String(song.id) === String(songId)
    );

    return index >= 0 ? index + 1 : null;
  }

  function enhanceOpenSongDetail() {
    const modal = document.getElementById('rankingDetailModal');
    if (!modal || modal.hidden) return;

    const song = songFromOpenDetail();
    if (!song) return;

    const body = modal.querySelector('#rankingDetailBody');
    if (!body) return;

    const score = body.querySelector(
      '.ranking-detail-score strong'
    );

    if (score) {
      score.textContent =
        song.ranking_score ?? '—';
    }

    body
      .querySelectorAll('.ranking-detail-row')
      .forEach(row => {
        const label = row
          .querySelector('span')
          ?.textContent
          ?.trim();

        if (
          label === 'BPM' ||
          label === 'Tonalità'
        ) {
          row.remove();
          return;
        }

        if (label === 'Posizione') {
          const value = row.querySelector('strong');
          const pos = songRankingPosition(song.id);

          if (value) {
            value.textContent =
              pos ? `#${pos}` : '—';
          }
        }
      });

    let stats = body.querySelector(
      '.song-detail-public-stats'
    );

    if (!stats) {
      stats = document.createElement('div');
      stats.className =
        'ranking-detail-data song-detail-public-stats';

      body
        .querySelector('.ranking-detail-summary')
        ?.appendChild(stats);
    }

    stats.innerHTML = `
      <div class="ranking-detail-row">
        <span>Ascolti</span>
        <strong>${Number(song.weighted_play_count || 0)}</strong>
      </div>
      <div class="ranking-detail-row">
        <span>Popolarità 30gg</span>
        <strong>${
          song.recent_popularity_score == null
            ? '—'
            : `${Number(song.recent_popularity_score)}/100`
        }</strong>
      </div>
      <div class="ranking-detail-row">
        <span>Popolarità globale</span>
        <strong>${
          song.global_popularity_score == null
            ? '—'
            : `${Number(song.global_popularity_score)}/100`
        }</strong>
      </div>
    `;
  }

  function installDetailHooks() {
    if (window.__jmSongDetailHooksInstalled) return;
    window.__jmSongDetailHooksInstalled = true;

    /*
      public.js costruisce il modal dopo il click.
      Aggiorniamo score/statistiche nel tick successivo.
    */
    document.addEventListener(
      'click',
      event => {
        if (
          event.target.closest(
            '#repertoireGrid [data-repertoire-song]'
          ) ||
          event.target.closest(
            '[data-ranking-song-index]'
          )
        ) {
          setTimeout(enhanceOpenSongDetail, 0);
          setTimeout(enhanceOpenSongDetail, 80);
        }
      },
      true
    );
  }

  function sourceCurrentlyPlaying(source, songId) {
    const id = CSS.escape(String(songId));

    if (source === 'jukebox') {
      const slot = document.querySelector(
        `[data-jukebox-song="${id}"]`
      );

      return !!(
        slot?.classList.contains('is-playing') ||
        slot?.querySelector(
          '.jukebox-push.is-playing'
        )
      );
    }

    const card = document.querySelector(
      `#repertoireGrid [data-repertoire-song="${id}"]`
    );

    const toggle = card?.querySelector(
      '[data-demo-toggle]'
    );

    return !!(
      toggle &&
      /PAUSA/i.test(toggle.textContent || '')
    );
  }

  function stopPlayTracker(source) {
    const tracker = playTrackers.get(source);
    if (!tracker) return;

    clearInterval(tracker.timer);
    playTrackers.delete(source);
  }

  function startPlayQualification({
    url,
    init,
    requestBody,
    responseBody,
    source
  }) {
    const playId = String(
      responseBody?.play_id || ''
    );

    const songId = String(
      requestBody?.song_id || ''
    );

    const requiredSeconds = Math.max(
      1,
      Number(
        responseBody?.qualify_after_seconds || 8
      )
    );

    if (!playId || !songId) return;

    stopPlayTracker(source);

    const startedAt = Date.now();

    let listenedSeconds = 0;
    let previousTick = Date.now();
    let confirming = false;

    const tracker = {
      timer: setInterval(async () => {
        const now = Date.now();

        const delta = Math.max(
          0,
          (now - previousTick) / 1000
        );

        previousTick = now;

        if (
          sourceCurrentlyPlaying(source, songId)
        ) {
          listenedSeconds += delta;
        }

        if (
          Date.now() - startedAt > 120000
        ) {
          stopPlayTracker(source);
          return;
        }

        if (
          confirming ||
          listenedSeconds < requiredSeconds
        ) {
          return;
        }

        confirming = true;

        try {
          const confirmBody = {
            ...requestBody,
            action:'qualify_play',
            play_id:playId,
            listened_seconds:Number(
              listenedSeconds.toFixed(2)
            )
          };

          const response = await nativeFetch(
            url,
            {
              ...init,
              method:'POST',
              headers:new Headers(
                init?.headers || {}
              ),
              body:JSON.stringify(confirmBody)
            }
          );

          const result = await response
            .json()
            .catch(() => ({}));

          if (!response.ok) {
            throw new Error(
              result?.error ||
              `HTTP ${response.status}`
            );
          }

          stopPlayTracker(source);

          if (result?.counted) {
            await refreshRepertoireStats(true);

            window.dispatchEvent(
              new CustomEvent(
                'jm:song-play-counted',
                {
                  detail:{
                    song_id:songId,
                    source,
                    play_id:playId
                  }
                }
              )
            );
          }
        } catch (error) {
          confirming = false;

          console.warn(
            'Conferma ascolto non riuscita',
            error
          );
        }
      }, 500)
    };

    playTrackers.set(source, tracker);
  }

  function installAudioTracking() {
    if (window.__jmSongPlayFetchWrapped) return;

    window.__jmSongPlayFetchWrapped = true;

    window.fetch = async function(
      input,
      init = {}
    ) {
      const url =
        typeof input === 'string'
          ? input
          : String(input?.url || '');

      let requestBody = null;

      if (
        url.includes(AUDIO_API_PATH) &&
        typeof init?.body === 'string'
      ) {
        try {
          requestBody =
            JSON.parse(init.body);
        } catch {
          requestBody = null;
        }
      }

      if (
        requestBody?.action === 'audio'
      ) {
        const jukeboxOpen = document
          .getElementById('jukeboxOverlay')
          ?.classList
          .contains('open');

        const source =
          jukeboxOpen
            ? 'jukebox'
            : 'songs';

        requestBody.source = source;

        const nextInit = {
          ...init,
          body:JSON.stringify(requestBody)
        };

        const response = await nativeFetch(
          input,
          nextInit
        );

        if (response.ok) {
          response
            .clone()
            .json()
            .then(responseBody => {
              startPlayQualification({
                url,
                init:nextInit,
                requestBody,
                responseBody,
                source
              });
            })
            .catch(() => {});
        }

        return response;
      }

      return nativeFetch(input, init);
    };
  }

  function observeGrid() {
    const grid =
      document.getElementById('repertoireGrid');

    if (!grid) return;

    if (gridObserver) {
      gridObserver.disconnect();
    }

    gridObserver = new MutationObserver(
      mutations => {
        const touched = new Set();

        mutations.forEach(mutation => {
          const target =
            mutation.target.nodeType ===
            Node.ELEMENT_NODE
              ? mutation.target
              : mutation.target.parentElement;

          const card =
            target?.closest?.(
              '.repertoire-card'
            );

          if (card) touched.add(card);

          mutation.addedNodes.forEach(node => {
            if (
              node.nodeType !==
              Node.ELEMENT_NODE
            ) {
              return;
            }

            if (
              node.matches?.(
                '.repertoire-card'
              )
            ) {
              touched.add(node);
              return;
            }

            node
              .querySelectorAll?.(
                '.repertoire-card'
              )
              .forEach(
                item => touched.add(item)
              );
          });
        });

        touched.forEach(card => {
          decorateCard(card);
          syncPlayingState(card);
        });
      }
    );

    gridObserver.observe(
      grid,
      {
        childList:true,
        subtree:true,
        characterData:true
      }
    );
  }

  function setup() {
    ensureStyles();
    renameSection();
    ensureViewSwitch();
    applyView();
    observeGrid();
    installDetailHooks();
    refreshRepertoireStats();
  }

  function setupWhenReady() {
    if (
      document.getElementById(
        'repertoirePage'
      )
    ) {
      setup();
      return true;
    }

    return false;
  }

  installAudioTracking();

  window.addEventListener(
    'jm:repertoire-rendered',
    setup
  );

  window.addEventListener(
    'hashchange',
    () => {
      if (
        location.hash.startsWith(
          '#/repertoire'
        )
      ) {
        setTimeout(setup, 0);
      }
    }
  );

  if (
    document.readyState === 'loading'
  ) {
    document.addEventListener(
      'DOMContentLoaded',
      () => {
        if (setupWhenReady()) return;

        const lateObserver =
          new MutationObserver(() => {
            if (!setupWhenReady()) return;

            lateObserver.disconnect();
          });

        lateObserver.observe(
          document.body,
          {
            childList:true,
            subtree:true
          }
        );
      },
      { once:true }
    );
  } else if (!setupWhenReady()) {
    const lateObserver =
      new MutationObserver(() => {
        if (!setupWhenReady()) return;

        lateObserver.disconnect();
      });

    lateObserver.observe(
      document.body,
      {
        childList:true,
        subtree:true
      }
    );
  }
})();
