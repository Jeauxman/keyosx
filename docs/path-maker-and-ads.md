# Jack Rabbit path maker and the ad slot

## Path maker (ask, then deliver)

1. The visitor asks Jack something. The reply offers **Make me a path**.
2. Jack asks **two quick questions** with buttons (what would help: try / tool / new / act; how big: 3 or 5 steps), or the visitor skips them.
3. `POST /api/jack/path` returns a path built **only from items the owner has already approved and published**. Each step says why it was chosen. At most two steps
   per publication, different kinds first.
4. If too little is approved, the path says so and offers **Ask the editor to cover this**. That is the existing visitor request: a draft the owner approves.

No model, no cost: the questions are scripted and ranking is word overlap (`pathmaker.mjs`). A model could write the questions or the "why" lines later, only with the
owner's approval.

## The ad slot (ad first, always labeled)

Before an open issue and before a path, one ad shows at the top (`GET /api/ads/next`). It is never styled as content.

- **House ads** (our books, apps, tools): label `Ad · our app|book|tool`.
- **Partner ads** (paid): label `Sponsored by <sponsor>`, link `rel="sponsored"`. A live partner ad takes priority over house ads and can be limited to chosen
  brands and a start/end window.
- Served only when the **owner sets `approved: true`** in `data/ads.json` and the ad has a real link. `ADS_PREVIEW=on` shows unapproved ads on a local copy only.
- The inventory starts with Buddy Talk and AskJoe (both live). The Simultanism book ad needs its link. Add each book with its real link; nothing is invented.

Labeling partner and house promotion as ads is deliberate: it keeps the kiosk honest with visitors and is expected under advertising-disclosure rules.

Not built yet: impression/click counts, a partner booking screen, and the same ad-first rule for outbound social posts and newsletters (that belongs to the social publisher).
