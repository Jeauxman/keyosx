import assert from "node:assert/strict";
import test from "node:test";
import { activeFeeds, canCompose, issueTitle, loadProfile, parsePeriod, seedPool } from "../almanac/profiles.mjs";
import { fetchNews, parseFeed } from "../almanac/sources.mjs";
import { cloudinaryCover, ownerSuppliedCover } from "../almanac/assets.mjs";
import { templateWriter } from "../almanac/writers/template.mjs";
import { CapExceeded, createBudget, createLlmWriter, withFallback } from "../almanac/writers/llm.mjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createEngine, validateIssue } from "../almanac/engine.mjs";
import { createAlmanac } from "../almanac/knowledge.mjs";

const CB = "keyosx:publication:cinebon";
const period = parsePeriod("W2026-11-02");

test("a profile merges defaults, the publication's own file and the entity", () => {
  const profile = loadProfile(CB);
  assert.equal(profile.name, "CinéBon");
  assert.equal(profile.cadence, "weekly");
  assert.equal(profile.issue.featured_count, 3);       // from default.json
  assert.equal(profile.sources.seeds, "cinebon");      // from cinebon.json
  assert.equal(loadProfile("keyosx:publication:nope"), null);
});

test("only publications with real sources can be composed", () => {
  assert.equal(canCompose(loadProfile(CB)), true);
  assert.equal(canCompose(loadProfile("keyosx:publication:noize")), false); // no seeds, no feeds: the engine refuses instead of inventing
});

test("a feed counts only when it is enabled in the profile or switched on for the service", () => {
  const profile = loadProfile(CB);
  assert.equal(activeFeeds(profile, {}).length, 4);                                            // Joe switched CinéBon's four feeds on
  const off = { ...profile, sources: { ...profile.sources, feeds: profile.sources.feeds.map((feed) => ({ ...feed, enabled: false })) } };
  assert.equal(activeFeeds(off, {}).length, 0);                                                 // an disabled feed is skipped
  assert.equal(activeFeeds(off, { ALMANAC_FEEDS: "on" }).length, 4);                            // the service-wide switch still works
});

test("period keys parse and titles read naturally", () => {
  assert.deepEqual(parsePeriod("W2026-11-02"), { cadence: "weekly", start: "2026-11-02" });
  assert.equal(issueTitle(parsePeriod("W2026-11-02")), "Week of 2 Nov 2026");
  assert.equal(issueTitle(parsePeriod("M2026-11")), "November 2026");
  assert.equal(issueTitle(parsePeriod("Q2026-10")), "Q4 2026");
  assert.equal(parsePeriod("nonsense"), null);
});

test("the template writer makes a rule-abiding, deterministic CinéBon issue", async () => {
  const profile = loadProfile(CB);
  const pool = seedPool(profile);
  const a = await templateWriter.plan({ profile, period, pool, news: [] });
  const b = await templateWriter.plan({ profile, period, pool, news: [] });
  assert.deepEqual(a, b);                                              // same period, same issue
  assert.deepEqual(validateIssue(a.items, profile), []);
  assert.equal(a.items.filter((i) => i.featured).length, 3);
  assert.ok(new Set(a.items.filter((i) => i.featured).map((i) => i.kind)).size === 3); // featured picks are different kinds
  assert.ok(a.items.every((i) => i.kind !== "news"));                  // no news without a retrieved source
  const next = await templateWriter.plan({ profile, period: parsePeriod("W2026-11-09"), pool, news: [] });
  assert.notDeepEqual(a.items.map((i) => i.title), next.items.map((i) => i.title)); // the next week differs
});

test("news comes only from retrieved items and carries the source link", async () => {
  const profile = loadProfile(CB);
  const news = [{ title: "A real headline", url: "https://example.org/a", source: "Example", published: "2026-11-03T10:00:00.000Z" }];
  const plan = await templateWriter.plan({ profile, period, pool: seedPool(profile), news });
  const item = plan.items.find((i) => i.kind === "news");
  assert.equal(item.url, "https://example.org/a");
  assert.match(item.summary, /Reported by Example, 2026-11-03/);
  assert.equal(plan.items.find((i) => i.featured).kind, "news");        // news leads the featured picks when present
  assert.deepEqual(validateIssue(plan.items, profile), []);
});

