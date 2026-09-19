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

  function decorate(){
    ensureStyles();
    ensureUnlockBox();

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
