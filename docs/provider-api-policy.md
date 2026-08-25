# Pricing Provider API Policy

Last reviewed: 2026-08-24

BinderLedger is currently a personal, non-commercial project. Provider data is
stored to power BinderLedger's catalog, charts, and collection valuations. It
must not be republished as a raw dataset, exposed as a substitute pricing API,
or collected by bypassing a provider's API.

## Operational Limits

| Provider | BinderLedger role | Current plan limit | BinderLedger automation limit | Reset |
| --- | --- | --- | --- | --- |
| JustTCG | Primary catalog and condition-price history | Free: 1,000 requests/month, 100/day, 10/minute, 20 cards/request | Current-price refresh: at most 15 requests/day, at least 6.5 seconds apart; stop with 5 daily and 100 monthly requests in reserve | Daily at 00:00 UTC; monthly on account creation day |
| PkmnPrices | Current-price fallback; historical backfill after a Pro upgrade | Free: 100 credits/day and 60 requests/minute; the history endpoint requires Pro | History disabled on Free; otherwise at least 1.25 seconds between requests and at most 80 tracked credits/day | Daily at 00:00 UTC |
| PokemonPriceTracker | Current condition fallback and short recent history | Free: 100 credits/day, 60 requests/minute, 3 days of history | At least 1.25 seconds between requests; at most 80 tracked credits/day | Daily at 00:00 UTC |
| PriceCharting | Manually reviewed valuation snapshots and printing-specific image backfills | Paid pricing API only; one API call/second; one CSV call/10 minutes | No scheduled page collection; private image backfills use cached set indexes, at least 5 seconds between index requests, and at least 1 second between image assets | Subscription dependent |
| Bulbagarden | Manual discovery of exact-printing replacement images | Public MediaWiki pages and Archives API | No scheduled collection; at least 1 second between discovery requests; download only reviewed originals | Not applicable |

The internal limits are intentionally below provider limits. The unused margin
covers manual diagnostics, retries, another machine using the same account, and
small differences between local and provider-side accounting.

## Required Collector Behavior

1. Keep API keys only in the ignored root `.env`; never log keys or include them
   in URLs, cache keys, reports, commits, screenshots, or client bundles.
2. Cache durable responses and make imports idempotent. A restart must resume
   existing work instead of downloading completed pages again.
3. Read provider usage metadata or response headers and record charged usage.
4. Stop before the BinderLedger daily budget. Never rotate keys or accounts to
   evade a provider limit.
5. On `429`, honor `Retry-After` when supplied and stop the run after a bounded
   retry. On `401` or `403`, stop immediately and require operator review.
6. Retry transient network and `5xx` failures with bounded exponential backoff
   and jitter. Never run an unbounded retry loop.
7. Use exact provider or TCGplayer IDs for fallback records. Do not select a card
   by name alone when multiple printings exist.
8. Prefer provider APIs and official bulk endpoints. Do not scrape or crawl a
   provider website when its terms prohibit it or an API is available.

## Provider Notes

### JustTCG

JustTCG responses include plan, monthly, daily, and per-minute usage metadata.
The collector caches every successful request, checks remaining quota before the
next network call, and treats `--fresh` as an explicit quota-consuming action.
The Free tier is limited to personal and non-commercial work. A public or paid
BinderLedger release requires a paid plan and another terms review.

The production refresher is separate from bootstrap collection. It requests no
price history, batches up to 20 stable card UUIDs, and rotates the least recently
refreshed catalog cards. The conservative 15-request daily budget leaves room
for the still-active legacy-set bootstrap; reconsider it after bootstrap is
complete, but never exceed the documented provider quota or configured reserves.

JustTCG assigns some theme-deck products to `Deck Exclusives` instead of their
printed set. Exact-ID aliases and legacy variants requiring later review are
tracked in [`deck-exclusive-audit.md`](deck-exclusive-audit.md).

- [Rate limits](https://justtcg.com/docs/rate-limits)
- [Pricing and plan limits](https://justtcg.com/pricing)
- [Commercial use guidelines](https://justtcg.com/docs/commercial-use)

### PkmnPrices

The Free key can resolve exact cards and retrieve current English USD prices,
but an authenticated check on 2026-08-24 UTC returned `403 Price history
requires Pro or higher` for the history endpoint. The public API reference did
not state that gate beside the endpoint, so BinderLedger records the observed
restriction here and keeps `PKMNPRICES_HISTORY_ENABLED=false` on Free.

After a Pro upgrade, history costs one credit per row returned, not one credit
per HTTP request. A single date can produce several rows unless requests are
narrowed by condition, currency, and printing variant. BinderLedger requests one
exact condition and variant at a time, uses fixed-size resumable pages, and
records the `X-Credits-Charged` response header. The terms prohibit scraping
outside the API and attempts to circumvent allocated rate limits.

- [API documentation and rate limits](https://www.pkmnprices.com/docs)
- [Terms of service](https://www.pkmnprices.com/terms)

### PokemonPriceTracker

Basic card data costs one credit per card. History and eBay/graded data add
credits per card. Responses expose consumption and daily remaining-credit
headers. The Free plan permits personal and non-commercial use and only three
days of history; commercial use requires the plan stated in the current terms.

- [API reference](https://www.pokemonpricetracker.com/api-reference)
- [Plans and rate limits](https://www.pokemonpricetracker.com/pokemon-card-price-api)
- [Terms of service](https://www.pokemonpricetracker.com/terms)

### PriceCharting

PriceCharting's official pricing API requires a paid subscription, is limited
to one call per second, and provides current values rather than historical
prices or sales. BinderLedger stores dated, manually reviewed reference values
with source URLs. Every UI that displays those references must identify
PriceCharting and provide a visible link to the exact source page. The private
personal-use deployment must not become accessible to third parties without
written PriceCharting permission or replacement data.

Manual reviews are also written to `catalog_valuation_observations`, including
checks where the amount did not change. The local monthly review workflow may
prepare cohorts and accept operator-entered snapshots, but it must not fetch
PriceCharting pages from a scheduled process. See
[`graded-price-monitoring.md`](graded-price-monitoring.md).

The private MVP also has a manual, resumable collector for printing-specific
card images that other catalog APIs conflate. It reads printing rows from
cached PriceCharting set indexes, records page and image provenance plus a
checksum, and leaves every image disabled until a visual review is explicitly
approved. It is not scheduled and must not be added to a timer. The default
collector limits are five seconds between PriceCharting index pages, one second
between Google-hosted image assets, and ten new assets per invocation. A public
or App Store release must obtain permission or replace these assets first.

- [API documentation and limits](https://www.pricecharting.com/api-documentation)
- [Terms of service](https://www.pricecharting.com/page/terms-of-service)

### Bulbagarden

Bulbapedia card pages are used as a discovery index for manually curated image
replacements. Resolve the page's image filename through the Bulbagarden
Archives MediaWiki API, download the original rather than a thumbnail, and
verify the visible card number, edition, finish, and Base Set copyright line.
The collector workflow is manual and must not be scheduled. See
[`image-curation.md`](image-curation.md) for the acceptance rules.

## Release Review

Recheck every linked page before changing plan, increasing collection frequency,
shipping BinderLedger to outside users, charging money, adding advertising, or
using provider data for machine-learning training. Record the review date and
updated limits in this document.
