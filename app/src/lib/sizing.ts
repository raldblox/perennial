/**
 * Sizing a position: the principal whose yield pays a target payout.
 *
 *   principal = margin × annual payout ÷ yield rate
 *
 * Rates are in basis points (500 = 5%) and the margin in ten-thousandths
 * (11_500 = 1.15), so every step is integer arithmetic on token units.
 */
import { ceilDiv } from "./decimal";

export const BPS = 10_000n;
export const SECONDS_PER_YEAR = 31_536_000n;
/** The margin the product uses by default: 15% more principal than break-even. */
export const DEFAULT_MARGIN = 11_500n;
/** The testnet yield source pays this fixed rate (simulated). */
export const DEFAULT_RATE_BPS = 500n;

function check(rateBps: bigint, margin: bigint): void {
  if (rateBps <= 0n) throw new RangeError("rate must be above zero");
  if (margin <= 0n) throw new RangeError("margin must be above zero");
}

/** Principal needed to pay `annualPayout` a year. Rounds up, so it never falls short. */
export function principalFor(annualPayout: bigint, rateBps: bigint, margin: bigint = DEFAULT_MARGIN): bigint {
  check(rateBps, margin);
  return ceilDiv(annualPayout * margin, rateBps);
}

/** The yearly payout a principal supports at a margin. Rounds down. */
export function annualPayoutFor(principal: bigint, rateBps: bigint, margin: bigint = DEFAULT_MARGIN): bigint {
  check(rateBps, margin);
  return (principal * rateBps) / margin;
}

/** Payouts in a year at a payout interval, as a whole-unit amount: `payout × year ÷ interval`. */
export function annualise(payout: bigint, intervalSeconds: bigint): bigint {
  if (intervalSeconds <= 0n) throw new RangeError("interval must be above zero");
  return (payout * SECONDS_PER_YEAR) / intervalSeconds;
}

/** Principal for a payout every `intervalSeconds`. Exact: no intermediate rounding. */
export function principalForSchedule(
  payout: bigint,
  intervalSeconds: bigint,
  rateBps: bigint,
  margin: bigint = DEFAULT_MARGIN,
): bigint {
  check(rateBps, margin);
  if (intervalSeconds <= 0n) throw new RangeError("interval must be above zero");
  return ceilDiv(payout * SECONDS_PER_YEAR * margin, intervalSeconds * rateBps);
}

/** Yield over `seconds` on `principal` at a simple yearly rate. Rounds down. */
export function yieldOver(principal: bigint, rateBps: bigint, seconds: bigint): bigint {
  return (principal * rateBps * seconds) / (BPS * SECONDS_PER_YEAR);
}

/**
 * How many times over the expected yield covers the payout, in ten-thousandths
 * (11_500 = 1.15×). Zero payout has no meaningful coverage and returns null.
 */
export function coverage(principal: bigint, annualPayout: bigint, rateBps: bigint): bigint | null {
  if (annualPayout <= 0n) return null;
  return (principal * rateBps) / annualPayout;
}

/** The rate at which the yield exactly pays the payout, in basis points. Rounds up. */
export function breakEvenRateBps(principal: bigint, annualPayout: bigint): bigint | null {
  if (principal <= 0n) return null;
  return ceilDiv(annualPayout * BPS, principal);
}

/** Converts a WAD rate (0.05e18 = 5%) as yield sources report it into basis points, rounding down. */
export function wadToBps(rateWad: bigint): bigint {
  return (rateWad * BPS) / 10n ** 18n;
}
