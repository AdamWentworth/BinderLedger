import path from "node:path";

import { analyzeCard, selectSets, summarizeCards } from "./analysis.mjs";
import { JustTcgQuotaError } from "./justtcg-client.mjs";
import {
  formatMetadata,
  readJson,
  sampleMarkdown,
  scopeMarkdown,
  writeJson,
  writeText,
} from "./reporting.mjs";

export const createProbeCommands = ({
  client,
  fresh,
  outputDirectory,
  scopePath,
  fetchSetCards,
}) => {
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

  return { auditScope, checkKey, discoverSets, sampleHistory };
};
