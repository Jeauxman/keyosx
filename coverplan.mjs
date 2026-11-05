// Monthly covers, released on the 1st. The plan lives in git: data/covers.json lists each cover, public/covers/<slug>/<YYYY-MM>.webp holds the image.
// A cover is used only when the OWNER has approved it (approved: true) and its release date has arrived. It then stays current until the next month's
// approved cover is released. Nothing here generates anything; GPT (or anyone) makes the image and commits it, Joe approves it.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_ROOT = path.dirname(fileURLToPath(import.meta.url));

export function loadCoverPlan(root = DEFAULT_ROOT) {
  try { return JSON.parse(fs.readFileSync(path.join(root, "data", "covers.json"), "utf8")).covers || []; } catch { return []; }
}

// Returns { url, file, period, release, masthead, made_by } or null. `url` is a site path (/covers/...).
export function currentCover(publicationId, { now = new Date(), root = DEFAULT_ROOT, plan = loadCoverPlan(root) } = {}) {
  const today = now.toISOString().slice(0, 10);
  const live = plan
    .filter((cover) => cover.publication === publicationId && cover.approved === true && cover.release <= today
      && /^[a-z0-9-]+\/\d{4}-\d{2}\.webp$/.test(cover.file || "") && fs.existsSync(path.join(root, "public", "covers", cover.file)))
    .sort((a, b) => String(b.release).localeCompare(String(a.release)));
  const cover = live[0];
  return cover ? { url: "/covers/" + cover.file, file: cover.file, period: cover.period, release: cover.release, masthead: cover.masthead || "", made_by: cover.made_by || "" } : null;
}
