const dayFromTimestamp = (timestamp) => {
  const milliseconds = Number(timestamp) < 10_000_000_000
    ? Number(timestamp) * 1000
    : Number(timestamp);
  const date = new Date(milliseconds);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString().slice(0, 10);
};

const finiteNumberOrNull = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

export function summarizeHistory(history) {
  const points = Array.isArray(history) ? history : [];
  const validPoints = points
    .map((point) => ({ day: dayFromTimestamp(point?.t), price: finiteNumberOrNull(point?.p) }))
    .filter((point) => point.day && point.price !== null);
  const uniqueDays = [...new Set(validPoints.map((point) => point.day))].sort();

  if (uniqueDays.length === 0) {
    return {
      points: 0,
      uniqueDays: 0,
      earliestDate: null,
      latestDate: null,
      duplicateDays: 0,
      calendarSpanDays: 0,
      missingDaysWithinSpan: 0,
    };
  }

  const earliestDate = uniqueDays[0];
  const latestDate = uniqueDays.at(-1);
  const calendarSpanDays = Math.round(
    (Date.parse(`${latestDate}T00:00:00Z`) - Date.parse(`${earliestDate}T00:00:00Z`)) /
      86_400_000,
  ) + 1;

  return {
    points: validPoints.length,
    uniqueDays: uniqueDays.length,
    earliestDate,
    latestDate,
    duplicateDays: validPoints.length - uniqueDays.length,
    calendarSpanDays,
    missingDaysWithinSpan: Math.max(0, calendarSpanDays - uniqueDays.length),
  };
}

export function analyzeCard(card) {
  return {
    uuid: card.uuid ?? null,
    id: card.id ?? null,
    tcgplayerId: card.tcgplayerId ?? null,
    name: card.name ?? null,
    number: card.number ?? null,
    rarity: card.rarity ?? null,
    details: card.details ?? null,
    setId: card.set ?? null,
    setName: card.set_name ?? null,
    variants: (card.variants ?? []).map((variant) => ({
      uuid: variant.uuid ?? null,
      id: variant.id ?? null,
      tcgplayerSkuId: variant.tcgplayerSkuId ?? null,
      printing: variant.printing ?? null,
      condition: variant.condition ?? null,
      language: variant.language ?? null,
      currentPrice: finiteNumberOrNull(variant.price),
      lastUpdated: variant.lastUpdated ?? null,
      history: summarizeHistory(variant.priceHistory),
    })),
  };
}

const increment = (record, key) => {
  const normalized = key || "Unknown";
  record[normalized] = (record[normalized] ?? 0) + 1;
};

export function summarizeCards(cards) {
  const variants = cards.flatMap((card) => card.variants ?? []);
  const conditionCounts = {};
  const printingCounts = {};
  for (const variant of variants) {
    increment(conditionCounts, variant.condition);
    increment(printingCounts, variant.printing);
  }

  const earliestDates = variants
    .map((variant) => variant.history?.earliestDate)
    .filter(Boolean)
    .sort();

  return {
    cards: cards.length,
    cardsWithoutVariants: cards.filter((card) => (card.variants ?? []).length === 0).length,
    variants: variants.length,
    variantsWithCurrentPrice: variants.filter((variant) => variant.currentPrice !== null).length,
    variantsWithoutCurrentPrice: variants.filter((variant) => variant.currentPrice === null).length,
    variantsWithNoHistory: variants.filter((variant) => variant.history?.uniqueDays === 0).length,
    variantsWithAtLeast180Days: variants.filter((variant) => variant.history?.uniqueDays >= 180).length,
    variantsWithAtLeast330Days: variants.filter((variant) => variant.history?.uniqueDays >= 330).length,
    variantsWith365Days: variants.filter((variant) => variant.history?.uniqueDays >= 365).length,
    variantsSpanningFullYear: variants.filter(
      (variant) => variant.history?.calendarSpanDays >= 365,
    ).length,
    earliestHistoryDate: earliestDates[0] ?? null,
    conditionCounts,
    printingCounts,
  };
}

