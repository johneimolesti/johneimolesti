/* ============================================================
   VISUAL SITE EDITOR
   Selezione di elementi, drag, resize, immagini e ritaglio.
   Gli override sono pubblici ma modificabili solo dagli admin.
   ============================================================ */
(() => {
  'use strict';

  if(window.JMVisualEditorV2)return;
  window.JMVisualEditorV2={booting:true};

  // La vecchia strip superiore non fa più parte del sito.
  document.querySelector('.edition-strip')?.remove();
  try{
    delete window.JM_COPY_CATALOG?.['global.003'];
    delete window.JM_COPY_CATALOG?.['global.004'];
  }catch{}

  const jm=window.JMCopy;
  if(!jm)return;

  const BUCKET='public-site';
  const TABLE='site_visual_overrides';
  const SELECTABLE='header,nav,main,section,article,aside,footer,div,figure,figcaption,img,button,a,label,span,strong,small,p,h1,h2,h3,h4,h5,h6,input,textarea,select,li';
  const SKIP_SELECTOR='[data-editor-ui],#siteCopyToolbar,#siteCopyPanel,#visualElementOverlay,script,style,link,meta,.site-noise,.site-glow,.skip-link';

  let sb=null;
  let editing=false;
  let selectedEl=null;
  let selectedKey='';
  let saved=new Map();
  let draft=new Map();
  let dirty=new Set();
  let deleted=new Set();
  let overlay=null;
  let inspector=null;
  let overlayRaf=0;
  let uploadedUnpublished=new Set();
  let applying=false;

  const baseline=new WeakMap();

  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[ch]));

  function cloneRow(row){
    if(!row)return null;
    return {
      element_key:row.element_key,
      route:row.route||'global',
      element_type:row.element_type||'',
      selector_hint:row.selector_hint||'',
      settings:{...(row.settings||{})},
      image_path:row.image_path||null
    };
  }

  function routeOf(el){
    const page=el.closest?.('.page[data-page]');
    if(page?.dataset.page)return page.dataset.page;
    if(el.closest?.('.site-header'))return 'global';
    if(el.closest?.('.site-footer'))return 'footer';
    if(el.closest?.('.modal'))return 'modal';
    return 'global';
  }

  function hash(text){
    let h=2166136261;
    for(let i=0;i<text.length;i++){
      h^=text.charCodeAt(i);
      h=Math.imul(h,16777619);
    }
    return (h>>>0).toString(36);
  }

  function semanticSegment(node){
    let s=node.tagName.toLowerCase();

    if(node.id)return `${s}#${node.id}`;

    const stableAttrs=[
      'data-repertoire-song',
      'data-concert-id',
      'data-route',
      'data-page',
      'data-public-photo',
      'data-highlight-index',
      'data-go',
      'data-expand-ranking',
      'data-copy'
    ];

    for(const attr of stableAttrs){
      const value=node.getAttribute?.(attr);
      if(value)return `${s}[${attr}="${String(value).replace(/"/g,'')}"]`;
    }

    const cls=[...node.classList].filter(x=>
      !['active','hidden','glass-card','copy-selected','visual-selected'].includes(x)
    ).slice(0,2);
    if(cls.length)s+='.'+cls.join('.');

    const parent=node.parentElement;
    if(parent){
      const siblings=[...parent.children].filter(x=>x.tagName===node.tagName);
      if(siblings.length>1)s+=`:nth-of-type(${siblings.indexOf(node)+1})`;
    }

    return s;
  }

  function domPath(el){
    const root=el.closest?.('.page[data-page]') || document.body;
    const parts=[];
    let node=el;

    while(node&&node!==root&&node!==document.body&&node.nodeType===1){
      parts.unshift(semanticSegment(node));
      if(node.id)break;
      node=node.parentElement;
    }
    if(root!==document.body)parts.unshift(`[data-page="${root.dataset.page}"]`);
    return parts.join('>');
  }

  function visualKey(el){
    if(!el||el.nodeType!==1)return '';

    const existing=el.dataset.visualKey;
    if(existing)return existing;

    const route=routeOf(el);
    let key='';

    if(el.id)key=`${route}|id:${el.id}`;
    else if(el.dataset.copy)key=`${route}|copy:${el.dataset.copy}`;
    else if(el.dataset.repertoireSong)key=`${route}|song:${el.dataset.repertoireSong}`;
    else if(el.dataset.concertId)key=`${route}|concert:${el.dataset.concertId}`;
    else if(el.dataset.route)key=`global|nav:${el.dataset.route}`;
    else key=`${route}|path:${hash(domPath(el))}`;

    el.dataset.visualKey=key;
    return key;
  }

  function isSelectable(el){
    if(!el||el.nodeType!==1)return false;
    if(el.matches(SKIP_SELECTOR)||el.closest(SKIP_SELECTOR))return false;
    if(['HTML','BODY'].includes(el.tagName))return false;
    return el.matches(SELECTABLE);
  }

  function rememberBaseline(el){
    if(baseline.has(el))return;
    baseline.set(el,{
      translate:el.style.translate||'',
      width:el.style.width||'',
      height:el.style.height||'',
      minWidth:el.style.minWidth||'',
      minHeight:el.style.minHeight||'',
      maxWidth:el.style.maxWidth||'',
      maxHeight:el.style.maxHeight||'',
      objectPosition:el.style.objectPosition||'',
      objectFit:el.style.objectFit||'',
      scale:el.style.scale||'',
      backgroundImage:el.style.backgroundImage||'',
      backgroundPosition:el.style.backgroundPosition||'',
      backgroundSize:el.style.backgroundSize||'',
      overflow:el.style.overflow||'',
      src:el.tagName==='IMG'?el.getAttribute('src'):null,
      text:canDirectText(el)?el.textContent:null
    });
  }

  function resetApplied(el){
    const b=baseline.get(el);
    if(!b)return;

    el.style.translate=b.translate;
    el.style.width=b.width;
    el.style.height=b.height;
    el.style.minWidth=b.minWidth;
    el.style.minHeight=b.minHeight;
    el.style.maxWidth=b.maxWidth;
    el.style.maxHeight=b.maxHeight;
    el.style.objectPosition=b.objectPosition;
    el.style.objectFit=b.objectFit;
    el.style.scale=b.scale;
    el.style.backgroundImage=b.backgroundImage;
    el.style.backgroundPosition=b.backgroundPosition;
    el.style.backgroundSize=b.backgroundSize;
    el.style.overflow=b.overflow;

    if(el.tagName==='IMG'){
      if(b.src==null)el.removeAttribute('src');
      else el.setAttribute('src',b.src);
    }

    if(canDirectText(el)&&b.text!=null&&el.textContent!==b.text){
      el.textContent=b.text;
    }
  }

  function canDirectText(el){
    if(!el||['IMG','INPUT','TEXTAREA','SELECT'].includes(el.tagName))return false;
    return el.children.length===0;
  }

  function publicImageUrl(path){
    if(!path||!sb)return '';
    try{return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl||''}
    catch{return ''}
  }

  function applyRowToElement(el,row){
    if(!el||!row)return;

    rememberBaseline(el);
    resetApplied(el);

    const s=row.settings||{};
    const x=Number(s.x||0);
    const y=Number(s.y||0);

    if(x||y)el.style.translate=`${x}px ${y}px`;

    if(Number.isFinite(Number(s.width))&&Number(s.width)>0){
      el.style.width=`${Number(s.width)}px`;
      el.style.maxWidth='none';
    }
    if(Number.isFinite(Number(s.height))&&Number(s.height)>0){
      el.style.height=`${Number(s.height)}px`;
      el.style.maxHeight='none';
    }

    if(canDirectText(el)&&typeof s.text==='string'){
      el.textContent=s.text;
    }

    const cropX=Number.isFinite(Number(s.cropX))?Number(s.cropX):50;
    const cropY=Number.isFinite(Number(s.cropY))?Number(s.cropY):50;
    const zoom=Number.isFinite(Number(s.zoom))?Math.max(50,Number(s.zoom)):100;
    const fit=['cover','contain','fill'].includes(s.fit)?s.fit:'cover';

    const imageUrl=row.image_path?publicImageUrl(row.image_path):'';
    const imageMode=s.imageMode || (el.tagName==='IMG'?'img':'background');

    if(imageMode==='img'&&el.tagName==='IMG'){
      if(imageUrl)el.src=imageUrl;
      el.style.objectFit=fit;
      el.style.objectPosition=`${cropX}% ${cropY}%`;
      el.style.scale=String(zoom/100);
    }else if(imageMode==='background'){
      if(imageUrl)el.style.backgroundImage=`url("${imageUrl.replace(/"/g,'\\"')}")`;
      el.style.backgroundPosition=`${cropX}% ${cropY}%`;
      el.style.backgroundSize=zoom===100?'cover':`${zoom}% auto`;
      el.style.backgroundRepeat='no-repeat';
    }
  }

  function assignAndApply(el){
    if(!isSelectable(el))return;
    rememberBaseline(el);
    const key=visualKey(el);
    const row=draft.get(key)||saved.get(key);
    if(row)applyRowToElement(el,row);
  }

  function scanVisual(root=document){
    if(root.nodeType===1&&isSelectable(root))assignAndApply(root);
    root.querySelectorAll?.(SELECTABLE).forEach(assignAndApply);
  }

  function resolveKey(key){
    if(!key)return null;
    const escaped=CSS.escape(key);
    let el=document.querySelector(`[data-visual-key="${escaped}"]`);
    if(el)return el;

    scanVisual(document);
    return document.querySelector(`[data-visual-key="${escaped}"]`);
  }

  function applyAll(){
    if(applying)return;
    applying=true;
    try{
      scanVisual(document);
      for(const [key,row] of draft){
        const el=resolveKey(key);
        if(el)applyRowToElement(el,row);
      }
      updateOverlay();
    }finally{
      applying=false;
    }
  }

  async function loadVisualOverrides(){
    if(!sb)return;
    const {data,error}=await sb.from(TABLE)
      .select('element_key,route,element_type,selector_hint,settings,image_path');
    if(error){
      console.warn('Layout visuale non disponibile',error);
      return;
    }

    saved=new Map((data||[]).map(row=>[row.element_key,cloneRow(row)]));
    draft=new Map((data||[]).map(row=>[row.element_key,cloneRow(row)]));
    dirty.clear();
    deleted.clear();
    applyAll();
  }

  function currentRow(el=selectedEl){
    if(!el)return null;
    const key=visualKey(el);
    const existing=draft.get(key);
    if(existing)return existing;

    const row={
      element_key:key,
      route:routeOf(el),
      element_type:el.tagName.toLowerCase(),
      selector_hint:domPath(el),
      settings:{},
      image_path:null
    };
    draft.set(key,row);
    return row;
  }

  function markDirty(key=selectedKey){
    if(!key)return;
    dirty.add(key);
    deleted.delete(key);
    updateInspectorStatus();
  }

  function setSetting(name,value){
    const row=currentRow();
    if(!row)return;
    if(value===null||value===''||value===undefined||value===false){
      delete row.settings[name];
    }else{
      row.settings[name]=value;
    }
    markDirty(row.element_key);
    applyRowToElement(selectedEl,row);
    fillInspector(false);
    scheduleOverlay();
  }

  function imageCapable(el){
    if(!el)return false;
    if(el.tagName==='IMG')return true;
    const bg=getComputedStyle(el).backgroundImage;
    if(bg&&bg!=='none'&&bg.includes('url('))return true;
    return ['DIV','SECTION','ARTICLE','HEADER','FOOTER','FIGURE','BUTTON','A'].includes(el.tagName);
  }

  function textCopyKey(el){
    if(!el)return '';
    if(el.dataset.copy)return el.dataset.copy;
    const attrs=['placeholder','aria-label','alt','content'];
    for(const attr of attrs){
      const key=el.getAttribute?.(`data-copy-${attr}`);
      if(key)return key;
    }
    return '';
  }

  function describe(el){
    if(!el)return 'Nessun elemento';
    const bits=[el.tagName.toLowerCase()];
    if(el.id)bits.push('#'+el.id);
    else if(el.classList.length)bits.push('.'+[...el.classList].slice(0,2).join('.'));
    return bits.join('');
  }

  function ensureStyles(){
    if(document.getElementById('visualEditorStyles'))return;
    const style=document.createElement('style');
    style.id='visualEditorStyles';
    style.dataset.editorUi='';
    style.textContent=`
      .edition-strip{display:none!important}

      body.visual-editing.copy-editing{padding-right:0!important}
      body.visual-editing.copy-editing .site-header{flex-wrap:nowrap}
      body.visual-editing.copy-editing .main-nav{margin-left:auto}
      body.visual-editing.copy-editing .desktop-rail-left,
      body.visual-editing.copy-editing .desktop-rail-right{flex-basis:auto}
      body.visual-editing.copy-editing [data-visual-key]:hover{
        outline:1px dashed rgba(238,229,43,.72);
        outline-offset:2px;
        cursor:crosshair
      }
      body.visual-editing .copy-panel{box-shadow:-12px 0 28px rgba(0,0,0,.35)}

      .visual-inspector{
        margin:16px 0;
        padding:14px;
        border:2px solid #eee52b;
        background:#171715
      }
      .visual-inspector[hidden]{display:none!important}
      .visual-inspector-head{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}
      .visual-inspector-head h3{margin:0!important;font:900 18px/1.05 Impact,Arial,sans-serif!important}
      .visual-inspector-key{
        display:block;margin-top:4px;color:#aaa493;font:10px/1.3 monospace;
        overflow:hidden;text-overflow:ellipsis;white-space:nowrap
      }
      .visual-inspector-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}
      .visual-inspector .visual-wide{grid-column:1/-1}
      .visual-inspector label{display:grid;gap:4px;margin:0!important;color:#c5c0b3;font:700 11px/1.2 Arial}
      .visual-inspector input,.visual-inspector select,.visual-inspector textarea{
        width:100%;min-width:0;margin:0!important;padding:8px!important;
        border:1px solid #686457!important;background:#0d0d0d!important;color:#fff!important;
        font:12px/1.3 Arial!important
      }
      .visual-inspector input[type=range]{padding:0!important}
      .visual-inspector textarea{resize:vertical}
      .visual-inspector-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
      .visual-inspector-actions button{
        flex:1 1 110px;text-align:center!important;min-height:36px!important;padding:7px!important;
        font-size:11px!important
      }
      .visual-inspector .visual-primary{background:#eee52b!important;color:#111!important;border-color:#eee52b!important}
      .visual-inspector .visual-danger{color:#ffaaaa!important}
      .visual-inspector .visual-note{margin:8px 0 0!important;color:#aaa493!important;font-size:10px!important}
      .visual-inspector .visual-status{display:block;min-height:16px;margin-top:8px;color:#eee52b;font:10px/1.35 monospace}
      .visual-image-section{margin-top:12px;padding-top:12px;border-top:1px solid #514e45}
      .visual-image-preview{
        position:relative;height:110px;overflow:hidden;margin:7px 0;border:1px solid #5d594e;background:#080808
      }
      .visual-image-preview img{width:100%;height:100%;object-fit:cover}
      .visual-image-preview span{position:absolute;inset:0;display:grid;place-items:center;color:#767167;font-size:10px}
      .visual-field-row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px}
      .visual-text-jump{width:100%;margin-top:8px!important;text-align:center!important}

      #visualElementOverlay{
        position:fixed;z-index:165;pointer-events:none;border:2px solid #f2a8cd;
        box-shadow:0 0 0 1px rgba(0,0,0,.75);
        min-width:4px;min-height:4px
      }
      #visualElementOverlay[hidden]{display:none!important}
      #visualElementOverlay .visual-overlay-label{
        position:absolute;left:-2px;top:-24px;max-width:260px;height:22px;padding:3px 7px;
        background:#f2a8cd;color:#111;font:800 10px/16px monospace;
        overflow:hidden;text-overflow:ellipsis;white-space:nowrap
      }
      #visualElementOverlay .visual-move-handle{
        position:absolute;left:-2px;top:-2px;width:31px;height:31px;transform:translate(-100%,-100%);
        pointer-events:auto;border:2px solid #111;background:#eee52b;color:#111;
        display:grid;place-items:center;font:900 15px/1 Arial;cursor:move
      }
      #visualElementOverlay .visual-resize-handle{
        position:absolute;right:-2px;bottom:-2px;width:22px;height:22px;transform:translate(50%,50%);
        pointer-events:auto;border:2px solid #111;background:#f2a8cd;color:#111;
        cursor:nwse-resize
      }

      @media(max-width:760px){
        body.visual-editing.copy-editing{padding-bottom:53svh!important}
        .visual-inspector-grid,.visual-field-row{grid-template-columns:1fr}
        .visual-inspector .visual-wide{grid-column:auto}
      }
    `;
    document.head.appendChild(style);
  }

  function ensureOverlay(){
    if(overlay)return overlay;
    overlay=document.createElement('div');
    overlay.id='visualElementOverlay';
    overlay.dataset.editorUi='';
    overlay.hidden=true;
    overlay.innerHTML=`
      <span class="visual-overlay-label"></span>
      <button class="visual-move-handle" type="button" title="Trascina elemento">✥</button>
      <button class="visual-resize-handle" type="button" title="Ridimensiona">↘</button>`;
    document.body.appendChild(overlay);

    const move=overlay.querySelector('.visual-move-handle');
    const resize=overlay.querySelector('.visual-resize-handle');

    move.addEventListener('pointerdown',startMove);
    resize.addEventListener('pointerdown',startResize);

    return overlay;
  }

  function mountInspector(){
    const panel=document.getElementById('siteCopyPanel');
    if(!panel)return null;

    const title=panel.querySelector('h2');
    if(title)title.textContent='Editor visuale del sito';

    const help=panel.querySelector('.copy-help');
    if(help)help.textContent='Clicca qualunque elemento della pagina. Trascina con ✥, ridimensiona con ↘ oppure usa i campi qui sotto. Shift+click seleziona il contenitore padre.';

    inspector=document.getElementById('visualInspector');
    if(inspector)return inspector;

    inspector=document.createElement('section');
    inspector.id='visualInspector';
    inspector.className='visual-inspector';
    inspector.dataset.editorUi='';
    inspector.hidden=true;
    inspector.innerHTML=`
      <div class="visual-inspector-head">
        <div>
          <h3 id="visualElementTitle">Elemento</h3>
          <small class="visual-inspector-key" id="visualElementKey"></small>
        </div>
        <button type="button" id="visualParent" title="Seleziona contenitore padre">PADRE ↑</button>
      </div>

      <div class="visual-inspector-grid">
        <label>X
          <input id="visualX" type="number" step="1">
        </label>
        <label>Y
          <input id="visualY" type="number" step="1">
        </label>
        <label>LARGHEZZA px
          <input id="visualWidth" type="number" min="20" step="1" placeholder="AUTO">
        </label>
        <label>ALTEZZA px
          <input id="visualHeight" type="number" min="20" step="1" placeholder="AUTO">
        </label>

        <div class="visual-wide" id="visualTextSection">
          <label>TESTO
            <textarea id="visualText" rows="3"></textarea>
          </label>
          <button type="button" id="visualTextJump" class="visual-text-jump">MODIFICA NELL'EDITOR TESTI</button>
          <p class="visual-note" id="visualTextNote"></p>
        </div>
      </div>

      <section class="visual-image-section" id="visualImageSection" hidden>
        <strong>IMMAGINE / SFONDO</strong>
        <div class="visual-image-preview">
          <img id="visualImagePreview" alt="" hidden>
          <span id="visualImageEmpty">Nessuna anteprima</span>
        </div>
        <label>SOSTITUISCI IMMAGINE
          <input id="visualImageFile" type="file" accept="image/*">
        </label>
        <div class="visual-field-row">
          <label>X RITAGLIO
            <input id="visualCropX" type="range" min="0" max="100" value="50">
          </label>
          <label>Y RITAGLIO
            <input id="visualCropY" type="range" min="0" max="100" value="50">
          </label>
          <label>ZOOM
            <input id="visualZoom" type="range" min="50" max="240" step="5" value="100">
          </label>
        </div>
        <label>ADATTAMENTO
          <select id="visualFit">
            <option value="cover">Riempi / ritaglia</option>
            <option value="contain">Mostra intera</option>
            <option value="fill">Stira</option>
          </select>
        </label>
        <button type="button" id="visualImageReset">RIPRISTINA IMMAGINE</button>
      </section>

      <div class="visual-inspector-actions">
        <button type="button" id="visualResetSize">AUTO DIMENSIONI</button>
        <button type="button" id="visualResetPosition">AZZERA POSIZIONE</button>
        <button type="button" id="visualResetElement" class="visual-danger">RESET ELEMENTO</button>
        <button type="button" id="visualPublish" class="visual-primary">PUBBLICA LAYOUT</button>
      </div>
      <span class="visual-status" id="visualStatus"></span>`;

    const status=panel.querySelector('#copyStatus');
    if(status)status.insertAdjacentElement('afterend',inspector);
    else panel.prepend(inspector);

    bindInspector();
    return inspector;
  }

  function bindInspector(){
    if(!inspector)return;

    const numberBinding=(id,name)=>{
      inspector.querySelector('#'+id).addEventListener('input',e=>{
        const raw=e.target.value;
        setSetting(name,raw===''?null:Number(raw));
      });
    };
    numberBinding('visualX','x');
    numberBinding('visualY','y');
    numberBinding('visualWidth','width');
    numberBinding('visualHeight','height');

    inspector.querySelector('#visualText').addEventListener('input',e=>{
      if(!selectedEl||textCopyKey(selectedEl))return;
      setSetting('text',e.target.value);
    });

    inspector.querySelector('#visualTextJump').onclick=()=>{
      const key=textCopyKey(selectedEl);
      if(key)openCopyEditorKey(key);
    };

    inspector.querySelector('#visualParent').onclick=()=>{
      let parent=selectedEl?.parentElement;
      while(parent&&!isSelectable(parent))parent=parent.parentElement;
      if(parent)selectElement(parent);
    };

    inspector.querySelector('#visualResetPosition').onclick=()=>{
      setSetting('x',null);
      setSetting('y',null);
    };

    inspector.querySelector('#visualResetSize').onclick=()=>{
      setSetting('width',null);
      setSetting('height',null);
    };

    inspector.querySelector('#visualResetElement').onclick=resetSelectedElement;
    inspector.querySelector('#visualPublish').onclick=publishVisual;

    inspector.querySelector('#visualImageFile').addEventListener('change',uploadVisualImage);
    inspector.querySelector('#visualImageReset').onclick=resetVisualImage;

    inspector.querySelector('#visualCropX').addEventListener('input',e=>setSetting('cropX',Number(e.target.value)));
    inspector.querySelector('#visualCropY').addEventListener('input',e=>setSetting('cropY',Number(e.target.value)));
    inspector.querySelector('#visualZoom').addEventListener('input',e=>setSetting('zoom',Number(e.target.value)));
    inspector.querySelector('#visualFit').addEventListener('change',e=>setSetting('fit',e.target.value));
  }

  function openCopyEditorKey(key){
    if(!key)return;
    const search=document.getElementById('copySearch');
    const group=document.getElementById('copyGroup');

    if(search){
      search.value='';
      search.dispatchEvent(new Event('input',{bubbles:true}));
    }
    if(group){
      group.value='';
      group.dispatchEvent(new Event('change',{bubbles:true}));
    }

    setTimeout(()=>{
      const button=document.querySelector(`#copyList button[data-key="${CSS.escape(key)}"]`);
      if(button){
        button.click();
        document.getElementById('copyValue')?.scrollIntoView({block:'center',behavior:'smooth'});
      }
    },0);
  }

  function previewSource(el,row){
    if(!el)return '';
    if(row?.image_path)return publicImageUrl(row.image_path);
    if(el.tagName==='IMG')return el.currentSrc||el.src||'';

    const bg=getComputedStyle(el).backgroundImage||'';
    const match=bg.match(/url\(["']?(.*?)["']?\)/);
    return match?.[1]||'';
  }

  function fillInspector(updateValues=true){
    if(!inspector||!selectedEl)return;
    const row=currentRow(selectedEl);
    const s=row.settings||{};
    const rect=selectedEl.getBoundingClientRect();
    const copyKey=textCopyKey(selectedEl);
    const direct=canDirectText(selectedEl);

    inspector.hidden=false;
    inspector.querySelector('#visualElementTitle').textContent=describe(selectedEl);
    inspector.querySelector('#visualElementKey').textContent=row.element_key;

    if(updateValues){
      inspector.querySelector('#visualX').value=Number(s.x||0);
      inspector.querySelector('#visualY').value=Number(s.y||0);
      inspector.querySelector('#visualWidth').value=s.width??'';
      inspector.querySelector('#visualHeight').value=s.height??'';

      const text=inspector.querySelector('#visualText');
      const jump=inspector.querySelector('#visualTextJump');
      const note=inspector.querySelector('#visualTextNote');

      if(copyKey){
        text.hidden=true;
        text.parentElement.hidden=true;
        jump.hidden=false;
        note.textContent='Questo testo usa il sistema editoriale condiviso. Il pulsante apre direttamente il relativo campo.';
      }else if(direct){
        text.parentElement.hidden=false;
        text.hidden=false;
        jump.hidden=true;
        text.value=typeof s.text==='string'?s.text:selectedEl.textContent||'';
        note.textContent='Override visuale del testo. I dati gestionali originali non vengono modificati.';
      }else{
        text.parentElement.hidden=true;
        jump.hidden=true;
        note.textContent='Seleziona la label o il testo interno per modificarne il contenuto.';
      }

      const imageSection=inspector.querySelector('#visualImageSection');
      imageSection.hidden=!imageCapable(selectedEl);

      if(!imageSection.hidden){
        inspector.querySelector('#visualCropX').value=Number(s.cropX??50);
        inspector.querySelector('#visualCropY').value=Number(s.cropY??50);
        inspector.querySelector('#visualZoom').value=Number(s.zoom??100);
        inspector.querySelector('#visualFit').value=s.fit||'cover';

        const src=previewSource(selectedEl,row);
        const img=inspector.querySelector('#visualImagePreview');
        const empty=inspector.querySelector('#visualImageEmpty');
        img.hidden=!src;
        empty.hidden=!!src;

        if(src){
          img.src=src;
          img.style.objectPosition=`${Number(s.cropX??50)}% ${Number(s.cropY??50)}%`;
          img.style.scale=String(Number(s.zoom??100)/100);
          img.style.objectFit=s.fit||'cover';
        }
      }
    }

    const width=inspector.querySelector('#visualWidth');
    const height=inspector.querySelector('#visualHeight');
    width.placeholder=`AUTO · ${Math.round(rect.width)}px`;
    height.placeholder=`AUTO · ${Math.round(rect.height)}px`;

    updateInspectorStatus();
  }

  function updateInspectorStatus(message=''){
    if(!inspector)return;
    const status=inspector.querySelector('#visualStatus');
    if(message)status.textContent=message;
    else status.textContent=dirty.size
      ? `${dirty.size} modifica${dirty.size===1?'':'he'} layout da pubblicare`
      : 'Layout pubblicato';

    const publish=inspector.querySelector('#visualPublish');
    publish.disabled=!dirty.size||!sb;
  }

  function selectElement(el){
    if(!isSelectable(el))return;
    selectedEl=el;
    selectedKey=visualKey(el);
    currentRow(el);

    document.querySelectorAll('.visual-selected').forEach(node=>node.classList.remove('visual-selected'));
    el.classList.add('visual-selected');

    ensureOverlay();
    mountInspector();
    fillInspector(true);
    updateOverlay();
  }

  function deselect(){
    selectedEl?.classList.remove('visual-selected');
    selectedEl=null;
    selectedKey='';
    if(overlay)overlay.hidden=true;
    if(inspector)inspector.hidden=true;
  }

  function updateOverlay(){
    cancelAnimationFrame(overlayRaf);
    overlayRaf=0;
    if(!editing||!selectedEl||!selectedEl.isConnected||!overlay){
      if(overlay)overlay.hidden=true;
      return;
    }

    const rect=selectedEl.getBoundingClientRect();
    if(!rect.width&&!rect.height){
      overlay.hidden=true;
      return;
    }

    overlay.hidden=false;
    overlay.style.left=`${rect.left}px`;
    overlay.style.top=`${rect.top}px`;
    overlay.style.width=`${rect.width}px`;
    overlay.style.height=`${rect.height}px`;
    overlay.querySelector('.visual-overlay-label').textContent=describe(selectedEl);
  }

  function scheduleOverlay(){
    if(overlayRaf)return;
    overlayRaf=requestAnimationFrame(updateOverlay);
  }

  function startMove(e){
    if(!selectedEl)return;
    e.preventDefault();
    e.stopPropagation();

    const row=currentRow();
    const startX=e.clientX;
    const startY=e.clientY;
    const baseX=Number(row.settings.x||0);
    const baseY=Number(row.settings.y||0);

    const move=ev=>{
      row.settings.x=Math.round(baseX+ev.clientX-startX);
      row.settings.y=Math.round(baseY+ev.clientY-startY);
      markDirty(row.element_key);
      applyRowToElement(selectedEl,row);
      fillInspector(true);
      scheduleOverlay();
    };
    const up=()=>{
      window.removeEventListener('pointermove',move,true);
      window.removeEventListener('pointerup',up,true);
    };
    window.addEventListener('pointermove',move,true);
    window.addEventListener('pointerup',up,true);
  }

  function startResize(e){
    if(!selectedEl)return;
    e.preventDefault();
    e.stopPropagation();

    const row=currentRow();
    const rect=selectedEl.getBoundingClientRect();
    const startX=e.clientX;
    const startY=e.clientY;
    const baseW=rect.width;
    const baseH=rect.height;

    const move=ev=>{
      row.settings.width=Math.max(20,Math.round(baseW+ev.clientX-startX));
      row.settings.height=Math.max(20,Math.round(baseH+ev.clientY-startY));
      markDirty(row.element_key);
      applyRowToElement(selectedEl,row);
      fillInspector(true);
      scheduleOverlay();
    };
    const up=()=>{
      window.removeEventListener('pointermove',move,true);
      window.removeEventListener('pointerup',up,true);
    };
    window.addEventListener('pointermove',move,true);
    window.addEventListener('pointerup',up,true);
  }

  async function uploadVisualImage(e){
    if(!selectedEl||!sb)return;
    const file=e.target.files?.[0];
    if(!file)return;
    if(!String(file.type||'').startsWith('image/')){
      updateInspectorStatus('Scegli un file immagine.');
      return;
    }

    const row=currentRow();
    const ext=(file.name.split('.').pop()||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'')||'jpg';
    const safeKey=row.element_key.replace(/[^a-zA-Z0-9_-]+/g,'-').slice(0,100);
    const path=`visual-editor/${safeKey}/${Date.now()}.${ext}`;

    updateInspectorStatus('Caricamento immagine…');

    const {error}=await sb.storage.from(BUCKET).upload(path,file,{
      contentType:file.type||undefined,
      upsert:false
    });
    if(error){
      updateInspectorStatus(error.message);
      return;
    }

    if(row.image_path&&uploadedUnpublished.has(row.image_path)){
      await sb.storage.from(BUCKET).remove([row.image_path]);
      uploadedUnpublished.delete(row.image_path);
    }

    row.image_path=path;
    row.settings.imageMode=selectedEl.tagName==='IMG'?'img':'background';
    if(row.settings.cropX==null)row.settings.cropX=50;
    if(row.settings.cropY==null)row.settings.cropY=50;
    if(row.settings.zoom==null)row.settings.zoom=100;
    if(!row.settings.fit)row.settings.fit='cover';

    uploadedUnpublished.add(path);
    markDirty(row.element_key);
    applyRowToElement(selectedEl,row);
    fillInspector(true);
    updateInspectorStatus('Immagine caricata in anteprima. Pubblica il layout per renderla definitiva.');
  }

  function resetVisualImage(){
    if(!selectedEl)return;
    const row=currentRow();
    row.image_path=null;
    delete row.settings.imageMode;
    delete row.settings.cropX;
    delete row.settings.cropY;
    delete row.settings.zoom;
    delete row.settings.fit;
    markDirty(row.element_key);
    applyRowToElement(selectedEl,row);
    fillInspector(true);
  }

  function resetSelectedElement(){
    if(!selectedEl)return;
    const key=selectedKey;
    const row=draft.get(key);

    if(row?.image_path&&uploadedUnpublished.has(row.image_path)){
      sb?.storage.from(BUCKET).remove([row.image_path]);
      uploadedUnpublished.delete(row.image_path);
    }

    draft.delete(key);
    deleted.add(key);
    dirty.add(key);
    resetApplied(selectedEl);
    fillInspector(true);
    scheduleOverlay();
    updateInspectorStatus('Elemento ripristinato. Pubblica il layout per confermare.');
  }

  async function publishVisual(){
    if(!sb||!dirty.size)return;

    const publishBtn=inspector?.querySelector('#visualPublish');
    if(publishBtn)publishBtn.disabled=true;
    updateInspectorStatus('Pubblicazione layout…');

    try{
      const deleteKeys=[...dirty].filter(key=>deleted.has(key));
      const upserts=[...dirty]
        .filter(key=>!deleted.has(key)&&draft.has(key))
        .map(key=>{
          const row=draft.get(key);
          return {
            element_key:row.element_key,
            route:row.route||'global',
            element_type:row.element_type||'',
            selector_hint:row.selector_hint||'',
            settings:row.settings||{},
            image_path:row.image_path||null
          };
        });

      if(upserts.length){
        const {error}=await sb.from(TABLE).upsert(upserts,{onConflict:'element_key'});
        if(error)throw error;
      }

      if(deleteKeys.length){
        const {error}=await sb.from(TABLE).delete().in('element_key',deleteKeys);
        if(error)throw error;
      }

      // Rimuove vecchi asset sostituiti solo dopo un salvataggio riuscito.
      for(const key of dirty){
        const oldPath=saved.get(key)?.image_path||null;
        const newPath=deleted.has(key)?null:(draft.get(key)?.image_path||null);
        if(oldPath&&oldPath!==newPath){
          try{await sb.storage.from(BUCKET).remove([oldPath])}catch{}
        }
      }

      saved=new Map([...draft].map(([key,row])=>[key,cloneRow(row)]));
      dirty.clear();
      deleted.clear();
      uploadedUnpublished.clear();

      updateInspectorStatus('Layout pubblicato ✓');
    }catch(err){
      updateInspectorStatus(err.message||String(err));
    }finally{
      if(publishBtn)publishBtn.disabled=!dirty.size;
    }
  }

  async function discardVisual(){
    for(const path of uploadedUnpublished){
      try{await sb?.storage.from(BUCKET).remove([path])}catch{}
    }
    uploadedUnpublished.clear();

    // Ripristina gli elementi visibili alla baseline e poi riapplica i salvati.
    document.querySelectorAll('[data-visual-key]').forEach(resetApplied);
    draft=new Map([...saved].map(([key,row])=>[key,cloneRow(row)]));
    dirty.clear();
    deleted.clear();
    applyAll();
    if(selectedKey){
      selectedEl=resolveKey(selectedKey);
      if(selectedEl)fillInspector(true);
    }
  }

  function syncPickButton(){
    const button=document.getElementById('copyPick');
    if(!button)return;
    const on=document.body.classList.contains('copy-picking');
    button.textContent=on?'Seleziona elemento: ON':'Naviga nel sito';
  }

  function enterEditor(){
    if(editing)return;
    editing=true;
    document.body.classList.add('visual-editing');
    ensureStyles();
    ensureOverlay();
    mountInspector();
    syncPickButton();
    scanVisual(document);
  }

  async function leaveEditor(){
    if(!editing)return;
    editing=false;
    document.body.classList.remove('visual-editing');
    if(overlay)overlay.hidden=true;
    deselect();
  }

  function handleEditorState(){
    const active=document.body.classList.contains('copy-editing');
    if(active)enterEditor();
    else leaveEditor();
  }

  function editorClickCapture(e){
    if(!editing||!document.body.classList.contains('copy-picking'))return;
    if(e.target.closest(SKIP_SELECTOR))return;

    let target=e.target.closest?.(SELECTABLE);
    if(!target)return;

    if(e.shiftKey){
      let parent=target.parentElement;
      while(parent&&!isSelectable(parent))parent=parent.parentElement;
      if(parent)target=parent;
    }

    if(!isSelectable(target))return;

    e.preventDefault();
    e.stopImmediatePropagation();
    selectElement(target);
  }

  function interceptEditorButtons(e){
    const close=e.target.closest?.('#copyClose');
    if(close&&dirty.size){
      if(!confirm('Ci sono modifiche di layout non pubblicate. Uscire e annullarle?')){
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      discardVisual();
      return;
    }

    const discard=e.target.closest?.('#copyDiscard');
    if(discard&&dirty.size){
      if(!confirm('Annullare anche tutte le modifiche visuali non pubblicate?')){
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      discardVisual();
    }

    const pick=e.target.closest?.('#copyPick');
    if(pick)setTimeout(syncPickButton,0);
  }

  // Applica gli override visuali anche al sito pubblico.
  const previousInit=jm.init;
  jm.init=async function(client){
    sb=client;
    const result=await previousInit.call(this,client);
    await loadVisualOverrides();
    return result;
  };

  const start=()=>{
    ensureStyles();
    document.querySelector('.edition-strip')?.remove();

    scanVisual(document);

    const observer=new MutationObserver(records=>{
      for(const record of records){
        if(record.type==='attributes'&&record.target===document.body){
          handleEditorState();
          continue;
        }
        for(const node of record.addedNodes){
          if(node.nodeType===1)scanVisual(node);
        }
      }
      if(document.getElementById('siteCopyPanel'))mountInspector();
      scheduleOverlay();
    });

    observer.observe(document.body,{
      childList:true,
      subtree:true,
      attributes:true,
      attributeFilter:['class']
    });

    document.addEventListener('click',editorClickCapture,true);
    document.addEventListener('click',interceptEditorButtons,true);
    window.addEventListener('scroll',scheduleOverlay,true);
    window.addEventListener('resize',scheduleOverlay);
    window.addEventListener('hashchange',()=>{
      deselect();
      setTimeout(()=>scanVisual(document),0);
    });

    window.addEventListener('beforeunload',e=>{
      if(dirty.size){
        e.preventDefault();
        e.returnValue='';
      }
    });

    handleEditorState();
  };

  window.JMVisualEditor={
    reload:loadVisualOverrides,
    publish:publishVisual,
    discard:discardVisual,
    select:selectElement,
    get dirtyCount(){return dirty.size}
  };
  window.JMVisualEditorV2=window.JMVisualEditor;

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
