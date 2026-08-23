import test from "node:test";
import assert from "node:assert/strict";

import {
  analyzeCard,
  planPrefixQueries,
  selectSets,
  summarizeHistory,
} from "../src/analysis.mjs";

test("summarizeHistory reports daily coverage and gaps", () => {
  const history = [
    { t: Date.parse("2026-08-20T00:00:00Z") / 1000, p: 10 },
    { t: Date.parse("2026-08-22T00:00:00Z") / 1000, p: 12 },
  ];

  assert.deepEqual(summarizeHistory(history), {
    points: 2,
    uniqueDays: 2,
    earliestDate: "2026-08-20",
    latestDate: "2026-08-22",
    duplicateDays: 0,
    calendarSpanDays: 3,
    missingDaysWithinSpan: 1,
  });
});

test("selectSets applies dates, exclusions, and manual inclusions", () => {
  const sets = [
    { id: "base-set-pokemon", name: "Base Set", release_date: "1999-01-09" },
    { id: "power-keepers-pokemon", name: "EX Power Keepers", release_date: "2007-02-14" },
    { id: "diamond-pearl-pokemon", name: "Diamond & Pearl", release_date: "2007-05-23" },
    { id: "mystery-promo-pokemon", name: "Mystery Promo" },
  ];
  const scope = {
    releaseDateFrom: "1999-01-01",
    releaseDateThrough: "2007-05-22",
    includeUndatedSets: false,
    excludeNamePatterns: ["diamond & pearl"],
    manualIncludeSetIds: ["mystery-promo-pokemon"],
    manualExcludeSetIds: [],
  };

  const result = selectSets(sets, scope);
  assert.deepEqual(result.selected.map((set) => set.id), [
    "base-set-pokemon",
    "power-keepers-pokemon",
    "mystery-promo-pokemon",
  ]);
  assert.equal(result.excluded[0].id, "diamond-pearl-pokemon");
});

test("analyzeCard preserves missing prices and history points as null", () => {
  const card = analyzeCard({
    id: "example",
    variants: [{ id: "example-nm", price: null, priceHistory: [{ t: 1, p: null }] }],
  });

  assert.equal(card.variants[0].currentPrice, null);
  assert.equal(card.variants[0].history.uniqueDays, 0);
});

test("planPrefixQueries covers remaining cards without matching covered names", () => {
  const cards = [
    { id: "charizard", name: "Charizard" },
    { id: "charmander", name: "Charmander" },
    { id: "charmeleon", name: "Charmeleon" },
    { id: "bulbasaur", name: "Bulbasaur" },
    { id: "blastoise", name: "Blastoise" },
  ];
  const queries = planPrefixQueries(cards, new Set(["charizard"]));

  const matched = new Set();
  for (const query of queries) {
    const matches = cards.filter((card) =>
      card.name.toLowerCase().startsWith(query.toLowerCase()),
    );
    assert.equal(matches.some((card) => card.id === "charizard"), false);
    matches.forEach((card) => matched.add(card.id));
  }
  assert.deepEqual([...matched].sort(), ["blastoise", "bulbasaur", "charmander", "charmeleon"]);
});
