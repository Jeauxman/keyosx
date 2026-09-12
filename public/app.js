const app = document.querySelector("#app");
const toastRegion = document.querySelector("#toast-region");

const state = {
  config: null,
  works: [],
  activeKind: "all",
  activeStatus: "all",
  query: "",
  messages: [],
  admin: null,
  adminMeta: null,
  manageWorkId: null,
  manageTab: "artifacts",
};

const KIND_LABELS = {
  brand: "Brand",
  platform: "Platform",
  engine: "Engine",
  ecosystem: "Ecosystem",
  application: "Application",
  service: "Service",
  book: "Book",
  document: "Document",
  concept: "Concept",
};
const KIND_ICONS = {
  brand: "⚑", platform: "▣", engine: "⚙", ecosystem: "✺", application: "◧",
  service: "◔", book: "▤", document: "▥", concept: "◌",
};
const STATUS_LABELS = { old: "Old", current: "Current", future: "Future" };
const RELATION_LABELS = {
  module_of: "a module of", part_of_catalog: "part of", powered_by: "powered by",
  sibling_of: "sibling of", successor_of: "successor to", predecessor_of: "predecessor to",
  depends_on: "depends on", inspired: "inspired by", licenses_to: "licensed to", distinct_from: "distinct from",
};
const EVENT_TYPE_LABELS = {
  created: "Created", launched: "Launched", rebuilt: "Rebuilt", renamed: "Renamed",
  status_change: "Status change", retired: "Retired", planned: "Planned", milestone: "Milestone", note: "Note",
};

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
}

function markdownLite(value) {
  return escapeHtml(value)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^&gt; (.+)$/gm, "<em>$1</em>")
    .replace(/\n/g, "<br>");
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const type = response.headers.get("content-type") || "";
  const payload = type.includes("application/json") ? await response.json() : null;
  if (!response.ok) throw new Error(payload?.error || "The request could not be completed.");
  return payload;
}

function showToast(message, isError = false) {
  const element = document.createElement("div");
  element.className = `toast${isError ? " error" : ""}`;
  element.textContent = message;
  toastRegion.appendChild(element);
  setTimeout(() => element.remove(), 4200);
}

function statusPill(status) {
  return `<span class="status-pill status-${status}">${escapeHtml(STATUS_LABELS[status] || status)}</span>`;
}

function workCard(work) {
  return `<article class="content-card">
    <div class="card-meta"><span>${KIND_ICONS[work.kind] || "•"}</span>${escapeHtml(KIND_LABELS[work.kind] || work.kind)}${work.category ? ` · ${escapeHtml(work.category)}` : ""} ${statusPill(work.status)} ${work.needs_review ? '<span class="badge badge-sample">Needs review</span>' : ""}</div>
    <h3>${escapeHtml(work.name)}</h3>
    <p>${escapeHtml(work.tagline || work.summary || "No summary has been added.")}</p>
    <div class="card-details">${escapeHtml(work.status_detail || "")}</div>
    <button class="button card-link" data-detail-id="${work.id}">Open in Jack Rabbit's catalog <span aria-hidden="true">→</span></button>
  </article>`;
}

function renderMessages() {
  if (!state.messages.length) {
    return `<div class="message message-guide"><strong>${escapeHtml(state.config?.guideName || "Jack Rabbit")}</strong><br>I search KeyOSX's published catalog. Ask about a specific work, or things like "what's live right now" or "what's planned next".</div>`;
  }
  return state.messages.map((message) => `<div class="message ${message.role === "user" ? "message-user" : "message-guide"}">${message.role === "guide" ? markdownLite(message.content) : escapeHtml(message.content)}${message.matches?.length ? `<div class="match-chips">${message.matches.map((match) => `<button class="match-chip" data-detail-id="${match.id}">${escapeHtml(match.name)}</button>`).join("")}</div>` : ""}</div>`).join("");
}

