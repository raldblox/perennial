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

export const config = {
  /** EVM chain id the vault lives on. */
  chainId: Number(env("VITE_CHAIN_ID") ?? 9800),
  /** Native-lane chain id, used to open the EVM window. */
  nativeChainId: env("VITE_NATIVE_CHAIN_ID") ?? "qorechain-diana",
  networkName: env("VITE_NETWORK_NAME") ?? "QoreChain testnet",
  /** The EVM JSON-RPC accepts requests from any origin. */
  evmRpcUrl: env("VITE_EVM_RPC_URL") ?? "https://evm-testnet.qore.host",
  /**
   * The chain's REST API and CometBFT RPC refuse cross-origin requests, so by
   * default they are reached through this site's own origin. The dev and
   * preview servers forward these paths; a static host must too, or the page
   * cannot read or open an EVM window (decision 003).
   */
  restUrl: absolute(env("VITE_REST_URL") ?? "/qore/rest"),
  rpcUrl: absolute(env("VITE_RPC_URL") ?? "/qore/rpc"),
  explorerUrl: (env("VITE_EXPLORER_URL") ?? "https://explore.qore.network").replace(/\/$/, ""),
  faucetUrl: env("VITE_FAUCET_URL") ?? "https://dashboard.qorechain.io/faucet",
  vault: address("VITE_VAULT_ADDRESS", "0x2fB3057c42fB97964F5a86fD20ecD90969d06593"),
  /** Expected asset. The app reads `ASSET()` from the vault and refuses to act if they differ. */
  asset: address("VITE_ASSET_ADDRESS", "0x97143B771D34ddb9130b807b135Ae675A5a963CA"),
  /** First block to scan for the vault's events. */
  deployBlock: BigInt(env("VITE_VAULT_DEPLOY_BLOCK") ?? "10124332"),
  /** Source code of the deployed contracts, for "read the code" links. */
  sourceUrl: env("VITE_SOURCE_URL") ?? "https://github.com/raldblox/perennial",
} as const;

export const PQC_KEY_STATUS: Address = "0x0000000000000000000000000000000000000a02";

export function txUrl(hash: string): string {
  return `${config.explorerUrl}/tx/${hash}`;
}

export function addressUrl(account: string): string {
  return `${config.explorerUrl}/address/${account}`;
}
