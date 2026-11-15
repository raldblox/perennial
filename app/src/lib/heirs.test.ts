import { describe, expect, it } from "vitest";
import { bpsToPercent, evenSplit, MAX_HEIRS, percentToBps, validateHeirs } from "./heirs";

const A = "0x1111111111111111111111111111111111111111";
const B = "0x2222222222222222222222222222222222222222";
const C = "0x3333333333333333333333333333333333333333";

describe("percent and basis points", () => {
  it("converts both ways", () => {
    expect(percentToBps("100")).toBe(10_000n);
    expect(percentToBps("33.33")).toBe(3_333n);
    expect(percentToBps("0.01")).toBe(1n);
    expect(percentToBps("33.333")).toBeNull();
    expect(percentToBps("101")).toBeNull();
    expect(percentToBps("x")).toBeNull();
    expect(bpsToPercent(3_334)).toBe("33.34");
    expect(bpsToPercent(5_000n)).toBe("50");
    expect(bpsToPercent(1_250n)).toBe("12.5");
  });

  it("splits evenly to exactly 100", () => {
    expect(evenSplit(3)).toEqual(["33.34", "33.33", "33.33"]);
    expect(evenSplit(1)).toEqual(["100"]);
    expect(evenSplit(0)).toEqual([]);
    for (let n = 1; n <= MAX_HEIRS; n++) {
      const total = evenSplit(n).reduce((sum, p) => sum + (percentToBps(p) ?? 0n), 0n);
      expect(total).toBe(10_000n);
    }
  });
});

describe("validateHeirs", () => {
  it("accepts an empty list", () => {
    expect(validateHeirs([])).toEqual({ heirs: [], rows: [], list: null, totalBps: 0n });
  });

  it("accepts weights totalling 100% and checksums the addresses", () => {
    const result = validateHeirs([
      { address: A, percent: "60" },
      { address: B.toUpperCase().replace("0X", "0x"), percent: "40" },
    ]);
    expect(result.list).toBeNull();
    expect(result.heirs).toEqual([
      { account: A, bps: 6_000 },
      { account: B, bps: 4_000 },
    ]);
  });

  it("reports a total that is not 100%", () => {
    const result = validateHeirs([
      { address: A, percent: "60" },
      { address: B, percent: "30" },
    ]);
    expect(result.heirs).toBeNull();
    expect(result.list).toBe("total");
    expect(result.totalBps).toBe(9_000n);
  });

  it("reports row errors", () => {
    const result = validateHeirs([
      { address: "", percent: "10" },
      { address: "0x12", percent: "10" },
      { address: "0x0000000000000000000000000000000000000000", percent: "10" },
      { address: A, percent: "10" },
      { address: A.toLowerCase(), percent: "10" },
      { address: B, percent: "ten" },
      { address: C, percent: "0" },
    ]);
    expect(result.rows).toEqual([
      "address-missing",
      "address-invalid",
      "address-zero",
      null,
      "duplicate",
      "percent-invalid",
      "percent-zero",
    ]);
    expect(result.heirs).toBeNull();
  });

  it("refuses more than the vault allows", () => {
    const drafts = Array.from({ length: MAX_HEIRS + 1 }, (_, i) => ({
      address: `0x${(i + 1).toString(16).padStart(40, "0")}`,
      percent: "1",
    }));
    expect(validateHeirs(drafts).list).toBe("too-many");
  });
});
