# KeyOSX

**KeyOSX** is the master living kiosk for every work Joe has built, is building, or is planning — Almanac, Noize, Big Fish Social/E5, GAEM, Carcassonne brands, real-estate systems, books, applications, and everything else, each retaining its own identity and function as a searchable **work** within the catalog.

**Jack Rabbit** is KeyOSX's universal search-and-retrieval guide. It searches the complete published catalog, finds related works, explains their status and history, and directs visitors to the correct active website, application, document, or future concept.

This is not a local city guide. The prior single-location "living kiosk" (locations, listings, businesses, events, news for one city or postal code) was Almanac's content model. KeyOSX reuses that codebase's technical foundation — Node.js, Express, SQLite, a deterministic offline assistant — but is refactored around **works, brands, artifacts, relationships, timelines, and Old/Current/Future status**, not places.

## The model

| Concept | What it is |
|---|---|
| **Work** | The base unit of the catalog: a brand, platform, engine, ecosystem, application, service, book, document, or concept. Everything else attaches to a work. |
| **Status** | Every work is `old`, `current`, or `future` — plus a free-text `status_detail` for nuance ("Live, in rotation", "Needs manual review", "Concept only — no spec yet"). |
| **Artifact** | A document, codebase, spec, deck, dataset, image, video, book, or link attached to a work, with an optional reference label instead of a raw file path. |
| **Relationship** | A directed link between two works (`module_of`, `part_of_catalog`, `powered_by`, `sibling_of`, `successor_of`, `predecessor_of`, `depends_on`, `inspired`, `licenses_to`, `distinct_from`). This is how KeyOSX disambiguates things like the two live "FlintBill" threads — one a shipped engine, one an unbuilt education concept — instead of collapsing them into one record. |
| **Timeline** | Dated events (`created`, `launched`, `rebuilt`, `renamed`, `status_change`, `retired`, `planned`, `milestone`, `note`) recording a work's history. |

Jack Rabbit answers only from published works, artifacts, relationships, and timeline entries — it never invents a status, URL, or relationship. Every seeded record is currently flagged `needs_review` because it was compiled by Claude from source documents (the ME•DÍA OS spec, prior KeyOSX/Almanac/IREFS snapshots, and project memory), not entered directly by Joe — replace that flag from the admin console once a record is confirmed.

## Quick start

```bash
cp .env.example .env
# Edit .env and set ADMIN_PASSWORD and ADMIN_SESSION_SECRET.
npm install
npm run seed
npm start
```

The service listens on `http://localhost:3000` unless `PORT` is set. Open the site, browse or search the catalog, ask Jack Rabbit a question, or sign in as **Administrator** to manage works, artifacts, relationships, and timeline entries.

A development-only administrator password (`keyosx-local-admin`) is active only when `NODE_ENV` is not `production` — never use it for a public deployment.

## Project layout

| Path | Purpose |
|---|---|
| `server.mjs` | Express server, public APIs, administrator APIs, password session handling, static-file delivery. |
| `db.mjs` | SQLite schema (works, artifacts, relationships, timeline_events, settings), validation, seed routine, and CRUD helpers. |
| `assistant.mjs` | Jack Rabbit's offline, catalog-grounded response logic and optional OpenAI enhancement. |
| `public/` | The public kiosk and administrator UI. |
| `data/seed-data.json` | Version-controlled seed catalog — works, artifacts, relationships, and timeline entries compiled from source documents. |
| `scripts/seed.mjs` | Explicit seed/reset command (`node scripts/seed.mjs --force` to reseed a non-empty database). |
| `test/` | Node test suite covering the catalog model and Jack Rabbit's behavior. |

## What's next

- Replace `needs_review: true` records with verified entries once Joe confirms them.
- Decide keyosx.com's deployment target (Hostinger static hosting can't run this Node/SQLite service as-is — it needs Node hosting or a container).
- Flesh out Almanac's own content model as its own work-plus-artifacts, separate from this catalog layer.
- Spec out Almanac 2.0, the future concept currently earmarked for this domain.
