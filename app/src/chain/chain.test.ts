import { BaseError, ContractFunctionRevertedError, encodeAbiParameters, encodeErrorResult, encodeEventTopics, maxUint256, type Log } from "viem";
import { describe, expect, it } from "vitest";
import { vaultById } from "../config";
import { AGENT_VAULT, ALICE, BOB, fakeClient, harvestedLog, openedLog, positionState, spentLog } from "../test/fakeChain";
import { vaultAbi, vaultAbiV1 } from "./abi";
import { explainError } from "./errors";
import { decodeVaultLog, historyOf, positionsInvolving, scanVaultEvents, slices, totals } from "./events";
import { readKeyStatus, readPosition, readVaultInfo } from "./vault";
import { heirsParamsHash, prepareAction, spendParamsHash, withHeadroom } from "./write";

const REF = "0x8b354060f49eb509778ede97f017ccfe4296d08041a21f39e166ebe3fca5fd98" as const;

describe("log slices", () => {
  it("covers the range in inclusive slices of the RPC's limit", () => {
    expect(slices(0n, 9_999n)).toEqual([[0n, 9_999n]]);
    expect(slices(0n, 10_000n)).toEqual([
      [0n, 9_999n],
      [10_000n, 10_000n],
    ]);
    expect(slices(5n, 4n)).toEqual([]);
  });
});

describe("vault events", () => {
  const logs = [
    openedLog(1n, ALICE, ALICE, 300_000_000n),
    openedLog(2n, BOB, ALICE, 50_000_000n, 10_158_100n),
    harvestedLog(1n, 21n),
    spentLog(1n, BOB, 2_000n, REF, 10_158_600n),
  ];

  it("decodes version 2 logs, including spends", () => {
    expect(decodeVaultLog(logs[0] as Log)).toMatchObject({ kind: "Opened", positionId: 1n, owner: ALICE, beneficiary: ALICE, amount: 300_000_000n });
    expect(decodeVaultLog(logs[3] as Log)).toMatchObject({ kind: "Spent", positionId: 1n, to: BOB, amount: 2_000n, ref: REF });
    expect(decodeVaultLog({ ...logs[0], topics: [] } as unknown as Log)).toBeNull();
  });

  it("decodes version 1's Opened, which has no buffer cap", () => {
    const v1 = {
      address: vaultById("v1").address,
      blockNumber: 1n,
      logIndex: 0,
      transactionHash: `0x${"01".repeat(32)}`,
      topics: encodeEventTopics({ abi: vaultAbiV1, eventName: "Opened", args: { positionId: 2n, owner: BOB, beneficiary: BOB } }),
      data: encodeAbiParameters(
        [{ type: "uint256" }, { type: "uint256" }, { type: "uint64" }, { type: "uint64" }, { type: "uint64" }, { type: "bool" }],
        [50_000_000n, 0n, 86_400n, 86_400n, 86_400n, true],
      ),
    } as unknown as Log;
    expect(decodeVaultLog(v1)).toMatchObject({ kind: "Opened", positionId: 2n, owner: BOB, amount: 50_000_000n });
  });

  it("finds positions by role and totals the history", async () => {
    const events = await scanVaultEvents(fakeClient({ positions: {}, logs }), AGENT_VAULT);
    expect([...positionsInvolving(events, BOB).entries()]).toEqual([[2n, new Set(["owner"])]]);
    expect(positionsInvolving(events, ALICE).get(2n)).toEqual(new Set(["beneficiary"]));
    expect(totals(events)).toEqual({ opened: 2, harvested: 21n, spent: 2_000n, spends: 1, paidOut: 2_000n, compounded: 0n });
    expect(historyOf(events, 1n).map((e) => e.kind)).toEqual(["Spent", "Harvested", "Opened"]);
  });

  it("treats heirs from the latest list only", () => {
    const events = [
      { kind: "HeirsSet" as const, positionId: 1n, heirs: [BOB], block: 1n, tx: "0x" as const, logIndex: 0 },
      { kind: "HeirsSet" as const, positionId: 1n, heirs: [], block: 2n, tx: "0x" as const, logIndex: 0 },
    ];
    expect(positionsInvolving(events, BOB).size).toBe(0);
  });
});

