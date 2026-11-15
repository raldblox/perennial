/**
 * Chain reads as cached queries. The public client comes from context so tests
 * can replace the chain.
 */
import { useQuery } from "@tanstack/react-query";
import { createContext, useContext } from "react";
import { type Address, type PublicClient } from "viem";
import { config } from "../config";
import { scanVaultEvents } from "../chain/events";
import { chainNow, readBalances, readKeyStatus, readPosition, readVaultInfo } from "../chain/vault";
import { erc20Abi } from "../chain/abi";
import { useSession } from "./session";

export const ChainContext = createContext<PublicClient | null>(null);

export function useClient(): PublicClient {
  const client = useContext(ChainContext);
  if (!client) throw new Error("useClient outside ChainContext");
  return client;
}

export function useVaultInfo() {
  const client = useClient();
  return useQuery({ queryKey: ["vault-info"], queryFn: () => readVaultInfo(client), staleTime: 30_000 });
}

export function useChainId() {
  const client = useClient();
  return useQuery({ queryKey: ["chain-id"], queryFn: () => client.getChainId(), staleTime: Infinity });
}

/** The chain's clock, refreshed every 15 seconds. */
export function useChainNow() {
  const client = useClient();
  return useQuery({ queryKey: ["chain-now"], queryFn: () => chainNow(client), refetchInterval: 15_000 });
}

export function useVaultEvents() {
  const client = useClient();
  return useQuery({ queryKey: ["vault-events"], queryFn: () => scanVaultEvents(client), staleTime: 20_000 });
}

export function usePosition(id: bigint) {
  const client = useClient();
  return useQuery({
    queryKey: ["position", id.toString()],
    queryFn: () => readPosition(client, id),
    refetchInterval: 20_000,
    retry: (count, error) => count < 2 && !/UnknownPosition/.test(String(error)),
  });
}

/** Principal held across the open positions, read from each position. */
export function usePrincipalHeld(count: bigint | undefined) {
  const client = useClient();
  return useQuery({
    queryKey: ["principal-held", count?.toString()],
    enabled: count !== undefined,
    queryFn: async () => {
      const ids = Array.from({ length: Number(count ?? 0n) }, (_, i) => BigInt(i + 1));
      const positions = await Promise.all(ids.map((id) => readPosition(client, id)));
      return positions.reduce((sum, p) => (p.state.closed ? sum : sum + p.state.principal), 0n);
    },
    staleTime: 30_000,
  });
}

/** The mock source's free reserve: its asset balance minus the principal it holds for the vault. */
export function useSourceReserve(source: Address | undefined, asset: Address | undefined, principalHeld: bigint | undefined) {
  const client = useClient();
  return useQuery({
    queryKey: ["source-reserve", source, principalHeld?.toString()],
    enabled: source !== undefined && asset !== undefined && principalHeld !== undefined,
    queryFn: async () => {
      if (!source || !asset || principalHeld === undefined) return 0n;
      const balance = await client.readContract({ address: asset, abi: erc20Abi, functionName: "balanceOf", args: [source] });
      return balance > principalHeld ? balance - principalHeld : 0n;
    },
    staleTime: 30_000,
  });
}

export function useKeyStatus(account: Address | undefined) {
  const client = useClient();
  return useQuery({
    queryKey: ["key-status", account],
    enabled: account !== undefined,
    queryFn: () => readKeyStatus(client, account ?? "0x0000000000000000000000000000000000000000"),
    staleTime: 60_000,
  });
}

export function useBalances(account: Address | undefined) {
  const client = useClient();
  const info = useVaultInfo();
  return useQuery({
    queryKey: ["balances", account, info.data?.asset],
    enabled: account !== undefined && info.data !== undefined,
    queryFn: () => readBalances(client, account ?? config.vault, info.data?.asset ?? config.asset),
    refetchInterval: 20_000,
  });
}

/** The sending account's EVM window, when this site can reach the native REST API. */
export function useWindow() {
  const { account, signer } = useSession();
  return useQuery({
    queryKey: ["evm-window", account?.evm],
    enabled: account !== null && signer !== null,
    queryFn: async () => {
      if (!account || !signer) throw new Error("locked");
      return signer.readWindow(account.evm);
    },
    refetchInterval: 15_000,
  });
}
