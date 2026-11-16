import { describe, expect, it } from "vitest";
import {
  formatDuration,
  formatRelative,
  formatUtc,
  intervalSeconds,
  payableNow,
  payoutsCovered,
  splitBetweenHeirs,
  timeline,
  type PositionState,
} from "./schedule";

const T0 = 1_800_000_000n;
const DAY = 86_400n;

function position(overrides: Partial<PositionState> = {}): PositionState {
  return {
    owner: "0x0000000000000000000000000000000000000001",
    beneficiary: "0x0000000000000000000000000000000000000002",
    ownerCanClose: false,
    succeeded: false,
    closed: false,
    payoutInterval: 30n * DAY,
    checkInPeriod: 90n * DAY,
    gracePeriod: 30n * DAY,
    lastCheckIn: T0,
    lastPayout: T0,
    payoutAmount: 400n,
    principal: 110_400n,
    shares: 110_400n,
    buffer: 0n,
    nonce: 0n,
    bufferCap: 2n ** 256n - 1n,
    budgetMode: false,
    windowStart: T0,
    windowSpent: 0n,
    ...overrides,
  };
}

describe("timeline", () => {
  it("computes the deadlines the contract uses", () => {
    const t = timeline(position(), T0, 1);
    expect(t.checkInDueAt).toBe(T0 + 90n * DAY);
    expect(t.successionAt).toBe(T0 + 120n * DAY);
    expect(t.nextPayoutAt).toBe(T0 + 30n * DAY);
    expect(t.periodsDue).toBe(0n);
    expect(t.phase).toBe("active");
  });

  it("moves through the phases", () => {
    const p = position();
    expect(timeline(p, T0 + 90n * DAY, 1).phase).toBe("active");
    expect(timeline(p, T0 + 90n * DAY + 1n, 1).phase).toBe("grace");
    // The contract refuses at exactly the deadline and allows one second later.
    expect(timeline(p, T0 + 120n * DAY, 1).phase).toBe("grace");
    expect(timeline(p, T0 + 120n * DAY + 1n, 1).phase).toBe("succession-open");
  });

  it("stalls without heirs", () => {
    expect(timeline(position(), T0 + 200n * DAY, 0).phase).toBe("stalled");
  });

  it("lets terminal states win", () => {
    expect(timeline(position({ succeeded: true }), T0, 1).phase).toBe("succeeded");
    expect(timeline(position({ closed: true, succeeded: true }), T0, 1).phase).toBe("closed");
  });

  it("counts whole periods due", () => {
    expect(timeline(position(), T0 + 30n * DAY - 1n, 1).periodsDue).toBe(0n);
    expect(timeline(position(), T0 + 30n * DAY, 1).periodsDue).toBe(1n);
    expect(timeline(position(), T0 + 95n * DAY, 1).periodsDue).toBe(3n);
  });
});

describe("payableNow", () => {
  it("pays nothing before a period is due", () => {
    expect(payableNow(position({ buffer: 1_000n }), 0n, T0 + DAY)).toBe(0n);
  });

  it("pays the scheduled amount per period, capped by buffer plus pending yield", () => {
    const p = position({ buffer: 500n });
    expect(payableNow(p, 0n, T0 + 30n * DAY)).toBe(400n);
    expect(payableNow(p, 0n, T0 + 60n * DAY)).toBe(500n);
    expect(payableNow(p, 400n, T0 + 60n * DAY)).toBe(800n);
  });

  it("pays everything in the buffer when the payout amount is zero", () => {
    expect(payableNow(position({ payoutAmount: 0n, buffer: 7n }), 3n, T0 + 30n * DAY)).toBe(10n);
  });

  it("pays nothing once closed", () => {
    expect(payableNow(position({ closed: true, buffer: 9n }), 0n, T0 + 90n * DAY)).toBe(0n);
  });
});

describe("payouts and heirs", () => {
  it("counts the payouts the buffer covers", () => {
    expect(payoutsCovered(1_250n, 400n)).toBe(3n);
    expect(payoutsCovered(399n, 400n)).toBe(0n);
    expect(payoutsCovered(1n, 0n)).toBeNull();
  });

  it("splits like the vault, leaving dust in the buffer", () => {
    expect(splitBetweenHeirs(100n, [3_334n, 3_333n, 3_333n])).toEqual({ shares: [33n, 33n, 33n], remainder: 1n });
    expect(splitBetweenHeirs(1_000n, [10_000n])).toEqual({ shares: [1_000n], remainder: 0n });
  });
});

describe("formatting time", () => {
  it("shows the two largest units", () => {
    expect(formatDuration(0n)).toBe("0 seconds");
    expect(formatDuration(45n)).toBe("45 seconds");
    expect(formatDuration(DAY)).toBe("1 day");
    expect(formatDuration(3n * DAY + 4n * 3_600n + 59n)).toBe("3 days 4 hours");
    expect(formatDuration(DAY + 30n)).toBe("1 day");
    expect(formatDuration(-3_660n)).toBe("1 hour 1 minute");
  });

  it("says when", () => {
    expect(formatRelative(T0 + DAY, T0)).toBe("in 1 day");
    expect(formatRelative(T0 - 7_200n, T0)).toBe("2 hours ago");
    expect(formatRelative(T0, T0)).toBe("now");
    expect(formatUtc(1_794_732_078n)).toBe("2026-11-15 08:41 UTC");
  });

  it("knows the intervals", () => {
    expect(intervalSeconds("monthly") * 12n).toBe(31_536_000n);
    expect(intervalSeconds("weekly")).toBe(604_800n);
  });
});
