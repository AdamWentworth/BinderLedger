import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  analyzeCard,
  planPrefixQueries,
  selectSets,
  summarizeCards,
} from "./analysis.mjs";
import { JustTcgClient, JustTcgQuotaError } from "./justtcg-client.mjs";

const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = path.join(projectDirectory, "output");
const cacheDirectory = path.join(projectDirectory, ".cache");
const scopePath = path.join(projectDirectory, "config", "scope.json");
const fresh = process.argv.includes("--fresh");
const command = process.argv[2];

const commands = new Set([
  "check-key",
  "discover",
  "sample",
  "collect-base",
  "collect-kanto",
  "audit",
]);
if (!commands.has(command)) {
  console.error(
    "Usage: node src/cli.mjs <check-key|discover|sample|collect-base|collect-kanto|audit> [--fresh]",
  );
  process.exit(1);
}

const apiKey = process.env.JUSTTCG_API_KEY?.trim();
if (!apiKey || apiKey === "tcg_replace_me") {
  console.error("Set JUSTTCG_API_KEY in .env before running this command.");
  process.exit(1);
}

const requestIntervalMs = Number(process.env.JUSTTCG_REQUEST_INTERVAL_MS ?? 6500);
if (!Number.isFinite(requestIntervalMs) || requestIntervalMs < 0) {
  console.error("JUSTTCG_REQUEST_INTERVAL_MS must be a non-negative number.");
  process.exit(1);
}

const client = new JustTcgClient({
  apiKey,
  baseUrl: process.env.JUSTTCG_BASE_URL ?? "https://api.justtcg.com/v1",
  cacheDirectory,
  requestIntervalMs,
});

const readJson = async (filename) => JSON.parse(await readFile(filename, "utf8"));

const writeText = async (filename, contents) => {
  await mkdir(path.dirname(filename), { recursive: true });
  const temporaryPath = `${filename}.${process.pid}.tmp`;
  await writeFile(temporaryPath, contents);
  await rename(temporaryPath, filename);
};

const writeJson = (filename, value) =>
  writeText(filename, `${JSON.stringify(value, null, 2)}\n`);

const formatMetadata = (metadata) => {
  if (!metadata) return "API usage metadata was not returned.";
  return [
    `Plan: ${metadata.apiPlan ?? "unknown"}`,
    `Monthly remaining: ${metadata.apiRequestsRemaining ?? "unknown"}`,
    `Daily remaining: ${metadata.apiDailyRequestsRemaining ?? "unknown"}`,
    `Per-minute limit: ${metadata.apiRateLimit ?? "unknown"}`,
  ].join(" | ");
};

const scopeMarkdown = (scope, result) => {
  const lines = [
    "# JustTCG Pokemon Set Discovery",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Proposed release window: ${scope.releaseDateFrom} through ${scope.releaseDateThrough}`,
    `Selected candidates: ${result.selected.length}`,
    `Undated sets requiring review: ${result.undated.length}`,
    "",
    "## Candidate Sets",
    "",
    "| Release date | Set | JustTCG ID | Variants |",
    "| --- | --- | --- | ---: |",
    ...result.selected.map(
      (set) => `| ${set.release_date?.slice(0, 10) ?? "Unknown"} | ${set.name} | \`${set.id}\` | ${set.variants_count ?? "?"} |`,
    ),
    "",
    "## Undated Sets",
    "",
    ...(
      result.undated.length
        ? result.undated.map((set) => `- ${set.name} (\`${set.id}\`)`)
        : ["No undated sets were returned."]
    ),
    "",
  ];
  return `${lines.join("\n")}\n`;
};

