(() => {
  'use strict';

  function start(){
    const app=window.JM_PUBLIC;if(!app)return;
    const {sb,state,DEFAULT_CONTENT,toast,openModal,closeModal,applyContent,loadSiteContent,updateAccountUI,closeAccount}=app;
    const $=id=>document.getElementById(id);const $$=(sel,root=document)=>[...root.querySelectorAll(sel)];
    let editMode=false,currentKey=null,currentType='text';

    function isAdminProfile(profile){return ['ema','kekko'].includes(String(profile?.username||'').toLowerCase())}

    async function loadProfile(user){
      const {data,error}=await sb.from('profiles').select('*').eq('id',user.id).single();if(error)throw error;return data;
    }

    async function restoreAdmin(){
      try{
        const {data:{user}}=await sb.auth.getUser();if(!user)return;
        const profile=await loadProfile(user);if(!isAdminProfile(profile))return;
        state.adminUser=user;state.adminProfile=profile;updateAccountUI();
      }catch(err){console.warn('Sessione admin sito non ripristinata',err)}
    }

    async function loginAdmin(){
      const username=$('adminUsername').value.trim().toLowerCase();const password=$('adminPassword').value;
      $('adminLoginSubmit').disabled=true;$('adminLoginMessage').textContent='Accesso in corso…';
      try{
        if(!['ema','kekko'].includes(username))throw new Error('Questo account non è abilitato alla modifica del sito pubblico.');
        if(password.length<6)throw new Error('Password troppo corta.');
        const {data:members,error:checkError}=await sb.rpc('check_member',{p_username:username});if(checkError)throw checkError;if(!members?.length)throw new Error('Username non riconosciuto.');
        const member=members[0];const email=`${username}@johnimolesti.app`;
        if(!member.activated){
          const {data:su,error:se}=await sb.auth.signUp({email,password});
          if(se){const {error:si}=await sb.auth.signInWithPassword({email,password});if(si)throw se}
          else if(!su.session)throw new Error('Supabase richiede la conferma email.');
          const {error:claimError}=await sb.rpc('claim_member',{p_username:username});if(claimError)throw claimError;
        }else{
          const {error}=await sb.auth.signInWithPassword({email,password});if(error)throw new Error('Password errata.');
        }
        const {data:{user}}=await sb.auth.getUser();const profile=await loadProfile(user);if(!isAdminProfile(profile))throw new Error('Account non abilitato.');
        state.adminUser=user;state.adminProfile=profile;updateAccountUI();closeModal('adminLoginModal');toast('Modifica sito disponibile');
      }catch(err){$('adminLoginMessage').textContent=err.message}finally{$('adminLoginSubmit').disabled=false}
    }

    async function logoutAdmin(){
      await sb.auth.signOut();state.adminUser=null;state.adminProfile=null;setEditMode(false);updateAccountUI();toast('Sessione admin chiusa');
    }

    function setEditMode(on){
      editMode=!!on&&!!state.adminProfile;document.body.classList.toggle('jm-edit-mode',editMode);$('toggleEditMode').textContent=editMode?'Termina modifica':'Modifica elementi';$('adminBarStatus').textContent=editMode?'Tocca un testo o un’immagine per modificarlo':'Modalità admin attiva';
    }

    function inferType(el){return el.dataset.contentType==='image'?'image':(['P','FIGCAPTION'].includes(el.tagName)||String(el.textContent).length>65?'textarea':'text')}

    function openEditor(el){
      if(!editMode||!state.adminProfile)return;currentKey=el.dataset.contentKey;currentType=inferType(el);$('editorKey').textContent=currentKey;$('editorMessage').textContent='';
      const current=state.content[currentKey]??DEFAULT_CONTENT[currentKey]??'';
      $('editorTextField').hidden=currentType==='image';$('editorImageField').hidden=currentType!=='image';
      if(currentType==='image'){$('editorImageUrl').value=current;$('editorImagePreview').src=current||el.src||'';$('editorImageFile').value=''}else{$('editorValue').value=current}
      openModal('contentEditorModal');
    }

    async function saveValue(value,type){
      if(!state.adminProfile)throw new Error('Sessione admin non valida.');
      if(!state.contentTableAvailable)throw new Error('Tabella public_site_content non installata. Esegui prima supabase/public-site.sql.');
      const payload={content_key:currentKey,content_type:type,value:String(value??''),updated_by:state.adminUser.id,updated_at:new Date().toISOString()};
      const {error}=await sb.from('public_site_content').upsert(payload,{onConflict:'content_key'});if(error)throw error;state.content[currentKey]=payload.value;applyContent();
    }

    async function uploadImage(file){
      const safe=(file.name||'image').toLowerCase().replace(/[^a-z0-9._-]+/g,'-');const path=`site/${currentKey.replace(/[^a-z0-9._-]+/gi,'-')}/${Date.now()}-${safe}`;
      const {error}=await sb.storage.from('public-site').upload(path,file,{upsert:false,contentType:file.type||'image/jpeg'});if(error)throw error;
      return sb.storage.from('public-site').getPublicUrl(path).data.publicUrl;
    }

    async function saveEditor(){
      $('editorSave').disabled=true;$('editorMessage').textContent='Salvataggio…';
      try{
        let value,type=currentType==='image'?'image':'text';
        if(currentType==='image'){
          const file=$('editorImageFile').files?.[0];value=file?await uploadImage(file):$('editorImageUrl').value.trim();
        }else value=$('editorValue').value;
        await saveValue(value,type);$('editorMessage').textContent='';closeModal('contentEditorModal');toast('Contenuto aggiornato');
      }catch(err){$('editorMessage').textContent=err.message}finally{$('editorSave').disabled=false}
    }

    async function resetEditor(){
      if(!currentKey)return;$('editorReset').disabled=true;$('editorMessage').textContent='Ripristino…';
      try{await saveValue(DEFAULT_CONTENT[currentKey]??'',currentType==='image'?'image':'text');closeModal('contentEditorModal');toast('Valore predefinito ripristinato')}catch(err){$('editorMessage').textContent=err.message}finally{$('editorReset').disabled=false}
    }

    document.addEventListener('click',e=>{
      if(!editMode)return;const el=e.target.closest('[data-content-key]');if(!el)return;e.preventDefault();e.stopPropagation();openEditor(el);
    },true);
    $('openAdminLogin').onclick=()=>{closeAccount();openModal('adminLoginModal');setTimeout(()=>$('adminUsername').focus(),50)};
    $('adminLoginSubmit').onclick=loginAdmin;$('adminPassword').addEventListener('keydown',e=>{if(e.key==='Enter')loginAdmin()});
    $('toggleEditMode').onclick=()=>setEditMode(!editMode);$('adminLogoutTop').onclick=logoutAdmin;
    $('editorSave').onclick=saveEditor;$('editorReset').onclick=resetEditor;
    $('editorImageUrl').addEventListener('input',()=>{$('editorImagePreview').src=$('editorImageUrl').value.trim()||''});
    $('editorImageFile').addEventListener('change',()=>{const file=$('editorImageFile').files?.[0];if(file)$('editorImagePreview').src=URL.createObjectURL(file)});

    restoreAdmin().then(async()=>{if(state.adminProfile){updateAccountUI();await loadSiteContent()}});
  }

  if(window.JM_PUBLIC)start();else document.addEventListener('jm-public-ready',start,{once:true});
})();
