FROM golang:1.26.6-bookworm AS build

WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download

COPY cmd ./cmd
COPY internal ./internal

ARG TARGETOS=linux
ARG TARGETARCH=amd64
RUN CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} go build -trimpath -ldflags="-s -w" -o /out/binderledger-api ./cmd/api \
    && CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} go build -trimpath -ldflags="-s -w" -o /out/binderledger-migrate ./cmd/migrate \
    && CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} go build -trimpath -ldflags="-s -w" -o /out/binderledger-healthcheck ./cmd/healthcheck \
    && CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} go build -trimpath -ldflags="-s -w" -o /out/binderledger-import-justtcg ./cmd/import-justtcg \
    && CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} go build -trimpath -ldflags="-s -w" -o /out/binderledger-refresh-justtcg ./cmd/refresh-justtcg \
    && CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} go build -trimpath -ldflags="-s -w" -o /out/binderledger-record-valuations ./cmd/record-valuation-snapshot

FROM debian:bookworm-slim

RUN apt-get update \
    && apt-get install --yes --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 binderledger \
    && useradd --uid 10001 --gid 10001 --create-home --shell /usr/sbin/nologin binderledger

COPY --from=build /out/* /usr/local/bin/

USER binderledger
WORKDIR /app
EXPOSE 4000
ENTRYPOINT ["/usr/local/bin/binderledger-api"]
