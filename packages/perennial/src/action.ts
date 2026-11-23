/**
 * Signed actions. Every action that moves money to someone, or changes who
 * may, needs an ML-DSA-87 signature over the bytes `actionMessage` returns:
 *
 *   abi.encode(keccak256("Perennial.Action"), chainid, vault, positionId,
 *              uint8(action), nonce, deadline, paramsHash)
 *
 * The signer's key never enters this module: `prepareAction` returns the bytes
 * to sign, and the caller signs them with whatever holds the key.
 */
import { encodeAbiParameters, keccak256, stringToHex, type Address, type Hex, type PublicClient } from "viem";
import { Action, vaultAbi, type ActionName } from "./abi.js";

/** `keccak256("Perennial.Action")`, the domain tag of every signed action. */
export const ACTION_DOMAIN: Hex = keccak256(stringToHex("Perennial.Action"));

/** The paramsHash of actions that carry no parameters (check-in, claim, close). */
export const NO_PARAMS: Hex = `0x${"00".repeat(32)}`;

/** Lifetime of a signature by default, in seconds of chain time. */
export const DEFAULT_SIGNATURE_LIFETIME = 600n;

/** The hash the vault signs over for `spend`: `keccak256(abi.encode(to, amount, ref))`. */
export function spendParamsHash(to: Address, amount: bigint, ref: Hex): Hex {
  return keccak256(encodeAbiParameters([{ type: "address" }, { type: "uint256" }, { type: "bytes32" }], [to, amount, ref]));
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

/** The bytes the vault verifies, computed offline. Equal to `vault.actionMessage(...)`. */
export function encodeActionMessage(m: {
  chainId: bigint;
  vault: Address;
  positionId: bigint;
  action: ActionName;
  nonce: bigint;
  deadline: bigint;
  paramsHash: Hex;
}): Hex {
  return encodeAbiParameters(
    [
      { type: "bytes32" },
      { type: "uint256" },
      { type: "address" },
      { type: "uint256" },
      { type: "uint8" },
      { type: "uint256" },
      { type: "uint256" },
      { type: "bytes32" },
    ],
    [ACTION_DOMAIN, m.chainId, m.vault, m.positionId, Action[m.action], m.nonce, m.deadline, m.paramsHash],
  );
}

export interface SpendParams {
  to: Address;
  amount: bigint;
  /** What the payment is for, such as the hash of the request it pays. */
  ref: Hex;
}

export interface SignedActionRequest {
  id: bigint;
  action: ActionName;
  /** The account whose key must sign: the beneficiary, or the owner for a close. */
  signer: Address;
  heirs?: { account: Address; bps: number }[];
  spend?: SpendParams;
}

export interface PreparedAction {
  vault: Address;
  request: SignedActionRequest;
  nonce: bigint;
  deadline: bigint;
  paramsHash: Hex;
  /** Exactly what the signer signs. */
  message: Hex;
}

export function paramsHashFor(request: SignedActionRequest): Hex {
  if (request.action === "SetHeirs") return heirsParamsHash(request.heirs ?? []);
  if (request.action === "Spend") {
    if (!request.spend) throw new Error("a spend needs a recipient, an amount and a ref");
    return spendParamsHash(request.spend.to, request.spend.amount, request.spend.ref);
  }
  return NO_PARAMS;
}

/**
 * Reads the position's nonce and the chain's clock, and returns what will be
 * signed, from the vault's own `actionMessage`, so it is exactly what the
 * contract will verify.
 */
export async function prepareAction(
  client: PublicClient,
  vault: Address,
  request: SignedActionRequest,
  lifetime: bigint = DEFAULT_SIGNATURE_LIFETIME,
): Promise<PreparedAction> {
  const [position, block] = await Promise.all([
    client.readContract({ address: vault, abi: vaultAbi, functionName: "position", args: [request.id] }),
    client.getBlock({ blockTag: "latest" }),
  ]);
  const deadline = block.timestamp + lifetime;
  const paramsHash = paramsHashFor(request);
  const message = await client.readContract({
    address: vault,
    abi: vaultAbi,
    functionName: "actionMessage",
    args: [request.id, Action[request.action], position.nonce, deadline, paramsHash],
  });
  return { vault, request, nonce: position.nonce, deadline, paramsHash, message };
}

/** The arguments of `vault.spend(...)` for a prepared spend and its signature. Anyone may submit them. */
export function spendArgs(prepared: PreparedAction, signature: Hex): readonly [bigint, Address, bigint, Hex, bigint, Hex] {
  const s = prepared.request.spend;
  if (prepared.request.action !== "Spend" || !s) throw new Error("not a prepared spend");
  return [prepared.request.id, s.to, s.amount, s.ref, prepared.deadline, signature] as const;
}
