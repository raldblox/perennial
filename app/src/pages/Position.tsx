import { useState } from "react";
import { getAddress, isAddress, keccak256, maxUint256, stringToHex, type Address } from "viem";
import type { ActionName } from "../chain/abi";
import { explainError } from "../chain/errors";
import { historyOf, type VaultEvent } from "../chain/events";
import { approve, distribute, fund, harvest, prepareAction, sendSignedAction, topUp, triggerSuccession, type PreparedAction, type SpendParams, type WriteContext } from "../chain/write";
import { AccountPanel, useReadiness } from "../components/AccountPanel";
import { HeirsEditor } from "../components/HeirsEditor";
import { useWritesAllowed } from "../components/Layout";
import { SignDialog } from "../components/SignDialog";
import { TxStatus, useTx } from "../components/tx";
import { AddressText, Amount, Figure, formatAmount, Notice, shortAddress, Spinner, Status, TxHash } from "../components/ui";
import { config, vaultById, type VaultConfig, type VaultId } from "../config";
import { actions as actionCopy, common, intervals as intervalCopy, panel as copy, phases, vaultNames } from "../copy";
import { parseDecimal } from "../lib/decimal";
import { bpsToPercent, validateHeirs, type HeirDraft } from "../lib/heirs";
import { lastsFor, yieldPerDay, yieldPerHour } from "../lib/inference";
import { formatDuration, formatRelative, formatUtc, INTERVALS, timeline, type Phase } from "../lib/schedule";
import { useBalances, useBlockClock, useChainNow, useClient, usePosition, useVaultEvents, useVaultInfo } from "../state/queries";
import { useSession } from "../state/session";

const DECIMALS = 6;
const DAY = 86_400n;

const PHASE_TONE: Record<Phase, "ok" | "warn" | "danger" | "neutral"> = {
  active: "ok",
  grace: "warn",
  "succession-open": "danger",
  stalled: "warn",
  succeeded: "neutral",
  closed: "neutral",
};

function intervalName(seconds: bigint): string {
  const match = INTERVALS.find((i) => i.seconds === seconds);
  return match ? intervalCopy[match.id].label : formatDuration(seconds);
}

/** Spending recorded in the last day, using the measured block time to date each log. */
export function lastDaySpending(
  events: readonly VaultEvent[],
  id: bigint,
  clock: { number: bigint; timestamp: bigint; secondsPer1000Blocks: bigint } | undefined,
): { amount: bigint; calls: number; perHour: bigint } | null {
  if (!clock) return null;
  let amount = 0n;
  let calls = 0;
  for (const e of events) {
    if (e.kind !== "Spent" || e.positionId !== id) continue;
    const age = ((clock.number - e.block) * clock.secondsPer1000Blocks) / 1_000n;
    if (age > DAY) continue;
    amount += e.amount;
    calls += 1;
  }
  return { amount, calls, perHour: amount / 24n };
}

/** Income paid in with `fund` over the last 30 days, as a daily average. */
export function recentIncomePerDay(
  events: readonly VaultEvent[],
  id: bigint,
  clock: { number: bigint; timestamp: bigint; secondsPer1000Blocks: bigint } | undefined,
): bigint | null {
  if (!clock) return null;
  let amount = 0n;
  for (const e of events) {
    if (e.kind !== "Funded" || e.positionId !== id) continue;
    const age = ((clock.number - e.block) * clock.secondsPer1000Blocks) / 1_000n;
    if (age <= 30n * DAY) amount += e.amount;
  }
  return amount / 30n;
}

