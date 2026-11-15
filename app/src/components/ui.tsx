import { useState, type ReactNode } from "react";
import { addressUrl, nativeTxUrl } from "../config";
import { common } from "../copy";
import { formatDecimal } from "../lib/decimal";

/** The brand mark: a fixed core and the cycle of income around it. */
export function Mark({ title }: { title?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden={title ? undefined : true} role={title ? "img" : undefined}>
      {title ? <title>{title}</title> : null}
      <circle cx="16" cy="16" r="5.5" fill="currentColor" />
      <path d="M16 4.5a11.5 11.5 0 1 1-11.5 11.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Fixed fraction digits, except that a non-zero amount too small to show at
 * that precision is shown in full rather than as zero.
 */
export function formatAmount(value: bigint, decimals: number, fraction = 2): string {
  const shown = formatDecimal(value, decimals, { maxFraction: fraction, minFraction: fraction });
  if (value !== 0n && /^-?[0.,]+$/.test(shown)) return formatDecimal(value, decimals, { minFraction: fraction });
  return shown;
}

export function Amount({ value, decimals, unit, fraction = 2 }: { value: bigint; decimals: number; unit?: string; fraction?: number }) {
  return (
    <span className="num">
      {formatAmount(value, decimals, fraction)}
      {unit ? <span className="unit"> {unit}</span> : null}
    </span>
  );
}

export function Figure({ label, children, note }: { label: string; children: ReactNode; note?: ReactNode }) {
  return (
    <div>
      <span className="label">{label}</span>
      <span className="figure">{children}</span>
      {note ? <span className="small faint">{note}</span> : null}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span role="status" className="row small muted">
      <span className="spinner" aria-hidden="true" />
      {label ?? common.loading}
    </span>
  );
}

export function Notice({ tone = "neutral", title, children }: { tone?: "neutral" | "info" | "warn" | "danger" | "ok"; title?: string; children?: ReactNode }) {
  return (
    <div className={`notice ${tone}`} role={tone === "danger" ? "alert" : undefined}>
      {title ? <strong>{title}</strong> : null}
      {children ? <div className="small">{children}</div> : null}
    </div>
  );
}

export function Status({ tone, children }: { tone: "ok" | "warn" | "danger" | "neutral"; children: ReactNode }) {
  return <span className={`status ${tone}`}>{children}</span>;
}

export function shortAddress(address: string): string {
  return address.length > 14 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}

export function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="link-button small"
      aria-label={label ? `${common.copy} ${label}` : common.copy}
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {copied ? common.copied : common.copy}
    </button>
  );
}

/** An address with copy and explorer links. Full on wide screens, wrapped on narrow ones. */
export function AddressText({ address, you }: { address: string; you?: boolean }) {
  return (
    <span className="address">
      <span>{address}</span>
      {you ? <span className="badge">{common.you}</span> : null}
      <CopyButton text={address} label={address} />
      <a className="small" href={addressUrl(address)} target="_blank" rel="noreferrer" title={common.explorerNote}>
        {common.explorer}
      </a>
    </span>
  );
}

/**
 * An EVM transaction hash. QoreChain's explorer looks up native transactions
 * only, so an EVM hash is shown in full with a copy button instead of a link
 * that would not resolve.
 */
export function TxHash({ hash, short }: { hash: string; short?: boolean }) {
  return (
    <span className="address" title={common.evmHashNote}>
      <span className="mono small wrap-anywhere">{short ? shortAddress(hash) : hash}</span>
      <CopyButton text={hash} label={hash} />
    </span>
  );
}

/** A native-lane transaction, which the explorer can show once switched to Testnet. */
export function NativeTxLink({ hash }: { hash: string }) {
  return (
    <a className="mono small wrap-anywhere" href={nativeTxUrl(hash)} target="_blank" rel="noreferrer" title={common.explorerNote}>
      {shortAddress(hash)}
      <span className="visually-hidden"> ({common.explorer})</span>
    </a>
  );
}
