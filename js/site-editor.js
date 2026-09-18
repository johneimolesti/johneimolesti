(() => {
  'use strict';
  const catalog=window.JM_COPY_CATALOG;
  const state=new window.JMCopyState(catalog);
  const groups={global:'Navigazione e cornice',home:'Home',tour:'Live',rankings:'Classifiche',band:'Band',more:'Backstage',footer:'Footer',account:'Accesso e area fan',live:'Dettaglio concerto',interfaccia:'Pulsanti e messaggi'};
  const attrNames=['placeholder','aria-label','alt','content'];
  let sb,member=null,canSave=false,available=false,editing=false,picking=false,selected=null,observer,applying=false,saving=false,invalidField=false,memberVersion=0;
  const $=id=>document.getElementById(id);
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const text=(key,params)=>state.text(key,params);
  const isAdmin=()=>member && ['ema','kekko'].includes(String(member.username).toLowerCase());
  const targets='[data-copy],'+attrNames.map(a=>`[data-copy-${a}]`).join(',');
  const storageStatus=()=>!available?'Salvataggio condiviso non ancora attivato. Puoi provare i testi in anteprima; non saranno pubblicati.':!canSave?'Questo account non ha il permesso di pubblicare i testi.':'Le modifiche sono in anteprima finché non premi Pubblica testi.';
  function apply() {
    if(applying)return;
    applying=true;
    observer?.disconnect();
    document.querySelectorAll(targets).forEach(el=>{
      if(el.closest('[data-editor-ui]'))return;
      const key=el.dataset.copy;
      if(key && catalog[key]){
        let params={};try{params=JSON.parse(el.dataset.copyParams||'{}');}catch{}
        const value=text(key,params);if(el.textContent!==value)el.textContent=value;
      }
      for(const attr of attrNames){const key=el.getAttribute('data-copy-'+attr);if(key && catalog[key]){const value=text(key);if(el.getAttribute(attr)!==value)el.setAttribute(attr,value);}}
    });
    observer?.observe(document.body,{subtree:true,childList:true,characterData:true});
    applying=false;
  }
  function write(el,key,params={}) {
    if(!el)return;
    el.dataset.copy=key;el.dataset.copyParams=JSON.stringify(params);el.textContent=text(key,params);
  }
  function bindText(el,value) {
    const key=Object.keys(catalog).find(k=>k.startsWith('ui.') && text(k)===value);
    if(key)write(el,key);else el.textContent=value;
  }
  async function load() {
    const {data,error}=await sb.from('site_content').select('content,revision').eq('id','public').abortSignal(AbortSignal.timeout(6000)).maybeSingle();
    if(error || !data){available=false;return false;}
    state.load(data);available=true;apply();return true;
  }
  function updateStatus(message) {
    if(!$('copyStatus'))return;
    $('copyStatus').textContent=message||storageStatus();
    $('copyCounter').textContent=state.changes.length ? `${state.changes.length} modifiche da pubblicare` : 'Nessuna modifica in sospeso';
    $('copyPublish').disabled=saving||!canSave||!available||!state.changes.length||invalidField;
    $('copyDiscard').disabled=saving||!state.changes.length;
    $('copyValue').disabled=saving;
    for(const id of ['copyReset','copyReload','copyClose'])$(''+id).disabled=saving;
  }
  function change() {apply();document.dispatchEvent(new Event('jm:copy-change'));updateStatus();}
  function drawList() {
    const query=$('copySearch').value.trim().toLowerCase(),group=$('copyGroup').value;
    const keys=Object.keys(catalog).filter(k=>(!group||catalog[k].group===group)&&(!query||[catalog[k].default,text(k),groups[catalog[k].group]].some(s=>s.toLowerCase().includes(query))));
    $('copyList').replaceChildren();
    for(const key of keys){
      const button=document.createElement('button');button.type='button';button.className='copy-list-item';button.dataset.key=key;
      button.setAttribute('aria-pressed',String(key===selected));
      const label=document.createElement('small');label.textContent=groups[catalog[key].group]||catalog[key].group;
      const line=document.createElement('span');line.textContent=text(key);
      button.append(label,line);button.onclick=()=>select(key,true);$('copyList').append(button);
    }
    $('copyFound').textContent=`${keys.length} testi`;
  }
  function select(key,navigate=false) {
    if(!catalog[key])return;
    selected=key;invalidField=false;$('copyField').hidden=false;$('copyFieldTitle').textContent=groups[catalog[key].group]||'Testo';
    $('copyValue').value=state.draft[key]??catalog[key].default;$('copyDefault').textContent=catalog[key].default;$('copyFieldError').textContent='';
    document.querySelectorAll('.copy-selected').forEach(n=>n.classList.remove('copy-selected'));
    const nodes=[...document.querySelectorAll(targets)].filter(n=>n.dataset.copy===key||attrNames.some(a=>n.getAttribute('data-copy-'+a)===key));
    if(navigate){const route=catalog[key].group;if(['home','tour','rankings','band','more'].includes(route))location.hash='#/'+route;}
    nodes.forEach(n=>n.classList.add('copy-selected'));
    const visible=nodes.find(n=>n.getClientRects().length && !n.closest('[hidden],.hidden'));
    if(navigate && visible)visible.scrollIntoView({block:'center',behavior:'smooth'});
    $('copyList').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.key===key)));
    $('copyValue').focus();updateStatus();
  }
  function setPicking(value){picking=value;document.body.classList.toggle('copy-picking',value);$('copyPick').setAttribute('aria-pressed',String(value));$('copyPick').textContent=value?'Seleziona testo: ON':'Naviga nel sito';}
  async function open() {
    if(!isAdmin())return;
    await checkPermission();
    if(!available){try{await load();}catch{}}
    if(!isAdmin())return;
    if(!$('siteCopyPanel'))buildPanel();
    editing=true;document.body.classList.add('copy-editing');$('siteCopyToolbar').hidden=false;$('siteCopyPanel').hidden=false;
    $('editSiteEntry').hidden=true;drawList();updateStatus();setPicking(true);
  }
  function close(force=false){
    if(saving&&!force)return;
    if(!force&&state.changes.length&&!confirm('Uscire e annullare le modifiche non pubblicate?'))return;
    if(state.changes.length){state.discard();change();}
    editing=false;picking=false;invalidField=false;document.body.classList.remove('copy-editing','copy-picking');
    document.querySelectorAll('.copy-selected').forEach(n=>n.classList.remove('copy-selected'));
    if($('siteCopyToolbar'))$('siteCopyToolbar').hidden=true;
    if($('siteCopyPanel'))$('siteCopyPanel').hidden=true;
    $('editSiteEntry').hidden=!isAdmin();
  }
  function buildPanel(){
    const toolbar=document.createElement('section');toolbar.id='siteCopyToolbar';toolbar.dataset.editorUi='';toolbar.className='copy-toolbar';toolbar.setAttribute('aria-label','Editor del sito');
    toolbar.innerHTML='<strong>✎ EDITOR SITO</strong><button type="button" id="copyPick" aria-pressed="true">Seleziona testo: ON</button><span id="copyCounter" role="status"></span><button type="button" id="copyPublish">Pubblica testi</button><button type="button" id="copyClose" aria-label="Chiudi editor">×</button>';
    const panel=document.createElement('aside');panel.id='siteCopyPanel';panel.dataset.editorUi='';panel.className='copy-panel';panel.setAttribute('aria-label','Modifica testi e label');
    panel.innerHTML=`<h2>Il sito, parola per parola.</h2><p id="copyStatus" role="status"></p><label class="copy-label">Pagina<select id="copyRoute"><option value="home">Home</option><option value="tour">Live</option><option value="rankings">Classifiche</option><option value="band">Band</option><option value="more">Backstage</option></select></label><p class="copy-help">Seleziona un testo nella pagina oppure cercalo nell’elenco. Per usare link e pulsanti, disattiva la selezione.</p><section id="copyField" hidden><h3 id="copyFieldTitle">Testo</h3><label class="copy-label" for="copyValue">Testo in anteprima</label><textarea id="copyValue" rows="4" maxlength="2000"></textarea><p id="copyFieldError" role="alert"></p><details><summary>Testo originale</summary><p id="copyDefault"></p></details><button type="button" id="copyReset">Ripristina questo testo</button></section><label class="copy-label">Cerca un testo<input id="copySearch" type="search" placeholder="Titolo, pulsante, messaggio…"></label><label class="copy-label">Sezione<select id="copyGroup"><option value="">Tutte le sezioni</option>${Object.entries(groups).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></label><small id="copyFound"></small><div id="copyList"></div><div class="copy-panel-actions"><button id="copyDiscard" type="button">Annulla modifiche</button><button id="copyReload" type="button">Ricarica pubblicati</button></div><p class="copy-help">Concerti, brani, nomi dei fan e voti rimangono dati del gestionale.</p><a class="copy-manage" href="manage.html">Apri il gestionale →</a>`;
    document.body.append(toolbar,panel);
    $('copyRoute').value=location.hash.replace('#/','')||'home';
    $('copyRoute').onchange=e=>{location.hash='#/'+e.target.value;};
    $('copyPick').onclick=()=>setPicking(!picking);$('copyClose').onclick=()=>close();
    $('copySearch').oninput=drawList;$('copyGroup').onchange=drawList;
    $('copyValue').oninput=e=>{if(!selected)return;try{state.set(selected,e.target.value);invalidField=false;$('copyFieldError').textContent='';change();}catch(err){invalidField=true;$('copyFieldError').textContent=err.message;updateStatus('Correggi il testo selezionato prima di pubblicare.');}};
    $('copyReset').onclick=()=>{if(!selected)return;state.reset(selected);select(selected);change();drawList();};
    $('copyDiscard').onclick=()=>{if(!confirm('Annullare tutte le modifiche non pubblicate?'))return;state.discard();if(selected)select(selected);change();drawList();};
    $('copyReload').onclick=async()=>{if(state.changes.length&&!confirm('Ricaricare i testi pubblicati? Le modifiche in anteprima saranno annullate.'))return;try{if(!await load())throw new Error('Il salvataggio condiviso non è disponibile. Le modifiche in anteprima sono conservate.');await checkPermission();if(selected)select(selected);change();drawList();}catch(err){updateStatus(err.message);}};
    $('copyPublish').onclick=publish;
  }
  async function publish(){
    if(saving||invalidField||!canSave||!available||!member)return;
    saving=true;updateStatus('Pubblicazione in corso…');
    try{
      const {data,error}=await sb.auth.getUser();if(error||data.user?.id!==member.id)throw new Error('Sessione scaduta. Accedi di nuovo come admin.');
      await checkPermission();if(!canSave)throw new Error('Il permesso di pubblicazione non è più disponibile.');
      await state.publish(sb,member.id);updateStatus('Testi pubblicati. Ora sono visibili a tutti.');drawList();
    }catch(err){updateStatus(err.message);}finally{saving=false;const msg=$('copyStatus').textContent;updateStatus(msg);}
  }
  async function checkPermission(){
    const snapshot=memberVersion;canSave=false;
    if(!isAdmin()||!sb)return;
    try{const {data,error}=await sb.from('site_content_editors').select('user_id').eq('user_id',member.id).maybeSingle();if(snapshot===memberVersion)canSave=!error&&!!data;}
    catch{canSave=false;}
  }
  function setMember(profile){
    if(member?.id===profile?.id)return;
    member=profile;memberVersion++;canSave=false;
    if(!isAdmin() && editing)close(true);
    if($('editSiteEntry'))$('editSiteEntry').hidden=!isAdmin();
    if(isAdmin())checkPermission().then(()=>updateStatus());
  }
  async function init(client){
    sb=client;
    try{await load();}catch{available=false;}
    observer=new MutationObserver(records=>{if(records.every(r=>(r.target.nodeType===1?r.target:r.target.parentElement)?.closest?.('[data-editor-ui]')))return;apply();});
    apply();
    $('editSiteEntry').onclick=open;
    // Capture selection before navigation / voting handlers; DOM text remains plain text.
    document.addEventListener('click',e=>{
      if(!editing||!picking||e.target.closest('[data-editor-ui]'))return;
      const node=e.target.closest(targets)||e.target.closest('button,a,label')?.querySelector(targets);if(!node)return;
      const key=node.dataset.copy||attrNames.map(a=>node.getAttribute('data-copy-'+a)).find(Boolean);
      if(!catalog[key])return;e.preventDefault();e.stopImmediatePropagation();select(key);
    },true);
    window.addEventListener('beforeunload',e=>{if(state.changes.length||saving){e.preventDefault();e.returnValue='';}});
    window.addEventListener('hashchange',()=>{if($('copyRoute'))$('copyRoute').value=location.hash.replace('#/','');});
    sb.auth.onAuthStateChange((event)=>{if(event==='SIGNED_OUT')setMember(null);});
  }
  function ready(){if(new URLSearchParams(location.search).get('edit')==='1'){if(isAdmin())open();else {$('userEntry').click();document.querySelector('[data-login-mode="member"]')?.click();}}}
  window.JMCopy={init,ready,text,write,bindText,setMember,open};
})();
