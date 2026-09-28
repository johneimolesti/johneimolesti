(()=>{
  "use strict";

  const PAGE_ID="fanReviewsPage";
  const $=id=>document.getElementById(id);
  const q=(sel,root=document)=>root.querySelector(sel);
  const qa=(sel,root=document)=>[...root.querySelectorAll(sel)];
  const escHtml=value=>String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  const fmtDate=value=>{
    if(!value)return "—";
    const p=String(value).slice(0,10).split("-");
    return p.length===3?`${p[2]}/${p[1]}/${p[0]}`:String(value);
  };
  const fmtTime=value=>value?String(value).slice(0,5):"";

  let queue=[];
  let reviews=[];
  let summary={pending_count:0,deferred_count:0,skipped_count:0,rated_count:0};
  let basePoints=500;
  let privateFactor=.33;
  let loading=false;
  let view="queue";
  let fanSearch="";
  let liveFilter="";
  let editing=null;

  function injectStyles(){
    if($("fanReviewQueueStyles"))return;
    const st=document.createElement("style");
    st.id="fanReviewQueueStyles";
    st.textContent=`
      .fan-review-shell{display:grid;gap:10px}
      .fan-review-hero{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:12px;border:1px solid rgba(255,255,255,.08);border-radius:14px;background:rgba(255,255,255,.025)}
      .fan-review-hero h2{margin:0 0 4px;font-size:13px}
      .fan-review-hero .section-note{max-width:760px}
      .fan-review-stats{display:flex;flex-wrap:wrap;gap:6px;justify-content:flex-end}
      .fan-review-pill{display:inline-flex;align-items:center;min-height:28px;padding:4px 8px;border:1px solid rgba(255,255,255,.1);border-radius:999px;background:rgba(255,255,255,.035);font-size:7px;font-weight:950;white-space:nowrap}
      .fan-review-pill.pending{border-color:rgba(243,210,52,.35);color:#f3d234}
      .fan-review-tabs{display:flex;gap:6px;flex-wrap:wrap}
      .fan-review-tab{min-height:34px;padding:6px 10px;border:1px solid rgba(255,255,255,.1);border-radius:9px;background:rgba(255,255,255,.03);color:#a9b0ba;font-size:8px;font-weight:950}
      .fan-review-tab.active{border-color:#f3d234;color:#f3d234;background:rgba(243,210,52,.09)}
      .fan-review-grid{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(250px,.6fr);gap:10px}
      .fan-review-card,.fan-review-next,.fan-review-history{border:1px solid rgba(255,255,255,.08);border-radius:14px;background:rgba(255,255,255,.025);overflow:hidden}
      .fan-review-card.is-ignored{opacity:.56;filter:saturate(.75)}
      .fan-review-card.is-ignored:hover,.fan-review-card.is-ignored:focus-within{opacity:.82}
      .fan-review-card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding:12px 14px;border-bottom:1px solid rgba(255,255,255,.07)}
      .fan-review-live{color:#f3d234;font-size:8px;font-weight:950;letter-spacing:.06em}
      .fan-review-meta{margin-top:3px;color:#88919d;font-size:8px}
      .fan-review-position{color:#88919d;font-size:8px;font-weight:900}
      .fan-review-body{padding:16px}
      .fan-review-fanname{font-size:22px;font-weight:950;line-height:1.05}
      .fan-review-fanmeta{margin-top:5px;color:#8d95a0;font-size:8px}
      .fan-review-deferred,.fan-review-ignored{display:inline-flex;margin-top:9px;padding:4px 7px;border-radius:999px;font-size:7px;font-weight:900}
      .fan-review-deferred{border:1px solid rgba(243,210,52,.24);color:#e6cf69}
      .fan-review-ignored{border:1px solid rgba(255,255,255,.10);color:#a8afb9}
      .fan-review-fields{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:18px}
      .fan-review-field{display:grid;gap:7px}
      .fan-review-field>label{font-size:8px;font-weight:950;letter-spacing:.06em;color:#939ba6}
      .fan-review-presence-line{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px;align-items:center}
      .fan-review-presence-input{height:40px;padding:7px 10px;border:1px solid rgba(255,255,255,.12);border-radius:10px;background:#15191f;color:#fff;font-weight:900}
      .fan-review-quick{display:grid;grid-template-columns:repeat(4,1fr);gap:5px}
      .fan-review-quick button,.fan-review-score button{min-height:34px;border:1px solid rgba(255,255,255,.1);border-radius:9px;background:rgba(255,255,255,.035);color:#c7ccd4;font-size:8px;font-weight:900}
      .fan-review-quick button.active,.fan-review-score button.active{border-color:#f3d234;background:rgba(243,210,52,.12);color:#f3d234}
      .fan-review-score{display:grid;grid-template-columns:repeat(5,1fr);gap:5px}
      .fan-review-preview{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:15px;padding:10px 12px;border:1px solid rgba(243,210,52,.18);border-radius:11px;background:rgba(243,210,52,.045)}
      .fan-review-preview span{font-size:8px;color:#a2a8b1}.fan-review-preview strong{font-size:18px;color:#f3d234}
      .fan-review-actions{display:grid;grid-template-columns:auto auto minmax(150px,1fr);gap:7px;margin-top:14px}
      .fan-review-actions.editing{grid-template-columns:auto minmax(150px,1fr)}
      .fan-review-actions button{min-height:38px;padding:7px 10px;border:1px solid rgba(255,255,255,.12);border-radius:10px;background:#20252c;color:#fff;font-size:8px;font-weight:950}
      .fan-review-actions .defer{color:#f3d234;border-color:rgba(243,210,52,.28)}
      .fan-review-actions .skip{color:#ff9e9e;border-color:rgba(255,100,100,.24)}
      .fan-review-actions .save{border-color:#f3d234;background:#f3d234;color:#111}
      .fan-review-status{min-height:18px;margin-top:8px;color:#8f98a4;font-size:8px}
      .fan-review-next-head{padding:11px 12px;border-bottom:1px solid rgba(255,255,255,.07);font-size:8px;font-weight:950}
      .fan-review-next-row{padding:9px 11px;border-bottom:1px solid rgba(255,255,255,.06)}
      .fan-review-next-row.is-ignored{opacity:.46}
      .fan-review-next-row:last-child{border-bottom:0}
      .fan-review-next-row strong{display:block;font-size:9px}.fan-review-next-row span{display:block;margin-top:2px;color:#838c98;font-size:7px}
      .fan-review-empty{padding:28px 16px;text-align:center;color:#8f98a4}
      .fan-review-empty strong{display:block;margin-bottom:5px;color:#fff;font-size:13px}
      .fan-review-history-toolbar{display:grid;grid-template-columns:minmax(190px,.75fr) minmax(240px,1.25fr) auto;gap:8px;align-items:end;padding:10px;border-bottom:1px solid rgba(255,255,255,.07)}
      .fan-review-history-filter{display:grid;gap:5px;min-width:0}
      .fan-review-history-filter label{font-size:7px;font-weight:950;letter-spacing:.07em;color:#89919d}
      .fan-review-history-toolbar input,.fan-review-history-toolbar select{width:100%;min-height:40px;padding:7px 10px;border:1px solid rgba(255,255,255,.12);border-radius:10px;background:#15191f;color:#fff;font-size:9px;outline:none}
      .fan-review-history-toolbar input:focus,.fan-review-history-toolbar select:focus{border-color:rgba(243,210,52,.6);box-shadow:0 0 0 2px rgba(243,210,52,.08)}
      .fan-review-history-count{display:flex;align-items:center;justify-content:center;min-height:40px;padding:6px 10px;border:1px solid rgba(255,255,255,.08);border-radius:10px;background:rgba(255,255,255,.025);color:#9aa2ad;font-size:8px;font-weight:900;white-space:nowrap}
      .fan-review-history-list{max-height:64vh;overflow:auto}
      .fan-review-history-row{display:grid;grid-template-columns:minmax(150px,1fr) minmax(180px,1.2fr) 86px 90px 80px auto;gap:8px;align-items:center;padding:10px 12px;border-bottom:1px solid rgba(255,255,255,.06)}
      .fan-review-history-row:last-child{border-bottom:0}
      .fan-review-history-row strong{font-size:9px}
      .fan-review-history-row span{font-size:8px;color:#929aa5}
      .fan-review-history-points{color:#f3d234!important;font-weight:950}
      .fan-review-history-row button{min-height:30px;padding:5px 8px;border:1px solid rgba(255,255,255,.12);border-radius:8px;background:#20252c;color:#fff;font-size:7px;font-weight:950}
      @media(max-width:820px){
        .fan-review-hero{display:grid}.fan-review-stats{justify-content:flex-start}
        .fan-review-grid{grid-template-columns:1fr}
        .fan-review-fields{grid-template-columns:1fr}
        .fan-review-actions{grid-template-columns:1fr 1fr}.fan-review-actions .save{grid-column:1/-1;order:-1}
        .fan-review-actions.editing{grid-template-columns:1fr 1fr}.fan-review-actions.editing .save{grid-column:auto;order:0}
        .fan-review-history-toolbar{grid-template-columns:1fr}
        .fan-review-history-count{justify-content:flex-start}
        .fan-review-history-row{grid-template-columns:minmax(0,1fr) auto;grid-template-areas:"fan edit" "live live" "presence participation" "points points"}
        .fan-review-history-row .history-fan{grid-area:fan}.fan-review-history-row .history-live{grid-area:live}.fan-review-history-row .history-presence{grid-area:presence}.fan-review-history-row .history-participation{grid-area:participation}.fan-review-history-row .fan-review-history-points{grid-area:points}.fan-review-history-row button{grid-area:edit}
      }
    `;
    document.head.appendChild(st);
  }

  function queueCurrent(){return queue[0]||null}
  function activeRow(){return editing||queueCurrent()||null}
  function pointsFor(row,presence,participation){
    const factor=row?.private_show?privateFactor:1;
    return Math.round(basePoints*(presence/100)*(participation/6)*factor);
  }

  function renderHeader(){
    const pending=Number(summary.pending_count??queue.length);
    const deferred=Number(summary.deferred_count??0);
    const skipped=Number(summary.skipped_count??0);
    const rated=Number(summary.rated_count??reviews.length);
    return `
      <div class="fan-review-hero">
        <div><h2>VALUTAZIONI FAN</h2><div class="section-note">Valuta presenza e partecipazione senza entrare nei singoli concerti. RIMANDA abbassa progressivamente la priorità; NON SO CHI È mette il fan in fondo e in semitrasparenza, ma resta sempre valutabile in futuro.</div></div>
        <div class="fan-review-stats">
          <span class="fan-review-pill pending">${pending} DA VALUTARE</span>
          <span class="fan-review-pill">${deferred} RIMANDATI</span>
          <span class="fan-review-pill">${skipped} NON RICONOSCIUTI</span>
          <span class="fan-review-pill">${rated} VALUTATI</span>
        </div>
      </div>
      <div class="fan-review-tabs">
        <button type="button" class="fan-review-tab ${view==="queue"?"active":""}" data-review-view="queue">DA VALUTARE</button>
        <button type="button" class="fan-review-tab ${view==="history"?"active":""}" data-review-view="history">GIÀ VALUTATI</button>
      </div>`;
  }

  function editorMarkup(row,isEditing=false){
    if(!row)return `<div class="fan-review-card"><div class="fan-review-empty"><strong>CODA COMPLETATA ✓</strong>Non ci sono fan da valutare in questo momento.</div></div>`;

    const presence=Number(isEditing?row.presence_percent:100);
    const participation=Number(isEditing?row.participation_score:6);
    const ignored=!isEditing&&row.my_state==="skipped";
    return `<div class="fan-review-card${ignored?" is-ignored":""}" data-review-card>
      <div class="fan-review-card-head">
        <div><div class="fan-review-live">${escHtml(row.concert_name)}${row.private_show?" · PRIVATE SHOW":""}</div><div class="fan-review-meta">${fmtDate(row.concert_date)}${row.start_time?` · ${escHtml(fmtTime(row.start_time))}`:""}${isEditing?" · VALUTAZIONE ESISTENTE":""}</div></div>
        <span class="fan-review-position">${isEditing?"MODIFICA":`#${Number(row.queue_position||1)} IN CODA`}</span>
      </div>
      <div class="fan-review-body">
        <div class="fan-review-fanname">${escHtml(row.fan_name)}</div>
        <div class="fan-review-fanmeta">${isEditing?"Modifica i valori già salvati":`Fan dal ${fmtDate(row.fan_since)}`}</div>
        ${!isEditing&&ignored?'<span class="fan-review-ignored">NON RICONOSCIUTO · MESSO IN FONDO</span>':!isEditing&&Number(row.my_defer_count||0)>0?`<span class="fan-review-deferred">RIMANDATO DA TE ${Number(row.my_defer_count)} VOLT${Number(row.my_defer_count)===1?"A":"E"}</span>`:""}
        <div class="fan-review-fields">
          <div class="fan-review-field">
            <label>PRESENZA AL LIVE</label>
            <div class="fan-review-presence-line"><input class="fan-review-presence-input" type="number" min="0" max="100" step="5" value="${presence}" inputmode="numeric"><b>%</b></div>
            <div class="fan-review-quick" data-presence-quick>${[25,50,75,100].map(v=>`<button type="button" data-value="${v}" class="${v===presence?"active":""}">${v}%</button>`).join("")}</div>
          </div>
          <div class="fan-review-field">
            <label>PARTECIPAZIONE</label>
            <div class="fan-review-score" data-participation-score>${Array.from({length:10},(_,i)=>i+1).map(v=>`<button type="button" data-value="${v}" class="${v===participation?"active":""}">${v}</button>`).join("")}</div>
          </div>
        </div>
        <div class="fan-review-preview"><span>Punteggio stimato per questo live</span><strong data-points-preview>${pointsFor(row,presence,participation)} pt</strong></div>
        <div class="fan-review-actions${isEditing?" editing":""}">
          ${isEditing?'<button type="button" data-review-cancel>ANNULLA</button>':`<button class="defer" type="button" data-review-defer>RIMANDA</button><button class="skip" type="button" data-review-skip>NON SO CHI È · METTI IN FONDO</button>`}
          <button class="save" type="button" data-review-save>${isEditing?"SALVA MODIFICHE":"SALVA VALUTAZIONE"}</button>
        </div>
        <div class="fan-review-status" data-review-status></div>
      </div>
    </div>`;
  }

  function renderQueue(){
    const row=activeRow();
    const upcoming=editing?[]:queue.slice(1,6);
    const next=`<div class="fan-review-next"><div class="fan-review-next-head">PROSSIMI IN CODA</div>${upcoming.length?upcoming.map(x=>`<div class="fan-review-next-row${x.my_state==="skipped"?" is-ignored":""}"><strong>${escHtml(x.fan_name)}</strong><span>${escHtml(x.concert_name)} · ${fmtDate(x.concert_date)}${x.my_state==="skipped"?" · non riconosciuto":Number(x.my_defer_count||0)?` · rimandato ${Number(x.my_defer_count)}×`:""}</span></div>`).join(""):'<div class="fan-review-empty">Nessun altro fan in coda.</div>'}</div>`;
    return `<div class="fan-review-grid">${editorMarkup(row,!!editing)}${next}</div>`;
  }

  function liveOptions(){
    const map=new Map();
    reviews.forEach(r=>{
      const key=String(r.concert_id||"");
      if(!key||map.has(key))return;
      map.set(key,{
        id:key,
        name:r.concert_name||"Live",
        date:r.concert_date||"",
        start_time:r.start_time||""
      });
    });
    return [...map.values()].sort((a,b)=>
      String(b.date).localeCompare(String(a.date))
      || String(b.start_time||"").localeCompare(String(a.start_time||""))
      || String(a.name).localeCompare(String(b.name),"it")
    );
  }

  function historyRowsMarkup(){
    return reviews.map(r=>`<div class="fan-review-history-row"
      data-history-row
      data-fan-name="${escHtml(String(r.fan_name||"").toLowerCase())}"
      data-concert-id="${escHtml(r.concert_id)}">
      <strong class="history-fan">${escHtml(r.fan_name)}</strong>
      <span class="history-live">${escHtml(r.concert_name)} · ${fmtDate(r.concert_date)}</span>
      <span class="history-presence">${Number(r.presence_percent)}% presenza</span>
      <span class="history-participation">partecipazione ${Number(r.participation_score).toFixed(1)}</span>
      <span class="fan-review-history-points">${Number(r.estimated_points||0)} pt</span>
      <button type="button" data-review-edit="${escHtml(r.concert_id)}" data-fan-id="${escHtml(r.fan_id)}">MODIFICA</button>
    </div>`).join("");
  }

  function renderHistory(){
    const options=liveOptions();
    return `<div class="fan-review-history">
      <div class="fan-review-history-toolbar">
        <div class="fan-review-history-filter">
          <label for="fanReviewLiveFilter">LIVE</label>
          <select id="fanReviewLiveFilter">
            <option value="">TUTTI I LIVE</option>
            ${options.map(c=>`<option value="${escHtml(c.id)}" ${String(c.id)===String(liveFilter)?"selected":""}>${fmtDate(c.date)} · ${escHtml(c.name)}</option>`).join("")}
          </select>
        </div>
        <div class="fan-review-history-filter">
          <label for="fanReviewSearch">FAN</label>
          <input id="fanReviewSearch" type="search" autocomplete="off" placeholder="Cerca nome fan..." value="${escHtml(fanSearch)}">
        </div>
        <div class="fan-review-history-count" id="fanReviewHistoryCount">${reviews.length} VALUTAZIONI</div>
      </div>
      <div class="fan-review-history-list" id="fanReviewHistoryList">
        ${reviews.length?historyRowsMarkup():'<div class="fan-review-empty">Nessuna valutazione salvata.</div>'}
        <div class="fan-review-empty" id="fanReviewHistoryEmpty" hidden>Nessuna valutazione corrisponde ai filtri.</div>
      </div>
    </div>`;
  }

  function applyHistoryFilters(){
    const list=$("fanReviewHistoryList");
    if(!list)return;
    const needle=fanSearch.trim().toLowerCase();
    let visible=0;
    qa("[data-history-row]",list).forEach(row=>{
      const fan=String(row.dataset.fanName||"");
      const concertId=String(row.dataset.concertId||"");
      const show=(!needle||fan.includes(needle))&&(!liveFilter||concertId===String(liveFilter));
      row.hidden=!show;
      if(show)visible++;
    });
    const count=$("fanReviewHistoryCount");
    if(count)count.textContent=`${visible} DI ${reviews.length} VALUTAZIONI`;
    const empty=$("fanReviewHistoryEmpty");
    if(empty)empty.hidden=visible!==0||reviews.length===0;
  }

  function render(){
    const root=$(PAGE_ID);
    if(!root)return;
    root.innerHTML=`<div class="fan-review-shell">${renderHeader()}${view==="history"?renderHistory():renderQueue()}</div>`;
    bindCommon();
    if(view==="history")bindHistory();else bindEditor();
  }

  function bindCommon(){
    qa("[data-review-view]",$(PAGE_ID)).forEach(btn=>btn.onclick=()=>{
      view=btn.dataset.reviewView;
      editing=null;
      render();
    });
  }

  function bindHistory(){
    const input=$("fanReviewSearch");
    const select=$("fanReviewLiveFilter");
    if(input)input.oninput=e=>{
      fanSearch=String(e.target.value||"");
      applyHistoryFilters();
    };
    if(select)select.onchange=e=>{
      liveFilter=String(e.target.value||"");
      applyHistoryFilters();
    };
    qa("[data-review-edit]",$(PAGE_ID)).forEach(btn=>btn.onclick=()=>{
      const row=reviews.find(r=>String(r.concert_id)===String(btn.dataset.reviewEdit)&&String(r.fan_id)===String(btn.dataset.fanId));
      if(!row)return;
      editing={...row};
      view="queue";
      render();
    });
    applyHistoryFilters();
  }

  function bindEditor(){
    const root=$(PAGE_ID),row=activeRow(),card=q("[data-review-card]",root);
    if(!row||!card)return;
    const presence=q(".fan-review-presence-input",card);
    const scoreButtons=qa("[data-participation-score] button",card);
    const preview=q("[data-points-preview]",card);
    const status=q("[data-review-status]",card);
    let participation=Number(editing?row.participation_score:6);

    const paint=()=>{
      const p=Number(presence.value);
      const valid=Number.isFinite(p)&&p>=0&&p<=100&&participation>=1&&participation<=10;
      preview.textContent=valid?`${pointsFor(row,p,participation)} pt`:"—";
      qa("[data-presence-quick] button",card).forEach(b=>b.classList.toggle("active",Number(b.dataset.value)===p));
      scoreButtons.forEach(b=>b.classList.toggle("active",Number(b.dataset.value)===participation));
    };

    qa("[data-presence-quick] button",card).forEach(b=>b.onclick=()=>{presence.value=b.dataset.value;paint()});
    presence.oninput=paint;
    scoreButtons.forEach(b=>b.onclick=()=>{participation=Number(b.dataset.value);paint()});
    const busy=value=>qa("button",card).forEach(b=>b.disabled=value);

    q("[data-review-cancel]",card)?.addEventListener("click",()=>{editing=null;view="history";render()});

    q("[data-review-save]",card).onclick=async()=>{
      const p=Number(presence.value);
      if(!Number.isFinite(p)||p<0||p>100){status.textContent="La presenza deve essere tra 0% e 100%.";return}
      busy(true);status.textContent=editing?"Aggiornamento...":"Salvataggio...";
      try{
        const {error}=await sb.rpc("set_my_fan_live_activity",{
          p_concert_id:row.concert_id,
          p_fan_id:row.fan_id,
          p_presence_percent:p,
          p_participation_score:participation
        });
        if(error)throw error;
        const wasEditing=!!editing;
        editing=null;
        view=wasEditing?"history":"queue";
        await load(true);
      }catch(err){status.textContent=err.message||String(err);busy(false)}
    };

    q("[data-review-defer]",card)?.addEventListener("click",async()=>{
      busy(true);status.textContent="Rimando...";
      try{
        const {error}=await sb.rpc("defer_my_fan_live_review",{p_concert_id:row.concert_id,p_fan_id:row.fan_id});
        if(error)throw error;
        await load(true);
      }catch(err){status.textContent=err.message||String(err);busy(false)}
    });

    q("[data-review-skip]",card)?.addEventListener("click",async()=>{
      if(row.my_state==="skipped"){
        status.textContent="È già in fondo alla coda: puoi comunque valutarlo quando vuoi.";
        return;
      }
      busy(true);status.textContent="Sposto in fondo...";
      try{
        const {error}=await sb.rpc("skip_my_fan_live_review",{p_concert_id:row.concert_id,p_fan_id:row.fan_id});
        if(error)throw error;
        await load(true);
      }catch(err){status.textContent=err.message||String(err);busy(false)}
    });
  }

  async function load(force=false){
    if(loading&&!force)return;
    loading=true;
    const root=$(PAGE_ID);
    if(root)root.innerHTML='<div class="fan-review-card"><div class="fan-review-empty">Caricamento valutazioni...</div></div>';
    try{
      const [{data:qData,error:qError},{data:sData,error:sError},{data:rData,error:rError},{data:settings,error:setError}]=await Promise.all([
        sb.rpc("get_my_fan_live_review_queue"),
        sb.rpc("get_my_fan_live_review_summary"),
        sb.rpc("get_my_fan_live_reviews"),
        sb.from("app_numeric_settings").select("setting_key,value").in("setting_key",["fan.attendance_public","fan.private_show_percent"])
      ]);
      if(qError)throw qError;
      if(sError)throw sError;
      if(rError)throw rError;
      if(setError)throw setError;
      queue=qData||[];
      reviews=rData||[];
      summary=sData?.[0]||{pending_count:queue.length,deferred_count:0,skipped_count:0,rated_count:reviews.length};
      const cfg=new Map((settings||[]).map(x=>[x.setting_key,Number(x.value)]));
      basePoints=Number(cfg.get("fan.attendance_public")??500);
      privateFactor=Number(cfg.get("fan.private_show_percent")??33)/100;
      render();
    }catch(err){
      if(root)root.innerHTML=`<div class="fan-review-card"><div class="fan-review-empty"><strong>VALUTAZIONI NON DISPONIBILI</strong>${escHtml(err.message||String(err))}</div></div>`;
    }finally{loading=false}
  }

  injectStyles();
  window.JM_FAN_REVIEWS_LOAD=load;
})();
