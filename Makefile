.PHONY: api build-server client client-export client-phone client-phone-prod client-preview db-down db-status db-up dev-down dev-status dev-up format install-user-services migrate pkmnprices-backfill pkmnprices-status pricecharting-images pricecharting-images-gallery pricecharting-images-status test verify vision-test

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

client-phone-prod:
	cd apps/client && EXPO_PUBLIC_API_URL=http://192.168.1.77:4000 npx expo start --lan --port 8082

client-export:
	cd apps/client && npm run export:web

client-preview: client-export
	cd apps/client && npx expo serve dist --port 8083

db-up:
	docker compose up -d postgres

db-down:
	docker compose down

db-status:
	docker compose ps

install-user-services:
	mkdir -p $(HOME)/.config/systemd/user
	cp deploy/systemd/user/*.service deploy/systemd/user/*.socket deploy/systemd/user/*.timer $(HOME)/.config/systemd/user/
	systemctl --user daemon-reload

dev-up: db-up build-server client-export install-user-services
	systemctl --user start binderledger-api.service binderledger-client-preview.service binderledger-expo.service
	systemctl --user start binderledger-localhost-proxy@4001.socket binderledger-localhost-proxy@8082.socket binderledger-localhost-proxy@8083.socket

dev-down:
	-systemctl --user stop binderledger-localhost-proxy@4001.socket binderledger-localhost-proxy@8082.socket binderledger-localhost-proxy@8083.socket
	-systemctl --user stop binderledger-localhost-proxy@4001.service binderledger-localhost-proxy@8082.service binderledger-localhost-proxy@8083.service
	-systemctl --user stop binderledger-expo.service binderledger-client-preview.service binderledger-api.service
	docker compose down

dev-status:
	docker compose ps
	-systemctl --user is-active binderledger-api.service binderledger-expo.service binderledger-client-preview.service
	-systemctl --user is-active binderledger-localhost-proxy@4001.socket binderledger-localhost-proxy@8082.socket binderledger-localhost-proxy@8083.socket

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
