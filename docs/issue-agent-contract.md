# Editorial agent contract (KeyOSX <-> Codex)

KeyOSX does not generate issues. When a visitor **first opens a cover in a new period**
(week / month / quarter, per the publication's `cadence` in `data/entities.json`), KeyOSX asks the
publication's editorial agent to compose that period's issue. One request per publication per period.

## 1. Request (KeyOSX -> agent webhook, `ISSUE_GENERATOR_URL`)

`POST` JSON, header `Authorization: Bearer <AGENT_API_TOKEN>`:

```json
{
  "publication_id": "keyosx:publication:cinebon",
  "name": "CinéBon",
  "beat": "Cinephile news, tips, ideas and apps for film lovers.",
  "cadence": "weekly",
  "period_key": "W2026-11-02",
  "issue_date": "2026-11-04",
  "callback": "/api/agent/issues"
}
```

Reply `2xx` immediately; do the work asynchronously (the visitor is told the issue is being composed).

## 2. Response (agent -> KeyOSX)

`POST {KeyOSX origin}{callback}` with the same bearer token:

```json
{
  "publication_id": "keyosx:publication:cinebon",
  "title": "Week of 2 Nov 2026",
  "issue_date": "2026-11-04",
  "status": "published",
  "cover_url": "https://res.cloudinary.com/dmsdspzbo/image/upload/.../cinebon-2026-w45.png",
  "items": [
    { "kind": "tip", "title": "...", "summary": "...", "url": "https://source", "featured": true }
  ]
}
```

Rules enforced by the server: `issue_date` is `YYYY-MM-DD`; `kind` is one of
`news|tip|idea|app|opportunity|other`; urls must be `http(s)`; max 60 items; re-posting the same
`publication_id + issue_date + title` replaces that issue's items. Mark exactly **three** items
`featured: true` — those are Jack Rabbit's opening picks. Set `issue_date >=` the period start or the
issue will not count as current.

## 3. Content rules for the agent

- **Cover:** generate a new masthead-consistent cover each period and upload it to Cloudinary
  (cloud `dmsdspzbo`); send its HTTPS URL as `cover_url`. Keep the printed masthead identical to the
  publication name; existing covers are the style reference.
- **`news` items need a real source `url`.** Never invent news. If no verified source, use `tip`, `idea`
  or `opportunity`, which are editorial.
- Fit the publication's `beat`; keep titles short; summaries 1-3 sentences.
- Never send `is_sample: true` for real issues.

## 4. Open decisions

- Auto-publish vs. draft-then-approve (`status: "draft"` is supported; there is no approval UI yet).
- Where `ISSUE_GENERATOR_URL` is hosted (Codex runtime, or a small relay) — it must be reachable from the
  Hostinger server.