function renderPublic() {
  const counts = state.config.counts;
  document.title = `${state.config.brandName} — ${state.config.brandTagline}`;
  const kindTabs = ["all", ...state.config.kinds];
  app.innerHTML = `<div class="site-shell">
    <header class="topbar">
      <div class="topbar-inner">
        <a class="brand" href="#top" aria-label="KeyOSX home">
          <span class="brand-mark">KX</span><span><span class="brand-title">${escapeHtml(state.config.brandName)}</span><span class="brand-subtitle">Living kiosk</span></span>
        </a>
        <div class="header-actions">
          <a class="button button-quiet" href="#guide">Ask ${escapeHtml(state.config.guideName)}</a>
          <button class="button button-secondary" id="admin-link">Administrator</button>
        </div>
      </div>
    </header>
    <main id="main">
      <section id="top" class="hero">
        <div class="hero-content">
          <div class="eyebrow">KeyOSX · Master living kiosk</div>
          <h1>Find any work in the catalog.</h1>
          <p class="hero-copy">${escapeHtml(state.config.brandTagline)} Brands, platforms, engines, applications, books, documents, and concepts — each with its own status, history, and relationships. Nothing here is reduced to a single local guide; that content model belongs to Almanac, one work among many.</p>
          <div class="hero-stats">
            <div class="hero-stat"><strong>${counts.total}</strong><span>Total works</span></div>
            <div class="hero-stat"><strong>${counts.current}</strong><span>Current</span></div>
            <div class="hero-stat"><strong>${counts.future}</strong><span>Future</span></div>
            <div class="hero-stat"><strong>${counts.old}</strong><span>Old</span></div>
          </div>
        </div>
      </section>
      <section class="section">
        <div class="page-width">
          <div class="section-head"><div><div class="eyebrow" style="color:var(--clay)">The catalog</div><h2 class="section-title">Browse works, or search the whole thing.</h2><p class="section-copy">Filter by kind or by Old / Current / Future status, or search across every name, tagline, summary, and tag in the catalog.</p></div></div>
          <div class="filter-row">
            <nav class="type-tabs" aria-label="Status"><button class="type-tab ${state.activeStatus === "all" ? "is-active" : ""}" data-status="all">All statuses</button>${state.config.statuses.map((status) => `<button class="type-tab ${state.activeStatus === status ? "is-active" : ""}" data-status="${status}">${STATUS_LABELS[status]}</button>`).join("")}</nav>
            <nav class="type-tabs" aria-label="Kind">${kindTabs.map((kind) => `<button class="type-tab ${state.activeKind === kind ? "is-active" : ""}" data-kind="${kind}">${kind === "all" ? "All kinds" : KIND_LABELS[kind]}</button>`).join("")}</nav>
          </div>
          <form class="search-row" id="search-form"><label class="search-wrap"><span aria-hidden="true">⌕</span><input id="search-input" value="${escapeHtml(state.query)}" placeholder="Search the catalog"></label><button class="button button-secondary" type="submit">Search</button></form>
          <div class="content-grid" id="content-grid">${state.works.length ? state.works.map(workCard).join("") : `<div class="empty-state"><strong>No published works match this view.</strong><p>Try another kind, status, or a broader search.</p></div>`}</div>
        </div>
      </section>
      <section class="section section-soft" id="guide">
        <div class="page-width guide-layout">
          <section class="guide-panel"><div class="guide-mark">🐇</div><div class="eyebrow" style="color:var(--clay)">Universal guide</div><h2>${escapeHtml(state.config.guideName)} searches the whole catalog.</h2><p>${escapeHtml(state.config.guideName)} finds related works, explains status and history, and points to the correct active site, application, document, or future concept. It works without an external AI service; an optional OpenAI connection can improve wording while staying grounded in the same published records.</p><div class="prompt-grid"><button class="prompt-button" data-prompt="What's live and current right now?">What's current?</button><button class="prompt-button" data-prompt="What is planned for the future?">What's planned?</button><button class="prompt-button" data-prompt="What is FlintBill?">What is FlintBill?</button><button class="prompt-button" data-prompt="What's old or retired?">What's old?</button></div></section>
          <section class="chat-panel" aria-label="Ask Jack Rabbit"><div class="card-meta"><span>✦</span>${escapeHtml(state.config.guideName)} · catalog guide</div><div id="chat-history" class="chat-history">${renderMessages()}</div><form class="chat-form" id="chat-form"><input id="chat-input" maxlength="600" placeholder="Ask about any work in the catalog" aria-label="Ask Jack Rabbit a catalog question"><button class="button button-primary" type="submit">Ask</button></form></section>
        </div>
      </section>
    </main>
    <footer class="footer"><div class="page-width footer-inner"><p>${escapeHtml(state.config.brandName)} is the master index above every individual brand's own site or application. Data is managed by the administrator.</p><button class="button button-secondary" id="footer-admin">Administrator</button></div></footer>
  </div>`;
  bindPublicEvents();
}

