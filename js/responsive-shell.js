(() => {
  'use strict';

  const MOBILE_QUERY = '(max-width: 760px)';
  const mobile = window.matchMedia(MOBILE_QUERY);

  let contactsObserver = null;
  let renderTimer = null;

  function q(selector, root = document) {
    return root.querySelector(selector);
  }

  function qa(selector, root = document) {
    return [...root.querySelectorAll(selector)];
  }

  function loadResponsiveHome() {
    if (q('script[data-jm-home-experience]')) return;

    const script = document.createElement('script');
    script.dataset.jmHomeExperience = '1';
    script.src = mobile.matches
      ? 'js/mobile-home.js'
      : 'js/desktop-home.js';

    /*
     * Script dinamico: viene caricato SOLO il renderer adatto
     * al viewport rilevato all'apertura del sito.
     */
    script.async = true;
    document.head.appendChild(script);
  }

  function contactItems() {
    return qa('#contactsSocialActions .contact-tile').map(link => {
      const href = link.getAttribute('href') || '';
      const icon = link.querySelector('.contact-tile-icon');
      const label =
        link.querySelector('.contact-tile-copy strong')?.textContent?.trim() ||
        link.getAttribute('aria-label') ||
        link.getAttribute('title') ||
        'Contatto';

      if (!href || !icon) return null;

      return {
        href,
        label,
        iconHtml: icon.innerHTML,
        external: link.getAttribute('target') === '_blank'
      };
    }).filter(Boolean);
  }

  function iconLink(item, className) {
    const a = document.createElement('a');
    a.className = className;
    a.href = item.href;
    a.setAttribute('aria-label', item.label);
    a.title = item.label;

    if (item.external) {
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    }

    const span = document.createElement('span');
    span.className = 'jm-global-social-icon';
    span.innerHTML = item.iconHtml;

    a.appendChild(span);
    return a;
  }

  function ensureMobileBar() {
    let bar = q('#jmGlobalMobileSocial');

    if (!bar) {
      bar = document.createElement('nav');
      bar.id = 'jmGlobalMobileSocial';
      bar.className = 'jm-global-mobile-social';
      bar.setAttribute('aria-label', 'Social e contatti');
      document.body.appendChild(bar);
    }

    return bar;
  }

  function ensureDesktopSocial() {
    let wrap = q('#jmHeaderSocial');

    if (!wrap) {
      wrap = document.createElement('nav');
      wrap.id = 'jmHeaderSocial';
      wrap.className = 'jm-header-social';
      wrap.setAttribute('aria-label', 'Social e contatti');

      const header = q('#siteHeader');
      const user = q('#userEntry');

      if (header) {
        if (user && user.parentElement === header) {
          header.insertBefore(wrap, user);
        } else {
          header.appendChild(wrap);
        }
      }
    }

    return wrap;
  }

  function renderSocials() {
    const items = contactItems();
    const mobileBar = ensureMobileBar();
    const desktopBar = ensureDesktopSocial();

    mobileBar.replaceChildren(
      ...items.map(item => iconLink(item, 'jm-global-social-link'))
    );

    desktopBar.replaceChildren(
      ...items.map(item => iconLink(item, 'jm-header-social-link'))
    );

    mobileBar.classList.toggle('is-empty', !items.length);
    desktopBar.classList.toggle('is-empty', !items.length);
  }

  function scheduleSocialRender() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(renderSocials, 30);
  }

  function observeContacts() {
    contactsObserver?.disconnect();

    const source = q('#contactsSocialActions');

    if (!source) {
      /*
       * contact-editor.js crea/rende il contenuto dopo l'avvio.
       * Un retry breve basta; non osserviamo più l'intero body.
       */
      setTimeout(observeContacts, 150);
      return;
    }

    contactsObserver = new MutationObserver(scheduleSocialRender);
    contactsObserver.observe(source, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['href', 'target', 'title', 'aria-label']
    });

    renderSocials();
  }

  function boot() {
    ensureMobileBar();
    ensureDesktopSocial();
    observeContacts();

    document.addEventListener('jm:public-data', event => {
      if (event?.detail?.key === 'contacts') scheduleSocialRender();
    });
  }

  /*
   * Prima scelta del formato, poi download di UN SOLO renderer Home.
   */
  loadResponsiveHome();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
