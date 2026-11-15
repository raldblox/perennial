import { useState } from "react";
import type { Address } from "viem";
import type { ActionName } from "../chain/abi";
import { explainError } from "../chain/errors";
import { historyOf } from "../chain/events";
import {
  approve,
  distribute,
  harvest,
  prepareAction,
  sendSignedAction,
  topUp,
  triggerSuccession,
  type PreparedAction,
} from "../chain/write";
import { AccountPanel, useReadiness } from "../components/AccountPanel";
import { HeirsEditor } from "../components/HeirsEditor";
import { useWritesAllowed } from "../components/Layout";
import { SignDialog } from "../components/SignDialog";
import { TxStatus, useTx } from "../components/tx";
import { AddressText, Amount, Figure, Notice, Spinner, Status, TxLink } from "../components/ui";
import { actions as actionCopy, common, intervals as intervalCopy, phases, position as copy } from "../copy";
import { parseDecimal } from "../lib/decimal";
import { bpsToPercent, validateHeirs, type HeirDraft } from "../lib/heirs";
import { formatDuration, formatRelative, formatUtc, INTERVALS, payableNow, payoutsCovered, timeline, type Phase } from "../lib/schedule";
import { yieldOver } from "../lib/sizing";
import { useBalances, useChainNow, useClient, usePosition, useVaultEvents, useVaultInfo } from "../state/queries";
import { useSession } from "../state/session";

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

