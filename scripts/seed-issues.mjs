// Loads clearly-flagged SAMPLE issues so the cover -> opportunity-list flow can be demonstrated.
// Real issues come from each publication's editorial agent via POST /api/agent/issues.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openDatabase, upsertIssue } from "../db.mjs";

const dir = path.dirname(fileURLToPath(import.meta.url));
const samples = JSON.parse(fs.readFileSync(path.join(dir, "..", "data", "sample-issues.json"), "utf8"));
const db = await openDatabase();
for (const issue of samples) console.log(await upsertIssue(db, { ...issue, created_by: "seed-issues" }));
await db.end();
