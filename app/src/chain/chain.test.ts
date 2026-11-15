import { BaseError, ContractFunctionRevertedError, encodeErrorResult } from "viem";
import { describe, expect, it } from "vitest";
import { ALICE, BOB, fakeClient, harvestedLog, openedLog, positionState } from "../test/fakeChain";
import { vaultAbi } from "./abi";
import { explainError } from "./errors";
import { decodeVaultLog, historyOf, positionsInvolving, scanVaultEvents, slices, totals } from "./events";
import { readKeyStatus, readPosition, readVaultInfo } from "./vault";
import { heirsParamsHash, withHeadroom } from "./write";

describe("log slices", () => {
  it("covers the range in inclusive slices of the RPC's limit", () => {
    expect(slices(0n, 9_999n)).toEqual([[0n, 9_999n]]);
    expect(slices(0n, 10_000n)).toEqual([
      [0n, 9_999n],
      [10_000n, 10_000n],
    ]);
    expect(slices(5n, 4n)).toEqual([]);
    expect(slices(1n, 25n, 10n)).toEqual([
      [1n, 10n],
      [11n, 20n],
      [21n, 25n],
    ]);
  });
});

describe("vault events", () => {
  const logs = [openedLog(1n, ALICE, ALICE, 300_000_000n), openedLog(2n, BOB, ALICE, 50_000_000n, 10_124_450n), harvestedLog(1n, 21n)];

  it("decodes the vault's logs", () => {
    const opened = decodeVaultLog(logs[0] as never);
    expect(opened).toMatchObject({ kind: "Opened", positionId: 1n, owner: ALICE, beneficiary: ALICE, amount: 300_000_000n });
    expect(decodeVaultLog({ ...logs[0], topics: [] } as never)).toBeNull();
  });

  it("finds positions by role and totals the history", async () => {
    const events = await scanVaultEvents(fakeClient({ positions: {}, logs }));
    const roles = positionsInvolving(events, BOB);
    expect([...roles.entries()]).toEqual([[2n, new Set(["owner"])]]);
    expect(positionsInvolving(events, ALICE).get(2n)).toEqual(new Set(["beneficiary"]));
    expect(totals(events)).toEqual({ opened: 2, harvested: 21n, paidOut: 0n });
    expect(historyOf(events, 1n).map((e) => e.kind)).toEqual(["Harvested", "Opened"]);
  });

  it("treats heirs from the latest list only", () => {
    const events = [
      { kind: "HeirsSet" as const, positionId: 1n, heirs: [BOB], block: 1n, tx: "0x" as const },
      { kind: "HeirsSet" as const, positionId: 1n, heirs: [], block: 2n, tx: "0x" as const },
    ];
    expect(positionsInvolving(events, BOB).size).toBe(0);
  });
});

describe("reads", () => {
  it("reads the vault and a position", async () => {
    const client = fakeClient({ positions: { "1": { state: positionState(), heirs: [{ account: BOB, bps: 10_000 }], pendingYield: 5n } } });
    const info = await readVaultInfo(client);
    expect(info).toMatchObject({ symbol: "fUSD", decimals: 6, positionCount: 1n, rateBps: 500n, assetMatches: true });
    const p = await readPosition(client, 1n);
    expect(p.heirs).toEqual([{ account: BOB, bps: 10_000 }]);
    expect(p.pendingYield).toBe(5n);
  });

  it("flags an asset that differs from the configuration", async () => {
    const info = await readVaultInfo(fakeClient({ positions: {}, asset: BOB }));
    expect(info.assetMatches).toBe(false);
  });

  it("requires a proven ML-DSA-87 key", async () => {
    const client = fakeClient({ positions: {}, keys: { [ALICE]: true } });
    expect((await readKeyStatus(client, ALICE)).usable).toBe(true);
    expect((await readKeyStatus(client, BOB)).usable).toBe(false);
  });
});

describe("explainError", () => {
  it("names a decoded contract error with its arguments", () => {
    const data = encodeErrorResult({ abi: vaultAbi, errorName: "PayoutNotDue", args: [3n, 1_800_000_000n] });
    const error = new BaseError("reverted", { cause: new ContractFunctionRevertedError({ abi: vaultAbi, data, functionName: "claim" }) });
    expect(explainError(error)).toEqual({
      kind: "contract",
      message: "No payout is due yet.",
      detail: "PayoutNotDue(3, 1800000000)",
    });
  });

  it("explains a signature the vault refused", () => {
    const data = encodeErrorResult({ abi: vaultAbi, errorName: "PQCSignatureInvalid", args: [ALICE] });
    const error = new ContractFunctionRevertedError({ abi: vaultAbi, data, functionName: "checkIn" });
    expect(explainError(error).message).toBe("The vault rejected the ML-DSA-87 signature.");
  });

  it("recognises the chain's EVM window refusals", () => {
    const explained = explainError(new Error("sender has no open EVM authorisation window"));
    expect(explained.kind).toBe("window");
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

  it("adds a quarter to the gas estimate", () => {
    expect(withHeadroom(200_000n)).toBe(250_000n);
  });
});

describe("explorer links", () => {
  it("formats native transaction hashes the way the explorer finds them", async () => {
    const { nativeTxUrl } = await import("../config");
    expect(nativeTxUrl("0xabc123")).toBe("https://explore.qore.network/tx/ABC123");
    expect(nativeTxUrl("34233E08")).toBe("https://explore.qore.network/tx/34233E08");
  });
});
