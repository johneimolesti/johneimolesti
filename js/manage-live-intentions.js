(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = v => String(v ?? '').replace(/[&<>'"]/g, ch => ({
    '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'
  }[ch]));

  const cache = new Map();
  let scheduled = 0;
  let loadingId = null;

  function isAdmin() {
    try { return typeof isEma === 'function' && isEma(); }
    catch { return false; }
  }

  async function api(action, payload = {}) {
    if (typeof memberSecurityApi !== 'function') throw new Error('API admin non disponibile');
    return memberSecurityApi(action, payload, true);
  }

  function currentConcert() {
    try {
      return (concerts || []).find(c => String(c.id) === String(selectedConcertId)) || null;
    } catch {
      return null;
    }
  }

  function buildPanel(rows, concert) {
    const pending = rows.filter(x => x.status === 'going');
    const confirmed = rows.filter(x => x.status === 'confirmed');
    const duration = Number(concert?.duration_minutes || 90);

    return `
      <section id="concertIntentionsAdminPanel" class="panel" style="margin:8px 0">
        <div class="panel-header">
          <h2>CI SARÒ · CONFERME</h2>
          <span class="counter">${pending.length} da confermare · ${confirmed.length} confirmati</span>
        </div>
        <div class="section-note" style="margin:8px">
          “Ci sarò” è solo un’intenzione. Diventa presenza quando il fan riconferma durante il live,
          usa il QR oppure un admin la conferma. Durata stimata: <strong>${duration} min</strong>.
        </div>
        <div class="setup-user-list">
          ${pending.map(row => `
            <div class="setup-user-row" data-intention-fan="${esc(row.fan_id)}">
              <div class="setup-user-main">
                <div class="setup-user-title">${esc(row.fan_name)}</div>
                <div class="setup-user-meta">${row.group_name ? `Gruppo: ${esc(row.group_name)} · ` : ''}CI SARÒ da confermare</div>
              </div>
              <div class="setup-user-actions">
                <button class="primary" type="button" data-confirm-intention>CONFERMA PRESENZA</button>
              </div>
            </div>`).join('')}
          ${confirmed.map(row => `
            <div class="setup-user-row">
              <div class="setup-user-main">
                <div class="setup-user-title">${esc(row.fan_name)}</div>
                <div class="setup-user-meta">${row.group_name ? `Gruppo: ${esc(row.group_name)} · ` : ''}PRESENZA CONFERMATA ✓</div>
              </div>
            </div>`).join('')}
          ${rows.length ? '' : '<div class="empty">Nessun “Ci sarò” registrato per questo live.</div>'}
        </div>
        <div class="section-note" data-intention-status style="margin:7px 8px"></div>
      </section>`;
  }

  function render(rows) {
    const host = $('#concertDetail');
    const concert = currentConcert();
    if (!host || !concert) return;

    $('#concertIntentionsAdminPanel', host)?.remove();
    host.insertAdjacentHTML('afterbegin', buildPanel(rows, concert));

    const panel = $('#concertIntentionsAdmiinPanel', host);
    const status = $('[data-intention-status]', panel);

    $$('[data-confirm-intention]', panel).forEach(btn => {
      btn.onclick = async () => {
        const row = btn.closest('[data-intention-fan]');
        btn.disabled = true;
        status.textContent = 'Conferma presenza…';
        try {
          await api('admin_confirm_concert_intention', {
            concert_id: concert.id,
            fan_id: row.dataset.intentionFan
          });
          cache.delete(String(concert.id));
          status.textContent = 'Presenza confermata ✓';
          await refresh(true);
        } catch (err) {
          status.textContent = err.message || String(err);
          btn.disabled = false;
        }
      };
    });
  }

  async function refresh(force = false) {
    if (!isAdmin()) return;
    const concert = currentConcert();
    const host = $('#concertDetail');
    if (!concert || !host) return;

    const id = String(concert.id);
    if (!force && cache.has(id)) {
      render(cache.get(id));
      return;
    }
    if (loadingId === id) return;

    loadingId = id;
    try {
      const data = await api('admin_list_concert_intentions', {concert_id:id});
      const rows = Array.isArray(data.intentions) ? data.intentions : [];
      cache.set(id, rows);
      if (String(selectedConcertId) === id) render(rows);
    } catch (err) {
      console.warn('Intenzioni fan non disponibili', err);
    } finally {
      loadingId = null;
    }
  }

  function schedule() {
    if (scheduled) return;
    scheduled = requestAnimationFrame(() => {
      scheduled = 0;
      if ($('#concertIntentionsAdminPanel')) return;
      refresh(false);
    });
  }

  function init() {
    if (!isAdmin()) return;
    const host = $('#concertDetail');
    if (!host) return;

    const observer = new MutationObserver(schedule);
    observer.observe(host, {childList:true, subtree:false});

    document.addEventListener('click', e => {
      if (e.target.closest?.('#concertList .list-row')) setTimeout(schedule, 0);
    }, true);

    schedule();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, {once:true});
  } else {
    init();
  }
})();