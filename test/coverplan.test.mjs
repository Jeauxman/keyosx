import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { currentCover } from "../coverplan.mjs";

const CB = "keyosx:publication:cinebon";
function fixture(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "covers-"));
  fs.mkdirSync(path.join(root, "public", "covers", "cinebon"), { recursive: true });
  for (const file of files) fs.writeFileSync(path.join(root, "public", "covers", file), "x");
  return root;
}
const cover = (period, over = {}) => ({ publication: CB, period, file: `cinebon/${period}.webp`, release: period + "-01", masthead: "CinéBon", made_by: "gpt", approved: true, ...over });

test("a cover goes live on its release date, not before", () => {
  const root = fixture(["cinebon/2026-12.webp"]);
  const plan = [cover("2026-12")];
  assert.equal(currentCover(CB, { root, plan, now: new Date("2026-11-30T23:59:00Z") }), null);
  assert.equal(currentCover(CB, { root, plan, now: new Date("2026-12-01T00:00:00Z") }).url, "/covers/cinebon/2026-12.webp");
});

test("the newest released cover wins and carries forward until the next one arrives", () => {
  const root = fixture(["cinebon/2026-11.webp", "cinebon/2026-12.webp"]);
  const plan = [cover("2026-11"), cover("2026-12")];
  assert.equal(currentCover(CB, { root, plan, now: new Date("2026-11-20T00:00:00Z") }).period, "2026-11");
  assert.equal(currentCover(CB, { root, plan, now: new Date("2026-12-15T00:00:00Z") }).period, "2026-12");
  assert.equal(currentCover(CB, { root, plan, now: new Date("2027-02-10T00:00:00Z") }).period, "2026-12"); // no January cover yet: December stays
});

test("unapproved covers, missing files and other brands' covers are never used", () => {
  const root = fixture(["cinebon/2026-11.webp"]);
  const now = new Date("2026-11-20T00:00:00Z");
  assert.equal(currentCover(CB, { root, plan: [cover("2026-11", { approved: false })], now }), null);
  assert.equal(currentCover(CB, { root, plan: [cover("2026-12")], now: new Date("2026-12-02T00:00:00Z") }), null);       // file not committed
  assert.equal(currentCover("keyosx:publication:noize", { root, plan: [cover("2026-11")], now }), null);
  assert.equal(currentCover(CB, { root, plan: [cover("2026-11", { file: "../../etc/passwd" })], now }), null);            // path tricks rejected
});
