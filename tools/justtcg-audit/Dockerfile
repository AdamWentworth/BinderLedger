FROM golang:1.26-bookworm AS importer-build

WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY cmd/import-justtcg ./cmd/import-justtcg
COPY internal ./internal
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" \
    -o /out/binderledger-import-justtcg ./cmd/import-justtcg

FROM node:22-bookworm-slim

RUN apt-get update \
    && apt-get install --yes --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 binderledger \
    && useradd --uid 10001 --gid 10001 --create-home --shell /usr/sbin/nologin binderledger

WORKDIR /app
COPY tools/justtcg-audit/package.json ./package.json
COPY tools/justtcg-audit/config ./config
COPY tools/justtcg-audit/src ./src
COPY tools/justtcg-audit/scripts/run-production-legacy-collection.sh /usr/local/bin/
COPY --from=importer-build /out/binderledger-import-justtcg /usr/local/bin/

USER binderledger
ENTRYPOINT ["/usr/local/bin/run-production-legacy-collection.sh"]
