import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export const readJson = async (filename) => JSON.parse(await readFile(filename, "utf8"));

export const writeText = async (filename, contents) => {
  await mkdir(path.dirname(filename), { recursive: true });
  const temporaryPath = `${filename}.${process.pid}.tmp`;
  await writeFile(temporaryPath, contents);
  await rename(temporaryPath, filename);
};

export const writeJson = (filename, value) =>
  writeText(filename, `${JSON.stringify(value, null, 2)}\n`);

export const formatMetadata = (metadata) => {
  if (!metadata) return "API usage metadata was not returned.";
  return [
    `Plan: ${metadata.apiPlan ?? "unknown"}`,
    `Monthly remaining: ${metadata.apiRequestsRemaining ?? "unknown"}`,
    `Daily remaining: ${metadata.apiDailyRequestsRemaining ?? "unknown"}`,
    `Per-minute limit: ${metadata.apiRateLimit ?? "unknown"}`,
  ].join(" | ");
};

export const scopeMarkdown = (scope, result) => {
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

export const sampleMarkdown = (cards, summary) => {
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
