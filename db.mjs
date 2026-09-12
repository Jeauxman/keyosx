import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const WORK_KINDS = [
  "brand",
  "platform",
  "engine",
  "ecosystem",
  "application",
  "service",
  "book",
  "document",
  "concept",
];
export const WORK_STATUSES = ["old", "current", "future"];
export const WORK_VISIBILITIES = ["draft", "published", "archived"];
export const ARTIFACT_TYPES = [
  "document",
  "codebase",
  "deck",
  "spec",
  "dataset",
  "image",
  "video",
  "book",
  "link",
  "other",
];
export const RELATION_TYPES = [
  "module_of",
  "part_of_catalog",
  "powered_by",
  "sibling_of",
  "successor_of",
  "predecessor_of",
  "depends_on",
  "inspired",
  "licenses_to",
  "distinct_from",
];
export const TIMELINE_EVENT_TYPES = [
  "created",
  "launched",
  "rebuilt",
  "renamed",
  "status_change",
  "retired",
  "planned",
  "milestone",
  "note",
];

export function openDatabase(databaseFile = process.env.DATA_FILE || path.join(__dirname, "data", "keyosx.db")) {
  fs.mkdirSync(path.dirname(databaseFile), { recursive: true });
  const db = new Database(databaseFile);
  db.pragma("foreign_keys = ON");
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS works (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      kind TEXT NOT NULL CHECK(kind IN ('brand','platform','engine','ecosystem','application','service','book','document','concept')),
      category TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL CHECK(status IN ('old','current','future')) DEFAULT 'current',
      status_detail TEXT NOT NULL DEFAULT '',
      tagline TEXT NOT NULL DEFAULT '',
      summary TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL DEFAULT '',
      primary_url TEXT NOT NULL DEFAULT '',
      home_platform TEXT NOT NULL DEFAULT '',
      hero_image_url TEXT NOT NULL DEFAULT '',
      hero_image_alt TEXT NOT NULL DEFAULT '',
      tags_json TEXT NOT NULL DEFAULT '[]',
      visibility TEXT NOT NULL CHECK(visibility IN ('draft','published','archived')) DEFAULT 'draft',
      needs_review INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS artifacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      work_id INTEGER NOT NULL,
      artifact_type TEXT NOT NULL CHECK(artifact_type IN ('document','codebase','deck','spec','dataset','image','video','book','link','other')),
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      url TEXT NOT NULL DEFAULT '',
      reference_label TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL CHECK(status IN ('draft','published','archived')) DEFAULT 'published',
      needs_review INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(work_id) REFERENCES works(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS relationships (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_work_id INTEGER NOT NULL,
      to_work_id INTEGER NOT NULL,
      relation_type TEXT NOT NULL CHECK(relation_type IN ('module_of','part_of_catalog','powered_by','sibling_of','successor_of','predecessor_of','depends_on','inspired','licenses_to','distinct_from')),
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(from_work_id) REFERENCES works(id) ON DELETE CASCADE,
      FOREIGN KEY(to_work_id) REFERENCES works(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS timeline_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      work_id INTEGER NOT NULL,
      event_date TEXT NOT NULL,
      title TEXT NOT NULL,
      detail TEXT NOT NULL DEFAULT '',
      event_type TEXT NOT NULL CHECK(event_type IN ('created','launched','rebuilt','renamed','status_change','retired','planned','milestone','note')) DEFAULT 'milestone',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(work_id) REFERENCES works(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_works_status_kind ON works(status, kind);
    CREATE INDEX IF NOT EXISTS idx_artifacts_work ON artifacts(work_id);
    CREATE INDEX IF NOT EXISTS idx_relationships_from ON relationships(from_work_id);
    CREATE INDEX IF NOT EXISTS idx_relationships_to ON relationships(to_work_id);
    CREATE INDEX IF NOT EXISTS idx_timeline_work_date ON timeline_events(work_id, event_date);
  `);
  return db;
}

function now() {
  return new Date().toISOString();
}

function parseTags(value) {
  try {
    const tags = JSON.parse(value || "[]");
    return Array.isArray(tags) ? tags : [];
  } catch {
    return [];
  }
}

function slugify(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function workFromRow(row) {
  if (!row) return null;
  return { ...row, tags: parseTags(row.tags_json), needs_review: Boolean(row.needs_review) };
}

function artifactFromRow(row) {
  if (!row) return null;
  return { ...row, needs_review: Boolean(row.needs_review) };
}

export function setSetting(db, key, value) {
  db.prepare(`
    INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(key, String(value), now());
}

export function getSettings(db) {
  const rows = db.prepare("SELECT key, value FROM settings").all();
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

// ---------- Works ----------

export function normalizeWorkInput(input) {
  const name = String(input.name || "").trim();
  const slug = slugify(input.slug || name);
  const kind = String(input.kind || "").trim();
  const status = String(input.status || "current").trim();
  const visibility = String(input.visibility || "draft").trim();
  if (!name || !slug) throw new Error("A work name and slug are required.");
  if (!WORK_KINDS.includes(kind)) throw new Error("Select a valid work kind.");
  if (!WORK_STATUSES.includes(status)) throw new Error("Status must be old, current, or future.");
  if (!WORK_VISIBILITIES.includes(visibility)) throw new Error("Select a valid visibility.");
  let tags = input.tags;
  if (typeof tags === "string") tags = tags.split(",").map((tag) => tag.trim()).filter(Boolean);
  if (!Array.isArray(tags)) tags = [];
  return {
    slug,
    name,
    kind,
    category: String(input.category || "").trim(),
    status,
    status_detail: String(input.status_detail || input.statusDetail || "").trim(),
    tagline: String(input.tagline || "").trim(),
    summary: String(input.summary || "").trim(),
    body: String(input.body || "").trim(),
    primary_url: String(input.primary_url || input.primaryUrl || "").trim(),
    home_platform: String(input.home_platform || input.homePlatform || "").trim(),
    hero_image_url: String(input.hero_image_url || input.heroImageUrl || "").trim(),
    hero_image_alt: String(input.hero_image_alt || input.heroImageAlt || "").trim(),
    tags_json: JSON.stringify(tags.slice(0, 24)),
    visibility,
    needs_review: input.needs_review === true || input.needsReview === true || input.needs_review === "true" || input.needs_review === 1 ? 1 : 0,
  };
}

export function createWork(db, input) {
  const work = normalizeWorkInput(input);
  const result = db.prepare(`
    INSERT INTO works (slug, name, kind, category, status, status_detail, tagline, summary, body, primary_url, home_platform, hero_image_url, hero_image_alt, tags_json, visibility, needs_review, updated_at)
    VALUES (@slug, @name, @kind, @category, @status, @status_detail, @tagline, @summary, @body, @primary_url, @home_platform, @hero_image_url, @hero_image_alt, @tags_json, @visibility, @needs_review, @updated_at)
  `).run({ ...work, updated_at: now() });
  return getWork(db, result.lastInsertRowid);
}

export function updateWork(db, id, input) {
  const work = normalizeWorkInput(input);
  db.prepare(`
    UPDATE works SET slug = @slug, name = @name, kind = @kind, category = @category, status = @status, status_detail = @status_detail,
      tagline = @tagline, summary = @summary, body = @body, primary_url = @primary_url, home_platform = @home_platform,
      hero_image_url = @hero_image_url, hero_image_alt = @hero_image_alt, tags_json = @tags_json, visibility = @visibility,
      needs_review = @needs_review, updated_at = @updated_at WHERE id = @id
  `).run({ ...work, id, updated_at: now() });
  return getWork(db, id);
}

export function deleteWork(db, id) {
  return db.prepare("DELETE FROM works WHERE id = ?").run(id).changes > 0;
}

export function getWork(db, id) {
  return workFromRow(db.prepare("SELECT * FROM works WHERE id = ?").get(id));
}

export function getWorkBySlug(db, slug) {
  return workFromRow(db.prepare("SELECT * FROM works WHERE slug = ?").get(slug));
}

export function listWorks(db, options = {}) {
  const { kind, category, status, search, includeUnpublished = false, limit = 250 } = options;
  const clauses = [];
  const params = [];
  if (!includeUnpublished) clauses.push("visibility = 'published'");
  if (kind && WORK_KINDS.includes(kind)) { clauses.push("kind = ?"); params.push(kind); }
  if (category) { clauses.push("category = ?"); params.push(category); }
  if (status && WORK_STATUSES.includes(status)) { clauses.push("status = ?"); params.push(status); }
  if (search) {
    clauses.push("(name LIKE ? OR tagline LIKE ? OR summary LIKE ? OR body LIKE ? OR category LIKE ? OR tags_json LIKE ?)");
    const term = `%${String(search).trim()}%`;
    params.push(term, term, term, term, term, term);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = db.prepare(`
    SELECT * FROM works ${where}
    ORDER BY CASE status WHEN 'current' THEN 0 WHEN 'future' THEN 1 ELSE 2 END, name ASC
    LIMIT ?
  `).all(...params, Math.min(Math.max(Number(limit) || 250, 1), 1000));
  return rows.map(workFromRow);
}

export function contentCounts(db) {
  const rows = db.prepare("SELECT status, COUNT(*) AS count FROM works WHERE visibility = 'published' GROUP BY status").all();
  return Object.fromEntries(WORK_STATUSES.map((status) => [status, rows.find((row) => row.status === status)?.count || 0]));
}

// ---------- Artifacts ----------

export function normalizeArtifactInput(db, input) {
  const workId = Number(input.work_id || input.workId);
  const artifactType = String(input.artifact_type || input.artifactType || "").trim();
  const title = String(input.title || "").trim();
  const status = String(input.status || "published").trim();
  if (!Number.isInteger(workId) || workId <= 0 || !getWork(db, workId)) throw new Error("A valid work is required.");
  if (!ARTIFACT_TYPES.includes(artifactType)) throw new Error("Select a valid artifact type.");
  if (!title) throw new Error("An artifact title is required.");
  if (!WORK_VISIBILITIES.includes(status)) throw new Error("Select a valid artifact status.");
  return {
    work_id: workId,
    artifact_type: artifactType,
    title,
    description: String(input.description || "").trim(),
    url: String(input.url || "").trim(),
    reference_label: String(input.reference_label || input.referenceLabel || "").trim(),
    status,
    needs_review: input.needs_review === true || input.needsReview === true || input.needs_review === "true" || input.needs_review === 1 ? 1 : 0,
  };
}

export function createArtifact(db, input) {
  const artifact = normalizeArtifactInput(db, input);
  const result = db.prepare(`
    INSERT INTO artifacts (work_id, artifact_type, title, description, url, reference_label, status, needs_review, updated_at)
    VALUES (@work_id, @artifact_type, @title, @description, @url, @reference_label, @status, @needs_review, @updated_at)
  `).run({ ...artifact, updated_at: now() });
  return getArtifact(db, result.lastInsertRowid);
}

export function updateArtifact(db, id, input) {
  const artifact = normalizeArtifactInput(db, input);
  db.prepare(`
    UPDATE artifacts SET work_id = @work_id, artifact_type = @artifact_type, title = @title, description = @description,
      url = @url, reference_label = @reference_label, status = @status, needs_review = @needs_review, updated_at = @updated_at
    WHERE id = @id
  `).run({ ...artifact, id, updated_at: now() });
  return getArtifact(db, id);
}

export function deleteArtifact(db, id) {
  return db.prepare("DELETE FROM artifacts WHERE id = ?").run(id).changes > 0;
}

export function getArtifact(db, id) {
  return artifactFromRow(db.prepare("SELECT * FROM artifacts WHERE id = ?").get(id));
}

export function listArtifacts(db, { workId, includeUnpublished = false } = {}) {
  const clauses = [];
  const params = [];
  if (workId) { clauses.push("work_id = ?"); params.push(Number(workId)); }
  if (!includeUnpublished) clauses.push("status = 'published'");
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = db.prepare(`SELECT * FROM artifacts ${where} ORDER BY updated_at DESC`).all(...params);
  return rows.map(artifactFromRow);
}

// ---------- Relationships ----------

export function normalizeRelationshipInput(db, input) {
  const fromWorkId = Number(input.from_work_id || input.fromWorkId);
  const toWorkId = Number(input.to_work_id || input.toWorkId);
  const relationType = String(input.relation_type || input.relationType || "").trim();
  if (!Number.isInteger(fromWorkId) || !getWork(db, fromWorkId)) throw new Error("A valid source work is required.");
  if (!Number.isInteger(toWorkId) || !getWork(db, toWorkId)) throw new Error("A valid target work is required.");
  if (fromWorkId === toWorkId) throw new Error("A work cannot relate to itself.");
  if (!RELATION_TYPES.includes(relationType)) throw new Error("Select a valid relationship type.");
  return {
    from_work_id: fromWorkId,
    to_work_id: toWorkId,
    relation_type: relationType,
    note: String(input.note || "").trim(),
  };
}

export function createRelationship(db, input) {
  const relationship = normalizeRelationshipInput(db, input);
  const result = db.prepare(`
    INSERT INTO relationships (from_work_id, to_work_id, relation_type, note, updated_at)
    VALUES (@from_work_id, @to_work_id, @relation_type, @note, @updated_at)
  `).run({ ...relationship, updated_at: now() });
  return db.prepare("SELECT * FROM relationships WHERE id = ?").get(result.lastInsertRowid);
}

export function deleteRelationship(db, id) {
  return db.prepare("DELETE FROM relationships WHERE id = ?").run(id).changes > 0;
}

export function listRelationshipsForWork(db, workId) {
  const outgoing = db.prepare(`
    SELECT r.*, w.name AS other_name, w.slug AS other_slug, w.status AS other_status, w.kind AS other_kind, 'outgoing' AS direction
    FROM relationships r JOIN works w ON w.id = r.to_work_id WHERE r.from_work_id = ?
  `).all(workId);
  const incoming = db.prepare(`
    SELECT r.*, w.name AS other_name, w.slug AS other_slug, w.status AS other_status, w.kind AS other_kind, 'incoming' AS direction
    FROM relationships r JOIN works w ON w.id = r.from_work_id WHERE r.to_work_id = ?
  `).all(workId);
  return [...outgoing, ...incoming];
}

export function listRelationships(db) {
  return db.prepare(`
    SELECT r.*, fw.name AS from_name, tw.name AS to_name
    FROM relationships r JOIN works fw ON fw.id = r.from_work_id JOIN works tw ON tw.id = r.to_work_id
    ORDER BY fw.name
  `).all();
}

// ---------- Timeline ----------

export function normalizeTimelineInput(db, input) {
  const workId = Number(input.work_id || input.workId);
  const eventDate = String(input.event_date || input.eventDate || "").trim();
  const title = String(input.title || "").trim();
  const eventType = String(input.event_type || input.eventType || "milestone").trim();
  if (!Number.isInteger(workId) || !getWork(db, workId)) throw new Error("A valid work is required.");
  if (!eventDate) throw new Error("An event date is required (YYYY-MM-DD or YYYY-MM).");
  if (!title) throw new Error("An event title is required.");
  if (!TIMELINE_EVENT_TYPES.includes(eventType)) throw new Error("Select a valid event type.");
  return {
    work_id: workId,
    event_date: eventDate,
    title,
    detail: String(input.detail || "").trim(),
    event_type: eventType,
  };
}

export function createTimelineEvent(db, input) {
  const event = normalizeTimelineInput(db, input);
  const result = db.prepare(`
    INSERT INTO timeline_events (work_id, event_date, title, detail, event_type, updated_at)
    VALUES (@work_id, @event_date, @title, @detail, @event_type, @updated_at)
  `).run({ ...event, updated_at: now() });
  return db.prepare("SELECT * FROM timeline_events WHERE id = ?").get(result.lastInsertRowid);
}

export function deleteTimelineEvent(db, id) {
  return db.prepare("DELETE FROM timeline_events WHERE id = ?").run(id).changes > 0;
}

export function listTimelineForWork(db, workId) {
  return db.prepare("SELECT * FROM timeline_events WHERE work_id = ? ORDER BY event_date ASC").all(workId);
}

export function listTimeline(db, { limit = 30 } = {}) {
  return db.prepare(`
    SELECT t.*, w.name AS work_name, w.slug AS work_slug
    FROM timeline_events t JOIN works w ON w.id = t.work_id
    ORDER BY t.event_date DESC LIMIT ?
  `).all(Math.min(Math.max(Number(limit) || 30, 1), 200));
}

// ---------- Composite ----------

export function getWorkDetail(db, id) {
  const work = getWork(db, id);
  if (!work) return null;
  return {
    work,
    artifacts: listArtifacts(db, { workId: id, includeUnpublished: true }),
    timeline: listTimelineForWork(db, id),
    relationships: listRelationshipsForWork(db, id),
  };
}

// ---------- Seed ----------

export function seedDatabase(db, { force = false } = {}) {
  const seedPath = path.join(__dirname, "data", "seed-data.json");
  const seed = JSON.parse(fs.readFileSync(seedPath, "utf8"));
  const existing = db.prepare("SELECT COUNT(*) AS count FROM works").get().count;
  if (existing && !force) return { seeded: false, reason: "Database already contains catalog records." };
  const transaction = db.transaction(() => {
    if (force) {
      db.exec("DELETE FROM timeline_events; DELETE FROM relationships; DELETE FROM artifacts; DELETE FROM works; DELETE FROM settings;");
    }
    const workIds = new Map();
    for (const work of seed.works) {
      const created = createWork(db, work);
      workIds.set(work.slug, created.id);
    }
    for (const artifact of seed.artifacts || []) {
      createArtifact(db, { ...artifact, workId: workIds.get(artifact.workSlug) });
    }
    for (const relationship of seed.relationships || []) {
      createRelationship(db, {
        fromWorkId: workIds.get(relationship.fromSlug),
        toWorkId: workIds.get(relationship.toSlug),
        relationType: relationship.relationType,
        note: relationship.note,
      });
    }
    for (const event of seed.timeline || []) {
      createTimelineEvent(db, { ...event, workId: workIds.get(event.workSlug) });
    }
    setSetting(db, "brandName", "KeyOSX");
    setSetting(db, "brandTagline", "The master living kiosk for every work Joe has built, is building, or is planning.");
    setSetting(db, "guideName", "Jack Rabbit");
  });
  transaction();
  return { seeded: true, works: seed.works.length, artifacts: (seed.artifacts || []).length, relationships: (seed.relationships || []).length, timeline: (seed.timeline || []).length };
}

export function getDatabaseSummary(db) {
  return {
    works: db.prepare("SELECT COUNT(*) AS count FROM works").get().count,
    publishedWorks: db.prepare("SELECT COUNT(*) AS count FROM works WHERE visibility = 'published'").get().count,
    artifacts: db.prepare("SELECT COUNT(*) AS count FROM artifacts").get().count,
    relationships: db.prepare("SELECT COUNT(*) AS count FROM relationships").get().count,
    timelineEvents: db.prepare("SELECT COUNT(*) AS count FROM timeline_events").get().count,
  };
}
