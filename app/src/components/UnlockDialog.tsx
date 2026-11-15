import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { common, unlock as copy } from "../copy";
import { useSession } from "../state/session";
import { Notice } from "./ui";

export function UnlockDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const { unlock } = useSession();
  const [phrase, setPhrase] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const phraseId = useId();
  const hintId = useId();
  const errorId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    } else if (!open && dialog.open) {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    }
  }, [open]);

  const close = () => {
    setPhrase("");
    setConsent(false);
    setError(null);
    onClose();
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!consent || busy) return;
    setBusy(true);
    setError(null);
    try {
      await unlock(phrase);
      close();
    } catch {
      setError(copy.invalid);
    } finally {
      setPhrase("");
      setBusy(false);
    }
  };

  return (
    <dialog ref={ref} aria-labelledby={`${phraseId}-title`} onClose={close} onCancel={close}>
      <form className="dialog-body" onSubmit={(e) => void submit(e)}>
        <h2 id={`${phraseId}-title`} style={{ fontSize: "var(--size-h3)" }}>
          {copy.title}
        </h2>
        <p className="muted">{copy.intro}</p>
        <ul className="stack small" style={{ margin: 0, paddingLeft: "1.1rem" }}>
          {copy.points.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
        <div className="field">
          <label htmlFor={phraseId}>{copy.phrase}</label>
          <textarea
            id={phraseId}
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            data-lpignore="true"
            data-1p-ignore="true"
            aria-describedby={error ? `${hintId} ${errorId}` : hintId}
            aria-invalid={error ? true : undefined}
            required
          />
          <span id={hintId} className="hint">
            {copy.phraseHint}
          </span>
          {error ? (
            <span id={errorId} className="error" role="alert">
              {error}
            </span>
          ) : null}
        </div>
        <label className="check small">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>{copy.consent}</span>
        </label>
        <Notice tone="info">{copy.accounts}</Notice>
        <div className="row">
          <button type="submit" className="button primary" disabled={!consent || busy || phrase.trim() === ""}>
            {busy ? copy.deriving : copy.submit}
          </button>
          <button type="button" className="button quiet" onClick={close}>
            {common.cancel}
          </button>
        </div>
      </form>
    </dialog>
  );
}