test("validateIssue rejects invented news, linkless apps and the wrong number of featured items", () => {
  const profile = loadProfile(CB);
  const bad = [
    { kind: "news", title: "No link", featured: true },
    { kind: "app", title: "No link either", featured: true },
    { kind: "tip", title: "Fine", featured: false },
  ];
  const problems = validateIssue(bad, profile).join("|");
  assert.match(problems, /news without a source url/);
  assert.match(problems, /app without a url/);
  assert.match(problems, /exactly 3 items must be featured/);
});

test("RSS and Atom are read; undated or stale items are not news", async () => {
  const rss = `<rss><channel><item><title><![CDATA[Fresh &amp; real]]></title><link>https://x.example/1</link><pubDate>Mon, 02 Nov 2026 09:00:00 GMT</pubDate></item>
    <item><title>Old</title><link>https://x.example/2</link><pubDate>Mon, 01 Jan 2024 09:00:00 GMT</pubDate></item>
    <item><title>Undated</title><link>https://x.example/3</link></item></channel></rss>`;
  const atom = `<feed><entry><title>Atom one</title><link href="https://y.example/1"/><updated>2026-11-03T08:00:00Z</updated></entry></feed>`;
  assert.equal(parseFeed(rss).length, 3);
  assert.equal(parseFeed(atom)[0].url, "https://y.example/1");
  const fake = async (url) => ({ ok: true, text: async () => (url.includes("x.example") ? rss : atom) });
  const { items } = await fetchNews([{ name: "X", url: "https://x.example/feed" }, { name: "Y", url: "https://y.example/feed" }], { fetchImpl: fake, now: new Date("2026-11-04T00:00:00Z") });
  assert.deepEqual(items.map((i) => i.title), ["Atom one", "Fresh & real"]);
  const failing = async () => { throw new Error("offline"); };
  const result = await fetchNews([{ name: "Down", url: "https://z.example/feed" }], { fetchImpl: failing });
  assert.deepEqual(result.items, []);
  assert.match(result.warnings[0], /Down: offline/);                    // a dead feed warns, never blocks
});

test("feed headlines decode HTML entities, numeric and named", () => {
  const xml = `<rss><channel><item><title>Watch &#8216;The Greatest&#8217; &amp; more &#x2014; Q&amp;A</title><link>https://x.example/9</link><pubDate>Mon, 02 Nov 2026 09:00:00 GMT</pubDate></item></channel></rss>`;
  assert.equal(parseFeed(xml)[0].title, "Watch ‘The Greatest’ & more — Q&A");
});

test("covers connect by verified identity only", async () => {
  const owner = ownerSuppliedCover(CB, "http://localhost:3000");
  assert.equal(owner.url, "http://localhost:3000/covers/cinebon.webp");
  assert.equal(owner.verified_by, "owner-supplied");
  assert.equal(ownerSuppliedCover("keyosx:publication:synphony-magazine", "http://x"), null); // no supplied cover, so none claimed

  const profile = loadProfile(CB);
  const env = { cloud: "c", key: "k", secret: "s" };
  const asset = (over) => ({ secure_url: "https://res.example/" + over.id, public_id: over.id, created_at: over.at || "2026-01-01", tags: ["kx:pub:cinebon", "kx:type:cover", ...(over.tags || [])], context: { custom: { kx_masthead: over.masthead ?? "CinéBon", kx_confidence: over.conf ?? "high" } } });
  const serve = (resources) => async () => ({ ok: true, json: async () => ({ resources }) });
  const pick = await cloudinaryCover(profile, { ...env, fetchImpl: serve([
    asset({ id: "wrong-masthead", masthead: "THE LIBERTINE" }),
    asset({ id: "low-confidence", conf: "low" }),
    asset({ id: "needs-review", tags: ["kx:status:needs-review"] }),
    asset({ id: "good-old", at: "2026-01-01" }),
    asset({ id: "good-new", at: "2026-06-01" }),
  ]) });
  assert.equal(pick.source, "good-new");                                // wrong masthead, low confidence and review-flagged assets are never used
  assert.equal(await cloudinaryCover(profile, { ...env, fetchImpl: serve([]) }), null);
  assert.equal(await cloudinaryCover(profile, {}), null);               // no credentials: no lookup
});

test("the Claude writer stays off without the approval flag and without a key", () => {
  assert.throws(() => createLlmWriter({}), /disabled/);
  assert.throws(() => createLlmWriter({ ALMANAC_ALLOW_PAID: "yes" }), /ANTHROPIC_API_KEY is not set/);
});

