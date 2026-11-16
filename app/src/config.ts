/**
 * Where the app points. The QoreChain testnet deployment is the default; each
 * value can be overridden at build time with a `VITE_` variable (see
 * `.env.example`). Nothing here is secret: the build is a static site.
 */
import { getAddress, type Address } from "viem";

function env(name: string): string | undefined {
  const value = (import.meta.env as Record<string, string | undefined>)[name];
  return value && value.trim() !== "" ? value.trim() : undefined;
}

function address(name: string, fallback: Address): Address {
  const value = env(name);
  return value ? getAddress(value) : fallback;
}

/** Turns a path like `/qore/rest` into an absolute URL on this page's origin. */
function absolute(url: string): string {
  if (/^https?:\/\//.test(url)) return url.replace(/\/$/, "");
  const origin = typeof window === "undefined" ? "http://localhost" : window.location.origin;
  return `${origin}${url.startsWith("/") ? "" : "/"}${url}`.replace(/\/$/, "");
}

export type VaultId = "agent" | "demo" | "noyield";

/** What the vault's source pays. Every rate on the testnet is simulated (decision 006). */
export type SourceKind = "none" | "simulated" | "accelerated";

export interface VaultConfig {
  id: VaultId;
  address: Address;
  /** First block to scan for the vault's events. */
  deployBlock: bigint;
  /** "accelerated" is for demonstrations, never a return. */
  source: SourceKind;
}

/** Until the vaults are deployed, an address that holds no code: reads fail and say so. */
const NOT_DEPLOYED: Address = "0x0000000000000000000000000000000000000000";

const vaults: readonly VaultConfig[] = [
  {
    id: "agent",
    address: address("VITE_VAULT_ADDRESS", NOT_DEPLOYED),
    deployBlock: BigInt(env("VITE_VAULT_DEPLOY_BLOCK") ?? "0"),
    source: "simulated",
  },
  {
    id: "noyield",
    address: address("VITE_NOYIELD_VAULT_ADDRESS", NOT_DEPLOYED),
    deployBlock: BigInt(env("VITE_NOYIELD_VAULT_DEPLOY_BLOCK") ?? "0"),
    source: "none",
  },
  {
    id: "demo",
    address: address("VITE_DEMO_VAULT_ADDRESS", NOT_DEPLOYED),
    deployBlock: BigInt(env("VITE_DEMO_VAULT_DEPLOY_BLOCK") ?? "0"),
    source: "accelerated",
  },
];

export const config = {
  /** EVM chain id the vaults live on. */
  chainId: Number(env("VITE_CHAIN_ID") ?? 9800),
  /** Native-lane chain id, used to open the EVM window and to swap. */
  nativeChainId: env("VITE_NATIVE_CHAIN_ID") ?? "qorechain-diana",
  networkName: env("VITE_NETWORK_NAME") ?? "QoreChain testnet",
  /** The EVM JSON-RPC accepts requests from any origin. */
  evmRpcUrl: env("VITE_EVM_RPC_URL") ?? "https://evm-testnet.qore.host",
  /**
   * The chain's REST API and CometBFT RPC refuse cross-origin requests, so by
   * default they are reached through this site's own origin. The dev and
   * preview servers forward these paths; a static host must too, or the page
   * cannot read or open an EVM window, or swap (decision 003).
   */
  restUrl: absolute(env("VITE_REST_URL") ?? "/qore/rest"),
  rpcUrl: absolute(env("VITE_RPC_URL") ?? "/qore/rpc"),
  explorerUrl: (env("VITE_EXPLORER_URL") ?? "https://explore.qore.network").replace(/\/$/, ""),
  faucetUrl: env("VITE_FAUCET_URL") ?? "https://dashboard.qorechain.io/faucet",
  vaults,
  defaultVault: "agent" as VaultId,
  /** Expected asset. The app reads `ASSET()` from each vault and refuses to act if they differ. */
  asset: address("VITE_ASSET_ADDRESS", "0x97143B771D34ddb9130b807b135Ae675A5a963CA"),
  /** The native AMM pool that trades fUSD against QOR. */
  swapPoolId: env("VITE_SWAP_POOL_ID") ?? "2",
  /** Source code of the deployed contracts, for "read the code" links. */
  sourceUrl: env("VITE_SOURCE_URL") ?? "https://github.com/raldblox/perennial",
} as const;

export function vaultById(id: string | undefined): VaultConfig {
  const found = config.vaults.find((v) => v.id === id) ?? config.vaults.find((v) => v.id === config.defaultVault);
  if (!found) throw new Error("no vault configured");
  return found;
}

export function isVaultId(id: string): id is VaultId {
  return config.vaults.some((v) => v.id === id);
}

export const PQC_KEY_STATUS: Address = "0x0000000000000000000000000000000000000a02";

/**
 * The explorer finds native transactions by their hash in upper-case hex
 * without a prefix. It has no page for EVM transaction hashes, and it opens on
 * mainnet until its Testnet switch is used (checked 15 November 2026).
 */
export function nativeTxUrl(hash: string): string {
  return `${config.explorerUrl}/tx/${hash.replace(/^0x/i, "").toUpperCase()}`;
}

export function addressUrl(account: string): string {
  return `${config.explorerUrl}/address/${account}`;
}
