/**
 * "How long does my agent's budget last?" Calls an hour, a price per call, a
 * deposit and a yield rate give either "indefinitely" (the yield covers the
 * spend) or a duration. Deposits, spend and yield are exact bigint token
 * units; only the duration with a partial yield uses floating point, because
 * it needs a logarithm, and it is shown rounded.
 */
import { useId, useState } from "react";
import { agentCalc as copy } from "../copy";
import { formatDecimal, parseDecimal } from "../lib/decimal";
import { CALLS_SCALE, depositForCalls, formatCalls, HOURS_PER_YEAR } from "../lib/inference";
import { RATES_DATE, REFERENCE_RATES } from "../lib/referenceRates";

const RATES_URL = "https://yields.llama.fi/pools";

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}
import { DEFAULT_MARGIN } from "../lib/sizing";

const DECIMALS = 6;
const BPS = 10_000n;

export type Duration = { kind: "forever" } | { kind: "days"; days: number };

export interface AgentSizing {
  deposit: bigint;
  callsPerHourX100: bigint;
  price: bigint;
  rateBps: bigint;
  /** What the calls cost in a year. */
  yearlySpend: bigint;
  /** What the deposit earns in a year at the rate. */
  yearlyYield: bigint;
  duration: Duration;
  /** The deposit whose yield pays these calls indefinitely, with the default margin; null at 0%. */
  depositForever: bigint | null;
}

/**
 * The deposit P earns r a year, compounding, and pays S a year. With rP >= S
 * it never shrinks. Otherwise dP/dt = rP - S reaches zero after
 * ln(S / (S - rP)) / r years, or P / S years at r = 0.
 */
export function durationFor(deposit: bigint, yearlySpend: bigint, rateBps: bigint): Duration {
  if (yearlySpend <= 0n) return { kind: "forever" };
  const yearlyYield = (deposit * rateBps) / BPS;
  if (yearlyYield >= yearlySpend) return { kind: "forever" };
  const P = Number(deposit);
  const S = Number(yearlySpend);
  const r = Number(rateBps) / 10_000;
  const years = r === 0 ? P / S : Math.log(S / (S - r * P)) / r;
  return { kind: "days", days: years * 365 };
}

export function computeAgentSizing(input: { calls: string; price: string; deposit: string; rate: string }): AgentSizing | null {
  const calls = parseDecimal(input.calls, 2);
  const price = parseDecimal(input.price, DECIMALS);
  const deposit = parseDecimal(input.deposit, DECIMALS);
  const rate = parseDecimal(input.rate, 2);
  if (!calls.ok || !price.ok || !deposit.ok || !rate.ok) return null;
  if (calls.value <= 0n || price.value <= 0n || deposit.value <= 0n || rate.value < 0n || rate.value > 10_000n) return null;
  const yearlySpend = (calls.value * price.value * HOURS_PER_YEAR) / CALLS_SCALE;
  return {
    deposit: deposit.value,
    callsPerHourX100: calls.value,
    price: price.value,
    rateBps: rate.value,
    yearlySpend,
    yearlyYield: (deposit.value * rate.value) / BPS,
    duration: durationFor(deposit.value, yearlySpend, rate.value),
    depositForever: rate.value > 0n ? depositForCalls(calls.value, price.value, rate.value, DEFAULT_MARGIN) : null,
  };
}

function show(value: bigint, maxFraction = 2): string {
  return formatDecimal(value, DECIMALS, { maxFraction });
}

function durationText(days: number): { value: string; unit: string } {
  if (days >= 730) return { value: (days / 365).toLocaleString("en-US", { maximumFractionDigits: 1 }), unit: copy.years };
  return { value: Math.floor(days).toLocaleString("en-US"), unit: copy.days };
}

