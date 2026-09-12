import assert from "node:assert/strict";
import test from "node:test";
import {
  article,
  findDirectMatch,
  inferKindFilter,
  inferStatusFilter,
  rankWorks,
} from "../assistant.mjs";
import { normalizeWorkInput, WORK_KINDS, WORK_STATUSES } from "../db.mjs";

// These tests cover the pure, DB-free logic (input validation, slugging, Jack Rabbit's
// question-parsing and ranking heuristics). Full catalog behavior — seeding, CRUD, and
// Jack Rabbit's grounded answers against real data — is covered by `npm run smoke-test`,
// which needs a reachable MySQL database (see .env.example) and is not run in CI.

test("normalizeWorkInput derives a slug from the name and validates enums", () => {
  const work = normalizeWorkInput({ name: "GAEM.OS (FlintAI)", kind: "platform", status: "current", visibility: "published" });
  assert.equal(work.slug, "gaem-os-flintai");
  assert.equal(work.kind, "platform");
  assert.throws(() => normalizeWorkInput({ name: "X", kind: "not-a-kind" }), /valid work kind/);
  assert.throws(() => normalizeWorkInput({ name: "", kind: "brand" }), /name and slug/);
});

test("normalizeWorkInput accepts every declared kind and status", () => {
  for (const kind of WORK_KINDS) {
    for (const status of WORK_STATUSES) {
      const work = normalizeWorkInput({ name: "Test", kind, status });
      assert.equal(work.kind, kind);
      assert.equal(work.status, status);
    }
  }
});

test("normalizeWorkInput turns a comma-separated tags string into an array", () => {
  const work = normalizeWorkInput({ name: "Test", kind: "concept", tags: "a, b ,c" });
  assert.deepEqual(JSON.parse(work.tags_json), ["a", "b", "c"]);
});

test("article picks 'an' before a vowel sound and 'a' otherwise", () => {
  assert.equal(article("engine"), "an");
  assert.equal(article("brand"), "a");
});

test("inferStatusFilter recognizes current/old/future phrasing", () => {
  assert.equal(inferStatusFilter("what's live right now?"), "current");
  assert.equal(inferStatusFilter("what's old or retired?"), "old");
  assert.equal(inferStatusFilter("what is planned for the future?"), "future");
  assert.equal(inferStatusFilter("tell me about FlintBill"), null);
});

test("inferKindFilter recognizes a kind named in the question", () => {
  assert.equal(inferKindFilter("what brands do we have?"), "brand");
  assert.equal(inferKindFilter("any interesting applications?"), "application");
  assert.equal(inferKindFilter("what's happening today?"), null);
});

test("findDirectMatch finds a work whose exact name appears in the question", () => {
  const works = [
    { id: 1, name: "FlintBill", slug: "flintbill-engine" },
    { id: 2, name: "FlintBill Socratic Tutor", slug: "flintbill-socratic" },
  ];
  assert.equal(findDirectMatch(works, "What is FlintBill?").id, 1);
  assert.equal(findDirectMatch(works, "What is FlintBill Socratic Tutor?").id, 2);
  assert.equal(findDirectMatch(works, "What is KeyOSX?"), null);
});

test("rankWorks scores keyword and status/kind matches higher", () => {
  const works = [
    { name: "Almanac", tagline: "knowledge layer", summary: "", body: "", category: "Media", kind: "engine", status: "current", tags: [] },
    { name: "Unrelated Brand", tagline: "", summary: "", body: "", category: "Real Estate", kind: "brand", status: "future", tags: [] },
  ];
  const ranked = rankWorks(works, "Tell me about the knowledge engine");
  assert.equal(ranked[0].name, "Almanac");
});
