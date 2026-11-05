const app = document.querySelector("#app");
const toastRegion = document.querySelector("#toast-region");

const state = {
  config: null,
  works: [],
  activeKind: "all",
  activeStatus: "all",
  activeCategory: "all",
  query: "",
  messages: [],
  admin: null,
  adminMeta: null,
  manageWorkId: null,
  manageTab: "artifacts",
  entities: { publications: [], agents: [] },
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

function integrationBadge(entity) {
  const verified = entity.integration_status === "verified";
  return `<span class="badge ${verified ? "badge-live" : "badge-sample"}">${verified ? "Connected" : "Not yet connected"}</span>`;
}

function publicationCard(publication) {
  const agent = state.entities.agents.find((item) => item.id === publication.editorial_agent);
  const related = (publication.related || []).map((id) => state.entities.publications.find((item) => item.id === id)).filter(Boolean);
  return `<article class="content-card rack-card">
    <div class="rack-covers">${publication.issues.slice(0, 1).map((issue) => `<figure><button class="cover-open" data-open-issue="${escapeHtml(publication.id)}" ${issue.issue_id ? `data-issue-id="${issue.issue_id}"` : ""} aria-label="Open ${escapeHtml(publication.name)} — ${escapeHtml(issue.title)}"><img loading="lazy" src="${escapeHtml(issue.image_url)}" alt="${escapeHtml(publication.name)} — ${escapeHtml(issue.title)}"></button><figcaption>${escapeHtml(issue.title)}<br><em>${escapeHtml(issue.is_sample ? "Sample issue" : issue.status === "published" ? "Current issue" : issue.status === "released" ? "This month's cover" : "Proposed cover")}</em></figcaption></figure>`).join("")}</div>
    <div class="beat-line"><strong>${escapeHtml(publication.cadence || "")}</strong> · ${escapeHtml(publication.beat || "")}${publication.beat_status === "inferred" ? ' <span class="badge badge-sample">Genre inferred</span>' : ""}</div>
    <div class="card-meta"><span>▤</span>${escapeHtml(publication.series || "Publication")} series ${integrationBadge(publication)}</div>
    <h3>${escapeHtml(publication.name)}</h3>
    <p>${escapeHtml(publication.tagline)}</p>
    ${publication.issues.length > 1 ? `<div class="card-details">${publication.issues.length - 1} more proposed cover(s) held back. One cover per series on the rack; the Almanac makes the next ones once it goes live.</div>` : ""}
    <div class="card-details">${agent ? `Editorial agent: ${escapeHtml(agent.name)}` : "No editorial agent assigned yet"}${related.length ? ` · Related: ${related.map((item) => escapeHtml(item.name)).join(", ")}` : ""}</div>
    ${publication.page ? `<a class="button card-link" href="${escapeHtml(publication.page)}">Open the page <span aria-hidden="true">→</span></a>` : ""}
    ${publication.work_id ? `<button class="button card-link" data-detail-id="${publication.work_id}">Open in the catalog <span aria-hidden="true">→</span></button>` : ""}
  </article>`;
}

function agentCard(agent) {
  return `<article class="content-card">
    ${agent.cover ? `<div class="rack-covers"><figure><img loading="lazy" src="${escapeHtml(agent.cover)}" alt="${escapeHtml(agent.name)}"></figure></div>` : ""}
    <div class="card-meta"><span>⚙</span>${escapeHtml(agent.type)} ${integrationBadge(agent)}</div>
    <h3>${escapeHtml(agent.name)}</h3>
    <p>${agent.capabilities.length ? escapeHtml(agent.capabilities.join(" · ")) : "Capabilities not yet defined."}</p>
    <div class="card-details">${agent.requires_approval ? "Actions require approval" : "Read-only guide"}</div>
    ${agent.work_id ? `<button class="button card-link" data-detail-id="${agent.work_id}">Open in the catalog <span aria-hidden="true">→</span></button>` : ""}
  </article>`;
}

function rackHtml(rack) {
  if (!rack.matches.length) return "";
  const best = rack.matches[0];
  const items = rack.items.length
    ? `<p class="rack-note"><strong>On the rack, approved by the editors:</strong></p><div class="match-chips">${rack.items.map((item) => `<button class="match-chip" data-rack-open="${escapeHtml(item.publication_id)}" data-issue-id="${item.issue_id}">${escapeHtml(item.publication_name)} · ${escapeHtml(item.title)}</button>`).join("")}</div>`
    : `<p class="rack-note">${escapeHtml(best.name)} fits this, but nothing approved matches it yet.</p>`;
  const ask = rack.requested
    ? `<p class="rack-note">Passed to ${escapeHtml(best.name)}'s editor. It only appears on the rack after the editor approves it.</p>`
    : `<button class="match-chip" data-rack-ask="${escapeHtml(best.id)}" data-intent="${escapeHtml(rack.intent)}">Ask ${escapeHtml(best.name)}'s editor to cover this</button>`;
  return `<div class="rack-suggest">${items}${ask}</div>`;
}

// The ad slot: always labeled, always first. Partner ads say "Sponsored by".
function adHtml(ad) {
  if (!ad) return "";
  return `<aside class="ad-slot${ad.sponsored ? " ad-sponsored" : ""}" aria-label="Advertisement"><span class="ad-label">${escapeHtml(ad.label)}</span><div class="ad-body"><strong>${escapeHtml(ad.title)}</strong>${ad.text ? `<span>${escapeHtml(ad.text)}</span>` : ""}</div><a class="button" href="${escapeHtml(ad.url)}" target="_blank" rel="noopener noreferrer${ad.sponsored ? " sponsored" : ""}">${escapeHtml(ad.cta)}</a></aside>`;
}

// Path maker: Jack asks at most two quick questions, then delivers a path of approved items.
function pathAskHtml(message) {
  const ask = message.pathAsk;
  const groups = ask.questions.map((question) => `<div class="path-q"><p class="rack-note"><strong>${escapeHtml(question.text)}</strong></p><div class="match-chips">${question.options.map((option) => {
    const chosen = question.multi ? ask.chosen[question.id].includes(option.id) : ask.chosen[question.id] === option.id;
    return `<button class="match-chip${chosen ? " selected" : ""}" data-path-opt="${escapeHtml(question.id)}:${escapeHtml(option.id)}" aria-pressed="${chosen}">${escapeHtml(option.label)}</button>`;
  }).join("")}</div></div>`).join("");
  return `<div class="rack-suggest path-ask">${groups}<div class="match-chips"><button class="match-chip make-path" data-path-build>Build my path</button><button class="match-chip" data-path-skip>Skip the questions</button></div></div>`;
}

function pathHtml(path) {
  const steps = path.steps.length
    ? `<ol class="path-steps">${path.steps.map((step) => `<li><span class="badge">${escapeHtml(ITEM_KIND_LABELS[step.kind] || step.kind)}</span> <strong>${escapeHtml(step.title)}</strong><div class="path-meta">${escapeHtml(step.publication_name)} · ${escapeHtml(step.why)}</div><div class="match-chips"><button class="match-chip" data-rack-open="${escapeHtml(step.publication_id)}" data-issue-id="${step.issue_id}">Open in ${escapeHtml(step.publication_name)}</button>${step.url ? `<a class="match-chip" href="${escapeHtml(step.url)}" target="_blank" rel="noopener noreferrer">Go to the source</a>` : ""}</div></li>`).join("")}</ol>`
    : `<p class="rack-note">Nothing approved fits that yet.</p>`;
  const gap = path.gap ? `<p class="rack-note">${path.steps.length ? "That is what is ready so far." : ""} I can ask ${escapeHtml(path.gap.publication_name)}'s editor for more. It only appears after the editor approves it.</p><button class="match-chip" data-rack-ask="${escapeHtml(path.gap.publication_id)}" data-intent="${escapeHtml(path.gap.intent)}">Ask ${escapeHtml(path.gap.publication_name)}'s editor to cover this</button>` : "";
  return `<div class="rack-suggest">${adHtml(path.ad)}${steps}${gap}</div>`;
}

function renderMessages() {
  if (!state.messages.length) {
    return `<div class="message message-guide"><strong>${escapeHtml(state.config?.guideName || "Jack Rabbit")}</strong><br>I search KeyOSX's published catalog. Ask about a specific work, or things like "what's live right now" or "what's planned next".</div>`;
  }
  return state.messages.map((message) => `<div class="message ${message.role === "user" ? "message-user" : "message-guide"}">${message.role === "guide" ? markdownLite(message.content) : escapeHtml(message.content)}${message.rack ? rackHtml(message.rack) : ""}${message.pathAsk ? pathAskHtml(message) : ""}${message.path ? pathHtml(message.path) : ""}${message.role === "guide" && message.rack && !message.pathAsk && !message.path ? `<div class="match-chips"><button class="match-chip make-path" data-make-path="${escapeHtml(message.rack.intent)}">Make me a path</button></div>` : ""}${message.matches?.length ? `<div class="match-chips">${message.matches.map((match) => `<button class="match-chip" data-detail-id="${match.id}">${escapeHtml(match.name)}</button>`).join("")}</div>` : ""}</div>`).join("");
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
          <a class="button button-quiet" href="/media.html">Media</a>
          <a class="button button-quiet" href="#guide">Ask ${escapeHtml(state.config.guideName)}</a>
          <button class="button button-secondary" id="admin-link">Administrator</button>
        </div>
      </div>
    </header>
    <main id="main">
      <section id="top" class="hero">
        <div class="hero-content">
          <div class="eyebrow">KeyOSX · Master living kiosk</div>
          <h1>Walk up to the kiosk. Every brand has a stall.</h1>
          <p class="hero-copy">${escapeHtml(state.config.brandTagline)} Real estate networks, media brands, apps, personal brands, and concepts each get their own stall, arranged into sections like a real street kiosk — browse a section, filter by kind, or search the whole rack. Nothing here is reduced to a single local guide; that content model belongs to Almanac, one stall among many.</p>
          <div class="hero-stats">
            <div class="hero-stat"><strong>${counts.total}</strong><span>Total works</span></div>
            <div class="hero-stat"><strong>${counts.current}</strong><span>Current</span></div>
            <div class="hero-stat"><strong>${counts.future}</strong><span>Future</span></div>
            <div class="hero-stat"><strong>${counts.old}</strong><span>Old</span></div>
          </div>
        </div>
      </section>
      <section class="section" id="rack">
        <div class="page-width">
          <div class="section-head"><div><div class="eyebrow" style="color:var(--clay)">The publication rack</div><h2 class="section-title">Real magazines, each with its own identity.</h2><p class="section-copy">Each publication keeps its own covers, issues, editorial agent, and related titles. Connections to agents stay marked "not yet connected" until their integration is verified.</p></div></div>
          <div class="content-grid">${state.entities.publications.map(publicationCard).join("")}</div>
        </div>
      </section>
      <section class="section section-soft" id="agents">
        <div class="page-width">
          <div class="section-head"><div><div class="eyebrow" style="color:var(--clay)">The agent network</div><h2 class="section-title">The agents behind the kiosk.</h2></div></div>
          <div class="content-grid">${state.entities.agents.map(agentCard).join("")}</div>
        </div>
      </section>
      <section class="section">
        <div class="page-width">
          <div class="section-head"><div><div class="eyebrow" style="color:var(--clay)">The catalog</div><h2 class="section-title">Browse a section of the kiosk, or search the whole rack.</h2><p class="section-copy">Sections group brands the way a real kiosk groups its racks (Real Estate Network, Media Brands, Apps, Personal Brand, and more). Filter further by kind or by Old / Current / Future status, or search across every name, tagline, summary, and tag in the catalog.</p></div></div>
          <div class="filter-row">
            <nav class="type-tabs" aria-label="Section"><button class="type-tab ${state.activeCategory === "all" ? "is-active" : ""}" data-category="all">All sections</button>${(state.config.categories || []).map((category) => `<button class="type-tab ${state.activeCategory === category ? "is-active" : ""}" data-category="${escapeHtml(category)}">${escapeHtml(category)}</button>`).join("")}</nav>
            <nav class="type-tabs" aria-label="Status"><button class="type-tab ${state.activeStatus === "all" ? "is-active" : ""}" data-status="all">All statuses</button>${state.config.statuses.map((status) => `<button class="type-tab ${state.activeStatus === status ? "is-active" : ""}" data-status="${status}">${STATUS_LABELS[status]}</button>`).join("")}</nav>
            <nav class="type-tabs" aria-label="Kind">${kindTabs.map((kind) => `<button class="type-tab ${state.activeKind === kind ? "is-active" : ""}" data-kind="${kind}">${kind === "all" ? "All kinds" : KIND_LABELS[kind]}</button>`).join("")}</nav>
          </div>
          <form class="search-row" id="search-form"><label class="search-wrap"><span aria-hidden="true">⌕</span><input id="search-input" value="${escapeHtml(state.query)}" placeholder="Search the catalog"></label><button class="button button-secondary" type="submit">Search</button></form>
          <div class="content-grid" id="content-grid">${state.works.length ? state.works.map(workCard).join("") : `<div class="empty-state"><strong>No published works match this view.</strong><p>Try another section, kind, status, or a broader search.</p></div>`}</div>
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
  document.querySelectorAll("[data-category]").forEach((button) => button.addEventListener("click", async () => {
    state.activeCategory = button.dataset.category;
    await loadWorks();
    renderPublic();
  }));
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
  document.querySelectorAll("[data-make-path]").forEach((button) => button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      const intent = button.dataset.makePath;
      const result = await api("/api/jack/path", { method: "POST", body: JSON.stringify({ message: intent }) });
      state.messages.push({ role: "guide", content: "Two quick questions, then I will build you a path.", pathAsk: { intent, questions: result.questions, chosen: { kinds: [], depth: "quick" } } });
      renderPublic();
    } catch (error) { button.disabled = false; showToast(error.message, true); }
  }));
  document.querySelectorAll("[data-path-opt]").forEach((button) => button.addEventListener("click", () => {
    const [questionId, optionId] = button.dataset.pathOpt.split(":");
    const ask = [...state.messages].reverse().find((m) => m.pathAsk)?.pathAsk;
    if (!ask) return;
    if (questionId === "kinds") ask.chosen.kinds = ask.chosen.kinds.includes(optionId) ? ask.chosen.kinds.filter((id) => id !== optionId) : [...ask.chosen.kinds, optionId];
    else ask.chosen[questionId] = optionId;
    renderPublic();
  }));
  const deliverPath = async (skip) => {
    const message = [...state.messages].reverse().find((m) => m.pathAsk);
    if (!message) return;
    try {
      const body = skip ? { message: message.pathAsk.intent, skip: true } : { message: message.pathAsk.intent, answers: message.pathAsk.chosen };
      const result = await api("/api/jack/path", { method: "POST", body: JSON.stringify(body) });
      message.pathAsk = null;
      state.messages.push({ role: "guide", content: result.steps.length ? "Here is your path." : "I could not build a path from what is approved yet.", path: result });
      renderPublic();
      document.querySelector("#guide")?.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch (error) { showToast(error.message, true); }
  };
  document.querySelectorAll("[data-path-build]").forEach((button) => button.addEventListener("click", () => deliverPath(false)));
  document.querySelectorAll("[data-path-skip]").forEach((button) => button.addEventListener("click", () => deliverPath(true)));
  document.querySelectorAll("[data-rack-open]").forEach((button) => button.addEventListener("click", () => openIssue(button.dataset.rackOpen, button.dataset.issueId)));
  document.querySelectorAll("[data-rack-ask]").forEach((button) => button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      await api("/api/agent-requests", { method: "POST", body: JSON.stringify({ publication_id: button.dataset.rackAsk, intent: button.dataset.intent }) });
      const message = [...state.messages].reverse().find((m) => m.rack && m.rack.intent === button.dataset.intent);
      if (message) message.rack.requested = true;
      renderPublic();
      showToast("Request sent to the editor.");
    } catch (error) { button.disabled = false; showToast(error.message, true); }
  }));
  document.querySelectorAll("[data-open-issue]").forEach((button) => button.addEventListener("click", () => openIssue(button.dataset.openIssue, button.dataset.issueId)));
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
  if (state.activeCategory !== "all") params.set("category", state.activeCategory);
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
    let rack = null;
    try { rack = await api("/api/jack/route", { method: "POST", body: JSON.stringify({ message }) }); rack.intent = message; } catch { /* the catalog answer still stands */ }
    state.messages.push({ role: "guide", content: result.answer, matches: result.matches, rack });
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

