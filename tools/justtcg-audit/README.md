# BinderLedger JustTCG Audit

Small, dependency-free tools used to evaluate and collect JustTCG coverage for
BinderLedger. The initial scope is English Pokemon cards released from the
original era through the end of the EX era, excluding Diamond & Pearl.

## Setup

Requires Node.js 20.6 or newer. No `npm install` is needed.

```bash
cd /home/adam/src/BinderLedger/tools/justtcg-audit
ln -s ../../.env .env
```

The repository root `.env` contains the JustTCG key and is linked into this
directory. The environment file, API cache, and generated reports are ignored
by Git.

The Free plan permits 10 requests per minute. The collector therefore requires
at least 6 seconds between requests, defaults to 6.5 seconds, and stops before
the final daily requests. See `docs/provider-api-policy.md` for the complete
quota and data-use policy.

## Commands

```bash
npm run check-key
npm run discover
npm run sample
npm run collect-base
npm run collect-kanto
npm run collect-machamp
npm test
```

- `check-key` makes one uncached request and reports the plan and remaining quota.
- `discover` makes one request, proposes sets based on `config/scope.json`, and
  writes `output/set-discovery.md` for review.
- `sample` queries Base Set and Base Set (Shadowless) Charizard with
  `priceHistoryDuration=1y`, then compares Unlimited, Shadowless, and First
  Edition history for every returned condition.
- `collect-base` saves the complete Base Set and Base Set (Shadowless) provider
  datasets, including all daily history points. Together these contain Base Set
  Unlimited, Shadowless Unlimited, and First Edition cards. The command also
  flags sparse histories and condition-price inversions for later correction.
- `collect-kanto` collects Jungle, Fossil, Team Rocket, Gym Heroes, Gym
  Challenge, Base Set 2, Legendary Collection, and WoTC Promos. It saves each
  completed set independently and resumes from cached pages after a daily quota
  reset. The promo provider set is mixed Kanto and Johto and is classified later.
- `collect-machamp` retrieves the two Base Set Machamps by exact TCGplayer ID
  from JustTCG's Deck Exclusives grouping. The scheduled Kanto job runs this
  first and the Go importer maps the histories onto the canonical cards.
- `audit` walks all selected sets, requests one year of history, and writes a
  coverage report. It can take more than one day on Free. Responses are cached,
  so rerunning the command resumes without spending requests on completed pages.

Add `-- --fresh` to `discover`, `sample`, or `audit` to bypass cached responses.
Do not use `--fresh` casually during the full audit because it consumes quota.

## Outputs

Generated JSON and Markdown live in `output/`. API responses are cached under
`.cache/`; both directories are intentionally excluded from version control.

The proposed scope is date-based. Review `output/set-discovery.md`, then use
`manualIncludeSetIds` and `manualExcludeSetIds` in `config/scope.json` to handle
promos, trainer kits, POP series, or incorrectly dated provider sets.
