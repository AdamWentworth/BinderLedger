.PHONY: api client client-export client-preview db-up format migrate pkmnprices-backfill pkmnprices-status pricecharting-images pricecharting-images-gallery pricecharting-images-status test verify

api:
	go run ./cmd/api

client:
	cd apps/client && npm run web

client-export:
	cd apps/client && npm run export:web

client-preview: client-export
	cd apps/client && npx expo serve dist --port 8081

db-up:
	docker compose up -d postgres

format:
	gofmt -w cmd internal
	cd apps/client && npm run lint -- --fix

migrate:
	go run ./cmd/migrate

pkmnprices-backfill:
	set -a; . ./.env; set +a; go run ./cmd/backfill-pkmnprices

pkmnprices-status:
	set -a; . ./.env; set +a; go run ./cmd/backfill-pkmnprices -status

pricecharting-images:
	go run ./cmd/backfill-pricecharting-images -max=0

pricecharting-images-gallery:
	go run ./cmd/backfill-pricecharting-images -gallery-dir=data/image-review

pricecharting-images-status:
	go run ./cmd/backfill-pricecharting-images -status

test:
	go test ./cmd/... ./internal/...
	cd apps/client && npm run lint

verify: test
	go vet ./cmd/... ./internal/...
	cd apps/client && npx expo-doctor
