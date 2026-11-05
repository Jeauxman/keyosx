# Almanac sources, by brand (for Joe's review)

Every publication on the rack is now served by the shared Almanac. Each has a profile (`data/profiles/<slug>.json`), an editorial seed pool (`data/almanac/<slug>.seeds.json`)
and, where it makes sense, free news feeds. Written 2026-11-05. **Nothing publishes by itself:** every issue is a draft you approve.

## What each source type is

- **Seed pool:** evergreen tips, ideas, real tools (homepage links only) and generic opportunities, written by Claude for review. No news, no claims about current events. Edit or delete any item.
- **Feeds:** public RSS/Atom feeds. Almanac keeps the **headline, link, source name and date only**. No article text is copied. All were tested on 2026-11-05 (reachable, dated items) and are **enabled**. To switch one off, set `"enabled": false` on it in the brand's profile.
- **Live feed tab:** shown for every brand that has an enabled feed (`data/live-feed.json`), and appears only after that brand's first composition has read its feeds.

## The list (veto any feed by switching it off)

| Brand | Seed items | Feeds |
|---|---|---|
| `mediterraneano` | 20 | The Guardian, Travel; Atlas Obscura; Matador Network |
| `u-man` | 13 | The Guardian, Travel; Skift; Atlas Obscura |
| `bon-voyage` | 13 | Matador Network; The Guardian, Travel; Skift |
| `pride-mediterraneo` | 19 | The Guardian, LGBT; The Advocate; The Guardian, Travel |
| `noize` | 13 | Pitchfork; The Guardian, Music; NPR Music; Stereogum |
| `ispirazione` | 20 | NPR Music; The Guardian, Art and design; Colossal |
| `basil-leaf-chronicles` | 20 | The Guardian, Food; Eater; Smitten Kitchen |
| `eat-stay-love-carcassonne` | 20 | The Local France; The Guardian, Food |
| `carcassonne-monthly` | 13 | The Local France; France 24, Europe; RFI English |
| `dolce-far-niente` | 20 | The Local Italy; The Guardian, Property |
| `zout-salt-journal` | 13 | The Guardian, Business; Economist, Finance; NPR Planet Money |
| `the-libertine` | 20 | Aeon; The Marginalian; The Guardian, Books |
| `au-contraire` | 13 | Aeon; Daily Nous; Psyche |
| `think` | 13 | Aeon; Daily Nous; Philosophy Now; The Marginalian |
| `simultanism` | 20 | Aeon; Colossal; Hyperallergic |
| `synphony-magazine` | 20 | The Guardian, Society; MIT Technology Review; Reasons to be Cheerful |
| `matriarch` | 13 | The 19th; The Guardian, Women |
| `me-dia` | 13 | Podnews; Nieman Lab; The Guardian, Media |
| `troubadour-quarterly` | 20 | The Marginalian; The Guardian, Books; Hyperallergic |
| `the-new-troubadour` | 20 | The Guardian, Books; NPR Music; Colossal |
| `heroes` | 13 | Good News Network; Positive News; Reasons to be Cheerful |
| `audacity` | 20 | Psyche; Positive News |
| `lern` | 20 | MIT News; The Guardian, Education; The Guardian, Business |
| `engineered` | 20 | Ars Technica; IEEE Spectrum; MIT Technology Review; Dezeen |
| `retrofuturism` | 20 | Dezeen; Colossal; MIT Technology Review |
| `intelligent-design` | 20 | Quanta Magazine; The Guardian, Science; Nature News; Science Daily |
| `wshit` | 13 | Podnews; Nieman Lab; NPR Media |
| `daily-shit` | 13 | (seeds only) |

CinéBon's feeds are Letterboxd Journal, IndieWire, Film Comment and The Guardian Film.

## Candidates that did NOT work and were left out

Food52 (rate limited), Serious Eats (404), Lonely Planet (no items), Connexion France (404), Marketplace (no content), Wanted in Rome (404), Italics Magazine (no items),
Mansion Global (404), OpenLearn (403), Edutopia (no items).

## Not checked

The sites' terms of use. Showing a headline, link and source name is common practice, but it has not been cleared with each publisher. Review the list above and switch off any source you are unsure about.

## Daily Shit

Seeds only, no news feeds, by design: it is satire and should never present a real headline as its own.

## Re-running the check

`npm run almanac:dryrun` pushes every brand through the real pipeline with live feeds and no database (free writer). `npm test` runs 52 tests, including one that composes every brand from its seed pool alone.
