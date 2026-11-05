// Jack Rabbit's path maker and the ad slot. Pure logic, no database and no model: nothing here costs money or invents content.
// Flow: the visitor says what they are after -> Jack asks at most two quick questions -> Jack delivers a short path built ONLY from
// items the owner has already approved and published. Gaps become a request to that brand's editor (a draft the owner approves).
// An ad always comes first, clearly labeled. Partner ads are always disclosed as sponsored.

const STOP = new Set("the and for with from this that what where when how can want need about some any more new best good have has are was were you your our they them their there here just like get got give show tell find make would could should into over under then than also very much many idea tip app news opportunity thing things stuff".split(" "));

export const wordsOf = (text) => (String(text || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").match(/[a-z0-9]{3,}/g) || [])
  .map((word) => (word.length > 4 && word.endsWith("s") ? word.slice(0, -1) : word)).filter((word) => !STOP.has(word));

export const overlap = (wanted, text) => { const have = new Set(wordsOf(text)); return wanted.filter((word) => have.has(word)).length; };

// ---- the two questions (scripted; a model could write them later, with the owner's approval) ----
export const KIND_OPTIONS = [
  { id: "try", label: "Something to try", kinds: ["tip", "idea"] },
  { id: "tool", label: "A tool or app", kinds: ["app"] },
  { id: "new", label: "What is new", kinds: ["news"] },
  { id: "act", label: "Something I can act on", kinds: ["opportunity"] },
];
export const DEPTH_OPTIONS = [
  { id: "quick", label: "Quick: 3 steps", steps: 3 },
  { id: "deep", label: "Deeper: 5 steps", steps: 5 },
];
export const QUESTIONS = [
  { id: "kinds", text: "What would help most? Pick any.", multi: true, options: KIND_OPTIONS.map(({ id, label }) => ({ id, label })) },
  { id: "depth", text: "How big a path?", multi: false, options: DEPTH_OPTIONS.map(({ id, label }) => ({ id, label })) },
];

const KIND_LABEL = { news: "news", tip: "a tip", idea: "an idea", app: "an app", opportunity: "an opportunity", other: "something useful" };

// candidates: [{ item: { id, kind, title, summary, url, featured }, publication: { id, name }, issue_id }]
// answers: { kinds: ["try","tool"], depth: "quick"|"deep" }.  Returns { steps, short }.
export function buildPath({ wanted, answers = {}, candidates }) {
  const preferred = KIND_OPTIONS.filter((option) => (answers.kinds || []).includes(option.id)).flatMap((option) => option.kinds);
  const size = DEPTH_OPTIONS.find((option) => option.id === answers.depth)?.steps ?? 3;
  const scored = candidates.map((candidate) => {
    const hits = wanted.filter((word) => overlap([word], `${candidate.item.title} ${candidate.item.summary || ""}`) > 0);
    const score = hits.length * 3 + (preferred.includes(candidate.item.kind) ? 2 : 0) + (candidate.item.featured ? 1 : 0);
    return { ...candidate, hits, score };
  }).filter((entry) => entry.score > 0 && (wanted.length === 0 || entry.hits.length > 0 || preferred.includes(entry.item.kind)));
  scored.sort((a, b) => b.score - a.score || String(a.item.title).localeCompare(String(b.item.title)));

  const steps = [];
  const perPublication = new Map();
  const usedKinds = new Set();
  const take = (entry) => {
    steps.push({
      item_id: entry.item.id, kind: entry.item.kind, title: entry.item.title, summary: entry.item.summary || "", url: entry.item.url || "",
      publication_id: entry.publication.id, publication_name: entry.publication.name, issue_id: entry.issue_id,
      why: entry.hits.length ? `Matches ${entry.hits.slice(0, 3).join(", ")}.` : preferred.includes(entry.item.kind) ? `You asked for ${KIND_LABEL[entry.item.kind]}.` : "One of the editors' opening picks.",
    });
    perPublication.set(entry.publication.id, (perPublication.get(entry.publication.id) || 0) + 1);
    usedKinds.add(entry.item.kind);
  };
  const ok = (entry) => !steps.some((step) => step.item_id === entry.item.id && step.publication_id === entry.publication.id) && (perPublication.get(entry.publication.id) || 0) < 2;
  // First pass: variety (a different kind each time); second pass: fill by score.
  for (const entry of scored) { if (steps.length >= size) break; if (ok(entry) && !usedKinds.has(entry.item.kind)) take(entry); }
  for (const entry of scored) { if (steps.length >= size) break; if (ok(entry)) take(entry); }
  return { steps, short: steps.length < size };
}

// ---- the ad slot ----
// ads: data/ads.json entries. An ad is served only when the OWNER has approved it (approved: true), it has a link, and any
// start/end window is open. ADS_PREVIEW=on shows unapproved ads on a local test copy so the slot can be seen.
export function eligibleAds(ads, { publicationIds = [], now = new Date(), preview = false } = {}) {
  const today = now.toISOString().slice(0, 10);
  return ads.filter((ad) => (ad.approved || preview) && /^https?:\/\//.test(ad.url || "")
    && (!ad.start || ad.start <= today) && (!ad.end || ad.end >= today)
    && ((ad.brands || ["*"]).includes("*") || (ad.brands || []).some((brand) => publicationIds.includes(brand))));
}

const hash = (text) => { let h = 2166136261; for (const ch of String(text)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h; };

export function pickAd(ads, { publicationIds = [], context = "issue", now = new Date(), preview = false } = {}) {
  const pool = eligibleAds(ads, { publicationIds, now, preview });
  if (!pool.length) return null;
  // Paying partners come first when one is live; otherwise Joe's own books, apps and tools rotate by day and context.
  const partners = pool.filter((ad) => ad.kind === "partner");
  const from = partners.length ? partners : pool;
  const ad = from[hash(now.toISOString().slice(0, 10) + context + publicationIds.join(",")) % from.length];
  const sponsored = ad.kind === "partner";
  return {
    id: ad.id, kind: ad.kind, category: ad.category || "", title: ad.title, text: ad.text || "", url: ad.url, cta: ad.cta || "Learn more",
    sponsored, sponsor: sponsored ? ad.sponsor || "" : "",
    label: sponsored ? `Sponsored by ${ad.sponsor || "a partner"}` : `Ad · ${ad.category === "book" ? "our book" : ad.category === "app" ? "our app" : "our tool"}`,
  };
}
