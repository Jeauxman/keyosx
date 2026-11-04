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
      const shelf = publication.issues.map((issue) => ({ title: issue.title, status: issue.status || "proposed", image_url: CLOUDINARY_BASE + "f_auto,q_auto,w_480/" + issue.image }));
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
    const request = fresh ? null : await getRequestState(db, publication.id, period.key);
    const requested = Number(req.query.issue) || issues[0]?.id;
    const current = issues.find((issue) => issue.id === requested) || null;
    res.json({
      publication: { id: publication.id, name: publication.name, tagline: publication.tagline, beat: publication.beat || "", cadence: publication.cadence || "", beat_status: publication.beat_status || "inferred" },
      fresh, composing, generator_configured: !!generatorUrl, period: period.key,
      request_status: request?.status ?? null,
      current: current ? { ...current, items: await getIssueItems(db, current.id, current.published_revision) } : null,
      archive: issues.map(({ id, title, issue_date, cover_url, is_sample }) => ({ id, title, issue_date, cover_url, is_sample })),
    });
  }));

  async function dispatchComposition(publication, period) {
    try {
      const response = await fetch(generatorUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(agentToken ? { Authorization: "Bearer " + agentToken } : {}) },
        body: JSON.stringify({ publication_id: publication.id, name: publication.name, beat: publication.beat, cadence: publication.cadence, period_key: period.key, issue_date: new Date().toISOString().slice(0, 10), callback: "/api/agent/issues" }),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error("agent returned HTTP " + response.status);
      await setRequestStatus(db, publication.id, period.key, "running", "", "queued");
    } catch (error) {
      console.error("[KeyOSX] issue generator call failed:", error.message);
      await setRequestStatus(db, publication.id, period.key, "failed", error.message).catch(() => {});
    }
  }

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

  // Editorial agents post a new issue (cover + opportunity list) on their cadence. Bearer token, or administrator session.
  app.post("/api/agent/issues", asyncRoute(async (req, res) => {
    const bearer = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    const tokenOk = agentToken && bearer.length === agentToken.length && crypto.timingSafeEqual(Buffer.from(bearer), Buffer.from(agentToken));
    if (!tokenOk && !isAdmin(req)) return res.status(401).json({ error: "An agent token or administrator sign-in is required." });
    if (!knownPublication(String(req.body?.publication_id || ""))) return res.status(400).json({ error: "Unknown publication_id." });
    try {
      // Agents can never publish. Only an administrator session may publish directly, and only on explicit request.
      const publish = !tokenOk && isAdmin(req) && req.body?.status === "published";
      const publication = knownPublication(String(req.body.publication_id));
      const result = await upsertIssue(db, { ...req.body, created_by: tokenOk ? "agent" : "admin" }, { publish });
      const when = /^\d{4}-\d{2}-\d{2}$/.test(String(req.body.issue_date)) ? new Date(req.body.issue_date + "T00:00:00Z") : new Date();
      await setRequestStatus(db, publication.id, issuePeriod(publication.cadence, when).key, "completed").catch(() => {});
      res.status(201).json(result);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }));

  // Owner approval: list drafts awaiting review, and publish a chosen revision.
  app.get("/api/admin/issues/pending", requireAdmin, asyncRoute(async (_req, res) => {
    res.json({ issues: await listPendingIssues(db) });
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
