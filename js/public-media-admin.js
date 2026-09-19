(() => {
  'use strict';

  const PAGE_ID='publicMediaAdminPage';
  const NAV_ID='publicMediaAdminNav';
  const BUCKET='public-media';
  const state={songs:[],media:[],tab:'audio',busy:false,availability:[],requests:[],requestDates:[],availabilityMonth:new Date(new Date().getFullYear(),new Date().getMonth(),1),selectedAvailability:new Set()};

  const q=(sel,root=document)=>root.querySelector(sel);
  const qa=(sel,root=document)=>[...root.querySelectorAll(sel)];
  const escHtml=value=>String(value??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  const safeHttps=value=>{try{const u=new URL(String(value||''));return u.protocol==='https:'?u.href:''}catch{return ''}};
  const isAdmin=()=>{try{return typeof isEma==='function'&&isEma()}catch{return false}};
  const publicUrl=(bucket,path)=>{if(!path)return'';try{return sb.storage.from(bucket).getPublicUrl(path).data.publicUrl||''}catch{return''}};
  const fileSafe=name=>String(name||'file').replace(/\.[^.]+$/,'').replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,45)||'file';

  function injectStyles(){
    if(document.getElementById('publicMediaAdminStyles'))return;
    const style=document.createElement('style');
    style.id='publicMediaAdminStyles';
    style.textContent=`
      #${PAGE_ID}.active{height:100%;min-height:0;display:flex!important;flex-direction:column;gap:8px;overflow:hidden}
      .pm-tabs{display:flex;gap:4px;padding:4px;border:1px solid rgba(255,255,255,.08);border-radius:12px;background:rgba(255,255,255,.025);width:max-content;max-width:100%;overflow:auto}
      .pm-tabs button{min-height:31px;padding:6px 11px;border:1px solid transparent;border-radius:9px;background:transparent;color:#8e96a2;font-size:8px;font-weight:950;letter-spacing:.06em;white-space:nowrap}
      .pm-tabs button.active{border-color:rgba(243,210,52,.35);background:rgba(243,210,52,.12);color:#f3d234}
      .pm-pane{display:none;min-height:0;flex:1;overflow:hidden}.pm-pane.active{display:flex;flex-direction:column}
      .pm-toolbar{display:grid;grid-template-columns:minmax(120px,1fr) minmax(180px,1.4fr) minmax(120px,1fr) 78px auto auto;gap:6px;align-items:center;padding:8px;border:1px solid rgba(255,255,255,.08);border-radius:12px;background:rgba(255,255,255,.025);margin-bottom:8px}
      .pm-toolbar.photo{grid-template-columns:minmax(120px,1fr) minmax(180px,1.5fr) minmax(150px,1fr) 78px auto auto}
      .pm-toolbar input,.pm-toolbar textarea{min-width:0;width:100%;padding:7px 8px;border:1px solid #414651;border-radius:8px;background:#171b22;color:#edf0f5;font-size:9px}
      .pm-toolbar textarea{height:34px;resize:vertical}
      .pm-toolbar label{display:flex;align-items:center;gap:5px;color:#8e96a2;font-size:7px;font-weight:850}
      .pm-toolbar button,.pm-action{min-height:30px;padding:6px 9px;border:1px solid rgba(255,255,255,.12);border-radius:8px;background:#2a2f38;color:#e8ebef;font-size:7px;font-weight:900}
      .pm-toolbar button.primary{background:#f3d234;color:#111;border-color:#f3d234}
      .pm-list{min-height:0;overflow:auto;border:1px solid rgba(255,255,255,.08);border-radius:12px;background:rgba(255,255,255,.018)}
      .pm-audio-row{display:grid;grid-template-columns:minmax(180px,1fr) minmax(190px,.8fr) minmax(190px,.9fr) auto;gap:8px;align-items:center;padding:8px;border-bottom:1px solid rgba(255,255,255,.06)}
      .pm-audio-row:last-child,.pm-media-row:last-child{border-bottom:0}
      .pm-song-id{display:grid;grid-template-columns:34px minmax(0,1fr);gap:7px;align-items:center;min-width:0}
      .pm-song-cover{width:34px;height:34px;border-radius:7px;object-fit:cover;background:#111}
      .pm-song-copy{min-width:0}.pm-song-copy strong{display:block;font-size:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.pm-song-copy small{display:block;margin-top:2px;color:#747c87;font-size:7px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .pm-audio-control{min-width:0}.pm-audio-control audio{width:100%;height:30px}.pm-audio-control small{color:#6f7782;font-size:7px}
      .pm-spotify{display:flex;gap:5px;min-width:0}.pm-spotify input{min-width:0;width:100%;padding:6px;border:1px solid #414651;border-radius:7px;background:#171b22;color:#edf0f5;font-size:8px}
      .pm-row-actions{display:flex;gap:4px;align-items:center;justify-content:flex-end}.pm-row-actions input[type=file]{max-width:150px;color:#8e96a2;font-size:7px}
      .pm-media-row{display:grid;grid-template-columns:54px minmax(0,1fr) 80px auto;gap:8px;align-items:center;padding:8px;border-bottom:1px solid rgba(255,255,255,.06)}
      .pm-media-thumb{width:54px;height:42px;border-radius:7px;object-fit:cover;background:#0d1016}
      .pm-media-link{display:grid;place-items:center;width:54px;height:42px;border-radius:7px;background:#0d1016;color:#f3d234;font-size:7px;text-align:center}
      .pm-media-copy{min-width:0}.pm-media-copy strong{display:block;font-size:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.pm-media-copy span{display:block;margin-top:2px;color:#808894;font-size:7px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.pm-media-copy small{display:block;margin-top:3px;color:#69717d;font-size:6px}
      .pm-published{font-size:7px;font-weight:900}.pm-published.yes{color:#7fcf91}.pm-published.no{color:#bf7a7a}
      .pm-empty{padding:25px;text-align:center;color:#6f7782;font-size:9px}
      .pm-status{min-height:20px;padding:4px 2px;color:#9ba2ad;font-size:8px}
      @media(max-width:900px){
        .pm-toolbar,.pm-toolbar.photo{grid-template-columns:1fr 1fr}.pm-toolbar textarea,.pm-toolbar input[type=url]{grid-column:1/-1}
        .pm-audio-row{grid-template-columns:1fr}.pm-row-actions{justify-content:flex-start;flex-wrap:wrap}.pm-row-actions input[type=file]{max-width:100%}
        .pm-media-row{grid-template-columns:46px minmax(0,1fr)}.pm-media-row>.pm-published,.pm-media-row>.pm-row-actions{grid-column:2}.pm-row-actions{justify-content:flex-start}
      }
      .catalog-audio-button.has-audio{border-color:rgba(126,205,145,.28)!important;color:#8ed7a0!important}.catalog-audio-file{display:none!important}
      .pm-availability-grid{display:grid;grid-template-columns:minmax(270px,.7fr) minmax(0,1.3fr);gap:9px;min-height:0;flex:1}.pm-calendar-card,.pm-availability-list-card,.pm-booking-list-card{min-height:0;border:1px solid rgba(255,255,255,.08);border-radius:12px;background:rgba(255,255,255,.025);overflow:hidden}.pm-card-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px;border-bottom:1px solid rgba(255,255,255,.07)}.pm-card-head strong{font-size:9px}.pm-calendar-head{display:grid;grid-template-columns:30px 1fr 30px;gap:5px;align-items:center;padding:8px}.pm-calendar-head button{height:28px;border:1px solid #404650;border-radius:7px;background:#252a32;color:#ddd}.pm-calendar-head strong{text-align:center;font-size:8px}.pm-weekdays,.pm-days{display:grid;grid-template-columns:repeat(7,1fr);gap:3px;padding:0 8px}.pm-weekdays span{text-align:center;color:#6f7782;font-size:6px;font-weight:900}.pm-day{min-height:32px;border:1px solid rgba(255,255,255,.08);border-radius:6px;background:#1b2027;color:#c8ced7;font-size:8px;font-weight:900}.pm-day.selected{border-color:#f3d234;background:rgba(243,210,52,.12);color:#f3d234}.pm-day.global-block{background:rgba(197,87,87,.12);color:#d89393}.pm-day.personal{box-shadow:inset 0 -2px 0 #7f8cd2}.pm-calendar-actions{display:grid;gap:6px;padding:8px}.pm-calendar-actions input{width:100%;padding:7px;border:1px solid #404650;border-radius:7px;background:#171b22;color:#fff;font-size:8px}.pm-calendar-actions button{min-height:30px;border:0;border-radius:7px;background:#f3d234;color:#111;font-size:8px;font-weight:950}.pm-unavailability-list,.pm-booking-list{min-height:0;max-height:100%;overflow:auto}.pm-unavailability-row{display:grid;grid-template-columns:90px minmax(0,1fr) auto;gap:7px;align-items:center;padding:8px;border-bottom:1px solid rgba(255,255,255,.06)}.pm-unavailability-row strong{font-size:8px}.pm-unavailability-row span{font-size:7px;color:#838b96}.pm-unavailability-actions{display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end}.pm-request-card{padding:10px;border-bottom:1px solid rgba(255,255,255,.07)}.pm-request-head{display:flex;justify-content:space-between;gap:8px}.pm-request-head strong{font-size:10px}.pm-request-head span{font-size:7px;color:#8b939f}.pm-request-meta{margin-top:5px;color:#9aa2ad;font-size:8px;line-height:1.45}.pm-request-dates{display:flex;flex-wrap:wrap;gap:4px;margin-top:7px}.pm-request-date{display:flex;align-items:center;gap:4px;padding:4px 6px;border:1px solid #3d444f;border-radius:7px;background:#20252c;color:#bfc5cf;font-size:7px}.pm-request-date.accepted{border-color:#4f8d61;color:#8fd49f}.pm-request-date.declined{opacity:.5}.pm-request-actions{display:flex;gap:5px;flex-wrap:wrap;margin-top:8px}.pm-status-pill{padding:3px 6px;border-radius:99px;background:#343a43;font-size:6px;font-weight:950}.pm-status-pill.accepted{background:#244b31;color:#9bdfad}.pm-status-pill.declined{background:#4a2b2b;color:#dda0a0}
      @media(max-width:900px){.pm-availability-grid{grid-template-columns:1fr}.pm-unavailability-row{grid-template-columns:72px minmax(0,1fr)}.pm-unavailability-actions{grid-column:2;justify-content:flex-start}}
    `;
    document.head.appendChild(style);
  }

  function injectUi(){
    if(document.getElementById(PAGE_ID))return;
    injectStyles();
    const nav=document.getElementById('memberNav');
    const main=document.querySelector('#memberApp main');
    if(!nav||!main)return;

    const btn=document.createElement('button');
    btn.id=NAV_ID;
    btn.type='button';
    btn.className='nav-button hidden';
    btn.dataset.category='management';
    btn.dataset.page=PAGE_ID;
    btn.textContent='MEDIA PUBBLICI';
    const cash=nav.querySelector('[data-page="cashPage"]');
    cash?.after(btn);
    if(!cash)nav.appendChild(btn);

    const page=document.createElement('section');
    page.id=PAGE_ID;
    page.className='page';
    page.innerHTML=`
      <div class="pm-tabs" role="tablist" aria-label="Media pubblici">
        <button type="button" class="active" data-pm-tab="audio">AUDIO BRANI</button>
        <button type="button" data-pm-tab="video">VIDEO</button>
        <button type="button" data-pm-tab="photo">FOTO</button>
      </div>

      <section class="pm-pane active" data-pm-pane="audio">
        <div class="panel-header"><h2>AUDIO REPERTORIO</h2><span class="counter" id="pmAudioCount"></span></div>
        <div class="pm-list" id="pmAudioList"></div>
      </section>

      <section class="pm-pane" data-pm-pane="video">
        <form class="pm-toolbar" id="pmVideoForm">
          <input id="pmVideoTitle" placeholder="Titolo video" maxlength="160" required>
          <input id="pmVideoUrl" type="url" placeholder="https://youtube.com/..." required>
          <input id="pmVideoCaption" placeholder="Didascalia (opzionale)" maxlength="1000">
          <input id="pmVideoOrder" type="number" value="0" step="1" title="Ordine">
          <label><input id="pmVideoPublished" type="checkbox" checked> Pubblico</label>
          <button class="primary" type="submit">+ VIDEO</button>
        </form>
        <div class="pm-list" id="pmVideoList"></div>
      </section>

      <section class="pm-pane" data-pm-pane="photo">
        <form class="pm-toolbar photo" id="pmPhotoForm">
          <input id="pmPhotoTitle" placeholder="Titolo foto" maxlength="160" required>
          <input id="pmPhotoCaption" placeholder="Didascalia (opzionale)" maxlength="1000">
          <input id="pmPhotoFile" type="file" accept="image/jpeg,image/png,image/webp" required>
          <input id="pmPhotoOrder" type="number" value="0" step="1" title="Ordine">
          <label><input id="pmPhotoPublished" type="checkbox" checked> Pubblica</label>
          <button class="primary" type="submit">+ FOTO</button>
        </form>
        <div class="pm-list" id="pmPhotoList"></div>
      </section>
      <div class="pm-status" id="pmStatus"></div>`;
    main.appendChild(page);

    const availabilityBtn=document.createElement('button');
    availabilityBtn.id='bandAvailabilityNav';availabilityBtn.type='button';availabilityBtn.className='nav-button';availabilityBtn.dataset.category='management';availabilityBtn.dataset.page='bandAvailabilityPage';availabilityBtn.textContent='DISPONIBILITÀ';
    btn.before(availabilityBtn);
    const availabilityPage=document.createElement('section');availabilityPage.id='bandAvailabilityPage';availabilityPage.className='page';availabilityPage.innerHTML=`<div class="panel-header"><h2>DISPONIBILITÀ BAND</h2><span class="counter" id="pmAvailabilityStatus"></span></div><div class="pm-availability-grid"><section class="pm-calendar-card"><div class="pm-card-head"><strong>LA MIA INDISPONIBILITÀ</strong><span class="counter">selezione multipla</span></div><div class="pm-calendar-head"><button id="pmAvailabilityPrev" type="button">←</button><strong id="pmAvailabilityMonth"></strong><button id="pmAvailabilityNext" type="button">→</button></div><div class="pm-weekdays"><span>L</span><span>M</span><span>M</span><span>G</span><span>V</span><span>S</span><span>D</span></div><div class="pm-days" id="pmAvailabilityDays"></div><div class="pm-calendar-actions"><input id="pmAvailabilityNote" maxlength="500" placeholder="Nota facoltativa"><button id="pmSaveAvailability" type="button">SEGNA COME INDISPONIBILE</button></div></section><section class="pm-availability-list-card"><div class="pm-card-head"><strong id="pmAvailabilityListTitle">INDISPONIBILITÀ</strong><span class="counter">gli admin possono bloccare la band</span></div><div class="pm-unavailability-list" id="pmAvailabilityList"></div></section></div>`;
    main.appendChild(availabilityPage);

    const bookingBtn=document.createElement('button');bookingBtn.id='bookingAdminNav';bookingBtn.type='button';bookingBtn.className='nav-button hidden';bookingBtn.dataset.category='management';bookingBtn.dataset.page='bookingAdminPage';bookingBtn.textContent='PRENOTAZIONI';availabilityBtn.after(bookingBtn);
    const bookingPage=document.createElement('section');bookingPage.id='bookingAdminPage';bookingPage.className='page';bookingPage.innerHTML=`<div class="panel-header"><h2>RICHIESTE DI BOOKING</h2><div class="panel-header-actions"><span class="counter" id="pmBookingCounter"></span><button class="small-btn" id="pmReloadBookings" type="button">AGGIORNA</button></div></div><section class="pm-booking-list-card"><div class="pm-booking-list" id="pmBookingList"></div></section>`;main.appendChild(bookingPage);

    availabilityBtn.addEventListener('click',openAvailabilityPage);bookingBtn.addEventListener('click',openBookingPage);
    q('#pmAvailabilityPrev').onclick=()=>{state.availabilityMonth=new Date(state.availabilityMonth.getFullYear(),state.availabilityMonth.getMonth()-1,1);renderAvailabilityCalendar()};
    q('#pmAvailabilityNext').onclick=()=>{state.availabilityMonth=new Date(state.availabilityMonth.getFullYear(),state.availabilityMonth.getMonth()+1,1);renderAvailabilityCalendar()};
    q('#pmSaveAvailability').onclick=savePersonalAvailability;q('#pmReloadBookings').onclick=loadBookingAdmin;

    btn.addEventListener('click',openPage);
    qa('[data-pm-tab]',page).forEach(tab=>tab.addEventListener('click',()=>setTab(tab.dataset.pmTab)));
    q('#pmVideoForm',page).addEventListener('submit',addVideo);
    q('#pmPhotoForm',page).addEventListener('submit',addPhoto);

    const memberApp=document.getElementById('memberApp');
    const sync=()=>{btn.classList.toggle('hidden',!isAdmin());bookingBtn.classList.toggle('hidden',!isAdmin());};
    sync();
    if(memberApp)new MutationObserver(sync).observe(memberApp,{attributes:true,attributeFilter:['hidden']});
  }

  function setTab(key){
    state.tab=key;
    qa('[data-pm-tab]').forEach(b=>b.classList.toggle('active',b.dataset.pmTab===key));
    qa('[data-pm-pane]').forEach(p=>p.classList.toggle('active',p.dataset.pmPane===key));
  }

  async function openPage(){
    if(!isAdmin())return;
    const nav=document.getElementById('memberNav');
    nav?.querySelectorAll('.nav-button').forEach(b=>b.classList.remove('active'));
    document.getElementById(NAV_ID)?.classList.add('active');
    document.querySelectorAll('#memberApp main .page').forEach(p=>p.classList.remove('active'));
    document.getElementById(PAGE_ID)?.classList.add('active');
    try{window.setMemberCategory?.('management',{activate:false})}catch{}
    await loadAll();
  }

  function status(message,error=false){
    const el=document.getElementById('pmStatus');if(!el)return;
    el.textContent=message||'';
    el.style.color=error?'#d98181':'';
  }

  async function loadAll(){
    status('Caricamento…');
    const [songsRes,mediaRes]=await Promise.all([
      sb.from('songs').select('id,title,base_artist,lyrics_artist,cover_path,audio_path,spotify_url,active').order('title'),
      sb.from('public_media').select('*').order('sort_order',{ascending:true}).order('created_at',{ascending:false})
    ]);
    if(songsRes.error){status(songsRes.error.message,true);return}
    if(mediaRes.error){status(mediaRes.error.message,true);return}
    state.songs=songsRes.data||[];
    state.media=mediaRes.data||[];
    renderAudio();
    renderMedia();
    status('');
  }

  function renderAudio(){
    const box=document.getElementById('pmAudioList');if(!box)return;
    const rows=state.songs.filter(s=>s.active!==false);
    document.getElementById('pmAudioCount').textContent=`${rows.length} BRANI`;
    box.innerHTML=rows.map(song=>{
      const cover=publicUrl('concert-posters',song.cover_path);
      const audio=publicUrl(BUCKET,song.audio_path);
      return `<article class="pm-audio-row" data-pm-song="${escHtml(song.id)}">
        <div class="pm-song-id">${cover?`<img class="pm-song-cover" src="${escHtml(cover)}" alt="">`:'<span class="pm-song-cover"></span>'}<div class="pm-song-copy"><strong>${escHtml(song.title)}</strong><small>${escHtml([song.base_artist,song.lyrics_artist].filter(Boolean).join(' / '))}</small></div></div>
        <div class="pm-audio-control">${audio?`<audio controls preload="none" src="${escHtml(audio)}"></audio>`:'<small>Nessun file audio</small>'}</div>
        <div class="pm-spotify"><input type="url" class="pm-spotify-input" value="${escHtml(song.spotify_url||'')}" placeholder="Link Spotify futuro"><button class="pm-action" type="button" data-save-spotify>SALVA</button></div>
        <div class="pm-row-actions"><input type="file" accept="audio/*" data-audio-file><button class="pm-action" type="button" data-remove-audio ${song.audio_path?'':'disabled'}>RIMUOVI AUDIO</button></div>
      </article>`;
    }).join('')||'<div class="pm-empty">Nessun brano attivo.</div>';

    qa('[data-pm-song]',box).forEach(row=>{
      const song=state.songs.find(s=>String(s.id)===row.dataset.pmSong);
      q('[data-audio-file]',row)?.addEventListener('change',e=>uploadSongAudio(song,e.target.files?.[0],e.target));
      q('[data-remove-audio]',row)?.addEventListener('click',()=>removeSongAudio(song));
      q('[data-save-spotify]',row)?.addEventListener('click',()=>saveSpotify(song,q('.pm-spotify-input',row)?.value||''));
    });
  }

  async function uploadSongAudio(song,file,input){
    if(!song||!file)return;
    if(!String(file.type||'').startsWith('audio/')){status('Seleziona un file audio.',true);input.value='';return}
    if(file.size>50*1024*1024){status('File audio troppo grande: massimo 50 MB.',true);input.value='';return}
    input.disabled=true;status(`Caricamento audio: ${song.title}…`);
    const ext=(file.name.split('.').pop()||'mp3').toLowerCase().replace(/[^a-z0-9]/g,'')||'mp3';
    const path=`song-audio/${song.id}/${Date.now()}-${fileSafe(file.name)}.${ext}`;
    try{
      const {error:uploadError}=await sb.storage.from(BUCKET).upload(path,file,{contentType:file.type||undefined,upsert:false});
      if(uploadError)throw uploadError;
      const old=song.audio_path||null;
      const {error:updateError}=await sb.from('songs').update({audio_path:path,updated_at:new Date().toISOString()}).eq('id',song.id);
      if(updateError){await sb.storage.from(BUCKET).remove([path]);throw updateError}
      if(old&&old!==path)await sb.storage.from(BUCKET).remove([old]);
      song.audio_path=path;status('Audio pubblicato ✓');renderAudio();
    }catch(err){status(err.message||String(err),true)}
    finally{input.disabled=false;input.value=''}
  }

  async function removeSongAudio(song){
    if(!song?.audio_path||!confirm(`Rimuovere l'audio di "${song.title}"?`))return;
    const old=song.audio_path;status('Rimozione audio…');
    const {error}=await sb.from('songs').update({audio_path:null,updated_at:new Date().toISOString()}).eq('id',song.id);
    if(error){status(error.message,true);return}
    await sb.storage.from(BUCKET).remove([old]);
    song.audio_path=null;status('Audio rimosso ✓');renderAudio();
  }

  async function saveSpotify(song,value){
    if(!song)return;
    const url=String(value||'').trim();
    if(url&&!safeHttps(url)){status('Il link Spotify deve essere https://',true);return}
    status('Salvataggio link…');
    const {error}=await sb.from('songs').update({spotify_url:url||null,updated_at:new Date().toISOString()}).eq('id',song.id);
    if(error){status(error.message,true);return}
    song.spotify_url=url||null;status('Link salvato ✓');
  }

  function renderMedia(){
    renderMediaKind('video','pmVideoList');
    renderMediaKind('photo','pmPhotoList');
  }

  function renderMediaKind(kind,id){
    const box=document.getElementById(id);if(!box)return;
    const rows=state.media.filter(x=>x.kind===kind);
    box.innerHTML=rows.map(item=>{
      const src=kind==='photo'?publicUrl(BUCKET,item.storage_path):'';
      const visual=kind==='photo'
        ? `<img class="pm-media-thumb" src="${escHtml(src)}" alt="">`
        : `<a class="pm-media-link" href="${escHtml(item.source_url||'#')}" target="_blank" rel="noopener">LINK<br>VIDEO</a>`;
      return `<article class="pm-media-row" data-pm-media="${escHtml(item.id)}">
        ${visual}
        <div class="pm-media-copy"><strong>${escHtml(item.title)}</strong><span>${escHtml(item.caption||'')}</span><small>ordine ${Number(item.sort_order||0)}${kind==='video'&&item.source_url?' · '+escHtml(item.source_url):''}</small></div>
        <span class="pm-published ${item.published?'yes':'no'}">${item.published?'PUBBLICO':'NASCOSTO'}</span>
        <div class="pm-row-actions"><button class="pm-action" type="button" data-edit-media>MODIFICA</button><button class="pm-action" type="button" data-toggle-media>${item.published?'NASCONDI':'PUBBLICA'}</button><button class="pm-action" type="button" data-delete-media>ELIMINA</button></div>
      </article>`;
    }).join('')||`<div class="pm-empty">Nessun ${kind==='video'?'video':'foto'} inserito.</div>`;
    qa('[data-pm-media]',box).forEach(row=>{
      const item=state.media.find(x=>String(x.id)===row.dataset.pmMedia);
      q('[data-edit-media]',row).onclick=()=>editMedia(item);
      q('[data-toggle-media]',row).onclick=()=>toggleMedia(item);
      q('[data-delete-media]',row).onclick=()=>deleteMedia(item);
    });
  }

  async function addVideo(e){
    e.preventDefault();if(!isAdmin())return;
    const title=q('#pmVideoTitle').value.trim(),source_url=safeHttps(q('#pmVideoUrl').value.trim()),caption=q('#pmVideoCaption').value.trim();
    if(!title||!source_url){status('Titolo e URL https sono obbligatori.',true);return}
    const row={kind:'video',title,caption,source_url,storage_path:null,published:q('#pmVideoPublished').checked,sort_order:Number(q('#pmVideoOrder').value)||0,created_by:currentUser?.id||null,updated_at:new Date().toISOString()};
    status('Salvataggio video…');
    const {error}=await sb.from('public_media').insert(row);
    if(error){status(error.message,true);return}
    e.target.reset();q('#pmVideoPublished').checked=true;q('#pmVideoOrder').value='0';await loadAll();setTab('video');status('Video aggiunto ✓');
  }

  async function addPhoto(e){
    e.preventDefault();if(!isAdmin())return;
    const file=q('#pmPhotoFile').files?.[0],title=q('#pmPhotoTitle').value.trim(),caption=q('#pmPhotoCaption').value.trim();
    if(!file||!title){status('Titolo e file foto sono obbligatori.',true);return}
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)){status('Usa JPG, PNG o WEBP.',true);return}
    const ext=(file.name.split('.').pop()||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'')||'jpg';
    const path=`photos/${Date.now()}-${fileSafe(file.name)}.${ext}`;
    status('Caricamento foto…');
    const {error:uploadError}=await sb.storage.from(BUCKET).upload(path,file,{contentType:file.type,upsert:false});
    if(uploadError){status(uploadError.message,true);return}
    const row={kind:'photo',title,caption,source_url:null,storage_path:path,published:q('#pmPhotoPublished').checked,sort_order:Number(q('#pmPhotoOrder').value)||0,created_by:currentUser?.id||null,updated_at:new Date().toISOString()};
    const {error}=await sb.from('public_media').insert(row);
    if(error){await sb.storage.from(BUCKET).remove([path]);status(error.message,true);return}
    e.target.reset();q('#pmPhotoPublished').checked=true;q('#pmPhotoOrder').value='0';await loadAll();setTab('photo');status('Foto pubblicata ✓');
  }

  async function editMedia(item){
    if(!item)return;
    const title=prompt('Titolo',item.title||'');if(title===null)return;
    const caption=prompt('Didascalia',item.caption||'');if(caption===null)return;
    let source_url=item.source_url;
    if(item.kind==='video'){
      const url=prompt('URL video',item.source_url||'');if(url===null)return;
      source_url=safeHttps(url.trim());if(!source_url){status('URL non valido: usa https://',true);return}
    }
    const orderRaw=prompt('Ordine',String(item.sort_order||0));if(orderRaw===null)return;
    const {error}=await sb.from('public_media').update({title:title.trim()||item.title,caption:caption.trim(),source_url,sort_order:Number(orderRaw)||0,updated_at:new Date().toISOString()}).eq('id',item.id);
    if(error){status(error.message,true);return}
    await loadAll();setTab(item.kind);status('Media aggiornato ✓');
  }

  async function toggleMedia(item){
    if(!item)return;
    const {error}=await sb.from('public_media').update({published:!item.published,updated_at:new Date().toISOString()}).eq('id',item.id);
    if(error){status(error.message,true);return}
    await loadAll();setTab(item.kind);
  }

  async function deleteMedia(item){
    if(!item||!confirm(`Eliminare "${item.title}"?`))return;
    const {error}=await sb.from('public_media').delete().eq('id',item.id);
    if(error){status(error.message,true);return}
    if(item.kind==='photo'&&item.storage_path)await sb.storage.from(BUCKET).remove([item.storage_path]);
    await loadAll();setTab(item.kind);status('Media eliminato ✓');
  }


  function globalSongList(){try{return typeof songs!=='undefined'?songs:state.songs}catch{return state.songs}}
  function refreshCatalogAudioButtons(){
    if(!isAdmin())return;
    const box=document.getElementById('catalogList');if(!box)return;
    const rows=[...box.querySelectorAll('.catalog-compact-row')];const ordered=[...globalSongList()].sort((a,b)=>String(a.title||'').localeCompare(String(b.title||''),'it'));
    rows.forEach((row,i)=>{
      const song=ordered[i];if(!song)return;
      row.dataset.songId=song.id;
      const actions=row.querySelector('.row-buttons');if(!actions||actions.querySelector('[data-catalog-audio]'))return;
      const play=document.createElement('button');play.type='button';play.className='small-btn catalog-audio-button'+(song.audio_path?' has-audio':'');play.dataset.catalogAudio=song.id;play.textContent=song.audio_path?'▶ AUDIO':'+ AUDIO';play.title=song.audio_path?'Ascolta o sostituisci il file audio':'Carica il file audio pubblico';
      play.onclick=e=>{e.stopPropagation();openCatalogAudioPicker(song,play)};
      actions.prepend(play);
    });
  }
  function openCatalogAudioPicker(song,anchor){
    if(!song||!isAdmin())return;
    if(song.audio_path){
      const url=publicUrl(BUCKET,song.audio_path);let pop=document.getElementById('catalogAudioMiniPlayer');if(pop)pop.remove();pop=document.createElement('div');pop.id='catalogAudioMiniPlayer';pop.style.cssText='position:fixed;z-index:9999;right:12px;bottom:12px;width:min(360px,calc(100vw - 24px));padding:10px;border:1px solid #4a4f58;border-radius:10px;background:#171b22;box-shadow:0 8px 30px #0009';pop.innerHTML=`<div style="display:flex;justify-content:space-between;gap:8px;align-items:center;margin-bottom:7px"><strong style="font-size:9px">${escHtml(song.title)}</strong><button type="button" data-close style="background:none;border:0;color:#ddd">×</button></div><audio controls preload="none" src="${escHtml(url)}" style="width:100%;height:32px"></audio><div style="display:flex;gap:5px;margin-top:7px"><button type="button" data-replace class="pm-action">SOSTITUISCI</button><button type="button" data-remove class="pm-action">RIMUOVI</button></div>`;document.body.appendChild(pop);q('[data-close]',pop).onclick=()=>pop.remove();q('[data-replace]',pop).onclick=()=>{pop.remove();chooseCatalogAudioFile(song,anchor)};q('[data-remove]',pop).onclick=async()=>{pop.remove();await removeCatalogSongAudio(song);};
    } else chooseCatalogAudioFile(song,anchor);
  }
  function chooseCatalogAudioFile(song,anchor){const input=document.createElement('input');input.type='file';input.accept='audio/*';input.className='catalog-audio-file';document.body.appendChild(input);input.onchange=async()=>{const file=input.files?.[0];if(file)await uploadCatalogSongAudio(song,file,anchor);input.remove()};input.click()}
  async function uploadCatalogSongAudio(song,file,anchor){
    if(!file||!String(file.type||'').startsWith('audio/'))return alert('Seleziona un file audio.');if(file.size>50*1024*1024)return alert('File massimo 50 MB.');anchor.disabled=true;anchor.textContent='CARICO…';
    const ext=(file.name.split('.').pop()||'mp3').toLowerCase().replace(/[^a-z0-9]/g,'')||'mp3',path=`song-audio/${song.id}/${Date.now()}-${fileSafe(file.name)}.${ext}`;
    try{const {error:up}=await sb.storage.from(BUCKET).upload(path,file,{contentType:file.type||undefined,upsert:false});if(up)throw up;const old=song.audio_path||null;const {error}=await sb.from('songs').update({audio_path:path,updated_at:new Date().toISOString()}).eq('id',song.id);if(error){await sb.storage.from(BUCKET).remove([path]);throw error}if(old)await sb.storage.from(BUCKET).remove([old]);song.audio_path=path;if(typeof loadSongs==='function')await loadSongs();if(typeof renderCatalog==='function')renderCatalog();status('Audio pubblicato ✓');}catch(err){alert(err.message||err)}finally{anchor.disabled=false}
  }
  async function removeCatalogSongAudio(song){if(!song?.audio_path||!confirm(`Rimuovere l'audio di "${song.title}"?`))return;const old=song.audio_path;const {error}=await sb.from('songs').update({audio_path:null,updated_at:new Date().toISOString()}).eq('id',song.id);if(error)return alert(error.message);await sb.storage.from(BUCKET).remove([old]);song.audio_path=null;if(typeof loadSongs==='function')await loadSongs();if(typeof renderCatalog==='function')renderCatalog()}
  function hookCatalogAudio(){try{if(typeof renderCatalog!=='function'||renderCatalog.__audioHook)return;const base=renderCatalog;const wrapped=function(...args){const out=base.apply(this,args);queueMicrotask(refreshCatalogAudioButtons);return out};wrapped.__audioHook=true;renderCatalog=wrapped;queueMicrotask(refreshCatalogAudioButtons)}catch(err){console.warn('Audio catalog hook',err)}}

  function isoLocal(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
  function memberName(id){try{return (profiles||[]).find(p=>p.id===id)?.display_name||((id===currentUser?.id)?currentProfile?.display_name:'Membro')}catch{return id===currentUser?.id?(currentProfile?.display_name||'Io'):'Membro'}}
  async function openAvailabilityPage(){
    document.getElementById('memberNav')?.querySelectorAll('.nav-button').forEach(b=>b.classList.remove('active'));document.getElementById('bandAvailabilityNav')?.classList.add('active');document.querySelectorAll('#memberApp main .page').forEach(p=>p.classList.remove('active'));document.getElementById('bandAvailabilityPage')?.classList.add('active');try{window.setMemberCategory?.('management',{activate:false})}catch{};await loadAvailability();
  }
  async function loadAvailability(){const {data,error}=await sb.from('band_unavailability').select('*').order('day',{ascending:true});if(error){q('#pmAvailabilityStatus').textContent=error.message;return}state.availability=data||[];renderAvailabilityCalendar();renderAvailabilityList();q('#pmAvailabilityStatus').textContent=`${state.availability.length} date`}
  function renderAvailabilityCalendar(){const box=q('#pmAvailabilityDays'),label=q('#pmAvailabilityMonth');if(!box||!label)return;const month=state.availabilityMonth,first=new Date(month.getFullYear(),month.getMonth(),1),last=new Date(month.getFullYear(),month.getMonth()+1,0),offset=(first.getDay()+6)%7;label.textContent=new Intl.DateTimeFormat('it-IT',{month:'long',year:'numeric'}).format(month).toUpperCase();let html='';for(let i=0;i<offset;i++)html+='<span></span>';for(let day=1;day<=last.getDate();day++){const d=new Date(month.getFullYear(),month.getMonth(),day),iso=isoLocal(d),mine=state.availability.find(x=>x.day===iso&&x.member_id===currentUser?.id),blocked=state.availability.some(x=>x.day===iso&&x.blocks_booking),selected=state.selectedAvailability.has(iso);html+=`<button type="button" class="pm-day${selected?' selected':''}${mine?' personal':''}${blocked?' global-block':''}" data-pm-day="${iso}">${day}</button>`}box.innerHTML=html;qa('[data-pm-day]',box).forEach(btn=>btn.onclick=()=>{const day=btn.dataset.pmDay;if(state.selectedAvailability.has(day))state.selectedAvailability.delete(day);else state.selectedAvailability.add(day);renderAvailabilityCalendar()})}
  async function savePersonalAvailability(){const days=[...state.selectedAvailability].sort();if(!days.length)return alert('Seleziona almeno una data.');const note=q('#pmAvailabilityNote').value.trim();for(const day of days){const existing=state.availability.find(x=>x.day===day&&x.member_id===currentUser.id);if(existing){const {error}=await sb.from('band_unavailability').update({note,updated_at:new Date().toISOString()}).eq('id',existing.id);if(error)return alert(error.message)}else{const {error}=await sb.from('band_unavailability').insert({day,member_id:currentUser.id,created_by:currentUser.id,blocks_booking:false,note});if(error)return alert(error.message)}}state.selectedAvailability.clear();q('#pmAvailabilityNote').value='';await loadAvailability()}
  function renderAvailabilityList(){const box=q('#pmAvailabilityList');if(!box)return;const rows=[...state.availability].sort((a,b)=>a.day.localeCompare(b.day));q('#pmAvailabilityListTitle').textContent=isAdmin()?'INDISPONIBILITÀ DI TUTTI':'LE MIE INDISPONIBILITÀ';box.innerHTML=rows.map(item=>`<div class="pm-unavailability-row" data-unavailability="${item.id}"><strong>${escHtml(new Date(item.day+'T12:00:00').toLocaleDateString('it-IT'))}</strong><div><span>${escHtml(memberName(item.member_id))}${item.note?' · '+escHtml(item.note):''}${item.blocks_booking?' · BLOCCO BAND':''}</span></div><div class="pm-unavailability-actions">${isAdmin()?`<button class="pm-action" data-toggle-block>${item.blocks_booking?'SBLOCCA BAND':'BLOCCA BAND'}</button>`:''}${(isAdmin()||item.member_id===currentUser?.id)&&!item.blocks_booking?'<button class="pm-action" data-remove-unavailability>RIMUOVI</button>':''}</div></div>`).join('')||'<div class="pm-empty">Nessuna indisponibilità inserita.</div>';qa('[data-unavailability]',box).forEach(row=>{const item=state.availability.find(x=>String(x.id)===row.dataset.unavailability);q('[data-toggle-block]',row)?.addEventListener('click',()=>toggleGlobalBlock(item));q('[data-remove-unavailability]',row)?.addEventListener('click',()=>removeUnavailability(item))})}
  async function toggleGlobalBlock(item){if(!isAdmin()||!item)return;const {error}=await sb.from('band_unavailability').update({blocks_booking:!item.blocks_booking,updated_at:new Date().toISOString()}).eq('id',item.id);if(error)return alert(error.message);await loadAvailability()}
  async function removeUnavailability(item){if(!item||!confirm('Rimuovere questa indisponibilità?'))return;const {error}=await sb.from('band_unavailability').delete().eq('id',item.id);if(error)return alert(error.message);await loadAvailability()}

  async function openBookingPage(){if(!isAdmin())return;document.getElementById('memberNav')?.querySelectorAll('.nav-button').forEach(b=>b.classList.remove('active'));document.getElementById('bookingAdminNav')?.classList.add('active');document.querySelectorAll('#memberApp main .page').forEach(p=>p.classList.remove('active'));document.getElementById('bookingAdminPage')?.classList.add('active');try{window.setMemberCategory?.('management',{activate:false})}catch{};await loadBookingAdmin()}
  async function loadBookingAdmin(){if(!isAdmin())return;const [r,d]=await Promise.all([sb.from('booking_requests').select('*').order('created_at',{ascending:false}),sb.from('booking_request_dates').select('*').order('day',{ascending:true})]);if(r.error)return alert(r.error.message);if(d.error)return alert(d.error.message);state.requests=r.data||[];state.requestDates=d.data||[];renderBookingAdmin()}
  function renderBookingAdmin(){const box=q('#pmBookingList');if(!box)return;q('#pmBookingCounter').textContent=`${state.requests.length} richieste`;box.innerHTML=state.requests.map(req=>{const dates=state.requestDates.filter(d=>d.request_id===req.id);return `<article class="pm-request-card" data-request="${req.id}"><div class="pm-request-head"><strong>${escHtml(req.event_name)}</strong><span class="pm-status-pill ${escHtml(req.status)}">${escHtml(req.status.toUpperCase())}</span></div><div class="pm-request-meta"><b>${escHtml(req.requester_name)}</b> · ${escHtml(req.requester_email)}${req.requester_phone?' · '+escHtml(req.requester_phone):''}<br>${escHtml([req.organization,req.event_type,req.venue_name,req.city].filter(Boolean).join(' · '))}${req.details?`<br>${escHtml(req.details)}`:''}</div><div class="pm-request-dates">${dates.map(d=>`<button type="button" class="pm-request-date ${escHtml(d.status)}" data-request-day="${d.day}" title="Clic: accetta questa data">${escHtml(new Date(d.day+'T12:00:00').toLocaleDateString('it-IT'))} · ${escHtml(d.status)}</button>`).join('')}</div><div class="pm-request-actions"><button class="pm-action" data-request-status="pending">PENDING</button><button class="pm-action" data-request-status="accepted">ACCETTATA</button><button class="pm-action" data-request-status="declined">RIFIUTATA</button></div></article>`}).join('')||'<div class="pm-empty">Nessuna richiesta di booking.</div>';qa('[data-request]',box).forEach(card=>{const req=state.requests.find(x=>String(x.id)===card.dataset.request);qa('[data-request-day]',card).forEach(btn=>btn.onclick=()=>acceptRequestDay(req,btn.dataset.requestDay));qa('[data-request-status]',card).forEach(btn=>btn.onclick=()=>setRequestStatus(req,btn.dataset.requestStatus))})}
  async function acceptRequestDay(req,day){if(!req)return;const dates=state.requestDates.filter(d=>d.request_id===req.id);for(const d of dates){const status=d.day===day?'accepted':'declined';const {error}=await sb.from('booking_request_dates').update({status}).eq('request_id',req.id).eq('day',d.day);if(error)return alert(error.message)}const {error}=await sb.from('booking_requests').update({status:'accepted',updated_at:new Date().toISOString()}).eq('id',req.id);if(error)return alert(error.message);await loadBookingAdmin()}
  async function setRequestStatus(req,statusValue){if(!req)return;const dates=state.requestDates.filter(d=>d.request_id===req.id);if(statusValue==='accepted'&&!dates.some(d=>d.status==='accepted')){const first=dates.find(d=>d.status==='requested')||dates[0];if(!first)return alert('La richiesta non contiene date.');for(const d of dates){const next=d.day===first.day?'accepted':'declined';const {error:dateError}=await sb.from('booking_request_dates').update({status:next}).eq('request_id',req.id).eq('day',d.day);if(dateError)return alert(dateError.message)}}const {error}=await sb.from('booking_requests').update({status:statusValue,updated_at:new Date().toISOString()}).eq('id',req.id);if(error)return alert(error.message);if(statusValue!=='accepted')await sb.from('booking_request_dates').update({status:statusValue==='declined'?'declined':'requested'}).eq('request_id',req.id);await loadBookingAdmin()}

  function boot(){
    injectUi();
    hookCatalogAudio();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
