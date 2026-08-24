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

Set `HTTP_ADDR` and `CORS_ALLOWED_ORIGINS` in that local file to the trusted LAN
addresses required by the phone, then enable the API at boot:

```bash
systemctl --user enable --now binderledger-api.service
```

Metro is intentionally opt-in because it is considerably heavier than the API.
Start it while testing the Expo Go client and stop it when finished:

```bash
systemctl --user start binderledger-expo.service
systemctl --user stop binderledger-expo.service
```

Expo's Node server normally opens a dual-stack wildcard listener. The committed
Node preload pins Expo and the static preview to `BINDERLEDGER_BIND_HOST` from
the local server environment, preventing accidental exposure over public IPv6.
