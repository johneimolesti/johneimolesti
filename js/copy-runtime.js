(() => {
  'use strict';

  const catalog=window.JM_COPY_CATALOG||{};
  const State=window.JMCopyState;

  if(!State){
    console.error('JMCopyState non disponibile.');
    return;
  }

  const state=new State(catalog);
  const attrNames=['placeholder','aria-label','alt','content'];
  const targets='[data-copy],'+attrNames.map(a=>`[data-copy-${a}]`).join(',');

  let sb=null;
  let observer=null;
  let applying=false;

  function text(key,params={}){
    return state.text(key,params);
  }

  function apply(){
    if(applying)return;
    applying=true;
    observer?.disconnect();

    document.querySelectorAll(targets).forEach(el=>{
      const key=el.dataset.copy;
      if(key&&catalog[key]){
        let params={};
        try{params=JSON.parse(el.dataset.copyParams||'{}')}catch{}
        const value=text(key,params);
        if(el.textContent!==value)el.textContent=value;
      }

      for(const attr of attrNames){
        const attrKey=el.getAttribute('data-copy-'+attr);
        if(attrKey&&catalog[attrKey]){
          const value=text(attrKey);
          if(el.getAttribute(attr)!==value)el.setAttribute(attr,value);
        }
      }
    });

    observer?.observe(document.body,{
      subtree:true,
      childList:true,
      characterData:true
    });
    applying=false;
  }

  function write(el,key,params={}){
    if(!el)return;
    el.dataset.copy=key;
    el.dataset.copyParams=JSON.stringify(params);
    el.textContent=text(key,params);
  }

  function bindText(el,value){
    if(!el)return;
    const key=Object.keys(catalog).find(k=>
      k.startsWith('ui.') && text(k)===value
    );
    if(key)write(el,key);
    else el.textContent=value;
  }

  async function init(client){
    sb=client;

    try{
      const {data,error}=await sb.from('site_content')
        .select('content,revision')
        .eq('id','public')
        .abortSignal(AbortSignal.timeout(6000))
        .maybeSingle();

      if(!error&&data)state.load(data);
    }catch(err){
      console.warn('Testi pubblicati non disponibili; uso i testi inclusi nel sito.',err);
    }

    observer=new MutationObserver(()=>apply());
    apply();
  }

  function ready(){
    apply();
  }

  // Compatibilità con public.js: non esiste più alcun editor.
  function setMember(){}
  function open(){}

  window.JMCopy={
    init,
    ready,
    text,
    write,
    bindText,
    setMember,
    open
  };
})();
