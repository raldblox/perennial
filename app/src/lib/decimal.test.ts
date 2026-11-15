import { describe, expect, it } from "vitest";
import { ceilDiv, formatDecimal, minBig, parseDecimal } from "./decimal";

describe("parseDecimal", () => {
  it("scales whole and fractional parts exactly", () => {
    expect(parseDecimal("110400", 6)).toEqual({ ok: true, value: 110_400_000_000n });
    expect(parseDecimal("0.000001", 6)).toEqual({ ok: true, value: 1n });
    expect(parseDecimal("1.5", 6)).toEqual({ ok: true, value: 1_500_000n });
    expect(parseDecimal(".25", 2)).toEqual({ ok: true, value: 25n });
    expect(parseDecimal("7.", 2)).toEqual({ ok: true, value: 700n });
  });

  it("accepts thousands separators and surrounding space", () => {
    expect(parseDecimal(" 1,234,567.89 ", 2)).toEqual({ ok: true, value: 123_456_789n });
    expect(parseDecimal("1 000", 0)).toEqual({ ok: true, value: 1000n });
  });

  it("ignores trailing zeros beyond the precision", () => {
    expect(parseDecimal("1.500000000", 6)).toEqual({ ok: true, value: 1_500_000n });
  });

  it("refuses rather than rounds", () => {
    expect(parseDecimal("0.0000001", 6)).toEqual({ ok: false, reason: "too-precise" });
    expect(parseDecimal("", 6)).toEqual({ ok: false, reason: "empty" });
    expect(parseDecimal("-1", 6)).toEqual({ ok: false, reason: "negative" });
    expect(parseDecimal("1e6", 6)).toEqual({ ok: false, reason: "invalid" });
    expect(parseDecimal("1.2.3", 6)).toEqual({ ok: false, reason: "invalid" });
    expect(parseDecimal("abc", 6)).toEqual({ ok: false, reason: "invalid" });
  });

  it("handles amounts beyond the safe integer range", () => {
    expect(parseDecimal("123456789012345678901234567890", 18)).toEqual({
      ok: true,
      value: 123456789012345678901234567890n * 10n ** 18n,
    });
  });
});

describe("formatDecimal", () => {
  it("groups and trims", () => {
    expect(formatDecimal(110_400_000_000n, 6)).toBe("110,400");
    expect(formatDecimal(1_500_000n, 6)).toBe("1.5");
    expect(formatDecimal(0n, 6)).toBe("0");
  });

  it("cuts extra digits toward zero, never rounding up", () => {
    expect(formatDecimal(1_999_999n, 6, { maxFraction: 2 })).toBe("1.99");
    expect(formatDecimal(-1_999_999n, 6, { maxFraction: 2 })).toBe("-1.99");
  });

  it("pads to a minimum", () => {
    expect(formatDecimal(1_500_000n, 6, { minFraction: 2, maxFraction: 2 })).toBe("1.50");
    expect(formatDecimal(5n, 6, { minFraction: 2, maxFraction: 2 })).toBe("0.00");
  });

  it("can skip grouping", () => {
    expect(formatDecimal(1_234_567_000_000n, 6, { grouping: false })).toBe("1234567");
  });

  it("round-trips with parseDecimal", () => {
    for (const text of ["0.000001", "1", "42.5", "1234567.123456"]) {
      const parsed = parseDecimal(text, 6);
      if (!parsed.ok) throw new Error("parse failed");
      expect(formatDecimal(parsed.value, 6, { grouping: false })).toBe(text);
    }
  });
});

describe("ceilDiv and minBig", () => {
  it("rounds up", () => {
    expect(ceilDiv(10n, 3n)).toBe(4n);
    expect(ceilDiv(9n, 3n)).toBe(3n);
    expect(ceilDiv(0n, 3n)).toBe(0n);
  });

  it("refuses a zero divisor", () => {
    expect(() => ceilDiv(1n, 0n)).toThrow(RangeError);
  });

  it("picks the smaller", () => {
    expect(minBig(2n, 3n)).toBe(2n);
    expect(minBig(3n, 2n)).toBe(2n);
  });
});
