/**
 * One transaction's life in the UI: preparing, signing, sending, waiting for
 * the block, then confirmed or failed with the decoded reason and a link.
 */
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import type { Hash } from "viem";
import { explainError, type ExplainedError } from "../chain/errors";
import { TransactionFailed, type Step } from "../chain/write";
import { tx as copy } from "../copy";
import { Notice, Spinner, TxLink } from "./ui";

export type TxState =
  | { status: "idle" }
  | { status: "busy"; step: Step; hash?: Hash }
  | { status: "success"; hash: Hash; message: string }
  | { status: "failed"; error: ExplainedError; hash?: Hash };

export function useTx() {
  const [state, setState] = useState<TxState>({ status: "idle" });
  const queryClient = useQueryClient();

  const run = useCallback(
    async (successMessage: string, work: (onStep: (step: Step, hash?: Hash) => void) => Promise<Hash>): Promise<Hash | null> => {
      setState({ status: "busy", step: "preparing" });
      let lastHash: Hash | undefined;
      try {
        const hash = await work((step, hash) => {
          if (hash) lastHash = hash;
          setState({ status: "busy", step, hash: hash ?? lastHash });
        });
        setState({ status: "success", hash, message: successMessage });
        return hash;
      } catch (error) {
        const hash = error instanceof TransactionFailed ? error.hash : lastHash;
        setState({ status: "failed", error: explainError(error), hash });
        return null;
      } finally {
        await queryClient.invalidateQueries();
      }
    },
    [queryClient],
  );

  const reset = useCallback(() => setState({ status: "idle" }), []);
  return { state, run, reset, busy: state.status === "busy" };
}

const STEP_LABEL: Record<Step, string> = {
  preparing: copy.preparing,
  signing: copy.signing,
  sending: copy.sending,
  pending: copy.pending,
};

export function TxStatus({ state, onDismiss }: { state: TxState; onDismiss?: () => void }) {
  if (state.status === "idle") return null;
  if (state.status === "busy") {
    return (
      <div className="row" aria-live="polite">
        <Spinner label={STEP_LABEL[state.step]} />
        {state.hash ? <TxLink hash={state.hash} /> : null}
      </div>
    );
  }
  if (state.status === "success") {
    return (
      <div aria-live="polite">
        <Notice tone="ok" title={`${copy.success}. ${state.message}`}>
          <span className="row">
            {copy.hash} <TxLink hash={state.hash} />
            {onDismiss ? (
              <button type="button" className="link-button" onClick={onDismiss}>
                {copy.dismiss}
              </button>
            ) : null}
          </span>
        </Notice>
      </div>
    );
  }
  return (
    <Notice tone="danger" title={`${copy.failed}. ${state.error.message}`}>
      <span className="stack">
        {state.error.detail ? <span className="mono wrap-anywhere">{state.error.detail}</span> : null}
        <span className="row">
          {state.hash ? (
            <>
              {copy.hash} <TxLink hash={state.hash} />
            </>
          ) : null}
          {onDismiss ? (
            <button type="button" className="link-button" onClick={onDismiss}>
              {copy.dismiss}
            </button>
          ) : null}
        </span>
      </span>
    </Notice>
  );
}
