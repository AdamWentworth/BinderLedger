# User Services

These units assume the repository is checked out at `~/src/BinderLedger`. The
unit files use systemd's `%h` home-directory specifier, while the collection
script derives the repository root from its own location.

Build the binaries used by the services:

```bash
make build-server
```

Install or refresh the user units:

```bash
mkdir -p ~/.config/systemd/user
cp deploy/systemd/user/*.service deploy/systemd/user/*.timer ~/.config/systemd/user/
systemctl --user daemon-reload
```

Enable only the timers needed for unfinished collection work:

```bash
systemctl --user enable --now pokemon-card-kanto-collection.timer
systemctl --user enable --now binderledger-pkmnprices-backfill.timer
```

Both collectors are resumable and quota-aware. Disable a timer after its
backfill completes rather than leaving a no-op network job scheduled.

For phone access, keep machine-specific network settings outside the repository:

```bash
mkdir -p ~/.config/binderledger
cp deploy/systemd/user/binderledger-server.env.example ~/.config/binderledger/server.env
```

Set `HTTP_ADDR` to the machine's trusted LAN address on development port `4001`
and set `CORS_ALLOWED_ORIGINS` for Expo on `8082` and the static preview on
`8083`. Start the dedicated development database before enabling the API:

```bash
make db-up
systemctl --user enable --now binderledger-api.service
```

The Expo service runs phone-only Metro for Expo Go. The browser uses an exported
static build so Metro does not retain both web and Android bundles on this
memory-constrained server. Start or stop them independently when needed:

```bash
systemctl --user start binderledger-expo.service
systemctl --user start binderledger-client-preview.service
systemctl --user stop binderledger-expo.service
systemctl --user stop binderledger-client-preview.service
```

The `binderledger-localhost-proxy@.socket` units expose those same development
services on loopback without binding them to every network interface. `make
dev-up` starts localhost listeners on `4001`, `8082`, and `8083`, so the web
preview is also available at `http://localhost:8083`.

From the repository root, `make dev-up`, `make dev-status`, and `make dev-down`
manage the isolated database and development processes together. These commands
do not operate on `/srv/binderledger` or its production Compose project.

Expo's Node server normally opens a dual-stack wildcard listener. The committed
Node preload pins Expo and the static preview to `BINDERLEDGER_BIND_HOST` from
the local server environment, preventing accidental exposure over public IPv6.
