/**
 * Exact decimal parsing and formatting over bigint.
 *
 * On-chain amounts are integers in the token's smallest unit. Nothing here goes
 * through a JavaScript number, so no amount is ever rounded by floating point.
 */

export type ParseResult =
  | { ok: true; value: bigint }
  | { ok: false; reason: "empty" | "invalid" | "too-precise" | "negative" };

const DECIMAL = /^(\d+)(?:\.(\d*))?$|^\.(\d+)$/;

/**
 * Parses a decimal string into an integer scaled by `10^decimals`.
 * Accepts thousands separators (`,` or spaces) and refuses more fractional
 * digits than `decimals` instead of rounding them away.
 */
export function parseDecimal(input: string, decimals: number): ParseResult {
  const text = input.trim().replace(/[,\s_]/g, "");
  if (text === "") return { ok: false, reason: "empty" };
  if (text.startsWith("-")) return { ok: false, reason: "negative" };
  const match = DECIMAL.exec(text);
  if (!match) return { ok: false, reason: "invalid" };
  const whole = match[1] ?? "0";
  const fraction = (match[2] ?? match[3] ?? "").replace(/0+$/, "");
  if (fraction.length > decimals) return { ok: false, reason: "too-precise" };
  const scale = 10n ** BigInt(decimals);
  return { ok: true, value: BigInt(whole) * scale + BigInt(fraction.padEnd(decimals, "0") || "0") };
}

export interface FormatOptions {
  /** Most fractional digits shown. Extra digits are cut, never rounded up. */
  maxFraction?: number;
  /** Fewest fractional digits shown; pads with zeros. */
  minFraction?: number;
  /** Group the whole part in thousands. */
  grouping?: boolean;
}

/** Formats an integer scaled by `10^decimals` as a decimal string. Rounds toward zero. */
export function formatDecimal(value: bigint, decimals: number, options: FormatOptions = {}): string {
  const { maxFraction = decimals, minFraction = 0, grouping = true } = options;
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const scale = 10n ** BigInt(decimals);
  const whole = (abs / scale).toString();
  let fraction = (abs % scale).toString().padStart(decimals, "0").slice(0, Math.min(maxFraction, decimals));
  fraction = fraction.replace(/0+$/, "");
  if (fraction.length < minFraction) fraction = fraction.padEnd(minFraction, "0");
  const grouped = grouping ? whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") : whole;
  return `${negative ? "-" : ""}${grouped}${fraction ? `.${fraction}` : ""}`;
}

/** Integer division rounding up, for non-negative operands. */
export function ceilDiv(a: bigint, b: bigint): bigint {
  if (b <= 0n) throw new RangeError("division by zero or a negative divisor");
  if (a < 0n) throw new RangeError("ceilDiv takes a non-negative dividend");
  return a === 0n ? 0n : (a - 1n) / b + 1n;
}

export function minBig(a: bigint, b: bigint): bigint {
  return a < b ? a : b;
}
