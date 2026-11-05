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
  `CREATE TABLE IF NOT EXISTS knowledge_records (
    id INT AUTO_INCREMENT PRIMARY KEY,
    brand VARCHAR(160) NOT NULL,
    record_key CHAR(40) NOT NULL,
    kind ENUM('news','tip','idea','app','opportunity','other') NOT NULL DEFAULT 'other',
    title VARCHAR(300) NOT NULL,
    summary TEXT,
    url VARCHAR(500) NOT NULL DEFAULT '',
    source_name VARCHAR(160) NOT NULL DEFAULT '',
    source_type VARCHAR(40) NOT NULL DEFAULT '',
    published_at DATE NULL,
    topics VARCHAR(300) NOT NULL DEFAULT '',
    verified TINYINT(1) NOT NULL DEFAULT 0,
    verification TEXT,
    status ENUM('active','outdated','rejected') NOT NULL DEFAULT 'active',
    content_hash CHAR(40) NOT NULL,
    retrieved_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_checked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_knowledge_brand_key (brand, record_key),
    KEY idx_knowledge_brand_status (brand, status, kind)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS agent_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    from_agent VARCHAR(160) NOT NULL,
    to_entity VARCHAR(160) NOT NULL,
    intent VARCHAR(300) NOT NULL,
    status ENUM('queued','sent','answered','failed') NOT NULL DEFAULT 'queued',
    last_error VARCHAR(300) NOT NULL DEFAULT '',
    issue_id INT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_agent_requests_entity (to_entity, status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS issue_requests (
    publication_id VARCHAR(160) NOT NULL,
    period_key VARCHAR(20) NOT NULL,
    status ENUM('queued','running','failed','completed') NOT NULL DEFAULT 'queued',
    attempts INT NOT NULL DEFAULT 1,
    last_error VARCHAR(300) NOT NULL DEFAULT '',
    requested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (publication_id, period_key)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS issue_revisions (
    issue_id INT NOT NULL,
    revision INT NOT NULL,
    stage ENUM('outline','cover','items','media') NOT NULL DEFAULT 'items',
    cover_url VARCHAR(500) NOT NULL DEFAULT '',
    media_url VARCHAR(500) NOT NULL DEFAULT '',
    media_poster_url VARCHAR(500) NOT NULL DEFAULT '',
    created_by VARCHAR(120) NOT NULL DEFAULT '',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (issue_id, revision)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS issues (
    id INT AUTO_INCREMENT PRIMARY KEY,
    publication_id VARCHAR(160) NOT NULL,
    title VARCHAR(300) NOT NULL,
    cover_url VARCHAR(500) NOT NULL DEFAULT '',
    issue_date VARCHAR(10) NOT NULL,
    status ENUM('draft','published','archived') NOT NULL DEFAULT 'draft',
    is_sample TINYINT(1) NOT NULL DEFAULT 0,
    latest_revision INT NOT NULL DEFAULT 0,
    published_revision INT NULL,
    published_at DATETIME NULL,
    created_by VARCHAR(120) NOT NULL DEFAULT '',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_issues_publication (publication_id, issue_date)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS issue_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    issue_id INT NOT NULL,
    revision INT NOT NULL DEFAULT 1,
    kind ENUM('news','tip','idea','app','opportunity','other') NOT NULL DEFAULT 'opportunity',
    title VARCHAR(300) NOT NULL,
    summary TEXT,
    url VARCHAR(500) NOT NULL DEFAULT '',
    featured TINYINT(1) NOT NULL DEFAULT 0,
    sort_order INT NOT NULL DEFAULT 0,
    CONSTRAINT fk_issue_items_issue FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
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
    evidence_note VARCHAR(500) NOT NULL DEFAULT '',
    status ENUM('draft','published','archived') NOT NULL DEFAULT 'draft',
    needs_review TINYINT(1) NOT NULL DEFAULT 0,
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

// Columns added after the relationships table already existed on the live database.
// CREATE TABLE IF NOT EXISTS won't retrofit them, so add them explicitly, ignoring
// "column already exists" so this is safe to re-run on every startup.
const COLUMN_MIGRATIONS = [
  "ALTER TABLE relationships ADD COLUMN evidence_note VARCHAR(500) NOT NULL DEFAULT ''",
  "ALTER TABLE relationships ADD COLUMN status ENUM('draft','published','archived') NOT NULL DEFAULT 'draft'",
  "ALTER TABLE relationships ADD COLUMN needs_review TINYINT(1) NOT NULL DEFAULT 0",
  "ALTER TABLE issues ADD COLUMN latest_revision INT NOT NULL DEFAULT 0",
  "ALTER TABLE issues ADD COLUMN published_revision INT NULL",
  "ALTER TABLE issues ADD COLUMN published_at DATETIME NULL",
  "ALTER TABLE issue_items ADD COLUMN revision INT NOT NULL DEFAULT 1",
  "ALTER TABLE issue_revisions ADD COLUMN stage ENUM('outline','cover','items','media') NOT NULL DEFAULT 'items'",
  "ALTER TABLE issue_revisions ADD COLUMN media_url VARCHAR(500) NOT NULL DEFAULT ''",
  "ALTER TABLE issue_revisions ADD COLUMN media_poster_url VARCHAR(500) NOT NULL DEFAULT ''",
  "ALTER TABLE issue_requests ADD COLUMN status ENUM('queued','running','failed','completed') NOT NULL DEFAULT 'queued'",
  "ALTER TABLE issue_requests ADD COLUMN attempts INT NOT NULL DEFAULT 1",
  "ALTER TABLE issue_requests ADD COLUMN last_error VARCHAR(300) NOT NULL DEFAULT ''",
  "ALTER TABLE issue_requests ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP",
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
  for (const statement of COLUMN_MIGRATIONS) {
    try {
      await pool.query(statement);
    } catch (error) {
      if (error.code !== "ER_DUP_FIELDNAME") throw error;
    }
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

function relationshipFromRow(row) {
  if (!row) return null;
  return { ...row, needs_review: Boolean(row.needs_review) };
}

export async function normalizeRelationshipInput(db, input) {
  const fromWorkId = Number(input.from_work_id || input.fromWorkId);
  const toWorkId = Number(input.to_work_id || input.toWorkId);
  const relationType = String(input.relation_type || input.relationType || "").trim();
  const status = String(input.status || "draft").trim();
  if (!Number.isInteger(fromWorkId) || !(await getWork(db, fromWorkId))) throw new Error("A valid source work is required.");
  if (!Number.isInteger(toWorkId) || !(await getWork(db, toWorkId))) throw new Error("A valid target work is required.");
  if (fromWorkId === toWorkId) throw new Error("A work cannot relate to itself.");
  if (!RELATION_TYPES.includes(relationType)) throw new Error("Select a valid relationship type.");
  if (!WORK_VISIBILITIES.includes(status)) throw new Error("Select a valid relationship status.");
  return {
    from_work_id: fromWorkId,
    to_work_id: toWorkId,
    relation_type: relationType,
    note: String(input.note || "").trim(),
    evidence_note: String(input.evidence_note || input.evidenceNote || "").trim(),
    status,
    needs_review: input.needs_review === true || input.needsReview === true || input.needs_review === "true" || input.needs_review === 1 ? 1 : 0,
  };
}

export async function createRelationship(db, input) {
  // New relationships default to draft (admin-only) unless the caller explicitly marks
  // them published — a reviewed edge should be a deliberate act, not the default.
  const relationship = await normalizeRelationshipInput(db, { status: "draft", ...input });
  const [result] = await db.execute(
    `INSERT INTO relationships (from_work_id, to_work_id, relation_type, note, evidence_note, status, needs_review, updated_at)
     VALUES (:from_work_id, :to_work_id, :relation_type, :note, :evidence_note, :status, :needs_review, :updated_at)`,
    { ...relationship, updated_at: now() }
  );
  const [rows] = await db.execute("SELECT * FROM relationships WHERE id = :id", { id: result.insertId });
  return relationshipFromRow(rows[0]);
}

export async function updateRelationship(db, id, input) {
  const relationship = await normalizeRelationshipInput(db, input);
  await db.execute(
    `UPDATE relationships SET from_work_id = :from_work_id, to_work_id = :to_work_id, relation_type = :relation_type,
      note = :note, evidence_note = :evidence_note, status = :status, needs_review = :needs_review, updated_at = :updated_at
     WHERE id = :id`,
    { ...relationship, id, updated_at: now() }
  );
  const [rows] = await db.execute("SELECT * FROM relationships WHERE id = :id", { id });
  return relationshipFromRow(rows[0]);
}

export async function deleteRelationship(db, id) {
  const [result] = await db.execute("DELETE FROM relationships WHERE id = :id", { id });
  return result.affectedRows > 0;
}

export async function listRelationshipsForWork(db, workId, { includeUnpublished = false } = {}) {
  const statusClause = includeUnpublished ? "" : "AND r.status = 'published'";
  const [outgoing] = await db.execute(
    `SELECT r.*, w.name AS other_name, w.slug AS other_slug, w.status AS other_status, w.kind AS other_kind, 'outgoing' AS direction
     FROM relationships r JOIN works w ON w.id = r.to_work_id WHERE r.from_work_id = :workId ${statusClause}`,
    { workId }
  );
  const [incoming] = await db.execute(
    `SELECT r.*, w.name AS other_name, w.slug AS other_slug, w.status AS other_status, w.kind AS other_kind, 'incoming' AS direction
     FROM relationships r JOIN works w ON w.id = r.from_work_id WHERE r.to_work_id = :workId ${statusClause}`,
    { workId }
  );
  return [...outgoing, ...incoming].map(relationshipFromRow);
}

export async function listRelationships(db, { includeUnpublished = true } = {}) {
  const statusClause = includeUnpublished ? "" : "WHERE r.status = 'published'";
  const [rows] = await db.query(
    `SELECT r.*, fw.name AS from_name, tw.name AS to_name
     FROM relationships r JOIN works fw ON fw.id = r.from_work_id JOIN works tw ON tw.id = r.to_work_id
     ${statusClause}
     ORDER BY fw.name`
  );
  return rows.map(relationshipFromRow);
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
    relationships: await listRelationshipsForWork(db, id, { includeUnpublished: true }),
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
        `INSERT INTO relationships (from_work_id, to_work_id, relation_type, note, evidence_note, status, needs_review, updated_at)
         VALUES (:from_work_id, :to_work_id, :relation_type, :note, :evidence_note, :status, :needs_review, :updated_at)`,
        {
          from_work_id: workIds.get(relationship.fromSlug),
          to_work_id: workIds.get(relationship.toSlug),
          relation_type: relationship.relationType,
          note: String(relationship.note || "").trim(),
          evidence_note: String(relationship.evidenceNote || "").trim(),
          // Existing hand-curated relationships (no explicit status in the seed file) were
          // already reviewed when authored — default them published. New evidence-derived
          // edges must explicitly opt into "published"; the default is draft/admin-only.
          status: relationship.status || "published",
          needs_review: relationship.needsReview ? 1 : 0,
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

export const ISSUE_ITEM_KINDS = ["news", "tip", "idea", "app", "opportunity", "other"];
export const ISSUE_STAGES = ["outline", "cover", "items", "media"];

const safeUrl = (value) => (/^https?:\/\//.test(String(value || "")) ? String(value).slice(0, 500) : "");
// Covers and media may also be this site's own files: /covers/... or /media/... (letters, digits, dot, dash, underscore, slash; no ..).
const safeAsset = (value) => (/^\/(covers|media)\/[A-Za-z0-9._\/-]{1,200}$/.test(String(value || "")) && !String(value).includes("..") ? String(value) : safeUrl(value));

// Records a new REVISION of an issue inside one transaction. Earlier revisions and their items are never
// overwritten. Only a trusted caller (administrator or the seed script) may pass publish:true; editorial-agent
// submissions always land as drafts and go live through publishIssue().
export async function upsertIssue(db, input, { publish = false } = {}) {
  const publication_id = String(input.publication_id || "").trim().slice(0, 160);
  const title = String(input.title || "").trim().slice(0, 300);
  const issue_date = String(input.issue_date || "").trim();
  if (!publication_id || !title) throw new Error("publication_id and title are required.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(issue_date)) throw new Error("issue_date must be YYYY-MM-DD.");
  const items = Array.isArray(input.items) ? input.items.slice(0, 60) : [];
  const cover_url = safeAsset(input.cover_url);
  const stage = ISSUE_STAGES.includes(input.stage) ? input.stage : "items";
  const media_url = safeAsset(input.media_url);
  const media_poster_url = safeAsset(input.media_poster_url);
  if (stage === "media" && !media_url) throw new Error("A media-stage revision needs an http(s) media_url.");
  if (stage === "cover" && !cover_url) throw new Error("A cover-stage revision needs an http(s) cover_url.");
  const created_by = String(input.created_by || "").slice(0, 120);
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [existing] = await conn.execute(
      "SELECT id, latest_revision FROM issues WHERE publication_id = :publication_id AND issue_date = :issue_date AND title = :title FOR UPDATE",
      { publication_id, issue_date, title }
    );
    let id = existing[0]?.id;
    if (!id) {
      const [result] = await conn.execute(
        "INSERT INTO issues (publication_id, title, cover_url, issue_date, status, is_sample, created_by, updated_at) VALUES (:publication_id, :title, '', :issue_date, 'draft', :is_sample, :created_by, :updated_at)",
        { publication_id, title, issue_date, is_sample: input.is_sample ? 1 : 0, created_by, updated_at: now() }
      );
      id = result.insertId;
    }
    const revision = (existing[0]?.latest_revision || 0) + 1;
    await conn.execute("INSERT INTO issue_revisions (issue_id, revision, stage, cover_url, media_url, media_poster_url, created_by) VALUES (:id, :revision, :stage, :cover_url, :media_url, :media_poster_url, :created_by)", { id, revision, stage, cover_url, media_url, media_poster_url, created_by });
    let order = 0;
    for (const item of items) {
      const itemTitle = String(item.title || "").trim().slice(0, 300);
      if (!itemTitle) continue;
      await conn.execute(
        "INSERT INTO issue_items (issue_id, revision, kind, title, summary, url, featured, sort_order) VALUES (:issue_id, :revision, :kind, :title, :summary, :url, :featured, :sort_order)",
        { issue_id: id, revision, kind: ISSUE_ITEM_KINDS.includes(item.kind) ? item.kind : "opportunity", title: itemTitle, summary: String(item.summary || "").slice(0, 2000), url: safeUrl(item.url), featured: item.featured ? 1 : 0, sort_order: order++ }
      );
    }
    await conn.execute("UPDATE issues SET latest_revision = :revision, is_sample = :is_sample, updated_at = :updated_at WHERE id = :id", { id, revision, is_sample: input.is_sample ? 1 : 0, updated_at: now() });
    if (publish) await publishWithin(conn, id, revision);
    await conn.commit();
    return { id, revision, stage, status: publish ? "published" : "draft", items: order };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

async function publishWithin(conn, id, revision) {
  const [rev] = await conn.execute("SELECT cover_url FROM issue_revisions WHERE issue_id = :id AND revision = :revision", { id, revision });
  if (!rev.length) throw new Error("That revision does not exist.");
  await conn.execute(
    "UPDATE issues SET status = 'published', published_revision = :revision, cover_url = :cover_url, published_at = NOW(), updated_at = :updated_at WHERE id = :id",
    { id, revision, cover_url: rev[0].cover_url, updated_at: now() }
  );
}

// The owner's approval action: makes a specific revision (default: the latest) the one visitors see.
export async function publishIssue(db, id, revision) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute("SELECT latest_revision FROM issues WHERE id = :id FOR UPDATE", { id });
    if (!rows.length) throw new Error("That issue does not exist.");
    const target = Number(revision) || rows[0].latest_revision;
    await publishWithin(conn, id, target);
    await conn.commit();
    return { id, published_revision: target };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

export async function listPendingIssues(db) {
  const [rows] = await db.execute(
    "SELECT i.*, r.stage AS latest_stage FROM issues i LEFT JOIN issue_revisions r ON r.issue_id = i.id AND r.revision = i.latest_revision WHERE i.latest_revision > COALESCE(i.published_revision, 0) ORDER BY i.updated_at DESC LIMIT 100"
  );
  return rows;
}

// Everything the owner needs to review: every revision with its cover and items.
export async function getIssueRevisions(db, issue_id) {
  const [issues] = await db.execute("SELECT * FROM issues WHERE id = :issue_id", { issue_id });
  if (!issues.length) return null;
  const [revisions] = await db.execute("SELECT revision, stage, cover_url, media_url, media_poster_url, created_by, created_at FROM issue_revisions WHERE issue_id = :issue_id ORDER BY revision DESC", { issue_id });
  const [items] = await db.execute("SELECT * FROM issue_items WHERE issue_id = :issue_id ORDER BY featured DESC, sort_order ASC", { issue_id });
  return { issue: issues[0], revisions: revisions.map((rev) => ({ ...rev, items: items.filter((item) => item.revision === rev.revision) })) };
}

// Discarding is only for drafts that have never gone live; a live issue's history is never removed.
export async function discardDraftIssue(db, issue_id) {
  const [result] = await db.execute("UPDATE issues SET status = 'archived', updated_at = :updated_at WHERE id = :issue_id AND published_revision IS NULL", { issue_id, updated_at: now() });
  return result.affectedRows === 1;
}

export async function listIssues(db, publication_id) {
  const [issues] = await db.execute(
    `SELECT i.*, p.stage, p.media_url, p.media_poster_url,
            (SELECT GROUP_CONCAT(x.stage) FROM issue_revisions x WHERE x.issue_id = i.id AND x.revision > i.published_revision) AS pending_stages
     FROM issues i
     JOIN issue_revisions p ON p.issue_id = i.id AND p.revision = i.published_revision
     WHERE i.publication_id = :publication_id AND i.status = 'published' AND i.published_revision IS NOT NULL
     ORDER BY i.issue_date DESC, i.id DESC LIMIT 50`,
    { publication_id }
  );
  return issues;
}

// Visitors only ever see the published revision's items.
export async function getIssueItems(db, issue_id, revision) {
  const [items] = await db.execute(
    "SELECT * FROM issue_items WHERE issue_id = :issue_id AND revision = :revision ORDER BY featured DESC, sort_order ASC",
    { issue_id, revision }
  );
  return items;
}

export async function latestIssueByPublication(db) {
  const [rows] = await db.execute(
    "SELECT i.* FROM issues i JOIN (SELECT publication_id, MAX(issue_date) d FROM issues WHERE status='published' AND published_revision IS NOT NULL GROUP BY publication_id) m ON m.publication_id = i.publication_id AND m.d = i.issue_date WHERE i.status='published' AND i.published_revision IS NOT NULL ORDER BY i.id DESC"
  );
  const latest = new Map();
  for (const row of rows) if (!latest.has(row.publication_id)) latest.set(row.publication_id, row);
  return latest;
}

// ---- Composition requests: queued -> running -> completed | failed, with controlled retries. ----
const MAX_ATTEMPTS = 5;
const STALE_RUNNING_MINUTES = 60;

export async function getRequestState(db, publication_id, period_key) {
  const [rows] = await db.execute("SELECT status, attempts, last_error FROM issue_requests WHERE publication_id = :publication_id AND period_key = :period_key", { publication_id, period_key });
  return rows[0] || null;
}

// Decides whether THIS observer should dispatch the agent. Exactly one concurrent caller wins (conditional UPDATE).
export async function claimComposition(db, publication_id, period_key) {
  const [rows] = await db.execute("SELECT status, attempts, updated_at, TIMESTAMPDIFF(MINUTE, updated_at, NOW()) AS age FROM issue_requests WHERE publication_id = :publication_id AND period_key = :period_key", { publication_id, period_key });
  if (!rows.length) {
    const [result] = await db.execute("INSERT IGNORE INTO issue_requests (publication_id, period_key, status, attempts) VALUES (:publication_id, :period_key, 'queued', 1)", { publication_id, period_key });
    return result.affectedRows === 1;
  }
  const row = rows[0];
  const retry =
    (row.status === "failed" && row.attempts < MAX_ATTEMPTS && row.age >= 5 * row.attempts) ||
    ((row.status === "queued" || row.status === "running") && row.age >= STALE_RUNNING_MINUTES && row.attempts < MAX_ATTEMPTS);
  if (!retry) return false;
  const [result] = await db.execute(
    "UPDATE issue_requests SET status = 'queued', attempts = attempts + 1, updated_at = NOW() WHERE publication_id = :publication_id AND period_key = :period_key AND status = :status AND updated_at = :updated_at",
    { publication_id, period_key, status: row.status, updated_at: row.updated_at }
  );
  return result.affectedRows === 1;
}

export async function setRequestStatus(db, publication_id, period_key, status, error = "", onlyFrom = "") {
  await db.execute(
    `UPDATE issue_requests SET status = :status, last_error = :error, updated_at = NOW() WHERE publication_id = :publication_id AND period_key = :period_key${onlyFrom ? " AND status = :onlyFrom" : ""}`,
    { publication_id, period_key, status, error: String(error).slice(0, 300), ...(onlyFrom ? { onlyFrom } : {}) }
  );
}

// Period key and the first day of the current window for a cadence (UTC).
export function issuePeriod(cadence, date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const iso = (x) => x.toISOString().slice(0, 10);
  if (cadence === "weekly") {
    const start = new Date(d); start.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); // Monday
    return { key: "W" + iso(start), start: iso(start) };
  }
  if (cadence === "quarterly") {
    const start = new Date(Date.UTC(d.getUTCFullYear(), Math.floor(d.getUTCMonth() / 3) * 3, 1));
    return { key: "Q" + iso(start).slice(0, 7), start: iso(start) };
  }
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  return { key: "M" + iso(start).slice(0, 7), start: iso(start) };
}

// ---- Structured requests from Jack Rabbit to an entity's editorial agent ----
export async function createAgentRequest(db, { from_agent, to_entity, intent }) {
  const [result] = await db.execute(
    "INSERT INTO agent_requests (from_agent, to_entity, intent) VALUES (:from_agent, :to_entity, :intent)",
    { from_agent: String(from_agent).slice(0, 160), to_entity: String(to_entity).slice(0, 160), intent: String(intent).slice(0, 300) }
  );
  return result.insertId;
}

export async function setAgentRequestStatus(db, id, status, { error = "", issue_id = null, onlyFrom = "" } = {}) {
  await db.execute(
    `UPDATE agent_requests SET status = :status, last_error = :error, issue_id = COALESCE(:issue_id, issue_id), updated_at = NOW() WHERE id = :id${onlyFrom ? " AND status = :onlyFrom" : ""}`,
    { id, status, error: String(error).slice(0, 300), issue_id, ...(onlyFrom ? { onlyFrom } : {}) }
  );
}

export async function getAgentRequest(db, id) {
  const [rows] = await db.execute("SELECT * FROM agent_requests WHERE id = :id", { id });
  return rows[0] || null;
}

export async function listAgentRequests(db) {
  const [rows] = await db.execute("SELECT * FROM agent_requests ORDER BY id DESC LIMIT 100");
  return rows;
}


// ---- Almanac knowledge memory: what the shared engine has discovered and verified, with sources and history ----
// Records are scoped to a brand (publication id) so each brand keeps its own knowledge profile. Re-saving an unchanged record only
// refreshes last_checked_at; a changed record is updated and reactivated. Nothing here is published to visitors by itself.
import { createHash } from "node:crypto";
const KNOWLEDGE_KINDS = ["news", "tip", "idea", "app", "opportunity", "other"];
const knowledgeKey = (record) => createHash("sha1").update(String(record.url || "").trim().toLowerCase() || String(record.title || "").trim().toLowerCase()).digest("hex");
const knowledgeHash = (record) => createHash("sha1").update([record.kind, record.title, record.summary || "", record.url || ""].join("\u0001")).digest("hex");

export async function saveKnowledge(db, brand, records) {
  const counts = { inserted: 0, changed: 0, unchanged: 0, skipped: 0 };
  for (const record of (Array.isArray(records) ? records : []).slice(0, 200)) {
    const title = String(record?.title || "").trim().slice(0, 300);
    if (!brand || !title) { counts.skipped++; continue; }
    const row = {
      brand: String(brand).slice(0, 160),
      record_key: knowledgeKey({ ...record, title }),
      kind: KNOWLEDGE_KINDS.includes(record.kind) ? record.kind : "other",
      title,
      summary: String(record.summary || "").slice(0, 2000),
      url: safeUrl(record.url),
      source_name: String(record.source_name || "").slice(0, 160),
      source_type: String(record.source_type || "").slice(0, 40),
      published_at: /^\d{4}-\d{2}-\d{2}/.test(String(record.published_at || "")) ? String(record.published_at).slice(0, 10) : null,
      topics: Array.isArray(record.topics) ? record.topics.join(",").slice(0, 300) : String(record.topics || "").slice(0, 300),
      verified: record.verified ? 1 : 0,
      verification: typeof record.verification === "string" ? record.verification.slice(0, 2000) : JSON.stringify(record.verification || {}).slice(0, 2000),
      status: ["active", "outdated", "rejected"].includes(record.status) ? record.status : "active",
    };
    row.content_hash = knowledgeHash(row);
    const [existing] = await db.execute("SELECT id, content_hash, status FROM knowledge_records WHERE brand = :brand AND record_key = :record_key", { brand: row.brand, record_key: row.record_key });
    if (!existing.length) {
      await db.execute(
        "INSERT INTO knowledge_records (brand, record_key, kind, title, summary, url, source_name, source_type, published_at, topics, verified, verification, status, content_hash) VALUES (:brand, :record_key, :kind, :title, :summary, :url, :source_name, :source_type, :published_at, :topics, :verified, :verification, :status, :content_hash)",
        row
      );
      counts.inserted++;
    } else if (existing[0].content_hash === row.content_hash && existing[0].status === row.status) {
      await db.execute("UPDATE knowledge_records SET last_checked_at = NOW() WHERE id = :id", { id: existing[0].id });
      counts.unchanged++;
    } else {
      await db.execute(
        "UPDATE knowledge_records SET kind = :kind, title = :title, summary = :summary, url = :url, source_name = :source_name, source_type = :source_type, published_at = :published_at, topics = :topics, verified = :verified, verification = :verification, status = :status, content_hash = :content_hash, last_checked_at = NOW() WHERE id = :id",
        { ...row, id: existing[0].id }
      );
      counts.changed++;
    }
  }
  return counts;
}

export async function listKnowledge(db, { brand, status = "active", verified = null, kinds = null, limit = 100 } = {}) {
  const clauses = ["brand = :brand"];
  const params = { brand };
  if (status) { clauses.push("status = :status"); params.status = status; }
  if (verified !== null) { clauses.push("verified = :verified"); params.verified = verified ? 1 : 0; }
  const wanted = Array.isArray(kinds) ? kinds.filter((kind) => KNOWLEDGE_KINDS.includes(kind)) : [];
  if (wanted.length) clauses.push("kind IN (" + wanted.map((kind) => "'" + kind + "'").join(",") + ")");
  const [rows] = await db.execute(
    "SELECT id, brand, kind, title, summary, url, source_name, source_type, published_at, topics, verified, verification, status, retrieved_at, last_checked_at FROM knowledge_records WHERE " + clauses.join(" AND ") + " ORDER BY published_at IS NULL, published_at DESC, id LIMIT " + Math.min(Number(limit) || 100, 500),
    params
  );
  return rows;
}

export async function setKnowledgeStatus(db, id, status, note = "") {
  if (!["active", "outdated", "rejected"].includes(status)) throw new Error("bad status");
  const [result] = await db.execute(
    "UPDATE knowledge_records SET status = :status, verification = CONCAT(COALESCE(verification, ''), :note), last_checked_at = NOW() WHERE id = :id",
    { id: Number(id), status, note: note ? "\n" + String(note).slice(0, 300) : "" }
  );
  return result.affectedRows;
}
