(() => {
  'use strict';

  const SUPABASE_URL = 'https://etzwybamvfpeitkttwrc.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_CtyexwjoW375UXpjInOuDA_Uz28wWJx';
  const FAN_API = `${SUPABASE_URL}/functions/v1/fan-api`;
  const CHECKIN_API = `${SUPABASE_URL}/functions/v1/checkin-api`;
  const LIVE_REVEAL_MINUTES = 5;
  const MEMBER_ADMINS = new Set(['ema', 'kekko']);
  const ROUTES = new Set(['home', 'tour', 'repertoire', 'rankings', 'band', 'more', 'contacts', 'news-admin']);
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
  let homeSettings = {
    fallback_image_position_x:50,
    fallback_image_position_y:50,
    fallback_image_zoom:100
  };
  let publicSongs = [], publicMedia = [];
  let publicSongsLoaded = false, publicMediaLoaded = false, publicSongsError = null;
  let bookingUnavailable = new Set(), bookingUnavailableSources = new Map(), bookingSelectedDates = new Set();
  let bookingCalendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  let memberMedia = [];
  let memberMediaLoaded = false;
  let bookingAvailabilityLoaded = false;
  let globalContactsObserver = null;
  let globalContactsRetry = null;
  let memberCarouselIndex = 0;
  let tourPrivateMode = false;
  let fanOnboardingStatus = null;
  let highlightSignature = '', highlightTimer = null, concertRequest = 0, lastConcertData = null;
  let refreshBusy = false, concertDirty = false;
  let qrCheckinPending = false;
  let qrClaimedOnLogin = [];
  let qrCheckinConcert = null;
  let homeEntryFlowContext = null;
  let fanNameCheckState = {name:'',data:null,promise:null};
  const CHECKIN_WINDOW_BEFORE_MINUTES = 30;
  const CHECKIN_WINDOW_AFTER_END_MINUTES = 60;
  const DEFAULT_LIVE_DURATION_MINUTES = 90;
  const hadFanDeviceTokenAtLoad = (()=>{ try { return !!localStorage.getItem('jm_fan_device_token'); } catch { return true; } })();
  let newDeviceEntryPending = !hadFanDeviceTokenAtLoad;

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
  function posterPaths(value) {
    if (Array.isArray(value)) return [...new Set(value.filter(Boolean).map(String))];
    const raw = String(value || '').trim();
    if (!raw) return [];
    if (raw.startsWith('[')) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return [...new Set(parsed.filter(Boolean).map(String))];
      } catch {}
    }
    return [raw];
  }
  function primaryPosterUrl(value) {
    const first = posterPaths(value)[0];
    return first ? posterUrl(first) : null;
  }
  function publicSiteAssetUrl(path) {
    if (!path || !sb) return null;
    try { return sb.storage.from('public-site').getPublicUrl(path).data.publicUrl || null; } catch { return null; }
  }

  function publicMediaAssetUrl(path) {
    if (!path || !sb) return null;
    try { return sb.storage.from('public-media').getPublicUrl(path).data.publicUrl || null; } catch { return null; }
  }


  function globalSocialItems() {
    return $$('#contactsSocialActions .contact-tile').map(link => {
      const href = link.getAttribute('href') || '';
      const icon = link.querySelector('.contact-tile-icon');
      const label = link.querySelector('.contact-tile-copy strong')?.textContent?.trim()
        || link.getAttribute('aria-label')
        || link.getAttribute('title')
        || 'Contatto';
      if (!href || !icon) return null;
      return {href,label,iconHtml:icon.innerHTML,external:link.getAttribute('target') === '_blank'};
    }).filter(Boolean);
  }

  function makeGlobalSocialLink(item,className) {
    const link=document.createElement('a');
    link.className=className;
    link.href=item.href;
    link.setAttribute('aria-label',item.label);
    link.title=item.label;
    if(item.external){link.target='_blank';link.rel='noopener noreferrer';}
    const icon=document.createElement('span');
    icon.className='jm-global-social-icon';
    icon.innerHTML=item.iconHtml;
    link.appendChild(icon);
    return link;
  }

  function ensureGlobalSocialShells() {
    let mobile=$('jmGlobalMobileSocial');
    if(!mobile){
      mobile=document.createElement('nav');
      mobile.id='jmGlobalMobileSocial';
      mobile.className='jm-global-mobile-social is-empty';
      mobile.setAttribute('aria-label','Social e contatti');
      document.body.appendChild(mobile);
    }
    let desktop=$('jmHeaderSocial');
    if(!desktop){
      desktop=document.createElement('nav');
      desktop.id='jmHeaderSocial';
      desktop.className='jm-header-social is-empty';
      desktop.setAttribute('aria-label','Social e contatti');
      const header=$('siteHeader'),user=$('userEntry');
      if(header){
        if(user?.parentElement===header)header.insertBefore(desktop,user);
        else header.appendChild(desktop);
      }
    }
    return {mobile,desktop};
  }

  function renderGlobalSocialShells() {
    const {mobile,desktop}=ensureGlobalSocialShells();
    const items=globalSocialItems();
    mobile.replaceChildren(...items.map(item=>makeGlobalSocialLink(item,'jm-global-social-link')));
    desktop.replaceChildren(...items.map(item=>makeGlobalSocialLink(item,'jm-header-social-link')));
    mobile.classList.toggle('is-empty',!items.length);
    desktop.classList.toggle('is-empty',!items.length);
    if ($('checkinHeroFlow') && !$('checkinHeroFlow').hidden && homeEntryFlowContext?.stage==='social') renderCheckinHeroSocialCard();
  }

  function observePublishedContacts() {
    globalContactsObserver?.disconnect();
    const source=$('contactsSocialActions');
    if(!source){
      clearTimeout(globalContactsRetry);
      globalContactsRetry=setTimeout(observePublishedContacts,200);
      return;
    }
    globalContactsObserver=new MutationObserver(renderGlobalSocialShells);
    globalContactsObserver.observe(source,{childList:true,subtree:true,attributes:true,attributeFilter:['href','target','title','aria-label']});
    renderGlobalSocialShells();
  }

  function ensureCheckinHeroStyles() {
    if($('checkinHeroFlowStyles'))return;
    const style=document.createElement('style');
    style.id='checkinHeroFlowStyles';
    style.textContent=`
      .checkin-hero-flow{
        position:fixed;
        z-index:2147483000;
        inset:0;
        display:flex;
        align-items:center;
        justify-content:center;
        padding:clamp(14px,4vw,36px);
        background:rgba(4,4,4,.62);
        backdrop-filter:blur(3px);
        -webkit-backdrop-filter:blur(3px);
        overflow:auto;
        overscroll-behavior:contain;
      }
      .checkin-hero-flow[hidden]{display:none!important}
      .checkin-hero-card{
        position:relative;
        z-index:1;
        width:min(500px,calc(100vw - 28px));
        max-height:min(82dvh,760px);
        overflow:auto;
        border:2px solid #6f6b5e;
        background:#161614;
        box-shadow:0 24px 80px rgba(0,0,0,.78),0 0 0 1px rgba(255,255,255,.03) inset;
        color:var(--text);
      }
      .checkin-hero-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding:18px 18px 12px;border-bottom:1px solid #454239}
      .checkin-hero-head h2{margin:3px 0 0;font-size:clamp(25px,5vw,38px);line-height:.98}
      .checkin-hero-close{flex:0 0 auto;width:38px;height:38px;border:1px solid #615e53;background:#171715;color:var(--text);font-size:25px;line-height:1;cursor:pointer}
      .checkin-hero-body{padding:16px 18px 18px}
      .checkin-social-intro{margin:0 0 15px;color:var(--muted);font-size:14px;line-height:1.5}
      .checkin-social-links{display:grid;gap:8px}
      .checkin-social-link{display:grid;grid-template-columns:42px minmax(0,1fr) 22px;gap:11px;align-items:center;min-height:56px;padding:7px 11px;border:1px solid #656157;background:#23221e;color:var(--text);text-decoration:none}
      .checkin-social-link:hover,.checkin-social-link:focus-visible{border-color:var(--gold);background:#2d2b21;outline:none}
      .checkin-social-icon{display:grid;place-items:center;width:40px;height:40px;border:1px solid #716d5f;background:#111;color:var(--gold)}
      .checkin-social-icon svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
      .checkin-social-icon svg .fill{fill:currentColor;stroke:none}
      .checkin-social-label{min-width:0;font-weight:900;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .checkin-social-arrow{font-size:19px;color:var(--gold);text-align:right}
      .checkin-social-empty{padding:16px;border:1px dashed #656157;color:var(--muted);text-align:center;font-size:13px}
      .checkin-hero-note{margin-top:13px;color:var(--muted);font-size:11px;text-align:center}
      .checkin-live-card{width:min(540px,calc(100vw - 28px))}
      .checkin-live-visual{position:relative;min-height:150px;margin:-16px -18px 15px;overflow:hidden;background:#111;border-bottom:1px solid #454239}
      .checkin-live-visual img{display:block;width:100%;height:190px;object-fit:cover;filter:brightness(.72)}
      .checkin-live-visual.no-poster{display:grid;place-items:center;background:linear-gradient(135deg,#111,#252116);color:var(--gold);font-size:34px;font-weight:1000;letter-spacing:.08em}
      .checkin-live-meta{display:grid;gap:5px;margin-bottom:14px;color:var(--muted);font-size:13px}
      .checkin-live-meta strong{color:var(--text);font-size:15px}
      .checkin-live-actions{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px}
      .checkin-live-open,.checkin-live-dismiss{min-height:44px;border:1px solid #625f54;font-weight:900;cursor:pointer}
      .checkin-live-open{background:var(--gold);color:#111;border-color:var(--gold)}
      .checkin-live-dismiss{padding:0 16px;background:#222;color:var(--text)}
      @media(max-width:760px){
        .checkin-hero-flow{padding:12px;align-items:center}
        .checkin-hero-card{width:min(100%,480px);max-height:calc(100dvh - 24px)}
        .checkin-hero-head{padding:14px 14px 10px}
        .checkin-hero-body{padding:13px 14px 15px}
        .checkin-live-visual{margin:-13px -14px 13px}
        .checkin-live-visual img{height:160px}
        .checkin-live-actions{grid-template-columns:1fr}
        .checkin-live-dismiss{min-height:40px}
      }
    `;
    document.head.appendChild(style);
  }

  function fullConcertForEntry(concert) {
    if(!concert?.id)return concert||null;
    return concerts.find(c=>String(c.id)===String(concert.id)) || concert;
  }

  function romeConcertStartMs(c) {
    if(!c?.concert_date)return NaN;
    const [y,m,d]=String(c.concert_date).slice(0,10).split('-').map(Number);
    const [hh,mm]=String(c.start_time||'21:30').slice(0,5).split(':').map(Number);
    if(![y,m,d,hh,mm].every(Number.isFinite))return NaN;
    let guess=Date.UTC(y,m-1,d,hh,mm,0);
    const fmt=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
    for(let i=0;i<2;i++){
      const parts=Object.fromEntries(fmt.formatToParts(new Date(guess)).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
      const represented=Date.UTC(Number(parts.year),Number(parts.month)-1,Number(parts.day),Number(parts.hour),Number(parts.minute),Number(parts.second));
      guess-=represented-Date.UTC(y,m-1,d,hh,mm,0);
    }
    return guess;
  }

  function activeLoadedConcertForEntry() {
    const now=Date.now();
    return [...(concerts||[])]
      .filter(c=>!c.private_show && ['future','confirmed','completed'].includes(String(c.status||'')))
      .map(c=>({
        c,
        start:romeConcertStartMs(c),
        duration:Math.max(15,Number(c.duration_minutes||DEFAULT_LIVE_DURATION_MINUTES))
      }))
      .filter(x=>Number.isFinite(x.start)
        && now>=x.start-CHECKIN_WINDOW_BEFORE_MINUTES*60000
        && now<=x.start+(x.duration+CHECKIN_WINDOW_AFTER_END_MINUTES)*60000)
      .sort((a,b)=>Math.abs(now-a.start)-Math.abs(now-b.start))[0]?.c || null;
  }

  function ensureCheckinHeroFlow() {
    ensureCheckinHeroStyles();
    let flow=$('checkinHeroFlow');
    if(flow)return flow;
    flow=document.createElement('div');
    flow.id='checkinHeroFlow';
    flow.className='checkin-hero-flow';
    flow.hidden=true;
    flow.setAttribute('role','presentation');
    flow.innerHTML='<section class="checkin-hero-card" id="checkinHeroCard" role="dialog" aria-modal="true"></section>';
    document.body.appendChild(flow);
    flow.addEventListener('click',e=>{if(e.target===flow)advanceHomeEntryFlow();});
    return flow;
  }

  function renderCheckinHeroSocialCard() {
    const flow=ensureCheckinHeroFlow();
    const card=$('checkinHeroCard');
    if(!flow||!card||!homeEntryFlowContext)return;
    homeEntryFlowContext.stage='social';
    const isCheckin=homeEntryFlowContext.source==='checkin';
    const certified=!!homeEntryFlowContext.certified;
    const concert=homeEntryFlowContext.concert;
    const items=globalSocialItems();
    const kicker=isCheckin
      ? (certified?'CHECK-IN COMPLETATO':'DAL QR DEI MOLESTI')
      : 'BENVENUTO';
    const title=isCheckin
      ? (certified?'PRESENZA CERTIFICATA ✓':'SEGUICI')
      : 'JOHN & I MOLESTI';
    const intro=isCheckin
      ? (certified
        ? (concert?.name?`Presenza a “${esc(concert.name)}” certificata. Intanto, seguici anche qui.`:'Presenza certificata. Intanto, seguici anche qui.')
        : 'Sei nella Home dei Molesti. Qui trovi tutti i nostri canali social.')
      : 'Nuovo dispositivo riconosciuto. Qui trovi tutti i nostri canali.';
    card.className='checkin-hero-card';
    card.innerHTML=`
      <header class="checkin-hero-head">
        <div><span class="section-kicker">${kicker}</span><h2>${title}</h2></div>
        <button class="checkin-hero-close" type="button" aria-label="Chiudi">×</button>
      </header>
      <div class="checkin-hero-body">
        <p class="checkin-social-intro">${intro}</p>
        <div class="checkin-social-links" id="checkinSocialLinks"></div>
        <div class="checkin-hero-note">Chiudi per continuare sulla Home${homeEntryFlowContext.concert?' e vedere il live attivo':''}.</div>
      </div>`;
    const list=$('checkinSocialLinks');
    if(!items.length){
      list.innerHTML='<div class="checkin-social-empty">Social e contatti in caricamento…</div>';
    }else{
      items.forEach(item=>{
        const link=document.createElement('a');
        link.className='checkin-social-link';
        link.href=item.href;
        if(item.external){link.target='_blank';link.rel='noopener noreferrer';}
        link.setAttribute('aria-label',item.label);
        link.innerHTML=`<span class="checkin-social-icon">${item.iconHtml}</span><span class="checkin-social-label">${esc(item.label)}</span><span class="checkin-social-arrow">↗</span>`;
        list.appendChild(link);
      });
    }
    card.querySelector('.checkin-hero-close').onclick=advanceHomeEntryFlow;
  }

  function renderCheckinHeroLiveCard() {
    const flow=ensureCheckinHeroFlow();
    const card=$('checkinHeroCard');
    if(!flow||!card||!homeEntryFlowContext?.concert)return closeHomeEntryFlow();
    homeEntryFlowContext.stage='live';
    const c=fullConcertForEntry(homeEntryFlowContext.concert);
    homeEntryFlowContext.concert=c;
    const poster=posterPaths(c.poster_path)[0];
    const posterSrc=poster?posterUrl(poster):null;
    const when=[formatDate(c.concert_date),formatTime(c.start_time)].filter(Boolean).join(' · ');
    const place=prettyPlace(c)||[c.venue,c.city].filter(Boolean).join(' · ');
    card.className='checkin-hero-card checkin-live-card';
    card.innerHTML=`
      <header class="checkin-hero-head">
        <div><span class="section-kicker">LIVE ADESSO</span><h2>${esc(c.name||'JOHN & I MOLESTI')}</h2></div>
        <button class="checkin-hero-close" type="button" aria-label="Chiudi">×</button>
      </header>
      <div class="checkin-hero-body">
        ${posterSrc?`<div class="checkin-live-visual"><img src="${esc(posterSrc)}" alt="Locandina ${esc(c.name||'live')}"></div>`:'<div class="checkin-live-visual no-poster">JM</div>'}
        <div class="checkin-live-meta"><strong>${esc(when||'Live in corso')}</strong>${place?`<span>${esc(place)}</span>`:''}<span>Sei nella finestra attiva di questo live.</span></div>
        <div class="checkin-live-actions">
          <button class="checkin-live-open" type="button">APRI DETTAGLIO LIVE</button>
          <button class="checkin-live-dismiss" type="button">CHIUDI</button>
        </div>
      </div>`;
    const close=()=>closeHomeEntryFlow();
    card.querySelector('.checkin-hero-close').onclick=close;
    card.querySelector('.checkin-live-dismiss').onclick=close;
    card.querySelector('.checkin-live-open').onclick=()=>{
      const id=c.id;
      closeHomeEntryFlow();
      if(id)requestAnimationFrame(()=>openConcert(String(id)));
    };
  }

  function advanceHomeEntryFlow() {
    if(!homeEntryFlowContext)return;
    if(homeEntryFlowContext.stage==='social' && homeEntryFlowContext.concert){
      renderCheckinHeroLiveCard();
      return;
    }
    closeHomeEntryFlow();
  }

  function closeHomeEntryFlow() {
    const flow=$('checkinHeroFlow');
    if(flow)flow.hidden=true;
    homeEntryFlowContext=null;
    if(!$$('.modal:not([hidden])').length){
      document.documentElement.style.removeProperty('overflow');
      document.body.style.removeProperty('overflow');
    }
  }

  function openHomeEntryFlow({source='checkin',concert=null,certified=false}={}) {
    const flow=ensureCheckinHeroFlow();
    if(!flow)return;
    homeEntryFlowContext={source,concert:fullConcertForEntry(concert),certified:!!certified,stage:'social'};
    window.scrollTo({top:0,left:0,behavior:'instant'});
    flow.hidden=false;
    document.documentElement.style.setProperty('overflow','hidden','important');
    document.body.style.setProperty('overflow','hidden','important');
    renderCheckinHeroSocialCard();
    setTimeout(()=>$('checkinHeroCard')?.querySelector('.checkin-hero-close')?.focus(),0);
  }

  function openEntryFlowOnHome(options) {
    let opened=false;
    let fallbackTimer=null;
    const mobile=window.matchMedia('(max-width: 760px)').matches;
    const show=()=>{
      if(opened)return;
      if(mobile && !$('#jmMobileHomeExperience'))return;
      opened=true;
      if(fallbackTimer)clearTimeout(fallbackTimer);
      window.removeEventListener('jm:mobile-home-ready',show);
      window.scrollTo({top:0,left:0,behavior:'instant'});
      openHomeEntryFlow(options);
    };

    if(mobile)window.addEventListener('jm:mobile-home-ready',show);
    go('home');

    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      if(!mobile || $('#jmMobileHomeExperience'))show();
    }));

    fallbackTimer=setTimeout(()=>{
      if(opened)return;
      if(mobile && !$('#jmMobileHomeExperience')){
        requestAnimationFrame(()=>requestAnimationFrame(show));
        return;
      }
      show();
    },1200);
  }

  function completeQrCheckin(concert=null,{certified=!!concert}={}) {
    qrCheckinPending=false;
    newDeviceEntryPending=false;
    qrCheckinConcert=null;
    openEntryFlowOnHome({source:'checkin',concert,certified});
  }

  function completeNewDeviceEntry() {
    newDeviceEntryPending=false;
    if(sessionStorage.getItem('jm_entry_contacts_seen')==='1')return;
    const live=activeLoadedConcertForEntry();
    openEntryFlowOnHome({source:'new-device',concert:live,certified:false});
  }

  function ensureHomeHeroNewsLayout() {
    const home=$('homePage');
    if(!home)return;

    const hero=home.querySelector('.hero');
    const highlights=home.querySelector('.highlights');

    if(hero&&highlights){
      hero.classList.add('home-hero-news');
      highlights.classList.add('home-hero-highlights');
      if(highlights.parentElement!==hero)hero.appendChild(highlights);

      const heading=highlights.querySelector('.highlights-heading h2');
      if(heading)heading.textContent='NOVITÀ';
      highlights.setAttribute('aria-label','Novità John & i Molesti');
    }

    let shell=$('homeDashboard');
    if(!shell){
      shell=document.createElement('section');
      shell.id='homeDashboard';
      shell.className='home-dashboard-shell';
      shell.innerHTML=`
        <div class="home-dashboard-heading">
          <div><span class="section-kicker">IN BREVE</span><h2>Dal sito</h2></div>
        </div>
        <div class="home-dashboard-grid" id="homeDashboardGrid"></div>`;
      if(hero)hero.insertAdjacentElement('afterend',shell);
      else home.prepend(shell);
    }

    const grid=$('homeDashboardGrid');
    if(!grid)return;
    const oldGrid=home.querySelector('.home-grid');

    const next=$('homeNextShow');
    if(next){
      next.classList.add('home-dash-card','home-dash-live','home-dash-compact');
      next.dataset.dashboardRoute='tour';
      next.tabIndex=0;
      next.setAttribute('role','link');
      next.setAttribute('aria-label','Vai ai live');
      grid.appendChild(next);
    }

    const ranking=$('homeRankingPreview');
    if(ranking){
      ranking.classList.add('home-dash-card','home-dash-ranking','home-dash-compact');
      ranking.dataset.dashboardRoute='rankings';
      ranking.tabIndex=0;
      ranking.setAttribute('role','link');
      ranking.setAttribute('aria-label','Vai alle classifiche');
      grid.appendChild(ranking);
    }

    let news=$('homeNewsPreview');
    if(!news){
      news=document.createElement('article');
      news.id='homeNewsPreview';
      news.className='home-dash-card home-dash-news home-dash-compact glass-card';
      news.tabIndex=0;
      news.setAttribute('role','region');
      news.setAttribute('aria-label','Ultime novità');
      news.innerHTML=`
        <div class="home-dash-head">
          <div><span class="section-kicker">NEWS</span><h3>Novità</h3></div>
        </div>
        <div class="home-news-preview-list"><div class="card-loading">Caricamento novità…</div></div>`;
      grid.appendChild(news);
    }

    let merch=$('homeMerchPreview');
    if(!merch){
      merch=document.createElement('article');
      merch.id='homeMerchPreview';
      merch.className='home-dash-card home-dash-merch home-dash-compact glass-card';
      merch.dataset.dashboardRoute='more';
      merch.tabIndex=0;
      merch.setAttribute('role','link');
      merch.setAttribute('aria-label','Vai al merch');
      merch.innerHTML=`
        <span class="section-kicker">MERCH</span>
        <h3>Merch in saldo</h3>
        <p>Offerte, pezzi rimasti e cattive idee da recuperare al banchetto.</p>
        <span class="home-dash-arrow">VEDI MERCH →</span>`;
      grid.appendChild(merch);
    }

    let contacts=$('homeContactsPreview');
    if(!contacts){
      contacts=document.createElement('article');
      contacts.id='homeContactsPreview';
      contacts.className='home-dash-card home-dash-contacts home-dash-compact glass-card';
      contacts.dataset.dashboardRoute='contacts';
      contacts.tabIndex=0;
      contacts.setAttribute('role','link');
      contacts.setAttribute('aria-label','Vai ai contatti');
      contacts.innerHTML=`
        <span class="section-kicker">BOOKING</span>
        <h3>Contatti</h3>
        <p>Vuoi portarci sul tuo palco? Contatti e calendario disponibilità.</p>
        <span class="home-dash-arrow">CONTATTACI →</span>`;
      grid.appendChild(contacts);
    }

    if(oldGrid&&!oldGrid.children.length)oldGrid.remove();

    $('homeMedia')?.classList.add('home-legacy-hidden');
    $('homeMemberCarousel')?.classList.add('home-legacy-hidden');
    $('homeRepertoirePreview')?.remove();
    $('homeBandPreview')?.remove();
  }

  function ensurePublicSections() {
    const nav = $('mainNav');
    if (nav && !nav.querySelector('[data-route="repertoire"]')) {
      const btn = document.createElement('button');
      btn.className = 'nav-item';
      btn.dataset.route = 'repertoire';
      btn.type = 'button';
      btn.innerHTML = '<span>REPERTORIO</span>';
      const before = nav.querySelector('[data-route="rankings"]');
      nav.insertBefore(btn,before || null);
    }
    if (nav && !nav.querySelector('[data-route="contacts"]')) {
      const btn = document.createElement('button');
      btn.className = 'nav-item';
      btn.dataset.route = 'contacts';
      btn.type = 'button';
      btn.innerHTML = '<span>CONTATTI</span>';
      nav.appendChild(btn);
    }
    const moreNav = nav?.querySelector('[data-route="more"] span');
    if (moreNav) {
      delete moreNav.dataset.copy;
      moreNav.textContent = 'MEDIA';
    }

    if (!$('repertoirePage')) {
      const page = document.createElement('section');
      page.className = 'page';
      page.id = 'repertoirePage';
      page.dataset.page = 'repertoire';
      page.innerHTML = `
        <header class="page-hero compact-hero glass-card repertoire-hero">
          <div><span class="section-kicker">TUTTO QUELLO CHE SUONIAMO</span><h2>REPERTORIO</h2><p>Tutti i brani dei John & i Molesti, con cover art, dettagli e ascolto quando disponibile.</p></div>
          <div class="page-hero-ornament">PLAY</div>
        </header>
        <section class="content-section" id="repertoireBlock">
          <div class="section-heading repertoire-heading">
            <div><span class="section-kicker">CATALOGO</span><h3>Tutte le canzoni</h3></div>
            <span class="section-count" id="repertoireCount"></span>
          </div>
          <div class="repertoire-toolbar">
            <input id="repertoireSearch" type="search" placeholder="Cerca titolo, base o testo…" autocomplete="off">
          </div>
          <div class="repertoire-grid" id="repertoireGrid"><div class="empty-state">Caricamento repertorio…</div></div>
        </section>`;
      const rankings = $('rankingsPage');
      rankings?.parentNode?.insertBefore(page, rankings);
    }

    const morePage = $('morePage');
    if (morePage) {
      const hero = morePage.querySelector('.page-hero');
      if (hero) {
        const kicker = hero.querySelector('.section-kicker');
        const title = hero.querySelector('h2');
        const lead = hero.querySelector('p');
        const ornament = hero.querySelector('.page-hero-ornament');
        if (kicker) { delete kicker.dataset.copy; kicker.textContent='VIDEO, FOTO, LOCANDINE'; }
        if (title) { delete title.dataset.copy; title.textContent='MEDIA'; }
        if (lead) { delete lead.dataset.copy; lead.textContent='Video dal vivo, foto selezionate e locandine della band.'; }
        if (ornament) { delete ornament.dataset.copy; ornament.textContent='MEDIA'; }
      }
      const moreGrid = morePage.querySelector('.more-grid');
      if (moreGrid && !$('videosBlock')) {
        moreGrid.insertAdjacentHTML('afterbegin',`
          <article class="gallery-card glass-card public-video-section" id="videosBlock">
            <div class="gallery-heading public-video-heading"><div><span class="section-kicker">GUARDA</span><h3>Video</h3></div><div class="public-media-heading-actions"><span id="videoCount"></span><button class="text-button public-admin-only hidden" id="publicAddVideo" type="button">+ VIDEO</button></div></div>
            <div class="public-video-grid" id="publicVideoGrid"><div class="empty-state">Caricamento video…</div></div>
          </article>
          <article class="gallery-card glass-card public-photo-section" id="photosBlock">
            <div class="gallery-heading"><div><span class="section-kicker">DAL PALCO</span><h3>Le foto più belle</h3></div><span id="photoCount"></span></div>
            <div class="public-photo-grid" id="publicPhotoGrid"><div class="empty-state">Caricamento foto…</div></div>
          </article>`);
      }
      const gallery = $('galleryBlock');
      if (gallery) {
        const k = gallery.querySelector('.section-kicker');
        const h = gallery.querySelector('h3');
        if (k) { delete k.dataset.copy; k.textContent='ARCHIVIO GRAFICO'; }
        if (h) { h.removeAttribute('data-copy'); h.innerHTML='Locandine'; }
      }
    }

    const oldContacts = $('contactsBlock');
    if (oldContacts) oldContacts.remove();

    if (!$('contactsPage')) {
      const page = document.createElement('section');
      page.className = 'page';
      page.id = 'contactsPage';
      page.dataset.page = 'contacts';
      page.innerHTML = `
        <header class="page-hero compact-hero glass-card contacts-hero">
          <div><span class="section-kicker">BOOKING / CONTATTI</span><h2>SUONIAMO DA TE?</h2><p>Proponici una o più date e raccontaci il tuo evento. Le giornate già impegnate non sono selezionabili.</p></div>
          <div class="page-hero-ornament">CIAO</div>
        </header>
        <section class="contacts-layout">
          <article class="glass-card contacts-channel-card" id="contactChannelsBlock">
            <span class="section-kicker">CONTATTI</span>
            <h3>Parliamone.</h3>
            <p>Per eventi, locali, feste, festival e idee discutibili puoi usare il modulo booking oppure contattarci sui nostri canali.</p>
            <div class="contact-actions contacts-social-actions" id="contactsSocialActions"><span class="muted-inline">Canali in aggiornamento.</span></div>
          </article>
          <article class="glass-card booking-card" id="bookingBlock">
            <div class="booking-heading"><div><span class="section-kicker">RICHIESTA LIVE</span><h3>Scegli le date</h3></div><span class="booking-help">Puoi selezionare più giorni.</span></div>
            <div class="booking-calendar" aria-label="Calendario disponibilità">
              <div class="booking-calendar-head"><button id="bookingPrevMonth" type="button" aria-label="Mese precedente">←</button><strong id="bookingMonthLabel"></strong><button id="bookingNextMonth" type="button" aria-label="Mese successivo">→</button></div>
              <div class="booking-weekdays" aria-hidden="true"><span>LUN</span><span>MAR</span><span>MER</span><span>GIO</span><span>VEN</span><span>SAB</span><span>DOM</span></div>
              <div class="booking-days" id="bookingDays"></div>
              <div class="booking-legend"><span><i class="free"></i> disponibile</span><span><i class="selected"></i> selezionata</span><span><i class="busy"></i> occupata</span></div>
            </div>
            <div class="booking-selected-wrap"><strong>DATE SELEZIONATE</strong><div id="bookingSelectedDates" class="booking-selected-dates"><span>Nessuna data selezionata.</span></div></div>
            <form id="bookingForm" class="booking-form">
              <div class="booking-form-grid">
                <label><span>Nome / referente *</span><input id="bookingName" maxlength="120" required autocomplete="name"></label>
                <label><span>Email *</span><input id="bookingEmail" type="email" maxlength="240" required autocomplete="email"></label>
                <label><span>Telefono</span><input id="bookingPhone" maxlength="80" autocomplete="tel"></label>
                <label><span>Organizzazione / locale</span><input id="bookingOrganization" maxlength="160"></label>
                <label><span>Nome evento *</span><input id="bookingEventName" maxlength="180" required></label>
                <label><span>Tipo evento</span><select id="bookingEventType"><option value="">—</option><option>Locale / live club</option><option>Festa / sagra</option><option>Festival</option><option>Evento privato</option><option>Evento aziendale</option><option>Altro</option></select></label>
                <label><span>Venue / spazio</span><input id="bookingVenue" maxlength="180"></label>
                <label><span>Città</span><input id="bookingCity" maxlength="140"></label>
                <label class="booking-wide"><span>Dettagli dell'evento</span><textarea id="bookingDetails" maxlength="3000" placeholder="Orari indicativi, palco, pubblico, formula della serata, eventuali vincoli…"></textarea></label>
              </div>
              <div class="booking-submit-row"><span id="bookingStatus" role="status"></span><button class="btn btn-primary" type="submit">INVIA RICHIESTA</button></div>
            </form>
          </article>
        </section>`;
      const more = $('morePage');
      more?.parentNode?.insertBefore(page, more.nextSibling);
    }
  }
  function videoEmbedInfo(url) {
    const href = safeHttps(url);
    if (!href) return null;
    try {
      const u = new URL(href);
      const host = u.hostname.replace(/^www\./,'').toLowerCase();
      let id = '';
      if (host === 'youtu.be') id = u.pathname.split('/').filter(Boolean)[0] || '';
      if (host.endsWith('youtube.com')) {
        if (u.pathname === '/watch') id = u.searchParams.get('v') || '';
        else {
          const m = u.pathname.match(/^\/(?:shorts|embed)\/([^/?#]+)/);
          if (m) id = m[1];
        }
      }
      if (id) return {provider:'YouTube',embed:`https://www.youtube.com/embed/${encodeURIComponent(id)}`,href};
      if (host.endsWith('vimeo.com')) {
        const m = u.pathname.match(/\/(\d+)/);
        if (m) return {provider:'Vimeo',embed:`https://player.vimeo.com/video/${m[1]}`,href};
      }
      if (host.endsWith('instagram.com')) {
        const m = u.pathname.match(/^\/(p|reel|tv)\/([^/?#]+)/);
        if (m) return {provider:'Instagram',embed:`https://www.instagram.com/${m[1]}/${m[2]}/embed`,href};
      }
      if (host.endsWith('tiktok.com')) {
        const m = u.pathname.match(/\/video\/(\d+)/);
        if (m) return {provider:'TikTok',embed:`https://www.tiktok.com/player/v1/${m[1]}`,href};
      }
      if (host.endsWith('facebook.com') || host.endsWith('fb.watch')) {
        return {provider:'Facebook',embed:`https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(href)}&show_text=false`,href};
      }
      return {provider:host,embed:'',href};
    } catch { return null; }
  }

  function isPublicAdmin() {
    return !!(currentMember && MEMBER_ADMINS.has(String(currentMember.username||'').toLowerCase()));
  }
  function syncPublicAdminControls() {
    $$('.public-admin-only').forEach(el=>el.classList.toggle('hidden',!isPublicAdmin()));
    syncAdminNewsNavigation();
  }

  function syncAdminNewsNavigation(){
    const nav=$('mainNav');
    const admin=isPublicAdmin();
    let button=$('adminNewsNav');

    if(admin&&nav&&!button){
      button=document.createElement('button');
      button.id='adminNewsNav';
      button.className='nav-item admin-news-nav';
      button.dataset.route='news-admin';
      button.type='button';
      button.innerHTML='<span>NOVITÀ</span>';
      button.onclick=()=>go('news-admin');
      nav.appendChild(button);
    }

    if(button)button.hidden=!admin;

    if(admin){
      ensureHomeNewsEditor();
    }else if(currentRoute()==='news-admin'){
      go('home');
    }
  }
  function ensurePublicVideoEditor() {
    let modal=$('publicVideoEditorModal');
    if(modal)return modal;
    modal=document.createElement('div');
    modal.className='modal';
    modal.id='publicVideoEditorModal';
    modal.hidden=true;
    modal.innerHTML=`<div class="modal-backdrop"></div><section class="modal-card public-video-editor-card" role="dialog" aria-modal="true" aria-labelledby="publicVideoEditorTitle"><header class="modal-head"><div><span class="section-kicker">VIDEO PUBBLICO</span><h2 id="publicVideoEditorTitle">Aggiungi video</h2></div><button class="modal-close" type="button" aria-label="Chiudi">×</button></header><form class="modal-body public-video-editor-form" id="publicVideoEditorForm"><input id="publicVideoId" type="hidden"><label><span>Titolo *</span><input id="publicVideoTitle" maxlength="160" required></label><label><span>Link YouTube / social *</span><input id="publicVideoUrl" type="url" placeholder="https://..." required></label><label><span>Didascalia</span><textarea id="publicVideoCaption" maxlength="1000"></textarea></label><label><span>Ordine</span><input id="publicVideoOrder" type="number" value="0" step="1"></label><div class="public-video-editor-actions"><span id="publicVideoEditorStatus"></span><button class="btn btn-primary" type="submit">SALVA VIDEO</button></div></form></section>`;
    document.body.appendChild(modal);
    modal.querySelector('.modal-close').onclick=()=>closeModal(modal.id);
    modal.querySelector('.modal-backdrop').onclick=()=>closeModal(modal.id);
    modal.querySelector('form').onsubmit=savePublicVideoFromSite;
    return modal;
  }
  function openPublicVideoEditor(item=null) {
    if(!isPublicAdmin())return;
    ensurePublicVideoEditor();
    $('publicVideoId').value=item?.id||'';
    $('publicVideoTitle').value=item?.title||'';
    $('publicVideoUrl').value=item?.source_url||'';
    $('publicVideoCaption').value=item?.caption||'';
    $('publicVideoOrder').value=Number(item?.sort_order||0);
    $('publicVideoEditorTitle').textContent=item?'Modifica video':'Aggiungi video';
    $('publicVideoEditorStatus').textContent='';
    openModal('publicVideoEditorModal');
  }
  async function savePublicVideoFromSite(e) {
    e.preventDefault();
    if(!isPublicAdmin())return;
    const id=$('publicVideoId').value;
    const title=$('publicVideoTitle').value.trim();
    const source_url=safeHttps($('publicVideoUrl').value.trim());
    const caption=$('publicVideoCaption').value.trim();
    const sort_order=Number($('publicVideoOrder').value)||0;
    const status=$('publicVideoEditorStatus');
    if(!title||!source_url){status.textContent='Titolo e URL https sono obbligatori.';return}
    status.textContent='Salvataggio…';
    const payload={kind:'video',title,caption,source_url,storage_path:null,published:true,sort_order,updated_at:new Date().toISOString()};
    let result;
    if(id) result=await sb.from('public_media').update(payload).eq('id',id);
    else result=await sb.from('public_media').insert({...payload,created_by:currentMember?.id||null});
    if(result.error){status.textContent=result.error.message;return}
    closeModal('publicVideoEditorModal');
    await loadPublicContentExtensions(true);
    renderPublicMedia();
    syncPublicAdminControls();
    toast('Video pubblicato ✓','ok');
  }
  async function deletePublicVideoFromSite(item) {
    if(!isPublicAdmin()||!item||!confirm(`Eliminare "${item.title||'Video'}"?`))return;
    const {error}=await sb.from('public_media').delete().eq('id',item.id);
    if(error){toast(error.message,'error');return}
    await loadPublicContentExtensions(true);renderPublicMedia();syncPublicAdminControls();
  }

  function newsSourceOptions(type,selected='') {
    let rows=[];
    if(type==='concert')rows=publicConcertPool().filter(c=>c.status!=='cancelled').map(c=>({id:c.id,label:`${formatDate(c.concert_date)} · ${c.name}`}));
    else if(type==='song')rows=publicSongs.map(song=>({id:song.id,label:song.title||'Brano'}));
    else if(type==='media')rows=publicMedia.filter(x=>x.kind==='photo').map(item=>({id:item.id,label:item.title||item.caption||'Foto'}));
    return `<option value="">— seleziona —</option>${rows.map(row=>`<option value="${esc(row.id)}" ${String(row.id)===String(selected)?'selected':''}>${esc(row.label)}</option>`).join('')}`;
  }

  function sourceDefaults(type,id){
    if(type==='concert'){
      const c=concerts.find(x=>String(x.id)===String(id));
      if(!c)return null;
      return {kind:'event',title:c.name||'',body:[prettyPlace(c),formatDate(c.concert_date)+(c.start_time?' · '+formatTime(c.start_time):'')].filter(Boolean).join(' · '),action_label:'DETTAGLI DEL LIVE'};
    }
    if(type==='song'){
      const song=publicSongs.find(x=>String(x.id)===String(id));
      if(!song)return null;
      return {kind:'song',title:song.title||'',body:songArtistLine(song)||'John & i Molesti',action_label:'SCOPRI IL BRANO'};
    }
    if(type==='media'){
      const media=publicMedia.find(x=>String(x.id)===String(id));
      if(!media)return null;
      return {kind:'news',title:media.title||'Dal palco',body:media.caption||'',action_label:'GUARDA'};
    }
    return {kind:'news',title:'',body:'',action_label:'SCOPRI DI PIÙ'};
  }

  function localDateTimeInput(value){
    if(!value)return '';
    const d=new Date(value);if(Number.isNaN(d.getTime()))return '';
    const pad=n=>String(n).padStart(2,'0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  let homeNewsPreviewObjectUrl='';

  function ensureHomeNewsEditor(){
    let page=$('newsAdminPage');
    if(page)return page;

    page=document.createElement('section');
    page.className='page news-admin-page';
    page.id='newsAdminPage';
    page.dataset.page='news-admin';
    page.innerHTML=`
      <header class="page-hero compact-hero glass-card news-admin-hero">
        <div>
          <span class="section-kicker">SOLO ADMIN</span>
          <h2>NOVITÀ HOME</h2>
          <p>Seleziona cosa mettere in evidenza, scrivi contenuti ex novo e regola il ritaglio delle immagini.</p>
        </div>
        <div class="page-hero-ornament">NEWS</div>
      </header>

      <section class="home-fallback-editor glass-card" id="homeFallbackEditor">
        <div class="home-fallback-editor-head">
          <div>
            <span class="section-kicker">FALLBACK AUTOMATICO</span>
            <h3>Prossimo live</h3>
            <p>Questa è la novità mostrata automaticamente quando non ci sono news pubblicate. Puoi sistemare il ritaglio della locandina senza trasformarla in una news manuale.</p>
          </div>
          <button class="btn btn-primary" id="homeFallbackSave" type="button">SALVA RITAGLIO</button>
        </div>

        <div class="home-fallback-editor-body">
          <div class="home-fallback-preview" id="homeFallbackPreview">
            <img id="homeFallbackPreviewImage" alt="" hidden>
            <div class="home-fallback-preview-copy">
              <span class="section-kicker">PROSSIMO LIVE</span>
              <strong id="homeFallbackPreviewTitle">Nessun live futuro</strong>
              <small id="homeFallbackPreviewMeta"></small>
            </div>
          </div>

          <div class="home-news-crop-controls home-fallback-controls">
            <label>POSIZIONE ORIZZONTALE <output id="homeFallbackPosXOut">50%</output>
              <input id="homeFallbackPosX" type="range" min="0" max="100" step="1" value="50">
            </label>
            <label>POSIZIONE VERTICALE <output id="homeFallbackPosYOut">50%</output>
              <input id="homeFallbackPosY" type="range" min="0" max="100" step="1" value="50">
            </label>
            <label>ZOOM / RITAGLIO <output id="homeFallbackZoomOut">100%</output>
              <input id="homeFallbackZoom" type="range" min="100" max="240" step="5" value="100">
            </label>
          </div>

          <span class="home-fallback-status" id="homeFallbackStatus"></span>
        </div>
      </section>

      <section class="home-news-admin-layout news-admin-layout">
        <form id="homeNewsForm" class="home-news-form glass-card">
          <input id="homeNewsId" type="hidden">
          <input id="homeNewsOldImage" type="hidden">

          <div class="home-news-form-head">
            <strong id="homeNewsFormTitle">NUOVA NOVITÀ</strong>
            <button id="homeNewsReset" type="button">NUOVA</button>
          </div>

          <label>ORIGINE
            <select id="homeNewsSourceType">
              <option value="concert">Concerto</option>
              <option value="song">Brano</option>
              <option value="media">Foto / media</option>
              <option value="custom">Ex novo</option>
            </select>
          </label>

          <label id="homeNewsSourceWrap">CONTENUTO
            <select id="homeNewsSourceId"></select>
          </label>

          <label>TITOLO<input id="homeNewsTitle" maxlength="160" required></label>
          <label>TESTO<textarea id="homeNewsBody" maxlength="1200" rows="4"></textarea></label>

          <div class="home-news-form-two">
            <label>TESTO BOTTONE<input id="homeNewsActionLabel" maxlength="80" placeholder="SCOPRI DI PIÙ"></label>
            <label>ORDINE<input id="homeNewsOrder" type="number" step="1" value="100"></label>
          </div>

          <label id="homeNewsLinkWrap">LINK ESTERNO (FACOLTATIVO)<input id="homeNewsLink" placeholder="https://..."></label>

          <label>IMMAGINE PERSONALIZZATA (FACOLTATIVA)
            <input id="homeNewsImage" type="file" accept="image/*">
            <span class="home-news-help">Se non carichi nulla, live/brano/media usano automaticamente locandina, cover o foto originale.</span>
          </label>

          <section class="home-news-crop-panel">
            <div class="home-news-crop-preview" id="homeNewsCropPreview">
              <img id="homeNewsCropPreviewImage" alt="" hidden>
              <span id="homeNewsCropEmpty">Seleziona una sorgente o un'immagine.</span>
            </div>
            <div class="home-news-crop-controls">
              <label>POSIZIONE ORIZZONTALE <output id="homeNewsPosXOut">50%</output>
                <input id="homeNewsPosX" type="range" min="0" max="100" step="1" value="50">
              </label>
              <label>POSIZIONE VERTICALE <output id="homeNewsPosYOut">50%</output>
                <input id="homeNewsPosY" type="range" min="0" max="100" step="1" value="50">
              </label>
              <label>ZOOM / RITAGLIO <output id="homeNewsZoomOut">100%</output>
                <input id="homeNewsZoom" type="range" min="100" max="240" step="5" value="100">
              </label>
            </div>
          </section>

          <div class="home-news-form-two">
            <label>PUBBLICAZIONE<input id="homeNewsPublishedAt" type="datetime-local"></label>
            <label>SCADENZA (FACOLTATIVA)<input id="homeNewsExpiresAt" type="datetime-local"></label>
          </div>

          <label class="home-news-check"><input id="homeNewsPublished" type="checkbox" checked> VISIBILE IN HOME</label>

          <div class="home-news-save-row">
            <span id="homeNewsStatus"></span>
            <button class="btn btn-primary" type="submit">SALVA NOVITÀ</button>
          </div>
        </form>

        <section class="home-news-list-panel glass-card">
          <div class="home-news-list-head"><strong>NOVITÀ CONFIGURATE</strong><span id="homeNewsCounter"></span></div>
          <div id="homeNewsAdminList" class="home-news-admin-list"></div>
        </section>
      </section>`;

    $('contentStage')?.appendChild(page);

    $('homeNewsSourceType').onchange=()=>{syncHomeNewsSourceUi(true);syncHomeNewsCropPreview();};
    $('homeNewsSourceId').onchange=()=>{applyHomeNewsSourceDefaults();syncHomeNewsCropPreview();};
    $('homeNewsReset').onclick=()=>resetHomeNewsForm();
    $('homeNewsForm').onsubmit=saveHomeNews;
    $('homeNewsImage').onchange=()=>syncHomeNewsCropPreview(true);
    ['homeNewsPosX','homeNewsPosY','homeNewsZoom'].forEach(id=>{$(id).oninput=syncHomeNewsCropPreview;});

    ['homeFallbackPosX','homeFallbackPosY','homeFallbackZoom'].forEach(id=>{
      $(id).oninput=syncHomeFallbackCropPreview;
    });
    $('homeFallbackSave').onclick=saveHomeFallbackCrop;
    syncHomeFallbackAdmin();

    return page;
  }

  function syncHomeFallbackAdmin(){
    const x=$('homeFallbackPosX'),y=$('homeFallbackPosY'),zoom=$('homeFallbackZoom');
    if(!x||!y||!zoom)return;
    x.value=Number(homeSettings.fallback_image_position_x??50);
    y.value=Number(homeSettings.fallback_image_position_y??50);
    zoom.value=Number(homeSettings.fallback_image_zoom??100);
    syncHomeFallbackCropPreview();
  }

  function syncHomeFallbackCropPreview(){
    const image=$('homeFallbackPreviewImage');
    const title=$('homeFallbackPreviewTitle');
    const meta=$('homeFallbackPreviewMeta');
    if(!image||!title||!meta)return;

    const c=nextConcert();
    const x=Number($('homeFallbackPosX')?.value??homeSettings.fallback_image_position_x??50);
    const y=Number($('homeFallbackPosY')?.value??homeSettings.fallback_image_position_y??50);
    const zoom=Number($('homeFallbackZoom')?.value??homeSettings.fallback_image_zoom??100);
    if($('homeFallbackPosXOut'))$('homeFallbackPosXOut').textContent=x+'%';
    if($('homeFallbackPosYOut'))$('homeFallbackPosYOut').textContent=y+'%';
    if($('homeFallbackZoomOut'))$('homeFallbackZoomOut').textContent=zoom+'%';

    if(!c){
      image.hidden=true;
      image.removeAttribute('src');
      title.textContent='Nessun live futuro';
      meta.textContent='';
      return;
    }

    const src=primaryPosterUrl(c.poster_path)||'';
    title.textContent=c.name||'Prossimo live';
    meta.textContent=formatDate(c.concert_date)+(c.start_time?' · '+formatTime(c.start_time):'');

    image.hidden=!src;
    if(src){
      image.src=src;
      image.style.objectPosition=`${x}% ${y}%`;
      image.style.transform=`scale(${zoom/100})`;
      image.style.transformOrigin=`${x}% ${y}%`;
    }
  }

  async function saveHomeFallbackCrop(){
    if(!isPublicAdmin())return;
    const btn=$('homeFallbackSave');
    const status=$('homeFallbackStatus');
    btn.disabled=true;
    if(status)status.textContent='Salvataggio…';

    const payload={
      fallback_image_position_x:Number($('homeFallbackPosX').value),
      fallback_image_position_y:Number($('homeFallbackPosY').value),
      fallback_image_zoom:Number($('homeFallbackZoom').value)
    };

    try{
      const {data,error}=await sb.from('site_home_settings')
        .update(payload)
        .eq('id','home')
        .select('fallback_image_position_x,fallback_image_position_y,fallback_image_zoom')
        .single();
      if(error)throw error;

      homeSettings={...homeSettings,...data};
      highlightSignature='';
      renderHighlights();
      if(status)status.textContent='Ritaglio salvato ✓';
      toast('Ritaglio del prossimo live salvato ✓','ok');
    }catch(err){
      if(status)status.textContent=err.message||String(err);
    }finally{
      btn.disabled=false;
    }
  }

  function homeNewsSourceImage(type,id){
    if(type==='concert'){
      const c=concerts.find(x=>String(x.id)===String(id));
      return c?primaryPosterUrl(c.poster_path)||'':'';
    }
    if(type==='song'){
      const song=publicSongs.find(x=>String(x.id)===String(id));
      return song?posterUrl(song.cover_path)||'':'';
    }
    if(type==='media'){
      const media=publicMedia.find(x=>String(x.id)===String(id));
      return media&&media.kind==='photo'?publicMediaAssetUrl(media.storage_path)||'':'';
    }
    return '';
  }

  function syncHomeNewsCropPreview(fileChanged=false){
    const img=$('homeNewsCropPreviewImage');
    const empty=$('homeNewsCropEmpty');
    if(!img||!empty)return;

    const x=Number($('homeNewsPosX')?.value||50);
    const y=Number($('homeNewsPosY')?.value||50);
    const zoom=Number($('homeNewsZoom')?.value||100);

    if($('homeNewsPosXOut'))$('homeNewsPosXOut').textContent=x+'%';
    if($('homeNewsPosYOut'))$('homeNewsPosYOut').textContent=y+'%';
    if($('homeNewsZoomOut'))$('homeNewsZoomOut').textContent=zoom+'%';

    if(fileChanged&&homeNewsPreviewObjectUrl){
      URL.revokeObjectURL(homeNewsPreviewObjectUrl);
      homeNewsPreviewObjectUrl='';
    }

    const file=$('homeNewsImage')?.files?.[0]||null;
    let src='';

    if(file){
      if(!homeNewsPreviewObjectUrl)homeNewsPreviewObjectUrl=URL.createObjectURL(file);
      src=homeNewsPreviewObjectUrl;
    }else{
      const old=$('homeNewsOldImage')?.value||'';
      if(old)src=publicSiteAssetUrl(old)||'';
      if(!src)src=homeNewsSourceImage($('homeNewsSourceType')?.value||'custom',$('homeNewsSourceId')?.value||'');
    }

    img.hidden=!src;
    empty.hidden=!!src;

    if(src){
      img.src=src;
      img.style.objectPosition=`${x}% ${y}%`;
      img.style.transform=`scale(${zoom/100})`;
      img.style.transformOrigin=`${x}% ${y}%`;
    }else{
      img.removeAttribute('src');
      img.style.removeProperty('transform');
    }
  }

  function syncHomeNewsSourceUi(applyDefaults=false){
    const type=$('homeNewsSourceType').value;
    const sourceWrap=$('homeNewsSourceWrap');
    sourceWrap.hidden=type==='custom';
    $('homeNewsSourceId').innerHTML=newsSourceOptions(type,$('homeNewsSourceId').value);
    $('homeNewsLinkWrap').hidden=type!=='custom';
    if(applyDefaults){$('homeNewsSourceId').value='';const d=sourceDefaults('custom','');$('homeNewsTitle').value=d.title;$('homeNewsBody').value=d.body;$('homeNewsActionLabel').value=d.action_label}
    syncHomeNewsCropPreview();
  }

  function applyHomeNewsSourceDefaults(){
    const type=$('homeNewsSourceType').value,id=$('homeNewsSourceId').value;
    const d=sourceDefaults(type,id);if(!d)return;
    $('homeNewsTitle').value=d.title;
    $('homeNewsBody').value=d.body;
    $('homeNewsActionLabel').value=d.action_label;
    syncHomeNewsCropPreview();
  }

  function resetHomeNewsForm(){
    const form=$('homeNewsForm');form.reset();
    $('homeNewsId').value='';$('homeNewsOldImage').value='';
    $('homeNewsSourceType').value='concert';
    $('homeNewsOrder').value='100';$('homeNewsPublished').checked=true;
    $('homeNewsPublishedAt').value=localDateTimeInput(new Date());
    $('homeNewsExpiresAt').value='';$('homeNewsStatus').textContent='';$('homeNewsFormTitle').textContent='NUOVA NOVITÀ';
    $('homeNewsPosX').value='50';$('homeNewsPosY').value='50';$('homeNewsZoom').value='100';
    if(homeNewsPreviewObjectUrl){URL.revokeObjectURL(homeNewsPreviewObjectUrl);homeNewsPreviewObjectUrl=''}
    syncHomeNewsSourceUi(false);
    syncHomeNewsCropPreview();
  }

  async function loadHomeNewsAdminList(){
    if(!isPublicAdmin())return [];
    const {data,error}=await sb.from('site_news').select('id,kind,title,body,link_url,published,published_at,expires_at,source_type,source_id,image_path,image_position_x,image_position_y,image_zoom,action_label,sort_order,updated_at').order('sort_order',{ascending:true}).order('published_at',{ascending:false});
    if(error)throw error;
    const rows=data||[],list=$('homeNewsAdminList');
    $('homeNewsCounter').textContent=`${rows.length} VOCI`;
    list.innerHTML=rows.map(row=>{
      const expired=row.expires_at&&Date.parse(row.expires_at)<=Date.now();
      const status=!row.published?'OFF':expired?'SCADUTA':'ON';
      const source={concert:'LIVE',song:'BRANO',media:'MEDIA',custom:'EX NOVO'}[row.source_type]||'EX NOVO';
      return `<article class="home-news-admin-row" data-home-news-id="${esc(row.id)}"><div><strong>${esc(row.title)}</strong><span>${esc(source)} · ${status} · ordine ${Number(row.sort_order||0)}${row.expires_at?` · fino al ${esc(formatDate(row.expires_at))}`:''}</span></div><div><button type="button" data-news-edit>MODIFICA</button><button type="button" class="danger" data-news-delete>ELIMINA</button></div></article>`;
    }).join('')||'<div class="empty-state">Nessuna novità configurata.</div>';
    $$('[data-home-news-id]',list).forEach(node=>{
      const row=rows.find(x=>String(x.id)===node.dataset.homeNewsId);
      node.querySelector('[data-news-edit]').onclick=()=>editHomeNews(row);
      node.querySelector('[data-news-delete]').onclick=()=>deleteHomeNews(row);
    });
    return rows;
  }

  function editHomeNews(row){
    if(!row)return;
    $('homeNewsId').value=row.id;
    $('homeNewsOldImage').value=row.image_path||'';
    $('homeNewsSourceType').value=row.source_type||'custom';
    syncHomeNewsSourceUi(false);
    $('homeNewsSourceId').value=row.source_id||'';
    $('homeNewsTitle').value=row.title||'';
    $('homeNewsBody').value=row.body||'';
    $('homeNewsActionLabel').value=row.action_label||'';
    $('homeNewsLink').value=row.link_url||'';
    $('homeNewsOrder').value=Number(row.sort_order||0);
    $('homeNewsPublished').checked=row.published!==false;
    $('homeNewsPublishedAt').value=localDateTimeInput(row.published_at);
    $('homeNewsExpiresAt').value=localDateTimeInput(row.expires_at);
    $('homeNewsPosX').value=Number(row.image_position_x??50);
    $('homeNewsPosY').value=Number(row.image_position_y??50);
    $('homeNewsZoom').value=Number(row.image_zoom??100);
    $('homeNewsFormTitle').textContent='MODIFICA NOVITÀ';
    $('homeNewsStatus').textContent=row.image_path?'Immagine personalizzata presente.':'';
    syncHomeNewsCropPreview();
  }

  async function saveHomeNews(e){
    e.preventDefault();if(!isPublicAdmin())return;
    const btn=e.currentTarget.querySelector('button[type="submit"]'),status=$('homeNewsStatus');
    const id=$('homeNewsId').value||crypto.randomUUID();
    const isNew=!$('homeNewsId').value;
    const source_type=$('homeNewsSourceType').value;
    const source_id=source_type==='custom'?null:($('homeNewsSourceId').value||null);
    if(source_type!=='custom'&&!source_id){status.textContent='Seleziona il contenuto da mettere in evidenza.';return}
    const title=$('homeNewsTitle').value.trim();if(!title){status.textContent='Inserisci il titolo.';return}
    const body=$('homeNewsBody').value.trim();
    const linkRaw=$('homeNewsLink').value.trim();
    const link_url=linkRaw?safeHttps(linkRaw):'';
    if(linkRaw&&!link_url){status.textContent='Il link deve essere https.';return}
    const defaults=sourceDefaults(source_type,source_id)||{kind:'news'};
    const oldImage=$('homeNewsOldImage').value||null;
    let image_path=oldImage;
    let uploadedPath=null;
    const file=$('homeNewsImage').files?.[0]||null;
    btn.disabled=true;status.textContent='Salvataggio…';
    try{
      if(file){
        if(!String(file.type||'').startsWith('image/'))throw new Error('Il file deve essere un’immagine.');
        const ext=(file.name.split('.').pop()||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'')||'jpg';
        uploadedPath=`news/${id}/${Date.now()}.${ext}`;
        const {error:up}=await sb.storage.from('public-site').upload(uploadedPath,file,{contentType:file.type||undefined,upsert:false});if(up)throw up;
        image_path=uploadedPath;
      }
      const payload={
        id,kind:defaults.kind||'news',title,body,link_url,
        published:$('homeNewsPublished').checked,
        published_at:$('homeNewsPublishedAt').value?new Date($('homeNewsPublishedAt').value).toISOString():new Date().toISOString(),
        expires_at:$('homeNewsExpiresAt').value?new Date($('homeNewsExpiresAt').value).toISOString():null,
        source_type,source_id,image_path,
        image_position_x:Number($('homeNewsPosX').value)||50,
        image_position_y:Number($('homeNewsPosY').value)||50,
        image_zoom:Number($('homeNewsZoom').value)||100,
        action_label:$('homeNewsActionLabel').value.trim(),
        sort_order:Number($('homeNewsOrder').value)||0
      };
      const result=isNew?await sb.from('site_news').insert(payload):await sb.from('site_news').update(payload).eq('id',id);
      if(result.error)throw result.error;
      if(uploadedPath&&oldImage&&oldImage!==uploadedPath)await sb.storage.from('public-site').remove([oldImage]);
      await loadPublicUpdates();renderHome();await loadHomeNewsAdminList();resetHomeNewsForm();
      status.textContent='Novità salvata ✓';toast('Novità home aggiornata ✓','ok');
    }catch(err){
      if(uploadedPath)await sb.storage.from('public-site').remove([uploadedPath]);
      status.textContent=err.message||String(err)
    }finally{btn.disabled=false}
  }

  async function deleteHomeNews(row){
    if(!isPublicAdmin()||!row||!confirm(`Eliminare “${row.title}”?`))return;
    const {error}=await sb.from('site_news').delete().eq('id',row.id);if(error)return toast(error.message,'error');
    if(row.image_path)await sb.storage.from('public-site').remove([row.image_path]);
    await loadPublicUpdates();renderHome();await loadHomeNewsAdminList();resetHomeNewsForm();
  }

  async function openHomeNewsEditor(){
    if(!isPublicAdmin())return;
    ensureHomeNewsEditor();
    resetHomeNewsForm();
    go('news-admin');
    try{
      await loadHomeNewsAdminList();
    }catch(err){
      if($('homeNewsAdminList'))$('homeNewsAdminList').innerHTML=`<div class="empty-state">${esc(err.message||String(err))}</div>`;
    }
  }
  window.JMNewsEditor={open:openHomeNewsEditor,refresh:loadPublicUpdates};

  function dateIsoLocal(value) {
    const d=value instanceof Date?value:new Date(value);
    const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${day}`;
  }
  function prettyBookingDate(iso) {
    const [y,m,d]=String(iso).split('-').map(Number);
    if(!y||!m||!d)return iso;
    return new Intl.DateTimeFormat('it-IT',{weekday:'short',day:'2-digit',month:'short',year:'numeric'}).format(new Date(y,m-1,d));
  }
  async function loadBookingAvailability() {
    if(!sb)return;
    const from=new Date();from.setHours(0,0,0,0);
    const to=new Date(from.getFullYear(),from.getMonth()+18,0);
    const {data,error}=await sb.rpc('get_public_unavailable_dates',{p_from:dateIsoLocal(from),p_to:dateIsoLocal(to)});
    if(error){console.warn('Calendario booking non disponibile',error);bookingUnavailable=new Set();bookingUnavailableSources=new Map();return}
    bookingUnavailable=new Set((data||[]).map(r=>String(r.day)));
    bookingUnavailableSources=new Map((data||[]).map(r=>[String(r.day),String(r.source||'busy')]));
    [...bookingSelectedDates].forEach(day=>{if(bookingUnavailable.has(day))bookingSelectedDates.delete(day)});
    bookingAvailabilityLoaded=true;
    renderBookingCalendar();
  }
  function renderBookingSelectedDates() {
    const box=$('bookingSelectedDates');if(!box)return;
    const days=[...bookingSelectedDates].sort();
    box.innerHTML=days.length?days.map(day=>`<button type="button" data-remove-booking-date="${esc(day)}" title="Rimuovi">${esc(prettyBookingDate(day))}<span>×</span></button>`).join(''):'<span>Nessuna data selezionata.</span>';
    $$('[data-remove-booking-date]',box).forEach(btn=>btn.onclick=()=>{bookingSelectedDates.delete(btn.dataset.removeBookingDate);renderBookingCalendar();});
  }
  function renderBookingCalendar() {
    const box=$('bookingDays'),label=$('bookingMonthLabel');if(!box||!label)return;
    const month=bookingCalendarMonth;
    label.textContent=new Intl.DateTimeFormat('it-IT',{month:'long',year:'numeric'}).format(month).toUpperCase();
    const first=new Date(month.getFullYear(),month.getMonth(),1);
    const last=new Date(month.getFullYear(),month.getMonth()+1,0);
    const mondayOffset=(first.getDay()+6)%7;
    const today=new Date();today.setHours(0,0,0,0);
    let html='';
    for(let i=0;i<mondayOffset;i++)html+='<span class="booking-day-blank"></span>';
    for(let n=1;n<=last.getDate();n++){
      const d=new Date(month.getFullYear(),month.getMonth(),n);const iso=dateIsoLocal(d);
      const past=d<today,busy=bookingUnavailable.has(iso),selected=bookingSelectedDates.has(iso),disabled=past||busy;
      const cls=['booking-day',busy?'busy':'',selected?'selected':'',past?'past':''].filter(Boolean).join(' ');
      const title=busy?'Data non disponibile':past?'Data trascorsa':selected?'Data selezionata':'Data disponibile';
      html+=`<button type="button" class="${cls}" data-booking-day="${iso}" ${disabled?'disabled':''} title="${title}"><span>${n}</span></button>`;
    }
    box.innerHTML=html;
    $$('[data-booking-day]',box).forEach(btn=>btn.onclick=()=>{
      const day=btn.dataset.bookingDay;
      if(bookingSelectedDates.has(day))bookingSelectedDates.delete(day);else bookingSelectedDates.add(day);
      renderBookingCalendar();
    });
    renderBookingSelectedDates();
  }
  async function submitBookingRequest(e) {
    e.preventDefault();
    const status=$('bookingStatus');const submit=e.currentTarget.querySelector('button[type="submit"]');
    const dates=[...bookingSelectedDates].sort();
    if(!dates.length){status.textContent='Seleziona almeno una data.';return}
    submit.disabled=true;status.textContent='Invio richiesta…';
    const args={
      p_requester_name:$('bookingName').value.trim(),p_requester_email:$('bookingEmail').value.trim(),p_requester_phone:$('bookingPhone').value.trim(),
      p_organization:$('bookingOrganization').value.trim(),p_event_name:$('bookingEventName').value.trim(),p_event_type:$('bookingEventType').value,
      p_venue_name:$('bookingVenue').value.trim(),p_city:$('bookingCity').value.trim(),p_details:$('bookingDetails').value.trim(),p_dates:dates
    };
    const {error}=await sb.rpc('submit_booking_request',args);
    submit.disabled=false;
    if(error){status.textContent=error.message;await loadBookingAvailability();return}
    e.currentTarget.reset();bookingSelectedDates.clear();status.textContent='Richiesta inviata. Vi ricontatteremo ai recapiti indicati.';
    await loadBookingAvailability();renderBookingCalendar();
  }

  function bandMemberPeriod(member) {
    const from = Number(member?.active_from_year) || null;
    const to = Number(member?.active_to_year) || null;
    if (member?.is_current) return from ? `DAL ${from}` : 'LINE-UP ATTUALE';
    if (from && to) return `${from}–${to}`;
    if (from) return `DAL ${from}`;
    if (to) return `FINO AL ${to}`;
    return 'EX MEMBRO';
  }

  async function loadMemberMedia() {
    try {
      const {data,error} = await sb.from('public_band_members')
        .select('id,name,role,description,image_path,sort_order,is_current,active_from_year,active_to_year,published,created_at')
        .order('sort_order',{ascending:true})
        .order('created_at',{ascending:true});
      if (error) throw error;
      memberMedia = data || [];
    } catch (err) {
      console.warn('Membri band non disponibili',err);
      memberMedia = [
        {id:'fallback-kekko',name:'Kekko',role:'Chitarra',description:'',sort_order:10,is_current:true,active_from_year:2025,published:true},
        {id:'fallback-ema',name:'Ema',role:'Batteria',description:'',sort_order:20,is_current:true,active_from_year:2025,published:true},
        {id:'fallback-gianni',name:'Gianni',role:'Voce',description:'',sort_order:30,is_current:true,active_from_year:2025,published:true},
        {id:'fallback-carlo',name:'Carlo',role:'Basso',description:'',sort_order:40,is_current:true,active_from_year:2025,published:true},
        {id:'fallback-ale',name:'Ale Lazza',role:'Chitarra',description:'',sort_order:50,is_current:true,active_from_year:2025,published:true}
      ];
    }
    memberMediaLoaded=true;
    renderMemberMedia();
    return memberMedia;
  }

  function bandMemberCard(member,index,{former=false}={}) {
    const src = publicSiteAssetUrl(member.image_path);
    const avatar = src
      ? `<div class="member-avatar has-photo"><img src="${esc(src)}" alt="${esc(member.name)}" loading="lazy"></div>`
      : `<div class="member-avatar">${esc(String(member.name || '?').charAt(0))}</div>`;
    return `<article class="member-card glass-card${former?' former-member-card':''}">
      <span class="member-no">${String(index+1).padStart(2,'0')}</span>
      ${avatar}
      <h4>${esc(String(member.name||'').toUpperCase())}</h4>
      <p class="member-role">${esc(member.role||'John & i Molesti')}</p>
      ${member.description?`<p class="member-description">${esc(member.description)}</p>`:''}
      <span class="member-period">${esc(bandMemberPeriod(member))}</span>
    </article>`;
  }

  function renderMemberMedia() {
    const published = memberMedia.filter(m => m.published !== false);
    const current = published.filter(m => m.is_current).sort((a,b)=>Number(a.sort_order||0)-Number(b.sort_order||0));
    const former = published.filter(m => !m.is_current).sort((a,b)=>Number(a.sort_order||0)-Number(b.sort_order||0));

    const grid = $('memberGrid');
    if (grid) grid.innerHTML = current.map((m,i)=>bandMemberCard(m,i)).join('') || '<div class="empty-state">Line-up in aggiornamento.</div>';

    const membersBlock = $('membersBlock');
    let formerBlock = $('formerMembersBlock');
    if (membersBlock && !formerBlock) {
      formerBlock = document.createElement('section');
      formerBlock.id = 'formerMembersBlock';
      formerBlock.className = 'content-section former-members-block';
      formerBlock.innerHTML = `<div class="section-heading"><div><span class="section-kicker">ARCHIVIO</span><h3>Ex Molesti</h3></div></div><div class="member-grid former-member-grid" id="formerMemberGrid"></div>`;
      membersBlock.insertAdjacentElement('afterend',formerBlock);
    }
    if (formerBlock) {
      formerBlock.hidden = !former.length;
      const formerGrid = $('formerMemberGrid');
      if (formerGrid) formerGrid.innerHTML = former.map((m,i)=>bandMemberCard(m,i,{former:true})).join('');
    }

    const photos = current.map(m => ({...m,src:publicSiteAssetUrl(m.image_path)})).filter(m => m.src);
    const carousel = $('homeMemberCarousel'), stage = $('memberCarouselStage');
    if (carousel && stage) {
      carousel.classList.toggle('hidden',!photos.length);
      memberCarouselIndex = photos.length ? Math.min(memberCarouselIndex,photos.length-1) : 0;
      stage.innerHTML = photos.map((m,i)=>`<figure class="member-carousel-slide${i===memberCarouselIndex?' active':''}"><img src="${esc(m.src)}" alt="${esc(m.name)}"><figcaption class="member-carousel-caption">${esc(String(m.name||'').toUpperCase())} · ${esc(m.role||'')}</figcaption></figure>`).join('');
    }

    const manage = $('manageMemberPhotos');
    if (manage) manage.textContent = 'GESTISCI MEMBRI';
    renderHomeBandFallback();
  }

  function moveMemberCarousel(delta) {
    const slides = $$('.member-carousel-slide',$('memberCarouselStage'));
    if (!slides.length) return;
    memberCarouselIndex = (memberCarouselIndex + delta + slides.length) % slides.length;
    slides.forEach((slide,i)=>slide.classList.toggle('active',i===memberCarouselIndex));
  }

  async function saveBandMemberRow(row,member) {
    const name = row.querySelector('[data-band-name]').value.trim();
    if (!name) throw new Error('Inserisci il nome.');
    const role = row.querySelector('[data-band-role]').value.trim();
    const description = row.querySelector('[data-band-description]').value.trim();
    const fromRaw = row.querySelector('[data-band-from]').value;
    const toRaw = row.querySelector('[data-band-to]').value;
    const isCurrent = row.querySelector('[data-band-current]').checked;
    const published = row.querySelector('[data-band-published]').checked;
    const active_from_year = fromRaw ? Number(fromRaw) : null;
    const active_to_year = isCurrent ? null : (toRaw ? Number(toRaw) : null);
    const {error} = await sb.from('public_band_members').update({
      name,role,description,active_from_year,active_to_year,is_current:isCurrent,published
    }).eq('id',member.id);
    if (error) throw error;
  }

  async function moveBandMember(member,direction) {
    const ordered=[...memberMedia].sort((a,b)=>Number(a.sort_order||0)-Number(b.sort_order||0));
    const index=ordered.findIndex(x=>String(x.id)===String(member.id));
    const swapIndex=index+direction;
    if(index<0||swapIndex<0||swapIndex>=ordered.length)return;
    const other=ordered[swapIndex];
    const a=Number(member.sort_order||0),b=Number(other.sort_order||0);
    const {error:e1}=await sb.from('public_band_members').update({sort_order:b}).eq('id',member.id);
    if(e1)throw e1;
    const {error:e2}=await sb.from('public_band_members').update({sort_order:a}).eq('id',other.id);
    if(e2)throw e2;
    await loadMemberMedia();
    openBandMemberEditor(true);
  }

  async function uploadBandMemberImage(member,file,status) {
    if(!file)return;
    if(!String(file.type||'').startsWith('image/'))throw new Error('Scegli un file immagine.');
    const ext=(file.name.split('.').pop()||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'')||'jpg';
    const path=`band-members/${member.id}/${Date.now()}.${ext}`;
    status.textContent='Caricamento…';
    const {error:uploadError}=await sb.storage.from('public-site').upload(path,file,{contentType:file.type||undefined,upsert:false});
    if(uploadError)throw uploadError;
    const old=member.image_path||null;
    const {error:saveError}=await sb.from('public_band_members').update({image_path:path}).eq('id',member.id);
    if(saveError){await sb.storage.from('public-site').remove([path]);throw saveError}
    if(old)await sb.storage.from('public-site').remove([old]);
    status.textContent='Foto pubblicata ✓';
    await loadMemberMedia();
  }

  function bandEditorRow(member) {
    const src=publicSiteAssetUrl(member.image_path);
    return `<article class="band-editor-row" data-band-member="${esc(member.id)}">
      <div class="band-editor-photo">${src?`<img src="${esc(src)}" alt="${esc(member.name)}">`:`<span>${esc(String(member.name||'?').charAt(0))}</span>`}<label class="band-editor-photo-button">FOTO<input type="file" accept="image/*" data-band-photo></label><small data-band-photo-status></small></div>
      <div class="band-editor-fields">
        <label>NOME<input data-band-name maxlength="120" value="${esc(member.name||'')}"></label>
        <label>RUOLO<input data-band-role maxlength="160" value="${esc(member.role||'')}"></label>
        <label class="full">DESCRIZIONE<textarea data-band-description maxlength="2000" rows="3">${esc(member.description||'')}</textarea></label>
        <label>DAL<input data-band-from type="number" min="1950" max="2100" value="${esc(member.active_from_year||'')}"></label>
        <label>AL<input data-band-to type="number" min="1950" max="2100" value="${esc(member.active_to_year||'')}" ${member.is_current?'disabled':''}></label>
        <label class="band-editor-check"><input data-band-current type="checkbox" ${member.is_current?'checked':''}> MEMBRO ATTUALE</label>
        <label class="band-editor-check"><input data-band-published type="checkbox" ${member.published!==false?'checked':''}> PUBBLICATO</label>
      </div>
      <div class="band-editor-actions">
        <button type="button" data-band-up title="Sposta su">↑</button>
        <button type="button" data-band-down title="Sposta giù">↓</button>
        <button type="button" class="primary" data-band-save>SALVA</button>
        <button type="button" class="danger" data-band-delete>ELIMINA</button>
      </div>
    </article>`;
  }

  async function openBandMemberEditor(reopen=false) {
    if (!currentMember || !MEMBER_ADMINS.has(String(currentMember.username||'').toLowerCase())) return;
    if(reopen) document.getElementById('bandMemberEditorModal')?.remove();
    let overlay=document.getElementById('bandMemberEditorModal');
    if(overlay)return;
    overlay=document.createElement('div');
    overlay.id='bandMemberEditorModal';
    overlay.className='modal';
    const ordered=[...memberMedia].sort((a,b)=>Number(a.sort_order||0)-Number(b.sort_order||0));
    overlay.innerHTML=`<div class="modal-backdrop"></div><section class="modal-card band-member-editor-card"><div class="modal-head"><div><span class="section-kicker">MODIFICA SITO · BAND</span><h2>Membri della band</h2></div><button class="modal-close" type="button" aria-label="Chiudi">×</button></div><div class="modal-body"><div class="band-editor-note">Riordina con ↑ ↓. Per gli ex membri disattiva “Membro attuale” e indica il periodo di attività.</div><div class="band-editor-list">${ordered.map(bandEditorRow).join('')}</div><button class="btn btn-primary" id="addBandMember" type="button">+ AGGIUNGI MEMBRO / EX MEMBRO</button></div></section>`;
    document.body.appendChild(overlay);
    document.documentElement.style.overflow='hidden';
    const close=()=>{overlay.remove();if(!$$('.modal:not([hidden])').length)document.documentElement.style.removeProperty('overflow')};
    overlay.querySelector('.modal-close').onclick=close;
    overlay.querySelector('.modal-backdrop').onclick=close;

    overlay.querySelectorAll('[data-band-member]').forEach(row=>{
      const member=memberMedia.find(x=>String(x.id)===row.dataset.bandMember);
      if(!member)return;
      const current=row.querySelector('[data-band-current]'),to=row.querySelector('[data-band-to]');
      current.onchange=()=>{to.disabled=current.checked;if(current.checked)to.value=''};
      row.querySelector('[data-band-save]').onclick=async()=>{
        const btn=row.querySelector('[data-band-save]');btn.disabled=true;
        try{await saveBandMemberRow(row,member);await loadMemberMedia();btn.textContent='SALVATO ✓';setTimeout(()=>btn.textContent='SALVA',1000)}
        catch(err){alert(err.message||String(err))}
        finally{btn.disabled=false}
      };
      row.querySelector('[data-band-up]').onclick=()=>moveBandMember(member,-1).catch(err=>alert(err.message));
      row.querySelector('[data-band-down]').onclick=()=>moveBandMember(member,1).catch(err=>alert(err.message));
      row.querySelector('[data-band-delete]').onclick=async()=>{
        if(!confirm(`Eliminare “${member.name}” dalla storia della band?`))return;
        const {error}=await sb.from('public_band_members').delete().eq('id',member.id);
        if(error)return alert(error.message);
        if(member.image_path)await sb.storage.from('public-site').remove([member.image_path]);
        await loadMemberMedia();openBandMemberEditor(true);
      };
      row.querySelector('[data-band-photo]').onchange=async e=>{
        const status=row.querySelector('[data-band-photo-status]');
        try{await uploadBandMemberImage(member,e.target.files?.[0],status);openBandMemberEditor(true)}
        catch(err){status.textContent=err.message||String(err)}
      };
    });

    overlay.querySelector('#addBandMember').onclick=async()=>{
      const max=Math.max(0,...memberMedia.map(x=>Number(x.sort_order||0)));
      const {error}=await sb.from('public_band_members').insert({
        name:'Nuovo membro',role:'',description:'',sort_order:max+10,is_current:false,published:false
      });
      if(error)return alert(error.message);
      await loadMemberMedia();openBandMemberEditor(true);
    };
  }

  function openMemberPhotoManager() {
    openBandMemberEditor();
  }

  window.JMBandEditor={open:openBandMemberEditor,refresh:loadMemberMedia};

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

  function rawRoute() {
    return location.hash.replace(/^#\/?/, '').split('/')[0] || 'home';
  }

  async function checkinApi(action, payload = {}) {
    const body = {
      action,
      device_token:getFanDeviceToken(),
      fingerprint:fanFingerprint(),
      ...payload
    };
    const res = await fetch(CHECKIN_API, {
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'apikey':SUPABASE_KEY,
        'Authorization':`Bearer ${SUPABASE_KEY}`
      },
      body:JSON.stringify(body)
    });
    let data = {};
    try { data = await res.json(); } catch {}
    if (!res.ok) throw new Error(data.error || `checkin-api HTTP ${res.status}`);
    return data;
  }

  async function claimPendingQrCheckins({notify=true}={}) {
    try {
      const data = await checkinApi('claim');
      qrClaimedOnLogin = Array.isArray(data.concerts) ? data.concerts : [];
      if (notify && Number(data.claimed_count || 0) > 0) {
        const first = qrClaimedOnLogin[0];
        toast(
          Number(data.claimed_count) === 1
            ? `Presenza certificata · ${first?.name || 'live'}`
            : `${data.claimed_count} presenze QR recuperate`,
          'ok'
        );
      }
      return data;
    } catch (err) {
      console.warn('Recupero check-in QR non disponibile',err);
      return {ok:false,claimed_count:0,concerts:[]};
    }
  }

  async function handleQrCheckin() {
    if (rawRoute() !== 'checkin') return;

    qrCheckinPending = true;
    qrClaimedOnLogin = [];

    try {
      const data = await checkinApi('scan');

      if (data.status === 'inactive') {
        qrCheckinConcert = null;
        completeQrCheckin(null,{certified:false});
        return;
      }

      if (data.status === 'certified') {
        qrCheckinConcert = data.concert || null;
        try {
          await loadRankings(true);
          renderRankings();
          renderHome();
        } catch {}
        completeQrCheckin(data.concert || null,{certified:true});
        return;
      }

      if (data.status === 'pending' && data.requires_identity) {
        qrCheckinConcert = data.concert || null;
        renderUserModal();
        showLoginMode('fan');
        const msg = $('fanLoginMessage');
        if (msg) {
          msg.textContent = `CHECK-IN ${String(data.concert?.name || 'LIVE').toUpperCase()} · inserisci il tuo nome per certificare la presenza.`;
        }
        openModal('userModal');
        setTimeout(()=>$('fanNameInput')?.focus(),50);
        return;
      }

      qrCheckinConcert = null;
      completeQrCheckin(null,{certified:false});
    } catch (err) {
      qrCheckinConcert = null;
      console.warn('Check-in QR non disponibile',err);
      completeQrCheckin(null,{certified:false});
    }
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
    if(route==='news-admin'&&!isPublicAdmin()){
      go('home');
      return;
    }
    if(route==='news-admin')ensureHomeNewsEditor();

    $$('.page').forEach(p => p.classList.toggle('active', p.dataset.page === route));
    $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.route === route));
    renderContextRail(route);

    if (route === 'tour') renderTour();

    if (route === 'repertoire') {
      renderRepertoire();
      if (!publicSongsLoaded) {
        loadPublicContentExtensions().then(()=>{
          renderRepertoire();
          renderPublicMedia();
          renderHome();
        }).catch(err=>console.warn('Repertorio pubblico non disponibile',err));
      }
    }

    if (route === 'rankings') renderRankings();

    if (route === 'band' && !memberMediaLoaded) {
      loadMemberMedia().catch(err=>console.warn('Membri band non disponibili',err));
    }

    if (route === 'more') {
      renderPublicMedia();
      if (!publicMediaLoaded) {
        loadPublicContentExtensions().then(()=>{
          renderPublicMedia();
          renderRepertoire();
          renderHome();
        }).catch(err=>console.warn('Media pubblici non disponibili',err));
      }
    }

    if (route === 'contacts') {
      renderBookingCalendar();
      if (!bookingAvailabilityLoaded) {
        loadBookingAvailability().then(renderBookingCalendar).catch(err=>console.warn('Disponibilità booking non disponibile',err));
      }
    }

    if (route === 'news-admin') loadHomeNewsAdminList().catch(err=>console.warn('Novità admin',err));
    window.scrollTo({top:0, behavior:'instant'});
  }

  function renderContextRail(route) {
    const links = $('contextRailLinks');
    const configs = {
      home:[[window.JMCopy.text('ui.f9d0a39219d7'),'homeNextShow'],[window.JMCopy.text('ui.5b0d2517b8b5'),'homeRankingPreview']],
      tour:[[window.JMCopy.text('ui.0449f09cec41'),'upcomingBlock'],[window.JMCopy.text('ui.801a122f224b'),'archiveBlock']],
      repertoire:[['Tutte le canzoni','repertoireBlock']],
      rankings:[[window.JMCopy.text('ui.11440317430b'),'songsRankingBlock'],[window.JMCopy.text('ui.050b875e0945'),'fansRankingBlock'],['Locandine','postersRankingBlock'],[window.JMCopy.text('ui.854f5adc717d'),'concertsRankingBlock']],
      band:[[window.JMCopy.text('ui.15cbfb980542'),'membersBlock'],[window.JMCopy.text('ui.04923d0f0b62'),'conceptBlock']],
      more:[['Video','videosBlock'],['Foto','photosBlock'],['Locandine','galleryBlock']],
      contacts:[['Canali','contactChannelsBlock'],['Booking','bookingBlock']],
      'news-admin':[['Nuova / modifica','homeNewsForm'],['Elenco novità','homeNewsAdminList']]
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
    syncPublicAdminControls();
    syncHomeFallbackCropButton();
    renderPublicMedia();
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
      resetFanNameDisambiguation();
      return;
    }
    if (currentMember) {
      const admin = MEMBER_ADMINS.has(String(currentMember.username || '').toLowerCase());
      session.innerHTML = `<div class="session-hero"><strong>${esc(currentMember.display_name || currentMember.username)}</strong><span>${esc(admin ? window.JMCopy.text('ui.0a017110ec02') : window.JMCopy.text('ui.12d4910d17a6'))} · ${esc(window.JMCopy.text('ui.sessionShared'))}</span></div><div class="session-actions"><a class="btn btn-primary wide" href="manage.html" data-copy="ui.205eaf85b30c">APRI GESTIONALE</a><button class="btn btn-ghost wide" type="button" data-session-logout="member" data-copy="ui.b3ef7c765220">ESCI</button></div>`;
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
    $$('[data-session-logout]', session).forEach(b => b.onclick = () => logout(b.dataset.sessionLogout));
  }
  async function setFanRecovery() {
    const value = window.prompt(window.JMCopy.text('ui.recoveryPrompt'));
    if (!value?.trim()) return;
    try { await fanApi('set_recovery', {recovery_type:'nickname', recovery_value:value.trim()}); toast(window.JMCopy.text('ui.67bf03eb3407'),'ok'); }
    catch (err) { toast(err.message,'error'); }
  }

  function resetFanNameDisambiguation({keepGroup=false} = {}) {
    fanNameCheckState = {name:'',data:null,promise:null};
    const target = $('fanTargetFanId');
    const matches = $('fanNameMatches');
    const mark = $('fanGroupRequiredMark');
    const group = $('fanGroupInput');
    const options = $('fanGroupOptions');
    if (target) target.value = '';
    if (matches) { matches.hidden = true; matches.innerHTML = ''; }
    if (mark) mark.hidden = true;
    if (group) {
      group.required = false;
      if (!keepGroup) group.value = '';
    }
    if (options) options.innerHTML = '';
  }

  function renderFanNameCheck(data) {
    const matchesBox = $('fanNameMatches');
    const mark = $('fanGroupRequiredMark');
    const group = $('fanGroupInput');
    const options = $('fanGroupOptions');
    const target = $('fanTargetFanId');

    if (options) options.innerHTML = (data?.groups || []).map(g =>
      `<option value="${esc(g.name)}"></option>`
    ).join('');

    const required = !!data?.group_required;
    if (mark) mark.hidden = !required;
    if (group) group.required = required && !(target?.value);

    const matches = data?.matches || [];
    if (!matchesBox) return;
    matchesBox.hidden = !matches.length;
    matchesBox.innerHTML = matches.length ? `
      <div class="fan-name-match-note"><strong>Nome già presente.</strong> Se uno di questi profili sei tu, selezionalo. Altrimenti indica il tuo gruppo per distinguerti.</div>
      <div class="fan-name-match-list">
        ${matches.map(m => `
          <button class="fan-name-match" type="button" data-fan-match="${esc(m.fan_id)}">
            <span><strong>${esc(m.fan_name)}</strong><small>${esc(m.group_name || 'Nessun gruppo assegnato')}</small></span>
            <b>SONO IO</b>
          </button>`).join('')}
      </div>` : '';

    $('[data-fan-match]', matchesBox).forEach(btn => {
      btn.onclick = () => {
        const id = btn.dataset.fanMatch;
        const selected = matches.find(m => String(m.fan_id) === String(id));
        if (target) target.value = id;
        if (group) {
          group.value = selected?.group_name || '';
          group.required = false;
        }
        $('[data-fan-match]', matchesBox).forEach(x => x.classList.toggle('selected', x === btn));
        const msg = $('fanLoginMessage');
        if (msg) msg.textContent = `Profilo selezionato: ${selected?.fan_name || 'fan'}${selected?.group_name ? ' · '+selected.group_name : ''}`;
      };
    });
  }

  async function checkFanName(name, {force=false} = {}) {
    name = String(name || '').trim();
    if (!name) {
      resetFanNameDisambiguation({keepGroup:true});
      return null;
    }
    if (!force && fanNameCheckState.name === name && fanNameCheckState.data) {
      return fanNameCheckState.data;
    }
    if (fanNameCheckState.promise && fanNameCheckState.name === name) {
      return fanNameCheckState.promise;
    }

    const promise = fanApi('fan_name_check',{display_name:name})
      .then(data => {
        fanNameCheckState = {name,data,promise:null};
        renderFanNameCheck(data);
        return data;
      })
      .catch(err => {
        fanNameCheckState = {name:'',data:null,promise:null};
        throw err;
      });
    fanNameCheckState = {name,data:null,promise};
    return promise;
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

  async function loginFan(name, {refreshData = true, groupName = null, targetFanId = null} = {}) {
    let data = await fanApi('enter', {
      display_name:name,
      group_name:groupName || null,
      target_fan_id:targetFanId || null
    });
    data = await resolvePossibleFanMatches(data);
    currentFan = data.fan || data;
    localStorage.setItem('jm_public_fan_name', currentFan.display_name || name);
    await claimPendingQrCheckins({notify:!qrCheckinPending});
    const perms = await fanApi('permissions');
    fanPermissions = perms.permissions || {};
    try { fanOnboardingStatus = await fanApi('onboarding_status'); }
    catch (err) { console.warn('Stato questionario non disponibile',err); fanOnboardingStatus = null; }
    currentMember = null;
    updateUserUI();
    startRealtime();
    if (refreshData) {
      await Promise.allSettled([
        loadConcerts(true).then(()=>{renderHome();renderTour();renderRailNextShow();}),
        loadRankings(true).then(()=>{renderHome();renderRankings();})
      ]);
    }
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
    tourPrivateMode = false;
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
      concerts = data.concerts || [];
      concerts.sort((a,b) => String(b.concert_date).localeCompare(String(a.concert_date)) || String(b.start_time || '').localeCompare(String(a.start_time || '')));
      return concerts;
    } catch (err) {
      console.error(err);
      toast(window.JMCopy.text('ui.concertError',{error:err.message}),'error');
      if (!concerts.length) concerts = [];
      return concerts;
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
      console.error(err);
      if (!rankingData) rankingData = {fans:[],songs:[],concerts:[],posters:[],error:err.message};
      return rankingData;
    }
  }


  async function loadPublicContentExtensions(force = false) {
    const jobs = [];

    if (force || !publicSongsLoaded) {
      jobs.push((async()=>{
        let lastError = null;
        for (let attempt=0; attempt<3; attempt++) {
          try {
            const result = await sb.rpc('get_public_repertoire');
            if (result.error) throw result.error;
            publicSongs = result.data || [];
            publicSongsLoaded = true;
            publicSongsError = null;
            return;
          } catch (err) {
            lastError = err;
            if (attempt < 2) await new Promise(resolve=>setTimeout(resolve,250*(attempt+1)));
          }
        }
        publicSongsError = lastError || new Error('Repertorio pubblico non disponibile');
        console.warn('Repertorio pubblico non disponibile',publicSongsError);
      })());
    }

    if (force || !publicMediaLoaded) {
      jobs.push((async()=>{
        try {
          const result = await sb.from('public_media')
            .select('id,kind,title,caption,source_url,storage_path,sort_order,created_at')
            .eq('published',true)
            .order('sort_order',{ascending:true})
            .order('created_at',{ascending:false});
          if (result.error) throw result.error;
          publicMedia = result.data || [];
          publicMediaLoaded = true;
        } catch (err) {
          console.warn('Media pubblici non disponibili',err);
        }
      })());
    }

    if (jobs.length) await Promise.all(jobs);
    return {songs:publicSongs,media:publicMedia};
  }
  function songArtistLine(song) {
    const parts=[];
    if (song.base_artist) parts.push(`Base: ${song.base_artist}`);
    if (song.lyrics_artist) parts.push(`Testo: ${song.lyrics_artist}`);
    return parts.join(' · ');
  }
  function songTechLine(song) {
    const parts=[];
    if (song.duration_seconds) {
      const m=Math.floor(Number(song.duration_seconds)/60), s=String(Number(song.duration_seconds)%60).padStart(2,'0');
      parts.push(`${m}:${s}`);
    }
    return parts.join(' · ');
  }
  function renderRepertoire() {
    const grid=$('repertoireGrid'); if(!grid)return;
    if (!publicSongsLoaded && publicSongsError && !publicSongs.length) {
      if($('repertoireCount')) $('repertoireCount').textContent='—';
      grid.innerHTML='<div class="empty-state">Catalogo temporaneamente non disponibile. Riprova tra poco.</div>';
      return;
    }
    const q=String($('repertoireSearch')?.value||'').trim().toLowerCase();
    const rows=publicSongs.filter(song=>!q || [song.title,song.base_artist,song.lyrics_artist,song.base_title,song.lyrics_title].some(v=>String(v||'').toLowerCase().includes(q)));
    if($('repertoireCount')) $('repertoireCount').textContent=`${rows.length} BRANI`;
    grid.innerHTML=rows.map(song=>{
      const cover=posterUrl(song.cover_path);
      const spotify=safeHttps(song.spotify_url);
      const player=spotify
        ? `<a class="btn btn-primary repertoire-stream-link" href="${esc(spotify)}" target="_blank" rel="noopener noreferrer">ASCOLTA SU SPOTIFY</a>`
        : song.has_demo
          ? `<button class="btn btn-primary demo-player-button demo-player-placeholder" type="button" disabled>CARICAMENTO DEMO…</button>`
          : `<span class="repertoire-audio-missing">Audio in arrivo</span>`;
      return `<article class="repertoire-card glass-card" data-repertoire-song="${esc(song.id)}">
        <div class="repertoire-cover">${cover?`<img src="${esc(cover)}" alt="Cover di ${esc(song.title)}" loading="lazy">`:'<span>JM</span>'}</div>
        <div class="repertoire-copy"><h3>${esc(song.title)}</h3><span class="song-play-count">▶ ${Math.max(0,Math.trunc(Number(song.weighted_play_count||0)))} RIPRODUZIONI</span><p>${esc(songArtistLine(song)||'John & i Molesti')}</p><span class="repertoire-tech-line">${esc(songTechLine(song))}</span></div>
        <div class="repertoire-player">${player}</div>
      </article>`;
    }).join('') || '<div class="empty-state">Nessun brano trovato.</div>';
    $$('[data-repertoire-song]',grid).forEach(card=>{
      card.addEventListener('click',e=>{
        if(e.target.closest('audio,a,button,input'))return;
        const song=publicSongs.find(s=>String(s.id)===card.dataset.repertoireSong);
        if(!song)return;
        if(window.JMSongs?.openDetail)window.JMSongs.openDetail(song.id);
        else openSongRankingDetail(song,publicSongs.indexOf(song)+1);
      });
    });

    window.dispatchEvent(new CustomEvent('jm:repertoire-rendered'));
  }
  function renderPublicMedia() {
    const videos=publicMedia.filter(x=>x.kind==='video');
    const photos=publicMedia.filter(x=>x.kind==='photo');
    const admin=isPublicAdmin();
    if($('videoCount'))$('videoCount').textContent=videos.length?`${videos.length} VIDEO`:'';
    if($('photoCount'))$('photoCount').textContent=photos.length?`${photos.length} FOTO`:'';
    const videoGrid=$('publicVideoGrid');
    if(videoGrid)videoGrid.innerHTML=videos.map(item=>{
      const info=videoEmbedInfo(item.source_url);
      if(!info)return '';
      const player=info.embed
        ? `<div class="public-video-frame"><iframe src="${esc(info.embed)}" title="${esc(item.title||'Video')}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`
        : `<a class="public-video-fallback" href="${esc(info.href)}" target="_blank" rel="noopener noreferrer">APRI IL VIDEO</a>`;
      const adminTools=admin?`<div class="public-video-admin-tools"><button type="button" data-public-video-edit="${esc(item.id)}">MODIFICA</button><button type="button" data-public-video-delete="${esc(item.id)}">ELIMINA</button></div>`:'';
      return `<article class="public-video-card">${player}<div class="public-media-copy"><strong>${esc(item.title||'Video')}</strong>${item.caption?`<span>${esc(item.caption)}</span>`:''}<small>${esc(info.provider)}</small>${adminTools}</div></article>`;
    }).join('') || '<div class="empty-state">Nessun video pubblicato.</div>';
    const photoGrid=$('publicPhotoGrid');
    if(photoGrid)photoGrid.innerHTML=photos.map((item,i)=>{
      const src=publicMediaAssetUrl(item.storage_path);
      return src?`<button class="public-photo-card" type="button" data-public-photo="${i}"><img src="${esc(src)}" alt="${esc(item.title||'Foto John & i Molesti')}" loading="lazy"><span><strong>${esc(item.title||'John & i Molesti')}</strong>${item.caption?`<small>${esc(item.caption)}</small>`:''}</span></button>`:'';
    }).join('') || '<div class="empty-state">Nessuna foto pubblicata.</div>';
    $$('[data-public-photo]',photoGrid||document).forEach(btn=>btn.onclick=()=>{
      const item=photos[Number(btn.dataset.publicPhoto)],src=publicMediaAssetUrl(item?.storage_path);
      if(src)openPoster(src,item?.title||'John & i Molesti');
    });
    $$('[data-public-video-edit]',videoGrid||document).forEach(btn=>btn.onclick=()=>openPublicVideoEditor(videos.find(v=>String(v.id)===btn.dataset.publicVideoEdit)));
    $$('[data-public-video-delete]',videoGrid||document).forEach(btn=>btn.onclick=()=>deletePublicVideoFromSite(videos.find(v=>String(v.id)===btn.dataset.publicVideoDelete)));
    syncPublicAdminControls();
  }

  function publicConcertPool() {
    return concerts.filter(c => !c.private_show);
  }
  function tourConcertPool() {
    if (!tourPrivateMode) return concerts.filter(c => !c.private_show);
    const now = Date.now();
    return concerts.filter(c => {
      if (!c.private_show || c.status === 'cancelled') return false;
      if (c.status === 'completed') return true;
      const start = concertStartMs(c);
      return Number.isFinite(start) && start <= now;
    });
  }
  function upcomingConcerts(pool = publicConcertPool()) {
    const now = Date.now();
    return pool.filter(c => c.status !== 'completed' && c.status !== 'cancelled' && (!Number.isFinite(concertStartMs(c)) || concertStartMs(c) >= now - 6*60*60*1000)).sort((a,b) => concertStartMs(a)-concertStartMs(b));
  }
  function pastConcerts(pool = publicConcertPool()) {
    return pool.filter(c => c.status === 'completed' || (Number.isFinite(concertStartMs(c)) && concertStartMs(c) < Date.now() - 6*60*60*1000)).sort((a,b) => concertStartMs(b)-concertStartMs(a));
  }
  function nextConcert() { return upcomingConcerts(publicConcertPool())[0] || null; }

  function renderRailNextShow() {
    const box = $('railNextShow');
    const c = nextConcert();
    if (!c) { box.innerHTML = '<span class="rail-kicker" data-copy="ui.bab62916c3bf">NEXT SHOW</span><p data-copy="ui.083de1b415bc">Nessuna data futura pubblicata.</p>'; return; }
    const d = dateParts(c.concert_date);
    box.innerHTML = `<span class="rail-kicker" data-copy="ui.bab62916c3bf">NEXT SHOW</span><div class="rail-next-date">${d.day} ${d.month}</div><div class="rail-next-name">${esc(c.name)}</div><div class="rail-next-place">${esc(prettyPlace(c))}${c.start_time ? ` · ${esc(formatTime(c.start_time))}` : ''}</div><button class="rail-action text-button" type="button" data-open-concert="${esc(c.id)}" data-copy="ui.09add3f1fe3c">DETTAGLI →</button>`;
    box.querySelector('[data-open-concert]')?.addEventListener('click',() => openConcert(c.id));
  }
  function bindHomeDashboardRoutes(){
    $$('.home-dash-card[data-dashboard-route]').forEach(card=>{
      const open=()=>{
        const route=card.dataset.dashboardRoute;
        if(route)go(route);
      };

      card.onclick=e=>{
        if(e.target.closest('button,a,input,select,textarea,audio,iframe'))return;
        open();
      };

      card.onkeydown=e=>{
        if((e.key==='Enter'||e.key===' ')&&!e.target.closest('button,a,input,select,textarea,audio,iframe')){
          e.preventDefault();
          open();
        }
      };
    });
  }

  function renderHomeRepertoirePreview(){
    const box=$('homeRepertoirePreview')?.querySelector('.home-repertoire-preview');
    if(!box)return;

    const rows=[...publicSongs]
      .sort((a,b)=>String(a.title||'').localeCompare(String(b.title||''),'it',{sensitivity:'base'}))
      .slice(0,4);

    box.innerHTML=rows.length
      ? rows.map(song=>{
          const cover=posterUrl(song.cover_path);
          return `<div class="home-song-preview-row">
            ${cover
              ? `<img src="${esc(cover)}" alt="" loading="lazy">`
              : '<span class="home-song-preview-placeholder">JM</span>'}
            <div>
              <strong>${esc(song.title||'Brano')}</strong>
              <span>${esc(songArtistLine(song)||'John & i Molesti')}</span>
            </div>
          </div>`;
        }).join('')
      : '<div class="empty-state">Repertorio in aggiornamento.</div>';
  }

  function renderHomeBandFallback(){
    const box=$('homeBandFallback');
    if(!box)return;

    const carousel=$('homeMemberCarousel');
    const rows=memberMedia
      .filter(m=>m.published!==false&&m.is_current)
      .sort((a,b)=>Number(a.sort_order||0)-Number(b.sort_order||0))
      .slice(0,5);

    box.innerHTML=rows.map(member=>{
      const src=publicSiteAssetUrl(member.image_path);
      return `<span class="home-band-mini">
        ${src
          ? `<img src="${esc(src)}" alt="" loading="lazy">`
          : `<i>${esc(String(member.name||'?').charAt(0))}</i>`}
        <b>${esc(member.name||'')}</b>
      </span>`;
    }).join('');

    box.hidden=!!(carousel&&!carousel.classList.contains('hidden'));
  }

  function bindHomeDashboardRoutes(){
    $$('.home-dash-card[data-dashboard-route]').forEach(card=>{
      const open=()=>{
        const route=card.dataset.dashboardRoute;
        if(route)go(route);
      };
      card.onclick=e=>{
        if(e.target.closest('button,a,input,select,textarea,audio,iframe,[data-home-news-preview]'))return;
        open();
      };
      card.onkeydown=e=>{
        if((e.key==='Enter'||e.key===' ')&&!e.target.closest('button,a,input,select,textarea,audio,iframe')){
          e.preventDefault();
          open();
        }
      };
    });
  }

  function renderHomeNewsPreview(){
    const box=$('homeNewsPreview')?.querySelector('.home-news-preview-list');
    if(!box)return;

    const slides=(siteNews||[]).slice(0,3).map(newsSourceSlide);
    if(!slides.length)slides.push(fallbackNewsSlide());

    box.innerHTML=slides.map((item,index)=>`
      <button class="home-news-mini-row" type="button" data-home-news-preview="${index}">
        <span>${esc(item.kicker||'Novità')}</span>
        <strong>${esc(item.title||'Novità')}</strong>
        <small>${esc(item.meta||'')}</small>
      </button>`).join('');

    $$('[data-home-news-preview]',box).forEach(button=>{
      button.onclick=e=>{
        e.preventDefault();
        e.stopPropagation();
        runHighlightAction(slides[Number(button.dataset.homeNewsPreview)]);
      };
    });
  }

  function renderHome() {
    ensureHomeHeroNewsLayout();
    renderHighlights();

    const nextBox=$('homeNextShow');
    const c=nextConcert();

    if(nextBox){
      if(!c){
        nextBox.style.removeProperty('--dash-bg');
        nextBox.innerHTML=`
          <div class="section-kicker">PROSSIMO LIVE</div>
          <h3>Nuove date in arrivo</h3>
          <p>Apri l'archivio dei live.</p>
          <span class="home-dash-arrow">LIVE →</span>`;
      }else{
        const d=dateParts(c.concert_date);
        const poster=primaryPosterUrl(c.poster_path);
        if(poster)nextBox.style.setProperty('--dash-bg',`url("${String(poster).replace(/["\\]/g,'\\$&')}")`);
        else nextBox.style.removeProperty('--dash-bg');

        nextBox.innerHTML=`
          <div class="home-dash-live-shade"></div>
          <div class="home-dash-live-copy">
            <div class="section-kicker">${d.day} ${d.month} ${d.year}${c.start_time?` · ${esc(formatTime(c.start_time))}`:''}</div>
            <h3>${esc(c.name)}</h3>
            <p>${esc(prettyPlace(c)||'Dettagli in arrivo')}</p>
            <button class="text-button" type="button" data-home-live-detail>DETTAGLI →</button>
          </div>`;
        nextBox.querySelector('[data-home-live-detail]').onclick=e=>{
          e.preventDefault();
          e.stopPropagation();
          openConcert(c.id);
        };
      }
    }

    const preview=$('homeRankingPreview');
    const songs=rankingData?.songs||[];
    if(preview){
      preview.innerHTML=`
        <div class="home-dash-head">
          <div><span class="section-kicker">TOP SONGS</span><h3>Migliori canzoni</h3></div>
        </div>
        <div class="mini-ranking">
          ${songs.slice(0,3).map((r,i)=>`
            <div class="mini-rank-row">
              <span>#${i+1}</span>
              <b>${esc(r.title)}</b>
              <strong>${esc(r.ranking_score??'—')}</strong>
            </div>`).join('')||'<div class="empty-state">Classifica non disponibile.</div>'}
        </div>
        <span class="home-dash-arrow">CLASSIFICHE →</span>`;
    }

    renderHomeNewsPreview();

    const merch=$('homeMerchPreview');
    if(merch){
      merch.innerHTML=`
        <span class="section-kicker">MERCH</span>
        <h3>Merch in saldo</h3>
        <p>Offerte, pezzi rimasti e cattive idee da recuperare al banchetto.</p>
        <span class="home-dash-arrow">VEDI MERCH →</span>`;
    }

    const contacts=$('homeContactsPreview');
    if(contacts){
      contacts.innerHTML=`
        <span class="section-kicker">BOOKING</span>
        <h3>Contatti</h3>
        <p>Contatti, social e calendario per proporci una data.</p>
        <span class="home-dash-arrow">CONTATTACI →</span>`;
    }

    renderMedia();
    bindHomeDashboardRoutes();
    renderRailNextShow();
  }

  function renderMedia() {
    const items = publicConcertPool().flatMap(c => {
      const paths = posterPaths(c.poster_path);
      return paths.map((path,index) => ({src:posterUrl(path),path,label:c.name,id:c.id,index,total:paths.length}));
    }).filter(item => item.src).slice(0,8);
    const wall = $('homeMediaWall');
    if (wall) wall.innerHTML = items.slice(0,3).map((item,i) => `<button class="media-tile media-tile-${i+1}" type="button" data-media-concert="${esc(item.id)}" data-media-poster-path="${esc(item.path)}"><img src="${esc(item.src)}" alt="${esc(window.JMCopy.text('ui.poster',{name:item.label}))}" loading="lazy"></button>`).join('') || '<div class="media-placeholder"><img src="IMG_6259.PNG" alt="Logo John & i Molesti"><span data-copy="ui.8944f844ccd1">ARCHIVIO IN ARRIVO</span></div>';
    const gallery = $('mediaGallery');
    if (!gallery) return;
    window.JMCopy.write($('galleryCount'),'ui.beb6820dd49f',{count:items.length});
    gallery.innerHTML = items.map(item => `<button class="gallery-item" type="button" data-media-concert="${esc(item.id)}" data-media-poster-path="${esc(item.path)}"><img src="${esc(item.src)}" alt="${esc(window.JMCopy.text('ui.poster',{name:item.label}))}" loading="lazy"><span>${esc(item.label)}${item.total>1 ? ` · ${item.index+1}/${item.total}` : ''}</span></button>`).join('') || '<div class="empty-state" data-copy="ui.e910eb8811ae">Le prime foto e locandine arriveranno con i prossimi live.</div>';
    $$('[data-media-concert]').forEach(node => {
      node.onclick = () => { const c = concerts.find(c => c.id === node.dataset.mediaConcert); const src = posterUrl(node.dataset.mediaPosterPath); if(c && src) openPoster(src, c.name); };
    });
  }

  function calendarStamp(c, end = false) {
    const date = String(c.concert_date || '').replace(/-/g,'');
    const time = String(c.start_time || '21:30').slice(0,5).replace(':','');
    if (!end) return `${date}T${time}00`;
    const finish = new Date(`${c.concert_date}T${String(c.start_time || '21:30').slice(0,5)}:00`);
    finish.setMinutes(finish.getMinutes() + Math.max(15,Number(c.duration_minutes||DEFAULT_LIVE_DURATION_MINUTES)));
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
    return `<article class="concert-card${c.private_show?' is-private-show':''}" data-concert-id="${esc(c.id)}"><div class="concert-date-block"><strong>${d.day}</strong><span>${d.month} ${d.year}</span></div><div class="concert-card-main"><h4>${esc(c.name)}</h4><div class="concert-meta-line"><b>${esc(prettyPlace(c) || window.JMCopy.text('ui.4f5bf6522767'))}</b>${c.start_time ? `<br>${esc(formatTime(c.start_time))}` : ''}</div>${c.private_show?'<span class="private-show-chip">PRIVATE SHOW</span>':''}<span class="status-pill status-${cls}">${esc(status)}</span></div></article>`;
  }
  function pastRowHtml(c) {
    const [status, cls] = statusInfo(c);
    return `<article class="concert-row${c.private_show?' is-private-show':''}" data-concert-id="${esc(c.id)}"><div class="concert-row-date">${formatDate(c.concert_date)}</div><div><h4>${esc(c.name)}</h4><p>${esc(prettyPlace(c))}</p>${c.private_show?'<span class="private-show-chip">PRIVATE SHOW</span>':''}</div><span class="status-pill status-${cls}">${esc(status)}</span></article>`;
  }
  function bindConcertClicks(root) { $$('[data-concert-id]', root).forEach(n => n.onclick = () => openConcert(n.dataset.concertId)); }
  function renderTour() {
    const pool = tourConcertPool();
    const up = upcomingConcerts(pool), past = pastConcerts(pool);
    window.JMCopy.write($('upcomingCount'),'ui.36ac180307ba',{count:up.length});
    window.JMCopy.write($('pastCount'),'ui.532d1db69c6e',{count:past.length});
    $('upcomingConcerts').innerHTML = up.map(concertCardHtml).join('') || `<div class="empty-state">${tourPrivateMode?'Nessun private show futuro.':'Nessuna data futura pubblicata.'}</div>`;
    $('pastConcerts').innerHTML = past.map(pastRowHtml).join('') || `<div class="empty-state">${tourPrivateMode?'Nessun private show in archivio.':'Archivio non disponibile.'}</div>`;
    bindConcertClicks($('upcomingConcerts')); bindConcertClicks($('pastConcerts'));

    const archive = $('archiveBlock');
    let switcher = $('privateShowSwitch');
    if (!switcher && archive) {
      switcher = document.createElement('div');
      switcher.id = 'privateShowSwitch';
      switcher.className = 'private-show-switch';
      archive.appendChild(switcher);
    }
    if (switcher) {
      const now = Date.now();
      const privateCount = concerts.filter(c => c.private_show && c.status !== 'cancelled' && (c.status === 'completed' || (Number.isFinite(concertStartMs(c)) && concertStartMs(c) <= now))).length;
      const role = currentFan ? 'fan' : 'guest';
      const allowed = !!currentMember || can(role,'private_shows_view');
      if (!allowed || (!tourPrivateMode && !privateCount)) {
        switcher.hidden = true;
      } else {
        switcher.hidden = false;
        switcher.innerHTML = tourPrivateMode
          ? `<div><strong>PRIVATE SHOW</strong><span>Stai vedendo le date riservate / a inviti.</span></div><button type="button" class="text-button" data-private-show-switch>TORNA AI LIVE PUBBLICI →</button>`
          : `<div><strong>SEI STATO A QUALCHE PRIVATE SHOW?</strong><span>Le serate private non compaiono nell’archivio pubblico normale.</span></div><button type="button" class="text-button" data-private-show-switch>CLICCA QUI →</button>`;
        switcher.querySelector('[data-private-show-switch]').onclick = () => {
          tourPrivateMode = !tourPrivateMode;
          renderTour();
          $('upcomingBlock')?.scrollIntoView({behavior:'smooth',block:'start'});
        };
      }
    }
  }

  function rankingSongRow(r, i) {
    const artists = [r.base_artist, r.lyrics_artist].filter(Boolean).join(' / ');
    const cover = posterUrl(r.cover_path);
    return `<div class="ranking-row ranking-row-clickable${cover?' has-cover':''}" data-ranking-song-index="${i}" data-song-id="${esc(r.song_id||r.id||'')}" title="${esc(r.title || '')}">${cover?`<div class="ranking-row-bg" style="background-image:url('${esc(cover)}')"></div>`:''}<div class="ranking-pos">${i+1}</div>${cover?`<img class="ranking-cover" src="${esc(cover)}" alt="Cover di ${esc(r.title)}" loading="lazy">`:''}<div class="ranking-main"><div class="ranking-title">${esc(r.title)}</div><div class="ranking-meta">${esc(artists || 'Dettagli brano')}</div></div><div class="ranking-score">${esc(r.ranking_score ?? '—')}<small data-copy="ui.ec7bd9952fa3">SCORE</small></div></div>`;
  }
  function rankingFanRow(r, i) {
    const self = currentFan?.id && currentFan.id === r.fan_id;
    const primaryLabel = r.primary_label ? `<span class="fan-primary-label">${esc(r.primary_label)}</span>` : '';
    return `<div class="ranking-row ranking-row-clickable${self ? ' self' : ''}" data-ranking-fan-index="${i}" title="${esc(String(r.fan_name || '').toUpperCase())}"><div class="ranking-pos">${esc(r.ranking_position ?? i+1)}</div><div class="ranking-main"><div class="ranking-title fan-ranking-title"><span>${esc(String(r.fan_name || '').toUpperCase())}${self ? ' · '+esc(window.JMCopy.text('ui.you')) : ''}</span>${primaryLabel}</div><div class="ranking-meta">${esc(window.JMCopy.text('ui.attendances',{count:Number(r.attendance_count || 0)}))}</div></div><div class="ranking-score">${esc(r.points ?? 0)}<small data-copy="ui.7c4c910b08dc">PT</small></div></div>`;
  }
  function rankingConcertRow(r, i) {
    const name = r.concert_name || r.name || window.JMCopy.text('ui.fallbackLive',{date:formatDate(r.concert_date)});
    const score = r.score ?? r.rating ?? r.avg_score ?? r.average_score ?? '—';
    return `<div class="ranking-row ranking-row-clickable" data-ranking-concert="${esc(r.concert_id || r.id || '')}" title="${esc(name)}"><div class="ranking-pos">${i+1}</div><div class="ranking-main"><div class="ranking-title">${esc(name)}</div><div class="ranking-meta">${esc(formatDate(r.concert_date))}${r.attendance_count != null ? ` · ${esc(window.JMCopy.text('ui.attendances',{count:Number(r.attendance_count)}))}` : ''}</div></div><div class="ranking-score">${esc(score)}<small data-copy="ui.6990f01ad9d2">LIVE</small></div></div>`;
  }
  function rankingPosterRow(r, i) {
    const src = posterUrl(r.storage_path || r.poster_path);
    const raw = Number(r.ranking_score);
    const score = Number.isFinite(raw) ? (raw/10).toFixed(1) : '—';
    return `<div class="ranking-row ranking-row-clickable${src?' has-cover':''}" data-ranking-poster-index="${i}" title="${esc(r.concert_name||'Locandina')}"><div class="ranking-pos">${i+1}</div>${src?`<img class="ranking-poster-thumb" src="${esc(src)}" alt="Locandina ${esc(r.concert_name||'')}" loading="lazy">`:''}<div class="ranking-main"><div class="ranking-title">${esc(r.concert_name||'Concerto')}</div><div class="ranking-meta">${esc(r.caption||formatDate(r.concert_date))}</div></div><div class="ranking-score">${esc(score)}<small>POSTER</small></div></div>`;
  }
  function ensureRankingDetailModal() {
    let modal = $('rankingDetailModal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'rankingDetailModal';
    modal.className = 'modal';
    modal.hidden = true;
    modal.innerHTML = `<div class="modal-backdrop"></div><section class="modal-card ranking-detail-modal-card" role="dialog" aria-modal="true" aria-labelledby="rankingDetailTitle"><header class="modal-head"><div><span class="section-kicker" id="rankingDetailKicker">DETTAGLIO</span><h2 id="rankingDetailTitle">Dettaglio</h2></div><button class="modal-close" type="button" aria-label="Chiudi">×</button></header><div class="modal-body" id="rankingDetailBody"></div></section>`;
    document.body.appendChild(modal);
    modal.querySelector('.modal-backdrop').onclick = () => closeModal('rankingDetailModal');
    modal.querySelector('.modal-close').onclick = () => closeModal('rankingDetailModal');
    return modal;
  }
  function detailRow(label, value) {
    if (value === undefined || value === null || value === '') return '';
    return `<div class="ranking-detail-row"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`;
  }
  function openRankingDetail({kind='DETTAGLIO',title='Dettaglio',image='',imageAlt='',score='',scoreLabel='',rows=[],actions=[]}) {
    const modal = ensureRankingDetailModal();
    $('rankingDetailKicker').textContent = kind;
    $('rankingDetailTitle').textContent = title;
    const imageHtml = image ? `<button class="ranking-detail-media" type="button" aria-label="Ingrandisci immagine"><img src="${esc(image)}" alt="${esc(imageAlt || title)}"></button>` : '';
    const scoreHtml = score !== '' && score !== null && score !== undefined ? `<div class="ranking-detail-score"><strong>${esc(score)}</strong><span>${esc(scoreLabel)}</span></div>` : '';
    $('rankingDetailBody').innerHTML = `<div class="ranking-detail-top${image?' has-media':''}">${imageHtml}<div class="ranking-detail-summary">${scoreHtml}<div class="ranking-detail-data">${rows.map(([label,value])=>detailRow(label,value)).join('')}</div></div></div>${actions.length?`<div class="ranking-detail-actions">${actions.map((a,i)=>`<button class="btn ${a.primary?'btn-primary':'btn-ghost'}" type="button" data-ranking-detail-action="${i}">${esc(a.label)}</button>`).join('')}</div>`:''}`;
    $('rankingDetailBody').querySelector('.ranking-detail-media')?.addEventListener('click',()=>openPoster(image,title));
    $$('[data-ranking-detail-action]',$('rankingDetailBody')).forEach(button=>{
      const action=actions[Number(button.dataset.rankingDetailAction)];
      if(action?.run)button.onclick=action.run;
    });
    openModal('rankingDetailModal');
  }
  function openSongRankingDetail(r, position) {
    if (!r) return;
    const detailId=String(r.song_id||r.id||'');
    if(detailId&&window.JMSongs?.openDetail){
      window.JMSongs.openDetail(detailId);
      return;
    }
    const cover = posterUrl(r.cover_path);
    const rankingMatch = (rankingData?.songs||[]).find(item =>
      (String(item.song_id||item.id||'') && String(item.song_id||item.id||'')===String(r.song_id||r.id||'')) ||
      String(item.title||'').toLowerCase()===String(r.title||'').toLowerCase()
    );
    const score = r.ranking_score ?? r.score ?? rankingMatch?.ranking_score ?? rankingMatch?.score ?? '—';
    const rankPosition = rankingMatch?.ranking_position ?? ((rankingData?.songs||[]).indexOf(rankingMatch)+1 || position);
    const plays = Number(r.weighted_play_count ?? rankingMatch?.weighted_play_count ?? 0);
    const actions = [];
    if (currentFan) actions.push({label:'VOTA QUESTO BRANO',primary:true,run:()=>{
      closeModal('rankingDetailModal');
      openFanCatalog().then(()=>{
        const search=$('fanCatalogSearch');
        if(search){search.value=r.title||'';renderFanCatalog();}
      });
    }});
    openRankingDetail({
      kind:'BRANO',
      title:r.title||'Brano',
      image:cover,
      imageAlt:`Cover di ${r.title||'brano'}`,
      score,
      scoreLabel:'SCORE',
      rows:[
        ['Posizione',rankPosition ? `#${rankPosition}` : null],
        ['Base',r.base_artist||'—'],
        ['Testo',r.lyrics_artist||'—'],
        ['Prima esecuzione live',r.first_live_date ? formatDate(r.first_live_date) : '—'],
        ['Riproduzioni',Number.isFinite(plays) ? Math.max(0,Math.trunc(plays)) : 0]
      ],
      actions
    });
  }
  function openFanRankingDetail(r, position) {
    if (!r) return;
    const isMe = currentFan?.id && currentFan.id === r.fan_id;
    const actions = isMe ? [{label:'APRI IL MIO PROFILO',primary:true,run:()=>{closeModal('rankingDetailModal');renderUserModal();openModal('userModal');}}] : [];
    openRankingDetail({kind:'FAN',title:String(r.fan_name||'Fan').toUpperCase(),score:r.points??0,scoreLabel:'PUNTI',rows:[['Posizione',`#${r.ranking_position??position}`],['Gruppo',r.group_label||null],['Presenze',Number(r.attendance_count||0)],['Fan dal',r.fan_since?formatDate(r.fan_since):null]],actions});
  }
  function openPosterRankingDetail(r, position) {
    if (!r) return;
    const src = posterUrl(r.storage_path || r.poster_path);
    const raw = Number(r.ranking_score);
    const score = Number.isFinite(raw) ? (raw/10).toFixed(1) : '—';
    const concertId = r.concert_id || r.event_id || '';
    const actions = [];
    if (concertId) actions.push({label:'APRI IL LIVE',primary:true,run:()=>{closeModal('rankingDetailModal');openConcert(concertId);}});
    openRankingDetail({kind:'LOCANDINA',title:r.concert_name||'Locandina',image:src,imageAlt:`Locandina ${r.concert_name||''}`,score,scoreLabel:'POSTER',rows:[['Posizione',`#${position}`],['Data',formatDate(r.concert_date)],['Titolo',r.caption]],actions});
  }
  function bindRankingRow(row, handler) {
    if (!row || !handler) return;
    row.setAttribute('role','button');
    row.tabIndex = 0;
    row.onclick = handler;
    row.onkeydown = e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handler(); }
    };
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
    const visibleSongs=(data.songs||[]).slice(0,limit('songs'));
    const visibleFans=(data.fans||[]).slice(0,limit('fans'));
    const visibleConcerts=(data.concerts||[]).slice(0,limit('concerts'));
    const visiblePosters=(data.posters||[]).slice(0,limit('posters'));
    $('songsRanking').innerHTML = visibleSongs.map(rankingSongRow).join('') || '<div class="empty-state" data-copy="ui.05f718376042">Classifica brani non disponibile.</div>';
    $('fansRanking').innerHTML = visibleFans.map(rankingFanRow).join('') || '<div class="empty-state" data-copy="ui.a436fdc3dfc1">Classifica fan non disponibile.</div>';
    $('concertsRanking').innerHTML = visibleConcerts.map(rankingConcertRow).join('') || '<div class="empty-state" data-copy="ui.6f59b6c9181a">Classifica concerti non disponibile.</div>';
    $('postersRanking').innerHTML = visiblePosters.map(rankingPosterRow).join('') || '<div class="empty-state">Classifica locandine non disponibile.</div>';
    $$('[data-ranking-song-index]',$('songsRanking')).forEach(row=>{const i=Number(row.dataset.rankingSongIndex);bindRankingRow(row,()=>openSongRankingDetail(visibleSongs[i],i+1));});
    $$('[data-ranking-fan-index]',$('fansRanking')).forEach(row=>{const i=Number(row.dataset.rankingFanIndex);bindRankingRow(row,()=>openFanRankingDetail(visibleFans[i],i+1));});
    $$('[data-ranking-concert]', $('concertsRanking')).forEach(row => { if (row.dataset.rankingConcert) bindRankingRow(row,() => openConcert(row.dataset.rankingConcert)); });
    $$('[data-ranking-poster-index]',$('postersRanking')).forEach(row=>{const i=Number(row.dataset.rankingPosterIndex);bindRankingRow(row,()=>openPosterRankingDetail(visiblePosters[i],i+1));});
    $$('[data-expand-ranking]').forEach(btn => {
      const key = btn.dataset.expandRanking;
      const expanded = expandedRankings.has(key);
      window.JMCopy.write(btn,expanded?'ui.513edd5fd93e':'ui.c4a5176fc495');
      btn.closest('.ranking-panel')?.classList.toggle('expanded', expanded);
    });
  }

  function contactRender() {
    const box=$('contactActions');
    if(!box)return;
    box.innerHTML='<span class="muted-inline">Vai alla sezione Contatti.</span>';
  }

  function safeHttps(value) {
    try { const u=new URL(value); return u.protocol==='https:'&&!u.username&&!u.password ? u.href : ''; } catch { return ''; }
  }

  async function loadPublicUpdates() {
    const now=new Date().toISOString();

    const [newsResult,settingsResult]=await Promise.all([
      sb.from('site_news')
        .select('id,kind,title,body,link_url,published,published_at,expires_at,source_type,source_id,image_path,image_position_x,image_position_y,image_zoom,action_label,sort_order,updated_at')
        .eq('published',true)
        .lte('published_at',now)
        .or('expires_at.is.null,expires_at.gt.'+now)
        .order('sort_order',{ascending:true})
        .order('published_at',{ascending:false})
        .limit(20),
      sb.from('site_home_settings')
        .select('fallback_image_position_x,fallback_image_position_y,fallback_image_zoom')
        .eq('id','home')
        .maybeSingle()
    ]);

    if(newsResult.error)console.warn('Novità home non disponibili',newsResult.error);
    else siteNews=newsResult.data||[];

    if(settingsResult.error)console.warn('Impostazioni Home non disponibili',settingsResult.error);
    else if(settingsResult.data)homeSettings={...homeSettings,...settingsResult.data};

    syncHomeFallbackAdmin();
    renderHighlights();
  }

  function newsSourceSlide(row) {
    const source=String(row?.source_type||'custom');
    let image=row?.image_path?publicSiteAssetUrl(row.image_path):'';
    let title=String(row?.title||'').trim();
    let body=String(row?.body||'').trim();
    let meta=formatDate(row?.published_at);
    let kicker={song:'Nuova canzone',event:'Live',news:'Novità'}[row?.kind]||'Novità';
    let action=null;

    if(source==='concert'){
      const c=concerts.find(x=>String(x.id)===String(row.source_id));
      if(c){
        if(!title)title=c.name||'Live';
        if(!body)body=prettyPlace(c);
        meta=formatDate(c.concert_date)+(c.start_time?' · '+formatTime(c.start_time):'');
        kicker='Live';
        if(!image)image=primaryPosterUrl(c.poster_path)||'';
        action={type:'concert',id:c.id,label:row.action_label||'DETTAGLI DEL LIVE'};
      }
    }else if(source==='song'){
      const song=publicSongs.find(x=>String(x.id)===String(row.source_id));
      if(song){
        if(!title)title=song.title||'Brano';
        if(!body)body=songArtistLine(song)||'John & i Molesti';
        kicker='Nuova canzone';
        if(!image)image=posterUrl(song.cover_path)||'';
        action={type:'song',id:song.id,label:row.action_label||'SCOPRI IL BRANO'};
      }
    }else if(source==='media'){
      const media=publicMedia.find(x=>String(x.id)===String(row.source_id));
      if(media){
        if(!title)title=media.title||'Dal palco';
        if(!body)body=media.caption||'';
        kicker=media.kind==='photo'?'Foto':'Media';
        if(!image&&media.kind==='photo')image=publicMediaAssetUrl(media.storage_path)||'';
        action={type:'media',id:media.id,label:row.action_label||'GUARDA'};
      }
    }

    const href=safeHttps(row?.link_url||'');
    if(!action&&href)action={type:'link',href,label:row.action_label||'SCOPRI DI PIÙ'};
    return {
      id:row.id,title:title||'Novità',body,meta,kicker,image,action,
      image_position_x:Number(row?.image_position_x??50),
      image_position_y:Number(row?.image_position_y??50),
      image_zoom:Number(row?.image_zoom??100)
    };
  }

  function fallbackNewsSlide() {
    const c=nextConcert();
    if(c)return {
      id:'fallback-live-'+c.id,
      title:c.name,
      body:prettyPlace(c),
      meta:formatDate(c.concert_date)+(c.start_time?' · '+formatTime(c.start_time):''),
      kicker:'Prossimo live',
      image:primaryPosterUrl(c.poster_path)||'',
      image_position_x:Number(homeSettings.fallback_image_position_x??50),
      image_position_y:Number(homeSettings.fallback_image_position_y??50),
      image_zoom:Number(homeSettings.fallback_image_zoom??100),
      action:{type:'concert',id:c.id,label:'DETTAGLI DEL LIVE'}
    };
    return {
      id:'fallback-empty',title:'Le prossime novità arrivano qui',
      body:'Nel frattempo puoi esplorare repertorio, live e media della band.',
      meta:'',kicker:'John & i Molesti',image:'',
      image_position_x:50,image_position_y:50,image_zoom:100,
      action:{type:'route',route:'repertoire',label:'SCOPRI I BRANI'}
    };
  }

  function runHighlightAction(slide) {
    const action=slide?.action;if(!action)return;
    if(action.type==='concert'){openConcert(action.id);return}
    if(action.type==='song'){
      const song=publicSongs.find(x=>String(x.id)===String(action.id));
      go('repertoire');
      setTimeout(()=>{
        if(song){
          const search=$('repertoireSearch');
          if(search){search.value=song.title||'';renderRepertoire()}
          openSongRankingDetail(song,Math.max(1,publicSongs.findIndex(x=>String(x.id)===String(song.id))+1));
        }
      },70);
      return;
    }
    if(action.type==='media'){
      go('more');
      setTimeout(()=>$('photosBlock')?.scrollIntoView({behavior:'smooth',block:'start'}),80);
      return;
    }
    if(action.type==='route'){go(action.route||'home');return}
    if(action.type==='link'&&action.href)window.open(action.href,'_blank','noopener,noreferrer');
  }

  function stopHighlightAuto(){
    if(highlightTimer){clearInterval(highlightTimer);highlightTimer=null}
  }
  function startHighlightAuto(slides,track){
    stopHighlightAuto();
    if(slides.length<=1||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    highlightTimer=setInterval(()=>{
      if(document.hidden||currentRoute()!=='home')return;
      const width=Math.max(1,track.clientWidth);
      const current=Math.max(0,Math.min(slides.length-1,Math.round(track.scrollLeft/width)));
      const next=(current+1)%slides.length;
      track.scrollTo({left:next*width,behavior:'smooth'});
    },8000);
  }

  function syncHomeFallbackCropButton(){
    const hero=document.querySelector('#homePage .home-hero-news');
    if(!hero)return;

    let button=$('homeFallbackCropButton');
    const show=isPublicAdmin() && !(siteNews||[]).length && !!nextConcert();

    if(!show){
      button?.remove();
      return;
    }

    if(!button){
      button=document.createElement('button');
      button.id='homeFallbackCropButton';
      button.className='home-fallback-crop-button';
      button.type='button';
      button.innerHTML='✎ RITAGLIO';
      button.onclick=e=>{
        e.preventDefault();
        e.stopPropagation();
        openHomeFallbackCropModal();
      };
      hero.appendChild(button);
    }
  }

  function openHomeFallbackCropModal(){
    if(!isPublicAdmin())return;
    const concert=nextConcert();
    if(!concert)return;

    document.getElementById('homeFallbackCropModal')?.remove();

    let state={
      x:Number(homeSettings.fallback_image_position_x??50),
      y:Number(homeSettings.fallback_image_position_y??50),
      zoom:Number(homeSettings.fallback_image_zoom??100)
    };

    const src=primaryPosterUrl(concert.poster_path)||'';
    const modal=document.createElement('div');
    modal.id='homeFallbackCropModal';
    modal.className='modal';
    modal.innerHTML=`
      <div class="modal-backdrop"></div>
      <section class="modal-card home-inline-crop-card" role="dialog" aria-modal="true" aria-labelledby="homeInlineCropTitle">
        <header class="modal-head">
          <div><span class="section-kicker">HOME · PROSSIMO LIVE</span><h2 id="homeInlineCropTitle">Ritaglio locandina</h2></div>
          <button class="modal-close" type="button" aria-label="Chiudi">×</button>
        </header>
        <div class="modal-body">
          <p class="home-inline-crop-help">Trascina direttamente l'immagine per scegliere la parte visibile. Usa lo zoom solo se serve.</p>
          <div class="home-inline-crop-preview" id="homeInlineCropPreview">
            ${src?`<img id="homeInlineCropImage" src="${esc(src)}" alt="" draggable="false">`:'<div class="empty-state">Locandina non disponibile.</div>'}
            <div class="home-inline-crop-fade"></div>
            <div class="home-inline-crop-copy">
              <span class="section-kicker">PROSSIMO LIVE</span>
              <strong>${esc(concert.name||'Live')}</strong>
              <small>${esc(formatDate(concert.concert_date))}${concert.start_time?` · ${esc(formatTime(concert.start_time))}`:''}</small>
            </div>
          </div>

          <div class="home-inline-crop-controls">
            <label>ZOOM <output id="homeInlineZoomOut">${state.zoom}%</output>
              <input id="homeInlineZoom" type="range" min="100" max="240" step="5" value="${state.zoom}">
            </label>
            <div class="home-inline-crop-position">
              <span>X <b id="homeInlineXOut">${Math.round(state.x)}%</b></span>
              <span>Y <b id="homeInlineYOut">${Math.round(state.y)}%</b></span>
            </div>
          </div>

          <div class="home-inline-crop-actions">
            <button class="btn btn-ghost" id="homeInlineCropReset" type="button">CENTRA</button>
            <button class="btn btn-primary" id="homeInlineCropSave" type="button">SALVA RITAGLIO</button>
          </div>
          <span class="home-inline-crop-status" id="homeInlineCropStatus"></span>
        </div>
      </section>`;

    document.body.appendChild(modal);
    document.documentElement.style.overflow='hidden';

    const image=modal.querySelector('#homeInlineCropImage');
    const preview=modal.querySelector('#homeInlineCropPreview');
    const zoomInput=modal.querySelector('#homeInlineZoom');

    const paint=()=>{
      if(image){
        image.style.objectPosition=`${state.x}% ${state.y}%`;
        image.style.transform=`scale(${state.zoom/100})`;
        image.style.transformOrigin=`${state.x}% ${state.y}%`;
      }
      modal.querySelector('#homeInlineZoomOut').textContent=Math.round(state.zoom)+'%';
      modal.querySelector('#homeInlineXOut').textContent=Math.round(state.x)+'%';
      modal.querySelector('#homeInlineYOut').textContent=Math.round(state.y)+'%';
      zoomInput.value=state.zoom;
    };

    let dragging=false,startX=0,startY=0,baseX=0,baseY=0;
    preview?.addEventListener('pointerdown',e=>{
      if(!image)return;
      dragging=true;
      startX=e.clientX;
      startY=e.clientY;
      baseX=state.x;
      baseY=state.y;
      preview.setPointerCapture?.(e.pointerId);
      preview.classList.add('is-dragging');
      e.preventDefault();
    });
    preview?.addEventListener('pointermove',e=>{
      if(!dragging||!image)return;
      const rect=preview.getBoundingClientRect();
      const dx=(e.clientX-startX)/Math.max(1,rect.width)*100;
      const dy=(e.clientY-startY)/Math.max(1,rect.height)*100;
      state.x=Math.max(0,Math.min(100,baseX-dx));
      state.y=Math.max(0,Math.min(100,baseY-dy));
      paint();
    });
    const stopDrag=()=>{
      dragging=false;
      preview?.classList.remove('is-dragging');
    };
    preview?.addEventListener('pointerup',stopDrag);
    preview?.addEventListener('pointercancel',stopDrag);

    zoomInput.oninput=()=>{
      state.zoom=Number(zoomInput.value);
      paint();
    };

    modal.querySelector('#homeInlineCropReset').onclick=()=>{
      state={x:50,y:50,zoom:100};
      paint();
    };

    const close=()=>{
      modal.remove();
      if(!document.querySelector('.modal:not([hidden])'))document.documentElement.style.removeProperty('overflow');
    };
    modal.querySelector('.modal-close').onclick=close;
    modal.querySelector('.modal-backdrop').onclick=close;

    modal.querySelector('#homeInlineCropSave').onclick=async()=>{
      const button=modal.querySelector('#homeInlineCropSave');
      const status=modal.querySelector('#homeInlineCropStatus');
      button.disabled=true;
      status.textContent='Salvataggio…';

      try{
        const {data,error}=await sb.from('site_home_settings').update({
          fallback_image_position_x:state.x,
          fallback_image_position_y:state.y,
          fallback_image_zoom:state.zoom
        }).eq('id','home')
          .select('fallback_image_position_x,fallback_image_position_y,fallback_image_zoom')
          .single();

        if(error)throw error;

        homeSettings={...homeSettings,...data};
        highlightSignature='';
        renderHighlights();
        syncHomeFallbackAdmin();
        toast('Ritaglio Home salvato ✓','ok');
        close();
      }catch(err){
        status.textContent=err.message||String(err);
      }finally{
        button.disabled=false;
      }
    };

    paint();
  }

  function renderHighlights() {
    const track=$('highlightTrack');if(!track)return;
    ensureHomeHeroNewsLayout();
    const slides=(siteNews||[]).map(newsSourceSlide);
    if(!slides.length)slides.push(fallbackNewsSlide());
    const signature=JSON.stringify(slides.map(x=>({id:x.id,title:x.title,body:x.body,meta:x.meta,kicker:x.kicker,image:x.image,image_position_x:x.image_position_x,image_position_y:x.image_position_y,image_zoom:x.image_zoom,action:x.action})));
    if(signature===highlightSignature){
      syncHomeFallbackCropButton();
      startHighlightAuto(slides,track);
      return;
    }
    highlightSignature=signature;

    track.innerHTML=slides.map((item,index)=>{
      const x=Math.max(0,Math.min(100,Number(item.image_position_x??50)));
      const y=Math.max(0,Math.min(100,Number(item.image_position_y??50)));
      const zoom=Math.max(100,Math.min(240,Number(item.image_zoom??100)));
      return `<article class="highlight-slide" data-highlight-index="${index}" aria-label="${esc(item.kicker+': '+item.title)}">
        ${item.image?`<img class="highlight-bg-image" src="${esc(item.image)}" alt="" aria-hidden="true" style="object-position:${x}% ${y}%;transform:scale(${zoom/100});transform-origin:${x}% ${y}%">`:''}
        <div class="highlight-copy">
          <span class="section-kicker">${esc(item.kicker)}${item.meta?` · ${esc(item.meta)}`:''}</span>
          <h3>${esc(item.title)}</h3>
          ${item.body?`<p>${esc(item.body)}</p>`:''}
          ${item.action?`<button type="button" class="btn btn-primary highlight-action" data-highlight-action="${index}">${esc(item.action.label||'SCOPRI')}</button>`:''}
        </div>
      </article>`;
    }).join('');
    $$('[data-highlight-action]',track).forEach(button=>button.onclick=()=>{runHighlightAction(slides[Number(button.dataset.highlightAction)]);startHighlightAuto(slides,track)});

    const count=slides.length;
    const update=()=>{
      const width=Math.max(1,track.clientWidth);
      const at=Math.max(0,Math.min(count-1,Math.round(track.scrollLeft/width)));
      if($('highlightCount'))$('highlightCount').textContent=(at+1)+' / '+count;
      if($('highlightPrev'))$('highlightPrev').disabled=count<=1;
      if($('highlightNext'))$('highlightNext').disabled=count<=1;
    };
    const move=dir=>{
      const width=Math.max(1,track.clientWidth);
      const current=Math.max(0,Math.min(count-1,Math.round(track.scrollLeft/width)));
      const next=(current+dir+count)%count;
      track.scrollTo({left:next*width,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
      startHighlightAuto(slides,track);
    };
    if($('highlightPrev'))$('highlightPrev').onclick=()=>move(-1);
    if($('highlightNext'))$('highlightNext').onclick=()=>move(1);
    track.onscroll=update;
    track.onkeydown=e=>{if(e.target!==track)return;if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();move(e.key==='ArrowRight'?1:-1)}};
    track.onmouseenter=stopHighlightAuto;
    track.onmouseleave=()=>startHighlightAuto(slides,track);
    track.onfocusin=stopHighlightAuto;
    track.onfocusout=()=>startHighlightAuto(slides,track);
    update();
    syncHomeFallbackCropButton();
    startHighlightAuto(slides,track);
  }

  function openPoster(src,title) {
    if(!safeHttps(src))return;
    let dialog=$('posterViewer');
    if(!dialog){
      dialog=document.createElement('dialog');dialog.id='posterViewer';dialog.setAttribute('aria-label','Immagine ingrandita');
      dialog.innerHTML='<header><strong id="posterTitle"></strong><div><button type="button" id="posterZoomOut" aria-label="Riduci">−</button><button type="button" id="posterZoomIn" aria-label="Ingrandisci">+</button><button type="button" id="posterClose" aria-label="Chiudi">×</button></div></header><div class="poster-scroll"><img id="posterImage" alt="" draggable="false"></div>';
      document.body.append(dialog);let zoom=1;
      const resize=()=>{
        const img=$('posterImage');if(!img)return;
        if(zoom===1){img.style.width='auto';img.style.maxWidth='min(78vw,720px)';img.style.maxHeight='calc(100svh - 190px)';}
        else{img.style.width=(zoom*100)+'%';img.style.maxWidth='none';img.style.maxHeight='none';}
      };
      $('posterZoomIn').onclick=()=>{zoom=Math.min(zoom+.5,3);resize();};
      $('posterZoomOut').onclick=()=>{zoom=Math.max(zoom-.5,1);resize();};
      $('posterClose').onclick=()=>dialog.close();
      dialog.addEventListener('close',()=>{zoom=1;resize();if(!$$('.modal:not([hidden])').length)document.documentElement.style.removeProperty('overflow');});
      dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
      resize();
    }
    $('posterTitle').textContent=title;$('posterImage').src=src;$('posterImage').alt=title||'Immagine';
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
      const posters = posterPaths(c.poster_path).map(path => posterUrl(path)).filter(Boolean);
      const role = currentFan ? 'fan' : 'guest';
      const canSeeSetlist = can(role,'concert_setlist_view');
      const started = isLiveNow(c) || c.status === 'completed';
      const canAttend = !!currentFan && started;
      const canVote = !!currentFan && !!data.voting_open && !!data.attended;
      const mapQuery = encodeURIComponent([c.venue,c.city].filter(Boolean).join(', '));
      const posterCarousel = posters.length ? `<div class="concert-poster-carousel" data-concert-poster-carousel><div class="concert-poster-stage"><button class="poster-open concert-poster-frame" type="button" aria-label="Ingrandisci locandina"><img class="concert-poster" src="${esc(posters[0])}" alt="${esc(window.JMCopy.text('ui.poster',{name:c.name}))}" draggable="false"></button>${posters.length>1?`<button class="concert-poster-nav concert-poster-prev" type="button" aria-label="Locandina precedente">‹</button><button class="concert-poster-nav concert-poster-next" type="button" aria-label="Locandina successiva">›</button>`:''}</div>${posters.length>1?`<div class="concert-poster-footer"><div class="concert-poster-dots">${posters.map((_,i)=>`<button type="button" class="concert-poster-dot${i===0?' active':''}" data-poster-index="${i}" aria-label="Locandina ${i+1}"></button>`).join('')}</div><span class="concert-poster-count">1 / ${posters.length}</span></div>`:''}</div>` : '';
      let html = `<div class="concert-detail-top"><div class="concert-detail-meta"><span class="status-pill status-${cls}">${esc(status)}</span>${c.private_show?'<span class="private-show-chip">PRIVATE SHOW</span>':''}<p><strong>${esc(formatDate(c.concert_date))}${c.start_time ? ` · ${esc(formatTime(c.start_time))}` : ''}</strong><br>${esc(prettyPlace(c))}</p><div class="concert-public-actions">${mapQuery ? `<a class="btn btn-ghost" href="https://www.google.com/maps/search/?api=1&query=${mapQuery}" target="_blank" rel="noopener" data-copy="ui.d2f10e06593c">INDICAZIONI</a>` : ''}<button class="btn btn-ghost" id="addConcertCalendar" type="button" data-copy="ui.84253b1ec4ee">+ CALENDARIO</button></div></div>${posterCarousel}</div>`;
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
      const carousel=$('concertModalBody').querySelector('[data-concert-poster-carousel]');
      if(carousel&&posters.length){
        let posterIndex=0;
        const image=carousel.querySelector('.concert-poster');
        const frame=carousel.querySelector('.concert-poster-frame');
        const count=carousel.querySelector('.concert-poster-count');
        const dots=[...carousel.querySelectorAll('.concert-poster-dot')];
        const paintPoster=()=>{image.src=posters[posterIndex];if(count)count.textContent=(posterIndex+1)+' / '+posters.length;dots.forEach((dot,i)=>dot.classList.toggle('active',i===posterIndex));};
        carousel.querySelector('.concert-poster-prev')?.addEventListener('click',()=>{posterIndex=(posterIndex-1+posters.length)%posters.length;paintPoster();});
        carousel.querySelector('.concert-poster-next')?.addEventListener('click',()=>{posterIndex=(posterIndex+1)%posters.length;paintPoster();});
        dots.forEach((dot,i)=>dot.addEventListener('click',()=>{posterIndex=i;paintPoster();}));
        frame?.addEventListener('click',()=>openPoster(posters[posterIndex],posters.length>1?`${c.name} · ${posterIndex+1}/${posters.length}`:c.name));
      }
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
    window.addEventListener('hashchange',()=>{
      applyRoute();
      if(rawRoute()==='checkin')handleQrCheckin();
    });
    document.addEventListener('jm:copy-change', () => { renderHome(); renderTour(); renderRepertoire(); renderRankings(); renderPublicMedia(); contactRender(); renderContextRail(currentRoute()); });
    window.addEventListener('jm:song-play-counted', async()=>{
      publicSongsLoaded=false;
      await loadPublicContentExtensions();
    });
    $$('.nav-item').forEach(b => b.onclick = () => go(b.dataset.route));
    $$('[data-go]').forEach(b => b.onclick = () => go(b.dataset.go));
    $('userEntry').onclick = () => { renderUserModal(); openModal('userModal'); };
    $('manageMemberPhotos')?.addEventListener('click',openMemberPhotoManager);
    $('memberCarouselPrev')?.addEventListener('click',()=>moveMemberCarousel(-1));
    $('memberCarouselNext')?.addEventListener('click',()=>moveMemberCarousel(1));
    $$('[data-close-modal]').forEach(n => n.onclick = () => closeModal(n.dataset.closeModal));
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      if ($('checkinHeroFlow') && !$('checkinHeroFlow').hidden) { advanceHomeEntryFlow(); return; }
      const open = $$('.modal:not([hidden])').at(-1);
      if (open) closeModal(open.id);
    });
    $$('#loginSwitch [data-login-mode]').forEach(b => b.onclick = () => showLoginMode(b.dataset.loginMode));
    $('fanNameInput')?.addEventListener('input', () => {
      const target = $('fanTargetFanId');
      if (target) target.value = '';
      const matches = $('fanNameMatches');
      if (matches) { matches.hidden = true; matches.innerHTML = ''; }
      const mark = $('fanGroupRequiredMark');
      if (mark) mark.hidden = true;
      const group = $('fanGroupInput');
      if (group) group.required = false;
      fanNameCheckState = {name:'',data:null,promise:null};
      const msg = $('fanLoginMessage');
      if (msg) msg.textContent = '';
    });
    $('fanNameInput')?.addEventListener('blur', async () => {
      const name = $('fanNameInput').value.trim();
      if (!name) return;
      try { await checkFanName(name); }
      catch (err) { const msg=$('fanLoginMessage'); if(msg)msg.textContent=err.message; }
    });

    $('fanLoginForm').addEventListener('submit', async e => {
      e.preventDefault();
      const name = $('fanNameInput').value.trim();
      const groupName = $('fanGroupInput')?.value.trim() || null;
      const targetFanId = $('fanTargetFanId')?.value || null;
      const msg = $('fanLoginMessage');
      if (!name) return;
      msg.textContent = window.JMCopy.text('ui.876e88411094');
      try {
        if (!targetFanId) {
          const check = await checkFanName(name,{force:true});
          if (check?.group_required && !groupName) {
            msg.textContent = 'Questo nome esiste già: seleziona il tuo profilo oppure indica il gruppo / cerchia.';
            $('fanGroupInput')?.focus();
            return;
          }
        }

        const loginResult = await loginFan(name,{groupName,targetFanId});
        msg.textContent = '';
        resetFanNameDisambiguation();
        const loginSource = qrCheckinPending ? 'checkin' : 'normal';
        closeModal('userModal');
        if(window.JMPublicFanFlow?.afterLogin){
          await window.JMPublicFanFlow.afterLogin(loginResult,{source:loginSource});
        }
        if(qrCheckinPending){
          const first=qrClaimedOnLogin[0];
          try{
            await loadRankings(true);
            renderRankings();
            renderHome();
          }catch{}
          completeQrCheckin(qrCheckinConcert || first || null,{certified:true});
        }else if(newDeviceEntryPending){
          completeNewDeviceEntry();
        }else{
          toast(window.JMCopy.text('ui.hello',{name:currentFan.nickname || currentFan.display_name}),'ok');
        }
      }
      catch (err) {
        msg.textContent = err.message;
        if (err.message && /scegli il tuo profilo|stesso nome|gruppo/i.test(err.message)) {
          try { await checkFanName(name,{force:true}); } catch {}
        }
      }
    });
    $('memberLoginForm').addEventListener('submit', async e => {
      e.preventDefault(); const msg = $('memberLoginMessage'); msg.textContent = window.JMCopy.text('ui.876e88411094');
      try { await loginMember($('memberUsernameInput').value,$('memberPasswordInput').value); msg.textContent=''; closeModal('userModal'); toast(window.JMCopy.text('ui.memberHello',{name:currentMember.display_name || currentMember.username}),'ok'); window.JMCopy.ready(); }
      catch (err) { msg.textContent = err.message; }
    });
    $('fanCatalogSearch').addEventListener('input', renderFanCatalog);
    $('repertoireSearch')?.addEventListener('input', renderRepertoire);
    $('publicAddVideo')?.addEventListener('click',()=>openPublicVideoEditor());
    $('bookingPrevMonth')?.addEventListener('click',()=>{bookingCalendarMonth=new Date(bookingCalendarMonth.getFullYear(),bookingCalendarMonth.getMonth()-1,1);renderBookingCalendar();});
    $('bookingNextMonth')?.addEventListener('click',()=>{bookingCalendarMonth=new Date(bookingCalendarMonth.getFullYear(),bookingCalendarMonth.getMonth()+1,1);renderBookingCalendar();});
    $('bookingForm')?.addEventListener('submit',submitBookingRequest);
    $$('[data-expand-ranking]').forEach(btn => btn.onclick = () => {
      const key = btn.dataset.expandRanking;
      if (expandedRankings.has(key)) expandedRankings.delete(key); else expandedRankings.add(key);
      renderRankings();
    });
  }

  async function loadPublicBootstrap() {
    let lastError = null;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const {data,error} = await sb.rpc('get_public_bootstrap');
        if (error) throw error;

        const row = Array.isArray(data) ? data[0] : data;
        const payload = row?.payload;

        if (!payload || typeof payload !== 'object') {
          throw new Error('Bootstrap pubblico non valido');
        }

        concerts = Array.isArray(payload.concerts) ? payload.concerts : [];
        rankingData = payload.rankings && typeof payload.rankings === 'object'
          ? payload.rankings
          : {fans:[],songs:[],concerts:[],posters:[]};

        siteNews = Array.isArray(payload.news) ? payload.news : [];
        homeSettings = {
          ...homeSettings,
          ...(payload.home_settings && typeof payload.home_settings === 'object'
            ? payload.home_settings
            : {})
        };

        publicSongs = Array.isArray(payload.songs) ? payload.songs : [];
        publicMedia = Array.isArray(payload.media) ? payload.media : [];
        guestPermissions = payload.permissions && typeof payload.permissions === 'object'
          ? payload.permissions
          : {};

        publicSongsLoaded = true;
        publicMediaLoaded = true;
        publicSongsError = null;

        window.JM_PUBLIC_DATA = {
          revision:Number(row?.revision ?? payload.revision ?? 0),
          generated_at:row?.generated_at || payload.generated_at || new Date().toISOString(),
          concerts:[...concerts],
          rankings:rankingData,
          news:[...siteNews],
          home_settings:{...homeSettings},
          songs:[...publicSongs],
          media:[...publicMedia],
          contacts:Array.isArray(payload.contacts) ? payload.contacts : [],
          permissions:{...guestPermissions}
        };

        return window.JM_PUBLIC_DATA;
      } catch (err) {
        lastError = err;
        if (attempt < 2) {
          await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1)));
        }
      }
    }

    throw lastError || new Error('Dati pubblici non disponibili');
  }

  async function init() {
    const loader = $('jmDataLoader');

    if (!window.supabase?.createClient) {
      if (loader) {
        loader.querySelector('.jm-data-loader-title').textContent = 'DATI NON DISPONIBILI';
      }
      return;
    }

    sb = window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
    ensurePublicSections();
    ensureHomeHeroNewsLayout();
    ensureGlobalSocialShells();
    ensureCheckinHeroStyles();
    observePublishedContacts();
    bindStaticEvents();

    if (!location.hash) history.replaceState(null,'','#/home');

    const copyJob = window.JMCopy.init(sb)
      .catch(err=>console.warn('Testi pubblicati non disponibili',err));

    const identityJob = (async()=>{
      try {
        const {data:{session}} = await sb.auth.getSession();
        if (session?.user) await restoreMemberSession();
      } catch (err) {
        console.warn('Sessione membro non ripristinata',err);
      }

      if (!currentMember) {
        const savedName = localStorage.getItem('jm_public_fan_name');
        if (savedName) {
          try {
            await loginFan(savedName,{refreshData:false});
          } catch (err) {
            console.warn('Sessione fan non ripristinata',err);
            currentFan = null;
          }
        }
      }
    })();

    try {
      await Promise.all([
        loadPublicBootstrap(),
        identityJob,
        copyJob,
        window.JM_CONTACTS_READY || Promise.resolve()
      ]);
    } catch (err) {
      console.error('Bootstrap pubblico',err);

      if (loader) {
        const title = loader.querySelector('.jm-data-loader-title');
        const card = loader.querySelector('.jm-data-loader-card');

        if (title) title.textContent = 'DATI NON DISPONIBILI';

        if (card && !card.querySelector('[data-jm-retry]')) {
          const retry = document.createElement('button');
          retry.type = 'button';
          retry.className = 'btn btn-primary';
          retry.dataset.jmRetry = '1';
          retry.textContent = 'RIPROVA';
          retry.onclick = () => location.reload();
          card.appendChild(retry);
        }
      }

      return;
    }

    if (rankingData && typeof rankingData === 'object') {
      rankingData.current_fan_id = currentFan?.id || null;
    }

    updateUserUI();

    // Un solo render: nessun dato parziale e nessuna cache locale obsoleta.
    renderHome();
    renderTour();
    renderRankings();
    renderRepertoire();
    renderPublicMedia();
    renderRailNextShow();
    contactRender();
    applyRoute();
    window.JMCopy.ready();
    startRealtime();

    document.documentElement.classList.add('jm-public-data-ready');
    window.dispatchEvent(new CustomEvent('jm:public-data-ready',{
      detail:{
        revision:window.JM_PUBLIC_DATA?.revision || 0,
        generated_at:window.JM_PUBLIC_DATA?.generated_at || null
      }
    }));

    document.documentElement.classList.remove('jm-mobile-home-pending');
    document.documentElement.classList.remove('jm-data-loading');
    if (loader) loader.hidden = true;

    if (rawRoute()==='checkin') {
      await handleQrCheckin();
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();
