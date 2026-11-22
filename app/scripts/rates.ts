/**
 * Prints the reference yield rates the app and docs use, fresh from
 * DefiLlama's public yields API, so the figures in src/lib/referenceRates.ts
 * can be checked and refreshed. The app itself never calls this API.
 *
 *   pnpm rates            print today's and the 30-day figures
 *   pnpm rates --write    also rewrite src/lib/referenceRates.ts
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const API = "https://yields.llama.fi/pools";

/** DefiLlama pool ids, Ethereum mainnet. */
const POOLS = [
  { id: "susds", pool: "d8c4eff5-c8a9-46fc-a888-057c4c668e72", name: "Sky savings (sUSDS)", kind: "savings rate" },
  { id: "aaveUsdc", pool: "aa70268e-4b52-42bf-a116-608b370f9501", name: "Aave v3 USDC supply", kind: "lending" },
  { id: "susde", pool: "66985a81-9c51-46ca-9977-42b4fe7bc6df", name: "Ethena staked USDe (sUSDe)", kind: "staked dollar" },
] as const;

interface Pool {
  pool: string;
  chain: string;
  project: string;
  symbol: string;
  apy: number | null;
  apyMean30d: number | null;
  tvlUsd: number;
}

const response = await fetch(API);
if (!response.ok) throw new Error(`${API} answered ${response.status.toString()}`);
const { data } = (await response.json()) as { data: Pool[] };
const date = new Date().toISOString().slice(0, 10);

const rows = POOLS.map((p) => {
  const found = data.find((d) => d.pool === p.pool);
  if (!found || found.apy === null || found.apyMean30d === null) throw new Error(`pool ${p.pool} (${p.name}) not found or incomplete`);
  return { ...p, project: found.project, symbol: found.symbol, chain: found.chain, apy: found.apy, mean30d: found.apyMean30d, tvlUsd: found.tvlUsd };
});

console.log(`Reference rates from ${API}, fetched ${date} (UTC)\n`);
for (const r of rows) {
  console.log(
    `${r.name.padEnd(28)} ${r.chain} ${r.project}/${r.symbol}  today ${r.apy.toFixed(2)}%  30-day mean ${r.mean30d.toFixed(2)}%  size $${(r.tvlUsd / 1e6).toFixed(1)}m`,
  );
}

if (process.argv.includes("--write")) {
  const target = fileURLToPath(new URL("../src/lib/referenceRates.ts", import.meta.url));
  const entries = rows
    .map(
      (r) => `  {
    id: "${r.id}",
    name: "${r.name}",
    kind: "${r.kind}",
    chain: "${r.chain}",
    pool: "${r.pool}",
    todayPercent: "${r.apy.toFixed(2)}",
    mean30dPercent: "${r.mean30d.toFixed(2)}",
    /** The 30-day mean in basis points, rounded to the nearest: what the presets use. */
    rateBps: ${Math.round(r.mean30d * 100).toString()}n,
  },`,
    )
    .join("\n");
  writeFileSync(
    target,
    `/**
 * Reference yield rates of leading dollar vaults on Ethereum mainnet, used as
 * planning presets. Written by \`pnpm rates --write\`; never fetched at runtime.
 * These are rates on other chains, variable, and they carry their protocols'
 * risks. Nothing on QoreChain pays them.
 */
export const RATES_SOURCE = "DefiLlama yields API (${API})";
export const RATES_DATE = "${date}";

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
${entries}
];

export function referenceRate(id: ReferenceRate["id"]): ReferenceRate {
  const found = REFERENCE_RATES.find((r) => r.id === id);
  if (!found) throw new RangeError(\`unknown reference rate \${id}\`);
  return found;
}
`,
  );
  console.log(`\nwrote ${target}`);
}