export function PositionPage({ id }: { id: bigint }) {
  const position = usePosition(id);
  const info = useVaultInfo();
  const now = useChainNow();
  const events = useVaultEvents();
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
    const missing = explained.detail?.startsWith("UnknownPosition");
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
  const decimals = info.data?.decimals ?? 6;
  const symbol = info.data?.symbol ?? "fUSD";
  const t = now.data ?? BigInt(Math.floor(Date.now() / 1000));
  const line = timeline(s, t, p.heirs.length);
  const payable = payableNow(s, p.pendingYield, t);
  const covered = payoutsCovered(s.buffer, s.payoutAmount);
  const expected = info.data?.rateBps ? yieldOver(s.principal, info.data.rateBps, s.payoutInterval) : null;
  const mine = (a: Address) => a === account?.evm || a === account?.nativeEvm;
  const history = events.data ? historyOf(events.data, id) : [];

  // Timeline bar: from last check-in to succession, with "now".
  const span = s.checkInPeriod + s.gracePeriod;
  const pct = (v: bigint) => (span === 0n ? 0 : Math.min(100, Math.max(0, Number(((v - s.lastCheckIn) * 10_000n) / span) / 100)));

  return (
    <div className="page">
      <section className="section" aria-labelledby="position-title">
        <div className="stack" style={{ marginBottom: "var(--space-6)" }}>
          <p className="label">{copy.status}</p>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
            <h1 id="position-title" style={{ fontSize: "var(--size-h2)" }}>
              {copy.label(id.toString())}
            </h1>
            <Status tone={PHASE_TONE[line.phase]}>{phases[line.phase].name}</Status>
          </div>
          <p className="muted">{phases[line.phase].detail}</p>
        </div>

        <div className="figures">
          <Figure label={copy.principal} note={copy.principalNote}>
            <Amount value={s.principal} decimals={decimals} unit={symbol} />
          </Figure>
          <Figure label={copy.buffer} note={copy.bufferNote}>
            <Amount value={s.buffer} decimals={decimals} unit={symbol} fraction={4} />
          </Figure>
          <Figure label={copy.pending} note={copy.pendingNote}>
            <Amount value={p.pendingYield} decimals={decimals} unit={symbol} fraction={4} />
          </Figure>
          <Figure label={copy.payableNow} note={line.periodsDue > 0n ? copy.due : `${copy.nextPayout} ${formatRelative(line.nextPayoutAt, t)}`}>
            <Amount value={payable} decimals={decimals} unit={symbol} fraction={4} />
          </Figure>
        </div>

        <div className="split" style={{ marginTop: "var(--space-7)" }}>
          <div className="stack-lg">
            <dl className="ledger">
              <div>
                <dt>{copy.payout}</dt>
                <dd>
                  {s.payoutAmount === 0n ? copy.payoutEverything : <Amount value={s.payoutAmount} decimals={decimals} unit={symbol} />} {copy.every}{" "}
                  {intervalName(s.payoutInterval)}
                </dd>
              </div>
              <div>
                <dt>{copy.nextPayout}</dt>
                <dd>
                  {line.periodsDue > 0n ? copy.due : formatRelative(line.nextPayoutAt, t)}
                  <br />
                  <span className="faint small">{formatUtc(line.nextPayoutAt)}</span>
                </dd>
              </div>
              <div>
                <dt>{copy.covered}</dt>
                <dd>{covered === null ? copy.coveredEverything : covered === 0n ? copy.coveredNone : covered.toString()}</dd>
              </div>
              {expected !== null ? (
                <div>
                  <dt>{copy.expectedYield}</dt>
                  <dd>
                    <Amount value={expected} decimals={decimals} unit={symbol} fraction={4} />
                    {s.payoutAmount > 0n ? (
                      <>
                        <br />
                        <span className="faint small">{expected >= s.payoutAmount ? copy.selfFunding : copy.drawingDown}</span>
                      </>
                    ) : null}
                  </dd>
                </div>
              ) : null}
            </dl>

            <div className="stack">
              <h2 className="label">{copy.status}</h2>
              <div className="track" aria-hidden="true">
                <div className="span-checkin" style={{ width: `${pct(line.checkInDueAt)}%` }} />
                <div className="span-grace" style={{ left: `${pct(line.checkInDueAt)}%`, width: `${100 - pct(line.checkInDueAt)}%` }} />
                {!s.succeeded && !s.closed ? <div className="now" style={{ left: `${pct(t)}%` }} /> : null}
              </div>
              <dl className="ledger small">
                <div>
                  <dt>{copy.lastCheckIn}</dt>
                  <dd>
                    {formatRelative(s.lastCheckIn, t)} <span className="faint">· {formatUtc(s.lastCheckIn)}</span>
                  </dd>
                </div>
                <div>
                  <dt>{copy.checkInDue}</dt>
                  <dd>
                    {formatRelative(line.checkInDueAt, t)} <span className="faint">· {formatUtc(line.checkInDueAt)}</span>
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

            <div className="stack">
              <h2 className="label">{copy.heirs}</h2>
              {p.heirs.length === 0 ? (
                <p className="muted">{copy.heirsNone}</p>
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

            <div className="stack">
              <h2 className="label">{copy.history}</h2>
              {events.isPending ? (
                <Spinner />
              ) : history.length === 0 ? (
                <p className="muted small">{copy.historyEmpty}</p>
              ) : (
                <div className="table-wrap">
                  <table>
                    <tbody>
                      {history.map((e) => (
                        <tr key={`${e.tx}-${e.kind}`}>
                          <td>{copy.events[e.kind]}</td>
                          <td className="num">
                            {"amount" in e ? <Amount value={e.amount} decimals={decimals} unit={symbol} fraction={4} /> : null}
                          </td>
                          <td className="num faint">#{e.block.toString()}</td>
                          <td className="num">
                            <TxLink hash={e.tx} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          <aside className="stack-lg">
            <Actions id={id} />
            {account ? <AccountPanel /> : null}
          </aside>
        </div>
      </section>
    </div>
  );
}

function Actions({ id }: { id: bigint }) {
  const position = usePosition(id);
  const info = useVaultInfo();
  const now = useChainNow();
  const client = useClient();
  const { account, signer } = useSession();
  const readiness = useReadiness();
  const writesAllowed = useWritesAllowed();
  const balances = useBalances(account?.evm);
  const tx = useTx();
  const [prepared, setPrepared] = useState<PreparedAction | null>(null);
  const [preparing, setPreparing] = useState<ActionName | null>(null);
  const [editingHeirs, setEditingHeirs] = useState(false);
  const [heirDrafts, setHeirDrafts] = useState<HeirDraft[]>([]);
  const [heirsTouched, setHeirsTouched] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState("");
  const [confirmTrigger, setConfirmTrigger] = useState(false);

  if (!position.data) return null;
  const s = position.data.state;
  const decimals = info.data?.decimals ?? 6;
  const t = now.data ?? BigInt(Math.floor(Date.now() / 1000));
  const line = timeline(s, t, position.data.heirs.length);
  const canAct = account !== null && signer !== null && readiness.ready && writesAllowed && !tx.busy;
  const canSign = (a: Address) => signer?.canSignFor(a) ?? false;

  const ctx = () => {
    if (!signer) throw new Error("locked");
    return { client, wallet: signer.walletClient() };
  };

  const startSigned = async (action: ActionName, signerAddress: Address, heirs?: { account: Address; bps: number }[]) => {
    setPreparing(action);
    try {
      setPrepared(await prepareAction(client, { id, action, signer: signerAddress, heirs }));
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
    }[ready.request.action];
    const hash = await tx.run(done, (onStep) => sendSignedAction({ ...ctx(), onStep }, ready, signer.signAction));
    if (hash && ready.request.action === "SetHeirs") setEditingHeirs(false);
  };

  // Why each action is unavailable, or null when it can be done.
  const closed = s.closed ? actionCopy.unavailable.closed : null;
  const locked = account ? null : actionCopy.unavailable.locked;
  const notBeneficiary = !canSign(s.beneficiary) ? actionCopy.unavailable.notRole("beneficiary") : null;
  const reasons = {
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
  const topUpParsed = parseDecimal(topUpAmount, decimals);
  const topUpValue = topUpParsed.ok ? topUpParsed.value : 0n;
  const topUpNeedsApproval = (balances.data?.allowance ?? 0n) < topUpValue;

  const actionRow = ({ name, label, hint, reason, onClick, danger, action }: { name: string; label: string; hint: string; reason: string | null; onClick: () => void; danger?: boolean; action?: ActionName }) => (
    <div key={name} className="stack" style={{ gap: "var(--space-2)", paddingBottom: "var(--space-4)", borderBottom: "1px solid var(--rule)" }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <button
          type="button"
          className={`button small ${danger ? "danger" : "quiet"}`}
          onClick={onClick}
          disabled={reason !== null || !canAct || preparing !== null}
          aria-describedby={`${name}-hint`}
        >
          {action !== undefined && preparing === action ? common.loading : label}
        </button>
      </div>
      <span id={`${name}-hint`} className="small faint">
        {reason ?? hint}
      </span>
    </div>
  );

  return (
    <section className="stack" aria-labelledby="actions-title">
      <h2 id="actions-title" className="label">
        {copy.actions}
      </h2>
      {!account ? <Notice tone="info">{copy.actionsLocked}</Notice> : null}
      <TxStatus state={tx.state} onDismiss={tx.reset} />

      {actionRow({ name: "harvest", label: actionCopy.harvest.label, hint: actionCopy.harvest.hint, reason: reasons.harvest, onClick: () => void tx.run(actionCopy.harvest.done, (onStep) => harvest({ ...ctx(), onStep }, id)) })}
      {actionRow({ name: "claim", label: actionCopy.claim.label, action: "Claim", hint: actionCopy.claim.hint, reason: reasons.claim, onClick: () => void startSigned("Claim", s.beneficiary) })}
      {actionRow({ name: "checkin", label: actionCopy.checkIn.label, action: "CheckIn", hint: actionCopy.checkIn.hint, reason: reasons.checkIn, onClick: () => void startSigned("CheckIn", s.beneficiary) })}

      {actionRow({ name: "heirs", label: actionCopy.setHeirs.label, hint: actionCopy.setHeirs.hint, reason: reasons.setHeirs, onClick: () => {
          setHeirDrafts(position.data.heirs.map((h) => ({ address: h.account, percent: bpsToPercent(h.bps) })));
          setHeirsTouched(false);
          setEditingHeirs((v) => !v);
        } })}
      {editingHeirs && reasons.setHeirs === null ? (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            setHeirsTouched(true);
            if (heirResult.heirs) void startSigned("SetHeirs", s.beneficiary, heirResult.heirs);
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

      {actionRow({ name: "trigger", label: confirmTrigger ? actionCopy.confirmTrigger : actionCopy.trigger.label, hint: actionCopy.trigger.hint, reason: reasons.trigger, danger: true, onClick: () => {
          if (!confirmTrigger) {
            setConfirmTrigger(true);
            return;
          }
          setConfirmTrigger(false);
          void tx.run(actionCopy.trigger.done, (onStep) => triggerSuccession({ ...ctx(), onStep }, id));
        } })}
      {actionRow({ name: "distribute", label: actionCopy.distribute.label, hint: actionCopy.distribute.hint, reason: reasons.distribute, onClick: () => void tx.run(actionCopy.distribute.done, (onStep) => distribute({ ...ctx(), onStep }, id)) })}
      {actionRow({ name: "close", label: actionCopy.close.label, action: "Close", hint: actionCopy.close.hint, reason: reasons.close, danger: true, onClick: () => void startSigned("Close", s.owner) })}

      {!s.closed ? (
        <form
          className="stack"
          style={{ gap: "var(--space-2)" }}
          onSubmit={(e) => {
            e.preventDefault();
            if (!topUpParsed.ok || topUpValue === 0n || !info.data) return;
            const asset = info.data.asset;
            if (topUpNeedsApproval) void tx.run(actionCopy.topUp.approved, (onStep) => approve({ ...ctx(), onStep }, asset, topUpValue));
            else void tx.run(actionCopy.topUp.done, (onStep) => topUp({ ...ctx(), onStep }, id, topUpValue));
          }}
        >
          <label htmlFor="topup" className="small">
            {copy.topUp}
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

      <SignDialog
        prepared={prepared}
        irreversible={prepared?.request.action === "Close"}
        onCancel={() => setPrepared(null)}
        onConfirm={() => void confirmSigned()}
      />
    </section>
  );
}
