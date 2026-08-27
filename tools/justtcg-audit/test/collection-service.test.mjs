import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { createCollectionService } from "../src/collection-service.mjs";

test("collection service paginates inventory without using network-specific globals", async () => {
  const calls = [];
  const client = {
    async get(endpoint, query, options) {
      calls.push({ endpoint, query, options });
      if (query.offset === 0) {
        return { data: [{ id: "card-1" }], meta: { hasMore: true, limit: 1 } };
      }
      return { data: [{ id: "card-2" }], meta: { hasMore: false, limit: 1 } };
    },
  };
  const outputDirectory = await mkdtemp(path.join(tmpdir(), "binderledger-collector-"));

  try {
    const service = createCollectionService({ client, fresh: false, outputDirectory });
    const cards = await service.fetchSetCards("example-set");

    assert.deepEqual(cards.map((card) => card.id), ["card-1", "card-2"]);
    assert.deepEqual(calls.map((call) => call.query.offset), [0, 1]);
    assert.equal(calls.every((call) => call.endpoint === "/cards"), true);
    assert.equal(calls.every((call) => call.options.cache === true), true);
  } finally {
    await rm(outputDirectory, { recursive: true, force: true });
  }
});