function bindPublicEvents() {
  document.querySelectorAll("[data-status]").forEach((button) => button.addEventListener("click", async () => {
    state.activeStatus = button.dataset.status;
    await loadWorks();
    renderPublic();
  }));
  document.querySelectorAll("[data-kind]").forEach((button) => button.addEventListener("click", async () => {
    state.activeKind = button.dataset.kind;
    await loadWorks();
    renderPublic();
  }));
  document.querySelector("#search-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    state.query = document.querySelector("#search-input").value.trim();
    await loadWorks();
    renderPublic();
  });
  document.querySelectorAll("[data-detail-id]").forEach((button) => button.addEventListener("click", () => openDetail(button.dataset.detailId)));
  document.querySelector("#admin-link").addEventListener("click", showAdmin);
  document.querySelector("#footer-admin").addEventListener("click", showAdmin);
  document.querySelectorAll("[data-prompt]").forEach((button) => button.addEventListener("click", () => askGuide(button.dataset.prompt)));
  document.querySelector("#chat-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = document.querySelector("#chat-input");
    const message = input.value.trim();
    if (!message) return;
    input.value = "";
    await askGuide(message);
  });
}

async function loadWorks() {
  const params = new URLSearchParams();
  if (state.activeKind !== "all") params.set("kind", state.activeKind);
  if (state.activeStatus !== "all") params.set("status", state.activeStatus);
  if (state.query) params.set("q", state.query);
  const data = await api(`/api/works?${params}`);
  state.works = data.works;
}

async function askGuide(message) {
  state.messages.push({ role: "user", content: message });
  renderPublic();
  const history = document.querySelector("#chat-history");
  if (history) history.scrollTop = history.scrollHeight;
  try {
    const result = await api("/api/assistant", { method: "POST", body: JSON.stringify({ message }) });
    state.messages.push({ role: "guide", content: result.answer, matches: result.matches });
  } catch (error) {
    state.messages.push({ role: "guide", content: `I could not search the catalog just now: ${error.message}` });
  }
  renderPublic();
  document.querySelector("#guide")?.scrollIntoView({ behavior: "smooth", block: "center" });
}

