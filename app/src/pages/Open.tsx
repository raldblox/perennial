import { useMemo, useState, type FormEvent } from "react";
import { decodeEventLog, isAddress, type Hash } from "viem";
import { vaultAbi } from "../chain/abi";
import { approve, openPosition } from "../chain/write";
import { AccountPanel, useReadiness } from "../components/AccountPanel";
import { HeirsEditor } from "../components/HeirsEditor";
import { useWritesAllowed } from "../components/Layout";
import { TxStatus, useTx } from "../components/tx";
import { UnlockDialog } from "../components/UnlockDialog";
import { AddressText, Amount, formatAmount, Notice } from "../components/ui";
import { account as accountCopy, common, heirErrors, intervals as intervalCopy, open as copy } from "../copy";
import { formatDecimal } from "../lib/decimal";
import { validateHeirs, bpsToPercent, type HeirDraft } from "../lib/heirs";
import { validateTerms, type TermsDraft } from "../lib/openForm";
import { formatDuration, INTERVALS, type IntervalId } from "../lib/schedule";
import { DEFAULT_RATE_BPS, principalForSchedule } from "../lib/sizing";
import { href } from "../router";
import { useBalances, useClient, useKeyStatus, useVaultInfo } from "../state/queries";
import { useSession } from "../state/session";

type Step = 0 | 1 | 2;