const ITEM_KIND_LABELS = { news: "News", tip: "Tip", idea: "Idea", app: "App", opportunity: "Opportunity", other: "Other" };

// A cover opens to that issue: a "printing" strip shows how far it has developed, then Jack Rabbit offers three
// options, then the full list. The open cover refreshes itself as new stages are approved.
const STAGE_STEPS = [["outline", "Outline"], ["cover", "Cover"], ["items", "Stories"], ["media", "Video"]];

function stageTrackHtml(current, items, requestStatus) {
  const done = {
    outline: items.length > 0,
    cover: !!current?.cover_url,
    items: items.some((item) => item.summary),
    media: !!current?.media_url,
  };
  const firstOpen = STAGE_STEPS.findIndex(([key]) => !done[key]);
  return `<ol class="stage-track" aria-label="How this issue is being made">${STAGE_STEPS.map(([key, label], index) => {
    const state = done[key] ? "done" : (current?.pending_stages || "").split(",").includes(key) ? "waiting" : index === firstOpen && requestStatus === "running" ? "making" : "todo";
    const note = { done: "ready", waiting: "awaiting editor", making: "in production", todo: "" }[state];
    return `<li class="stage stage-${state}"><span class="stage-dot" aria-hidden="true"></span><strong>${label}</strong><small>${note}</small></li>`;
  }).join("")}</ol>`;
}

