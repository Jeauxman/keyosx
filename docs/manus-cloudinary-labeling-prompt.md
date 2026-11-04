# Prompt for Manus: label and categorize the Cloudinary library for KeyOSX

Paste everything below the line into Manus.

---

**Role:** You are cataloguing Joe's Cloudinary media library so the KeyOSX kiosk (a magazine rack of living publications) can find the right covers and images by publication, type and issue. You are **organizing, not editing**: do not delete, rename, move, re-upload, overwrite or change any existing asset, public_id, folder or existing tag.

**Account:** Cloudinary cloud name `dmsdspzbo` (about 770 images, plus any videos/raw files). Use the Admin/Search API with the credentials already configured in your environment. **Never print, log or save the API key/secret anywhere in your output.**

## The one rule that matters most

**Classify by what is visibly printed on the image, not by its existing tags or filename.** Existing tags are often wrong. Known examples already found:
- Many images tagged `Mediterraneano` actually carry the masthead **THE LIBERTINE** or **MATRIARCH**.
- Images tagged `Crow's Quill`/`understanding` book covers are actually **HOSTELLES** magazine covers.
- A "Renaissance Women" cover has a **LIBERTINE** masthead with an ME+DÍA badge.
- Some "Travel Buddy" covers print **U-MAN**; some "Basil Leaf Chronicles" covers print **AUDE CHRONICLES**.
So open each cover and read its masthead. Record exactly what you read.

## Publications (use these slugs)

`mediterraneano`, `the-libertine`, `matriarch`, `me-dia` (printed ME+DÍA), `au-contraire`, `noize`, `synphony-magazine`, `cinebon` (printed CinéBon), `carcassonne-monthly`, `eat-stay-love-carcassonne`, `troubadour-quarterly`, `u-man`, `aude-chronicles`, `hostelles`, `zout-salt-journal` (Zout / Salt Journal).
**Fuller registry:** Joe's master list of 70 names is in the attached `registry.json`. Every entry has one permanent `id` (`keyosx:<type>:<slug>`); use that **slug** in your tags (e.g. `keyosx:publication:the-honest-liar` -> `kx:pub:the-honest-liar`; agents and brands -> `kx:brand:<slug>`). Many names there (Heroes, Audacity, Dolce Far Niente, Spinster, True America, Nîmes in France, Cité Films, etc.) may have artwork under tags that do not match; find it by the printed title. Names with no artwork simply get no assets. Entries with a `flags` note (possible duplicates or renames) should be tagged with the entry they most likely belong to and called out in the manifest, not silently merged.

If a cover shows a magazine title **not on this list**, do not force it: use `kx:pub:unlisted` and put the printed title in `masthead`. Non-magazine brands (IREFS, GoCarcassonne, FREG, HomeLink, AI Masterclass, Joe Business, etc.) use `kx:brand:<slug>` instead.

## What to add (additive tags and context only)

For every asset, **add** these tags (keep all existing tags untouched):
- `kx:pub:<slug>` or `kx:brand:<slug>` (one primary; use `kx:related:<slug>` for secondary)
- `kx:type:<one of>` `cover` | `book-cover` | `social-graphic` | `poster` | `logo` | `album-art` | `infographic` | `screenshot` | `photo` | `video` | `other`
- `kx:issue:<short issue/cover title>` for covers (e.g. `kx:issue:summer-2026`), lowercase-hyphenated
- `kx:status:<one of>` `candidate` | `needs-review` | `do-not-use`
- `kx:dup:<asset_id>` if it is a visual duplicate/near-duplicate of a better "canonical" asset (point to the canonical one; do not delete the duplicate)

Also set Cloudinary **contextual metadata** (`context`) on covers: `kx_masthead` = the exact printed title, `kx_issue` = issue/cover title, `kx_confidence` = `high` | `medium` | `low`.

**Respect holds:** any asset that already carries `hold-not-approved`, `do-not-promote` or `true-americans-excluded` must get `kx:status:do-not-use` and must never be tagged `candidate`.

**Rights flag:** add `kx:rights:check` to any image showing an identifiable real person who is not Joe, a studio/film poster or still, or a third-party logo. When unsure, flag it.

**Uncertainty:** if you cannot read the masthead or are below ~80% sure, set `kx:status:needs-review`, `kx_confidence=low`, and say why in the manifest. Never guess a publication to fill a gap.

## Process: two phases, and stop between them

**Phase 1: dry run (write nothing to Cloudinary).** Produce a CSV manifest, one row per asset, with columns:
`asset_id, public_id, resource_type, secure_url, asset_folder, existing_tags, proposed_tags, kx_masthead, kx_issue, confidence, rights_flag, duplicate_of, notes`
plus a short summary: counts per publication, per type, per status, number needing review, number of duplicates, and a list of any masthead titles you saw that are not on the publication list. Show me a sample of 20 rows including at least 5 covers where the existing tags disagreed with the printed masthead.

**Stop and wait for my explicit "apply" before Phase 2.**

**Phase 2: apply** the approved tags and context in small batches (about 50 at a time), re-reading each asset afterward to confirm only the `kx:` tags and `kx_` context were added. If any call fails, log it and continue; do not retry destructively. Finish with an apply report (done / failed / skipped) and the final CSV.

## Hard limits

- No deletions, renames, moves, overwrites, re-uploads or transformations of originals. No changes to non-`kx` tags.
- Do not generate new images, and do not post anything anywhere.
- Do not invent facts about an image. If it is blank, abstract or unreadable, tag `kx:type:other` and `kx:status:needs-review`.
- Keep my API credentials out of the manifest, logs and chat.

**Deliverable:** the Phase 1 CSV and summary first. Nothing is written to Cloudinary until I say "apply".
