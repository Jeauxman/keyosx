// Jack Rabbit's trail: he takes you somewhere when you don't know where to go, brings you back, and keeps track of what you found and learned.
// Pure functions, no DOM and no network, so they are tested in Node. The browser keeps the trail on THIS device only (localStorage);
// nothing is sent anywhere. Members' synced trails come later, with accounts.
export const MAX_STEPS = 60;
export const MAX_PAST = 5;
export const MAX_NOTE = 200;

export const emptyTrails = () => ({ current: null, past: [] });
export const stepKey = (ref) => `${ref.publication_id}|${ref.item_id ?? ref.title}`;

const clean = (ref, extra = {}) => ({
  key: stepKey(ref), publication_id: ref.publication_id, publication_name: ref.publication_name || "", issue_id: ref.issue_id ?? null, item_id: ref.item_id ?? null,
  kind: ref.kind || "other", title: String(ref.title || "").slice(0, 300), url: /^https?:\/\//.test(ref.url || "") ? ref.url : "",
  planned: false, visited_at: null, note: "", ...extra,
});

const newId = (now) => now.getTime().toString(36);

// Start a trail from a path Jack delivered. An unfinished earlier trail with something visited is kept in `past`.
export function startTrail(trails, intent, steps, now = new Date()) {
  const past = archived(trails, now);
  return { current: { id: newId(now), intent: String(intent || "Browsing").slice(0, 300), started: now.toISOString(), steps: steps.slice(0, MAX_STEPS).map((step) => clean(step, { planned: true })) }, past };
}

function archived(trails, now) {
  const past = [...trails.past];
  if (trails.current && trails.current.steps.some((step) => step.visited_at || step.note)) past.unshift({ ...trails.current, ended: now.toISOString() });
  return past.slice(0, MAX_PAST);
}

export function archiveCurrent(trails, now = new Date()) { return { current: null, past: archived(trails, now) }; }

// The visitor opened something. Planned steps are ticked off; anything else is recorded as "found along the way".
// With no trail yet, one starts called "Browsing".
export function markVisited(trails, ref, now = new Date()) {
  const base = trails.current || { id: newId(now), intent: "Browsing", started: now.toISOString(), steps: [] };
  const key = stepKey(ref);
  let found = false;
  const steps = base.steps.map((step) => (step.key === key ? (found = true, { ...step, visited_at: step.visited_at || now.toISOString() }) : step));
  if (!found && steps.length < MAX_STEPS) steps.push(clean(ref, { visited_at: now.toISOString() }));
  return { ...trails, current: { ...base, steps } };
}

export function setNote(trails, key, note) {
  if (!trails.current) return trails;
  const text = String(note || "").replace(/\s+/g, " ").trim().slice(0, MAX_NOTE);
  return { ...trails, current: { ...trails.current, steps: trails.current.steps.map((step) => (step.key === key ? { ...step, note: text } : step)) } };
}

export function counts(trail) {
  const steps = trail?.steps || [];
  return {
    planned: steps.filter((step) => step.planned).length,
    visited: steps.filter((step) => step.visited_at).length,
    found: steps.filter((step) => !step.planned && step.visited_at).length,
    ahead: steps.filter((step) => step.planned && !step.visited_at).length,
    notes: steps.filter((step) => step.note).length,
  };
}

// "1 of 3 planned, plus 1 found along the way" (planned steps opened are counted apart from things found on the side)
export function progress(trail) {
  const c = counts(trail);
  if (!c.planned) return `${c.visited} thing${c.visited === 1 ? "" : "s"}`;
  return `${c.visited - c.found} of ${c.planned} planned${c.found ? `, plus ${c.found} found along the way` : ""}`;
}

const KIND = { news: "News", tip: "Tip", idea: "Idea", app: "App", opportunity: "Opportunity", other: "More" };

// "Return with clarity": a plain-text wrap-up of what was found and learned, and what is still ahead. No model, no cost.
export function summarize(trail) {
  if (!trail) return "";
  const c = counts(trail);
  const line = (step) => `${KIND[step.kind] || "More"}: ${step.title}${step.publication_name ? ` (${step.publication_name})` : ""}`;
  const visited = trail.steps.filter((step) => step.visited_at);
  const ahead = trail.steps.filter((step) => step.planned && !step.visited_at);
  const out = [`My trail: ${trail.intent}`, `Started ${trail.started.slice(0, 10)}. Looked at ${progress(trail)}.`, ""];
  out.push("What I found");
  if (!visited.length) out.push("  Nothing opened yet.");
  visited.forEach((step, i) => { out.push(`  ${i + 1}. ${line(step)}${step.planned ? "" : " [found along the way]"}`); if (step.note) out.push(`     What I learned: ${step.note}`); });
  if (ahead.length) { out.push("", "Still ahead"); ahead.forEach((step) => out.push(`  - ${line(step)}`)); out.push("", `Next: ${ahead[0].title}`); }
  else if (visited.length) out.push("", "Trail complete. Ask Jack Rabbit where to go next.");
  return out.join("\n");
}