function mediaHtml(current) {
  if (!current?.media_url) return "";
  const url = escapeHtml(current.media_url);
  const poster = current.media_poster_url ? ` poster="${escapeHtml(current.media_poster_url)}"` : "";
  return /\.(mp4|webm|mov)(\?|$)/i.test(current.media_url)
    ? `<video class="issue-video" controls preload="metadata"${poster}><source src="${url}"></video>`
    : `<p><a class="button button-primary" href="${url}" target="_blank" rel="noopener noreferrer">Watch the video →</a></p>`;
}

async function openIssue(publicationId, issueId) {
  try {
    const endpoint = `/api/publications/${encodeURIComponent(publicationId)}/issues${issueId ? `?issue=${encodeURIComponent(issueId)}` : ""}`;
    const data = await api(endpoint);
    const { publication, current, archive, composing, generator_configured, request_status } = data;
    if (composing) api(`/api/publications/${encodeURIComponent(publicationId)}/observe`, { method: "POST", body: "{}" }).catch(() => {});
    const ad = await api(`/api/ads/next?publication=${encodeURIComponent(publicationId)}&context=issue`).then((r) => r.ad).catch(() => null);
    const guide = escapeHtml(state.config?.guideName || "Jack Rabbit");
    const items = current?.items || [];
    const picks = items.filter((item) => item.featured).slice(0, 3);
    const itemHtml = (item) => `<button class="issue-item" data-pick="${item.id}"><span class="badge">${escapeHtml(ITEM_KIND_LABELS[item.kind] || item.kind)}</span><strong>${escapeHtml(item.title)}</strong></button>`;
    const shelfCover = state.entities.publications.find((p) => p.id === publication.id)?.issues[0]?.image_url || "";
    const coverHtml = current?.cover_url
      ? `<img class="issue-cover" src="${escapeHtml(current.cover_url)}" alt="${escapeHtml(publication.name)} — ${escapeHtml(current.title)}">`
      : `<div class="issue-cover cover-printing" role="img" aria-label="Cover is being made"><span>Cover being made…</span></div>`;
    const body = current
      ? `${adHtml(ad)}${stageTrackHtml(current, items, request_status)}<div class="issue-layout">${coverHtml}
        <div class="issue-main">
          ${composing ? `<p class="issue-guide"><strong>${guide}:</strong> You looked, so this ${escapeHtml(publication.cadence || "")} issue is being composed now. ${generator_configured ? "It will be here shortly — showing the last issue meanwhile." : "No editorial agent is connected yet, so you are seeing the last issue."}</p>` : ""}${current.is_sample ? '<p><span class="badge badge-sample">Sample issue — shows the format, not real content</span></p>' : ""}
          ${mediaHtml(current)}
          <p class="issue-guide"><strong>${guide}:</strong> ${picks.length ? "Here are three places to start. Pick one, or browse the whole issue." : "Browse this issue and pick what fits you."}</p>
          ${picks.length ? `<div class="issue-picks">${picks.map(itemHtml).join("")}</div>` : ""}
          <h4>Everything in this issue</h4>
          <div class="issue-list">${items.map(itemHtml).join("")}</div>
          <div id="issue-detail" class="issue-detail" aria-live="polite"></div>
        </div></div>`
      : `${adHtml(ad)}<p class="issue-guide"><strong>${guide}:</strong> You looked, so ${escapeHtml(publication.name)}'s ${escapeHtml(publication.cadence || "")} issue has been requested. ${generator_configured ? "It will appear here once the editorial agent posts it and the editor approves it." : "No editorial agent is connected yet, so nothing is listed."}</p>`;
    const { backdrop } = showModal(`<div class="modal-head"><div><div class="card-meta"><span>▤</span>${escapeHtml(publication.cadence || "")} · ${escapeHtml(publication.beat || "")}</div><h2>${escapeHtml(publication.name)}${current ? ` — ${escapeHtml(current.title)}` : ""}</h2></div><button class="button button-secondary icon-button" data-close-modal aria-label="Close">×</button></div>${body}${archive.length > 1 ? `<div class="detail-section"><h4>Back issues</h4><div class="issue-list">${archive.map((issue) => `<button class="issue-item" data-back-issue="${issue.id}"><strong>${escapeHtml(issue.title)}</strong><span>${escapeHtml(issue.issue_date)}</span></button>`).join("")}</div></div>` : ""}`, true);
    void shelfCover;
    const byId = new Map(items.map((item) => [String(item.id), item]));
    backdrop.querySelectorAll("[data-pick]").forEach((button) => button.addEventListener("click", () => {
      const item = byId.get(button.dataset.pick);
      const sameKind = items.filter((other) => other.kind === item.kind && other.id !== item.id);
      const detail = backdrop.querySelector("#issue-detail");
      detail.innerHTML = `<h4>${escapeHtml(item.title)}</h4><p>${escapeHtml(item.summary || "Details are still being written.")}</p><div class="issue-actions">${item.url ? `<a class="button button-primary" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">Go to the source →</a>` : ""}${sameKind.length ? `<button class="button button-secondary" data-similar>More ${escapeHtml((ITEM_KIND_LABELS[item.kind] || item.kind).toLowerCase())}s like this (${sameKind.length})</button>` : ""}<button class="button button-secondary" data-ask>Ask ${guide} about this</button></div><div class="issue-similar"></div>`;
      detail.querySelector("[data-ask]").addEventListener("click", () => { backdrop.remove(); askGuide(`${publication.name}: ${item.title}`); });
      detail.querySelector("[data-similar]")?.addEventListener("click", () => { detail.querySelector(".issue-similar").innerHTML = sameKind.map(itemHtml).join(""); detail.querySelectorAll("[data-pick]").forEach((b) => b.addEventListener("click", () => backdrop.querySelector(`[data-pick="${b.dataset.pick}"]`).click())); });
      detail.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }));
    backdrop.querySelectorAll("[data-back-issue]").forEach((button) => button.addEventListener("click", () => { backdrop.remove(); openIssue(publicationId, button.dataset.backIssue); }));

    // Watch it develop: while this window is open, re-check every 15s and reopen when a stage is approved.
    const signature = (d) => JSON.stringify([d.current?.published_revision ?? null, d.current?.pending_stages ?? null, d.request_status ?? null]);
    const opened = signature(data);
    const timer = setInterval(async () => {
      if (!document.body.contains(backdrop)) { clearInterval(timer); return; }
      try {
        const latest = await api(endpoint);
        if (signature(latest) !== opened) { clearInterval(timer); backdrop.remove(); openIssue(publicationId, issueId); }
      } catch { /* keep the current view; try again next tick */ }
    }, 15000);
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
  state.admin.pendingIssues = (await api("/api/admin/issues/pending")).issues;
  state.admin.agentRequests = (await api("/api/admin/agent-requests")).requests;
  if (!state.entities.publications.length) { try { state.entities = await api("/api/entities"); } catch { /* names fall back to ids */ } }
  if (!state.adminMeta) state.adminMeta = await api("/api/admin/meta");
}

function adminWorkRows() {
  return state.admin.works.map((work) => `<tr><td><strong>${escapeHtml(work.name)}</strong>${work.needs_review ? ' <span class="badge badge-sample">Needs review</span>' : ""}<br><small>${escapeHtml(work.category || "")}</small></td><td>${escapeHtml(KIND_LABELS[work.kind] || work.kind)}</td><td>${statusPill(work.status)}</td><td>${escapeHtml(work.visibility)}</td><td><button class="button button-secondary" data-edit-work="${work.id}">Edit</button> <button class="button button-secondary" data-manage-work="${work.id}">Manage details</button> <button class="button button-danger" data-delete-work="${work.id}">Delete</button></td></tr>`).join("");
}

function publicationName(id) {
  return state.entities.publications.find((publication) => publication.id === id)?.name || id.split(":").pop();
}

function pendingPanelHtml() {
  const pending = state.admin.pendingIssues || [];
  const rows = pending.map((issue) => `<tr><td><strong>${escapeHtml(publicationName(issue.publication_id))}</strong><br><small>${escapeHtml(issue.title)}</small></td><td>${escapeHtml(issue.issue_date)}</td><td>${issue.published_revision ? `Live: rev ${issue.published_revision} · awaiting rev ${issue.latest_revision}` : `New draft (rev ${issue.latest_revision})`}<br><small>Stage: ${escapeHtml(issue.latest_stage || "items")}</small></td><td><button class="button button-primary" data-review-issue="${issue.id}">Review</button></td></tr>`).join("");
  const requests = (state.admin.agentRequests || []).slice(0, 10);
  const requestRows = requests.map((r) => `<tr><td>${escapeHtml(r.intent)}</td><td>${escapeHtml(publicationName(r.to_entity))}</td><td>${escapeHtml(r.status)}${r.last_error ? ` <small>(${escapeHtml(r.last_error)})</small>` : ""}</td><td>${escapeHtml(r.created_at)}</td></tr>`).join("");
  const requestsHtml = `<h3 style="margin:22px 0 6px">Visitor requests to editors</h3>${requests.length ? `<div class="admin-table-wrap"><table><thead><tr><th>Asked for</th><th>Publication</th><th>Status</th><th>When</th></tr></thead><tbody>${requestRows}</tbody></table></div>` : '<p style="color:var(--muted)">None yet. Requests come from visitors talking to Jack Rabbit.</p>'}`;
  return `<section class="admin-panel" id="pending-issues" style="margin:18px 0"><h2 style="margin:0 0 6px">Issues awaiting approval ${pending.length ? `<span class="badge badge-sample">${pending.length}</span>` : ""}</h2>${pending.length ? `<div class="admin-table-wrap"><table><thead><tr><th>Publication</th><th>Issue date</th><th>State</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p style="color:var(--muted)">Nothing is waiting. Drafts posted by editorial agents appear here.</p>'}${requestsHtml}</section>`;
}

async function openIssueReview(issueId) {
  try {
    const { issue, revisions } = await api(`/api/admin/issues/${issueId}`);
    const latest = revisions[0];
    const live = issue.published_revision;
    const itemRow = (item) => `<li>${item.featured ? "★ " : ""}<span class="badge">${escapeHtml(ITEM_KIND_LABELS[item.kind] || item.kind)}</span> <strong>${escapeHtml(item.title)}</strong>${item.summary ? `<br><small>${escapeHtml(item.summary)}</small>` : ""}${item.url ? `<br><small><a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.url)}</a></small>` : ""}${item.kind === "news" && !item.url ? ' <span class="badge badge-sample">News without a source link</span>' : ""}</li>`;
    const revHtml = (rev) => `<div class="detail-section"><h4>Revision ${rev.revision} <span class="badge">${escapeHtml(rev.stage || "items")}</span>${rev.revision === live ? " — LIVE" : rev.revision === latest.revision ? " — awaiting approval" : ""} <small>by ${escapeHtml(rev.created_by || "unknown")} · ${escapeHtml(rev.created_at)}</small></h4><div class="issue-layout">${rev.cover_url ? `<img class="issue-cover" src="${escapeHtml(rev.cover_url)}" alt="Cover, revision ${rev.revision}">` : '<p style="color:var(--muted)">No cover supplied.</p>'}<div>${rev.media_url ? mediaHtml(rev) : ""}<ol style="margin:0;padding-left:1.1rem;line-height:1.5">${rev.items.map(itemRow).join("") || "<li>No items.</li>"}</ol></div></div></div>`;
    const { backdrop, close } = showModal(`<div class="modal-head"><div><h2>${escapeHtml(publicationName(issue.publication_id))} — ${escapeHtml(issue.title)}</h2><p style="margin:4px 0 0;color:var(--muted)">Check sources, artwork and rights before approving. Approving makes this revision what every visitor sees.</p></div><button class="button button-secondary icon-button" data-close-modal aria-label="Close">×</button></div>${revisions.map(revHtml).join("")}<div class="issue-actions"><button class="button button-primary" data-approve>Approve &amp; publish revision ${latest.revision}</button>${live ? "" : '<button class="button button-secondary" data-discard>Discard draft</button>'}</div>`, true);
    const refresh = async () => { close(); await loadAdmin(); renderAdmin(); };
    backdrop.querySelector("[data-approve]").addEventListener("click", async () => {
      try { await api(`/api/admin/issues/${issue.id}/publish`, { method: "POST", body: JSON.stringify({ revision: latest.revision }) }); showToast("Issue published."); await refresh(); } catch (error) { showToast(error.message, true); }
    });
    backdrop.querySelector("[data-discard]")?.addEventListener("click", async () => {
      if (!window.confirm("Discard this draft? It has never been published.")) return;
      try { await api(`/api/admin/issues/${issue.id}/discard`, { method: "POST", body: "{}" }); showToast("Draft discarded."); await refresh(); } catch (error) { showToast(error.message, true); }
    });
  } catch (error) { showToast(error.message, true); }
}

