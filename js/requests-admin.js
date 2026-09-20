(()=>{
  'use strict';

  const PAGE_ID='requestsPage';
  const NAV_ID='requestsNav';
  const state={
    filter:'all',
    demoView:'requests',
    demo:[],booking:[],bookingDates:[],fan:[],catalog:[],cash:[],codes:[],songs:[],profiles:[],fans:[],errors:[],loaded:false,loading:false
  };

  const q=(sel,root=document)=>root.querySelector(sel);
  const qa=(sel,root=document)=>[...root.querySelectorAll(sel)];
  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const isAdmin=()=>{try{return typeof isEma==='function'&&isEma()}catch{return false}};
  const fmtDate=v=>{if(!v)return'—';const d=new Date(String(v).length===10?v+'T12:00:00':v);return Number.isNaN(d.getTime())?String(v):d.toLocaleDateString('it-IT')};
  const fmtDateTime=v=>{if(!v)return'';const d=new Date(v);return Number.isNaN(d.getTime())?'':d.toLocaleString('it-IT',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})};
  const euro=v=>new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(Number(v)||0);
  const createdTime=r=>Date.parse(r?.created_at||r?.updated_at||r?.transaction_date||r?.concert_date||0)||0;

  const cashLabels={
    room_fee:'Quota saletta',equipment_purchase:'Acquisto strumentazione',equipment_rental:'Noleggio strumentazione',
    materials_purchase:'Materiale vario',live_income:'Incasso live',staff_reward:'Ricompensa staff',loan_repayment:'Restituzione prestiti'
  };

  function injectStyles(){
    if(document.getElementById('requestsAdminStyles'))return;
    const style=document.createElement('style');
    style.id='requestsAdminStyles';
    style.textContent=`
      #bookingAdminNav,#demoCodesNav{display:none!important}
      #approvalNotifier,#openProposalPanelButton,#proposalBadge,#mergeBadge,#cashPendingBadge{display:none!important}
      #${PAGE_ID}.active{height:100%;min-height:0;display:flex!important;flex-direction:column;overflow:hidden}
      .rq-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:4px 0 8px;flex:0 0 auto}
      .rq-title{display:flex;align-items:center;gap:8px;min-width:0}.rq-title h2{margin:0;font-size:18px}.rq-total{display:inline-flex;align-items:center;justify-content:center;min-width:24px;height:24px;padding:0 7px;border-radius:999px;background:#f3d234;color:#111;font-size:8px;font-weight:950}
      .rq-tabs,.rq-demo-tabs{display:flex;gap:4px;overflow-x:auto;scrollbar-width:none;flex:0 0 auto;padding:3px;border:1px solid rgba(255,255,255,.08);border-radius:11px;background:rgba(255,255,255,.025)}
      .rq-tabs::-webkit-scrollbar,.rq-demo-tabs::-webkit-scrollbar{display:none}.rq-tabs button,.rq-demo-tabs button{min-height:30px;padding:6px 10px;border:1px solid transparent;border-radius:8px;background:transparent;color:#8b939e;font-size:7px;font-weight:950;letter-spacing:.05em;white-space:nowrap}.rq-tabs button.active,.rq-demo-tabs button.active{border-color:rgba(243,210,52,.3);background:rgba(243,210,52,.1);color:#f3d234}
      .rq-demo-tabs{margin-top:7px;width:max-content;max-width:100%}.rq-body{flex:1 1 0;min-height:0;overflow-y:auto;padding:8px 1px 18px;overscroll-behavior:contain}
      .rq-list{display:grid;gap:7px}.rq-card{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;padding:10px;border:1px solid rgba(255,255,255,.08);border-radius:12px;background:rgba(255,255,255,.025)}
      .rq-card-main{min-width:0}.rq-line{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.rq-kind{display:inline-flex;padding:3px 6px;border-radius:999px;border:1px solid rgba(243,210,52,.25);background:rgba(243,210,52,.07);color:#e9d25e;font-size:6px;font-weight:950;letter-spacing:.07em}.rq-card strong{font-size:9px}.rq-meta{margin-top:4px;color:#8b939f;font-size:7px;line-height:1.45;overflow-wrap:anywhere}.rq-time{margin-top:4px;color:#606975;font-size:6.5px}.rq-actions{display:flex;align-items:center;justify-content:flex-end;gap:4px;flex-wrap:wrap;max-width:330px}.rq-actions button,.rq-refresh,.rq-code-form button{min-height:28px;padding:5px 8px;border:1px solid rgba(255,255,255,.12);border-radius:8px;background:#292f38;color:#e7eaf0;font-size:7px;font-weight:900}.rq-actions .primary,.rq-code-form .primary{background:#f3d234;color:#111;border-color:#f3d234}.rq-actions .success{border-color:rgba(93,180,119,.35);color:#9bd7ad;background:rgba(93,180,119,.08)}.rq-actions .danger{border-color:rgba(204,91,91,.35);color:#e39a9a;background:rgba(204,91,91,.08)}
      .rq-booking-dates{display:flex;gap:4px;flex-wrap:wrap;margin-top:6px}.rq-booking-date{min-height:25px;padding:4px 7px;border:1px solid #3b424d;border-radius:7px;background:#1c2229;color:#c4cad2;font-size:7px;font-weight:850}.rq-empty{padding:22px;text-align:center;color:#767f8a;font-size:8px;border:1px dashed rgba(255,255,255,.09);border-radius:12px}.rq-error{padding:7px 9px;margin-bottom:7px;border:1px solid rgba(204,91,91,.25);border-radius:9px;background:rgba(204,91,91,.06);color:#d99a9a;font-size:7px}
      .rq-code-grid{display:grid;grid-template-columns:minmax(280px,.75fr) minmax(0,1.25fr);gap:8px;margin-top:8px}.rq-code-panel{border:1px solid rgba(255,255,255,.08);border-radius:12px;background:rgba(255,255,255,.02);padding:9px}.rq-code-panel h3{margin:0 0 8px;font-size:10px}.rq-code-form{display:grid;gap:7px}.rq-code-form label{display:grid;gap:3px;color:#858d98;font-size:6.5px;font-weight:900}.rq-code-form input,.rq-code-form select{width:100%;min-width:0;padding:7px 8px;border:1px solid #3c424d;border-radius:8px;background:#171c23;color:#e8ebef;font-size:8px}.rq-code-inline{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:5px}.rq-code-songs{display:grid;gap:3px;max-height:180px;overflow:auto;padding:5px;border:1px solid rgba(255,255,255,.07);border-radius:8px}.rq-code-songs label{display:flex;align-items:center;gap:6px;padding:4px;color:#b2b8c1;font-size:7px}.rq-code-created{padding:8px;border:1px solid rgba(243,210,52,.25);border-radius:9px;background:rgba(243,210,52,.06);color:#f3d234;font-size:10px;font-weight:950;letter-spacing:.08em;word-break:break-all}.rq-code-list{display:grid;gap:5px}.rq-code-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:7px;align-items:center;padding:8px;border-bottom:1px solid rgba(255,255,255,.06)}.rq-code-row:last-child{border-bottom:0}.rq-code-row strong{display:block;font-size:8px}.rq-code-row span{display:block;margin-top:3px;color:#818995;font-size:6.5px;line-height:1.4}.rq-code-row button{min-height:26px;padding:4px 7px;border:1px solid rgba(255,255,255,.12);border-radius:7px;background:#262c34;color:#ddd;font-size:6.5px;font-weight:900}
      #${NAV_ID} .rq-badge{margin-left:4px}.rq-badge{display:inline-flex;align-items:center;justify-content:center;min-width:17px;height:17px;padding:0 4px;border-radius:999px;background:#f3d234;color:#111;font-size:6px;font-weight:950}.rq-badge:empty{display:none}
      @media(max-width:760px){.rq-head{align-items:flex-start}.rq-title h2{font-size:15px}.rq-card{grid-template-columns:1fr}.rq-actions{justify-content:flex-start;max-width:none}.rq-actions button{flex:1 1 auto}.rq-code-grid{grid-template-columns:1fr}.rq-tabs button{padding-inline:8px}.rq-body{padding-bottom:28px}}
    `;
    document.head.appendChild(style);
  }

  function makePage(){
    const main=q('#memberApp main');if(!main||q('#'+PAGE_ID))return;
    const page=document.createElement('section');
    page.id=PAGE_ID;page.className='page';
    page.innerHTML=`
      <div class="rq-head">
        <div class="rq-title"><h2>RICHIESTE</h2><span class="rq-total" id="rqTotal">0</span></div>
        <button type="button" class="rq-refresh" id="rqRefresh">AGGIORNA</button>
      </div>
      <div class="rq-tabs" id="rqTabs"></div>
      <div id="rqDemoTabs"></div>
      <div class="rq-body" id="rqBody"><div class="rq-empty">Apri la sezione per caricare le richieste.</div></div>`;
    main.appendChild(page);
    q('#rqRefresh',page).onclick=()=>loadAll(true);
  }

  function makeNav(){
    const nav=q('#memberNav');if(!nav)return;
    let btn=q('#'+NAV_ID,nav);
    if(!btn){
      btn=document.createElement('button');
      btn.id=NAV_ID;btn.type='button';btn.className='nav-button hidden';btn.dataset.category='management';btn.dataset.page=PAGE_ID;
      btn.innerHTML='RICHIESTE <span class="rq-badge" id="rqNavBadge"></span>';
      const cash=nav.querySelector('[data-page="cashPage"]');
      if(cash)cash.after(btn);else nav.appendChild(btn);
    }
    btn.onclick=openPage;
  }

  function normalizeNav(){
    const nav=q('#memberNav');if(!nav)return;
    const presence=q('#demoCertificationNav',nav);
    const users=nav.querySelector('[data-page="fansAdminPage"]');
    if(presence){presence.dataset.category='fan';presence.textContent='PRESENZE';if(users)users.before(presence)}

    const availability=q('#bandAvailabilityNav',nav);
    if(availability){availability.dataset.category='management';availability.textContent='DISPONIBILITÀ'}
    const requests=q('#'+NAV_ID,nav);
    if(requests&&availability)availability.after(requests);

    const booking=q('#bookingAdminNav',nav);if(booking){booking.classList.add('hidden');booking.hidden=true;booking.tabIndex=-1}
    const demoCodes=q('#demoCodesNav',nav);if(demoCodes){demoCodes.classList.add('hidden');demoCodes.hidden=true;demoCodes.tabIndex=-1}

    const media=q('#publicMediaAdminNav',nav);
    const setup=q('#setupNavButton',nav);
    if(media){media.dataset.category='setup';media.textContent='MEDIA PUBBLICI';if(setup)setup.before(media)}
  }

  function syncVisibility(){
    const admin=isAdmin();
    const btn=q('#'+NAV_ID);if(btn)btn.classList.toggle('hidden',!admin);
    normalizeNav();
    const setupCat=q('#memberCategoryNav [data-member-category="setup"]');
    if(setupCat&&admin)setupCat.hidden=false;
    if(admin&&!state.loaded&&!state.loading)loadAll(false);
  }

  function openPage(){
    if(!isAdmin())return;
    const nav=q('#memberNav');
    nav?.querySelectorAll('.nav-button').forEach(b=>b.classList.remove('active'));
    q('#'+NAV_ID)?.classList.add('active');
    qa('#memberApp main .page').forEach(p=>p.classList.remove('active'));
    q('#'+PAGE_ID)?.classList.add('active');
    try{window.setMemberCategory?.('management',{activate:false})}catch{}
    loadAll(false);
  }

  async function attempt(label,fn,fallback=[]){
    try{return await fn()}catch(err){state.errors.push(`${label}: ${err?.message||err}`);return fallback}
  }

  async function loadAll(force=false){
    if(!isAdmin()||state.loading)return;
    state.loading=true;
    const body=q('#rqBody');if(body&&q('#'+PAGE_ID)?.classList.contains('active'))body.innerHTML='<div class="rq-empty">Caricamento richieste…</div>';
    state.errors=[];
    const [profiles,fans,demo,booking,bookingDates,fan,catalog,cash,codes,songs]=await Promise.all([
      attempt('Profili',async()=>{const r=await sb.from('profiles').select('id,display_name,username');if(r.error)throw r.error;return r.data||[]}),
      attempt('Fan',async()=>{const r=await sb.rpc('admin_list_fans');if(r.error)throw r.error;return r.data||[]}),
      attempt('Demo',async()=>{const r=await sb.rpc('admin_list_demo_access_requests');if(r.error)throw r.error;return(r.data||[]).filter(x=>x.status==='pending')}),
      attempt('Booking',async()=>{const r=await sb.from('booking_requests').select('*').eq('status','pending').order('created_at',{ascending:false});if(r.error)throw r.error;return r.data||[]}),
      attempt('Date booking',async()=>{const r=await sb.from('booking_request_dates').select('*').order('day',{ascending:true});if(r.error)throw r.error;return r.data||[]}),
      attempt('Fan merge',async()=>{const r=await sb.from('fan_merge_requests').select('*').eq('status','pending').order('created_at',{ascending:false});if(r.error)throw r.error;return r.data||[]}),
      attempt('Catalogo',async()=>{const r=await sb.from('song_proposals').select('*').eq('status','pending').order('created_at',{ascending:false});if(r.error)throw r.error;return r.data||[]}),
      attempt('Cassa',async()=>{const r=await sb.from('cash_transactions').select('*').eq('status','pending').order('created_at',{ascending:false});if(r.error)throw r.error;return r.data||[]}),
      attempt('Codici demo',async()=>{const r=await sb.rpc('admin_list_demo_unlock_codes_v2');if(r.error)throw r.error;return r.data||[]}),
      attempt('Brani demo',async()=>{const r=await sb.from('songs').select('id,title,audio_path,active,hidden_track').order('title');if(r.error)throw r.error;return(r.data||[]).filter(x=>x.active!==false&&!x.hidden_track&&x.audio_path)})
    ]);
    Object.assign(state,{profiles,fans,demo,booking,bookingDates,fan,catalog,cash,codes,songs});
    state.loaded=true;state.loading=false;
    updateCounts();render();
  }

  function counts(){return{demo:state.demo.length,booking:state.booking.length,fan:state.fan.length,catalog:state.catalog.length,cash:state.cash.length}}
  function total(){return Object.values(counts()).reduce((a,b)=>a+b,0)}
  function updateCounts(){
    const n=total();
    const badge=q('#rqNavBadge');if(badge)badge.textContent=n?String(n):'';
    const totalEl=q('#rqTotal');if(totalEl)totalEl.textContent=String(n);
  }

  function profileName(id){const p=state.profiles.find(x=>String(x.id)===String(id));return p?.display_name||p?.username||'Membro'}
  function fanName(id){const f=state.fans.find(x=>String(x.id)===String(id));return f?.nickname||f?.display_name||f?.name||'Fan'}
  function bookingDatesFor(id){return state.bookingDates.filter(x=>String(x.request_id)===String(id))}

  function filters(){const c=counts();return[
    ['all','TUTTE',total()],['demo','DEMO',c.demo],['booking','BOOKING',c.booking],['fan','FAN',c.fan],['catalog','CATALOGO',c.catalog],['cash','CASSA',c.cash]
  ]}
  function renderTabs(){
    const box=q('#rqTabs');if(!box)return;
    box.innerHTML=filters().map(([key,label,n])=>`<button type="button" class="${state.filter===key?'active':''}" data-rq-filter="${key}">${label} (${n})</button>`).join('');
    qa('[data-rq-filter]',box).forEach(b=>b.onclick=()=>{state.filter=b.dataset.rqFilter;state.demoView='requests';render()});
  }
  function renderDemoTabs(){
    const host=q('#rqDemoTabs');if(!host)return;
    if(state.filter!=='demo'){host.innerHTML='';return}
    host.innerHTML=`<div class="rq-demo-tabs"><button type="button" data-rq-demo-view="requests" class="${state.demoView==='requests'?'active':''}">RICHIESTE DEMO (${state.demo.length})</button><button type="button" data-rq-demo-view="codes" class="${state.demoView==='codes'?'active':''}">CODICI (${state.codes.length})</button></div>`;
    qa('[data-rq-demo-view]',host).forEach(b=>b.onclick=()=>{state.demoView=b.dataset.rqDemoView;render()});
  }

  function card(type,title,meta,time,actions='',extra=''){
    return `<article class="rq-card"><div class="rq-card-main"><div class="rq-line"><span class="rq-kind">${esc(type)}</span><strong>${esc(title)}</strong></div>${meta?`<div class="rq-meta">${meta}</div>`:''}${extra}${time?`<div class="rq-time">${esc(time)}</div>`:''}</div><div class="rq-actions">${actions}</div></article>`;
  }

  function demoCards(){return state.demo.map(r=>{
    const who=r.fan_name||r.requester_name||'Ospite';
    const scope=r.requested_scope_type==='all'?'Tutte le demo':r.requested_scope_type==='bundle'?'Bundle':'Singola demo';
    const mode=r.requested_access_mode==='preview_30'?'anteprima 30s':'demo intera';
    const songs=(r.song_titles||[]).join(' / ');
    const meta=`${esc(scope)} · ${esc(mode)} · ${Number(r.requested_validity_days)||0} giorni${songs?` · ${esc(songs)}`:''}${r.requester_contact?`<br>${esc(r.requester_contact)}`:''}${r.note?`<br>${esc(r.note)}`:''}`;
    const actions=`${r.fan_id?`<button class="success" data-demo-direct="${esc(r.id)}">APPROVA</button>`:''}<button class="primary" data-demo-code="${esc(r.id)}">GENERA CODICE</button><button class="danger" data-demo-reject="${esc(r.id)}">RIFIUTA</button>`;
    return card('DEMO',who,meta,fmtDateTime(r.created_at),actions);
  }).join('')}

  function bookingCards(){return state.booking.map(r=>{
    const dates=bookingDatesFor(r.id).filter(d=>d.status==='requested'||d.status==='pending');
    const extra=dates.length?`<div class="rq-booking-dates">${dates.map(d=>`<button type="button" class="rq-booking-date" data-booking-accept="${esc(r.id)}" data-booking-day="${esc(d.day)}">ACCETTA ${esc(fmtDate(d.day))}</button>`).join('')}</div>`:'';
    const meta=[r.requester_name,r.organization,r.event_type,r.venue_name,r.city].filter(Boolean).map(esc).join(' · ')+(r.details?`<br>${esc(r.details)}`:'');
    return card('BOOKING',r.event_name||'Richiesta booking',meta,fmtDateTime(r.created_at),`<button class="danger" data-booking-reject="${esc(r.id)}">RIFIUTA</button>`,extra);
  }).join('')}

  function fanCards(){return state.fan.map(r=>{
    const src=fanName(r.requester_fan_id),dst=fanName(r.suggested_fan_id);
    const meta=`Profilo nuovo: ${esc(src)}<br>Profilo proposto: ${esc(dst)}${r.requested_nickname?`<br>Nickname richiesto: ${esc(r.requested_nickname)}`:''}`;
    return card('FAN','Unificazione profili',meta,fmtDateTime(r.created_at),`<button class="success" data-fan-approve="${esc(r.id)}">UNISCI</button><button class="danger" data-fan-reject="${esc(r.id)}">RIFIUTA</button>`);
  }).join('')}

  function catalogCards(){return state.catalog.map(r=>card('CATALOGO',r.title||'Nuovo brano',`Proposta da ${esc(profileName(r.proposed_by))}${r.review_note?`<br>${esc(r.review_note)}`:''}`,fmtDateTime(r.created_at),`<button class="success" data-catalog-approve="${esc(r.id)}">APPROVA</button><button class="danger" data-catalog-reject="${esc(r.id)}">RIFIUTA</button>`)).join('')}

  function cashCards(){return state.cash.map(r=>{
    const title=cashLabels[r.category]||String(r.category||'Movimento').replaceAll('_',' ');
    const meta=`${euro(r.amount)} · firmatario ${esc(profileName(r.signer_member_id))}${r.transaction_date?` · ${esc(fmtDate(r.transaction_date))}`:''}${r.description?`<br>${esc(r.description)}`:''}`;
    return card('CASSA',title,meta,fmtDateTime(r.created_at),`<button class="success" data-cash-approve="${esc(r.id)}">APPROVA</button><button class="danger" data-cash-reject="${esc(r.id)}">RIFIUTA</button>`);
  }).join('')}

  function allCards(){
    const rows=[];
    state.demo.forEach(r=>rows.push({t:createdTime(r),html:demoCardsForOne(r)}));
    state.booking.forEach(r=>rows.push({t:createdTime(r),html:bookingCardsForOne(r)}));
    state.fan.forEach(r=>rows.push({t:createdTime(r),html:fanCardsForOne(r)}));
    state.catalog.forEach(r=>rows.push({t:createdTime(r),html:catalogCardsForOne(r)}));
    state.cash.forEach(r=>rows.push({t:createdTime(r),html:cashCardsForOne(r)}));
    return rows.sort((a,b)=>b.t-a.t).map(x=>x.html).join('');
  }
  function demoCardsForOne(r){const old=state.demo;state.demo=[r];const h=demoCards();state.demo=old;return h}
  function bookingCardsForOne(r){const old=state.booking;state.booking=[r];const h=bookingCards();state.booking=old;return h}
  function fanCardsForOne(r){const old=state.fan;state.fan=[r];const h=fanCards();state.fan=old;return h}
  function catalogCardsForOne(r){const old=state.catalog;state.catalog=[r];const h=catalogCards();state.catalog=old;return h}
  function cashCardsForOne(r){const old=state.cash;state.cash=[r];const h=cashCards();state.cash=old;return h}

  function randomCode(){const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789',part=()=>Array.from({length:4},()=>alphabet[Math.floor(Math.random()*alphabet.length)]).join('');return `MOLESTI-${part()}-${part()}`}
  function renderSongPicker(){
    const box=q('#rqCodeSongs');if(!box)return;
    const scope=q('#rqCodeScope')?.value||'all';
    const wrap=q('#rqCodeSongsWrap');if(wrap)wrap.hidden=scope==='all';
    box.innerHTML=state.songs.map(s=>`<label><input type="checkbox" data-rq-code-song value="${esc(s.id)}"> ${esc(s.title)}</label>`).join('')||'<div class="rq-empty">Nessuna demo con audio disponibile.</div>';
  }
  function renderCodes(){
    const codeRows=state.codes.map(x=>{
      const expired=x.expires_at&&Date.parse(x.expires_at)<=Date.now();
      const status=!x.active?'DISATTIVATO':expired?'SCADUTO':'ATTIVO';
      const scope=x.scope_type==='all'?'TUTTE':x.scope_type==='bundle'?`BUNDLE ${x.song_titles?.length||0}`:'SINGOLA';
      const mode=x.access_mode==='preview_30'?'30S':'INTERA';
      return `<div class="rq-code-row"><div><strong>${esc(x.label||'Codice demo')} · ••••${esc(x.code_hint||'')}</strong><span>${status} · ${scope} · ${mode} · ${Number(x.validity_days)||0}gg · usi ${Number(x.uses||0)}${x.max_uses!=null?'/'+Number(x.max_uses):''}${x.song_titles?.length?` · ${esc(x.song_titles.join(' / '))}`:''}</span></div><button type="button" data-code-toggle="${esc(x.id)}" data-active="${x.active?'1':'0'}">${x.active?'DISATTIVA':'RIATTIVA'}</button></div>`;
    }).join('')||'<div class="rq-empty">Nessun codice creato.</div>';
    return `<div class="rq-code-grid"><section class="rq-code-panel"><h3>NUOVO CODICE</h3><form class="rq-code-form" id="rqCodeForm"><label>CODICE<div class="rq-code-inline"><input id="rqCodeValue" required maxlength="64" value="${esc(randomCode())}"><button type="button" id="rqGenerateCode">GENERA</button></div></label><label>NOTA<input id="rqCodeLabel" maxlength="160" placeholder="Es. backstage Vaccarino"></label><label>TIPO<select id="rqCodeScope"><option value="all">Tutte le demo</option><option value="single">Singola demo</option><option value="bundle">Bundle 3–5</option></select></label><div id="rqCodeSongsWrap" hidden><label>BRANI<div class="rq-code-songs" id="rqCodeSongs"></div></label></div><label>ACCESSO<select id="rqCodeMode"><option value="preview_30">Anteprima 30 secondi</option><option value="full">Demo intera</option></select></label><label>VALIDITÀ<select id="rqCodeDays"><option value="15">15 giorni</option><option value="30">30 giorni</option></select></label><label>USI MASSIMI<input id="rqCodeMaxUses" type="number" min="1" step="1" placeholder="Illimitati"></label><label>SCADENZA CODICE<input id="rqCodeExpires" type="datetime-local"></label><button class="primary" type="submit">CREA CODICE</button><div id="rqCodeCreated"></div></form></section><section class="rq-code-panel"><h3>CODICI GENERATI</h3><div class="rq-code-list">${codeRows}</div></section></div>`;
  }

  function render(){
    renderTabs();renderDemoTabs();updateCounts();
    const body=q('#rqBody');if(!body)return;
    if(state.filter==='demo'&&state.demoView==='codes'){
      body.innerHTML=(state.errors.length?state.errors.map(e=>`<div class="rq-error">${esc(e)}</div>`).join(''):'')+renderCodes();
      bindCodeActions();return;
    }
    let html='';
    if(state.filter==='all')html=allCards();
    if(state.filter==='demo')html=demoCards();
    if(state.filter==='booking')html=bookingCards();
    if(state.filter==='fan')html=fanCards();
    if(state.filter==='catalog')html=catalogCards();
    if(state.filter==='cash')html=cashCards();
    body.innerHTML=(state.errors.length?state.errors.map(e=>`<div class="rq-error">${esc(e)}</div>`).join(''):'')+`<div class="rq-list">${html||'<div class="rq-empty">Nessuna richiesta in attesa.</div>'}</div>`;
    bindRequestActions();
  }

  function findBy(type,id){return state[type].find(x=>String(x.id)===String(id))}
  async function reloadAfter(extra){try{if(extra)await extra}catch{}await loadAll(true)}

  async function approveDemo(req){if(!req?.fan_id)return;const{error}=await sb.rpc('admin_grant_demo_request',{p_request_id:req.id,p_scope_type:req.requested_scope_type,p_access_mode:req.requested_access_mode,p_validity_days:req.requested_validity_days,p_song_ids:(req.song_ids||[]).map(String)});if(error)return alert(error.message);await loadAll(true)}
  async function issueDemoCode(req){const code=randomCode();const{error}=await sb.rpc('admin_create_demo_unlock_code_v2',{p_code:code,p_label:`Richiesta ${req.fan_name||req.requester_name||'ospite'}`,p_scope_type:req.requested_scope_type,p_access_mode:req.requested_access_mode,p_validity_days:req.requested_validity_days,p_song_ids:(req.song_ids||[]).map(String),p_max_uses:1,p_expires_at:null,p_request_id:req.id});if(error)return alert(error.message);alert(`Codice generato: ${code}\n\nL'utente lo vedrà anche sul dispositivo con cui ha inviato la richiesta.`);await loadAll(true)}
  async function rejectDemo(req){const note=prompt('Motivo / nota facoltativa:','');if(note===null)return;const{error}=await sb.rpc('admin_reject_demo_access_request',{p_request_id:req.id,p_note:note});if(error)return alert(error.message);await loadAll(true)}

  async function acceptBooking(req,day){if(!req||!day)return;if(!confirm(`Accettare il booking per il ${fmtDate(day)}?`))return;const dates=bookingDatesFor(req.id);for(const d of dates){const status=d.day===day?'accepted':'declined';const r=await sb.from('booking_request_dates').update({status}).eq('request_id',req.id).eq('day',d.day);if(r.error)return alert(r.error.message)}const r=await sb.from('booking_requests').update({status:'accepted',updated_at:new Date().toISOString()}).eq('id',req.id);if(r.error)return alert(r.error.message);await loadAll(true)}
  async function rejectBooking(req){if(!req||!confirm('Rifiutare questa richiesta di booking?'))return;let r=await sb.from('booking_requests').update({status:'declined',updated_at:new Date().toISOString()}).eq('id',req.id);if(r.error)return alert(r.error.message);r=await sb.from('booking_request_dates').update({status:'declined'}).eq('request_id',req.id);if(r.error)return alert(r.error.message);await loadAll(true)}

  async function approveFan(req){try{if(typeof loadFanArea==='function')await loadFanArea();if(typeof mergeFanRequest==='function'){await mergeFanRequest(req);await loadAll(true);return}}catch(err){console.warn(err)}if(!req?.suggested_fan_id)return alert('Profilo di destinazione non disponibile.');if(!confirm('Confermare l’unificazione dei due profili fan?'))return;const{error}=await sb.rpc('merge_fans',{p_source_fan_id:req.requester_fan_id,p_target_fan_id:req.suggested_fan_id,p_final_nickname:req.requested_nickname||null,p_request_id:req.id});if(error)return alert(error.message);await loadAll(true)}
  async function rejectFan(req){const note=prompt('Nota (facoltativa):','');if(note===null)return;const{error}=await sb.rpc('reject_fan_merge_request',{p_request_id:req.id,p_note:note});if(error)return alert(error.message);await loadAll(true)}

  async function approveCatalog(req){const{error}=await sb.rpc('approve_song_proposal',{p_proposal_id:req.id});if(error)return alert(error.message);await reloadAfter(typeof refreshAll==='function'?refreshAll():null)}
  async function rejectCatalog(req){const note=prompt('Motivo del rifiuto (facoltativo):','');if(note===null)return;const{error}=await sb.rpc('reject_song_proposal',{p_proposal_id:req.id,p_note:note});if(error)return alert(error.message);await reloadAfter(typeof refreshAll==='function'?refreshAll():null)}

  async function reviewCash(req,approve){let note=null;if(approve){if(!confirm('Approvare questo movimento di cassa?'))return}else{note=prompt('Motivo del rifiuto (facoltativo):','');if(note===null)return}const{error}=await sb.rpc('cash_review_transaction',{p_transaction_id:req.id,p_approve:approve,p_note:note||null});if(error)return alert(error.message);await reloadAfter(window.jmCash?.reload?.())}

  function bindRequestActions(){
    const root=q('#'+PAGE_ID);if(!root)return;
    qa('[data-demo-direct]',root).forEach(b=>b.onclick=()=>approveDemo(findBy('demo',b.dataset.demoDirect)));
    qa('[data-demo-code]',root).forEach(b=>b.onclick=()=>issueDemoCode(findBy('demo',b.dataset.demoCode)));
    qa('[data-demo-reject]',root).forEach(b=>b.onclick=()=>rejectDemo(findBy('demo',b.dataset.demoReject)));
    qa('[data-booking-accept]',root).forEach(b=>b.onclick=()=>acceptBooking(findBy('booking',b.dataset.bookingAccept),b.dataset.bookingDay));
    qa('[data-booking-reject]',root).forEach(b=>b.onclick=()=>rejectBooking(findBy('booking',b.dataset.bookingReject)));
    qa('[data-fan-approve]',root).forEach(b=>b.onclick=()=>approveFan(findBy('fan',b.dataset.fanApprove)));
    qa('[data-fan-reject]',root).forEach(b=>b.onclick=()=>rejectFan(findBy('fan',b.dataset.fanReject)));
    qa('[data-catalog-approve]',root).forEach(b=>b.onclick=()=>approveCatalog(findBy('catalog',b.dataset.catalogApprove)));
    qa('[data-catalog-reject]',root).forEach(b=>b.onclick=()=>rejectCatalog(findBy('catalog',b.dataset.catalogReject)));
    qa('[data-cash-approve]',root).forEach(b=>b.onclick=()=>reviewCash(findBy('cash',b.dataset.cashApprove),true));
    qa('[data-cash-reject]',root).forEach(b=>b.onclick=()=>reviewCash(findBy('cash',b.dataset.cashReject),false));
  }

  function selectedCodeSongs(){return qa('[data-rq-code-song]:checked',q('#'+PAGE_ID)||document).map(x=>x.value)}
  function validateCodeScope(scope,ids){if(scope==='single'&&ids.length!==1)return'Seleziona esattamente una demo.';if(scope==='bundle'&&(ids.length<3||ids.length>5))return'Seleziona da 3 a 5 demo.';return''}
  async function createManualCode(e){
    e.preventDefault();const scope=q('#rqCodeScope').value,ids=scope==='all'?[]:selectedCodeSongs(),validation=validateCodeScope(scope,ids);if(validation)return alert(validation);
    const code=q('#rqCodeValue').value.trim().toUpperCase();if(!code)return;
    const max=q('#rqCodeMaxUses').value,exp=q('#rqCodeExpires').value;
    const{error}=await sb.rpc('admin_create_demo_unlock_code_v2',{p_code:code,p_label:q('#rqCodeLabel').value.trim()||null,p_scope_type:scope,p_access_mode:q('#rqCodeMode').value,p_validity_days:Number(q('#rqCodeDays').value),p_song_ids:ids,p_max_uses:max?Number(max):null,p_expires_at:exp?new Date(exp).toISOString():null,p_request_id:null});
    if(error)return alert(error.message);alert(`Codice creato: ${code}\n\nCopialo ora: nell'elenco resterà visibile solo la parte finale.`);await loadAll(true);state.filter='demo';state.demoView='codes';render();
  }
  function bindCodeActions(){
    const root=q('#'+PAGE_ID);if(!root)return;
    q('#rqGenerateCode',root)?.addEventListener('click',()=>{q('#rqCodeValue').value=randomCode()});
    q('#rqCodeScope',root)?.addEventListener('change',renderSongPicker);
    q('#rqCodeForm',root)?.addEventListener('submit',createManualCode);
    renderSongPicker();
    qa('[data-code-toggle]',root).forEach(b=>b.onclick=async()=>{const{error}=await sb.rpc('admin_set_demo_unlock_code_active',{p_id:b.dataset.codeToggle,p_active:b.dataset.active!=='1'});if(error)return alert(error.message);await loadAll(true);state.filter='demo';state.demoView='codes';render()});
  }

  function bindNavCorrections(){
    const nav=q('#memberNav');if(!nav)return;
    nav.addEventListener('click',e=>{
      const btn=e.target.closest('.nav-button[data-page]');if(!btn)return;
      const forced={demoCertificationPage:'fan',publicMediaAdminPage:'setup',requestsPage:'management',bandAvailabilityPage:'management'}[btn.dataset.page];
      if(forced)try{window.setMemberCategory?.(forced,{activate:false})}catch{}
    });
  }

  function boot(){
    if(typeof sb==='undefined')return;
    injectStyles();makeNav();makePage();normalizeNav();bindNavCorrections();syncVisibility();
    const memberApp=q('#memberApp');if(memberApp)new MutationObserver(()=>queueMicrotask(syncVisibility)).observe(memberApp,{attributes:true,attributeFilter:['hidden']});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
