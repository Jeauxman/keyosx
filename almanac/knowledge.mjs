// ALMANAC, the shared knowledge engine. It knows and researches; it does not decide what a brand publishes.
// Six jobs: discover, verify, organize, remember, update, supply. Memory lives in KeyOSX's one database (knowledge_records, via the
// agent endpoints); this module holds no state of its own.
//
// Principles (Joe, 2026-11-04):
//   Truthfulness  research stays connected to verifiable sources: no source, no news.
//   Continuity    what it finds is remembered with its source, date and verification notes.
//   Control       it prepares knowledge; it never publishes and never acts outside KeyOSX. Owner approval gates anything public.
// Cost control: it does NOT poll on a timer. It refreshes only when a brand's knowledge is requested and is stale (profile
// knowledge.refresh_hours, default 24), and a refresh that finds nothing new only touches last_checked_at.
import { activeFeeds, seedPool } from "./profiles.mjs";
import { fetchNews } from "./sources.mjs";

const day = (iso) => String(iso || "").slice(0, 10);

export function createAlmanac({ env = process.env, fetchImpl = fetch, log = console.log, now = () => new Date() } = {}) {
  const origin = () => (env.KEYOSX_ORIGIN || "http://localhost:3000").replace(/\/$/, "");
  const headers = () => ({ "Content-Type": "application/json", Authorization: "Bearer " + env.AGENT_API_TOKEN });

  async function api(path, options = {}) {
    const response = await fetchImpl(origin() + path, { ...options, headers: { ...headers(), ...(options.headers || {}) } });
    if (!response.ok) throw new Error(`KeyOSX knowledge API ${path} -> HTTP ${response.status}`);
    return response.json();
  }

  // 1. DISCOVER: gather candidates for one brand from its profile. Editorial seeds are evergreen; feeds yield dated news.
  async function discover(profile) {
    const candidates = seedPool(profile).map((seed) => ({
      kind: seed.kind, title: seed.title, summary: seed.summary, url: seed.url || "", topics: seed.tags || [seed.kind],
      source_name: "Editorial seed", source_type: "editorial-seed",
    }));
    const feeds = activeFeeds(profile, env);
    let warnings = [];
    if (feeds.length) {
      const found = await fetchNews(feeds, { fetchImpl, now: now(), maxAgeDays: profile.issue.news_max_age_days });
      warnings = found.warnings;
      for (const entry of found.items) {
        candidates.push({ kind: "news", title: entry.title, summary: `Reported by ${entry.source}, ${day(entry.published)}. Open the source for the full story.`, url: entry.url, published_at: day(entry.published), topics: ["news"], source_name: entry.source, source_type: "feed" });
      }
    }
    return { candidates, warnings };
  }

  // 2. VERIFY: check source, date and credibility. `verified` only ever means what the notes say it means.
  function verify(candidates, profile) {
    const trusted = new Set((profile.sources?.feeds || []).map((feed) => feed.name));
    const maxAge = (profile.issue.news_max_age_days ?? 21) * 86400000;
    const seen = new Set();
    return candidates.map((candidate) => {
      const notes = [];
      let verified = true;
      const fail = (why) => { verified = false; notes.push(why); };
      if (candidate.url && !/^https?:\/\//.test(candidate.url)) fail("link is not http(s)");
      const key = candidate.url || candidate.title;
      if (seen.has(key)) fail("duplicate of another record"); else seen.add(key);
      if (candidate.kind === "news") {
        if (!candidate.url) fail("news has no source link");
        if (candidate.source_type !== "feed" || !trusted.has(candidate.source_name)) fail("source is not on this brand's source list");
        if (!candidate.published_at) fail("news has no publication date");
        else if (+now() - +new Date(candidate.published_at) > maxAge) fail("older than the news window");
        if (verified) notes.push(`source: ${candidate.source_name}`, `dated ${candidate.published_at}`, "supports only that the headline and link exist at that source; the story itself is not summarized");
      } else if (candidate.kind === "app" && !candidate.url) {
        fail("app has no link");
      } else if (verified) {
        notes.push(candidate.source_type === "editorial-seed" ? "editorial evergreen; makes no claim about current events" : "editorial");
      }
      return { ...candidate, verified, verification: notes.join("; "), status: verified ? "active" : "rejected" };
    });
  }

  // 3. ORGANIZE: categorize by brand, topic and kind.
  function organize(records, profile) {
    return records.map((record) => ({ ...record, topics: [...new Set([profile.slug, record.kind, ...(record.topics || [])])] }));
  }

  // 4. REMEMBER: persist with source and verification notes.
  async function remember(profile, records) {
    return api("/api/agent/knowledge", { method: "POST", body: JSON.stringify({ brand: profile.id, records }) });
  }

  // 5. UPDATE: revisit time-sensitive or linked records, flag the outdated. Checks links by a light request; no content is copied.
  async function update(profile, { linkCheck = true } = {}) {
    const { records } = await api(`/api/agent/knowledge?brand=${encodeURIComponent(profile.id)}&status=active`);
    const maxAge = (profile.issue.news_max_age_days ?? 21) * 86400000;
    const flagged = [];
    for (const record of records) {
      let outdated = "";
      if (record.kind === "news" && record.published_at && +now() - +new Date(record.published_at) > maxAge) outdated = "older than the news window";
      else if (linkCheck && record.url && !(await reachable(record.url))) outdated = "link no longer reachable";
      if (outdated) {
        await api("/api/agent/knowledge/status", { method: "POST", body: JSON.stringify({ id: record.id, status: "outdated", note: `${day(now().toISOString())}: ${outdated}` }) });
        flagged.push({ id: record.id, title: record.title, reason: outdated });
      }
    }
    return { checked: records.length, flagged };
  }

  // Only a clear 404/410, or a network failure on both methods, marks a link dead. 403/405/429 and the like are "unknown", so the record stays.
  async function reachable(url) {
    let threw = 0;
    for (const method of ["HEAD", "GET"]) {
      try {
        const response = await fetchImpl(url, { method, redirect: "follow", headers: { "User-Agent": "KeyOSX-Almanac/0.1 (link check)" }, signal: AbortSignal.timeout(8000) });
        if (response.status === 404 || response.status === 410) return false;
        if (response.status < 400) return true;
      } catch { threw++; }
    }
    return threw < 2;
  }

  // 6. SUPPLY: structured, verified, still-active knowledge for a brand, for publications, Jack Rabbit or other agents.
  async function supply({ brand, kinds, limit = 100 }) {
    const query = new URLSearchParams({ brand, status: "active", verified: "1", limit: String(limit), ...(kinds?.length ? { kinds: kinds.join(",") } : {}) });
    return (await api("/api/agent/knowledge?" + query)).records;
  }

  // Refresh on demand only: when nothing is remembered yet or what is remembered is stale.
  async function refresh(profile, { force = false } = {}) {
    const hours = profile.knowledge?.refresh_hours ?? 24;
    const current = await api(`/api/agent/knowledge?brand=${encodeURIComponent(profile.id)}&status=`);
    const newest = current.records.reduce((latest, record) => Math.max(latest, +new Date(record.last_checked_at)), 0);
    if (!force && current.records.length && +now() - newest < hours * 3600000) {
      log(`[almanac] ${profile.slug}: knowledge is fresh (${current.records.length} records); no research needed`);
      return { refreshed: false, records: current.records.length };
    }
    const { candidates, warnings } = await discover(profile);
    for (const warning of warnings) log(`[almanac] feed skipped: ${warning}`);
    const verified = verify(candidates, profile);
    const saved = await remember(profile, organize(verified, profile));
    const revisited = current.records.length ? await update(profile) : { checked: 0, flagged: [] };
    log(`[almanac] ${profile.slug}: discovered ${candidates.length}, verified ${verified.filter((r) => r.verified).length}, saved ${JSON.stringify(saved)}, outdated ${revisited.flagged.length}`);
    return { refreshed: true, discovered: candidates.length, verified: verified.filter((r) => r.verified).length, saved, outdated: revisited.flagged.length, warnings };
  }

  return { discover, verify, organize, remember, update, supply, refresh };
}
