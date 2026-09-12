// Integration smoke test against a real, reachable MySQL database (see .env.example).
// Not run in CI or `npm test` — run manually with `npm run smoke-test` after pointing
// DB_HOST/DB_USER/DB_PASSWORD/DB_NAME at a database you can safely seed and query.
import assert from "node:assert/strict";
import { askJackRabbit } from "../assistant.mjs";
import { getDatabaseSummary, getWorkBySlug, listRelationshipsForWork, listWorks, openDatabase, seedDatabase } from "../db.mjs";

function check(label, fn) {
  try {
    fn();
    console.log(`ok - ${label}`);
  } catch (error) {
    console.error(`FAIL - ${label}`);
    console.error(error);
    process.exitCode = 1;
  }
}

async function main() {
  const db = await openDatabase();
  try {
    const seedResult = await seedDatabase(db);
    console.log("seed:", seedResult);

    const summary = await getDatabaseSummary(db);
    check("catalog has at least 20 works", () => assert.ok(summary.works >= 20));
    check("catalog has artifacts, relationships, and timeline entries", () => {
      assert.ok(summary.artifacts > 0);
      assert.ok(summary.relationships > 0);
      assert.ok(summary.timelineEvents > 0);
    });

    const works = await listWorks(db, { includeUnpublished: true });
    const statuses = new Set(works.map((w) => w.status));
    check("catalog spans old, current, and future", () => {
      for (const status of ["old", "current", "future"]) assert.ok(statuses.has(status));
    });

    const engine = await getWorkBySlug(db, "flintbill-engine");
    const socratic = await getWorkBySlug(db, "flintbill-socratic");
    check("the two FlintBill threads are distinct works", () => {
      assert.ok(engine && socratic);
      assert.notEqual(engine.id, socratic.id);
    });
    if (socratic) {
      const relationships = await listRelationshipsForWork(db, socratic.id);
      check("FlintBill Socratic Tutor is marked distinct_from the FlintBill engine", () => {
        assert.ok(relationships.some((r) => r.other_slug === "flintbill-engine" && r.relation_type === "distinct_from"));
      });
    }

    const response = await askJackRabbit({ db, question: "What is FlintBill?", guideName: "Jack Rabbit" });
    check("Jack Rabbit gives a direct offline answer for a named work", () => {
      assert.equal(response.provider, "offline");
      assert.equal(response.matches.length, 1);
    });

    const planned = await askJackRabbit({ db, question: "What is planned for the future?", guideName: "Jack Rabbit" });
    check("Jack Rabbit narrows to future works when asked what's planned", () => {
      assert.ok(planned.matches.length > 0);
      assert.ok(planned.matches.every((w) => w.status === "future"));
    });
  } finally {
    await db.end();
  }
  if (process.exitCode) {
    console.error("\nSmoke test FAILED.");
  } else {
    console.log("\nSmoke test passed.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
