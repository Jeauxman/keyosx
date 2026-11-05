// Cover assets are connected by VERIFIED IDENTITY, never by guessing from a filename or an old tag.
// Order of trust:
//   1. A cover Joe supplied for this publication (data/registry.json -> cover_assets.rack[slug], served by KeyOSX from /covers).
//   2. A Cloudinary asset whose labels say it belongs to this publication: tag kx:pub:<slug>, tag kx:type:cover, context kx_masthead equal to the
//      printed masthead (or an approved alias), kx_confidence high, and no kx:status:needs-review / do-not-use tag. Labels are written by the
//      Manus pass only after Joe says "apply", so until then this lookup finds nothing and (1) is used.
// If neither exists the engine posts the issue without a cover; it never posts a cover it could not verify.
import fs from "node:fs";
import path from "node:path";
import { ROOT, loadEntities, slugOf } from "./profiles.mjs";
import { currentCover } from "../coverplan.mjs";

const norm = (text) => String(text || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

export function ownerSuppliedCover(publicationId, publicOrigin) {
  const registry = JSON.parse(fs.readFileSync(path.join(ROOT, "data/registry.json"), "utf8"));
  const file = registry.cover_assets?.rack?.[slugOf(publicationId)];
  if (!file) return null;
  if (!fs.existsSync(path.join(ROOT, "public/covers", file + ".webp"))) return null;
  return { url: `${publicOrigin.replace(/\/$/, "")}/covers/${file}.webp`, identity: publicationId, verified_by: "owner-supplied", source: "registry.cover_assets.rack" };
}

// Cloudinary Admin API: list by tag, then check each asset's own labels. `fetchImpl` is injectable for tests.
export async function cloudinaryCover(profile, { cloud = process.env.CLOUDINARY_CLOUD_NAME, key = process.env.CLOUDINARY_API_KEY, secret = process.env.CLOUDINARY_API_SECRET, fetchImpl = fetch, aliases = [] } = {}) {
  if (!cloud || !key || !secret) return null;
  const tagName = encodeURIComponent(`kx:pub:${profile.slug}`);
  const response = await fetchImpl(`https://api.cloudinary.com/v1_1/${cloud}/resources/image/tags/${tagName}?context=true&tags=true&max_results=50`, {
    headers: { Authorization: "Basic " + Buffer.from(`${key}:${secret}`).toString("base64") },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) return null;
  const { resources = [] } = await response.json();
  const accepted = [profile.masthead, profile.name, ...aliases].map(norm);
  const verified = resources.filter((asset) => {
    const tags = asset.tags || [];
    const context = asset.context?.custom || asset.context || {};
    return tags.includes("kx:type:cover")
      && !tags.includes("kx:status:needs-review") && !tags.includes("kx:status:do-not-use")
      && String(context.kx_confidence || "").toLowerCase() === "high"
      && accepted.includes(norm(context.kx_masthead));
  });
  verified.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const best = verified[0];
  return best ? { url: best.secure_url, identity: profile.id, verified_by: "cloudinary-labels", source: best.public_id } : null;
}

// Last resort: the cover the rack itself shows for this publication (the lead image in data/entities.json, which Joe's team filed by its printed masthead).
// It may be a site file (/covers/...) or a Cloudinary image.
const CLOUDINARY_BASE = "https://res.cloudinary.com/dmsdspzbo/image/upload/";
export function rackLeadCover(publicationId, publicOrigin, entities = loadEntities()) {
  const image = entities.publications.find((p) => p.id === publicationId)?.issues?.[0]?.image;
  if (!image) return null;
  const url = String(image).startsWith("/") ? `${publicOrigin.replace(/\/$/, "")}${image}` : `${CLOUDINARY_BASE}f_auto,q_auto,w_600/${image}`;
  return { url, identity: publicationId, verified_by: "rack-lead (the cover shown on the rack)", source: String(image) };
}

export async function resolveCover(profile, { publicOrigin, aliases = [], now = new Date(), ...cloudinaryOptions } = {}) {
  // 0. This month's cover from the git plan (data/covers.json): approved by the owner and released on or before today.
  const monthly = currentCover(profile.id, { now });
  if (monthly) return { url: `${publicOrigin.replace(/\/$/, "")}${monthly.url}`, identity: profile.id, verified_by: "monthly-plan (owner-approved)", source: monthly.file };
  try {
    const labelled = await cloudinaryCover(profile, { aliases, ...cloudinaryOptions });
    if (labelled) return labelled;
  } catch { /* fall through to the owner-supplied cover */ }
  return ownerSuppliedCover(profile.id, publicOrigin) || rackLeadCover(profile.id, publicOrigin);
}
