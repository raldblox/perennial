/**
 * Validation of the "open a position" form, separate from the UI so it can be
 * tested on its own. Mirrors the vault's `open` checks and adds the ones the
 * page can make in advance (balance, key status).
 */
import { getAddress, isAddress, type Address } from "viem";
import { parseDecimal } from "./decimal";
import { type IntervalId, intervalSeconds } from "./schedule";

export const DAY = 86_400n;

export interface TermsDraft {
  amount: string;
  beneficiary: string;
  payout: string;
  interval: IntervalId;
  checkInDays: string;
  graceDays: string;
  ownerCanClose: boolean;
}

export type TermsError = "amount" | "balance" | "beneficiary" | "beneficiaryKey" | "payout" | "days" | "graceDays" | "ownerKey";

export interface Terms {
  amount: bigint;
  beneficiary: Address;
  payoutAmount: bigint;
  payoutInterval: bigint;
  checkInPeriod: bigint;
  gracePeriod: bigint;
  ownerCanClose: boolean;
}

export interface TermsContext {
  decimals: number;
  /** Sender's balance, when known. */
  balance?: bigint;
  /** Whether the beneficiary has a usable key, when known. */
  beneficiaryKeyUsable?: boolean;
  /** Whether the sender has a usable key, when known. */
  ownerKeyUsable?: boolean;
}

function wholeDays(text: string, min: bigint): bigint | null {
  const t = text.trim();
  if (!/^\d{1,6}$/.test(t)) return null;
  const n = BigInt(t);
  return n >= min ? n : null;
}

export function validateTerms(draft: TermsDraft, ctx: TermsContext): { terms: Terms | null; errors: Partial<Record<TermsError, true>> } {
  const errors: Partial<Record<TermsError, true>> = {};

  const amount = parseDecimal(draft.amount, ctx.decimals);
  if (!amount.ok || amount.value === 0n) errors.amount = true;
  else if (ctx.balance !== undefined && amount.value > ctx.balance) errors.balance = true;

  const beneficiary = draft.beneficiary.trim();
  const beneficiaryOk = isAddress(beneficiary, { strict: false }) && !/^0x0{40}$/i.test(beneficiary);
  if (!beneficiaryOk) errors.beneficiary = true;
  else if (ctx.beneficiaryKeyUsable === false) errors.beneficiaryKey = true;

  const payout = draft.payout.trim() === "" ? ({ ok: true, value: 0n } as const) : parseDecimal(draft.payout, ctx.decimals);
  if (!payout.ok) errors.payout = true;

  const checkIn = wholeDays(draft.checkInDays, 1n);
  if (checkIn === null) errors.days = true;
  const grace = wholeDays(draft.graceDays, 0n);
  if (grace === null) errors.graceDays = true;

  if (draft.ownerCanClose && ctx.ownerKeyUsable === false) errors.ownerKey = true;

  if (Object.keys(errors).length > 0 || !amount.ok || !payout.ok || checkIn === null || grace === null) {
    return { terms: null, errors };
  }
  return {
    terms: {
      amount: amount.value,
      beneficiary: getAddress(beneficiary),
      payoutAmount: payout.value,
      payoutInterval: intervalSeconds(draft.interval),
      checkInPeriod: checkIn * DAY,
      gracePeriod: grace * DAY,
      ownerCanClose: draft.ownerCanClose,
    },
    errors,
  };
}
