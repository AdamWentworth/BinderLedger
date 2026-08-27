import path from "node:path";
import { fileURLToPath } from "node:url";

import { createCollectionCommands } from "./collection-commands.mjs";
import { createCollectionService } from "./collection-service.mjs";
import { createProbeCommands } from "./probe-commands.mjs";
import { JustTcgClient, JustTcgQuotaError } from "./justtcg-client.mjs";

const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = path.resolve(
  process.env.JUSTTCG_OUTPUT_DIR ?? path.join(projectDirectory, "output"),
);
const cacheDirectory = path.resolve(
  process.env.JUSTTCG_CACHE_DIR ?? path.join(projectDirectory, ".cache"),
);
const scopePath = path.join(projectDirectory, "config", "scope.json");
const fresh = process.argv.includes("--fresh");
const commandName = process.argv[2];

const supportedCommands = [
  "check-key",
  "discover",
  "sample",
  "collect-base",
  "collect-kanto",
  "collect-machamp",
  "collect-legacy",
  "audit",
];
if (!supportedCommands.includes(commandName)) {
  console.error(
    "Usage: node src/cli.mjs <check-key|discover|sample|collect-base|collect-kanto|collect-machamp|collect-legacy|audit> [--fresh]",
  );
  process.exit(1);
}

const apiKey = process.env.JUSTTCG_API_KEY?.trim();
if (!apiKey || apiKey === "tcg_replace_me") {
  console.error("Set JUSTTCG_API_KEY in .env before running this command.");
  process.exit(1);
}

const requestIntervalMs = Number(process.env.JUSTTCG_REQUEST_INTERVAL_MS ?? 6500);
if (!Number.isFinite(requestIntervalMs) || requestIntervalMs < 6000) {
  console.error("JUSTTCG_REQUEST_INTERVAL_MS must be at least 6000 on the Free plan.");
  process.exit(1);
}

const dailyRequestReserve = Number(process.env.JUSTTCG_DAILY_REQUEST_RESERVE ?? 5);
if (!Number.isInteger(dailyRequestReserve) || dailyRequestReserve < 1) {
  console.error("JUSTTCG_DAILY_REQUEST_RESERVE must be a positive integer.");
  process.exit(1);
}

const monthlyRequestReserve = Number(process.env.JUSTTCG_MONTHLY_REQUEST_RESERVE ?? 100);
if (!Number.isInteger(monthlyRequestReserve) || monthlyRequestReserve < 1) {
  console.error("JUSTTCG_MONTHLY_REQUEST_RESERVE must be a positive integer.");
  process.exit(1);
}

const maximumNetworkRequests = Number(
  process.env.JUSTTCG_MAX_NETWORK_REQUESTS ?? Number.POSITIVE_INFINITY,
);
if (!(maximumNetworkRequests > 0)) {
  console.error("JUSTTCG_MAX_NETWORK_REQUESTS must be a positive number.");
  process.exit(1);
}

const client = new JustTcgClient({
  apiKey,
  baseUrl: process.env.JUSTTCG_BASE_URL ?? "https://api.justtcg.com/v1",
  cacheDirectory,
  requestIntervalMs,
  dailyRequestReserve,
  monthlyRequestReserve,
  maximumNetworkRequests,
});

const services = createCollectionService({ client, fresh, outputDirectory });
const probeCommands = createProbeCommands({
  client,
  fresh,
  outputDirectory,
  scopePath,
  fetchSetCards: services.fetchSetCards,
});
const collectionCommands = createCollectionCommands({
  client,
  fresh,
  outputDirectory,
  services,
  discoverSets: probeCommands.discoverSets,
});
const commands = new Map([
  ["check-key", probeCommands.checkKey],
  ["discover", probeCommands.discoverSets],
  ["sample", probeCommands.sampleHistory],
  ["collect-base", collectionCommands.collectBaseSets],
  ["collect-kanto", collectionCommands.collectKantoSets],
  ["collect-machamp", collectionCommands.collectMachampAliases],
  ["collect-legacy", collectionCommands.collectLegacySets],
  ["audit", probeCommands.auditScope],
]);

try {
  await commands.get(commandName)();
} catch (error) {
  console.error(error.message);
  process.exitCode = error instanceof JustTcgQuotaError ? 2 : 1;
}
