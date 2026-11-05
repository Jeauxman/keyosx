# Monthly covers and releases (everything in git)

New covers come out on the **1st of each month**. The plan, the images and the approval all live in this repository, so every cover has a history.

## Who does what

| Role | Job |
|---|---|
| GPT / Codex | Makes each brand's cover image and commits it with its manifest entry (a pull request into `feature/...`, never straight to `main`). |
| Joe | Approves a cover by setting `approved: true`. Nothing is shown before that. |
| Almanac (Claude writer) | Fills the issue and the headlines. It does not make covers. |
| KeyOSX | Shows the cover on its release date: on the rack, in the Almanac's drafts, and on the Media page. |

## What GPT delivers for one cover

1. The image at `public/covers/<slug>/<YYYY-MM>.webp` (e.g. `public/covers/cinebon/2026-12.webp`): portrait about 3:4, **under 400 KB**, the printed masthead reads the brand's name exactly.
2. One entry in `data/covers.json`:

```json
{ "publication": "keyosx:publication:cinebon", "period": "2026-12", "file": "cinebon/2026-12.webp",
  "release": "2026-12-01", "masthead": "CinéBon", "made_by": "gpt", "approved": false }
```

3. `npm run check:covers` passes (file exists, size, masthead matches the brand or an approved alias, one cover per brand per month).
4. Real people's likenesses and studio posters stay out of generated art (see the CinéBon brief). Check the printed words for typos before committing; image generators garble text.

## How a cover goes live

A cover is used only when `approved: true` **and** today is on or after `release`. It stays current until the next month's approved cover is released, so a late
cover never leaves a brand blank. Because weekly brands (CinéBon) get one cover a month, that month's weekly issues all carry the same cover.

Where it shows: first on the **rack** as "This month's cover", then in the Almanac's **cover stage** (so each draft issue is posted with it), then on the **Media** page.
Order of trust for a brand's cover: this plan, then Cloudinary assets with verified `kx:` labels, then the cover Joe supplied.

## Git size

Each cover is a few hundred KB. About 30 brands for 12 months is roughly 100 MB a year, and git keeps every version. That is fine for now. If the repository
gets heavy, move the images to Git LFS or Cloudinary and keep `data/covers.json` as the plan; nothing else changes.

## Nothing generates on a timer

"New release on the 1st" means a cover becomes available. Issues still compose only when someone opens a cover (observation), which keeps the Claude spend to
the cap. A cover committed for the 1st and approved in advance simply starts being used that day.
