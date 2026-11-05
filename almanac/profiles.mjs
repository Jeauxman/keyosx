// Editorial profiles: one engine, many publications. A profile = defaults + data/profiles/<slug>.json + the entity's own beat/cadence.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(ROOT, relative), "utf8"));
const exists = (relative) => fs.existsSync(path.join(ROOT, relative));

export const slugOf = (id) => String(id).split(":").pop();

const isObject = (value) => value && typeof value === "object" && !Array.isArray(value);
function merge(base, override) {
  const out = { ...base };
  for (const [key, value] of Object.entries(override || {})) out[key] = isObject(value) && isObject(base?.[key]) ? merge(base[key], value) : value;
  return out;
}

export function loadEntities() {
  return readJson("data/entities.json");
}

export function findPublication(publicationId, entities = loadEntities()) {
  return entities.publications.find((publication) => publication.id === publicationId) || null;
}

// Returns null when the id is not a publication on the rack.
export function loadProfile(publicationId, entities = loadEntities()) {
  const publication = findPublication(publicationId, entities);
  if (!publication) return null;
  const slug = slugOf(publication.id);
  const own = exists(`data/profiles/${slug}.json`) ? readJson(`data/profiles/${slug}.json`) : {};
  const merged = merge(readJson("data/profiles/default.json"), own);
  delete merged._note;
  return { ...merged, id: publication.id, slug, name: publication.name, beat: publication.beat || "", cadence: publication.cadence || "monthly", masthead: merged.identity?.masthead || publication.name };
}

export function seedPool(profile) {
  const name = profile.sources?.seeds;
  if (!name || !exists(`data/almanac/${name}.seeds.json`)) return [];
  return (readJson(`data/almanac/${name}.seeds.json`).items || []).slice().sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

// A feed counts only if enabled in the profile, or switched on for the whole service with ALMANAC_FEEDS=on.
export function activeFeeds(profile, env = process.env) {
  const all = ALL_ON(env);
  return (profile.sources?.feeds || []).filter((feed) => feed.url && (feed.enabled || all));
}
const ALL_ON = (env) => String(env.ALMANAC_FEEDS || "").toLowerCase() === "on";

// The engine composes only for publications that have editorial sources; it never pads an issue with invented content.
export function canCompose(profile, env = process.env) {
  return seedPool(profile).length > 0 || activeFeeds(profile, env).length > 0;
}

// "W2026-11-02" -> { cadence, start }. Mirrors issuePeriod() in db.mjs.
export function parsePeriod(periodKey) {
  const match = /^([WMQ])(\d{4}-\d{2}(?:-\d{2})?)$/.exec(String(periodKey || ""));
  if (!match) return null;
  const start = match[2].length === 7 ? match[2] + "-01" : match[2];
  return { cadence: { W: "weekly", M: "monthly", Q: "quarterly" }[match[1]], start };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export function issueTitle(period) {
  const [y, m, d] = period.start.split("-").map(Number);
  if (period.cadence === "weekly") return `Week of ${d} ${MONTHS[m - 1]} ${y}`;
  if (period.cadence === "quarterly") return `Q${Math.floor((m - 1) / 3) + 1} ${y}`;
  return `${MONTHS_LONG[m - 1]} ${y}`;
}