async function openDetail(id) {
  try {
    const { work, artifacts, timeline, relationships } = await api(`/api/works/${id}`);
    const fields = [
      ["Kind", KIND_LABELS[work.kind] || work.kind],
      ["Category", work.category || "Not set"],
      ["Status", `${STATUS_LABELS[work.status]}${work.status_detail ? ` — ${work.status_detail}` : ""}`],
      ["Home platform", work.home_platform || "Not set"],
    ];
    const relationshipHtml = relationships.length
      ? `<div class="relationship-list">${relationships.map((r) => `<span class="relationship-chip">${r.direction === "outgoing" ? RELATION_LABELS[r.relation_type] || r.relation_type : `related (${RELATION_LABELS[r.relation_type] || r.relation_type} this)`} <strong>${escapeHtml(r.other_name)}</strong>${r.note ? `<small> — ${escapeHtml(r.note)}</small>` : ""}</span>`).join("")}</div>`
      : `<p style="color:var(--muted)">No relationships recorded yet.</p>`;
    const timelineHtml = timeline.length
      ? `<div class="timeline-list">${timeline.map((event) => `<div class="timeline-item"><span class="timeline-date">${escapeHtml(event.event_date)} · ${escapeHtml(EVENT_TYPE_LABELS[event.event_type] || event.event_type)}</span><strong>${escapeHtml(event.title)}</strong>${event.detail ? `<p>${escapeHtml(event.detail)}</p>` : ""}</div>`).join("")}</div>`
      : `<p style="color:var(--muted)">No timeline entries recorded yet.</p>`;
    const artifactHtml = artifacts.length
      ? `<div class="artifact-list">${artifacts.map((a) => `<div class="artifact-row"><strong>${escapeHtml(a.title)}</strong><br><small>${escapeHtml(a.artifact_type)}${a.reference_label ? ` · ${escapeHtml(a.reference_label)}` : ""}</small>${a.description ? `<p style="margin:6px 0 0">${escapeHtml(a.description)}</p>` : ""}${a.url ? `<p style="margin:6px 0 0"><a href="${escapeHtml(a.url)}" target="_blank" rel="noopener noreferrer">Open →</a></p>` : ""}</div>`).join("")}</div>`
      : `<p style="color:var(--muted)">No artifacts recorded yet.</p>`;
    showModal(`<div class="modal-head"><div><div class="card-meta"><span>${KIND_ICONS[work.kind] || "•"}</span>${escapeHtml(KIND_LABELS[work.kind] || work.kind)} ${statusPill(work.status)} ${work.needs_review ? '<span class="badge badge-sample">Needs review</span>' : ""}</div><h2>${escapeHtml(work.name)}</h2></div><button class="button button-secondary icon-button" data-close-modal aria-label="Close">×</button></div><p style="line-height:1.6;color:var(--ink-soft)">${escapeHtml(work.tagline || "")}</p><p style="line-height:1.6">${escapeHtml(work.summary || "")}</p>${work.body ? `<p style="line-height:1.65;white-space:pre-wrap;color:var(--muted)">${escapeHtml(work.body)}</p>` : ""}<div class="detail-grid">${fields.map(([label, value]) => `<div class="detail-block"><small>${escapeHtml(label)}</small><p>${escapeHtml(value)}</p></div>`).join("")}</div>${work.tags?.length ? `<div class="tags">${work.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>` : ""}${work.primary_url ? `<p style="margin-top:18px"><a class="button button-primary" href="${/^https?:\/\//.test(work.primary_url) ? escapeHtml(work.primary_url) : "#"}" target="_blank" rel="noopener noreferrer">${escapeHtml(work.primary_url)}</a></p>` : ""}<div class="detail-section"><h4>Relationships</h4>${relationshipHtml}</div><div class="detail-section"><h4>Timeline</h4>${timelineHtml}</div><div class="detail-section"><h4>Artifacts</h4>${artifactHtml}</div>`, true);
  } catch (error) { showToast(error.message, true); }
}

function showModal(content, wide = false) {
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `<section class="modal ${wide ? "modal-wide" : ""}" role="dialog" aria-modal="true">${content}</section>`;
  document.body.appendChild(backdrop);
  const close = () => backdrop.remove();
  backdrop.addEventListener("click", (event) => { if (event.target === backdrop) close(); });
  backdrop.querySelectorAll("[data-close-modal]").forEach((button) => button.addEventListener("click", close));
  return { backdrop, close };
}

// ---------- Admin ----------

async function showAdmin() {
  try {
    const session = await api("/api/admin/session");
    if (!session.authenticated) return renderLogin();
    await loadAdmin();
    renderAdmin();
  } catch (error) { showToast(error.message, true); }
}

function renderLogin() {
  app.innerHTML = `<main class="admin-shell"><a class="brand" href="#top" id="back-to-kiosk"><span class="brand-mark">KX</span><span><span class="brand-title">KeyOSX</span><span class="brand-subtitle">Return to the living kiosk</span></span></a><section class="login-card"><div class="eyebrow" style="color:var(--clay)">Administrator access</div><h1 style="font-size:2.35rem;color:var(--ink)">Sign in to manage the catalog.</h1><p>Use the deployment's administrator password.</p><form id="login-form"><label><span class="field-label">Administrator password</span><input type="password" id="admin-password" autocomplete="current-password" required></label><button class="button button-primary" type="submit">Sign in</button></form></section></main>`;
  document.querySelector("#back-to-kiosk").addEventListener("click", async (event) => { event.preventDefault(); await bootPublic(); });
  document.querySelector("#login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await api("/api/admin/login", { method: "POST", body: JSON.stringify({ password: document.querySelector("#admin-password").value }) });
      await loadAdmin();
      renderAdmin();
      showToast("Administrator session started.");
    } catch (error) { showToast(error.message, true); }
  });
}

