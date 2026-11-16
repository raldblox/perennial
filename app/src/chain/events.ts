/**
 * A vault's history, read from its event logs. The testnet RPC answers
 * `eth_getLogs` for at most 10,000 blocks at a time, so the range is read in
 * slices that the transport batches into few requests.
 */
import { decodeEventLog, getAddress, type Address, type Hex, type Log, type PublicClient } from "viem";
import type { VaultConfig } from "../config";
import { vaultAbi } from "./abi";

export const LOG_RANGE = 10_000n;

interface Base {
  positionId: bigint;
  block: bigint;
  tx: Hex;
  logIndex: number;
}

export type VaultEvent =
  | (Base & { kind: "Opened"; owner: Address; beneficiary: Address; amount: bigint })
  | (Base & { kind: "ToppedUp"; from: Address; amount: bigint })
  | (Base & { kind: "HeirsSet"; heirs: Address[] })
  | (Base & { kind: "Harvested"; amount: bigint })
  | (Base & { kind: "Claimed"; to: Address; amount: bigint })
  | (Base & { kind: "Spent"; to: Address; amount: bigint; ref: Hex })
  | (Base & { kind: "Compounded"; amount: bigint })
  | (Base & { kind: "Funded"; from: Address; amount: bigint })
  | (Base & { kind: "PrincipalDrawn"; amount: bigint })
  | (Base & { kind: "Distributed"; amount: bigint })
  | (Base & { kind: "CheckedIn" })
  | (Base & { kind: "SuccessionTriggered" })
  | (Base & { kind: "Closed"; principalReturned: bigint; yieldPaid: bigint });

/** Splits [from, to] into inclusive slices of at most `size` blocks. */
export function slices(from: bigint, to: bigint, size: bigint = LOG_RANGE): [bigint, bigint][] {
  const out: [bigint, bigint][] = [];
  for (let start = from; start <= to; start += size) {
    const end = start + size - 1n;
    out.push([start, end < to ? end : to]);
  }
  return out;
}

export function decodeVaultLog(log: Log): VaultEvent | null {
  const base = { block: log.blockNumber ?? 0n, tx: log.transactionHash ?? "0x", logIndex: log.logIndex ?? 0 };
  let decoded;
  try {
    decoded = decodeEventLog({ abi: vaultAbi, data: log.data, topics: log.topics });
  } catch {
    return null;
  }
  switch (decoded.eventName) {
    case "Opened":
      return { ...base, kind: "Opened", positionId: decoded.args.positionId, owner: getAddress(decoded.args.owner), beneficiary: getAddress(decoded.args.beneficiary), amount: decoded.args.amount };
    case "ToppedUp":
      return { ...base, kind: "ToppedUp", positionId: decoded.args.positionId, from: getAddress(decoded.args.from), amount: decoded.args.amount };
    case "HeirsSet":
      return { ...base, kind: "HeirsSet", positionId: decoded.args.positionId, heirs: decoded.args.heirs.map((h) => getAddress(h.account)) };
    case "Harvested":
      return { ...base, kind: "Harvested", positionId: decoded.args.positionId, amount: decoded.args.yield };
    case "Claimed":
      return { ...base, kind: "Claimed", positionId: decoded.args.positionId, to: getAddress(decoded.args.beneficiary), amount: decoded.args.amount };
    case "Spent":
      return { ...base, kind: "Spent", positionId: decoded.args.positionId, to: getAddress(decoded.args.to), amount: decoded.args.amount, ref: decoded.args.ref };
    case "Funded":
      return { ...base, kind: "Funded", positionId: decoded.args.positionId, from: getAddress(decoded.args.from), amount: decoded.args.amount };
    case "PrincipalDrawn":
      return { ...base, kind: "PrincipalDrawn", positionId: decoded.args.positionId, amount: decoded.args.amount };
    case "Compounded":
      return { ...base, kind: "Compounded", positionId: decoded.args.positionId, amount: decoded.args.amount };
    case "Distributed":
      return { ...base, kind: "Distributed", positionId: decoded.args.positionId, amount: decoded.args.amount };
    case "CheckedIn":
      return { ...base, kind: "CheckedIn", positionId: decoded.args.positionId };
    case "SuccessionTriggered":
      return { ...base, kind: "SuccessionTriggered", positionId: decoded.args.positionId };
    case "Closed":
      return { ...base, kind: "Closed", positionId: decoded.args.positionId, principalReturned: decoded.args.principalReturned, yieldPaid: decoded.args.yieldPaid };
  }
}

