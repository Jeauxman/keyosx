# Almanac and the publication agents

One shared **Almanac** knows and researches. Each brand has its own **publication agent** that decides what that brand publishes. This is
Emergent Publishing in practice: observation requests composition, knowledge is supplied, the owner approves, KeyOSX shows the Living Edition
and keeps its history. Everything here lives on `feature/publication-rack`. Nothing is deployed, published or billed.

```
observation (visitor opens a cover in a new period)
        |
   KeyOSX  --webhook-->  almanac/server.mjs  (one service, many brands)
                               |
          publication agent (almanac/engine.mjs + the brand's profile)
             | asks                                  | decides, composes
             v                                       v
   ALMANAC (almanac/knowledge.mjs)          outline -> cover -> items   (each a DRAFT)
   discover, verify, organize,                        |
   remember, update, supply                           v
   memory = KeyOSX `knowledge_records`        owner approves in admin -> visitors see it
```

## Principles (do not change)

| Principle | How it is enforced |
|---|---|
| Truthfulness | `news` exists only when retrieved from a listed source this run, with its link and date. Rejected otherwise. No source, no news. Every record stores *what its verification supports*, e.g. "the headline and link exist at that source". |
| Continuity | Everything discovered is remembered with source, date and verification notes in `knowledge_records` (one database, no second store). Issue revisions keep history. |
| Control | Agents post drafts only (the server ignores any `status`). Owner approval publishes. The paid model writer is disabled. Nothing is generated or posted anywhere outside KeyOSX. |

## Almanac's six jobs (`almanac/knowledge.mjs`)

1. **Discover**: gathers candidates for one brand from its profile: editorial seeds and, if enabled, live feeds.
2. **Verify**: source on the brand's list, dated and inside the news window, link is http(s), not a duplicate. Verdict plus notes are stored.
3. **Organize**: tags by brand, kind and topic.
4. **Remember**: `POST /api/agent/knowledge` into `knowledge_records` (unchanged records only refresh `last_checked_at`).
5. **Update**: revisits remembered records: news past the window and links that return 404/410 become `outdated` and stop being supplied. A 403/405/429 is "unknown", not dead.
6. **Supply**: `GET /api/agent/knowledge?brand=&verified=1` returns active, verified records to publication agents (later Jack Rabbit and others).

**No timers, no continuous generation.** Almanac researches only when a brand's knowledge is requested and is stale (profile `knowledge.refresh_hours`,
default 24). A request inside that window reuses memory and makes no outside call. Visitors cannot trigger research: observation is rate limited and one
request is made per publication per period.

## Publication agent (`almanac/engine.mjs`)

- Reads the brand's profile (`data/profiles/default.json` + `data/profiles/<slug>.json` + the entity's beat and cadence).
- Gets supplied knowledge from Almanac; the editor (`almanac/writers/template.mjs`) selects by the profile's mix, rotates the evergreen pool by period, puts live
  news first, and marks exactly three featured items of different kinds. Output is validated against the content rules before anything is posted.
- Posts stages to `/api/agent/issues`. Visitor requests (`type: "visitor_request"`) are answered as a draft revision of the current issue from supplied
  knowledge only; if nothing fits it posts nothing and says so in the log.
- Refuses a brand with no editorial sources (HTTP 422, recorded by KeyOSX as a failed request) instead of padding an issue.
- Cover: `almanac/assets.mjs` connects covers **by verified identity**: (1) a cover Joe supplied (`registry.cover_assets.rack`), or (2) a Cloudinary asset tagged
  `kx:pub:<slug>` + `kx:type:cover`, with context `kx_masthead` equal to the printed masthead or an approved alias, `kx_confidence` high, and no
  `kx:status:needs-review` / `do-not-use`. Those labels only exist after the Manus pass is applied, so until then (1) is used. If neither exists the issue
  posts without a cover. This is also the **FlintBill hand-off seam**: artwork preparation plugs in here; nothing is generated today.
- Writers: `template` (default, no cost). `llm` is a documented stub that throws until the owner approves paid use (`ALMANAC_ALLOW_PAID=yes`) and an adapter is added.

## Adding a brand

1. `data/profiles/<slug>.json` (identity, voice, mix, cover policy, `sources`).
2. Its evergreen pool in `data/almanac/<name>.seeds.json`, and/or feeds in the profile. Without either, the engine will not compose for it.
3. Set the entity's `editorial_agent` to `keyosx:agent:almanac`. No new service, no new database.

Only **CinéBon** is configured. Its four candidate feeds (Letterboxd Journal, IndieWire, Film Comment, The Guardian Film) were reachable on 2026-11-04 and are
**off by default**: set `ALMANAC_FEEDS=on` or `enabled: true` once you approve third-party links. Feeds supply a title, link, source and date only; no article
text is copied and the summary says who reported it and when.

## Run it locally

```bash
npm run almanac        # the shared service on :8787 (reads .env)
npm start              # KeyOSX on :3000, with ISSUE_GENERATOR_URL=http://localhost:8787 and the same AGENT_API_TOKEN
npm test               # 24 tests: core + the Almanac layers, the CinéBon cycle against a stand-in KeyOSX
```

## First CinéBon cycle, verified locally (2026-11-04)

Real KeyOSX + MySQL + the shared service, feeds on: observe -> request `completed`; Almanac discovered 85 candidates, verified 82 (3 rejected), remembered 85;
three draft revisions posted (outline, cover, items) with visitors seeing nothing; owner approved the items revision and the open cover showed 10 items,
3 featured, cover and stage "items"; a second observation in the same week composed nothing new; a visitor request ("hosting a silent film night") came back as
revision 4, a draft, while revision 3 stayed published.

## Not done yet

- Media stage (audio/video) and generated artwork (FlintBill): the seam exists, nothing is generated.
- Model-backed writing and per-item source records inside issue revisions.
- Other brands' profiles and seeds (CinéBon is the proof; each brand needs its own sources).
- Jack Rabbit supplying from Almanac knowledge directly (it still answers only from approved issue items).
- Hosting for the service and any deploy: needs your approval.
