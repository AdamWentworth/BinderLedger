import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const stateVersion = 1;
const stateTimestamp = (date) => date.toISOString().replace(/\.000Z$/, "Z");

const utcCycle = (date, resetDay) => {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const cycleStartsThisMonth = date.getUTCDate() >= resetDay;
  const start = new Date(Date.UTC(
    cycleStartsThisMonth ? year : month === 0 ? year - 1 : year,
    cycleStartsThisMonth ? month : month === 0 ? 11 : month - 1,
    resetDay,
  ));
  const end = new Date(Date.UTC(
    start.getUTCMonth() === 11 ? start.getUTCFullYear() + 1 : start.getUTCFullYear(),
    start.getUTCMonth() === 11 ? 0 : start.getUTCMonth() + 1,
    resetDay,
  ));
  return { start, end };
};

const nextUtcDay = (date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1));

const laterDate = (...dates) => {
  const timestamps = dates
    .filter(Boolean)
    .map((date) => date.getTime())
    .filter(Number.isFinite);
  return timestamps.length > 0 ? new Date(Math.max(...timestamps)) : null;
};

export class QuotaLedgerError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "QuotaLedgerError";
    this.status = status;
  }
}

export class JustTcgQuotaLedger {
  constructor({
    filename,
    monthlyRequestLimit = 1000,
    monthlyRequestReserve = 25,
    monthlyResetDay = 23,
    configuredBlockedUntil = null,
    now = () => new Date(),
  }) {
    this.filename = filename;
    this.monthlyRequestLimit = monthlyRequestLimit;
    this.monthlyRequestReserve = monthlyRequestReserve;
    this.monthlyResetDay = monthlyResetDay;
    this.configuredBlockedUntil = configuredBlockedUntil;
    this.now = now;
  }

  async status() {
    const now = this.now();
    const state = await this.#load(now);
    return this.#status(state, now);
  }

  async reserveRequest() {
    const now = this.now();
    const state = await this.#load(now);
    const status = this.#status(state, now);
    if (status.blocked) {
      throw new QuotaLedgerError(
        `JustTCG calls are blocked until ${status.blockedUntil.toISOString()}: ${status.blockReason}`,
        status,
      );
    }
    if (status.requestsRemaining <= 0) {
      throw new QuotaLedgerError(
        `The local JustTCG monthly budget is exhausted until ${status.cycleEnd.toISOString()}.`,
        status,
      );
    }

    state.requestAttempts += 1;
    state.updatedAt = now.toISOString();
    await this.#write(state);
    return this.#status(state, now);
  }

  async reconcileProviderUsage(requestsUsed) {
    if (!Number.isInteger(requestsUsed) || requestsUsed < 0) return this.status();
    const now = this.now();
    const state = await this.#load(now);
    if (requestsUsed > state.requestAttempts) {
      state.requestAttempts = requestsUsed;
      state.updatedAt = now.toISOString();
      await this.#write(state);
    }
    return this.#status(state, now);
  }

  async blockFromProviderResponse(detail, retryAfterSeconds = null) {
    const now = this.now();
    const state = await this.#load(now);
    const normalizedDetail = String(detail ?? "provider rate limit").trim();
    let blockedUntil;
    if (/total|monthly/i.test(normalizedDetail)) {
      blockedUntil = new Date(state.cycleEnd);
    } else if (/daily/i.test(normalizedDetail)) {
      blockedUntil = nextUtcDay(now);
    } else {
      const seconds = Number(retryAfterSeconds);
      blockedUntil = new Date(
        now.getTime() + (Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 15 * 60 * 1000),
      );
    }

    const existingBlock = state.blockedUntil ? new Date(state.blockedUntil) : null;
    state.blockedUntil = laterDate(existingBlock, blockedUntil)?.toISOString() ?? null;
    state.blockReason = normalizedDetail;
    state.updatedAt = now.toISOString();
    await this.#write(state);
    return this.#status(state, now);
  }

  #status(state, now) {
    const configuredBlock = this.configuredBlockedUntil;
    const persistedBlock = state.blockedUntil ? new Date(state.blockedUntil) : null;
    const blockedUntil = laterDate(configuredBlock, persistedBlock);
    const blocked = Boolean(blockedUntil && blockedUntil > now);
    const usableLimit = Math.max(0, this.monthlyRequestLimit - this.monthlyRequestReserve);
    return {
      cycleStart: new Date(state.cycleStart),
      cycleEnd: new Date(state.cycleEnd),
      requestAttempts: state.requestAttempts,
      requestLimit: this.monthlyRequestLimit,
      requestReserve: this.monthlyRequestReserve,
      requestsRemaining: Math.max(0, usableLimit - state.requestAttempts),
      blocked,
      blockedUntil: blocked ? blockedUntil : null,
      blockReason: blocked
        ? configuredBlock && configuredBlock >= (persistedBlock ?? new Date(0))
          ? "operator-configured quota pause"
          : state.blockReason ?? "provider quota pause"
        : null,
    };
  }

  async #load(now) {
    const cycle = utcCycle(now, this.monthlyResetDay);
    let state;
    try {
      state = JSON.parse(await readFile(this.filename, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }

    if (
      state?.version !== stateVersion ||
      state?.provider !== "JustTCG" ||
      state?.cycleStart !== stateTimestamp(cycle.start) ||
      !Number.isInteger(state?.requestAttempts) ||
      state.requestAttempts < 0
    ) {
      state = {
        version: stateVersion,
        provider: "JustTCG",
        cycleStart: stateTimestamp(cycle.start),
        cycleEnd: stateTimestamp(cycle.end),
        requestAttempts: 0,
        blockedUntil: "",
        blockReason: "",
        updatedAt: now.toISOString(),
      };
      await this.#write(state);
    }
    return state;
  }

  async #write(state) {
    await mkdir(path.dirname(this.filename), { recursive: true });
    const temporaryPath = `${this.filename}.${process.pid}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o640 });
    await rename(temporaryPath, this.filename);
  }
}

export const monthlyQuotaCycle = utcCycle;
