(() => {
  'use strict';

  const q=(s,r=document)=>r.querySelector(s);
  const qa=(s,r=document)=>[...r.querySelectorAll(s)];
  const esc=value=>String(value??'').replace(/[&<>'"]/g,ch=>({
    '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'
  }[ch]));
  const isAdmin=()=>{try{return typeof isEma==='function'&&isEma()}catch{return false}};
  const isMember=()=>{try{return !!currentProfile?.id&&!!currentUser?.id}catch{return false}};

  function injectStyles(){
    if(document.getElementById('fanPresenceStyles'))return;
    const st=document.createElement('style');
    st.id='fanPresenceStyles';
    st.textContent=`

      .fan-presence-page{display:grid;gap:10px;min-height:0}
      .fan-presence-summary{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
      .fan-presence-pill{display:inline-flex;align-items:center;gap:5px;min-height:26px;padding:4px 8px;border:1px solid rgba(255,255,255,.10);border-radius:999px;background:rgba(255,255,255,.035);font-size:7px;font-weight:900;letter-spacing:.04em}
      .fan-presence-pill.pending{border-color:#7b641f;color:#f3d234}.fan-presence-pill.ok{border-color:#2f7047;color:#8ed7a0}
      .fan-presence-grid{display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr);gap:10px;min-height:0}
      .fan-presence-panel{min-width:0;border:1px solid rgba(255,255,255,.08);border-radius:12px;background:rgba(255,255,255,.025);overflow:hidden}
      .fan-presence-panel.full{grid-column:1/-1}
      .fan-presence-panel-head{display:flex;justify-content:space-between;gap:8px;align-items:flex-start;padding:10px;border-bottom:1px solid rgba(255,255,255,.07)}
      .fan-presence-panel-head h3{margin:0;font-size:10px}.fan-presence-panel-head .section-note{margin-top:3px}
      .fan-presence-list{max-height:52vh;overflow:auto}
      .fan-presence-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center;padding:9px 10px;border-bottom:1px solid rgba(255,255,255,.06)}
      .fan-presence-row:last-child{border-bottom:0}
      .fan-presence-main strong{display:block;font-size:9px}.fan-presence-main span{display:block;margin-top:2px;color:#89919d;font-size:7px;line-height:1.4}
      .fan-presence-actions{display:flex;gap:5px;align-items:center;flex-wrap:wrap;justify-content:flex-end}
      .fan-presence-status{display:inline-flex;align-items:center;min-height:22px;padding:3px 7px;border-radius:999px;border:1px solid #4b515c;color:#c8cdd4;font-size:6px;font-weight:950;white-space:nowrap}
      .fan-presence-status.pending{border-color:#7b641f;color:#f3d234;background:#2b2510}.fan-presence-status.certified{border-color:#2f7047;color:#8ed7a0;background:#10251a}.fan-presence-status.absent{color:#7f8791}
      .fan-presence-action{min-height:28px;padding:5px 8px;border:1px solid #4b515c;border-radius:7px;background:#20252d;color:#fff;font-size:7px;font-weight:950}
      .fan-presence-action.primary{border:0;background:#f3d234;color:#111}.fan-presence-action.danger{border-color:#733b3b;color:#ff9f9f;background:#291617}
      .fan-presence-toolbar{display:grid;grid-template-columns:minmax(180px,1fr) minmax(150px,.75fr);gap:7px;padding:10px;border-bottom:1px solid rgba(255,255,255,.07)}
      .fan-presence-toolbar select,.fan-presence-toolbar input{width:100%;min-height:34px;padding:6px 8px;border:1px solid #414750;border-radius:7px;background:#171b22;color:#fff;font-size:8px}
      .fan-presence-empty{padding:16px;color:#7f8791;font-size:8px;text-align:center}
      @media(max-width:850px){.fan-presence-grid{grid-template-columns:1fr}.fan-presence-panel.full{grid-column:auto}.fan-presence-toolbar{grid-template-columns:1fr}.fan-presence-list{max-height:none}}
    `;
    document.head.appendChild(st);
  }

  let fanPresenceConcerts=[];
  let fanPresencePending=[];
  let fanPresenceCertified=[];
  let fanPresenceRoster=[];
  let fanPresenceConcertId='';
  let fanPresenceSearch='';

  function presenceDate(value){
    if(!value)return '—';
    const d=new Date(value);
    return Number.isNaN(d.getTime())?'—':d.toLocaleDateString('it-IT');
  }

  function presenceDateTime(value){
    if(!value)return '—';
    const d=new Date(value);
    return Number.isNaN(d.getTime())?'—':d.toLocaleString('it-IT',{
      day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'
    });
  }

  function certificationLabel(row){
    if(!row?.certified)return 'ASSENTE';
    if(row.certification_method==='qr')return 'CERTIFICATA · QR';
    if(row.certification_method==='self')return 'CERTIFICATA · STORICO';
    return 'CERTIFICATA';
  }

  function createCertificationPage(){
    if(document.getElementById('demoCertificationPage'))return;
    const nav=document.getElementById('memberNav');
    const main=q('#memberApp main');
    if(!nav||!main)return;

    const button=document.createElement('button');
    button.id='demoCertificationNav';
    button.className='nav-button';
    button.dataset.category='fan';
    button.dataset.page='demoCertificationPage';
    button.type='button';
    button.textContent='PRESENZE';

    const fanUsers=nav.querySelector('[data-page="fansAdminPage"]');
    if(fanUsers)fanUsers.before(button);
    else nav.appendChild(button);

    const page=document.createElement('section');
    page.id='demoCertificationPage';
    page.className='page';
    page.innerHTML=`
      <div class="fan-presence-page">
        <div class="panel-header">
          <div>
            <h2>PRESENZE FAN</h2>
            <div class="section-note" style="margin-top:3px">
              Qui si gestiscono tutte le presenze. I nuovi “Io c'ero” dei fan restano da confermare; QR e inserimenti manuali dei membri vengono certificati subito.
            </div>
          </div>
          <div class="fan-presence-summary">
            <span class="fan-presence-pill pending" id="fanPresencePendingPill">0 DA CONFERMARE</span>
            <span class="fan-presence-pill ok" id="fanPresenceCertifiedPill">0 CERTIFICATE</span>
            <span class="counter" id="demoCertStatus"></span>
          </div>
        </div>

        <div class="fan-presence-grid">
          <section class="fan-presence-panel">
            <div class="fan-presence-panel-head">
              <div>
                <h3>ULTIMI “IO C'ERO” DA CONFERMARE</h3>
                <div class="section-note">Autodichiarazioni non ancora certificate.</div>
              </div>
              <span class="counter" id="fanPresencePendingCount"></span>
            </div>
            <div class="fan-presence-list" id="fanPresencePendingList"></div>
          </section>

          <section class="fan-presence-panel">
            <div class="fan-presence-panel-head">
              <div>
                <h3>GESTIONE PER CONCERTO</h3>
                <div class="section-note">Seleziona un live e aggiungi, conferma o rimuovi i fan.</div>
              </div>
              <span class="counter" id="fanPresenceConcertCount"></span>
            </div>
            <div class="fan-presence-toolbar">
              <select id="fanPresenceConcertSelect"><option value="">Seleziona concerto…</option></select>
              <input id="fanPresenceSearch" type="search" autocomplete="off" placeholder="Cerca fan…">
            </div>
            <div class="fan-presence-list" id="fanPresenceConcertList"></div>
          </section>

          <section class="fan-presence-panel full">
            <div class="fan-presence-panel-head">
              <div>
                <h3>ULTIME PRESENZE CERTIFICATE</h3>
                <div class="section-note">Storico delle presenze già validate.</div>
              </div>
              <span class="counter" id="fanPresenceCertifiedCount"></span>
            </div>
            <div class="fan-presence-list" id="demoCertList"></div>
          </section>
        </div>
      </div>`;
    main.appendChild(page);

    button.onclick=openCertificationPage;
    q('#fanPresenceConcertSelect',page).onchange=async e=>{
      fanPresenceConcertId=e.target.value||'';
      await loadConcertPresenceRoster();
    };
    q('#fanPresenceSearch',page).oninput=e=>{
      fanPresenceSearch=String(e.target.value||'').trim().toLowerCase();
      renderConcertPresenceRoster();
    };
  }

  function renderPendingPresenceList(){
    const list=q('#fanPresencePendingList');
    if(!list)return;

    q('#fanPresencePendingCount').textContent=fanPresencePending.length?`${fanPresencePending.length} in attesa`:'0';
    q('#fanPresencePendingPill').textContent=`${fanPresencePending.length} DA CONFERMARE`;

    list.innerHTML=fanPresencePending.map(x=>`
      <div class="fan-presence-row">
        <div class="fan-presence-main">
          <strong>${esc(x.fan_name)} · ${esc(x.concert_name)}</strong>
          <span>${esc(presenceDate(x.concert_date))} · dichiarata ${esc(presenceDateTime(x.attendance_created_at))}</span>
        </div>
        <div class="fan-presence-actions">
          <span class="fan-presence-status pending">DA CONFERMARE</span>
          <button class="fan-presence-action primary" type="button"
            data-presence-confirm="${esc(x.fan_id)}"
            data-presence-concert="${esc(x.concert_id)}">CONFERMA</button>
          ${isAdmin()?`<button class="fan-presence-action danger" type="button"
            data-presence-remove="${esc(x.fan_id)}"
            data-presence-concert="${esc(x.concert_id)}">RIMUOVI</button>`:''}
        </div>
      </div>`).join('')||'<div class="fan-presence-empty">Nessun “Io c’ero” in attesa di conferma.</div>';

    qa('[data-presence-confirm]',list).forEach(btn=>btn.onclick=async()=>{
      await certifyFanPresence(btn.dataset.presenceConfirm,btn.dataset.presenceConcert,btn);
    });
    qa('[data-presence-remove]',list).forEach(btn=>btn.onclick=async()=>{
      await removeFanPresence(btn.dataset.presenceRemove,btn.dataset.presenceConcert,btn);
    });
  }

  function renderCertifiedPresenceList(){
    const list=q('#demoCertList');
    if(!list)return;

    q('#fanPresenceCertifiedCount').textContent=`${fanPresenceCertified.length} certificate`;
    q('#fanPresenceCertifiedPill').textContent=`${fanPresenceCertified.length} CERTIFICATE`;

    list.innerHTML=fanPresenceCertified.slice(0,80).map(x=>`
      <div class="fan-presence-row">
        <div class="fan-presence-main">
          <strong>${esc(x.fan_name)} · ${esc(x.concert_name)}</strong>
          <span>${esc(presenceDate(x.concert_date))} · certificata ${esc(presenceDateTime(x.certified_at))}</span>
        </div>
        <div class="fan-presence-actions">
          <span class="fan-presence-status certified">CERTIFICATA</span>
        </div>
      </div>`).join('')||'<div class="fan-presence-empty">Nessuna presenza certificata.</div>';
  }

  async function loadConcertPresenceRoster(){
    const list=q('#fanPresenceConcertList');
    if(!fanPresenceConcertId){
      fanPresenceRoster=[];
      if(list)list.innerHTML='<div class="fan-presence-empty">Seleziona un concerto.</div>';
      if(q('#fanPresenceConcertCount'))q('#fanPresenceConcertCount').textContent='';
      return;
    }

    if(list)list.innerHTML='<div class="fan-presence-empty">Caricamento fan…</div>';

    const {data,error}=await sb.rpc('member_list_concert_fan_attendance',{
      p_concert_id:fanPresenceConcertId
    });
    if(error){
      if(list)list.innerHTML=`<div class="fan-presence-empty">${esc(error.message)}</div>`;
      return;
    }

    fanPresenceRoster=data||[];
    renderConcertPresenceRoster();
  }

  function renderConcertPresenceRoster(){
    const list=q('#fanPresenceConcertList');
    if(!list)return;

    const rows=fanPresenceRoster.filter(x=>{
      if(!fanPresenceSearch)return true;
      return String(x.fan_name||'').toLowerCase().includes(fanPresenceSearch);
    });

    const presentCount=fanPresenceRoster.filter(x=>x.attendance_exists).length;
    const certifiedCount=fanPresenceRoster.filter(x=>x.certified).length;
    const pendingCount=fanPresenceRoster.filter(x=>x.attendance_exists&&!x.certified).length;
    q('#fanPresenceConcertCount').textContent=fanPresenceConcertId
      ? `${certifiedCount} certificate · ${pendingCount} da confermare · ${presentCount} totali`
      : '';

    list.innerHTML=rows.map(x=>{
      const exists=!!x.attendance_exists;
      const certified=!!x.certified;
      const statusClass=certified?'certified':exists?'pending':'absent';
      const status=certified?certificationLabel(x):exists?'DA CONFERMARE':'ASSENTE';
      let actions='';

      if(!exists){
        actions=`<button class="fan-presence-action primary" type="button"
          data-roster-add="${esc(x.fan_id)}">AGGIUNGI</button>`;
      }else if(!certified){
        actions=`<button class="fan-presence-action primary" type="button"
          data-roster-add="${esc(x.fan_id)}">CONFERMA</button>
          ${isAdmin()?`<button class="fan-presence-action danger" type="button"
          data-roster-remove="${esc(x.fan_id)}">RIMUOVI</button>`:''}`;
      }else if(isAdmin()){
        actions=`<button class="fan-presence-action danger" type="button"
          data-roster-remove="${esc(x.fan_id)}">RIMUOVI</button>`;
      }

      return `
        <div class="fan-presence-row">
          <div class="fan-presence-main">
            <strong>${esc(x.fan_name)}</strong>
            <span>${exists
              ? `presenza registrata ${esc(presenceDateTime(x.attendance_created_at))}`
              : 'nessuna presenza registrata'}</span>
          </div>
          <div class="fan-presence-actions">
            <span class="fan-presence-status ${statusClass}">${esc(status)}</span>
            ${actions}
          </div>
        </div>`;
    }).join('')||'<div class="fan-presence-empty">Nessun fan corrisponde alla ricerca.</div>';

    qa('[data-roster-add]',list).forEach(btn=>btn.onclick=async()=>{
      await certifyFanPresence(btn.dataset.rosterAdd,fanPresenceConcertId,btn);
    });
    qa('[data-roster-remove]',list).forEach(btn=>btn.onclick=async()=>{
      await removeFanPresence(btn.dataset.rosterRemove,fanPresenceConcertId,btn);
    });
  }

  async function certifyFanPresence(fanId,concertId,button=null){
    if(!fanId||!concertId)return;
    if(button)button.disabled=true;
    try{
      const {error}=await sb.rpc('member_certify_fan_attendance',{
        p_fan_id:fanId,
        p_concert_id:concertId
      });
      if(error)throw error;
      await loadCertifications();
    }catch(err){
      alert(err.message||String(err));
    }finally{
      if(button)button.disabled=false;
    }
  }

  async function removeFanPresence(fanId,concertId,button=null){
    if(!isAdmin()||!fanId||!concertId)return;
    const concert=fanPresenceConcerts.find(x=>String(x.concert_id)===String(concertId));
    if(!confirm(`Rimuovere la presenza${concert?.concert_name?` a “${concert.concert_name}”`:''}? Verranno eliminati anche i dati live collegati.`))return;

    if(button)button.disabled=true;
    try{
      const {error}=await sb.rpc('admin_remove_fan_attendance',{
        p_fan_id:fanId,
        p_concert_id:concertId
      });
      if(error)throw error;
      await loadCertifications();
    }catch(err){
      alert(err.message||String(err));
    }finally{
      if(button)button.disabled=false;
    }
  }

  async function loadCertifications(){
    const [concerts,certs,pending]=await Promise.all([
      sb.rpc('member_list_demo_concerts'),
      sb.rpc('member_list_demo_certifications'),
      sb.rpc('member_list_pending_fan_attendance')
    ]);

    if(concerts.error)throw concerts.error;
    if(certs.error)throw certs.error;
    if(pending.error)throw pending.error;

    fanPresenceConcerts=concerts.data||[];
    fanPresenceCertified=certs.data||[];
    fanPresencePending=pending.data||[];

    const select=q('#fanPresenceConcertSelect');
    if(select){
      const previous=fanPresenceConcertId||select.value||'';
      select.innerHTML='<option value="">Seleziona concerto…</option>'+
        fanPresenceConcerts.map(x=>`
          <option value="${esc(x.concert_id)}">
            ${esc(presenceDate(x.concert_date))} · ${esc(x.concert_name)}
          </option>`).join('');

      const valid=fanPresenceConcerts.some(x=>String(x.concert_id)===String(previous));
      fanPresenceConcertId=valid?String(previous):(fanPresenceConcerts[0]?.concert_id?String(fanPresenceConcerts[0].concert_id):'');
      select.value=fanPresenceConcertId;
    }

    renderPendingPresenceList();
    renderCertifiedPresenceList();

    q('#demoCertStatus').textContent=`${fanPresencePending.length} DA CONFERMARE`;
    await loadConcertPresenceRoster();
  }

  async function openCertificationPage(){
    if(!isMember())return;
    q('#memberNav')?.querySelectorAll('.nav-button').forEach(b=>b.classList.remove('active'));
    q('#demoCertificationNav')?.classList.add('active');
    qa('#memberApp main .page').forEach(p=>p.classList.remove('active'));
    q('#demoCertificationPage')?.classList.add('active');
    try{window.setMemberCategory?.('fan',{activate:false})}catch{}
    try{await loadCertifications()}catch(err){alert(err.message||String(err))}
  }

  function boot(){
    if(typeof sb==='undefined')return;
    injectStyles();
    createCertificationPage();

    const app=document.getElementById('memberApp');
    if(app){
      new MutationObserver(()=>{
        if(isMember())createCertificationPage();
      }).observe(app,{attributes:true,attributeFilter:['hidden']});
    }
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
