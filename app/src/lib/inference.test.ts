import { describe, expect, it } from "vitest";
import { callsPerHourFor, dayOfCalls, depositForCalls, formatCalls, runwayHours, yieldPerHour } from "./inference";

const UNIT = 1_000_000n; // fUSD has 6 decimals
const PRICE = 2_000n; // 0.002 fUSD a call

describe("sizing a deposit for inference", () => {
  it("500 fUSD at 5% with a 1.15 margin pays about one 0.002 call an hour", () => {
    // 500 × 5% = 25 a year; ÷ 1.15 = 21.74; ÷ 8,760 h = 0.00248 an hour; ÷ 0.002 = 1.24 calls.
    expect(callsPerHourFor(500n * UNIT, PRICE, 500n)).toBe(124n);
    expect(formatCalls(124n)).toBe("1.24");
  });

  it("5,000 fUSD pays about twelve an hour, not ten", () => {
    expect(callsPerHourFor(5_000n * UNIT, PRICE, 500n)).toBe(1_240n);
  });

  it("one call an hour exactly needs 402.96 fUSD", () => {
    // 0.002 × 8,760 = 17.52 a year; × 1.15 ÷ 0.05 = 402.96.
    expect(depositForCalls(100n, PRICE, 500n)).toBe(402_960_000n);
    expect(callsPerHourFor(402_960_000n, PRICE, 500n)).toBe(100n);
  });

  it("is consistent both ways for any rate", () => {
    for (const [calls, rate] of [
      [100n, 500n],
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
