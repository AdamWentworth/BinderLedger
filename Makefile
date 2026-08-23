.PHONY: api client client-export client-preview db-up format migrate test verify

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

test:
	go test ./cmd/... ./internal/...
	cd apps/client && npm run lint

verify: test
	go vet ./cmd/... ./internal/...
	cd apps/client && npx expo-doctor
