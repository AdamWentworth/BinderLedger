# BinderLedger Production Runner

GitHub self-hosted runners are repository-scoped. After the `BinderLedger`
repository exists, open **Settings > Actions > Runners > New self-hosted runner**
and follow GitHub's Linux x64 commands in a new directory such as:

```bash
mkdir -p /srv/binderledger/actions-runner-binderledger
cd /srv/binderledger/actions-runner-binderledger
```

During `config.sh`, assign these custom labels in addition to the defaults:

```text
prod,binderledger
```

Install the generated service and verify it is online:

```bash
sudo ./svc.sh install adam
sudo ./svc.sh start
sudo ./svc.sh status
```

The deploy workflow requires labels `self-hosted`, `linux`, `x64`, `prod`, and
`binderledger`. Never reuse a runner registration token after setup; GitHub makes
it short-lived intentionally.
