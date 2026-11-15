/**
 * The sizing calculator: payout to principal, and principal to payout.
 * All arithmetic in token units (6 decimals) as bigint.
 */
import { useId, useState } from "react";
import { calculator as copy, intervals as intervalCopy } from "../copy";
import { formatDecimal, parseDecimal } from "../lib/decimal";
import { INTERVALS, intervalSeconds, type IntervalId } from "../lib/schedule";
import { annualise, annualPayoutFor, breakEvenRateBps, principalFor, SECONDS_PER_YEAR } from "../lib/sizing";

const DECIMALS = 6;

function show(value: bigint): string {
  return formatDecimal(value, DECIMALS, { maxFraction: 2, minFraction: 0 });
}

export function computeSizing(input: {
  mode: "principal" | "payout";
  amount: string;
  interval: IntervalId;
  rate: string;
  margin: string;
}): { principal: bigint; payout: bigint; annual: bigint; breakEvenBps: bigint | null } | null {
  const amount = parseDecimal(input.amount, DECIMALS);
  const rate = parseDecimal(input.rate, 2);
  const margin = parseDecimal(input.margin, 4);
  if (!amount.ok || !rate.ok || !margin.ok) return null;
  if (rate.value <= 0n || margin.value < 10_000n) return null;
  const seconds = intervalSeconds(input.interval);
  if (input.mode === "principal") {
    const annual = annualise(amount.value, seconds);
    const principal = principalFor(annual, rate.value, margin.value);
    return { principal, payout: amount.value, annual, breakEvenBps: breakEvenRateBps(principal, annual) };
  }
  const annual = annualPayoutFor(amount.value, rate.value, margin.value);
  const payout = (annual * seconds) / SECONDS_PER_YEAR;
  return { principal: amount.value, payout, annual, breakEvenBps: breakEvenRateBps(amount.value, annual) };
}

function percent(bps: bigint): string {
  return `${formatDecimal(bps, 2, { maxFraction: 2 })}%`;
}

export function Calculator() {
  const [mode, setMode] = useState<"principal" | "payout">("principal");
  const [amount, setAmount] = useState("400");
  const [interval, setInterval] = useState<IntervalId>("monthly");
  const [rate, setRate] = useState("5");
  const [margin, setMargin] = useState("1.15");
  const id = useId();

  const result = computeSizing({ mode, amount, interval, rate, margin });
  const unit = intervalCopy[interval].label;

  const switchMode = (next: "principal" | "payout") => {
    if (next === mode) return;
    if (result) setAmount(show(next === "principal" ? result.payout : result.principal).replace(/,/g, ""));
    setMode(next);
  };

  return (
    <div className="split even">
      <form className="stack-lg" onSubmit={(e) => e.preventDefault()} aria-label={copy.label}>
        <div className="segmented" role="group" aria-label={copy.label}>
          <button type="button" aria-pressed={mode === "principal"} onClick={() => switchMode("principal")}>
            {copy.modePrincipal}
          </button>
          <button type="button" aria-pressed={mode === "payout"} onClick={() => switchMode("payout")}>
            {copy.modePayout}
          </button>
        </div>
        {mode === "principal" ? (
          <div className="field">
            <label htmlFor={`${id}-amount`}>{copy.payout}</label>
            <div className="input-suffix">
              <input id={`${id}-amount`} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
              <span className="row small" style={{ gap: "var(--space-2)" }}>
                <label htmlFor={`${id}-interval`}>fUSD {copy.every}</label>
                <select id={`${id}-interval`} value={interval} onChange={(e) => setInterval(e.target.value as IntervalId)} style={{ width: "auto" }}>
                  {INTERVALS.map((i) => (
                    <option key={i.id} value={i.id}>
                      {intervalCopy[i.id].label}
                    </option>
                  ))}
                </select>
              </span>
            </div>
          </div>
        ) : (
          <div className="field">
            <label htmlFor={`${id}-amount`}>{copy.principal}</label>
            <div className="input-suffix">
              <input id={`${id}-amount`} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
              <span className="small faint">fUSD</span>
            </div>
          </div>
        )}
        <div className="split even" style={{ gap: "var(--space-4)" }}>
          <div className="field">
            <label htmlFor={`${id}-rate`}>{copy.rate}</label>
            <input id={`${id}-rate`} inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} aria-describedby={`${id}-rate-hint`} />
            <span id={`${id}-rate-hint`} className="hint">
              {copy.rateHint}
            </span>
          </div>
          <div className="field">
            <label htmlFor={`${id}-margin`}>{copy.margin}</label>
            <input id={`${id}-margin`} inputMode="decimal" value={margin} onChange={(e) => setMargin(e.target.value)} aria-describedby={`${id}-margin-hint`} />
            <span id={`${id}-margin-hint`} className="hint">
              {copy.marginHint}
            </span>
          </div>
        </div>
        {mode === "payout" ? (
          <div className="field">
            <label htmlFor={`${id}-interval2`}>{copy.every}</label>
            <select id={`${id}-interval2`} value={interval} onChange={(e) => setInterval(e.target.value as IntervalId)}>
              {INTERVALS.map((i) => (
                <option key={i.id} value={i.id}>
                  {intervalCopy[i.id].adjective}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </form>

      <div className="stack" aria-live="polite">
        {result ? (
          <>
            <span className="label">{mode === "principal" ? copy.resultPrincipal : copy.resultPayout}</span>
            <p className="figure" style={{ fontSize: "var(--size-h1)" }} data-testid="calc-result">
              {mode === "principal" ? show(result.principal) : show(result.payout)}
              <span className="unit">{mode === "principal" ? "fUSD" : `fUSD / ${unit}`}</span>
            </p>
            <dl className="ledger small">
              <div>
                <dt>
                  {copy.payout} {copy.perYear}
                </dt>
                <dd>{show(result.annual)} fUSD</dd>
              </div>
              <div>
                <dt>{copy.breakEven}</dt>
                <dd>{result.breakEvenBps === null ? "–" : percent(result.breakEvenBps)}</dd>
              </div>
            </dl>
            <p className="formula" aria-label="P equals k times C divided by r">
              {copy.formula}
            </p>
          </>
        ) : (
          <p className="error-text" role="alert">
            {copy.invalid}
          </p>
        )}
      </div>
    </div>
  );
}