export function Open() {
  const { account, signer } = useSession();
  const client = useClient();
  const info = useVaultInfo();
  const balances = useBalances(account?.evm);
  const readiness = useReadiness();
  const writesAllowed = useWritesAllowed();
  const decimals = info.data?.decimals ?? 6;
  const symbol = info.data?.symbol ?? "fUSD";

  const [step, setStep] = useState<Step>(0);
  const [touched, setTouched] = useState(false);
  const [heirsTouched, setHeirsTouched] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [openedId, setOpenedId] = useState<bigint | null>(null);
  const [draft, setDraft] = useState<TermsDraft>({
    amount: "",
    beneficiary: "",
    payout: "",
    interval: "monthly",
    checkInDays: "90",
    graceDays: "30",
    ownerCanClose: false,
  });
  const [heirs, setHeirs] = useState<HeirDraft[]>([]);
  const approveTx = useTx();
  const openTx = useTx();

  const beneficiary = draft.beneficiary.trim() || account?.evm || "";
  const beneficiaryValid = isAddress(beneficiary, { strict: false });
  const beneficiaryKey = useKeyStatus(beneficiaryValid ? beneficiary : undefined);
  const ownerKey = useKeyStatus(account?.evm);

  const { terms, errors } = validateTerms(
    { ...draft, beneficiary },
    {
      decimals,
      balance: balances.data?.token,
      beneficiaryKeyUsable: beneficiaryKey.data?.usable,
      ownerKeyUsable: account ? ownerKey.data?.usable : undefined,
    },
  );
  const heirResult = validateHeirs(heirs);
  const rateBps = info.data?.rateBps ?? DEFAULT_RATE_BPS;

  const sizing = useMemo(() => {
    if (!terms || terms.payoutAmount === 0n) return null;
    const needed = principalForSchedule(terms.payoutAmount, terms.payoutInterval, rateBps);
    return { needed, short: terms.amount < needed };
  }, [terms, rateBps]);

  const set = (patch: Partial<TermsDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const allowance = balances.data?.allowance ?? 0n;
  const needsApproval = terms !== null && allowance < terms.amount;

  const submitTerms = (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (terms) setStep(1);
  };

  const submitHeirs = (event: FormEvent) => {
    event.preventDefault();
    setHeirsTouched(true);
    if (heirResult.heirs) setStep(2);
  };

  const doApprove = async () => {
    if (!terms || !signer || !info.data) return;
    const asset = info.data.asset;
    await approveTx.run(copy.approve, (onStep) => approve({ client, wallet: signer.walletClient(), onStep }, asset, terms.amount));
  };

  const doOpen = async () => {
    if (!terms || !signer || !heirResult.heirs) return;
    const heirsList = heirResult.heirs;
    const hash = await openTx.run(copy.submit, (onStep) =>
      openPosition({ client, wallet: signer.walletClient(), onStep }, { ...terms, heirs: heirsList }),
    );
    if (hash) setOpenedId(await openedPositionId(hash));
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

  const fieldError = (name: keyof typeof copy.errors) => (touched && errors[name] ? copy.errors[name] : null);

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
                {openedId !== null ? <a href={href({ name: "position", id: openedId })}>{copy.view}</a> : null}
              </Notice>
            ) : null}

            {step === 0 ? (
              <form className="stack-lg" onSubmit={submitTerms} noValidate>
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
                        {copy.balance}: <Amount value={balances.data.token} decimals={decimals} unit={symbol} />{" "}
                        <button
                          type="button"
                          className="link-button"
                          onClick={() => set({ amount: formatDecimal(balances.data.token, decimals, { grouping: false }) })}
                        >
                          {copy.useMax}
                        </button>
                      </>
                    ) : null}
                  </span>
                  <span id="amount-error" className="error">
                    {fieldError("amount") ?? fieldError("balance")}
                  </span>
                </div>

                <div className="field">
                  <label htmlFor="beneficiary">{copy.beneficiary}</label>
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
                    {copy.beneficiaryHint}
                  </span>
                  {account ? (
                    <span className="row small">
                      <button type="button" className="link-button" onClick={() => set({ beneficiary: account.evm })}>
                        {copy.beneficiaryUseEvm}
                      </button>
                      <button type="button" className="link-button" onClick={() => set({ beneficiary: account.nativeEvm })}>
                        {copy.beneficiaryUseNative}
                      </button>
                    </span>
                  ) : null}
                  <span id="beneficiary-error" className="error">
                    {fieldError("beneficiary") ?? (beneficiaryKey.data && !beneficiaryKey.data.usable ? copy.errors.beneficiaryKey : null)}
                  </span>
                </div>

                <div className="split even" style={{ gap: "var(--space-4)" }}>
                  <div className="field">
                    <label htmlFor="payout">{copy.payout}</label>
                    <div className="input-suffix">
                      <input
                        id="payout"
                        inputMode="decimal"
                        value={draft.payout}
                        placeholder="0"
                        onChange={(e) => set({ payout: e.target.value })}
                        aria-invalid={fieldError("payout") ? true : undefined}
                        aria-describedby="payout-hint payout-error"
                      />
                      <span className="small faint">{symbol}</span>
                    </div>
                    <span id="payout-hint" className="hint">
                      {copy.payoutHint}
                    </span>
                    <span id="payout-error" className="error">
                      {fieldError("payout")}
                    </span>
                  </div>
                  <div className="field">
                    <label htmlFor="interval">{copy.interval}</label>
                    <select id="interval" value={draft.interval} onChange={(e) => set({ interval: e.target.value as IntervalId })} aria-describedby="interval-hint">
                      {INTERVALS.map((i) => (
                        <option key={i.id} value={i.id}>
                          {intervalCopy[i.id].adjective}
                        </option>
                      ))}
                    </select>
                    <span id="interval-hint" className="hint">
                      {intervalCopy[draft.interval].hint}
                    </span>
                  </div>
                </div>

                <div className="split even" style={{ gap: "var(--space-4)" }}>
                  <div className="field">
                    <label htmlFor="checkin">{copy.checkInPeriod}</label>
                    <div className="input-suffix">
                      <input
                        id="checkin"
                        inputMode="numeric"
                        value={draft.checkInDays}
                        onChange={(e) => set({ checkInDays: e.target.value })}
                        aria-invalid={fieldError("days") ? true : undefined}
                        aria-describedby="checkin-hint checkin-error"
                      />
                      <span className="small faint">{copy.days}</span>
                    </div>
                    <span id="checkin-hint" className="hint">
                      {copy.checkInHint}
                    </span>
                    <span id="checkin-error" className="error">
                      {fieldError("days")}
                    </span>
                  </div>
                  <div className="field">
                    <label htmlFor="grace">{copy.grace}</label>
                    <div className="input-suffix">
                      <input
                        id="grace"
                        inputMode="numeric"
                        value={draft.graceDays}
                        onChange={(e) => set({ graceDays: e.target.value })}
                        aria-invalid={fieldError("graceDays") ? true : undefined}
                        aria-describedby="grace-hint grace-error"
                      />
                      <span className="small faint">{copy.days}</span>
                    </div>
                    <span id="grace-hint" className="hint">
                      {copy.graceHint}
                    </span>
                    <span id="grace-error" className="error">
                      {fieldError("graceDays")}
                    </span>
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

                {terms ? (
                  <Notice tone={sizing?.short ? "warn" : "info"} title={copy.sizing}>
                    {sizing ? (
                      <>
                        {copy.sizingNeeds(formatAmount(sizing.needed, decimals))} {sizing.short ? copy.sizingShort : copy.sizingOk}
                      </>
                    ) : (
                      copy.sizingEverything
                    )}
                  </Notice>
                ) : null}

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

            {step === 2 && terms && heirResult.heirs ? (
              <div className="stack-lg">
                <div className="stack">
                  <h2 style={{ fontSize: "var(--size-h3)" }}>{copy.review}</h2>
                  <p className="muted">{copy.reviewIntro}</p>
                </div>
                <dl className="ledger">
                  <div className="total">
                    <dt>{copy.amount}</dt>
                    <dd>
                      <Amount value={terms.amount} decimals={decimals} unit={symbol} />
                    </dd>
                  </div>
                  <div>
                    <dt>{copy.beneficiary}</dt>
                    <dd>
                      <AddressText address={terms.beneficiary} you={terms.beneficiary === account?.evm || terms.beneficiary === account?.nativeEvm} />
                    </dd>
                  </div>
                  <div>
                    <dt>{copy.payout}</dt>
                    <dd>
                      {terms.payoutAmount === 0n ? copy.payoutEverything : <Amount value={terms.payoutAmount} decimals={decimals} unit={symbol} />}{" "}
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
                {!terms.ownerCanClose ? <Notice tone="warn">{copy.ownerCanCloseOff}</Notice> : null}
                {heirResult.heirs.length === 0 ? <Notice tone="warn">{copy.heirsNone}</Notice> : null}

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
                    <button
                      type="button"
                      className="button primary"
                      onClick={() => void doApprove()}
                      disabled={!account || !readiness.ready || !writesAllowed || approveTx.busy}
                    >
                      {approveTx.busy ? copy.approving : `${copy.approve} (${formatAmount(terms.amount, decimals)})`}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="button primary"
                      onClick={() => void doOpen()}
                      disabled={!account || !readiness.ready || !writesAllowed || openTx.busy || openedId !== null}
                    >
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
              <AccountPanel />
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
