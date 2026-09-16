(() => {
  'use strict';

  const SUPABASE_URL = 'https://etzwybamvfpeitkttwrc.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_CtyexwjoW375UXpjInOuDA_Uz28wWJx';
  const FAN_API = `${SUPABASE_URL}/functions/v1/fan-api`;
  const PUBLIC_VERSION = 'public v1.0';
  const LIVE_REVEAL_MINUTES = 5;
  const MEMBER_ADMINS = new Set(['ema', 'kekko']);
  const ROUTES = new Set(['home', 'tour', 'rankings', 'band', 'more']);
  const $ = id => document.getElementById(id);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  let sb;
  let currentFan = null;
  let currentMember = null;
  let guestPermissions = {};
  let fanPermissions = {};
  let concerts = [];
  let rankingData = null;
  let fanCatalog = [];
  let publicRealtime = null;
  let publicPoll = null;
  let activeConcertId = null;
  let expandedRankings = new Set();

  const CONTACTS = [
    // Esempio: {label:'INSTAGRAM', href:'https://instagram.com/...'},
    // Esempio: {label:'BOOKING', href:'mailto:...'}
  ];

  function esc(value) {
    return String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  }
  function dateParts(value) {
    if (!value) return {day:'—', month:'', year:''};
    const [y,m,d] = String(value).slice(0,10).split('-');
    const months = ['GEN','FEB','MAR','APR','MAG','GIU','LUG','AGO','SET','OTT','NOV','DIC'];
    return {day:d || '—', month:months[(Number(m)||1)-1] || '', year:y || ''};
  }
  function formatDate(value) {
    if (!value) return '—';
    const [y,m,d] = String(value).slice(0,10).split('-');
    return [d,m,y].filter(Boolean).join('/');
  }
  function formatTime(value) { return value ? String(value).slice(0,5) : ''; }
  function prettyPlace(c) { return [c?.venue, c?.city].filter(Boolean).join(' · '); }
  function concertStartMs(c) {
    if (c?.live_unlock_at) {
      const t = Date.parse(c.live_unlock_at);
      if (Number.isFinite(t)) return t;
    }
    if (!c?.concert_date) return NaN;
    const time = String(c.start_time || '21:30').slice(0,5);
    return Date.parse(`${String(c.concert_date).slice(0,10)}T${time}:00+02:00`);
  }
  function isLiveNow(c) {
    if (!c) return false;
    const start = concertStartMs(c);
    return c.status === 'confirmed' || (c.status === 'future' && Number.isFinite(start) && Date.now() >= start);
  }
  function statusInfo(c) {
    if (c?.status === 'cancelled') return ['ANNULLATO','cancelled'];
    if (c?.status === 'draft') return ['BOZZA','draft'];
    if (isLiveNow(c)) return ['LIVE','live'];
    if (c?.status === 'completed') return ['CONCLUSO','completed'];
    return ['FUTURO','future'];
  }
  function posterUrl(path) {
    if (!path || !sb) return null;
    try { return sb.storage.from('concert-posters').getPublicUrl(path).data.publicUrl || null; } catch { return null; }
  }
  function getFanDeviceToken() {
    let token = localStorage.getItem('jm_fan_device_token');
    if (!token) {
      token = crypto.randomUUID();
      localStorage.setItem('jm_fan_device_token', token);
    }
    return token;
  }
  function fanFingerprint() {
    return [navigator.userAgent, navigator.language, Intl.DateTimeFormat().resolvedOptions().timeZone, screen.width, screen.height, window.devicePixelRatio || 1].join('|');
  }
  async function fanApi(action, payload = {}) {
    const guest = payload?.guest === true;
    const body = guest ? {action, ...payload} : {action, device_token:getFanDeviceToken(), fingerprint:fanFingerprint(), ...payload};
    const res = await fetch(FAN_API, {
      method:'POST',
      headers:{'Content-Type':'application/json','apikey':SUPABASE_KEY,'Authorization':`Bearer ${SUPABASE_KEY}`},
      body:JSON.stringify(body)
    });
    let data = {};
    try { data = await res.json(); } catch {}
    if (!res.ok) throw new Error(data.error || `fan-api HTTP ${res.status}`);
    return data;
  }
  function can(role, key) {
    const map = role === 'fan' ? fanPermissions : guestPermissions;
    return Object.prototype.hasOwnProperty.call(map, key) ? !!map[key] : true;
  }
  function toast(message, type = '') {
    const node = document.createElement('div');
    node.className = `toast ${type}`;
    node.textContent = message;
    $('toastStack').appendChild(node);
    setTimeout(() => node.remove(), 3300);
  }
  function openModal(id) {
    const el = $(id);
    if (!el) return;
    el.hidden = false;
    document.documentElement.style.overflow = 'hidden';
  }
  function closeModal(id) {
    const el = $(id);
    if (!el) return;
    el.hidden = true;
    if (!$$('.modal:not([hidden])').length) document.documentElement.style.removeProperty('overflow');
  }

  function currentRole() {
    if (currentMember) return 'member';
    if (currentFan) return 'fan';
    return 'guest';
  }
  function currentRoute() {
    const route = location.hash.replace(/^#\/?/, '').split('/')[0] || 'home';
    return ROUTES.has(route) ? route : 'home';
  }
  function go(route) { location.hash = `#/${ROUTES.has(route) ? route : 'home'}`; }
  function applyRoute() {
    const route = currentRoute();
    $$('.page').forEach(p => p.classList.toggle('active', p.dataset.page === route));
    $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.route === route));
    renderContextRail(route);
    if (route === 'tour') renderTour();
    if (route === 'rankings') renderRankings();
    window.scrollTo({top:0, behavior:'instant'});
  }

  function renderContextRail(route) {
    const links = $('contextRailLinks');
    const configs = {
      home:[['PROSSIMO LIVE','homeNextShow'],['HOT RIGHT NOW','homeRankingPreview']],
      tour:[['PROSSIMI','upcomingBlock'],['ARCHIVIO','archiveBlock']],
      rankings:[['BRANI','songsRankingBlock'],['FAN','fansRankingBlock'],['CONCERTI','concertsRankingBlock']],
      band:[['MEMBRI','membersBlock'],['CONCEPT','conceptBlock']],
      more:[['MERCH','merchBlock'],['CONTATTI','contactsBlock'],['GESTIONALE','managementBlock']]
    };
    links.innerHTML = '';
    (configs[route] || []).forEach(([label,id]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.onclick = () => $(id)?.scrollIntoView({behavior:'smooth', block:'start'});
      links.appendChild(b);
    });
  }

  function updateUserUI() {
    const entry = $('userEntry');
    entry.classList.remove('is-fan','is-member');
    if (currentMember) {
      entry.classList.add('is-member');
      $('userEyebrow').textContent = MEMBER_ADMINS.has(String(currentMember.username || '').toLowerCase()) ? 'ADMIN' : 'MEMBRO';
      $('userLabel').textContent = currentMember.display_name || currentMember.username || 'BAND';
      $('memberRail').classList.remove('hidden');
      $('memberRailName').textContent = currentMember.display_name || currentMember.username || 'Membro';
    } else if (currentFan) {
      entry.classList.add('is-fan');
      $('userEyebrow').textContent = 'FAN';
      $('userLabel').textContent = currentFan.nickname || currentFan.display_name || 'FAN';
      $('memberRail').classList.add('hidden');
    } else {
      $('userEyebrow').textContent = 'AREA UTENTE';
      $('userLabel').textContent = 'LOGIN';
      $('memberRail').classList.add('hidden');
    }
  }

  function showLoginMode(mode) {
    $$('#loginSwitch [data-login-mode]').forEach(b => b.classList.toggle('active', b.dataset.loginMode === mode));
    $('fanLoginForm').classList.toggle('hidden', mode !== 'fan');
    $('memberLoginForm').classList.toggle('hidden', mode !== 'member');
  }
  function renderUserModal() {
    const logged = currentMember || currentFan;
    $('loginSwitch').classList.toggle('hidden', !!logged);
    $('fanLoginForm').classList.add('hidden');
    $('memberLoginForm').classList.add('hidden');
    const session = $('userSessionPanel');
    session.classList.toggle('hidden', !logged);
    if (!logged) {
      showLoginMode('fan');
      session.innerHTML = '';
      return;
    }
    if (currentMember) {
      const admin = MEMBER_ADMINS.has(String(currentMember.username || '').toLowerCase());
      session.innerHTML = `<div class="session-hero"><strong>${esc(currentMember.display_name || currentMember.username)}</strong><span>${admin ? 'Admin della band' : 'Membro della band'} · sessione condivisa con il gestionale</span></div><div class="session-actions"><a class="btn btn-primary wide" href="test.html">APRI GESTIONALE</a><button class="btn btn-ghost wide" type="button" data-session-logout="member">ESCI</button></div>`;
    } else {
      session.innerHTML = `<div class="session-hero"><strong>${esc(currentFan.nickname || currentFan.display_name)}</strong><span>Profilo fan attivo su questo dispositivo.</span></div><div class="session-actions"><button class="btn btn-primary" type="button" id="openFanCatalog">VOTA I BRANI</button><button class="btn btn-ghost" type="button" id="fanRecovery">RECUPERO</button><button class="btn btn-ghost wide" type="button" data-session-logout="fan">ESCI</button></div>`;
      $('openFanCatalog')?.addEventListener('click', () => { closeModal('userModal'); openFanCatalog(); });
      $('fanRecovery')?.addEventListener('click', setFanRecovery);
    }
    $$('[data-session-logout]', session).forEach(b => b.onclick = () => logout(b.dataset.sessionLogout));
  }
  async function setFanRecovery() {
    const value = window.prompt('Inserisci un nickname/parola di recupero (almeno 3 caratteri):');
    if (!value?.trim()) return;
    try { await fanApi('set_recovery', {recovery_type:'nickname', recovery_value:value.trim()}); toast('Dato di recupero aggiornato.','ok'); }
    catch (err) { toast(err.message,'error'); }
  }

  async function resolvePossibleFanMatches(data) {
    const matches = data?.possible_matches || [];
    if (!matches.length) return data;
    const names = matches.map((m,i) => `${i+1}. ${m.fan_name}${m.fan_since ? ` — fan dal ${formatDate(m.fan_since)}` : ''}`).join('\n');
    const choice = window.prompt(`Abbiamo trovato profili simili. Digita il numero del tuo profilo, oppure annulla per continuare come nuovo fan:\n\n${names}`);
    const idx = Number(choice) - 1;
    if (!Number.isInteger(idx) || idx < 0 || idx >= matches.length) return data;
    const target = matches[idx];
    let recovery = null;
    if (target.has_recovery) {
      recovery = window.prompt(`Inserisci il dato di recupero del profilo “${target.fan_name}”:`);
      if (recovery == null) return data;
    }
    const result = await fanApi('claim_candidate', {target_fan_id:target.fan_id, recovery_value:recovery});
    if (result.merged) return {...data, fan:result.fan, possible_matches:[]};
    toast(result.message || 'Richiesta di unificazione inviata agli admin.');
    return data;
  }

  async function loginFan(name) {
    let data = await fanApi('enter', {display_name:name});
    data = await resolvePossibleFanMatches(data);
    currentFan = data.fan || data;
    localStorage.setItem('jm_public_fan_name', currentFan.display_name || name);
    const perms = await fanApi('permissions');
    fanPermissions = perms.permissions || {};
    currentMember = null;
    updateUserUI();
    startRealtime();
    await Promise.all([loadConcerts(true), loadRankings(true)]);
    renderHome(); renderTour(); renderRankings();
    return data;
  }
  async function loginMember(username, password) {
    username = String(username || '').trim().toLowerCase();
    if (!username) throw new Error('Inserisci lo username.');
    if (String(password || '').length < 6) throw new Error('La password deve contenere almeno 6 caratteri.');
    const {data:members,error:me} = await sb.rpc('check_member',{p_username:username});
    if (me) throw me;
    if (!members?.length) throw new Error('Username non riconosciuto.');
    const member = members[0];
    const email = `${username}@johnimolesti.app`;
    if (!member.activated) {
      const {data:su,error:se} = await sb.auth.signUp({email,password});
      if (se) {
        const {error:si} = await sb.auth.signInWithPassword({email,password});
        if (si) throw se;
      } else if (!su.session) throw new Error('Supabase richiede la conferma email.');
      const {error:ce} = await sb.rpc('claim_member',{p_username:username});
      if (ce) throw ce;
    } else {
      const {error:si} = await sb.auth.signInWithPassword({email,password});
      if (si) throw new Error('Password errata.');
    }
    await restoreMemberSession();
  }
  async function restoreMemberSession() {
    const {data:{user}} = await sb.auth.getUser();
    if (!user) return false;
    const {data:profile,error} = await sb.from('profiles').select('*').eq('id',user.id).single();
    if (error) throw error;
    currentMember = profile;
    currentFan = null;
    updateUserUI();
    return true;
  }
  async function logout(type) {
    if (type === 'member') { await sb.auth.signOut(); currentMember = null; }
    if (type === 'fan') { currentFan = null; localStorage.removeItem('jm_public_fan_name'); }
    updateUserUI();
    renderUserModal();
    closeModal('userModal');
    await Promise.all([loadConcerts(true), loadRankings(true)]);
    renderHome(); renderTour(); renderRankings();
  }

  async function loadPermissions() {
    try {
      const data = await fanApi('permissions',{guest:true});
      guestPermissions = data.permissions || {};
    } catch (err) {
      console.warn('Permessi guest non disponibili', err);
      guestPermissions = {};
    }
  }
  async function loadConcerts(force = false) {
    if (concerts.length && !force) return concerts;
    try {
      const data = currentFan ? await fanApi('list_concerts') : await fanApi('list_concerts',{guest:true});
      concerts = (data.concerts || []).filter(c => !c.private_show);
      concerts.sort((a,b) => String(b.concert_date).localeCompare(String(a.concert_date)) || String(b.start_time || '').localeCompare(String(a.start_time || '')));
      return concerts;
    } catch (err) {
      console.error(err); toast(`Concerti non disponibili: ${err.message}`,'error'); concerts = []; return concerts;
    }
  }
  async function loadRankings(force = false) {
    if (rankingData && !force) return rankingData;
    const role = currentFan ? 'fan' : 'guest';
    if (!can(role,'rankings_view')) {
      rankingData = {fans:[],songs:[],concerts:[],blocked:true};
      return rankingData;
    }
    try {
      rankingData = currentFan ? await fanApi('rankings') : await fanApi('rankings',{guest:true});
      return rankingData;
    } catch (err) {
      console.error(err); rankingData = {fans:[],songs:[],concerts:[],error:err.message}; return rankingData;
    }
  }

  function upcomingConcerts() {
    const now = Date.now();
    return concerts.filter(c => c.status !== 'completed' && c.status !== 'cancelled' && (!Number.isFinite(concertStartMs(c)) || concertStartMs(c) >= now - 6*60*60*1000)).sort((a,b) => concertStartMs(a)-concertStartMs(b));
  }
  function pastConcerts() {
    return concerts.filter(c => c.status === 'completed' || (Number.isFinite(concertStartMs(c)) && concertStartMs(c) < Date.now() - 6*60*60*1000)).sort((a,b) => concertStartMs(b)-concertStartMs(a));
  }
  function nextConcert() { return upcomingConcerts()[0] || null; }

  function renderRailNextShow() {
    const box = $('railNextShow');
    const c = nextConcert();
    if (!c) { box.innerHTML = '<span class="rail-kicker">NEXT SHOW</span><p>Nessuna data futura pubblicata.</p>'; return; }
    const d = dateParts(c.concert_date);
    box.innerHTML = `<span class="rail-kicker">NEXT SHOW</span><div class="rail-next-date">${d.day} ${d.month}</div><div class="rail-next-name">${esc(c.name)}</div><div class="rail-next-place">${esc(prettyPlace(c))}${c.start_time ? ` · ${esc(formatTime(c.start_time))}` : ''}</div><button class="rail-action text-button" type="button" data-open-concert="${esc(c.id)}">DETTAGLI →</button>`;
    box.querySelector('[data-open-concert]')?.addEventListener('click',() => openConcert(c.id));
  }
  function renderHome() {
    const nextBox = $('homeNextShow');
    const c = nextConcert();
    if (!c) nextBox.innerHTML = '<div class="section-kicker">PROSSIMO CONCERTO</div><div class="empty-state">Nessuna data futura pubblicata.</div>';
    else {
      const d = dateParts(c.concert_date);
      nextBox.innerHTML = `<div class="section-kicker">PROSSIMO CONCERTO</div><div class="next-show-main"><div class="next-show-date"><strong>${d.day}</strong><span>${d.month} ${d.year}</span></div><div class="next-show-copy"><h3>${esc(c.name)}</h3><p>${esc(prettyPlace(c))}${c.start_time ? ` · ${esc(formatTime(c.start_time))}` : ''}</p></div><button class="btn btn-primary" type="button">DETTAGLI</button></div>`;
      nextBox.querySelector('button').onclick = () => openConcert(c.id);
    }
    const preview = $('homeRankingPreview');
    const songs = rankingData?.songs || [];
    preview.innerHTML = `<div class="section-kicker">HOT RIGHT NOW</div><div class="mini-ranking">${songs.slice(0,4).map((r,i)=>`<div class="mini-rank-row"><span>#${i+1}</span><b>${esc(r.title)}</b><strong>${esc(r.ranking_score ?? '—')}</strong></div>`).join('') || '<div class="empty-state">Classifica non disponibile.</div>'}</div>`;
    renderRailNextShow();
  }

  function concertCardHtml(c) {
    const d = dateParts(c.concert_date), [status, cls] = statusInfo(c);
    return `<article class="concert-card" data-concert-id="${esc(c.id)}"><div class="concert-date-block"><strong>${d.day}</strong><span>${d.month} ${d.year}</span></div><div class="concert-card-main"><h4>${esc(c.name)}</h4><div class="concert-meta-line"><b>${esc(prettyPlace(c) || 'Venue da definire')}</b>${c.start_time ? `<br>${esc(formatTime(c.start_time))}` : ''}${c.event_mode ? ` · ${esc(String(c.event_mode).toUpperCase())}` : ''}</div><span class="status-pill status-${cls}">${status}</span></div></article>`;
  }
  function pastRowHtml(c) {
    const [status, cls] = statusInfo(c);
    return `<article class="concert-row" data-concert-id="${esc(c.id)}"><div class="concert-row-date">${formatDate(c.concert_date)}</div><div><h4>${esc(c.name)}</h4><p>${esc(prettyPlace(c))}</p></div><span class="status-pill status-${cls}">${status}</span></article>`;
  }
  function bindConcertClicks(root) { $$('[data-concert-id]', root).forEach(n => n.onclick = () => openConcert(n.dataset.concertId)); }
  function renderTour() {
    const up = upcomingConcerts(), past = pastConcerts();
    $('upcomingCount').textContent = `${up.length} date`;
    $('pastCount').textContent = `${past.length} live`;
    $('upcomingConcerts').innerHTML = up.map(concertCardHtml).join('') || '<div class="empty-state">Nessuna data futura pubblicata.</div>';
    $('pastConcerts').innerHTML = past.map(pastRowHtml).join('') || '<div class="empty-state">Archivio non disponibile.</div>';
    bindConcertClicks($('upcomingConcerts')); bindConcertClicks($('pastConcerts'));
  }

  function rankingSongRow(r, i) {
    const artists = [r.base_artist, r.lyrics_artist].filter(Boolean).join(' / ');
    return `<div class="ranking-row"><div class="ranking-pos">${i+1}</div><div class="ranking-main"><div class="ranking-title">${esc(r.title)}</div><div class="ranking-meta">${esc(artists || '')}</div></div><div class="ranking-score">${esc(r.ranking_score ?? '—')}<small>SCORE</small></div></div>`;
  }
  function rankingFanRow(r, i) {
    const self = currentFan?.id && currentFan.id === r.fan_id;
    return `<div class="ranking-row${self ? ' self' : ''}"><div class="ranking-pos">${esc(r.ranking_position ?? i+1)}</div><div class="ranking-main"><div class="ranking-title">${esc(String(r.fan_name || '').toUpperCase())}${self ? ' · TU' : ''}</div><div class="ranking-meta">${Number(r.attendance_count || 0)} presenze</div></div><div class="ranking-score">${esc(r.points ?? 0)}<small>PT</small></div></div>`;
  }
  function rankingConcertRow(r, i) {
    const name = r.concert_name || r.name || `Live ${formatDate(r.concert_date)}`;
    const score = r.score ?? r.rating ?? r.avg_score ?? r.average_score ?? '—';
    return `<div class="ranking-row" data-ranking-concert="${esc(r.concert_id || r.id || '')}"><div class="ranking-pos">${i+1}</div><div class="ranking-main"><div class="ranking-title">${esc(name)}</div><div class="ranking-meta">${esc(formatDate(r.concert_date))}${r.attendance_count != null ? ` · ${Number(r.attendance_count)} presenze` : ''}</div></div><div class="ranking-score">${esc(score)}<small>LIVE</small></div></div>`;
  }
  function renderRankings() {
    const data = rankingData || {};
    if (data.blocked) {
      ['songsRanking','fansRanking','concertsRanking'].forEach(id => $(id).innerHTML = '<div class="empty-state">Classifiche non abilitate per questo accesso.</div>');
      return;
    }
    if (data.error) {
      ['songsRanking','fansRanking','concertsRanking'].forEach(id => $(id).innerHTML = `<div class="empty-state">Errore: ${esc(data.error)}</div>`);
      return;
    }
    const limit = key => expandedRankings.has(key) ? Infinity : 8;
    $('songsRanking').innerHTML = (data.songs || []).slice(0,limit('songs')).map(rankingSongRow).join('') || '<div class="empty-state">Classifica brani non disponibile.</div>';
    $('fansRanking').innerHTML = (data.fans || []).slice(0,limit('fans')).map(rankingFanRow).join('') || '<div class="empty-state">Classifica fan non disponibile.</div>';
    $('concertsRanking').innerHTML = (data.concerts || []).slice(0,limit('concerts')).map(rankingConcertRow).join('') || '<div class="empty-state">Classifica concerti non disponibile.</div>';
    $$('[data-ranking-concert]', $('concertsRanking')).forEach(row => { if (row.dataset.rankingConcert) row.onclick = () => openConcert(row.dataset.rankingConcert); });
    $$('[data-expand-ranking]').forEach(btn => {
      const key = btn.dataset.expandRanking;
      const expanded = expandedRankings.has(key);
      btn.textContent = expanded ? 'RIDUCI' : 'MOSTRA TUTTI';
      btn.closest('.ranking-panel')?.classList.toggle('expanded', expanded);
    });
  }

  function contactRender() {
    const box = $('contactActions');
    if (!CONTACTS.length) { box.innerHTML = '<span class="muted-inline">Canali in aggiornamento.</span>'; return; }
    box.innerHTML = CONTACTS.map(c => `<a class="btn btn-ghost" href="${esc(c.href)}" target="_blank" rel="noopener">${esc(c.label)}</a>`).join('');
  }

  function revealCount(c, total) {
    if (!total) return 0;
    if (c.status !== 'future') return total;
    const start = concertStartMs(c);
    if (!Number.isFinite(start) || Date.now() < start) return 0;
    return Math.min(total, 1 + Math.floor((Date.now() - start) / (LIVE_REVEAL_MINUTES * 60 * 1000)));
  }
  function executionDivider(type) {
    const labels = {planned:'SCALETTA',request:'RICHIESTE',bis:'BIS',recovery:'RECUPERO',skipped:'SALTATI',truncated:'INTERROTTI'};
    return `<div class="execution-divider">${esc(labels[type] || String(type || '').toUpperCase())}</div>`;
  }
  function liveSongRow(song, i, editable, hidden) {
    const score = song.my_vote?.molesti_score ?? '';
    const rx = song.my_reactions || {};
    return `<div class="concert-song-row${hidden ? ' is-hidden' : ''}" data-live-song="${esc(song.id)}"><div class="concert-song-pos">${i+1}</div><div><div class="concert-song-title">${esc(song.title)}</div><div class="concert-song-meta">${esc([song.base_artist ? `Base: ${song.base_artist}` : '',song.lyrics_artist ? `Testo: ${song.lyrics_artist}` : ''].filter(Boolean).join(' · '))}</div></div>${editable ? `<div class="song-vote-controls"><select class="score-select song-score" aria-label="Voto performance"><option value="">Voto</option>${Array.from({length:10},(_,n)=>`<option value="${n+1}" ${Number(score)===n+1?'selected':''}>${n+1}</option>`).join('')}</select><label class="reaction-chip"><input type="checkbox" class="rx-pogo" ${rx.pogo?'checked':''}>POGO</label><label class="reaction-chip"><input type="checkbox" class="rx-sang" ${rx.sang_along?'checked':''}>CANTA</label><label class="reaction-chip"><input type="checkbox" class="rx-enjoy" ${rx.enjoyed?'checked':''}>TOP</label></div>` : ''}</div>`;
  }
  async function openConcert(id) {
    activeConcertId = id;
    openModal('concertModal');
    $('concertModalTitle').textContent = 'Concerto';
    $('concertModalBody').innerHTML = '<div class="empty-state" style="padding:28px 18px">Caricamento…</div>';
    try {
      const data = currentFan ? await fanApi('concert_detail',{concert_id:id}) : await fanApi('concert_detail',{concert_id:id,guest:true});
      const c = data.concert || concerts.find(x => x.id === id) || {};
      $('concertModalTitle').textContent = c.name || 'Concerto';
      const [status, cls] = statusInfo(c);
      const poster = posterUrl(c.poster_path);
      const role = currentFan ? 'fan' : 'guest';
      const canSeeSetlist = can(role,'concert_setlist_view');
      const started = isLiveNow(c) || c.status === 'completed';
      const canAttend = !!currentFan && started;
      const canVote = !!currentFan && !!data.voting_open && !!data.attended;
      let html = `<div class="concert-detail-top"><div class="concert-detail-meta"><span class="status-pill status-${cls}">${status}</span><p><strong>${esc(formatDate(c.concert_date))}${c.start_time ? ` · ${esc(formatTime(c.start_time))}` : ''}</strong><br>${esc(prettyPlace(c))}${c.event_mode ? ` · ${esc(String(c.event_mode).toUpperCase())}` : ''}</p></div>${poster ? `<img class="concert-poster" src="${esc(poster)}" alt="Locandina ${esc(c.name)}">` : ''}</div>`;
      if (canAttend) {
        html += `<div class="fan-live-tools"><div class="attendance-toggle"><label><input id="fanAttendanceToggle" type="checkbox" ${data.attended?'checked':''}> IO C’ERO</label><span class="save-indicator">${data.attended ? 'Presenza registrata' : 'Segna la presenza per votare'}</span></div>${data.attended && data.voting_open ? `<div class="general-score"><span>Voto generale al live</span><select id="concertGeneralScore" class="score-select"><option value="">—</option>${Array.from({length:10},(_,n)=>`<option value="${n+1}" ${Number(data.my_concert_rating)===n+1?'selected':''}>${n+1}</option>`).join('')}</select></div>` : ''}</div>`;
      }
      if (!data.setlist_available || !canSeeSetlist) {
        html += `<div class="setlist-lock"><strong>${!canSeeSetlist ? 'Scaletta non disponibile per questo accesso.' : 'Scaletta ancora segreta.'}</strong>${canSeeSetlist && c.start_time ? `<br>Sarà svelata dalle ${esc(formatTime(c.start_time))}, durante il live.` : ''}</div>`;
      } else {
        const songs = data.songs || [];
        const reveal = revealCount(c, songs.length);
        let prevType = null;
        html += '<div class="concert-setlist">';
        songs.forEach((song,i) => {
          const type = song.execution_type || 'planned';
          if (type !== prevType) { html += executionDivider(type); prevType = type; }
          html += liveSongRow(song,i,canVote,c.status === 'future' && i >= reveal);
        });
        html += songs.length ? '</div>' : '<div class="empty-state" style="padding:20px">Nessun brano disponibile.</div></div>';
        if (c.status === 'future' && reveal < songs.length) html += `<div class="setlist-lock">Brani svelati: <strong>${reveal}/${songs.length}</strong>. Il resto compare progressivamente durante il live.</div>`;
        if (canVote) html += '<div class="live-feedback-actions"><button id="saveLiveFeedback" class="btn btn-primary" type="button">SALVA VOTI LIVE</button></div>';
      }
      $('concertModalBody').innerHTML = html;
      $('fanAttendanceToggle')?.addEventListener('change', async e => {
        const checked = e.target.checked;
        e.target.disabled = true;
        try {
          const r = await fanApi('attend',{concert_id:id,attended:checked});
          toast(r.message || (checked ? 'Presenza registrata.' : 'Presenza rimossa.'),'ok');
          await openConcert(id);
          await loadRankings(true); renderRankings(); renderHome();
        } catch (err) { e.target.checked = !checked; toast(err.message,'error'); }
        finally { e.target.disabled = false; }
      });
      $('saveLiveFeedback')?.addEventListener('click', () => saveLiveFeedback(id));
    } catch (err) {
      $('concertModalBody').innerHTML = `<div class="empty-state" style="padding:28px 18px">${esc(err.message)}</div>`;
    }
  }
  async function saveLiveFeedback(concertId) {
    const rows = $$('[data-live-song]', $('concertModalBody')).map(row => ({
      song_id:row.dataset.liveSong,
      performance_score:row.querySelector('.song-score')?.value || null,
      pogo:!!row.querySelector('.rx-pogo')?.checked,
      sang_along:!!row.querySelector('.rx-sang')?.checked,
      enjoyed:!!row.querySelector('.rx-enjoy')?.checked
    }));
    const performance = $('concertGeneralScore')?.value || null;
    const btn = $('saveLiveFeedback');
    if (btn) { btn.disabled = true; btn.textContent = 'SALVATAGGIO…'; }
    try {
      await fanApi('save_live_feedback',{concert_id:concertId,performance_score:performance,songs:rows});
      toast('Voti live salvati.','ok');
      await loadRankings(true); renderRankings(); renderHome();
    } catch (err) { toast(err.message,'error'); }
    finally { if (btn) { btn.disabled = false; btn.textContent = 'SALVA VOTI LIVE'; } }
  }

  async function openFanCatalog() {
    if (!currentFan) { renderUserModal(); openModal('userModal'); return; }
    openModal('fanAreaModal');
    $('fanCatalogList').innerHTML = '<div class="empty-state">Caricamento…</div>';
    try {
      const data = await fanApi('catalog');
      fanCatalog = data.songs || [];
      renderFanCatalog();
    } catch (err) { $('fanCatalogList').innerHTML = `<div class="empty-state">${esc(err.message)}</div>`; }
  }
  function option10(value, label='—') {
    return `<option value="">${label}</option>${Array.from({length:10},(_,n)=>`<option value="${n+1}" ${Number(value)===n+1?'selected':''}>${n+1}</option>`).join('')}`;
  }
  function renderFanCatalog() {
    const q = String($('fanCatalogSearch').value || '').trim().toLowerCase();
    const rows = fanCatalog.filter(s => !q || [s.title,s.base_artist,s.lyrics_artist].some(v => String(v || '').toLowerCase().includes(q)));
    $('fanCatalogCount').textContent = `${rows.length} brani`;
    $('fanCatalogList').innerHTML = rows.map(s => {
      const mol = s.my_vote?.molesti_score ?? s.effective_molesti_score ?? '';
      return `<article class="fan-song-card" data-fan-song="${esc(s.id)}"><div class="fan-song-main"><div><div class="fan-song-title">${esc(s.title)}</div><div class="fan-song-meta">${esc([s.base_artist ? `Base: ${s.base_artist}` : '',s.lyrics_artist ? `Testo: ${s.lyrics_artist}` : ''].filter(Boolean).join(' · '))}</div></div><div class="fan-song-quick"><input class="quick-range" type="range" min="1" max="10" step="1" value="${mol || 5}"><output>${mol || '—'}</output></div><button class="fan-song-toggle" type="button" aria-label="Dettagli">+</button></div><div class="fan-song-advanced"><div class="advanced-field"><label>Voto Base</label><select class="adv-base">${option10(s.my_vote?.base_score)}</select></div><div class="advanced-field"><label>Voto Testo</label><select class="adv-lyrics">${option10(s.my_vote?.lyrics_score)}</select></div><div class="advanced-field"><label>Conoscenza Base</label><select class="adv-base-fam">${option10(s.base_familiarity,'Non indicata')}</select></div><div class="advanced-field"><label>Conoscenza Testo</label><select class="adv-lyrics-fam">${option10(s.lyrics_familiarity,'Non indicata')}</select></div><div class="advanced-save"><button class="btn btn-ghost save-advanced" type="button">SALVA DETTAGLI</button></div></div></article>`;
    }).join('') || '<div class="empty-state">Nessun brano trovato.</div>';
    $$('[data-fan-song]', $('fanCatalogList')).forEach(card => bindFanSongCard(card));
  }
  function bindFanSongCard(card) {
    const id = card.dataset.fanSong;
    const song = fanCatalog.find(s => s.id === id);
    const range = card.querySelector('.quick-range'), output = card.querySelector('output');
    let timer;
    range.addEventListener('input', () => { output.textContent = range.value; clearTimeout(timer); timer = setTimeout(async () => {
      try { await fanApi('catalog_vote',{song_id:id,molesti_score:Number(range.value),preserve_advanced:true}); output.textContent = range.value; toast(`${song?.title || 'Brano'}: voto salvato.`, 'ok'); await loadRankings(true); }
      catch (err) { toast(err.message,'error'); }
    }, 450); });
    card.querySelector('.fan-song-toggle').onclick = () => card.classList.toggle('open');
    card.querySelector('.save-advanced').onclick = async () => {
      const payload = {
        song_id:id,
        molesti_score:Number(range.value),
        base_score:card.querySelector('.adv-base').value || null,
        lyrics_score:card.querySelector('.adv-lyrics').value || null,
        base_familiarity:card.querySelector('.adv-base-fam').value || null,
        lyrics_familiarity:card.querySelector('.adv-lyrics-fam').value || null
      };
      try { await fanApi('catalog_vote',payload); toast('Dettagli salvati.','ok'); await loadRankings(true); renderRankings(); renderHome(); }
      catch (err) { toast(err.message,'error'); }
    };
  }

  function startRealtime() {
    stopRealtime();
    try {
      publicRealtime = sb.channel('jm-public-site').on('postgres_changes',{event:'*',schema:'public',table:'concerts'},scheduleRealtimeRefresh).on('postgres_changes',{event:'*',schema:'public',table:'concert_setlist_items'},scheduleRealtimeRefresh).subscribe();
    } catch (err) { console.warn('Realtime non disponibile',err); }
    publicPoll = setInterval(() => {
      if (currentRoute() === 'tour' || activeConcertId) scheduleRealtimeRefresh();
    }, 10000);
  }
  function stopRealtime() {
    if (publicRealtime) { try { sb.removeChannel(publicRealtime); } catch {} publicRealtime = null; }
    if (publicPoll) { clearInterval(publicPoll); publicPoll = null; }
  }
  function scheduleRealtimeRefresh() {
    clearTimeout(scheduleRealtimeRefresh.t);
    scheduleRealtimeRefresh.t = setTimeout(async () => {
      await loadConcerts(true); renderHome(); renderTour();
      if (activeConcertId && !$('concertModal').hidden) openConcert(activeConcertId);
    }, 250);
  }

  function bindStaticEvents() {
    window.addEventListener('hashchange', applyRoute);
    $$('.nav-item').forEach(b => b.onclick = () => go(b.dataset.route));
    $$('[data-go]').forEach(b => b.onclick = () => go(b.dataset.go));
    $('userEntry').onclick = () => { renderUserModal(); openModal('userModal'); };
    $$('[data-close-modal]').forEach(n => n.onclick = () => closeModal(n.dataset.closeModal));
    document.addEventListener('keydown', e => { if (e.key === 'Escape') { const open = $$('.modal:not([hidden])').at(-1); if (open) closeModal(open.id); } });
    $$('#loginSwitch [data-login-mode]').forEach(b => b.onclick = () => showLoginMode(b.dataset.loginMode));
    $('fanLoginForm').addEventListener('submit', async e => {
      e.preventDefault(); const name = $('fanNameInput').value.trim(); const msg = $('fanLoginMessage');
      if (!name) return; msg.textContent = 'Accesso in corso…';
      try { await loginFan(name); msg.textContent = ''; closeModal('userModal'); toast(`Ciao ${currentFan.nickname || currentFan.display_name}.`,'ok'); }
      catch (err) { msg.textContent = err.message; }
    });
    $('memberLoginForm').addEventListener('submit', async e => {
      e.preventDefault(); const msg = $('memberLoginMessage'); msg.textContent = 'Accesso in corso…';
      try { await loginMember($('memberUsernameInput').value,$('memberPasswordInput').value); msg.textContent=''; closeModal('userModal'); toast(`Accesso band: ${currentMember.display_name || currentMember.username}.`,'ok'); }
      catch (err) { msg.textContent = err.message; }
    });
    $('fanCatalogSearch').addEventListener('input', renderFanCatalog);
    $$('[data-expand-ranking]').forEach(btn => btn.onclick = () => {
      const key = btn.dataset.expandRanking;
      if (expandedRankings.has(key)) expandedRankings.delete(key); else expandedRankings.add(key);
      renderRankings();
    });
  }

  async function init() {
    $('siteVersion').textContent = PUBLIC_VERSION;
    if (!window.supabase?.createClient) {
      toast('Libreria Supabase non disponibile. Ricarica la pagina.','error');
      return;
    }
    sb = window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
    bindStaticEvents();
    contactRender();
    await loadPermissions();
    try {
      const {data:{session}} = await sb.auth.getSession();
      if (session?.user) await restoreMemberSession();
    } catch (err) { console.warn('Sessione membro non ripristinata',err); }
    if (!currentMember) {
      const savedName = localStorage.getItem('jm_public_fan_name');
      if (savedName) {
        try { await loginFan(savedName); }
        catch (err) { console.warn('Sessione fan non ripristinata',err); currentFan = null; }
      }
    }
    updateUserUI();
    await Promise.all([loadConcerts(),loadRankings()]);
    renderHome(); renderTour(); renderRankings(); renderRailNextShow();
    if (!location.hash) history.replaceState(null,'','#/home');
    applyRoute();
    startRealtime();
  }

  window.addEventListener('DOMContentLoaded', init);
})();

