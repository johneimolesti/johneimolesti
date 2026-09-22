(() => {
  'use strict';

  const SUPABASE_URL = 'https://etzwybamvfpeitkttwrc.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_CtyexwjoW375UXpjInOuDA_Uz28wWJx';
  const FAN_API = `${SUPABASE_URL}/functions/v1/fan-api`;
  const AUTH_KEY = 'sb-etzwybamvfpeitkttwrc-auth-token';
  const THEME_KEY = 'jm_site_theme';
  const DEVICE_READY_KEY = 'jm_theme_device_ready';
  const FAN_NAME_KEY = 'jm_public_fan_name';
  const FAN_DEVICE_KEY = 'jm_fan_device_token';

  const THEMES = new Set(['dark', 'fresh', 'west-ham']);
  const LABELS = {
    dark: 'DARK',
    fresh: 'FRESH',
    'west-ham': 'WEST HAM'
  };
  const META_COLORS = {
    dark: '#0d0d0d',
    fresh: '#f7f6ef',
    'west-ham': '#7C2C3B'
  };

  const $ = id => document.getElementById(id);
  let syncTimer = 0;
  let welcomeSubmitting = false;

  function validTheme(value) {
    return THEMES.has(String(value || '')) ? String(value) : 'dark';
  }

  function deviceTheme() {
    try {
      return validTheme(localStorage.getItem(THEME_KEY) || 'dark');
    } catch {
      return 'dark';
    }
  }

  function updateThemeControls(theme) {
    document.querySelectorAll('[data-theme-pick]').forEach(button => {
      button.setAttribute('aria-checked', String(button.dataset.themePick === theme));
    });

    const radio = document.querySelector(`input[name="welcomeTheme"][value="${theme}"]`);
    if (radio) radio.checked = true;
  }

  function applyTheme(theme, persistDevice = true) {
    theme = validTheme(theme);
    document.documentElement.dataset.theme = theme;

    if (persistDevice) {
      try {
        localStorage.setItem(THEME_KEY, theme);
      } catch {}
    }

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', META_COLORS[theme] || META_COLORS.dark);

    updateThemeControls(theme);
    return theme;
  }

  function parseAuthSession() {
    try {
      const raw = localStorage.getItem(AUTH_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const session = parsed?.currentSession || parsed?.session || parsed;
      if (!session?.access_token) return null;
      return session;
    } catch {
      return null;
    }
  }

  function jwtSub(token) {
    try {
      const body = String(token || '').split('.')[1];
      if (!body) return null;
      const normalized = body.replace(/-/g, '+').replace(/_/g, '/');
      const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
      return JSON.parse(atob(padded))?.sub || null;
    } catch {
      return null;
    }
  }

  function memberId(session) {
    return session?.user?.id || jwtSub(session?.access_token) || null;
  }

  async function memberProfileTheme(session) {
    const id = memberId(session);
    if (!id || !session?.access_token) return null;

    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(id)}&select=site_theme`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${session.access_token}`
        }
      }
    );

    if (!response.ok) return null;
    const rows = await response.json();
    const theme = rows?.[0]?.site_theme;
    return THEMES.has(theme) ? theme : null;
  }

  async function saveMemberTheme(session, theme) {
    const id = memberId(session);
    if (!id || !session?.access_token) return false;

    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({site_theme: theme})
      }
    );

    if (!response.ok) {
      let message = `Salvataggio tema membro HTTP ${response.status}`;
      try {
        const data = await response.json();
        if (data?.message) message = data.message;
      } catch {}
      throw new Error(message);
    }

    return true;
  }

  function getFanDeviceToken() {
    let token = null;
    try {
      token = localStorage.getItem(FAN_DEVICE_KEY);
      if (!token) {
        token = crypto.randomUUID();
        localStorage.setItem(FAN_DEVICE_KEY, token);
      }
    } catch {
      token = crypto.randomUUID();
    }
    return token;
  }

  function fanFingerprint() {
    return [
      navigator.userAgent,
      navigator.language,
      Intl.DateTimeFormat().resolvedOptions().timeZone,
      screen.width,
      screen.height,
      window.devicePixelRatio || 1
    ].join('|');
  }

  async function fanApi(action, payload = {}) {
    const guest = payload?.guest === true;
    const body = guest
      ? {action, ...payload}
      : {
          action,
          device_token: getFanDeviceToken(),
          fingerprint: fanFingerprint(),
          ...payload
        };

    const response = await fetch(FAN_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`
      },
      body: JSON.stringify(body)
    });

    let data = {};
    try {
      data = await response.json();
    } catch {}

    if (!response.ok) {
      throw new Error(data?.error || `fan-api HTTP ${response.status}`);
    }
    return data;
  }

  function activeFanName() {
    try {
      return String(localStorage.getItem(FAN_NAME_KEY) || '').trim();
    } catch {
      return '';
    }
  }

  async function readCurrentUserTheme() {
    const session = parseAuthSession();
    if (session?.access_token) {
      const theme = await memberProfileTheme(session);
      if (theme) return {type: 'member', theme};
    }

    if (activeFanName()) {
      try {
        const data = await fanApi('get_theme');
        if (THEMES.has(data?.theme)) return {type: 'fan', theme: data.theme};
      } catch (error) {
        console.warn('Tema fan non recuperato', error);
      }
    }

    return null;
  }

  async function syncThemeFromUser() {
    const preference = await readCurrentUserTheme();
    applyTheme(preference?.theme || deviceTheme(), true);
  }

  async function persistTheme(theme) {
    theme = validTheme(theme);
    applyTheme(theme, false);

    let saveError = null;
    try {
      const session = parseAuthSession();
      if (session?.access_token) {
        await saveMemberTheme(session, theme);
      } else if (activeFanName()) {
        await fanApi('set_theme', {theme});
      }
    } catch (error) {
      saveError = error;
    }

    /* La copia dispositivo viene scritta comunque, dopo il tentativo
       di salvataggio sul profilo utente. */
    applyTheme(theme, true);
    if (saveError) throw saveError;
    return theme;
  }

  function setThemeMenu(open) {
    const menu = $('themeMenu');
    const trigger = $('themeTrigger');
    if (!menu || !trigger) return;
    menu.hidden = !open;
    trigger.setAttribute('aria-expanded', String(open));
  }

  function openWelcome() {
    const modal = $('deviceWelcomeModal');
    if (!modal) return;

    updateThemeControls(deviceTheme());
    modal.hidden = false;
    document.documentElement.style.overflow = 'hidden';
    setTimeout(() => $('deviceWelcomeName')?.focus(), 50);
  }

  function closeWelcome() {
    const modal = $('deviceWelcomeModal');
    if (!modal) return;

    modal.hidden = true;
    if (!document.querySelector('.modal:not([hidden])')) {
      document.documentElement.style.overflow = '';
    }
  }

  function knownDevice() {
    try {
      return localStorage.getItem(DEVICE_READY_KEY) === '1'
        || !!localStorage.getItem(FAN_DEVICE_KEY)
        || !!localStorage.getItem(FAN_NAME_KEY)
        || !!parseAuthSession();
    } catch {
      return !!parseAuthSession();
    }
  }

  function markKnownDevice() {
    try {
      localStorage.setItem(DEVICE_READY_KEY, '1');
    } catch {}
  }

  function formatPossibleMatches(matches) {
    return matches
      .map((match, index) => {
        const since = match?.fan_since ? ` — fan dal ${match.fan_since}` : '';
        return `${index + 1}. ${match?.fan_name || 'Fan'}${since}`;
      })
      .join('\n');
  }

  async function resolvePossibleFanMatches(data) {
    const matches = Array.isArray(data?.possible_matches) ? data.possible_matches : [];
    if (!matches.length) return data?.fan || data;

    const choice = window.prompt(
      `Esiste già qualcuno con un nome simile. Se sei uno di questi profili, scrivi il numero; altrimenti premi Annulla.\n\n${formatPossibleMatches(matches)}`
    );

    const index = Number(choice) - 1;
    if (!Number.isInteger(index) || index < 0 || index >= matches.length) {
      return data?.fan || data;
    }

    const target = matches[index];
    let recoveryValue = null;

    if (target?.has_recovery) {
      recoveryValue = window.prompt(`Dato di recupero per ${target.fan_name}:`);
      if (recoveryValue == null) return data?.fan || data;
    }

    const result = await fanApi('claim_candidate', {
      target_fan_id: target.fan_id,
      recovery_value: recoveryValue
    });

    if (result?.merged && result?.fan) return result.fan;
    return data?.fan || data;
  }

  async function submitWelcome(event) {
    event.preventDefault();
    if (welcomeSubmitting) return;

    const name = String($('deviceWelcomeName')?.value || '').trim();
    const selected = document.querySelector('input[name="welcomeTheme"]:checked');
    const theme = validTheme(selected?.value || deviceTheme());
    const message = $('deviceWelcomeMessage');
    const submit = $('deviceWelcomeSubmit');

    if (!name) {
      if (message) {
        message.textContent = 'Scrivi il tuo nome molesto.';
        message.classList.add('error');
      }
      return;
    }

    welcomeSubmitting = true;
    if (submit) submit.disabled = true;
    if (message) {
      message.textContent = 'Ti stiamo riconoscendo…';
      message.classList.remove('error');
    }

    try {
      applyTheme(theme, false);

      let data = await fanApi('enter', {display_name: name});

      /* Prima salvo il tema sul profilo appena riconosciuto/creato.
         Se poi il profilo viene fuso, fan-api trasferisce la preferenza. */
      await fanApi('set_theme', {theme});

      const finalFan = await resolvePossibleFanMatches(data);
      const finalName = finalFan?.nickname || finalFan?.display_name || name;

      try {
        localStorage.setItem(FAN_NAME_KEY, finalName);
        localStorage.setItem(THEME_KEY, theme);
      } catch {}

      markKnownDevice();
      closeWelcome();
      location.reload();
    } catch (error) {
      if (message) {
        message.textContent = error?.message || String(error);
        message.classList.add('error');
      }
      welcomeSubmitting = false;
      if (submit) submit.disabled = false;
    }
  }

  function scheduleSync(delay = 300) {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
      syncThemeFromUser().catch(error => console.warn('Sync tema utente', error));
    }, delay);
  }

  function bind() {
    applyTheme(deviceTheme(), false);

    $('themeTrigger')?.addEventListener('click', event => {
      event.stopPropagation();
      const menu = $('themeMenu');
      setThemeMenu(!!menu?.hidden);
    });

    document.querySelectorAll('[data-theme-pick]').forEach(button => {
      button.addEventListener('click', async () => {
        const theme = validTheme(button.dataset.themePick);
        setThemeMenu(false);

        try {
          await persistTheme(theme);
        } catch (error) {
          /* Il dispositivo conserva comunque la palette scelta. */
          console.warn('Tema salvato solo sul dispositivo', error);
        } finally {
          /* Il cambio tema è intenzionalmente un cambio di "edizione":
             si ricarica tutto il sito e la nuova palette viene applicata
             prima del rendering, evitando un'interfaccia metà vecchia/metà nuova. */
          location.reload();
        }
      });
    });

    document.addEventListener('click', event => {
      const switcher = $('themeSwitcher');
      if (switcher && !switcher.contains(event.target)) setThemeMenu(false);

      const logout = event.target.closest?.('[data-session-logout]');
      if (logout) setTimeout(() => applyTheme(deviceTheme(), false), 500);
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') setThemeMenu(false);
    });

    $('deviceWelcomeForm')?.addEventListener('submit', submitWelcome);

    $('fanLoginForm')?.addEventListener('submit', () => {
      scheduleSync(900);
      setTimeout(() => scheduleSync(50), 1800);
    });

    $('memberLoginForm')?.addEventListener('submit', () => {
      scheduleSync(900);
      setTimeout(() => scheduleSync(50), 1800);
    });

    const userEntry = $('userEntry');
    if (userEntry && window.MutationObserver) {
      const observer = new MutationObserver(() => scheduleSync(250));
      observer.observe(userEntry, {attributes:true, childList:true, subtree:true});
    }

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) scheduleSync(150);
    });

    syncThemeFromUser()
      .catch(error => console.warn('Tema iniziale non sincronizzato', error))
      .finally(() => {
        if (knownDevice()) {
          markKnownDevice();
        } else {
          openWelcome();
        }
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind, {once:true});
  } else {
    bind();
  }
})();
