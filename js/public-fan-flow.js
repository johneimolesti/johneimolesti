(() => {
  'use strict';

  const SUPABASE_URL = 'https://etzwybamvfpeitkttwrc.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_CtyexwjoW375UXpjInOuDA_Uz28wWJx';
  const FAN_API = `${SUPABASE_URL}/functions/v1/fan-api`;

  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({
    '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'
  }[ch]));

  const HAD_DEVICE_AT_LOAD = (() => {
    try { return !!localStorage.getItem('jm_fan_device_token'); }
    catch { return true; }
  })();

  let onboardingBusy = false;
  let identityFlowBusy = false;
  let patchFrame = 0;
  let catalogSaveBusy = new Set();

  function rawRoute() {
    return location.hash.replace(/^#\/?/,'').split('/')[0] || 'home';
  }

  function deviceToken() {
    let token = localStorage.getItem('jm_fan_device_token');
    if (!token) {
      token = crypto.randomUUID();
      localStorage.setItem('jm_fan_device_token', token);
    }
    return token;
  }

  function fingerprint() {
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
    const res = await fetch(FAN_API, {
      method: 'POST',
      headers: {
        'Content-Type':'application/json',
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`
      },
      body: JSON.stringify({
        action,
        device_token: deviceToken(),
        fingerprint: fingerprint(),
        ...payload
      })
    });

    let data = {};
    try { data = await res.json(); } catch {}
    if (!res.ok) throw new Error(data.error || `fan-api HTTP ${res.status}`);
    return data;
  }

  function toast(message, type = '') {
    const stack = document.getElementById('toastStack');
    if (!stack) return;
    const node = document.createElement('div');
    node.className = `toast ${type}`;
    node.textContent = message;
    stack.appendChild(node);
    setTimeout(() => node.remove(), 3000);
  }

  function formatDate(value) {
    if (!value) return '—';
    const [y,m,d] = String(value).slice(0,10).split('-');
    return [d,m,y].filter(Boolean).join('/');
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

  function ensureStyles() {
    if (document.getElementById('jmPublicFanFlowStyles')) return;

    const style = document.createElement('style');
    style.id = 'jmPublicFanFlowStyles';
    style.textContent = `
      .jm-public-fan-flow{
        position:fixed;inset:0;z-index:2147483200;
        display:grid;place-items:center;padding:12px;
        background:rgba(0,0,0,.74);
        backdrop-filter:blur(5px);-webkit-backdrop-filter:blur(5px);
        overflow:auto
      }
      .jm-public-fan-card{
        width:min(780px,calc(100vw - 24px));
        max-height:calc(100dvh - 24px);
        overflow:auto;background:#151513;color:var(--text,#f3f0e5);
        border:1px solid #625d4d;
        box-shadow:0 28px 90px rgba(0,0,0,.78)
      }
      .jm-public-fan-head{
        position:sticky;top:0;z-index:2;
        display:flex;justify-content:space-between;align-items:flex-start;gap:14px;
        padding:16px 18px 12px;background:#151513;border-bottom:1px solid #403c32
      }
      .jm-public-fan-head h2{margin:3px 0 0;font-size:clamp(24px,5vw,36px);line-height:1}
      .jm-public-fan-close{
        width:38px;height:38px;flex:0 0 auto;
        border:1px solid #625d4d;background:#222;color:inherit;
        font-size:24px;cursor:pointer
      }
      .jm-public-fan-body{display:grid;gap:16px;padding:18px}
      .jm-public-fan-copy,.jm-public-fan-note{color:var(--muted,#aaa596);line-height:1.45}
      .jm-public-fan-progress{display:flex;gap:6px;margin-top:9px}
      .jm-public-fan-progress span{height:4px;flex:1;background:#39362e}
      .jm-public-fan-progress span.done{background:var(--gold,#d5aa45)}
      .jm-public-fan-question{
        display:grid;gap:10px;padding:14px;
        border:1px solid #454136;background:#1d1c19
      }
      .jm-public-fan-question h3{margin:0;font-size:15px}
      .jm-public-fan-choice-row{display:flex;flex-wrap:wrap;gap:8px}
      .jm-public-fan-choice{
        display:flex;align-items:center;gap:8px;
        padding:9px 10px;border:1px solid #514c40;background:#24221d
      }
      .jm-public-fan-yesno{display:grid;grid-template-columns:1fr 1fr;gap:8px}
      .jm-public-fan-yesno button,
      .jm-public-fan-actions button{
        min-height:42px;border:1px solid #5f594a;
        background:#24221d;color:inherit;font-weight:900;cursor:pointer
      }
      .jm-public-fan-yesno button.selected,
      .jm-public-fan-actions .primary{
        background:var(--gold,#d5aa45);color:#111;border-color:var(--gold,#d5aa45)
      }
      .jm-public-fan-top{display:grid;gap:8px}
      .jm-public-fan-pick{
        display:grid;grid-template-columns:70px minmax(0,1fr) auto;
        gap:8px;align-items:center
      }
      .jm-public-fan-pick select{width:100%;min-width:0}
      .jm-public-fan-list,.jm-public-rating-list{
        display:grid;gap:8px;max-height:42dvh;overflow:auto
      }
      .jm-public-fan-concert,.jm-public-rating-row{
        display:grid;grid-template-columns:minmax(0,1fr) auto;
        gap:10px;align-items:center;padding:11px;
        border:1px solid #474337;background:#1d1c19
      }
      .jm-public-fan-meta{display:block;color:var(--muted,#aaa596);font-size:12px;margin-top:3px}
      .jm-public-rating-scale{
        display:grid;grid-template-columns:repeat(10,minmax(30px,1fr));
        gap:4px;width:min(100%,520px)
      }
      .jm-public-rating-button{
        min-width:0;min-height:36px;padding:0;
        border:1px solid #595548;background:#24221d;color:inherit;
        font-weight:900;cursor:pointer
      }
      .jm-public-rating-button.selected{
        background:var(--gold,#d5aa45);border-color:var(--gold,#d5aa45);color:#111
      }
      .jm-public-rating-button:disabled{opacity:.7;cursor:wait}
      .jm-public-fan-actions{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap}
      .jm-public-fan-status{min-height:18px;color:var(--muted,#aaa596);font-size:12px}
      .jm-native-vote-hidden{position:absolute!important;opacity:0!important;pointer-events:none!important;width:1px!important;height:1px!important}
      .fan-song-quick .jm-public-rating-scale{width:min(440px,100%)}
      .song-vote-controls .jm-public-rating-scale{grid-column:1/-1}
      .general-score .jm-public-rating-scale{margin-top:8px}
      .jm-public-entry-socials{display:grid;grid-template-columns:repeat(auto-fit,minmax(135px,1fr));gap:8px}
      .jm-public-entry-social{
        display:flex;align-items:center;gap:9px;padding:10px;border:1px solid #4a463b;
        background:#1d1c19;color:inherit;text-decoration:none
      }
      .jm-public-entry-social svg,.jm-public-entry-social img{width:22px;height:22px;object-fit:contain;flex:0 0 22px}
      @media(max-width:620px){
        .jm-public-fan-flow{padding:0;place-items:stretch}
        .jm-public-fan-card{width:100%;max-height:100dvh;border-left:0;border-right:0}
        .jm-public-fan-head,.jm-public-fan-body{padding:14px}
        .jm-public-rating-scale{grid-template-columns:repeat(5,1fr)}
        .jm-public-fan-pick,.jm-public-fan-concert,.jm-public-rating-row{grid-template-columns:1fr}
      }
    `;
    document.head.appendChild(style);
  }

  function progress(step) {
    return `<div class="jm-public-fan-progress" aria-label="Passaggio ${step} di 3">${
      [1,2,3].map(i=>`<span class="${i<=step?'done':''}"></span>`).join('')
    }</div>`;
  }

  function overlay() {
    ensureStyles();
    const el = document.createElement('div');
    el.className = 'jm-public-fan-flow';
    el.innerHTML = '<section class="jm-public-fan-card" role="dialog" aria-modal="true"></section>';
    document.body.appendChild(el);

    const entry = document.getElementById('checkinHeroFlow');
    const restoreEntry = !!entry && !entry.hidden;
    if (entry) entry.hidden = true;

    return {
      el,
      card: el.firstElementChild,
      close() {
        el.remove();
        if (entry && restoreEntry) entry.hidden = false;
      }
    };
  }

  function ratingScale(value = '', label = 'Voto') {
    const current = value === '' || value == null ? null : Number(value);
    return `<div class="jm-public-rating-scale" role="radiogroup" aria-label="${esc(label)}">${
      Array.from({length:10},(_,i)=>{
        const v = i + 1;
        const selected = Number.isFinite(current) && current === v;
        return `<button type="button" class="jm-public-rating-button${selected?' selected':''}" data-jm-rating="${v}" aria-pressed="${selected?'true':'false'}">${v}</button>`;
      }).join('')
    }</div>`;
  }

  function paintScale(scale, value, disabled = false) {
    const current = value === '' || value == null ? null : Number(value);
    $$('[data-jm-rating]', scale).forEach(btn => {
      const selected = Number(btn.dataset.jmRating) === current;
      btn.classList.toggle('selected', selected);
      btn.setAttribute('aria-pressed', selected ? 'true' : 'false');
      btn.disabled = disabled;
    });
  }

  function bindScale(scale, initialValue, onChange) {
    if (!scale || scale.dataset.jmBound === '1') return;
    scale.dataset.jmBound = '1';
    paintScale(scale, initialValue);

    $$('[data-jm-rating]', scale).forEach(btn => {
      btn.addEventListener('click', async () => {
        if (btn.disabled) return;
        const next = Number(btn.dataset.jmRating);
        const prev = $('.selected', scale)?.dataset.jmRating || '';
        paintScale(scale, next, true);

        try {
          await onChange(next, prev);
          paintScale(scale, next, false);
        } catch (err) {
          paintScale(scale, prev, false);
          throw err;
        }
      });
    });
  }

  async function postpone() {
    try { await fanApi('onboarding_postpone'); } catch {}
  }

  async function intro() {
    return new Promise(resolve => {
      const ui = overlay();
      ui.card.innerHTML = `
        <header class="jm-public-fan-head">
          <div><span class="section-kicker">BENVENUTO</span><h2>DUE DOMANDE AL VOLO</h2>${progress(1)}</div>
        </header>
        <div class="jm-public-fan-body">
          <div class="jm-public-fan-copy">
            Ti rubiamo qualche minuto per conoscerti meglio: due domande sui Molesti,
            i live che hai visto e un giro rapido di voti ai pezzi.
            Puoi rimandare e riprendere tutto dal Profilo.
          </div>
          <div class="jm-public-fan-actions">
            <button type="button" data-later>PIÙ TARDI</button>
            <button type="button" class="primary" data-start>INIZIA</button>
          </div>
        </div>`;

      $('[data-later]', ui.card).onclick = async () => {
        await postpone();
        ui.close();
        resolve(false);
      };

      $('[data-start]', ui.card).onclick = async () => {
        try { await fanApi('onboarding_step_complete',{step:'intro'}); } catch {}
        ui.close();
        resolve(true);
      };
    });
  }

  async function questionnaire(data, {edit=false} = {}) {
    const existing = data?.questionnaire || null;
    const songs = Array.isArray(data?.songs) ? data.songs : [];
    const fanName = localStorage.getItem('jm_public_fan_name') || 'fan';
    const songOptions = songs.map(s => `<option value="${esc(s.id)}">${esc(s.title)}</option>`).join('');

    return new Promise(resolve => {
      const ui = overlay();

      ui.card.innerHTML = `
        <header class="jm-public-fan-head">
          <div>
            <span class="section-kicker">${edit?'PROFILO':'PASSAGGIO 1'}</span>
            <h2>${edit?'QUESTIONARIO':`BENVENUTO, ${esc(fanName.toUpperCase())}`}</h2>
            ${progress(1)}
          </div>
          <button class="jm-public-fan-close" type="button" aria-label="Chiudi">×</button>
        </header>

        <div class="jm-public-fan-body">
          <div class="jm-public-fan-copy">
            ${edit
              ? 'Puoi aggiornare le risposte quando vuoi.'
              : 'Prima di entrare ti chiediamo poche cose. Il flusso automatico viene proposto una sola volta.'}
          </div>

          <section class="jm-public-fan-question">
            <h3>Sei mai stato/a a un concerto dei Molesti? *</h3>
            <div class="jm-public-fan-yesno">
              <button type="button" data-attended="true">SÌ</button>
              <button type="button" data-attended="false">NO</button>
            </div>
          </section>

          <div data-no-only hidden>
            <section class="jm-public-fan-question">
              <h3>Come conosci i Molesti? *</h3>
              <div class="jm-public-fan-choice-row">
                <label class="jm-public-fan-choice"><input type="radio" name="jmDiscovery" value="friend_member"> Amico/a di un membro</label>
                <label class="jm-public-fan-choice"><input type="radio" name="jmDiscovery" value="seen_online"> Li ho visti online</label>
                <label class="jm-public-fan-choice"><input type="radio" name="jmDiscovery" value="heard_about"> Ne ho sentito parlare</label>
              </div>
            </section>

            <section class="jm-public-fan-question">
              <h3>Hai già sentito qualche pezzo? *</h3>
              <div class="jm-public-fan-choice-row" data-heard>
                <label class="jm-public-fan-choice"><input type="checkbox" value="social_live_clips"> Spezzoni live sui social</label>
                <label class="jm-public-fan-choice"><input type="checkbox" value="private_recordings"> Registrazioni private</label>
                <label class="jm-public-fan-choice"><input type="checkbox" value="shared_by_someone"> Me li ha fatti sentire qualcuno</label>
                <label class="jm-public-fan-choice"><input type="checkbox" value="never_heard"> Mai sentiti prima</label>
              </div>
            </section>
          </div>

          <section class="jm-public-fan-question">
            <h3>Quali canzoni terresti nella tua Top 3?</h3>
            <div class="jm-public-fan-note">Puoi sceglierne fino a tre e indicarne una come preferita assoluta.</div>
            <div class="jm-public-fan-top">
              ${[1,2,3].map(i=>`
                <div class="jm-public-fan-pick" data-slot="${i}">
                  <strong>BRANO ${i}</strong>
                  <select><option value="">— scegli —</option>${songOptions}</select>
                  <label><input type="checkbox"> ★ N.1</label>
                </div>`).join('')}
            </div>
          </section>

          <div class="jm-public-fan-status"></div>
          <div class="jm-public-fan-actions">
            <button type="button" class="primary" data-submit>${edit?'SALVA':'CONTINUA'}</button>
          </div>
        </div>`;

      const status = $('.jm-public-fan-status', ui.card);
      const noOnly = $('[data-no-only]', ui.card);
      const heard = $$('[data-heard] input', ui.card);
      const rows = $$('[data-slot]', ui.card);
      const selects = rows.map(r => $('select',r));
      const stars = rows.map(r => $('input[type="checkbox"]',r));
      let attended = typeof existing?.attended_concert === 'boolean' ? existing.attended_concert : null;

      function setAttended(value, clear = true) {
        attended = value;
        $$('[data-attended]', ui.card).forEach(b => b.classList.toggle('selected', b.dataset.attended === String(value)));
        noOnly.hidden = value;
        if (value && clear) {
          $$('input[name="jmDiscovery"]', ui.card).forEach(x => x.checked = false);
          heard.forEach(x => x.checked = false);
        }
      }

      $$('[data-attended]', ui.card).forEach(b => b.onclick = () => setAttended(b.dataset.attended === 'true'));

      heard.forEach(ch => ch.onchange = () => {
        if (!ch.checked) return;
        if (ch.value === 'never_heard') heard.filter(x => x !== ch).forEach(x => x.checked = false);
        else heard.filter(x => x.value === 'never_heard').forEach(x => x.checked = false);
      });

      function syncPicks() {
        const chosen = selects.map(x=>x.value).filter(Boolean);
        selects.forEach(sel => [...sel.options].forEach(opt => {
          if (opt.value) opt.disabled = chosen.includes(opt.value) && opt.value !== sel.value;
        }));
        stars.forEach((star,i) => {
          star.disabled = !selects[i].value;
          if (!selects[i].value) star.checked = false;
        });
      }

      selects.forEach(sel => sel.onchange = syncPicks);
      stars.forEach((star,i) => star.onchange = () => {
        if (star.checked) stars.forEach((x,j) => { if (j !== i) x.checked = false; });
      });

      if (existing) {
        if (attended !== null) setAttended(attended,false);

        if (existing.discovery_source) {
          const el = $(`input[name="jmDiscovery"][value="${CSS.escape(existing.discovery_source)}"]`, ui.card);
          if (el) el.checked = true;
        }

        const savedHeard = Array.isArray(existing.heard_sources) ? existing.heard_sources : [];
        heard.forEach(x => x.checked = savedHeard.includes(x.value));

        const tops = Array.isArray(existing.top_songs)
          ? [...existing.top_songs].sort((a,b)=>Number(a.slot)-Number(b.slot))
          : [];

        tops.forEach((row,i) => {
          if (selects[i]) selects[i].value = row.song_id || '';
          if (stars[i]) stars[i].checked = !!row.is_absolute;
        });
      }

      syncPicks();

      $('.jm-public-fan-close', ui.card).onclick = async () => {
        if (!edit) await postpone();
        ui.close();
        resolve(false);
      };

      $('[data-submit]', ui.card).onclick = async () => {
        if (attended === null) {
          status.textContent = 'Rispondi prima alla domanda sul concerto.';
          return;
        }

        let discovery = null;
        let heardSources = [];

        if (!attended) {
          discovery = $('input[name="jmDiscovery"]:checked', ui.card)?.value || null;
          heardSources = heard.filter(x => x.checked).map(x => x.value);

          if (!discovery) {
            status.textContent = 'Indica come hai conosciuto i Molesti.';
            return;
          }
          if (!heardSources.length) {
            status.textContent = 'Indica se e come avevi già sentito qualche pezzo.';
            return;
          }
        }

        const topIds = selects.map(x=>x.value).filter(Boolean);
        if (new Set(topIds).size !== topIds.length) {
          status.textContent = 'Nella Top 3 ogni brano può comparire una sola volta.';
          return;
        }

        const absIndex = stars.findIndex(x=>x.checked);
        const absoluteId = absIndex >= 0 ? selects[absIndex].value : null;

        const btn = $('[data-submit]', ui.card);
        btn.disabled = true;
        status.textContent = 'Salvataggio…';

        try {
          await fanApi('submit_onboarding',{
            attended_concert: attended,
            discovery_source: discovery,
            heard_sources: heardSources,
            top_song_ids: topIds,
            absolute_song_id: absoluteId
          });
          ui.close();
          resolve(true);
        } catch (err) {
          status.textContent = err.message || 'Errore durante il salvataggio';
          btn.disabled = false;
        }
      };
    });
  }

  async function liveStep(data) {
    if (!data?.questionnaire?.attended_concert) {
      await fanApi('onboarding_step_complete',{step:'live'});
      return true;
    }

    const list = await fanApi('list_concerts');
    const all = (list.concerts || []).filter(c => {
      if (c.status === 'cancelled') return false;
      if (c.status === 'completed') return true;
      const start = concertStartMs(c);
      return Number.isFinite(start) && start < Date.now();
    });

    const initial = new Set(data.attendance_ids || []);

    return new Promise(resolve => {
      const ui = overlay();

      async function later() {
        await postpone();
        ui.close();
        resolve(false);
      }

      function renderRatings(selected) {
        ui.card.innerHTML = `
          <header class="jm-public-fan-head">
            <div><span class="section-kicker">PASSAGGIO 2</span><h2>COME SONO ANDATI?</h2>${progress(2)}</div>
            <button class="jm-public-fan-close" type="button" aria-label="Chiudi">×</button>
          </header>
          <div class="jm-public-fan-body">
            <div class="jm-public-fan-copy">Un voto generale da 1 a 10 basta. I dettagli restano disponibili nella scheda del live.</div>
            <div class="jm-public-rating-list">
              ${selected.map(c=>`
                <div class="jm-public-rating-row" data-concert-id="${esc(c.id)}">
                  <div><strong>${esc(c.name)}</strong><span class="jm-public-fan-meta">${formatDate(c.concert_date)} · ${esc(prettyPlace(c))}</span></div>
                  ${ratingScale(c.my_concert_rating ?? '',`Voto ${c.name}`)}
                </div>`).join('') || '<div class="empty-state">Nessun live da valutare.</div>'}
            </div>
            <div class="jm-public-fan-status"></div>
            <div class="jm-public-fan-actions"><button type="button" class="primary" data-next>CONTINUA</button></div>
          </div>`;

        const status = $('.jm-public-fan-status', ui.card);
        $('.jm-public-fan-close', ui.card).onclick = later;

        $$('.jm-public-rating-row', ui.card).forEach(row => {
          const scale = $('.jm-public-rating-scale', row);
          bindScale(scale, $('.selected',scale)?.dataset.jmRating || '', async value => {
            try {
              await fanApi('concert_rate',{concert_id:row.dataset.concertId,performance_score:value});
            } catch (err) {
              status.textContent = err.message;
              throw err;
            }
          });
        });

        $('[data-next]', ui.card).onclick = async () => {
          await fanApi('onboarding_step_complete',{step:'live'});
          ui.close();
          resolve(true);
        };
      }

      ui.card.innerHTML = `
        <header class="jm-public-fan-head">
          <div><span class="section-kicker">PASSAGGIO 2</span><h2>LIVE CHE HAI VISTO</h2>${progress(2)}</div>
          <button class="jm-public-fan-close" type="button" aria-label="Chiudi">×</button>
        </header>
        <div class="jm-public-fan-body">
          <div class="jm-public-fan-copy">Segna i concerti in cui c'eri.</div>
          <div class="jm-public-fan-list">
            ${all.map(c=>`
              <label class="jm-public-fan-concert">
                <span><strong>${esc(c.name)}</strong><span class="jm-public-fan-meta">${formatDate(c.concert_date)} · ${esc(prettyPlace(c))}</span></span>
                <span><input type="checkbox" data-id="${esc(c.id)}" ${initial.has(c.id)?'checked':''}> IO C'ERO</span>
              </label>`).join('') || '<div class="empty-state">Nessun live passato disponibile.</div>'}
          </div>
          <div class="jm-public-fan-status"></div>
          <div class="jm-public-fan-actions"><button type="button" class="primary" data-next>SALVA E CONTINUA</button></div>
        </div>`;

      const status = $('.jm-public-fan-status', ui.card);
      $('.jm-public-fan-close', ui.card).onclick = later;

      $('[data-next]', ui.card).onclick = async () => {
        const selected = new Set($$('input[data-id]:checked',ui.card).map(x=>x.dataset.id));

        if (all.length && !selected.size) {
          status.textContent = 'Se hai indicato di esserci stato, seleziona almeno un live.';
          return;
        }

        status.textContent = 'Salvataggio…';

        try {
          for (const concert of all) {
            const had = initial.has(concert.id);
            const has = selected.has(concert.id);
            if (had !== has) await fanApi('attend',{concert_id:concert.id,attended:has});
          }

          renderRatings([...selected].map(id=>all.find(c=>c.id===id)).filter(Boolean));
        } catch (err) {
          status.textContent = err.message;
        }
      };
    });
  }

  async function catalogStep() {
    const data = await fanApi('catalog');
    const rows = data.songs || [];

    return new Promise(resolve => {
      const ui = overlay();

      ui.card.innerHTML = `
        <header class="jm-public-fan-head">
          <div><span class="section-kicker">PASSAGGIO 3</span><h2>GIRO RAPIDO DEL CATALOGO</h2>${progress(3)}</div>
          <button class="jm-public-fan-close" type="button" aria-label="Chiudi">×</button>
        </header>
        <div class="jm-public-fan-body">
          <div class="jm-public-fan-copy">Vota la versione Molesti con un numero da 1 a 10. Il salvataggio è immediato.</div>
          <div class="jm-public-rating-list">
            ${rows.map(song=>`
              <div class="jm-public-rating-row" data-song-id="${esc(song.id)}">
                <strong>${esc(song.title)}</strong>
                ${ratingScale(song.my_vote?.molesti_score ?? song.effective_molesti_score ?? '',`Voto ${song.title}`)}
              </div>`).join('')}
          </div>
          <div class="jm-public-fan-status"></div>
          <div class="jm-public-fan-actions"><button type="button" class="primary" data-finish>FINE</button></div>
        </div>`;

      const status = $('.jm-public-fan-status', ui.card);

      $('.jm-public-fan-close', ui.card).onclick = async () => {
        await postpone();
        ui.close();
        resolve(false);
      };

      $$('.jm-public-rating-row', ui.card).forEach(row => {
        const scale = $('.jm-public-rating-scale', row);
        bindScale(scale, $('.selected',scale)?.dataset.jmRating || '', async value => {
          try {
            await fanApi('catalog_vote',{
              song_id:row.dataset.songId,
              molesti_score:value,
              preserve_advanced:true
            });
          } catch (err) {
            status.textContent = err.message;
            throw err;
          }
        });
      });

      $('[data-finish]', ui.card).onclick = async () => {
        await fanApi('onboarding_step_complete',{step:'catalog'});
        ui.close();
        resolve(true);
      };
    });
  }

  async function runOnboarding({force=false,edit=false} = {}) {
    if (onboardingBusy) return false;
    onboardingBusy = true;

    try {
      let data = await fanApi('onboarding_status');

      if (edit) {
        return await questionnaire(data,{edit:true});
      }

      if (data.flow_completed && !force) return true;
      if (data.onboarding_state?.postponed_at && !force) return false;

      if (!data.onboarding_state?.intro_seen_at) {
        if (!await intro()) return false;
        data = await fanApi('onboarding_status');
      }

      if (!data.questionnaire) {
        if (!await questionnaire(data)) return false;
        data = await fanApi('onboarding_status');
      }

      if (!data.onboarding_state?.live_step_completed_at) {
        if (!await liveStep(data)) return false;
        data = await fanApi('onboarding_status');
      }

      if (!data.onboarding_state?.catalog_step_completed_at) {
        if (!await catalogStep()) return false;
      }

      return true;
    } catch (err) {
      console.warn('Onboarding pubblico non disponibile',err);
      toast(err.message || 'Questionario non disponibile','error');
      return false;
    } finally {
      onboardingBusy = false;
    }
  }

  async function waitForFanSession(timeout = 7000) {
    const start = performance.now();

    while (performance.now() - start < timeout) {
      if (localStorage.getItem('jm_public_fan_name')) {
        try {
          const data = await fanApi('onboarding_status');
          if (data && typeof data === 'object') return data;
        } catch {}
      }
      await new Promise(r=>setTimeout(r,120));
    }

    return null;
  }

  function patchLiveRatings(root = document) {
    const general = $('#concertGeneralScore',root);
    if (general && general.tagName === 'SELECT' && general.dataset.jmPatched !== '1') {
      general.dataset.jmPatched = '1';
      general.classList.add('jm-native-vote-hidden');

      const wrap = document.createElement('div');
      wrap.innerHTML = ratingScale(general.value || '','Voto generale al live');
      const scale = wrap.firstElementChild;
      general.insertAdjacentElement('afterend',scale);

      bindScale(scale,general.value || '',async value=>{
        general.value=String(value);
        general.dispatchEvent(new Event('input',{bubbles:true}));
      });
    }

    $$('.song-score',root).forEach(select=>{
      if (select.tagName !== 'SELECT' || select.dataset.jmPatched === '1') return;
      select.dataset.jmPatched='1';
      select.classList.add('jm-native-vote-hidden');

      const wrap=document.createElement('div');
      wrap.innerHTML=ratingScale(select.value || '','Voto performance');
      const scale=wrap.firstElementChild;
      select.insertAdjacentElement('afterend',scale);

      bindScale(scale,select.value || '',async value=>{
        select.value=String(value);
        select.dispatchEvent(new Event('input',{bubbles:true}));
      });
    });
  }

  function patchCatalogRatings(root = document) {
    $$('#fanCatalogList [data-fan-song]',root).forEach(card=>{
      if (card.dataset.jmVotePatched === '1') return;

      const range = $('.quick-range',card);
      if (!range) return;

      card.dataset.jmVotePatched='1';
      range.classList.add('jm-native-vote-hidden');

      const output = $('output',card);
      if (output) output.hidden = true;

      const currentText = output?.textContent?.trim() || '';
      const current = /^\d+$/.test(currentText) ? currentText : '';

      const wrap = document.createElement('div');
      wrap.innerHTML = ratingScale(current,'Voto rapido');
      const scale = wrap.firstElementChild;
      range.insertAdjacentElement('afterend',scale);

      bindScale(scale,current,async value=>{
        const songId=card.dataset.fanSong;
        if (!songId || catalogSaveBusy.has(songId)) return;

        catalogSaveBusy.add(songId);
        const previous=current;

        try {
          await fanApi('catalog_vote',{
            song_id:songId,
            molesti_score:value,
            preserve_advanced:true
          });

          range.value=String(value);
          if(output)output.textContent=String(value);
          card.dataset.jmSavedVote=String(value);
          toast('Voto salvato ✓','ok');
        } catch(err) {
          toast(err.message || 'Errore salvataggio voto','error');
          throw err;
        } finally {
          catalogSaveBusy.delete(songId);
        }
      });
    });
  }

  function patchAll() {
    patchFrame=0;
    patchLiveRatings(document);
    patchCatalogRatings(document);
  }

  function schedulePatch() {
    if (patchFrame) return;
    patchFrame=requestAnimationFrame(patchAll);
  }


  function openFanLoginModal() {
    document.getElementById('userEntry')?.click();
    setTimeout(() => document.getElementById('fanNameInput')?.focus(), 30);
  }

  function contactLinks() {
    const roots = [
      document.getElementById('contactsSocialActions'),
      document.getElementById('contactActions')
    ].filter(Boolean);
    const found = [];
    const seen = new Set();

    for (const root of roots) {
      root.querySelectorAll('a[href]').forEach(link => {
        const href = link.getAttribute('href') || '';
        if (!href || seen.has(href)) return;
        seen.add(href);
        const icon = link.querySelector('.contact-tile-icon,svg,img');
        const label = link.querySelector('strong')?.textContent?.trim()
          || link.getAttribute('aria-label')
          || link.getAttribute('title')
          || 'Contatto';
        found.push({
          href,
          label,
          icon: icon ? icon.outerHTML : '',
          external: link.getAttribute('target') === '_blank'
        });
      });
    }
    return found.slice(0,8);
  }

  function entryContacts() {
    return new Promise(resolve => {
      const ui = overlay();
      const links = contactLinks();
      ui.card.innerHTML = `
        <header class="jm-public-fan-head">
          <div><span class="section-kicker">BENVENUTO</span><h2>RESTIAMO IN CONTATTO</h2></div>
          <button class="jm-public-fan-close" type="button" aria-label="Chiudi">×</button>
        </header>
        <div class="jm-public-fan-body">
          <div class="jm-public-fan-copy">Qui trovi i canali ufficiali dei Molesti.</div>
          <div class="jm-public-entry-socials">
            ${links.map(item => `<a class="jm-public-entry-social" href="${esc(item.href)}" ${item.external?'target="_blank" rel="noopener noreferrer"':''}>${item.icon}<strong>${esc(item.label)}</strong></a>`).join('') || '<div class="jm-public-fan-note">Contatti disponibili nella sezione CONTATTI.</div>'}
          </div>
          <div class="jm-public-fan-actions"><button type="button" class="primary" data-next>CONTINUA</button></div>
        </div>`;
      const finish = () => { ui.close(); resolve(true); };
      $('.jm-public-fan-close',ui.card).onclick = finish;
      $('[data-next]',ui.card).onclick = finish;
    });
  }

  function entryFanChoice() {
    return new Promise(resolve => {
      const ui = overlay();
      ui.card.innerHTML = `
        <header class="jm-public-fan-head"><div><span class="section-kicker">AREA FAN</span><h2>SEI UN FAN?</h2></div></header>
        <div class="jm-public-fan-body">
          <div class="jm-public-fan-copy">Come fan puoi salvare “Ci sarò”, presenze, voti e preferenze. Altrimenti puoi visitare normalmente il sito come ospite.</div>
          <div class="jm-public-fan-actions">
            <button type="button" data-guest>CONTINUA COME OSPITE</button>
            <button type="button" class="primary" data-fan>REGISTRATI / ENTRA</button>
          </div>
        </div>`;
      $('[data-guest]',ui.card).onclick = () => { ui.close(); resolve('guest'); };
      $('[data-fan]',ui.card).onclick = () => { ui.close(); resolve('fan'); };
    });
  }

  function entryRecognizedFan(fan) {
    return new Promise(resolve => {
      const ui = overlay();
      const name = fan?.nickname || fan?.display_name || 'questo fan';
      ui.card.innerHTML = `
        <header class="jm-public-fan-head"><div><span class="section-kicker">DISPOSITIVO RICONOSCIUTO</span><h2>SEI ${esc(String(name).toUpperCase())}?</h2></div></header>
        <div class="jm-public-fan-body">
          <div class="jm-public-fan-copy">Questo dispositivo è già associato a <strong>${esc(name)}</strong>${fan?.group_name ? ` · ${esc(fan.group_name)}` : ''}.</div>
          <div class="jm-public-fan-actions">
            <button type="button" data-no>NO</button>
            <button type="button" class="primary" data-yes>SÌ, SONO IO</button>
          </div>
        </div>`;
      $('[data-no]',ui.card).onclick = () => { ui.close(); resolve(false); };
      $('[data-yes]',ui.card).onclick = () => { ui.close(); resolve(true); };
    });
  }

  function entryDifferentIdentity() {
    return new Promise(resolve => {
      const ui = overlay();
      ui.card.innerHTML = `
        <header class="jm-public-fan-head"><div><span class="section-kicker">DISPOSITIVO CONDIVISO</span><h2>COME VUOI ENTRARE?</h2></div></header>
        <div class="jm-public-fan-body">
          <div class="jm-public-fan-copy">Puoi usare un altro profilo fan oppure continuare come ospite senza modificare lo storico del fan ricordato.</div>
          <div class="jm-public-fan-actions">
            <button type="button" data-guest>OSPITE</button>
            <button type="button" class="primary" data-other>ALTRO FAN</button>
          </div>
        </div>`;
      $('[data-guest]',ui.card).onclick = () => { ui.close(); resolve('guest'); };
      $('[data-other]',ui.card).onclick = () => { ui.close(); resolve('other'); };
    });
  }

  function questionnaireOffer() {
    return new Promise(resolve => {
      const ui = overlay();
      ui.card.innerHTML = `
        <header class="jm-public-fan-head"><div><span class="section-kicker">PROFILO FAN</span><h2>VUOI FARE IL QUESTIONARIO?</h2></div></header>
        <div class="jm-public-fan-body">
          <div class="jm-public-fan-copy">Puoi farlo adesso oppure più avanti dal profilo. Se inizi ora, il flusso prosegue con preferenze, live e catalogo.</div>
          <div class="jm-public-fan-actions">
            <button type="button" data-later>PIÙ TARDI</button>
            <button type="button" class="primary" data-now>SÌ, ORA</button>
          </div>
        </div>`;
      $('[data-later]',ui.card).onclick = () => { ui.close(); resolve(false); };
      $('[data-now]',ui.card).onclick = () => { ui.close(); resolve(true); };
    });
  }

  async function afterFanLogin(data,{source='normal'}={}) {
    if (source === 'checkin') return;
    if (!data?.is_new) return;
    try {
      const status = await fanApi('onboarding_status');
      if (status.flow_completed) return;
      const now = await questionnaireOffer();
      if (!now) {
        await postpone();
        return;
      }
      if (!status.onboarding_state?.intro_seen_at) {
        await fanApi('onboarding_step_complete',{step:'intro'});
      }
      await runOnboarding({force:true});
    } catch (err) {
      console.warn('Offerta questionario non disponibile',err);
    }
  }

  async function runEntryIdentity() {
    if (identityFlowBusy || rawRoute() === 'checkin') return;
    if (sessionStorage.getItem('jm_entry_identity_done') === '1') return;
    if (document.getElementById('userEntry')?.classList.contains('is-member')) return;
    if (localStorage.getItem('jm_public_fan_name')) {
      sessionStorage.setItem('jm_entry_identity_done','1');
      return;
    }

    identityFlowBusy = true;
    try {
      if (HAD_DEVICE_AT_LOAD) {
        let state = null;
        try { state = await fanApi('device_status'); }
        catch (err) { console.warn('Riconoscimento dispositivo',err); }

        if (state?.recognized && state.fan) {
          const yes = await entryRecognizedFan(state.fan);
          if (yes) {
            localStorage.setItem('jm_public_fan_name',state.fan.display_name);
            sessionStorage.setItem('jm_entry_identity_done','1');
            location.reload();
            return;
          }

          const choice = await entryDifferentIdentity();
          if (choice === 'guest') {
            sessionStorage.setItem('jm_entry_guest','1');
            sessionStorage.setItem('jm_entry_identity_done','1');
            return;
          }

          await fanApi('device_forget');
          sessionStorage.setItem('jm_entry_identity_done','1');
          openFanLoginModal();
          return;
        }
      }

      await entryContacts();
      sessionStorage.setItem('jm_entry_contacts_seen','1');
      const choice = await entryFanChoice();
      sessionStorage.setItem('jm_entry_identity_done','1');
      if (choice === 'guest') {
        sessionStorage.setItem('jm_entry_guest','1');
        return;
      }
      openFanLoginModal();
    } finally {
      identityFlowBusy = false;
    }
  }

  function installVotingObserver() {
    const targets=[
      document.getElementById('concertModalBody'),
      document.getElementById('fanCatalogList')
    ].filter(Boolean);
    const obs=new MutationObserver(schedulePatch);
    targets.forEach(target=>obs.observe(target,{childList:true,subtree:true}));
    schedulePatch();
  }

  function installQuestionnaireRedirectGuard() {
    document.addEventListener('click',async e=>{
      const btn=e.target.closest?.('#openFanQuestionnaire');
      if(!btn)return;

      e.preventDefault();
      e.stopImmediatePropagation();

      const userModal=document.getElementById('userModal');
      if(userModal)userModal.hidden=true;

      const data=await waitForFanSession(2500);
      if(!data){
        toast('Sessione fan non disponibile','error');
        return;
      }

      await runOnboarding({
        force:true,
        edit:!!data.flow_completed
      });
    },true);
  }

  function installEntryIdentity() {
    const run=()=>runEntryIdentity().catch(err=>console.warn('Flusso ingresso fan',err));
    if(document.documentElement.classList.contains('jm-public-data-ready')) run();
    else window.addEventListener('jm:public-data-ready',run,{once:true});
  }

  function init() {
    ensureStyles();
    installVotingObserver();
    installQuestionnaireRedirectGuard();
    installEntryIdentity();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();

  window.JMPublicFanFlow = {
    onboarding: runOnboarding,
    patchVotes: patchAll,
    afterLogin: afterFanLogin,
    identity: runEntryIdentity
  };
})();
