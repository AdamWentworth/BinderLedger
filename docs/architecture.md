# BinderLedger Architecture

## Shape

BinderLedger is a universal application for cataloging and valuing legacy
trading cards. Its first scope is English Pokémon cards from the Wizards of the
Coast era through the EX era, before Diamond and Pearl.

- `apps/client`: Expo and React Native application for web, iOS, and Android
- `cmd/api`: Go JSON API
- `cmd/migrate`: embedded PostgreSQL migrations
- `services/vision`: Python/OpenCV/Tesseract image recognition worker
- `tools/justtcg-audit`: JustTCG discovery and historical collection utility
- PostgreSQL: cards, print variants, conditions, watchlists, and observations

## Boundaries

The Expo client owns presentation, device capabilities, local interaction
state, and API caching. The Go API owns catalog rules, portfolio calculations,
data-ingestion orchestration, and stable JSON contracts. PostgreSQL is the
source of truth.

The current private-LAN MVP has no authentication or account boundary.
Authentication and authorization become API responsibilities before any
external or multi-user deployment.

The vision worker receives queued scan images through PostgreSQL-backed jobs
and returns ranked candidates with confidence and evidence. It does not own
user catalogs or prices. Recognition results remain suggestions that a user
confirms or edits.

The first personal feature is a local default watchlist. It stores exact card
printings and set editions rather than condition-specific variants, so the same
saved item follows the user's NM, LP, MP, HP, or Damaged market preference. The
watchlist overview composes these identities with existing catalog quality
rules and market history. Future account work will add ownership and named
lists without changing the saved-item identities.

## Data Collection

The JustTCG audit tool and its downloaded responses remain the durable raw
source. `cmd/import-justtcg` normalizes collected set files into PostgreSQL sets,
cards, exact printings, conditions, current prices, and daily observations. The
import uses stable provider IDs and conflict updates, so it is safe to rerun.

Production ingestion uses two rate-aware one-shot containers scheduled by
systemd. During bootstrap, a resumable historical collector receives the full
sustainable request budget and expands the approved legacy scope from its
persistent cache. Once all approved sets are present, it yields the budget to a
rotating 30-day catch-up job that upserts current and daily observations.
Provider metadata, per-run budgets, and daily/monthly reserves protect the
shared free-tier quota. PostgreSQL remains the durable catalog and observation
store; Redis is not required for these background jobs.

## Deployment Posture

Production uses the dedicated PostgreSQL service in
`ops/prod/docker-compose.yml`, with persistent data under
`/mnt/storage/binderledger`. The optional root Compose file provides an isolated
development database for explicit backend work. The primary development
machine normally runs only Expo and targets the private-LAN production API.

The API, vision worker, and static Expo web export run as hardened containers.
Systemd timers launch quota-aware collector jobs and backups, while the
self-hosted GitHub Actions runner deploys immutable SHA-tagged images after
successful CI.

Metro runs only on the primary frontend development machine, where hot reload
serves both the browser and Expo Go. Production serves the static web export
through nginx and never runs Metro.
