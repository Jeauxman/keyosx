// The CinéBon-style PUBLICATION AGENT runtime, shared by every brand through profiles. It does not research: it asks ALMANAC (knowledge.mjs)
// for verified, still-active knowledge, decides what its brand publishes, and composes the issue in stages. Each stage is posted to KeyOSX
// as a DRAFT (docs/issue-agent-contract.md); agents cannot publish, the owner approves in the admin console. Artwork comes through the
// verified-identity cover seam in assets.mjs (the FlintBill hand-off point); nothing is generated, so nothing is billed.
import { ROOT, canCompose, issueTitle, loadEntities, loadProfile, parsePeriod } from "./profiles.mjs";
import { createAlmanac } from "./knowledge.mjs";
import { resolveCover } from "./assets.mjs";
import { templateWriter } from "./writers/template.mjs";
import { createLlmWriter } from "./writers/llm.mjs";

export { ROOT };
export const ITEM_KINDS = ["news", "tip", "idea", "app", "opportunity", "other"];

export function chooseWriter(env = process.env) {
  return String(env.ALMANAC_WRITER || "template").toLowerCase() === "llm" ? createLlmWriter(env) : templateWriter;
}

// The content rules from the brief, enforced before anything is posted.
export function validateIssue(items, profile) {
  const problems = [];
  if (!items.length) problems.push("issue has no items");
  if (items.length > 60) problems.push("more than 60 items");
  const featured = items.filter((item) => item.featured).length;
  if (featured !== (profile.issue.featured_count ?? 3)) problems.push(`exactly ${profile.issue.featured_count ?? 3} items must be featured (found ${featured})`);
  for (const item of items) {
    if (!ITEM_KINDS.includes(item.kind)) problems.push(`bad kind: ${item.kind}`);
    if (!item.title || item.title.length > 300) problems.push(`bad title: ${String(item.title).slice(0, 40)}`);
    if (item.url && !/^https?:\/\//.test(item.url)) problems.push(`bad url on: ${item.title}`);
    if (item.kind === "news" && profile.rules.news_needs_source_url && !item.url) problems.push(`news without a source url: ${item.title}`);
    if (item.kind === "app" && profile.rules.app_needs_url && !item.url) problems.push(`app without a url: ${item.title}`);
  }
  return problems;
}

// Almanac records -> the shapes the editor works with: evergreen pool entries and dated, sourced news.
function splitKnowledge(records) {
  const pool = []; const news = [];
  for (const record of records) {
    if (record.kind === "news") news.push({ title: record.title, url: record.url, source: record.source_name, published: record.published_at ? new Date(record.published_at).toISOString() : "" });
    else pool.push({ id: String(record.id), kind: record.kind, title: record.title, summary: record.summary, ...(record.url ? { url: record.url } : {}) });
  }
  news.sort((x, y) => +new Date(y.published) - +new Date(x.published));
  return { pool, news };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function createEngine({ env = process.env, fetchImpl = fetch, writer = chooseWriter(env), log = console.log, almanac = createAlmanac({ env, fetchImpl, log }) } = {}) {
  const origin = () => (env.KEYOSX_ORIGIN || "http://localhost:3000").replace(/\/$/, "");
  const publicOrigin = () => (env.KEYOSX_PUBLIC_ORIGIN || origin()).replace(/\/$/, "");
  const delay = Number(env.ALMANAC_STAGE_DELAY_MS ?? 1000);
  const done = new Map(); // one composition per publication+period+type per process; KeyOSX also requests once per period

  async function post(job, body) {
    const response = await fetchImpl(origin() + (job.callback || "/api/agent/issues"), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + env.AGENT_API_TOKEN },
      body: JSON.stringify({ publication_id: job.publication_id, issue_date: job.issue_date, created_by: "almanac:" + writer.name, ...body }),
    });
    log(`[almanac] ${job.publication_id} ${body.stage}${body.request_id ? " (request " + body.request_id + ")" : ""} -> ${response.status}`);
    if (!response.ok) throw new Error(`KeyOSX rejected the ${body.stage} stage: HTTP ${response.status}`);
  }

  // Can this publication be composed right now? Returns { ok, reason? } so the service can refuse honestly instead of padding.
  function readiness(publicationId) {
    const entities = loadEntities();
    const profile = loadProfile(publicationId, entities);
    if (!profile) return { ok: false, status: 404, reason: "That publication is not on the rack." };
    if (!canCompose(profile, env)) return { ok: false, status: 422, reason: `No editorial sources are configured for ${profile.name}; the Almanac will not invent an issue.` };
    return { ok: true, profile };
  }

  async function composeIssue(job, profile) {
    const period = parsePeriod(job.period_key);
    if (!period) throw new Error("bad period_key: " + job.period_key);
    // Ask Almanac: research happens only if its knowledge for this brand is missing or stale, then verified records are supplied.
    const research = await almanac.refresh(profile);
    const records = await almanac.supply({ brand: profile.id });
    const { pool, news } = splitKnowledge(records);
    const plan = await writer.plan({ profile, period, pool, news });
    const problems = validateIssue(plan.items, profile);
    if (problems.length) throw new Error("writer output broke the content rules: " + problems.join("; "));
    const title = plan.title || issueTitle(period);

    const outline = plan.items.map(({ kind, title: itemTitle, featured }) => ({ kind, title: itemTitle, featured }));
    await post(job, { stage: "outline", title, items: outline });
    await sleep(delay);

    const cover = profile.stages.includes("cover") ? await resolveCover(profile, { publicOrigin: publicOrigin(), aliases: aliasesFor(profile) }) : null;
    if (cover) {
      log(`[almanac] cover for ${profile.name}: ${cover.verified_by} (${cover.source})`);
      await post(job, { stage: "cover", title, cover_url: cover.url, items: outline });
      await sleep(delay);
    } else {
      log(`[almanac] no verified cover for ${profile.name}; posting without one`);
    }
    await post(job, { stage: "items", title, ...(cover ? { cover_url: cover.url } : {}), items: plan.items });
    if (plan.media?.url) { await sleep(delay); await post(job, { stage: "media", title, ...(cover ? { cover_url: cover.url } : {}), media_url: plan.media.url, items: plan.items }); }
    return { title, items: plan.items.length, news: news.length, researched: research.refreshed, cover: cover?.verified_by || null };
  }

  async function answerRequest(job, profile) {
    const { pool } = splitKnowledge(await almanac.supply({ brand: profile.id }));
    const added = await writer.answer({ profile, pool, intent: job.intent, current: job.current_issue });
    if (!added) { log(`[almanac] request ${job.request_id}: nothing in ${profile.name}'s sources fits "${String(job.intent).slice(0, 60)}"`); return { answered: false }; }
    const existing = job.current_issue;
    await post(job, { stage: "items", request_id: job.request_id, title: existing?.title || issueTitle(parsePeriod(job.period_key)), issue_date: existing?.issue_date || job.issue_date, items: [...(existing?.items || []), ...added] });
    return { answered: true, added: added.length };
  }

  // Entry point for a webhook job. Idempotent per publication + period (+ request).
  async function handle(job) {
    const ready = readiness(job.publication_id);
    if (!ready.ok) throw new Error(ready.reason);
    const key = [job.type || "issue_request", job.publication_id, job.period_key, job.request_id || ""].join("|");
    if (done.has(key)) { log(`[almanac] already handled ${key}`); return done.get(key); }
    const result = job.type === "visitor_request" ? await answerRequest(job, ready.profile) : await composeIssue(job, ready.profile);
    done.set(key, result);
    return result;
  }

  return { handle, readiness, composeIssue, writerName: writer.name };
}

// Approved aliases printed on covers (registry.aliases in entities.json), so a cover reading MEDITERRANEO still matches Mediterraneano.
function aliasesFor(profile) {
  const publication = loadEntities().publications.find((entry) => entry.id === profile.id);
  return publication?.aliases || [];
}