// A stand-in for KeyOSX's agent endpoints: knowledge memory plus the issues callback. Other URLs go to `outside` (feeds, link checks).
function fakeKeyosx(outside = async () => ({ ok: true, status: 200, text: async () => "" })) {
  const store = new Map(); const issues = []; const outsideCalls = []; let nextId = 1;
  const fetchImpl = async (url, options = {}) => {
    if (!url.startsWith("http://k.test")) { outsideCalls.push(url); return outside(url, options); }
    const path = new URL(url).pathname; const query = new URL(url).searchParams;
    const body = options.body ? JSON.parse(options.body) : {};
    const ok = (data, status = 200) => ({ ok: true, status, json: async () => data });
    if (path === "/api/agent/issues") { issues.push({ ...body, auth: options.headers.Authorization }); return ok({ id: 1 }, 201); }
    if (path === "/api/agent/knowledge" && options.method === "POST") {
      const counts = { inserted: 0, changed: 0, unchanged: 0, skipped: 0 };
      for (const record of body.records) {
        const key = body.brand + "|" + (record.url || record.title); const had = store.get(key);
        if (!had) { store.set(key, { ...record, id: nextId++, brand: body.brand, last_checked_at: new Date().toISOString() }); counts.inserted++; }
        else { store.set(key, { ...had, ...record, last_checked_at: new Date().toISOString() }); counts.unchanged++; }
      }
      return ok(counts, 201);
    }
    if (path === "/api/agent/knowledge") {
      let records = [...store.values()].filter((r) => r.brand === query.get("brand"));
      if (query.get("status")) records = records.filter((r) => r.status === query.get("status"));
      if (query.get("verified") === "1") records = records.filter((r) => r.verified);
      return ok({ records });
    }
    if (path === "/api/agent/knowledge/status") { for (const r of store.values()) if (r.id === body.id) r.status = body.status; return ok({ updated: 1 }); }
    throw new Error("unexpected KeyOSX call " + path);
  };
  return { fetchImpl, store, issues, outsideCalls };
}
const ENV = { AGENT_API_TOKEN: "t", KEYOSX_ORIGIN: "http://k.test", ALMANAC_STAGE_DELAY_MS: "0" };
const CINEBON_PROFILE = () => loadProfile(CB);
const FEED_XML = (date) => `<rss><channel><item><title>A real headline</title><link>https://news.example/1</link><pubDate>${date}</pubDate></item></channel></rss>`;

