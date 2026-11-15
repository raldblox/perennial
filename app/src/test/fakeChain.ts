/**
 * A stand-in for the chain: just enough of viem's PublicClient for the app's
 * reads, answering from a plain description of the vault's state.
 */
import { encodeAbiParameters, encodeEventTopics, getAddress, type Address, type Log, type PublicClient } from "viem";
import { vaultAbi } from "../chain/abi";
import { config } from "../config";
import type { PositionState } from "../lib/schedule";

export const SOURCE: Address = "0x00000000000000000000000000000000000050c3";
export const ALICE: Address = getAddress("0xa11ce00000000000000000000000000000000001");
export const BOB: Address = getAddress("0xb0b0000000000000000000000000000000000002");
export const NOW = 1_800_000_000n;
const KEY = `0x${"ab".repeat(2592)}` as const;

export interface FakeState {
  chainId?: number;
  now?: bigint;
  positions: Record<string, { state: PositionState; heirs: { account: Address; bps: number }[]; pendingYield: bigint }>;
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
    ...overrides,
  };
}

export function openedLog(id: bigint, owner: Address, beneficiary: Address, amount: bigint, block = 10_124_400n): Log {
  return {
    address: config.vault,
    blockNumber: block,
    transactionHash: `0x${id.toString(16).padStart(64, "0")}`,
    topics: encodeEventTopics({ abi: vaultAbi, eventName: "Opened", args: { positionId: id, owner, beneficiary } }) as Log["topics"],
    data: encodeAbiParameters(
      [{ type: "uint256" }, { type: "uint256" }, { type: "uint64" }, { type: "uint64" }, { type: "uint64" }, { type: "bool" }],
      [amount, 0n, 2_628_000n, 86_400n, 86_400n, false],
    ),
  } as unknown as Log;
}

export function harvestedLog(id: bigint, amount: bigint, block = 10_124_500n): Log {
  return {
    address: config.vault,
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
    getBlock: () => Promise.resolve({ timestamp: state.now ?? NOW }),
    getBlockNumber: () => Promise.resolve(config.deployBlock + 1_000n),
    getBalance: () => Promise.resolve(10n ** 18n),
    getLogs: () => Promise.resolve().then(() => {
      fail();
      return state.logs ?? [];
    }),
  };
  return client as unknown as PublicClient;
}
