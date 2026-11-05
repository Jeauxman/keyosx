import assert from "node:assert/strict";
import test from "node:test";
import { counts, progress, archiveCurrent, emptyTrails, markVisited, setNote, startTrail, stepKey, summarize, MAX_NOTE, MAX_PAST } from "../public/trail.js";

const at = (hour) => new Date(`2026-11-05T${String(hour).padStart(2, "0")}:00:00Z`);
const step = (id, extra = {}) => ({ publication_id: "keyosx:publication:cinebon", publication_name: "CinéBon", issue_id: 1, item_id: id, kind: "tip", title: "Tip " + id, url: "", ...extra });

test("a delivered path becomes a trail with every step planned and nothing visited", () => {
  const trails = startTrail(emptyTrails(), "host a film night", [step(1), step(2, { kind: "app", url: "https://letterboxd.com" })], at(9));
  assert.equal(trails.current.intent, "host a film night");
  assert.deepEqual(counts(trails.current), { planned: 2, visited: 0, found: 0, ahead: 2, notes: 0 });
  assert.equal(trails.current.steps[1].url, "https://letterboxd.com");
});

test("opening a planned step ticks it off; opening anything else is recorded as found along the way", () => {
  let trails = startTrail(emptyTrails(), "film night", [step(1), step(2)], at(9));
  trails = markVisited(trails, step(1), at(10));
  trails = markVisited(trails, step(99, { title: "A surprise" }), at(11));
  trails = markVisited(trails, step(1), at(12));                              // opening twice keeps the first time
  assert.deepEqual(counts(trails.current), { planned: 2, visited: 2, found: 1, ahead: 1, notes: 0 });
  assert.equal(trails.current.steps[0].visited_at, at(10).toISOString());
  assert.equal(trails.current.steps.at(-1).planned, false);
});

test("with no trail yet, the first thing opened starts one called Browsing", () => {
  const trails = markVisited(emptyTrails(), step(5), at(9));
  assert.equal(trails.current.intent, "Browsing");
  assert.equal(counts(trails.current).found, 1);
});

test("what you learned is saved per step, cleaned and limited", () => {
  let trails = markVisited(startTrail(emptyTrails(), "x", [step(1)], at(9)), step(1), at(10));
  trails = setNote(trails, stepKey(step(1)), "  Silent films   need live music.  ");
  assert.equal(trails.current.steps[0].note, "Silent films need live music.");
  trails = setNote(trails, stepKey(step(1)), "a".repeat(500));
  assert.equal(trails.current.steps[0].note.length, MAX_NOTE);
  assert.equal(setNote(emptyTrails(), "k", "n").current, null);               // no trail, nothing to write on
});

test("the wrap-up lists what was found, what was learned and what is still ahead", () => {
  let trails = startTrail(emptyTrails(), "host a film night", [step(1), step(2, { title: "MUBI", kind: "app" }), step(3, { title: "Cine-club", kind: "opportunity" })], at(9));
  trails = setNote(markVisited(trails, step(1), at(10)), stepKey(step(1)), "Start with the sound off.");
  const text = summarize(trails.current);
  assert.match(text, /My trail: host a film night/);
  assert.match(text, /Looked at 1 of 3 planned/);
  assert.match(text, /1\. Tip: Tip 1 \(CinéBon\)\n\s+What I learned: Start with the sound off\./);
  assert.match(text, /Still ahead\n\s+- App: MUBI/);
  assert.match(text, /Next: MUBI/);
  const done = markVisited(markVisited(trails, step(2, { title: "MUBI", kind: "app" }), at(11)), step(3, { title: "Cine-club", kind: "opportunity" }), at(12));
  assert.match(summarize(done.current), /Trail complete/);
});

test("starting a new trail keeps the old one only if something was opened; the past is capped", () => {
  const untouched = startTrail(startTrail(emptyTrails(), "one", [step(1)], at(9)), "two", [step(2)], at(10));
  assert.equal(untouched.past.length, 0);                                     // nothing visited, nothing to keep
  let trails = emptyTrails();
  for (let i = 0; i < MAX_PAST + 3; i++) trails = startTrail(markVisited(trails, step(i), at(9)), "trail " + i, [step(100 + i)], at(10));
  assert.equal(trails.past.length, MAX_PAST);
  const ended = archiveCurrent(markVisited(startTrail(emptyTrails(), "z", [step(1)], at(9)), step(1), at(10)), at(11));
  assert.equal(ended.current, null);
  assert.equal(ended.past[0].intent, "z");
});

test("progress counts planned steps apart from things found on the side", () => {
  let trails = startTrail(emptyTrails(), "x", [step(1), step(2)], at(9));
  trails = markVisited(markVisited(trails, step(1), at(10)), step(99, { title: "Side find" }), at(11));
  assert.equal(progress(trails.current), "1 of 2 planned, plus 1 found along the way");
  assert.match(summarize(trails.current), /Looked at 1 of 2 planned, plus 1 found along the way\./);
  assert.equal(progress(markVisited(emptyTrails(), step(5), at(9)).current), "1 thing");
});

test("unsafe links are dropped from a trail", () => {
  const trails = startTrail(emptyTrails(), "x", [step(1, { url: "javascript:alert(1)" })], at(9));
  assert.equal(trails.current.steps[0].url, "");
});
