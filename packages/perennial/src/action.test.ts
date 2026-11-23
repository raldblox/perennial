import { describe, expect, it } from "vitest";
import { encodeActionMessage, spendArgs, spendParamsHash, type PreparedAction } from "./action.js";
import { testnet } from "./deployments.js";
import { spendableNow, type PositionView } from "./read.js";

describe("signed actions", () => {
  it("encodes exactly what the deployed vault's actionMessage returns", () => {
    // From the no-yield vault: `cast call ... actionMessage(2, 4, 7, 1795400000, ref)`, 23 November 2026.
    const fromChain =
      "0x52dddb8d487bb441f0fc37ca416a7d625700b1d629a5991f36eba43f017343ba000000000000000000000000000000000000000000000000000000000000264800000000000000000000000076dac5461ff361f911e5f39810c9455a6180c180000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000007000000000000000000000000000000000000000000000000000000006b03a140286213f284ba3e2bfa1215860fea72ecd4c4aceeaafe1fec14838024f2d622a9";
    expect(
      encodeActionMessage({
        chainId: 9800n,
        vault: testnet.vaults.noYield,
        positionId: 2n,
        action: "Spend",
        nonce: 7n,
        deadline: 1_795_400_000n,
        paramsHash: "0x286213f284ba3e2bfa1215860fea72ecd4c4aceeaafe1fec14838024f2d622a9",
      }),
    ).toBe(fromChain);
  });

  it("binds a spend to its recipient, amount and reference", () => {
    const to = "0x825c2e0282c4681fad2f99F514d3D3003cd27432";
    const ref = `0x${"ab".repeat(32)}` as const;
    expect(spendParamsHash(to, 2_000n, ref)).not.toBe(spendParamsHash(to, 2_001n, ref));
    const prepared: PreparedAction = {
      vault: testnet.vaults.demo,
      request: { id: 1n, action: "Spend", signer: to, spend: { to, amount: 2_000n, ref } },
      nonce: 0n,
      deadline: 10n,
      paramsHash: spendParamsHash(to, 2_000n, ref),
      message: "0x",
    };
    expect(spendArgs(prepared, "0xdead")).toEqual([1n, to, 2_000n, ref, 10n, "0xdead"]);
  });
});

describe("what an agent can spend now", () => {
  const base = { buffer: 3n, pendingYield: 1n, principal: 100n, budgetRemaining: 10n, closed: false, succeeded: false } as PositionView;

  it("is the buffer and pending yield without budget mode", () => {
    expect(spendableNow({ ...base, budgetMode: false })).toBe(4n);
  });

  it("is the window's remaining budget in budget mode, never more than the position holds", () => {
    expect(spendableNow({ ...base, budgetMode: true })).toBe(10n);
    expect(spendableNow({ ...base, budgetMode: true, budgetRemaining: 1_000n })).toBe(104n);
  });

  it("is nothing once closed or succeeded", () => {
    expect(spendableNow({ ...base, budgetMode: true, closed: true })).toBe(0n);
  });
});
