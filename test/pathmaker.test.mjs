import assert from "node:assert/strict";
import test from "node:test";
import { QUESTIONS, buildPath, eligibleAds, pickAd, wordsOf } from "../pathmaker.mjs";

const cand = (id, kind, title, pub = "cb", extra = {}) => ({ item: { id, kind, title, summary: extra.summary || "", url: extra.url || "", featured: !!extra.featured }, publication: { id: "keyosx:publication:" + pub, name: pub }, issue_id: 1 });

test("Jack asks at most two quick questions", () => {
  assert.equal(QUESTIONS.length, 2);
  assert.ok(QUESTIONS.every((question) => question.options.length >= 2));
});

test("a path is built only from the candidates given (approved items), with variety and a reason for each step", () => {
  const candidates = [
    cand(1, "tip", "Host a film night", "cb", { summary: "silent film night with friends", featured: true }),
    cand(2, "idea", "Film club monthly", "cb", { summary: "start a film club" }),
    cand(3, "app", "Letterboxd", "two", { summary: "film diary app", url: "https://letterboxd.com" }),
    cand(4, "news", "Unrelated festival news", "cb", {}),
    cand(5, "tip", "Another film tip", "two", { summary: "film" }),
  ];
  const wanted = wordsOf("I want to host a film night");
  const { steps, short } = buildPath({ wanted, answers: { kinds: ["try", "tool"], depth: "quick" }, candidates });
  assert.equal(steps.length, 3);
  assert.equal(short, false);
  assert.deepEqual(new Set(steps.map((step) => step.kind)).size, 3);        // three different kinds first
  assert.ok(steps.every((step) => step.why.length > 0));
  assert.ok(!steps.some((step) => step.title === "Unrelated festival news")); // nothing that fits neither the words nor the asked-for kinds
  assert.ok(steps.every((step) => candidates.some((c) => c.item.id === step.item_id)));
});

test("no more than two steps from one publication; the deeper path asks for five", () => {
  const many = Array.from({ length: 6 }, (_, i) => cand(i + 1, ["tip", "idea", "app"][i % 3], "Film thing " + i, "one", { summary: "film" }));
  const { steps } = buildPath({ wanted: ["film"], answers: { depth: "deep", kinds: ["try"] }, candidates: many });
  assert.ok(steps.length <= 2);                                             // one publication caps at two
  const spread = [...many, ...Array.from({ length: 4 }, (_, i) => cand(10 + i, "idea", "Film idea " + i, "two", { summary: "film" })), ...Array.from({ length: 3 }, (_, i) => cand(20 + i, "tip", "Film tip " + i, "three", { summary: "film" }))];
  assert.equal(buildPath({ wanted: ["film"], answers: { depth: "deep", kinds: [] }, candidates: spread }).steps.length, 5);
});

test("when too little is approved, the path says it is short so the visitor can ask the editor", () => {
  const { steps, short } = buildPath({ wanted: ["ceramics"], answers: { kinds: [], depth: "quick" }, candidates: [cand(1, "tip", "Film tip", "cb", { summary: "film" })] });
  assert.equal(steps.length, 0);
  assert.equal(short, true);
});

const ADS = [
  { id: "house-a", kind: "house", category: "app", title: "App", url: "https://a.example", brands: ["*"], approved: true },
  { id: "house-b", kind: "house", category: "book", title: "Book", url: "https://b.example", brands: ["*"], approved: true },
  { id: "unapproved", kind: "house", category: "tool", title: "Tool", url: "https://c.example", brands: ["*"], approved: false },
  { id: "no-link", kind: "house", category: "book", title: "No link", url: "", brands: ["*"], approved: true },
  { id: "partner", kind: "partner", sponsor: "Acme", category: "tool", title: "Acme", url: "https://acme.example", brands: ["keyosx:publication:cinebon"], approved: true, start: "2026-11-01", end: "2026-11-30" },
];
const NOW = new Date("2026-11-04T10:00:00Z");

test("only owner-approved ads with a link are served; previews show unapproved ones", () => {
  assert.deepEqual(eligibleAds(ADS, { now: NOW, publicationIds: ["keyosx:publication:noize"] }).map((ad) => ad.id), ["house-a", "house-b"]);
  assert.ok(!eligibleAds(ADS, { now: NOW }).some((ad) => ["unapproved", "no-link"].includes(ad.id)));
  assert.ok(eligibleAds(ADS, { now: NOW, preview: true }).some((ad) => ad.id === "unapproved"));
});

test("a live partner ad comes first and is always disclosed as sponsored; otherwise house ads rotate", () => {
  const sponsored = pickAd(ADS, { publicationIds: ["keyosx:publication:cinebon"], context: "issue", now: NOW });
  assert.equal(sponsored.id, "partner");
  assert.equal(sponsored.sponsored, true);
  assert.equal(sponsored.label, "Sponsored by Acme");
  const house = pickAd(ADS, { publicationIds: ["keyosx:publication:noize"], context: "issue", now: NOW });   // partner targets CinéBon only
  assert.equal(house.sponsored, false);
  assert.match(house.label, /^Ad · our (app|book|tool)$/);
  const expired = pickAd(ADS, { publicationIds: ["keyosx:publication:cinebon"], now: new Date("2026-12-05T00:00:00Z") });
  assert.notEqual(expired.id, "partner");                                    // the campaign window closed
  assert.equal(pickAd([], { now: NOW }), null);
});