function renderAdmin() {
  const published = state.admin.works.filter((work) => work.visibility === "published").length;
  app.innerHTML = `<main class="admin-shell"><div class="page-width"><div class="admin-top"><div><a class="brand" href="#top" id="back-to-kiosk"><span class="brand-mark">KX</span><span><span class="brand-title">KeyOSX</span><span class="brand-subtitle">Administrator console</span></span></a><p style="color:var(--muted);margin:12px 0 0">${published} published works · ${state.admin.artifacts.length} artifacts · ${state.admin.relationships.length} relationships · ${state.admin.timeline.length} timeline entries</p></div><div class="admin-actions"><button class="button button-secondary" id="export-backup">Export backup</button><button class="button button-secondary" id="admin-logout">Sign out</button></div></div><div class="admin-grid"><section class="admin-panel"><div class="eyebrow" style="color:var(--clay)">Works</div><h2>The catalog</h2><p>Every brand, platform, engine, application, book, document, or concept is a work. Use "Manage details" to add artifacts, relationships, and timeline entries.</p><div class="admin-actions"><button class="button button-primary" id="add-work">Add work</button></div><div class="admin-table-wrap"><table><thead><tr><th>Work</th><th>Kind</th><th>Status</th><th>Visibility</th><th>Actions</th></tr></thead><tbody>${adminWorkRows() || '<tr><td colspan="5">No works have been created.</td></tr>'}</tbody></table></div></section></div></div></main>`;
  document.querySelector(".admin-top").insertAdjacentHTML("afterend", pendingPanelHtml());
  document.querySelectorAll("[data-review-issue]").forEach((button) => button.addEventListener("click", () => openIssueReview(button.dataset.reviewIssue)));
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
    <label class="full"><span class="field-label">Evidence (why you believe this — cite the source)</span><input name="evidence_note" placeholder="e.g. subdomain askjoe.4thishouse.com"></label>
    <div class="full form-actions"><button class="button button-primary" type="submit">Add relationship (as draft)</button></div>
  </form>
  <div class="row-list">${items.map((r) => {
    const outgoing = Number(r.from_work_id) === Number(state.manageWorkId);
    const otherName = outgoing ? r.to_name : r.from_name;
    const label = outgoing ? `${r.relation_type} → ${otherName}` : `${otherName} ${r.relation_type} → this work`;
    const badges = `${statusPill(r.status === "published" ? "current" : r.status === "draft" ? "future" : "old")}${r.needs_review ? ' <span class="badge badge-sample">Needs review</span>' : ""}`;
    return `<div class="row-item"><span>${badges} <strong>${escapeHtml(label)}</strong>${r.note ? ` — ${escapeHtml(r.note)}` : ""}${r.evidence_note ? `<br><small>Evidence: ${escapeHtml(r.evidence_note)}</small>` : ""}</span><span style="display:flex;gap:6px;flex-shrink:0">${r.status === "published" ? `<button class="button button-secondary" data-unpublish-relationship="${r.id}">Unpublish</button>` : `<button class="button button-primary" data-publish-relationship="${r.id}">Publish</button>`}<button class="button button-danger" data-delete-relationship="${r.id}">Delete</button></span></div>`;
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
      await api("/api/admin/relationships", { method: "POST", body: JSON.stringify({ from_work_id: state.manageWorkId, to_work_id: payload.to_work_id, relation_type: payload.relation_type, note: payload.note, evidence_note: payload.evidence_note }) });
      await refresh(); showToast("Relationship added as draft — publish it once reviewed.");
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
  const setRelationshipStatus = async (id, status) => {
    const current = state.admin.relationships.find((r) => Number(r.id) === Number(id));
    if (!current) return;
    try {
      await api(`/api/admin/relationships/${id}`, { method: "PUT", body: JSON.stringify({ ...current, status }) });
      await refresh(); showToast(status === "published" ? "Relationship published." : "Relationship unpublished.");
    } catch (error) { showToast(error.message, true); }
  };
  backdrop.querySelectorAll("[data-publish-relationship]").forEach((button) => button.addEventListener("click", () => setRelationshipStatus(button.dataset.publishRelationship, "published")));
  backdrop.querySelectorAll("[data-unpublish-relationship]").forEach((button) => button.addEventListener("click", () => setRelationshipStatus(button.dataset.unpublishRelationship, "draft")));
  backdrop.querySelectorAll("[data-delete-timeline]").forEach((button) => button.addEventListener("click", async () => {
    if (!window.confirm("Delete this timeline entry?")) return;
    try { await api(`/api/admin/timeline/${button.dataset.deleteTimeline}`, { method: "DELETE" }); await refresh(); showToast("Timeline entry deleted."); } catch (error) { showToast(error.message, true); }
  }));
}

async function bootPublic() {
  try {
    if (!state.config) state.config = await api("/api/config");
    await loadWorks();
    try { state.entities = await api("/api/entities"); } catch { /* rack is optional; the catalog still works */ }
    renderPublic();
  } catch (error) {
    app.innerHTML = `<main class="admin-shell"><section class="login-card"><h1 style="font-size:2rem;color:var(--ink)">The kiosk could not start.</h1><p>${escapeHtml(error.message)}</p><button class="button button-primary" id="retry">Retry</button></section></main>`;
    document.querySelector("#retry").addEventListener("click", bootPublic);
  }
}

bootPublic();
