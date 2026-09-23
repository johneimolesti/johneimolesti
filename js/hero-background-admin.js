(() => {
  'use strict';

  const SUPABASE_URL = 'https://etzwybamvfpeitkttwrc.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_CtyexwjoW375UXpjInOuDA_Uz28wWJx';
  const BUCKET = 'public-site';
  const CACHE_KEY = 'jm_hero_backgrounds_v1';
  const PUBLIC_CACHE_KEY = 'jm_public_cache_v3';
  const MAX_FILE_BYTES = 15 * 1024 * 1024;

  const SLIDES = [
    {
      key: 'live',
      title: 'NEXT LIVE',
      description: 'Sfondo della slide del prossimo live.'
    },
    {
      key: 'songs',
      title: 'POPULAR SONGS',
      description: 'Sfondo della slide con le canzoni più popolari.'
    },
    {
      key: 'fans',
      title: 'TOP FAN',
      description: 'Sfondo della slide community / classifica fan.'
    },
    {
      key: 'media',
      title: 'MEDIA',
      description: 'Sfondo della slide che porta alla galleria media.'
    }
  ];

  let settings = {};
  let drafts = new Map();
  let loaded = false;
  let loading = false;

  const q = (selector, root = document) => root.querySelector(selector);
  const qa = (selector, root = document) =>
    [...root.querySelectorAll(selector)];

  function clamp(value, min, max, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
  }

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[ch]));
  }

  function canManage() {
    try {
      return typeof isEma === 'function' ? !!isEma() : false;
    } catch {
      return false;
    }
  }

  function getClient() {
    try {
      if (typeof sb !== 'undefined' && sb) return sb;
    } catch {}

    if (window.supabase?.createClient) {
      return window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_KEY
      );
    }

    throw new Error('Client Supabase non disponibile.');
  }

  function normalizeConfig(value) {
    let source = value;

    if (typeof source === 'string') {
      try {
        source = JSON.parse(source);
      } catch {
        source = {};
      }
    }

    if (!source || typeof source !== 'object' || Array.isArray(source)) {
      source = {};
    }

    const next = {};

    for (const slide of SLIDES) {
      const row = source[slide.key];
      if (!row || typeof row !== 'object' || Array.isArray(row)) continue;

      const imagePath = String(row.image_path || '').trim();
      if (!imagePath) continue;

      next[slide.key] = {
        image_path: imagePath,
        position_x: clamp(row.position_x, 0, 100, 50),
        position_y: clamp(row.position_y, 0, 100, 50),
        zoom: clamp(row.zoom, 100, 240, 100)
      };
    }

    return next;
  }

  function publicUrl(path) {
    const raw = String(path || '').trim();
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw)) return raw;

    return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${
      raw.split('/').map(encodeURIComponent).join('/')
    }`;
  }

  function safeFileBase(name) {
    return String(name || 'hero')
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 44) || 'hero';
  }

  function fileExtension(file) {
    const fromName = String(file?.name || '')
      .split('.')
      .pop()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');

    if (fromName) return fromName;

    const byMime = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/avif': 'avif'
    };

    return byMime[file?.type] || 'jpg';
  }

  function revokeDraftUrls() {
    for (const draft of drafts.values()) {
      if (draft.preview_url?.startsWith('blob:')) {
        URL.revokeObjectURL(draft.preview_url);
      }
    }
  }

  function createDraft(key) {
    const row = settings[key] || {};

    return {
      key,
      image_path: String(row.image_path || ''),
      position_x: clamp(row.position_x, 0, 100, 50),
      position_y: clamp(row.position_y, 0, 100, 50),
      zoom: clamp(row.zoom, 100, 240, 100),
      file: null,
      preview_url: '',
      dirty: false
    };
  }

  function rebuildDrafts() {
    revokeDraftUrls();
    drafts = new Map(
      SLIDES.map(slide => [slide.key, createDraft(slide.key)])
    );
  }

  function currentSource(draft) {
    return draft?.preview_url || publicUrl(draft?.image_path);
  }

  function setStatus(message, isError = false) {
    const node = q('#heroBackgroundAdminStatus');
    if (!node) return;

    node.textContent = message || '';
    node.classList.toggle('error', !!isError);
  }

  function writeCaches() {
    const payload = {
      saved_at: Date.now(),
      hero_backgrounds: settings
    };

    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
    } catch {}

    try {
      const raw = localStorage.getItem(PUBLIC_CACHE_KEY);
      if (raw) {
        const publicCache = JSON.parse(raw);

        publicCache.saved_at = Date.now();
        publicCache.homeSettings = {
          ...(publicCache.homeSettings || {}),
          hero_backgrounds: settings
        };

        localStorage.setItem(
          PUBLIC_CACHE_KEY,
          JSON.stringify(publicCache)
        );
      }
    } catch {}

    window.dispatchEvent(
      new CustomEvent('jm:hero-backgrounds-updated', {
        detail: {hero_backgrounds: settings}
      })
    );
  }

  function injectStyles() {
    if (q('#heroBackgroundAdminStyles')) return;

    const style = document.createElement('style');
    style.id = 'heroBackgroundAdminStyles';
    style.textContent = `
      .hero-bg-admin{display:flex;flex-direction:column;min-height:0}
      .hero-bg-admin-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:10px 12px;border-bottom:1px solid rgba(255,255,255,.07)}
      .hero-bg-admin-head h2{margin:0;font-size:13px}
      .hero-bg-admin-head p{max-width:760px;margin:4px 0 0;color:#858d99;font-size:7.5px;line-height:1.45}
      .hero-bg-admin-status{min-height:16px;color:#91c89f;font-size:7px;font-weight:900;white-space:nowrap}
      .hero-bg-admin-status.error{color:#df9292}
      .hero-bg-admin-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;padding:10px;overflow:auto}
      .hero-bg-card{min-width:0;padding:10px;border:1px solid rgba(255,255,255,.08);border-radius:13px;background:rgba(255,255,255,.024)}
      .hero-bg-card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:8px}
      .hero-bg-card-head strong{display:block;color:#f3d234;font-size:10px;letter-spacing:.05em}
      .hero-bg-card-head span{display:block;margin-top:3px;color:#7f8792;font-size:6.5px;line-height:1.35}
      .hero-bg-file{position:relative;display:inline-flex;align-items:center;justify-content:center;min-height:29px;padding:5px 8px;border:1px solid rgba(255,255,255,.12);border-radius:8px;background:#292f38;color:#e5e8ed;font-size:6.5px;font-weight:950;cursor:pointer;white-space:nowrap}
      .hero-bg-file input{position:absolute;inset:0;opacity:0;cursor:pointer}
      .hero-bg-previews{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(115px,.55fr);gap:8px;align-items:start}
      .hero-bg-preview-wrap{display:grid;gap:4px;min-width:0}
      .hero-bg-preview-label{color:#737c88;font-size:6px;font-weight:950;letter-spacing:.08em}
      .hero-bg-preview{position:relative;overflow:hidden;border:1px solid rgba(255,255,255,.12);border-radius:9px;background:#0d1015;cursor:grab;touch-action:none;user-select:none}
      .hero-bg-preview:active{cursor:grabbing}
      .hero-bg-preview.desktop{aspect-ratio:16/6}
      .hero-bg-preview.mobile{aspect-ratio:9/16;max-height:260px}
      .hero-bg-preview img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;pointer-events:none;user-select:none}
      .hero-bg-preview-empty{position:absolute;inset:0;display:grid;place-items:center;padding:10px;color:#626b77;font-size:6.5px;font-weight:900;text-align:center;line-height:1.35}
      .hero-bg-crosshair{position:absolute;z-index:4;left:50%;top:50%;width:19px;height:19px;transform:translate(-50%,-50%);border:1px solid #f3d234;border-radius:50%;pointer-events:none;box-shadow:0 0 0 1px rgba(0,0,0,.55)}
      .hero-bg-crosshair::before,.hero-bg-crosshair::after{content:"";position:absolute;background:#f3d234;box-shadow:0 0 1px #000}
      .hero-bg-crosshair::before{left:50%;top:-6px;bottom:-6px;width:1px;transform:translateX(-50%)}
      .hero-bg-crosshair::after{top:50%;left:-6px;right:-6px;height:1px;transform:translateY(-50%)}
      .hero-bg-controls{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin-top:9px}
      .hero-bg-controls label{display:grid;gap:4px;color:#737c88;font-size:6px;font-weight:950}
      .hero-bg-controls label span{display:flex;justify-content:space-between;gap:5px}
      .hero-bg-controls output{color:#f3d234}
      .hero-bg-controls input[type=range]{width:100%;accent-color:#f3d234}
      .hero-bg-actions{display:flex;gap:5px;flex-wrap:wrap;margin-top:9px}
      .hero-bg-actions button{min-height:29px;padding:5px 8px;border:1px solid rgba(255,255,255,.12);border-radius:8px;background:#292f38;color:#e6e9ed;font-size:6.5px;font-weight:950}
      .hero-bg-actions .primary{border-color:#f3d234;background:#f3d234;color:#111}
      .hero-bg-actions .danger{border-color:rgba(204,91,91,.35);background:rgba(204,91,91,.07);color:#e39a9a}
      .hero-bg-actions button:disabled{opacity:.38;cursor:default}
      .hero-bg-card-status{min-height:13px;margin-top:6px;color:#7f8792;font-size:6.5px}
      .hero-bg-card-status.ok{color:#91c89f}.hero-bg-card-status.error{color:#df9292}
      @media(max-width:920px){
        .hero-bg-admin-grid{grid-template-columns:1fr}
      }
      @media(max-width:620px){
        .hero-bg-admin-head{display:grid}
        .hero-bg-previews{grid-template-columns:1fr minmax(100px,38%)}
        .hero-bg-controls{grid-template-columns:1fr}
      }
    `;
    document.head.appendChild(style);
  }

  function ensureUi() {
    if (!canManage()) return false;

    const setupPage = q('#setupPage');
    const tabs = q('#setupPage .setup-tabs');
    if (!setupPage || !tabs) return false;

    let tab = q('[data-setup-tab="hero"]', tabs);

    if (!tab) {
      tab = document.createElement('button');
      tab.type = 'button';
      tab.className = 'setup-tab';
      tab.dataset.setupTab = 'hero';
      tab.textContent = 'HERO';

      const logTab = q('[data-setup-tab="fanlog"]', tabs);
      tabs.insertBefore(tab, logTab || null);
    }

    let section = q('[data-setup-section="hero"]', setupPage);

    if (!section) {
      section = document.createElement('section');
      section.className = 'panel setup-section hero-bg-admin';
      section.dataset.setupSection = 'hero';
      section.hidden = true;
      section.innerHTML = `
        <div class="hero-bg-admin-head">
          <div>
            <h2>SFONDI CAROSELLO HERO</h2>
            <p>
              Carica una foto specifica per ogni slide. Trascina la foto sotto il mirino:
              il punto scelto rimane il centro del ritaglio mentre la Hero cambia dimensione.
              La stessa configurazione viene usata su desktop e mobile.
            </p>
          </div>
          <span id="heroBackgroundAdminStatus" class="hero-bg-admin-status"></span>
        </div>
        <div id="heroBackgroundAdminGrid" class="hero-bg-admin-grid">
          <div class="empty">Apri la sezione per caricare la configurazione.</div>
        </div>
      `;

      const logSection = q('[data-setup-section="fanlog"]', setupPage);
      setupPage.insertBefore(section, logSection || null);
    }

    if (tab.dataset.heroAdminBound !== '1') {
      tab.dataset.heroAdminBound = '1';

      tab.addEventListener('click', async () => {
        qa('#setupPage .setup-tab').forEach(button => {
          button.classList.toggle('active', button === tab);
        });

        qa('#setupPage .setup-section').forEach(item => {
          item.hidden = item !== section;
        });

        await loadSettings(true);
      });
    }

    return true;
  }

  function cardMarkup(slide) {
    return `
      <article class="hero-bg-card" data-hero-bg-card="${esc(slide.key)}">
        <div class="hero-bg-card-head">
          <div>
            <strong>${esc(slide.title)}</strong>
            <span>${esc(slide.description)}</span>
          </div>
          <label class="hero-bg-file">
            SCEGLI FOTO
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              data-hero-bg-file="${esc(slide.key)}">
          </label>
        </div>

        <div class="hero-bg-previews">
          <div class="hero-bg-preview-wrap">
            <span class="hero-bg-preview-label">DESKTOP</span>
            <div class="hero-bg-preview desktop" data-hero-bg-preview="${esc(slide.key)}">
              <img data-hero-bg-image hidden alt="">
              <span class="hero-bg-preview-empty" data-hero-bg-empty>NESSUNA FOTO SPECIFICA<br>USA LO SFONDO AUTOMATICO</span>
              <i class="hero-bg-crosshair" aria-hidden="true"></i>
            </div>
          </div>

          <div class="hero-bg-preview-wrap">
            <span class="hero-bg-preview-label">MOBILE</span>
            <div class="hero-bg-preview mobile" data-hero-bg-preview="${esc(slide.key)}">
              <img data-hero-bg-image hidden alt="">
              <span class="hero-bg-preview-empty" data-hero-bg-empty>NESSUNA FOTO</span>
              <i class="hero-bg-crosshair" aria-hidden="true"></i>
            </div>
          </div>
        </div>

        <div class="hero-bg-controls">
          <label>
            <span>ORIZZONTALE <output data-hero-bg-x-out>50%</output></span>
            <input type="range" min="0" max="100" step="1" value="50" data-hero-bg-x>
          </label>

          <label>
            <span>PUNTO VERTICALE <output data-hero-bg-y-out>50%</output></span>
            <input type="range" min="0" max="100" step="1" value="50" data-hero-bg-y>
          </label>

          <label>
            <span>ZOOM <output data-hero-bg-zoom-out>100%</output></span>
            <input type="range" min="100" max="240" step="5" value="100" data-hero-bg-zoom>
          </label>
        </div>

        <div class="hero-bg-actions">
          <button type="button" class="primary" data-hero-bg-save>SALVA</button>
          <button type="button" data-hero-bg-reset>RICENTRA</button>
          <button type="button" class="danger" data-hero-bg-remove>USA AUTOMATICO</button>
        </div>

        <div class="hero-bg-card-status" data-hero-bg-status></div>
      </article>
    `;
  }

  function render() {
    const grid = q('#heroBackgroundAdminGrid');
    if (!grid) return;

    rebuildDrafts();
    grid.innerHTML = SLIDES.map(cardMarkup).join('');

    for (const slide of SLIDES) {
      bindCard(slide.key);
      paintCard(slide.key);
    }
  }

  function setCardStatus(key, message, kind = '') {
    const card = q(`[data-hero-bg-card="${CSS.escape(key)}"]`);
    const status = q('[data-hero-bg-status]', card);
    if (!status) return;

    status.textContent = message || '';
    status.className = `hero-bg-card-status${kind ? ` ${kind}` : ''}`;
  }

  function paintCard(key) {
    const draft = drafts.get(key);
    const card = q(`[data-hero-bg-card="${CSS.escape(key)}"]`);
    if (!draft || !card) return;

    const src = currentSource(draft);

    qa('[data-hero-bg-image]', card).forEach(image => {
      image.hidden = !src;

      if (src) {
        if (image.src !== src) image.src = src;
        image.style.objectPosition =
          `${draft.position_x}% ${draft.position_y}%`;
        image.style.transform =
          `scale(${draft.zoom / 100})`;
        image.style.transformOrigin =
          `${draft.position_x}% ${draft.position_y}%`;
      } else {
        image.removeAttribute('src');
      }
    });

    qa('[data-hero-bg-empty]', card).forEach(empty => {
      empty.hidden = !!src;
    });

    const x = q('[data-hero-bg-x]', card);
    const y = q('[data-hero-bg-y]', card);
    const zoom = q('[data-hero-bg-zoom]', card);

    if (x) x.value = String(draft.position_x);
    if (y) y.value = String(draft.position_y);
    if (zoom) zoom.value = String(draft.zoom);

    q('[data-hero-bg-x-out]', card).textContent =
      `${Math.round(draft.position_x)}%`;
    q('[data-hero-bg-y-out]', card).textContent =
      `${Math.round(draft.position_y)}%`;
    q('[data-hero-bg-zoom-out]', card).textContent =
      `${Math.round(draft.zoom)}%`;

    const save = q('[data-hero-bg-save]', card);
    const remove = q('[data-hero-bg-remove]', card);

    if (save) save.disabled = !src;
    if (remove) remove.disabled = !draft.image_path && !draft.file;
  }

  function bindDrag(preview, key) {
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let baseX = 50;
    let baseY = 50;

    preview.addEventListener('pointerdown', event => {
      const draft = drafts.get(key);
      if (!draft || !currentSource(draft)) return;

      dragging = true;
      startX = event.clientX;
      startY = event.clientY;
      baseX = draft.position_x;
      baseY = draft.position_y;

      preview.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    });

    preview.addEventListener('pointermove', event => {
      if (!dragging) return;

      const draft = drafts.get(key);
      if (!draft) return;

      const rect = preview.getBoundingClientRect();
      const dx =
        (event.clientX - startX) / Math.max(1, rect.width) * 100;
      const dy =
        (event.clientY - startY) / Math.max(1, rect.height) * 100;

      draft.position_x = clamp(baseX - dx, 0, 100, 50);
      draft.position_y = clamp(baseY - dy, 0, 100, 50);
      draft.dirty = true;

      paintCard(key);
    });

    const stop = () => {
      dragging = false;
    };

    preview.addEventListener('pointerup', stop);
    preview.addEventListener('pointercancel', stop);
  }

  function bindCard(key) {
    const card = q(`[data-hero-bg-card="${CSS.escape(key)}"]`);
    const draft = drafts.get(key);
    if (!card || !draft) return;

    qa('[data-hero-bg-preview]', card).forEach(preview => {
      bindDrag(preview, key);
    });

    q('[data-hero-bg-file]', card).onchange = event => {
      const file = event.target.files?.[0];
      if (!file) return;

      if (!/^image\/(jpeg|png|webp|avif)$/i.test(file.type || '')) {
        setCardStatus(
          key,
          'Formato non supportato: usa JPG, PNG, WEBP o AVIF.',
          'error'
        );
        event.target.value = '';
        return;
      }

      if (file.size > MAX_FILE_BYTES) {
        setCardStatus(
          key,
          'File troppo grande: massimo 15 MB.',
          'error'
        );
        event.target.value = '';
        return;
      }

      if (draft.preview_url?.startsWith('blob:')) {
        URL.revokeObjectURL(draft.preview_url);
      }

      draft.file = file;
      draft.preview_url = URL.createObjectURL(file);
      draft.position_x = 50;
      draft.position_y = 50;
      draft.zoom = 100;
      draft.dirty = true;

      setCardStatus(
        key,
        'Foto pronta. Trascinala sotto il mirino e salva.'
      );
      paintCard(key);
    };

    q('[data-hero-bg-x]', card).oninput = event => {
      draft.position_x = clamp(event.target.value, 0, 100, 50);
      draft.dirty = true;
      paintCard(key);
    };

    q('[data-hero-bg-y]', card).oninput = event => {
      draft.position_y = clamp(event.target.value, 0, 100, 50);
      draft.dirty = true;
      paintCard(key);
    };

    q('[data-hero-bg-zoom]', card).oninput = event => {
      draft.zoom = clamp(event.target.value, 100, 240, 100);
      draft.dirty = true;
      paintCard(key);
    };

    q('[data-hero-bg-reset]', card).onclick = () => {
      draft.position_x = 50;
      draft.position_y = 50;
      draft.zoom = 100;
      draft.dirty = true;

      setCardStatus(key, 'Inquadratura riportata al centro.');
      paintCard(key);
    };

    q('[data-hero-bg-save]', card).onclick = () => saveSlide(key);
    q('[data-hero-bg-remove]', card).onclick = () => removeSlide(key);
  }

  async function loadSettings(force = false) {
    if (!canManage()) return;
    if (loading) return;
    if (loaded && !force) return;

    loading = true;
    setStatus('Caricamento…');

    try {
      const client = getClient();
      const {data, error} = await client
        .from('site_home_settings')
        .select('hero_backgrounds')
        .eq('id', 'home')
        .maybeSingle();

      if (error) throw error;

      settings = normalizeConfig(data?.hero_backgrounds);
      loaded = true;
      render();
      setStatus('Configurazione caricata ✓');
    } catch (error) {
      const message = String(error?.message || error);

      if (
        /hero_backgrounds|column|schema cache|does not exist/i.test(message)
      ) {
        setStatus(
          'Manca la colonna hero_backgrounds: esegui prima la migrazione SQL.',
          true
        );
      } else {
        setStatus(message, true);
      }
    } finally {
      loading = false;
    }
  }

  async function saveSlide(key) {
    if (!canManage()) return;

    const draft = drafts.get(key);
    if (!draft || !currentSource(draft)) return;

    const client = getClient();
    const oldPath = String(settings[key]?.image_path || '');
    let uploadedPath = '';

    const card = q(`[data-hero-bg-card="${CSS.escape(key)}"]`);
    const saveButton = q('[data-hero-bg-save]', card);

    saveButton.disabled = true;
    setCardStatus(key, 'Salvataggio…');

    try {
      let imagePath = draft.image_path;

      if (draft.file) {
        const ext = fileExtension(draft.file);
        const base = safeFileBase(draft.file.name);

        uploadedPath =
          `hero-backgrounds/${key}/` +
          `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-` +
          `${base}.${ext}`;

        const {error: uploadError} = await client
          .storage
          .from(BUCKET)
          .upload(uploadedPath, draft.file, {
            contentType: draft.file.type || undefined,
            upsert: false
          });

        if (uploadError) throw uploadError;
        imagePath = uploadedPath;
      }

      const next = {
        ...settings,
        [key]: {
          image_path: imagePath,
          position_x: draft.position_x,
          position_y: draft.position_y,
          zoom: draft.zoom
        }
      };

      const {data, error} = await client
        .from('site_home_settings')
        .update({hero_backgrounds: next})
        .eq('id', 'home')
        .select('hero_backgrounds')
        .single();

      if (error) {
        if (uploadedPath) {
          await client.storage.from(BUCKET).remove([uploadedPath]);
        }
        throw error;
      }

      settings = normalizeConfig(data?.hero_backgrounds);
      writeCaches();

      if (
        uploadedPath &&
        oldPath &&
        oldPath !== uploadedPath
      ) {
        const {error: removeError} = await client
          .storage
          .from(BUCKET)
          .remove([oldPath]);

        if (removeError) {
          console.warn('Vecchio sfondo Hero non rimosso', removeError);
        }
      }

      render();
      setStatus('Sfondo Hero aggiornato ✓');
      setCardStatus(key, 'Salvato ✓', 'ok');

      try {
        if (typeof toast === 'function') {
          toast('Sfondo Hero salvato ✓', 'ok');
        }
      } catch {}
    } catch (error) {
      setCardStatus(
        key,
        String(error?.message || error),
        'error'
      );
      saveButton.disabled = false;
    }
  }

  async function removeSlide(key) {
    if (!canManage()) return;

    const current = settings[key];
    const draft = drafts.get(key);

    if (!current?.image_path && !draft?.file) return;

    if (
      !confirm(
        'Rimuovere la foto specifica e tornare allo sfondo automatico?'
      )
    ) {
      return;
    }

    if (!current?.image_path && draft?.file) {
      if (draft.preview_url?.startsWith('blob:')) {
        URL.revokeObjectURL(draft.preview_url);
      }

      drafts.set(key, createDraft(key));
      setCardStatus(key, 'Nuova foto annullata.');
      paintCard(key);
      return;
    }

    const client = getClient();
    const oldPath = current.image_path;
    const next = {...settings};

    delete next[key];
    setCardStatus(key, 'Ripristino sfondo automatico…');

    try {
      const {data, error} = await client
        .from('site_home_settings')
        .update({hero_backgrounds: next})
        .eq('id', 'home')
        .select('hero_backgrounds')
        .single();

      if (error) throw error;

      settings = normalizeConfig(data?.hero_backgrounds);
      writeCaches();

      if (oldPath) {
        const {error: removeError} = await client
          .storage
          .from(BUCKET)
          .remove([oldPath]);

        if (removeError) {
          console.warn('Sfondo Hero non rimosso dallo storage', removeError);
        }
      }

      render();
      setStatus('Ripristinato lo sfondo automatico ✓');

      try {
        if (typeof toast === 'function') {
          toast('Sfondo automatico ripristinato ✓', 'ok');
        }
      } catch {}
    } catch (error) {
      setCardStatus(
        key,
        String(error?.message || error),
        'error'
      );
    }
  }

  function boot() {
    injectStyles();

    const install = () => {
      if (ensureUi()) return true;
      return false;
    };

    if (!install()) {
      const observer = new MutationObserver(() => {
        if (install()) observer.disconnect();
      });

      observer.observe(document.documentElement, {
        childList: true,
        subtree: true
      });
    }

    window.addEventListener('beforeunload', revokeDraftUrls);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, {once: true});
  } else {
    boot();
  }
})();
