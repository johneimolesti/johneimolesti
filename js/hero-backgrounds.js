(() => {
  'use strict';

  const SUPABASE_URL = 'https://etzwybamvfpeitkttwrc.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_CtyexwjoW375UXpjInOuDA_Uz28wWJx';
  const BUCKET = 'public-site';
  const CACHE_KEY = 'jm_hero_backgrounds_v1';
  const CACHE_MAX_STALE_MS = 30 * 24 * 60 * 60 * 1000;
  const SLIDE_KEYS = new Set(['live', 'songs', 'fans', 'media']);

  let heroBackgrounds = {};
  let applyTimer = null;
  let observer = null;
  let refreshPromise = null;

  function clamp(value, min, max, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
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

    for (const key of SLIDE_KEYS) {
      const row = source[key];
      if (!row || typeof row !== 'object' || Array.isArray(row)) continue;

      const imagePath = String(row.image_path || '').trim();
      if (!imagePath) continue;

      next[key] = {
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

  function readCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;

      const cached = JSON.parse(raw);
      const savedAt = Number(cached?.saved_at || 0);

      if (!savedAt || Date.now() - savedAt > CACHE_MAX_STALE_MS) {
        return null;
      }

      return normalizeConfig(cached?.hero_backgrounds);
    } catch {
      return null;
    }
  }

  function writeCache(config) {
    try {
      localStorage.setItem(
        CACHE_KEY,
        JSON.stringify({
          saved_at: Date.now(),
          hero_backgrounds: normalizeConfig(config)
        })
      );
    } catch {}
  }

  function preloadAssets(config = heroBackgrounds) {
    Object.values(config).forEach((row, index) => {
      const src = publicUrl(row?.image_path);
      if (!src) return;

      const image = new Image();
      image.decoding = 'async';

      if ('fetchPriority' in image) {
        image.fetchPriority = index === 0 ? 'high' : 'low';
      }

      image.src = src;
    });
  }

  function slideFamily(slide) {
    if (slide.classList.contains('jm-mobile-home-slide')) {
      return {
        backgroundClass: 'jm-mobile-home-bg',
        fallbackClass: 'jm-mobile-home-bg-fallback'
      };
    }

    if (slide.classList.contains('jm-desktop-home-slide')) {
      return {
        backgroundClass: 'jm-desktop-home-bg',
        fallbackClass: 'jm-desktop-home-bg-fallback'
      };
    }

    return null;
  }

  function directChildWithClass(parent, className, customOnly = false) {
    return [...parent.children].find(node => {
      if (!node.classList?.contains(className)) return false;
      return customOnly
        ? node.classList.contains('jm-hero-custom-bg')
        : !node.classList.contains('jm-hero-custom-bg');
    }) || null;
  }

  function rememberOriginalImage(image) {
    if (!image || image.dataset.jmHeroManaged === '1') return;

    image.dataset.jmHeroManaged = '1';
    image.dataset.jmHeroOriginalSrc = image.getAttribute('src') || '';
    image.dataset.jmHeroOriginalAlt = image.getAttribute('alt') || '';
    image.dataset.jmHeroOriginalObjectPosition = image.style.objectPosition || '';
    image.dataset.jmHeroOriginalTransform = image.style.transform || '';
    image.dataset.jmHeroOriginalTransformOrigin = image.style.transformOrigin || '';
  }

  function restoreOriginalImage(image) {
    if (!image || image.dataset.jmHeroManaged !== '1') return;

    const src = image.dataset.jmHeroOriginalSrc || '';
    const alt = image.dataset.jmHeroOriginalAlt || '';

    if (src) image.setAttribute('src', src);
    else image.removeAttribute('src');

    image.setAttribute('alt', alt);
    image.style.objectPosition = image.dataset.jmHeroOriginalObjectPosition || '';
    image.style.transform = image.dataset.jmHeroOriginalTransform || '';
    image.style.transformOrigin = image.dataset.jmHeroOriginalTransformOrigin || '';

    delete image.dataset.jmHeroManaged;
    delete image.dataset.jmHeroOriginalSrc;
    delete image.dataset.jmHeroOriginalAlt;
    delete image.dataset.jmHeroOriginalObjectPosition;
    delete image.dataset.jmHeroOriginalTransform;
    delete image.dataset.jmHeroOriginalTransformOrigin;
  }

  function hideFallback(fallback) {
    if (!fallback || fallback.dataset.jmHeroHidden === '1') return;

    fallback.dataset.jmHeroHidden = '1';
    fallback.dataset.jmHeroOriginalDisplay = fallback.style.display || '';
    fallback.style.display = 'none';
  }

  function restoreFallback(fallback) {
    if (!fallback || fallback.dataset.jmHeroHidden !== '1') return;

    const previous = fallback.dataset.jmHeroOriginalDisplay || '';

    if (previous) fallback.style.display = previous;
    else fallback.style.removeProperty('display');

    delete fallback.dataset.jmHeroHidden;
    delete fallback.dataset.jmHeroOriginalDisplay;
  }

  function applySlide(slide) {
    const key = String(slide?.dataset?.slide || '').trim();
    if (!SLIDE_KEYS.has(key)) return;

    const family = slideFamily(slide);
    if (!family) return;

    const config = heroBackgrounds[key] || null;

    const baseImage = directChildWithClass(
      slide,
      family.backgroundClass,
      false
    );

    const customImage = directChildWithClass(
      slide,
      family.backgroundClass,
      true
    );

    const fallback = directChildWithClass(
      slide,
      family.fallbackClass,
      false
    );

    if (!config?.image_path) {
      customImage?.remove();
      restoreOriginalImage(baseImage);
      restoreFallback(fallback);
      slide.classList.remove('jm-hero-has-custom-bg');
      return;
    }

    const src = publicUrl(config.image_path);
    if (!src) return;

    let image = baseImage || customImage;

    if (!image) {
      image = document.createElement('img');
      image.className = `${family.backgroundClass} jm-hero-custom-bg`;
      image.alt = '';
      image.setAttribute('aria-hidden', 'true');
      slide.insertBefore(image, slide.firstChild);
    } else if (!image.classList.contains('jm-hero-custom-bg')) {
      rememberOriginalImage(image);
    }

    hideFallback(fallback);

    image.src = src;
    image.style.objectPosition =
      `${config.position_x}% ${config.position_y}%`;
    image.style.transform =
      `scale(${config.zoom / 100})`;
    image.style.transformOrigin =
      `${config.position_x}% ${config.position_y}%`;

    slide.classList.add('jm-hero-has-custom-bg');
  }

  function applyAll() {
    document
      .querySelectorAll(
        '.jm-mobile-home-slide[data-slide],.jm-desktop-home-slide[data-slide]'
      )
      .forEach(applySlide);
  }

  function scheduleApply() {
    clearTimeout(applyTimer);
    applyTimer = setTimeout(applyAll, 0);
  }

  async function refreshConfig() {
    if (refreshPromise) return refreshPromise;

    refreshPromise = (async () => {
      try {
        const endpoint =
          `${SUPABASE_URL}/rest/v1/site_home_settings` +
          `?id=eq.home&select=hero_backgrounds`;

        const response = await fetch(endpoint, {
          method: 'GET',
          headers: {
            apikey: SUPABASE_KEY,
            Accept: 'application/json'
          },
          cache: 'no-store'
        });

        if (!response.ok) {
          const message = await response.text().catch(() => '');
          throw new Error(
            `Hero backgrounds: ${response.status} ${message || response.statusText}`
          );
        }

        const rows = await response.json();
        const next = normalizeConfig(rows?.[0]?.hero_backgrounds);

        heroBackgrounds = next;
        writeCache(next);
        preloadAssets(next);
        applyAll();

        window.dispatchEvent(
          new CustomEvent('jm:hero-backgrounds-ready', {
            detail: {hero_backgrounds: next}
          })
        );
      } catch (error) {
        console.warn('Configurazione Hero non aggiornata', error);
      } finally {
        refreshPromise = null;
      }
    })();

    return refreshPromise;
  }

  function boot() {
    const cached = readCache();

    if (cached) {
      heroBackgrounds = cached;
      preloadAssets(cached);
    }

    applyAll();

    observer?.disconnect();
    observer = new MutationObserver(scheduleApply);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });

    window.addEventListener('storage', event => {
      if (event.key !== CACHE_KEY) return;

      heroBackgrounds = readCache() || {};
      preloadAssets(heroBackgrounds);
      applyAll();
    });

    window.addEventListener('jm:hero-backgrounds-updated', event => {
      heroBackgrounds = normalizeConfig(
        event?.detail?.hero_backgrounds || readCache() || {}
      );
      preloadAssets(heroBackgrounds);
      applyAll();
    });

    refreshConfig();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, {once: true});
  } else {
    boot();
  }
})();
