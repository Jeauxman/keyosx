import crypto from "node:crypto";
import fs from "node:fs";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ARTIFACT_TYPES,
  RELATION_TYPES,
  TIMELINE_EVENT_TYPES,
  WORK_KINDS,
  WORK_STATUSES,
  WORK_VISIBILITIES,
  createArtifact,
  createRelationship,
  createTimelineEvent,
  createWork,
  deleteArtifact,
  deleteRelationship,
  deleteTimelineEvent,
  deleteWork,
  getArtifact,
  getDatabaseSummary,
  getSettings,
  getWork,
  getWorkDetail,
  getIssueItems,
  claimComposition,
  listKnowledge,
  saveKnowledge,
  setKnowledgeStatus,
  createAgentRequest,
  getAgentRequest,
  listAgentRequests,
  setAgentRequestStatus,
  discardDraftIssue,
  getIssueRevisions,
  getRequestState,
  issuePeriod,
  listPendingIssues,
  publishIssue,
  setRequestStatus,
  latestIssueByPublication,
  listIssues,
  upsertIssue,
  listArtifacts,
  listRelationships,
  listTimeline,
  listWorks,
  openDatabase,
  seedDatabase,
  updateArtifact,
  updateRelationship,
  updateWork,
} from "./db.mjs";
import { askJackRabbit } from "./assistant.mjs";
import { currentCover } from "./coverplan.mjs";
import { DEPTH_OPTIONS, KIND_OPTIONS, QUESTIONS, buildPath, overlap, pickAd, wordsOf } from "./pathmaker.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === "production";
const adminPassword = process.env.ADMIN_PASSWORD || (isProduction ? "" : "keyosx-local-admin");
const sessionSecret = process.env.ADMIN_SESSION_SECRET || (isProduction ? "" : "keyosx-local-session-secret-change-before-production");

if (!adminPassword || !sessionSecret) {
  throw new Error("ADMIN_PASSWORD and ADMIN_SESSION_SECRET must be set when NODE_ENV=production.");
}
if (!process.env.ADMIN_PASSWORD) {
  console.warn("[KeyOSX] Development administrator password is active. Set ADMIN_PASSWORD before public deployment.");
}

app.disable("x-powered-by");
// Behind a host's reverse proxy req.ip is the proxy, so every visitor would share one rate-limit bucket. In production trust one proxy hop
// (override with TRUST_PROXY=<hops>, or 0 to turn off).
const trustHops = Number(process.env.TRUST_PROXY ?? (isProduction ? 1 : 0));
if (trustHops > 0) app.set("trust proxy", trustHops);
app.use(express.json({ limit: "1mb" }));
// No long-lived cache on static assets yet: the site is still in active development and
// browsers/CDNs holding a stale app.js or styles.css after a deploy has caused confusing
// "the site didn't update" moments. Revisit once the public/ files carry a cache-busting
// version in their names or query string.
app.use(express.static(path.join(__dirname, "public"), {
  index: "index.html",
  maxAge: 0,
  setHeaders: (res) => res.setHeader("Cache-Control", "no-store"),
}));

function parseCookies(header = "") {
  return Object.fromEntries(header.split(";").map((pair) => {
    const index = pair.indexOf("=");
    if (index < 0) return [pair.trim(), ""];
    return [pair.slice(0, index).trim(), decodeURIComponent(pair.slice(index + 1).trim())];
  }).filter(([key]) => key));
}

function sign(value) {
  return crypto.createHmac("sha256", sessionSecret).update(value).digest("base64url");
}

