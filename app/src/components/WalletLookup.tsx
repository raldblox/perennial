/**
 * Optional, read-only QoreX connection: it tells the page which account to look
 * up. QoreX signs nothing here; it does not yet sign EVM transactions or
 * arbitrary messages for a page (decision 003). Loaded only on the Positions
 * page, so wagmi and RainbowKit stay out of the first page load.
 */
import "@rainbow-me/rainbowkit/styles.css";

import { ConnectButton, connectorsForWallets, lightTheme, RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { qorexWallet } from "@qorechain/qorex-rainbowkit";
import { useEffect, type ReactNode } from "react";
import { http, type Address } from "viem";
import { createConfig, useAccount, WagmiProvider } from "wagmi";
import { chain } from "../chain/client";
import { config } from "../config";

// No WalletConnect wallet is listed, so no project id or remote relay is used.
const connectors = connectorsForWallets([{ groupName: "QoreChain", wallets: [() => qorexWallet({ pollAccountsOnFocus: true })] }], {
  appName: "Perennial",
  projectId: "unused",
});

const wagmiConfig = createConfig({
  chains: [chain],
  connectors,
  transports: { [chain.id]: http(config.evmRpcUrl) },
});

function Report({ onAccount }: { onAccount: (address: Address | undefined) => void }) {
  const { address } = useAccount();
  useEffect(() => onAccount(address), [address, onAccount]);
  return null;
}

export default function WalletLookup({ onAccount, children }: { onAccount: (address: Address | undefined) => void; children?: ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      {/* RainbowKit needs its own query client inside wagmi; the app's client is the outer one. */}
      <RainbowKitProvider
        theme={lightTheme({ accentColor: "#2a44b8", accentColorForeground: "#ffffff", borderRadius: "small", fontStack: "system" })}
        showRecentTransactions={false}
      >
        <ConnectButton showBalance={false} chainStatus="none" accountStatus="address" />
        <Report onAccount={onAccount} />
        {children}
      </RainbowKitProvider>
    </WagmiProvider>
  );
}
