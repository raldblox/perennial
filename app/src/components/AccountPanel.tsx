/**
 * The unlocked account's readiness to send: fee balance, fUSD, its ML-DSA-87
 * key and its EVM window, each explained where it blocks.
 */
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { Address } from "viem";
import { explainError, type ExplainedError } from "../chain/errors";
import { config } from "../config";
import { account as copy, common, requirements } from "../copy";
import { useBalances, useClient, useKeyStatus, useVaultInfo, useWindow } from "../state/queries";
import { useSession } from "../state/session";
import { AddressText, Amount, Notice, Spinner, Status } from "./ui";

export type Blocker = "no-key" | "key-mismatch" | "no-window" | "window-unreachable" | "no-gas";

export interface Readiness {
  ready: boolean;
  loading: boolean;
  blockers: Blocker[];
  /** fUSD the sending account holds. */
  token?: bigint;
  allowance?: bigint;
}

/** Whether the unlocked account can send a transaction now, and if not, why. */
export function useReadiness(): Readiness {
  const { account } = useSession();
  const key = useKeyStatus(account?.evm);
  const balances = useBalances(account?.evm);
  const window = useWindow();
  if (!account) return { ready: false, loading: false, blockers: [] };
  const loading = key.isPending || balances.isPending || window.isPending;
  const blockers: Blocker[] = [];
  if (key.data && !key.data.usable) blockers.push("no-key");
  else if (key.data && key.data.publicKey.toLowerCase() !== account.publicKeys[account.evm]?.toLowerCase()) blockers.push("key-mismatch");
  if (balances.data && balances.data.gas === 0n) blockers.push("no-gas");
  if (window.data) {
    if (!window.data.reachable) blockers.push("window-unreachable");
    else if (!window.data.window.live) blockers.push("no-window");
  }
  // An unreachable window is a warning, not a stop: a window opened elsewhere still works.
  const hard = blockers.filter((b) => b !== "window-unreachable");
  return { ready: !loading && hard.length === 0, loading, blockers, token: balances.data?.token, allowance: balances.data?.allowance };
}

function KeyLine({ account, derived }: { account: Address; derived: string | undefined }) {
  const key = useKeyStatus(account);
  if (key.isPending) return <span className="skeleton">…</span>;
  if (key.isError) return <Status tone="neutral">{common.unknown}</Status>;
  if (!key.data.registered) return <Status tone="danger">{copy.keyMissing}</Status>;
  if (!key.data.possessionProven) return <Status tone="warn">{copy.keyUnproven}</Status>;
  if (derived && key.data.publicKey.toLowerCase() !== derived.toLowerCase()) return <Status tone="danger">{copy.keyMismatch}</Status>;
  return <Status tone="ok">{copy.keyUsable}</Status>;
}

