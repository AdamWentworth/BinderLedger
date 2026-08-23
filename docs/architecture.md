# BinderLedger Architecture

## Shape

BinderLedger is a greenfield universal application for cataloging and valuing legacy trading cards. Its first scope is English Pokemon cards from Wizards of the Coast through the EX era, before Diamond and Pearl.

- `apps/client`: Expo and React Native application for web, iOS, and Android
- `cmd/api`: Go JSON API
- `cmd/migrate`: embedded PostgreSQL migrations
- `tools/justtcg-audit`: the preserved JustTCG discovery and historical collection utility
- PostgreSQL: cards, print variants, conditions, holdings, folders, watchlists, and price observations
- Future Python service: image recognition and condition suggestions

## Boundaries

The Expo client owns presentation, device capabilities, local interaction state, and API caching. The Go API owns authorization, catalog rules, portfolio calculations, data ingestion orchestration, and stable JSON contracts. PostgreSQL is the source of truth.

The future ML service will receive images through a narrow authenticated API and return a prediction with confidence and evidence. It will not own user catalogs or prices. Condition results remain suggestions that a user can accept or edit.

## Data collection

The existing JustTCG audit tool and its downloaded responses remain the durable raw source. `cmd/import-justtcg` normalizes collected set files into PostgreSQL sets, cards, exact printings, conditions, current prices, and daily price observations. The import uses stable provider IDs and conflict updates, so it is safe to rerun after collection.

The next ingestion milestone is a rate-aware scheduled collector followed by this normalization step. Durable job scheduling should use PostgreSQL-backed jobs so this machine does not need Redis merely to run background work.

## Deployment posture

This repository includes a standalone PostgreSQL Compose service for development elsewhere. On this constrained server, BinderLedger reuses the already-running PostgreSQL container with a separate role and database, avoiding another resident database process.

The API and collector should eventually become systemd services with conservative startup ordering and restart backoff. The Expo web export can be served as static files behind the existing reverse proxy.

During development on this server, export the web client and run `expo serve` instead of leaving Metro resident. Metro remains appropriate on the primary development laptop, where hot reload is worth its larger transient memory use.
