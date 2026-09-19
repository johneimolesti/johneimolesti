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
    if(!sb)return;
    const {data,error}=await sb.rpc('get_public_repertoire');
    if(error){
      console.warn('Demo repertoire',error);
      return;
    }
    repertoire=new Map((data||[]).map(song=>[String(song.id),song]));
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
            reason:'member',
            member:{
              id:profile.id,
              name:profile.display_name||profile.username||'Membro'
            }
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
    if(access.reason==='member')return 'Accesso demo: membro band';
    if(access.reason==='certified_attendance')return 'Accesso demo sbloccato dalla presenza certificata';
    if(access.reason==='code')return 'Accesso demo sbloccato con codice';
    return 'Demo riservate';
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

    if(access.allowed){
      box.innerHTML=`<span class="demo-access-ok">✓ ${esc(accessLabel())}</span>`;
    }else{
      box.innerHTML=`
        <div>
          <strong>DEMO AUDIO</strong>
          <span>Disponibili a membri della band, fan con almeno una presenza certificata o tramite codice di sblocco.</span>
        </div>
        <button class="btn btn-ghost" id="openDemoUnlock" type="button">HO UN CODICE</button>`;
      document.getElementById('openDemoUnlock')?.addEventListener('click',openUnlockModal);
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
      .demo-audio-player{width:100%;height:34px}
      .demo-lock-note{display:block;margin-top:5px;font-size:10px;color:var(--muted);line-height:1.3}
      .demo-unlock-modal-card{width:min(430px,calc(100vw - 24px))}
      .demo-unlock-form{display:grid;gap:12px}.demo-unlock-form label{display:grid;gap:5px;font-size:12px;font-weight:800}
      .demo-unlock-form input{width:100%;padding:11px;border:2px solid #777568;background:#171717;color:#fff;font:800 15px/1 monospace;text-transform:uppercase;letter-spacing:.08em}
      .demo-unlock-status{min-height:18px;color:var(--muted);font-size:11px}

      .jukebox-launch{margin-left:auto;min-width:170px}
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

  function openUnlockModal(){
    let modal=document.getElementById('demoUnlockModal');
    if(!modal){
      modal=document.createElement('div');
      modal.id='demoUnlockModal';
      modal.className='modal';
      modal.hidden=true;
      modal.innerHTML=`
        <div class="modal-backdrop"></div>
        <section class="modal-card demo-unlock-modal-card" role="dialog" aria-modal="true" aria-labelledby="demoUnlockTitle">
          <header class="modal-head">
            <div><span class="section-kicker">DEMO AUDIO</span><h2 id="demoUnlockTitle">Inserisci il codice</h2></div>
            <button class="modal-close" type="button" aria-label="Chiudi">×</button>
          </header>
          <form class="modal-body demo-unlock-form">
            <label>CODICE DI SBLOCCO
              <input id="demoUnlockCode" maxlength="64" autocomplete="off" spellcheck="false" placeholder="MOLESTI-XXXX">
            </label>
            <span class="demo-unlock-status" id="demoUnlockStatus"></span>
            <button class="btn btn-primary" type="submit">SBLOCCA LE DEMO</button>
          </form>
        </section>`;
      document.body.appendChild(modal);
      const close=()=>{
        modal.hidden=true;
        if(!document.querySelector('.modal:not([hidden])'))document.documentElement.style.removeProperty('overflow');
      };
      modal.querySelector('.modal-close').onclick=close;
      modal.querySelector('.modal-backdrop').onclick=close;
      modal.querySelector('form').onsubmit=async e=>{
        e.preventDefault();
        const input=document.getElementById('demoUnlockCode');
        const status=document.getElementById('demoUnlockStatus');
        const btn=e.currentTarget.querySelector('button[type="submit"]');
        const code=input.value.trim();
        if(!code){status.textContent='Inserisci il codice.';return}
        btn.disabled=true;status.textContent='Verifica…';
        try{
          await call('redeem',{code});
          await loadStatus();
          status.textContent='Demo sbloccate.';
          setTimeout(close,450);
          decorate();
        }catch(err){
          status.textContent=err.message||'Codice non valido.';
        }finally{
          btn.disabled=false;
        }
      };
    }
    modal.hidden=false;
    document.documentElement.style.overflow='hidden';
    setTimeout(()=>document.getElementById('demoUnlockCode')?.focus(),0);
  }

  async function playDemo(songId,button){
    const host=button.closest('.repertoire-player')||button.parentElement;
    button.disabled=true;
    const old=button.textContent;
    button.textContent='CARICAMENTO…';
    try{
      const data=await call('audio',{song_id:songId});
      const audio=document.createElement('audio');
      audio.className='demo-audio-player';
      audio.controls=true;
      audio.preload='none';
      audio.controlsList='nodownload';
      audio.src=data.url;
      host.replaceChildren(audio);
      try{await audio.play()}catch{}
    }catch(err){
      if(err.status===403){
        access={allowed:false,reason:'locked'};
        decorate();
        openUnlockModal();
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
      const canPlay=!!song.has_demo;
      const number=String(index+1).padStart(2,'0');
      const active=id===jukeboxSongId&&jukeboxAudio&&!jukeboxAudio.paused;
      return `<article class="jukebox-slot${active?' is-playing':''}${canPlay?'':' is-unavailable'}" data-jukebox-song="${esc(id)}">
        <div class="jukebox-number">${number}</div>
        <div class="jukebox-push-wrap">
          <button class="jukebox-push${active?' is-playing':''}" type="button" data-jukebox-push="${esc(id)}" ${canPlay?'':'disabled'} aria-label="${canPlay?`Riproduci ${esc(song.title)}`:`Audio non disponibile per ${esc(song.title)}`}">
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

    if(!access.allowed){
      openUnlockModal();
      return;
    }

    stopJukeboxSong();
    const request=++jukeboxRequest;
    const slot=button.closest('.jukebox-slot');
    button.classList.add('is-loading');
    setJukeboxNow(`CARICAMENTO · ${song.title}`);

    try{
      const data=await call('audio',{song_id:songId});
      if(request!==jukeboxRequest)return;

      jukeboxAudio=new Audio(data.url);
      jukeboxAudio.preload='auto';
      jukeboxAudio.controls=false;
      jukeboxSongId=String(songId);

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
      if(song.spotify_url)return;

      if(!song.has_demo){
        host.innerHTML='<span class="repertoire-audio-missing">Audio in arrivo</span>';
        return;
      }

      if(access.allowed){
        host.innerHTML=`<button class="btn btn-primary demo-player-button" type="button">▶ ASCOLTA DEMO</button>`;
        host.querySelector('button').onclick=e=>{
          e.stopPropagation();
          playDemo(id,e.currentTarget);
        };
      }else{
        host.innerHTML=`
          <button class="btn btn-ghost demo-player-button" type="button">SBLOCCA DEMO</button>
          <span class="demo-lock-note">Presenza certificata oppure codice richiesto.</span>`;
        host.querySelector('button').onclick=e=>{
          e.stopPropagation();
          openUnlockModal();
        };
      }
    });

    if(document.getElementById('jukeboxOverlay')?.classList.contains('open')){
      renderJukebox();
    }
  }

  async function refresh(){
    clearTimeout(refreshTimer);
    refreshTimer=setTimeout(async()=>{
      await Promise.all([loadRepertoire(),loadStatus()]);
      decorate();
    },30);
  }

  function boot(){
    if(!sb)return;
    ensureStyles();
    refresh();

    const grid=document.getElementById('repertoireGrid');
    if(grid){
      new MutationObserver(()=>decorate()).observe(grid,{childList:true,subtree:true});
    }

    const user=document.getElementById('userEntry');
    if(user){
      new MutationObserver(()=>refresh()).observe(user,{
        attributes:true,childList:true,subtree:true
      });
    }

    sb.auth.onAuthStateChange(()=>refresh());
    window.addEventListener('hashchange',()=>{
      if(location.hash.startsWith('#/repertoire'))refresh();
    });
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
