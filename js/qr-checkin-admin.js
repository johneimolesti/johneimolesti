(() => {
  'use strict';

  const q=(s,r=document)=>r.querySelector(s);
  const qa=(s,r=document)=>[...r.querySelectorAll(s)];
  const isAdmin=()=>{try{return typeof isEma==='function'&&isEma()}catch{return false}};

  function injectStyles(){
    if(document.getElementById('checkinQrAdminStyles'))return;
    const st=document.createElement('style');
    st.id='checkinQrAdminStyles';
    st.textContent=`
      .checkin-qr-layout{display:grid!important;grid-template-columns:minmax(260px,420px) minmax(280px,1fr)!important;gap:14px!important;padding:14px!important}
      #checkinQrPreview svg,#checkinQrPreview canvas{max-width:100%;height:auto}
      @media(max-width:850px){.checkin-qr-layout{grid-template-columns:1fr!important}#checkinQrPreview{min-height:0!important}}
    `;
    document.head.appendChild(st);
  }

  const CHECKIN_QR_URL='https://johneimolesti.github.io/johneimolesti/#/checkin';
  let checkinQr=null;
  let checkinQrLogo='favicon.png';

  function createCheckinQrPage(){
    if(!isAdmin()||document.getElementById('checkinQrPage'))return;
    const nav=document.getElementById('memberNav');
    const main=q('#memberApp main');
    if(!nav||!main)return;
    const button=document.createElement('button');
    button.id='checkinQrNav'; button.className='nav-button'; button.dataset.category='setup';
    button.dataset.page='checkinQrPage'; button.type='button'; button.textContent='QR CHECK-IN';
    nav.appendChild(button);
    const page=document.createElement('section');
    page.id='checkinQrPage'; page.className='page';
    page.innerHTML=`<div class="panel">
      <div class="panel-header"><h2>QR CHECK-IN</h2><span class="counter">PRESENZE LIVE</span></div>
      <div style="display:grid;grid-template-columns:minmax(260px,420px) minmax(280px,1fr);gap:14px;padding:14px" class="checkin-qr-layout">
        <div style="display:grid;place-items:center;min-height:430px;border:1px solid var(--border);border-radius:9px;background:#fff;padding:22px;overflow:hidden" id="checkinQrPreview"></div>
        <div>
          <p class="section-note">Genera il QR permanente per l’autocertificazione delle presenze. Il concerto viene determinato dal backend al momento della scansione.</p>
          <div class="form-grid">
            <div class="form-field full"><label>LINK CODIFICATO</label><input id="checkinQrUrl" value="${CHECKIN_QR_URL}" readonly></div>
            <div class="form-field"><label>COLORE CODICE</label><input id="checkinQrDark" type="color" value="#000000"></div>
            <div class="form-field"><label>COLORE SFONDO</label><input id="checkinQrLight" type="color" value="#ffffff"></div>
            <div class="form-field full"><label class="check-card"><input id="checkinQrTransparent" type="checkbox"><span>SFONDO TRASPARENTE</span></label></div>
            <div class="form-field"><label>DIMENSIONE LOGO</label><input id="checkinQrLogoSize" type="range" min="12" max="30" value="22"><div class="small-info" id="checkinQrLogoSizeLabel">22%</div></div>
            <div class="form-field"><label>MARGINE</label><input id="checkinQrMargin" type="range" min="0" max="40" value="12"><div class="small-info" id="checkinQrMarginLabel">12 px</div></div>
            <div class="form-field full"><label>LOGO CENTRALE</label><input id="checkinQrLogoFile" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml"><div class="small-info">Default: logo/favicon del sito. Il livello di correzione H protegge la leggibilità con il logo centrale.</div></div>
          </div>
          <div class="toolbar" style="margin-top:14px">
            <button id="checkinQrPng" type="button">SCARICA PNG</button>
            <button id="checkinQrSvg" type="button" class="secondary">SCARICA SVG</button>
            <button id="checkinQrReset" type="button" class="secondary">RESET</button>
            <button id="checkinQrTest" type="button" class="secondary">TESTA LINK</button>
          </div>
        </div>
      </div>
    </div>`;
    main.appendChild(page);
    button.onclick=()=>openCheckinQrPage();
    ['checkinQrDark','checkinQrLight','checkinQrTransparent','checkinQrLogoSize','checkinQrMargin'].forEach(id=>q('#'+id,page)?.addEventListener('input',renderCheckinQr));
    q('#checkinQrLogoFile',page).onchange=e=>{const f=e.target.files?.[0];if(!f)return;const r=new FileReader();r.onload=()=>{checkinQrLogo=String(r.result);renderCheckinQr()};r.readAsDataURL(f)};
    q('#checkinQrPng',page).onclick=()=>checkinQr?.download({name:'john-i-molesti-checkin',extension:'png'});
    q('#checkinQrSvg',page).onclick=()=>checkinQr?.download({name:'john-i-molesti-checkin',extension:'svg'});
    q('#checkinQrTest',page).onclick=()=>window.open(CHECKIN_QR_URL,'_blank','noopener');
    q('#checkinQrReset',page).onclick=()=>{q('#checkinQrDark').value='#000000';q('#checkinQrLight').value='#ffffff';q('#checkinQrTransparent').checked=false;q('#checkinQrLogoSize').value='22';q('#checkinQrMargin').value='12';q('#checkinQrLogoFile').value='';checkinQrLogo='favicon.png';renderCheckinQr()};
  }

  function renderCheckinQr(){
    const host=q('#checkinQrPreview'); if(!host||typeof QRCodeStyling==='undefined')return;
    const dark=q('#checkinQrDark')?.value||'#000000', light=q('#checkinQrLight')?.value||'#ffffff';
    const transparent=!!q('#checkinQrTransparent')?.checked, logoSize=Number(q('#checkinQrLogoSize')?.value||22), margin=Number(q('#checkinQrMargin')?.value||12);
    q('#checkinQrLogoSizeLabel').textContent=`${logoSize}%`; q('#checkinQrMarginLabel').textContent=`${margin} px`;
    host.style.background=transparent?'repeating-conic-gradient(#ddd 0 25%,#fff 0 50%) 0/18px 18px':light;
    host.innerHTML='';
    checkinQr=new QRCodeStyling({width:360,height:360,type:'svg',data:CHECKIN_QR_URL,image:checkinQrLogo,margin,
      qrOptions:{errorCorrectionLevel:'H'},dotsOptions:{color:dark,type:'rounded'},cornersSquareOptions:{color:dark,type:'extra-rounded'},cornersDotOptions:{color:dark,type:'dot'},
      backgroundOptions:{color:transparent?'transparent':light},imageOptions:{crossOrigin:'anonymous',margin:5,imageSize:logoSize/100,hideBackgroundDots:true}});
    checkinQr.append(host);
  }

  function openCheckinQrPage(){
    if(!isAdmin())return;
    q('#memberNav')?.querySelectorAll('.nav-button').forEach(b=>b.classList.remove('active'));q('#checkinQrNav')?.classList.add('active');
    qa('#memberApp main .page').forEach(p=>p.classList.remove('active'));q('#checkinQrPage')?.classList.add('active');
    try{window.setMemberCategory?.('setup',{activate:false})}catch{} setTimeout(renderCheckinQr,0);
  }

  function boot(){
    injectStyles();
    if(isAdmin())createCheckinQrPage();
    const app=document.getElementById('memberApp');
    if(app){
      new MutationObserver(()=>{if(isAdmin())createCheckinQrPage();})
        .observe(app,{attributes:true,attributeFilter:['hidden']});
    }
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
