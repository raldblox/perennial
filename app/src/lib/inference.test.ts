import { describe, expect, it } from "vitest";
import { callsPerHourFor, dayOfCalls, depositForCalls, formatCalls, lastsFor, runwayHours, yieldPerDay, yieldPerHour } from "./inference";

const UNIT = 1_000_000n; // fUSD has 6 decimals
const PRICE = 2_000n; // 0.002 fUSD a call

describe("sizing a deposit for inference", () => {
  it("500 fUSD at Aave v3 USDC's 4.29% with a 1.15 margin pays about one 0.002 call an hour", () => {
    // 500 × 4.29% = 21.45 a year; ÷ 1.15 = 18.65; ÷ 8,760 h = 0.00213 an hour; ÷ 0.002 = 1.06 calls.
    expect(callsPerHourFor(500n * UNIT, PRICE, 429n)).toBe(106n);
    expect(formatCalls(106n)).toBe("1.06");
  });

  it("5,000 fUSD pays about ten an hour", () => {
    expect(callsPerHourFor(5_000n * UNIT, PRICE, 429n)).toBe(1_064n);
  });

  it("one call an hour exactly needs about 470 fUSD at 4.29%", () => {
    // 0.002 × 8,760 = 17.52 a year; × 1.15 ÷ 0.0429 = 469.65035.
    expect(depositForCalls(100n, PRICE, 429n)).toBe(469_650_350n);
    expect(callsPerHourFor(469_650_350n, PRICE, 429n)).toBe(100n);
  });

  it("is consistent both ways for any rate", () => {
    for (const [calls, rate] of [
      [100n, 429n],
      [100n, 380n],
      [100n, 506n],
      [1_000n, 437n],
      [250n, 1_576_800n],
    ] as const) {
      const deposit = depositForCalls(calls, PRICE, rate);
      expect(callsPerHourFor(deposit, PRICE, rate)).toBeGreaterThanOrEqual(calls);
      expect(callsPerHourFor(deposit - 1_000n, PRICE, rate)).toBeLessThanOrEqual(calls);
    }
  });

  it("the accelerated testnet rate makes 20 fUSD pay several calls a minute", () => {
    // 15,768% a year: 20 × 157.68 ÷ 1.15 ÷ 8,760 = 0.313 an hour = 156.52 calls, 2.6 a minute.
    expect(callsPerHourFor(20n * UNIT, PRICE, 1_576_800n)).toBe(15_652n);
  });

  it("refuses a zero price or rate", () => {
    expect(() => callsPerHourFor(1n, 0n, 500n)).toThrow(RangeError);
    expect(() => depositForCalls(1n, PRICE, 0n)).toThrow(RangeError);
  });
});

describe("running a position", () => {
  it("knows the hourly yield", () => {
    expect(yieldPerHour(500n * UNIT, 500n)).toBe(2_853n); // 25 ÷ 8,760 = 0.002853
  });

  it("caps the buffer at a day of calls", () => {
    expect(dayOfCalls(124n, PRICE)).toBe(59_520n); // 1.24 × 24 × 0.002 = 0.05952
  });

  it("says how long the buffer lasts", () => {
    expect(runwayHours(10_000n, 2_000n)).toBe(5n);
    expect(runwayHours(10_000n, 0n)).toBeNull();
  });
});

describe("how long a position lasts", () => {
  const base = { buffer: 10n * UNIT, principal: 1_000n * UNIT, budgetMode: false };

  it("lasts indefinitely when nothing is spent", () => {
    expect(lastsFor({ ...base, spendPerDay: 0n, incomePerDay: 0n })).toEqual({ kind: "idle" });
  });

  it("lasts indefinitely once income covers the spending", () => {
    expect(lastsFor({ ...base, spendPerDay: 5n * UNIT, incomePerDay: 5n * UNIT })).toEqual({ kind: "covered" });
  });

  it("without budget mode counts only the buffer", () => {
    // 10 fUSD buffer, 5 a day spent, 1 a day earned: 10 / 4 = 2.5 days.
    expect(lastsFor({ ...base, spendPerDay: 5n * UNIT, incomePerDay: 1n * UNIT })).toEqual({ kind: "days", daysX100: 250n });
  });

  it("with budget mode counts the buffer and the principal", () => {
    // 1,010 fUSD reachable, 5 a day spent, nothing earned: 202 days.
    expect(lastsFor({ ...base, budgetMode: true, spendPerDay: 5n * UNIT, incomePerDay: 0n })).toEqual({ kind: "days", daysX100: 20_200n });
  });

  it("a source that pays nothing earns nothing", () => {
    expect(yieldPerDay(1_000n * UNIT, 0n)).toBe(0n);
    expect(yieldPerDay(365n * UNIT, 10_000n)).toBe(1n * UNIT);
  });
});
