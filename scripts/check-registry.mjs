// Checks data/registry.json: unique permanent ids, catalog slugs that exist, rack entities accounted for.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data");
const registry = JSON.parse(fs.readFileSync(path.join(dir, "registry.json"), "utf8"));
const seed = JSON.parse(fs.readFileSync(path.join(dir, "seed-data.json"), "utf8"));
const entities = JSON.parse(fs.readFileSync(path.join(dir, "entities.json"), "utf8"));
const slugs = new Set(seed.works.map((work) => work.slug));
const problems = [];
const ids = new Set();
for (const entry of registry.entries) {
  if (!/^keyosx:(publication|agent|brand):[a-z0-9-]+$/.test(entry.id)) problems.push(`bad id format: ${entry.id}`);
  if (ids.has(entry.id)) problems.push(`duplicate id: ${entry.id}`);
  ids.add(entry.id);
  if (entry.catalog_slug && !slugs.has(entry.catalog_slug)) problems.push(`${entry.name}: catalog slug not found: ${entry.catalog_slug}`);
}
for (const entity of [...entities.publications, ...entities.agents]) {
  if (!ids.has(entity.id) && !registry.rack_entities_not_in_list.includes(entity.id)) problems.push(`rack entity not accounted for: ${entity.id}`);
}
console.log(`${registry.entries.length} entries, ${registry.rack_entities_not_in_list.length} rack entities outside the list`);
if (problems.length) { console.error(problems.join("\n")); process.exit(1); }
console.log("registry ok");
