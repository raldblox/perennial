/** Reading a position: what it holds, what it may still spend, and its heirs. No account needed. */
import { getAddress, type Address, type PublicClient } from "viem";
import { vaultAbi } from "./abi.js";

export interface PositionView {
  id: bigint;
  owner: Address;
  beneficiary: Address;
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
  bufferCap: bigint;
  budgetMode: boolean;
  windowStart: bigint;
  windowSpent: bigint;
  /** Earned by the yield source, not yet harvested. */
  pendingYield: bigint;
  /** What spends and claims may still take in the current window; 0 without budget mode. */
  budgetRemaining: bigint;
  heirs: { account: Address; bps: number }[];
}

export async function readPosition(client: PublicClient, vault: Address, id: bigint): Promise<PositionView> {
  const [s, heirs, pendingYield, budgetRemaining] = await Promise.all([
    client.readContract({ address: vault, abi: vaultAbi, functionName: "position", args: [id] }),
    client.readContract({ address: vault, abi: vaultAbi, functionName: "heirs", args: [id] }),
    client.readContract({ address: vault, abi: vaultAbi, functionName: "pendingYield", args: [id] }),
    client.readContract({ address: vault, abi: vaultAbi, functionName: "budgetRemaining", args: [id] }),
  ]);
  return {
    id,
    ...s,
    owner: getAddress(s.owner),
    beneficiary: getAddress(s.beneficiary),
    pendingYield,
    budgetRemaining,
    heirs: heirs.map((h) => ({ account: getAddress(h.account), bps: h.bps })),
  };
}

/** What the agent can spend right now: the buffer and pending yield, or, in budget mode, what the window allows. */
export function spendableNow(p: PositionView): bigint {
  if (p.closed || p.succeeded) return 0n;
  if (p.budgetMode) {
    const held = p.buffer + p.pendingYield + p.principal;
    return p.budgetRemaining < held ? p.budgetRemaining : held;
  }
  return p.buffer + p.pendingYield;
}
