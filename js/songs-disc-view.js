(() => {
  'use strict';

  const STORAGE_KEY = 'jm_songs_view';
  const VIEW_LIST = 'list';
  const VIEW_DISCS = 'discs';

  const SUPABASE_URL = 'https://etzwybamvfpeitkttwrc.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_CtyexwjoW375UXpjInOuDA_Uz28wWJx';
  const FAN_API = `${SUPABASE_URL}/functions/v1/fan-api`;
  const PENDING_VOTE_KEY = 'jm_pending_simple_vote';

  let sb = null;
  let songs = new Map();
  let songsByTitle = new Map();
  let songDetails = new Map();
  let songsLoading = null;
  let gridObserver = null;
  let playerSyncTimer = null;
  let currentDetailSongId = '';
  let voteResumeTimer = null;
  let catalogVoteCache = null;

  function esc(value) {
    return String(value ?? '').replace(/[&<>'"]/g, ch => ({
      '&':'&amp;',
      '<':'&lt;',
      '>':'&gt;',
      "'":'&#39;',
      '"':'&quot;'
    }[ch]));
  }

  function normalizeTitle(value) {
    return String(value || '')
      .trim()
      .replace(/\s+/g, ' ')
      .toLocaleLowerCase('it');
  }


  function fanDeviceToken() {
    let token=localStorage.getItem('jm_fan_device_token');
    if(!token){
      token=crypto.randomUUID();
      localStorage.setItem('jm_fan_device_token',token);
    }
    return token;
  }

  async function fanApi(action,payload={}) {
    const res=await fetch(FAN_API,{
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'apikey':SUPABASE_KEY,
        'Authorization':`Bearer ${SUPABASE_KEY}`
      },
      body:JSON.stringify({action,device_token:fanDeviceToken(),...payload})
    });
    let data={};
    try{data=await res.json()}catch{}
    if(!res.ok)throw new Error(data.error||`fan-api HTTP ${res.status}`);
    return data;
  }

  function isFanLogged() {
    return document.getElementById('userEntry')?.classList.contains('is-fan')===true;
  }

  function isMemberLogged() {
    return document.getElementById('userEntry')?.classList.contains('is-member')===true;
  }

  function voteLabel(value) {
    const n=Number(value);
    return Number.isFinite(n)?String(n).replace('.',','):'—';
  }

  function ensureVoteStyles() {
    if(document.getElementById('jmSimpleVoteStyles'))return;
    const style=document.createElement('style');
    style.id='jmSimpleVoteStyles';
    style.textContent=`
      .jm-inline-vote{
        appearance:none;display:inline-flex;align-items:center;justify-content:center;
        min-height:24px;padding:5px 8px;border:1px solid var(--gold,#eee52b);
        background:var(--gold,#eee52b);color:#111;box-shadow:2px 2px 0 #5f5924;
        font:900 8px/1 monospace;letter-spacing:.05em;cursor:pointer;text-transform:uppercase
      }
      .repertoire-player .jm-inline-vote{margin-top:7px;width:100%}
      .song-cd-page-actions .jm-inline-vote{min-height:31px;padding:7px 11px}
      .jm-inline-vote.disc-cover-vote{display:none!important}
      .jm-inline-vote.song-list-vote{
        display:inline-flex;
        margin-top:8px;
        min-height:26px;
        padding:5px 10px;
      }
      .repertoire-grid.repertoire-discs-view .jm-inline-vote.song-list-vote{
        display:none!important;
      }
      .repertoire-grid.repertoire-discs-view .jm-inline-vote.disc-cover-vote{
        display:inline-flex!important;
        min-height:26px;
        width:max-content;
        min-width:64px;
        margin:0 auto;
        padding:5px 9px;
        font-size:8px;
      }
      #jmSimpleVoteModal[hidden]{display:none!important}
      #jmSimpleVoteModal{position:fixed;inset:0;z-index:2147483600;display:grid;place-items:center;padding:14px}
      .jm-vote-backdrop{position:absolute;inset:0;border:0;background:rgba(0,0,0,.84);backdrop-filter:blur(7px)}
      .jm-vote-card{position:relative;z-index:1;width:min(520px,100%);border:2px solid #777568;background:#161615;color:#f2eee3;box-shadow:8px 8px 0 #66364f}
      .jm-vote-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:16px 17px;border-bottom:2px solid #777568;background:#272717}
      .jm-vote-head small{display:block;color:var(--gold,#eee52b);font:900 9px/1 monospace;letter-spacing:.1em}
      .jm-vote-head h2{margin:5px 0 0;font:900 clamp(23px,6vw,34px)/1 Impact,'Arial Narrow',sans-serif;text-transform:uppercase}
      .jm-vote-close{width:34px;height:34px;border:2px solid var(--gold,#eee52b);background:#111;color:var(--gold,#eee52b);font:900 23px/1 sans-serif;cursor:pointer}
      .jm-vote-body{padding:17px}
      .jm-vote-current{min-height:18px;margin-bottom:12px;color:var(--gold,#eee52b);font:900 11px/1.35 monospace}
      .jm-vote-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px}
      .jm-vote-key{min-height:46px;border:2px solid #6f6c60;background:#222;color:#f4f1e6;font:900 16px/1 monospace;cursor:pointer}
      .jm-vote-key.half{border-style:dashed;color:#d2c971;font-size:13px}
      .jm-vote-key.selected{border-color:var(--gold,#eee52b);background:var(--gold,#eee52b);color:#111;box-shadow:2px 2px 0 #5f5924}
      .jm-vote-key:disabled{opacity:.45;cursor:wait}
      .jm-vote-status{min-height:20px;margin-top:12px;color:#bbb;font:700 10px/1.4 monospace}
      .jm-vote-status.ok{color:#bfe0ae}.jm-vote-status.error{color:#ffadb5}
      @media(max-width:520px){.jm-vote-grid{gap:4px}.jm-vote-key{min-height:43px}.jm-vote-card{box-shadow:4px 4px 0 #66364f}}
    `;
    document.head.appendChild(style);
  }

  function ensureVoteModal() {
    let modal=document.getElementById('jmSimpleVoteModal');
    if(modal)return modal;
    const values=[];
    for(let n=1;n<=10;n++){values.push(n);if(n<10)values.push(n+.5)}
    modal=document.createElement('section');
    modal.id='jmSimpleVoteModal';
    modal.hidden=true;
    modal.setAttribute('role','dialog');
    modal.setAttribute('aria-modal','true');
    modal.innerHTML=`
      <button class="jm-vote-backdrop" type="button" data-jm-vote-close aria-label="Chiudi"></button>
      <article class="jm-vote-card">
        <header class="jm-vote-head"><div><small data-jm-vote-kicker>VOTA IL BRANO</small><h2 data-jm-vote-title>BRANO</h2></div><button class="jm-vote-close" type="button" data-jm-vote-close>×</button></header>
        <div class="jm-vote-body">
          <div class="jm-vote-current" data-jm-vote-current></div>
          <div class="jm-vote-grid">${values.map(v=>`<button class="jm-vote-key${Number.isInteger(v)?'':' half'}" type="button" data-jm-vote-value="${v}">${voteLabel(v)}</button>`).join('')}</div>
          <div class="jm-vote-status" data-jm-vote-status role="status" aria-live="polite"></div>
        </div>
      </article>`;
    document.body.appendChild(modal);
    modal.querySelectorAll('[data-jm-vote-close]').forEach(b=>b.onclick=()=>{modal.hidden=true});
    modal.querySelector('.jm-vote-grid').addEventListener('click',e=>{
      const b=e.target.closest('[data-jm-vote-value]');
      if(b&&!b.disabled)saveSimpleVote(Number(b.dataset.jmVoteValue));
    });
    return modal;
  }

  function paintVote(value) {
    const modal=ensureVoteModal();
    const n=value==null?null:Number(value);
    modal.querySelectorAll('[data-jm-vote-value]').forEach(b=>{
      const on=n!=null&&Math.abs(Number(b.dataset.jmVoteValue)-n)<.001;
      b.classList.toggle('selected',on);
    });
    modal.querySelector('[data-jm-vote-current]').textContent=n==null?'NON HAI ANCORA VOTATO':`IL TUO VOTO: ${voteLabel(n)} / 10`;
  }

  function voteStatus(message,type='') {
    const el=ensureVoteModal().querySelector('[data-jm-vote-status]');
    el.textContent=message||'';
    el.className='jm-vote-status'+(type?` ${type}`:'');
  }

  function setVoteBusy(busy) {
    ensureVoteModal().querySelectorAll('[data-jm-vote-value]').forEach(b=>b.disabled=!!busy);
  }

  async function existingVote(kind,songId) {
    if(kind==='song'){
      if(!catalogVoteCache){
        const data=await fanApi('catalog');
        catalogVoteCache=new Map((data.songs||[]).map(r=>[String(r.id||r.song_id||''),r.my_vote?.molesti_score==null?null:Number(r.my_vote.molesti_score)]));
      }
      return catalogVoteCache.get(String(songId))??null;
    }
    const data=await fanApi('rankings');
    const row=(data.covers||[]).find(r=>String(r.song_id||'')===String(songId));
    return row?.my_score==null?null:Number(row.my_score);
  }

  async function prefillKnownFan() {
    try{
      const state=await fanApi('device_status');
      const input=document.getElementById('fanNameInput');
      const name=state?.fan?.nickname||state?.fan?.display_name||'';
      if(state?.recognized&&input&&!input.value.trim()&&name)input.value=name;
    }catch{}
  }

  function requestVoteLogin(kind,songId,title) {
    sessionStorage.setItem(PENDING_VOTE_KEY,JSON.stringify({kind,songId:String(songId),title:String(title||'')}));
    if(isMemberLogged()){
      document.getElementById('userEntry')?.click();
      alert('Per votare come fan, esci prima dall’area BAND.');
      return;
    }
    document.getElementById('userEntry')?.click();
    setTimeout(()=>{
      document.querySelector('#loginSwitch [data-login-mode="fan"]')?.click();
      prefillKnownFan().finally(()=>document.getElementById('fanNameInput')?.focus());
    },0);
    scheduleVoteResume();
  }

  function scheduleVoteResume() {
    clearTimeout(voteResumeTimer);
    let tries=0;
    const run=()=>{
      tries++;
      let pending=null;
      try{pending=JSON.parse(sessionStorage.getItem(PENDING_VOTE_KEY)||'null')}catch{}
      if(!pending)return;
      if(!isFanLogged()||!document.getElementById('userModal')?.hidden){
        if(tries<240)voteResumeTimer=setTimeout(run,150);
        return;
      }
      sessionStorage.removeItem(PENDING_VOTE_KEY);
      openSimpleVote(pending.kind,pending.songId,pending.title);
    };
    run();
  }

  async function openSimpleVote(kind,songId,title='') {
    const id=String(songId||'');
    if(!id)return;
    const song=songs.get(id);
    const resolvedTitle=title||song?.title||'BRANO';
    if(!isFanLogged()){requestVoteLogin(kind,id,resolvedTitle);return}
    const modal=ensureVoteModal();
    modal.dataset.kind=kind;
    modal.dataset.songId=id;
    modal.querySelector('[data-jm-vote-kicker]').textContent=kind==='cover'?'VOTA LA COVER ART':'VOTA IL BRANO';
    modal.querySelector('[data-jm-vote-title]').textContent=resolvedTitle;
    modal.hidden=false;
    paintVote(null);
    voteStatus('Caricamento del voto…');
    try{
      const current=await existingVote(kind,id);
      paintVote(current);
      voteStatus(current==null?'Scegli un voto da 1 a 10, anche a mezzi.':'Puoi modificare il voto in qualsiasi momento.');
    }catch(err){voteStatus(err.message||'Voto precedente non disponibile.','error')}
  }

  async function saveSimpleVote(value) {
    const modal=ensureVoteModal();
    const kind=modal.dataset.kind||'song';
    const songId=modal.dataset.songId||'';
    const n=Number(value);
    if(!songId||!Number.isFinite(n)||n<1||n>10||Math.round(n*2)!==n*2)return;
    setVoteBusy(true);voteStatus(`Salvataggio ${voteLabel(n)}…`);
    try{
      if(kind==='cover'){
        await fanApi('cover_art_vote',{song_id:songId,score:n});
      }else{
        await fanApi('catalog_vote',{song_id:songId,molesti_score:n,preserve_advanced:true});
        if(catalogVoteCache)catalogVoteCache.set(String(songId),n);
      }
      paintVote(n);voteStatus(`Voto ${voteLabel(n)} salvato ✓`,'ok');
      window.dispatchEvent(new CustomEvent('jm:ranking-refresh-request',{detail:{kind,song_id:songId}}));
      setTimeout(()=>{modal.hidden=true},350);
    }catch(err){voteStatus(err.message||'Salvataggio non riuscito.','error')}
    finally{setVoteBusy(false)}
  }

  function voteButton(kind,songId,title,label='VOTA') {
    const b=document.createElement('button');
    b.type='button';b.className='jm-inline-vote';
    b.dataset.jmVoteKind=kind;b.dataset.songId=String(songId||'');b.dataset.songTitle=String(title||'');
    b.textContent=label;
    return b;
  }

  function installVoteHandler() {
    window.addEventListener('click',e=>{
      const b=e.target?.closest?.('[data-jm-vote-kind]');
      if(!b)return;
      e.preventDefault();e.stopImmediatePropagation();
      openSimpleVote(b.dataset.jmVoteKind||'song',b.dataset.songId||'',b.dataset.songTitle||'');
    },true);
  }

  function formatDate(value) {
    if (!value) return '—';
    const [y,m,d] = String(value).slice(0,10).split('-');
    return [d,m,y].filter(Boolean).join('/');
  }

  function getView() {
    return localStorage.getItem(STORAGE_KEY) === VIEW_DISCS
      ? VIEW_DISCS
      : VIEW_LIST;
  }

  function setView(view) {
    localStorage.setItem(
      STORAGE_KEY,
      view === VIEW_DISCS ? VIEW_DISCS : VIEW_LIST
    );
    applyView();
  }

  function client() {
    if (sb) return sb;
    if (!window.supabase?.createClient) return null;

    sb = window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_KEY,
      {
        auth:{
          persistSession:false,
          autoRefreshToken:false,
          detectSessionInUrl:false
        }
      }
    );

    return sb;
  }

  function coverUrl(song) {
    const c = client();
    if (!c || !song?.cover_path) return '';

    try {
      return c.storage
        .from('concert-posters')
        .getPublicUrl(song.cover_path)
        .data
        .publicUrl || '';
    } catch {
      return '';
    }
  }

  function seedSongs(rows) {
    const list=Array.isArray(rows)?rows:[];
    const nextSongs=new Map();
    const nextByTitle=new Map();

    list.forEach(summary=>{
      const id=String(summary?.id||summary?.song_id||'');
      if(!id)return;
      const detailed=songDetails.get(id);
      const song=detailed?{...summary,...detailed}:{...summary};
      nextSongs.set(id,song);
      nextByTitle.set(normalizeTitle(song.title),song);
    });

    songs=nextSongs;
    songsByTitle=nextByTitle;
  }

  async function waitForPublicSongs() {
    if (Array.isArray(window.JM_PUBLIC_DATA?.songs)) {
      return window.JM_PUBLIC_DATA.songs;
    }

    await new Promise(resolve=>{
      window.addEventListener('jm:public-data-ready',resolve,{once:true});
    });

    return Array.isArray(window.JM_PUBLIC_DATA?.songs)
      ? window.JM_PUBLIC_DATA.songs
      : [];
  }

  async function loadSongs() {
    if (songsLoading) return songsLoading;

    songsLoading=(async()=>{
      const rows=await waitForPublicSongs();
      seedSongs(rows);
      decorateAll();
      decorateHitRows();
      refreshOpenDetail();
      return songs;
    })().finally(()=>{
      songsLoading=null;
    });

    return songsLoading;
  }

  async function loadSongDetail(songId,{force=false}={}) {
    const id=String(songId||'');
    if(!id)return null;

    await loadSongs();

    if(!force&&songDetails.has(id)){
      return songDetails.get(id);
    }

    const c=client();
    if(!c)return songs.get(id)||null;

    const {data,error}=await c.rpc('get_public_song_detail',{
      p_song_id:id
    });
    if(error)throw error;

    const row=Array.isArray(data)?data[0]:data;
    if(!row)return songs.get(id)||null;

    const merged={...(songs.get(id)||{}),...row};
    songDetails.set(id,merged);
    songs.set(id,merged);
    songsByTitle.set(normalizeTitle(merged.title),merged);

    const shared=window.JM_PUBLIC_DATA?.songs;
    if(Array.isArray(shared)){
      const index=shared.findIndex(item=>String(item?.id||item?.song_id||'')===id);
      if(index>=0){
        shared[index]={
          ...shared[index],
          weighted_play_count:merged.weighted_play_count,
          ranking_score:merged.ranking_score,
          ranking_position:merged.ranking_position
        };
      }
    }

    return merged;
  }

  function ensureStyles() {
    if (document.getElementById('jmSongsDiscViewStyles')) return;

    const style = document.createElement('style');
    style.id = 'jmSongsDiscViewStyles';
    style.textContent = `
      .repertoire-toolbar{
        flex-wrap:wrap;
      }

      .songs-view-switch{
        display:flex;
        align-items:center;
        gap:4px;
        margin-left:auto;
        border:1px solid #777568;
        padding:3px;
        background:#171717;
      }

      .songs-view-button{
        appearance:none;
        border:0;
        min-height:34px;
        padding:7px 10px;
        background:transparent;
        color:var(--muted);
        font:900 10px/1 monospace;
        letter-spacing:.06em;
        cursor:pointer;
      }

      .songs-view-button:hover,
      .songs-view-button.active{
        background:var(--gold);
        color:#171717;
      }

      .song-play-count{
        display:block;
        margin-top:5px;
        color:var(--gold);
        font:900 9px/1.15 monospace;
        letter-spacing:.045em;
      }

      .repertoire-grid.repertoire-discs-view{
        grid-template-columns:repeat(auto-fill,minmax(180px,1fr));
        gap:26px 20px;
        align-items:start;
        overflow:visible;
      }

      .repertoire-grid.repertoire-discs-view .repertoire-card{
        display:grid;
        grid-template-columns:1fr;
        gap:11px;
        align-items:start;
        padding:13px;
        min-width:0;
        overflow:visible;
        background:transparent;
        border-color:transparent;
        box-shadow:none;
        cursor:default;
      }

      .repertoire-grid.repertoire-discs-view .repertoire-card:hover{
        background:color-mix(in srgb,var(--gold) 6%,transparent);
      }

      .repertoire-grid.repertoire-discs-view .repertoire-cover{
        position:relative;
        z-index:1;
        width:min(100%,224px);
        height:auto;
        aspect-ratio:1;
        margin:0 auto;
        padding:7px 8px 7px 10px;
        border:1px solid rgba(235,240,242,.5);
        border-radius:3px;
        background:
          linear-gradient(90deg,rgba(255,255,255,.16),rgba(255,255,255,.035) 8%,rgba(12,12,12,.06) 9% 92%,rgba(255,255,255,.18) 100%),
          rgba(210,218,222,.08);
        box-shadow:
          inset 3px 0 0 rgba(255,255,255,.12),
          inset -2px 0 0 rgba(255,255,255,.08),
          inset 0 0 0 2px rgba(0,0,0,.14),
          0 8px 20px rgba(0,0,0,.32);
        cursor:default;
        overflow:visible;
        perspective:900px;
        transform-style:preserve-3d;
      }

      .repertoire-grid.repertoire-discs-view .repertoire-cover::after{
        content:"";
        position:absolute;
        z-index:0;
        inset:7px 8px 7px 10px;
        border:1px solid rgba(255,255,255,.13);
        background:
          radial-gradient(circle at 50% 50%,#0b0b0b 0 8%,#555 8.5% 10%,#161616 10.5% 12%,transparent 12.5% 47%,rgba(255,255,255,.035) 47.5% 49%,transparent 49.5%),
          linear-gradient(135deg,#252525,#101010 52%,#1d1d1d);
        box-shadow:inset 0 0 18px rgba(0,0,0,.7);
        pointer-events:none;
      }

      .repertoire-grid.repertoire-discs-view .repertoire-cover::before{
        content:"▶";
        position:absolute;
        z-index:6;
        left:50%;
        top:50%;
        transform:translate(-50%,-50%);
        width:50px;
        height:50px;
        display:grid;
        place-items:center;
        border:1px solid rgba(255,255,255,.72);
        border-radius:50%;
        background:rgba(0,0,0,.52);
        color:#fff;
        box-shadow:0 5px 18px rgba(0,0,0,.35);
        font:900 17px/1 Arial,sans-serif;
        padding-left:3px;
        opacity:0;
        transition:opacity .16s ease,transform .16s ease;
        pointer-events:none;
      }

      .repertoire-grid.repertoire-discs-view
      .repertoire-card.has-disc-audio:not(.is-case-open)
      .repertoire-cover{
        cursor:pointer;
      }

      .repertoire-grid.repertoire-discs-view
      .repertoire-card.has-disc-audio:not(.is-case-open)
      .repertoire-cover:hover::before{
        opacity:.72;
        transform:translate(-50%,-50%) scale(1.04);
      }

      .repertoire-grid.repertoire-discs-view .repertoire-cover img,
      .repertoire-grid.repertoire-discs-view .repertoire-cover>span{
        position:relative;
        z-index:2;
        display:grid;
        place-items:center;
        width:100%;
        height:100%;
        object-fit:cover;
        border-radius:0;
        background:#171717;
        transform-origin:left center;
        transform-style:preserve-3d;
        transition:transform .58s cubic-bezier(.18,.75,.22,1),box-shadow .58s ease,filter .2s ease;
        box-shadow:0 1px 5px rgba(0,0,0,.45);
        pointer-events:none;
        user-select:none;
        -webkit-user-drag:none;
        backface-visibility:hidden;
      }

      .repertoire-grid.repertoire-discs-view
      .repertoire-card.is-case-open
      .repertoire-cover img,
      .repertoire-grid.repertoire-discs-view
      .repertoire-card.is-case-open
      .repertoire-cover>span{
        transform:rotateY(-112deg);
        box-shadow:-10px 7px 18px rgba(0,0,0,.42);
      }

      .repertoire-grid.repertoire-discs-view
      .repertoire-card.is-case-open
      .repertoire-cover::before{
        opacity:0;
      }

      .repertoire-grid.repertoire-discs-view
      .repertoire-card.is-disc-playing
      .repertoire-cover{
        box-shadow:
          inset 3px 0 0 rgba(255,255,255,.12),
          inset -2px 0 0 rgba(255,255,255,.08),
          0 0 0 2px color-mix(in srgb,var(--gold) 75%,transparent),
          0 10px 26px rgba(0,0,0,.42);
      }

      .repertoire-grid.repertoire-discs-view .repertoire-copy{
        display:grid;
        grid-template-rows:56px 14px 28px;
        align-items:start;
        min-width:0;
        text-align:center;
      }

      .repertoire-grid.repertoire-discs-view .repertoire-copy h3{
        margin:0;
        min-height:56px;
        display:-webkit-box;
        -webkit-box-orient:vertical;
        -webkit-line-clamp:3;
        white-space:normal;
        overflow:hidden;
        text-overflow:ellipsis;
        font-size:16px;
        line-height:1.15;
        cursor:pointer;
      }

      .repertoire-grid.repertoire-discs-view .repertoire-copy h3:hover{
        color:var(--gold);
        text-decoration:underline;
        text-underline-offset:3px;
      }

      .repertoire-grid.repertoire-discs-view .repertoire-copy p,
      .repertoire-grid.repertoire-discs-view .repertoire-copy > span:not(.song-play-count),
      .repertoire-grid.repertoire-discs-view .repertoire-player{
        display:none!important;
      }

      .repertoire-grid.repertoire-discs-view .song-play-count{
        display:block!important;
        margin:0;
        align-self:center;
        text-align:center;
      }

      .songs-fan-hint{
        width:100%;
        margin:2px 0 10px;
        color:var(--muted);
        font:700 10px/1.45 monospace;
      }
      .songs-fan-hint strong{color:var(--gold)}


      .jm-flying-disc{
        position:fixed;
        z-index:2147483000;
        display:grid;
        place-items:center;
        overflow:hidden;
        border-radius:50%;
        border:2px solid #111;
        background:#171717;
        box-shadow:0 12px 30px rgba(0,0,0,.55);
        pointer-events:none;
        transform-origin:center;
      }

      .jm-flying-disc img{
        width:100%;
        height:100%;
        object-fit:cover;
        border-radius:50%;
      }

      .jm-flying-disc::after{
        content:"";
        position:absolute;
        left:50%;
        top:50%;
        width:13%;
        aspect-ratio:1;
        transform:translate(-50%,-50%);
        border-radius:50%;
        background:#0b0b0b;
        border:1px solid #bbb;
        box-shadow:0 0 0 3px rgba(0,0,0,.38);
      }

      @media(hover:none){
        .repertoire-grid.repertoire-discs-view
        .repertoire-card.has-disc-audio:not(.is-case-open)
        .repertoire-cover::before{opacity:.38}
      }

      /* ---------- DETTAGLIO CANZONE / CUSTODIA CD ---------- */

      #songCdModal[hidden]{
        display:none!important;
      }

      #songCdModal{
        position:fixed;
        inset:0;
        z-index:100500;
        display:grid;
        place-items:center;
        padding:18px;
      }

      .song-cd-backdrop{
        position:absolute;
        inset:0;
        border:0;
        background:rgba(0,0,0,.82);
        backdrop-filter:blur(10px);
        cursor:pointer;
      }

      .song-cd-modal-card{
        --song-bg:none;
        position:relative;
        z-index:1;
        width:min(1040px,calc(100vw - 28px));
        max-height:calc(100vh - 28px);
        overflow:auto;
        isolation:isolate;
        border:1px solid rgba(255,255,255,.18);
        background:#111;
        box-shadow:0 24px 90px rgba(0,0,0,.72);
        color:#fff;
      }

      .song-cd-modal-card::before{
        content:"";
        position:absolute;
        inset:0;
        z-index:-2;
        background-image:var(--song-bg);
        background-size:cover;
        background-position:center;
        filter:blur(24px) saturate(.75);
        transform:scale(1.12);
        opacity:.34;
      }

      .song-cd-modal-card::after{
        content:"";
        position:absolute;
        inset:0;
        z-index:-1;
        background:
          linear-gradient(120deg,rgba(7,7,7,.9),rgba(17,17,17,.68)),
          radial-gradient(circle at 70% 30%,rgba(255,255,255,.06),transparent 42%);
        pointer-events:none;
      }

      .song-cd-close{
        position:sticky;
        z-index:20;
        top:10px;
        float:right;
        margin:10px 10px -44px 0;
        width:36px;
        height:36px;
        border:1px solid rgba(255,255,255,.28);
        border-radius:50%;
        background:rgba(0,0,0,.68);
        color:#fff;
        font:900 21px/1 Arial,sans-serif;
        cursor:pointer;
      }

      .song-cd-shell{
        min-height:620px;
        padding:38px;
        perspective:1800px;
      }

      .song-cd-case{
        position:relative;
        width:100%;
        min-height:540px;
        transform-style:preserve-3d;
      }

      .song-cd-interior{
        position:relative;
        display:grid;
        grid-template-columns:minmax(0,1fr) minmax(0,1fr);
        min-height:540px;
        border:1px solid rgba(255,255,255,.22);
        background:
          linear-gradient(90deg,rgba(14,14,14,.92) 0 49.8%,rgba(62,62,62,.45) 50%,rgba(13,13,13,.9) 50.2%);
        box-shadow:
          inset 0 0 0 7px rgba(255,255,255,.035),
          0 18px 50px rgba(0,0,0,.48);
      }

      .song-cd-front{
        position:absolute;
        z-index:8;
        inset:0 50% 0 0;
        transform-origin:right center;
        transform:rotateY(0deg);
        transform-style:preserve-3d;
        visibility:visible;
        transition:
          transform .78s cubic-bezier(.22,.7,.18,1),
          visibility 0s linear 0s;
        box-shadow:10px 0 28px rgba(0,0,0,.45);
        pointer-events:none;
      }

      #songCdModal.is-open .song-cd-front{
        transform:rotateY(176deg);
        visibility:hidden;
        transition:
          transform .78s cubic-bezier(.22,.7,.18,1),
          visibility 0s linear .78s;
      }

      .song-cd-front-face,
      .song-cd-front-back{
        position:absolute;
        inset:0;
        backface-visibility:hidden;
        overflow:hidden;
        border:1px solid rgba(255,255,255,.16);
        background:#151515;
      }

      .song-cd-front-face img{
        width:100%;
        height:100%;
        object-fit:cover;
        display:block;
      }

      .song-cd-front-back{
        transform:rotateY(180deg);
        background:
          linear-gradient(135deg,rgba(255,255,255,.08),rgba(255,255,255,.01)),
          #111;
      }

      .song-cd-booklet{
        position:relative;
        min-width:0;
        padding:28px;
        overflow:hidden;
      }

      .song-cd-booklet-page{
        min-height:480px;
        display:flex;
        flex-direction:column;
        gap:18px;
        transform-origin:left center;
        transition:
          transform .42s ease,
          opacity .28s ease;
      }

      .song-cd-booklet-page[hidden]{
        display:none!important;
      }

      .song-cd-kicker{
        color:var(--gold);
        font:900 10px/1 monospace;
        letter-spacing:.12em;
      }

      .song-cd-title{
        margin:0;
        max-width:92%;
        font:900 clamp(27px,4vw,52px)/.92 Impact,Arial Black,sans-serif;
        letter-spacing:.01em;
        text-transform:uppercase;
      }

      .song-cd-source{
        display:grid;
        gap:8px;
        padding:12px 0;
        border-top:1px solid rgba(255,255,255,.18);
        border-bottom:1px solid rgba(255,255,255,.18);
      }

      .song-cd-source-row{
        display:grid;
        grid-template-columns:62px minmax(0,1fr);
        gap:10px;
        align-items:start;
      }

      .song-cd-source-row span{
        color:var(--muted);
        font:900 9px/1.25 monospace;
        text-transform:uppercase;
      }

      .song-cd-source-row strong{
        font:800 12px/1.3 Arial,sans-serif;
      }

      .song-cd-stats{
        display:grid;
        grid-template-columns:repeat(2,minmax(0,1fr));
        gap:8px;
      }

      .song-cd-stat{
        display:grid;
        gap:3px;
        min-width:0;
        padding:10px;
        border:1px solid rgba(255,255,255,.14);
        background:rgba(0,0,0,.32);
      }

      .song-cd-stat span{
        color:var(--muted);
        font:800 8px/1.15 monospace;
        letter-spacing:.04em;
        text-transform:uppercase;
      }

      .song-cd-stat strong{
        overflow:hidden;
        text-overflow:ellipsis;
        font:900 16px/1 Arial,sans-serif;
      }

      .song-cd-page-actions{
        display:flex;
        align-items:center;
        gap:8px;
        flex-wrap:wrap;
        margin-top:auto;
        padding-top:4px;
      }

      .song-cd-page-button{
        min-height:36px;
        padding:8px 12px;
        border:1px solid #817b6d;
        background:rgba(0,0,0,.52);
        color:#fff;
        font:900 10px/1 monospace;
        cursor:pointer;
      }

      .song-cd-page-button:hover,
      .song-cd-page-button.primary{
        border-color:var(--gold);
        background:var(--gold);
        color:#111;
      }

      .song-cd-lyrics{
        white-space:pre-wrap;
        overflow:auto;
        max-height:365px;
        padding:14px;
        border:1px solid rgba(255,255,255,.15);
        background:rgba(0,0,0,.4);
        font:700 14px/1.55 Arial,sans-serif;
      }

      .song-cd-lyrics-empty{
        display:grid;
        place-items:center;
        min-height:260px;
        padding:28px;
        text-align:center;
        border:1px dashed rgba(255,255,255,.2);
        color:var(--muted);
        font:800 12px/1.45 Arial,sans-serif;
      }

      .song-cd-disc-panel{
        position:relative;
        z-index:2;
        display:grid;
        align-content:center;
        justify-items:center;
        gap:22px;
        min-width:0;
        padding:30px;
        overflow:hidden;
      }

      .song-cd-disc-wrap{
        position:relative;
        width:min(92%,390px);
        aspect-ratio:1;
        display:grid;
        place-items:center;
      }

      .song-cd-disc{
        position:relative;
        width:100%;
        aspect-ratio:1;
        padding:0;
        border:1px solid rgba(255,255,255,.35);
        border-radius:50%;
        overflow:hidden;
        background:
          radial-gradient(circle at center,#111 0 9%,transparent 9.4%),
          conic-gradient(
            from 20deg,
            rgba(255,255,255,.45),
            rgba(255,255,255,.04),
            rgba(231,198,108,.22),
            rgba(255,255,255,.05),
            rgba(255,255,255,.45)
          );
        box-shadow:
          0 20px 42px rgba(0,0,0,.55),
          inset 0 0 28px rgba(255,255,255,.08);
        cursor:pointer;
      }

      .song-cd-disc img{
        position:absolute;
        inset:0;
        width:100%;
        height:100%;
        object-fit:cover;
        border-radius:50%;
        display:block;
        user-select:none;
        -webkit-user-drag:none;
      }

      .song-cd-disc::before{
        content:"";
        position:absolute;
        z-index:3;
        left:50%;
        top:50%;
        width:17%;
        aspect-ratio:1;
        transform:translate(-50%,-50%);
        border-radius:50%;
        background:#0d0d0d;
        border:4px solid rgba(220,220,220,.72);
        box-shadow:0 0 0 5px rgba(0,0,0,.22);
      }

      .song-cd-disc::after{
        content:"▶";
        position:absolute;
        z-index:4;
        left:50%;
        top:50%;
        transform:translate(-50%,-50%);
        color:#fff;
        font:900 16px/1 Arial,sans-serif;
        margin-left:2px;
        pointer-events:none;
      }

      .song-cd-disc.is-current::after{
        content:"❚❚";
        margin-left:0;
        letter-spacing:-2px;
        font-size:13px;
      }

      .song-cd-disc.is-spinning{
        animation:jm-song-disc-spin 2.2s linear infinite;
        box-shadow:
          0 0 0 3px var(--gold),
          0 20px 48px rgba(0,0,0,.58);
      }

      .song-cd-player{
        width:min(100%,420px);
        display:grid;
        gap:10px;
      }

      .song-cd-player-controls{
        display:flex;
        align-items:center;
        justify-content:center;
        gap:9px;
      }

      .song-cd-player-button{
        min-width:44px;
        height:40px;
        border:1px solid rgba(255,255,255,.28);
        background:rgba(0,0,0,.55);
        color:#fff;
        cursor:pointer;
        font:900 13px/1 Arial,sans-serif;
      }

      .song-cd-player-button.main{
        min-width:54px;
        border-color:var(--gold);
        background:var(--gold);
        color:#111;
        border-radius:24px;
      }

      .song-cd-player-button:disabled{
        opacity:.35;
        cursor:default;
      }

      .song-cd-progress{
        display:grid;
        grid-template-columns:42px minmax(0,1fr) 42px;
        align-items:center;
        gap:8px;
        color:#ddd;
        font:800 9px/1 monospace;
      }

      .song-cd-progress input{
        width:100%;
        accent-color:var(--gold);
      }

      .song-cd-player-mode{
        min-height:14px;
        color:var(--muted);
        text-align:center;
        font:800 9px/1.2 monospace;
      }

      .song-cd-rank-badge{
        position:absolute;
        right:22px;
        top:22px;
        z-index:2;
        display:grid;
        place-items:center;
        min-width:62px;
        min-height:62px;
        padding:8px;
        border:1px solid var(--gold);
        border-radius:50%;
        background:rgba(0,0,0,.72);
        text-align:center;
      }

      .song-cd-rank-badge strong{
        display:block;
        color:var(--gold);
        font:900 22px/1 Arial,sans-serif;
      }

      .song-cd-rank-badge span{
        display:block;
        margin-top:2px;
        color:#fff;
        font:900 7px/1 monospace;
        letter-spacing:.06em;
      }

      @media(max-width:760px){
        .songs-view-switch{
          margin-left:0;
        }

        .repertoire-grid.repertoire-discs-view{
          grid-template-columns:repeat(2,minmax(0,1fr));
          gap:18px 10px;
        }

        .repertoire-grid.repertoire-discs-view .repertoire-card{
          padding:7px;
        }

        .repertoire-grid.repertoire-discs-view .repertoire-copy h3{
          font-size:14px;
        }

        #songCdModal{
          padding:8px;
          align-items:end;
        }

        .song-cd-modal-card{
          width:100%;
          max-height:calc(100dvh - 10px);
          border-radius:14px 14px 0 0;
        }

        .song-cd-shell{
          min-height:auto;
          padding:22px 12px 14px;
        }

        .song-cd-case{
          min-height:auto;
        }

        .song-cd-front{
          display:none;
        }

        .song-cd-interior{
          display:flex;
          flex-direction:column-reverse;
          min-height:auto;
          background:rgba(12,12,12,.88);
        }

        .song-cd-booklet{
          padding:18px;
        }

        .song-cd-booklet-page{
          min-height:auto;
        }

        .song-cd-disc-panel{
          padding:26px 18px 18px;
        }

        .song-cd-disc-wrap{
          width:min(72vw,300px);
        }

        .song-cd-title{
          max-width:82%;
          font-size:34px;
        }

        .song-cd-stats{
          grid-template-columns:repeat(2,minmax(0,1fr));
        }

        .song-cd-rank-badge{
          right:16px;
          top:14px;
          min-width:54px;
          min-height:54px;
        }
      }

      @media(prefers-reduced-motion:reduce){
        .song-cd-front,
        .song-cd-booklet-page{
          transition:none;
        }

        .song-cd-disc.is-spinning,
        .repertoire-grid.repertoire-discs-view
        .repertoire-card.is-disc-playing
        .repertoire-cover{
          animation:none;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function renameSection() {
    const navLabel = document.querySelector(
      '.main-nav [data-route="repertoire"] span'
    );

    if (navLabel) {
      delete navLabel.dataset.copy;
      navLabel.textContent = 'SONGS';
    }

    const page = document.getElementById('repertoirePage');
    if (!page) return;

    const title = page.querySelector('.page-hero h2');
    const ornament = page.querySelector('.page-hero-ornament');
    const heading = page.querySelector('.repertoire-heading h3');

    if (title) {
      delete title.dataset.copy;
      title.textContent = 'SONGS';
    }

    if (ornament) {
      delete ornament.dataset.copy;
      ornament.textContent = 'SONGS';
    }

    if (heading) {
      delete heading.dataset.copy;
      heading.textContent = 'Tutte le songs';
    }
  }

  function ensureSwitch() {
    const toolbar = document.querySelector('.repertoire-toolbar');
    if (!toolbar) return;

    let wrap = document.getElementById('songsViewSwitch');

    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'songsViewSwitch';
      wrap.className = 'songs-view-switch';
      wrap.setAttribute('role','group');
      wrap.setAttribute(
        'aria-label',
        'Modalità di visualizzazione songs'
      );

      wrap.innerHTML = `
        <button
          class="songs-view-button"
          type="button"
          data-songs-view="list"
          aria-pressed="false"
        >LISTA</button>
        <button
          class="songs-view-button"
          type="button"
          data-songs-view="discs"
          aria-pressed="false"
        >DISCHI</button>
      `;

      const jukebox = toolbar.querySelector('#openJukeboxMode');

      if (jukebox) toolbar.insertBefore(wrap,jukebox);
      else toolbar.appendChild(wrap);

      wrap.querySelectorAll('[data-songs-view]').forEach(button => {
        button.addEventListener('click', () => {
          setView(button.dataset.songsView);
        });
      });
    }

    ensureFanHint();
  }

  function ensureFanHint(){
    const toolbar=document.querySelector('.repertoire-toolbar');
    if(!toolbar)return null;

    let hint=document.getElementById('songsFanHint');
    if(!hint){
      hint=document.createElement('p');
      hint.id='songsFanHint';
      hint.className='songs-fan-hint';
      toolbar.insertAdjacentElement('afterend',hint);
    }
    return hint;
  }

  function updateFanHint(view=getView()){
    const hint=ensureFanHint();
    if(!hint)return;
    hint.innerHTML=view===VIEW_DISCS
      ? '<strong>FAN:</strong> clicca una cover per ascoltare la demo, il titolo per aprire i dettagli e <strong>VOTA</strong> la cover art.'
      : '<strong>FAN:</strong> apri un brano per dettagli e testo, ascolta le demo disponibili e usa <strong>VOTA</strong> per dare il tuo voto.';
  }

  function renderPlayCount(card) {
    const id = String(card?.dataset?.repertoireSong || '');
    const song = songs.get(id);
    const title = card?.querySelector('.repertoire-copy h3');

    if (!title) return;

    let count = card.querySelector('.song-play-count');

    if (!count) {
      count = document.createElement('span');
      count.className = 'song-play-count';
      title.insertAdjacentElement('afterend',count);
    }

    const nextText =
      `▶ ${Number(song?.weighted_play_count || 0)} RIPRODUZIONI`;

    if (count.textContent !== nextText) {
      count.textContent = nextText;
    }
  }

  function demoPlaybackState() {
    try{
      return window.JMDemoAudio?.state?.() || {song_id:'',active:false,playing:false};
    }catch{
      return {song_id:'',active:false,playing:false};
    }
  }

  function syncCardPlayingState(card,state=demoPlaybackState()) {
    if(!card)return;
    const id=String(card.dataset.repertoireSong||'');
    const song=songs.get(id);
    const active=!!state.active&&String(state.song_id)===id;
    const playing=active&&!!state.playing;
    card.classList.toggle('has-disc-audio',!!song?.has_demo);
    card.classList.toggle('is-case-open',active);
    card.classList.toggle('is-disc-playing',playing);
  }

  async function waitForGlobalPlayerCover() {
    for(let i=0;i<12;i++){
      const player=document.getElementById('jmGlobalAudioPlayer');
      const cover=player?.querySelector('[data-global-cover]');
      if(player&&!player.hidden&&cover)return cover;
      await new Promise(resolve=>setTimeout(resolve,35));
    }
    return null;
  }

  async function animateDiscToPlayer(card) {
    const source=card?.querySelector('.repertoire-cover');
    if(!source)return;
    const target=await waitForGlobalPlayerCover();
    if(!target)return;

    const image=source.querySelector('img');
    const sourceRect=source.getBoundingClientRect();
    const targetRect=target.getBoundingClientRect();
    if(!sourceRect.width||!targetRect.width)return;

    const diameter=Math.max(48,Math.min(126,sourceRect.width*.72));
    const startLeft=sourceRect.left+(sourceRect.width-diameter)/2;
    const startTop=sourceRect.top+(sourceRect.height-diameter)/2;
    const targetDiameter=Math.max(1,Math.min(targetRect.width,targetRect.height));
    const targetLeft=targetRect.left+(targetRect.width-targetDiameter)/2;
    const targetTop=targetRect.top+(targetRect.height-targetDiameter)/2;

    const flyer=document.createElement('div');
    flyer.className='jm-flying-disc';
    flyer.style.left=`${startLeft}px`;
    flyer.style.top=`${startTop}px`;
    flyer.style.width=`${diameter}px`;
    flyer.style.height=`${diameter}px`;
    flyer.innerHTML=image
      ? `<img src="${esc(image.currentSrc||image.src)}" alt="" draggable="false">`
      : '<span>JM</span>';
    document.body.appendChild(flyer);

    const dx=targetLeft-startLeft;
    const dy=targetTop-startTop;
    const scale=targetDiameter/diameter;
    const animation=flyer.animate([
      {transform:'translate3d(0,0,0) scale(1) rotate(0deg)',opacity:1},
      {offset:.36,transform:`translate3d(${dx*.28}px,${Math.min(dy*.2,-24)}px,0) scale(.82) rotate(180deg)`,opacity:.96},
      {transform:`translate3d(${dx}px,${dy}px,0) scale(${scale}) rotate(720deg)`,opacity:.9}
    ],{
      duration:620,
      easing:'cubic-bezier(.18,.78,.2,1)',
      fill:'forwards'
    });
    try{await animation.finished}catch{}
    flyer.remove();
  }

  async function playFromRepertoireCard(songId) {
    const id=String(songId);

    if(window.JMDemoAudio?.playSong){
      try{
        const state=await window.JMDemoAudio.playSong(id);
        return !!(state?.active&&String(state.song_id)===id);
      }catch(err){
        console.warn('Riproduzione da custodia CD',err);
        return false;
      }
    }

    const escaped=CSS.escape(id);
    let card=document.querySelector(`#repertoireGrid [data-repertoire-song="${escaped}"]`);
    if(!card)return false;

    const toggle=card.querySelector('[data-demo-toggle]');
    if(toggle){toggle.click();return true}

    const button=card.querySelector('.demo-player-button:not([disabled])');
    if(button){button.click();return true}

    return false;
  }

  function ensureSongListVote(card,song) {
    const copy=card?.querySelector('.repertoire-copy');
    if(!copy||!song?.id)return;

    let button=copy.querySelector('.song-list-vote');
    if(!button){
      button=voteButton('song',song.id,song.title,'VOTA');
      button.classList.add('song-list-vote');
      button.setAttribute('aria-label',`Vota il brano ${song.title||''}`);
      copy.appendChild(button);
    }
  }

  function ensureDiscCoverVote(card,song) {
    const copy=card.querySelector('.repertoire-copy');
    const count=copy?.querySelector('.song-play-count');
    let button=copy?.querySelector('.disc-cover-vote');

    if(!song?.cover_path){
      button?.remove();
      return;
    }

    if(!button&&count){
      button=voteButton('cover',song.id,song.title,'VOTA');
      button.classList.add('disc-cover-vote');
      button.setAttribute('aria-label',`Vota la cover art di ${song.title||'questo brano'}`);
      count.insertAdjacentElement('afterend',button);
    }
  }

  function decorateCard(card) {
    if(!card)return;

    const song=songs.get(String(card.dataset.repertoireSong||''));
    renderPlayCount(card);
    ensureSongListVote(card,song);
    ensureDiscCoverVote(card,song);
    syncCardPlayingState(card);

    if(card.dataset.songsDiscBound==='1')return;
    card.dataset.songsDiscBound='1';

    const cover=card.querySelector('.repertoire-cover');
    const title=card.querySelector('.repertoire-copy h3');

    if(cover&&song?.has_demo){
      cover.setAttribute('role','button');
      cover.tabIndex=0;
      cover.setAttribute('aria-label',`Riproduci ${song.title||'brano'}`);

      const run=async event=>{
        if(getView()!==VIEW_DISCS)return;
        event.preventDefault();
        event.stopPropagation();

        const started=await playFromRepertoireCard(card.dataset.repertoireSong);
        syncCardPlayingState(card);
        if(started){
          card.classList.add('is-case-open');
          animateDiscToPlayer(card).catch(()=>{});
        }
      };

      cover.addEventListener('click',run);
      cover.addEventListener('keydown',event=>{
        if(event.key==='Enter'||event.key===' ')run(event);
      });
      cover.addEventListener('pointerenter',()=>{
        window.JMDemoAudio?.prefetch?.(String(card.dataset.repertoireSong)).catch?.(()=>{});
      },{once:true});
    }

    if(title){
      title.setAttribute('role','button');
      title.tabIndex=0;
    }
  }

  function decorateAll() {
    const state=demoPlaybackState();
    document
      .querySelectorAll('#repertoireGrid .repertoire-card')
      .forEach(card=>{
        decorateCard(card);
        syncCardPlayingState(card,state);
      });
  }

  function decorateHitRows() {
    document
      .querySelectorAll('#songsRanking [data-ranking-song-index]')
      .forEach(row => {
        const title = row.querySelector('.ranking-title')?.textContent?.trim() || row.getAttribute('title') || '';
        const song = songs.get(String(row.dataset.songId||'')) || songsByTitle.get(normalizeTitle(title));
        if (!song) return;
        row.dataset.songDetailId = String(song.id);
      });
  }

  function applyView() {
    renameSection();
    ensureSwitch();

    const grid = document.getElementById('repertoireGrid');
    if (!grid) return;

    const view = getView();
    updateFanHint(view);

    grid.classList.toggle(
      'repertoire-discs-view',
      view === VIEW_DISCS
    );

    document
      .querySelectorAll('[data-songs-view]')
      .forEach(button => {
        const active =
          button.dataset.songsView === view;

        button.classList.toggle('active',active);
        button.setAttribute(
          'aria-pressed',
          active ? 'true' : 'false'
        );
      });

    decorateAll();
  }

  function ensureSongModal() {
    let modal = document.getElementById('songCdModal');

    if (modal) return modal;

    modal = document.createElement('section');
    modal.id = 'songCdModal';
    modal.hidden = true;
    modal.setAttribute('aria-modal','true');
    modal.setAttribute('role','dialog');

    modal.innerHTML = `
      <button
        type="button"
        class="song-cd-backdrop"
        data-song-cd-close
        aria-label="Chiudi"
      ></button>

      <article class="song-cd-modal-card">
        <button
          type="button"
          class="song-cd-close"
          data-song-cd-close
          aria-label="Chiudi"
        >×</button>

        <div class="song-cd-shell">
          <div class="song-cd-case">
            <div class="song-cd-interior">
              <section class="song-cd-booklet">
                <div
                  class="song-cd-booklet-page"
                  data-song-cd-page="info"
                ></div>

                <div
                  class="song-cd-booklet-page"
                  data-song-cd-page="lyrics"
                  hidden
                ></div>
              </section>

              <section class="song-cd-disc-panel">
                <div class="song-cd-rank-badge">
                  <strong data-song-cd-rank>—</strong>
                  <span>HITS</span>
                </div>

                <div class="song-cd-disc-wrap">
                  <button
                    type="button"
                    class="song-cd-disc"
                    data-song-cd-disc
                    aria-label="Play / pausa"
                  ></button>
                </div>

                <div class="song-cd-player">
                  <div class="song-cd-player-controls">
                    <button
                      type="button"
                      class="song-cd-player-button main"
                      data-song-cd-toggle
                      aria-label="Play / pausa"
                    >▶</button>

                    <button
                      type="button"
                      class="song-cd-player-button"
                      data-song-cd-stop
                      aria-label="Stop"
                    >■</button>
                  </div>

                  <div class="song-cd-progress">
                    <span data-song-cd-current>0:00</span>
                    <input
                      type="range"
                      min="0"
                      max="1000"
                      step="1"
                      value="0"
                      data-song-cd-seek
                      aria-label="Avanzamento brano"
                    >
                    <span data-song-cd-duration>--:--</span>
                  </div>

                  <div
                    class="song-cd-player-mode"
                    data-song-cd-mode
                  ></div>
                </div>
              </section>
            </div>

            <div class="song-cd-front" aria-hidden="true">
              <div class="song-cd-front-face"></div>
              <div class="song-cd-front-back"></div>
            </div>
          </div>
        </div>
      </article>
    `;

    document.body.appendChild(modal);

    modal.querySelectorAll('[data-song-cd-close]').forEach(button => {
      button.addEventListener('click',closeSongDetail);
    });

    modal
      .querySelector('[data-song-cd-disc]')
      .addEventListener('click',toggleDetailPlayback);

    modal
      .querySelector('[data-song-cd-toggle]')
      .addEventListener('click',toggleDetailPlayback);

    modal
      .querySelector('[data-song-cd-stop]')
      .addEventListener('click',() => {
        const global = document.getElementById('jmGlobalAudioPlayer');

        if (isGlobalPlayerOnCurrentSong(global)) {
          global
            ?.querySelector('[data-global-stop]')
            ?.click();
        }
      });

    modal
      .querySelector('[data-song-cd-seek]')
      .addEventListener('input',event => {
        const global = document.getElementById('jmGlobalAudioPlayer');

        if (!isGlobalPlayerOnCurrentSong(global)) return;

        const seek = global.querySelector('[data-global-seek]');
        if (!seek) return;

        seek.value = event.target.value;
        seek.dispatchEvent(
          new Event('input',{bubbles:true})
        );
      });

    return modal;
  }

  function sourceRow(label,title,artist,isMolesti = false) {
    let text = '';

    if (isMolesti) {
      text = 'Originale JOHN & I MOLESTI';
    } else {
      text = [title,artist].filter(Boolean).join(' — ');
    }

    if (!text) text = '—';

    return `
      <div class="song-cd-source-row">
        <span>${esc(label)}</span>
        <strong>${esc(text)}</strong>
      </div>
    `;
  }

  function isMolestiArtist(value) {
    const normalized = normalizeTitle(value)
      .replaceAll('&','e');

    return (
      normalized.includes('john e i molesti') ||
      normalized === 'molesti'
    );
  }

  function stat(label,value) {
    return `
      <div class="song-cd-stat">
        <span>${esc(label)}</span>
        <strong>${esc(value)}</strong>
      </div>
    `;
  }

  function renderInfoPage(song) {
    const molestiLyrics =
      isMolestiArtist(song.lyrics_artist);

    const fanVote =
      song.fan_avg_score == null
        ? '—'
        : `${Number(song.fan_avg_score).toFixed(2)}/10`;

    return `
      <span class="song-cd-kicker">
        JOHN & I MOLESTI
      </span>

      <h2 class="song-cd-title">
        ${esc(song.title || 'BRANO')}
      </h2>

      <div class="song-cd-source">
        ${sourceRow(
          'BASE',
          song.base_title,
          song.base_artist,
          !!song.base_is_original
        )}

        ${sourceRow(
          'TESTO',
          song.lyrics_title,
          song.lyrics_artist,
          molestiLyrics || (
            !!song.base_is_original &&
            !song.lyrics_title &&
            !song.lyrics_artist
          )
        )}
      </div>

      <div class="song-cd-stats">
        ${stat(
          'RILASCIO MOLESTI',
          song.molesti_year || '—'
        )}

        ${stat(
          'POSIZIONE HITS',
          song.ranking_position
            ? `#${song.ranking_position}`
            : '—'
        )}

        ${stat(
          'RIPRODUZIONI',
          Number(song.weighted_play_count || 0)
        )}

        ${stat(
          'ESECUZIONI IN SCALETTA',
          Number(song.setlist_execution_count || 0)
        )}

        ${stat(
          'PRIMA VOLTA LIVE',
          formatDate(song.first_live_date)
        )}

        ${stat(
          'VOTO MEDIO FAN',
          song.fan_vote_count
            ? `${fanVote} · ${Number(song.fan_vote_count)} voti`
            : '—'
        )}
      </div>

      <div class="song-cd-page-actions">
        <button type="button" class="jm-inline-vote song-cd-page-button" data-jm-vote-kind="song" data-song-id="${esc(song.id)}" data-song-title="${esc(song.title||'')}">VOTA</button>
        ${song.cover_path?`<button type="button" class="jm-inline-vote song-cd-page-button" data-jm-vote-kind="cover" data-song-id="${esc(song.id)}" data-song-title="${esc(song.title||'')}">VOTA COVER</button>`:''}
        <button
          type="button"
          class="song-cd-page-button primary"
          data-song-cd-show-lyrics
        >TESTO →</button>
      </div>
    `;
  }

  function renderLyricsPage(song) {
    const lyrics = String(song.lyrics_text || '').trim();

    return `
      <span class="song-cd-kicker">
        LYRICS
      </span>

      <h2 class="song-cd-title">
        ${esc(song.title || 'BRANO')}
      </h2>

      ${
        lyrics
          ? `<div class="song-cd-lyrics">${esc(lyrics)}</div>`
          : `
            <div class="song-cd-lyrics-empty">
              Testo non ancora disponibile.
            </div>
          `
      }

      <div class="song-cd-page-actions">
        <button
          type="button"
          class="song-cd-page-button"
          data-song-cd-show-info
        >← INFO</button>
      </div>
    `;
  }

  function setBookletPage(page) {
    const modal = document.getElementById('songCdModal');
    if (!modal) return;

    modal
      .querySelector('[data-song-cd-page="info"]')
      .hidden = page !== 'info';

    modal
      .querySelector('[data-song-cd-page="lyrics"]')
      .hidden = page !== 'lyrics';
  }

  function bindBookletButtons(modal) {
    modal
      .querySelector('[data-song-cd-show-lyrics]')
      ?.addEventListener('click',() => {
        setBookletPage('lyrics');
      });

    modal
      .querySelector('[data-song-cd-show-info]')
      ?.addEventListener('click',() => {
        setBookletPage('info');
      });
  }

  async function openSongDetail(songId) {
    const song = await loadSongDetail(songId,{force:true});
    if (!song) return;

    currentDetailSongId = String(song.id);

    const modal = ensureSongModal();
    const card = modal.querySelector('.song-cd-modal-card');
    const cover = coverUrl(song);

    card.style.setProperty(
      '--song-bg',
      cover ? `url(${JSON.stringify(cover)})` : 'none'
    );

    modal.classList.remove('is-open');
    modal.hidden = false;

    const front = modal.querySelector('.song-cd-front-face');
    front.innerHTML = cover
      ? `<img src="${esc(cover)}" alt="Cover di ${esc(song.title)}">`
      : '<div class="song-cd-lyrics-empty">JOHN & I MOLESTI</div>';

    const disc = modal.querySelector('[data-song-cd-disc]');
    disc.innerHTML = cover
      ? `<img src="${esc(cover)}" alt="" draggable="false">`
      : '';

    modal.querySelector('[data-song-cd-rank]').textContent =
      song.ranking_position
        ? `#${song.ranking_position}`
        : '—';

    modal.querySelector(
      '[data-song-cd-page="info"]'
    ).innerHTML = renderInfoPage(song);

    modal.querySelector(
      '[data-song-cd-page="lyrics"]'
    ).innerHTML = renderLyricsPage(song);

    setBookletPage('info');
    bindBookletButtons(modal);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        modal.classList.add('is-open');
      });
    });

    clearInterval(playerSyncTimer);
    playerSyncTimer = setInterval(syncDetailPlayer,220);

    syncDetailPlayer();
  }

  function closeSongDetail() {
    const modal = document.getElementById('songCdModal');
    if (!modal) return;

    modal.classList.remove('is-open');

    clearInterval(playerSyncTimer);
    playerSyncTimer = null;

    setTimeout(() => {
      modal.hidden = true;
    },260);
  }

  function globalPlayerTitle(global) {
    return global
      ?.querySelector('[data-global-title]')
      ?.textContent
      ?.trim() || '';
  }

  function isGlobalPlayerOnCurrentSong(global) {
    if (
      !global ||
      global.hidden ||
      !currentDetailSongId
    ) {
      return false;
    }

    const song = songs.get(currentDetailSongId);
    if (!song) return false;

    return (
      normalizeTitle(globalPlayerTitle(global)) ===
      normalizeTitle(song.title)
    );
  }

  async function toggleDetailPlayback() {
    const modal = document.getElementById('songCdModal');
    const global = document.getElementById('jmGlobalAudioPlayer');

    if (!modal || !currentDetailSongId) return;

    if (isGlobalPlayerOnCurrentSong(global)) {
      global
        .querySelector('[data-global-toggle]')
        ?.click();

      return;
    }

    const song = songs.get(currentDetailSongId);

    if (!song?.has_demo && song?.spotify_url) {
      window.open(
        song.spotify_url,
        '_blank',
        'noopener,noreferrer'
      );
      return;
    }

    await playFromRepertoireCard(currentDetailSongId);

    setTimeout(syncDetailPlayer,80);
  }

  function syncDetailPlayer() {
    const modal = document.getElementById('songCdModal');
    if (!modal || modal.hidden) return;

    const global = document.getElementById('jmGlobalAudioPlayer');
    const current = isGlobalPlayerOnCurrentSong(global);

    const globalToggle =
      global?.querySelector('[data-global-toggle]');

    const playing = !!(
      current &&
      /❚❚/.test(globalToggle?.textContent || '')
    );

    const disc = modal.querySelector('[data-song-cd-disc]');
    const toggle = modal.querySelector('[data-song-cd-toggle]');
    const stop = modal.querySelector('[data-song-cd-stop]');
    const seek = modal.querySelector('[data-song-cd-seek]');

    disc.classList.toggle('is-current',current);
    disc.classList.toggle('is-spinning',playing);

    toggle.textContent = playing ? '❚❚' : '▶';
    stop.disabled = !current;

    if (current) {
      const globalSeek =
        global.querySelector('[data-global-seek]');

      const currentTime =
        global.querySelector('[data-global-current]')
          ?.textContent || '0:00';

      const duration =
        global.querySelector('[data-global-duration]')
          ?.textContent || '--:--';

      const mode =
        global.querySelector('[data-global-mode]')
          ?.textContent || '';

      seek.disabled = false;
      seek.value = globalSeek?.value || '0';

      modal.querySelector(
        '[data-song-cd-current]'
      ).textContent = currentTime;

      modal.querySelector(
        '[data-song-cd-duration]'
      ).textContent = duration;

      modal.querySelector(
        '[data-song-cd-mode]'
      ).textContent = mode;
    } else {
      const song = songs.get(currentDetailSongId);

      seek.disabled = true;
      seek.value = '0';

      modal.querySelector(
        '[data-song-cd-current]'
      ).textContent = '0:00';

      modal.querySelector(
        '[data-song-cd-duration]'
      ).textContent = '--:--';

      modal.querySelector(
        '[data-song-cd-mode]'
      ).textContent =
        song?.has_demo
          ? 'CLICCA IL DISCO PER ASCOLTARE'
          : song?.spotify_url
            ? 'ASCOLTO DISPONIBILE SU SPOTIFY'
            : 'AUDIO NON DISPONIBILE';
    }

    document
      .querySelectorAll('#repertoireGrid .repertoire-card')
      .forEach(card=>syncCardPlayingState(card));
  }

  function refreshOpenDetail() {
    const modal = document.getElementById('songCdModal');

    if (
      !modal ||
      modal.hidden ||
      !currentDetailSongId
    ) {
      return;
    }

    const song = songs.get(currentDetailSongId);
    if (!song) return;

    modal.querySelector(
      '[data-song-cd-page="info"]'
    ).innerHTML = renderInfoPage(song);

    modal.querySelector(
      '[data-song-cd-page="lyrics"]'
    ).innerHTML = renderLyricsPage(song);

    modal.querySelector('[data-song-cd-rank]').textContent =
      song.ranking_position
        ? `#${song.ranking_position}`
        : '—';

    bindBookletButtons(modal);
  }

  function resolveHitSong(row) {
    const directId = row?.dataset?.songId || row?.dataset?.songDetailId;

    if (directId && songs.has(String(directId))) {
      return songs.get(String(directId));
    }

    const title = row
      ?.querySelector('.ranking-title')
      ?.textContent
      ?.trim() || row?.getAttribute('title') || '';

    return songsByTitle.get(normalizeTitle(title)) || null;
  }

  function installUnifiedOpenHandler() {
    if (window.__jmUnifiedSongDetailHandler) return;
    window.__jmUnifiedSongDetailHandler = true;

    document.addEventListener(
      'click',
      event => {
        const repertoireCard = event.target.closest(
          '#repertoireGrid [data-repertoire-song]'
        );

        if (repertoireCard) {
          if (
            event.target.closest(
              'audio,a,.repertoire-player button,input,[data-jm-vote-kind]'
            )
          ) {
            return;
          }

          /*
            In modalità DISCHI la cover resta il comando play.
            Titolo e resto della card aprono invece la custodia.
          */
          if (
            getView() === VIEW_DISCS &&
            event.target.closest('.repertoire-cover') &&
            repertoireCard.classList.contains('has-disc-audio')
          ) {
            return;
          }

          event.preventDefault();
          event.stopImmediatePropagation();

          openSongDetail(
            repertoireCard.dataset.repertoireSong
          );

          return;
        }

        const hitRow = event.target.closest(
          '#songsRanking [data-ranking-song-index]'
        );

        if (hitRow) {
          const song = resolveHitSong(hitRow);

          if (!song) return;

          event.preventDefault();
          event.stopImmediatePropagation();

          openSongDetail(song.id);
        }
      },
      true
    );

    document.addEventListener(
      'keydown',
      event => {
        if (
          event.key !== 'Enter' &&
          event.key !== ' '
        ) {
          return;
        }

        const hitRow = event.target.closest(
          '#songsRanking [data-ranking-song-index]'
        );

        if (hitRow) {
          const song = resolveHitSong(hitRow);
          if (!song) return;

          event.preventDefault();
          event.stopImmediatePropagation();

          openSongDetail(song.id);
          return;
        }

        const title = event.target.closest(
          '#repertoireGrid .repertoire-copy h3'
        );

        if (title) {
          const card = title.closest(
            '[data-repertoire-song]'
          );

          if (!card) return;

          event.preventDefault();
          event.stopImmediatePropagation();

          openSongDetail(
            card.dataset.repertoireSong
          );
        }
      },
      true
    );

    document.addEventListener(
      'keydown',
      event => {
        if (
          event.key === 'Escape' &&
          !document.getElementById('songCdModal')?.hidden
        ) {
          closeSongDetail();
        }
      }
    );
  }

  function observeDynamicContent() {
    if (gridObserver) gridObserver.disconnect();

    let scheduled = false;

    gridObserver = new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;

      requestAnimationFrame(() => {
        scheduled = false;
        decorateAll();
        decorateHitRows();
      });
    });

    const repertoireGrid = document.getElementById('repertoireGrid');
    const songsRanking = document.getElementById('songsRanking');

    if (repertoireGrid) {
      gridObserver.observe(repertoireGrid, {
        childList:true,
        subtree:true
      });
    }

    if (songsRanking) {
      gridObserver.observe(songsRanking, {
        childList:true,
        subtree:true
      });
    }
  }

  function setup() {
    ensureStyles();
    ensureVoteStyles();
    ensureVoteModal();
    renameSection();
    ensureSwitch();
    installVoteHandler();
    installUnifiedOpenHandler();
    observeDynamicContent();

    window.addEventListener('jm:demo-playback-state',event=>{
      const state=event.detail||demoPlaybackState();
      document.querySelectorAll('#repertoireGrid .repertoire-card').forEach(card=>syncCardPlayingState(card,state));
      syncDetailPlayer();
    });

    const userEntry=document.getElementById('userEntry');
    if(userEntry)new MutationObserver(()=>{if(isFanLogged()&&sessionStorage.getItem(PENDING_VOTE_KEY))scheduleVoteResume()}).observe(userEntry,{attributes:true,attributeFilter:['class']});

    window.JMSongs={
      openDetail:openSongDetail,
      loadDetail:(songId,options)=>loadSongDetail(songId,options),
      setView:view=>setView(view)
    };

    loadSongs().then(()=>{
      applyView();
      decorateAll();
      decorateHitRows();
    });
  }

  window.addEventListener(
    'jm:repertoire-rendered',
    () => {
      if(Array.isArray(window.JM_PUBLIC_DATA?.songs)){
        seedSongs(window.JM_PUBLIC_DATA.songs);
      }
      applyView();
      decorateAll();
      decorateHitRows();
    }
  );

  window.addEventListener(
    'jm:song-play-counted',
    event => {
      const id=String(event.detail?.song_id||'');
      if(!id)return;
      loadSongDetail(id,{force:true})
        .then(()=>{
          decorateAll();
          refreshOpenDetail();
        })
        .catch(error=>console.warn('Aggiornamento riproduzioni',error));
    }
  );

  window.addEventListener(
    'hashchange',
    () => {
      setTimeout(() => {
        applyView();
        decorateHitRows();
      },0);
    }
  );

  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      setup,
      {once:true}
    );
  } else {
    setup();
  }
})();
