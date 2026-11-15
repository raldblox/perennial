/**
 * Reads from the deployed vault, its asset, its yield source and the key
 * registry precompile. Everything here works without an account.
 */
import { getAddress, type Address, type PublicClient } from "viem";
import { config, PQC_KEY_STATUS } from "../config";
import { type PositionState } from "../lib/schedule";
import { erc20Abi, pqcKeyStatusAbi, vaultAbi, yieldSourceAbi } from "./abi";

export interface VaultInfo {
  asset: Address;
  source: Address;
  symbol: string;
  decimals: number;
  positionCount: bigint;
  /** Yearly rate of the source in basis points, or null if the source does not report one. */
  rateBps: bigint | null;
  /** The configured asset matches the vault's. */
  assetMatches: boolean;
}

export interface Heir {
  account: Address;
  bps: number;
}

export interface PositionView {
  id: bigint;
  state: PositionState;
  heirs: Heir[];
  pendingYield: bigint;
}

export interface KeyStatus {
  registered: boolean;
  algorithmId: number;
  publicKey: `0x${string}`;
  possessionProven: boolean;
  /** Registered ML-DSA-87 key with proven possession: what the vault requires. */
  usable: boolean;
}

export async function readVaultInfo(client: PublicClient, vault: Address = config.vault): Promise<VaultInfo> {
  const [asset, source, positionCount] = await Promise.all([
    client.readContract({ address: vault, abi: vaultAbi, functionName: "ASSET" }),
    client.readContract({ address: vault, abi: vaultAbi, functionName: "SOURCE" }),
    client.readContract({ address: vault, abi: vaultAbi, functionName: "positionCount" }),
  ]);
  const [symbol, decimals, rateWad] = await Promise.all([
    client.readContract({ address: asset, abi: erc20Abi, functionName: "symbol" }),
    client.readContract({ address: asset, abi: erc20Abi, functionName: "decimals" }),
    client
      .readContract({ address: source, abi: yieldSourceAbi, functionName: "RATE_PER_YEAR" })
      .catch(() => null),
  ]);
  return {
    asset: getAddress(asset),
    source: getAddress(source),
    symbol,
    decimals,
    positionCount,
    rateBps: rateWad === null ? null : (rateWad * 10_000n) / 10n ** 18n,
    assetMatches: getAddress(asset) === config.asset,
  };
}

export async function readPosition(client: PublicClient, id: bigint, vault: Address = config.vault): Promise<PositionView> {
  const [state, heirs, pendingYield] = await Promise.all([
    client.readContract({ address: vault, abi: vaultAbi, functionName: "position", args: [id] }),
    client.readContract({ address: vault, abi: vaultAbi, functionName: "heirs", args: [id] }),
    client.readContract({ address: vault, abi: vaultAbi, functionName: "pendingYield", args: [id] }),
  ]);
  return {
    id,
    state: {
      ...state,
      owner: getAddress(state.owner),
      beneficiary: getAddress(state.beneficiary),
    },
    heirs: heirs.map((h) => ({ account: getAddress(h.account), bps: h.bps })),
    pendingYield,
  };
}

export async function readKeyStatus(client: PublicClient, account: Address): Promise<KeyStatus> {
  const [registered, algorithmId, publicKey, possessionProven] = await client.readContract({
    address: PQC_KEY_STATUS,
    abi: pqcKeyStatusAbi,
    functionName: "pqcKeyStatus",
    args: [account],
  });
  return {
    registered,
    algorithmId,
    publicKey,
    possessionProven,
    usable: registered && algorithmId === 1 && possessionProven && publicKey.length === 2 + 2592 * 2,
  };
}

export async function readBalances(
  client: PublicClient,
  account: Address,
  asset: Address,
  vault: Address = config.vault,
): Promise<{ gas: bigint; token: bigint; allowance: bigint }> {
  const [gas, token, allowance] = await Promise.all([
    client.getBalance({ address: account }),
    client.readContract({ address: asset, abi: erc20Abi, functionName: "balanceOf", args: [account] }),
    client.readContract({ address: asset, abi: erc20Abi, functionName: "allowance", args: [account, vault] }),
  ]);
  return { gas, token, allowance };
}

/** The latest block's timestamp: the clock the contract uses. */
export async function chainNow(client: PublicClient): Promise<bigint> {
  const block = await client.getBlock({ blockTag: "latest" });
  return block.timestamp;
}
