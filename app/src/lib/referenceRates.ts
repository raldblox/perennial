/**
 * Reference yield rates of leading dollar vaults on Ethereum mainnet, used as
 * planning presets. Written by `pnpm rates --write`; never fetched at runtime.
 * These are rates on other chains, variable, and they carry their protocols'
 * risks. Nothing on QoreChain pays them.
 */
export const RATES_SOURCE = "DefiLlama yields API (https://yields.llama.fi/pools)";
export const RATES_DATE = "2026-11-16";

export interface ReferenceRate {
  id: "susds" | "aaveUsdc" | "susde";
  name: string;
  kind: string;
  chain: string;
  /** DefiLlama pool id. */
  pool: string;
  todayPercent: string;
  mean30dPercent: string;
  rateBps: bigint;
}

export const REFERENCE_RATES: readonly ReferenceRate[] = [
  {
    id: "susds",
    name: "Sky savings (sUSDS)",
    kind: "savings rate",
    chain: "Ethereum",
    pool: "d8c4eff5-c8a9-46fc-a888-057c4c668e72",
    todayPercent: "3.80",
    mean30dPercent: "3.80",
    /** The 30-day mean in basis points, rounded to the nearest: what the presets use. */
    rateBps: 380n,
  },
  {
    id: "aaveUsdc",
    name: "Aave v3 USDC supply",
    kind: "lending",
    chain: "Ethereum",
    pool: "aa70268e-4b52-42bf-a116-608b370f9501",
    todayPercent: "4.38",
    mean30dPercent: "4.29",
    /** The 30-day mean in basis points, rounded to the nearest: what the presets use. */
    rateBps: 429n,
  },
  {
    id: "susde",
    name: "Ethena staked USDe (sUSDe)",
    kind: "staked dollar",
    chain: "Ethereum",
    pool: "66985a81-9c51-46ca-9977-42b4fe7bc6df",
    todayPercent: "5.31",
    mean30dPercent: "5.06",
    /** The 30-day mean in basis points, rounded to the nearest: what the presets use. */
    rateBps: 506n,
  },
];

export function referenceRate(id: ReferenceRate["id"]): ReferenceRate {
  const found = REFERENCE_RATES.find((r) => r.id === id);
  if (!found) throw new RangeError(`unknown reference rate ${id}`);
  return found;
}
