// The default writer: no model, no cost. It only arranges editorial seeds and retrieved news; it never invents a fact.
// Writer interface (a model-backed writer implements the same two methods, see llm.mjs):
//   plan({ profile, period, pool, news })        -> { title, items: [{ kind, title, summary, url?, featured }] }
//   answer({ profile, pool, intent, current })   -> items to ADD to the current issue, or null when nothing fits
import { issueTitle } from "../profiles.mjs";

const ORDER = ["news", "tip", "idea", "app", "opportunity", "other"];

function hash(text) {
  let h = 2166136261;
  for (const ch of String(text)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h;
}

// Deterministic rotation: the same period always yields the same issue; the next period starts elsewhere in the pool.
function rotate(pool, count, seed) {
  if (!pool.length) return [];
  const start = seed % pool.length;
  return Array.from({ length: Math.min(count, pool.length) }, (_, i) => pool[(start + i) % pool.length]);
}

const clip = (text, max) => (text.length <= max ? text : text.slice(0, max - 1).trimEnd() + "…");
const day = (iso) => new Date(iso).toISOString().slice(0, 10);

export function pickFeatured(items, kinds, count) {
  const featured = new Set();
  for (const kind of kinds) {
    if (featured.size >= count) break;
    const hit = items.find((item) => item.kind === kind && !featured.has(item));
    if (hit) featured.add(hit);
  }
  for (const item of items) { if (featured.size >= count) break; featured.add(item); }
  return featured;
}

export const templateWriter = {
  name: "template",

  async plan({ profile, period, pool, news }) {
    const mix = profile.issue.mix || {};
    const items = [];
    for (const entry of (news || []).slice(0, profile.issue.news_max ?? 3)) {
      items.push({ kind: "news", title: clip(entry.title, 120), url: entry.url, summary: `Reported by ${entry.source}, ${day(entry.published)}. Open the source for the full story.` });
    }
    for (const [kind, count] of Object.entries(mix)) {
      const ofKind = pool.filter((seed) => seed.kind === kind);
      for (const seed of rotate(ofKind, count, hash(period.start + kind))) {
        items.push({ kind, title: seed.title, summary: seed.summary, ...(seed.url ? { url: seed.url } : {}) });
      }
    }
    items.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
    const featured = pickFeatured(items, profile.issue.featured_kinds, profile.issue.featured_count ?? 3);
    return { title: issueTitle(period), items: items.map((item) => ({ ...item, featured: featured.has(item) })) };
  },

  async answer({ pool, intent, current }) {
    const words = (text) => new Set(String(text || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").match(/[a-z0-9]{4,}/g) || []);
    const wanted = words(intent);
    const have = new Set((current?.items || []).map((item) => item.title));
    const scored = pool
      .filter((seed) => !have.has(seed.title))
      .map((seed) => ({ seed, score: [...words(seed.title + " " + seed.summary)].filter((word) => wanted.has(word)).length }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || String(a.seed.id).localeCompare(String(b.seed.id)))
      .slice(0, 2);
    return scored.length ? scored.map(({ seed }) => ({ kind: seed.kind, title: seed.title, summary: seed.summary, ...(seed.url ? { url: seed.url } : {}), featured: false })) : null;
  },
};
