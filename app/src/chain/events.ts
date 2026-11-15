/**
 * The vault's history, read from its event logs. The testnet RPC answers
 * `eth_getLogs` for at most 10,000 blocks at a time, so the range is read in
 * slices that the transport batches into few requests.
 */
import { decodeEventLog, getAddress, type Address, type Log, type PublicClient } from "viem";
import { config } from "../config";
import { vaultAbi } from "./abi";

export const LOG_RANGE = 10_000n;

export type VaultEvent =
  | { kind: "Opened"; positionId: bigint; owner: Address; beneficiary: Address; amount: bigint; block: bigint; tx: `0x${string}` }
  | { kind: "ToppedUp"; positionId: bigint; amount: bigint; block: bigint; tx: `0x${string}` }
  | { kind: "HeirsSet"; positionId: bigint; heirs: Address[]; block: bigint; tx: `0x${string}` }
  | { kind: "Harvested"; positionId: bigint; amount: bigint; block: bigint; tx: `0x${string}` }
  | { kind: "Claimed"; positionId: bigint; amount: bigint; block: bigint; tx: `0x${string}` }
  | { kind: "Distributed"; positionId: bigint; amount: bigint; block: bigint; tx: `0x${string}` }
  | { kind: "CheckedIn"; positionId: bigint; block: bigint; tx: `0x${string}` }
  | { kind: "SuccessionTriggered"; positionId: bigint; block: bigint; tx: `0x${string}` }
  | { kind: "Closed"; positionId: bigint; principalReturned: bigint; yieldPaid: bigint; block: bigint; tx: `0x${string}` };

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
  let decoded;
  try {
    decoded = decodeEventLog({ abi: vaultAbi, data: log.data, topics: log.topics });
  } catch {
    return null;
  }
  const block = log.blockNumber ?? 0n;
  const tx = log.transactionHash ?? "0x";
  switch (decoded.eventName) {
    case "Opened":
      return {
        kind: "Opened",
        positionId: decoded.args.positionId,
        owner: getAddress(decoded.args.owner),
        beneficiary: getAddress(decoded.args.beneficiary),
        amount: decoded.args.amount,
        block,
        tx,
      };
    case "ToppedUp":
      return { kind: "ToppedUp", positionId: decoded.args.positionId, amount: decoded.args.amount, block, tx };
    case "HeirsSet":
      return {
        kind: "HeirsSet",
        positionId: decoded.args.positionId,
        heirs: decoded.args.heirs.map((h) => getAddress(h.account)),
        block,
        tx,
      };
    case "Harvested":
      return { kind: "Harvested", positionId: decoded.args.positionId, amount: decoded.args.yield, block, tx };
    case "Claimed":
      return { kind: "Claimed", positionId: decoded.args.positionId, amount: decoded.args.amount, block, tx };
    case "Distributed":
      return { kind: "Distributed", positionId: decoded.args.positionId, amount: decoded.args.amount, block, tx };
    case "CheckedIn":
      return { kind: "CheckedIn", positionId: decoded.args.positionId, block, tx };
    case "SuccessionTriggered":
      return { kind: "SuccessionTriggered", positionId: decoded.args.positionId, block, tx };
    case "Closed":
      return {
        kind: "Closed",
        positionId: decoded.args.positionId,
        principalReturned: decoded.args.principalReturned,
        yieldPaid: decoded.args.yieldPaid,
        block,
        tx,
      };
  }
}

export async function scanVaultEvents(
  client: PublicClient,
  options: { vault?: Address; fromBlock?: bigint; toBlock?: bigint } = {},
): Promise<VaultEvent[]> {
  const vault = options.vault ?? config.vault;
  const toBlock = options.toBlock ?? (await client.getBlockNumber());
  const fromBlock = options.fromBlock ?? config.deployBlock;
  const batches = await Promise.all(
    slices(fromBlock, toBlock).map(([from, to]) => client.getLogs({ address: vault, fromBlock: from, toBlock: to })),
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
  paidOut: bigint;
}

export function totals(events: readonly VaultEvent[]): Totals {
  let opened = 0;
  let harvested = 0n;
  let paidOut = 0n;
  for (const e of events) {
    if (e.kind === "Opened") opened += 1;
    else if (e.kind === "Harvested") harvested += e.amount;
    else if (e.kind === "Claimed" || e.kind === "Distributed") paidOut += e.amount;
    else if (e.kind === "Closed") paidOut += e.yieldPaid;
  }
  return { opened, harvested, paidOut };
}

/** Events of one position, newest first. */
export function historyOf(events: readonly VaultEvent[], id: bigint): VaultEvent[] {
  return events.filter((e) => e.positionId === id).sort((a, b) => (a.block === b.block ? 0 : a.block > b.block ? -1 : 1));
}
