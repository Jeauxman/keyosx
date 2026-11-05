# Deploying KeyOSX to Hostinger

**Status, 2026-11-05: DEPLOYED to keyosx.com.** Joe approved replacing the live site. Build `01a1a96c-679c-7088-b784-1f693cdb4c75` (commit `3ef43e3`, bundle `keyosx-deploy-bundle-3ef43e3.zip`) completed in 8.7 s and the app restarted. Public checks passed: home, media page, 29 rack covers, catalog 83 works, the local test admin password is refused. Not pushed to GitHub.

**Corrections to the original plan (found by looking at the live site read-only):** the live keyosx.com was **not a different site**. It was the earlier build of this same Express app (`main` at `02255be`, deployed 2026-09-13 as `keyosx-deploy.zip`, Node 22, entry `server.mjs`). A database (`u498008058_keyosx`) and the 8 environment variables (NODE_ENV, DB_*, ADMIN_PASSWORD, ADMIN_SESSION_SECRET) already existed, so nothing new was created. The new code upgraded the old database layout in place when tested locally: 6 new tables added, all existing data untouched.

**Rollback:** in hPanel → Deployments, switch back to the previous build `01a099cf-bc5c-7169-ba09-ceb78cd501ce`, or redeploy `keyosx-ROLLBACK-previous-main-02255be.zip` (built from `main`). The new tables can stay; the old code ignores them.

**Still to do (Joe, in hPanel):** add the Almanac variables (`ALMANAC_INLINE=on`, `AGENT_API_TOKEN`) so issues compose; optionally the Claude variables. Until then the kiosk, media page, path maker, trail and covers work, but covers do not compose new issues. Click **Export backup** in the live admin console to snapshot the upgraded database. Approve ads in `data/ads.json` when ready.

(The sections below are the original plan, kept for reference.)

## 1. How it gets there: git is the source of truth

| Path | What happens | Who runs it |
|---|---|---|
| **A. Git (recommended)** | The branch is pushed to GitHub (`Jeauxman/keyosx`). Hostinger deploys that exact commit (hPanel Deployments from a repository, or Codex via "Hand these steps to Codex"). Every deploy is a commit you can name and roll back to. | Joe approves the push; Codex or hPanel deploys |
| **B. Zip (fallback)** | `keyosx-deploy-bundle-<commit>.zip` is built from committed files only and uploaded in hPanel. | Joe or Codex |

Claude prepares the code and this plan. Claude is **not** connected to Hostinger (its tools failed to connect) and does not deploy. Codex is connected to the site as its agent. Use one deployer at a time so two agents never overwrite each other.

## 2. What is live now (from your hPanel screenshots)

- Site `keyosx.com`, Business Web Hosting, created 2026-07-17, Codex connected as agent.
- ~~The live homepage is a different site~~ **Correction:** it was the earlier build of this same app (see the status above).
- ~~Database: None~~ **Correction:** the live site already had a database and its environment variables (the hPanel card only said "None" for a separate connection field).
- The 2026-10-27 scan flagged `proxy-addr 2.0.7`, `body-parser 1.20.8`, `qs 6.16.0`. KeyOSX already carries the patched versions (`proxy-addr 2.0.8`, `body-parser 1.20.9`, `qs 6.17.1`; `npm audit` reports 0).

**Recommendation:** deploy first to a **staging** website (a second Hostinger site or a subdomain such as `staging.keyosx.com`), check it, then point `keyosx.com` at it or deploy the same commit there.

## 3. Before anything: checklist

- [ ] Joe decides: replace what is live at keyosx.com? (yes / only staging first)
- [ ] **Back up what is live** (hPanel → Files → download the site, or Backups). Keep it until the new site has run a week.
- [ ] Tests pass on the commit being deployed (`npm test`: 46 pass) and `npm run check` is clean.
- [ ] Decide the "Follow the rabbit" clip (18.9 MB, not in git): host on Cloudinary or compress. Without it the Jack Rabbit banner simply hides.
- [ ] Ads: `data/ads.json` has `approved: false` on every ad, so **no ad shows in production until Joe sets `approved: true`** and commits. (The ad-first slot is empty until then.)
- [ ] Morning Shit cover still missing (a placeholder shows).

## 4. Database

