/* Shared copy state; no HTML is ever interpreted from saved content. */
(function(root) {
  'use strict';
  const own = (o,k) => Object.prototype.hasOwnProperty.call(o,k);
  const tokens = value => (value.match(/\{[a-zA-Z][a-zA-Z0-9_]*\}/g) || []).sort().join('|');

  class CopyState {
    constructor(catalog) {
      this.catalog=catalog;
      this.saved={};
      this.draft={};
      this.revision=0;
    }

    validate(key,value) {
      if (!own(this.catalog,key)) throw new Error('Testo non riconosciuto.');
      if (typeof value !== 'string' || value.length>2000) throw new Error('Usa un testo di massimo 2.000 caratteri.');
      if (!value.trim()) throw new Error('Il testo non può essere vuoto.');
      if (tokens(value)!==tokens(this.catalog[key].default)) throw new Error('Mantieni i segnaposto tra parentesi graffe, ad esempio {count}.');
      return value;
    }

    normalize(content) {
      const result={};
      if (!content || typeof content!=='object' || Array.isArray(content)) return result;

      for (const [key,value] of Object.entries(content)) {
        if (!own(this.catalog,key)) continue;
        try {
          this.validate(key,value);
          if (value!==this.catalog[key].default) result[key]=value;
        } catch {
          // Per una voce remota non valida resta il fallback incluso nel sito.
        }
      }
      return result;
    }

    load(record) {
      if (!record || !Number.isSafeInteger(record.revision) || record.revision<0) {
        throw new Error('Contenuti pubblicati non validi.');
      }
      this.saved=this.normalize(record.content);
      this.draft={...this.saved};
      this.revision=record.revision;
    }

    text(key,params={}) {
      const value=this.draft[key] ?? this.catalog[key]?.default ?? '';
      return value.replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g,(match,key)=>
        own(params,key)?String(params[key]):match
      );
    }

    set(key,value) {
      this.validate(key,value);
      if(value===this.catalog[key].default) delete this.draft[key];
      else this.draft[key]=value;
    }

    reset(key) {
      delete this.draft[key];
    }

    discard() {
      this.draft={...this.saved};
    }

    get changes() {
      return Object.keys(this.catalog).filter(k=>
        (this.draft[k]??this.catalog[k].default)!==
        (this.saved[k]??this.catalog[k].default)
      );
    }

    async publish(client,userId) {
      const snapshot={...this.draft};

      // Il salvataggio passa da una RPC SECURITY DEFINER che controlla
      // esplicitamente site_content_editors. Evita che nuove pagine/testi
      // dinamici rompano il publish per effetti collaterali delle policy RLS.
      const {data,error}=await client.rpc('publish_site_content',{
        p_content:snapshot,
        p_revision:this.revision
      });

      if(error){
        const msg=String(error.message||'');
        if(msg.includes('REVISION_CONFLICT')){
          throw new Error('Un altro admin ha aggiornato il sito. Ricarica i testi pubblicati prima di salvare; le tue modifiche restano in anteprima.');
        }
        if(msg.includes('NOT_AUTHORIZED')){
          throw new Error('Questo account non ha il permesso di pubblicare i testi.');
        }
        throw new Error(`Salvataggio non riuscito: ${msg||'errore database'}. Le modifiche restano in anteprima.`);
      }

      const record=Array.isArray(data)?data[0]:data;
      if(!record || !Number.isSafeInteger(record.revision)){
        throw new Error('Il server non ha confermato il salvataggio. Le modifiche restano in anteprima.');
      }

      this.saved=this.normalize(record.content);
      this.draft={...this.saved};
      this.revision=record.revision;
      return record;
    }
  }

  root.JMCopyState=CopyState;
  if(typeof module==='object' && module.exports)module.exports=CopyState;
})(typeof window==='object'?window:globalThis);
