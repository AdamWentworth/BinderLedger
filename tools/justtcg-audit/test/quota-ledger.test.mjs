import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { JustTcgQuotaLedger, QuotaLedgerError, monthlyQuotaCycle } from "../src/quota-ledger.mjs";

test("monthly cycles follow the configured billing day", () => {
  const beforeReset = monthlyQuotaCycle(new Date("2026-09-22T23:59:00Z"), 23);
  assert.equal(beforeReset.start.toISOString(), "2026-08-23T00:00:00.000Z");
  assert.equal(beforeReset.end.toISOString(), "2026-09-23T00:00:00.000Z");

  const afterReset = monthlyQuotaCycle(new Date("2026-09-23T00:00:00Z"), 23);
  assert.equal(afterReset.start.toISOString(), "2026-09-23T00:00:00.000Z");
  assert.equal(afterReset.end.toISOString(), "2026-10-23T00:00:00.000Z");
});

test("ledger persists attempts and stops before the monthly reserve", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "binderledger-quota-"));
  const filename = path.join(directory, "quota.json");
  const now = () => new Date("2026-09-01T12:00:00Z");

  try {
    const first = new JustTcgQuotaLedger({
      filename,
      monthlyRequestLimit: 3,
      monthlyRequestReserve: 1,
      monthlyResetDay: 23,
      now,
    });
    await first.reserveRequest();

    const restarted = new JustTcgQuotaLedger({
      filename,
      monthlyRequestLimit: 3,
      monthlyRequestReserve: 1,
      monthlyResetDay: 23,
      now,
    });
    await restarted.reserveRequest();
    await assert.rejects(restarted.reserveRequest(), QuotaLedgerError);

    const state = JSON.parse(await readFile(filename, "utf8"));
    assert.equal(state.requestAttempts, 2);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("configured pause blocks all calls until its timestamp", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "binderledger-quota-"));
  const now = () => new Date("2026-09-01T12:00:00Z");

  try {
    const ledger = new JustTcgQuotaLedger({
      filename: path.join(directory, "quota.json"),
      configuredBlockedUntil: new Date("2026-09-23T07:00:00Z"),
      now,
    });
    await assert.rejects(ledger.reserveRequest(), /operator-configured quota pause/);
    const status = await ledger.status();
    assert.equal(status.requestAttempts, 0);
    assert.equal(status.blockedUntil.toISOString(), "2026-09-23T07:00:00.000Z");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("provider total-limit response blocks the rest of the billing cycle", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "binderledger-quota-"));
  const now = () => new Date("2026-09-01T12:00:00Z");

  try {
    const ledger = new JustTcgQuotaLedger({
      filename: path.join(directory, "quota.json"),
      monthlyResetDay: 23,
      now,
    });
    const status = await ledger.blockFromProviderResponse("Total request limit exceeded");
    assert.equal(status.blockedUntil.toISOString(), "2026-09-23T00:00:00.000Z");
    await assert.rejects(ledger.reserveRequest(), QuotaLedgerError);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
