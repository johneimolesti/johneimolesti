(() => {
  "use strict";

  const ACTIONS = [
    {key:"delete", words:["ELIMINA","CANCELLA"], icon:"🗑", cls:"jm-action-delete", mobile:true},
    {key:"remove", words:["RIMUOVI","RIMUOVERE"], icon:"×", cls:"jm-action-remove", mobile:true},
    {key:"edit", words:["MODIFICA","MODIFICARE","EDIT"], icon:"✎", cls:"jm-action-edit", mobile:true},
    {key:"confirm", words:["CONFERMA","CONFERMARE"], icon:"✓", cls:"jm-action-confirm", mobile:true},
    {key:"add", words:["AGGIUNGI","AGGIUNGI / NUOVO","NUOVO","NUOVA"], icon:"+", cls:"jm-action-add", mobile:true},
    {key:"approve", words:["APPROVA","APPROVARE"], icon:"✓", cls:"jm-action-approve", mobile:true},
    {key:"reject", words:["RIFIUTA","RIFIUTARE"], icon:"×", cls:"jm-action-reject", mobile:true},
    {key:"save", words:["SALVA","SALVARE"], icon:"✓", cls:"jm-action-save", mobile:true},
    {key:"copy", words:["COPIA","COPIA LIVE"], icon:"⧉", cls:"jm-action-copy", mobile:true},
    {key:"print", words:["STAMPA"], icon:"⎙", cls:"jm-action-print", mobile:true},
    {key:"import", words:["IMPORTA","CARICA"], icon:"⇧", cls:"jm-action-import", mobile:true},
    {key:"reset", words:["RESET","RIPRISTINA","RIPRISTINO"], icon:"↺", cls:"jm-action-reset", mobile:true},
    {key:"vary", words:["VARIA / STORICIZZA","VARIA"], icon:"🕘", cls:"jm-action-vary", mobile:true}
  ];

  const clean = value => String(value || "")
    .replace(/[×✕✖✓✔+✎🗑⧉⎙⇧↺↻⚙]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

  function findAction(button) {
    const sources = [
      button.dataset?.actionLabel,
      button.getAttribute("aria-label"),
      button.getAttribute("title"),
      button.textContent
    ].filter(Boolean);

    for (const raw of sources) {
      const text = clean(raw);
      if (!text) continue;
      for (const action of ACTIONS) {
        if (action.words.some(word => text === word || text.startsWith(word + " ") || text.includes(" " + word + " "))) {
          return action;
        }
      }
    }

    const ds = button.dataset || {};
    if (Object.keys(ds).some(k => /delete|remove/i.test(k))) return ACTIONS.find(x=>x.key==="remove");
    if (Object.keys(ds).some(k => /edit|modify/i.test(k))) return ACTIONS.find(x=>x.key==="edit");
    if (Object.keys(ds).some(k => /confirm/i.test(k))) return ACTIONS.find(x=>x.key==="confirm");
    if (Object.keys(ds).some(k => /approve/i.test(k))) return ACTIONS.find(x=>x.key==="approve");
    if (Object.keys(ds).some(k => /reject/i.test(k))) return ACTIONS.find(x=>x.key==="reject");
    if (Object.keys(ds).some(k => /add|new/i.test(k))) return ACTIONS.find(x=>x.key==="add");
    return null;
  }

  function labelFor(button, action) {
    const explicit = button.dataset?.actionLabel || button.getAttribute("aria-label") || button.getAttribute("title");
    if (explicit) return explicit.trim();
    const text = String(button.textContent || "").replace(/\s+/g," ").trim();
    return text || action.words[0].toLowerCase();
  }

  function decorate(button) {
    if (!(button instanceof HTMLButtonElement)) return;
    if (button.closest(".gate,.nav,.fan-bottom-nav,.member-tabs,.proposal-tabs,.setup-tabs,.label-scope-tabs")) return;
    if (button.dataset.jmActionDecorated === "1") return;
    if (button.classList.contains("modal-close")) return;
    // Controlli funzionali con label dinamiche: non vanno trasformati in icone.
    // In particolare DEMO/LABEL hanno listener propri e il target deve restare il <button>.
    if (
      button.classList.contains("secure-demo-button") ||
      button.classList.contains("jukebox-label-button") ||
      button.classList.contains("concert-edit-remove") ||
      button.classList.contains("concert-tool-icon") ||
      button.classList.contains("concert-catalog-toggle")
    ) return;

    const action = findAction(button);
    if (!action) return;

    const label = labelFor(button, action);
    button.dataset.jmActionDecorated = "1";
    button.classList.add("jm-action-btn", action.cls);
    if (action.mobile) button.classList.add("jm-mobile-icon");
    button.dataset.actionLabel = label;
    button.setAttribute("aria-label", label);
    if (!button.getAttribute("title")) button.setAttribute("title", label);

    let icon = button.querySelector(":scope > .jm-action-icon");
    let text = button.querySelector(":scope > .jm-action-label");

    if (!icon || !text) {
      const original = String(button.textContent || "").replace(/\s+/g," ").trim();
      button.textContent = "";
      icon = document.createElement("span");
      icon.className = "jm-action-icon";
      icon.setAttribute("aria-hidden","true");
      icon.textContent = action.icon;

      text = document.createElement("span");
      text.className = "jm-action-label";
      text.textContent = original
        .replace(/^[×✕✖✓✔+✎🗑⧉⎙⇧↺↻⚙]\s*/,"")
        .trim() || label;

      button.append(icon, text);
    } else {
      icon.textContent = action.icon;
    }
  }

  function decorateTree(root) {
    if (!root) return;
    if (root instanceof HTMLButtonElement) decorate(root);
    root.querySelectorAll?.("button").forEach(decorate);
  }

  function compactOverflowingGroups() {
    document.querySelectorAll(
      ".row-buttons,.song-actions,.panel-header-actions,.modal-actions,.cash-ledger-actions,.cash-recurring-actions,.venue-actions,.member-global-actions,.cash-hero-actions"
    ).forEach(group => {
      const buttons = [...group.querySelectorAll(":scope > button.jm-action-btn")];
      buttons.forEach(b => b.classList.remove("jm-icon-only"));

      if (group.scrollWidth <= group.clientWidth + 1) return;

      const priority = ["jm-action-delete","jm-action-remove","jm-action-edit","jm-action-confirm","jm-action-add","jm-action-approve","jm-action-reject","jm-action-save","jm-action-copy","jm-action-print","jm-action-import","jm-action-reset","jm-action-vary"];
      for (const cls of priority) {
        for (const b of buttons.filter(x => x.classList.contains(cls))) {
          b.classList.add("jm-icon-only");
          if (group.scrollWidth <= group.clientWidth + 1) return;
        }
      }
    });
  }

  let raf = 0;
  function schedule() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      decorateTree(document);
      compactOverflowingGroups();
    });
  }

  new MutationObserver(mutations => {
    let added = false;
    for (const m of mutations) {
      if (m.type !== "childList" || !m.addedNodes.length) continue;
      m.addedNodes.forEach(node => {
        if (node.nodeType === 1) {
          decorateTree(node);
          added = true;
        }
      });
    }
    if (added) requestAnimationFrame(compactOverflowingGroups);
  }).observe(document.documentElement, {subtree:true, childList:true});

  window.addEventListener("resize", schedule, {passive:true});
  document.addEventListener("DOMContentLoaded", schedule);
  if (document.readyState !== "loading") schedule();
})();
