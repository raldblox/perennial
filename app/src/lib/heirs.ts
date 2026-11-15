/**
 * The heirs editor's rules, matching the vault's `_storeHeirs`: at most 16
 * heirs, no zero address, no duplicates, no zero weight, and weights that total
 * exactly 10,000 basis points (100%) unless the list is empty.
 */
import { getAddress, isAddress, type Address } from "viem";
import { parseDecimal } from "./decimal";

export const MAX_HEIRS = 16;
export const TOTAL_BPS = 10_000n;

export interface HeirDraft {
  address: string;
  /** Percent with up to two decimals, as typed. */
  percent: string;
}

export interface Heir {
  account: Address;
  bps: number;
}

export type HeirRowError = "address-missing" | "address-invalid" | "address-zero" | "duplicate" | "percent-invalid" | "percent-zero";
export type HeirListError = "too-many" | "total";

export interface HeirValidation {
  heirs: Heir[] | null;
  rows: (HeirRowError | null)[];
  list: HeirListError | null;
  /** Sum of the weights that parsed, in basis points. */
  totalBps: bigint;
}

const ZERO = "0x0000000000000000000000000000000000000000";

/** Percent text to basis points: "33.33" → 3333. Null if not a percent with at most two decimals. */
export function percentToBps(text: string): bigint | null {
  const parsed = parseDecimal(text, 2);
  if (!parsed.ok || parsed.value > TOTAL_BPS) return null;
  return parsed.value;
}

export function bpsToPercent(bps: bigint | number): string {
  const v = BigInt(bps);
  const whole = v / 100n;
  const frac = (v % 100n).toString().padStart(2, "0").replace(/0+$/, "");
  return frac ? `${whole.toString()}.${frac}` : whole.toString();
}

export function validateHeirs(drafts: readonly HeirDraft[]): HeirValidation {
  const rows: (HeirRowError | null)[] = [];
  const heirs: Heir[] = [];
  const seen = new Set<string>();
  let totalBps = 0n;

  for (const draft of drafts) {
    const address = draft.address.trim();
    const bps = percentToBps(draft.percent);
    if (bps !== null) totalBps += bps;

    let error: HeirRowError | null = null;
    if (address === "") error = "address-missing";
    else if (!isAddress(address, { strict: false })) error = "address-invalid";
    else if (address.toLowerCase() === ZERO) error = "address-zero";
    else if (seen.has(address.toLowerCase())) error = "duplicate";
    else if (bps === null) error = "percent-invalid";
    else if (bps === 0n) error = "percent-zero";

    if (isAddress(address, { strict: false })) seen.add(address.toLowerCase());
    rows.push(error);
    if (error === null && bps !== null) heirs.push({ account: getAddress(address), bps: Number(bps) });
  }

  let list: HeirListError | null = null;
  if (drafts.length > MAX_HEIRS) list = "too-many";
  else if (drafts.length > 0 && totalBps !== TOTAL_BPS) list = "total";

  const ok = list === null && rows.every((r) => r === null);
  return { heirs: ok ? heirs : null, rows, list, totalBps };
}

/** Even split in percent that totals exactly 100: 3 heirs → 33.34, 33.33, 33.33. */
export function evenSplit(count: number): string[] {
  if (count <= 0) return [];
  const base = TOTAL_BPS / BigInt(count);
  const extra = Number(TOTAL_BPS - base * BigInt(count));
  return Array.from({ length: count }, (_, i) => bpsToPercent(base + (i < extra ? 1n : 0n)));
}
