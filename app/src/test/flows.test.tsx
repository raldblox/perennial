import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { App } from "../App";
import { ALICE, BOB, fakeClient, harvestedLog, NOW, openedLog, positionState, spentLog, type FakeState } from "./fakeChain";
import { fakeSigner, renderUnlockable, renderWith, withWrites } from "./render";

function go(hash: string) {
  window.location.hash = hash;
}

const DAY = 86_400n;
const REF = `0x${"aa".repeat(32)}` as const;

function state(overrides: Partial<FakeState> = {}): FakeState {
  return {
    positions: {
      "1": { state: positionState({ principal: 500_000_000n, buffer: 40_000n, bufferCap: 60_000n }), heirs: [{ account: BOB, bps: 10_000 }], pendingYield: 1_234n },
    },
    logs: [openedLog(1n, ALICE, ALICE, 500_000_000n), harvestedLog(1n, 21n), spentLog(1n, BOB, 2_000n, REF, 10_159_000n)],
    keys: { [ALICE]: true, [BOB]: true },
    balances: { [ALICE]: 500_000_000_000n },
    ...overrides,
  };
}

async function unlock(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getAllByRole("button", { name: "Unlock an account" })[0] as HTMLElement);
  const dialog = await screen.findByRole("dialog");
  await user.type(within(dialog).getByLabelText("Recovery phrase"), "any words");
  const submit = within(dialog).getByRole("button", { name: "Unlock" });
  expect(submit).toBeDisabled();
  await user.click(within(dialog).getByRole("checkbox"));
  await user.click(submit);
  await waitFor(() => expect(screen.getByRole("button", { name: "Lock" })).toBeInTheDocument());
}

beforeEach(() => go("#/"));

describe("overview", () => {
  it("leads with the agent use case and its arithmetic", async () => {
    renderWith(<App />, fakeClient(state()));
    expect(screen.getByRole("heading", { level: 1, name: "Deposit once. The yield pays your agent's calls." })).toBeInTheDocument();
    expect(screen.getByText("1.24 calls an hour")).toBeInTheDocument();
    // The calculator starts at one 0.002 call an hour: 402.96 fUSD.
    expect(screen.getByTestId("calc-result")).toHaveTextContent("402.96");
    await waitFor(() => expect(screen.getAllByText("Calls paid")[0]?.parentElement).toHaveTextContent("1"));
    expect(screen.getAllByText(/accelerated testnet rate/i).length).toBeGreaterThan(0);
  });

  it("recalculates and inverts", async () => {
    const user = userEvent.setup();
    renderWith(<App />, fakeClient(state()));
    const calls = screen.getByLabelText("Calls an hour");
    await user.clear(calls);
    await user.type(calls, "10");
    expect(screen.getByTestId("calc-result")).toHaveTextContent("4,029.6");
    await user.click(screen.getByRole("button", { name: "From deposit to calls" }));
    expect(screen.getByTestId("calc-result")).toHaveTextContent("1.24");
  });

  it("says plainly when the vaults cannot be read", async () => {
    renderWith(<App />, fakeClient(state({ failReads: true })));
    expect((await screen.findAllByText(/could not be read/)).length).toBeGreaterThan(0);
  });

  it("refuses to write on the wrong chain", async () => {
    renderWith(<App />, fakeClient(state({ chainId: 1 })));
    expect(await screen.findByText(/not 9800/)).toBeInTheDocument();
  });
});