1. hPanel → Databases → MySQL: create a database and a user. Note name, user, password.
2. The app creates all tables on first start and **seeds the 83-work catalog automatically** when the database is empty. Nothing to import.
3. From the app the host is `127.0.0.1`, port `3306` (not the `srv…hstgr.io` address, which is only for outside connections).

## 5. Environment variables (hPanel → Environment variables)

Names only here. **Never put values in git.** A blank template is `docs/hostinger.env.template`.

| Variable | Value | Notes |
|---|---|---|
| `NODE_ENV` | `production` | Required. Turns on Secure cookies and refuses to start without the two secrets below. |
| `DB_HOST` / `DB_PORT` | `127.0.0.1` / `3306` | |
| `DB_USER` / `DB_PASSWORD` / `DB_NAME` | from step 4 | |
| `ADMIN_PASSWORD` | long and unique | Admin console. Not the local test password. |
| `ADMIN_SESSION_SECRET` | 48+ random characters | e.g. `openssl rand -base64 48`. |
| `TRUST_PROXY` | `1` | Keeps rate limits per visitor behind Hostinger's proxy (tested). |
| `ALMANAC_INLINE` | `on` | Runs the Almanac inside this one app, so there is only one Node app. |
| `AGENT_API_TOKEN` | 48+ random characters | Shared secret for the Almanac webhook and drafts. |
| `ALMANAC_STATE_DIR` | a writable folder | Holds the Claude spend counter. |
| `ALMANAC_WRITER`, `ALMANAC_ALLOW_PAID`, `ANTHROPIC_API_KEY` | `llm`, `yes`, your key | **Optional.** Leave all three unset to run on the free writer. The key is Joe's, set only here. |
| `ALMANAC_MODEL`, `ALMANAC_DAILY_CALLS`, `ALMANAC_DAILY_TOKENS` | `claude-haiku-5-5`, `40`, `150000` | The hard daily caps. |
| `PORT` | set by Hostinger | Do not override. |
| **Do not set** | `ADS_PREVIEW`, `LIVE_FEED`, `ALMANAC_FEEDS` | Local preview switches. CinéBon's feeds are enabled in its profile. |

`ISSUE_GENERATOR_URL` and `KEYOSX_ORIGIN` default to the app's own loopback address when `ALMANAC_INLINE=on`.

## 6. Deploy (path A, git)

1. Joe approves pushing `feature/publication-rack` to GitHub (it is not merged to `main`).
2. In hPanel (or through Codex) connect the repository, branch `feature/publication-rack`, to the **staging** site.
3. Node.js app settings: Node **22**, install `npm install --omit=dev`, start `npm start` (runs `node server.mjs`), entry file `server.mjs`.
4. Set the environment variables (section 5), then deploy.
5. Watch Runtime logs for: `The Almanac is running inside this app` and `Living kiosk listening`.

Path B: upload the zip, extract in the app folder, run the same install and start.

## 7. Smoke test after deploy

- [ ] `/` shows the night-kiosk home with the Jack Rabbit video behind the header and a rack of 29 covers (the 18.9 MB clip is absent, so the Jack banner is hidden).
- [ ] `/media.html` loads; `/daily-shit.html` loads.
- [ ] Open CinéBon: cover stories and the Live feed tab show (the Live feed is empty until the first composition reads the feeds).
- [ ] Admin sign-in works with the new password; **the local test password does not**.
- [ ] Open the CinéBon cover once: a draft appears under "Issues awaiting approval" within a minute. Approve it; visitors then see it.
- [ ] `GET /api/almanac/health` (with the token) reports `ok`; with the Claude writer on it shows `claude:claude-haiku-5-5` and today's spend.
- [ ] Hit `/api/jack/path` from two networks: neither is rate-limited by the other.

## 8. Rollback

- **Git path:** redeploy the previous commit or tag in hPanel/Codex. Nothing else changes.
- **Staging path:** the live site was never touched, so rollback is "do nothing".
- **If production was replaced:** restore the backup from step 3.
- The database is new, so there is no old data to restore.

## 9. Not part of this deploy

Member accounts, payments and the premium refresh (planned for December or January); the Follow clip unless hosted; any other brand's Almanac sources (only CinéBon has them); the Cloudinary labels (waiting on Joe's "apply" to Manus).
