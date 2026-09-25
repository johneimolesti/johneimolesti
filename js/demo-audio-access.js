(() => {
  'use strict';

  const SUPABASE_URL='https://etzwybamvfpeitkttwrc.supabase.co';
  const SUPABASE_KEY='sb_publishable_CtyexwjoW375UXpjInOuDA_Uz28wWJx';
  const API=`${SUPABASE_URL}/functions/v1/demo-audio-api`;

  const sb=window.supabase?.createClient
    ? window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY)
    : null;

  let repertoire=new Map();
  let access={allowed:false,reason:'locked'};
  let refreshTimer=null;

  const esc=value=>String(value??'').replace(/[&<>'"]/g,ch=>({
    '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'
  }[ch]));

  function publicMediaUrl(path){
    if(!path||!sb)return '';
    try{return sb.storage.from('public-media').getPublicUrl(path).data.publicUrl||''}
    catch{return ''}
  }

  function deviceToken(){
    let token=localStorage.getItem('jm_fan_device_token');
    if(!token){
      token=crypto.randomUUID();
      localStorage.setItem('jm_fan_device_token',token);
    }
    return token;
  }

  function fingerprint(){
    return [
      navigator.userAgent,
      navigator.language,
      Intl.DateTimeFormat().resolvedOptions().timeZone,
      screen.width,
      screen.height,
      window.devicePixelRatio||1
    ].join('|');
  }

  async function call(action,payload={}){
    if(!sb)throw new Error('Supabase non disponibile');
    const {data:{session}}=await sb.auth.getSession();
    const token=session?.access_token||SUPABASE_KEY;
    const res=await fetch(API,{
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'apikey':SUPABASE_KEY,
        'Authorization':`Bearer ${token}`
      },
      body:JSON.stringify({
        action,
        device_token:deviceToken(),
        fingerprint:fingerprint(),
        ...payload
      })
    });
    let data={};
    try{data=await res.json()}catch{}
    if(!res.ok)throw Object.assign(
      new Error(data.error||`HTTP ${res.status}`),
      {status:res.status,data}
    );
    return data;
  }

  async function loadRepertoire(){
    const shared=window.JM_PUBLIC_DATA?.songs;
    if(Array.isArray(shared)){
      repertoire=new Map(shared.map(song=>[String(song.id),song]));
      return true;
    }

    if(!sb)return false;
    try{
      const {data,error}=await sb.rpc('get_public_repertoire');
      if(error)throw error;
      repertoire=new Map((data||[]).map(song=>[String(song.id),song]));
      return true;
    }catch(err){
      console.warn('Demo repertoire',err);
      return false;
    }
  }

  async function loadStatus(){
    try{
      // Membri e admin: nessun codice. Verifica prima la sessione Supabase
      // locale, così l'interfaccia non mostra mai "SBLOCCA DEMO" a chi fa
      // parte della band mentre l'Edge Function sta ancora rispondendo.
      const {data:{session}}=await sb.auth.getSession();
      if(session?.user?.id){
        const {data:profile,error:profileError}=await sb
          .from('profiles')
          .select('id,username,display_name')
          .eq('id',session.user.id)
          .maybeSingle();

        if(!profileError&&profile){
          access={
            allowed:true,
            global_access:'full',
            reason:'member',
            grants:[],
            member:{
              id:profile.id,
              name:profile.display_name||profile.username||'Membro'
            },
            fan:null
          };
          return;
        }
      }

      access=await call('status');
    }catch(err){
      console.warn('Demo status',err);
      access={allowed:false,reason:'locked'};
    }
  }

  function accessLabel(){
    if(access.reason==='member')return 'Accesso completo: membro band';
    if(access.reason==='certified_attendance')return 'Accesso completo: presenza certificata';
    if(access.global_access==='full')return 'Accesso completo';
    const active=(access.grants||[]).filter(g=>!g.expires_at||Date.parse(g.expires_at)>Date.now());
    if(active.length)return `${active.length} sblocco${active.length===1?'':'i'} attivo${active.length===1?'':'i'}`;
    return 'Demo riservate';
  }

  function songAccess(songId){
    if(access.global_access==='full')return 'full';
    let preview=false;
    const now=Date.now();
    for(const grant of access.grants||[]){
      if(grant.expires_at&&Date.parse(grant.expires_at)<=now)continue;
      const applies=grant.scope_type==='all'||(grant.song_ids||[]).map(String).includes(String(songId));
      if(!applies)continue;
      if(grant.access_mode==='full')return 'full';
      if(grant.access_mode==='preview_30')preview=true;
    }
    return preview?'preview_30':null;
  }

  function storedRequestIds(){
    try{
      const parsed=JSON.parse(localStorage.getItem('jm_demo_access_requests')||'[]');
      return Array.isArray(parsed)?[...new Set(parsed.map(String).filter(Boolean))]:[];
    }catch{return[]}
  }

  function saveRequestIds(ids){
    localStorage.setItem('jm_demo_access_requests',JSON.stringify([...new Set(ids.map(String).filter(Boolean))]));
  }

  function addRequestId(id){
    if(!id)return;
    const ids=storedRequestIds();
    ids.push(String(id));
    saveRequestIds(ids);
  }

  function removeRequestId(id){
    saveRequestIds(storedRequestIds().filter(x=>x!==String(id)));
  }

  async function checkPendingRequests(){
    const ids=storedRequestIds();
    let changed=false;
    let readyCode='';
    let rejected='';

    for(const id of ids){
      try{
        const state=await call('request_status',{request_id:id});
        if(state.status==='direct_granted'){
          removeRequestId(id);
          changed=true;
        }else if(state.status==='code_ready'&&state.code){
          readyCode=state.code;
          localStorage.setItem('jm_demo_ready_code',state.code);
        }else if(state.status==='rejected'){
          removeRequestId(id);
          rejected=state.admin_note||'Richiesta non approvata.';
          changed=true;
        }
      }catch(err){
        if(err.status===404)removeRequestId(id);
      }
    }

    if(changed){
      await loadStatus();
      decorate();
    }
    if(rejected){
      localStorage.setItem('jm_demo_request_notice',rejected);
    }
    return readyCode;
  }

  function ensureUnlockBox(){
    const toolbar=document.querySelector('.repertoire-toolbar');
    if(!toolbar)return null;

    let box=document.getElementById('demoUnlockBox');
    const hasDemo=[...repertoire.values()].some(x=>x.has_demo&&!x.spotify_url);

    if(!hasDemo){
      box?.remove();
      return null;
    }

    if(!box){
      box=document.createElement('div');
      box.id='demoUnlockBox';
      box.className='demo-unlock-box';
      toolbar.insertAdjacentElement('afterend',box);
    }

    const readyCode=localStorage.getItem('jm_demo_ready_code')||'';
    const notice=localStorage.getItem('jm_demo_request_notice')||'';
    if(notice)localStorage.removeItem('jm_demo_request_notice');

    if(access.global_access==='full'){
      box.innerHTML=`<span class="demo-access-ok">✓ ${esc(accessLabel())}</span>`;
    }else{
      const grants=(access.grants||[]).filter(g=>!g.expires_at||Date.parse(g.expires_at)>Date.now());
      box.innerHTML=`
        <div>
          <strong>DEMO AUDIO</strong>
          <span>${grants.length?esc(accessLabel()):'Puoi usare un codice oppure richiedere uno sblocco.'}${notice?` · ${esc(notice)}`:''}</span>
        </div>
        <button class="btn ${readyCode?'btn-primary':'btn-ghost'}" id="openDemoUnlock" type="button">${readyCode?'CODICE PRONTO':'CODICE / RICHIEDI'}</button>`;
      document.getElementById('openDemoUnlock')?.addEventListener('click',()=>openUnlockModal());
    }
    return box;
  }

  function ensureStyles(){
    if(document.getElementById('demoAudioAccessStyles'))return;
    const style=document.createElement('style');
    style.id='demoAudioAccessStyles';
    style.textContent=`
      .demo-unlock-box{display:flex;align-items:center;justify-content:space-between;gap:14px;margin:0 0 16px;padding:12px 14px;border:1px solid #777568;background:#20201d}
      .demo-unlock-box>div{display:grid;gap:3px}.demo-unlock-box strong{font-size:12px}.demo-unlock-box span{font-size:12px;color:var(--muted);line-height:1.35}
      .demo-access-ok{color:#96d69f!important;font-weight:800}
      .demo-player-button{width:100%;min-height:35px}
      .demo-site-player{display:grid;gap:6px}
      .demo-site-player-actions{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px}
      .demo-site-player .btn{min-height:35px;white-space:nowrap}
      .demo-site-progress{position:relative;height:5px;border:1px solid #5d5a52;background:#111;overflow:hidden}
      .demo-site-progress>span{display:block;width:0;height:100%;background:var(--gold);transition:width .15s linear}
      .demo-site-player-meta{display:flex;align-items:center;justify-content:space-between;gap:8px;color:var(--muted);font:800 8px/1.2 monospace}
      .demo-site-player-meta strong{color:var(--gold);font:inherit}
      .demo-lock-note{display:block;margin-top:5px;font-size:10px;color:var(--muted);line-height:1.3}
      .demo-unlock-modal-card{width:min(430px,calc(100vw - 24px))}
      .demo-unlock-form{display:grid;gap:12px}.demo-unlock-form label{display:grid;gap:5px;font-size:12px;font-weight:800}
      .demo-unlock-form input{width:100%;padding:11px;border:2px solid #777568;background:#171717;color:#fff;font:800 15px/1 monospace;text-transform:uppercase;letter-spacing:.08em}
      .demo-unlock-status{min-height:18px;color:var(--muted);font-size:11px}
      .demo-unlock-sections{display:grid;gap:10px}.demo-unlock-section{display:grid;gap:8px;padding:10px;border:1px solid #57544c;background:#1d1d1b}
      .demo-unlock-section h3{margin:0;font:900 13px/1 Arial,sans-serif}.demo-unlock-section p{margin:0;color:var(--muted);font-size:10px;line-height:1.35}
      .demo-request-form{display:grid;gap:9px}.demo-request-form label{display:grid;gap:4px;font-size:10px;font-weight:800}
      .demo-request-form input,.demo-request-form select,.demo-request-form textarea{width:100%;padding:8px;border:1px solid #666258;background:#111;color:#fff;font:700 11px/1.2 Arial,sans-serif}
      .demo-request-form textarea{min-height:58px;resize:vertical}.demo-request-songs{display:grid;gap:4px;max-height:170px;overflow:auto;padding:6px;border:1px solid #4f4c45;background:#111}
      .demo-request-song{display:grid!important;grid-template-columns:18px minmax(0,1fr);align-items:center;gap:6px!important;font-size:10px!important;font-weight:700!important}
      .demo-request-song input{width:14px!important;height:14px;padding:0!important}
      .demo-request-result{padding:8px;border:1px solid #655f2b;background:#27230e;color:#f3d234;font:800 11px/1.35 monospace;word-break:break-word}

      .jm-global-player[hidden]{display:none!important}
      .jm-global-player{
        position:fixed;left:0;right:0;bottom:0;z-index:99990;
        display:grid;grid-template-columns:minmax(220px,1fr) minmax(360px,2fr) minmax(120px,.7fr);
        align-items:center;gap:18px;min-height:82px;padding:10px 18px;
        border-top:1px solid #4e4b43;background:rgba(10,10,10,.97);backdrop-filter:blur(16px);
        box-shadow:0 -10px 28px rgba(0,0,0,.5);color:#fff
      }
      body.has-jm-global-player{padding-bottom:94px}
      .jm-global-player-song{display:grid;grid-template-columns:54px minmax(0,1fr);align-items:center;gap:10px;min-width:0}
      .jm-global-player-cover{width:54px;height:54px;display:grid;place-items:center;overflow:hidden;border:1px solid #4e4b43;background:#171717;color:var(--gold);font:900 15px/1 Impact,Arial,sans-serif}
      .jm-global-player-cover img{width:100%;height:100%;object-fit:cover;display:block}
      .jm-global-player-copy{display:grid;gap:4px;min-width:0}
      .jm-global-player-copy strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:900 13px/1.1 Arial,sans-serif}
      .jm-global-player-copy span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--muted);font:700 9px/1.2 monospace}
      .jm-global-player-main{display:grid;gap:7px;min-width:0}
      .jm-global-player-controls{display:flex;align-items:center;justify-content:center;gap:10px}
      .jm-player-icon,.jm-player-play,.jm-player-close{border:0;background:transparent;color:#fff;cursor:pointer}
      .jm-player-icon{width:34px;height:34px;font-size:18px;opacity:.82}
      .jm-player-icon:hover,.jm-player-icon.active{color:var(--gold);opacity:1}
      .jm-player-icon:disabled{opacity:.25;cursor:default}
      .jm-player-play{width:40px;height:40px;display:grid;place-items:center;border:1px solid #6f6a5f;border-radius:50%;background:#fff;color:#111;font:900 15px/1 Arial,sans-serif}
      .jm-global-player-progress{display:grid;grid-template-columns:38px minmax(0,1fr) 38px;align-items:center;gap:8px;color:var(--muted);font:800 8px/1 monospace}
      .jm-global-player-progress input[type="range"]{width:100%;accent-color:var(--gold);cursor:pointer}
      .jm-global-player-side{display:flex;align-items:center;justify-content:flex-end;gap:12px;min-width:0}
      .jm-global-player-side>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--gold);font:800 8px/1.2 monospace}
      .jm-player-close{width:30px;height:30px;font-size:24px;color:var(--muted)}
      .jm-player-close:hover{color:#fff}
      @media(max-width:760px){
        .jm-global-player{
          grid-template-columns:minmax(0,1fr) auto;grid-template-areas:"song side" "main main";
          gap:7px 10px;min-height:112px;padding:8px 10px
        }
        body.has-jm-global-player{padding-bottom:124px}
        .jm-global-player-song{grid-area:song;grid-template-columns:42px minmax(0,1fr)}
        .jm-global-player-cover{width:42px;height:42px}
        .jm-global-player-main{grid-area:main;gap:4px}
        .jm-global-player-side{grid-area:side}
        .jm-global-player-side>span{display:none}
        .jm-global-player-controls{gap:7px}
        .jm-player-icon{width:30px;height:30px;font-size:16px}
        .jm-player-play{width:36px;height:36px}
      }

      .repertoire-toolbar{flex-wrap:wrap}
      .jukebox-launch{margin-left:auto;min-width:170px;flex:0 0 auto}
      @media(max-width:700px){.jukebox-launch{width:100%;margin-left:0}}
      .jukebox-overlay{position:fixed;inset:0;z-index:100000;display:none;grid-template-rows:auto minmax(0,1fr);background:
        radial-gradient(circle at 50% -20%,#343434 0,#101010 42%,#050505 100%);color:#f1eadc;overflow:hidden}
      .jukebox-overlay.open{display:grid}
      .jukebox-topbar{display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:center;gap:12px;min-height:54px;padding:8px 14px;border-bottom:2px solid #484848;background:linear-gradient(#181818,#090909);box-shadow:0 4px 14px #000}
      .jukebox-brand{min-width:0}.jukebox-brand strong{display:block;font:900 18px/1 Impact,Arial,sans-serif;letter-spacing:.08em;color:#f3d234}.jukebox-brand span{display:block;margin-top:3px;color:#a8a399;font:700 9px/1.2 monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .jukebox-now{min-width:0;max-width:42vw;color:#e9e0d0;font:800 10px/1.2 monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:right}
      .jukebox-close{width:38px;height:38px;border:1px solid #6d6d6d;background:#161616;color:#f3d234;font-size:22px;box-shadow:inset 0 0 0 2px #050505}
      .jukebox-shell{position:relative;min-height:0;padding:10px;border:10px ridge #777;background:
        linear-gradient(90deg,#050505 0 2%,#1e1e1e 2% 49.3%,#090909 49.3% 50.7%,#1e1e1e 50.7% 98%,#050505 98%);
        box-shadow:inset 0 0 0 3px #050505,inset 0 0 30px #000}
      .jukebox-grid{height:100%;min-height:0;display:grid;grid-auto-flow:column;grid-template-rows:repeat(var(--jukebox-rows),minmax(0,1fr));grid-template-columns:repeat(var(--jukebox-cols),minmax(0,1fr));column-gap:7.5%;row-gap:4px}
      .jukebox-slot{min-height:0;display:grid;grid-template-columns:58px 38px minmax(0,1fr);align-items:stretch;gap:7px;padding:3px;border:1px solid #3d3d3d;background:linear-gradient(#111,#070707);box-shadow:inset 0 0 0 1px #000}
      .jukebox-number{display:grid;place-items:center;border:1px solid #454545;background:linear-gradient(#141414,#050505);color:#d7a54d;text-shadow:0 2px 0 #000;font:900 clamp(15px,2.2vh,28px)/1 Impact,Arial,sans-serif;box-shadow:inset 0 0 8px #000}
      .jukebox-push-wrap{display:grid;place-items:center}
      .jukebox-push{position:relative;width:30px;height:30px;border:2px solid #2e2e2e;border-radius:50%;background:radial-gradient(circle at 35% 30%,#5e5e5e,#171717 52%,#030303 68%);box-shadow:0 5px 0 #030303,0 6px 8px #000,inset 0 0 0 2px #747474;cursor:pointer;transition:transform .08s ease,box-shadow .08s ease}
      .jukebox-push:not(:disabled):hover{filter:brightness(1.15)}
      .jukebox-push:disabled{cursor:not-allowed;opacity:.45}
      .jukebox-push.is-playing{transform:translateY(4px);box-shadow:0 1px 0 #030303,0 2px 4px #000,inset 0 0 0 2px #747474}
      .jukebox-push.is-loading{animation:jukeboxPulse .55s infinite alternate}
      @keyframes jukeboxPulse{to{filter:brightness(1.45)}}
      .jukebox-lamp{position:absolute;left:50%;top:50%;width:13px;height:13px;border-radius:50%;transform:translate(-50%,-50%);border:1px solid #6c2b00;background:radial-gradient(circle at 35% 30%,#6a2a00,#220600 62%,#080000);box-shadow:0 0 0 2px #050505}
      .jukebox-lamp.on{background:radial-gradient(circle at 35% 30%,#fff78c,#ff3b00 45%,#790000 75%);box-shadow:0 0 0 2px #050505,0 0 9px #ff3700,0 0 15px #ffb000}
      .jukebox-label{position:relative;min-width:0;height:100%;overflow:hidden;border:1px solid #707070;background:#e8dfca;box-shadow:inset 0 0 0 3px #1b1b1b}
      .jukebox-label img{display:block;width:100%;height:100%;object-fit:cover;pointer-events:none;user-select:none}
      .jukebox-label-empty{display:grid;place-items:center;height:100%;padding:4px;color:#6d665a;background:
        repeating-linear-gradient(0deg,#e7deca 0 11px,#ded4bf 11px 12px);font:800 8px/1 monospace;letter-spacing:.06em;text-align:center;text-transform:uppercase;pointer-events:none}
      .jukebox-slot.is-playing .jukebox-label{outline:1px solid #f3d234;box-shadow:inset 0 0 0 3px #1b1b1b,0 0 10px #f3d23455}
      .jukebox-slot.is-unavailable .jukebox-label{filter:grayscale(.85) brightness(.6)}
      .jukebox-hint{position:absolute;left:50%;bottom:8px;transform:translateX(-50%);z-index:2;padding:4px 8px;background:#000b;border:1px solid #555;color:#aaa;font:700 8px monospace;pointer-events:none}
      @media(max-width:900px){
        .jukebox-launch{margin-left:0;width:100%}
        .jukebox-topbar{grid-template-columns:minmax(0,1fr) auto}.jukebox-now{display:none}
        .jukebox-shell{padding:6px;border-width:6px}
        .jukebox-grid{column-gap:4%;row-gap:3px}
        .jukebox-slot{grid-template-columns:42px 32px minmax(0,1fr);gap:4px;padding:2px}
        .jukebox-push{width:25px;height:25px}.jukebox-number{font-size:14px}
      }
      @media(max-width:700px){.demo-unlock-box{align-items:flex-start;flex-direction:column}.demo-unlock-box .btn{width:100%}}
    `;
    document.head.appendChild(style);
  }

  function openUnlockModal(seedSongId=''){
    document.getElementById('demoUnlockModal')?.remove();

    const modal=document.createElement('div');
    modal.id='demoUnlockModal';
    modal.className='modal';
    modal.innerHTML=`
      <div class="modal-backdrop"></div>
      <section class="modal-card demo-unlock-modal-card" role="dialog" aria-modal="true" aria-labelledby="demoUnlockTitle">
        <header class="modal-head">
          <div><span class="section-kicker">DEMO AUDIO</span><h2 id="demoUnlockTitle">Accesso alle demo</h2></div>
          <button class="modal-close" type="button" aria-label="Chiudi">×</button>
        </header>
        <div class="modal-body demo-unlock-sections">
          <section class="demo-unlock-section">
            <h3>HAI GIÀ UN CODICE?</h3>
            <form class="demo-unlock-form" id="demoRedeemForm">
              <label>CODICE DI SBLOCCO
                <input id="demoUnlockCode" maxlength="64" autocomplete="off" spellcheck="false" placeholder="MOLESTI-XXXX">
              </label>
              <span class="demo-unlock-status" id="demoUnlockStatus"></span>
              <button class="btn btn-primary" type="submit">USA CODICE</button>
            </form>
          </section>

          <section class="demo-unlock-section">
            <h3>RICHIEDI UNO SBLOCCO</h3>
            <p>Puoi chiedere una canzone, un bundle di 3–5 brani oppure tutto il repertorio disponibile. L’admin deciderà se approvare direttamente il profilo registrato o generare un codice.</p>
            <form class="demo-request-form" id="demoRequestForm">
              <label>TIPO
                <select id="demoRequestScope">
                  <option value="single">Una canzone</option>
                  <option value="bundle">Bundle 3–5 canzoni</option>
                  <option value="all">Tutte le demo disponibili</option>
                </select>
              </label>
              <div id="demoRequestSongsWrap">
                <label>CANZONI</label>
                <div class="demo-request-songs" id="demoRequestSongs"></div>
              </div>
              <label>ACCESSO RICHIESTO
                <select id="demoRequestMode">
                  <option value="preview_30">Anteprima 30 secondi</option>
                  <option value="full">Brano intero</option>
                </select>
              </label>
              <label>DURATA
                <select id="demoRequestDays">
                  <option value="15">15 giorni</option>
                  <option value="30">30 giorni</option>
                </select>
              </label>
              <label>NOME
                <input id="demoRequestName" maxlength="160" value="${esc(access.fan?.name||'')}" placeholder="Nome o nickname">
              </label>
              <label>CONTATTO (FACOLTATIVO)
                <input id="demoRequestContact" maxlength="320" placeholder="E-mail / telefono / social">
              </label>
              <label>NOTA (FACOLTATIVA)
                <textarea id="demoRequestNote" maxlength="1000" placeholder="Messaggio per gli admin"></textarea>
              </label>
              <span class="demo-unlock-status" id="demoRequestStatus"></span>
              <button class="btn btn-primary" type="submit">INVIA RICHIESTA</button>
            </form>
          </section>
        </div>
      </section>`;

    document.body.appendChild(modal);
    document.documentElement.style.overflow='hidden';

    const close=()=>{
      modal.remove();
      if(!document.querySelector('.modal'))document.documentElement.style.removeProperty('overflow');
    };
    modal.querySelector('.modal-close').onclick=close;
    modal.querySelector('.modal-backdrop').onclick=close;

    const codeInput=modal.querySelector('#demoUnlockCode');
    const readyCode=localStorage.getItem('jm_demo_ready_code')||'';
    if(readyCode){
      codeInput.value=readyCode;
      modal.querySelector('#demoUnlockStatus').innerHTML=`<span class="demo-request-result">Codice generato dall’admin: ${esc(readyCode)}</span>`;
    }

    const songs=[...repertoire.values()]
      .filter(song=>song.has_demo)
      .sort((a,b)=>String(a.title||'').localeCompare(String(b.title||''),'it',{sensitivity:'base'}));

    const songBox=modal.querySelector('#demoRequestSongs');
    songBox.innerHTML=songs.map(song=>`
      <label class="demo-request-song">
        <input type="checkbox" value="${esc(song.id)}" ${String(song.id)===String(seedSongId)?'checked':''}>
        <span>${esc(song.title)}</span>
      </label>`).join('')||'<span class="muted-inline">Nessuna demo disponibile.</span>';

    const scope=modal.querySelector('#demoRequestScope');
    const songsWrap=modal.querySelector('#demoRequestSongsWrap');
    if(seedSongId)scope.value='single';

    const syncScope=()=>{
      songsWrap.hidden=scope.value==='all';
      const checks=[...songBox.querySelectorAll('input[type="checkbox"]')];
      if(scope.value==='single'){
        let first=checks.find(x=>x.checked);
        checks.forEach(x=>{if(first&&x!==first)x.checked=false});
      }
    };
    scope.onchange=syncScope;
    songBox.addEventListener('change',e=>{
      if(scope.value==='single'&&e.target.matches('input[type="checkbox"]')&&e.target.checked){
        songBox.querySelectorAll('input[type="checkbox"]').forEach(x=>{if(x!==e.target)x.checked=false});
      }
    });
    syncScope();

    modal.querySelector('#demoRedeemForm').onsubmit=async e=>{
      e.preventDefault();
      const status=modal.querySelector('#demoUnlockStatus');
      const btn=e.currentTarget.querySelector('button[type="submit"]');
      const code=codeInput.value.trim();
      if(!code){status.textContent='Inserisci il codice.';return}
      btn.disabled=true;status.textContent='Verifica…';
      try{
        await call('redeem',{code});
        localStorage.removeItem('jm_demo_ready_code');
        await loadStatus();
        status.textContent='Sblocco attivato.';
        decorate();
        setTimeout(close,500);
      }catch(err){
        status.textContent=err.message||'Codice non valido.';
      }finally{
        btn.disabled=false;
      }
    };

    modal.querySelector('#demoRequestForm').onsubmit=async e=>{
      e.preventDefault();
      const status=modal.querySelector('#demoRequestStatus');
      const btn=e.currentTarget.querySelector('button[type="submit"]');
      const scopeType=scope.value;
      const selected=[...songBox.querySelectorAll('input:checked')].map(x=>x.value);

      if(scopeType==='single'&&selected.length!==1){
        status.textContent='Seleziona una sola canzone.';return;
      }
      if(scopeType==='bundle'&&(selected.length<3||selected.length>5)){
        status.textContent='Per il bundle seleziona da 3 a 5 canzoni.';return;
      }

      btn.disabled=true;status.textContent='Invio…';
      try{
        const result=await call('request_access',{
          scope_type:scopeType,
          song_ids:scopeType==='all'?[]:selected,
          access_mode:modal.querySelector('#demoRequestMode').value,
          validity_days:Number(modal.querySelector('#demoRequestDays').value),
          requester_name:modal.querySelector('#demoRequestName').value.trim(),
          requester_contact:modal.querySelector('#demoRequestContact').value.trim(),
          note:modal.querySelector('#demoRequestNote').value.trim()
        });
        addRequestId(result.request_id);
        status.innerHTML=result.registered_fan
          ? '<span class="demo-request-result">Richiesta inviata. Se l’admin la approva direttamente, lo sblocco comparirà automaticamente su questo profilo.</span>'
          : '<span class="demo-request-result">Richiesta inviata. Quando l’admin genera il codice, lo ritroverai qui su questo dispositivo.</span>';
      }catch(err){
        status.textContent=err.message||'Invio non riuscito.';
      }finally{
        btn.disabled=false;
      }
    };

    setTimeout(()=>codeInput.focus(),0);
  }

  let repertoireAudio=null;
  let repertoireAudioSongId='';
  let repertoireAudioHost=null;
  let repertoireAudioData=null;
  let repertoireAudioSource='songs';
  let repertoireRequest=0;
  let playerShuffle=false;
  let previewCutoffTimer=null;

  const AUDIO_TICKET_KEY='jm_demo_audio_tickets';
  const prefetchedTickets=new Map();

  function readAudioTickets(){
    try{
      const value=JSON.parse(sessionStorage.getItem(AUDIO_TICKET_KEY)||'{}');
      return value&&typeof value==='object'?value:{};
    }catch{return {}}
  }

  function writeAudioTickets(value){
    try{sessionStorage.setItem(AUDIO_TICKET_KEY,JSON.stringify(value))}catch{}
  }

  function cachedAudioTicket(songId){
    const id=String(songId);
    const item=readAudioTickets()[id];
    if(!item?.url||!item?.expires_at)return null;
    if(Date.parse(item.expires_at)<=Date.now()+30000)return null;
    const mode=songAccess(id);
    if(!mode||mode!==item.access_mode)return null;
    return item;
  }

  function rememberAudioTicket(songId,data){
    if(!data?.url)return;
    const tickets=readAudioTickets();
    tickets[String(songId)]={
      url:data.url,
      expires_at:data.expires_at || new Date(Date.now()+Math.max(60,Number(data.expires_in)||1200)*1000).toISOString(),
      access_mode:data.access_mode,
      reason:data.reason||''
    };
    writeAudioTickets(tickets);
  }

  async function prefetchTrack(songId,{source='songs'}={}){
    const id=String(songId);
    const song=repertoire.get(id);
    if(!song?.has_demo||!songAccess(id))return null;
    if(prefetchedTickets.has(id))return prefetchedTickets.get(id);
    const cached=cachedAudioTicket(id);
    if(cached)return cached;

    const job=call('audio',{song_id:id,source:source==='jukebox'?'jukebox':'songs'})
      .then(data=>{
        rememberAudioTicket(id,data);
        prefetchedTickets.set(id,data);
        return data;
      })
      .catch(err=>{
        prefetchedTickets.delete(id);
        throw err;
      });

    prefetchedTickets.set(id,job);
    return job;
  }

  function formatDemoTime(seconds){
    if(!Number.isFinite(seconds)||seconds<0)return '0:00';
    const total=Math.floor(seconds);
    const m=Math.floor(total/60);
    const s=String(total%60).padStart(2,'0');
    return `${m}:${s}`;
  }

  function bindPlayCounter(audioEl,data,songId,source='songs'){
    const playId=String(data?.play_id||'').trim();
    if(!playId)return;

    const threshold=Math.max(8,Number(data?.qualify_after_seconds)||8);
    let listenedMs=0;
    let playStartedAt=0;
    let timer=null;
    let qualifying=false;
    let finished=false;

    const totalListenedMs=()=>listenedMs+(playStartedAt?Math.max(0,performance.now()-playStartedAt):0);
    const clearTimer=()=>{if(timer){clearTimeout(timer);timer=null}};

    const qualify=async()=>{
      if(finished||qualifying)return;
      const seconds=totalListenedMs()/1000;
      if(seconds<threshold){schedule();return}

      qualifying=true;
      try{
        const result=await call('qualify_play',{
          play_id:playId,
          listened_seconds:Math.max(threshold,Math.floor(seconds))
        });
        if(result?.counted||result?.already_counted){
          finished=true;
          window.dispatchEvent(new CustomEvent('jm:song-play-counted',{
            detail:{song_id:String(songId),source}
          }));
        }else if(result?.ok&&result?.counted===false){
          finished=true;
        }
      }catch(err){
        if(err.status===409&&!audioEl.paused&&!audioEl.ended){
          timer=setTimeout(qualify,1000);
        }else{
          console.warn('Conteggio riproduzione',err);
        }
      }finally{
        qualifying=false;
      }
    };

    function schedule(){
      clearTimer();
      if(finished||qualifying||audioEl.paused||audioEl.ended)return;
      const remaining=Math.max(0,threshold*1000-totalListenedMs());
      timer=setTimeout(qualify,remaining+120);
    }

    const markPlay=()=>{
      if(!playStartedAt)playStartedAt=performance.now();
      schedule();
    };
    const markPause=()=>{
      if(playStartedAt){
        listenedMs+=Math.max(0,performance.now()-playStartedAt);
        playStartedAt=0;
      }
      clearTimer();
    };

    audioEl.addEventListener('play',markPlay);
    audioEl.addEventListener('pause',markPause);
    audioEl.addEventListener('ended',markPause,{once:true});
    if(!audioEl.paused)markPlay();
  }

  function currentSong(){
    return repertoire.get(String(repertoireAudioSongId||''))||null;
  }

  function playableSongs(){
    return [...repertoire.values()]
      .filter(song=>song?.has_demo&&songAccess(String(song.id)))
      .sort((a,b)=>String(a.title||'').localeCompare(String(b.title||''),'it',{sensitivity:'base'}));
  }

  function effectiveDuration(audioEl=repertoireAudio,data=repertoireAudioData){
    if(!audioEl)return 0;
    const raw=Number.isFinite(audioEl.duration)?audioEl.duration:0;
    if(data?.access_mode==='preview_30'&&raw>0)return Math.min(30,raw);
    return raw;
  }

  function ensureGlobalPlayer(){
    let player=document.getElementById('jmGlobalAudioPlayer');
    if(player)return player;

    player=document.createElement('section');
    player.id='jmGlobalAudioPlayer';
    player.className='jm-global-player';
    player.hidden=true;
    player.setAttribute('aria-label','Player audio');
    player.innerHTML=`
      <div class="jm-global-player-song">
        <div class="jm-global-player-cover" data-global-cover><span>JM</span></div>
        <div class="jm-global-player-copy">
          <strong data-global-title>—</strong>
          <span data-global-artist>JOHN & I MOLESTI</span>
        </div>
      </div>
      <div class="jm-global-player-main">
        <div class="jm-global-player-controls">
          <button type="button" class="jm-player-icon" data-global-shuffle aria-label="Riproduzione casuale" title="Riproduzione casuale">⤨</button>
          <button type="button" class="jm-player-icon" data-global-prev aria-label="Brano precedente" title="Brano precedente">⏮</button>
          <button type="button" class="jm-player-play" data-global-toggle aria-label="Play/Pausa">▶</button>
          <button type="button" class="jm-player-icon" data-global-next aria-label="Brano successivo" title="Brano successivo">⏭</button>
        </div>
        <div class="jm-global-player-progress">
          <span data-global-current>0:00</span>
          <input type="range" min="0" max="1000" step="1" value="0" data-global-seek aria-label="Avanzamento brano">
          <span data-global-duration>0:00</span>
        </div>
      </div>
      <div class="jm-global-player-side">
        <span data-global-mode>DEMO</span>
        <button type="button" class="jm-player-close" data-global-stop aria-label="Chiudi player" title="Chiudi player">×</button>
      </div>`;

    document.body.appendChild(player);

    player.querySelector('[data-global-toggle]').addEventListener('click',()=>{
      if(!repertoireAudio)return;
      if(repertoireAudio.paused)repertoireAudio.play().catch(()=>{});
      else repertoireAudio.pause();
    });

    player.querySelector('[data-global-prev]').addEventListener('click',()=>playAdjacent(-1));
    player.querySelector('[data-global-next]').addEventListener('click',()=>playAdjacent(1));
    player.querySelector('[data-global-shuffle]').addEventListener('click',()=>{
      playerShuffle=!playerShuffle;
      syncGlobalPlayer();
    });
    player.querySelector('[data-global-stop]').addEventListener('click',()=>{
      stopRepertoireAudio({restore:true,hidePlayer:true});
    });

    const seek=player.querySelector('[data-global-seek]');
    seek.addEventListener('input',()=>{
      if(!repertoireAudio)return;
      const duration=effectiveDuration();
      if(duration<=0)return;
      const target=duration*(Number(seek.value)||0)/1000;
      try{repertoireAudio.currentTime=Math.max(0,Math.min(duration,target))}catch{}
      syncPlaybackUi();
    });

    return player;
  }

  function syncGlobalPlayer(){
    const player=ensureGlobalPlayer();
    const audioEl=repertoireAudio;
    const song=currentSong();

    if(!audioEl||!song){
      player.hidden=true;
      document.body.classList.remove('has-jm-global-player');
      return;
    }

    player.hidden=false;
    document.body.classList.add('has-jm-global-player');

    const cover=publicMediaUrl(song.cover_path);
    const coverHost=player.querySelector('[data-global-cover]');
    coverHost.innerHTML=cover
      ? `<img src="${esc(cover)}" alt="" draggable="false">`
      : '<span>JM</span>';

    player.querySelector('[data-global-title]').textContent=song.title||'Brano';
    player.querySelector('[data-global-artist]').textContent=
      [song.base_artist,song.lyrics_artist].filter(Boolean).join(' / ')||'JOHN & I MOLESTI';

    const toggle=player.querySelector('[data-global-toggle]');
    toggle.textContent=audioEl.paused?'▶':'❚❚';
    toggle.setAttribute('aria-label',audioEl.paused?'Riproduci':'Pausa');

    const duration=effectiveDuration(audioEl,repertoireAudioData);
    const current=Math.max(0,Math.min(duration||Infinity,Number.isFinite(audioEl.currentTime)?audioEl.currentTime:0));
    player.querySelector('[data-global-current]').textContent=formatDemoTime(current);
    player.querySelector('[data-global-duration]').textContent=duration?formatDemoTime(duration):'--:--';

    const seek=player.querySelector('[data-global-seek]');
    seek.value=duration>0?String(Math.round(Math.max(0,Math.min(1,current/duration))*1000)):'0';

    player.querySelector('[data-global-mode]').textContent=
      repertoireAudioData?.access_mode==='preview_30'?'ANTEPRIMA 30S':'BRANO INTERO';

    const songs=playableSongs();
    const multi=songs.length>1;
    player.querySelector('[data-global-prev]').disabled=!multi;
    player.querySelector('[data-global-next]').disabled=!multi;

    const shuffle=player.querySelector('[data-global-shuffle]');
    shuffle.classList.toggle('active',playerShuffle);
    shuffle.setAttribute('aria-pressed',playerShuffle?'true':'false');
  }

  function renderInlinePlayer(host,songId){
    if(!host||!repertoireAudio||String(songId)!==String(repertoireAudioSongId))return;
    repertoireAudioHost=host;

    let wrap=host.querySelector('.demo-site-player');
    if(!wrap){
      wrap=document.createElement('div');
      wrap.className='demo-site-player';
      wrap.innerHTML=`
        <div class="demo-site-player-actions">
          <button class="btn btn-primary" type="button" data-demo-toggle></button>
          <button class="btn btn-ghost" type="button" data-demo-stop>■ STOP</button>
        </div>
        <div class="demo-site-progress" aria-hidden="true"><span></span></div>
        <div class="demo-site-player-meta">
          <strong data-demo-mode></strong>
          <span data-demo-time>0:00 / --:--</span>
        </div>`;
      host.replaceChildren(wrap);

      wrap.querySelector('[data-demo-toggle]').onclick=e=>{
        e.preventDefault();
        e.stopPropagation();
        if(!repertoireAudio||String(repertoireAudioSongId)!==String(songId))return;
        if(repertoireAudio.paused)repertoireAudio.play().catch(()=>{});
        else repertoireAudio.pause();
      };

      wrap.querySelector('[data-demo-stop]').onclick=e=>{
        e.preventDefault();
        e.stopPropagation();
        stopRepertoireAudio({restore:true,hidePlayer:true});
      };
    }

    const duration=effectiveDuration();
    const current=Math.max(0,Math.min(duration||Infinity,Number.isFinite(repertoireAudio.currentTime)?repertoireAudio.currentTime:0));
    const percent=duration>0?Math.max(0,Math.min(100,current/duration*100)):0;
    wrap.querySelector('.demo-site-progress>span').style.width=percent+'%';
    wrap.querySelector('[data-demo-time]').textContent=`${formatDemoTime(current)} / ${duration?formatDemoTime(duration):'--:--'}`;
    wrap.querySelector('[data-demo-toggle]').textContent=repertoireAudio.paused?'▶ RIPRENDI':'❚❚ PAUSA';
    wrap.querySelector('[data-demo-mode]').textContent=repertoireAudioData?.access_mode==='preview_30'?'ANTEPRIMA 30S':'BRANO INTERO';
    host.dataset.demoState='playing';
  }

  function syncJukeboxPlaybackUi(){
    if(!document.getElementById('jukeboxOverlay')?.classList.contains('open'))return;
    document.querySelectorAll('[data-jukebox-song]').forEach(slot=>{
      const id=String(slot.dataset.jukeboxSong||'');
      const active=id===String(repertoireAudioSongId)&&repertoireAudio&&!repertoireAudio.paused;
      slot.classList.toggle('is-playing',!!active);
      const button=slot.querySelector('.jukebox-push');
      button?.classList.toggle('is-playing',!!active);
      button?.classList.remove('is-loading');
      button?.querySelector('.jukebox-lamp')?.classList.toggle('on',!!active);
    });
    const song=currentSong();
    if(song&&repertoireAudio){
      setJukeboxNow(`${repertoireAudio.paused?'IN PAUSA':'IN RIPRODUZIONE'} · ${song.title}`);
    }else{
      setJukeboxNow('');
    }
  }

  function syncPlaybackUi(){
    syncGlobalPlayer();

    if(repertoireAudio&&repertoireAudioSongId){
      let host=repertoireAudioHost;
      if(!host||!document.contains(host)){
        host=document.querySelector(
          `#repertoireGrid [data-repertoire-song="${CSS.escape(String(repertoireAudioSongId))}"] .repertoire-player`
        );
      }
      if(host)renderInlinePlayer(host,repertoireAudioSongId);
    }

    syncJukeboxPlaybackUi();
  }

  function stopRepertoireAudio({restore=true,hidePlayer=true}={}){
    repertoireRequest++;
    const host=repertoireAudioHost;
    if(previewCutoffTimer){
      clearTimeout(previewCutoffTimer);
      previewCutoffTimer=null;
    }
    if(repertoireAudio){
      try{
        repertoireAudio.pause();
        repertoireAudio.currentTime=0;
        repertoireAudio.removeAttribute('src');
        repertoireAudio.load();
      }catch{}
    }
    repertoireAudio=null;
    repertoireAudioSongId='';
    repertoireAudioHost=null;
    repertoireAudioData=null;
    repertoireAudioSource='songs';

    if(hidePlayer){
      const player=document.getElementById('jmGlobalAudioPlayer');
      if(player)player.hidden=true;
      document.body.classList.remove('has-jm-global-player');
    }

    if(restore&&host&&document.contains(host)){
      delete host.dataset.demoState;
      setTimeout(decorate,0);
    }
    syncJukeboxPlaybackUi();
  }

  function schedulePreviewCutoff(){
    if(previewCutoffTimer){
      clearTimeout(previewCutoffTimer);
      previewCutoffTimer=null;
    }
    if(!repertoireAudio||repertoireAudioData?.access_mode!=='preview_30'||repertoireAudio.paused)return;
    const remaining=Math.max(0,30-(Number(repertoireAudio.currentTime)||0));
    previewCutoffTimer=setTimeout(()=>{
      if(!repertoireAudio)return;
      if((Number(repertoireAudio.currentTime)||0)>=29.8){
        playAdjacent(1,{fromEnded:true});
      }
    },remaining*1000+120);
  }

  async function startTrack(songId,{source='songs',host=null}={}){
    const id=String(songId);
    const song=repertoire.get(id);
    if(!song||!song.has_demo)return;

    if(!songAccess(id)){
      openUnlockModal(id);
      return;
    }

    if(repertoireAudio&&repertoireAudioSongId===id){
      if(host)repertoireAudioHost=host;
      if(repertoireAudio.paused)await repertoireAudio.play();
      syncPlaybackUi();
      return;
    }

    const request=++repertoireRequest;
    const previousHost=repertoireAudioHost;
    if(repertoireAudio){
      try{
        repertoireAudio.pause();
        repertoireAudio.removeAttribute('src');
        repertoireAudio.load();
      }catch{}
    }
    repertoireAudio=null;
    repertoireAudioSongId='';
    repertoireAudioHost=null;
    repertoireAudioData=null;

    if(previousHost&&document.contains(previousHost)){
      delete previousHost.dataset.demoState;
      setTimeout(decorate,0);
    }

    let data=null;
    const prefetched=prefetchedTickets.get(id);

    if(prefetched){
      data=await Promise.resolve(prefetched);
      prefetchedTickets.delete(id);
    }else{
      const cached=cachedAudioTicket(id);
      if(cached){
        data={...cached,play_id:null,qualify_after_seconds:8};
      }else{
        data=await call('audio',{song_id:id,source:source==='jukebox'?'jukebox':'songs'});
        rememberAudioTicket(id,data);
      }
    }

    if(request!==repertoireRequest)return;

    const audioEl=new Audio(data.url);
    audioEl.preload='metadata';
    repertoireAudio=audioEl;
    repertoireAudioSongId=id;
    repertoireAudioHost=host;
    repertoireAudioData=data;
    repertoireAudioSource=source==='jukebox'?'jukebox':'songs';

    if(data.play_id){
      bindPlayCounter(audioEl,data,id,repertoireAudioSource);
    }else{
      call('start_play',{
        song_id:id,
        source:repertoireAudioSource
      }).then(playData=>{
        if(repertoireAudio!==audioEl)return;
        bindPlayCounter(audioEl,{...data,...playData},id,repertoireAudioSource);
      }).catch(err=>console.warn('Avvio conteggio ascolto',err));
    }

    const onSync=()=>{
      if(repertoireAudio!==audioEl)return;
      syncPlaybackUi();
      schedulePreviewCutoff();
    };

    audioEl.addEventListener('loadedmetadata',onSync);
    audioEl.addEventListener('durationchange',onSync);
    audioEl.addEventListener('timeupdate',onSync);
    audioEl.addEventListener('play',onSync);
    audioEl.addEventListener('pause',onSync);
    audioEl.addEventListener('ended',()=>{
      if(repertoireAudio!==audioEl)return;
      playAdjacent(1,{fromEnded:true});
    },{once:true});
    audioEl.addEventListener('error',()=>{
      if(repertoireAudio!==audioEl)return;
      stopRepertoireAudio({restore:true,hidePlayer:true});
      alert('Riproduzione demo non riuscita.');
    },{once:true});

    syncPlaybackUi();
    await audioEl.play();
    onSync();
  }

  async function playAdjacent(direction,{fromEnded=false}={}){
    const songs=playableSongs();
    if(!songs.length||(fromEnded&&songs.length===1)){
      if(fromEnded)stopRepertoireAudio({restore:true,hidePlayer:true});
      return;
    }

    const currentIndex=songs.findIndex(song=>String(song.id)===String(repertoireAudioSongId));
    let nextIndex=0;

    if(playerShuffle&&songs.length>1){
      do{
        nextIndex=Math.floor(Math.random()*songs.length);
      }while(nextIndex===currentIndex);
    }else if(currentIndex>=0){
      nextIndex=(currentIndex+direction+songs.length)%songs.length;
    }

    const next=songs[nextIndex];
    if(!next)return;
    await startTrack(next.id,{source:repertoireAudioSource||'songs'});
  }

  async function playDemo(songId,button){
    const host=button.closest('.repertoire-player')||button.parentElement;
    button.disabled=true;
    const old=button.textContent;
    button.textContent='CARICAMENTO…';

    try{
      await startTrack(songId,{source:'songs',host});
    }catch(err){
      if(err.status===403){
        access={allowed:false,reason:'locked'};
        decorate();
        openUnlockModal(songId);
      }else{
        button.disabled=false;
        button.textContent=old;
        alert(err.message||'Demo non disponibile.');
      }
    }
  }

  let jukeboxClosing=false;

  function ensureJukeboxLauncher(){
    const toolbar=document.querySelector('.repertoire-toolbar');
    if(!toolbar)return;
    let btn=document.getElementById('openJukeboxMode');
    if(!btn){
      btn=document.createElement('button');
      btn.id='openJukeboxMode';
      btn.type='button';
      btn.className='btn btn-primary jukebox-launch';
      btn.textContent='MODALITÀ JUKEBOX';
      btn.addEventListener('click',openJukebox);
      toolbar.appendChild(btn);
    }
  }

  function jukeboxColumns(){
    return window.innerWidth<720?1:2;
  }

  function renderJukebox(){
    const overlay=document.getElementById('jukeboxOverlay');
    const grid=document.getElementById('jukeboxGrid');
    if(!overlay||!grid)return;

    const songs=[...repertoire.values()]
      .sort((a,b)=>String(a.title||'').localeCompare(String(b.title||''),'it',{sensitivity:'base'}));

    const cols=jukeboxColumns();
    const rows=Math.max(1,Math.ceil(songs.length/cols));
    grid.style.setProperty('--jukebox-cols',String(cols));
    grid.style.setProperty('--jukebox-rows',String(rows));

    grid.innerHTML=songs.map((song,index)=>{
      const id=String(song.id);
      const label=publicMediaUrl(song.jukebox_label_path);
      const hasAudio=!!song.has_demo;
      const mode=songAccess(id);
      const number=String(index+1).padStart(2,'0');
      const active=id===String(repertoireAudioSongId)&&repertoireAudio&&!repertoireAudio.paused;
      return `<article class="jukebox-slot${active?' is-playing':''}${hasAudio?'':' is-unavailable'}" data-jukebox-song="${esc(id)}">
        <div class="jukebox-number">${number}</div>
        <div class="jukebox-push-wrap">
          <button class="jukebox-push${active?' is-playing':''}" type="button" data-jukebox-push="${esc(id)}" ${hasAudio?'':'disabled'} aria-label="${hasAudio?`${mode?'Riproduci':'Sblocca'} ${esc(song.title)}`:`Audio non disponibile per ${esc(song.title)}`}">
            <span class="jukebox-lamp${active?' on':''}"></span>
          </button>
        </div>
        <div class="jukebox-label" aria-label="${esc(song.title)}">
          ${label
            ? `<img src="${esc(label)}" alt="Etichetta ${esc(song.title)}" draggable="false">`
            : `<div class="jukebox-label-empty">ETICHETTA DA CARICARE</div>`}
        </div>
      </article>`;
    }).join('');

    grid.querySelectorAll('[data-jukebox-push]').forEach(button=>{
      button.addEventListener('click',e=>{
        e.preventDefault();
        e.stopPropagation();
        toggleJukeboxSong(button.dataset.jukeboxPush,button);
      });
    });

    syncJukeboxPlaybackUi();
  }

  function setJukeboxNow(text=''){
    const el=document.getElementById('jukeboxNowPlaying');
    if(el)el.textContent=text||'SELEZIONA UN BRANO';
  }

  async function toggleJukeboxSong(songId,button){
    const id=String(songId);
    const song=repertoire.get(id);
    if(!song||!song.has_demo)return;

    if(!songAccess(id)){
      openUnlockModal(id);
      return;
    }

    if(repertoireAudio&&repertoireAudioSongId===id){
      if(repertoireAudio.paused)await repertoireAudio.play().catch(()=>{});
      else repertoireAudio.pause();
      syncPlaybackUi();
      return;
    }

    button.classList.add('is-loading');
    setJukeboxNow(`CARICAMENTO · ${song.title}`);

    try{
      await startTrack(id,{source:'jukebox'});
      syncPlaybackUi();
    }catch(err){
      button.classList.remove('is-loading');
      if(err.status===403){
        access={allowed:false,reason:'locked'};
        openUnlockModal(id);
      }else{
        alert(err.message||'Demo non disponibile.');
      }
      setJukeboxNow('');
    }
  }

  async function openJukebox(){
    ensureStyles();
    let overlay=document.getElementById('jukeboxOverlay');

    if(!overlay){
      overlay=document.createElement('section');
      overlay.id='jukeboxOverlay';
      overlay.className='jukebox-overlay';
      overlay.setAttribute('aria-label','Jukebox del repertorio');
      overlay.innerHTML=`
        <header class="jukebox-topbar">
          <div class="jukebox-brand"><strong>JOHN & I MOLESTI · JUKEBOX</strong><span>PREMI IL PULSANTE DEL BRANO · RIPREMI PER PAUSA / RIPRENDI</span></div>
          <div class="jukebox-now" id="jukeboxNowPlaying">SELEZIONA UN BRANO</div>
          <button class="jukebox-close" id="closeJukeboxMode" type="button" aria-label="Chiudi Jukebox">×</button>
        </header>
        <div class="jukebox-shell">
          <div class="jukebox-grid" id="jukeboxGrid"></div>
          <div class="jukebox-hint">LE ETICHETTE SONO CARICATE DAL CATALOGO</div>
        </div>`;
      document.body.appendChild(overlay);
      document.getElementById('closeJukeboxMode').onclick=closeJukebox;
    }

    renderJukebox();
    overlay.classList.add('open');
    syncJukeboxPlaybackUi();
    document.documentElement.style.overflow='hidden';

    try{
      if(!document.fullscreenElement&&overlay.requestFullscreen){
        await overlay.requestFullscreen();
      }
    }catch{
      // Il fixed overlay resta comunque a tutto schermo.
    }
  }

  async function closeJukebox(){
    if(jukeboxClosing)return;
    jukeboxClosing=true;

    const overlay=document.getElementById('jukeboxOverlay');
    overlay?.classList.remove('open');

    try{
      if(document.fullscreenElement)await document.exitFullscreen();
    }catch{}

    document.documentElement.style.removeProperty('overflow');
    jukeboxClosing=false;
  }

  window.addEventListener('resize',()=>{
    if(document.getElementById('jukeboxOverlay')?.classList.contains('open'))renderJukebox();
  });

  document.addEventListener('fullscreenchange',()=>{
    const overlay=document.getElementById('jukeboxOverlay');
    if(!overlay?.classList.contains('open')||jukeboxClosing)return;
    if(!document.fullscreenElement)closeJukebox();
  });

  function decorate(){
    ensureStyles();
    ensureUnlockBox();
    ensureJukeboxLauncher();

    document.querySelectorAll('#repertoireGrid [data-repertoire-song]').forEach(card=>{
      const id=String(card.dataset.repertoireSong||'');
      const song=repertoire.get(id);
      if(!song)return;

      const host=card.querySelector('.repertoire-player');
      if(!host)return;

      // Se questo è il brano attivo, ricostruiamo il controllo della card
      // collegandolo alla stessa istanza audio globale, anche dopo un cambio tab.
      if(repertoireAudio&&repertoireAudioSongId===id){
        renderInlinePlayer(host,id);
        return;
      }

      // Spotify resta pubblico e ha priorità quando il brano non è già
      // in riproduzione nel player interno.
      if(song.spotify_url){
        host.dataset.demoState='spotify';
        return;
      }

      if(!song.has_demo){
        if(host.dataset.demoState!=='missing'){
          host.innerHTML='<span class="repertoire-audio-missing">Audio in arrivo</span>';
          host.dataset.demoState='missing';
        }
        return;
      }

      const mode=songAccess(id);
      const desiredState=mode?`play:${mode}`:'locked';

      if(host.dataset.demoState===desiredState)return;

      if(mode){
        host.innerHTML=`<button class="btn btn-primary demo-player-button" type="button">${mode==='preview_30'?'▶ ANTEPRIMA 30S':'▶ ASCOLTA DEMO'}</button>`;
        const playButton=host.querySelector('button');
        playButton.onclick=e=>{
          e.preventDefault();
          e.stopPropagation();
          playDemo(id,e.currentTarget);
        };
        playButton.addEventListener('pointerenter',()=>{prefetchTrack(id,{source:'songs'}).catch(()=>{})},{once:true});
        playButton.addEventListener('touchstart',()=>{prefetchTrack(id,{source:'songs'}).catch(()=>{})},{passive:true,once:true});
      }else{
        host.innerHTML=`
          <button class="btn btn-ghost demo-player-button" type="button">RICHIEDI / CODICE</button>
          <span class="demo-lock-note">Sblocco singolo, bundle o completo.</span>`;
        host.querySelector('button').onclick=e=>{
          e.preventDefault();
          e.stopPropagation();
          openUnlockModal(id);
        };
      }

      host.dataset.demoState=desiredState;
    });

    if(document.getElementById('jukeboxOverlay')?.classList.contains('open')){
      renderJukebox();
    }
  }

  async function refresh({reloadStatus=true}={}){
    clearTimeout(refreshTimer);
    refreshTimer=setTimeout(async()=>{
      if(reloadStatus)await Promise.all([loadRepertoire(),loadStatus()]);
      else await loadRepertoire();
      if(reloadStatus)await checkPendingRequests();
      ensureJukeboxLauncher();
      decorate();
    },30);
  }

  function boot(){
    if(!sb)return;

    const start=()=>{
      if(document.documentElement.dataset.jmAudioStarted==='1')return;
      document.documentElement.dataset.jmAudioStarted='1';

      ensureStyles();

      let lateUiObserver=null;

      const bindWhenReady=()=>{
        const toolbar=document.querySelector('.repertoire-toolbar');
        const grid=document.getElementById('repertoireGrid');
        if(!toolbar||!grid)return false;

        ensureJukeboxLauncher();
        refresh({reloadStatus:true});

        if(lateUiObserver){
          lateUiObserver.disconnect();
          lateUiObserver=null;
        }
        return true;
      };

      if(!bindWhenReady()){
        lateUiObserver=new MutationObserver(()=>{ bindWhenReady(); });
        lateUiObserver.observe(document.body,{childList:true,subtree:true});
      }

      window.addEventListener('jm:repertoire-rendered',()=>{
        ensureJukeboxLauncher();
        refresh({reloadStatus:false});
      });

      const user=document.getElementById('userEntry');
      if(user){
        new MutationObserver(()=>refresh({reloadStatus:true})).observe(user,{
          attributes:true,childList:true,subtree:true
        });
      }

      sb.auth.onAuthStateChange(()=>refresh({reloadStatus:true}));
      setInterval(()=>checkPendingRequests(),30000);

      window.addEventListener('hashchange',()=>{
        if(location.hash.startsWith('#/repertoire')){
          if(!bindWhenReady())refresh({reloadStatus:true});
        }
      });
    };

    if(document.documentElement.classList.contains('jm-public-data-ready'))start();
    else window.addEventListener('jm:public-data-ready',start,{once:true});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
