(() => {
  'use strict';

  const STORAGE_KEY = 'jm_songs_view';
  const VIEW_LIST = 'list';
  const VIEW_DISCS = 'discs';

  const SUPABASE_URL = 'https://etzwybamvfpeitkttwrc.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_CtyexwjoW375UXpjInOuDA_Uz28wWJx';

  let sb = null;
  let songs = new Map();
  let songsByTitle = new Map();
  let songsLoading = null;
  let gridObserver = null;
  let playerSyncTimer = null;
  let currentDetailSongId = '';

  function esc(value) {
    return String(value ?? '').replace(/[&<>'"]/g, ch => ({
      '&':'&amp;',
      '<':'&lt;',
      '>':'&gt;',
      "'":'&#39;',
      '"':'&quot;'
    }[ch]));
  }

  function normalizeTitle(value) {
    return String(value || '')
      .trim()
      .replace(/\s+/g, ' ')
      .toLocaleLowerCase('it');
  }

  function formatDate(value) {
    if (!value) return '—';
    const [y,m,d] = String(value).slice(0,10).split('-');
    return [d,m,y].filter(Boolean).join('/');
  }

  function getView() {
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

  function client() {
    if (sb) return sb;
    if (!window.supabase?.createClient) return null;

    sb = window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_KEY,
      {
        auth:{
          persistSession:false,
          autoRefreshToken:false,
          detectSessionInUrl:false
        }
      }
    );

    return sb;
  }

  function coverUrl(song) {
    const c = client();
    if (!c || !song?.cover_path) return '';

    try {
      return c.storage
        .from('concert-posters')
        .getPublicUrl(song.cover_path)
        .data
        .publicUrl || '';
    } catch {
      return '';
    }
  }

  async function loadSongs(force = false) {
    if (songsLoading && !force) return songsLoading;

    songsLoading = (async () => {
      const c = client();
      if (!c) return;

      const { data, error } = await c.rpc('get_public_repertoire');
      if (error) throw error;

      songs = new Map();
      songsByTitle = new Map();

      (data || []).forEach(song => {
        const id = String(song.id);
        songs.set(id, song);
        songsByTitle.set(normalizeTitle(song.title), song);
      });

      decorateAll();
      decorateHitRows();
      refreshOpenDetail();
    })()
      .catch(error => {
        console.warn('Schede SONGS non disponibili', error);
      })
      .finally(() => {
        songsLoading = null;
      });

    return songsLoading;
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

      .song-play-count{
        display:block;
        margin-top:5px;
        color:var(--gold);
        font:900 9px/1.15 monospace;
        letter-spacing:.045em;
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
        box-shadow:0 0 0 2px var(--gold),0 12px 30px rgba(0,0,0,.35);
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
        display:none!important;
      }

      .repertoire-grid.repertoire-discs-view .song-play-count{
        margin-top:6px;
        text-align:center;
      }

      @keyframes jm-song-disc-spin{
        from{transform:rotate(0deg)}
        to{transform:rotate(360deg)}
      }

      /* ---------- DETTAGLIO CANZONE / CUSTODIA CD ---------- */

      #songCdModal[hidden]{
        display:none!important;
      }

      #songCdModal{
        position:fixed;
        inset:0;
        z-index:100500;
        display:grid;
        place-items:center;
        padding:18px;
      }

      .song-cd-backdrop{
        position:absolute;
        inset:0;
        border:0;
        background:rgba(0,0,0,.82);
        backdrop-filter:blur(10px);
        cursor:pointer;
      }

      .song-cd-modal-card{
        --song-bg:none;
        position:relative;
        z-index:1;
        width:min(1040px,calc(100vw - 28px));
        max-height:calc(100vh - 28px);
        overflow:auto;
        isolation:isolate;
        border:1px solid rgba(255,255,255,.18);
        background:#111;
        box-shadow:0 24px 90px rgba(0,0,0,.72);
        color:#fff;
      }

      .song-cd-modal-card::before{
        content:"";
        position:absolute;
        inset:0;
        z-index:-2;
        background-image:var(--song-bg);
        background-size:cover;
        background-position:center;
        filter:blur(24px) saturate(.75);
        transform:scale(1.12);
        opacity:.34;
      }

      .song-cd-modal-card::after{
        content:"";
        position:absolute;
        inset:0;
        z-index:-1;
        background:
          linear-gradient(120deg,rgba(7,7,7,.9),rgba(17,17,17,.68)),
          radial-gradient(circle at 70% 30%,rgba(255,255,255,.06),transparent 42%);
        pointer-events:none;
      }

      .song-cd-close{
        position:sticky;
        z-index:20;
        top:10px;
        float:right;
        margin:10px 10px -44px 0;
        width:36px;
        height:36px;
        border:1px solid rgba(255,255,255,.28);
        border-radius:50%;
        background:rgba(0,0,0,.68);
        color:#fff;
        font:900 21px/1 Arial,sans-serif;
        cursor:pointer;
      }

      .song-cd-shell{
        min-height:620px;
        padding:38px;
        perspective:1800px;
      }

      .song-cd-case{
        position:relative;
        width:100%;
        min-height:540px;
        transform-style:preserve-3d;
      }

      .song-cd-interior{
        position:relative;
        display:grid;
        grid-template-columns:minmax(0,1fr) minmax(0,1fr);
        min-height:540px;
        border:1px solid rgba(255,255,255,.22);
        background:
          linear-gradient(90deg,rgba(14,14,14,.92) 0 49.8%,rgba(62,62,62,.45) 50%,rgba(13,13,13,.9) 50.2%);
        box-shadow:
          inset 0 0 0 7px rgba(255,255,255,.035),
          0 18px 50px rgba(0,0,0,.48);
      }

      .song-cd-front{
        position:absolute;
        z-index:8;
        inset:0 50% 0 0;
        transform-origin:right center;
        transform:rotateY(0deg);
        transform-style:preserve-3d;
        transition:transform .78s cubic-bezier(.22,.7,.18,1);
        box-shadow:10px 0 28px rgba(0,0,0,.45);
        pointer-events:none;
      }

      #songCdModal.is-open .song-cd-front{
        transform:rotateY(176deg);
      }

      .song-cd-front-face,
      .song-cd-front-back{
        position:absolute;
        inset:0;
        backface-visibility:hidden;
        overflow:hidden;
        border:1px solid rgba(255,255,255,.16);
        background:#151515;
      }

      .song-cd-front-face img{
        width:100%;
        height:100%;
        object-fit:cover;
        display:block;
      }

      .song-cd-front-back{
        transform:rotateY(180deg);
        background:
          linear-gradient(135deg,rgba(255,255,255,.08),rgba(255,255,255,.01)),
          #111;
      }

      .song-cd-booklet{
        position:relative;
        min-width:0;
        padding:28px;
        overflow:hidden;
      }

      .song-cd-booklet-page{
        min-height:480px;
        display:flex;
        flex-direction:column;
        gap:18px;
        transform-origin:left center;
        transition:
          transform .42s ease,
          opacity .28s ease;
      }

      .song-cd-booklet-page[hidden]{
        display:none!important;
      }

      .song-cd-kicker{
        color:var(--gold);
        font:900 10px/1 monospace;
        letter-spacing:.12em;
      }

      .song-cd-title{
        margin:0;
        max-width:92%;
        font:900 clamp(27px,4vw,52px)/.92 Impact,Arial Black,sans-serif;
        letter-spacing:.01em;
        text-transform:uppercase;
      }

      .song-cd-source{
        display:grid;
        gap:8px;
        padding:12px 0;
        border-top:1px solid rgba(255,255,255,.18);
        border-bottom:1px solid rgba(255,255,255,.18);
      }

      .song-cd-source-row{
        display:grid;
        grid-template-columns:62px minmax(0,1fr);
        gap:10px;
        align-items:start;
      }

      .song-cd-source-row span{
        color:var(--muted);
        font:900 9px/1.25 monospace;
        text-transform:uppercase;
      }

      .song-cd-source-row strong{
        font:800 12px/1.3 Arial,sans-serif;
      }

      .song-cd-stats{
        display:grid;
        grid-template-columns:repeat(2,minmax(0,1fr));
        gap:8px;
      }

      .song-cd-stat{
        display:grid;
        gap:3px;
        min-width:0;
        padding:10px;
        border:1px solid rgba(255,255,255,.14);
        background:rgba(0,0,0,.32);
      }

      .song-cd-stat span{
        color:var(--muted);
        font:800 8px/1.15 monospace;
        letter-spacing:.04em;
        text-transform:uppercase;
      }

      .song-cd-stat strong{
        overflow:hidden;
        text-overflow:ellipsis;
        font:900 16px/1 Arial,sans-serif;
      }

      .song-cd-page-actions{
        display:flex;
        align-items:center;
        gap:8px;
        flex-wrap:wrap;
        margin-top:auto;
        padding-top:4px;
      }

      .song-cd-page-button{
        min-height:36px;
        padding:8px 12px;
        border:1px solid #817b6d;
        background:rgba(0,0,0,.52);
        color:#fff;
        font:900 10px/1 monospace;
        cursor:pointer;
      }

      .song-cd-page-button:hover,
      .song-cd-page-button.primary{
        border-color:var(--gold);
        background:var(--gold);
        color:#111;
      }

      .song-cd-lyrics{
        white-space:pre-wrap;
        overflow:auto;
        max-height:365px;
        padding:14px;
        border:1px solid rgba(255,255,255,.15);
        background:rgba(0,0,0,.4);
        font:700 14px/1.55 Arial,sans-serif;
      }

      .song-cd-lyrics-empty{
        display:grid;
        place-items:center;
        min-height:260px;
        padding:28px;
        text-align:center;
        border:1px dashed rgba(255,255,255,.2);
        color:var(--muted);
        font:800 12px/1.45 Arial,sans-serif;
      }

      .song-cd-disc-panel{
        position:relative;
        display:grid;
        align-content:center;
        justify-items:center;
        gap:22px;
        min-width:0;
        padding:30px;
        overflow:hidden;
      }

      .song-cd-disc-wrap{
        position:relative;
        width:min(92%,390px);
        aspect-ratio:1;
        display:grid;
        place-items:center;
      }

      .song-cd-disc{
        position:relative;
        width:100%;
        aspect-ratio:1;
        padding:0;
        border:1px solid rgba(255,255,255,.35);
        border-radius:50%;
        overflow:hidden;
        background:
          radial-gradient(circle at center,#111 0 9%,transparent 9.4%),
          conic-gradient(
            from 20deg,
            rgba(255,255,255,.45),
            rgba(255,255,255,.04),
            rgba(231,198,108,.22),
            rgba(255,255,255,.05),
            rgba(255,255,255,.45)
          );
        box-shadow:
          0 20px 42px rgba(0,0,0,.55),
          inset 0 0 28px rgba(255,255,255,.08);
        cursor:pointer;
      }

      .song-cd-disc img{
        position:absolute;
        inset:0;
        width:100%;
        height:100%;
        object-fit:cover;
        border-radius:50%;
        display:block;
        user-select:none;
        -webkit-user-drag:none;
      }

      .song-cd-disc::before{
        content:"";
        position:absolute;
        z-index:3;
        left:50%;
        top:50%;
        width:17%;
        aspect-ratio:1;
        transform:translate(-50%,-50%);
        border-radius:50%;
        background:#0d0d0d;
        border:4px solid rgba(220,220,220,.72);
        box-shadow:0 0 0 5px rgba(0,0,0,.22);
      }

      .song-cd-disc::after{
        content:"▶";
        position:absolute;
        z-index:4;
        left:50%;
        top:50%;
        transform:translate(-50%,-50%);
        color:#fff;
        font:900 16px/1 Arial,sans-serif;
        margin-left:2px;
        pointer-events:none;
      }

      .song-cd-disc.is-current::after{
        content:"❚❚";
        margin-left:0;
        letter-spacing:-2px;
        font-size:13px;
      }

      .song-cd-disc.is-spinning{
        animation:jm-song-disc-spin 2.2s linear infinite;
        box-shadow:
          0 0 0 3px var(--gold),
          0 20px 48px rgba(0,0,0,.58);
      }

      .song-cd-player{
        width:min(100%,420px);
        display:grid;
        gap:10px;
      }

      .song-cd-player-controls{
        display:flex;
        align-items:center;
        justify-content:center;
        gap:9px;
      }

      .song-cd-player-button{
        min-width:44px;
        height:40px;
        border:1px solid rgba(255,255,255,.28);
        background:rgba(0,0,0,.55);
        color:#fff;
        cursor:pointer;
        font:900 13px/1 Arial,sans-serif;
      }

      .song-cd-player-button.main{
        min-width:54px;
        border-color:var(--gold);
        background:var(--gold);
        color:#111;
        border-radius:24px;
      }

      .song-cd-player-button:disabled{
        opacity:.35;
        cursor:default;
      }

      .song-cd-progress{
        display:grid;
        grid-template-columns:42px minmax(0,1fr) 42px;
        align-items:center;
        gap:8px;
        color:#ddd;
        font:800 9px/1 monospace;
      }

      .song-cd-progress input{
        width:100%;
        accent-color:var(--gold);
      }

      .song-cd-player-mode{
        min-height:14px;
        color:var(--muted);
        text-align:center;
        font:800 9px/1.2 monospace;
      }

      .song-cd-rank-badge{
        position:absolute;
        right:22px;
        top:22px;
        z-index:2;
        display:grid;
        place-items:center;
        min-width:62px;
        min-height:62px;
        padding:8px;
        border:1px solid var(--gold);
        border-radius:50%;
        background:rgba(0,0,0,.72);
        text-align:center;
      }

      .song-cd-rank-badge strong{
        display:block;
        color:var(--gold);
        font:900 22px/1 Arial,sans-serif;
      }

      .song-cd-rank-badge span{
        display:block;
        margin-top:2px;
        color:#fff;
        font:900 7px/1 monospace;
        letter-spacing:.06em;
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

        #songCdModal{
          padding:8px;
          align-items:end;
        }

        .song-cd-modal-card{
          width:100%;
          max-height:calc(100dvh - 10px);
          border-radius:14px 14px 0 0;
        }

        .song-cd-shell{
          min-height:auto;
          padding:22px 12px 14px;
        }

        .song-cd-case{
          min-height:auto;
        }

        .song-cd-front{
          display:none;
        }

        .song-cd-interior{
          display:flex;
          flex-direction:column-reverse;
          min-height:auto;
          background:rgba(12,12,12,.88);
        }

        .song-cd-booklet{
          padding:18px;
        }

        .song-cd-booklet-page{
          min-height:auto;
        }

        .song-cd-disc-panel{
          padding:26px 18px 18px;
        }

        .song-cd-disc-wrap{
          width:min(72vw,300px);
        }

        .song-cd-title{
          max-width:82%;
          font-size:34px;
        }

        .song-cd-stats{
          grid-template-columns:repeat(2,minmax(0,1fr));
        }

        .song-cd-rank-badge{
          right:16px;
          top:14px;
          min-width:54px;
          min-height:54px;
        }
      }

      @media(prefers-reduced-motion:reduce){
        .song-cd-front,
        .song-cd-booklet-page{
          transition:none;
        }

        .song-cd-disc.is-spinning,
        .repertoire-grid.repertoire-discs-view
        .repertoire-card.is-disc-playing
        .repertoire-cover{
          animation:none;
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

  function ensureSwitch() {
    const toolbar = document.querySelector('.repertoire-toolbar');
    if (!toolbar) return;

    let wrap = document.getElementById('songsViewSwitch');

    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'songsViewSwitch';
      wrap.className = 'songs-view-switch';
      wrap.setAttribute('role','group');
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

      if (jukebox) toolbar.insertBefore(wrap,jukebox);
      else toolbar.appendChild(wrap);

      wrap.querySelectorAll('[data-songs-view]').forEach(button => {
        button.addEventListener('click', () => {
          setView(button.dataset.songsView);
        });
      });
    }
  }

  function renderPlayCount(card) {
    const id = String(card?.dataset?.repertoireSong || '');
    const song = songs.get(id);
    const title = card?.querySelector('.repertoire-copy h3');

    if (!title) return;

    let count = card.querySelector('.song-play-count');

    if (!count) {
      count = document.createElement('span');
      count.className = 'song-play-count';
      title.insertAdjacentElement('afterend',count);
    }

    count.textContent =
      `▶ ${Number(song?.weighted_play_count || 0)} RIPRODUZIONI`;
  }

  function syncCardPlayingState(card) {
    if (!card) return;

    const toggle = card.querySelector('[data-demo-toggle]');

    const playing = !!(
      toggle &&
      /PAUSA/i.test(toggle.textContent || '')
    );

    card.classList.toggle('is-disc-playing',playing);
  }

  async function playFromRepertoireCard(songId) {
    const id = CSS.escape(String(songId));

    let card = document.querySelector(
      `#repertoireGrid [data-repertoire-song="${id}"]`
    );

    if (!card) {
      window.dispatchEvent(
        new CustomEvent('jm:repertoire-rendered')
      );
      await new Promise(resolve => setTimeout(resolve,120));

      card = document.querySelector(
        `#repertoireGrid [data-repertoire-song="${id}"]`
      );
    }

    if (!card) return false;

    const toggle = card.querySelector('[data-demo-toggle]');

    if (toggle) {
      toggle.click();
      return true;
    }

    let button = card.querySelector(
      '.demo-player-button:not([disabled])'
    );

    if (!button) {
      window.dispatchEvent(
        new CustomEvent('jm:repertoire-rendered')
      );

      await new Promise(resolve => setTimeout(resolve,220));

      button = card.querySelector(
        '.demo-player-button:not([disabled])'
      );
    }

    if (button) {
      button.click();
      return true;
    }

    const spotify = card.querySelector('.repertoire-stream-link');

    if (spotify) {
      spotify.click();
      return true;
    }

    return false;
  }

  function decorateCard(card) {
    if (!card) return;

    renderPlayCount(card);
    syncCardPlayingState(card);

    if (card.dataset.songsDiscBound === '1') return;
    card.dataset.songsDiscBound = '1';

    const cover = card.querySelector('.repertoire-cover');
    const title = card.querySelector('.repertoire-copy h3');

    if (cover) {
      cover.setAttribute('role','button');
      cover.tabIndex = 0;

      const run = async event => {
        if (getView() !== VIEW_DISCS) return;

        event.preventDefault();
        event.stopPropagation();

        await playFromRepertoireCard(
          card.dataset.repertoireSong
        );
      };

      cover.addEventListener('click',run);

      cover.addEventListener('keydown',event => {
        if (event.key === 'Enter' || event.key === ' ') {
          run(event);
        }
      });
    }

    if (title) {
      title.setAttribute('role','button');
      title.tabIndex = 0;
    }
  }

  function decorateAll() {
    document
      .querySelectorAll('#repertoireGrid .repertoire-card')
      .forEach(decorateCard);
  }

  function decorateHitRows() {
    document
      .querySelectorAll('#songsRanking [data-ranking-song-index]')
      .forEach(row => {
        const title = row
          .querySelector('.ranking-title')
          ?.textContent
          ?.trim() || row.getAttribute('title') || '';

        const song = songsByTitle.get(normalizeTitle(title));

        if (song) {
          row.dataset.songDetailId = String(song.id);
        }
      });
  }

  function applyView() {
    renameSection();
    ensureSwitch();

    const grid = document.getElementById('repertoireGrid');
    if (!grid) return;

    const view = getView();

    grid.classList.toggle(
      'repertoire-discs-view',
      view === VIEW_DISCS
    );

    document
      .querySelectorAll('[data-songs-view]')
      .forEach(button => {
        const active =
          button.dataset.songsView === view;

        button.classList.toggle('active',active);
        button.setAttribute(
          'aria-pressed',
          active ? 'true' : 'false'
        );
      });

    decorateAll();
  }

  function ensureSongModal() {
    let modal = document.getElementById('songCdModal');

    if (modal) return modal;

    modal = document.createElement('section');
    modal.id = 'songCdModal';
    modal.hidden = true;
    modal.setAttribute('aria-modal','true');
    modal.setAttribute('role','dialog');

    modal.innerHTML = `
      <button
        type="button"
        class="song-cd-backdrop"
        data-song-cd-close
        aria-label="Chiudi"
      ></button>

      <article class="song-cd-modal-card">
        <button
          type="button"
          class="song-cd-close"
          data-song-cd-close
          aria-label="Chiudi"
        >×</button>

        <div class="song-cd-shell">
          <div class="song-cd-case">
            <div class="song-cd-interior">
              <section class="song-cd-booklet">
                <div
                  class="song-cd-booklet-page"
                  data-song-cd-page="info"
                ></div>

                <div
                  class="song-cd-booklet-page"
                  data-song-cd-page="lyrics"
                  hidden
                ></div>
              </section>

              <section class="song-cd-disc-panel">
                <div class="song-cd-rank-badge">
                  <strong data-song-cd-rank>—</strong>
                  <span>HITS</span>
                </div>

                <div class="song-cd-disc-wrap">
                  <button
                    type="button"
                    class="song-cd-disc"
                    data-song-cd-disc
                    aria-label="Play / pausa"
                  ></button>
                </div>

                <div class="song-cd-player">
                  <div class="song-cd-player-controls">
                    <button
                      type="button"
                      class="song-cd-player-button main"
                      data-song-cd-toggle
                      aria-label="Play / pausa"
                    >▶</button>

                    <button
                      type="button"
                      class="song-cd-player-button"
                      data-song-cd-stop
                      aria-label="Stop"
                    >■</button>
                  </div>

                  <div class="song-cd-progress">
                    <span data-song-cd-current>0:00</span>
                    <input
                      type="range"
                      min="0"
                      max="1000"
                      step="1"
                      value="0"
                      data-song-cd-seek
                      aria-label="Avanzamento brano"
                    >
                    <span data-song-cd-duration>--:--</span>
                  </div>

                  <div
                    class="song-cd-player-mode"
                    data-song-cd-mode
                  ></div>
                </div>
              </section>
            </div>

            <div class="song-cd-front" aria-hidden="true">
              <div class="song-cd-front-face"></div>
              <div class="song-cd-front-back"></div>
            </div>
          </div>
        </div>
      </article>
    `;

    document.body.appendChild(modal);

    modal.querySelectorAll('[data-song-cd-close]').forEach(button => {
      button.addEventListener('click',closeSongDetail);
    });

    modal
      .querySelector('[data-song-cd-disc]')
      .addEventListener('click',toggleDetailPlayback);

    modal
      .querySelector('[data-song-cd-toggle]')
      .addEventListener('click',toggleDetailPlayback);

    modal
      .querySelector('[data-song-cd-stop]')
      .addEventListener('click',() => {
        const global = document.getElementById('jmGlobalAudioPlayer');

        if (isGlobalPlayerOnCurrentSong(global)) {
          global
            ?.querySelector('[data-global-stop]')
            ?.click();
        }
      });

    modal
      .querySelector('[data-song-cd-seek]')
      .addEventListener('input',event => {
        const global = document.getElementById('jmGlobalAudioPlayer');

        if (!isGlobalPlayerOnCurrentSong(global)) return;

        const seek = global.querySelector('[data-global-seek]');
        if (!seek) return;

        seek.value = event.target.value;
        seek.dispatchEvent(
          new Event('input',{bubbles:true})
        );
      });

    return modal;
  }

  function sourceRow(label,title,artist,isMolesti = false) {
    let text = '';

    if (isMolesti) {
      text = 'Originale JOHN & I MOLESTI';
    } else {
      text = [title,artist].filter(Boolean).join(' — ');
    }

    if (!text) text = '—';

    return `
      <div class="song-cd-source-row">
        <span>${esc(label)}</span>
        <strong>${esc(text)}</strong>
      </div>
    `;
  }

  function isMolestiArtist(value) {
    const normalized = normalizeTitle(value)
      .replaceAll('&','e');

    return (
      normalized.includes('john e i molesti') ||
      normalized === 'molesti'
    );
  }

  function stat(label,value) {
    return `
      <div class="song-cd-stat">
        <span>${esc(label)}</span>
        <strong>${esc(value)}</strong>
      </div>
    `;
  }

  function renderInfoPage(song) {
    const molestiLyrics =
      isMolestiArtist(song.lyrics_artist);

    const fanVote =
      song.fan_avg_score == null
        ? '—'
        : `${Number(song.fan_avg_score).toFixed(2)}/10`;

    return `
      <span class="song-cd-kicker">
        JOHN & I MOLESTI
      </span>

      <h2 class="song-cd-title">
        ${esc(song.title || 'BRANO')}
      </h2>

      <div class="song-cd-source">
        ${sourceRow(
          'BASE',
          song.base_title,
          song.base_artist,
          !!song.base_is_original
        )}

        ${sourceRow(
          'TESTO',
          song.lyrics_title,
          song.lyrics_artist,
          molestiLyrics || (
            !!song.base_is_original &&
            !song.lyrics_title &&
            !song.lyrics_artist
          )
        )}
      </div>

      <div class="song-cd-stats">
        ${stat(
          'RILASCIO MOLESTI',
          song.molesti_year || '—'
        )}

        ${stat(
          'POSIZIONE HITS',
          song.ranking_position
            ? `#${song.ranking_position}`
            : '—'
        )}

        ${stat(
          'RIPRODUZIONI',
          Number(song.weighted_play_count || 0)
        )}

        ${stat(
          'ESECUZIONI IN SCALETTA',
          Number(song.setlist_execution_count || 0)
        )}

        ${stat(
          'PRIMA VOLTA LIVE',
          formatDate(song.first_live_date)
        )}

        ${stat(
          'VOTO MEDIO FAN',
          song.fan_vote_count
            ? `${fanVote} · ${Number(song.fan_vote_count)} voti`
            : '—'
        )}
      </div>

      <div class="song-cd-page-actions">
        <button
          type="button"
          class="song-cd-page-button primary"
          data-song-cd-show-lyrics
        >TESTO →</button>
      </div>
    `;
  }

  function renderLyricsPage(song) {
    const lyrics = String(song.lyrics_text || '').trim();

    return `
      <span class="song-cd-kicker">
        LYRICS
      </span>

      <h2 class="song-cd-title">
        ${esc(song.title || 'BRANO')}
      </h2>

      ${
        lyrics
          ? `<div class="song-cd-lyrics">${esc(lyrics)}</div>`
          : `
            <div class="song-cd-lyrics-empty">
              Testo non ancora disponibile.
            </div>
          `
      }

      <div class="song-cd-page-actions">
        <button
          type="button"
          class="song-cd-page-button"
          data-song-cd-show-info
        >← INFO</button>
      </div>
    `;
  }

  function setBookletPage(page) {
    const modal = document.getElementById('songCdModal');
    if (!modal) return;

    modal
      .querySelector('[data-song-cd-page="info"]')
      .hidden = page !== 'info';

    modal
      .querySelector('[data-song-cd-page="lyrics"]')
      .hidden = page !== 'lyrics';
  }

  function bindBookletButtons(modal) {
    modal
      .querySelector('[data-song-cd-show-lyrics]')
      ?.addEventListener('click',() => {
        setBookletPage('lyrics');
      });

    modal
      .querySelector('[data-song-cd-show-info]')
      ?.addEventListener('click',() => {
        setBookletPage('info');
      });
  }

  async function openSongDetail(songId) {
    if (!songs.size) await loadSongs();

    const song = songs.get(String(songId));
    if (!song) return;

    currentDetailSongId = String(song.id);

    const modal = ensureSongModal();
    const card = modal.querySelector('.song-cd-modal-card');
    const cover = coverUrl(song);

    card.style.setProperty(
      '--song-bg',
      cover ? `url(${JSON.stringify(cover)})` : 'none'
    );

    modal.classList.remove('is-open');
    modal.hidden = false;

    const front = modal.querySelector('.song-cd-front-face');
    front.innerHTML = cover
      ? `<img src="${esc(cover)}" alt="Cover di ${esc(song.title)}">`
      : '<div class="song-cd-lyrics-empty">JOHN & I MOLESTI</div>';

    const disc = modal.querySelector('[data-song-cd-disc]');
    disc.innerHTML = cover
      ? `<img src="${esc(cover)}" alt="" draggable="false">`
      : '';

    modal.querySelector('[data-song-cd-rank]').textContent =
      song.ranking_position
        ? `#${song.ranking_position}`
        : '—';

    modal.querySelector(
      '[data-song-cd-page="info"]'
    ).innerHTML = renderInfoPage(song);

    modal.querySelector(
      '[data-song-cd-page="lyrics"]'
    ).innerHTML = renderLyricsPage(song);

    setBookletPage('info');
    bindBookletButtons(modal);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        modal.classList.add('is-open');
      });
    });

    clearInterval(playerSyncTimer);
    playerSyncTimer = setInterval(syncDetailPlayer,220);

    syncDetailPlayer();
  }

  function closeSongDetail() {
    const modal = document.getElementById('songCdModal');
    if (!modal) return;

    modal.classList.remove('is-open');

    clearInterval(playerSyncTimer);
    playerSyncTimer = null;

    setTimeout(() => {
      modal.hidden = true;
    },260);
  }

  function globalPlayerTitle(global) {
    return global
      ?.querySelector('[data-global-title]')
      ?.textContent
      ?.trim() || '';
  }

  function isGlobalPlayerOnCurrentSong(global) {
    if (
      !global ||
      global.hidden ||
      !currentDetailSongId
    ) {
      return false;
    }

    const song = songs.get(currentDetailSongId);
    if (!song) return false;

    return (
      normalizeTitle(globalPlayerTitle(global)) ===
      normalizeTitle(song.title)
    );
  }

  async function toggleDetailPlayback() {
    const modal = document.getElementById('songCdModal');
    const global = document.getElementById('jmGlobalAudioPlayer');

    if (!modal || !currentDetailSongId) return;

    if (isGlobalPlayerOnCurrentSong(global)) {
      global
        .querySelector('[data-global-toggle]')
        ?.click();

      return;
    }

    const song = songs.get(currentDetailSongId);

    if (!song?.has_demo && song?.spotify_url) {
      window.open(
        song.spotify_url,
        '_blank',
        'noopener,noreferrer'
      );
      return;
    }

    await playFromRepertoireCard(currentDetailSongId);

    setTimeout(syncDetailPlayer,80);
  }

  function syncDetailPlayer() {
    const modal = document.getElementById('songCdModal');
    if (!modal || modal.hidden) return;

    const global = document.getElementById('jmGlobalAudioPlayer');
    const current = isGlobalPlayerOnCurrentSong(global);

    const globalToggle =
      global?.querySelector('[data-global-toggle]');

    const playing = !!(
      current &&
      /❚❚/.test(globalToggle?.textContent || '')
    );

    const disc = modal.querySelector('[data-song-cd-disc]');
    const toggle = modal.querySelector('[data-song-cd-toggle]');
    const stop = modal.querySelector('[data-song-cd-stop]');
    const seek = modal.querySelector('[data-song-cd-seek]');

    disc.classList.toggle('is-current',current);
    disc.classList.toggle('is-spinning',playing);

    toggle.textContent = playing ? '❚❚' : '▶';
    stop.disabled = !current;

    if (current) {
      const globalSeek =
        global.querySelector('[data-global-seek]');

      const currentTime =
        global.querySelector('[data-global-current]')
          ?.textContent || '0:00';

      const duration =
        global.querySelector('[data-global-duration]')
          ?.textContent || '--:--';

      const mode =
        global.querySelector('[data-global-mode]')
          ?.textContent || '';

      seek.disabled = false;
      seek.value = globalSeek?.value || '0';

      modal.querySelector(
        '[data-song-cd-current]'
      ).textContent = currentTime;

      modal.querySelector(
        '[data-song-cd-duration]'
      ).textContent = duration;

      modal.querySelector(
        '[data-song-cd-mode]'
      ).textContent = mode;
    } else {
      const song = songs.get(currentDetailSongId);

      seek.disabled = true;
      seek.value = '0';

      modal.querySelector(
        '[data-song-cd-current]'
      ).textContent = '0:00';

      modal.querySelector(
        '[data-song-cd-duration]'
      ).textContent = '--:--';

      modal.querySelector(
        '[data-song-cd-mode]'
      ).textContent =
        song?.has_demo
          ? 'CLICCA IL DISCO PER ASCOLTARE'
          : song?.spotify_url
            ? 'ASCOLTO DISPONIBILE SU SPOTIFY'
            : 'AUDIO NON DISPONIBILE';
    }

    document
      .querySelectorAll('#repertoireGrid .repertoire-card')
      .forEach(syncCardPlayingState);
  }

  function refreshOpenDetail() {
    const modal = document.getElementById('songCdModal');

    if (
      !modal ||
      modal.hidden ||
      !currentDetailSongId
    ) {
      return;
    }

    const song = songs.get(currentDetailSongId);
    if (!song) return;

    modal.querySelector(
      '[data-song-cd-page="info"]'
    ).innerHTML = renderInfoPage(song);

    modal.querySelector(
      '[data-song-cd-page="lyrics"]'
    ).innerHTML = renderLyricsPage(song);

    modal.querySelector('[data-song-cd-rank]').textContent =
      song.ranking_position
        ? `#${song.ranking_position}`
        : '—';

    bindBookletButtons(modal);
  }

  function resolveHitSong(row) {
    const directId = row?.dataset?.songDetailId;

    if (directId && songs.has(String(directId))) {
      return songs.get(String(directId));
    }

    const title = row
      ?.querySelector('.ranking-title')
      ?.textContent
      ?.trim() || row?.getAttribute('title') || '';

    return songsByTitle.get(normalizeTitle(title)) || null;
  }

  function installUnifiedOpenHandler() {
    if (window.__jmUnifiedSongDetailHandler) return;
    window.__jmUnifiedSongDetailHandler = true;

    document.addEventListener(
      'click',
      event => {
        const repertoireCard = event.target.closest(
          '#repertoireGrid [data-repertoire-song]'
        );

        if (repertoireCard) {
          if (
            event.target.closest(
              'audio,a,.repertoire-player button,input'
            )
          ) {
            return;
          }

          /*
            In modalità DISCHI la cover resta il comando play.
            Titolo e resto della card aprono invece la custodia.
          */
          if (
            getView() === VIEW_DISCS &&
            event.target.closest('.repertoire-cover')
          ) {
            return;
          }

          event.preventDefault();
          event.stopImmediatePropagation();

          openSongDetail(
            repertoireCard.dataset.repertoireSong
          );

          return;
        }

        const hitRow = event.target.closest(
          '#songsRanking [data-ranking-song-index]'
        );

        if (hitRow) {
          const song = resolveHitSong(hitRow);

          if (!song) return;

          event.preventDefault();
          event.stopImmediatePropagation();

          openSongDetail(song.id);
        }
      },
      true
    );

    document.addEventListener(
      'keydown',
      event => {
        if (
          event.key !== 'Enter' &&
          event.key !== ' '
        ) {
          return;
        }

        const hitRow = event.target.closest(
          '#songsRanking [data-ranking-song-index]'
        );

        if (hitRow) {
          const song = resolveHitSong(hitRow);
          if (!song) return;

          event.preventDefault();
          event.stopImmediatePropagation();

          openSongDetail(song.id);
          return;
        }

        const title = event.target.closest(
          '#repertoireGrid .repertoire-copy h3'
        );

        if (title) {
          const card = title.closest(
            '[data-repertoire-song]'
          );

          if (!card) return;

          event.preventDefault();
          event.stopImmediatePropagation();

          openSongDetail(
            card.dataset.repertoireSong
          );
        }
      },
      true
    );

    document.addEventListener(
      'keydown',
      event => {
        if (
          event.key === 'Escape' &&
          !document.getElementById('songCdModal')?.hidden
        ) {
          closeSongDetail();
        }
      }
    );
  }

  function observeDynamicContent() {
    if (gridObserver) gridObserver.disconnect();

    gridObserver = new MutationObserver(() => {
      decorateAll();
      decorateHitRows();
    });

    gridObserver.observe(
      document.body,
      {
        childList:true,
        subtree:true
      }
    );
  }

  function setup() {
    ensureStyles();
    renameSection();
    ensureSwitch();
    applyView();
    installUnifiedOpenHandler();
    observeDynamicContent();
    loadSongs();
  }

  window.addEventListener(
    'jm:repertoire-rendered',
    () => {
      applyView();
      decorateAll();
      loadSongs();
    }
  );

  window.addEventListener(
    'jm:song-play-counted',
    () => {
      loadSongs(true);
    }
  );

  window.addEventListener(
    'hashchange',
    () => {
      setTimeout(() => {
        applyView();
        decorateHitRows();
      },0);
    }
  );

  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      setup,
      {once:true}
    );
  } else {
    setup();
  }
})();
