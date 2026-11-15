/**
 * Sizing a deposit for an agent that pays per inference call.
 *
 *   yearly spend = calls per hour × price per call × 8,760 hours
 *   deposit      = margin × yearly spend ÷ yield rate
 *
 * Amounts are token units (bigint), the rate in basis points, the margin in
 * ten-thousandths (11_500 = 1.15), calls per hour in hundredths (150 = 1.5).
 */
import { ceilDiv } from "./decimal";
import { BPS, DEFAULT_MARGIN } from "./sizing";

export const HOURS_PER_YEAR = 8_760n;
export const SECONDS_PER_HOUR = 3_600n;
/** Calls per hour are carried in hundredths. */
export const CALLS_SCALE = 100n;

/** The deposit whose yield pays `callsPerHourX100 / 100` calls an hour at `price` each. Rounds up. */
export function depositForCalls(callsPerHourX100: bigint, price: bigint, rateBps: bigint, margin: bigint = DEFAULT_MARGIN): bigint {
  if (rateBps <= 0n || margin <= 0n) throw new RangeError("rate and margin must be above zero");
  return ceilDiv(callsPerHourX100 * price * HOURS_PER_YEAR * margin, CALLS_SCALE * rateBps);
}

/** Calls an hour, in hundredths, that a deposit pays for indefinitely at `price` each. Rounds down. */
export function callsPerHourFor(deposit: bigint, price: bigint, rateBps: bigint, margin: bigint = DEFAULT_MARGIN): bigint {
  if (price <= 0n) throw new RangeError("price must be above zero");
  if (rateBps <= 0n || margin <= 0n) throw new RangeError("rate and margin must be above zero");
  return (deposit * rateBps * CALLS_SCALE) / (margin * HOURS_PER_YEAR * price);
}

/** What the deposit earns in an hour at the source's rate, before the margin. Rounds down. */
export function yieldPerHour(principal: bigint, rateBps: bigint): bigint {
  return (principal * rateBps) / (BPS * HOURS_PER_YEAR);
}

/** A sensible buffer cap: a day of calls, so a day's spending is always ready and the rest compounds. */
export function dayOfCalls(callsPerHourX100: bigint, price: bigint): bigint {
  return ceilDiv(callsPerHourX100 * price * 24n, CALLS_SCALE);
}

/** Hours the buffer lasts at a spending rate per hour. Null when nothing is being spent. */
export function runwayHours(buffer: bigint, spendPerHour: bigint): bigint | null {
  if (spendPerHour <= 0n) return null;
  return buffer / spendPerHour;
}

/** "1.24" from 124 hundredths. */
export function formatCalls(callsX100: bigint): string {
  const whole = callsX100 / CALLS_SCALE;
  const frac = (callsX100 % CALLS_SCALE).toString().padStart(2, "0").replace(/0+$/, "");
  return frac ? `${whole.toString()}.${frac}` : whole.toString();
}
