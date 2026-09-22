(() => {
  'use strict';

  const STORAGE_KEY = 'jm_songs_view';
  const VIEW_LIST = 'list';
  const VIEW_DISCS = 'discs';

  let observer = null;

  function getView() {
    return localStorage.getItem(STORAGE_KEY) === VIEW_DISCS ? VIEW_DISCS : VIEW_LIST;
  }

  function setView(view) {
    localStorage.setItem(STORAGE_KEY, view === VIEW_DISCS ? VIEW_DISCS : VIEW_LIST);
    applyView();
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

      .repertoire-grid.repertoire-discs-view .repertoire-card:not(.is-disc-playing) .repertoire-cover:hover::before{
        opacity:1;
      }

      .repertoire-grid.repertoire-discs-view .repertoire-card.is-disc-playing .repertoire-cover{
        animation:jm-song-disc-spin 2.2s linear infinite;
        box-shadow:0 0 0 2px var(--gold),0 12px 30px rgba(0,0,0,.35);
      }

      .repertoire-grid.repertoire-discs-view .repertoire-card.is-disc-playing .repertoire-cover::before{
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

      @keyframes jm-song-disc-spin{
        from{transform:rotate(0deg)}
        to{transform:rotate(360deg)}
      }

      @media (prefers-reduced-motion:reduce){
        .repertoire-grid.repertoire-discs-view .repertoire-card.is-disc-playing .repertoire-cover{
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
      }
    `;
    document.head.appendChild(style);
  }

  function renameSection() {
    const navLabel = document.querySelector('.main-nav [data-route="repertoire"] span');
    if (navLabel) {
      delete navLabel.dataset.copy;
      navLabel.textContent = 'SONGS';
    }

    const page = document.getElementById('repertoirePage');
    if (!page) return;

    const title = page.querySelector('.page-hero h2');
    if (title) {
      delete title.dataset.copy;
      title.textContent = 'SONGS';
    }

    const ornament = page.querySelector('.page-hero-ornament');
    if (ornament) {
      delete ornament.dataset.copy;
      ornament.textContent = 'SONGS';
    }

    const heading = page.querySelector('.repertoire-heading h3');
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
      wrap.setAttribute('role', 'group');
      wrap.setAttribute('aria-label', 'Modalità di visualizzazione songs');
      wrap.innerHTML = `
        <button class="songs-view-button" type="button" data-songs-view="list" aria-pressed="false">LISTA</button>
        <button class="songs-view-button" type="button" data-songs-view="discs" aria-pressed="false">DISCHI</button>
      `;

      const jukebox = toolbar.querySelector('#openJukeboxMode');
      if (jukebox) toolbar.insertBefore(wrap, jukebox);
      else toolbar.appendChild(wrap);

      wrap.querySelectorAll('[data-songs-view]').forEach(button => {
        button.addEventListener('click', () => setView(button.dataset.songsView));
      });
    }
  }

  function syncPlayingState(card) {
    if (!card) return;

    const player = card.querySelector('.demo-site-player');
    const toggle = card.querySelector('[data-demo-toggle]');
    const playing = !!(
      player &&
      toggle &&
      /PAUSA/i.test(toggle.textContent || '')
    );

    card.classList.toggle('is-disc-playing', playing);
  }

  function triggerCoverPlay(card) {
    if (!card) return;

    const spotify = card.querySelector('.repertoire-stream-link');
    if (spotify) {
      spotify.click();
      return;
    }

    const toggle = card.querySelector('[data-demo-toggle]');
    if (toggle) {
      toggle.click();
      setTimeout(() => syncPlayingState(card), 0);
      return;
    }

    const demoButton = card.querySelector('.demo-player-button:not([disabled])');
    if (demoButton) {
      demoButton.click();
      return;
    }
  }

  function decorateCard(card) {
    if (!card || card.dataset.songsDiscBound === '1') {
      syncPlayingState(card);
      return;
    }

    card.dataset.songsDiscBound = '1';

    const cover = card.querySelector('.repertoire-cover');
    const title = card.querySelector('.repertoire-copy h3');

    if (cover) {
      cover.setAttribute('role', 'button');
      cover.tabIndex = 0;
      cover.setAttribute('aria-label', 'Riproduci o metti in pausa il brano');

      const activate = event => {
        if (getView() !== VIEW_DISCS) return;
        event.preventDefault();
        event.stopPropagation();
        triggerCoverPlay(card);
      };

      cover.addEventListener('click', activate);
      cover.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') activate(event);
      });
    }

    /*
      In modalità DISCHI:
      - cover = play/pausa;
      - titolo = dettaglio;
      - il resto della card non apre il dettaglio.
      Il listener in capture precede quello già presente in public.js.
    */
    card.addEventListener('click', event => {
      if (getView() !== VIEW_DISCS) return;

      if (event.target.closest('.repertoire-cover')) return;
      if (event.target.closest('.repertoire-copy h3')) return;
      if (event.target.closest('a,button,input,audio')) return;

      event.stopImmediatePropagation();
    }, true);

    if (title) {
      title.setAttribute('role', 'button');
      title.tabIndex = 0;
      title.setAttribute('aria-label', `Apri dettagli: ${title.textContent.trim()}`);

      title.addEventListener('keydown', event => {
        if (getView() !== VIEW_DISCS) return;
        if (event.key !== 'Enter' && event.key !== ' ') return;

        event.preventDefault();
        title.click();
      });
    }

    syncPlayingState(card);
  }

  function decorateCards() {
    document.querySelectorAll('#repertoireGrid .repertoire-card').forEach(decorateCard);
  }

  function applyView() {
    renameSection();
    ensureSwitch();

    const grid = document.getElementById('repertoireGrid');
    if (!grid) return;

    const view = getView();
    grid.classList.toggle('repertoire-discs-view', view === VIEW_DISCS);

    document.querySelectorAll('[data-songs-view]').forEach(button => {
      const active = button.dataset.songsView === view;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });

    decorateCards();
  }

  function observePlayerChanges() {
    const grid = document.getElementById('repertoireGrid');
    if (!grid) return;

    if (observer) observer.disconnect();

    observer = new MutationObserver(mutations => {
      const touched = new Set();

      mutations.forEach(mutation => {
        const target = mutation.target.nodeType === Node.ELEMENT_NODE
          ? mutation.target
          : mutation.target.parentElement;

        const card = target?.closest?.('.repertoire-card');
        if (card) touched.add(card);

        mutation.addedNodes.forEach(node => {
          if (node.nodeType !== Node.ELEMENT_NODE) return;
          const addedCard = node.matches?.('.repertoire-card')
            ? node
            : node.querySelector?.('.repertoire-card');
          if (addedCard) touched.add(addedCard);
        });
      });

      touched.forEach(card => {
        decorateCard(card);
        syncPlayingState(card);
      });
    });

    observer.observe(grid, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  function setup() {
    ensureStyles();
    renameSection();
    ensureSwitch();
    applyView();
    observePlayerChanges();
  }

  function setupWhenReady() {
    if (document.getElementById('repertoirePage')) {
      setup();
      return true;
    }
    return false;
  }

  window.addEventListener('jm:repertoire-rendered', () => {
    setup();
  });

  window.addEventListener('hashchange', () => {
    if (location.hash.startsWith('#/repertoire')) {
      setTimeout(setup, 0);
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      if (setupWhenReady()) return;

      const lateObserver = new MutationObserver(() => {
        if (!setupWhenReady()) return;
        lateObserver.disconnect();
      });

      lateObserver.observe(document.body, {
        childList: true,
        subtree: true
      });
    }, { once: true });
  } else if (!setupWhenReady()) {
    const lateObserver = new MutationObserver(() => {
      if (!setupWhenReady()) return;
      lateObserver.disconnect();
    });

    lateObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  }
})();