async function loadAdmin() {
  state.admin = await api("/api/admin/bootstrap");
  if (!state.adminMeta) state.adminMeta = await api("/api/admin/meta");
}

function adminWorkRows() {
  return state.admin.works.map((work) => `<tr><td><strong>${escapeHtml(work.name)}</strong>${work.needs_review ? ' <span class="badge badge-sample">Needs review</span>' : ""}<br><small>${escapeHtml(work.category || "")}</small></td><td>${escapeHtml(KIND_LABELS[work.kind] || work.kind)}</td><td>${statusPill(work.status)}</td><td>${escapeHtml(work.visibility)}</td><td><button class="button button-secondary" data-edit-work="${work.id}">Edit</button> <button class="button button-secondary" data-manage-work="${work.id}">Manage details</button> <button class="button button-danger" data-delete-work="${work.id}">Delete</button></td></tr>`).join("");
}

function renderAdmin() {
  const published = state.admin.works.filter((work) => work.visibility === "published").length;
  app.innerHTML = `<main class="admin-shell"><div class="page-width"><div class="admin-top"><div><a class="brand" href="#top" id="back-to-kiosk"><span class="brand-mark">KX</span><span><span class="brand-title">KeyOSX</span><span class="brand-subtitle">Administrator console</span></span></a><p style="color:var(--muted);margin:12px 0 0">${published} published works · ${state.admin.artifacts.length} artifacts · ${state.admin.relationships.length} relationships · ${state.admin.timeline.length} timeline entries</p></div><div class="admin-actions"><button class="button button-secondary" id="export-backup">Export backup</button><button class="button button-secondary" id="admin-logout">Sign out</button></div></div><div class="admin-grid"><section class="admin-panel"><div class="eyebrow" style="color:var(--clay)">Works</div><h2>The catalog</h2><p>Every brand, platform, engine, application, book, document, or concept is a work. Use "Manage details" to add artifacts, relationships, and timeline entries.</p><div class="admin-actions"><button class="button button-primary" id="add-work">Add work</button></div><div class="admin-table-wrap"><table><thead><tr><th>Work</th><th>Kind</th><th>Status</th><th>Visibility</th><th>Actions</th></tr></thead><tbody>${adminWorkRows() || '<tr><td colspan="5">No works have been created.</td></tr>'}</tbody></table></div></section></div></div></main>`;
  document.querySelector("#back-to-kiosk").addEventListener("click", async (event) => { event.preventDefault(); await bootPublic(); });
  document.querySelector("#export-backup").addEventListener("click", () => { window.location.assign("/api/admin/export"); });
  document.querySelector("#admin-logout").addEventListener("click", async () => { await api("/api/admin/logout", { method: "POST" }); showToast("Signed out."); await bootPublic(); });
  document.querySelector("#add-work").addEventListener("click", () => openWorkForm());
  document.querySelectorAll("[data-edit-work]").forEach((button) => button.addEventListener("click", () => openWorkForm(state.admin.works.find((work) => Number(work.id) === Number(button.dataset.editWork)))));
  document.querySelectorAll("[data-manage-work]").forEach((button) => button.addEventListener("click", () => openManageModal(Number(button.dataset.manageWork))));
  document.querySelectorAll("[data-delete-work]").forEach((button) => button.addEventListener("click", async () => {
    const work = state.admin.works.find((entry) => Number(entry.id) === Number(button.dataset.deleteWork));
    if (!work || !window.confirm(`Delete “${work.name}”? This also deletes its artifacts, relationships, and timeline entries.`)) return;
    try { await api(`/api/admin/works/${work.id}`, { method: "DELETE" }); await loadAdmin(); renderAdmin(); showToast("Work deleted."); } catch (error) { showToast(error.message, true); }
  }));
}

function formDataObject(form) { return Object.fromEntries(new FormData(form).entries()); }

