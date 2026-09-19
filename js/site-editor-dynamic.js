(() => {
  'use strict';

  const catalog=window.JM_COPY_CATALOG;
  const jm=window.JMCopy;
  if(!catalog||!jm)return;

  const ROUTE_LABELS={
    repertoire:'Repertorio',
    contacts:'Contatti',
    more:'Media'
  };

  const dynamicContainerSelector=[
    '.ranking-list',
    '.concert-grid',
    '.concert-list',
    '.repertoire-grid',
    '.public-video-grid',
    '.public-photo-grid',
    '#mediaGallery',
    '#bookingDays',
    '#bookingSelectedDates',
    '#toastStack',
    '.modal',
    '[data-editor-ui]'
  ].join(',');

  const candidates='h1,h2,h3,h4,p,.section-kicker,.page-hero-ornament,.booking-help,button,label>span';
  const attrCandidates='input[placeholder],textarea[placeholder]';

  function hash(text){
    let h=2166136261;
    for(let i=0;i<text.length;i++){
      h^=text.charCodeAt(i);
      h=Math.imul(h,16777619);
    }
    return (h>>>0).toString(36);
  }

  function domPath(el,root){
    const parts=[];
    let node=el;
    while(node&&node!==root&&node.nodeType===1){
      let part=node.tagName.toLowerCase();
      if(node.id){
        part+='#'+node.id;
        parts.unshift(part);
        break;
      }
      const cls=[...node.classList].filter(x=>!['active','hidden','glass-card'].includes(x))[0];
      if(cls)part+='.'+cls;
      const siblings=node.parentElement
        ? [...node.parentElement.children].filter(x=>x.tagName===node.tagName)
        : [];
      if(siblings.length>1)part+=`:nth(${siblings.indexOf(node)+1})`;
      parts.unshift(part);
      node=node.parentElement;
    }
    return parts.join('>');
  }

  function register(key,group,defaultValue){
    const text=String(defaultValue||'').trim();
    if(!text)return false;
    if(!catalog[key])catalog[key]={group,default:text};
    return true;
  }

  function editableText(el){
    if(el.matches('[data-copy]'))return false;
    if(el.closest(dynamicContainerSelector))return false;
    if(el.closest('#siteCopyToolbar,#siteCopyPanel'))return false;
    if(el.children.length&&el.matches('button')&&el.querySelector('[data-copy]'))return false;

    const text=String(el.textContent||'').replace(/\s+/g,' ').trim();
    if(!text||text.length>2000)return false;
    if(!/[A-Za-zÀ-ÿ]/.test(text))return false;
    return true;
  }

  function scanPage(page){
    const route=String(page.dataset.page||'').trim();
    if(!route)return;

    const knownStatic=['home','tour','rankings','band'];
    let roots=[page];

    if(knownStatic.includes(route))return;

    if(route==='more'){
      roots=[
        page.querySelector('.page-hero'),
        page.querySelector('#videosBlock'),
        page.querySelector('#photosBlock')
      ].filter(Boolean);
    }

    for(const root of roots){
      root.querySelectorAll(candidates).forEach(el=>{
        if(!editableText(el))return;
        const def=String(el.textContent||'').replace(/\s+/g,' ').trim();
        const key=`dynamic.${route}.${hash(domPath(el,page))}`;
        if(register(key,route,def))el.dataset.copy=key;
      });

      root.querySelectorAll(attrCandidates).forEach(el=>{
        if(el.closest(dynamicContainerSelector))return;
        const value=String(el.getAttribute('placeholder')||'').trim();
        if(!value)return;
        const key=`dynamic.${route}.${hash(domPath(el,page)+':placeholder')}`;
        if(register(key,route,value))el.setAttribute('data-copy-placeholder',key);
      });
    }
  }

  function scanNavigation(){
    document.querySelectorAll('#mainNav [data-route] span:not([data-copy])').forEach(el=>{
      const route=el.closest('[data-route]')?.dataset.route||'global';
      const value=String(el.textContent||'').trim();
      if(!value)return;
      const key=`dynamic.${route}.nav`;
      if(register(key,route,value))el.dataset.copy=key;
    });
  }

  function scan(root=document){
    const pages=[];
    if(root.matches?.('.page[data-page]'))pages.push(root);
    root.querySelectorAll?.('.page[data-page]').forEach(p=>pages.push(p));
    pages.forEach(scanPage);
    scanNavigation();
    enhancePanel();
  }

  function enhancePanel(){
    const routeSelect=document.getElementById('copyRoute');
    const groupSelect=document.getElementById('copyGroup');

    const panel=document.getElementById('siteCopyPanel');
    if(panel&&!document.getElementById('copyBandMembers')){
      const button=document.createElement('button');
      button.id='copyBandMembers';
      button.type='button';
      button.className='copy-manage';
      button.textContent='Gestisci membri della band →';
      button.dataset.editorUi='';
      const manageLink=panel.querySelector('.copy-manage');
      if(manageLink)manageLink.before(button);
      else panel.appendChild(button);
      button.onclick=()=>{
        if(window.JMBandEditor?.open)window.JMBandEditor.open();
        else alert('Gestione membri non disponibile.');
      };
    }
    const bandButton=document.getElementById('copyBandMembers');
    if(bandButton){
      const route=location.hash.replace(/^#\/?/,'').split('/')[0]||'home';
      bandButton.hidden=route!=='band';
    }

    for(const [route,label] of Object.entries(ROUTE_LABELS)){
      if(routeSelect&&!routeSelect.querySelector(`option[value="${route}"]`)){
        const o=document.createElement('option');
        o.value=route;o.textContent=label;
        routeSelect.appendChild(o);
      }
      if(groupSelect&&!groupSelect.querySelector(`option[value="${route}"]`)){
        const o=document.createElement('option');
        o.value=route;o.textContent=label;
        groupSelect.appendChild(o);
      }
    }

    if(routeSelect){
      const current=location.hash.replace(/^#\/?/,'').split('/')[0]||'home';
      if(routeSelect.querySelector(`option[value="${CSS.escape(current)}"]`)){
        routeSelect.value=current;
      }
    }
  }

  // La scansione avviene prima del caricamento dei testi salvati:
  // così anche le pagine create dinamicamente partecipano allo stesso site_content.
  const originalInit=jm.init;
  jm.init=async function(client){
    scan(document);
    return originalInit.call(this,client);
  };

  // Se una nuova pagina viene aggiunta in futuro, viene registrata automaticamente.
  const observer=new MutationObserver(records=>{
    for(const record of records){
      for(const node of record.addedNodes){
        if(node.nodeType===1)scan(node);
      }
    }
    enhancePanel();
  });

  const start=()=>{
    scan(document);
    observer.observe(document.body,{childList:true,subtree:true});

    // Il vecchio editor non naviga verso i gruppi aggiunti dopo la sua creazione.
    // Anticipiamo la navigazione quando si clicca un testo dinamico nell'elenco.
    document.addEventListener('click',e=>{
      const button=e.target.closest?.('#copyList button[data-key]');
      if(!button)return;
      const group=catalog[button.dataset.key]?.group;
      if(ROUTE_LABELS[group]&&location.hash!==`#/${group}`){
        location.hash=`#/${group}`;
      }
    },true);

    window.addEventListener('hashchange',enhancePanel);
  };

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
