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
  "cover_url": "https://res.cloudinary.com/dmsdspzbo/image/upload/.../cinebon-2026-w45.png",
  "items": [
    { "kind": "tip", "title": "...", "summary": "...", "url": "https://source", "featured": true }
  ]
}
```

**Agents cannot publish.** Every agent post becomes a *draft revision*; any `status` field from an agent token is ignored. The owner publishes a revision with `POST /api/admin/issues/:id/publish` (administrator session; `GET /api/admin/issues/pending` lists drafts). Re-posting the same `publication_id + issue_date + title` adds a new revision; earlier revisions and their items are kept, and visitors keep seeing the published revision until the owner approves the new one.

Rules enforced by the server: `issue_date` is `YYYY-MM-DD`; `kind` is one of
`news|tip|idea|app|opportunity|other`; urls must be `http(s)`; max 60 items; Mark exactly **three** items
`featured: true` — those are Jack Rabbit's opening picks. Set `issue_date >=` the period start or the
issue will not count as current.

### Staged issues (the issue "prints" in layers)

An agent may post the same issue (same `publication_id + issue_date + title`) several times, once per **stage**, each a full
cumulative snapshot and each its own draft revision. Add `"stage"` to the body:

| stage | requires | visitors see once the owner approves it |
|---|---|---|
| `outline` | items with `kind` + `title` (no summaries needed) | the planned list, "Cover being made" placeholder |
| `cover` | `cover_url` | the cover |
| `items` (default) | items with summaries/urls | the written stories |
| `media` | `media_url` (http(s); `.mp4/.webm/.mov` plays inline, otherwise a link); optional `media_poster_url` | the video |

Approving a later revision also covers earlier ones. Visitors never see unapproved content, only the *names* of stages awaiting
approval ("awaiting editor"); the open cover refreshes itself every 15 seconds. Omitting `stage` behaves as `items`, so one-shot agents still work.
`scripts/mock-generator.mjs` posts all four stages a few seconds apart as a reference.

### Visitor requests (Jack Rabbit -> the publication's agent)

Jack Rabbit routes what a visitor says to the publication whose genre fits and answers **only from approved, published items**.
If the visitor asks the editor to cover something, KeyOSX stores a request and sends the **same webhook** with `"type": "visitor_request"`
(composition requests now carry `"type": "issue_request"`):

```json
{ "type": "visitor_request", "request_id": 7, "from": "keyosx:agent:jack-rabbit",
  "publication_id": "keyosx:publication:cinebon", "name": "CinéBon", "beat": "...", "cadence": "weekly",
  "period_key": "W2026-11-02", "issue_date": "2026-11-04",
  "intent": "hosting a silent film night",
  "current_issue": { "title": "Week of 2 Nov", "issue_date": "2026-11-02", "items": [ ... ] },
  "callback": "/api/agent/issues" }
```

Answer by posting a **revision of the current issue** (same `title + issue_date`; include the existing `items` plus the new ones) with
`"request_id": 7`. If `current_issue` is null, post the period's issue as usual. As with everything else it is saved as a **draft**; the
owner approves it, and only then does it reach the rack. The request becomes `answered` once a draft linked to it arrives. Visitors are told
exactly that: "it only appears after the editor approves it". The same content rules apply (no unsourced news).

## 3. Content rules for the agent

- **Cover:** generate a new masthead-consistent cover each period and upload it to Cloudinary
  (cloud `dmsdspzbo`); send its HTTPS URL as `cover_url`. Keep the printed masthead identical to the
  publication name; existing covers are the style reference.
- **`news` items need a real source `url`.** Never invent news. If no verified source, use `tip`, `idea`
  or `opportunity`, which are editorial.
- Fit the publication's `beat`; keep titles short; summaries 1-3 sentences.
- Never send `is_sample: true` for real issues.

## 4. Request lifecycle (server side)

Visitors opening a cover triggers a deliberate `POST /api/publications/:id/observe` (JSON, 10/min per client); plain `GET` views write nothing.
Each publication+period has a request: `queued -> running -> completed` or `failed`. A failed or silent request is retried on a later
observation (backoff 5 min x attempts; a queued/running request with no result after 60 min is retried; max 5 attempts).
The request becomes `completed` when the agent posts a draft for that period (draft still awaits owner approval).

## 5. Open decisions

- Where the editorial service is hosted (provider-independent; reachable from the Hostinger server).
- An approval screen in the admin UI (today approval is the API call above).
- Living digital issue vs. fixed, versioned, printable edition: this branch only covers the living issue.
