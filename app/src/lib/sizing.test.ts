import { describe, expect, it } from "vitest";
import {
  annualPayoutFor,
  annualise,
  breakEvenRateBps,
  coverage,
  principalFor,
  principalForSchedule,
  wadToBps,
  yieldOver,
} from "./sizing";

const UNIT = 1_000_000n; // a 6-decimal token

describe("principalFor", () => {
  it("is margin × annual payout ÷ rate", () => {
    // 400 a month at 5% with a 1.15 margin needs 110,400.
    expect(principalFor(4_800n * UNIT, 500n, 11_500n)).toBe(110_400n * UNIT);
    // The positioning examples.
    expect(principalFor(3_000n * UNIT, 500n)).toBe(69_000n * UNIT);
    expect(principalFor(12_000n * UNIT, 500n)).toBe(276_000n * UNIT);
    expect(principalFor(18_000n * UNIT, 400n)).toBe(517_500n * UNIT);
    expect(principalFor(960n * UNIT, 500n)).toBe(22_080n * UNIT);
  });

  it("is break-even at a margin of 1", () => {
    expect(principalFor(5n * UNIT, 500n, 10_000n)).toBe(100n * UNIT);
  });

  it("rounds up to the smallest unit", () => {
    expect(principalFor(1n, 300n, 10_000n)).toBe(34n); // 33.33… → 34
  });

  it("refuses a zero rate or margin", () => {
    expect(() => principalFor(1n, 0n)).toThrow(RangeError);
    expect(() => principalFor(1n, 500n, 0n)).toThrow(RangeError);
  });
});

describe("annualPayoutFor", () => {
  it("is the inverse, rounding down", () => {
    expect(annualPayoutFor(110_400n * UNIT, 500n, 11_500n)).toBe(4_800n * UNIT);
    expect(annualPayoutFor(100n, 500n, 11_500n)).toBe(4n); // 4.34 → 4
  });

  it("never pays more than the principal supports", () => {
    for (const payout of [1n, 7n, 999n, 4_800n * UNIT + 13n]) {
      const p = principalFor(payout, 437n, 11_500n);
      expect(annualPayoutFor(p, 437n, 11_500n)).toBeGreaterThanOrEqual(payout);
      expect(annualPayoutFor(p - 1n, 437n, 11_500n)).toBeLessThanOrEqual(payout);
    }
  });
});

describe("schedules", () => {
  it("annualises a payout per interval", () => {
    expect(annualise(400n * UNIT, 2_628_000n)).toBe(4_800n * UNIT);
    expect(annualise(100n * UNIT, 31_536_000n)).toBe(100n * UNIT);
    expect(() => annualise(1n, 0n)).toThrow(RangeError);
  });

  it("sizes a schedule without intermediate rounding", () => {
    expect(principalForSchedule(400n * UNIT, 2_628_000n, 500n)).toBe(110_400n * UNIT);
    // Weekly: 52.142857… payouts a year.
    expect(principalForSchedule(100n * UNIT, 604_800n, 500n)).toBe(119_928_571_429n);
  });
});

describe("yield and coverage", () => {
  it("accrues a simple yearly rate over seconds", () => {
    expect(yieldOver(110_400n * UNIT, 500n, 31_536_000n)).toBe(5_520n * UNIT);
    expect(yieldOver(110_400n * UNIT, 500n, 2_628_000n)).toBe(460n * UNIT);
  });

  it("reports coverage in ten-thousandths", () => {
    expect(coverage(110_400n * UNIT, 4_800n * UNIT, 500n)).toBe(11_500n);
    expect(coverage(1n, 0n, 500n)).toBeNull();
  });

  it("finds the break-even rate", () => {
    expect(breakEvenRateBps(110_400n * UNIT, 4_800n * UNIT)).toBe(435n); // 4.3478…% → 4.35%
    expect(breakEvenRateBps(0n, 1n)).toBeNull();
  });

  it("converts WAD rates", () => {
    expect(wadToBps(50_000_000_000_000_000n)).toBe(500n);
  });
});
