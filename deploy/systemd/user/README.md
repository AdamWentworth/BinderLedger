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
