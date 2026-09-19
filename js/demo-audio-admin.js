(() => {
  'use strict';

  const MEDIA_BUCKET='public-media';
  const DEMO_BUCKET='demo-audio';
  const LABEL_BUCKET='public-media';

  const q=(s,r=document)=>r.querySelector(s);
  const qa=(s,r=document)=>[...r.querySelectorAll(s)];
  const esc=value=>String(value??'').replace(/[&<>'"]/g,ch=>({
    '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'
  }[ch]));

  const isAdmin=()=>{
    try{return typeof isEma==='function'&&isEma()}catch{return false}
  };
  const isMember=()=>{
    try{return !!currentProfile?.id&&!!currentUser?.id}catch{return false}
  };

  const songList=()=>{
    try{return typeof songs!=='undefined'?songs:[]}catch{return[]}
  };

  function safeFile(name){
    return String(name||'demo')
      .replace(/\.[^.]+$/,'')
      .replace(/[^a-zA-Z0-9_-]+/g,'-')
      .replace(/^-+|-+$/g,'')
      .slice(0,45)||'demo';
  }

  function injectStyles(){
    if(document.getElementById('secureDemoAdminStyles'))return;
    const st=document.createElement('style');
    st.id='secureDemoAdminStyles';
    st.textContent=`
      .secure-demo-button.has-demo{border-color:rgba(126,205,145,.30)!important;color:#8ed7a0!important}
      .jukebox-label-button.has-label{border-color:rgba(243,210,52,.45)!important;color:#f3d234!important}
      .jukebox-label-manager{position:fixed;z-index:10000;right:12px;bottom:12px;width:min(420px,calc(100vw - 24px));padding:11px;border:1px solid #4a4f58;border-radius:12px;background:#171b22;box-shadow:0 12px 38px #000a}
      .jukebox-label-manager-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}
      .jukebox-label-manager-head strong{font-size:10px}
      .jukebox-label-preview{display:grid;place-items:center;min-height:84px;padding:8px;border:1px solid #444;background:#0c0d10}
      .jukebox-label-preview img{display:block;width:100%;max-height:120px;object-fit:contain}
      .jukebox-label-empty{color:#7f8791;font-size:8px;text-transform:uppercase;letter-spacing:.08em}
      .jukebox-label-note{margin-top:7px;color:#8f97a1;font-size:7px;line-height:1.4}
      .jukebox-label-actions{display:flex;gap:5px;flex-wrap:wrap;margin-top:8px}
      .secure-demo-player{position:fixed;z-index:9999;right:12px;bottom:12px;width:min(390px,calc(100vw - 24px));padding:11px;border:1px solid #4a4f58;border-radius:12px;background:#171b22;box-shadow:0 12px 38px #000a}
      .secure-demo-player-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}.secure-demo-player-head strong{font-size:10px}
      .secure-demo-player audio{width:100%;height:34px}.secure-demo-player-actions{display:flex;gap:5px;flex-wrap:wrap;margin-top:8px}
      .secure-demo-warning{margin-top:7px;padding:6px 8px;border:1px solid #765b26;border-radius:7px;background:#2d2616;color:#e6ca75;font-size:7px;line-height:1.4}
      .demo-cert-layout{display:grid;grid-template-columns:minmax(260px,.75fr) minmax(0,1.25fr);gap:8px}
      .demo-cert-form,.demo-code-form{display:grid;gap:8px;padding:10px;border:1px solid rgba(255,255,255,.08);border-radius:12px;background:rgba(255,255,255,.025)}
      .demo-cert-form label,.demo-code-form label{display:grid;gap:4px;color:#8d95a0;font-size:7px;font-weight:900}
      .demo-cert-form select,.demo-code-form input{width:100%;min-height:32px;padding:6px 8px;border:1px solid #414750;border-radius:7px;background:#171b22;color:#fff;font-size:9px}
      .demo-cert-form button,.demo-code-form button{min-height:31px;border:0;border-radius:7px;background:#f3d234;color:#111;font-size:8px;font-weight:950}
      .demo-cert-list,.demo-code-list{min-height:0;max-height:68vh;overflow:auto;border:1px solid rgba(255,255,255,.08);border-radius:12px}
      .demo-cert-row,.demo-code-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center;padding:8px;border-bottom:1px solid rgba(255,255,255,.06)}
      .demo-cert-row:last-child,.demo-code-row:last-child{border-bottom:0}
      .demo-cert-row strong,.demo-code-row strong{display:block;font-size:9px}.demo-cert-row span,.demo-code-row span{display:block;margin-top:2px;color:#838b97;font-size:7px;line-height:1.4}
      .demo-code-created{padding:9px;border:1px solid #6b5e1f;border-radius:8px;background:#292611;color:#f3d234;font:900 13px/1.4 monospace;letter-spacing:.08em;word-break:break-all}
      @media(max-width:850px){.demo-cert-layout{grid-template-columns:1fr}}
    `;
    document.head.appendChild(st);
  }

  async function signedUrl(song){
    const bucket=song.audio_bucket||MEDIA_BUCKET;
    if(!song.audio_path)return '';
    if(bucket===DEMO_BUCKET){
      const {data,error}=await sb.storage.from(DEMO_BUCKET).createSignedUrl(song.audio_path,1200);
      if(error)throw error;
      return data?.signedUrl||'';
    }
    return sb.storage.from(MEDIA_BUCKET).getPublicUrl(song.audio_path).data.publicUrl||'';
  }

  async function migrateLegacy(song,host){
    if(!isAdmin()||!song?.audio_path||song.audio_bucket===DEMO_BUCKET)return;
    const btn=q('[data-migrate]',host);
    if(btn)btn.disabled=true;
    try{
      const {data:blob,error:downloadError}=await sb.storage.from(song.audio_bucket||MEDIA_BUCKET).download(song.audio_path);
      if(downloadError)throw downloadError;

      const ext=(song.audio_path.split('.').pop()||'mp3').replace(/[^a-z0-9]/gi,'').toLowerCase()||'mp3';
      const next=`songs/${song.id}/${Date.now()}-legacy.${ext}`;
      const {error:uploadError}=await sb.storage.from(DEMO_BUCKET).upload(next,blob,{
        contentType:blob.type||'audio/mpeg',
        upsert:false
      });
      if(uploadError)throw uploadError;

      const oldBucket=song.audio_bucket||MEDIA_BUCKET;
      const oldPath=song.audio_path;
      const {error:updateError}=await sb.from('songs').update({
        audio_path:next,
        audio_bucket:DEMO_BUCKET,
        updated_at:new Date().toISOString()
      }).eq('id',song.id);
      if(updateError){
        await sb.storage.from(DEMO_BUCKET).remove([next]);
        throw updateError;
      }

      await sb.storage.from(oldBucket).remove([oldPath]);
      song.audio_path=next;
      song.audio_bucket=DEMO_BUCKET;

      if(typeof loadSongs==='function')await loadSongs();
      if(typeof renderCatalog==='function')renderCatalog();
      host.remove();
      setTimeout(refreshCatalogButtons,0);
    }catch(err){
      alert(err.message||String(err));
      if(btn)btn.disabled=false;
    }
  }

  async function uploadDemo(song,file,anchor){
    if(!isAdmin())return;
    if(!file||!String(file.type||'').startsWith('audio/'))return alert('Seleziona un file audio.');
    if(file.size>50*1024*1024)return alert('File massimo 50 MB.');

    anchor.disabled=true;
    const original=anchor.textContent;
    anchor.textContent='CARICO…';

    const ext=(file.name.split('.').pop()||'mp3').toLowerCase().replace(/[^a-z0-9]/g,'')||'mp3';
    const path=`songs/${song.id}/${Date.now()}-${safeFile(file.name)}.${ext}`;

    try{
      const {error:up}=await sb.storage.from(DEMO_BUCKET).upload(path,file,{
        contentType:file.type||undefined,
        upsert:false
      });
      if(up)throw up;

      const oldPath=song.audio_path||null;
      const oldBucket=song.audio_bucket||MEDIA_BUCKET;

      const {error:update}=await sb.from('songs').update({
        audio_path:path,
        audio_bucket:DEMO_BUCKET,
        updated_at:new Date().toISOString()
      }).eq('id',song.id);

      if(update){
        await sb.storage.from(DEMO_BUCKET).remove([path]);
        throw update;
      }

      if(oldPath)await sb.storage.from(oldBucket).remove([oldPath]);

      song.audio_path=path;
      song.audio_bucket=DEMO_BUCKET;

      if(typeof loadSongs==='function')await loadSongs();
      if(typeof renderCatalog==='function')renderCatalog();
      setTimeout(refreshCatalogButtons,0);
    }catch(err){
      alert(err.message||String(err));
    }finally{
      anchor.disabled=false;
      anchor.textContent=original;
    }
  }

  function chooseDemo(song,anchor){
    const input=document.createElement('input');
    input.type='file';
    input.accept='audio/*';
    input.hidden=true;
    document.body.appendChild(input);
    input.onchange=async()=>{
      const file=input.files?.[0];
      if(file)await uploadDemo(song,file,anchor);
      input.remove();
    };
    input.click();
  }

  async function removeDemo(song,host){
    if(!isAdmin()||!song?.audio_path)return;
    if(!confirm(`Rimuovere la demo di "${song.title}"?`))return;

    const bucket=song.audio_bucket||MEDIA_BUCKET;
    const path=song.audio_path;

    const {error}=await sb.from('songs').update({
      audio_path:null,
      audio_bucket:DEMO_BUCKET,
      updated_at:new Date().toISOString()
    }).eq('id',song.id);

    if(error)return alert(error.message);

    await sb.storage.from(bucket).remove([path]);
    song.audio_path=null;
    song.audio_bucket=DEMO_BUCKET;

    host.remove();
    if(typeof loadSongs==='function')await loadSongs();
    if(typeof renderCatalog==='function')renderCatalog();
    setTimeout(refreshCatalogButtons,0);
  }

  async function openPlayer(song,anchor){
    document.getElementById('secureDemoPlayer')?.remove();

    if(!song.audio_path){
      if(isAdmin())chooseDemo(song,anchor);
      return;
    }

    const legacy=(song.audio_bucket||MEDIA_BUCKET)!==DEMO_BUCKET;
    const pop=document.createElement('div');
    pop.id='secureDemoPlayer';
    pop.className='secure-demo-player';
    pop.innerHTML=`
      <div class="secure-demo-player-head">
        <strong>${esc(song.title)}</strong>
        <button type="button" data-close style="background:none;border:0;color:#ddd;font-size:18px">×</button>
      </div>
      <div data-demo-loading style="padding:7px 0;color:#9ca3ad;font-size:8px">Caricamento demo…</div>
      ${legacy?'<div class="secure-demo-warning">Demo precedente rilevata: il file è ancora nel vecchio bucket pubblico. Puoi ascoltarlo e poi usare “METTI AL SICURO”.</div>':''}
      <div class="secure-demo-player-actions">
        ${isAdmin()?`
          ${legacy?'<button type="button" class="small-btn primary" data-migrate>METTI AL SICURO</button>':''}
          <button type="button" class="small-btn" data-replace>SOSTITUISCI</button>
          <button type="button" class="small-btn danger" data-remove>RIMUOVI</button>
        `:''}
      </div>`;

    document.body.appendChild(pop);
    q('[data-close]',pop).onclick=()=>pop.remove();
    q('[data-replace]',pop)?.addEventListener('click',()=>{pop.remove();chooseDemo(song,anchor)});
    q('[data-remove]',pop)?.addEventListener('click',()=>removeDemo(song,pop));
    q('[data-migrate]',pop)?.addEventListener('click',()=>migrateLegacy(song,pop));

    try{
      const url=await signedUrl(song);
      if(!url)throw new Error('URL audio non disponibile.');
      const loading=q('[data-demo-loading]',pop);
      if(!loading)return;
      const audio=document.createElement('audio');
      audio.controls=true;
      audio.preload='none';
      audio.controlsList='nodownload';
      audio.src=url;
      audio.style.cssText='width:100%;height:34px';
      loading.replaceWith(audio);
    }catch(err){
      const loading=q('[data-demo-loading]',pop);
      if(loading){
        loading.textContent=`Errore audio: ${err.message||String(err)}`;
        loading.style.color='#e89a9a';
      }
    }
  }

  function refreshCatalogButtons(){
    if(!isMember())return;
    const box=document.getElementById('catalogList');
    if(!box)return;

    // Rimuove i vecchi pulsanti che usavano il bucket pubblico.
    qa('.catalog-audio-button',box).forEach(btn=>{
      if(!btn.classList.contains('secure-demo-button'))btn.remove();
    });

    const allSongs=[...songList()];
    const byId=new Map(allSongs.map(song=>[String(song.id),song]));
    const ordered=[...allSongs].sort((a,b)=>String(a.title||'').localeCompare(String(b.title||''),'it'));
    const rows=qa('.catalog-compact-row',box);

    rows.forEach((row,i)=>{
      const song=byId.get(String(row.dataset.songId||''))||ordered[i];
      if(!song)return;
      const actions=q('.row-buttons',row);
      if(!actions)return;

      let btn=q('.secure-demo-button',actions);
      if(!song.audio_path&&!isAdmin()){
        btn?.remove();
        return;
      }

      if(!btn){
        btn=document.createElement('button');
        btn.type='button';
        btn.className='small-btn catalog-audio-button secure-demo-button';
        actions.prepend(btn);
      }

      btn.dataset.catalogAudio=String(song.id);
      btn.onclick=e=>{
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        void openPlayer(song,btn);
      };

      btn.classList.toggle('has-demo',!!song.audio_path);
      btn.textContent=song.audio_path?'▶ DEMO':'+ DEMO';
      btn.title=song.audio_path
        ? ((song.audio_bucket||MEDIA_BUCKET)===DEMO_BUCKET
            ? 'Ascolta la demo privata'
            : 'Ascolta la vecchia demo e mettila al sicuro')
        : 'Carica una demo privata';

      if(isAdmin()){
        let labelBtn=q('.jukebox-label-button',actions);
        if(!labelBtn){
          labelBtn=document.createElement('button');
          labelBtn.type='button';
          labelBtn.className='small-btn jukebox-label-button';
          actions.prepend(labelBtn);
        }
        labelBtn.classList.toggle('has-label',!!song.jukebox_label_path);
        labelBtn.textContent=song.jukebox_label_path?'LABEL':' + LABEL';
        labelBtn.title=song.jukebox_label_path
          ? 'Anteprima / sostituisci etichetta Jukebox'
          : 'Carica etichetta Jukebox';
        labelBtn.onclick=e=>{
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          openJukeboxLabelManager(song,labelBtn);
        };
      }
    });
  }


  function jukeboxLabelUrl(song){
    if(!song?.jukebox_label_path)return '';
    try{
      return sb.storage.from(LABEL_BUCKET).getPublicUrl(song.jukebox_label_path).data.publicUrl||'';
    }catch{return ''}
  }

  async function uploadJukeboxLabel(song,file,anchor){
    if(!isAdmin())return;
    if(!file||!String(file.type||'').startsWith('image/'))return alert('Seleziona un file immagine.');
    if(file.size>8*1024*1024)return alert('Immagine massima 8 MB.');

    anchor.disabled=true;
    const original=anchor.textContent;
    anchor.textContent='CARICO…';

    const ext=(file.name.split('.').pop()||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'')||'jpg';
    const path=`jukebox-labels/${song.id}/${Date.now()}-${safeFile(file.name)}.${ext}`;

    try{
      const {error:up}=await sb.storage.from(LABEL_BUCKET).upload(path,file,{
        contentType:file.type||undefined,
        upsert:false
      });
      if(up)throw up;

      const oldPath=song.jukebox_label_path||null;
      const {error:update}=await sb.from('songs').update({
        jukebox_label_path:path,
        updated_at:new Date().toISOString()
      }).eq('id',song.id);

      if(update){
        await sb.storage.from(LABEL_BUCKET).remove([path]);
        throw update;
      }

      if(oldPath)await sb.storage.from(LABEL_BUCKET).remove([oldPath]);

      song.jukebox_label_path=path;
      if(typeof loadSongs==='function')await loadSongs();
      if(typeof renderCatalog==='function')renderCatalog();
      setTimeout(refreshCatalogButtons,0);
    }catch(err){
      alert(err.message||String(err));
    }finally{
      anchor.disabled=false;
      anchor.textContent=original;
    }
  }

  function chooseJukeboxLabel(song,anchor){
    const input=document.createElement('input');
    input.type='file';
    input.accept='image/*';
    input.hidden=true;
    document.body.appendChild(input);
    input.onchange=async()=>{
      const file=input.files?.[0];
      if(file)await uploadJukeboxLabel(song,file,anchor);
      input.remove();
    };
    input.click();
  }

  async function removeJukeboxLabel(song,panel){
    if(!isAdmin()||!song?.jukebox_label_path)return;
    if(!confirm(`Rimuovere l'etichetta Jukebox di "${song.title}"?`))return;

    const oldPath=song.jukebox_label_path;
    const {error}=await sb.from('songs').update({
      jukebox_label_path:null,
      updated_at:new Date().toISOString()
    }).eq('id',song.id);

    if(error)return alert(error.message);

    await sb.storage.from(LABEL_BUCKET).remove([oldPath]);
    song.jukebox_label_path=null;
    panel?.remove();

    if(typeof loadSongs==='function')await loadSongs();
    if(typeof renderCatalog==='function')renderCatalog();
    setTimeout(refreshCatalogButtons,0);
  }

  function openJukeboxLabelManager(song,anchor){
    document.getElementById('jukeboxLabelManager')?.remove();

    if(!song.jukebox_label_path){
      chooseJukeboxLabel(song,anchor);
      return;
    }

    const panel=document.createElement('div');
    panel.id='jukeboxLabelManager';
    panel.className='jukebox-label-manager';
    const src=jukeboxLabelUrl(song);

    panel.innerHTML=`
      <div class="jukebox-label-manager-head">
        <strong>ETICHETTA JUKEBOX · ${esc(song.title)}</strong>
        <button type="button" data-close style="background:none;border:0;color:#ddd;font-size:18px">×</button>
      </div>
      <div class="jukebox-label-preview">
        ${src?`<img src="${esc(src)}" alt="Etichetta Jukebox ${esc(song.title)}">`:'<span class="jukebox-label-empty">Etichetta non disponibile</span>'}
      </div>
      <div class="jukebox-label-note">Formato consigliato: immagine orizzontale larga, circa 6:1. Nel Jukebox viene adattata automaticamente allo slot.</div>
      <div class="jukebox-label-actions">
        <button type="button" class="small-btn primary" data-replace>SOSTITUISCI</button>
        <button type="button" class="small-btn danger" data-remove>RIMUOVI</button>
      </div>`;

    document.body.appendChild(panel);
    q('[data-close]',panel).onclick=()=>panel.remove();
    q('[data-replace]',panel).onclick=()=>{panel.remove();chooseJukeboxLabel(song,anchor)};
    q('[data-remove]',panel).onclick=()=>removeJukeboxLabel(song,panel);
  }

  function disableLegacyAudioUi(){
    const audioTab=q('[data-pm-tab="audio"]');
    const audioPane=q('[data-pm-pane="audio"]');
    if(audioTab)audioTab.hidden=true;
    if(audioPane){
      audioPane.hidden=true;
      audioPane.classList.remove('active');
    }
    const videoTab=q('[data-pm-tab="video"]');
    if(audioTab?.classList.contains('active')){
      audioTab.classList.remove('active');
      videoTab?.click();
    }
  }

  function createCertificationPage(){
    if(document.getElementById('demoCertificationPage'))return;
    const nav=document.getElementById('memberNav');
    const main=q('#memberApp main');
    if(!nav||!main)return;

    const button=document.createElement('button');
    button.id='demoCertificationNav';
    button.className='nav-button';
    button.dataset.category='management';
    button.dataset.page='demoCertificationPage';
    button.type='button';
    button.textContent='PRESENZE DEMO';

    const availability=document.getElementById('bandAvailabilityNav');
    if(availability)availability.before(button);
    else nav.appendChild(button);

    const page=document.createElement('section');
    page.id='demoCertificationPage';
    page.className='page';
    page.innerHTML=`
      <div class="panel-header">
        <h2>CERTIFICAZIONE PRESENZE FAN</h2>
        <span class="counter" id="demoCertStatus"></span>
      </div>
      <div class="demo-cert-layout">
        <form class="demo-cert-form" id="demoCertForm">
          <div class="section-note">Il semplice “Io c’ero” del fan non sblocca le demo. Un membro della band deve certificare almeno una presenza reale.</div>
          <label>FAN
            <select id="demoCertFan" required><option value="">Seleziona fan…</option></select>
          </label>
          <label>CONCERTO
            <select id="demoCertConcert" required><option value="">Seleziona concerto…</option></select>
          </label>
          <button type="submit">CERTIFICA PRESENZA</button>
        </form>
        <div class="demo-cert-list" id="demoCertList"></div>
      </div>`;
    main.appendChild(page);

    button.onclick=openCertificationPage;
    q('#demoCertForm',page).onsubmit=certifyPresence;
  }

  async function loadCertifications(){
    const [fans,concerts,certs]=await Promise.all([
      sb.rpc('member_list_demo_fans'),
      sb.rpc('member_list_demo_concerts'),
      sb.rpc('member_list_demo_certifications')
    ]);

    if(fans.error)throw fans.error;
    if(concerts.error)throw concerts.error;
    if(certs.error)throw certs.error;

    q('#demoCertFan').innerHTML='<option value="">Seleziona fan…</option>'+
      (fans.data||[]).map(x=>`<option value="${esc(x.fan_id)}">${esc(x.fan_name)}</option>`).join('');

    q('#demoCertConcert').innerHTML='<option value="">Seleziona concerto…</option>'+
      (concerts.data||[]).map(x=>`<option value="${esc(x.concert_id)}">${esc(new Date(x.concert_date+'T12:00:00').toLocaleDateString('it-IT'))} · ${esc(x.concert_name)}</option>`).join('');

    const list=q('#demoCertList');
    list.innerHTML=(certs.data||[]).map(x=>`
      <div class="demo-cert-row">
        <div>
          <strong>${esc(x.fan_name)} · ${esc(x.concert_name)}</strong>
          <span>${esc(new Date(x.concert_date+'T12:00:00').toLocaleDateString('it-IT'))} · certificata da ${esc(x.certified_by_name||'Membro')}</span>
        </div>
        ${isAdmin()?`<button class="small-btn danger" type="button" data-revoke-fan="${esc(x.fan_id)}" data-revoke-concert="${esc(x.concert_id)}">REVOCA</button>`:''}
      </div>`).join('')||'<div class="empty">Nessuna presenza certificata.</div>';

    qa('[data-revoke-fan]',list).forEach(btn=>btn.onclick=async()=>{
      if(!confirm('Revocare questa certificazione? La presenza dichiarata dal fan resterà registrata.'))return;
      const {error}=await sb.rpc('admin_revoke_demo_certification',{
        p_fan_id:btn.dataset.revokeFan,
        p_concert_id:btn.dataset.revokeConcert
      });
      if(error)return alert(error.message);
      await loadCertifications();
    });

    q('#demoCertStatus').textContent=`${(certs.data||[]).length} CERTIFICATE`;
  }

  async function openCertificationPage(){
    if(!isMember())return;
    q('#memberNav')?.querySelectorAll('.nav-button').forEach(b=>b.classList.remove('active'));
    q('#demoCertificationNav')?.classList.add('active');
    qa('#memberApp main .page').forEach(p=>p.classList.remove('active'));
    q('#demoCertificationPage')?.classList.add('active');
    try{window.setMemberCategory?.('management',{activate:false})}catch{}
    try{await loadCertifications()}catch(err){alert(err.message||String(err))}
  }

  async function certifyPresence(e){
    e.preventDefault();
    const fan=q('#demoCertFan').value;
    const concert=q('#demoCertConcert').value;
    if(!fan||!concert)return;

    const btn=e.currentTarget.querySelector('button[type="submit"]');
    btn.disabled=true;
    try{
      const {error}=await sb.rpc('member_certify_fan_attendance',{
        p_fan_id:fan,
        p_concert_id:concert
      });
      if(error)throw error;
      await loadCertifications();
    }catch(err){
      alert(err.message||String(err));
    }finally{
      btn.disabled=false;
    }
  }

  function randomCode(){
    const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const part=()=>Array.from({length:4},()=>alphabet[Math.floor(Math.random()*alphabet.length)]).join('');
    return `MOLESTI-${part()}-${part()}`;
  }

  function createCodesPage(){
    if(!isAdmin()||document.getElementById('demoCodesPage'))return;

    const nav=document.getElementById('memberNav');
    const main=q('#memberApp main');
    if(!nav||!main)return;

    const button=document.createElement('button');
    button.id='demoCodesNav';
    button.className='nav-button';
    button.dataset.category='management';
    button.dataset.page='demoCodesPage';
    button.type='button';
    button.textContent='CODICI DEMO';

    const media=document.getElementById('publicMediaAdminNav');
    if(media)media.after(button);
    else nav.appendChild(button);

    const page=document.createElement('section');
    page.id='demoCodesPage';
    page.className='page';
    page.innerHTML=`
      <div class="panel-header"><h2>CODICI SBLOCCO DEMO</h2><span class="counter" id="demoCodeStatus"></span></div>
      <div class="demo-cert-layout">
        <form class="demo-code-form" id="demoCodeForm">
          <div class="section-note">Il codice può essere dato anche a chi non è registrato come fan. Lo sblocco resta associato a quel browser finché il codice rimane attivo.</div>
          <label>CODICE
            <div style="display:grid;grid-template-columns:minmax(0,1fr) auto;gap:5px">
              <input id="demoCodeValue" required maxlength="64" autocomplete="off">
              <button id="demoGenerateCode" type="button">GENERA</button>
            </div>
          </label>
          <label>ETICHETTA / NOTA
            <input id="demoCodeLabel" maxlength="160" placeholder="Es. amici Vaccarino">
          </label>
          <label>MAX UTILIZZI
            <input id="demoCodeMaxUses" type="number" min="1" placeholder="vuoto = illimitato">
          </label>
          <label>SCADENZA
            <input id="demoCodeExpires" type="datetime-local">
          </label>
          <button type="submit">CREA CODICE</button>
          <div id="demoCodeCreated"></div>
        </form>
        <div class="demo-code-list" id="demoCodeList"></div>
      </div>`;
    main.appendChild(page);

    button.onclick=openCodesPage;
    q('#demoGenerateCode',page).onclick=()=>q('#demoCodeValue').value=randomCode();
    q('#demoCodeForm',page).onsubmit=createCode;
  }

  async function loadCodes(){
    const {data,error}=await sb.rpc('admin_list_demo_unlock_codes');
    if(error)throw error;

    const list=q('#demoCodeList');
    list.innerHTML=(data||[]).map(x=>{
      const expired=x.expires_at&&Date.parse(x.expires_at)<=Date.now();
      const state=!x.active?'DISATTIVATO':expired?'SCADUTO':'ATTIVO';
      return `<div class="demo-code-row">
        <div>
          <strong>${esc(x.label||'Codice demo')} · ••••${esc(x.code_hint)}</strong>
          <span>${state} · usi ${Number(x.uses||0)}${x.max_uses!=null?'/'+Number(x.max_uses):''}${x.expires_at?' · scade '+esc(new Date(x.expires_at).toLocaleString('it-IT')):''}</span>
        </div>
        <button class="small-btn" type="button" data-code-id="${esc(x.id)}" data-code-active="${x.active?'1':'0'}">${x.active?'DISATTIVA':'RIATTIVA'}</button>
      </div>`;
    }).join('')||'<div class="empty">Nessun codice creato.</div>';

    qa('[data-code-id]',list).forEach(btn=>btn.onclick=async()=>{
      const {error}=await sb.rpc('admin_set_demo_unlock_code_active',{
        p_id:btn.dataset.codeId,
        p_active:btn.dataset.codeActive!=='1'
      });
      if(error)return alert(error.message);
      await loadCodes();
    });

    q('#demoCodeStatus').textContent=`${(data||[]).length} CODICI`;
  }

  async function openCodesPage(){
    if(!isAdmin())return;
    q('#memberNav')?.querySelectorAll('.nav-button').forEach(b=>b.classList.remove('active'));
    q('#demoCodesNav')?.classList.add('active');
    qa('#memberApp main .page').forEach(p=>p.classList.remove('active'));
    q('#demoCodesPage')?.classList.add('active');
    try{window.setMemberCategory?.('management',{activate:false})}catch{}
    try{await loadCodes()}catch(err){alert(err.message||String(err))}
  }

  async function createCode(e){
    e.preventDefault();
    const code=q('#demoCodeValue').value.trim();
    const label=q('#demoCodeLabel').value.trim();
    const maxRaw=q('#demoCodeMaxUses').value;
    const expRaw=q('#demoCodeExpires').value;

    const {error}=await sb.rpc('admin_create_demo_unlock_code',{
      p_code:code,
      p_label:label,
      p_max_uses:maxRaw?Number(maxRaw):null,
      p_expires_at:expRaw?new Date(expRaw).toISOString():null
    });

    if(error)return alert(error.message);

    q('#demoCodeCreated').innerHTML=`<div class="demo-code-created">${esc(code.toUpperCase())}</div><div class="section-note" style="margin-top:5px">Copialo ora: per sicurezza il codice completo non viene più mostrato in elenco.</div>`;
    e.currentTarget.reset();
    q('#demoCodeValue').value=randomCode();
    await loadCodes();
  }

  function boot(){
    if(typeof sb==='undefined')return;
    injectStyles();

    // Il vecchio pannello audio pubblico non deve più essere usato.
    disableLegacyAudioUi();

    createCertificationPage();
    if(isAdmin())createCodesPage();

    const catalog=document.getElementById('catalogList');
    if(catalog){
      new MutationObserver(()=>setTimeout(refreshCatalogButtons,0))
        .observe(catalog,{childList:true,subtree:true});
    }

    setTimeout(refreshCatalogButtons,0);

    // La UI amministrativa può comparire dopo il login.
    const app=document.getElementById('memberApp');
    if(app){
      new MutationObserver(()=>{
        disableLegacyAudioUi();
        if(isMember())createCertificationPage();
        if(isAdmin())createCodesPage();
        setTimeout(refreshCatalogButtons,0);
      }).observe(app,{attributes:true,attributeFilter:['hidden']});
    }
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