test("Almanac verify: trusted, dated, current news passes; the rest is rejected with a reason", () => {
  const almanac = createAlmanac({ env: ENV, fetchImpl: async () => ({}), log: () => {}, now: () => new Date("2026-11-04T00:00:00Z") });
  const profile = { ...CINEBON_PROFILE(), sources: { feeds: [{ name: "Trusted" }] } };
  const base = { kind: "news", source_type: "feed", source_name: "Trusted", url: "https://n.example/1", published_at: "2026-11-02" };
  const out = almanac.verify([
    { ...base, title: "good" },
    { ...base, title: "no date", url: "https://n.example/2", published_at: "" },
    { ...base, title: "stale", url: "https://n.example/3", published_at: "2026-01-01" },
    { ...base, title: "stranger", url: "https://n.example/4", source_name: "Unlisted" },
    { ...base, title: "no link", url: "" },
    { kind: "tip", title: "evergreen", source_type: "editorial-seed", source_name: "Editorial seed" },
    { kind: "app", title: "linkless app", source_type: "editorial-seed" },
  ], profile);
  assert.deepEqual(out.map((r) => r.verified), [true, false, false, false, false, true, false]);
  assert.match(out[1].verification, /no publication date/);
  assert.match(out[2].verification, /older than the news window/);
  assert.match(out[3].verification, /not on this brand's source list/);
  assert.match(out[0].verification, /supports only that the headline and link exist/);
});

test("Almanac researches only on demand: first request discovers, a fresh one reuses memory, a stale one revisits", async () => {
  const fake = fakeKeyosx(async (url) => ({ ok: true, status: 200, text: async () => FEED_XML("Mon, 02 Nov 2026 09:00:00 GMT") }));
  let clock = new Date("2026-11-04T08:00:00Z");
  const profile = { ...CINEBON_PROFILE(), sources: { ...CINEBON_PROFILE().sources, feeds: [{ name: "Trusted", url: "https://feed.example/rss", enabled: true }] } };
  const almanac = createAlmanac({ env: ENV, fetchImpl: fake.fetchImpl, log: () => {}, now: () => clock });
  const first = await almanac.refresh(profile);
  assert.equal(first.refreshed, true);
  assert.equal(first.saved.inserted, first.verified);
  const feedHits = () => fake.outsideCalls.filter((u) => u === "https://feed.example/rss").length;
  assert.equal(feedHits(), 1);
  clock = new Date("2026-11-04T20:00:00Z");                        // 12 hours later: still fresh, no research, no feed request
  assert.equal((await almanac.refresh(profile)).refreshed, false);
  assert.equal(feedHits(), 1);
  clock = new Date("2026-11-06T09:00:00Z");                        // stale: revisit; nothing new, so the records only get re-checked
  for (const record of fake.store.values()) record.last_checked_at = "2026-11-04T08:00:00.000Z";
  const third = await almanac.refresh(profile);
  assert.equal(third.refreshed, true);
  assert.equal(third.saved.inserted, 0);
  assert.equal(feedHits(), 2);
  const supplied = await almanac.supply({ brand: CB });
  assert.ok(supplied.length > 0 && supplied.every((r) => r.verified && r.status === "active"));
});

test("Almanac update flags a dead link as outdated and stops supplying it", async () => {
  const fake = fakeKeyosx(async (url) => ({ ok: false, status: url.includes("letterboxd") ? 404 : 200, text: async () => "" }));
  const almanac = createAlmanac({ env: ENV, fetchImpl: fake.fetchImpl, log: () => {} });
  await almanac.refresh(CINEBON_PROFILE());
  const profile = CINEBON_PROFILE();
  const result = await almanac.update(profile);
  assert.ok(result.flagged.some((f) => f.title === "Letterboxd" && /no longer reachable/.test(f.reason)));
  const supplied = await almanac.supply({ brand: CB });
  assert.ok(!supplied.some((r) => r.title === "Letterboxd"));
});

test("the CinéBon cycle: Almanac supplies, the agent selects, three draft stages post, nothing publishes", async () => {
  const fake = fakeKeyosx(async () => ({ ok: true, status: 200, text: async () => "" }));
  const engine = createEngine({ env: ENV, fetchImpl: fake.fetchImpl, log: () => {} });
  const job = { type: "issue_request", publication_id: CB, period_key: "W2026-11-02", issue_date: "2026-11-04", callback: "/api/agent/issues" };
  const result = await engine.handle(job);
  assert.deepEqual(fake.issues.map((c) => c.stage), ["outline", "cover", "items"]);
  assert.ok(fake.issues.every((c) => c.auth === "Bearer t" && c.status === undefined && c.is_sample === undefined));
  assert.equal(fake.issues[1].cover_url, "http://k.test/covers/cinebon.webp");
  assert.equal(result.cover, "owner-supplied");
  assert.equal(result.researched, true);
  const final = fake.issues[2];
  assert.equal(final.items.filter((i) => i.featured).length, 3);
  assert.deepEqual(validateIssue(final.items, CINEBON_PROFILE()), []);
  assert.deepEqual(await engine.handle(job), result);               // idempotent per period
  assert.equal(fake.issues.length, 3);

  const answer = await engine.handle({ type: "visitor_request", request_id: 7, publication_id: CB, period_key: "W2026-11-02", issue_date: "2026-11-04", intent: "hosting a silent film night", current_issue: { title: final.title, issue_date: "2026-11-04", items: final.items.slice(0, 2) }, callback: "/api/agent/issues" });
  assert.equal(answer.answered, true);
  const reply = fake.issues.at(-1);
  assert.equal(reply.request_id, 7);
  assert.ok(reply.items.some((i) => /silent film night/i.test(i.title)));
});

test("the engine refuses a publication with no editorial sources instead of padding an issue", () => {
  const engine = createEngine({ env: {}, fetchImpl: async () => ({ ok: true }), log: () => {} });
  const refused = engine.readiness("keyosx:publication:noize");
  assert.equal(refused.ok, false);
  assert.equal(refused.status, 422);
  assert.equal(engine.readiness("keyosx:publication:nope").status, 404);
});

// ---- The capped Claude writer, against a fake Anthropic API (no key, no network, no cost) ----
const stateDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "almanac-spend-"));
const LLM_ENV = (extra = {}) => ({ ALMANAC_ALLOW_PAID: "yes", ANTHROPIC_API_KEY: "sk-test-not-real", ALMANAC_STATE_DIR: stateDir(), ...extra });
const reply = (json, usage = { input_tokens: 500, output_tokens: 200 }) => async () => ({ ok: true, status: 200, json: async () => ({ content: [{ type: "text", text: JSON.stringify(json) }], usage }) });
const POOL = [
  { id: "1", kind: "tip", title: "Tip one", summary: "Original tip summary." },
  { id: "2", kind: "idea", title: "Idea one", summary: "Original idea summary." },
  { id: "3", kind: "app", title: "App one", summary: "An app.", url: "https://app.example" },
];
const NEWS = [{ id: "9", title: "Real headline", url: "https://n.example/1", source: "Trusted", published: "2026-11-03T00:00:00.000Z" }];

