import { useId } from "react";
import { heirErrors, open as copy } from "../copy";
import { HandleHint, useResolvedHeirs } from "./Handle";
import { bpsToPercent, evenSplit, MAX_HEIRS, validateHeirs, type HeirDraft } from "../lib/heirs";

export function HeirsEditor({ drafts, onChange, showErrors }: { drafts: HeirDraft[]; onChange: (next: HeirDraft[]) => void; showErrors: boolean }) {
  const id = useId();
  const result = validateHeirs(useResolvedHeirs(drafts).drafts);
  const update = (index: number, patch: Partial<HeirDraft>) => onChange(drafts.map((d, i) => (i === index ? { ...d, ...patch } : d)));

  return (
    <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
      <legend className="visually-hidden">{copy.heirsTitle}</legend>
      {drafts.length === 0 ? <p className="muted small">{copy.heirsNone}</p> : null}
      {drafts.map((draft, index) => {
        const error = showErrors ? result.rows[index] : null;
        const errorId = `${id}-err-${index}`;
        return (
          <div key={index} className="stack" style={{ gap: "var(--space-2)", paddingBottom: "var(--space-3)", borderBottom: "1px solid var(--rule)" }}>
            <div style={{ display: "grid", gap: "var(--space-3)", gridTemplateColumns: "minmax(0, 1fr) 7rem auto", alignItems: "end" }}>
              <div className="field">
                <label htmlFor={`${id}-a-${index}`} className="small">
                  {copy.heirAddress} {index + 1}
                </label>
                <input
                  id={`${id}-a-${index}`}
                  className="mono"
                  value={draft.address}
                  placeholder="0x… or @handle"
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(e) => update(index, { address: e.target.value })}
                  aria-invalid={error?.startsWith("address") || error === "duplicate" ? true : undefined}
                  aria-describedby={error ? errorId : undefined}
                />
              </div>
              <div className="field">
                <label htmlFor={`${id}-p-${index}`} className="small">
                  {copy.heirPercent}
                </label>
                <div className="input-suffix">
                  <input
                    id={`${id}-p-${index}`}
                    inputMode="decimal"
                    value={draft.percent}
                    onChange={(e) => update(index, { percent: e.target.value })}
                    aria-invalid={error?.startsWith("percent") ? true : undefined}
                    aria-describedby={error ? errorId : undefined}
                  />
                  <span className="small faint">%</span>
                </div>
              </div>
              <button type="button" className="button small quiet" onClick={() => onChange(drafts.filter((_, i) => i !== index))}>
                {copy.removeHeir}
                <span className="visually-hidden"> {index + 1}</span>
              </button>
            </div>
            <HandleHint input={draft.address} />
            {error ? (
              <span id={errorId} className="error-text">
                {heirErrors[error]}
              </span>
            ) : null}
          </div>
        );
      })}
      <div className="row">
        <button
          type="button"
          className="button small quiet"
          disabled={drafts.length >= MAX_HEIRS}
          onClick={() => {
            const split = evenSplit(drafts.length + 1);
            onChange([...drafts.map((d, i) => ({ ...d, percent: split[i] ?? d.percent })), { address: "", percent: split[drafts.length] ?? "" }]);
          }}
        >
          {copy.addHeir}
        </button>
        {drafts.length > 1 ? (
          <button
            type="button"
            className="button small quiet"
            onClick={() => {
              const split = evenSplit(drafts.length);
              onChange(drafts.map((d, i) => ({ ...d, percent: split[i] ?? d.percent })));
            }}
          >
            {copy.split}
          </button>
        ) : null}
        {drafts.length > 0 ? (
          <span className={`small ${result.list === "total" ? "error-text" : "faint"}`} aria-live="polite">
            {copy.total}: <span className="num">{bpsToPercent(result.totalBps)}%</span>
          </span>
        ) : null}
      </div>
      {showErrors && result.list ? (
        <span className="error-text" role="alert">
          {heirErrors[result.list]}
        </span>
      ) : null}
    </fieldset>
  );
}
