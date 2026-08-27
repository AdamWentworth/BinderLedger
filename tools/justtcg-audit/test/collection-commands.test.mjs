import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { createCollectionCommands } from "../src/collection-commands.mjs";

const conditions = [
  "Near Mint",
  "Lightly Played",
  "Moderately Played",
  "Heavily Played",
  "Damaged",
];

test("Machamp collection preserves its exact product IDs and condition contract", async () => {
  const outputDirectory = await mkdtemp(path.join(tmpdir(), "binderledger-commands-"));
  const responseCards = ["107004", "42425"].map((tcgplayerId, index) => ({
    id: `machamp-${index + 1}`,
    name: "Machamp",
    tcgplayerId,
    variants: conditions.map((condition) => ({
      printing: "1st Edition Holofoil",
      language: "English",
      condition,
      price: 10,
      priceHistory: [
        { t: 1_700_000_000, p: 9 },
        { t: 1_731_536_000, p: 10 },
      ],
    })),
  }));
  const calls = [];
  const client = {
    latestMetadata: null,
    async get(endpoint, query, options) {
      calls.push({ endpoint, query, options });
      return { data: responseCards };
    },
  };
  const commands = createCollectionCommands({
    client,
    fresh: true,
    outputDirectory,
    services: {},
    discoverSets: async () => ({ selected: [] }),
  });

  try {
    await commands.collectMachampAliases();

    assert.equal(calls.length, 1);
    assert.equal(calls[0].query.q, "Machamp");
    const report = JSON.parse(
      await readFile(
        path.join(outputDirectory, "specials", "base-set-machamp.json"),
        "utf8",
      ),
    );
    assert.deepEqual(report.request.tcgplayerProductIds, ["107004", "42425"]);
    assert.deepEqual(report.cards.map((card) => card.tcgplayerId), ["107004", "42425"]);
  } finally {
    await rm(outputDirectory, { recursive: true, force: true });
  }
});