function workFormFields(work = {}) {
  const kindOptions = state.adminMeta.kinds.map((kind) => `<option value="${kind}" ${work.kind === kind ? "selected" : ""}>${KIND_LABELS[kind]}</option>`).join("");
  const statusOptions = state.adminMeta.statuses.map((status) => `<option value="${status}" ${(work.status || "current") === status ? "selected" : ""}>${STATUS_LABELS[status]}</option>`).join("");
  const visibilityOptions = ["draft", "published", "archived"].map((v) => `<option value="${v}" ${(work.visibility || "draft") === v ? "selected" : ""}>${v}</option>`).join("");
  return `<div class="form-grid">
    <label class="full"><span class="field-label">Name</span><input name="name" value="${escapeHtml(work.name || "")}" required></label>
    <label><span class="field-label">Slug</span><input name="slug" value="${escapeHtml(work.slug || "")}" placeholder="auto from name if left blank"></label>
    <label><span class="field-label">Kind</span><select name="kind" required>${kindOptions}</select></label>
    <label><span class="field-label">Category</span><input name="category" value="${escapeHtml(work.category || "")}" placeholder="e.g. Real Estate"></label>
    <label><span class="field-label">Status</span><select name="status">${statusOptions}</select></label>
    <label class="full"><span class="field-label">Status detail</span><input name="status_detail" value="${escapeHtml(work.status_detail || "")}" placeholder="e.g. Live, in rotation"></label>
    <label class="full"><span class="field-label">Tagline</span><input name="tagline" value="${escapeHtml(work.tagline || "")}"></label>
    <label class="full"><span class="field-label">Summary</span><textarea name="summary" rows="3">${escapeHtml(work.summary || "")}</textarea></label>
    <label class="full"><span class="field-label">Body / longer history</span><textarea name="body" rows="5">${escapeHtml(work.body || "")}</textarea></label>
    <label><span class="field-label">Primary URL</span><input name="primary_url" value="${escapeHtml(work.primary_url || "")}"></label>
    <label><span class="field-label">Home platform</span><input name="home_platform" value="${escapeHtml(work.home_platform || "")}" placeholder="e.g. Hostinger, Replit, Manus"></label>
    <label class="full"><span class="field-label">Hero image URL</span><input type="url" name="hero_image_url" value="${escapeHtml(work.hero_image_url || "")}"></label>
    <label><span class="field-label">Tags (comma-separated)</span><input name="tags" value="${escapeHtml((work.tags || []).join(", "))}"></label>
    <label><span class="field-label">Visibility</span><select name="visibility">${visibilityOptions}</select></label>
    <label><span class="field-label">Review status</span><select name="needs_review"><option value="false" ${!work.needs_review ? "selected" : ""}>Verified</option><option value="true" ${work.needs_review ? "selected" : ""}>Needs review — compiled record</option></select></label>
  </div>`;
}

function openWorkForm(work = null) {
  const { close, backdrop } = showModal(`<div class="modal-head"><div><div class="eyebrow" style="color:var(--clay)">Work management</div><h2>${work ? "Edit work" : "Add work"}</h2></div><button class="button button-secondary icon-button" data-close-modal aria-label="Close">×</button></div><form id="work-editor">${workFormFields(work || { status: "current", visibility: "draft" })}<div class="form-actions"><button class="button button-secondary" type="button" data-close-modal>Cancel</button><button class="button button-primary" type="submit">${work ? "Save changes" : "Create work"}</button></div></form>`, true);
  backdrop.querySelector("#work-editor").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const payload = formDataObject(event.currentTarget);
      await api(work ? `/api/admin/works/${work.id}` : "/api/admin/works", { method: work ? "PUT" : "POST", body: JSON.stringify(payload) });
      close(); await loadAdmin(); renderAdmin(); showToast(work ? "Work updated." : "Work created.");
    } catch (error) { showToast(error.message, true); }
  });
}

function openManageModal(workId) {
  state.manageWorkId = workId;
  state.manageTab = "artifacts";
  const { backdrop } = showModal(manageModalContent(), true);
  bindManageEvents(backdrop);
}

