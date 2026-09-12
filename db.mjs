import mysql from "mysql2/promise";
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

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS settings (
    \`key\` VARCHAR(120) PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS works (
    id INT AUTO_INCREMENT PRIMARY KEY,
    slug VARCHAR(160) NOT NULL UNIQUE,
    name VARCHAR(200) NOT NULL,
    kind ENUM('brand','platform','engine','ecosystem','application','service','book','document','concept') NOT NULL,
    category VARCHAR(120) NOT NULL DEFAULT '',
    status ENUM('old','current','future') NOT NULL DEFAULT 'current',
    status_detail VARCHAR(500) NOT NULL DEFAULT '',
    tagline VARCHAR(300) NOT NULL DEFAULT '',
    summary TEXT,
    body TEXT,
    primary_url VARCHAR(500) NOT NULL DEFAULT '',
    home_platform VARCHAR(200) NOT NULL DEFAULT '',
    hero_image_url VARCHAR(500) NOT NULL DEFAULT '',
    hero_image_alt VARCHAR(300) NOT NULL DEFAULT '',
    tags_json TEXT,
    visibility ENUM('draft','published','archived') NOT NULL DEFAULT 'draft',
    needs_review TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS artifacts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    work_id INT NOT NULL,
    artifact_type ENUM('document','codebase','deck','spec','dataset','image','video','book','link','other') NOT NULL,
    title VARCHAR(300) NOT NULL,
    description TEXT,
    url VARCHAR(500) NOT NULL DEFAULT '',
    reference_label VARCHAR(300) NOT NULL DEFAULT '',
    status ENUM('draft','published','archived') NOT NULL DEFAULT 'published',
    needs_review TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_artifacts_work FOREIGN KEY (work_id) REFERENCES works(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS relationships (
    id INT AUTO_INCREMENT PRIMARY KEY,
    from_work_id INT NOT NULL,
    to_work_id INT NOT NULL,
    relation_type ENUM('module_of','part_of_catalog','powered_by','sibling_of','successor_of','predecessor_of','depends_on','inspired','licenses_to','distinct_from') NOT NULL,
    note VARCHAR(500) NOT NULL DEFAULT '',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_relationships_from FOREIGN KEY (from_work_id) REFERENCES works(id) ON DELETE CASCADE,
    CONSTRAINT fk_relationships_to FOREIGN KEY (to_work_id) REFERENCES works(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS timeline_events (
    id INT AUTO_INCREMENT PRIMARY KEY,
    work_id INT NOT NULL,
    event_date VARCHAR(10) NOT NULL,
    title VARCHAR(300) NOT NULL,
    detail TEXT,
    event_type ENUM('created','launched','rebuilt','renamed','status_change','retired','planned','milestone','note') NOT NULL DEFAULT 'milestone',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_timeline_work FOREIGN KEY (work_id) REFERENCES works(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
];

// Existing tables from before this fix may still be latin1 (MySQL's historical default),
// which is what caused UTF-8 text like em-dashes to come back mojibake'd. CONVERT TO is
// safe to re-run on every startup — a no-op once the table is already utf8mb4.
const CHARSET_FIX_STATEMENTS = [
  "ALTER TABLE settings CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",
  "ALTER TABLE works CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",
  "ALTER TABLE artifacts CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",
  "ALTER TABLE relationships CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",
  "ALTER TABLE timeline_events CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",
];

const INDEX_STATEMENTS = [
  "CREATE INDEX idx_works_status_kind ON works(status, kind)",
  "CREATE INDEX idx_artifacts_work ON artifacts(work_id)",
  "CREATE INDEX idx_relationships_from ON relationships(from_work_id)",
  "CREATE INDEX idx_relationships_to ON relationships(to_work_id)",
  "CREATE INDEX idx_timeline_work_date ON timeline_events(work_id, event_date)",
];

export async function openDatabase(config = {}) {
  const pool = mysql.createPool({
    host: config.host || process.env.DB_HOST || "localhost",
    port: Number(config.port || process.env.DB_PORT || 3306),
    user: config.user || process.env.DB_USER,
    password: config.password || process.env.DB_PASSWORD,
    database: config.database || process.env.DB_NAME,
    namedPlaceholders: true,
    waitForConnections: true,
    connectionLimit: 10,
    dateStrings: true,
    charset: "utf8mb4",
  });
  if (!config.user && !process.env.DB_USER) {
    throw new Error("DB_USER, DB_PASSWORD, and DB_NAME must be set (see .env.example) — KeyOSX stores its catalog in MySQL.");
  }
  for (const statement of SCHEMA_STATEMENTS) {
    await pool.query(statement);
  }
  for (const statement of CHARSET_FIX_STATEMENTS) {
    await pool.query(statement);
  }
  for (const statement of INDEX_STATEMENTS) {
    try {
      await pool.query(statement);
    } catch (error) {
      if (error.code !== "ER_DUP_KEYNAME") throw error;
    }
  }
  return pool;
}

export async function closeDatabase(db) {
  await db.end();
}

function now() {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
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

export async function setSetting(db, key, value) {
  await db.execute(
    "INSERT INTO settings (`key`, value, updated_at) VALUES (:key, :value, :updated_at) ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = VALUES(updated_at)",
    { key, value: String(value), updated_at: now() }
  );
}

export async function getSettings(db) {
  const [rows] = await db.query("SELECT `key`, value FROM settings");
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

export async function createWork(db, input) {
  const work = normalizeWorkInput(input);
  const [result] = await db.execute(
    `INSERT INTO works (slug, name, kind, category, status, status_detail, tagline, summary, body, primary_url, home_platform, hero_image_url, hero_image_alt, tags_json, visibility, needs_review, updated_at)
     VALUES (:slug, :name, :kind, :category, :status, :status_detail, :tagline, :summary, :body, :primary_url, :home_platform, :hero_image_url, :hero_image_alt, :tags_json, :visibility, :needs_review, :updated_at)`,
    { ...work, updated_at: now() }
  );
  return getWork(db, result.insertId);
}

export async function updateWork(db, id, input) {
  const work = normalizeWorkInput(input);
  await db.execute(
    `UPDATE works SET slug = :slug, name = :name, kind = :kind, category = :category, status = :status, status_detail = :status_detail,
      tagline = :tagline, summary = :summary, body = :body, primary_url = :primary_url, home_platform = :home_platform,
      hero_image_url = :hero_image_url, hero_image_alt = :hero_image_alt, tags_json = :tags_json, visibility = :visibility,
      needs_review = :needs_review, updated_at = :updated_at WHERE id = :id`,
    { ...work, id, updated_at: now() }
  );
  return getWork(db, id);
}

export async function deleteWork(db, id) {
  const [result] = await db.execute("DELETE FROM works WHERE id = :id", { id });
  return result.affectedRows > 0;
}

export async function getWork(db, id) {
  const [rows] = await db.execute("SELECT * FROM works WHERE id = :id", { id });
  return workFromRow(rows[0]);
}

export async function getWorkBySlug(db, slug) {
  const [rows] = await db.execute("SELECT * FROM works WHERE slug = :slug", { slug });
  return workFromRow(rows[0]);
}

export async function listWorks(db, options = {}) {
  const { kind, category, status, search, includeUnpublished = false, limit = 250 } = options;
  const clauses = [];
  const params = {};
  if (!includeUnpublished) clauses.push("visibility = 'published'");
  if (kind && WORK_KINDS.includes(kind)) { clauses.push("kind = :kind"); params.kind = kind; }
  if (category) { clauses.push("category = :category"); params.category = category; }
  if (status && WORK_STATUSES.includes(status)) { clauses.push("status = :status"); params.status = status; }
  if (search) {
    clauses.push("(name LIKE :term OR tagline LIKE :term OR summary LIKE :term OR body LIKE :term OR category LIKE :term OR tags_json LIKE :term)");
    params.term = `%${String(search).trim()}%`;
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  params.limit = Math.min(Math.max(Number(limit) || 250, 1), 1000);
  const [rows] = await db.execute(
    `SELECT * FROM works ${where}
     ORDER BY CASE status WHEN 'current' THEN 0 WHEN 'future' THEN 1 ELSE 2 END, name ASC
     LIMIT :limit`,
    params
  );
  return rows.map(workFromRow);
}

export async function contentCounts(db) {
  const [rows] = await db.query("SELECT status, COUNT(*) AS count FROM works WHERE visibility = 'published' GROUP BY status");
  return Object.fromEntries(WORK_STATUSES.map((status) => [status, rows.find((row) => row.status === status)?.count || 0]));
}

// ---------- Artifacts ----------

export async function normalizeArtifactInput(db, input) {
  const workId = Number(input.work_id || input.workId);
  const artifactType = String(input.artifact_type || input.artifactType || "").trim();
  const title = String(input.title || "").trim();
  const status = String(input.status || "published").trim();
  if (!Number.isInteger(workId) || workId <= 0 || !(await getWork(db, workId))) throw new Error("A valid work is required.");
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

export async function createArtifact(db, input) {
  const artifact = await normalizeArtifactInput(db, input);
  const [result] = await db.execute(
    `INSERT INTO artifacts (work_id, artifact_type, title, description, url, reference_label, status, needs_review, updated_at)
     VALUES (:work_id, :artifact_type, :title, :description, :url, :reference_label, :status, :needs_review, :updated_at)`,
    { ...artifact, updated_at: now() }
  );
  return getArtifact(db, result.insertId);
}

export async function updateArtifact(db, id, input) {
  const artifact = await normalizeArtifactInput(db, input);
  await db.execute(
    `UPDATE artifacts SET work_id = :work_id, artifact_type = :artifact_type, title = :title, description = :description,
      url = :url, reference_label = :reference_label, status = :status, needs_review = :needs_review, updated_at = :updated_at
     WHERE id = :id`,
    { ...artifact, id, updated_at: now() }
  );
  return getArtifact(db, id);
}

export async function deleteArtifact(db, id) {
  const [result] = await db.execute("DELETE FROM artifacts WHERE id = :id", { id });
  return result.affectedRows > 0;
}

export async function getArtifact(db, id) {
  const [rows] = await db.execute("SELECT * FROM artifacts WHERE id = :id", { id });
  return artifactFromRow(rows[0]);
}

export async function listArtifacts(db, { workId, includeUnpublished = false } = {}) {
  const clauses = [];
  const params = {};
  if (workId) { clauses.push("work_id = :workId"); params.workId = Number(workId); }
  if (!includeUnpublished) clauses.push("status = 'published'");
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const [rows] = await db.execute(`SELECT * FROM artifacts ${where} ORDER BY updated_at DESC`, params);
  return rows.map(artifactFromRow);
}

// ---------- Relationships ----------

export async function normalizeRelationshipInput(db, input) {
  const fromWorkId = Number(input.from_work_id || input.fromWorkId);
  const toWorkId = Number(input.to_work_id || input.toWorkId);
  const relationType = String(input.relation_type || input.relationType || "").trim();
  if (!Number.isInteger(fromWorkId) || !(await getWork(db, fromWorkId))) throw new Error("A valid source work is required.");
  if (!Number.isInteger(toWorkId) || !(await getWork(db, toWorkId))) throw new Error("A valid target work is required.");
  if (fromWorkId === toWorkId) throw new Error("A work cannot relate to itself.");
  if (!RELATION_TYPES.includes(relationType)) throw new Error("Select a valid relationship type.");
  return {
    from_work_id: fromWorkId,
    to_work_id: toWorkId,
    relation_type: relationType,
    note: String(input.note || "").trim(),
  };
}

export async function createRelationship(db, input) {
  const relationship = await normalizeRelationshipInput(db, input);
  const [result] = await db.execute(
    `INSERT INTO relationships (from_work_id, to_work_id, relation_type, note, updated_at)
     VALUES (:from_work_id, :to_work_id, :relation_type, :note, :updated_at)`,
    { ...relationship, updated_at: now() }
  );
  const [rows] = await db.execute("SELECT * FROM relationships WHERE id = :id", { id: result.insertId });
  return rows[0];
}

export async function deleteRelationship(db, id) {
  const [result] = await db.execute("DELETE FROM relationships WHERE id = :id", { id });
  return result.affectedRows > 0;
}

export async function listRelationshipsForWork(db, workId) {
  const [outgoing] = await db.execute(
    `SELECT r.*, w.name AS other_name, w.slug AS other_slug, w.status AS other_status, w.kind AS other_kind, 'outgoing' AS direction
     FROM relationships r JOIN works w ON w.id = r.to_work_id WHERE r.from_work_id = :workId`,
    { workId }
  );
  const [incoming] = await db.execute(
    `SELECT r.*, w.name AS other_name, w.slug AS other_slug, w.status AS other_status, w.kind AS other_kind, 'incoming' AS direction
     FROM relationships r JOIN works w ON w.id = r.from_work_id WHERE r.to_work_id = :workId`,
    { workId }
  );
  return [...outgoing, ...incoming];
}

export async function listRelationships(db) {
  const [rows] = await db.query(
    `SELECT r.*, fw.name AS from_name, tw.name AS to_name
     FROM relationships r JOIN works fw ON fw.id = r.from_work_id JOIN works tw ON tw.id = r.to_work_id
     ORDER BY fw.name`
  );
  return rows;
}

// ---------- Timeline ----------

export async function normalizeTimelineInput(db, input) {
  const workId = Number(input.work_id || input.workId);
  const eventDate = String(input.event_date || input.eventDate || "").trim();
  const title = String(input.title || "").trim();
  const eventType = String(input.event_type || input.eventType || "milestone").trim();
  if (!Number.isInteger(workId) || !(await getWork(db, workId))) throw new Error("A valid work is required.");
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

export async function createTimelineEvent(db, input) {
  const event = await normalizeTimelineInput(db, input);
  const [result] = await db.execute(
    `INSERT INTO timeline_events (work_id, event_date, title, detail, event_type, updated_at)
     VALUES (:work_id, :event_date, :title, :detail, :event_type, :updated_at)`,
    { ...event, updated_at: now() }
  );
  const [rows] = await db.execute("SELECT * FROM timeline_events WHERE id = :id", { id: result.insertId });
  return rows[0];
}

export async function deleteTimelineEvent(db, id) {
  const [result] = await db.execute("DELETE FROM timeline_events WHERE id = :id", { id });
  return result.affectedRows > 0;
}

export async function listTimelineForWork(db, workId) {
  const [rows] = await db.execute("SELECT * FROM timeline_events WHERE work_id = :workId ORDER BY event_date ASC", { workId });
  return rows;
}

export async function listTimeline(db, { limit = 30 } = {}) {
  const [rows] = await db.execute(
    `SELECT t.*, w.name AS work_name, w.slug AS work_slug
     FROM timeline_events t JOIN works w ON w.id = t.work_id
     ORDER BY t.event_date DESC LIMIT :limit`,
    { limit: Math.min(Math.max(Number(limit) || 30, 1), 200) }
  );
  return rows;
}

// ---------- Composite ----------

export async function getWorkDetail(db, id) {
  const work = await getWork(db, id);
  if (!work) return null;
  return {
    work,
    artifacts: await listArtifacts(db, { workId: id, includeUnpublished: true }),
    timeline: await listTimelineForWork(db, id),
    relationships: await listRelationshipsForWork(db, id),
  };
}

// ---------- Seed ----------

export async function seedDatabase(db, { force = false } = {}) {
  const seedPath = path.join(__dirname, "data", "seed-data.json");
  const seed = JSON.parse(fs.readFileSync(seedPath, "utf8"));
  const [[{ count: existing }]] = await db.query("SELECT COUNT(*) AS count FROM works");
  if (existing && !force) return { seeded: false, reason: "Database already contains catalog records." };

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    if (force) {
      await connection.query("DELETE FROM timeline_events");
      await connection.query("DELETE FROM relationships");
      await connection.query("DELETE FROM artifacts");
      await connection.query("DELETE FROM works");
      await connection.query("DELETE FROM settings");
    }
    const workIds = new Map();
    for (const work of seed.works) {
      const normalized = normalizeWorkInput(work);
      const [result] = await connection.execute(
        `INSERT INTO works (slug, name, kind, category, status, status_detail, tagline, summary, body, primary_url, home_platform, hero_image_url, hero_image_alt, tags_json, visibility, needs_review, updated_at)
         VALUES (:slug, :name, :kind, :category, :status, :status_detail, :tagline, :summary, :body, :primary_url, :home_platform, :hero_image_url, :hero_image_alt, :tags_json, :visibility, :needs_review, :updated_at)`,
        { ...normalized, updated_at: now() }
      );
      workIds.set(work.slug, result.insertId);
    }
    for (const artifact of seed.artifacts || []) {
      const workId = workIds.get(artifact.workSlug);
      const normalized = {
        work_id: workId,
        artifact_type: artifact.artifact_type,
        title: String(artifact.title || "").trim(),
        description: String(artifact.description || "").trim(),
        url: String(artifact.url || "").trim(),
        reference_label: String(artifact.reference_label || "").trim(),
        status: artifact.status || "published",
        needs_review: artifact.needs_review ? 1 : 0,
      };
      await connection.execute(
        `INSERT INTO artifacts (work_id, artifact_type, title, description, url, reference_label, status, needs_review, updated_at)
         VALUES (:work_id, :artifact_type, :title, :description, :url, :reference_label, :status, :needs_review, :updated_at)`,
        { ...normalized, updated_at: now() }
      );
    }
    for (const relationship of seed.relationships || []) {
      await connection.execute(
        `INSERT INTO relationships (from_work_id, to_work_id, relation_type, note, updated_at)
         VALUES (:from_work_id, :to_work_id, :relation_type, :note, :updated_at)`,
        {
          from_work_id: workIds.get(relationship.fromSlug),
          to_work_id: workIds.get(relationship.toSlug),
          relation_type: relationship.relationType,
          note: String(relationship.note || "").trim(),
          updated_at: now(),
        }
      );
    }
    for (const event of seed.timeline || []) {
      await connection.execute(
        `INSERT INTO timeline_events (work_id, event_date, title, detail, event_type, updated_at)
         VALUES (:work_id, :event_date, :title, :detail, :event_type, :updated_at)`,
        {
          work_id: workIds.get(event.workSlug),
          event_date: event.event_date,
          title: event.title,
          detail: String(event.detail || "").trim(),
          event_type: event.event_type || "milestone",
          updated_at: now(),
        }
      );
    }
    await connection.execute(
      "INSERT INTO settings (`key`, value, updated_at) VALUES (:key, :value, :updated_at) ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = VALUES(updated_at)",
      { key: "brandName", value: "KeyOSX", updated_at: now() }
    );
    await connection.execute(
      "INSERT INTO settings (`key`, value, updated_at) VALUES (:key, :value, :updated_at) ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = VALUES(updated_at)",
      { key: "brandTagline", value: "The master living kiosk for every work Joe has built, is building, or is planning.", updated_at: now() }
    );
    await connection.execute(
      "INSERT INTO settings (`key`, value, updated_at) VALUES (:key, :value, :updated_at) ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = VALUES(updated_at)",
      { key: "guideName", value: "Jack Rabbit", updated_at: now() }
    );
    await connection.commit();
    return { seeded: true, works: seed.works.length, artifacts: (seed.artifacts || []).length, relationships: (seed.relationships || []).length, timeline: (seed.timeline || []).length };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function getDatabaseSummary(db) {
  const [[works]] = await db.query("SELECT COUNT(*) AS count FROM works");
  const [[publishedWorks]] = await db.query("SELECT COUNT(*) AS count FROM works WHERE visibility = 'published'");
  const [[artifacts]] = await db.query("SELECT COUNT(*) AS count FROM artifacts");
  const [[relationships]] = await db.query("SELECT COUNT(*) AS count FROM relationships");
  const [[timelineEvents]] = await db.query("SELECT COUNT(*) AS count FROM timeline_events");
  return {
    works: works.count,
    publishedWorks: publishedWorks.count,
    artifacts: artifacts.count,
    relationships: relationships.count,
    timelineEvents: timelineEvents.count,
  };
}
