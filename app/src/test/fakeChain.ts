/**
 * A stand-in for the chain: just enough of viem's PublicClient for the app's
 * reads, answering from a plain description of the vault's state.
 */
import { encodeAbiParameters, encodeEventTopics, getAddress, type Address, type Log, type PublicClient } from "viem";
import { vaultAbi } from "../chain/abi";
import { config, vaultById } from "../config";
import type { PositionState } from "../lib/schedule";

export const SOURCE: Address = "0x00000000000000000000000000000000000050c3";
export const ALICE: Address = getAddress("0xa11ce00000000000000000000000000000000001");
export const BOB: Address = getAddress("0xb0b0000000000000000000000000000000000002");
export const NOW = 1_800_000_000n;
export const AGENT_VAULT = vaultById("agent");
const KEY = `0x${"ab".repeat(2592)}` as const;

export interface FakeState {
  chainId?: number;
  now?: bigint;
  positions: Record<string, { state: PositionState; heirs: { account: Address; bps: number }[]; pendingYield: bigint; budgetRemaining?: bigint }>;
  logs?: Log[];
  keys?: Record<string, boolean>;
  balances?: Record<string, bigint>;
  allowance?: bigint;
  asset?: Address;
  failReads?: boolean;
}

export function positionState(overrides: Partial<PositionState> = {}): PositionState {
  return {
    owner: ALICE,
    beneficiary: ALICE,
    ownerCanClose: false,
    succeeded: false,
    closed: false,
    payoutInterval: 2_628_000n,
    checkInPeriod: 90n * 86_400n,
    gracePeriod: 30n * 86_400n,
    lastCheckIn: NOW - 86_400n,
    lastPayout: NOW - 86_400n,
    payoutAmount: 400_000_000n,
    principal: 110_400_000_000n,
    shares: 110_400_000_000n,
    buffer: 1_250_000_000n,
    nonce: 3n,
    bufferCap: 2n ** 256n - 1n,
    budgetMode: false,
    windowStart: NOW - 86_400n,
    windowSpent: 0n,
    ...overrides,
  };
}

export function openedLog(id: bigint, owner: Address, beneficiary: Address, amount: bigint, block = 10_158_000n): Log {
  return {
    address: AGENT_VAULT.address,
    logIndex: 0,
    blockNumber: block,
    transactionHash: `0x${id.toString(16).padStart(64, "0")}`,
    topics: encodeEventTopics({ abi: vaultAbi, eventName: "Opened", args: { positionId: id, owner, beneficiary } }) as Log["topics"],
    data: encodeAbiParameters(
      [{ type: "uint256" }, { type: "uint256" }, { type: "uint64" }, { type: "uint64" }, { type: "uint64" }, { type: "bool" }, { type: "uint256" }],
      [amount, 0n, 2_628_000n, 86_400n, 86_400n, false, 2n ** 256n - 1n],
    ),
  } as unknown as Log;
}

export function spentLog(id: bigint, to: Address, amount: bigint, ref: `0x${string}`, block: bigint): Log {
  return {
    address: AGENT_VAULT.address,
    logIndex: 1,
    blockNumber: block,
    transactionHash: `0x${"ef".repeat(32)}`,
    topics: encodeEventTopics({ abi: vaultAbi, eventName: "Spent", args: { positionId: id, to, ref } }) as Log["topics"],
    data: encodeAbiParameters([{ type: "uint256" }], [amount]),
  } as unknown as Log;
}

export function fundedLog(id: bigint, from: Address, amount: bigint, block: bigint): Log {
  return {
    address: AGENT_VAULT.address,
    logIndex: 2,
    blockNumber: block,
    transactionHash: `0x${"fd".repeat(32)}`,
    topics: encodeEventTopics({ abi: vaultAbi, eventName: "Funded", args: { positionId: id, from } }) as Log["topics"],
    data: encodeAbiParameters([{ type: "uint256" }], [amount]),
  } as unknown as Log;
}