function manageModalContent() {
  const work = state.admin.works.find((w) => Number(w.id) === Number(state.manageWorkId));
  const tabs = ["artifacts", "relationships", "timeline"];
  return `<div class="modal-head"><div><div class="eyebrow" style="color:var(--clay)">Manage details</div><h2>${escapeHtml(work?.name || "")}</h2></div><button class="button button-secondary icon-button" data-close-modal aria-label="Close">×</button></div><div class="manage-tabs">${tabs.map((tab) => `<button class="manage-tab ${state.manageTab === tab ? "is-active" : ""}" data-manage-tab="${tab}">${tab[0].toUpperCase()}${tab.slice(1)}</button>`).join("")}</div><div id="manage-body">${manageTabContent()}</div>`;
}

function manageTabContent() {
  if (state.manageTab === "artifacts") return artifactsTabContent();
  if (state.manageTab === "relationships") return relationshipsTabContent();
  return timelineTabContent();
}

function artifactsTabContent() {
  const items = state.admin.artifacts.filter((a) => Number(a.work_id) === Number(state.manageWorkId));
  const typeOptions = state.adminMeta.artifactTypes.map((t) => `<option value="${t}">${t}</option>`).join("");
  return `<form id="add-artifact-form" class="inline-form">
    <label class="full"><span class="field-label">Title</span><input name="title" required></label>
    <label><span class="field-label">Type</span><select name="artifact_type">${typeOptions}</select></label>
    <label><span class="field-label">Reference label</span><input name="reference_label" placeholder="e.g. v10, July 2026"></label>
    <label class="full"><span class="field-label">Description</span><input name="description"></label>
    <label class="full"><span class="field-label">URL</span><input name="url" type="url"></label>
    <div class="full form-actions"><button class="button button-primary" type="submit">Add artifact</button></div>
  </form>
  <div class="row-list">${items.map((a) => `<div class="row-item"><span><strong>${escapeHtml(a.title)}</strong> — ${escapeHtml(a.artifact_type)}${a.reference_label ? ` (${escapeHtml(a.reference_label)})` : ""}</span><button class="button button-danger" data-delete-artifact="${a.id}">Delete</button></div>`).join("") || '<p style="color:var(--muted)">No artifacts yet.</p>'}</div>`;
}

function relationshipsTabContent() {
  const items = state.admin.relationships.filter((r) => Number(r.from_work_id) === Number(state.manageWorkId) || Number(r.to_work_id) === Number(state.manageWorkId));
  const relationOptions = state.adminMeta.relationTypes.map((t) => `<option value="${t}">${t}</option>`).join("");
  const workOptions = state.admin.works.filter((w) => Number(w.id) !== Number(state.manageWorkId)).map((w) => `<option value="${w.id}">${escapeHtml(w.name)}</option>`).join("");
  return `<form id="add-relationship-form" class="inline-form">
    <label class="full"><span class="field-label">Related work (this work → related work)</span><select name="to_work_id" required>${workOptions}</select></label>
    <label><span class="field-label">Relation type</span><select name="relation_type">${relationOptions}</select></label>
    <label class="full"><span class="field-label">Note</span><input name="note"></label>
    <div class="full form-actions"><button class="button button-primary" type="submit">Add relationship</button></div>
  </form>
  <div class="row-list">${items.map((r) => {
    const outgoing = Number(r.from_work_id) === Number(state.manageWorkId);
    const otherName = outgoing ? r.to_name : r.from_name;
    const label = outgoing ? `${r.relation_type} → ${otherName}` : `${otherName} ${r.relation_type} → this work`;
    return `<div class="row-item"><span>${escapeHtml(label)}${r.note ? ` — ${escapeHtml(r.note)}` : ""}</span><button class="button button-danger" data-delete-relationship="${r.id}">Delete</button></div>`;
  }).join("") || '<p style="color:var(--muted)">No relationships yet.</p>'}</div>`;
}

function timelineTabContent() {
  const items = state.admin.timeline.filter((t) => Number(t.work_id) === Number(state.manageWorkId)).sort((a, b) => a.event_date.localeCompare(b.event_date));
  const typeOptions = state.adminMeta.timelineEventTypes.map((t) => `<option value="${t}">${t}</option>`).join("");
  return `<form id="add-timeline-form" class="inline-form">
    <label><span class="field-label">Date (YYYY-MM-DD or YYYY-MM)</span><input name="event_date" required placeholder="2026-09-12"></label>
    <label><span class="field-label">Type</span><select name="event_type">${typeOptions}</select></label>
    <label class="full"><span class="field-label">Title</span><input name="title" required></label>
    <label class="full"><span class="field-label">Detail</span><input name="detail"></label>
    <div class="full form-actions"><button class="button button-primary" type="submit">Add event</button></div>
  </form>
  <div class="row-list">${items.map((t) => `<div class="row-item"><span><strong>${escapeHtml(t.event_date)}</strong> — ${escapeHtml(t.title)}</span><button class="button button-danger" data-delete-timeline="${t.id}">Delete</button></div>`).join("") || '<p style="color:var(--muted)">No timeline entries yet.</p>'}</div>`;
}

