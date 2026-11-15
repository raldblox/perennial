import { useState, type ReactNode } from "react";
import { config } from "../config";
import { account as accountCopy, brand, errors, footer, nav } from "../copy";
import { href, type Route } from "../router";
import { useChainId, useVaultInfo } from "../state/queries";
import { useSession } from "../state/session";
import { UnlockDialog } from "./UnlockDialog";
import { Mark, Notice, shortAddress } from "./ui";

function NavLink({ to, current, children }: { to: Route; current: boolean; children: ReactNode }) {
  return (
    <a href={href(to)} aria-current={current ? "page" : undefined}>
      {children}
    </a>
  );
}

export function Layout({ route, children }: { route: Route; children: ReactNode }) {
  const { account, lock } = useSession();
  const [unlocking, setUnlocking] = useState(false);
  const chainId = useChainId();
  const info = useVaultInfo();
  const wrongNetwork = chainId.data !== undefined && chainId.data !== config.chainId;

  return (
    <>
      <a className="skip-link" href="#main">
        {nav.skip}
      </a>
      <header className="site-header">
        <div className="page">
          <span className="row" style={{ gap: "var(--space-3)" }}>
            <a className="wordmark" href={href({ name: "overview" })}>
              <Mark />
              {brand.name}
            </a>
            <span className="badge">{brand.network}</span>
          </span>
          <nav className="site-nav" aria-label="Main">
            <NavLink to={{ name: "overview" }} current={route.name === "overview"}>
              {nav.overview}
            </NavLink>
            <NavLink to={{ name: "open" }} current={route.name === "open"}>
              {nav.open}
            </NavLink>
            <NavLink to={{ name: "positions" }} current={route.name === "positions" || route.name === "position"}>
              {nav.positions}
            </NavLink>
            {account ? (
              <span className="row small" style={{ gap: "var(--space-2)" }}>
                <span className="mono" title={account.evm}>
                  {shortAddress(account.evm)}
                </span>
                <button type="button" className="button small quiet" onClick={lock}>
                  {accountCopy.lock}
                </button>
              </span>
            ) : (
              <button type="button" className="button small quiet" onClick={() => setUnlocking(true)}>
                {accountCopy.unlock}
              </button>
            )}
          </nav>
        </div>
      </header>
      {wrongNetwork || (info.data && !info.data.assetMatches) ? (
        <div className="page" style={{ paddingTop: "var(--space-4)" }}>
          {wrongNetwork ? <Notice tone="danger" title={errors.wrongNetwork(config.chainId, chainId.data)} /> : null}
          {info.data && !info.data.assetMatches ? <Notice tone="danger" title={errors.assetMismatch} /> : null}
        </div>
      ) : null}
      <main id="main" tabIndex={-1}>
        {children}
      </main>
      <footer className="site-footer">
        <div className="page">
          <p>{footer.line}</p>
          <p className="faint" style={{ marginTop: "var(--space-2)" }}>
            {footer.explorer}
          </p>
          <dl>
            <dt>{footer.vault}</dt>
            <dd className="mono">{config.vault}</dd>
            <dt>{footer.asset}</dt>
            <dd className="mono">{info.data?.asset ?? config.asset}</dd>
            {info.data ? (
              <>
                <dt>{footer.source}</dt>
                <dd className="mono">{info.data.source}</dd>
              </>
            ) : null}
            <dt>{footer.code}</dt>
            <dd>
              <a href={config.sourceUrl} target="_blank" rel="noreferrer">
                {config.sourceUrl.replace(/^https:\/\//, "")}
              </a>
            </dd>
          </dl>
        </div>
      </footer>
      <UnlockDialog open={unlocking} onClose={() => setUnlocking(false)} />
    </>
  );
}

/** Whether writes are allowed: right chain and the expected asset. */
export function useWritesAllowed(): boolean {
  const chainId = useChainId();
  const info = useVaultInfo();
  return chainId.data === config.chainId && info.data?.assetMatches === true;
}
