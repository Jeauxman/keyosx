import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { askJackRabbit } from "../assistant.mjs";
import {
  createWork,
  getDatabaseSummary,
  getWorkBySlug,
  listRelationshipsForWork,
  listTimelineForWork,
  listWorks,
  openDatabase,
  seedDatabase,
} from "../db.mjs";

function createTestDb() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "keyosx-"));
  const db = openDatabase(path.join(directory, "keyosx.db"));
  seedDatabase(db);
  return { db, directory };
}

test("seed creates a catalog spanning old, current, and future works and multiple kinds", () => {
  const { db, directory } = createTestDb();
  try {
    const summary = getDatabaseSummary(db);
    assert.ok(summary.works >= 20);
    assert.ok(summary.artifacts > 0);
    assert.ok(summary.relationships > 0);
    assert.ok(summary.timelineEvents > 0);
    const statuses = new Set(listWorks(db, { includeUnpublished: true }).map((work) => work.status));
    for (const status of ["old", "current", "future"]) assert.ok(statuses.has(status), `expected a ${status} work`);
    const kinds = new Set(listWorks(db, { includeUnpublished: true }).map((work) => work.kind));
    assert.ok(kinds.size >= 5, "expected a spread of work kinds");
  } finally {
    db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("status and kind filters narrow the published catalog correctly", () => {
  const { db, directory } = createTestDb();
  try {
    const currentWorks = listWorks(db, { status: "current" });
    const futureWorks = listWorks(db, { status: "future" });
    assert.ok(currentWorks.length > 0);
    assert.ok(futureWorks.length > 0);
    assert.ok(currentWorks.every((work) => work.status === "current"));
    assert.ok(futureWorks.every((work) => work.status === "future"));
  } finally {
    db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("administrator can create a draft work that stays out of public results", () => {
  const { db, directory } = createTestDb();
  try {
    const work = createWork(db, {
      name: "Unpublished test work",
      kind: "concept",
      status: "future",
      visibility: "draft",
      needsReview: true,
    });
    assert.equal(work.visibility, "draft");
    assert.ok(!listWorks(db, {}).some((record) => record.id === work.id));
    assert.ok(listWorks(db, { includeUnpublished: true }).some((record) => record.id === work.id));
  } finally {
    db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("FlintBill's two same-named threads are recorded as distinct works with a relationship between them", () => {
  const { db, directory } = createTestDb();
  try {
    const engine = getWorkBySlug(db, "flintbill-engine");
    const socratic = getWorkBySlug(db, "flintbill-socratic");
    assert.ok(engine && socratic);
    assert.notEqual(engine.id, socratic.id);
    assert.equal(engine.status, "current");
    assert.equal(socratic.status, "future");
    const relationships = listRelationshipsForWork(db, socratic.id);
    assert.ok(relationships.some((r) => r.other_slug === "flintbill-engine" && r.relation_type === "distinct_from"));
  } finally {
    db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("a work's timeline is retrievable in chronological order", () => {
  const { db, directory } = createTestDb();
  try {
    const keyosx = getWorkBySlug(db, "keyosx");
    const timeline = listTimelineForWork(db, keyosx.id);
    assert.ok(timeline.length >= 3);
    const dates = timeline.map((event) => event.event_date);
    assert.deepEqual(dates, [...dates].sort());
  } finally {
    db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("Jack Rabbit gives a direct, grounded answer when a work is named", async () => {
  const { db, directory } = createTestDb();
  try {
    const response = await askJackRabbit({ db, question: "What is FlintBill?", guideName: "Jack Rabbit" });
    assert.equal(response.provider, "offline");
    assert.ok(response.answer.includes("Jack Rabbit"));
    assert.equal(response.matches.length, 1);
  } finally {
    db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("Jack Rabbit narrows to future works when asked what's planned", async () => {
  const { db, directory } = createTestDb();
  try {
    const response = await askJackRabbit({ db, question: "What is planned for the future?", guideName: "Jack Rabbit" });
    assert.ok(response.matches.length > 0);
    assert.ok(response.matches.every((work) => work.status === "future"));
  } finally {
    db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