describe("position control panel", () => {
  it("shows health, figures, the ledger with refs, and the compounding rule, without an account", async () => {
    go("#/position/1");
    renderWith(<App />, fakeClient(state()));
    expect(await screen.findByRole("heading", { name: "Position 1" })).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Principal").parentElement).toHaveTextContent("500.00 fUSD");
    expect(screen.getByText("Buffer").parentElement).toHaveTextContent("Cap 0.060000 fUSD.");
    expect(screen.getByText(/Yield above the buffer cap is added to the principal/)).toBeInTheDocument();
    const ledger = await screen.findByRole("table");
    expect(within(ledger).getByText("Spent")).toBeInTheDocument();
    expect(within(ledger).getByText("0xaaaa…aaaa")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Claim to self" })).toBeDisabled();
    expect(screen.getByText(/Unlock an account to act/)).toBeInTheDocument();
  });

  it("reports a position that does not exist", async () => {
    go("#/position/9");
    renderWith(<App />, fakeClient(state()));
    expect(await screen.findByText("There is no position 9 in this vault.")).toBeInTheDocument();
  });

  it("shows the read-only vault without controls", async () => {
    go("#/position/v1/1");
    renderWith(<App />, fakeClient(state()));
    expect(await screen.findByText("Version 1 vault (read-only) · 5% a year, simulated")).toBeInTheDocument();
    expect(screen.getAllByText("This vault is read-only here.").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Send" })).toBeNull();
  });

  it("opens succession once the deadline has passed", async () => {
    go("#/position/1");
    const late = positionState({ lastCheckIn: NOW - 121n * DAY, lastPayout: NOW - 121n * DAY });
    renderWith(<App />, fakeClient(state({ positions: { "1": { state: late, heirs: [{ account: BOB, bps: 10_000 }], pendingYield: 0n } } })));
    expect(await screen.findByText("Succession open")).toBeInTheDocument();
  });

  it("signs a spend only after showing recipient, amount and the vault's bytes", async () => {
    go("#/position/1");
    const user = userEvent.setup();
    const signer = fakeSigner();
    const client = withWrites(fakeClient(state()));
    Object.assign(client, {
      readContract: ((original: (req: never) => Promise<unknown>) => (req: { functionName: string }) =>
        req.functionName === "actionMessage" ? Promise.resolve("0xfeedbeef") : original(req as never))(client.readContract.bind(client) as never),
    });
    renderUnlockable(<App />, client, signer);
    await screen.findByRole("heading", { name: "Position 1" });
    await unlock(user);
    await user.type(screen.getByLabelText("Pay to"), BOB);
    await user.type(screen.getByLabelText("Reference"), "request 42");
    const send = screen.getByRole("button", { name: "Send" });
    await waitFor(() => expect(send).toBeEnabled());
    await user.click(send);
    const dialog = await screen.findByRole("dialog", { name: "Sign this action" });
    expect(within(dialog).getByText("Spend from the buffer")).toBeInTheDocument();
    expect(within(dialog).getByText(new RegExp(`0.002000 fUSD to ${BOB}`))).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Message")).toHaveValue("0xfeedbeef");
    expect(signer.module.signAction).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Sign and send" }));
    await waitFor(() => expect(signer.sent.map((s) => s.functionName)).toEqual(["spend"]));
    const args = signer.sent[0]?.args ?? [];
    expect(args.slice(0, 3)).toEqual([1n, BOB, 2_000n]);
    expect(await screen.findByText(/Confirmed\. Paid\./)).toBeInTheDocument();
  });

  it("asks for confirmation before triggering succession", async () => {
    go("#/position/1");
    const user = userEvent.setup();
    const signer = fakeSigner();
    const late = positionState({ lastCheckIn: NOW - 121n * DAY });
    renderUnlockable(<App />, withWrites(fakeClient(state({ positions: { "1": { state: late, heirs: [{ account: BOB, bps: 10_000 }], pendingYield: 0n } } }))), signer);
    await screen.findByRole("heading", { name: "Position 1" });
    await unlock(user);
    const trigger = screen.getByRole("button", { name: "Trigger succession" });
    await waitFor(() => expect(trigger).toBeEnabled());
    await user.click(trigger);
    expect(signer.sent).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Confirm: trigger succession" }));
    await waitFor(() => expect(signer.sent.map((s) => s.functionName)).toEqual(["triggerSuccession"]));
  });
});

describe("fund an agent", () => {
  it("suggests the deposit, validates, and approves exactly that amount", async () => {
    go("#/open");
    const user = userEvent.setup();
    const signer = fakeSigner();
    renderUnlockable(<App />, withWrites(fakeClient(state())), signer);
    await unlock(user);

    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText("Enter a deposit above zero, with at most 6 decimals.")).toBeInTheDocument();

    expect(await screen.findByText(/that needs 402.96 fUSD/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Use this deposit" }));
    expect(screen.getByLabelText("Deposit")).toHaveValue("402.96");
    expect(screen.getByText(/pays about 1 call an hour/)).toBeInTheDocument();
    // The cap starts at a day of calls: 24 × 0.002.
    expect(screen.getByLabelText("Buffer cap")).toHaveValue("0.048");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    await user.click(screen.getByRole("button", { name: "Add an heir" }));
    await user.type(screen.getByLabelText("Heir address 1"), BOB);
    await user.click(screen.getByRole("button", { name: "Review" }));
    expect(await screen.findByText(/Check every line/)).toBeInTheDocument();

    const approve = await screen.findByRole("button", { name: /Approve exactly 402.96 fUSD/ });
    await waitFor(() => expect(approve).toBeEnabled());
    await user.click(approve);
    await waitFor(() => expect(signer.sent.map((s) => s.functionName)).toEqual(["approve"]));
    expect(signer.sent[0]?.args[1]).toBe(402_960_000n);
  });

  it("opens with the buffer cap and links to the control panel", async () => {
    go("#/open");
    const user = userEvent.setup();
    const signer = fakeSigner();
    renderUnlockable(<App />, withWrites(fakeClient(state({ allowance: 10n ** 18n }))), signer);
    await unlock(user);
    await user.type(screen.getByLabelText("Deposit"), "20");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Review" }));
    const open = await screen.findByRole("button", { name: "Open position" });
    await waitFor(() => expect(open).toBeEnabled());
    await user.click(open);
    await waitFor(() => expect(signer.sent.map((s) => s.functionName)).toEqual(["open"]));
    const sent = signer.sent[0]?.args[0] as { amount: bigint; beneficiary: string; bufferCap: bigint; heirs: unknown[] };
    expect(sent).toMatchObject({ amount: 20_000_000n, beneficiary: ALICE, bufferCap: 48_000n, heirs: [] });
    expect(await screen.findByRole("link", { name: "Open its control panel" })).toHaveAttribute("href", "#/position/3");
  });

  it("labels the accelerated vault where it is chosen", async () => {
    go("#/open?vault=demo");
    renderWith(<App />, fakeClient(state()));
    expect((await screen.findAllByText(/never a return/)).length).toBeGreaterThan(0);
  });

  it("explains the window when this site cannot reach the native API", async () => {
    go("#/open");
    const user = userEvent.setup();
    renderUnlockable(<App />, withWrites(fakeClient(state())), fakeSigner({ windowReachable: false }));
    await unlock(user);
    expect(await screen.findByText("This site cannot open the window")).toBeInTheDocument();
  });

  it("offers to open a window when none is open", async () => {
    go("#/open");
    const user = userEvent.setup();
    const signer = fakeSigner({ windowLive: false });
    renderUnlockable(<App />, withWrites(fakeClient(state())), signer);
    await unlock(user);
    await user.click(await screen.findByRole("button", { name: "Open a window for this vault" }));
    await waitFor(() => expect(signer.module.openWindow).toHaveBeenCalled());
  });

  it("quotes and swaps QOR for fUSD", async () => {
    go("#/open");
    const user = userEvent.setup();
    const signer = fakeSigner();
    renderUnlockable(<App />, withWrites(fakeClient(state())), signer);
    await unlock(user);
    await user.click(screen.getByText("Get fUSD with QOR"));
    await user.click(screen.getByRole("button", { name: "Get a quote" }));
    expect(await screen.findByText(/About 0.084983 fUSD; at least 0.082433 fUSD/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Swap" }));
    await waitFor(() => expect(signer.module.swapQorForFusd).toHaveBeenCalled());
    expect(await screen.findByText("Swapped.")).toBeInTheDocument();
  });

  it("blocks an account without a registered key", async () => {
    go("#/open");
    const user = userEvent.setup();
    renderUnlockable(<App />, withWrites(fakeClient(state({ keys: {} }))), fakeSigner());
    await unlock(user);
    expect(await screen.findByText("Register an ML-DSA-87 key first")).toBeInTheDocument();
  });
});
