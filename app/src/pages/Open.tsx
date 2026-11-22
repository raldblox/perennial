import { useEffect, useMemo, useState, type FormEvent } from "react";
import { decodeEventLog, isAddress, maxUint256, type Hash } from "viem";
import { vaultAbi } from "../chain/abi";
import { approve, openPosition, type WriteContext } from "../chain/write";
import { AccountPanel, useReadiness } from "../components/AccountPanel";
import { HandleHint, pinSeen, useRecipient, useResolvedHeirs } from "../components/Handle";
import { HeirsEditor } from "../components/HeirsEditor";
import { useWritesAllowed } from "../components/Layout";
import { TxStatus, useTx } from "../components/tx";
import { UnlockDialog } from "../components/UnlockDialog";
import { AddressText, Amount, formatAmount, Notice } from "../components/ui";
import { config, vaultById, type VaultId } from "../config";
import { account as accountCopy, common, fund as copy, heirErrors, intervals as intervalCopy, vaultNames } from "../copy";
import { formatDecimal, parseDecimal } from "../lib/decimal";
import { bpsToPercent, validateHeirs, type HeirDraft } from "../lib/heirs";
import { callsPerHourFor, dayOfCalls, depositForCalls, formatCalls } from "../lib/inference";
import { validateTerms, type TermsDraft } from "../lib/openForm";
import { formatDuration, INTERVALS, type IntervalId } from "../lib/schedule";
import { DEFAULT_RATE_BPS } from "../lib/sizing";
import { href, navigate } from "../router";
import { useBalances, useClient, useKeyStatus, useVaultInfo } from "../state/queries";
import { useSession } from "../state/session";

type Step = 0 | 1 | 2;
const DECIMALS = 6;

/** Calls and price passed from the overview's calculator, if any. */
function prefill(): { calls: string; price: string } {
  const query = new URLSearchParams(window.location.hash.split("?")[1] ?? "");
  return { calls: query.get("calls") ?? "1", price: query.get("price") ?? "0.002" };
}

