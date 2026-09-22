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
    if(!sb)return false;
    let lastError=null;
    for(let attempt=0;attempt<3;attempt++){
      try{
        const {data,error}=await sb.rpc('get_public_repertoire');
        if(error)throw error;
        repertoire=new Map((data||[]).map(song=>[String(song.id),song]));
        return true;
      }catch(err){
        lastError=err;
        if(attempt<2)await new Promise(resolve=>setTimeout(resolve,250*(attempt+1)));
      }
    }
    console.warn('Demo repertoire',lastError);
    return false;
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
  }

  function stopRepertoireAudio({restore=true}={}){
    const host=repertoireAudioHost;
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
    if(restore&&host&&document.contains(host))setTimeout(decorate,0);
  }

  async function playDemo(songId,button){
    const host=button.closest('.repertoire-player')||button.parentElement;
    button.disabled=true;
    const old=button.textContent;
    button.textContent='CARICAMENTO…';

    try{
      const data=await call('audio',{song_id:songId,source:'songs'});

      // Una sola demo alla volta nel repertorio.
      stopRepertoireAudio({restore:true});

      const audioEl=new Audio(data.url);
      audioEl.preload='metadata';
      repertoireAudio=audioEl;
      repertoireAudioSongId=String(songId);
      repertoireAudioHost=host;
      bindPlayCounter(audioEl,data,songId,'songs');

      const wrap=document.createElement('div');
      wrap.className='demo-site-player';
      wrap.innerHTML=`
        <div class="demo-site-player-actions">
          <button class="btn btn-primary" type="button" data-demo-toggle>❚❚ PAUSA</button>
          <button class="btn btn-ghost" type="button" data-demo-stop>■ STOP</button>
        </div>
        <div class="demo-site-progress" aria-hidden="true"><span></span></div>
        <div class="demo-site-player-meta">
          <strong>${data.access_mode==='preview_30'?'ANTEPRIMA 30S':'BRANO INTERO'}</strong>
          <span data-demo-time>0:00 / --:--</span>
        </div>`;
      host.replaceChildren(wrap);

      const toggle=wrap.querySelector('[data-demo-toggle]');
      const stop=wrap.querySelector('[data-demo-stop]');
      const progress=wrap.querySelector('.demo-site-progress>span');
      const time=wrap.querySelector('[data-demo-time]');

      const sync=()=>{
        if(repertoireAudio!==audioEl)return;
        const duration=Number.isFinite(audioEl.duration)?audioEl.duration:0;
        const current=Number.isFinite(audioEl.currentTime)?audioEl.currentTime:0;
        const percent=duration>0?Math.max(0,Math.min(100,current/duration*100)):0;
        progress.style.width=percent+'%';
        time.textContent=`${formatDemoTime(current)} / ${duration?formatDemoTime(duration):'--:--'}`;
        toggle.textContent=audioEl.paused?'▶ RIPRENDI':'❚❚ PAUSA';
      };

      toggle.onclick=e=>{
        e.preventDefault();
        e.stopPropagation();
        if(audioEl.paused)audioEl.play().catch(()=>{});
        else audioEl.pause();
        sync();
      };

      stop.onclick=e=>{
        e.preventDefault();
        e.stopPropagation();
        stopRepertoireAudio({restore:true});
      };

      audioEl.addEventListener('loadedmetadata',sync);
      audioEl.addEventListener('timeupdate',sync);
      audioEl.addEventListener('play',sync);
      audioEl.addEventListener('pause',sync);
      audioEl.addEventListener('ended',()=>stopRepertoireAudio({restore:true}),{once:true});
      audioEl.addEventListener('error',()=>{
        if(repertoireAudio===audioEl){
          stopRepertoireAudio({restore:true});
          alert('Riproduzione demo non riuscita.');
        }
      },{once:true});

      await audioEl.play();
      sync();
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


  let jukeboxAudio=null;
  let jukeboxSongId='';
  let jukeboxRequest=0;
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
      const active=id===jukeboxSongId&&jukeboxAudio&&!jukeboxAudio.paused;
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
  }

  function setJukeboxNow(text=''){
    const el=document.getElementById('jukeboxNowPlaying');
    if(el)el.textContent=text||'SELEZIONA UN BRANO';
  }

  function resetJukeboxVisual(id){
    if(!id)return;
    const slot=document.querySelector(`[data-jukebox-song="${CSS.escape(String(id))}"]`);
    slot?.classList.remove('is-playing');
    const button=slot?.querySelector('.jukebox-push');
    button?.classList.remove('is-playing','is-loading');
    button?.querySelector('.jukebox-lamp')?.classList.remove('on');
  }

  function stopJukeboxSong(){
    jukeboxRequest++;
    if(jukeboxAudio){
      try{
        jukeboxAudio.pause();
        jukeboxAudio.currentTime=0;
        jukeboxAudio.removeAttribute('src');
        jukeboxAudio.load();
      }catch{}
    }
    resetJukeboxVisual(jukeboxSongId);
    jukeboxSongId='';
    setJukeboxNow('');
  }

  async function toggleJukeboxSong(songId,button){
    const song=repertoire.get(String(songId));
    if(!song||!song.has_demo)return;

    if(jukeboxSongId===String(songId)&&jukeboxAudio&&!jukeboxAudio.paused){
      stopJukeboxSong();
      return;
    }

    if(!songAccess(songId)){
      openUnlockModal(songId);
      return;
    }

    stopJukeboxSong();
    const request=++jukeboxRequest;
    const slot=button.closest('.jukebox-slot');
    button.classList.add('is-loading');
    setJukeboxNow(`CARICAMENTO · ${song.title}`);

    try{
      const data=await call('audio',{song_id:songId,source:'jukebox'});
      if(request!==jukeboxRequest)return;

      jukeboxAudio=new Audio(data.url);
      jukeboxAudio.preload='auto';
      jukeboxAudio.controls=false;
      jukeboxSongId=String(songId);
      bindPlayCounter(jukeboxAudio,data,songId,'jukebox');

      const release=()=>{
        if(jukeboxSongId!==String(songId))return;
        resetJukeboxVisual(songId);
        jukeboxSongId='';
        setJukeboxNow('');
      };

      jukeboxAudio.addEventListener('ended',release,{once:true});
      jukeboxAudio.addEventListener('error',()=>{
        release();
        alert('Riproduzione demo non riuscita.');
      },{once:true});

      await jukeboxAudio.play();
      if(request!==jukeboxRequest){
        stopJukeboxSong();
        return;
      }

      button.classList.remove('is-loading');
      button.classList.add('is-playing');
      button.querySelector('.jukebox-lamp')?.classList.add('on');
      slot?.classList.add('is-playing');
      setJukeboxNow(`IN RIPRODUZIONE · ${song.title}`);
    }catch(err){
      button.classList.remove('is-loading');
      if(err.status===403){
        access={allowed:false,reason:'locked'};
        openUnlockModal();
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
          <div class="jukebox-brand"><strong>JOHN & I MOLESTI · JUKEBOX</strong><span>PREMI IL PULSANTE DEL BRANO · RIPREMI PER FERMARE</span></div>
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
    stopJukeboxSong();

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

      // Spotify resta pubblico e ha priorità.
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

      // Se il player custom sta riproducendo proprio questo brano,
      // non sostituirlo durante refresh/session update.
      if(
        repertoireAudio &&
        repertoireAudioSongId===id &&
        repertoireAudioHost===host
      ){
        host.dataset.demoState='playing';
        return;
      }

      if(host.dataset.demoState===desiredState)return;

      if(mode){
        host.innerHTML=`<button class="btn btn-primary demo-player-button" type="button">${mode==='preview_30'?'▶ ANTEPRIMA 30S':'▶ ASCOLTA DEMO'}</button>`;
        host.querySelector('button').onclick=e=>{
          e.preventDefault();
          e.stopPropagation();
          playDemo(id,e.currentTarget);
        };
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

  async function refresh(){
    clearTimeout(refreshTimer);
    refreshTimer=setTimeout(async()=>{
      await Promise.all([loadRepertoire(),loadStatus()]);
      await checkPendingRequests();
      ensureJukeboxLauncher();
      decorate();
    },30);
  }

  function boot(){
    if(!sb)return;
    ensureStyles();

    let lateUiObserver=null;

    const bindWhenReady=()=>{
      const toolbar=document.querySelector('.repertoire-toolbar');
      const grid=document.getElementById('repertoireGrid');

      if(!toolbar||!grid)return false;

      ensureJukeboxLauncher();
      refresh();

      if(lateUiObserver){
        lateUiObserver.disconnect();
        lateUiObserver=null;
      }
      return true;
    };

    // public.js crea la sezione Repertorio dinamicamente.
    // Se non esiste ancora, aspettiamo solo finché compare.
    if(!bindWhenReady()){
      lateUiObserver=new MutationObserver(()=>{
        bindWhenReady();
      });
      lateUiObserver.observe(document.body,{childList:true,subtree:true});
    }

    // Ogni ricerca/rerender del catalogo segnala esplicitamente che le card
    // sono state ricostruite: riapplichiamo play/sblocco e manteniamo Jukebox.
    window.addEventListener('jm:repertoire-rendered',()=>{
      ensureJukeboxLauncher();
      refresh();
    });

    const user=document.getElementById('userEntry');
    if(user){
      new MutationObserver(()=>refresh()).observe(user,{
        attributes:true,childList:true,subtree:true
      });
    }

    sb.auth.onAuthStateChange(()=>refresh());
    setInterval(()=>checkPendingRequests(),30000);

    window.addEventListener('hashchange',()=>{
      if(location.hash.startsWith('#/repertoire')){
        if(!bindWhenReady())refresh();
      }
    });
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
