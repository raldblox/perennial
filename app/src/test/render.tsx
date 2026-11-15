import { QueryClient } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { encodeAbiParameters, encodeEventTopics, type Address, type Hash, type Log, type PublicClient } from "viem";
import { vi } from "vitest";
import { vaultAbi } from "../chain/abi";
import { Providers } from "../providers";
import type { SessionAccount } from "../signer/session";
import { SessionProvider } from "../state/session";
import { ChainContext } from "../state/queries";
import { QueryClientProvider } from "@tanstack/react-query";
import { AGENT_VAULT, ALICE } from "./fakeChain";

export function renderWith(ui: ReactElement, client: PublicClient) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <Providers client={client} queryClient={queryClient}>
      {ui}
    </Providers>,
  );
}

export const TX_HASH: Hash = `0x${"77".repeat(32)}`;

/** A signer module whose account is ALICE, with a wallet that records what it sends. */
export function fakeSigner(options: { windowLive?: boolean; windowReachable?: boolean } = {}) {
  const sent: { functionName: string; args: readonly unknown[] }[] = [];
  const account: SessionAccount = {
    evm: ALICE,
    evmQor: "qor1alice",
    native: "qor1alicenative",
    nativeEvm: "0x00000000000000000000000000000000000a11ce",
    publicKeys: { [ALICE]: `0x${"ab".repeat(2592)}` },
  };
  const wallet = {
    account: { address: ALICE, type: "local" },
    chain: undefined,
    writeContract: vi.fn((req: { functionName: string; args: readonly unknown[] }) => {
      sent.push({ functionName: req.functionName, args: req.args });
      return Promise.resolve(TX_HASH);
    }),
  };
  const module = {
    unlock: vi.fn(() => Promise.resolve(account)),
    lock: vi.fn(),
    canSignFor: (a: Address) => a === ALICE,
    signAction: vi.fn(() => `0x${"5a".repeat(4627)}`),
    walletClient: () => wallet,
    readWindow: vi.fn(() =>
      Promise.resolve(
        options.windowReachable === false
          ? { reachable: false, reason: "not forwarded" }
          : { reachable: true, window: { found: true, live: options.windowLive ?? true, remainingBlocks: 2_000n, remainingTxs: 5n, allowedTargets: [AGENT_VAULT.address] } },
      ),
    ),
    openWindow: vi.fn(() => Promise.resolve("ABCDEF")),
    quoteSwap: vi.fn(() => Promise.resolve({ amountIn: 1_000_000n, quote: 84_983n, minOut: 82_433n })),
    swapQorForFusd: vi.fn(() => Promise.resolve("5WAP")),
  };
  return { module, sent, account };
}

/** Adds the write side to a fake client: simulation, gas, receipts with an Opened log. */
export function withWrites(client: PublicClient, openedId = 3n): PublicClient {
  const receiptLog = {
    address: AGENT_VAULT.address,
    topics: encodeEventTopics({ abi: vaultAbi, eventName: "Opened", args: { positionId: openedId, owner: ALICE, beneficiary: ALICE } }),
    data: encodeAbiParameters(
      [{ type: "uint256" }, { type: "uint256" }, { type: "uint64" }, { type: "uint64" }, { type: "uint64" }, { type: "bool" }, { type: "uint256" }],
      [1n, 0n, 1n, 1n, 1n, false, 0n],
    ),
  } as unknown as Log;
  return Object.assign(client, {
    simulateContract: vi.fn((req: object) => Promise.resolve({ request: req })),
    estimateContractGas: vi.fn(() => Promise.resolve(200_000n)),
    estimateFeesPerGas: vi.fn(() => Promise.resolve({ maxFeePerGas: 1n })),
    waitForTransactionReceipt: vi.fn(() => Promise.resolve({ status: "success", logs: [receiptLog] })),
    getTransactionReceipt: vi.fn(() => Promise.resolve({ status: "success", logs: [receiptLog] })),
  });
}

/** Renders with an account already unlockable through the fake signer. */
export function renderUnlockable(ui: ReactElement, client: PublicClient, signer: ReturnType<typeof fakeSigner>) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ChainContext.Provider value={client}>
        <SessionProvider loader={() => Promise.resolve(signer.module as never)}>{ui}</SessionProvider>
      </ChainContext.Provider>
    </QueryClientProvider>,
  );
}