function bindManageEvents(backdrop) {
  backdrop.querySelectorAll("[data-close-modal]").forEach((button) => button.addEventListener("click", () => backdrop.remove()));
  backdrop.querySelectorAll("[data-manage-tab]").forEach((button) => button.addEventListener("click", () => {
    state.manageTab = button.dataset.manageTab;
    backdrop.querySelector("section.modal").innerHTML = manageModalContent();
    bindManageEvents(backdrop);
  }));
  const refresh = async () => {
    await loadAdmin();
    backdrop.querySelector("section.modal").innerHTML = manageModalContent();
    bindManageEvents(backdrop);
  };
  const artifactForm = backdrop.querySelector("#add-artifact-form");
  if (artifactForm) artifactForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await api("/api/admin/artifacts", { method: "POST", body: JSON.stringify({ ...formDataObject(event.currentTarget), work_id: state.manageWorkId }) });
      await refresh(); showToast("Artifact added.");
    } catch (error) { showToast(error.message, true); }
  });
  const relationshipForm = backdrop.querySelector("#add-relationship-form");
  if (relationshipForm) relationshipForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const payload = formDataObject(event.currentTarget);
      await api("/api/admin/relationships", { method: "POST", body: JSON.stringify({ from_work_id: state.manageWorkId, to_work_id: payload.to_work_id, relation_type: payload.relation_type, note: payload.note }) });
      await refresh(); showToast("Relationship added.");
    } catch (error) { showToast(error.message, true); }
  });
  const timelineForm = backdrop.querySelector("#add-timeline-form");
  if (timelineForm) timelineForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await api("/api/admin/timeline", { method: "POST", body: JSON.stringify({ ...formDataObject(event.currentTarget), work_id: state.manageWorkId }) });
      await refresh(); showToast("Timeline event added.");
    } catch (error) { showToast(error.message, true); }
  });
  backdrop.querySelectorAll("[data-delete-artifact]").forEach((button) => button.addEventListener("click", async () => {
    if (!window.confirm("Delete this artifact?")) return;
    try { await api(`/api/admin/artifacts/${button.dataset.deleteArtifact}`, { method: "DELETE" }); await refresh(); showToast("Artifact deleted."); } catch (error) { showToast(error.message, true); }
  }));
  backdrop.querySelectorAll("[data-delete-relationship]").forEach((button) => button.addEventListener("click", async () => {
    if (!window.confirm("Delete this relationship?")) return;
    try { await api(`/api/admin/relationships/${button.dataset.deleteRelationship}`, { method: "DELETE" }); await refresh(); showToast("Relationship deleted."); } catch (error) { showToast(error.message, true); }
  }));
  backdrop.querySelectorAll("[data-delete-timeline]").forEach((button) => button.addEventListener("click", async () => {
    if (!window.confirm("Delete this timeline entry?")) return;
    try { await api(`/api/admin/timeline/${button.dataset.deleteTimeline}`, { method: "DELETE" }); await refresh(); showToast("Timeline entry deleted."); } catch (error) { showToast(error.message, true); }
  }));
}

async function bootPublic() {
  try {
    if (!state.config) state.config = await api("/api/config");
    await loadWorks();
    renderPublic();
  } catch (error) {
    app.innerHTML = `<main class="admin-shell"><section class="login-card"><h1 style="font-size:2rem;color:var(--ink)">The kiosk could not start.</h1><p>${escapeHtml(error.message)}</p><button class="button button-primary" id="retry">Retry</button></section></main>`;
    document.querySelector("#retry").addEventListener("click", bootPublic);
  }
}

bootPublic();