export function AccountPanel() {
  const { account, signer } = useSession();
  const client = useClient();
  const queryClient = useQueryClient();
  const info = useVaultInfo();
  const balances = useBalances(account?.evm);
  const window = useWindow();
  const readiness = useReadiness();
  const [opening, setOpening] = useState(false);
  const [windowError, setWindowError] = useState<ExplainedError | null>(null);

  if (!account || !signer) return null;
  const decimals = info.data?.decimals ?? 6;

  const openWindow = async () => {
    setOpening(true);
    setWindowError(null);
    try {
      const fees = await client.estimateFeesPerGas();
      const maxFee = fees.maxFeePerGas;
      await signer.openWindow([config.vault, info.data?.asset ?? config.asset], maxFee * 2n);
      await queryClient.invalidateQueries({ queryKey: ["evm-window"] });
    } catch (error) {
      setWindowError(explainError(error));
    } finally {
      setOpening(false);
    }
  };

  const w = window.data;
  return (
    <section className="stack" aria-labelledby="account-panel-title">
      <h2 id="account-panel-title" className="label">
        {copy.unlocked}
      </h2>
      <dl className="ledger small">
        <div>
          <dt>{copy.evm}</dt>
          <dd>
            <AddressText address={account.evm} />
          </dd>
        </div>
        <div>
          <dt>{copy.key}</dt>
          <dd>
            <KeyLine account={account.evm} derived={account.publicKeys[account.evm]} />
          </dd>
        </div>
        <div>
          <dt>{copy.native}</dt>
          <dd>
            <span className="mono small wrap-anywhere">{account.native}</span>
            <br />
            <KeyLine account={account.nativeEvm} derived={account.publicKeys[account.nativeEvm]} />
          </dd>
        </div>
        <div>
          <dt>{copy.gas}</dt>
          <dd>{balances.data ? <Amount value={balances.data.gas} decimals={18} unit="QOR" fraction={4} /> : <span className="skeleton">…</span>}</dd>
        </div>
        <div>
          <dt>{copy.token}</dt>
          <dd>{balances.data ? <Amount value={balances.data.token} decimals={decimals} unit={info.data?.symbol} /> : <span className="skeleton">…</span>}</dd>
        </div>
        <div>
          <dt>{copy.window}</dt>
          <dd>
            {window.isPending ? (
              <span className="skeleton">…</span>
            ) : !w ? (
              <Status tone="neutral">{common.unknown}</Status>
            ) : !w.reachable ? (
              <Status tone="neutral">{copy.windowUnknown}</Status>
            ) : w.window.live ? (
              <span className="stack" style={{ gap: "var(--space-1)" }}>
                <Status tone="ok">{copy.windowLive(w.window.remainingBlocks.toString(), w.window.remainingTxs.toString())}</Status>
                <span className="faint small">
                  {copy.windowScope}: {w.window.allowedTargets.length ? w.window.allowedTargets.join(", ") : copy.windowAny}
                </span>
              </span>
            ) : (
              <Status tone="warn">{w.window.found ? copy.windowExhausted : copy.windowNone}</Status>
            )}
          </dd>
        </div>
      </dl>
      <p className="faint small">{copy.autoLock}</p>

      {readiness.blockers.includes("no-key") ? <Notice tone="danger" title={requirements.noKey.title}>{requirements.noKey.body}</Notice> : null}
      {readiness.blockers.includes("key-mismatch") ? (
        <Notice tone="danger" title={requirements.keyMismatch.title}>
          {requirements.keyMismatch.body}
        </Notice>
      ) : null}
      {readiness.blockers.includes("no-gas") ? (
        <Notice tone="warn" title={requirements.noGas.title}>
          {requirements.noGas.body}{" "}
          <a href={config.faucetUrl} target="_blank" rel="noreferrer">
            {copy.faucet}
          </a>
        </Notice>
      ) : null}
      {balances.data && balances.data.token === 0n ? (
        <Notice tone="warn" title={requirements.noToken.title}>
          {requirements.noToken.body}
        </Notice>
      ) : null}
      {readiness.blockers.includes("window-unreachable") ? (
        <Notice tone="info" title={requirements.windowUnreachable.title}>
          {requirements.windowUnreachable.body}
        </Notice>
      ) : null}
      {readiness.blockers.includes("no-window") && !readiness.blockers.includes("no-key") ? (
        <Notice tone="warn" title={requirements.noWindow.title}>
          <span className="stack">
            <span>{requirements.noWindow.body}</span>
            <span>
              <button type="button" className="button small primary" onClick={() => void openWindow()} disabled={opening}>
                {opening ? copy.openingWindow : copy.openWindow}
              </button>
            </span>
          </span>
        </Notice>
      ) : null}
      {opening ? <Spinner label={copy.openingWindow} /> : null}
      {windowError ? (
        <Notice tone="danger" title={windowError.message}>
          {windowError.detail ? <span className="mono wrap-anywhere">{windowError.detail}</span> : null}
        </Notice>
      ) : null}
      <div className="row">
        <button
          type="button"
          className="button small quiet"
          onClick={() => void queryClient.invalidateQueries()}
        >
          {copy.refresh}
        </button>
      </div>
    </section>
  );
}
