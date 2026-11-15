/**
 * Writes to the vault from the unlocked account.
 *
 * Every write is simulated first, so a call the contract would refuse fails
 * here with its decoded error and costs nothing. The gas limit is the estimate
 * plus a quarter: the EVM lane bills at least half the limit, so a generous
 * limit is paid for.
 *
 * Signed actions read the position's current nonce and the exact bytes the
 * vault will verify from `actionMessage`, then sign those bytes with ML-DSA-87.
 */
import { encodeAbiParameters, keccak256, type Abi, type Address, type Hash, type Hex, type PublicClient, type WalletClient } from "viem";
import { config } from "../config";
import { Action, erc20Abi, vaultAbi, type ActionName } from "./abi";

export type Step = "preparing" | "signing" | "sending" | "pending";

export interface WriteContext {
  client: PublicClient;
  wallet: WalletClient;
  onStep?: (step: Step, hash?: Hash) => void;
}

const ZERO_HASH: Hex = `0x${"00".repeat(32)}`;

/** Lifetime of a signature, in seconds of chain time. */
export const SIGNATURE_LIFETIME = 600n;

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

export function approve(ctx: WriteContext, asset: Address, amount: bigint): Promise<Hash> {
  return send(ctx, { address: asset, abi: erc20Abi, functionName: "approve", args: [config.vault, amount] });
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
}

export function openPosition(ctx: WriteContext, params: OpenParams): Promise<Hash> {
  return send(ctx, { address: config.vault, abi: vaultAbi, functionName: "open", args: [params] });
}

export function topUp(ctx: WriteContext, id: bigint, amount: bigint): Promise<Hash> {
  return send(ctx, { address: config.vault, abi: vaultAbi, functionName: "topUp", args: [id, amount] });
}

export function harvest(ctx: WriteContext, id: bigint): Promise<Hash> {
  return send(ctx, { address: config.vault, abi: vaultAbi, functionName: "harvest", args: [id] });
}

export function triggerSuccession(ctx: WriteContext, id: bigint): Promise<Hash> {
  return send(ctx, { address: config.vault, abi: vaultAbi, functionName: "triggerSuccession", args: [id] });
}

export function distribute(ctx: WriteContext, id: bigint): Promise<Hash> {
  return send(ctx, { address: config.vault, abi: vaultAbi, functionName: "distribute", args: [id] });
}

/** The hash the vault signs over for `setHeirs`: `keccak256(abi.encode(newHeirs))`. */
export function heirsParamsHash(heirs: readonly { account: Address; bps: number }[]): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: "tuple[]", components: [{ name: "account", type: "address" }, { name: "bps", type: "uint16" }] }],
      [heirs.map((h) => ({ account: h.account, bps: h.bps }))],
    ),
  );
}

export interface SignedActionRequest {
  id: bigint;
  action: ActionName;
  /** The account whose key must sign: the beneficiary, or the owner for a close. */
  signer: Address;
  heirs?: { account: Address; bps: number }[];
}

export interface PreparedAction {
  request: SignedActionRequest;
  nonce: bigint;
  deadline: bigint;
  paramsHash: Hex;
  message: Hex;
}

/** Reads what will be signed. Shown to the user before anything is signed. */
export async function prepareAction(client: PublicClient, request: SignedActionRequest): Promise<PreparedAction> {
  const [position, block] = await Promise.all([
    client.readContract({ address: config.vault, abi: vaultAbi, functionName: "position", args: [request.id] }),
    client.getBlock({ blockTag: "latest" }),
  ]);
  const deadline = block.timestamp + SIGNATURE_LIFETIME;
  const paramsHash = request.action === "SetHeirs" ? heirsParamsHash(request.heirs ?? []) : ZERO_HASH;
  const message = await client.readContract({
    address: config.vault,
    abi: vaultAbi,
    functionName: "actionMessage",
    args: [request.id, Action[request.action], position.nonce, deadline, paramsHash],
  });
  return { request, nonce: position.nonce, deadline, paramsHash, message };
}

/** Signs the prepared bytes and sends the action. `sign` holds the key; this module never sees it. */
export async function sendSignedAction(
  ctx: WriteContext,
  prepared: PreparedAction,
  sign: (account: Address, message: Hex) => Hex,
): Promise<Hash> {
  ctx.onStep?.("signing");
  const signature = sign(prepared.request.signer, prepared.message);
  const { id, action } = prepared.request;
  const { deadline } = prepared;
  switch (action) {
    case "CheckIn":
      return send(ctx, { address: config.vault, abi: vaultAbi, functionName: "checkIn", args: [id, deadline, signature] });
    case "Claim":
      return send(ctx, { address: config.vault, abi: vaultAbi, functionName: "claim", args: [id, deadline, signature] });
    case "Close":
      return send(ctx, { address: config.vault, abi: vaultAbi, functionName: "closeByOwner", args: [id, deadline, signature] });
    case "SetHeirs":
      return send(ctx, {
        address: config.vault,
        abi: vaultAbi,
        functionName: "setHeirs",
        args: [id, prepared.request.heirs ?? [], deadline, signature],
      });
  }
}
