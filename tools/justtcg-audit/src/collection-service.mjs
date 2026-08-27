import path from "node:path";

import { analyzeCard, planPrefixQueries, summarizeCards } from "./analysis.mjs";
import {
  isSealedProduct,
  qualityFindings,
  qualitySummary,
  uniqueCards,
  validatePrintingFamilyCoverage,
} from "./collection-analysis.mjs";
import { readJson, writeJson } from "./reporting.mjs";

export const createCollectionService = ({ client, fresh, outputDirectory }) => {
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
      const legacyCompleteCollection =
        collection.provider === "JustTCG" &&
        collection.set?.id === setId &&
        Array.isArray(collection.cards) &&
        collection.cards.length > 0;
      if (collection.collectionComplete !== true && !legacyCompleteCollection) return null;
      collection.collectionComplete = true;
      collection.scope ??= target.scope;
      collection.expectedPrintings ??= target.expectedPrintings ?? [];
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
    const excludedCardsById = new Map(
      (target.excludedCards ?? []).map((excludedCard) => [excludedCard.id, excludedCard]),
    );
    const excludedProviderCards = inventory.filter((card) => excludedCardsById.has(card.id));
    const collectibleInventory = inventory.filter(
      (card) => !isSealedProduct(card) && !excludedCardsById.has(card.id),
    );
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
      excludedProviderCards: excludedProviderCards.map((card) => ({
        uuid: card.uuid ?? null,
        id: card.id ?? null,
        name: card.name ?? null,
        reason: excludedCardsById.get(card.id).reason,
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

  return {
    collectProviderSet,
    fetchFullHistoryBySearch,
    fetchSetCards,
    readCompletedCollection,
    writeCollectionSidecars,
  };
};
