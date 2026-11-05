import assert from "node:assert/strict";
import test from "node:test";
import { canCompose, issueTitle, loadEntities, loadProfile, parsePeriod, seedPool } from "../almanac/profiles.mjs";
import { templateWriter } from "../almanac/writers/template.mjs";
import { validateIssue } from "../almanac/engine.mjs";

const PUBLICATIONS = loadEntities().publications;
const period = parsePeriod("W2026-11-02");

test("every publication on the rack is served by the shared Almanac and has sources", () => {
  assert.ok(PUBLICATIONS.length >= 29);
  for (const publication of PUBLICATIONS) {
    assert.equal(publication.editorial_agent, "keyosx:agent:almanac", publication.name);
    assert.ok(canCompose(loadProfile(publication.id)), `${publication.name} has no editorial sources`);
  }
});

test("each brand's seed pool alone composes a rule-abiding issue (no network needed)", async () => {
  for (const publication of PUBLICATIONS) {
    const profile = loadProfile(publication.id);
    const plan = await templateWriter.plan({ profile, period, pool: seedPool(profile), news: [] });
    assert.deepEqual(validateIssue(plan.items, profile), [], publication.name);
    assert.equal(plan.title, issueTitle(period));
    assert.equal(plan.items.filter((item) => item.featured).length, 3, publication.name);
  }
});

test("seed pools carry no news, no invented links and no duplicates", () => {
  for (const publication of PUBLICATIONS) {
    const pool = seedPool(loadProfile(publication.id));
    assert.ok(pool.every((seed) => seed.kind !== "news"), `${publication.name}: seeds must never be news`);
    assert.ok(pool.filter((seed) => seed.kind === "app").every((seed) => /^https:\/\/[^/]+\.[^/]+/.test(seed.url || "")), `${publication.name}: every app needs an https link`);
    assert.equal(new Set(pool.map((seed) => seed.title)).size, pool.length, `${publication.name}: duplicate titles`);
    for (const kind of ["tip", "idea", "app", "opportunity"]) assert.ok(pool.some((seed) => seed.kind === kind), `${publication.name}: no ${kind} in the pool`);
  }
});

test("brands with feeds list each one with a name, an https url and an on/off switch", () => {
  for (const publication of PUBLICATIONS) {
    for (const feed of loadProfile(publication.id).sources.feeds) {
      assert.ok(feed.name && /^https:\/\//.test(feed.url), `${publication.name}: bad feed`);
      assert.equal(typeof feed.enabled, "boolean", `${publication.name}: feed ${feed.name} needs enabled true/false`);
    }
  }
});

test("a live-feed tab is public only for brands that can actually read a feed", () => {
  const publicIds = new Set(JSON.parse(JSON.stringify(require_live())).public);
  for (const id of publicIds) assert.ok(loadProfile(id).sources.feeds.some((feed) => feed.enabled), `${id} is public but has no enabled feed`);
});

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
function require_live() { return JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data", "live-feed.json"), "utf8")); }
