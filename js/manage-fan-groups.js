(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({
    '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'
  }[ch]));

  let state = {groups:[], assignments:[]};
  let loaded = false;
  let loading = false;
  let observer = null;
  let patchQueued = false;

  function canManage() {
    try { return typeof isEma === 'function' ? !!isEma() : true; }
    catch { return false; }
  }

  function ensureStyles() {
    if ($('#jmFanGroupsAdminStyles')) return;
    const style = document.createElement('style');
    style.id = 'jmFanGroupsAdminStyles';
    style.textContent = `
      .setup-fan-group-pill{display:inline-flex;align-items:center;gap:4px;margin-left:5px;padding:2px 6px;border:1px solid rgba(243,210,52,.22);border-radius:999px;color:#d7c454;font-size:6px;font-weight:950;letter-spacing:.05em;text-transform:uppercase;vertical-align:1px}
      .setup-fan-group-pill.pending{border-color:rgba(232,150,86,.25);color:#d9a06c}
      .setup-fan-group-select{max-width:150px;min-height:28px;padding:4px 6px;border:1px solid rgba(255,255,255,.12);border-radius:8px;background:#202630;color:#e8ebef;font-size:7px;font-weight:850}
      .setup-fan-group-panel{margin-bottom:8px}.setup-fan-group-toolbar{display:grid;grid-template-columns:minmax(170px,1fr) auto;gap:7px;padding:8px;border-bottom:1px solid rgba(255,255,255,.06)}
      .setup-fan-group-toolbar input{width:100%;min-width:0;height:32px;padding:6px 9px;border:1px solid #3b424d;border-radius:8px;background:#171c23;color:#e9edf2;font-size:8px}
      .setup-fan-group-list{display:grid;gap:0}.setup-fan-group-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center;padding:8px 10px;border-bottom:1px solid rgba(255,255,255,.055)}
      .setup-fan-group-row:last-child{border-bottom:0}.setup-fan-group-row strong{display:block;font-size:8.5px}.setup-fan-group-row span{display:block;margin-top:2px;color:#79828f;font-size:6.5px}.setup-fan-group-row button{min-height:27px;padding:5px 8px;border:1px solid rgba(255,255,255,.12);border-radius:7px;background:#292f38;color:#e6e9ed;font-size:6.5px;font-weight:900}.setup-fan-group-row button.primary{border-color:#f3d234;background:#f3d234;color:#111}
      @media(max-width:700px){.setup-fan-group-toolbar{grid-template-columns:1fr}.setup-fan-group-select{max-width:130px}}
    `;
    document.head.appendChild(style);
  }

  async function api(action, payload = {}) {
    if (typeof memberSecurityApi !== 'function') throw new Error('API gestione utenti non disponibile');
    return memberSecurityApi(action, payload, true);
  }

  function assignmentMap() {
    return new Map((state.assignments || []).map(x => [String(x.fan_id), x.group_id || null]));
  }

  function groupMap() {
    return new Map((state.groups || []).map(g => [String(g.id), g]));
  }

  function ensurePanel() {
    const usersSection = $('[data-setup-section="users"]');
    const directory = $('.setup-user-directory-panel', usersSection || document);
    if (!usersSection || !directory) return null;

    let panel = $('#setupFanGroupsPanel');
    if (!panel) {
      panel = document.createElement('section');
      panel.id = 'setupFanGroupsPanel';
      panel.className = 'panel setup-fan-group-panel';
      panel.innerHTML = `
        <div class="panel-header"><h2>GRUPPI FAN / CERCHIE</h2><span id="setupFanGroupsCounter" class="counter"></span></div>
        <div class="section-note" style="margin:8px">Il gruppo identifica la cerchia con cui il fan segue i Molesti. I fan possono proporne uno nuovo; finché non viene confermato dall'admin resta privato e non appare in HITS.</div>
        <div class="setup-fan-group-toolbar"><input id="setupFanGroupNewName" maxlength="80" placeholder="Nuovo gruppo, es. Amici Kekko Saletto"><button id="setupFanGroupCreate" class="small-btn primary" type="button">+ CREA E CONFERMA</button></div>
        <div id="setupFanGroupList" class="setup-fan-group-list"></div>
        <div id="setupFanGroupStatus" class="section-note" style="margin:7px 8px"></div>`;
      directory.insertAdjacentElement('beforebegin', panel);
      $('#setupFanGroupCreate', panel).onclick = createGroup;
    }
    return panel;
  }

  function renderPanel() {
    const panel = ensurePanel();
    if (!panel) return;
    const list = $('#setupFanGroupList', panel);
    const counter = $('#setupFanGroupsCounter', panel);
    const groups = [...(state.groups || [])].sort((a,b) => {
      if (a.status !== b.status) return a.status === 'pending' ? -1 : 1;
      return String(a.name).localeCompare(String(b.name), 'it');
    });
    const pending = groups.filter(g => g.status === 'pending').length;
    counter.textContent = `${groups.length}${pending ? ` · ${pending} da confermare` : ''}`;
    list.innerHTML = groups.map(g => `
      <div class="setup-fan-group-row" data-group-row="${esc(g.id)}">
        <div><strong>${esc(g.name)} ${g.status === 'pending' ? '<span class="setup-fan-group-pill pending">DA CONFERMARE</span>' : '<span class="setup-fan-group-pill">CONFERMATO</span>'}</strong><span>${Number(g.fan_count || 0)} fan assegnati</span></div>
        <div class="setup-user-actions">
          ${g.status === 'pending' ? '<button type="button" class="primary" data-confirm-group>CONFERMA</button>' : ''}
          <button type="button" data-rename-group>RINOMINA</button>
        </div>
      </div>`).join('') || '<div class="empty">Nessun gruppo.</div>';

    $$('[data-group-row]', list).forEach(row => {
      const id = row.dataset.groupRow;
      $('[data-confirm-group]', row)?.addEventListener('click', () => confirmGroup(id));
      $('[data-rename-group]', row)?.addEventListener('click', () => renameGroup(id));
    });
  }

  function patchFanRows() {
    const list = $('#setupUserList');
    if (!list || !loaded) return;
    const assignments = assignmentMap();
    const groups = groupMap();

    $$('[data-setup-fan-edit]', list).forEach(editBtn => {
      const row = editBtn.closest('.setup-user-row');
      const fanId = editBtn.dataset.setupFanEdit;
      if (!row || !fanId) return;

      const groupId = assignments.get(String(fanId)) || '';
      const group = groupId ? groups.get(String(groupId)) : null;
      const title = $('.setup-user-title', row);
      const meta = $('.setup-user-meta', row);
      const actions = $('.setup-user-actions', row);

      row.querySelectorAll('.setup-fan-group-pill').forEach(x => x.remove());
      if (title && group) {
        const pill = document.createElement('span');
        pill.className = `setup-fan-group-pill${group.status === 'pending' ? ' pending' : ''}`;
        pill.textContent = group.name;
        title.appendChild(pill);
      }

      let groupMeta = $('.setup-fan-group-meta', row);
      if (!groupMeta && meta) {
        groupMeta = document.createElement('div');
        groupMeta.className = 'setup-user-meta setup-fan-group-meta';
        meta.insertAdjacentElement('afterend', groupMeta);
      }
      if (groupMeta) groupMeta.textContent = group ? `Gruppo: ${group.name}${group.status === 'pending' ? ' · da confermare' : ''}` : 'Gruppo: non assegnato';

      let select = $('.setup-fan-group-select', row);
      if (!select && actions) {
        select = document.createElement('select');
        select.className = 'setup-fan-group-select';
        select.title = 'Assegna gruppo fan';
        actions.prepend(select);
      }
      if (!select) return;
      select.innerHTML = `<option value="">— NESSUN GRUPPO —</option>${(state.groups || []).map(g => `<option value="${esc(g.id)}">${esc(g.name)}${g.status === 'pending' ? ' · DA CONFERMARE' : ''}</option>`).join('')}`;
      select.value = groupId;
      select.onchange = () => assignGroup(fanId, select.value, select);
    });
  }

  async function refresh(force = false) {
    if (!canManage() || loading || (loaded && !force)) {
      if (loaded) { renderPanel(); patchFanRows(); }
      return;
    }
    loading = true;
    try {
      state = await api('admin_list_fan_groups');
      loaded = true;
      renderPanel();
      patchFanRows();
    } catch (err) {
      const panel = ensurePanel();
      if (panel) $('#setupFanGroupStatus', panel).textContent = err.message || String(err);
    } finally {
      loading = false;
    }
  }

  async function assignGroup(fanId, groupId, select) {
    select.disabled = true;
    try {
      await api('admin_assign_fan_group', {fan_id:fanId, group_id:groupId || null});
      await refresh(true);
    } catch (err) {
      alert(err.message || String(err));
      await refresh(true);
    } finally {
      select.disabled = false;
    }
  }

  async function confirmGroup(groupId) {
    const panel = ensurePanel();
    const status = $('#setupFanGroupStatus', panel);
    status.textContent = 'Conferma gruppo…';
    try {
      await api('admin_confirm_fan_group', {group_id:groupId});
      status.textContent = 'Gruppo confermato ✓';
      await refresh(true);
    } catch (err) { status.textContent = err.message || String(err); }
  }

  async function renameGroup(groupId) {
    const group = (state.groups || []).find(g => String(g.id) === String(groupId));
    if (!group) return;
    const name = prompt('Nome gruppo', group.name);
    if (!name?.trim() || name.trim() === group.name) return;
    const panel = ensurePanel();
    const status = $('#setupFanGroupStatus', panel);
    status.textContent = 'Rinomina gruppo…';
    try {
      await api('admin_save_fan_group', {group_id:groupId, name:name.trim(), confirm:group.status === 'confirmed'});
      status.textContent = 'Gruppo aggiornato ✓';
      await refresh(true);
    } catch (err) { status.textContent = err.message || String(err); }
  }

  async function createGroup() {
    const panel = ensurePanel();
    const input = $('#setupFanGroupNewName', panel);
    const status = $('#setupFanGroupStatus', panel);
    const name = input.value.trim();
    if (!name) return;
    status.textContent = 'Creazione gruppo…';
    try {
      await api('admin_save_fan_group', {name, confirm:true});
      input.value = '';
      status.textContent = 'Gruppo creato e confermato ✓';
      await refresh(true);
    } catch (err) { status.textContent = err.message || String(err); }
  }

  function schedulePatch() {
    if (patchQueued) return;
    patchQueued = true;
    requestAnimationFrame(() => {
      patchQueued = false;
      const hasFanRows = !!$('#setupUserList [data-setup-fan-edit]');
      if (hasFanRows) refresh(false);
      else if (loaded) { renderPanel(); patchFanRows(); }
    });
  }

  function init() {
    if (!canManage()) return;
    ensureStyles();
    ensurePanel();
    const list = $('#setupUserList');
    if (list) {
      observer = new MutationObserver(schedulePatch);
      observer.observe(list, {childList:true, subtree:true});
    }
    document.addEventListener('click', e => {
      if (e.target.closest?.('[data-setup-section="users"], [data-setup="users"], [data-setup-section-target="users"]')) {
        setTimeout(() => refresh(false), 0);
      }
    }, true);
    schedulePatch();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();