describe("reads", () => {
  it("reads a vault and a position", async () => {
    const client = fakeClient({ positions: { "1": { state: positionState({ bufferCap: 50_000n }), heirs: [{ account: BOB, bps: 10_000 }], pendingYield: 5n } } });
    const info = await readVaultInfo(client, AGENT_VAULT);
    expect(info).toMatchObject({ symbol: "fUSD", decimals: 6, positionCount: 1n, rateBps: 500n, assetMatches: true });
    const p = await readPosition(client, AGENT_VAULT, 1n);
    expect(p.heirs).toEqual([{ account: BOB, bps: 10_000 }]);
    expect(p.state.bufferCap).toBe(50_000n);
  });

  it("reads a version 1 position as never compounding", async () => {
    const client = fakeClient({ positions: { "2": { state: positionState(), heirs: [], pendingYield: 0n } } });
    const p = await readPosition(client, vaultById("v1"), 2n);
    expect(p.state.bufferCap).toBe(maxUint256);
  });

  it("flags an asset that differs from the configuration", async () => {
    expect((await readVaultInfo(fakeClient({ positions: {}, asset: BOB }), AGENT_VAULT)).assetMatches).toBe(false);
  });

  it("requires a proven ML-DSA-87 key", async () => {
    const client = fakeClient({ positions: {}, keys: { [ALICE]: true } });
    expect((await readKeyStatus(client, ALICE)).usable).toBe(true);
    expect((await readKeyStatus(client, BOB)).usable).toBe(false);
  });
});

describe("explainError", () => {
  it("names a decoded contract error with its arguments", () => {
    const data = encodeErrorResult({ abi: vaultAbi, errorName: "InsufficientBuffer", args: [3n, 1_000n] });
    const error = new BaseError("reverted", { cause: new ContractFunctionRevertedError({ abi: vaultAbi, data, functionName: "spend" }) });
    expect(explainError(error)).toEqual({
      kind: "contract",
      message: "The buffer does not hold that much yet. Wait for more yield, or spend less.",
      detail: "InsufficientBuffer(3, 1000)",
    });
  });

  it("explains a signature the vault refused", () => {
    const data = encodeErrorResult({ abi: vaultAbi, errorName: "PQCSignatureInvalid", args: [ALICE] });
    const error = new ContractFunctionRevertedError({ abi: vaultAbi, data, functionName: "checkIn" });
    expect(explainError(error).message).toBe("The vault rejected the ML-DSA-87 signature.");
  });

  it("recognises the chain's EVM window refusals", () => {
    expect(explainError(new Error("sender has no open EVM authorisation window")).kind).toBe("window");
  });

  it("recognises network and fee failures", () => {
    expect(explainError(new Error("HTTP request failed. Status: 502")).kind).toBe("network");
    expect(explainError(new Error("insufficient funds for gas * price + value")).kind).toBe("funds");
    expect(explainError("something odd").kind).toBe("unknown");
  });
});

describe("write helpers", () => {
  it("hashes heirs exactly as the vault does (checked against cast)", () => {
    expect(
      heirsParamsHash([
        { account: "0x1111111111111111111111111111111111111111", bps: 6_000 },
        { account: "0x2222222222222222222222222222222222222222", bps: 4_000 },
      ]),
    ).toBe("0xa3582897bc0c0f5c591861c92d2ef9a12e78c0184517b0807800a359fe48794d");
    expect(heirsParamsHash([])).toBe("0x569e75fc77c1a856f6daaf9e69d8a9566ca34aa47f9133711ce065a571af0cfd");
  });

  it("hashes a spend exactly as the vault does (checked against cast)", () => {
    expect(spendParamsHash("0x1111111111111111111111111111111111111111", 2_000n, REF)).toBe(
      "0xf2c93a7b221b26fe3e82515120bfee26b884e90fd8dc0bb8c9d38d5adfe08cf3",
    );
  });

  it("prepares a spend over the vault's own message bytes", async () => {
    const client = fakeClient({ positions: { "1": { state: positionState({ nonce: 7n }), heirs: [], pendingYield: 0n } } });
    const calls: unknown[][] = [];
    Object.assign(client, {
      readContract: ((original: (req: never) => Promise<unknown>) => (req: { functionName: string; args?: unknown[] }) => {
        if (req.functionName === "actionMessage") {
          calls.push(req.args ?? []);
          return Promise.resolve("0xabcd");
        }
        return original(req as never);
      })(client.readContract.bind(client) as never),
    });
    const prepared = await prepareAction(client, AGENT_VAULT.address, { id: 1n, action: "Spend", signer: ALICE, spend: { to: BOB, amount: 2_000n, ref: REF } });
    expect(prepared.message).toBe("0xabcd");
    expect(calls[0]).toEqual([1n, 4, 7n, prepared.deadline, spendParamsHash(BOB, 2_000n, REF)]);
  });

  it("adds a quarter to the gas estimate", () => {
    expect(withHeadroom(200_000n)).toBe(250_000n);
  });
});

describe("explorer links", () => {
  it("formats native transaction hashes the way the explorer finds them", async () => {
    const { nativeTxUrl } = await import("../config");
    expect(nativeTxUrl("0xabc123")).toBe("https://explore.qore.network/tx/ABC123");
  });
});