function createSession() {
  const payload = Buffer.from(JSON.stringify({ role: "admin", exp: Date.now() + (1000 * 60 * 60 * 12) })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function validSession(token) {
  if (!token || !token.includes(".")) return false;
  const [payload, signature] = token.split(".");
  const expected = sign(payload);
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return false;
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return decoded.role === "admin" && Number(decoded.exp) > Date.now();
  } catch {
    return false;
  }
}

function isAdmin(req) {
  return validSession(parseCookies(req.headers.cookie).keyosx_admin);
}

function requireAdmin(req, res, next) {
  if (!isAdmin(req)) return res.status(401).json({ error: "Administrator sign-in is required." });
  next();
}

function sendError(res, error, status = 400) {
  const message = error instanceof Error ? error.message : "Unable to complete that request.";
  res.status(status).json({ error: message });
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

async function databaseExport(db) {
  return {
    exportVersion: 1,
    exportedAt: new Date().toISOString(),
    summary: await getDatabaseSummary(db),
    settings: await getSettings(db),
    works: await listWorks(db, { includeUnpublished: true, limit: 1000 }),
    artifacts: await listArtifacts(db, { includeUnpublished: true }),
    relationships: await listRelationships(db),
    timeline: await listTimeline(db, { limit: 500 }),
  };
}

async function main() {
  // ALMANAC_INLINE=on runs the shared Almanac inside this one Node app (one hosted app instead of two). It answers the same webhook at
  // /api/almanac/webhook and defaults the URLs to this app's own loopback address.
  const almanacInline = String(process.env.ALMANAC_INLINE || "").toLowerCase() === "on";
  let inlineEngine = null; // set below when ALMANAC_INLINE=on: the Almanac is called in-process, never over the network
  if (almanacInline) {
    process.env.KEYOSX_ORIGIN ||= `http://127.0.0.1:${port}`;
    process.env.ISSUE_GENERATOR_URL ||= `http://127.0.0.1:${port}/api/almanac/webhook`;
  }
  const db = await openDatabase();
  const seedResult = await seedDatabase(db);
  if (seedResult.seeded) console.log("[KeyOSX] Catalog seeded:", seedResult);

  app.get("/api/health", asyncRoute(async (_req, res) => {
    res.json({ ok: true, service: "KeyOSX", summary: await getDatabaseSummary(db) });
  }));

  app.get("/api/config", asyncRoute(async (_req, res) => {
    const settings = await getSettings(db);
    const all = await listWorks(db, { includeUnpublished: false, limit: 1000 });
    const categories = [...new Set(all.map((work) => work.category).filter(Boolean))].sort();
    res.json({
      brandName: settings.brandName || "KeyOSX",
      brandTagline: settings.brandTagline || "The master living kiosk for every work Joe has built, is building, or is planning.",
      guideName: settings.guideName || "Jack Rabbit",
      kinds: WORK_KINDS,
      statuses: WORK_STATUSES,
      categories,
      counts: {
        total: all.length,
        old: all.filter((work) => work.status === "old").length,
        current: all.filter((work) => work.status === "current").length,
        future: all.filter((work) => work.status === "future").length,
      },
    });
  }));

  const CLOUDINARY_BASE = "https://res.cloudinary.com/dmsdspzbo/image/upload/";
  const entities = JSON.parse(fs.readFileSync(path.join(__dirname, "data", "entities.json"), "utf8"));
  app.get("/api/entities", asyncRoute(async (req, res) => {
    const published = await listWorks(db, { includeUnpublished: false, limit: 1000 });
    const idBySlug = new Map(published.map((work) => [work.slug, work.id]));
    const link = (entity) => ({ ...entity, work_id: entity.workSlug ? idBySlug.get(entity.workSlug) ?? null : null });
    const latest = await latestIssueByPublication(db);
    const publications = entities.publications.map((publication) => {
      const live = latest.get(publication.id);
      const shelf = publication.issues.map((issue) => ({ title: issue.title, status: issue.status || "proposed", image_url: String(issue.image).startsWith("/") ? issue.image : CLOUDINARY_BASE + "f_auto,q_auto,w_480/" + issue.image }));
      // This month's owner-approved cover (data/covers.json, released on the 1st) leads the shelf.
      const monthly = currentCover(publication.id);
      if (monthly) shelf.unshift({ title: `${monthly.period} cover`, status: "released", image_url: monthly.url });
      // A posted issue from the editorial agent always leads the shelf as the current cover.
      const issues = live && live.cover_url ? [{ title: live.title, status: "published", image_url: live.cover_url, issue_id: live.id, issue_date: live.issue_date, is_sample: !!live.is_sample }, ...shelf] : shelf;
      return { ...link(publication), issues, current_issue_id: live?.id ?? null };
    });
    const type = String(req.query.type || "");
    res.json({
      publications: type && type !== "publication" ? [] : publications,
      agents: type && type !== "agent" ? [] : entities.agents.map(link),
    });
  }));

  const generatorUrl = process.env.ISSUE_GENERATOR_URL || "";
  const agentToken = process.env.AGENT_API_TOKEN || "";
  const knownPublication = (id) => entities.publications.find((publication) => publication.id === id);

  // The visitor opens a cover: latest published issue (with its opportunity list) plus the back-issue archive.
  app.get("/api/publications/:id/issues", asyncRoute(async (req, res) => {
    const publication = knownPublication(req.params.id);
    if (!publication) return res.status(404).json({ error: "That publication is not on the rack." });
    const issues = await listIssues(db, publication.id);
    // Viewing is read-only. Interest is recorded only by the explicit POST .../observe below.
    const period = issuePeriod(publication.cadence);
    const fresh = !!issues[0] && issues[0].issue_date >= period.start;
    const composing = !fresh;
    const request = await getRequestState(db, publication.id, period.key);
    const requested = Number(req.query.issue) || issues[0]?.id;
    const current = issues.find((issue) => issue.id === requested) || null;
    res.json({
      publication: { id: publication.id, name: publication.name, tagline: publication.tagline, beat: publication.beat || "", cadence: publication.cadence || "", beat_status: publication.beat_status || "inferred" },
      fresh, composing, generator_configured: !!generatorUrl, period: period.key,
      request_status: request?.status ?? null,
      current: current ? { ...current, items: await getIssueItems(db, current.id, current.published_revision) } : null,
      archive: issues.map(({ id, title, issue_date, cover_url, is_sample, stage }) => ({ id, title, issue_date, cover_url, is_sample, stage })),
    });
  }));

  async function dispatchComposition(publication, period) {
    if (inlineEngine) {
      const job = { type: "issue_request", publication_id: publication.id, name: publication.name, beat: publication.beat, cadence: publication.cadence, period_key: period.key, issue_date: new Date().toISOString().slice(0, 10), callback: "/api/agent/issues" };
      const ready = inlineEngine.readiness(publication.id);
      if (!ready.ok) { await setRequestStatus(db, publication.id, period.key, "failed", ready.reason).catch(() => {}); return; }
      await setRequestStatus(db, publication.id, period.key, "running", "", "queued").catch(() => {});
      inlineEngine.handle(job).catch(async (error) => { console.error("[almanac] job failed:", error.message); await setRequestStatus(db, publication.id, period.key, "failed", error.message).catch(() => {}); });
      return;
    }
    try {
      const response = await fetch(generatorUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(agentToken ? { Authorization: "Bearer " + agentToken } : {}) },
        body: JSON.stringify({ type: "issue_request", publication_id: publication.id, name: publication.name, beat: publication.beat, cadence: publication.cadence, period_key: period.key, issue_date: new Date().toISOString().slice(0, 10), callback: "/api/agent/issues" }),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error("agent returned HTTP " + response.status);
      await setRequestStatus(db, publication.id, period.key, "running", "", "queued");
    } catch (error) {
      console.error("[KeyOSX] issue generator call failed:", error.message);
      await setRequestStatus(db, publication.id, period.key, "failed", error.message).catch(() => {});
    }
  }

  // ---- Jack Rabbit routing: find the publication (entity) whose genre fits what the visitor said. ----
  // Answers come ONLY from approved, published issue items. Nothing is generated here.

  const actionHits = new Map();
  const allowAction = (req, bucket, max) => {
    const key = bucket + ":" + req.ip;
    const nowMs = Date.now();
    const hits = (actionHits.get(key) || []).filter((t) => nowMs - t < 60000);
    if (hits.length >= max) return false;
    hits.push(nowMs);
    actionHits.set(key, hits);
    if (actionHits.size > 5000) actionHits.clear();
    return true;
  };

  app.post("/api/jack/route", asyncRoute(async (req, res) => {
    if (!req.is("application/json")) return res.status(415).json({ error: "JSON required." });
    if (!allowAction(req, "route", 20)) return res.status(429).json({ error: "Too many requests. Try again shortly." });
    const message = String(req.body?.message || "").slice(0, 300);
    const wanted = [...new Set(wordsOf(message))];
    if (!wanted.length) return res.json({ matches: [], items: [] });
    const ranked = entities.publications
      .map((publication) => ({ publication, score: overlap(wanted, `${publication.name} ${publication.beat || ""} ${publication.tagline || ""}`) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
    const latest = await latestIssueByPublication(db);
    const items = [];
    for (const { publication } of ranked) {
      const issue = latest.get(publication.id);
      if (!issue) continue;
      const published = await getIssueItems(db, issue.id, issue.published_revision);
      const scored = published.map((item) => ({ item, score: overlap(wanted, `${item.title} ${item.summary || ""}`) }));
      const best = scored.filter((entry) => entry.score > 0).sort((a, b) => b.score - a.score).slice(0, 3);
      for (const { item } of (best.length ? best : scored.filter((entry) => entry.item.featured).slice(0, 2))) {
        items.push({ id: item.id, kind: item.kind, title: item.title, publication_id: publication.id, publication_name: publication.name, issue_id: issue.id });
      }
    }
    res.json({
      matches: ranked.map(({ publication, score }) => ({ id: publication.id, name: publication.name, beat: publication.beat, score })),
      items: items.slice(0, 6),
    });
  }));

  // ---- Live feed: verified headlines Almanac remembers for a brand. Shown publicly ONLY for brands the owner lists in data/live-feed.json
  // (LIVE_FEED=on shows it for every brand on a local copy). Title, source, date and link only; the link goes to the original source. ----
  const livePublic = () => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, "data", "live-feed.json"), "utf8")).public || []; } catch { return []; } };
  const liveEnabled = (id) => String(process.env.LIVE_FEED || "").toLowerCase() === "on" || livePublic().includes(id);
  async function liveHeadlines(brandId, limit = 12) {
    const publication = knownPublication(brandId);
    const rows = await listKnowledge(db, { brand: brandId, status: "active", verified: true, kinds: ["news"], limit });
    return {
      items: rows.map((row) => ({ title: row.title, url: row.url, source: row.source_name, date: String(row.published_at || "").slice(0, 10), publication_id: brandId, publication_name: publication?.name || "" })),
      updated: rows.reduce((latest, row) => (String(row.last_checked_at) > latest ? String(row.last_checked_at) : latest), ""),
    };
  }
  app.get("/api/publications/:id/live", asyncRoute(async (req, res) => {
    if (!knownPublication(req.params.id)) return res.status(404).json({ error: "That publication is not on the rack." });
    if (!liveEnabled(req.params.id)) return res.json({ enabled: false, items: [], updated: "" });
    res.json({ enabled: true, ...(await liveHeadlines(req.params.id)) });
  }));

  // ---- Media page: the cover stories (each brand's featured items, approved only) and, where enabled, the live feed. ----
  app.get("/api/media", asyncRoute(async (req, res) => {
    const latest = await latestIssueByPublication(db);
    const brands = []; const stories = []; const live = []; let updated = ""; let anyLive = false;
    for (const publication of entities.publications) {
      const issue = latest.get(publication.id);
      const monthly = currentCover(publication.id);
      const shelfImage = publication.issues[0]?.image;
      const cover_url = issue?.cover_url || monthly?.url || (shelfImage ? (String(shelfImage).startsWith("/") ? shelfImage : CLOUDINARY_BASE + "f_auto,q_auto,w_480/" + shelfImage) : "");
      const items = issue ? await getIssueItems(db, issue.id, issue.published_revision) : [];
      for (const item of items.filter((entry) => entry.featured)) {
        const reported = /Reported by (.+?), (\d{4}-\d{2}-\d{2})/.exec(item.summary || "");
        stories.push({ kind: item.kind, title: item.title, url: item.url || "", source: reported?.[1] || "", date: reported?.[2] || String(issue.issue_date || "").slice(0, 10), publication_id: publication.id, publication_name: publication.name, issue_id: issue.id });
      }
      brands.push({ id: publication.id, name: publication.name, series: publication.series || "", cover_url, issue: issue ? { id: issue.id, title: issue.title, issue_date: issue.issue_date } : null,
        items: items.slice().sort((a, b) => Number(b.featured) - Number(a.featured)).slice(0, 4).map(({ kind, title, url }) => ({ kind, title, url })) });
      if (liveEnabled(publication.id)) {
        anyLive = true;
        const found = await liveHeadlines(publication.id, 8);
        live.push(...found.items);
        if (found.updated > updated) updated = found.updated;
      }
    }
    // The cover's main stories lead; news first, newest first.
    stories.sort((a, b) => (a.kind === "news" ? 0 : 1) - (b.kind === "news" ? 0 : 1) || String(b.date).localeCompare(String(a.date)));
    live.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    brands.sort((a, b) => Number(!!b.issue) - Number(!!a.issue));
    res.json({ ad: adFor([], "media"), cover_stories: stories.slice(0, 12), live: { enabled: anyLive, items: live.slice(0, 20), updated }, brands });
  }));

  // ---- The ad slot: one labeled ad, shown first. Owner-approved ads only (ADS_PREVIEW=on shows unapproved ads on a local copy). ----
  const readAds = () => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, "data", "ads.json"), "utf8")).ads || []; } catch { return []; } };
  const adFor = (publicationIds, context) => pickAd(readAds(), { publicationIds, context, preview: String(process.env.ADS_PREVIEW || "").toLowerCase() === "on" });
  app.get("/api/ads/next", asyncRoute(async (req, res) => {
    const id = String(req.query.publication || "");
    res.json({ ad: adFor(id && knownPublication(id) ? [id] : [], String(req.query.context || "issue").slice(0, 20)) });
  }));

  // ---- Jack Rabbit, path maker: ask (at most two quick questions), then deliver a path of APPROVED items, ad first. ----
  app.post("/api/jack/path", asyncRoute(async (req, res) => {
    if (!req.is("application/json")) return res.status(415).json({ error: "JSON required." });
    if (!allowAction(req, "path", 20)) return res.status(429).json({ error: "Too many requests. Try again shortly." });
    const message = String(req.body?.message || "").slice(0, 300);
    const wanted = [...new Set(wordsOf(message))];
    const answers = req.body?.answers && typeof req.body.answers === "object" ? {
      kinds: (Array.isArray(req.body.answers.kinds) ? req.body.answers.kinds : []).filter((id) => KIND_OPTIONS.some((option) => option.id === id)),
      depth: DEPTH_OPTIONS.some((option) => option.id === req.body.answers.depth) ? req.body.answers.depth : "quick",
    } : null;
    if (!answers && !req.body?.skip) return res.json({ stage: "ask", questions: QUESTIONS });

    // Which brands fit what was said? (all of them when nothing specific was said)
    const ranked = entities.publications
      .map((publication) => ({ publication, score: overlap(wanted, `${publication.name} ${publication.beat || ""} ${publication.tagline || ""}`) }))
      .filter((entry) => !wanted.length || entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, wanted.length ? 4 : entities.publications.length);
    const latest = await latestIssueByPublication(db);
    const candidates = [];
    for (const { publication } of ranked) {
      const issue = latest.get(publication.id);
      if (!issue) continue;
      for (const item of await getIssueItems(db, issue.id, issue.published_revision)) candidates.push({ item, publication: { id: publication.id, name: publication.name }, issue_id: issue.id });
    }
    const { steps, short } = buildPath({ wanted, answers: answers || {}, candidates });
    const gapPublication = ranked[0]?.publication || null;
    res.json({
      stage: "path",
      intent: message,
      ad: adFor(steps.map((step) => step.publication_id).filter((id, i, all) => all.indexOf(id) === i), "path"),
      steps,
      gap: short && gapPublication && wanted.length ? { publication_id: gapPublication.id, publication_name: gapPublication.name, intent: message } : null,
    });
  }));

  // The visitor asks a publication's editor to cover something. Recorded, sent to the agent, answered as a DRAFT revision.
  async function dispatchVisitorRequest(requestId, publication, intent) {
    const period = issuePeriod(publication.cadence);
    const issues = await listIssues(db, publication.id);
    const live = issues[0] && issues[0].issue_date >= period.start ? issues[0] : null;
    const current_issue = live ? { title: live.title, issue_date: live.issue_date, items: (await getIssueItems(db, live.id, live.published_revision)).map(({ kind, title, summary, url, featured }) => ({ kind, title, summary, url, featured: !!featured })) } : null;
    if (inlineEngine) {
      const job = { type: "visitor_request", request_id: requestId, from: "keyosx:agent:jack-rabbit", publication_id: publication.id, name: publication.name, beat: publication.beat, cadence: publication.cadence, period_key: period.key, issue_date: new Date().toISOString().slice(0, 10), intent, current_issue, callback: "/api/agent/issues" };
      const ready = inlineEngine.readiness(publication.id);
      if (!ready.ok) { await setAgentRequestStatus(db, requestId, "failed", { error: ready.reason }).catch(() => {}); return; }
      await setAgentRequestStatus(db, requestId, "sent", { onlyFrom: "queued" }).catch(() => {});
      inlineEngine.handle(job).catch(async (error) => { console.error("[almanac] request failed:", error.message); await setAgentRequestStatus(db, requestId, "failed", { error: error.message }).catch(() => {}); });
      return;
    }
    try {
      const response = await fetch(generatorUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(agentToken ? { Authorization: "Bearer " + agentToken } : {}) },
        body: JSON.stringify({ type: "visitor_request", request_id: requestId, from: "keyosx:agent:jack-rabbit", publication_id: publication.id, name: publication.name, beat: publication.beat, cadence: publication.cadence, period_key: period.key, issue_date: new Date().toISOString().slice(0, 10), intent, current_issue, callback: "/api/agent/issues" }),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error("agent returned HTTP " + response.status);
      await setAgentRequestStatus(db, requestId, "sent", { onlyFrom: "queued" });
    } catch (error) {
      console.error("[KeyOSX] visitor request dispatch failed:", error.message);
      await setAgentRequestStatus(db, requestId, "failed", { error: error.message }).catch(() => {});
    }
  }

  app.post("/api/agent-requests", asyncRoute(async (req, res) => {
    if (!req.is("application/json")) return res.status(415).json({ error: "JSON required." });
    if (!allowAction(req, "request", 5)) return res.status(429).json({ error: "Too many requests. Try again shortly." });
    const publication = knownPublication(String(req.body?.publication_id || ""));
    if (!publication) return res.status(400).json({ error: "Unknown publication." });
    const intent = String(req.body?.intent || "").replace(/\s+/g, " ").trim();
    if (intent.length < 5 || intent.length > 300) return res.status(400).json({ error: "Describe what you would like in 5 to 300 characters." });
    const id = await createAgentRequest(db, { from_agent: "keyosx:agent:jack-rabbit", to_entity: publication.id, intent });
    if (generatorUrl) dispatchVisitorRequest(id, publication, intent);
    res.status(201).json({ id, status: "queued", agent_connected: !!generatorUrl });
  }));

  app.get("/api/admin/agent-requests", requireAdmin, asyncRoute(async (_req, res) => {
    res.json({ requests: await listAgentRequests(db) });
  }));

  // The deliberate "someone looked" signal. POST + JSON body (not triggered by link previews or crawler GETs), 10/min per client.
  const observeHits = new Map();
  app.post("/api/publications/:id/observe", asyncRoute(async (req, res) => {
    const publication = knownPublication(req.params.id);
    if (!publication) return res.status(404).json({ error: "That publication is not on the rack." });
    if (!req.is("application/json")) return res.status(415).json({ error: "JSON required." });
    const nowMs = Date.now();
    const hits = (observeHits.get(req.ip) || []).filter((t) => nowMs - t < 60000);
    if (hits.length >= 10) return res.status(429).json({ error: "Too many requests. Try again shortly." });
    hits.push(nowMs);
    observeHits.set(req.ip, hits);
    if (observeHits.size > 5000) observeHits.clear();
    const period = issuePeriod(publication.cadence);
    const issues = await listIssues(db, publication.id);
    if (issues[0] && issues[0].issue_date >= period.start) return res.json({ requested: false, reason: "fresh" });
    if (!generatorUrl) return res.json({ requested: false, reason: "no-agent" });
    const claimed = await claimComposition(db, publication.id, period.key);
    if (claimed) dispatchComposition(publication, period);
    res.json({ requested: claimed });
  }));

  // ---- Almanac knowledge memory (bearer token or administrator). One database: the Almanac service stores what it knows here. ----
  const agentOk = (req) => {
    const bearer = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    return (agentToken && bearer.length === agentToken.length && crypto.timingSafeEqual(Buffer.from(bearer), Buffer.from(agentToken))) || isAdmin(req);
  };
  app.post("/api/agent/knowledge", asyncRoute(async (req, res) => {
    if (!agentOk(req)) return res.status(401).json({ error: "An agent token or administrator sign-in is required." });
    const brand = String(req.body?.brand || "");
    if (!knownPublication(brand)) return res.status(400).json({ error: "Unknown brand (publication id)." });
    res.status(201).json(await saveKnowledge(db, brand, req.body?.records));
  }));
  app.get("/api/agent/knowledge", asyncRoute(async (req, res) => {
    if (!agentOk(req)) return res.status(401).json({ error: "An agent token or administrator sign-in is required." });
    const brand = String(req.query.brand || "");
    if (!knownPublication(brand)) return res.status(400).json({ error: "Unknown brand (publication id)." });
    const verified = req.query.verified === undefined ? null : req.query.verified === "1";
    const kinds = req.query.kinds ? String(req.query.kinds).split(",") : null;
    res.json({ records: await listKnowledge(db, { brand, status: String(req.query.status ?? "active") || null, verified, kinds, limit: req.query.limit }) });
  }));
  app.post("/api/agent/knowledge/status", asyncRoute(async (req, res) => {
    if (!agentOk(req)) return res.status(401).json({ error: "An agent token or administrator sign-in is required." });
    try { res.json({ updated: await setKnowledgeStatus(db, req.body?.id, String(req.body?.status || ""), req.body?.note) }); }
    catch (error) { res.status(400).json({ error: error.message }); }
  }));

  // The one place an agent's issue is accepted (HTTP route and the in-process Almanac both use it). Always a draft unless an administrator asks.
  async function acceptIssue(body, createdBy, publish) {
    const publication = knownPublication(String(body?.publication_id || ""));
    if (!publication) throw new Error("Unknown publication_id.");
    const result = await upsertIssue(db, { ...body, created_by: createdBy }, { publish });
    const when = /^\d{4}-\d{2}-\d{2}$/.test(String(body.issue_date)) ? new Date(body.issue_date + "T00:00:00Z") : new Date();
    await setRequestStatus(db, publication.id, issuePeriod(publication.cadence, when).key, "completed").catch(() => {});
    // A draft that answers a visitor request links back to it (still a draft; the owner approves it like any revision).
    const requestId = Number(body?.request_id);
    if (requestId) {
      const linked = await getAgentRequest(db, requestId);
      if (linked && linked.to_entity === publication.id) await setAgentRequestStatus(db, requestId, "answered", { issue_id: result.id }).catch(() => {});
    }
    return result;
  }

  // ALMANAC_INLINE=on: the shared Almanac runs inside this app. Hosts such as Hostinger do not let an app call its own address, so the engine
  // talks to KeyOSX through this in-process fetch (same endpoints, same rules, no network). Feeds and link checks still use the real fetch.
  if (almanacInline) {
    const INLINE_BASE = "http://inline.invalid";
    const internalFetch = async (url, options = {}) => {
      if (!String(url).startsWith(INLINE_BASE)) return fetch(url, options);
      const target = new URL(url);
      const method = String(options.method || "GET").toUpperCase();
      const reply = (status, data) => ({ ok: status >= 200 && status < 300, status, json: async () => data, text: async () => JSON.stringify(data) });
      try {
        const body = options.body ? JSON.parse(options.body) : {};
        if (method === "POST" && target.pathname === "/api/agent/issues") return reply(201, await acceptIssue(body, "agent", false));
        if (method === "POST" && target.pathname === "/api/agent/knowledge") {
          if (!knownPublication(String(body.brand || ""))) return reply(400, { error: "Unknown brand (publication id)." });
          return reply(201, await saveKnowledge(db, body.brand, body.records));
        }
        if (method === "GET" && target.pathname === "/api/agent/knowledge") {
          const q = target.searchParams;
          const brand = String(q.get("brand") || "");
          if (!knownPublication(brand)) return reply(400, { error: "Unknown brand (publication id)." });
          const verified = q.get("verified") === null ? null : q.get("verified") === "1";
          return reply(200, { records: await listKnowledge(db, { brand, status: String(q.get("status") ?? "active") || null, verified, kinds: q.get("kinds") ? q.get("kinds").split(",") : null, limit: q.get("limit") }) });
        }
        if (method === "POST" && target.pathname === "/api/agent/knowledge/status") return reply(200, { updated: await setKnowledgeStatus(db, body.id, String(body.status || ""), body.note) });
      } catch (error) { return reply(400, { error: error.message }); }
      return reply(404, { error: "not found" });
    };
    const { createEngine } = await import("./almanac/engine.mjs");
    // Covers go out as site paths (/covers/...), so no host name is ever trusted or guessed.
    inlineEngine = createEngine({ env: { ...process.env, KEYOSX_ORIGIN: INLINE_BASE, KEYOSX_PUBLIC_ORIGIN: "relative" }, fetchImpl: internalFetch });
    // The same webhook the stand-alone service has, for tools outside the app. Bearer token or administrator only.
    app.post("/api/almanac/webhook", (req, res) => {
      if (!agentOk(req)) return res.status(401).json({ error: "An agent token or administrator sign-in is required." });
      const job = req.body || {};
      if (!job.publication_id || !job.period_key) return res.status(400).json({ error: "publication_id and period_key are required" });
      const ready = inlineEngine.readiness(job.publication_id);
      if (!ready.ok) return res.status(ready.status).json({ error: ready.reason });
      res.status(202).json({ accepted: true });
      inlineEngine.handle(job).catch((error) => console.error("[almanac] job failed:", error.message));
    });
    app.get("/api/almanac/health", (req, res) => {
      if (!agentOk(req)) return res.status(401).json({ error: "An agent token or administrator sign-in is required." });
      res.json({ ok: true, mode: "inline", writer: inlineEngine.writerName, spend_today: inlineEngine.spend() });
    });
    console.log("[KeyOSX] The Almanac is running inside this app (ALMANAC_INLINE=on, in-process).");
  }

  // Editorial agents post a new issue (cover + opportunity list) on their cadence. Bearer token, or administrator session.
  app.post("/api/agent/issues", asyncRoute(async (req, res) => {
    const bearer = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    const tokenOk = agentToken && bearer.length === agentToken.length && crypto.timingSafeEqual(Buffer.from(bearer), Buffer.from(agentToken));
    if (!tokenOk && !isAdmin(req)) return res.status(401).json({ error: "An agent token or administrator sign-in is required." });
    if (!knownPublication(String(req.body?.publication_id || ""))) return res.status(400).json({ error: "Unknown publication_id." });
    try {
      // Agents can never publish. Only an administrator session may publish directly, and only on explicit request.
      const result = await acceptIssue(req.body, tokenOk ? "agent" : "admin", !tokenOk && isAdmin(req) && req.body?.status === "published");
      res.status(201).json(result);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }));

  // Owner approval: list drafts awaiting review, and publish a chosen revision.
  app.get("/api/admin/issues/pending", requireAdmin, asyncRoute(async (_req, res) => {
    res.json({ issues: await listPendingIssues(db) });
  }));
  app.get("/api/admin/issues/:id", requireAdmin, asyncRoute(async (req, res) => {
    const detail = await getIssueRevisions(db, Number(req.params.id));
    if (!detail) return res.status(404).json({ error: "That issue does not exist." });
    res.json(detail);
  }));
  app.post("/api/admin/issues/:id/discard", requireAdmin, asyncRoute(async (req, res) => {
    const ok = await discardDraftIssue(db, Number(req.params.id));
    if (!ok) return res.status(400).json({ error: "Only a draft that has never been published can be discarded." });
    res.json({ ok: true });
  }));
  app.post("/api/admin/issues/:id/publish", requireAdmin, asyncRoute(async (req, res) => {
    try {
      res.json(await publishIssue(db, Number(req.params.id), req.body?.revision));
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }));

  app.get("/api/works", asyncRoute(async (req, res) => {
    const kind = WORK_KINDS.includes(String(req.query.kind)) ? String(req.query.kind) : undefined;
    const status = WORK_STATUSES.includes(String(req.query.status)) ? String(req.query.status) : undefined;
    const category = String(req.query.category || "").trim() || undefined;
    const search = String(req.query.q || "").trim() || undefined;
    res.json({ works: await listWorks(db, { kind, status, category, search, includeUnpublished: false, limit: 500 }) });
  }));

  app.get("/api/works/:id", asyncRoute(async (req, res) => {
    const detail = await getWorkDetail(db, Number(req.params.id));
    if (!detail || detail.work.visibility !== "published") return res.status(404).json({ error: "That work is not available." });
    detail.artifacts = detail.artifacts.filter((artifact) => artifact.status === "published");
    detail.relationships = detail.relationships.filter((relationship) => relationship.status === "published");
    res.json(detail);
  }));

  app.post("/api/assistant", asyncRoute(async (req, res) => {
    try {
      const settings = await getSettings(db);
      const result = await askJackRabbit({ db, question: req.body?.message, guideName: settings.guideName || "Jack Rabbit" });
      res.json(result);
    } catch (error) {
      sendError(res, error);
    }
  }));

  app.get("/api/admin/session", (req, res) => {
    res.json({ authenticated: isAdmin(req) });
  });

  app.post("/api/admin/login", (req, res) => {
    const candidate = String(req.body?.password || "");
    const actual = Buffer.from(adminPassword);
    const submitted = Buffer.from(candidate);
    const matches = actual.length === submitted.length && crypto.timingSafeEqual(actual, submitted);
    if (!matches) return res.status(401).json({ error: "Incorrect administrator password." });
    res.setHeader("Set-Cookie", `keyosx_admin=${createSession()}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${isProduction ? "; Secure" : ""}`);
    res.json({ authenticated: true });
  });

  app.post("/api/admin/logout", (_req, res) => {
    res.setHeader("Set-Cookie", "keyosx_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0");
    res.json({ authenticated: false });
  });

  app.get("/api/admin/bootstrap", requireAdmin, asyncRoute(async (_req, res) => {
    res.json({
      settings: await getSettings(db),
      works: await listWorks(db, { includeUnpublished: true, limit: 1000 }),
      artifacts: await listArtifacts(db, { includeUnpublished: true }),
      relationships: await listRelationships(db),
      timeline: await listTimeline(db, { limit: 500 }),
    });
  }));

  app.get("/api/admin/export", requireAdmin, asyncRoute(async (_req, res) => {
    res.setHeader("Content-Disposition", `attachment; filename=keyosx-backup-${new Date().toISOString().slice(0, 10)}.json`);
    res.type("application/json").send(JSON.stringify(await databaseExport(db), null, 2));
  }));

  app.post("/api/admin/works", requireAdmin, asyncRoute(async (req, res) => {
    try {
      res.status(201).json({ work: await createWork(db, req.body || {}) });
    } catch (error) { sendError(res, error); }
  }));

  app.put("/api/admin/works/:id", requireAdmin, asyncRoute(async (req, res) => {
    try {
      const current = await getWork(db, Number(req.params.id));
      if (!current) return res.status(404).json({ error: "Work not found." });
      res.json({ work: await updateWork(db, current.id, req.body || {}) });
    } catch (error) { sendError(res, error); }
  }));

  app.delete("/api/admin/works/:id", requireAdmin, asyncRoute(async (req, res) => {
    if (!(await deleteWork(db, Number(req.params.id)))) return res.status(404).json({ error: "Work not found." });
    res.json({ deleted: true });
  }));

  app.post("/api/admin/artifacts", requireAdmin, asyncRoute(async (req, res) => {
    try {
      res.status(201).json({ artifact: await createArtifact(db, req.body || {}) });
    } catch (error) { sendError(res, error); }
  }));

  app.put("/api/admin/artifacts/:id", requireAdmin, asyncRoute(async (req, res) => {
    try {
      const current = await getArtifact(db, Number(req.params.id));
      if (!current) return res.status(404).json({ error: "Artifact not found." });
      res.json({ artifact: await updateArtifact(db, current.id, req.body || {}) });
    } catch (error) { sendError(res, error); }
  }));

  app.delete("/api/admin/artifacts/:id", requireAdmin, asyncRoute(async (req, res) => {
    if (!(await deleteArtifact(db, Number(req.params.id)))) return res.status(404).json({ error: "Artifact not found." });
    res.json({ deleted: true });
  }));

  app.post("/api/admin/relationships", requireAdmin, asyncRoute(async (req, res) => {
    try {
      res.status(201).json({ relationship: await createRelationship(db, req.body || {}) });
    } catch (error) { sendError(res, error); }
  }));

  app.put("/api/admin/relationships/:id", requireAdmin, asyncRoute(async (req, res) => {
    try {
      const relationship = await updateRelationship(db, Number(req.params.id), req.body || {});
      if (!relationship) return res.status(404).json({ error: "Relationship not found." });
      res.json({ relationship });
    } catch (error) { sendError(res, error); }
  }));

  app.delete("/api/admin/relationships/:id", requireAdmin, asyncRoute(async (req, res) => {
    if (!(await deleteRelationship(db, Number(req.params.id)))) return res.status(404).json({ error: "Relationship not found." });
    res.json({ deleted: true });
  }));

  app.post("/api/admin/timeline", requireAdmin, asyncRoute(async (req, res) => {
    try {
      res.status(201).json({ event: await createTimelineEvent(db, req.body || {}) });
    } catch (error) { sendError(res, error); }
  }));

  app.delete("/api/admin/timeline/:id", requireAdmin, asyncRoute(async (req, res) => {
    if (!(await deleteTimelineEvent(db, Number(req.params.id)))) return res.status(404).json({ error: "Timeline event not found." });
    res.json({ deleted: true });
  }));

  app.post("/api/admin/reseed", requireAdmin, asyncRoute(async (req, res) => {
    if (req.body?.confirm !== "REPLACE CATALOG") {
      return res.status(400).json({ error: 'Send { "confirm": "REPLACE CATALOG" } to confirm — this deletes every work, artifact, relationship, and timeline entry and replaces them with data/seed-data.json.' });
    }
    res.json(await seedDatabase(db, { force: true }));
  }));

  app.get("/api/admin/meta", requireAdmin, (_req, res) => {
    res.json({ artifactTypes: ARTIFACT_TYPES, relationTypes: RELATION_TYPES, timelineEventTypes: TIMELINE_EVENT_TYPES, kinds: WORK_KINDS, statuses: WORK_STATUSES, visibilities: WORK_VISIBILITIES });
  });

  app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

  // eslint-disable-next-line no-unused-vars
  app.use((error, _req, res, _next) => {
    console.error("[KeyOSX] Unhandled request error:", error);
    res.status(500).json({ error: "An unexpected error occurred." });
  });

  app.listen(port, () => {
    console.log(`[KeyOSX] Living kiosk listening on http://localhost:${port}`);
  });

  function closeGracefully() {
    db.end().finally(() => process.exit(0));
  }
  process.on("SIGINT", closeGracefully);
  process.on("SIGTERM", closeGracefully);
}

main().catch((error) => {
  console.error("[KeyOSX] Failed to start:", error);
  process.exit(1);
});
