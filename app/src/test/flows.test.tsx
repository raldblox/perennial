import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { App } from "../App";
import { ALICE, BOB, fakeClient, harvestedLog, NOW, openedLog, positionState, type FakeState } from "./fakeChain";
import { fakeSigner, renderUnlockable, renderWith, withWrites } from "./render";

function go(hash: string) {
  window.location.hash = hash;
}

const DAY = 86_400n;

function state(overrides: Partial<FakeState> = {}): FakeState {
  return {
    positions: {
      "1": { state: positionState({ heirs: undefined } as never), heirs: [{ account: BOB, bps: 10_000 }], pendingYield: 12_345n },
    },
    logs: [openedLog(1n, ALICE, ALICE, 110_400_000_000n), harvestedLog(1n, 21n)],
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
  it("shows the headline, the calculator and live figures from the vault", async () => {
    renderWith(<App />, fakeClient(state()));
    expect(screen.getByRole("heading", { level: 1, name: "Spend the income. Never the capital." })).toBeInTheDocument();
    expect(screen.getByTestId("calc-result")).toHaveTextContent("110,400");
    const figures = await screen.findByText("Positions opened");
    await waitFor(() => expect(figures.parentElement).toHaveTextContent("1"));
    await waitFor(() => expect(screen.getByText("Principal held").parentElement).toHaveTextContent("110,400.00 fUSD"));
    await waitFor(() => expect(screen.getByText("Yield harvested").parentElement).toHaveTextContent("0.000021 fUSD"));
  });

  it("recalculates as the payout changes, and inverts", async () => {
    const user = userEvent.setup();
    renderWith(<App />, fakeClient(state()));
    const payout = screen.getByLabelText("Payout");
    await user.clear(payout);
    await user.type(payout, "250");
    expect(screen.getByTestId("calc-result")).toHaveTextContent("69,000");
    await user.click(screen.getByRole("button", { name: "From principal to payout" }));
    expect(screen.getByLabelText("Principal")).toHaveValue("69000");
    expect(screen.getByTestId("calc-result")).toHaveTextContent("250");
  });

  it("says plainly when the vault cannot be read", async () => {
    renderWith(<App />, fakeClient(state({ failReads: true })));
    expect(await screen.findByText(/The vault could not be read/)).toBeInTheDocument();
  });

  it("refuses to write on the wrong chain", async () => {
    renderWith(<App />, fakeClient(state({ chainId: 1 })));
    expect(await screen.findByText(/not 9800/)).toBeInTheDocument();
  });
});