export async function scanVaultEvents(client: PublicClient, vault: VaultConfig, toBlock?: bigint): Promise<VaultEvent[]> {
  const end = toBlock ?? (await client.getBlockNumber());
  const batches = await Promise.all(
    slices(vault.deployBlock, end).map(([from, to]) => client.getLogs({ address: vault.address, fromBlock: from, toBlock: to })),
  );
  return batches.flat().flatMap((log) => {
    const event = decodeVaultLog(log);
    return event ? [event] : [];
  });
}

export type Role = "owner" | "beneficiary" | "heir";

/**
 * Positions an address is involved in, and how. Heirs come from the latest
 * `HeirsSet` of each position, which is the current list.
 */
export function positionsInvolving(events: readonly VaultEvent[], account: Address): Map<bigint, Set<Role>> {
  const me = getAddress(account);
  const roles = new Map<bigint, Set<Role>>();
  const add = (id: bigint, role: Role) => {
    const set = roles.get(id) ?? new Set<Role>();
    set.add(role);
    roles.set(id, set);
  };
  const latestHeirs = new Map<bigint, Address[]>();
  for (const e of events) {
    if (e.kind === "Opened") {
      if (e.owner === me) add(e.positionId, "owner");
      if (e.beneficiary === me) add(e.positionId, "beneficiary");
    } else if (e.kind === "HeirsSet") {
      latestHeirs.set(e.positionId, e.heirs);
    }
  }
  for (const [id, heirs] of latestHeirs) if (heirs.includes(me)) add(id, "heir");
  return roles;
}

export interface Totals {
  opened: number;
  harvested: bigint;
  spent: bigint;
  spends: number;
  paidOut: bigint;
  compounded: bigint;
}

export function totals(events: readonly VaultEvent[]): Totals {
  const t: Totals = { opened: 0, harvested: 0n, spent: 0n, spends: 0, paidOut: 0n, compounded: 0n };
  for (const e of events) {
    if (e.kind === "Opened") t.opened += 1;
    else if (e.kind === "Harvested") t.harvested += e.amount;
    else if (e.kind === "Spent") {
      t.spent += e.amount;
      t.spends += 1;
      t.paidOut += e.amount;
    } else if (e.kind === "Claimed" || e.kind === "Distributed") t.paidOut += e.amount;
    else if (e.kind === "Closed") t.paidOut += e.yieldPaid;
    else if (e.kind === "Compounded") t.compounded += e.amount;
  }
  return t;
}

/** Events of one position, newest first. */
export function historyOf(events: readonly VaultEvent[], id: bigint): VaultEvent[] {
  return events
    .filter((e) => e.positionId === id)
    .sort((a, b) => (a.block === b.block ? b.logIndex - a.logIndex : a.block > b.block ? -1 : 1));
}

/** Spending over a recent window: what the agent has been paying, per hour. */
export function spendRate(events: readonly VaultEvent[], id: bigint, now: bigint, windowSeconds: bigint, blockTime: (block: bigint) => bigint): {
  calls: number;
  amount: bigint;
} {
  let calls = 0;
  let amount = 0n;
  for (const e of events) {
    if (e.kind !== "Spent" || e.positionId !== id) continue;
    if (now - blockTime(e.block) > windowSeconds) continue;
    calls += 1;
    amount += e.amount;
  }
  return { calls, amount };
}
