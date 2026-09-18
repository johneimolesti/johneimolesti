(() => {
  'use strict';

  const cfg = window.JM_CONFIG;
  if (!cfg || !window.supabase) {
    console.error('Configurazione Supabase non disponibile.');
    return;
  }

  const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_KEY);
  const $ = (id) => document.getElementById(id);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  const DEFAULT_CONTENT = Object.freeze({
    'brand.name':'JOHN & I MOLESTI','brand.kicker':'PUNK ROCK REVIVAL',
    'nav.home':'Home','nav.live':'Live','nav.songs':'Brani','nav.rankings':'Classifiche','nav.band':'La band',
    'home.hero.eyebrow':'DAL VENETO, SENZA GRAZIA','home.hero.title':'JOHN & I MOLESTI','home.hero.lead':'Canzoni italiane, attitudine punk e amplificatori abbastanza alti.',
    'home.hero.image':'','home.hero.caption':'JOHN & I MOLESTI · LIVE',
    'home.live.eyebrow':'PROSSIMA MOLESTIA','home.live.title':'Il prossimo live',
    'home.songs.eyebrow':'REPERTORIO','home.songs.title':'Brani in rotazione','home.songs.lead':"Un po' di beat italiano, un po' di distorsione.",
    'home.overview.eyebrow':'IN BREVE','home.overview.title':'I Molesti in numeri',
    'live.eyebrow':'DAL VIVO','live.title':'Live','live.lead':'Prossime date e archivio dei concerti.','live.tab.future':'Prossimi','live.tab.past':'Passati',
    'songs.eyebrow':'REPERTORIO','songs.title':'Brani','songs.lead':'Il catalogo pubblico dei John & i Molesti.',
    'rankings.eyebrow':'CLASSIFICHE','rankings.title':'Classifiche','rankings.lead':'Brani, live e fan. Senza fogli Excel in vista.','rankings.tab.songs':'Brani','rankings.tab.live':'Live','rankings.tab.fans':'Fan',
    'band.eyebrow':'JOHN & I MOLESTI','band.title':'La band','band.lead':'Punk rock revival su materiale italiano che non aveva chiesto di esserlo.','band.body':'Cinque Molesti, canzoni italiane e basi punk rock. Il resto succede sul palco.','band.image':'','band.caption':'JOHN & I MOLESTI',
    'band.member.1.name':'Kekko','band.member.1.role':'Chitarra','band.member.2.name':'Ema','band.member.2.role':'Batteria','band.member.3.name':'Gianni','band.member.3.role':'Voce','band.member.4.name':'Carlo','band.member.4.role':'Basso','band.member.5.name':'Ale Lazza','band.member.5.role':'Chitarra',
    'footer.title':'JOHN & I MOLESTI','footer.text':'Punk Rock Revival · Veneto','footer.note':'© John & i Molesti',
    'actions.live':'Prossimi live','actions.songs':'Ascolta il repertorio','actions.allLive':'Tutti i live','actions.allSongs':'Tutti i brani','actions.details':'Dettagli','actions.fanLogin':'Entra come fan',
    'admin.login.hint':'Gestione dei soli contenuti del sito pubblico.'
  });

  const state = {
    route:'home', liveTab:'future', rankingTab:'songs', content:{...DEFAULT_CONTENT},
    concerts:[], rankings:{songs:[],fans:[],concerts:[]}, currentFan:null,
    adminUser:null, adminProfile:null, contentTableAvailable:true
  };

  function toast(message){
    const el=document.createElement('div');el.className='jm-toast';el.textContent=message;$('toastStack').appendChild(el);setTimeout(()=>el.remove(),3200);
  }
  function openModal(id){const el=$(id);if(!el)return;el.hidden=false;document.body.style.overflow='hidden'}
  function closeModal(id){const el=$(id);if(!el)return;el.hidden=true;if(!$('accountSheet').classList.contains('is-open'))document.body.style.overflow=''}
  function fmtDate(v){if(!v)return '—';const d=new Date(`${String(v).slice(0,10)}T12:00:00`);return new Intl.DateTimeFormat('it-IT',{day:'2-digit',month:'short',year:'numeric'}).format(d)}
  function dateParts(v){if(!v)return {day:'—',month:'—'};const d=new Date(`${String(v).slice(0,10)}T12:00:00`);return {day:String(d.getDate()).padStart(2,'0'),month:new Intl.DateTimeFormat('it-IT',{month:'short'}).format(d).replace('.','').toUpperCase()}}
  function isPast(c){return c?.status==='completed'||String(c?.concert_date||'')<new Date().toISOString().slice(0,10)}
  function publicLocation(c){if(c?.private_show)return 'Evento privato';return [c?.venue,c?.city,c?.province].filter(Boolean).join(' · ')||'Location da definire'}
  function t(key){return state.content[key] ?? DEFAULT_CONTENT[key] ?? key}

  function getFanDeviceToken(){let token=localStorage.getItem('jm_fan_device_token');if(!token){token=crypto.randomUUID();localStorage.setItem('jm_fan_device_token',token)}return token}
  function fanFingerprint(){return [navigator.userAgent,navigator.language,Intl.DateTimeFormat().resolvedOptions().timeZone,screen.width,screen.height,window.devicePixelRatio||1].join('|')}
  async function fanApi(action,payload={}){
    const guest=payload?.guest===true;
    const body=guest?{action,...payload}:{action,device_token:getFanDeviceToken(),fingerprint:fanFingerprint(),...payload};
    const res=await fetch(cfg.FAN_API,{method:'POST',headers:{'Content-Type':'application/json','apikey':cfg.SUPABASE_KEY,'Authorization':`Bearer ${cfg.SUPABASE_KEY}`},body:JSON.stringify(body)});
    let data={};try{data=await res.json()}catch{}
    if(!res.ok)throw new Error(data.error||`Errore HTTP ${res.status}`);
    return data;
  }
  function guestPayload(extra={}){return state.currentFan?extra:{guest:true,...extra}}

  async function loadSiteContent(){
    try{
      const {data,error}=await sb.from('public_site_content').select('content_key,content_type,value');
      if(error)throw error;
      state.content={...DEFAULT_CONTENT,...Object.fromEntries((data||[]).map(r=>[r.content_key,r.value]))};
      state.contentTableAvailable=true;
    }catch(err){
      state.contentTableAvailable=false;
      state.content={...DEFAULT_CONTENT};
      console.warn('public_site_content non disponibile: uso contenuti predefiniti.',err?.message||err);
    }
    applyContent();
  }

  function applyContent(){
    $$('[data-content-key]').forEach(el=>{
      const key=el.dataset.contentKey;const value=t(key);const type=el.dataset.contentType||'text';
      if(type==='image'&&el.tagName==='IMG'){
        el.src=value||fallbackImage(key);
      }else{
        el.textContent=value;
      }
    });
    document.title=t('brand.name');
  }

  function fallbackImage(key){
    const hero=key.includes('hero');
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800"><rect width="1200" height="800" fill="#121212"/><circle cx="${hero?930:250}" cy="${hero?160:610}" r="330" fill="#c99a22" opacity=".18"/><path d="M-50 650 C250 420 470 850 800 540 C920 425 1040 390 1280 290" fill="none" stroke="#c99a22" stroke-width="44" opacity=".36"/><text x="70" y="390" fill="#f3f0e8" font-family="Arial Black,Arial" font-size="104" font-weight="900">JOHN &amp; I MOLESTI</text><text x="75" y="455" fill="#c99a22" font-family="Arial" font-size="28" font-weight="700" letter-spacing="12">PUNK ROCK REVIVAL</text></svg>`;
    return 'data:image/svg+xml;charset=UTF-8,'+encodeURIComponent(svg);
  }

  function routeTo(route,push=true){
    const allowed=['home','live','songs','rankings','band'];route=allowed.includes(route)?route:'home';state.route=route;
    $$('.jm-page[data-page]').forEach(p=>p.classList.toggle('is-active',p.dataset.page===route));
    $$('[data-route]').forEach(b=>b.classList.toggle('is-active',b.dataset.route===route));
    if(push){const hash=route==='home'?'#/':`#/${route}`;if(location.hash!==hash)history.pushState(null,'',hash)}
    window.scrollTo({top:0,behavior:'instant'});
  }
  function routeFromHash(){const raw=(location.hash||'#/').replace(/^#\/?/,'').split('/')[0];return raw||'home'}

  async function loadPublicData(){
    const [concertResult,rankingResult]=await Promise.allSettled([
      fanApi('list_concerts',{guest:true}),
      fanApi('rankings',{guest:true})
    ]);
    if(concertResult.status==='fulfilled')state.concerts=(concertResult.value.concerts||[]).filter(c=>!c.private_show);
    else console.warn(concertResult.reason);
    if(rankingResult.status==='fulfilled')state.rankings=rankingResult.value||state.rankings;
    else console.warn(rankingResult.reason);
    renderAll();
  }

  function nextConcert(){return [...state.concerts].filter(c=>!isPast(c)).sort((a,b)=>String(a.concert_date).localeCompare(String(b.concert_date))||String(a.start_time||'').localeCompare(String(b.start_time||'')))[0]||null}
  function renderHomeLive(){
    const box=$('homeNextLive');const c=nextConcert();
    if(!c){box.className='jm-empty';box.textContent='Nessuna data pubblica in calendario.';return}
    const d=dateParts(c.concert_date);box.className='jm-feature-live';box.innerHTML=`
      <div class="jm-date-block"><strong>${esc(d.day)}</strong><span>${esc(d.month)}</span></div>
      <div class="jm-live-copy"><h3>${esc(c.name||c.venue||'Live')}</h3><p>${esc(publicLocation(c))}</p><div class="jm-live-meta"><span class="jm-chip jm-chip-gold">${esc(c.event_mode||'live')}</span>${c.start_time?`<span class="jm-chip">${esc(String(c.start_time).slice(0,5))}</span>`:''}</div></div>
      <button class="jm-button" type="button" data-concert-id="${esc(c.id)}">${esc(t('actions.details'))}</button>`;
  }
  function songSubtitle(s){return [s.base_artist,s.lyrics_artist].filter(Boolean).join(' · ')||s.base_title||s.lyrics_title||'John & i Molesti'}
  function songCard(s){return `<article class="jm-song-card" data-song-id="${esc(s.id||s.song_id||'')}"><div class="jm-song-cover"></div><div class="jm-song-card-body"><h3>${esc(s.title||'Brano')}</h3><p>${esc(songSubtitle(s))}</p></div></article>`}
  function renderHomeSongs(){const songs=(state.rankings.songs||[]).slice(0,4);$('homeSongs').innerHTML=songs.length?songs.map(songCard).join(''):'<div class="jm-empty">Nessun brano pubblico disponibile.</div>'}
  function renderKpis(){const concerts=state.concerts.filter(c=>isPast(c));const fans=state.rankings.fans||[];$('homeKpis').innerHTML=`<article class="jm-kpi"><strong>${(state.rankings.songs||[]).length}</strong><span>BRANI</span></article><article class="jm-kpi"><strong>${concerts.length}</strong><span>LIVE</span></article><article class="jm-kpi"><strong>${fans.length}</strong><span>FAN</span></article>`}
  function renderLive(){
    let rows=state.concerts.filter(c=>state.liveTab==='past'?isPast(c):!isPast(c));
    rows.sort((a,b)=>state.liveTab==='past'?String(b.concert_date).localeCompare(String(a.concert_date)):String(a.concert_date).localeCompare(String(b.concert_date)));
    $('liveGrid').classList.remove('jm-loading');$('liveGrid').innerHTML=rows.length?rows.map(c=>{const d=dateParts(c.concert_date);return `<article class="jm-live-card" data-concert-id="${esc(c.id)}"><div class="jm-date-block"><strong>${esc(d.day)}</strong><span>${esc(d.month)}</span></div><div><h3>${esc(c.name||c.venue||'Live')}</h3><p>${esc(publicLocation(c))}</p><div class="jm-live-meta"><span class="jm-chip">${esc(fmtDate(c.concert_date))}</span>${c.start_time?`<span class="jm-chip jm-chip-gold">${esc(String(c.start_time).slice(0,5))}</span>`:''}</div></div></article>`}).join(''):'<div class="jm-empty">Nessun live in questa sezione.</div>';
  }
  function renderSongs(){
    const q=$('songSearch').value.trim().toLowerCase();const songs=(state.rankings.songs||[]).filter(s=>!q||String(s.title||'').toLowerCase().includes(q)||songSubtitle(s).toLowerCase().includes(q));
    $('songGrid').classList.remove('jm-loading');$('songGrid').innerHTML=songs.length?songs.map(songCard).join(''):'<div class="jm-empty">Nessun brano trovato.</div>';
  }
  function renderRankings(){
    let rows=[];
    if(state.rankingTab==='songs')rows=(state.rankings.songs||[]).slice(0,40).map((x,i)=>({title:x.title||'Brano',sub:songSubtitle(x),score:x.ranking_score!=null?Math.round(Number(x.ranking_score)):'—',pos:i+1}));
    if(state.rankingTab==='fans')rows=(state.rankings.fans||[]).slice(0,40).map((x,i)=>({title:x.nickname||x.display_name||'Fan',sub:'Fan',score:x.points!=null?Math.round(Number(x.points)):'—',pos:i+1}));
    if(state.rankingTab==='concerts')rows=(state.rankings.concerts||[]).slice(0,40).map((x,i)=>({title:x.name||x.concert_name||'Live',sub:fmtDate(x.concert_date),score:x.ranking_score!=null?Math.round(Number(x.ranking_score)):x.score!=null?Math.round(Number(x.score)):'—',pos:i+1}));
    $('rankingList').innerHTML=rows.length?rows.map(r=>`<div class="jm-ranking-row"><div class="jm-rank">${r.pos}</div><div class="jm-ranking-main"><strong>${esc(r.title)}</strong><span>${esc(r.sub)}</span></div><div class="jm-ranking-score">${esc(r.score)}</div></div>`).join(''):'<div class="jm-empty">Classifica non disponibile.</div>';
  }
  function renderAll(){renderHomeLive();renderHomeSongs();renderKpis();renderLive();renderSongs();renderRankings()}

  async function openConcert(id){
    openModal('detailModal');$('detailModalBody').innerHTML='<div class="jm-empty">Caricamento live…</div>';
    try{
      const d=await fanApi('concert_detail',guestPayload({concert_id:id}));const c=d.concert||{};const songs=d.songs||[];
      $('detailModalBody').innerHTML=`<p class="jm-eyebrow">${esc(fmtDate(c.concert_date))}</p><h2 id="detailModalTitle">${esc(c.name||'Live')}</h2><p class="jm-muted">${esc(publicLocation(c))}${c.start_time?` · ${esc(String(c.start_time).slice(0,5))}`:''}</p><div class="jm-live-meta"><span class="jm-chip jm-chip-gold">${esc(c.event_mode||'live')}</span>${d.setlist_available?`<span class="jm-chip">${songs.length} brani</span>`:''}</div>${d.setlist_available?`<div class="jm-ranking-list" style="margin-top:20px">${songs.map((x,i)=>`<div class="jm-ranking-row"><div class="jm-rank">${i+1}</div><div class="jm-ranking-main"><strong>${esc(x.title||x.song_title||'Brano')}</strong><span>${esc(x.execution_type&&x.execution_type!=='planned'?x.execution_type:'')}</span></div><div></div></div>`).join('')||'<div class="jm-empty">Scaletta vuota.</div>'}</div>`:'<div class="jm-empty" style="margin-top:20px">La scaletta non è ancora disponibile.</div>'}`;
    }catch(err){$('detailModalBody').innerHTML=`<div class="jm-empty">${esc(err.message)}</div>`}
  }

  function openAccount(){ $('accountBackdrop').hidden=false;$('accountSheet').classList.add('is-open');$('accountSheet').setAttribute('aria-hidden','false');document.body.style.overflow='hidden' }
  function closeAccount(){ $('accountBackdrop').hidden=true;$('accountSheet').classList.remove('is-open');$('accountSheet').setAttribute('aria-hidden','true');if(!$$('.jm-modal-backdrop:not([hidden])').length)document.body.style.overflow='' }
  function updateAccountUI(){
    const fan=state.currentFan;const admin=state.adminProfile;
    $('accountLabel').textContent=admin?'Admin':fan?'Fan':'Ospite';$('accountDot').className=`jm-account-dot${admin?' is-admin':fan?' is-fan':''}`;
    $('sheetAccountName').textContent=admin?(admin.display_name||admin.username||'Admin'):fan?(fan.nickname||fan.display_name||'Fan'):'Ospite';
    $('fanAccountStatus').textContent=fan?`Profilo fan attivo: ${fan.nickname||fan.display_name||''}`:'Entra come fan per votare e segnare i live a cui hai partecipato.';
    $('openFanLogin').hidden=!!fan;$('fanLogout').hidden=!fan;
    $('adminBar').hidden=!admin;
  }

  async function fanLogin(){
    const name=$('fanNameInput').value.trim();if(!name)return;$('fanLoginSubmit').disabled=true;$('fanLoginMessage').textContent='Accesso in corso…';
    try{const d=await fanApi('enter',{display_name:name});state.currentFan=d.fan||d;localStorage.setItem('jm_site_fan_name',state.currentFan.display_name||name);$('fanLoginMessage').textContent='';closeModal('fanLoginModal');updateAccountUI();toast('Profilo fan attivo');await loadPublicData()}catch(err){$('fanLoginMessage').textContent=err.message}finally{$('fanLoginSubmit').disabled=false}
  }
  async function autoFan(){const name=localStorage.getItem('jm_site_fan_name');if(!name)return;try{const d=await fanApi('enter',{display_name:name});state.currentFan=d.fan||d;updateAccountUI()}catch{localStorage.removeItem('jm_site_fan_name')}}
  function fanLogout(){state.currentFan=null;localStorage.removeItem('jm_site_fan_name');updateAccountUI();toast('Profilo fan chiuso')}

  function applyTheme(theme){document.documentElement.dataset.theme=theme;localStorage.setItem('jm_public_theme',theme);document.querySelector('meta[name="theme-color"]')?.setAttribute('content',theme==='dark'?'#0b0b0b':'#f2efe6')}

  function bindEvents(){
    document.addEventListener('click',e=>{
      const route=e.target.closest('[data-route]');if(route){e.preventDefault();if(document.body.classList.contains('jm-edit-mode')&&e.target.closest('[data-content-key]'))return;routeTo(route.dataset.route);return}
      const concert=e.target.closest('[data-concert-id]');if(concert){openConcert(concert.dataset.concertId);return}
      const close=e.target.closest('[data-close-modal]');if(close){closeModal(close.dataset.closeModal);return}
    });
    window.addEventListener('popstate',()=>routeTo(routeFromHash(),false));
    $('themeToggle').onclick=()=>applyTheme(document.documentElement.dataset.theme==='dark'?'light':'dark');
    $('accountButton').onclick=openAccount;$('closeAccount').onclick=closeAccount;$('accountBackdrop').onclick=closeAccount;
    $('openFanLogin').onclick=()=>{closeAccount();openModal('fanLoginModal');setTimeout(()=>$('fanNameInput').focus(),50)};
    $('fanLoginSubmit').onclick=fanLogin;$('fanNameInput').addEventListener('keydown',e=>{if(e.key==='Enter')fanLogin()});$('fanLogout').onclick=()=>{fanLogout();closeAccount()};
    $('songSearch').addEventListener('input',renderSongs);
    $('liveTabs').onclick=e=>{const b=e.target.closest('[data-live-tab]');if(!b)return;state.liveTab=b.dataset.liveTab;$$('[data-live-tab]',$('liveTabs')).forEach(x=>x.classList.toggle('is-active',x===b));renderLive()};
    $('rankingTabs').onclick=e=>{const b=e.target.closest('[data-ranking-tab]');if(!b)return;state.rankingTab=b.dataset.rankingTab;$$('[data-ranking-tab]',$('rankingTabs')).forEach(x=>x.classList.toggle('is-active',x===b));renderRankings()};
    $$('.jm-modal-backdrop').forEach(back=>back.addEventListener('click',e=>{if(e.target===back)closeModal(back.id)}));
    document.addEventListener('keydown',e=>{if(e.key==='Escape'){$$('.jm-modal-backdrop:not([hidden])').forEach(x=>closeModal(x.id));closeAccount()}});
  }

  window.JM_PUBLIC = {sb,state,DEFAULT_CONTENT,t,esc,toast,openModal,closeModal,applyContent,loadSiteContent,fanApi,updateAccountUI,closeAccount};

  (async function init(){
    applyTheme(localStorage.getItem('jm_public_theme')||'dark');bindEvents();routeTo(routeFromHash(),false);await loadSiteContent();await autoFan();await loadPublicData();updateAccountUI();document.dispatchEvent(new CustomEvent('jm-public-ready'));
  })();
})();
