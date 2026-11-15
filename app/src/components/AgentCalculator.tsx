/**
 * "How much does my agent need?" Calls an hour and a price per call give the
 * deposit; a deposit gives the calls an hour it pays for. Exact bigint math.
 */
import { useId, useState } from "react";
import { agentCalc as copy } from "../copy";
import { formatDecimal, parseDecimal } from "../lib/decimal";
import { callsPerHourFor, depositForCalls, formatCalls, HOURS_PER_YEAR } from "../lib/inference";

const DECIMALS = 6;

export interface AgentSizing {
  deposit: bigint;
  callsPerHourX100: bigint;
  price: bigint;
  /** What the calls cost in a year. */
  yearly: bigint;
}

export function computeAgentSizing(input: {
  mode: "deposit" | "calls";
  calls: string;
  deposit: string;
  price: string;
  rate: string;
  margin: string;
}): AgentSizing | null {
  const price = parseDecimal(input.price, DECIMALS);
  const rate = parseDecimal(input.rate, 2);
  const margin = parseDecimal(input.margin, 4);
  if (!price.ok || !rate.ok || !margin.ok || price.value <= 0n || rate.value <= 0n || margin.value < 10_000n) return null;
  if (input.mode === "deposit") {
    const calls = parseDecimal(input.calls, 2);
    if (!calls.ok || calls.value <= 0n) return null;
    const deposit = depositForCalls(calls.value, price.value, rate.value, margin.value);
    return { deposit, callsPerHourX100: calls.value, price: price.value, yearly: (calls.value * price.value * HOURS_PER_YEAR) / 100n };
  }
  const deposit = parseDecimal(input.deposit, DECIMALS);
  if (!deposit.ok || deposit.value <= 0n) return null;
  const calls = callsPerHourFor(deposit.value, price.value, rate.value, margin.value);
  return { deposit: deposit.value, callsPerHourX100: calls, price: price.value, yearly: (calls * price.value * HOURS_PER_YEAR) / 100n };
}

function show(value: bigint): string {
  return formatDecimal(value, DECIMALS, { maxFraction: 2 });
}

export function AgentCalculator({ fundHref }: { fundHref: (calls: string, price: string) => string }) {
  const [mode, setMode] = useState<"deposit" | "calls">("deposit");
  const [calls, setCalls] = useState("1");
  const [deposit, setDeposit] = useState("500");
  const [price, setPrice] = useState("0.002");
  const [rate, setRate] = useState("5");
  const [margin, setMargin] = useState("1.15");
  const id = useId();
  const result = computeAgentSizing({ mode, calls, deposit, price, rate, margin });

  return (
    <div className="split even">
      <form className="stack-lg" onSubmit={(e) => e.preventDefault()} aria-label={copy.label}>
        <div className="segmented" role="group" aria-label={copy.label}>
          <button type="button" aria-pressed={mode === "deposit"} onClick={() => setMode("deposit")}>
            {copy.modeDeposit}
          </button>
          <button type="button" aria-pressed={mode === "calls"} onClick={() => setMode("calls")}>
            {copy.modeCalls}
          </button>
        </div>
        <div className="split even" style={{ gap: "var(--space-4)" }}>
          {mode === "deposit" ? (
            <div className="field">
              <label htmlFor={`${id}-calls`}>{copy.callsPerHour}</label>
              <input id={`${id}-calls`} inputMode="decimal" value={calls} onChange={(e) => setCalls(e.target.value)} />
            </div>
          ) : (
            <div className="field">
              <label htmlFor={`${id}-deposit`}>{copy.deposit}</label>
              <div className="input-suffix">
                <input id={`${id}-deposit`} inputMode="decimal" value={deposit} onChange={(e) => setDeposit(e.target.value)} />
                <span className="small faint">fUSD</span>
              </div>
            </div>
          )}
          <div className="field">
            <label htmlFor={`${id}-price`}>{copy.price}</label>
            <input id={`${id}-price`} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} aria-describedby={`${id}-price-hint`} />
            <span id={`${id}-price-hint`} className="hint">
              {copy.priceHint}
            </span>
          </div>
        </div>
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
      </form>

      <div className="stack" aria-live="polite">
        {result ? (
          <>
            <span className="label">{mode === "deposit" ? copy.resultDeposit : copy.resultCalls}</span>
            <p className="figure" style={{ fontSize: "var(--size-h1)" }} data-testid="calc-result">
              {mode === "deposit" ? show(result.deposit) : formatCalls(result.callsPerHourX100)}
              <span className="unit">{mode === "deposit" ? "fUSD" : copy.anHour}</span>
            </p>
            <dl className="ledger small">
              <div>
                <dt>{copy.perYear}</dt>
                <dd>{show(result.yearly)} fUSD</dd>
              </div>
              <div>
                <dt>{copy.perDay}</dt>
                <dd>{formatCalls(result.callsPerHourX100 * 24n)}</dd>
              </div>
            </dl>
            <p className="formula">{copy.formula}</p>
            <p>
              <a className="button primary" href={fundHref(formatCalls(result.callsPerHourX100), formatDecimal(result.price, DECIMALS, { grouping: false }))}>
                {copy.fund}
              </a>
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
