.PHONY: api build-server client client-export client-phone client-preview client-test client-verify db-down db-status db-up format migrate pkmnprices-backfill pkmnprices-status repository-check test verify vision-test vision-up

api:
	go run ./cmd/api

build-server:
	mkdir -p bin
	go build -o bin/binderledger-api ./cmd/api
	go build -o bin/binderledger-pkmnprices-backfill ./cmd/backfill-pkmnprices

client:
	cd apps/client && npx expo start --web --port 8082

client-phone:
	cd apps/client && npx expo start --lan --port 8082

client-export:
	cd apps/client && npm run export:web

client-preview: client-export
	cd apps/client && npx expo serve dist --port 8083

client-test:
	cd apps/client && npm test

client-verify:
	cd apps/client && npm run verify

db-up:
	docker compose up -d postgres

db-down:
	docker compose down

db-status:
	docker compose ps

vision-up:
	docker compose up -d --build vision

format:
	gofmt -w cmd internal
	cd apps/client && npm run lint -- --fix

migrate:
	go run ./cmd/migrate

pkmnprices-backfill:
	set -a; . ./.env; set +a; go run ./cmd/backfill-pkmnprices

pkmnprices-status:
	set -a; . ./.env; set +a; go run ./cmd/backfill-pkmnprices -status

repository-check:
	bash scripts/check-repository.sh

test: client-test
	go test ./cmd/... ./internal/...
	docker build --target test -t binderledger-vision:test -f services/vision/Dockerfile .
	docker run --rm binderledger-vision:test
	cd tools/justtcg-audit && npm test

verify: repository-check
	go test ./cmd/... ./internal/...
	docker build --target test -t binderledger-vision:test -f services/vision/Dockerfile .
	docker run --rm binderledger-vision:test
	cd tools/justtcg-audit && npm test
	cd apps/client && npm run verify
	go vet ./cmd/... ./internal/...
	go mod tidy -diff

vision-test:
	docker build --target test -t binderledger-vision:test -f services/vision/Dockerfile .
	docker run --rm binderledger-vision:test
