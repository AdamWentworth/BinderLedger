import { analyzeCard, summarizeCards } from "./analysis.mjs";

export const conditionOrder = [
  "Near Mint",
  "Lightly Played",
  "Moderately Played",
  "Heavily Played",
  "Damaged",
];

export function qualityFindings(cards) {
  const findings = [];

  for (const card of cards) {
    const analyzed = analyzeCard(card);
    for (const variant of analyzed.variants) {
      if (variant.currentPrice !== null && variant.history.uniqueDays === 0) {
        findings.push({
          type: "current_price_without_history",
          severity: "warning",
          cardId: analyzed.id,
          cardName: analyzed.name,
          printing: variant.printing,
          condition: variant.condition,
          currentPrice: variant.currentPrice,
        });
      }
      if (variant.currentPrice !== null && variant.history.uniqueDays < 30) {
        findings.push({
          type: "very_sparse_history",
          severity: "warning",
          cardId: analyzed.id,
          cardName: analyzed.name,
          printing: variant.printing,
          condition: variant.condition,
          currentPrice: variant.currentPrice,
          historyDays: variant.history.uniqueDays,
        });
      }
    }

    const groups = new Map();
    for (const variant of analyzed.variants) {
      const key = `${variant.printing ?? "Unknown"}\u0000${variant.language ?? "Unknown"}`;
      const group = groups.get(key) ?? [];
      group.push(variant);
      groups.set(key, group);
    }
    for (const variants of groups.values()) {
      const pricedByCondition = new Map(
        variants
          .filter((variant) => variant.currentPrice !== null)
          .map((variant) => [variant.condition, variant]),
      );
      for (let betterIndex = 0; betterIndex < conditionOrder.length; betterIndex += 1) {
        const better = pricedByCondition.get(conditionOrder[betterIndex]);
        if (!better) continue;
        for (let worseIndex = betterIndex + 1; worseIndex < conditionOrder.length; worseIndex += 1) {
          const worse = pricedByCondition.get(conditionOrder[worseIndex]);
          if (!worse || better.currentPrice >= worse.currentPrice) continue;
          findings.push({
            type: "condition_price_inversion",
            severity: "warning",
            cardId: analyzed.id,
            cardName: analyzed.name,
            printing: better.printing,
            betterCondition: better.condition,
            betterPrice: better.currentPrice,
            worseCondition: worse.condition,
            worsePrice: worse.currentPrice,
          });
        }
      }
    }
  }

  return findings;
}

export const uniqueCards = (cards) => [
  ...new Map(cards.map((card) => [card.uuid ?? card.id, card])).values(),
];

export const isSealedProduct = (card) =>
  (card.variants ?? []).length > 0 &&
  (card.variants ?? []).every((variant) => variant.condition === "Sealed");

export function validatePrintingFamilyCoverage(cards, target, setName) {
  const coverage = Object.fromEntries(
    (target.requiredPrintingFamilies ?? []).map((family) => {
      const matchingCards = cards.filter((card) =>
        (card.variants ?? []).some((variant) => variant.printing?.startsWith(family)),
      );
      const matchingVariants = matchingCards.flatMap((card) =>
        (card.variants ?? []).filter((variant) => variant.printing?.startsWith(family)),
      );
      return [family, { cards: matchingCards.length, variants: matchingVariants.length }];
    }),
  );
  const incompleteFamilies = Object.entries(coverage).filter(
    ([, familyCoverage]) => familyCoverage.cards !== cards.length,
  );
  if (incompleteFamilies.length > 0) {
    throw new Error(
      `${setName} edition coverage is incomplete: ` +
        incompleteFamilies
          .map(([family, familyCoverage]) =>
            `${family} ${familyCoverage.cards}/${cards.length} cards`)
          .join(", "),
    );
  }
  return coverage;
}

export const qualitySummary = (findings) => ({
  findingCount: findings.length,
  conditionPriceInversions: findings.filter(
    (finding) => finding.type === "condition_price_inversion",
  ).length,
  verySparseHistories: findings.filter(
    (finding) => finding.type === "very_sparse_history",
  ).length,
});

const mergeCountRecords = (summaries, property) => {
  const merged = {};
  for (const summary of summaries) {
    for (const [key, count] of Object.entries(summary[property] ?? {})) {
      merged[key] = (merged[key] ?? 0) + count;
    }
  }
  return merged;
};

export const mergeSummaries = (summaries) => {
  const merged = summarizeCards([]);
  const additiveFields = [
    "cards",
    "cardsWithoutVariants",
    "variants",
    "variantsWithCurrentPrice",
    "variantsWithoutCurrentPrice",
    "variantsWithNoHistory",
    "variantsWithAtLeast180Days",
    "variantsWithAtLeast330Days",
    "variantsWith365Days",
    "variantsSpanningFullYear",
  ];
  for (const field of additiveFields) {
    merged[field] = summaries.reduce((total, summary) => total + (summary[field] ?? 0), 0);
  }
  merged.conditionCounts = mergeCountRecords(summaries, "conditionCounts");
  merged.printingCounts = mergeCountRecords(summaries, "printingCounts");
  merged.earliestHistoryDate = summaries
    .map((summary) => summary.earliestHistoryDate)
    .filter(Boolean)
    .sort()[0] ?? null;
  return merged;
};