export function PositionPage({ vaultId, id }: { vaultId: VaultId; id: bigint }) {
  const vault = vaultById(vaultId);
  const position = usePosition(vault, id);
  const info = useVaultInfo(vault);
  const now = useChainNow();
  const events = useVaultEvents(vault);
  const clock = useBlockClock();
  const { account } = useSession();

  if (position.isPending) {
    return (
      <div className="page section">
        <Spinner />
      </div>
    );
  }
  if (position.isError) {
    const explained = explainError(position.error);
    const missing = /UnknownPosition/.test(`${explained.detail ?? ""} ${String(position.error)}`);
    return (
      <div className="page section stack">
        <p className="label">{copy.label(id.toString())}</p>
        <Notice tone={missing ? "warn" : "danger"} title={missing ? copy.notFound(id.toString()) : explained.message}>
          {!missing ? (
            <button type="button" className="link-button" onClick={() => void position.refetch()}>
              {common.retry}
            </button>
          ) : null}
        </Notice>
      </div>
    );
  }

  const p = position.data;
  const s = p.state;
  const symbol = info.data?.symbol ?? "fUSD";
  const t = now.data ?? BigInt(Math.floor(Date.now() / 1000));
  const line = timeline(s, t, p.heirs.length);
  const history = events.data ? historyOf(events.data, id) : [];
  const spending = events.data ? lastDaySpending(events.data, id, clock.data) : null;
  const rateBps = info.data ? (info.data.rateBps ?? 0n) : null;
  const earnPerHour = rateBps !== null ? yieldPerHour(s.principal, rateBps) : null;
  const paidIn = events.data ? recentIncomePerDay(events.data, id, clock.data) : null;
  const incomePerDay = rateBps !== null && paidIn !== null ? yieldPerDay(s.principal, rateBps) + paidIn : null;
  const lasts =
    spending && incomePerDay !== null
      ? lastsFor({ spendPerDay: spending.amount, incomePerDay, buffer: s.buffer, principal: s.principal, budgetMode: s.budgetMode })
      : null;
  const mine = (a: Address) => a === account?.evm || a === account?.nativeEvm;
  const capped = s.bufferCap !== maxUint256;

  return (
    <div className="page">
      <section className="section" aria-labelledby="position-title">
        <div className="stack" style={{ marginBottom: "var(--space-6)" }}>
          <p className="label">
            {vaultNames[vault.id].name} · {vaultNames[vault.id].rate}
          </p>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
            <h1 id="position-title" style={{ fontSize: "var(--size-h2)" }}>
              {copy.label(id.toString())}
            </h1>
            <Status tone={PHASE_TONE[line.phase]}>{phases[line.phase].name}</Status>
          </div>
          <p className="muted">{phases[line.phase].detail}</p>
          {vault.source === "accelerated" ? <Notice tone="warn">{vaultNames.demo.note}</Notice> : null}
          {vault.source === "none" ? <Notice tone="info">{vaultNames.noyield.note}</Notice> : null}
        </div>

        <h2 className="label" style={{ marginBottom: "var(--space-3)" }}>
          {copy.health}
        </h2>
        <dl className="ledger" style={{ marginBottom: "var(--space-6)" }}>
          <div>
            <dt>{copy.lasts}</dt>
            <dd>
              {s.closed ? (
                actionCopy.unavailable.closed
              ) : lasts === null ? (
                <span className="skeleton">…</span>
              ) : (
                <>
                  {lasts.kind === "idle" ? copy.lastsIdle : lasts.kind === "covered" ? copy.lastsForever : copy.lastsDays(formatAmount(lasts.daysX100, 2, 2))}
                  <br />
                  <span className="small faint">
                    {copy.lastsNote} {copy.lastsReach(s.budgetMode ? copy.lastsReachBudget : copy.lastsReachBuffer)}
                  </span>
                </>
              )}
            </dd>
          </div>
          <div>
            <dt>{copy.income}</dt>
            <dd>{incomePerDay === null ? <span className="skeleton">…</span> : copy.incomeValue(`${formatAmount(incomePerDay, DECIMALS, 6)} ${symbol}`)}</dd>
          </div>
          <div>
            <dt>{copy.budget}</dt>
            <dd>{s.budgetMode ? copy.budgetOn(`${formatAmount(p.budgetRemaining, DECIMALS, 6)} ${symbol}`) : copy.budgetOff}</dd>
          </div>
          <div>
            <dt>{copy.earning}</dt>
            <dd>
              {s.closed ? (
                actionCopy.unavailable.closed
              ) : earnPerHour !== null && spending ? (
                <>
                  {copy.earningValue(`${formatAmount(earnPerHour, DECIMALS, 6)} ${symbol}`, `${formatAmount(spending.perHour, DECIMALS, 6)} ${symbol}`)}
                  <br />
                  <span className="small faint">{spending.perHour <= earnPerHour ? copy.sustainable : copy.drawing}</span>
                </>
              ) : (
                <span className="skeleton">…</span>
              )}
            </dd>
          </div>
          <div>
            <dt>{copy.deadline}</dt>
            <dd>
              {s.closed || s.succeeded ? phases[line.phase].name : formatRelative(line.checkInDueAt, t)}
              <br />
              <span className="small faint">{formatUtc(line.checkInDueAt)}</span>
            </dd>
          </div>
        </dl>

        <div className="figures">
          <Figure label={copy.principal} note={copy.principalNote}>
            <Amount value={s.principal} decimals={DECIMALS} unit={symbol} />
          </Figure>
          <Figure label={copy.buffer} note={capped ? copy.bufferNote(`${formatAmount(s.bufferCap, DECIMALS, 6)} ${symbol}`) : copy.bufferNoCap}>
            <Amount value={s.buffer} decimals={DECIMALS} unit={symbol} fraction={6} />
          </Figure>
          <Figure label={copy.pending} note={copy.pendingNote}>
            <Amount value={p.pendingYield} decimals={DECIMALS} unit={symbol} fraction={6} />
          </Figure>
          <Figure label={copy.spentDay} note={spending ? copy.callsNote(spending.calls.toString()) : undefined}>
            {spending ? <Amount value={spending.amount} decimals={DECIMALS} unit={symbol} fraction={6} /> : <span className="skeleton">0000</span>}
          </Figure>
        </div>
        {capped ? (
          <p className="small muted" style={{ marginTop: "var(--space-3)" }}>
            {copy.compoundingRule}
          </p>
        ) : null}

        <div className="split" style={{ marginTop: "var(--space-7)" }}>
          <div className="stack-lg">
            <div className="stack">
              <h2 className="label">{copy.ledger}</h2>
              <p className="small muted">{copy.ledgerIntro}</p>
              {events.isPending ? (
                <Spinner />
              ) : history.length === 0 ? (
                <p className="muted small">{copy.ledgerEmpty}</p>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">{copy.columns.what}</th>
                        <th scope="col" className="num">
                          {copy.columns.amount}
                        </th>
                        <th scope="col">{copy.columns.to}</th>
                        <th scope="col">{copy.columns.ref}</th>
                        <th scope="col" className="num">
                          {copy.columns.block}
                        </th>
                        <th scope="col">{copy.columns.tx}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((e) => (
                        <tr key={`${e.tx}-${e.logIndex.toString()}`}>
                          <td>{copy.events[e.kind]}</td>
                          <td className="num">{"amount" in e ? <Amount value={e.amount} decimals={DECIMALS} fraction={6} /> : null}</td>
                          <td className="mono">{"to" in e ? shortAddress(e.to) : null}</td>
                          <td className="mono">{"ref" in e ? <span title={e.ref}>{shortAddress(e.ref)}</span> : null}</td>
                          <td className="num faint">{e.block.toString()}</td>
                          <td>
                            <TxHash hash={e.tx} short />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="stack">
              <h2 className="label">{copy.schedule}</h2>
              <dl className="ledger small">
                <div>
                  <dt>{copy.payout}</dt>
                  <dd>
                    {s.payoutAmount === 0n ? copy.payoutEverything : <Amount value={s.payoutAmount} decimals={DECIMALS} unit={symbol} />} {copy.every} {intervalName(s.payoutInterval)}
                  </dd>
                </div>
                <div>
                  <dt>{copy.nextPayout}</dt>
                  <dd>{s.closed ? actionCopy.unavailable.closed : line.periodsDue > 0n ? copy.due : formatRelative(line.nextPayoutAt, t)}</dd>
                </div>
                <div>
                  <dt>{copy.lastCheckIn}</dt>
                  <dd>
                    {formatRelative(s.lastCheckIn, t)} <span className="faint">· {formatUtc(s.lastCheckIn)}</span>
                  </dd>
                </div>
                <div>
                  <dt>{copy.successionAt}</dt>
                  <dd>
                    {formatRelative(line.successionAt, t)} <span className="faint">· {formatUtc(line.successionAt)}</span>
                  </dd>
                </div>
              </dl>
            </div>

            <div className="stack">
              <h2 className="label">{copy.roles}</h2>
              <dl className="ledger small">
                <div>
                  <dt>{copy.owner}</dt>
                  <dd>
                    <AddressText address={s.owner} you={mine(s.owner)} />
                  </dd>
                </div>
                <div>
                  <dt>{copy.beneficiary}</dt>
                  <dd>
                    <AddressText address={s.beneficiary} you={mine(s.beneficiary)} />
                  </dd>
                </div>
                <div>
                  <dt>{copy.closable}</dt>
                  <dd>{s.ownerCanClose ? copy.closableYes : copy.closableNo}</dd>
                </div>
                <div>
                  <dt>{copy.nonce}</dt>
                  <dd className="num">{s.nonce.toString()}</dd>
                </div>
              </dl>
              <h3 className="label">{copy.heirs}</h3>
              {p.heirs.length === 0 ? (
                <p className="muted small">{copy.heirsNone}</p>
              ) : (
                <dl className="ledger small">
                  {p.heirs.map((h) => (
                    <div key={h.account}>
                      <dt>
                        <AddressText address={h.account} you={mine(h.account)} />
                      </dt>
                      <dd className="num">{bpsToPercent(h.bps)}%</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          </div>

          <aside className="stack-lg">
            <Controls vault={vault} id={id} />
            {account ? <AccountPanel vault={vault} /> : null}
          </aside>
        </div>
      </section>
    </div>
  );
}

function Controls({ vault, id }: { vault: VaultConfig; id: bigint }) {
  const position = usePosition(vault, id);
  const now = useChainNow();
  const client = useClient();
  const { account, signer } = useSession();
  const readiness = useReadiness(vault);
  const writesAllowed = useWritesAllowed(vault);
  const balances = useBalances(account?.evm, vault);
  const tx = useTx();
  const [prepared, setPrepared] = useState<PreparedAction | null>(null);
  const [preparing, setPreparing] = useState<ActionName | null>(null);
  const [editingHeirs, setEditingHeirs] = useState(false);
  const [heirDrafts, setHeirDrafts] = useState<HeirDraft[]>([]);
  const [heirsTouched, setHeirsTouched] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState("");
  const [fundAmount, setFundAmount] = useState("");
  const [confirmTrigger, setConfirmTrigger] = useState(false);
  const [spendTo, setSpendTo] = useState("");
  const [spendAmount, setSpendAmount] = useState("0.002");
  const [spendRef, setSpendRef] = useState("");

  if (!position.data) return null;

  const s = position.data.state;
  const t = now.data ?? BigInt(Math.floor(Date.now() / 1000));
  const line = timeline(s, t, position.data.heirs.length);
  const canAct = account !== null && signer !== null && readiness.ready && writesAllowed && !tx.busy;
  const canSign = (a: Address) => signer?.canSignFor(a) ?? false;

  const ctx = (onStep: WriteContext["onStep"]): WriteContext => {
    if (!signer) throw new Error("locked");
    return { client, wallet: signer.walletClient(), vault: vault.address, onStep };
  };

  const startSigned = async (action: ActionName, signerAddress: Address, extra: { heirs?: { account: Address; bps: number }[]; spend?: SpendParams } = {}) => {
    setPreparing(action);
    try {
      setPrepared(await prepareAction(client, vault.address, { id, action, signer: signerAddress, ...extra }));
    } catch (error) {
      await tx.run("", () => Promise.reject(error instanceof Error ? error : new Error(String(error))));
    } finally {
      setPreparing(null);
    }
  };

  const confirmSigned = async () => {
    const ready = prepared;
    setPrepared(null);
    if (!ready || !signer) return;
    const done = {
      CheckIn: actionCopy.checkIn.done,
      Claim: actionCopy.claim.done,
      SetHeirs: actionCopy.setHeirs.done,
      Close: actionCopy.close.done,
      Spend: actionCopy.spend.done,
    }[ready.request.action];
    const hash = await tx.run(done, (onStep) => sendSignedAction(ctx(onStep), ready, signer.signAction));
    if (hash && ready.request.action === "SetHeirs") setEditingHeirs(false);
  };

  const closed = s.closed ? actionCopy.unavailable.closed : null;
  const locked = account ? null : actionCopy.unavailable.locked;
  const notBeneficiary = !canSign(s.beneficiary) ? actionCopy.unavailable.notRole("beneficiary") : null;
  const reasons = {
    spend: closed ?? (s.succeeded ? actionCopy.unavailable.succeeded : null) ?? locked ?? notBeneficiary,
    harvest: closed ?? locked,
    claim: closed ?? (s.succeeded ? actionCopy.unavailable.succeeded : null) ?? (line.periodsDue === 0n ? actionCopy.unavailable.notDue : null) ?? locked ?? notBeneficiary,
    checkIn: closed ?? (s.succeeded ? actionCopy.unavailable.succeeded : null) ?? locked ?? notBeneficiary,
    setHeirs: closed ?? (s.succeeded ? actionCopy.unavailable.succeeded : null) ?? locked ?? notBeneficiary,
    trigger:
      closed ??
      (s.succeeded ? actionCopy.unavailable.succeeded : null) ??
      (line.phase === "stalled" ? actionCopy.unavailable.noHeirs : null) ??
      (line.phase !== "succession-open" ? actionCopy.unavailable.notOpen : null) ??
      locked,
    distribute: closed ?? (!s.succeeded ? actionCopy.unavailable.notSucceeded : null) ?? (line.periodsDue === 0n ? actionCopy.unavailable.notDue : null) ?? locked,
    close: closed ?? (!s.ownerCanClose ? actionCopy.unavailable.notClosable : null) ?? locked ?? (!canSign(s.owner) ? actionCopy.unavailable.notRole("owner") : null),
  };

  const heirResult = validateHeirs(heirDrafts);
  const topUpParsed = parseDecimal(topUpAmount, DECIMALS);
  const topUpValue = topUpParsed.ok ? topUpParsed.value : 0n;
  const topUpNeedsApproval = (balances.data?.allowance ?? 0n) < topUpValue;
  const fundParsed = parseDecimal(fundAmount, DECIMALS);
  const fundValue = fundParsed.ok ? fundParsed.value : 0n;
  const fundNeedsApproval = (balances.data?.allowance ?? 0n) < fundValue;
  const spendParsed = parseDecimal(spendAmount, DECIMALS);
  const spendValid = isAddress(spendTo.trim(), { strict: false }) && spendParsed.ok && spendParsed.value > 0n;

  const actionRow = ({
    name,
    label,
    hint,
    reason,
    onClick,
    danger,
    action,
  }: {
    name: string;
    label: string;
    hint: string;
    reason: string | null;
    onClick: () => void;
    danger?: boolean;
    action?: ActionName;
  }) => (
    <div key={name} className="stack" style={{ gap: "var(--space-2)", paddingBottom: "var(--space-4)", borderBottom: "1px solid var(--rule)" }}>
      <div className="row">
        <button type="button" className={`button small ${danger ? "danger" : "quiet"}`} onClick={onClick} disabled={reason !== null || !canAct || preparing !== null} aria-describedby={`${name}-hint`}>
          {action !== undefined && preparing === action ? common.loading : label}
        </button>
      </div>
      <span id={`${name}-hint`} className="small faint">
        {reason ?? hint}
      </span>
    </div>
  );

  return (
    <section className="stack" aria-labelledby="controls-title">
      <h2 id="controls-title" className="label">
        {copy.controls}
      </h2>
      {!account ? <Notice tone="info">{copy.controlsLocked}</Notice> : null}
      <TxStatus state={tx.state} onDismiss={tx.reset} />

      <form
        className="stack"
        style={{ gap: "var(--space-2)", paddingBottom: "var(--space-4)", borderBottom: "1px solid var(--rule)" }}
        onSubmit={(e) => {
          e.preventDefault();
          if (!spendValid) return;
          const ref = keccak256(stringToHex(spendRef.trim() === "" ? `perennial ${Date.now().toString()}` : spendRef.trim()));
          void startSigned("Spend", s.beneficiary, { spend: { to: getAddress(spendTo.trim()), amount: spendParsed.value, ref } });
        }}
      >
        <strong style={{ fontWeight: 600 }}>{copy.spend}</strong>
        <span className="small faint">{reasons.spend ?? copy.spendHint}</span>
        <label htmlFor="spend-to" className="small">
          {copy.spendTo}
        </label>
        <input id="spend-to" className="mono" value={spendTo} placeholder="0x…" spellCheck={false} autoComplete="off" onChange={(e) => setSpendTo(e.target.value)} />
        <div className="split even" style={{ gap: "var(--space-3)" }}>
          <div className="field">
            <label htmlFor="spend-amount" className="small">
              {copy.spendAmount}
            </label>
            <input id="spend-amount" inputMode="decimal" value={spendAmount} onChange={(e) => setSpendAmount(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="spend-ref" className="small">
              {copy.spendRef}
            </label>
            <input id="spend-ref" value={spendRef} onChange={(e) => setSpendRef(e.target.value)} aria-describedby="spend-ref-hint" />
          </div>
        </div>
        <span id="spend-ref-hint" className="small faint">
          {copy.spendRefHint}
        </span>
        <span>
          <button type="submit" className="button small primary" disabled={reasons.spend !== null || !canAct || !spendValid || preparing !== null}>
            {preparing === "Spend" ? common.loading : actionCopy.spend.label}
          </button>
        </span>
      </form>

      {!s.closed ? (
        <form
          className="stack"
          style={{ gap: "var(--space-2)", paddingBottom: "var(--space-4)", borderBottom: "1px solid var(--rule)" }}
          onSubmit={(e) => {
            e.preventDefault();
            if (!topUpParsed.ok || topUpValue === 0n) return;
            if (topUpNeedsApproval) void tx.run(actionCopy.topUp.approved, (onStep) => approve(ctx(onStep), config.asset, topUpValue));
            else void tx.run(actionCopy.topUp.done, (onStep) => topUp(ctx(onStep), id, topUpValue));
          }}
        >
          <label htmlFor="topup">
            <strong style={{ fontWeight: 600 }}>{copy.topUp}</strong>
          </label>
          <div className="input-suffix">
            <input id="topup" inputMode="decimal" value={topUpAmount} onChange={(e) => setTopUpAmount(e.target.value)} aria-describedby="topup-hint" />
            <button type="submit" className="button small quiet" disabled={!canAct || !topUpParsed.ok || topUpValue === 0n}>
              {topUpNeedsApproval ? actionCopy.topUp.approve : actionCopy.topUp.label}
            </button>
          </div>
          <span id="topup-hint" className="small faint">
            {copy.topUpHint}
          </span>
        </form>
      ) : null}

      {!s.closed ? (
        <form
          className="stack"
          style={{ gap: "var(--space-2)", paddingBottom: "var(--space-4)", borderBottom: "1px solid var(--rule)" }}
          onSubmit={(e) => {
            e.preventDefault();
            if (!fundParsed.ok || fundValue === 0n) return;
            if (fundNeedsApproval) void tx.run(actionCopy.fund.approved, (onStep) => approve(ctx(onStep), config.asset, fundValue));
            else void tx.run(actionCopy.fund.done, (onStep) => fund(ctx(onStep), id, fundValue));
          }}
        >
          <label htmlFor="fund">
            <strong style={{ fontWeight: 600 }}>{copy.fund}</strong>
          </label>
          <div className="input-suffix">
            <input id="fund" inputMode="decimal" value={fundAmount} onChange={(e) => setFundAmount(e.target.value)} aria-describedby="fund-hint" />
            <button type="submit" className="button small quiet" disabled={!canAct || !fundParsed.ok || fundValue === 0n}>
              {fundNeedsApproval ? actionCopy.fund.approve : actionCopy.fund.label}
            </button>
          </div>
          <span id="fund-hint" className="small faint">
            {copy.fundHint}
          </span>
        </form>
      ) : null}

      {actionRow({ name: "claim", label: actionCopy.claim.label, action: "Claim", hint: actionCopy.claim.hint, reason: reasons.claim, onClick: () => void startSigned("Claim", s.beneficiary) })}
      {actionRow({
        name: "heirs",
        label: actionCopy.setHeirs.label,
        hint: actionCopy.setHeirs.hint,
        reason: reasons.setHeirs,
        onClick: () => {
          setHeirDrafts(position.data.heirs.map((h) => ({ address: h.account, percent: bpsToPercent(h.bps) })));
          setHeirsTouched(false);
          setEditingHeirs((v) => !v);
        },
      })}
      {editingHeirs && reasons.setHeirs === null ? (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            setHeirsTouched(true);
            if (heirResult.heirs) void startSigned("SetHeirs", s.beneficiary, { heirs: heirResult.heirs });
          }}
        >
          <HeirsEditor drafts={heirDrafts} onChange={setHeirDrafts} showErrors={heirsTouched} />
          <div className="row">
            <button type="submit" className="button small primary" disabled={!canAct}>
              {actionCopy.setHeirs.label}
            </button>
            <button type="button" className="button small quiet" onClick={() => setEditingHeirs(false)}>
              {common.cancel}
            </button>
          </div>
        </form>
      ) : null}
      {actionRow({ name: "close", label: actionCopy.close.label, action: "Close", hint: actionCopy.close.hint, reason: reasons.close, danger: true, onClick: () => void startSigned("Close", s.owner) })}
      {actionRow({ name: "checkin", label: actionCopy.checkIn.label, action: "CheckIn", hint: actionCopy.checkIn.hint, reason: reasons.checkIn, onClick: () => void startSigned("CheckIn", s.beneficiary) })}
      {actionRow({ name: "harvest", label: actionCopy.harvest.label, hint: actionCopy.harvest.hint, reason: reasons.harvest, onClick: () => void tx.run(actionCopy.harvest.done, (onStep) => harvest(ctx(onStep), id)) })}
      {actionRow({
        name: "trigger",
        label: confirmTrigger ? actionCopy.confirmTrigger : actionCopy.trigger.label,
        hint: actionCopy.trigger.hint,
        reason: reasons.trigger,
        danger: true,
        onClick: () => {
          if (!confirmTrigger) {
            setConfirmTrigger(true);
            return;
          }
          setConfirmTrigger(false);
          void tx.run(actionCopy.trigger.done, (onStep) => triggerSuccession(ctx(onStep), id));
        },
      })}
      {actionRow({ name: "distribute", label: actionCopy.distribute.label, hint: actionCopy.distribute.hint, reason: reasons.distribute, onClick: () => void tx.run(actionCopy.distribute.done, (onStep) => distribute(ctx(onStep), id)) })}

      <SignDialog prepared={prepared} irreversible={prepared?.request.action === "Close"} onCancel={() => setPrepared(null)} onConfirm={() => void confirmSigned()} />
    </section>
  );
}