export function principalDrawnLog(id: bigint, amount: bigint, block: bigint): Log {
  return {
    address: AGENT_VAULT.address,
    logIndex: 3,
    blockNumber: block,
    transactionHash: `0x${"dd".repeat(32)}`,
    topics: encodeEventTopics({ abi: vaultAbi, eventName: "PrincipalDrawn", args: { positionId: id } }) as Log["topics"],
    data: encodeAbiParameters([{ type: "uint256" }], [amount]),
  } as unknown as Log;
}

export function harvestedLog(id: bigint, amount: bigint, block = 10_158_500n): Log {
  return {
    address: AGENT_VAULT.address,
    logIndex: 0,
    blockNumber: block,
    transactionHash: `0x${"cd".repeat(32)}`,
    topics: encodeEventTopics({ abi: vaultAbi, eventName: "Harvested", args: { positionId: id, caller: BOB } }) as Log["topics"],
    data: encodeAbiParameters([{ type: "uint256" }], [amount]),
  } as unknown as Log;
}

export function fakeClient(state: FakeState): PublicClient {
  const asset = state.asset ?? config.asset;
  const fail = () => {
    if (state.failReads) throw new Error("HTTP request failed");
  };
  const readContract = ({ functionName, args }: { functionName: string; args?: readonly unknown[] }) => {
    fail();
    const id = (args?.[0] as bigint | undefined)?.toString() ?? "";
    switch (functionName) {
      case "ASSET":
        return asset;
      case "SOURCE":
        return SOURCE;
      case "positionCount":
        return BigInt(Object.keys(state.positions).length);
      case "symbol":
        return "fUSD";
      case "decimals":
        return 6;
      case "RATE_PER_YEAR":
        return 50_000_000_000_000_000n;
      case "position": {
        const p = state.positions[id];
        if (!p) throw new Error(`UnknownPosition(${id})`);
        return p.state;
      }
      case "heirs":
        return state.positions[id]?.heirs ?? [];
      case "pendingYield":
        return state.positions[id]?.pendingYield ?? 0n;
      case "budgetRemaining":
        return state.positions[id]?.budgetRemaining ?? 0n;
      case "balanceOf":
        return state.balances?.[getAddress(String(args?.[0]))] ?? 0n;
      case "allowance":
        return state.allowance ?? 0n;
      case "pqcKeyStatus": {
        const usable = state.keys?.[getAddress(String(args?.[0]))] ?? false;
        return usable ? [true, 1, KEY, true] : [false, 0, "0x", false];
      }
      default:
        throw new Error(`fake chain: no ${functionName}`);
    }
  };
  const client = {
    readContract: (req: { functionName: string; args?: readonly unknown[] }) => Promise.resolve().then(() => readContract(req)),
    getChainId: () => Promise.resolve(state.chainId ?? config.chainId),
    getBlock: (args?: { blockNumber?: bigint }) => {
      const latest = AGENT_VAULT.deployBlock + 10_000n;
      const number = args?.blockNumber ?? latest;
      // 1.5 seconds a block.
      return Promise.resolve({ number, timestamp: (state.now ?? NOW) - ((latest - number) * 3n) / 2n });
    },
    getBlockNumber: () => Promise.resolve(AGENT_VAULT.deployBlock + 10_000n),
    getBalance: () => Promise.resolve(10n ** 18n),
    getLogs: (args: { address?: Address; fromBlock: bigint; toBlock: bigint }) =>
      Promise.resolve().then(() => {
        fail();
        // Like the RPC: only this range, and only the vault asked for.
        return (state.logs ?? []).filter(
          (log) =>
            (log.blockNumber ?? 0n) >= args.fromBlock &&
            (log.blockNumber ?? 0n) <= args.toBlock &&
            (args.address === undefined || getAddress(log.address) === getAddress(args.address)),
        );
      }),
  };
  return client as unknown as PublicClient;
}
