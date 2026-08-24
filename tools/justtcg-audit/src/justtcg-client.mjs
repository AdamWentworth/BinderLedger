import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export class JustTcgError extends Error {
  constructor(message, { status, code } = {}) {
    super(message);
    this.name = "JustTcgError";
    this.status = status;
    this.code = code;
  }
}

export class JustTcgQuotaError extends JustTcgError {
  constructor(message) {
    super(message, { status: 429, code: "QUOTA_EXHAUSTED" });
    this.name = "JustTcgQuotaError";
  }
}

export class JustTcgClient {
  constructor({
    apiKey,
    baseUrl,
    cacheDirectory,
    requestIntervalMs = 6500,
    dailyRequestReserve = 5,
  }) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.cacheDirectory = cacheDirectory;
    this.requestIntervalMs = requestIntervalMs;
    this.dailyRequestReserve = dailyRequestReserve;
    this.lastNetworkRequestAt = 0;
    this.latestMetadata = null;
    this.networkRequests = 0;
    this.cacheHits = 0;
  }

  async get(pathname, query = {}, { cache = true } = {}) {
    const url = new URL(`${this.baseUrl}${pathname}`);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }

    const cachePath = this.#cachePath(url);
    if (cache) {
      const cached = await this.#readCache(cachePath);
      if (cached) {
        this.cacheHits += 1;
        return cached;
      }
    }

    this.#assertQuotaAvailable();
    const response = await this.#fetchWithRetry(url);
    if (cache) {
      await this.#writeCache(cachePath, response);
    }
    return response;
  }

  #cachePath(url) {
    const digest = createHash("sha256").update(url.toString()).digest("hex");
    return path.join(this.cacheDirectory, `${digest}.json`);
  }

  async #readCache(cachePath) {
    try {
      return JSON.parse(await readFile(cachePath, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
  }

  async #writeCache(cachePath, value) {
    await mkdir(path.dirname(cachePath), { recursive: true });
    const temporaryPath = `${cachePath}.${process.pid}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(value)}\n`, { mode: 0o600 });
    await rename(temporaryPath, cachePath);
  }

  #assertQuotaAvailable() {
    const metadata = this.latestMetadata;
    if (!metadata) return;

    if (Number(metadata.apiDailyRequestsRemaining) <= this.dailyRequestReserve) {
      throw new JustTcgQuotaError(
        `The daily JustTCG safety reserve of ${this.dailyRequestReserve} requests has been reached. ` +
          "Cached progress is safe; rerun after 00:00 UTC.",
      );
    }
    if (Number(metadata.apiRequestsRemaining) === 0) {
      throw new JustTcgQuotaError(
        "The monthly JustTCG request allowance is exhausted. Cached progress is safe; rerun after the plan reset.",
      );
    }
  }

  async #throttle() {
    const elapsed = Date.now() - this.lastNetworkRequestAt;
    const waitFor = this.requestIntervalMs - elapsed;
    if (waitFor > 0) await sleep(waitFor);
  }

  async #fetchWithRetry(url) {
    const maximumAttempts = 4;
    for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
      await this.#throttle();
      this.lastNetworkRequestAt = Date.now();
      this.networkRequests += 1;

      let response;
      try {
        response = await fetch(url, {
          headers: {
            accept: "application/json",
            "x-api-key": this.apiKey,
          },
          signal: AbortSignal.timeout(30_000),
        });
      } catch (error) {
        if (attempt === maximumAttempts) {
          throw new JustTcgError(`JustTCG request failed: ${error.message}`);
        }
        await sleep(1000 * 2 ** (attempt - 1));
        continue;
      }

      const bodyText = await response.text();
      let body;
      try {
        body = bodyText ? JSON.parse(bodyText) : {};
      } catch {
        body = { error: bodyText || response.statusText };
      }

      if (response.ok) {
        this.#rememberMetadata(body._metadata);
        return body;
      }

      if ((response.status === 429 || response.status >= 500) && attempt < maximumAttempts) {
        const retryAfter = Number(response.headers.get("retry-after"));
        const delay = Number.isFinite(retryAfter)
          ? retryAfter * 1000
          : 1000 * 2 ** (attempt - 1);
        await sleep(delay);
        continue;
      }

      const detail = body.error || body.message || response.statusText;
      if (response.status === 401 || response.status === 403) {
        throw new JustTcgError(
          `JustTCG rejected the API key (${response.status}). Check JUSTTCG_API_KEY in .env.`,
          { status: response.status, code: body.code },
        );
      }
      if (response.status === 429) {
        throw new JustTcgQuotaError(`JustTCG rate limit reached: ${detail}`);
      }
      throw new JustTcgError(`JustTCG returned ${response.status}: ${detail}`, {
        status: response.status,
        code: body.code,
      });
    }

    throw new JustTcgError("JustTCG request failed after all retry attempts.");
  }

  #rememberMetadata(metadata) {
    if (metadata && typeof metadata === "object") this.latestMetadata = metadata;
  }
}
