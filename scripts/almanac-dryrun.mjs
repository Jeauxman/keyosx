// Dry run: pushes EVERY publication through the real Almanac pipeline (discover, verify, remember, supply, choose, validate) against an
// in-memory stand-in for KeyOSX, using the live feeds. Nothing is written to any database and no model is called (free writer).
// Run: npm run almanac:dryrun   (add a slug to run one brand: npm run almanac:dryrun -- noize)
import { createEngine, validateIssue } from "../almanac/engine.mjs";
import { loadEntities, loadProfile, canCompose } from "../almanac/profiles.mjs";

const only = process.argv[2];
const period = "W2026-11-02";
const rows = [];
let failed = 0;

for (const publication of loadEntities().publications) {
  const slug = publication.id.split(":").pop();
  if (only && slug !== only) continue;
  const profile = loadProfile(publication.id);
  const store = new Map(); const posted = []; let nextId = 1;
  const json = (data, status = 200) => ({ ok: true, status, json: async () => data, text: async () => JSON.stringify(data) });
  const fetchImpl = async (url, options = {}) => {
    if (!String(url).startsWith("http://dry.run")) return fetch(url, options);
    const u = new URL(url); const body = options.body ? JSON.parse(options.body) : {};
    if (u.pathname === "/api/agent/issues") { posted.push(body); return json({ id: 1 }, 201); }
    if (u.pathname === "/api/agent/knowledge" && options.method === "POST") {
      for (const r of body.records) store.set(r.url || r.title, { ...r, id: nextId++, last_checked_at: new Date().toISOString() });
      return json({ inserted: body.records.length }, 201);
    }
    if (u.pathname === "/api/agent/knowledge") {
      const verified = u.searchParams.get("verified") === "1"; const status = u.searchParams.get("status");
      return json({ records: [...store.values()].filter((r) => (!verified || r.verified) && (!status || r.status === status)) });
    }
    if (u.pathname === "/api/agent/knowledge/status") return json({ updated: 1 });
    throw new Error("unexpected " + u.pathname);
  };
  const engine = createEngine({ env: { AGENT_API_TOKEN: "dry", KEYOSX_ORIGIN: "http://dry.run", KEYOSX_PUBLIC_ORIGIN: "relative", ALMANAC_STAGE_DELAY_MS: "0" }, fetchImpl, log: () => {} });
  const row = { brand: slug, ready: canCompose(profile), items: 0, news: 0, feeds: (profile.sources.feeds || []).filter((f) => f.enabled).length, verified: 0, featured: "", problems: "" };
  try {
    await engine.handle({ type: "issue_request", publication_id: publication.id, period_key: period, issue_date: "2026-11-04", callback: "/api/agent/issues" });
    const final = posted.at(-1);
    row.items = final?.items.length || 0;
    row.news = final?.items.filter((i) => i.kind === "news").length || 0;
    row.verified = [...store.values()].filter((r) => r.verified).length;
    row.featured = (final?.items || []).filter((i) => i.featured).map((i) => i.kind).join("/");
    const problems = validateIssue(final?.items || [], profile);
    row.problems = problems.join("; ");
    if (problems.length || !final) failed++;
  } catch (error) { row.problems = error.message; failed++; }
  rows.push(row);
}

console.log("brand".padEnd(28) + "feeds verified items news featured          problems");
for (const r of rows) console.log(r.brand.padEnd(28) + String(r.feeds).padEnd(6) + String(r.verified).padEnd(9) + String(r.items).padEnd(6) + String(r.news).padEnd(5) + r.featured.padEnd(19) + (r.problems || "ok"));
console.log(`\n${rows.length} brands, ${rows.length - failed} composed cleanly, ${failed} with problems`);
process.exit(failed ? 1 : 0);
