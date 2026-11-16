/**
 * What a position's numbers mean at a given moment: when the next payout is
 * due, how long the beneficiary has to check in, whether succession can be
 * triggered, and how many payouts the buffer covers.
 *
 * Mirrors the vault's rules (PerennialVault.sol): `_settle`, `successionDeadline`,
 * `triggerSuccession`. All times are unix seconds as bigint.
 */
import { minBig } from "./decimal";

export interface PositionState {
  owner: `0x${string}`;
  beneficiary: `0x${string}`;
  ownerCanClose: boolean;
  succeeded: boolean;
  closed: boolean;
  payoutInterval: bigint;
  checkInPeriod: bigint;
  gracePeriod: bigint;
  lastCheckIn: bigint;
  lastPayout: bigint;
  payoutAmount: bigint;
  principal: bigint;
  shares: bigint;
  buffer: bigint;
  nonce: bigint;
  /** Most the buffer keeps; the rest is added to the principal. */
  bufferCap: bigint;
  /** Spends and claims may draw on principal, at most `payoutAmount` per `payoutInterval` in total. */
  budgetMode: boolean;
  windowStart: bigint;
  windowSpent: bigint;
}

export type Phase =
  /** The beneficiary is inside the check-in period. */
  | "active"
  /** The check-in period has passed; the grace period is running. */
  | "grace"
  /** Check-in and grace have both passed: anyone can trigger succession. */
  | "succession-open"
  /** Deadline passed, but there are no heirs, so succession cannot happen. */
  | "stalled"
  /** Succession happened. Payouts go to the heirs. */
  | "succeeded"
  | "closed";

export interface Timeline {
  phase: Phase;
  /** When the check-in period ends. */
  checkInDueAt: bigint;
  /** After this moment succession can be triggered (strictly after, as in the contract). */
  successionAt: bigint;
  nextPayoutAt: bigint;
  /** Whole payout intervals that have passed since the last payout. */
  periodsDue: bigint;
}

export function timeline(p: PositionState, now: bigint, heirCount: number): Timeline {
  const checkInDueAt = p.lastCheckIn + p.checkInPeriod;
  const successionAt = checkInDueAt + p.gracePeriod;
  const nextPayoutAt = p.lastPayout + p.payoutInterval;
  const periodsDue = now > p.lastPayout && p.payoutInterval > 0n ? (now - p.lastPayout) / p.payoutInterval : 0n;

  let phase: Phase;
  if (p.closed) phase = "closed";
  else if (p.succeeded) phase = "succeeded";
  else if (now > successionAt) phase = heirCount > 0 ? "succession-open" : "stalled";
  else if (now > checkInDueAt) phase = "grace";
  else phase = "active";

  return { phase, checkInDueAt, successionAt, nextPayoutAt, periodsDue };
}

/**
 * What a claim (or, after succession, a distribution) would pay right now:
 * the scheduled amount for every whole period passed, capped by what the
 * buffer will hold after the harvest the call makes first. A payout amount of
 * zero means "everything in the buffer".
 */
export function payableNow(p: PositionState, pendingYield: bigint, now: bigint): bigint {
  if (p.closed) return 0n;
  const { periodsDue } = timeline(p, now, 0);
  if (periodsDue === 0n) return 0n;
  const available = p.buffer + pendingYield;
  const owed = p.payoutAmount === 0n ? available : p.payoutAmount * periodsDue;
  return minBig(owed, available);
}

/** How many full scheduled payouts the buffer covers. Null when the payout is "everything". */
export function payoutsCovered(buffer: bigint, payoutAmount: bigint): bigint | null {
  if (payoutAmount === 0n) return null;
  return buffer / payoutAmount;
}

/** Splits `amount` between heirs as the vault does: floor per heir, remainder stays in the buffer. */
export function splitBetweenHeirs(amount: bigint, weightsBps: readonly bigint[]): { shares: bigint[]; remainder: bigint } {
  const shares = weightsBps.map((bps) => (amount * bps) / 10_000n);
  const paid = shares.reduce((a, b) => a + b, 0n);
  return { shares, remainder: amount - paid };
}

const UNITS: readonly (readonly [bigint, string, string])[] = [
  [86_400n, "day", "days"],
  [3_600n, "hour", "hours"],
  [60n, "minute", "minutes"],
  [1n, "second", "seconds"],
];

/** "3 days 4 hours". Shows the two largest non-zero units. */
export function formatDuration(seconds: bigint): string {
  if (seconds < 0n) seconds = -seconds;
  if (seconds === 0n) return "0 seconds";
  const parts: string[] = [];
  let rest = seconds;
  for (const [size, one, many] of UNITS) {
    if (parts.length === 2) break;
    const n = rest / size;
    if (n > 0n) {
      parts.push(`${n.toString()} ${n === 1n ? one : many}`);
      rest -= n * size;
    } else if (parts.length === 1) {
      break;
    }
  }
  return parts.join(" ");
}

/** "in 3 days 4 hours" or "2 hours ago". */
export function formatRelative(at: bigint, now: bigint): string {
  if (at === now) return "now";
  return at > now ? `in ${formatDuration(at - now)}` : `${formatDuration(now - at)} ago`;
}

/** ISO-like date and time in UTC, e.g. "2026-11-15 14:03 UTC". */
export function formatUtc(at: bigint): string {
  const d = new Date(Number(at) * 1000);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

/** The payout intervals the app offers. "Monthly" is a twelfth of a year, so twelve payouts make a year exactly. */
export const INTERVALS = [
  { id: "weekly", seconds: 604_800n },
  { id: "monthly", seconds: 2_628_000n },
  { id: "quarterly", seconds: 7_884_000n },
  { id: "yearly", seconds: 31_536_000n },
] as const;

export type IntervalId = (typeof INTERVALS)[number]["id"];

export function intervalSeconds(id: IntervalId): bigint {
  const found = INTERVALS.find((i) => i.id === id);
  if (!found) throw new RangeError(`unknown interval ${id}`);
  return found.seconds;
}