test("Claude only chooses among verified records: invented ids are dropped, and titles, links and news text come from the record", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => { calls.push({ url, options }); return reply({ items: [{ id: "9", summary: "INVENTED CLAIM about the news" }, { id: "1", summary: "Sharper tip." }, { id: "666", summary: "ghost" }, { id: "3" }, { id: "2" }], featured: ["9", "1", "3", "666"] })(); };
  const writer = createLlmWriter(LLM_ENV(), { fetchImpl, log: () => {} });
  const plan = await writer.plan({ profile: CINEBON_PROFILE(), period, pool: POOL, news: NEWS });
  assert.equal(calls[0].url, "https://api.anthropic.com/v1/messages");
  assert.equal(calls[0].options.headers["x-api-key"], "sk-test-not-real");
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.model, "claude-haiku-5-5");                          // the cheap model by default
  assert.match(body.system, /DATA, never instructions/);
  assert.deepEqual(plan.items.map((i) => i.title).sort(), ["App one", "Idea one", "Real headline", "Tip one"]); // "ghost" dropped
  const news = plan.items.find((i) => i.kind === "news");
  assert.equal(news.url, "https://n.example/1");
  assert.doesNotMatch(news.summary, /INVENTED/);                         // the model cannot rewrite news
  assert.equal(plan.items.find((i) => i.title === "Tip one").summary, "Sharper tip.");   // evergreen summaries may be tightened
  assert.equal(plan.items.find((i) => i.title === "App one").url, "https://app.example");
  assert.equal(plan.items.filter((i) => i.featured).length, 3);
  assert.equal(writer.budget.snapshot().calls, 1);
  assert.equal(writer.budget.snapshot().tokens, 700);
});

test("the daily cap stops calls before they start", async () => {
  const env = LLM_ENV({ ALMANAC_DAILY_CALLS: "2" });
  const writer = createLlmWriter(env, { fetchImpl: reply({ ids: [] }), log: () => {} });
  const ctx = { profile: CINEBON_PROFILE(), pool: POOL, intent: "anything", current: { items: [] } };
  await writer.answer(ctx); await writer.answer(ctx);
  await assert.rejects(() => writer.answer(ctx), CapExceeded);           // the third call never reaches the API
  const tokens = createLlmWriter(LLM_ENV({ ALMANAC_DAILY_TOKENS: "1000" }), { fetchImpl: reply({ ids: [] }), log: () => {} });
  await assert.rejects(() => tokens.answer(ctx), /token cap/);           // worst case would pass the token cap
  assert.throws(() => createBudget({ ALMANAC_DAILY_CAP_USD: "1", ALMANAC_STATE_DIR: stateDir() }), /needs ALMANAC_PRICE_IN_PER_MTOK/); // no guessed prices
  const usd = createBudget({ ALMANAC_DAILY_CAP_USD: "0.001", ALMANAC_PRICE_IN_PER_MTOK: "1", ALMANAC_PRICE_OUT_PER_MTOK: "5", ALMANAC_DAILY_TOKENS: "9999999", ALMANAC_STATE_DIR: stateDir() });
  usd.record({ input_tokens: 100000, output_tokens: 100000 });           // 0.1 + 0.5 = $0.60
  assert.equal(usd.snapshot().usd, 0.6);
  assert.throws(() => usd.check(100), /spend cap/);
});

