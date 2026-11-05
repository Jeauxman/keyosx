// Checks the monthly cover plan (data/covers.json) against the files in public/covers. Exit 1 on errors. Run: npm run check:covers
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const entities = JSON.parse(fs.readFileSync(path.join(root, "data", "entities.json"), "utf8"));
const plan = JSON.parse(fs.readFileSync(path.join(root, "data", "covers.json"), "utf8")).covers || [];
const norm = (text) => String(text || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const MAX_BYTES = 400 * 1024;
const errors = []; const warnings = []; const seen = new Set(); const listed = new Set();

for (const [i, cover] of plan.entries()) {
  const label = `covers[${i}] ${cover.publication} ${cover.period}`;
  const publication = entities.publications.find((p) => p.id === cover.publication);
  if (!publication) { errors.push(`${label}: not a publication on the rack`); continue; }
  const slug = publication.id.split(":").pop();
  if (!/^\d{4}-\d{2}$/.test(cover.period || "")) errors.push(`${label}: period must be YYYY-MM`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cover.release || "")) errors.push(`${label}: release must be YYYY-MM-DD`);
  else if (cover.period && !cover.release.startsWith(cover.period)) warnings.push(`${label}: release ${cover.release} is outside its period`);
  if (cover.file !== `${slug}/${cover.period}.webp`) errors.push(`${label}: file must be ${slug}/${cover.period}.webp (got ${cover.file})`);
  const key = cover.publication + "|" + cover.period;
  if (seen.has(key)) errors.push(`${label}: more than one cover for that month`);
  seen.add(key);
  const full = path.join(root, "public", "covers", cover.file || "");
  if (!fs.existsSync(full)) errors.push(`${label}: file is missing (public/covers/${cover.file})`);
  else {
    listed.add(path.normalize(full));
    const size = fs.statSync(full).size;
    if (size > MAX_BYTES) errors.push(`${label}: ${Math.round(size / 1024)} KB is over the ${MAX_BYTES / 1024} KB limit (git history keeps every version)`);
  }
  const accepted = [publication.name, ...(publication.aliases || [])].map(norm);
  if (!accepted.includes(norm(cover.masthead))) errors.push(`${label}: masthead "${cover.masthead}" does not match the publication name or an approved alias`);
  if (typeof cover.approved !== "boolean") errors.push(`${label}: approved must be true or false`);
  if (!cover.made_by) warnings.push(`${label}: made_by is empty`);
}

// Files in a brand folder that the plan does not mention.
const coversDir = path.join(root, "public", "covers");
for (const entry of fs.existsSync(coversDir) ? fs.readdirSync(coversDir, { withFileTypes: true }) : []) {
  if (!entry.isDirectory()) continue;
  for (const file of fs.readdirSync(path.join(coversDir, entry.name))) if (!listed.has(path.normalize(path.join(coversDir, entry.name, file)))) warnings.push(`public/covers/${entry.name}/${file} is not in data/covers.json`);
}

console.log(`${plan.length} planned covers, ${plan.filter((c) => c.approved).length} approved`);
for (const w of warnings) console.warn("warning:", w);
if (errors.length) { for (const e of errors) console.error("error:", e); process.exit(1); }
console.log("covers ok");
