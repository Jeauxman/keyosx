# Tiers and the live "refresh" (design only, not built)

## Decided by Joe, 2026-11-04

KeyOSX is a **live source**. Members can refresh any time to get new news.

- **Free:** the monthly and weekly editions (the issues as they are today), with the ad first.
- **Paid:** more frequent editions, up to **daily**. Daily is a paid option.
- **Premium daily members:** an on-demand **refresh** at any time for new news (the earlier "wild card refresh", first floated at $9.99 a month; final prices not set).
- **Not before December or January.** First the bugs get worked out on the free tiers. Until then there are no accounts, no payments and no paid features.

## What "refresh for new news" means technically

1. **Re-poll the sources.** Almanac skips its usual 24-hour freshness window for that brand and re-reads its feeds. This is free: feeds are plain RSS and cost nothing per call.
2. **Re-supply.** The newest verified headlines are returned. A refresh with no Claude call needs no spend at all.
3. **Optional re-pick.** If the member wants the issue re-chosen, the Claude writer picks again. This is the only costly step, so it is limited per member (for example one every 15 minutes, N a day) and still sits under the global daily cap.
4. **Protect the sources.** A minimum gap between feed reads per brand (shared across members), so a crowd of refreshes never hammers a publisher.

## Open decisions (yours, when you are ready)

- **Is a daily edition private to payers, or shared?** If one payer triggers today's daily issue and everyone can then see it, free visitors get daily for free. Recommended: the daily edition is served only to paying members; free visitors keep weekly or monthly.
- **Refresh limits per member**, and the price of each tier.
- **Do paying members still see the ad first?** (A common choice is no ads on the top tier.)
- **Payment provider** (Stripe suggested, test mode first) and member sign-in (email link suggested).

## The earlier design notes follow.

A paying member can ask for a fresh pass on demand: a re-compose of a brand's current issue or a new personal path, outside the normal schedule.

## Why it is bigger than the media page

It needs three things KeyOSX does not have today: **accounts**, **payments** and a **per-member spending limit**. None of the three should be improvised.

| Piece | What it needs | Decision for Joe |
|---|---|---|
| Accounts | Sign-in for members (email link is simplest). Today only the administrator signs in. | Email-link sign-in, or reuse an existing login? |
| Payments | A payment provider (Stripe is the usual choice): a $9.99 monthly subscription, a customer portal to cancel, webhooks that switch a member on or off. I will not handle card details; the provider does. | Your Stripe account; test mode first. |
| Entitlement | A `members` table (email, status, period end) in the existing database. | None. |
| Limit per member | Each refresh costs a Claude call. Cap it (for example 3 refreshes a month) so $9.99 always covers the cost. The existing daily cap stays above all of it. | How many refreshes per month? |
| Where results go | A refresh built only from verified records is private to that member and needs no approval, because it never goes public. A refresh that should update the public issue stays a draft the owner approves. | Private-to-member, or owner-approved? |

## What it reuses (so it is mostly wiring)

- `POST /api/jack/path` already builds a path from approved items; a paid refresh is the same call with the Claude writer choosing, behind a membership check.
- The Almanac's Claude writer, its caps and its free fallback.
- The labeled ad slot: free visitors see the ad first; whether members see ads is a product choice.

## Suggested order

1. Media page, headlines and monthly covers (done).
2. Members table plus email sign-in (no money yet).
3. Stripe in test mode, one product, webhook sets membership.
4. The refresh endpoint with the per-member monthly limit.
5. Production: set the live Anthropic key and Stripe live keys in the host's environment (never in git), then deploy on your approval.

The live site needs its own environment: the Claude key in `.env.almanac` lives on this computer only. When KeyOSX is hosted, the key goes into the host's environment settings.
