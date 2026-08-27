import test from "node:test";
import assert from "node:assert/strict";

import {
  isSealedProduct,
  mergeSummaries,
  qualityFindings,
  uniqueCards,
  validatePrintingFamilyCoverage,
} from "../src/collection-analysis.mjs";
import { kantoCollectionTargets, legacyTarget } from "../src/collection-targets.mjs";

test("collection helpers deduplicate inventory and identify sealed products", () => {
  const card = { id: "card-1", variants: [{ condition: "Near Mint" }] };
  const deduplicated = uniqueCards([card, { ...card, name: "latest provider record" }]);
  assert.equal(deduplicated.length, 1);
  assert.equal(deduplicated[0].name, "latest provider record");
  assert.equal(isSealedProduct({ variants: [{ condition: "Sealed" }] }), true);
  assert.equal(isSealedProduct(card), false);
});

test("printing-family coverage requires every card in each configured family", () => {
  const cards = [
    {
      variants: [
        { printing: "Unlimited Holofoil" },
        { printing: "1st Edition Holofoil" },
      ],
    },
    {
      variants: [
        { printing: "Unlimited Normal" },
        { printing: "1st Edition Normal" },
      ],
    },
  ];
  const target = { requiredPrintingFamilies: ["Unlimited", "1st Edition"] };

  assert.deepEqual(validatePrintingFamilyCoverage(cards, target, "Example Set"), {
    Unlimited: { cards: 2, variants: 2 },
    "1st Edition": { cards: 2, variants: 2 },
  });
  assert.throws(
    () => validatePrintingFamilyCoverage(cards.slice(0, 1).concat({ variants: [] }), target, "Example Set"),
    /edition coverage is incomplete/,
  );
});

test("quality findings retain sparse-history and condition inversion checks", () => {
  const findings = qualityFindings([
    {
      id: "card-1",
      name: "Example",
      variants: [
        {
          printing: "Unlimited",
          condition: "Near Mint",
          language: "English",
          price: 5,
          priceHistory: [{ t: 1_700_000_000, p: 5 }],
        },
        {
          printing: "Unlimited",
          condition: "Lightly Played",
          language: "English",
          price: 10,
          priceHistory: [{ t: 1_700_000_000, p: 10 }],
        },
      ],
    },
  ]);

  assert.equal(findings.filter((finding) => finding.type === "very_sparse_history").length, 2);
  assert.equal(findings.filter((finding) => finding.type === "condition_price_inversion").length, 1);
});

test("summary merging and target overrides preserve collection manifests", () => {
  const merged = mergeSummaries([
    {
      cards: 2,
      variants: 3,
      variantsWithCurrentPrice: 2,
      conditionCounts: { "Near Mint": 2 },
      printingCounts: { Unlimited: 3 },
      earliestHistoryDate: "2026-02-01",
    },
    {
      cards: 1,
      variants: 2,
      variantsWithCurrentPrice: 2,
      conditionCounts: { "Near Mint": 1, Damaged: 1 },
      printingCounts: { Unlimited: 1, "1st Edition": 1 },
      earliestHistoryDate: "2026-01-01",
    },
  ]);

  assert.equal(merged.cards, 3);
  assert.equal(merged.variants, 5);
  assert.deepEqual(merged.conditionCounts, { "Near Mint": 3, Damaged: 1 });
  assert.deepEqual(merged.printingCounts, { Unlimited: 4, "1st Edition": 1 });
  assert.equal(merged.earliestHistoryDate, "2026-01-01");

  assert.equal(kantoCollectionTargets.length, 8);
  assert.deepEqual(legacyTarget({ id: "base-set-pokemon" }).expectedPrintings, ["Unlimited"]);
  assert.equal(legacyTarget({ id: "neo-genesis-pokemon" }).scope, "Legacy Pokemon catalog before Diamond and Pearl");
});
