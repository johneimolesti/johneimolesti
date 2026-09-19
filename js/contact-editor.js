(() => {
  'use strict';

  const SUPABASE_URL='https://etzwybamvfpeitkttwrc.supabase.co';
  const SUPABASE_KEY='sb_publishable_CtyexwjoW375UXpjInOuDA_Uz28wWJx';

  const client=window.supabase?.createClient
    ? window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY)
    : null;

  const TYPES={
    instagram:{label:'Instagram',placeholder:'https://instagram.com/...'},
    facebook:{label:'Facebook',placeholder:'https://facebook.com/...'},
    youtube:{label:'YouTube',placeholder:'https://youtube.com/@...'},
    email:{label:'E-mail',placeholder:'booking@esempio.it'},
    website:{label:'Sito web',placeholder:'https://...'},
    phone:{label:'Telefono',placeholder:'+39 ...'},
    whatsapp:{label:'WhatsApp',placeholder:'+39 ... oppure https://wa.me/...'},
    tiktok:{label:'TikTok',placeholder:'https://tiktok.com/@...'},
    spotify:{label:'Spotify',placeholder:'https://open.spotify.com/...'},
    x:{label:'X',placeholder:'https://x.com/...'},
    other:{label:'Altro',placeholder:'https://...'}
  };

  let rows=[],admin=false,rendering=false,observer=null,reloadTimer=null;
  const q=(s,r=document)=>r.querySelector(s);
  const qa=(s,r=document)=>[...r.querySelectorAll(s)];
  const esc=value=>String(value??'').replace(/[&<>'"]/g,ch=>({
    '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'
  }[ch]));

  function safeHttps(value){
    try{
      const u=new URL(String(value||'').trim());
      if(u.protocol!=='https:'||u.username||u.password)return '';
      return u.href;
    }catch{return ''}
  }

  function hrefFor(type,value){
    const raw=String(value||'').trim();
    if(!raw)return '';
    if(type==='email'){
      const mail=raw.replace(/^mailto:/i,'').trim();
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)?`mailto:${mail}`:'';
    }
    if(type==='phone'){
      const phone=raw.replace(/^tel:/i,'').replace(/[^\d+]/g,'');
      return /^\+?\d{5,20}$/.test(phone)?`tel:${phone}`:'';
    }
    if(type==='whatsapp'){
      const https=safeHttps(raw);
      if(https)return https;
      const digits=raw.replace(/[^\d]/g,'');
      return digits.length>=6?`https://wa.me/${digits}`:'';
    }
    return safeHttps(raw);
  }

  function valuePreview(type,value){
    const raw=String(value||'').trim();
    if(type==='email'||type==='phone')return raw;
    try{
      const u=new URL(raw);
      return (u.hostname.replace(/^www\./,'')+u.pathname).replace(/\/$/,'');
    }catch{return raw}
  }

  function icon(type){
    const common='viewBox="0 0 24 24" aria-hidden="true" focusable="false"';
    if(type==='instagram')return `<svg ${common}><rect x="3" y="3" width="18" height="18" rx="5"></rect><circle cx="12" cy="12" r="4.2"></circle><circle class="fill" cx="17.4" cy="6.7" r="1.1"></circle></svg>`;
    if(type==='facebook')return `<svg ${common}><path class="fill" d="M14.2 8.2h3V4.4c-.5-.1-2.2-.2-4.1-.2-4.1 0-6.9 2.5-6.9 7v3.9H2v4.3h4.2V24h5.1v-4.6h4.2l.7-4.3h-4.9v-3.5c0-1.2.3-3.4 2.9-3.4z" transform="scale(.83) translate(2.2 0)"></path></svg>`;
    if(type==='youtube')return `<svg ${common}><path class="fill" d="M21.6 7.2a2.9 2.9 0 0 0-2-2C17.8 4.7 12 4.7 12 4.7s-5.8 0-7.6.5a2.9 2.9 0 0 0-2 2A30 30 0 0 0 1.9 12a30 30 0 0 0 .5 4.8 2.9 2.9 0 0 0 2 2c1.8.5 7.6.5 7.6.5s5.8 0 7.6-.5a2.9 2.9 0 0 0 2-2 30 30 0 0 0 .5-4.8 30 30 0 0 0-.5-4.8z"></path><path d="m10 15.4 5-3.4-5-3.4z"></path></svg>`;
    if(type==='email')return `<svg ${common}><rect x="3" y="5" width="18" height="14" rx="1.5"></rect><path d="m4 7 8 6 8-6"></path></svg>`;
    if(type==='website')return `<svg ${common}><circle cx="12" cy="12" r="9"></circle><path d="M3.5 12h17M12 3c2.5 2.6 3.7 5.6 3.7 9S14.5 18.4 12 21M12 3C9.5 5.6 8.3 8.6 8.3 12s1.2 6.4 3.7 9"></path></svg>`;
    if(type==='phone')return `<svg ${common}><path d="M7.4 3.5 10 7.8 7.9 10c1.3 2.7 3.4 4.8 6.1 6.1l2.2-2.1 4.3 2.6-.8 3.1c-.3 1-1.3 1.7-2.4 1.5C9.8 20 4 14.2 2.8 6.7c-.2-1.1.5-2.1 1.5-2.4z"></path></svg>`;
    if(type==='whatsapp')return `<svg ${common}><path d="M20.4 3.6A10.1 10.1 0 0 0 4.6 15.8L3.2 21l5.3-1.4A10 10 0 0 0 12 20.2h.1A10.1 10.1 0 0 0 20.4 3.6z"></path><path d="M8.1 7.1c.2-.5.4-.5.7-.5h.5c.2 0 .4.1.5.4l1 2.3c.1.3 0 .5-.2.7l-.8 1c1 2 2.5 3.5 4.6 4.4l.9-1c.2-.2.4-.3.7-.2l2.2 1c.3.1.4.3.4.6 0 .8-.4 1.6-1 2.1-.6.5-1.5.8-2.4.6-4.6-.8-8.4-4.6-9.2-9.2-.2-.8.1-1.7.6-2.2.4-.4.9-.7 1.5-.7z"></path></svg>`;
    if(type==='tiktok')return `<svg ${common}><path class="fill" d="M14.5 3v11.2a4.7 4.7 0 1 1-4-4.6v3.1a1.7 1.7 0 1 0 1 1.5V3h3zm0 0c.8 2.3 2.4 3.7 4.7 4v3.1c-1.8-.1-3.4-.7-4.7-1.8z"></path></svg>`;
    if(type==='spotify')return `<svg ${common}><circle cx="12" cy="12" r="9"></circle><path d="M7.5 9.4c3.2-1 7.3-.8 10.1.5M8.2 12.5c2.7-.8 6.2-.6 8.6.5M8.8 15.3c2.2-.6 5-.5 7 .4"></path></svg>`;
    if(type==='x')return `<svg ${common}><path class="fill" d="M5 4h3.7l3.9 5.2L17.2 4H19l-5.6 6.5L19.4 20h-3.7l-4.4-5.8L6.2 20H4.4l6-7.1z"></path></svg>`;
    return `<svg ${common}><path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1"></path></svg>`;
  }

  function ensureStyles(){
    if(q('#contactEditorStyles'))return;
    const style=document.createElement('style');
    style.id='contactEditorStyles';
    style.textContent=`
      .contacts-social-actions{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px!important}
      .contact-tile{display:grid;grid-template-columns:38px minmax(0,1fr) 18px;align-items:center;gap:10px;min-height:62px;padding:10px 11px;border:1px solid #777568;background:#20201d;color:var(--text);text-decoration:none;transition:transform .14s ease,border-color .14s ease,background .14s ease}
      .contact-tile:hover{transform:translate(-2px,-2px);border-color:var(--gold);background:#282719}
      .contact-tile-icon{width:38px;height:38px;display:grid;place-items:center;border:1px solid #69665c;background:#111;color:var(--gold)}
      .contact-tile-icon svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}.contact-tile-icon svg .fill{fill:currentColor;stroke:none}
      .contact-tile-copy{min-width:0}.contact-tile-copy strong,.contact-tile-copy span{display:block;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .contact-tile-copy strong{font:900 13px/1.1 Arial,sans-serif}.contact-tile-copy span{margin-top:4px;color:var(--muted);font:700 9px/1.2 monospace}
      .contact-tile-arrow{color:var(--gold);font-size:16px;font-weight:900}
      .contact-admin-bar{display:flex;align-items:center;justify-content:space-between;gap:9px;margin-top:18px;padding-top:12px;border-top:1px solid #555248}
      .contact-admin-bar span{color:var(--muted);font:700 9px monospace}.contact-admin-bar button{min-height:31px;padding:6px 10px;border:1px solid var(--gold);background:#111;color:var(--gold);font-size:9px;font-weight:900}
      .contacts-editor-panel{display:none;margin-top:10px;border:1px solid #777568;background:#171717}.contacts-editor-panel.open{display:block}
      .contacts-editor-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 10px;border-bottom:1px solid #555248}.contacts-editor-head strong{font-size:10px}.contacts-editor-head span{color:var(--muted);font-size:8px}
      .contacts-editor-new{display:grid;grid-template-columns:150px minmax(220px,1.5fr) 72px 82px;gap:6px;padding:9px;border-bottom:1px solid #555248}
      .contacts-editor-panel input,.contacts-editor-panel select{min-width:0;width:100%;height:34px;padding:5px 7px;border:1px solid #59564e;background:#232321;color:#fff;font-size:9px}
      .contacts-editor-panel button{min-height:32px;padding:5px 8px;border:1px solid #5c594f;background:#2a2a27;color:#ddd;font-size:8px;font-weight:900}.contacts-editor-panel button.primary{border-color:var(--gold);background:var(--gold);color:#111}.contacts-editor-panel button.danger{color:#f0a4a4}
      .contacts-editor-list{display:grid}.contact-edit-row{display:grid;grid-template-columns:145px minmax(220px,1.5fr) 58px 58px auto;gap:6px;align-items:center;padding:7px 9px;border-bottom:1px solid #45433c}.contact-edit-row:last-child{border-bottom:0}
      .contact-enabled{display:flex;align-items:center;justify-content:center;gap:4px;color:#aaa;font-size:7px}.contact-enabled input{width:14px;height:14px;min-height:0}
      .contact-edit-actions{display:flex;gap:4px}.contact-edit-status{min-height:16px;padding:6px 9px;color:var(--muted);font-size:8px}
      @media(max-width:900px){.contacts-editor-new,.contact-edit-row{grid-template-columns:1fr 1fr}.contacts-editor-new [data-new-value],.contact-edit-row .contact-value{grid-column:1/-1}.contact-edit-actions{grid-column:1/-1}.contacts-social-actions{grid-template-columns:1fr!important}}
    `;
    document.head.appendChild(style);
  }

  function typeOptions(selected=''){
    return Object.entries(TYPES).map(([key,meta])=>
      `<option value="${key}" ${key===selected?'selected':''}>${esc(meta.label)}</option>`
    ).join('');
  }

  async function detectAdmin(){
    admin=false;
    if(!client)return;
    try{
      const {data:{session}}=await client.auth.getSession();
      if(!session?.user)return;
      const {data,error}=await client
        .from('site_content_editors')
        .select('user_id')
        .eq('user_id',session.user.id)
        .maybeSingle();
      admin=!error&&!!data;
    }catch{}
  }

  async function loadContacts(){
    if(!client)return;
    const result=await client
      .from('site_contacts')
      .select('id,contact_type,label,value,enabled,sort_order,created_at')
      .order('sort_order',{ascending:true})
      .order('created_at',{ascending:true});

    if(!result.error){
      rows=(result.data||[]).map(item=>({
        ...item,
        label:TYPES[item.contact_type]?.label||'Contatto'
      }));
      return;
    }

    const fallback=await client
      .from('site_social_links')
      .select('platform,url,enabled')
      .eq('enabled',true);

    rows=(fallback.data||[]).map((x,i)=>({
      id:`legacy-${x.platform}`,
      contact_type:x.platform,
      label:TYPES[x.platform]?.label||x.platform,
      value:x.url,
      enabled:x.enabled,
      sort_order:(i+1)*10,
      legacy:true
    }));
  }

  function renderPublic(){
    const box=q('#contactsSocialActions');
    if(!box)return;
    const visible=rows.filter(x=>x.enabled!==false&&hrefFor(x.contact_type,x.value));

    rendering=true;
    box.dataset.contactsEnhanced='1';
    box.innerHTML=visible.length
      ? visible.map(item=>{
          const type=item.contact_type||'other';
          const meta=TYPES[type]||TYPES.other;
          const href=hrefFor(type,item.value);
          const external=!href.startsWith('mailto:')&&!href.startsWith('tel:');
          return `<a class="contact-tile" href="${esc(href)}" ${external?'target="_blank" rel="noopener noreferrer"':''}>
            <span class="contact-tile-icon">${icon(type)}</span>
            <span class="contact-tile-copy">
              <strong>${esc(meta.label)}</strong>
              <span>${esc(valuePreview(type,item.value))}</span>
            </span>
            <span class="contact-tile-arrow">${external?'↗':'→'}</span>
          </a>`;
        }).join('')
      : '<span class="muted-inline">Canali in aggiornamento.</span>';
    queueMicrotask(()=>{rendering=false});
  }

  function ensureAdminUi(){
    const card=q('#contactChannelsBlock');
    const actions=q('#contactsSocialActions');
    if(!card||!actions)return;

    let bar=q('#contactAdminBar');
    if(!admin){
      bar?.remove();
      q('#contactsEditorPanel')?.remove();
      return;
    }

    if(!bar){
      bar=document.createElement('div');
      bar.id='contactAdminBar';
      bar.className='contact-admin-bar';
      bar.dataset.editorUi='';
      bar.innerHTML='<span>VISIBILE SOLO AGLI ADMIN</span><button id="contactEditToggle" type="button">MODIFICA CONTATTI</button>';
      actions.before(bar);
      q('#contactEditToggle',bar).onclick=toggleEditor;
    }
  }

  function buildEditor(){
    let panel=q('#contactsEditorPanel');
    if(panel)return panel;

    panel=document.createElement('section');
    panel.id='contactsEditorPanel';
    panel.className='contacts-editor-panel';
    panel.dataset.editorUi='';
    panel.innerHTML=`
      <div class="contacts-editor-head">
        <strong>MODIFICA CONTATTI</strong>
        <span>Tipo di canale e riferimento pubblico</span>
      </div>
      <div class="contacts-editor-new">
        <select data-new-type>${typeOptions('instagram')}</select>
        <input data-new-value maxlength="2000" placeholder="${esc(TYPES.instagram.placeholder)}">
        <input data-new-order type="number" min="-9999" max="9999" value="10" title="Ordine">
        <button class="primary" type="button" data-add-contact>+ AGGIUNGI</button>
      </div>
      <div class="contacts-editor-list" id="contactsEditorList"></div>
      <div class="contact-edit-status" id="contactEditStatus"></div>`;

    q('#contactAdminBar')?.after(panel);
    const type=q('[data-new-type]',panel);
    const value=q('[data-new-value]',panel);
    type.onchange=()=>{value.placeholder=TYPES[type.value]?.placeholder||'https://...'};
    q('[data-add-contact]',panel).onclick=addContact;
    return panel;
  }

  function renderEditor(){
    const panel=buildEditor();
    const list=q('#contactsEditorList',panel);
    const editable=rows.filter(x=>!x.legacy);

    list.innerHTML=editable.length
      ? editable.map(item=>`
        <div class="contact-edit-row" data-contact-id="${esc(item.id)}">
          <select class="contact-type">${typeOptions(item.contact_type)}</select>
          <input class="contact-value" maxlength="2000" value="${esc(item.value||'')}" placeholder="${esc(TYPES[item.contact_type]?.placeholder||'https://...')}">
          <input class="contact-order" type="number" min="-9999" max="9999" value="${Number(item.sort_order||0)}" title="Ordine">
          <label class="contact-enabled"><input type="checkbox" ${item.enabled!==false?'checked':''}> ON</label>
          <div class="contact-edit-actions">
            <button class="primary" type="button" data-save-contact>SALVA</button>
            <button class="danger" type="button" data-delete-contact>ELIMINA</button>
          </div>
        </div>`).join('')
      : '<div class="contact-edit-status">Nessun contatto configurato.</div>';

    qa('[data-contact-id]',list).forEach(row=>{
      const type=q('.contact-type',row);
      const value=q('.contact-value',row);
      type.onchange=()=>{value.placeholder=TYPES[type.value]?.placeholder||'https://...'};
      q('[data-save-contact]',row).onclick=()=>saveContact(row);
      q('[data-delete-contact]',row).onclick=()=>deleteContact(row);
    });
  }

  function setStatus(message,error=false){
    const el=q('#contactEditStatus');
    if(!el)return;
    el.textContent=message||'';
    el.style.color=error?'#e99a9a':'';
  }

  async function addContact(){
    if(!admin)return;
    const panel=buildEditor();
    const type=q('[data-new-type]',panel).value;
    const value=q('[data-new-value]',panel).value.trim();
    const sort_order=Number(q('[data-new-order]',panel).value)||0;

    if(!value)return setStatus('Inserisci il riferimento.',true);
    if(!hrefFor(type,value))return setStatus('Riferimento non valido per il tipo selezionato.',true);

    setStatus('Salvataggio…');
    const {error}=await client.from('site_contacts').insert({
      contact_type:type,
      label:TYPES[type]?.label||'Contatto',
      value,
      enabled:true,
      sort_order
    });
    if(error)return setStatus(error.message,true);

    q('[data-new-value]',panel).value='';
    await reload();
    renderEditor();
    setStatus('Contatto aggiunto ✓');
  }

  async function saveContact(row){
    if(!admin)return;
    const id=row.dataset.contactId;
    const type=q('.contact-type',row).value;
    const value=q('.contact-value',row).value.trim();
    const sort_order=Number(q('.contact-order',row).value)||0;
    const enabled=q('.contact-enabled input',row).checked;

    if(!value)return setStatus('Il riferimento non può essere vuoto.',true);
    if(!hrefFor(type,value))return setStatus('Riferimento non valido per il tipo selezionato.',true);

    setStatus('Salvataggio…');
    const {error}=await client.from('site_contacts').update({
      contact_type:type,
      label:TYPES[type]?.label||'Contatto',
      value,
      enabled,
      sort_order
    }).eq('id',id);
    if(error)return setStatus(error.message,true);

    await reload();
    renderEditor();
    setStatus('Salvato ✓');
  }

  async function deleteContact(row){
    if(!admin)return;
    const item=rows.find(x=>String(x.id)===String(row.dataset.contactId));
    if(!confirm(`Eliminare il contatto ${TYPES[item?.contact_type]?.label||'selezionato'}?`))return;

    const {error}=await client.from('site_contacts').delete().eq('id',row.dataset.contactId);
    if(error)return setStatus(error.message,true);

    await reload();
    renderEditor();
    setStatus('Contatto eliminato.');
  }

  function toggleEditor(){
    const panel=buildEditor();
    const open=!panel.classList.contains('open');
    panel.classList.toggle('open',open);
    q('#contactEditToggle').textContent=open?'CHIUDI MODIFICA':'MODIFICA CONTATTI';
    if(open)renderEditor();
  }

  async function reload(){
    await loadContacts();
    renderPublic();
    ensureAdminUi();
  }

  function watchPublicBox(){
    const box=q('#contactsSocialActions');
    if(!box||observer)return;
    observer=new MutationObserver(()=>{
      if(rendering)return;
      if(box.dataset.contactsEnhanced==='1'&&box.querySelector('.contact-tile,.muted-inline'))return;
      clearTimeout(reloadTimer);
      reloadTimer=setTimeout(()=>renderPublic(),20);
    });
    observer.observe(box,{childList:true,subtree:true});
  }

  async function sync(){
    if(!client)return;
    ensureStyles();
    await detectAdmin();
    await reload();
    watchPublicBox();
  }

  function boot(){
    if(!client)return;
    sync();
    client.auth.onAuthStateChange(()=>setTimeout(sync,0));
    window.addEventListener('hashchange',()=>{
      if(location.hash.startsWith('#/contacts'))setTimeout(sync,0);
    });
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
