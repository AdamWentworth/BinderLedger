import path from "node:path";

import { analyzeCard, selectExactCardsByTCGPlayerID, summarizeCards } from "./analysis.mjs";
import {
  conditionOrder,
  isSealedProduct,
  mergeSummaries,
  qualityFindings,
  qualitySummary,
  uniqueCards,
} from "./collection-analysis.mjs";
import { kantoCollectionTargets, legacyTarget } from "./collection-targets.mjs";
import { JustTcgQuotaError } from "./justtcg-client.mjs";
import { formatMetadata, readJson, writeJson } from "./reporting.mjs";

const machampProductIds = ["107004", "42425"];

export const createCollectionCommands = ({
  client,
  fresh,
  outputDirectory,
  services,
  discoverSets,
}) => {
  const {
    collectProviderSet,
    fetchFullHistoryBySearch,
    fetchSetCards,
    readCompletedCollection,
  } = services;

  async function collectMachampAliases() {
    const filename = path.join(outputDirectory, "specials", "base-set-machamp.json");
    if (!fresh) {
      try {
        const completed = await readJson(filename);
        if (completed.collectionComplete === true) {
          console.log("Reusing completed Base Set Machamp exact-ID collection.");
          return;
        }
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }

    const response = await client.get(
      "/cards",
      {
        game: "pokemon",
        set: "deck-exclusives-pokemon",
        q: "Machamp",
        limit: 20,
        include_null_prices: true,
        include_price_history: true,
        priceHistoryDuration: "1y",
      },
      { cache: !fresh },
    );
    const cards = selectExactCardsByTCGPlayerID(response.data ?? [], machampProductIds);
    for (const card of cards) {
      const analyzed = analyzeCard(card);
      const variants = analyzed.variants.filter(
        (variant) =>
          variant.printing === "1st Edition Holofoil" && variant.language === "English",
      );
      const conditions = new Set(variants.map((variant) => variant.condition));
      const missingConditions = conditionOrder.filter((condition) => !conditions.has(condition));
      if (variants.length !== conditionOrder.length || missingConditions.length > 0) {
        throw new Error(
          `${card.name} exact-ID response has incomplete condition coverage: ` +
            (missingConditions.join(", ") || `${variants.length} variants`),
        );
      }
      const incompleteHistory = variants.filter(
        (variant) => variant.history.calendarSpanDays < 365,
      );
      if (incompleteHistory.length > 0) {
        throw new Error(`${card.name} exact-ID response does not span the requested year`);
      }
    }

    const report = {
      provider: "JustTCG",
      apiVersion: "v1",
      collectionComplete: true,
      collectedAt: new Date().toISOString(),
      request: {
        game: "pokemon",
        set: "deck-exclusives-pokemon",
        query: "Machamp",
        tcgplayerProductIds: machampProductIds,
        priceHistoryDuration: "1y",
      },
      summary: summarizeCards(cards.map(analyzeCard)),
      cards,
    };
    await writeJson(filename, report);
    console.log(
      `Saved both Base Set Machamps with ${report.summary.variants} variants and ` +
        `${report.summary.variantsSpanningFullYear} full-year series.`,
    );
    console.log(formatMetadata(client.latestMetadata));
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

  async function writeLegacyManifest(discovery, collections, status, error = null) {
    const summaries = collections.map((collection) => collection.summary);
    const findingCount = collections.reduce(
      (total, collection) => total + (collection.quality?.findingCount ?? 0),
      0,
    );
    const manifest = {
      provider: "JustTCG",
      apiVersion: "v1",
      collectedAt: new Date().toISOString(),
      status,
      error,
      requestedSetCount: discovery.selected.length,
      completedSetCount: collections.length,
      networkRequestsThisRun: client.networkRequests,
      cacheHitsThisRun: client.cacheHits,
      apiMetadata: client.latestMetadata,
      scope: discovery.scope,
      summary: mergeSummaries(summaries),
      quality: {
        findingCount,
      },
      sets: collections,
    };
    await writeJson(path.join(outputDirectory, "legacy-collection.json"), manifest);
    return manifest;
  }

  async function collectLegacySets() {
    const discovery = await discoverSets();
    const expectedSetCount = Number(process.env.JUSTTCG_LEGACY_TARGET_SET_COUNT ?? 38);
    if (!Number.isInteger(expectedSetCount) || expectedSetCount <= 0) {
      throw new Error("JUSTTCG_LEGACY_TARGET_SET_COUNT must be a positive integer.");
    }
    if (discovery.selected.length !== expectedSetCount) {
      throw new Error(
        `Legacy scope selected ${discovery.selected.length} sets; expected ${expectedSetCount}. ` +
          "Review config/scope.json before collecting.",
      );
    }

    const collections = [];
    try {
      for (const [index, set] of discovery.selected.entries()) {
        const target = legacyTarget(set);
        const completed = await readCompletedCollection(target);
        if (completed) {
          collections.push(completed);
          console.log(
            `[${index + 1}/${discovery.selected.length}] Reusing completed ${set.name} collection.`,
          );
          continue;
        }

        console.log(`[${index + 1}/${discovery.selected.length}] Collecting ${set.name}...`);
        const collection = await collectProviderSet(set, target);
        collections.push(collection);
        await writeLegacyManifest(discovery, collections, "in_progress");
        console.log(
          `Saved ${collection.summary.cards} cards and ${collection.summary.variants} variants.`,
        );
      }
    } catch (error) {
      if (error instanceof JustTcgQuotaError) {
        const manifest = await writeLegacyManifest(
          discovery,
          collections,
          "paused_for_quota",
          error.message,
        );
        console.error(error.message);
        console.error(
          `Saved ${manifest.completedSetCount}/${manifest.requestedSetCount} complete legacy sets. ` +
            "The next production run will resume from cache.",
        );
        process.exitCode = 2;
        return;
      }
      throw error;
    }

    const manifest = await writeLegacyManifest(discovery, collections, "complete");
    console.log(
      `Legacy collection complete: ${manifest.summary.cards} cards across ` +
        `${manifest.completedSetCount} sets.`,
    );
    console.log(formatMetadata(client.latestMetadata));
  }

  return { collectBaseSets, collectKantoSets, collectLegacySets, collectMachampAliases };
};