describe("position", () => {
  it("shows the numbers, the status and the heirs without an account", async () => {
    go("#/position/1");
    renderWith(<App />, fakeClient(state()));
    expect(await screen.findByRole("heading", { name: "Position 1" })).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Principal").parentElement).toHaveTextContent("110,400.00 fUSD");
    expect(screen.getByText("Pending yield").parentElement).toHaveTextContent("0.0123 fUSD");
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Claim" })).toBeDisabled();
    expect(screen.getByText(/Unlock an account to act/)).toBeInTheDocument();
  });

  it("reports a position that does not exist", async () => {
    go("#/position/9");
    renderWith(<App />, fakeClient(state()));
    expect(await screen.findByText("There is no position 9 in this vault.")).toBeInTheDocument();
  });

  it("opens succession once the deadline has passed", async () => {
    go("#/position/1");
    const late = positionState({ lastCheckIn: NOW - 121n * DAY, lastPayout: NOW - 121n * DAY });
    renderWith(<App />, fakeClient(state({ positions: { "1": { state: late, heirs: [{ account: BOB, bps: 10_000 }], pendingYield: 0n } } })));
    expect(await screen.findByText("Succession open")).toBeInTheDocument();
  });

  it("explains that a silent position without heirs cannot succeed", async () => {
    go("#/position/1");
    const late = positionState({ lastCheckIn: NOW - 121n * DAY });
    renderWith(<App />, fakeClient(state({ positions: { "1": { state: late, heirs: [], pendingYield: 0n } } })));
    expect(await screen.findByText("Silent, no heirs")).toBeInTheDocument();
  });

  it("signs a claim only after showing what will be signed", async () => {
    go("#/position/1");
    const user = userEvent.setup();
    const signer = fakeSigner();
    const due = positionState({ lastPayout: NOW - 2_628_000n - 10n });
    const client = withWrites(fakeClient(state({ positions: { "1": { state: due, heirs: [], pendingYield: 0n } } })));
    Object.assign(client, {
      readContract: ((original: (req: never) => Promise<unknown>) => (req: { functionName: string }) =>
        req.functionName === "actionMessage" ? Promise.resolve("0xfeedbeef") : original(req as never))(client.readContract.bind(client) as never),
    });
    renderUnlockable(<App />, client, signer);
    await screen.findByRole("heading", { name: "Position 1" });
    await unlock(user);
    const claim = screen.getByRole("button", { name: "Claim" });
    await waitFor(() => expect(claim).toBeEnabled());
    await user.click(claim);
    const dialog = await screen.findByRole("dialog", { name: "Sign this action" });
    expect(within(dialog).getByLabelText("Message")).toHaveValue("0xfeedbeef");
    expect(signer.module.signAction).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Sign and send" }));
    await waitFor(() => expect(signer.sent.map((s) => s.functionName)).toEqual(["claim"]));
    expect(signer.module.signAction).toHaveBeenCalledWith(ALICE, "0xfeedbeef");
    expect(await screen.findByText(/Confirmed\. Claimed\./)).toBeInTheDocument();
  });

  it("asks for confirmation before triggering succession", async () => {
    go("#/position/1");
    const user = userEvent.setup();
    const signer = fakeSigner();
    const late = positionState({ lastCheckIn: NOW - 121n * DAY });
    const client = withWrites(fakeClient(state({ positions: { "1": { state: late, heirs: [{ account: BOB, bps: 10_000 }], pendingYield: 0n } } })));
    renderUnlockable(<App />, client, signer);
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

describe("open a position", () => {
  it("validates, reviews, approves and opens", async () => {
    go("#/open");
    const user = userEvent.setup();
    const signer = fakeSigner();
    const client = withWrites(fakeClient(state()));
    renderUnlockable(<App />, client, signer);
    await unlock(user);

    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText("Enter a principal above zero, with at most 6 decimals.")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Principal"), "110400");
    await user.type(screen.getByLabelText("Payout per interval"), "400");
    expect(await screen.findByText(/this payout needs 110,400.00 fUSD/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Continue" }));

    await user.click(screen.getByRole("button", { name: "Add an heir" }));
    await user.type(screen.getByLabelText("Heir address 1"), BOB);
    await user.clear(screen.getByLabelText("Share"));
    await user.type(screen.getByLabelText("Share"), "60");
    await user.click(screen.getByRole("button", { name: "Review" }));
    expect(screen.getByText("The shares must total exactly 100%.")).toBeInTheDocument();
    await user.clear(screen.getByLabelText("Share"));
    await user.type(screen.getByLabelText("Share"), "100");
    await user.click(screen.getByRole("button", { name: "Review" }));

    expect(await screen.findByText(/Check every line/)).toBeInTheDocument();
    const approve = await screen.findByRole("button", { name: /Approve fUSD/ });
    await waitFor(() => expect(approve).toBeEnabled());
    await user.click(approve);
    await waitFor(() => expect(signer.sent.map((s) => s.functionName)).toEqual(["approve"]));
  });

  it("opens once the vault may take the principal, and links to the new position", async () => {
    go("#/open");
    const user = userEvent.setup();
    const signer = fakeSigner();
    renderUnlockable(<App />, withWrites(fakeClient(state({ allowance: 10n ** 18n }))), signer);
    await unlock(user);
    await user.type(screen.getByLabelText("Principal"), "1000");
    await user.click(screen.getByRole("radio", { name: /^Yes\./ }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Review" }));
    const open = await screen.findByRole("button", { name: "Open position" });
    await waitFor(() => expect(open).toBeEnabled());
    await user.click(open);
    await waitFor(() => expect(signer.sent.map((s) => s.functionName)).toEqual(["open"]));
    const sent = signer.sent[0]?.args[0] as { amount: bigint; beneficiary: string; ownerCanClose: boolean; heirs: unknown[] };
    expect(sent).toMatchObject({ amount: 1_000_000_000n, beneficiary: ALICE, ownerCanClose: true, heirs: [] });
    expect(await screen.findByRole("link", { name: "View the position" })).toHaveAttribute("href", "#/position/3");
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
    await user.click(await screen.findByRole("button", { name: "Open a window for Perennial" }));
    await waitFor(() => expect(signer.module.openWindow).toHaveBeenCalled());
  });

  it("blocks an account without a registered key", async () => {
    go("#/open");
    const user = userEvent.setup();
    renderUnlockable(<App />, withWrites(fakeClient(state({ keys: {} }))), fakeSigner());
    await unlock(user);
    expect(await screen.findByText("Register an ML-DSA-87 key first")).toBeInTheDocument();
  });
});
