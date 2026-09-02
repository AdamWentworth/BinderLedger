# Provider API Policy

BinderLedger uses approved data-provider APIs to power its private catalog,
charts, and collection valuations. Provider content must not be committed,
republished as a raw dataset, exposed as a substitute API, or collected by
bypassing an official interface.

## Integration Boundary

| Source | Role | Automation posture |
| --- | --- | --- |
| JustTCG | Primary catalog and condition-price history | Cached, resumable batches with explicit daily and monthly reserves |
| PkmnPrices | Optional exact-card fallback | Disabled unless the configured plan supports the requested endpoint |
| PokemonPriceTracker | Optional current-condition fallback | Bounded batches with tracked credit usage and a daily reserve |
| Manual references | Operator-reviewed supplementary values | Operator supplied only; no page crawling or scheduled collection |

Plan limits change. The server-local configuration is the authoritative budget,
and it must always be equal to or stricter than the provider's current terms.

## Required Collector Behavior

1. Keep API keys only in ignored server-local environment files. Never place a
   key in a URL, cache key, report, log, screenshot, commit, or client bundle.
2. Use documented APIs or approved bulk endpoints. Do not scrape or crawl a
   provider site.
3. Cache successful responses privately and make imports idempotent so a
   restart resumes existing work.
4. Read usage metadata and response headers, record charged requests or
   credits, and stop before the configured reserve.
5. Never rotate accounts, keys, IPs, or identifiers to evade a provider limit.
6. On `429`, honor `Retry-After` and stop after a bounded retry. On `401` or
   `403`, stop immediately for operator review.
7. Retry transient network and `5xx` failures with bounded exponential backoff
   and jitter; never run an unbounded retry loop.
8. Match exact provider identifiers and printing attributes. Never select a
   card by name alone when multiple printings exist.
9. Keep raw responses, caches, downloaded media, and manual valuation ladders
   outside Git and container images.
10. Preserve provider attribution where required and do not expose provider
    content as a downloadable dataset.

## JustTCG

The collector caches every successful request, checks provider usage before the
next call, and treats forced refresh as an explicit quota-consuming action.
Production enforces a shared, persistent 1,000-request billing-cycle ledger for
both catalog expansion and current-price refresh. Every network attempt is
reserved before it is made, provider-reported usage can only raise the local
count, and the ledger retains a 25-request safety reserve. The billing cycle
resets on the configured account renewal day (currently the 23rd).
Catalog expansion and current-price rotation have separate budgets so they
cannot silently multiply traffic. The historical collector uses a persistent
cache and exits when its approved catalog scope is complete. During initial
catalog expansion, production assigns the free plan's daily allowance to
history collection while retaining the configured daily and monthly safety
reserves. Historical expansion is capped at 30 attempts per scheduled run,
and current-price rotation remains paused until expansion completes. A provider
quota response is never retried: total/monthly exhaustion pauses calls through
the next configured billing-cycle boundary, while daily exhaustion pauses until
the next UTC day.

- [Rate limits](https://justtcg.com/docs/rate-limits)
- [Pricing and plan limits](https://justtcg.com/pricing)
- [Commercial use guidelines](https://justtcg.com/docs/commercial-use)

## PkmnPrices

Fallback requests are narrowed by exact card, condition, currency, and printing
variant. The collector records charged-credit headers and remains disabled
when the configured account does not support history.

- [API documentation](https://www.pkmnprices.com/docs)
- [Terms of service](https://www.pkmnprices.com/terms)

## PokemonPriceTracker

Requests use exact identifiers, track returned consumption metadata, and stop
before the server-local daily reserve. Endpoints that add per-card or history
credits require a fresh plan review before use.

- [API reference](https://www.pokemonpricetracker.com/api-reference)
- [Plans and rate limits](https://www.pokemonpricetracker.com/pokemon-card-price-api)
- [Terms of service](https://www.pokemonpricetracker.com/terms)

## Manual References and Media

Supplementary valuations must be entered by an operator from a source and plan
that permit the intended use. BinderLedger stores source attribution and dated
observations, but the public repository contains no preloaded valuation ladder.

Only assets with an appropriate license or explicit permission may be
distributed. Production media is private operational data and remains outside
Git; source URLs alone do not establish redistribution rights.

## Release Review

Recheck every provider's current documentation and terms before changing plan,
increasing collection frequency, granting outside access, charging money,
adding advertising, training a model, or distributing data or imagery. Record
the decision privately with the deployment configuration.
