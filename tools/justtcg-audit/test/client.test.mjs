import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { JustTcgClient, JustTcgQuotaError } from "../src/justtcg-client.mjs";

test("client stops before consuming the daily request reserve", async () => {
  let requests = 0;
  const server = createServer((request, response) => {
    requests += 1;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({
      data: [],
      _metadata: {
        apiDailyRequestsRemaining: 5,
        apiRequestsRemaining: 500,
      },
    }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const cacheDirectory = await mkdtemp(path.join(tmpdir(), "binderledger-justtcg-"));

  try {
    const client = new JustTcgClient({
      apiKey: "test-key",
      baseUrl: `http://127.0.0.1:${address.port}`,
      cacheDirectory,
      requestIntervalMs: 0,
      dailyRequestReserve: 5,
    });
    await client.get("/first", {}, { cache: false });
    await assert.rejects(
      client.get("/second", {}, { cache: false }),
      JustTcgQuotaError,
    );
    assert.equal(requests, 1);
  } finally {
    server.close();
    await rm(cacheDirectory, { recursive: true, force: true });
  }
});
