/**
 * The unlocked account (decision 003).
 *
 * A recovery phrase is turned into the phrase's EVM account, which sends
 * transactions, and the ML-DSA-87 keys of both its EVM and Native accounts,
 * which sign the vault's action messages. The secrets live only in this
 * module's closure for as long as the account is unlocked. Nothing is written
 * to storage, put in a URL, sent over the network or logged. `lock()` drops
 * every reference.
 *
 * This module pulls in the QoreChain SDK, so the app loads it on demand.
 */
import { StargateClient } from "@cosmjs/stargate";
import { evmWindowCost, evmWindowStatus, type EvmWindow } from "@qorechain/evm";
import { mldsa } from "@qorechain/pqc";
import {
  deriveNativeAccount,
  derivePqcCanonical,
  deriveUnifiedAccount,
  EthNativeSigner,
  openEvmWindowMsg,
  closeEvmWindowMsg,
  qorToEvm,
  validateMnemonic,
  type PqcKeypair,
  type UnifiedAccount,
} from "@qorechain/sdk";
import { bytesToHex, createWalletClient, getAddress, hexToBytes, http, type Address, type Hex, type WalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { chain } from "../chain/client";
import { config } from "../config";

export interface SessionAccount {
  /** The EVM account (m/44'/60'/0'/0/0). Sends every transaction. */
  evm: Address;
  /** The same EVM account in its `qor1` form. */
  evmQor: string;
  /** The Native account (m/44'/118'/0'/0/0), the one the QoreX wallet shows. */
  native: string;
  /** The Native account's 20 bytes as a 0x address, which is how the vault sees it. */
  nativeEvm: Address;
  /** ML-DSA-87 public keys this phrase derives, for comparison with the chain's. */
  publicKeys: Record<Address, Hex>;
}

interface Secrets {
  unified: UnifiedAccount;
  keys: Map<Address, PqcKeypair>;
  wallet: WalletClient;
}

let secrets: Secrets | null = null;

export function normalisePhrase(phrase: string): string {
  return phrase.trim().toLowerCase().split(/\s+/).join(" ");
}

export function isValidPhrase(phrase: string): boolean {
  return validateMnemonic(normalisePhrase(phrase));
}

export async function unlock(phrase: string): Promise<SessionAccount> {
  const words = normalisePhrase(phrase);
  if (!validateMnemonic(words)) throw new Error("invalid recovery phrase");

  const unified = await deriveUnifiedAccount(words, 0);
  const native = await deriveNativeAccount(words);
  const evm = getAddress(unified.evm);
  const nativeEvm = getAddress(qorToEvm(native.address));
  const keys = new Map<Address, PqcKeypair>([
    [evm, unified.pqc],
    [nativeEvm, derivePqcCanonical(native.address, words)],
  ]);
  const wallet = createWalletClient({
    account: privateKeyToAccount(unified.privateKey as Hex),
    chain,
    transport: http(config.evmRpcUrl),
  });
  // The phrase itself is not kept: everything needed has been derived.
  unified.mnemonic = undefined;
  native.privateKey.fill(0);
  secrets = { unified, keys, wallet };

  const publicKeys: Record<Address, Hex> = {};
  for (const [account, pair] of keys) publicKeys[account] = bytesToHex(pair.publicKey);
  return { evm, evmQor: unified.cosmos, native: native.address, nativeEvm, publicKeys };
}

export function lock(): void {
  if (!secrets) return;
  for (const pair of secrets.keys.values()) pair.secretKey.fill(0);
  secrets.unified.pqc.secretKey.fill(0);
  secrets = null;
}

export function isUnlocked(): boolean {
  return secrets !== null;
}

function need(): Secrets {
  if (!secrets) throw new Error("The account is locked.");
  return secrets;
}

/** Whether this phrase holds the ML-DSA-87 key for `account`. */
export function canSignFor(account: Address): boolean {
  return secrets?.keys.has(getAddress(account)) ?? false;
}

/** Signs the exact bytes the vault's `actionMessage` returned, as `account`. */
export function signAction(account: Address, message: Hex): Hex {
  const pair = need().keys.get(getAddress(account));
  if (!pair) throw new Error(`This phrase does not hold the key for ${account}.`);
  return bytesToHex(mldsa.sign(pair.secretKey, hexToBytes(message)));
}

export function walletClient(): WalletClient {
  return need().wallet;
}

export type WindowRead = { reachable: true; window: EvmWindow } | { reachable: false; reason: string };

/** Reads the sending account's EVM window through the native REST API, if this site can reach it. */
export async function readWindow(account: Address): Promise<WindowRead> {
  try {
    const window = await evmWindowStatus({ rest: config.restUrl, address: account });
    return { reachable: true, window };
  } catch (error) {
    return { reachable: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

/** Gas each window transaction is sized for. The heaviest vault call, a signed action, uses well under this. */
export const WINDOW_GAS_PER_TX = 1_000_000n;
/** About an hour at the testnet's 1.4-second blocks. */
export const WINDOW_BLOCKS = 2_500n;
export const WINDOW_TXS = 6n;

/**
 * Opens an EVM window for the sending account, limited to the vault and its
 * asset: a few transactions over about an hour, and only enough value to pay
 * their fees.
 */
export async function openWindow(targets: readonly Address[], maxFeePerGas: bigint): Promise<string> {
  const { unified } = need();
  const maxValue = evmWindowCost({ gas: WINDOW_GAS_PER_TX, maxFeePerGas }) * WINDOW_TXS;
  const msg = openEvmWindowMsg({
    sender: unified.cosmos,
    blocks: WINDOW_BLOCKS,
    maxTxs: WINDOW_TXS,
    maxValue,
    allowedTargets: [...targets],
  });
  return broadcastNative([msg]);
}

export async function closeWindow(): Promise<string> {
  const { unified } = need();
  return broadcastNative([closeEvmWindowMsg(unified.cosmos)]);
}

/** A native-lane fee: hybrid transactions are large, so the gas limit is generous. */
const NATIVE_FEE = { amount: [{ denom: "uqor", amount: "100000" }], gas: "800000" };

async function broadcastNative(messages: Parameters<EthNativeSigner["sign"]>[0]["messages"]): Promise<string> {
  const { unified } = need();
  const response = await fetch(`${config.restUrl}/cosmos/auth/v1beta1/accounts/${unified.cosmos}`);
  if (!response.ok) throw new Error(`account query failed: HTTP ${response.status}`);
  const body = (await response.json()) as { account?: Record<string, unknown> };
  const record = (body.account?.base_account ?? body.account ?? {}) as Record<string, string | undefined>;
  const signer = new EthNativeSigner(unified, { signMode: "hybrid", rest: config.restUrl });
  const transport = await StargateClient.connect(config.rpcUrl);
  try {
    const result = await signer.signAndBroadcast(transport, {
      chainId: config.nativeChainId,
      accountNumber: BigInt(record.account_number ?? "0"),
      sequence: BigInt(record.sequence ?? "0"),
      fee: NATIVE_FEE,
      messages,
    });
    if (result.code !== 0) throw new Error(result.rawLog ?? `refused with code ${result.code}`);
    return result.transactionHash;
  } finally {
    transport.disconnect();
  }
}