export function Open({ vaultId }: { vaultId: VaultId }) {
  const vault = vaultById(vaultId);
  const { account, signer } = useSession();
  const client = useClient();
  const info = useVaultInfo(vault);
  const balances = useBalances(account?.evm, vault);
  const readiness = useReadiness(vault);
  const writesAllowed = useWritesAllowed(vault);
  const symbol = info.data?.symbol ?? "fUSD";
  const rateBps = info.data?.rateBps ?? DEFAULT_RATE_BPS;

  const initial = useMemo(prefill, []);
  const [step, setStep] = useState<Step>(0);
  const [touched, setTouched] = useState(false);
  const [heirsTouched, setHeirsTouched] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [openedId, setOpenedId] = useState<bigint | null>(null);
  const [calls, setCalls] = useState(initial.calls);
  const [price, setPrice] = useState(initial.price);
  const [cap, setCap] = useState("");
  const [draft, setDraft] = useState<TermsDraft>({
    amount: "",
    beneficiary: "",
    payout: "",
    interval: "monthly",
    checkInDays: "30",
    graceDays: "7",
    ownerCanClose: false,
    budgetMode: false,
  });
  const [heirs, setHeirs] = useState<HeirDraft[]>([]);
  const approveTx = useTx();
  const openTx = useTx();

  const recipient = useRecipient(draft.beneficiary);
  const beneficiary = recipient.address.trim() || (draft.beneficiary.trim() === "" ? (account?.evm ?? "") : "");
  const beneficiaryValid = isAddress(beneficiary, { strict: false });
  const beneficiaryKey = useKeyStatus(beneficiaryValid ? beneficiary : undefined);
  const ownerKey = useKeyStatus(account?.evm);

  const callsParsed = parseDecimal(calls, 2);
  const priceParsed = parseDecimal(price, DECIMALS);
  const usage = callsParsed.ok && priceParsed.ok && callsParsed.value > 0n && priceParsed.value > 0n ? { calls: callsParsed.value, price: priceParsed.value } : null;
  // A source that pays nothing cannot size a deposit from its yield.
  const earns = rateBps > 0n;
  const suggested = usage && earns ? depositForCalls(usage.calls, usage.price, rateBps) : null;
  const dayCap = usage ? dayOfCalls(usage.calls, usage.price) : null;

  // Start the cap at a day of the chosen calls until the user sets it.
  useEffect(() => {
    if (cap === "" && dayCap !== null) setCap(formatDecimal(dayCap, DECIMALS, { grouping: false }));
  }, [cap, dayCap]);

  const { terms, errors } = validateTerms(
    { ...draft, beneficiary },
    {
      decimals: DECIMALS,
      balance: balances.data?.token,
      beneficiaryKeyUsable: beneficiaryKey.data?.usable,
      ownerKeyUsable: account ? ownerKey.data?.usable : undefined,
    },
  );
  const capParsed = cap.trim() === "never" ? ({ ok: true, value: maxUint256 } as const) : parseDecimal(cap, DECIMALS);
  const capError = !capParsed.ok;
  const resolvedHeirs = useResolvedHeirs(heirs);
  const heirResult = validateHeirs(resolvedHeirs.drafts);
  const paysCalls = terms && usage && earns ? callsPerHourFor(terms.amount, usage.price, rateBps) : null;

  const set = (patch: Partial<TermsDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const allowance = balances.data?.allowance ?? 0n;
  const needsApproval = terms !== null && allowance < terms.amount;

  const submitTerms = (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (terms && !capError) {
      pinSeen([recipient.resolved]);
      setStep(1);
    }
  };

  const submitHeirs = (event: FormEvent) => {
    event.preventDefault();
    setHeirsTouched(true);
    if (heirResult.heirs) {
      pinSeen(resolvedHeirs.resolved);
      setStep(2);
    }
  };

  const ctx = (onStep: WriteContext["onStep"]): WriteContext => {
    if (!signer) throw new Error("locked");
    return { client, wallet: signer.walletClient(), vault: vault.address, onStep };
  };

  const doApprove = async () => {
    if (!terms) return;
    await approveTx.run(copy.approve, (onStep) => approve(ctx(onStep), config.asset, terms.amount));
  };

  const openedPositionId = async (hash: Hash): Promise<bigint | null> => {
    const receipt = await client.getTransactionReceipt({ hash });
    for (const log of receipt.logs) {
      try {
        const event = decodeEventLog({ abi: vaultAbi, data: log.data, topics: log.topics });
        if (event.eventName === "Opened") return event.args.positionId;
      } catch {
        // another contract's log
      }
    }
    return null;
  };

  const doOpen = async () => {
    if (!terms || !heirResult.heirs || !capParsed.ok) return;
    const params = { ...terms, heirs: heirResult.heirs, bufferCap: capParsed.value };
    const hash = await openTx.run(copy.submit, (onStep) => openPosition(ctx(onStep), params));
    if (hash) setOpenedId(await openedPositionId(hash));
  };

  const fieldError = (name: keyof typeof copy.errors) => (touched && (name === "cap" ? capError : errors[name]) ? copy.errors[name] : null);
  const vaultNote = vault.source === "accelerated" ? vaultNames.demo.note : vault.source === "none" ? vaultNames.noyield.note : copy.vaultHint;

  return (
    <div className="page">
      <section className="section" aria-labelledby="open-title">
        <div className="section-head">
          <p className="label">{copy.label}</p>
          <h1 id="open-title" style={{ fontSize: "var(--size-h2)" }}>
            {copy.title}
          </h1>
          <p className="lede">{copy.intro}</p>
          <ol className="steps" aria-label="Progress">
            {copy.steps.map((name, i) => (
              <li key={name} aria-current={i === step ? "step" : undefined}>
                {name}
              </li>
            ))}
          </ol>
        </div>

        <div className="split aside">
          <div className="stack-lg">
            {openedId !== null || openTx.state.status === "success" ? (
              <Notice tone="ok" title={openedId !== null ? copy.opened(openedId.toString()) : common.loading}>
                {openedId !== null ? <a href={href({ name: "position", vault: vault.id, id: openedId })}>{copy.view}</a> : null}
              </Notice>
            ) : null}

            {step === 0 ? (
              <form className="stack-lg" onSubmit={submitTerms} noValidate>
                <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
                  <legend>{copy.vault}</legend>
                  {config.vaults.map((v) => (
                    <label key={v.id} className="check">
                      <input type="radio" name="vault" checked={v.id === vault.id} onChange={() => navigate({ name: "open", vault: v.id })} />
                      <span>
                        <strong style={{ fontWeight: 600 }}>{vaultNames[v.id].name}</strong> <span className="muted">· {vaultNames[v.id].rate}</span>
                      </span>
                    </label>
                  ))}
                  <span className="hint">{vaultNote}</span>
                </fieldset>

                <div className="field">
                  <label htmlFor="beneficiary">{copy.agent}</label>
                  <input
                    id="beneficiary"
                    className="mono"
                    value={draft.beneficiary}
                    placeholder={account?.evm ?? "0x…"}
                    autoComplete="off"
                    spellCheck={false}
                    onChange={(e) => set({ beneficiary: e.target.value })}
                    aria-invalid={fieldError("beneficiary") || fieldError("beneficiaryKey") ? true : undefined}
                    aria-describedby="beneficiary-hint beneficiary-error"
                  />
                  <span id="beneficiary-hint" className="hint">
                    {copy.agentHint}
                  </span>
                  <HandleHint input={draft.beneficiary} />
                  {account ? (
                    <span className="row small">
                      <button type="button" className="link-button" onClick={() => set({ beneficiary: account.evm })}>
                        {copy.agentUseEvm}
                      </button>
                      <button type="button" className="link-button" onClick={() => set({ beneficiary: account.nativeEvm })}>
                        {copy.agentUseNative}
                      </button>
                    </span>
                  ) : null}
                  <span id="beneficiary-error" className="error">
                    {fieldError("beneficiary") ?? (beneficiaryKey.data && !beneficiaryKey.data.usable ? copy.errors.beneficiaryKey : null)}
                  </span>
                </div>

                <div className="split even" style={{ gap: "var(--space-4)" }}>
                  <div className="field">
                    <label htmlFor="calls">{copy.callsPerHour}</label>
                    <input id="calls" inputMode="decimal" value={calls} onChange={(e) => setCalls(e.target.value)} />
                  </div>
                  <div className="field">
                    <label htmlFor="price">{copy.price}</label>
                    <div className="input-suffix">
                      <input id="price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
                      <span className="small faint">{symbol}</span>
                    </div>
                  </div>
                </div>
                {suggested !== null ? (
                  <Notice tone="info">
                    <span className="stack" style={{ gap: "var(--space-2)" }}>
                      <span>{copy.suggested(formatAmount(suggested, DECIMALS))}</span>
                      <span>
                        <button type="button" className="button small quiet" onClick={() => set({ amount: formatDecimal(suggested, DECIMALS, { grouping: false }) })}>
                          {copy.useSuggested}
                        </button>
                      </span>
                    </span>
                  </Notice>
                ) : null}

                <div className="field">
                  <label htmlFor="amount">{copy.amount}</label>
                  <div className="input-suffix">
                    <input
                      id="amount"
                      inputMode="decimal"
                      value={draft.amount}
                      onChange={(e) => set({ amount: e.target.value })}
                      aria-invalid={fieldError("amount") || fieldError("balance") ? true : undefined}
                      aria-describedby="amount-hint amount-error"
                    />
                    <span className="small faint">{symbol}</span>
                  </div>
                  <span id="amount-hint" className="hint">
                    {copy.amountHint}
                    {balances.data ? (
                      <>
                        {" "}
                        {copy.balance}: <Amount value={balances.data.token} decimals={DECIMALS} unit={symbol} />{" "}
                        <button type="button" className="link-button" onClick={() => set({ amount: formatDecimal(balances.data.token, DECIMALS, { grouping: false }) })}>
                          {copy.useMax}
                        </button>
                      </>
                    ) : null}
                  </span>
                  {paysCalls !== null ? <span className="small">{copy.pays(formatCalls(paysCalls), formatCalls(paysCalls / 60n))}</span> : null}
                  <span id="amount-error" className="error">
                    {fieldError("amount") ?? fieldError("balance")}
                  </span>
                </div>

                <div className="field">
                  <label htmlFor="cap">{copy.cap}</label>
                  <div className="input-suffix">
                    <input id="cap" inputMode="decimal" value={cap} onChange={(e) => setCap(e.target.value)} aria-invalid={fieldError("cap") ? true : undefined} aria-describedby="cap-hint cap-rule cap-error" />
                    <span className="small faint">{symbol}</span>
                  </div>
                  <span id="cap-hint" className="hint">
                    {copy.capHint}
                  </span>
                  <span className="row small">
                    {dayCap !== null ? (
                      <button type="button" className="link-button" onClick={() => setCap(formatDecimal(dayCap, DECIMALS, { grouping: false }))}>
                        {copy.capUseDay}
                      </button>
                    ) : null}
                    <button type="button" className="link-button" onClick={() => setCap("never")}>
                      {copy.capNever}
                    </button>
                  </span>
                  <span id="cap-rule" className="small">
                    {copy.capRule}
                  </span>
                  <span id="cap-error" className="error">
                    {fieldError("cap")}
                  </span>
                </div>

                <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
                  <legend>{copy.budgetMode}</legend>
                  <label className="check">
                    <input type="radio" name="budget" checked={draft.budgetMode !== true} onChange={() => set({ budgetMode: false })} />
                    <span>
                      <strong style={{ fontWeight: 600 }}>{common.no}.</strong> <span className="muted">{copy.budgetModeOff}</span>
                    </span>
                  </label>
                  <label className="check">
                    <input type="radio" name="budget" checked={draft.budgetMode === true} onChange={() => set({ budgetMode: true })} />
                    <span>
                      <strong style={{ fontWeight: 600 }}>{common.yes}.</strong> <span className="muted">{copy.budgetModeOn}</span>
                    </span>
                  </label>
                  <span className="hint">{copy.budgetModeNeedsPayout}</span>
                  <span className="error">{fieldError("budget")}</span>
                </fieldset>

                <details className="stack" open={draft.budgetMode === true ? true : undefined}>
                  <summary>{copy.advanced}</summary>
                  <div className="split even" style={{ gap: "var(--space-4)" }}>
                    <div className="field">
                      <label htmlFor="payout">{copy.payout}</label>
                      <div className="input-suffix">
                        <input id="payout" inputMode="decimal" value={draft.payout} placeholder="0" onChange={(e) => set({ payout: e.target.value })} aria-describedby="payout-hint" />
                        <span className="small faint">{symbol}</span>
                      </div>
                      <span id="payout-hint" className="hint">
                        {copy.payoutHint}
                      </span>
                      <span className="error">{fieldError("payout")}</span>
                    </div>
                    <div className="field">
                      <label htmlFor="interval">{copy.interval}</label>
                      <select id="interval" value={draft.interval} onChange={(e) => set({ interval: e.target.value as IntervalId })}>
                        {INTERVALS.map((i) => (
                          <option key={i.id} value={i.id}>
                            {intervalCopy[i.id].adjective}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="split even" style={{ gap: "var(--space-4)" }}>
                    <div className="field">
                      <label htmlFor="checkin">{copy.checkInPeriod}</label>
                      <div className="input-suffix">
                        <input id="checkin" inputMode="numeric" value={draft.checkInDays} onChange={(e) => set({ checkInDays: e.target.value })} aria-describedby="checkin-hint" />
                        <span className="small faint">{copy.days}</span>
                      </div>
                      <span id="checkin-hint" className="hint">
                        {copy.checkInHint}
                      </span>
                      <span className="error">{fieldError("days")}</span>
                    </div>
                    <div className="field">
                      <label htmlFor="grace">{copy.grace}</label>
                      <div className="input-suffix">
                        <input id="grace" inputMode="numeric" value={draft.graceDays} onChange={(e) => set({ graceDays: e.target.value })} aria-describedby="grace-hint" />
                        <span className="small faint">{copy.days}</span>
                      </div>
                      <span id="grace-hint" className="hint">
                        {copy.graceHint}
                      </span>
                      <span className="error">{fieldError("graceDays")}</span>
                    </div>
                  </div>
                  <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
                    <legend>{copy.ownerCanClose}</legend>
                    <label className="check">
                      <input type="radio" name="close" checked={!draft.ownerCanClose} onChange={() => set({ ownerCanClose: false })} />
                      <span>
                        <strong style={{ fontWeight: 600 }}>{common.no}.</strong> <span className="muted">{copy.ownerCanCloseOff}</span>
                      </span>
                    </label>
                    <label className="check">
                      <input type="radio" name="close" checked={draft.ownerCanClose} onChange={() => set({ ownerCanClose: true })} />
                      <span>
                        <strong style={{ fontWeight: 600 }}>{common.yes}.</strong> <span className="muted">{copy.ownerCanCloseOn}</span>
                      </span>
                    </label>
                    <span className="hint">{copy.ownerCanCloseNote}</span>
                    <span className="error">{fieldError("ownerKey")}</span>
                  </fieldset>
                </details>

                <div className="row">
                  <button type="submit" className="button primary">
                    {common.continue}
                  </button>
                </div>
              </form>
            ) : null}

            {step === 1 ? (
              <form className="stack-lg" onSubmit={submitHeirs} noValidate>
                <div className="stack">
                  <h2 style={{ fontSize: "var(--size-h3)" }}>{copy.heirsTitle}</h2>
                  <p className="muted">{copy.heirsIntro}</p>
                </div>
                <HeirsEditor drafts={heirs} onChange={setHeirs} showErrors={heirsTouched} />
                <div className="row">
                  <button type="button" className="button quiet" onClick={() => setStep(0)}>
                    {common.back}
                  </button>
                  <button type="submit" className="button primary">
                    {copy.review}
                  </button>
                </div>
              </form>
            ) : null}

            {step === 2 && terms && heirResult.heirs && capParsed.ok ? (
              <div className="stack-lg">
                <div className="stack">
                  <h2 style={{ fontSize: "var(--size-h3)" }}>{copy.review}</h2>
                  <p className="muted">{copy.reviewIntro}</p>
                </div>
                <dl className="ledger">
                  <div>
                    <dt>{copy.vault}</dt>
                    <dd>
                      {vaultNames[vault.id].name}
                      <br />
                      <span className="faint small">{vaultNames[vault.id].rate}</span>
                    </dd>
                  </div>
                  <div className="total">
                    <dt>{copy.amount}</dt>
                    <dd>
                      <Amount value={terms.amount} decimals={DECIMALS} unit={symbol} />
                    </dd>
                  </div>
                  {paysCalls !== null ? (
                    <div>
                      <dt>{copy.callsPerHour}</dt>
                      <dd>{formatCalls(paysCalls)}</dd>
                    </div>
                  ) : null}
                  <div>
                    <dt>{copy.agent}</dt>
                    <dd>
                      <AddressText address={terms.beneficiary} you={terms.beneficiary === account?.evm || terms.beneficiary === account?.nativeEvm} />
                    </dd>
                  </div>
                  <div>
                    <dt>{copy.cap}</dt>
                    <dd>{capParsed.value === maxUint256 ? copy.capNever : <Amount value={capParsed.value} decimals={DECIMALS} unit={symbol} fraction={6} />}</dd>
                  </div>
                  <div>
                    <dt>{copy.payout}</dt>
                    <dd>
                      {terms.payoutAmount === 0n ? copy.payoutEverything : <Amount value={terms.payoutAmount} decimals={DECIMALS} unit={symbol} />}{" "}
                      <span className="faint">{intervalCopy[draft.interval].adjective.toLowerCase()}</span>
                    </dd>
                  </div>
                  <div>
                    <dt>{copy.checkInPeriod}</dt>
                    <dd>{formatDuration(terms.checkInPeriod)}</dd>
                  </div>
                  <div>
                    <dt>{copy.grace}</dt>
                    <dd>{terms.gracePeriod === 0n ? common.none : formatDuration(terms.gracePeriod)}</dd>
                  </div>
                  <div>
                    <dt>{copy.ownerCanClose}</dt>
                    <dd>{terms.ownerCanClose ? common.yes : common.no}</dd>
                  </div>
                  <div>
                    <dt>{copy.budgetMode}</dt>
                    <dd>{terms.budgetMode ? common.yes : common.no}</dd>
                  </div>
                  <div>
                    <dt>{copy.heirsTitle}</dt>
                    <dd>
                      {heirResult.heirs.length === 0 ? (
                        common.none
                      ) : (
                        <span className="stack" style={{ gap: "var(--space-1)" }}>
                          {heirResult.heirs.map((h) => (
                            <span key={h.account} className="mono small wrap-anywhere">
                              {h.account} · {bpsToPercent(h.bps)}%
                            </span>
                          ))}
                        </span>
                      )}
                    </dd>
                  </div>
                </dl>
                <p className="small">{copy.capRule}</p>
                {!terms.ownerCanClose ? <Notice tone="warn">{copy.ownerCanCloseOff}</Notice> : null}
                {heirResult.heirs.length === 0 ? <Notice tone="warn">{copy.heirsNone}</Notice> : null}
                {terms.budgetMode ? <Notice tone="warn">{copy.budgetModeOn}</Notice> : null}
                {vault.source === "accelerated" ? <Notice tone="warn">{vaultNames.demo.note}</Notice> : null}
                {vault.source === "none" ? <Notice tone="info">{vaultNames.noyield.note}</Notice> : null}

                {!account ? (
                  <Notice tone="info" title={copy.needsAccount}>
                    <button type="button" className="button small primary" onClick={() => setUnlocking(true)}>
                      {accountCopy.unlock}
                    </button>
                  </Notice>
                ) : null}

                <div className="row">
                  <button type="button" className="button quiet" onClick={() => setStep(1)} disabled={approveTx.busy || openTx.busy}>
                    {common.back}
                  </button>
                  {needsApproval ? (
                    <button type="button" className="button primary" onClick={() => void doApprove()} disabled={!account || !readiness.ready || !writesAllowed || approveTx.busy}>
                      {approveTx.busy ? copy.approving : `${copy.approve} ${formatAmount(terms.amount, DECIMALS)} ${symbol}`}
                    </button>
                  ) : (
                    <button type="button" className="button primary" onClick={() => void doOpen()} disabled={!account || !readiness.ready || !writesAllowed || openTx.busy || openedId !== null}>
                      {openTx.busy ? copy.submitting : copy.submit}
                    </button>
                  )}
                </div>
                <TxStatus state={approveTx.state} onDismiss={approveTx.reset} />
                <TxStatus state={openTx.state} onDismiss={openTx.reset} />
                {heirResult.list ? <span className="error-text">{heirErrors[heirResult.list]}</span> : null}
              </div>
            ) : null}
          </div>

          <aside className="stack">
            {account ? (
              <AccountPanel vault={vault} />
            ) : (
              <Notice tone="info" title={accountCopy.locked}>
                <span className="stack">
                  <span>{copy.needsAccount}</span>
                  <span>
                    <button type="button" className="button small quiet" onClick={() => setUnlocking(true)}>
                      {accountCopy.unlock}
                    </button>
                  </span>
                </span>
              </Notice>
            )}
          </aside>
        </div>
      </section>
      <UnlockDialog open={unlocking} onClose={() => setUnlocking(false)} />
    </div>
  );
}
