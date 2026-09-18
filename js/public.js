(() => {
  'use strict';

  const SUPABASE_URL = 'https://etzwybamvfpeitkttwrc.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_CtyexwjoW375UXpjInOuDA_Uz28wWJx';
  const FAN_API = `${SUPABASE_URL}/functions/v1/fan-api`;
  const PUBLIC_VERSION = 'public v1.1';
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
  let siteNews = [], contacts = [];
  let memberMedia = [];
  let memberCarouselIndex = 0;
  let fanOnboardingStatus = null;
  let highlightSignature = '', concertRequest = 0, lastConcertData = null;
  let refreshBusy = false, concertDirty = false;

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
    if (c?.status === 'cancelled') return [window.JMCopy.text('ui.7c4cdbbd8b93'),'cancelled'];
    if (c?.status === 'draft') return [window.JMCopy.text('ui.227e03417c14'),'draft'];
    if (isLiveNow(c)) return [window.JMCopy.text('ui.6990f01ad9d2'),'live'];
    if (c?.status === 'completed') return [window.JMCopy.text('ui.d407119b470e'),'completed'];
    return [window.JMCopy.text('ui.febe044b4b81'),'future'];
  }
  function posterUrl(path) {
    if (!path || !sb) return null;
    try { return sb.storage.from('concert-posters').getPublicUrl(path).data.publicUrl || null; } catch { return null; }
  }
  function publicSiteAssetUrl(path) {
    if (!path || !sb) return null;
    try { return sb.storage.from('public-site').getPublicUrl(path).data.publicUrl || null; } catch { return null; }
  }
  async function loadMemberMedia() {
    try {
      const {data,error} = await sb.from('public_site_content').select('content_key,content_type,value').like('content_key','band.member.%');
      if (error) throw error;
      const bySlot = new Map();
      (data || []).forEach(row => {
        const match = String(row.content_key || '').match(/^band\.member\.(\d+)\.(name|role|image)$/);
        if (!match) return;
        const slot = Number(match[1]);
        if (!bySlot.has(slot)) bySlot.set(slot,{slot});
        bySlot.get(slot)[match[2]] = row.value || '';
      });
      memberMedia = [...bySlot.values()].filter(x => x.slot >= 1 && x.slot <= 5).sort((a,b) => a.slot-b.slot);
    } catch (err) {
      console.warn('Foto membri non disponibili',err);
      memberMedia = [];
    }
    renderMemberMedia();
    return memberMedia;
  }
  function renderMemberMedia() {
    const fallback = [
      {slot:1,name:'KEKKO',role:'Chitarra'},
      {slot:2,name:'EMA',role:'Batteria'},
      {slot:3,name:'GIANNI',role:'Voce'},
      {slot:4,name:'CARLO',role:'Basso'},
      {slot:5,name:'ALE LAZZA',role:'Chitarra'}
    ];
    const members = fallback.map(base => ({...base,...(memberMedia.find(x=>x.slot===base.slot)||{})}));
    const grid = $('memberGrid');
    if (grid) grid.innerHTML = members.map((m,i) => {
      const src = publicSiteAssetUrl(m.image);
      const avatar = src ? `<div class="member-avatar has-photo"><img src="${esc(src)}" alt="${esc(m.name)}" loading="lazy"></div>` : `<div class="member-avatar">${esc(String(m.name || '?').charAt(0))}</div>`;
      return `<article class="member-card glass-card"><span class="member-no">${String(i+1).padStart(2,'0')}</span>${avatar}<h4>${esc(String(m.name||'').toUpperCase())}</h4><p>${esc(m.role||'John & i Molesti')}</p></article>`;
    }).join('');
    const photos = members.map(m => ({...m,src:publicSiteAssetUrl(m.image)})).filter(m => m.src);
    const carousel = $('homeMemberCarousel'), stage = $('memberCarouselStage');
    if (!carousel || !stage) return;
    carousel.classList.toggle('hidden',!photos.length);
    memberCarouselIndex = photos.length ? Math.min(memberCarouselIndex,photos.length-1) : 0;
    stage.innerHTML = photos.map((m,i)=>`<figure class="member-carousel-slide${i===memberCarouselIndex?' active':''}"><img src="${esc(m.src)}" alt="${esc(m.name)}"><figcaption class="member-carousel-caption">${esc(String(m.name||'').toUpperCase())} · ${esc(m.role||'')}</figcaption></figure>`).join('');
  }
  function moveMemberCarousel(delta) {
    const slides = $$('.member-carousel-slide',$('memberCarouselStage'));
    if (!slides.length) return;
    memberCarouselIndex = (memberCarouselIndex + delta + slides.length) % slides.length;
    slides.forEach((slide,i)=>slide.classList.toggle('active',i===memberCarouselIndex));
  }
  function openMemberPhotoManager() {
    if (!currentMember || !MEMBER_ADMINS.has(String(currentMember.username||'').toLowerCase())) return;
    const members = [1,2,3,4,5].map(slot => memberMedia.find(x=>x.slot===slot) || {slot,name:`Membro ${slot}`,role:''});
    const overlay = document.createElement('div');
    overlay.className = 'modal';
    overlay.innerHTML = `<div class="modal-backdrop"></div><section class="modal-card member-photo-manager"><div class="modal-head"><div><span class="section-kicker">LA BAND</span><h2>Foto membri</h2></div><button class="modal-close" type="button" aria-label="Chiudi">×</button></div><div class="modal-body"><div class="member-photo-grid">${members.map(m=>{const src=publicSiteAssetUrl(m.image);return `<label class="member-photo-slot" data-member-slot="${m.slot}">${src?`<img src="${esc(src)}" alt="${esc(m.name)}">`:'<span class="member-avatar">'+esc(String(m.name||'?').charAt(0))+'</span>'}<strong>${esc(m.name||`Membro ${m.slot}`)}</strong><input type="file" accept="image/*"><span class="member-photo-status"></span></label>`}).join('')}</div></div></section>`;
    document.body.appendChild(overlay);
    document.documentElement.style.overflow='hidden';
    const close=()=>{overlay.remove();if(!$$('.modal:not([hidden])').length)document.documentElement.style.removeProperty('overflow')};
    overlay.querySelector('.modal-close').onclick=close;
    overlay.querySelector('.modal-backdrop').onclick=close;
    overlay.querySelectorAll('input[type="file"]').forEach(input=>input.onchange=async()=>{
      const file=input.files?.[0],slotNode=input.closest('[data-member-slot]'),slot=Number(slotNode.dataset.memberSlot),status=slotNode.querySelector('.member-photo-status');
      if(!file)return;
      if(!String(file.type||'').startsWith('image/')){status.textContent='Scegli un file immagine.';return}
      input.disabled=true;status.textContent='Caricamento…';
      try{
        const ext=(file.name.split('.').pop()||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'')||'jpg';
        const path=`band-members/member-${slot}/${Date.now()}.${ext}`;
        const {error:uploadError}=await sb.storage.from('public-site').upload(path,file,{contentType:file.type||undefined,upsert:false});
        if(uploadError)throw uploadError;
        const {error:saveError}=await sb.from('public_site_content').upsert({content_key:`band.member.${slot}.image`,content_type:'image',value:path,updated_by:currentMember.id,updated_at:new Date().toISOString()},{onConflict:'content_key'});
        if(saveError){await sb.storage.from('public-site').remove([path]);throw saveError}
        status.textContent='Foto pubblicata ✓';
        await loadMemberMedia();
        const current=memberMedia.find(x=>x.slot===slot),img=slotNode.querySelector('img');
        if(img)img.src=publicSiteAssetUrl(current?.image)||'';
      }catch(err){status.textContent=err.message||'Caricamento non riuscito'}finally{input.disabled=false;input.value=''}
    });
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
    if (id === 'concertModal') { activeConcertId = null; concertRequest++; lastConcertData = null; concertDirty = false; }
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
      home:[[window.JMCopy.text('ui.f9d0a39219d7'),'homeNextShow'],[window.JMCopy.text('ui.5b0d2517b8b5'),'homeRankingPreview']],
      tour:[[window.JMCopy.text('ui.0449f09cec41'),'upcomingBlock'],[window.JMCopy.text('ui.801a122f224b'),'archiveBlock']],
      rankings:[[window.JMCopy.text('ui.11440317430b'),'songsRankingBlock'],[window.JMCopy.text('ui.050b875e0945'),'fansRankingBlock'],['Locandine','postersRankingBlock'],[window.JMCopy.text('ui.854f5adc717d'),'concertsRankingBlock']],
      band:[[window.JMCopy.text('ui.15cbfb980542'),'membersBlock'],[window.JMCopy.text('ui.04923d0f0b62'),'conceptBlock']],
      more:[[window.JMCopy.text('ui.1362ca19ad39'),'galleryBlock'],[window.JMCopy.text('ui.90e63b56a4dc'),'merchBlock'],[window.JMCopy.text('ui.1067809f644e'),'contactsBlock'],[window.JMCopy.text('ui.c349676fc048'),'managementBlock']]
    };
    links.innerHTML = '';
    (configs[route] || []).forEach(([label,id]) => {
      const b = document.createElement('button');
      b.type = 'button';
      window.JMCopy.bindText(b,label);
      b.onclick = () => $(id)?.scrollIntoView({behavior:'smooth', block:'start'});
      links.appendChild(b);
    });
  }

  function updateUserUI() {
    window.JMCopy?.setMember(currentMember);
    const entry = $('userEntry');
    entry.classList.remove('is-fan','is-member');
    if (currentMember) {
      entry.classList.add('is-member');
      window.JMCopy.write($('userEyebrow'),MEMBER_ADMINS.has(String(currentMember.username || '').toLowerCase())?'ui.b521caa6e1db':'ui.fd42e7a0748e');
      delete $('userLabel').dataset.copy;
      $('userLabel').textContent = currentMember.display_name || currentMember.username || 'BAND';
      $('memberRail').classList.remove('hidden');
      $('memberRailName').textContent = currentMember.display_name || currentMember.username || 'Membro';
    } else if (currentFan) {
      entry.classList.add('is-fan');
      window.JMCopy.write($('userEyebrow'),'ui.050b875e0945');
      delete $('userLabel').dataset.copy;
      $('userLabel').textContent = currentFan.nickname || currentFan.display_name || window.JMCopy.text('ui.050b875e0945');
      $('memberRail').classList.add('hidden');
    } else {
      window.JMCopy.write($('userEyebrow'),'ui.a56938e44770');
      window.JMCopy.write($('userLabel'),'ui.d4fc4761f015');
      $('memberRail').classList.add('hidden');
    }
    const managePhotos = $('manageMemberPhotos');
    if (managePhotos) managePhotos.classList.toggle('hidden',!(currentMember && MEMBER_ADMINS.has(String(currentMember.username||'').toLowerCase())));
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
      session.innerHTML = `<div class="session-hero"><strong>${esc(currentMember.display_name || currentMember.username)}</strong><span>${esc(admin ? window.JMCopy.text('ui.0a017110ec02') : window.JMCopy.text('ui.12d4910d17a6'))} · ${esc(window.JMCopy.text('ui.sessionShared'))}</span></div><div class="session-actions">${admin ? '<button class="btn btn-primary wide" id="openSiteEditor" type="button">MODIFICA SITO</button>' : ''}<a class="btn btn-primary wide" href="manage.html" data-copy="ui.205eaf85b30c">APRI GESTIONALE</a><button class="btn btn-ghost wide" type="button" data-session-logout="member" data-copy="ui.b3ef7c765220">ESCI</button></div>`;
    } else {
      const attended = concerts.filter(c => c.attended);
      const me = (rankingData?.fans || []).find(r => currentFan?.id && r.fan_id === currentFan.id);
      const questionnaireDone = !!fanOnboardingStatus?.flow_completed;
      const questionnaireLabel = questionnaireDone ? 'QUESTIONARIO COMPLETATO' : (fanOnboardingStatus?.onboarding_state?.intro_seen_at ? 'RIPRENDI IL QUESTIONARIO' : 'INIZIA IL QUESTIONARIO');
      session.innerHTML = `<div class="session-hero"><strong>${esc(currentFan.nickname || currentFan.display_name)}</strong><span data-copy="ui.a7c16b8e53c1">Profilo fan attivo su questo dispositivo.</span><div class="fan-profile-stats"><div><b>${attended.length}</b><span data-copy="ui.6990f01ad9d2">LIVE</span></div><div><b>${esc(me?.ranking_position ?? '—')}</b><span data-copy="ui.f0efa8a9d43d">POSIZIONE</span></div><div><b>${esc(me?.points ?? 0)}</b><span data-copy="ui.b30bda418efd">PUNTI</span></div></div><div class="fan-questionnaire-summary"><strong>${esc(questionnaireLabel)}</strong><span>${questionnaireDone?'Puoi rivedere e modificare le risposte dal profilo.':'Il flusso iniziale è ancora disponibile e riparte dal punto lasciato.'}</span></div></div><div class="session-actions"><button class="btn btn-primary" type="button" id="openFanQuestionnaire">${questionnaireDone?'VEDI RISPOSTE':'APRI QUESTIONARIO'}</button><button class="btn btn-primary" type="button" id="openFanCatalog" data-copy="ui.3664bde9cb01">VOTA I BRANI</button><button class="btn btn-ghost" type="button" id="openMyShows" data-copy="ui.e3930548f346">I MIEI LIVE</button><button class="btn btn-ghost" type="button" id="fanRecovery" data-copy="ui.281d94ee06bd">RECUPERO</button><button class="btn btn-ghost" type="button" data-session-logout="fan" data-copy="ui.b3ef7c765220">ESCI</button></div>`;
      $('openFanQuestionnaire')?.addEventListener('click',()=>{window.location.href='manage.html#profilo';});
      $('openFanCatalog')?.addEventListener('click', () => { closeModal('userModal'); openFanCatalog(); });
      $('openMyShows')?.addEventListener('click', () => { closeModal('userModal'); go('tour'); setTimeout(() => $('archiveBlock')?.scrollIntoView({behavior:'smooth'}), 50); });
      $('fanRecovery')?.addEventListener('click', setFanRecovery);
    }
    $('openSiteEditor')?.addEventListener('click', () => { closeModal('userModal'); window.JMCopy.open(); });
    $$('[data-session-logout]', session).forEach(b => b.onclick = () => logout(b.dataset.sessionLogout));
  }
  async function setFanRecovery() {
    const value = window.prompt(window.JMCopy.text('ui.recoveryPrompt'));
    if (!value?.trim()) return;
    try { await fanApi('set_recovery', {recovery_type:'nickname', recovery_value:value.trim()}); toast(window.JMCopy.text('ui.67bf03eb3407'),'ok'); }
    catch (err) { toast(err.message,'error'); }
  }

  async function resolvePossibleFanMatches(data) {
    const matches = data?.possible_matches || [];
    if (!matches.length) return data;
    const names = matches.map((m,i) => `${i+1}. ${m.fan_name}${m.fan_since ? ' — '+window.JMCopy.text('ui.fanSince',{date:formatDate(m.fan_since)}) : ''}`).join('\n');
    const choice = window.prompt(window.JMCopy.text('ui.possibleMatches',{profiles:names}));
    const idx = Number(choice) - 1;
    if (!Number.isInteger(idx) || idx < 0 || idx >= matches.length) return data;
    const target = matches[idx];
    let recovery = null;
    if (target.has_recovery) {
      recovery = window.prompt(window.JMCopy.text('ui.recoveryFor',{name:target.fan_name}));
      if (recovery == null) return data;
    }
    const result = await fanApi('claim_candidate', {target_fan_id:target.fan_id, recovery_value:recovery});
    if (result.merged) return {...data, fan:result.fan, possible_matches:[]};
    toast(result.message || window.JMCopy.text('ui.mergeRequested'));
    return data;
  }

  async function loginFan(name) {
    let data = await fanApi('enter', {display_name:name});
    data = await resolvePossibleFanMatches(data);
    currentFan = data.fan || data;
    localStorage.setItem('jm_public_fan_name', currentFan.display_name || name);
    const perms = await fanApi('permissions');
    fanPermissions = perms.permissions || {};
    try { fanOnboardingStatus = await fanApi('onboarding_status'); }
    catch (err) { console.warn('Stato questionario non disponibile',err); fanOnboardingStatus = null; }
    currentMember = null;
    updateUserUI();
    startRealtime();
    await Promise.all([loadConcerts(true), loadRankings(true)]);
    renderHome(); renderTour(); renderRankings();
    return data;
  }
  async function loginMember(username, password) {
    username = String(username || '').trim().toLowerCase();
    if (!username) throw new Error(window.JMCopy.text('ui.987765bea304'));
    if (String(password || '').length < 6) throw new Error(window.JMCopy.text('ui.06bcf98691f4'));
    const {data:members,error:me} = await sb.rpc('check_member',{p_username:username});
    if (me) throw me;
    if (!members?.length) throw new Error(window.JMCopy.text('ui.9aedb1dda371'));
    const member = members[0];
    const email = `${username}@johnimolesti.app`;
    if (!member.activated) {
      const {data:su,error:se} = await sb.auth.signUp({email,password});
      if (se) {
        const {error:si} = await sb.auth.signInWithPassword({email,password});
        if (si) throw se;
      } else if (!su.session) throw new Error(window.JMCopy.text('ui.mailConfirmation'));
      const {error:ce} = await sb.rpc('claim_member',{p_username:username});
      if (ce) throw ce;
    } else {
      const {error:si} = await sb.auth.signInWithPassword({email,password});
      if (si) throw new Error(window.JMCopy.text('ui.8db8a651467b'));
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
    if (type === 'fan') { currentFan = null; fanOnboardingStatus = null; localStorage.removeItem('jm_public_fan_name'); }
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
      console.error(err); toast(window.JMCopy.text('ui.concertError',{error:err.message}),'error'); concerts = []; return concerts;
    }
  }
  async function loadRankings(force = false) {
    if (rankingData && !force) return rankingData;
    const role = currentFan ? 'fan' : 'guest';
    if (!can(role,'rankings_view')) {
      rankingData = {fans:[],songs:[],concerts:[],posters:[],blocked:true};
      return rankingData;
    }
    try {
      rankingData = currentFan ? await fanApi('rankings') : await fanApi('rankings',{guest:true});
      return rankingData;
    } catch (err) {
      console.error(err); rankingData = {fans:[],songs:[],concerts:[],posters:[],error:err.message}; return rankingData;
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
    if (!c) { box.innerHTML = '<span class="rail-kicker" data-copy="ui.bab62916c3bf">NEXT SHOW</span><p data-copy="ui.083de1b415bc">Nessuna data futura pubblicata.</p>'; return; }
    const d = dateParts(c.concert_date);
    box.innerHTML = `<span class="rail-kicker" data-copy="ui.bab62916c3bf">NEXT SHOW</span><div class="rail-next-date">${d.day} ${d.month}</div><div class="rail-next-name">${esc(c.name)}</div><div class="rail-next-place">${esc(prettyPlace(c))}${c.start_time ? ` · ${esc(formatTime(c.start_time))}` : ''}</div><button class="rail-action text-button" type="button" data-open-concert="${esc(c.id)}" data-copy="ui.09add3f1fe3c">DETTAGLI →</button>`;
    box.querySelector('[data-open-concert]')?.addEventListener('click',() => openConcert(c.id));
  }
  function renderHome() {
    renderHighlights();
    const nextBox = $('homeNextShow');
    const c = nextConcert();
    if (!c) nextBox.innerHTML = '<div class="section-kicker" data-copy="ui.a27114e657cc">PROSSIMO CONCERTO</div><div class="empty-state" data-copy="ui.083de1b415bc">Nessuna data futura pubblicata.</div>';
    else {
      const d = dateParts(c.concert_date);
      nextBox.innerHTML = `<div class="section-kicker" data-copy="ui.a27114e657cc">PROSSIMO CONCERTO</div><div class="next-show-main"><div class="next-show-date"><strong>${d.day}</strong><span>${d.month} ${d.year}</span></div><div class="next-show-copy"><h3>${esc(c.name)}</h3><p>${esc(prettyPlace(c))}${c.start_time ? ` · ${esc(formatTime(c.start_time))}` : ''}</p></div><button class="btn btn-primary" type="button" data-copy="ui.c73ba2f8d622">DETTAGLI</button></div>`;
      nextBox.querySelector('button').onclick = () => openConcert(c.id);
    }
    const preview = $('homeRankingPreview');
    const songs = rankingData?.songs || [];
    preview.innerHTML = `<div class="section-kicker" data-copy="ui.5b0d2517b8b5">HOT RIGHT NOW</div><div class="mini-ranking">${songs.slice(0,4).map((r,i)=>`<div class="mini-rank-row"><span>#${i+1}</span><b>${esc(r.title)}</b><strong>${esc(r.ranking_score ?? '—')}</strong></div>`).join('') || '<div class="empty-state" data-copy="ui.d0d31b3018b4">Classifica non disponibile.</div>'}</div>`;
    renderMedia();
    renderRailNextShow();
  }

  function renderMedia() {
    const items = concerts.filter(c => c.poster_path).slice(0,8).map(c => ({src:posterUrl(c.poster_path),label:c.name,id:c.id}));
    const wall = $('homeMediaWall');
    if (wall) wall.innerHTML = items.slice(0,3).map((item,i) => `<button class="media-tile media-tile-${i+1}" type="button" data-media-concert="${esc(item.id)}"><img src="${esc(item.src)}" alt="${esc(window.JMCopy.text('ui.poster',{name:item.label}))}" loading="lazy"></button>`).join('') || '<div class="media-placeholder"><img src="IMG_6259.PNG" alt="Logo John & i Molesti"><span data-copy="ui.8944f844ccd1">ARCHIVIO IN ARRIVO</span></div>';
    const gallery = $('mediaGallery');
    if (!gallery) return;
    window.JMCopy.write($('galleryCount'),'ui.beb6820dd49f',{count:items.length});
    gallery.innerHTML = items.map(item => `<button class="gallery-item" type="button" data-media-concert="${esc(item.id)}"><img src="${esc(item.src)}" alt="${esc(window.JMCopy.text('ui.poster',{name:item.label}))}" loading="lazy"><span>${esc(item.label)}</span></button>`).join('') || '<div class="empty-state" data-copy="ui.e910eb8811ae">Le prime foto e locandine arriveranno con i prossimi live.</div>';
    $$('[data-media-concert]').forEach(node => {
      node.onclick = () => { const c = concerts.find(c => c.id === node.dataset.mediaConcert); if(c) openPoster(posterUrl(c.poster_path), c.name); };
    });
  }

  function calendarStamp(c, end = false) {
    const date = String(c.concert_date || '').replace(/-/g,'');
    const time = String(c.start_time || '21:30').slice(0,5).replace(':','');
    if (!end) return `${date}T${time}00`;
    const finish = new Date(`${c.concert_date}T${String(c.start_time || '21:30').slice(0,5)}:00`);
    finish.setHours(finish.getHours() + 2);
    return `${finish.getFullYear()}${String(finish.getMonth()+1).padStart(2,'0')}${String(finish.getDate()).padStart(2,'0')}T${String(finish.getHours()).padStart(2,'0')}${String(finish.getMinutes()).padStart(2,'0')}00`;
  }
  function downloadCalendar(c) {
    const clean = value => String(value || '').replace(/[\\,;]/g, m => `\\${m}`).replace(/\n/g,'\\n');
    const body = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//John & i Molesti//Live//IT','BEGIN:VEVENT',`UID:${clean(c.id)}@johnimolesti`,`DTSTART:${calendarStamp(c)}`,`DTEND:${calendarStamp(c,true)}`,`SUMMARY:${clean(c.name)} — John & i Molesti`,`LOCATION:${clean(prettyPlace(c))}`,'END:VEVENT','END:VCALENDAR'].join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([body],{type:'text/calendar;charset=utf-8'}));
    a.download = `john-i-molesti-${c.concert_date || 'live'}.ics`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href),1000);
  }

  function concertCardHtml(c) {
    const d = dateParts(c.concert_date), [status, cls] = statusInfo(c);
    return `<article class="concert-card" data-concert-id="${esc(c.id)}"><div class="concert-date-block"><strong>${d.day}</strong><span>${d.month} ${d.year}</span></div><div class="concert-card-main"><h4>${esc(c.name)}</h4><div class="concert-meta-line"><b>${esc(prettyPlace(c) || window.JMCopy.text('ui.4f5bf6522767'))}</b>${c.start_time ? `<br>${esc(formatTime(c.start_time))}` : ''}${c.event_mode ? ` · ${esc(String(c.event_mode).toUpperCase())}` : ''}</div><span class="status-pill status-${cls}">${esc(status)}</span></div></article>`;
  }
  function pastRowHtml(c) {
    const [status, cls] = statusInfo(c);
    return `<article class="concert-row" data-concert-id="${esc(c.id)}"><div class="concert-row-date">${formatDate(c.concert_date)}</div><div><h4>${esc(c.name)}</h4><p>${esc(prettyPlace(c))}</p></div><span class="status-pill status-${cls}">${esc(status)}</span></article>`;
  }
  function bindConcertClicks(root) { $$('[data-concert-id]', root).forEach(n => n.onclick = () => openConcert(n.dataset.concertId)); }
  function renderTour() {
    const up = upcomingConcerts(), past = pastConcerts();
    window.JMCopy.write($('upcomingCount'),'ui.36ac180307ba',{count:up.length});
    window.JMCopy.write($('pastCount'),'ui.532d1db69c6e',{count:past.length});
    $('upcomingConcerts').innerHTML = up.map(concertCardHtml).join('') || '<div class="empty-state" data-copy="ui.083de1b415bc">Nessuna data futura pubblicata.</div>';
    $('pastConcerts').innerHTML = past.map(pastRowHtml).join('') || '<div class="empty-state" data-copy="ui.9248335d92aa">Archivio non disponibile.</div>';
    bindConcertClicks($('upcomingConcerts')); bindConcertClicks($('pastConcerts'));
  }

  function rankingSongRow(r, i) {
    const artists = [r.base_artist, r.lyrics_artist].filter(Boolean).join(' / ');
    const cover = posterUrl(r.cover_path);
    return `<div class="ranking-row${cover?' has-cover':''}">${cover?`<div class="ranking-row-bg" style="background-image:url('${esc(cover)}')"></div>`:''}<div class="ranking-pos">${i+1}</div>${cover?`<img class="ranking-cover" src="${esc(cover)}" alt="Cover di ${esc(r.title)}" loading="lazy">`:''}<div class="ranking-main"><div class="ranking-title">${esc(r.title)}</div><div class="ranking-meta">${esc(artists || '')}</div></div><div class="ranking-score">${esc(r.ranking_score ?? '—')}<small data-copy="ui.ec7bd9952fa3">SCORE</small></div></div>`;
  }
  function rankingFanRow(r, i) {
    const self = currentFan?.id && currentFan.id === r.fan_id;
    return `<div class="ranking-row${self ? ' self' : ''}"><div class="ranking-pos">${esc(r.ranking_position ?? i+1)}</div><div class="ranking-main"><div class="ranking-title">${esc(String(r.fan_name || '').toUpperCase())}${self ? ' · '+esc(window.JMCopy.text('ui.you')) : ''}</div><div class="ranking-meta">${esc(window.JMCopy.text('ui.attendances',{count:Number(r.attendance_count || 0)}))}</div></div><div class="ranking-score">${esc(r.points ?? 0)}<small data-copy="ui.7c4c910b08dc">PT</small></div></div>`;
  }
  function rankingConcertRow(r, i) {
    const name = r.concert_name || r.name || window.JMCopy.text('ui.fallbackLive',{date:formatDate(r.concert_date)});
    const score = r.score ?? r.rating ?? r.avg_score ?? r.average_score ?? '—';
    return `<div class="ranking-row" data-ranking-concert="${esc(r.concert_id || r.id || '')}"><div class="ranking-pos">${i+1}</div><div class="ranking-main"><div class="ranking-title">${esc(name)}</div><div class="ranking-meta">${esc(formatDate(r.concert_date))}${r.attendance_count != null ? ` · ${esc(window.JMCopy.text('ui.attendances',{count:Number(r.attendance_count)}))}` : ''}</div></div><div class="ranking-score">${esc(score)}<small data-copy="ui.6990f01ad9d2">LIVE</small></div></div>`;
  }
  function rankingPosterRow(r, i) {
    const src = posterUrl(r.storage_path || r.poster_path);
    const raw = Number(r.ranking_score);
    const score = Number.isFinite(raw) ? (raw/10).toFixed(1) : '—';
    return `<div class="ranking-row${src?' has-cover':''}" data-ranking-poster="${esc(r.poster_id||'')}"><div class="ranking-pos">${i+1}</div>${src?`<img class="ranking-poster-thumb" src="${esc(src)}" alt="Locandina ${esc(r.concert_name||'')}" loading="lazy">`:''}<div class="ranking-main"><div class="ranking-title">${esc(r.concert_name||'Concerto')}</div><div class="ranking-meta">${esc(r.caption||formatDate(r.concert_date))}</div></div><div class="ranking-score">${esc(score)}<small>POSTER</small></div></div>`;
  }
  function renderRankings() {
    const data = rankingData || {};
    if (data.blocked) {
      ['songsRanking','fansRanking','concertsRanking','postersRanking'].forEach(id => $(id).innerHTML = '<div class="empty-state" data-copy="ui.fdb82cb3d193">Classifiche non abilitate per questo accesso.</div>');
      return;
    }
    if (data.error) {
      ['songsRanking','fansRanking','concertsRanking','postersRanking'].forEach(id => $(id).innerHTML = `<div class="empty-state">${esc(window.JMCopy.text('ui.error',{error:data.error}))}</div>`);
      return;
    }
    const limit = key => expandedRankings.has(key) ? Infinity : 8;
    $('songsRanking').innerHTML = (data.songs || []).slice(0,limit('songs')).map(rankingSongRow).join('') || '<div class="empty-state" data-copy="ui.05f718376042">Classifica brani non disponibile.</div>';
    $('fansRanking').innerHTML = (data.fans || []).slice(0,limit('fans')).map(rankingFanRow).join('') || '<div class="empty-state" data-copy="ui.a436fdc3dfc1">Classifica fan non disponibile.</div>';
    $('concertsRanking').innerHTML = (data.concerts || []).slice(0,limit('concerts')).map(rankingConcertRow).join('') || '<div class="empty-state" data-copy="ui.6f59b6c9181a">Classifica concerti non disponibile.</div>';
    $('postersRanking').innerHTML = (data.posters || []).slice(0,limit('posters')).map(rankingPosterRow).join('') || '<div class="empty-state">Classifica locandine non disponibile.</div>';
    $$('[data-ranking-concert]', $('concertsRanking')).forEach(row => { if (row.dataset.rankingConcert) row.onclick = () => openConcert(row.dataset.rankingConcert); });
    $$('[data-ranking-poster]', $('postersRanking')).forEach((row,i) => { const poster=(data.posters||[])[i]; const src=posterUrl(poster?.storage_path||poster?.poster_path); if(src)row.onclick=()=>openPoster(src,poster?.concert_name||'Locandina'); });
    $$('[data-expand-ranking]').forEach(btn => {
      const key = btn.dataset.expandRanking;
      const expanded = expandedRankings.has(key);
      window.JMCopy.write(btn,expanded?'ui.513edd5fd93e':'ui.c4a5176fc495');
      btn.closest('.ranking-panel')?.classList.toggle('expanded', expanded);
    });
  }

  function contactRender() {
    const box = $('contactActions');
    if (!contacts.length) { box.textContent='Canali in aggiornamento.'; return; }
    box.innerHTML = contacts.map(c => `<a class="btn btn-ghost" href="${esc(c.url)}" target="_blank" rel="noopener noreferrer">${esc({facebook:'Facebook',instagram:'Instagram',youtube:'YouTube'}[c.platform])}</a>`).join('');
  }

  function safeHttps(value) {
    try { const u=new URL(value); return u.protocol==='https:'&&!u.username&&!u.password ? u.href : ''; } catch { return ''; }
  }
  async function loadPublicUpdates() {
    const now=new Date().toISOString();
    const results=await Promise.allSettled([
      sb.from('site_social_links').select('platform,url').eq('enabled',true),
      sb.from('site_news').select('id,kind,title,body,link_url,published_at,expires_at').eq('published',true).lte('published_at',now).or('expires_at.is.null,expires_at.gt.'+now).order('published_at',{ascending:false}).limit(12)
    ]);
    const socials=results[0].status==='fulfilled'?results[0].value:null;
    const news=results[1].status==='fulfilled'?results[1].value:null;
    if(socials&&!socials.error) contacts=(socials.data||[]).filter(c=>safeHttps(c.url));
    if(news&&!news.error) siteNews=news.data||[];
    contactRender();renderHighlights();
  }
  function renderHighlights() {
    const track=$('highlightTrack');if(!track)return;
    const upcoming=upcomingConcerts().filter(c=>c.status!=='draft').slice(0,6);
    const slides=[
      ...upcoming.map(c=>({id:'live-'+c.id,title:c.name,body:prettyPlace(c),meta:formatDate(c.concert_date)+(c.start_time?' · '+formatTime(c.start_time):''),kind:'Prossimo live',concert:c.id,poster:posterUrl(c.poster_path)})),
      ...siteNews.map(n=>({id:n.id,title:n.title,body:n.body,meta:formatDate(n.published_at),kind:{song:'Nuova canzone',event:'Evento',news:'Novità'}[n.kind],href:safeHttps(n.link_url)}))
    ];
    const signature=JSON.stringify(slides);if(signature===highlightSignature)return;highlightSignature=signature;
    track.innerHTML=slides.map(s=>`<article class="highlight-slide" aria-label="${esc(s.kind+': '+s.title)}">${s.poster?`<button class="highlight-poster" type="button" data-highlight-poster="${esc(s.concert)}" aria-label="Ingrandisci locandina"><img src="${esc(s.poster)}" alt="Locandina ${esc(s.title)}" draggable="false"></button>`:''}<div class="highlight-copy"><span class="section-kicker">${esc(s.kind)} · ${esc(s.meta)}</span><h3>${esc(s.title)}</h3><p>${esc(s.body)}</p>${s.concert?`<button type="button" class="btn btn-primary" data-highlight-concert="${esc(s.concert)}">Dettagli del live</button>`:s.href?`<a class="btn btn-primary" target="_blank" rel="noopener noreferrer" href="${esc(s.href)}">${s.kind==='Nuova canzone'?'Ascolta':'Scopri di più'}</a>`:''}</div></article>`).join('')||'<div class="highlight-slide"><div class="highlight-copy"><h3>Le prossime date arrivano qui</h3><p>Intanto puoi scoprire i brani e le serate passate.</p><button class="btn btn-primary" id="highlightArchive" type="button">Esplora i live</button></div></div>';
    $$('[data-highlight-concert]',track).forEach(b=>b.onclick=()=>openConcert(b.dataset.highlightConcert));
    $$('[data-highlight-poster]',track).forEach(b=>b.onclick=()=>{const c=concerts.find(c=>c.id===b.dataset.highlightPoster);if(c)openPoster(posterUrl(c.poster_path),c.name);});
    $('highlightArchive')?.addEventListener('click',()=>go('tour'));
    const count=Math.max(slides.length,1);
    const update=()=>{const at=Math.min(count-1,Math.max(0,Math.round(track.scrollLeft/(track.clientWidth+16))));$('highlightCount').textContent=(at+1)+' / '+count;$('highlightPrev').disabled=at===0;$('highlightNext').disabled=at>=count-1;};
    const move=dir=>track.scrollBy({left:dir*(track.clientWidth+16),behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
    $('highlightPrev').onclick=()=>move(-1);$('highlightNext').onclick=()=>move(1);track.onscroll=update;
    track.onkeydown=e=>{if(e.target!==track)return;if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();move(e.key==='ArrowRight'?1:-1);}};
    update();
  }
  function openPoster(src,title) {
    if(!safeHttps(src))return;
    let dialog=$('posterViewer');
    if(!dialog){
      dialog=document.createElement('dialog');dialog.id='posterViewer';dialog.setAttribute('aria-label','Locandina ingrandita');
      dialog.innerHTML='<header><strong id="posterTitle"></strong><div><button type="button" id="posterZoomOut" aria-label="Riduci">−</button><button type="button" id="posterZoomIn" aria-label="Ingrandisci">+</button><button type="button" id="posterClose" aria-label="Chiudi locandina">×</button></div></header><div class="poster-scroll"><img id="posterImage" alt="" draggable="false"></div>';
      document.body.append(dialog);let zoom=1;
      const resize=()=>{$('posterImage').style.width=(zoom*100)+'%';};
      $('posterZoomIn').onclick=()=>{zoom=Math.min(zoom+.5,3);resize();};
      $('posterZoomOut').onclick=()=>{zoom=Math.max(zoom-.5,1);resize();};
      $('posterClose').onclick=()=>dialog.close();
      dialog.addEventListener('close',()=>{zoom=1;resize();if(!$$('.modal:not([hidden])').length)document.documentElement.style.removeProperty('overflow');});
      dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
    }
    $('posterTitle').textContent=title;$('posterImage').src=src;$('posterImage').alt='Locandina '+title;
    document.documentElement.style.overflow='hidden';dialog.showModal();
  }

  function revealCount(c, total) {
    if (!total) return 0;
    if (c.status !== 'future') return total;
    const start = concertStartMs(c);
    if (!Number.isFinite(start) || Date.now() < start) return 0;
    return Math.min(total, 1 + Math.floor((Date.now() - start) / (LIVE_REVEAL_MINUTES * 60 * 1000)));
  }
  function executionDivider(type) {
    const labels = {planned:window.JMCopy.text('ui.f8cb346d3c38'),request:window.JMCopy.text('ui.097045253499'),bis:window.JMCopy.text('ui.fa71037e7274'),recovery:window.JMCopy.text('ui.281d94ee06bd'),skipped:window.JMCopy.text('ui.1fe76bced1b8'),truncated:window.JMCopy.text('ui.9d075021885e')};
    return `<div class="execution-divider">${esc(labels[type] || String(type || '').toUpperCase())}</div>`;
  }
  function liveSongRow(song, i, editable, hidden) {
    const score = song.my_vote?.molesti_score ?? '';
    const rx = song.my_reactions || {};
    return `<div class="concert-song-row${hidden ? ' is-hidden' : ''}" data-live-song="${esc(song.id)}"><div class="concert-song-pos">${i+1}</div><div><div class="concert-song-title">${esc(song.title)}</div><div class="concert-song-meta">${esc([song.base_artist ? window.JMCopy.text('ui.base',{artist:song.base_artist}) : '',song.lyrics_artist ? window.JMCopy.text('ui.lyrics',{artist:song.lyrics_artist}) : ''].filter(Boolean).join(' · '))}</div></div>${editable ? `<div class="song-vote-controls"><select class="score-select song-score" aria-label="Voto performance" data-copy-aria-label="ui.performance"><option value="" data-copy="ui.a8603c064e80">Voto</option>${Array.from({length:10},(_,n)=>`<option value="${n+1}" ${Number(score)===n+1?'selected':''}>${n+1}</option>`).join('')}</select><label class="reaction-chip"><input type="checkbox" class="rx-pogo" ${rx.pogo?'checked':''}><span data-copy="ui.pogo">POGO</span></label><label class="reaction-chip"><input type="checkbox" class="rx-sang" ${rx.sang_along?'checked':''}><span data-copy="ui.sing">CANTA</span></label><label class="reaction-chip"><input type="checkbox" class="rx-enjoy" ${rx.enjoyed?'checked':''}><span data-copy="ui.top">TOP</span></label></div>` : ''}</div>`;
  }
  async function openConcert(id) {
    const request=++concertRequest;
    concertDirty=false;
    activeConcertId = id;
    openModal('concertModal');
    window.JMCopy.write($('concertModalTitle'),'live.002');
    $('concertModalBody').innerHTML = '<div class="empty-state" style="padding:28px 18px" data-copy="ui.ac14aabdd671">Caricamento…</div>';
    try {
      const data = currentFan ? await fanApi('concert_detail',{concert_id:id}) : await fanApi('concert_detail',{concert_id:id,guest:true});
      if(request!==concertRequest || activeConcertId!==id || $('concertModal').hidden)return;
      lastConcertData=JSON.stringify([data,revealCount(data.concert||{},(data.songs||[]).length)]);
      const c = data.concert || concerts.find(x => x.id === id) || {};
      if(c.name){delete $('concertModalTitle').dataset.copy;$('concertModalTitle').textContent=c.name;}else window.JMCopy.write($('concertModalTitle'),'live.002');
      const [status, cls] = statusInfo(c);
      const poster = posterUrl(c.poster_path);
      const role = currentFan ? 'fan' : 'guest';
      const canSeeSetlist = can(role,'concert_setlist_view');
      const started = isLiveNow(c) || c.status === 'completed';
      const canAttend = !!currentFan && started;
      const canVote = !!currentFan && !!data.voting_open && !!data.attended;
      const mapQuery = encodeURIComponent([c.venue,c.city].filter(Boolean).join(', '));
      let html = `<div class="concert-detail-top"><div class="concert-detail-meta"><span class="status-pill status-${cls}">${esc(status)}</span><p><strong>${esc(formatDate(c.concert_date))}${c.start_time ? ` · ${esc(formatTime(c.start_time))}` : ''}</strong><br>${esc(prettyPlace(c))}${c.event_mode ? ` · ${esc(String(c.event_mode).toUpperCase())}` : ''}</p><div class="concert-public-actions">${mapQuery ? `<a class="btn btn-ghost" href="https://www.google.com/maps/search/?api=1&query=${mapQuery}" target="_blank" rel="noopener" data-copy="ui.d2f10e06593c">INDICAZIONI</a>` : ''}<button class="btn btn-ghost" id="addConcertCalendar" type="button" data-copy="ui.84253b1ec4ee">+ CALENDARIO</button></div></div>${poster ? `<img class="concert-poster" src="${esc(poster)}" alt="${esc(window.JMCopy.text('ui.poster',{name:c.name}))}">` : ''}</div>`;
      if (canAttend) {
        html += `<div class="fan-live-tools"><div class="attendance-toggle"><label><input id="fanAttendanceToggle" type="checkbox" ${data.attended?'checked':''}> <span data-copy="ui.attendance">IO C’ERO</span></label><span class="save-indicator">${esc(data.attended ? window.JMCopy.text('ui.706fd3934ba2') : window.JMCopy.text('ui.57d90e8ecbe0'))}</span></div>${data.attended && data.voting_open ? `<div class="general-score"><span data-copy="ui.5ba790e94203">Voto generale al live</span><select id="concertGeneralScore" class="score-select"><option value="">—</option>${Array.from({length:10},(_,n)=>`<option value="${n+1}" ${Number(data.my_concert_rating)===n+1?'selected':''}>${n+1}</option>`).join('')}</select></div>` : ''}</div>`;
      }
      if (!data.setlist_available || !canSeeSetlist) {
        html += `<div class="setlist-lock"><strong>${esc(!canSeeSetlist ? window.JMCopy.text('ui.47e7250dcb38') : window.JMCopy.text('ui.c0e154d4906d'))}</strong>${canSeeSetlist && c.start_time ? `<br>${esc(window.JMCopy.text('ui.revealTime',{time:formatTime(c.start_time)}))}` : ''}</div>`;
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
        html += songs.length ? '</div>' : '<div class="empty-state" style="padding:20px" data-copy="ui.a085ec909a15">Nessun brano disponibile.</div></div>';
        if (c.status === 'future' && reveal < songs.length) html += `<div class="setlist-lock">${esc(window.JMCopy.text('ui.revealProgress',{visible:reveal,total:songs.length}))}</div>`;
        if (canVote) html += '<div class="live-feedback-actions"><button id="saveLiveFeedback" class="btn btn-primary" type="button" data-copy="ui.eae473c83baa">SALVA VOTI LIVE</button></div>';
      }
      $('concertModalBody').innerHTML = html;
      const posterImage=$('concertModalBody').querySelector('.concert-poster');
      if(posterImage){const button=document.createElement('button');button.type='button';button.className='poster-open';button.setAttribute('aria-label','Ingrandisci locandina');posterImage.replaceWith(button);posterImage.draggable=false;button.append(posterImage);button.onclick=()=>openPoster(poster,c.name);}
      $('addConcertCalendar')?.addEventListener('click', () => downloadCalendar(c));
      $('fanAttendanceToggle')?.addEventListener('change', async e => {
        const checked = e.target.checked;
        e.target.disabled = true;
        try {
          const r = await fanApi('attend',{concert_id:id,attended:checked});
          toast(r.message || (checked ? window.JMCopy.text('ui.b0be2580b3c3') : window.JMCopy.text('ui.e9d72b499e32')),'ok');
          await openConcert(id);
          await loadRankings(true); renderRankings(); renderHome();
        } catch (err) { e.target.checked = !checked; toast(err.message,'error'); }
        finally { e.target.disabled = false; }
      });
      $('saveLiveFeedback')?.addEventListener('click', () => saveLiveFeedback(id));
    } catch (err) {
      if(request!==concertRequest || activeConcertId!==id)return;
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
    if (btn) { btn.disabled = true; window.JMCopy.write(btn,'ui.3fa95bc67502'); }
    try {
      await fanApi('save_live_feedback',{concert_id:concertId,performance_score:performance,songs:rows});
      concertDirty=false;
      toast(window.JMCopy.text('ui.b8e5dfe04acf'),'ok');
      await loadRankings(true); renderRankings(); renderHome();
    } catch (err) { toast(err.message,'error'); }
    finally { if (btn) { btn.disabled = false; window.JMCopy.write(btn,'ui.eae473c83baa'); } }
  }

  async function openFanCatalog() {
    if (!currentFan) { renderUserModal(); openModal('userModal'); return; }
    openModal('fanAreaModal');
    $('fanCatalogList').innerHTML = '<div class="empty-state" data-copy="ui.ac14aabdd671">Caricamento…</div>';
    try {
      const data = await fanApi('catalog');
      fanCatalog = data.songs || [];
      renderFanCatalog();
    } catch (err) { $('fanCatalogList').innerHTML = `<div class="empty-state">${esc(err.message)}</div>`; }
  }
  function option10(value, label='—') {
    return `<option value="">${esc(label)}</option>${Array.from({length:10},(_,n)=>`<option value="${n+1}" ${Number(value)===n+1?'selected':''}>${n+1}</option>`).join('')}`;
  }
  function renderFanCatalog() {
    const q = String($('fanCatalogSearch').value || '').trim().toLowerCase();
    const rows = fanCatalog.filter(s => !q || [s.title,s.base_artist,s.lyrics_artist].some(v => String(v || '').toLowerCase().includes(q)));
    window.JMCopy.write($('fanCatalogCount'),'ui.a3b71206e952',{count:rows.length});
    $('fanCatalogList').innerHTML = rows.map(s => {
      const mol = s.my_vote?.molesti_score ?? s.effective_molesti_score ?? '';
      return `<article class="fan-song-card" data-fan-song="${esc(s.id)}"><div class="fan-song-main"><div><div class="fan-song-title">${esc(s.title)}</div><div class="fan-song-meta">${esc([s.base_artist ? window.JMCopy.text('ui.base',{artist:s.base_artist}) : '',s.lyrics_artist ? window.JMCopy.text('ui.lyrics',{artist:s.lyrics_artist}) : ''].filter(Boolean).join(' · '))}</div></div><div class="fan-song-quick"><input class="quick-range" type="range" min="1" max="10" step="1" value="${mol || 5}"><output>${mol || '—'}</output></div><button class="fan-song-toggle" type="button" aria-label="Dettagli" data-copy-aria-label="ui.details">+</button></div><div class="fan-song-advanced"><div class="advanced-field"><label data-copy="ui.a289e6535f22">Voto Base</label><select class="adv-base">${option10(s.my_vote?.base_score)}</select></div><div class="advanced-field"><label data-copy="ui.238b127c72b3">Voto Testo</label><select class="adv-lyrics">${option10(s.my_vote?.lyrics_score)}</select></div><div class="advanced-field"><label data-copy="ui.747194781e34">Conoscenza Base</label><select class="adv-base-fam">${option10(s.base_familiarity,window.JMCopy.text('ui.714037f15919'))}</select></div><div class="advanced-field"><label data-copy="ui.e65d02ee9b60">Conoscenza Testo</label><select class="adv-lyrics-fam">${option10(s.lyrics_familiarity,window.JMCopy.text('ui.714037f15919'))}</select></div><div class="advanced-save"><button class="btn btn-ghost save-advanced" type="button" data-copy="ui.09791b637e77">SALVA DETTAGLI</button></div></div></article>`;
    }).join('') || '<div class="empty-state" data-copy="ui.6b0f940cf478">Nessun brano trovato.</div>';
    $$('[data-fan-song]', $('fanCatalogList')).forEach(card => bindFanSongCard(card));
  }
  function bindFanSongCard(card) {
    const id = card.dataset.fanSong;
    const song = fanCatalog.find(s => s.id === id);
    const range = card.querySelector('.quick-range'), output = card.querySelector('output');
    let timer;
    range.addEventListener('input', () => { output.textContent = range.value; clearTimeout(timer); timer = setTimeout(async () => {
      try { await fanApi('catalog_vote',{song_id:id,molesti_score:Number(range.value),preserve_advanced:true}); output.textContent = range.value; toast(window.JMCopy.text('ui.voteSaved',{song:song?.title || window.JMCopy.text('ui.songFallback')}), 'ok'); await loadRankings(true); }
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
      try { await fanApi('catalog_vote',payload); toast(window.JMCopy.text('ui.fd37daa39f6c'),'ok'); await loadRankings(true); renderRankings(); renderHome(); }
      catch (err) { toast(err.message,'error'); }
    };
  }

  function startRealtime() {
    stopRealtime();
    try {
      publicRealtime = sb.channel('jm-public-site').on('postgres_changes',{event:'*',schema:'public',table:'concerts'},scheduleRealtimeRefresh).on('postgres_changes',{event:'*',schema:'public',table:'concert_setlist_items'},scheduleRealtimeRefresh).subscribe();
    } catch (err) { console.warn('Realtime non disponibile',err); }
    publicPoll = setInterval(() => {
      if (!document.hidden && (currentRoute() === 'tour' || activeConcertId)) scheduleRealtimeRefresh();
    }, 30000);
  }
  function stopRealtime() {
    clearTimeout(scheduleRealtimeRefresh.t);
    if (publicRealtime) { try { sb.removeChannel(publicRealtime); } catch {} publicRealtime = null; }
    if (publicPoll) { clearInterval(publicPoll); publicPoll = null; }
  }
  function scheduleRealtimeRefresh() {
    clearTimeout(scheduleRealtimeRefresh.t);
    scheduleRealtimeRefresh.t = setTimeout(async () => {
      if(refreshBusy || document.hidden)return;
      refreshBusy=true;
      try {
        if(activeConcertId && !$('concertModal').hidden){
          const id=activeConcertId, request=concertRequest;
          if(!lastConcertData)return;
          const data=await fanApi('concert_detail',{concert_id:id,...(currentFan?{}:{guest:true})});
          if(request!==concertRequest || activeConcertId!==id || $('concertModal').hidden)return;
          const next=JSON.stringify([data,revealCount(data.concert||{},(data.songs||[]).length)]);
          if(next!==lastConcertData && !$('concertUpdateNotice')){
            const button=document.createElement('button');button.type='button';button.id='concertUpdateNotice';button.className='btn btn-ghost';
            button.textContent='Novità per questo live: aggiorna';
            button.onclick=()=>{if(concertDirty&&!confirm('Aggiornare il live? I voti non ancora salvati saranno annullati.'))return;openConcert(id);};
            $('concertModalBody').prepend(button);
          }
        } else { await loadConcerts(true);renderHome();renderTour(); }
      } catch(err){console.warn('Aggiornamento live non disponibile',err);}
      finally {refreshBusy=false;}
    }, 250);
  }

  function bindStaticEvents() {
    $('concertModalBody').addEventListener('input',()=>{concertDirty=true;});
    $('concertModalBody').addEventListener('change',e=>{if(e.target.id!=='fanAttendanceToggle')concertDirty=true;});
    const protectedImage=e=>e.target.closest?.('.concert-poster,.media-tile,.gallery-item,.highlight-poster,#posterViewer');
    document.addEventListener('contextmenu',e=>{if(protectedImage(e))e.preventDefault();});
    document.addEventListener('dragstart',e=>{if(protectedImage(e))e.preventDefault();});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('posterViewer')?.open)e.stopImmediatePropagation();},true);
    window.addEventListener('hashchange', applyRoute);
    document.addEventListener('jm:copy-change', () => { renderHome(); renderTour(); renderRankings(); renderContextRail(currentRoute()); });
    $$('.nav-item').forEach(b => b.onclick = () => go(b.dataset.route));
    $$('[data-go]').forEach(b => b.onclick = () => go(b.dataset.go));
    $('userEntry').onclick = () => { renderUserModal(); openModal('userModal'); };
    $('manageMemberPhotos')?.addEventListener('click',openMemberPhotoManager);
    $('memberCarouselPrev')?.addEventListener('click',()=>moveMemberCarousel(-1));
    $('memberCarouselNext')?.addEventListener('click',()=>moveMemberCarousel(1));
    $$('[data-close-modal]').forEach(n => n.onclick = () => closeModal(n.dataset.closeModal));
    document.addEventListener('keydown', e => { if (e.key === 'Escape') { const open = $$('.modal:not([hidden])').at(-1); if (open) closeModal(open.id); } });
    $$('#loginSwitch [data-login-mode]').forEach(b => b.onclick = () => showLoginMode(b.dataset.loginMode));
    $('fanLoginForm').addEventListener('submit', async e => {
      e.preventDefault(); const name = $('fanNameInput').value.trim(); const msg = $('fanLoginMessage');
      if (!name) return; msg.textContent = window.JMCopy.text('ui.876e88411094');
      try { await loginFan(name); msg.textContent = ''; closeModal('userModal'); toast(window.JMCopy.text('ui.hello',{name:currentFan.nickname || currentFan.display_name}),'ok'); }
      catch (err) { msg.textContent = err.message; }
    });
    $('memberLoginForm').addEventListener('submit', async e => {
      e.preventDefault(); const msg = $('memberLoginMessage'); msg.textContent = window.JMCopy.text('ui.876e88411094');
      try { await loginMember($('memberUsernameInput').value,$('memberPasswordInput').value); msg.textContent=''; closeModal('userModal'); toast(window.JMCopy.text('ui.memberHello',{name:currentMember.display_name || currentMember.username}),'ok'); window.JMCopy.ready(); }
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
      toast(window.JMCopy.text('ui.supabaseUnavailable'),'error');
      return;
    }
    sb = window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
    bindStaticEvents();
    await window.JMCopy.init(sb);
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
    await Promise.all([loadConcerts(),loadRankings(),loadPublicUpdates(),loadMemberMedia()]);
    renderHome(); renderTour(); renderRankings(); renderRailNextShow();
    if (!location.hash) history.replaceState(null,'','#/home');
    applyRoute();
    startRealtime();
    window.JMCopy.ready();
  }

  window.addEventListener('DOMContentLoaded', init);
})();
