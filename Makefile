.PHONY: api build-server client client-export client-phone client-preview db-up format migrate pkmnprices-backfill pkmnprices-status pricecharting-images pricecharting-images-gallery pricecharting-images-status test verify vision-test

api:
	go run ./cmd/api

build-server:
	mkdir -p bin
	go build -o bin/binderledger-api ./cmd/api
	go build -o bin/binderledger-pkmnprices-backfill ./cmd/backfill-pkmnprices

client:
	cd apps/client && npm run web

client-phone:
	cd apps/client && npx expo start --lan --port 8082

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
	docker build --target test -t binderledger-vision:test -f services/vision/Dockerfile .
	docker run --rm binderledger-vision:test
	cd tools/justtcg-audit && npm test
	cd apps/client && npm run typecheck
	cd apps/client && npm run lint

verify: test
	go vet ./cmd/... ./internal/...
	go mod tidy -diff
	cd apps/client && npx expo-doctor

vision-test:
	docker build --target test -t binderledger-vision:test -f services/vision/Dockerfile .
	docker run --rm binderledger-vision:test
