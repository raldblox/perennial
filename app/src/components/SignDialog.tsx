/**
 * Shows exactly what will be signed before the page signs it (decision 003):
 * the action, the position, the signer, the nonce, the expiry and the message
 * bytes the vault returned. Nothing is signed until the user confirms.
 */
import { useEffect, useId, useRef } from "react";
import type { PreparedAction } from "../chain/write";
import { common, signing as copy } from "../copy";
import { formatUtc } from "../lib/schedule";
import { AddressText, Notice } from "./ui";

const ACTION_LABEL = { CheckIn: "Check in", Claim: "Claim", SetHeirs: "Change heirs", Close: "Close position" } as const;

export function SignDialog({
  prepared,
  onConfirm,
  onCancel,
  irreversible,
}: {
  prepared: PreparedAction | null;
  onConfirm: () => void;
  onCancel: () => void;
  irreversible?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (prepared && !dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    } else if (!prepared && dialog.open) {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    }
  }, [prepared]);

  return (
    <dialog ref={ref} aria-labelledby={titleId} onCancel={onCancel}>
      {prepared ? (
        <div className="dialog-body">
          <h2 id={titleId} style={{ fontSize: "var(--size-h3)" }}>
            {copy.title}
          </h2>
          <p className="muted small">{copy.intro}</p>
          <dl className="ledger small">
            <div>
              <dt>{copy.action}</dt>
              <dd>{ACTION_LABEL[prepared.request.action]}</dd>
            </div>
            <div>
              <dt>{copy.position}</dt>
              <dd className="num">{prepared.request.id.toString()}</dd>
            </div>
            <div>
              <dt>{copy.signer}</dt>
              <dd>
                <AddressText address={prepared.request.signer} />
              </dd>
            </div>
            <div>
              <dt>{copy.nonce}</dt>
              <dd className="num">{prepared.nonce.toString()}</dd>
            </div>
            <div>
              <dt>{copy.expires}</dt>
              <dd>
                {formatUtc(prepared.deadline)} <span className="faint">({copy.expiresIn})</span>
              </dd>
            </div>
            <div>
              <dt>{copy.params}</dt>
              <dd className="mono wrap-anywhere">
                {prepared.request.action === "SetHeirs" ? `${copy.heirsHash(prepared.request.heirs?.length ?? 0)}: ${prepared.paramsHash}` : copy.paramsNone}
              </dd>
            </div>
          </dl>
          <div className="stack" style={{ gap: "var(--space-2)" }}>
            <span className="small">{copy.bytes}</span>
            <textarea className="message-bytes" readOnly value={prepared.message} aria-label={copy.bytes} rows={4} />
            <span className="faint small">{copy.bytesNote}</span>
          </div>
          {irreversible ? <Notice tone="warn">{copy.irreversible}</Notice> : null}
          <div className="row">
            <button type="button" className="button primary" onClick={onConfirm}>
              {copy.confirm}
            </button>
            <button type="button" className="button quiet" onClick={onCancel}>
              {common.cancel}
            </button>
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
