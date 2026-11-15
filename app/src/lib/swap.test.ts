import { describe, expect, it } from "vitest";
import { quoteExactIn, quoteFromPool, withSlippage, type Pool } from "./swap";

const FUSD = "erc20:0x97143B771D34ddb9130b807b135Ae675A5a963CA";
// Pool 2 as the testnet reported it on 15 November 2026.
const pool: Pool = { id: "2", token_a: FUSD, token_b: "uqor", reserve_a: "621704225", reserve_b: "7292658564", status: "active" };

describe("native AMM quote", () => {
  it("prices 1 QOR with the constant-product formula", () => {
    // About 0.085 fUSD for 1 QOR at these reserves. On 16 November the scripted swap
    // quoted, and received, 81,166 units against the reserves of that moment.
    const q = quoteFromPool(pool, FUSD, 1_000_000n);
    expect(q.quote).toBe(84_983n);
    expect(q.minOut).toBe(82_433n);
  });

  it("charges the 0.30% fee and rounds down", () => {
    expect(quoteExactIn(1_000n, 1_000_000n, 1_000_000n)).toBe(996n);
    expect(quoteExactIn(0n, 1n, 1n)).toBe(0n);
  });

  it("applies 3% slippage", () => {
    expect(withSlippage(10_000n)).toBe(9_700n);
  });

  it("refuses a pool that is not fUSD/QOR", () => {
    expect(() => quoteFromPool({ ...pool, token_a: "uqor" }, FUSD, 1n)).toThrow();
    expect(() => quoteFromPool({ ...pool, status: "paused" }, FUSD, 1n)).toThrow();
    expect(() => quoteFromPool(undefined, FUSD, 1n)).toThrow();
  });
});
