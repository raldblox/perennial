/**
 * Writes to a vault from the unlocked account.
 *
 * Every write is simulated first, so a call the contract would refuse fails
 * here with its decoded error and costs nothing. The gas limit is the estimate
 * plus a quarter: the EVM lane bills at least half the limit, so a generous
 * limit is paid for.
 *
 * Signed actions read the position's current nonce and the exact bytes the
 * vault will verify from `actionMessage`, then sign those bytes with ML-DSA-87.
 */
import { type Abi, type Address, type Hash, type Hex, type PublicClient, type WalletClient } from "viem";
import type { PreparedAction } from "@pq-apps/perennial";
import { erc20Abi, vaultAbi } from "./abi";

export type Step = "preparing" | "signing" | "sending" | "pending";

export interface WriteContext {
  client: PublicClient;
  wallet: WalletClient;
  /** The vault written to. */
  vault: Address;
  onStep?: (step: Step, hash?: Hash) => void;
}

export function withHeadroom(gas: bigint): bigint {
  return (gas * 125n) / 100n;
}

async function send(
  ctx: WriteContext,
  request: { address: Address; abi: Abi; functionName: string; args: readonly unknown[] },
): Promise<Hash> {
  const account = ctx.wallet.account;
  if (!account) throw new Error("The account is locked.");
  ctx.onStep?.("preparing");
  const { request: simulated } = await ctx.client.simulateContract({ ...request, account });
  const gas = await ctx.client.estimateContractGas({ ...request, account });
  ctx.onStep?.("sending");
  const hash = await ctx.wallet.writeContract({ ...simulated, gas: withHeadroom(gas), chain: ctx.wallet.chain, account });
  ctx.onStep?.("pending", hash);
  const receipt = await ctx.client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new TransactionFailed(hash);
  }
  return hash;
}

export class TransactionFailed extends Error {
  constructor(readonly hash: Hash) {
    super("The transaction was included but reverted.");
  }
}

/** Approves exactly `amount`, never an unlimited allowance. */
export function approve(ctx: WriteContext, asset: Address, amount: bigint): Promise<Hash> {
  return send(ctx, { address: asset, abi: erc20Abi, functionName: "approve", args: [ctx.vault, amount] });
}

export interface OpenParams {
  amount: bigint;
  beneficiary: Address;
  payoutAmount: bigint;
  payoutInterval: bigint;
  checkInPeriod: bigint;
  gracePeriod: bigint;
  ownerCanClose: boolean;
  heirs: { account: Address; bps: number }[];
  bufferCap: bigint;
  budgetMode: boolean;
}

export function openPosition(ctx: WriteContext, params: OpenParams): Promise<Hash> {
  return send(ctx, { address: ctx.vault, abi: vaultAbi, functionName: "open", args: [params] });
}

export function topUp(ctx: WriteContext, id: bigint, amount: bigint): Promise<Hash> {
  return send(ctx, { address: ctx.vault, abi: vaultAbi, functionName: "topUp", args: [id, amount] });
}

/** Pays income into the buffer. Anyone may; above the cap it joins the principal. */
export function fund(ctx: WriteContext, id: bigint, amount: bigint): Promise<Hash> {
  return send(ctx, { address: ctx.vault, abi: vaultAbi, functionName: "fund", args: [id, amount] });
}

export function harvest(ctx: WriteContext, id: bigint): Promise<Hash> {
  return send(ctx, { address: ctx.vault, abi: vaultAbi, functionName: "harvest", args: [id] });
}

export function triggerSuccession(ctx: WriteContext, id: bigint): Promise<Hash> {
  return send(ctx, { address: ctx.vault, abi: vaultAbi, functionName: "triggerSuccession", args: [id] });
}

export function distribute(ctx: WriteContext, id: bigint): Promise<Hash> {
  return send(ctx, { address: ctx.vault, abi: vaultAbi, functionName: "distribute", args: [id] });
}

// What is signed, and how it is prepared, comes from the vault client package.
export {
  heirsParamsHash,
  prepareAction,
  spendParamsHash,
  type PreparedAction,
  type SignedActionRequest,
  type SpendParams,
} from "@pq-apps/perennial";

/** Signs the prepared bytes and sends the action. `sign` holds the key; this module never sees it. */
export async function sendSignedAction(
  ctx: WriteContext,
  prepared: PreparedAction,
  sign: (account: Address, message: Hex) => Hex,
): Promise<Hash> {
  if (prepared.vault !== ctx.vault) throw new Error("prepared for another vault");
  ctx.onStep?.("signing");
  const signature = sign(prepared.request.signer, prepared.message);
  const { id, action } = prepared.request;
  const { deadline } = prepared;
  const v = ctx.vault;
  switch (action) {
    case "CheckIn":
      return send(ctx, { address: v, abi: vaultAbi, functionName: "checkIn", args: [id, deadline, signature] });
    case "Claim":
      return send(ctx, { address: v, abi: vaultAbi, functionName: "claim", args: [id, deadline, signature] });
    case "Close":
      return send(ctx, { address: v, abi: vaultAbi, functionName: "closeByOwner", args: [id, deadline, signature] });
    case "SetHeirs":
      return send(ctx, { address: v, abi: vaultAbi, functionName: "setHeirs", args: [id, prepared.request.heirs ?? [], deadline, signature] });
    case "Spend": {
      const spend = prepared.request.spend;
      if (!spend) throw new Error("a spend needs a recipient, an amount and a ref");
      return send(ctx, { address: v, abi: vaultAbi, functionName: "spend", args: [id, spend.to, spend.amount, spend.ref, deadline, signature] });
    }
  }
}