export function AgentCalculator({ fundHref }: { fundHref: (calls: string, price: string) => string }) {
  const [calls, setCalls] = useState("1");
  const [price, setPrice] = useState("0.002");
  const [deposit, setDeposit] = useState("500");
  const [rate, setRate] = useState("0");
  const id = useId();
  const result = computeAgentSizing({ calls, price, deposit, rate });
  const presetIds = new Set(["0", ...REFERENCE_RATES.map((ref) => ref.mean30dPercent)]);
  const custom = !presetIds.has(rate);
  const margin = formatDecimal(DEFAULT_MARGIN, 4);

  return (
    <div className="calc">
      <form className="calc-inputs" onSubmit={(e) => e.preventDefault()} aria-label={copy.title}>
        <div className="field">
          <label htmlFor={`${id}-calls`}>{copy.callsPerHour}</label>
          <input id={`${id}-calls`} inputMode="decimal" autoComplete="off" value={calls} onChange={(e) => setCalls(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor={`${id}-price`}>{copy.price}</label>
          <div className="input-suffix">
            <input id={`${id}-price`} inputMode="decimal" autoComplete="off" value={price} onChange={(e) => setPrice(e.target.value)} aria-describedby={`${id}-price-hint`} />
            <span className="small faint">fUSD</span>
          </div>
          <span id={`${id}-price-hint`} className="hint">
            {copy.priceHint}
          </span>
        </div>
        <div className="field">
          <label htmlFor={`${id}-deposit`}>{copy.deposit}</label>
          <div className="input-suffix">
            <input id={`${id}-deposit`} inputMode="decimal" autoComplete="off" value={deposit} onChange={(e) => setDeposit(e.target.value)} />
            <span className="small faint">fUSD</span>
          </div>
        </div>
        <fieldset className="field calc-rates">
          <legend>{copy.presets}</legend>
          <div className="chips">
            <button type="button" className="chip" aria-pressed={rate === "0"} onClick={() => setRate("0")}>
              {copy.presetZero}
            </button>
            {REFERENCE_RATES.map((ref) => (
              <button key={ref.id} type="button" className="chip" aria-pressed={rate === ref.mean30dPercent} onClick={() => setRate(ref.mean30dPercent)}>
                {copy.preset(ref.name, ref.mean30dPercent)}
              </button>
            ))}
            <label className={`chip chip-input${custom ? " is-active" : ""}`}>
              <span className="visually-hidden">{copy.custom}</span>
              <input inputMode="decimal" autoComplete="off" placeholder="Other" value={custom ? rate : ""} onChange={(e) => setRate(e.target.value || "0")} aria-describedby={`${id}-rate-hint`} />
              <span aria-hidden="true">%</span>
            </label>
          </div>
          <span id={`${id}-rate-hint`} className="hint">
            {copy.presetSource("DefiLlama", formatDate(RATES_DATE))}{" "}
            <a href={RATES_URL} target="_blank" rel="noreferrer">
              {copy.sourceLink}
            </a>
          </span>
        </fieldset>
      </form>

      <div className="calc-result" aria-live="polite">
        {result ? (
          <>
            {result.duration.kind === "forever" ? (
              <p className="figure calc-figure" data-testid="calc-result">
                {copy.resultForever}
              </p>
            ) : (
              <>
                <span className="small muted">{copy.resultLasts}</span>
                <p className="figure calc-figure" data-testid="calc-result">
                  {durationText(result.duration.days).value}
                  <span className="unit">{durationText(result.duration.days).unit}</span>
                </p>
              </>
            )}
            <p className="small muted">
              {result.duration.kind === "forever" ? copy.foreverNote : result.rateBps === 0n ? copy.zeroNote : copy.shrinkNote}
            </p>
            <dl className="ledger small">
              <div>
                <dt>{copy.calls}</dt>
                <dd>{Number(formatCalls(result.callsPerHourX100 * HOURS_PER_YEAR)).toLocaleString("en-US")}</dd>
              </div>
              <div>
                <dt>{copy.spends}</dt>
                <dd>{show(result.yearlySpend)} fUSD</dd>
              </div>
              <div>
                <dt>{copy.earns}</dt>
                <dd>{show(result.yearlyYield)} fUSD</dd>
              </div>
              <div className="total">
                <dt>{copy.needed}</dt>
                <dd>{result.depositForever === null ? "—" : `${show(result.depositForever)} fUSD`}</dd>
              </div>
            </dl>
            <p className="small faint">{result.depositForever === null ? copy.neededNone : copy.neededNote(margin)}</p>
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
