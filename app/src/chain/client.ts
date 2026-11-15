import { createPublicClient, defineChain, http, type Chain, type PublicClient } from "viem";
import { config } from "../config";

/** The EVM chain the vault lives on, built from the app's configuration. */
export const chain: Chain = defineChain({
  id: config.chainId,
  name: config.networkName,
  nativeCurrency: { name: "QOR", symbol: "QOR", decimals: 18 },
  rpcUrls: { default: { http: [config.evmRpcUrl] } },
  blockExplorers: { default: { name: "QoreChain Explorer", url: config.explorerUrl } },
  testnet: true,
});

/** Reads batch into one HTTP request per tick, since the chain has no Multicall3. */
export const publicClient: PublicClient = createPublicClient({
  chain,
  transport: http(config.evmRpcUrl, { batch: { batchSize: 40, wait: 16 } }),
});