test("the cap resets each UTC day and survives a restart", () => {
  const env = { ALMANAC_DAILY_CALLS: "1", ALMANAC_STATE_DIR: stateDir() };
  let day = new Date("2026-11-04T10:00:00Z");
  const first = createBudget(env, () => day);
  first.record({ input_tokens: 1, output_tokens: 1 });
  assert.throws(() => createBudget(env, () => day).check(10), /call cap/);   // a fresh process still sees today's spend
  day = new Date("2026-11-05T00:01:00Z");
  assert.doesNotThrow(() => createBudget(env, () => day).check(10));
});

test("any Claude problem falls back to the free writer and the issue still posts", async () => {
  const logs = [];
  const free = { name: "template", async plan() { return { title: "free", items: [{ kind: "tip", title: "free", featured: true }] }; }, async answer() { return null; } };
  const wrap = (fetchImpl, env = LLM_ENV()) => withFallback(createLlmWriter(env, { fetchImpl, log: () => {} }), free, { log: (m) => logs.push(m), validate: (items, profile) => validateIssue(items, profile) });
  const ctx = { profile: CINEBON_PROFILE(), period, pool: POOL, news: NEWS };
  assert.equal((await wrap(async () => ({ ok: false, status: 529 })).plan(ctx)).title, "free");                  // API down
  assert.equal((await wrap(reply({ items: [{ id: "1" }], featured: ["1"] })).plan(ctx)).title, "free");          // breaks the 3-featured rule
  assert.equal((await wrap(async () => ({ ok: true, json: async () => ({ content: [{ text: "no json here" }] }) })).plan(ctx)).title, "free");
  const capped = wrap(reply({ items: [], featured: [] }), LLM_ENV({ ALMANAC_DAILY_CALLS: "0" }));
  assert.equal((await capped.plan(ctx)).title, "free");                  // over the cap
  assert.ok(logs.every((m) => !/sk-test-not-real/.test(m)));             // the key is never logged
  assert.ok(logs.some((m) => /using the free writer/.test(m)));
});

test("the CinéBon cycle with the Claude writer: Almanac supplies, Claude chooses, validated drafts post, spend is counted", async () => {
  const stateDirPath = stateDir();
  const anthropic = async (url, options) => {
    const user = JSON.parse(JSON.parse(options.body).messages[0].content);
    const ids = (kind) => user.candidates.filter((c) => c.kind === kind).map((c) => c.id);
    const chosen = [...ids("tip").slice(0, 2), ...ids("idea").slice(0, 2), ...ids("app").slice(0, 2), ...ids("opportunity").slice(0, 1)];
    return { ok: true, status: 200, json: async () => ({ content: [{ type: "text", text: JSON.stringify({ items: chosen.map((id) => ({ id })), featured: [chosen[0], chosen[2], chosen[4]] }) }], usage: { input_tokens: 1800, output_tokens: 300 } }) };
  };
  const fake = fakeKeyosx(async (url, options) => (url.startsWith("https://api.anthropic.com") ? anthropic(url, options) : { ok: true, status: 200, text: async () => "" }));
  const engine = createEngine({ env: { ...ENV, ALMANAC_WRITER: "llm", ALMANAC_ALLOW_PAID: "yes", ANTHROPIC_API_KEY: "sk-test-not-real", ALMANAC_STATE_DIR: stateDirPath }, fetchImpl: fake.fetchImpl, log: () => {} });
  const result = await engine.handle({ type: "issue_request", publication_id: CB, period_key: "W2026-11-09", issue_date: "2026-11-10", callback: "/api/agent/issues" });
  assert.equal(engine.writerName, "claude:claude-haiku-5-5");
  assert.deepEqual(fake.issues.map((c) => c.stage), ["outline", "cover", "items"]);
  const final = fake.issues[2];
  assert.equal(final.items.length, 7);
  assert.deepEqual(validateIssue(final.items, CINEBON_PROFILE()), []);
  assert.equal(engine.spend().calls, 1);
  assert.equal(engine.spend().tokens, 2100);
  assert.ok(result.items === 7);
});

test("in-process mode sends covers as site paths, so no host name is ever needed or trusted", async () => {
  const fake = fakeKeyosx(async () => ({ ok: true, status: 200, text: async () => "" }));
  const engine = createEngine({ env: { ...ENV, KEYOSX_PUBLIC_ORIGIN: "relative" }, fetchImpl: fake.fetchImpl, log: () => {} });
  await engine.handle({ type: "issue_request", publication_id: CB, period_key: "W2026-11-16", issue_date: "2026-11-17", callback: "/api/agent/issues" });
  assert.equal(fake.issues[1].cover_url, "/covers/cinebon.webp");
});