export function selectSets(sets, scope) {
  const includedIds = new Set(scope.manualIncludeSetIds ?? []);
  const excludedIds = new Set(scope.manualExcludeSetIds ?? []);
  const excludedNamePatterns = (scope.excludeNamePatterns ?? []).map(
    (pattern) => new RegExp(pattern, "i"),
  );
  const selected = [];
  const excluded = [];
  const undated = [];

  for (const set of sets) {
    if (excludedIds.has(set.id)) {
      excluded.push({ ...set, exclusionReason: "manual exclusion" });
      continue;
    }
    if (includedIds.has(set.id)) {
      selected.push({ ...set, selectionReason: "manual inclusion" });
      continue;
    }
    if (excludedNamePatterns.some((pattern) => pattern.test(set.name ?? ""))) {
      excluded.push({ ...set, exclusionReason: "name pattern" });
      continue;
    }

    const releaseDate = set.release_date?.slice(0, 10) ?? null;
    if (!releaseDate) {
      undated.push(set);
      if (scope.includeUndatedSets) {
        selected.push({ ...set, selectionReason: "undated set allowed" });
      }
      continue;
    }
    if (releaseDate < scope.releaseDateFrom || releaseDate > scope.releaseDateThrough) {
      excluded.push({ ...set, exclusionReason: "outside release-date window" });
      continue;
    }
    selected.push({ ...set, selectionReason: "release-date window" });
  }

  const byDateAndName = (left, right) =>
    String(left.release_date ?? "9999").localeCompare(String(right.release_date ?? "9999")) ||
    String(left.name).localeCompare(String(right.name));

  return {
    selected: selected.sort(byDateAndName),
    excluded: excluded.sort(byDateAndName),
    undated: undated.sort(byDateAndName),
  };
}

export function planPrefixQueries(cards, coveredCardIds = new Set(), maximumResults = 20) {
  const rows = cards.map((card) => ({
    id: card.uuid ?? card.id,
    name: String(card.name ?? "").trim(),
  }));
  const covered = new Set(coveredCardIds);
  const remaining = new Set(rows.filter((row) => !covered.has(row.id)).map((row) => row.id));
  const queries = [];

  while (remaining.size > 0) {
    const candidates = new Map();
    for (const row of rows) {
      if (!remaining.has(row.id)) continue;
      for (let length = 1; length <= row.name.length; length += 1) {
        const query = row.name.slice(0, length).toLowerCase();
        const matches = rows.filter((candidate) =>
          candidate.name.toLowerCase().startsWith(query),
        );
        if (matches.length > maximumResults) continue;
        if (matches.some((candidate) => covered.has(candidate.id))) continue;
        const uncoveredMatches = matches.filter((candidate) => remaining.has(candidate.id));
        if (uncoveredMatches.length === 0) continue;
        candidates.set(query, uncoveredMatches);
      }
    }

    let best = null;
    for (const [query, matches] of candidates) {
      if (
        !best ||
        matches.length > best.matches.length ||
        (matches.length === best.matches.length && query.length < best.query.length)
      ) {
        best = { query, matches };
      }
    }

    if (!best) {
      const row = rows.find((candidate) => remaining.has(candidate.id));
      best = { query: row.name, matches: [row] };
    }

    queries.push(best.query);
    for (const match of best.matches) remaining.delete(match.id);
  }

  return queries;
}

export function selectExactCardsByTCGPlayerID(cards, productIds) {
  const wanted = productIds.map(String);
  const matches = new Map();
  for (const card of cards) {
    const productId = String(card.tcgplayerId ?? "");
    if (!wanted.includes(productId)) continue;
    if (matches.has(productId)) {
      throw new Error(`JustTCG returned duplicate TCGplayer product ID ${productId}`);
    }
    matches.set(productId, card);
  }
  const missing = wanted.filter((productId) => !matches.has(productId));
  if (missing.length > 0) {
    throw new Error(`JustTCG did not return TCGplayer product ID(s): ${missing.join(", ")}`);
  }
  return wanted.map((productId) => matches.get(productId));
}