const sampleMarkdown = (cards, summary) => {
  const lines = [
    "# Base Set Charizard Edition History Probe",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Cards returned: ${summary.cards}`,
    `Variants returned: ${summary.variants}`,
    `Variants with 365 daily points: ${summary.variantsWith365Days}`,
    `Variants spanning the full 365-day window: ${summary.variantsSpanningFullYear}`,
    `Earliest history date: ${summary.earliestHistoryDate ?? "None"}`,
    "",
  ];

  for (const card of cards) {
    lines.push(`## ${card.name} ${card.number ? `#${card.number}` : ""}`.trim());
    lines.push("");
    lines.push(`Provider set: ${card.setName ?? "Unknown"} (\`${card.setId}\`)`);
    lines.push(`JustTCG ID: \`${card.id}\``);
    lines.push(`TCGplayer product ID: ${card.tcgplayerId ?? "None"}`);
    lines.push("");
    lines.push("| Collector edition | Condition | Price | Points | Earliest | Latest | Missing days | SKU | ");
    lines.push("| --- | --- | ---: | ---: | --- | --- | ---: | --- | ");
    for (const variant of card.variants) {
      const edition = collectorEdition(card, variant);
      lines.push(
        `| ${edition} | ${variant.condition ?? "Unknown"} | ${variant.currentPrice ?? "None"} | ${variant.history.uniqueDays} | ${variant.history.earliestDate ?? "None"} | ${variant.history.latestDate ?? "None"} | ${variant.history.missingDaysWithinSpan} | ${variant.tcgplayerSkuId ?? "None"} |`,
      );
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
};

const collectorEdition = (card, variant) => {
  if (card.setId === "base-set-pokemon") return "Unlimited";
  if (card.setId === "base-set-shadowless-pokemon") {
    return variant.printing?.startsWith("1st Edition")
      ? "First Edition"
      : "Shadowless Unlimited";
  }
  return variant.printing ?? "Unknown";
};

async function checkKey() {
  const response = await client.get("/games", {}, { cache: false });
  const pokemon = (response.data ?? []).find((game) => game.id === "pokemon");
  if (!pokemon) throw new Error("The key worked, but the Pokemon game was not returned.");
  console.log(`API key accepted. Pokemon is available. ${formatMetadata(response._metadata)}`);
}

async function discoverSets() {
  const scope = await readJson(scopePath);
  const response = await client.get("/sets", { game: scope.game }, { cache: !fresh });
  const sets = response.data ?? [];
  const result = selectSets(sets, scope);
  const report = {
    generatedAt: new Date().toISOString(),
    scope,
    apiMetadata: response._metadata ?? null,
    totalSetsReturned: sets.length,
    ...result,
  };
  await writeJson(path.join(outputDirectory, "set-discovery.json"), report);
  await writeText(
    path.join(outputDirectory, "set-discovery.md"),
    scopeMarkdown(scope, result),
  );
  console.log(
    `Discovered ${sets.length} Pokemon sets; proposed ${result.selected.length} for the initial scope. ` +
      `${result.undated.length} undated sets need review.`,
  );
  console.log(formatMetadata(response._metadata));
  return report;
}

async function sampleHistory() {
  const providerSets = ["base-set-pokemon", "base-set-shadowless-pokemon"];
  const responses = [];
  for (const set of providerSets) {
    responses.push(
      await client.get(
        "/cards",
        {
          game: "pokemon",
          set,
          q: "Charizard",
          limit: 20,
          include_null_prices: true,
          include_price_history: true,
          priceHistoryDuration: "1y",
        },
        { cache: !fresh },
      ),
    );
  }

  const cards = responses.flatMap((response) => (response.data ?? []).map(analyzeCard));
  const summary = summarizeCards(cards);
  const report = {
    generatedAt: new Date().toISOString(),
    request: {
      game: "pokemon",
      sets: providerSets,
      query: "Charizard",
      priceHistoryDuration: "1y",
    },
    apiMetadata: client.latestMetadata,
    summary,
    cards,
  };
  await writeJson(path.join(outputDirectory, "base-set-charizard-sample.json"), report);
  await writeText(
    path.join(outputDirectory, "base-set-charizard-sample.md"),
    sampleMarkdown(cards, summary),
  );
  console.log(
    `History probe returned ${summary.cards} cards and ${summary.variants} variants. ` +
      `${summary.variantsWith365Days} variants contain at least 365 daily points.`,
  );
  console.log(`${summary.variantsSpanningFullYear} variants span the full 365-day window.`);
  console.log(`Earliest history date: ${summary.earliestHistoryDate ?? "none"}.`);
  console.log(formatMetadata(client.latestMetadata));
}

async function fetchSetCards(setId) {
  const cards = [];
  const limit = 20;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const response = await client.get(
      "/cards",
      {
        game: "pokemon",
        set: setId,
        limit,
        offset,
        include_null_prices: true,
        include_price_history: true,
        priceHistoryDuration: "1y",
      },
      { cache: !fresh },
    );
    const page = response.data ?? [];
    cards.push(...page);
    hasMore = response.meta?.hasMore ?? page.length === limit;
    offset += response.meta?.limit ?? limit;
  }

  return cards;
}

const conditionOrder = [
  "Near Mint",
  "Lightly Played",
  "Moderately Played",
  "Heavily Played",
  "Damaged",
];

function qualityFindings(cards) {
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

const uniqueCards = (cards) => [
  ...new Map(cards.map((card) => [card.uuid ?? card.id, card])).values(),
];

const isSealedProduct = (card) =>
  (card.variants ?? []).length > 0 &&
  (card.variants ?? []).every((variant) => variant.condition === "Sealed");

async function fetchFullHistoryBySearch(setId, inventoryCards, seedQueries = []) {
  const collected = new Map();
  for (const seedQuery of seedQueries) {
    const seedResponse = await client.get(
      "/cards",
      {
        game: "pokemon",
        set: setId,
        q: seedQuery,
        limit: 20,
        include_null_prices: true,
        include_price_history: true,
        priceHistoryDuration: "1y",
      },
      { cache: true },
    );
    for (const card of seedResponse.data ?? []) {
      collected.set(card.uuid ?? card.id, card);
    }
  }
  const inventoryIds = new Set(inventoryCards.map((card) => card.uuid ?? card.id));
  const plannedQueries = planPrefixQueries(inventoryCards, new Set(collected.keys()));

  for (const [index, query] of plannedQueries.entries()) {
    console.log(`  [${index + 1}/${plannedQueries.length}] Searching prefix ${JSON.stringify(query)}...`);
    let offset = 0;
    let hasMore = true;
    while (hasMore) {
      const response = await client.get(
        "/cards",
        {
          game: "pokemon",
          set: setId,
          q: query,
          limit: 20,
          ...(offset > 0 ? { offset } : {}),
          include_null_prices: true,
          include_price_history: true,
          priceHistoryDuration: "1y",
        },
        { cache: !fresh },
      );
      const page = response.data ?? [];
      for (const card of page) {
        const id = card.uuid ?? card.id;
        if (inventoryIds.has(id)) collected.set(id, card);
      }
      hasMore = response.meta?.hasMore ?? page.length === 20;
      offset += response.meta?.limit ?? 20;
    }
  }

  let missingCards = inventoryCards.filter(
    (card) => !collected.has(card.uuid ?? card.id),
  );
  for (const [index, missingCard] of missingCards.entries()) {
    console.log(
      `  [fallback ${index + 1}/${missingCards.length}] Searching ${JSON.stringify(missingCard.name)}...`,
    );
    const response = await client.get(
      "/cards",
      {
        game: "pokemon",
        set: setId,
        q: missingCard.name,
        limit: 20,
        include_null_prices: true,
        include_price_history: true,
        priceHistoryDuration: "1y",
      },
      { cache: !fresh },
    );
    for (const card of response.data ?? []) {
      const id = card.uuid ?? card.id;
      if (inventoryIds.has(id)) collected.set(id, card);
    }
  }

  missingCards = inventoryCards.filter(
    (card) => !collected.has(card.uuid ?? card.id),
  );
  if (missingCards.length > 0) {
    throw new Error(
      `Could not retrieve full history for ${missingCards.length} cards in ${setId}: ` +
        missingCards.map((card) => card.name).join(", "),
    );
  }

  return {
    cards: inventoryCards.map((card) => collected.get(card.uuid ?? card.id)),
    plannedQueries,
  };
}

async function collectBaseSets() {
  const targetSetIds = ["base-set-pokemon", "base-set-shadowless-pokemon"];
  const setCatalogResponse = await client.get("/sets", { game: "pokemon" }, { cache: true });
  const setCatalog = new Map((setCatalogResponse.data ?? []).map((set) => [set.id, set]));
  const collections = [];

  try {
    for (const [index, setId] of targetSetIds.entries()) {
      const set = setCatalog.get(setId) ?? { id: setId, name: setId };
      console.log(`[${index + 1}/${targetSetIds.length}] Collecting ${set.name}...`);
      const inventory = uniqueCards(await fetchSetCards(setId));
      const sealedProducts = inventory.filter(isSealedProduct);
      const collectibleInventory = inventory.filter((card) => !isSealedProduct(card));
      const historyResult = await fetchFullHistoryBySearch(
        setId,
        collectibleInventory,
        ["Charizard"],
      );
      const cards = historyResult.cards;
      const analyzedCards = cards.map(analyzeCard);
      const collection = {
        provider: "JustTCG",
        apiVersion: "v1",
        collectedAt: new Date().toISOString(),
        request: {
          game: "pokemon",
          set: setId,
          includeNullPrices: true,
          priceHistoryDuration: "1y",
        },
        collectionMethod: "non-overlapping prefix searches seeded from cached Charizard probes",
        searchQueries: historyResult.plannedQueries,
        set,
        excludedSealedProducts: sealedProducts.map((product) => ({
          uuid: product.uuid ?? null,
          id: product.id ?? null,
          name: product.name ?? null,
        })),
        summary: summarizeCards(analyzedCards),
        cards,
      };
      collections.push(collection);
      await writeJson(
        path.join(outputDirectory, "collections", `${setId}.json`),
        collection,
      );
      console.log(
        `Saved ${collection.summary.cards} cards, ${collection.summary.variants} variants, ` +
          `${collection.summary.variantsSpanningFullYear} full-year series.`,
      );
    }
  } catch (error) {
    if (error instanceof JustTcgQuotaError) {
      console.error(error.message);
      console.error("Run `npm run collect-base` after reset; completed pages are cached.");
      process.exitCode = 2;
      return;
    }
    throw error;
  }

  const allRawCards = collections.flatMap((collection) => collection.cards);
  const allAnalyzedCards = allRawCards.map(analyzeCard);
  const findings = qualityFindings(allRawCards);
  const manifest = {
    provider: "JustTCG",
    apiVersion: "v1",
    collectedAt: new Date().toISOString(),
    setIds: targetSetIds,
    networkRequestsThisRun: client.networkRequests,
    cacheHitsThisRun: client.cacheHits,
    apiMetadata: client.latestMetadata,
    summary: summarizeCards(allAnalyzedCards),
    quality: {
      findingCount: findings.length,
      conditionPriceInversions: findings.filter(
        (finding) => finding.type === "condition_price_inversion",
      ).length,
      verySparseHistories: findings.filter(
        (finding) => finding.type === "very_sparse_history",
      ).length,
    },
    collectorPrintings: {
      unlimited: allAnalyzedCards.flatMap((card) => card.variants).filter(
        (variant) =>
          variant.printing === "Holofoil" || variant.printing === "Normal",
      ).length / 5,
      shadowlessUnlimited: allAnalyzedCards.flatMap((card) => card.variants).filter(
        (variant) => variant.printing?.startsWith("Unlimited"),
      ).length / 5,
      firstEdition: allAnalyzedCards.flatMap((card) => card.variants).filter(
        (variant) => variant.printing?.startsWith("1st Edition"),
      ).length / 5,
    },
    sets: collections.map((collection) => ({
      set: collection.set,
      summary: collection.summary,
      file: `collections/${collection.set.id}.json`,
    })),
  };
  await writeJson(path.join(outputDirectory, "base-set-collection.json"), manifest);
  await writeJson(path.join(outputDirectory, "base-set-quality-findings.json"), {
    generatedAt: new Date().toISOString(),
    findings,
  });

  console.log(
    `Collection complete: ${manifest.summary.cards} cards, ${manifest.summary.variants} variants, ` +
      `${manifest.quality.findingCount} quality warnings.`,
  );
  console.log(formatMetadata(client.latestMetadata));
}

const kantoCollectionTargets = [
  {
    id: "jungle-pokemon",
    scope: "Kanto expansion",
    expectedPrintings: ["Unlimited", "1st Edition"],
    requiredPrintingFamilies: ["Unlimited", "1st Edition"],
  },
  {
    id: "fossil-pokemon",
    scope: "Kanto expansion",
    expectedPrintings: ["Unlimited", "1st Edition"],
    requiredPrintingFamilies: ["Unlimited", "1st Edition"],
  },
  {
    id: "team-rocket-pokemon",
    scope: "Kanto expansion",
    expectedPrintings: ["Unlimited", "1st Edition"],
    requiredPrintingFamilies: ["Unlimited", "1st Edition"],
  },
  {
    id: "gym-heroes-pokemon",
    scope: "Kanto expansion",
    expectedPrintings: ["Unlimited", "1st Edition"],
    requiredPrintingFamilies: ["Unlimited", "1st Edition"],
  },
  {
    id: "gym-challenge-pokemon",
    scope: "Kanto expansion",
    expectedPrintings: ["Unlimited", "1st Edition"],
    requiredPrintingFamilies: ["Unlimited", "1st Edition"],
  },
  {
    id: "base-set-2-pokemon",
    scope: "Kanto reprint expansion",
    expectedPrintings: ["Unlimited"],
  },
  {
    id: "legendary-collection-pokemon",
    scope: "Later Kanto reprint expansion",
    expectedPrintings: ["Normal", "Reverse Holofoil"],
  },
  {
    id: "wotc-promo-pokemon",
    scope: "Mixed Kanto and Johto promotional series",
    expectedPrintings: ["Promo"],
  },
];

function validatePrintingFamilyCoverage(cards, target, setName) {
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

async function readCompletedCollection(target) {
  const setId = target.id;
  try {
    const reference = await readJson(
      path.join(outputDirectory, "collections", `${setId}.manifest.json`),
    );
    return reference.collectionComplete === true ? reference : null;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  try {
    const collection = await readJson(
      path.join(outputDirectory, "collections", `${setId}.json`),
    );
    if (collection.collectionComplete !== true) return null;
    collection.requiredPrintingFamilies = target.requiredPrintingFamilies ?? [];
    collection.printingFamilyCoverage = validatePrintingFamilyCoverage(
      collection.cards,
      target,
      collection.set.name,
    );
    return writeCollectionSidecars(collection);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

const qualitySummary = (findings) => ({
  findingCount: findings.length,
  conditionPriceInversions: findings.filter(
    (finding) => finding.type === "condition_price_inversion",
  ).length,
  verySparseHistories: findings.filter(
    (finding) => finding.type === "very_sparse_history",
  ).length,
});

async function writeCollectionSidecars(collection) {
  const findings = qualityFindings(collection.cards);
  const reference = {
    collectionComplete: true,
    collectedAt: collection.collectedAt,
    set: collection.set,
    scope: collection.scope,
    expectedPrintings: collection.expectedPrintings,
    requiredPrintingFamilies: collection.requiredPrintingFamilies ?? [],
    printingFamilyCoverage: collection.printingFamilyCoverage ?? {},
    summary: collection.summary,
    quality: qualitySummary(findings),
    file: `collections/${collection.set.id}.json`,
    qualityFile: `collections/${collection.set.id}.quality-findings.json`,
  };
  await writeJson(
    path.join(outputDirectory, "collections", `${collection.set.id}.manifest.json`),
    reference,
  );
  await writeJson(
    path.join(
      outputDirectory,
      "collections",
      `${collection.set.id}.quality-findings.json`,
    ),
    { generatedAt: new Date().toISOString(), set: collection.set, findings },
  );
  return reference;
}

async function collectProviderSet(set, target) {
  const inventory = uniqueCards(await fetchSetCards(set.id));
  const sealedProducts = inventory.filter(isSealedProduct);
  const collectibleInventory = inventory.filter((card) => !isSealedProduct(card));
  const historyResult = await fetchFullHistoryBySearch(set.id, collectibleInventory);
  const cards = historyResult.cards;
  const printingFamilyCoverage = validatePrintingFamilyCoverage(cards, target, set.name);
  const collection = {
    provider: "JustTCG",
    apiVersion: "v1",
    collectionComplete: true,
    collectedAt: new Date().toISOString(),
    request: {
      game: "pokemon",
      set: set.id,
      includeNullPrices: true,
      priceHistoryDuration: "1y",
    },
    collectionMethod: "verified inventory followed by non-overlapping prefix searches",
    scope: target.scope,
    expectedPrintings: target.expectedPrintings,
    requiredPrintingFamilies: target.requiredPrintingFamilies ?? [],
    printingFamilyCoverage,
    searchQueries: historyResult.plannedQueries,
    set,
    excludedSealedProducts: sealedProducts.map((product) => ({
      uuid: product.uuid ?? null,
      id: product.id ?? null,
      name: product.name ?? null,
    })),
    summary: summarizeCards(cards.map(analyzeCard)),
    cards,
  };
  await writeJson(
    path.join(outputDirectory, "collections", `${set.id}.json`),
    collection,
  );
  return writeCollectionSidecars(collection);
}

const mergeCountRecords = (summaries, property) => {
  const merged = {};
  for (const summary of summaries) {
    for (const [key, count] of Object.entries(summary[property] ?? {})) {
      merged[key] = (merged[key] ?? 0) + count;
    }
  }
  return merged;
};

const mergeSummaries = (summaries) => {
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

async function writeKantoManifest(collections, status, error = null) {
  const qualityReports = await Promise.all(
    collections.map((collection) =>
      readJson(path.join(outputDirectory, collection.qualityFile)),
    ),
  );
  const findings = qualityReports.flatMap((report) => report.findings ?? []);
  const manifest = {
    provider: "JustTCG",
    apiVersion: "v1",
    collectedAt: new Date().toISOString(),
    status,
    error,
    requestedSetCount: kantoCollectionTargets.length,
    completedSetCount: collections.length,
    networkRequestsThisRun: client.networkRequests,
    cacheHitsThisRun: client.cacheHits,
    apiMetadata: client.latestMetadata,
    summary: mergeSummaries(collections.map((collection) => collection.summary)),
    quality: qualitySummary(findings),
    sets: collections,
  };
  await writeJson(path.join(outputDirectory, "kanto-collection.json"), manifest);
  await writeJson(path.join(outputDirectory, "kanto-quality-findings.json"), {
    generatedAt: new Date().toISOString(),
    status,
    findings,
  });
  return manifest;
}

async function collectKantoSets() {
  const setCatalogResponse = await client.get("/sets", { game: "pokemon" }, { cache: true });
  const setCatalog = new Map((setCatalogResponse.data ?? []).map((set) => [set.id, set]));
  const collections = [];

  try {
    for (const [index, target] of kantoCollectionTargets.entries()) {
      const set = setCatalog.get(target.id);
      if (!set) throw new Error(`JustTCG set not found: ${target.id}`);

      const completed = await readCompletedCollection(target);
      if (completed) {
        collections.push(completed);
        console.log(
          `[${index + 1}/${kantoCollectionTargets.length}] Reusing completed ${set.name} collection.`,
        );
        continue;
      }

      console.log(`[${index + 1}/${kantoCollectionTargets.length}] Collecting ${set.name}...`);
      const collection = await collectProviderSet(set, target);
      collections.push(collection);
      await writeKantoManifest(collections, "in_progress");
      console.log(
        `Saved ${collection.summary.cards} cards, ${collection.summary.variants} variants, ` +
          `${collection.summary.variantsSpanningFullYear} full-year series.`,
      );
    }
  } catch (error) {
    if (error instanceof JustTcgQuotaError) {
      const manifest = await writeKantoManifest(
        collections,
        "paused_for_quota",
        error.message,
      );
      console.error(error.message);
      console.error(
        `Saved ${manifest.completedSetCount}/${manifest.requestedSetCount} complete sets. ` +
          "Run `npm run collect-kanto` after 00:00 UTC to resume from cache.",
      );
      process.exitCode = 2;
      return;
    }
    if (error.status === 401 && collections.length > 0) {
      const manifest = await writeKantoManifest(
        collections,
        "paused_for_api_access",
        "JustTCG stopped authorizing requests near the daily limit. Cached progress is safe.",
      );
      console.error(
        "JustTCG stopped authorizing requests near the daily limit. Cached progress is safe.",
      );
      console.error(
        `Saved ${manifest.completedSetCount}/${manifest.requestedSetCount} complete sets. ` +
          "Run `npm run collect-kanto` after 00:00 UTC to resume from cache.",
      );
      process.exitCode = 2;
      return;
    }
    throw error;
  }

  const manifest = await writeKantoManifest(collections, "complete");
  console.log(
    `Kanto collection complete: ${manifest.summary.cards} cards and ` +
      `${manifest.summary.variants} variants across ${manifest.completedSetCount} sets.`,
  );
  console.log(formatMetadata(client.latestMetadata));
}

async function writeAuditProgress(discovery, setReports, status, error = null) {
  const cards = setReports.flatMap((setReport) => setReport.cards);
  const report = {
    generatedAt: new Date().toISOString(),
    status,
    error,
    scope: discovery.scope,
    selectedSetCount: discovery.selected.length,
    completedSetCount: setReports.length,
    networkRequestsThisRun: client.networkRequests,
    cacheHitsThisRun: client.cacheHits,
    apiMetadata: client.latestMetadata,
    summary: summarizeCards(cards),
    sets: setReports,
  };
  await writeJson(path.join(outputDirectory, "audit-report.json"), report);
  return report;
}

async function auditScope() {
  const discovery = await discoverSets();
  const setReports = [];

  try {
    for (const [index, set] of discovery.selected.entries()) {
      console.log(`[${index + 1}/${discovery.selected.length}] Auditing ${set.name}...`);
      const rawCards = await fetchSetCards(set.id);
      const cards = rawCards.map(analyzeCard);
      const setReport = { set, summary: summarizeCards(cards), cards };
      setReports.push(setReport);
      await writeJson(path.join(outputDirectory, "sets", `${set.id}.json`), setReport);
      await writeAuditProgress(discovery, setReports, "in_progress");
    }
  } catch (error) {
    if (error instanceof JustTcgQuotaError) {
      await writeAuditProgress(discovery, setReports, "paused_for_quota", error.message);
      console.error(error.message);
      console.error("Run `npm run audit` again after the quota reset; cached pages will be reused.");
      process.exitCode = 2;
      return;
    }
    throw error;
  }

  const report = await writeAuditProgress(discovery, setReports, "complete");
  console.log(
    `Audit complete: ${report.summary.cards} cards and ${report.summary.variants} variants across ` +
      `${report.completedSetCount} sets.`,
  );
  console.log(
    `${report.summary.variantsWith365Days} variants have at least 365 daily history points; ` +
      `${report.summary.variantsWithNoHistory} have no history.`,
  );
}

try {
  if (command === "check-key") await checkKey();
  if (command === "discover") await discoverSets();
  if (command === "sample") await sampleHistory();
  if (command === "collect-base") await collectBaseSets();
  if (command === "collect-kanto") await collectKantoSets();
  if (command === "audit") await auditScope();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
