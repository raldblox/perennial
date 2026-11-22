import { useQueries } from "@tanstack/react-query";
import { lazy, Suspense, useState, type FormEvent } from "react";
import { getAddress, isAddress, type Address } from "viem";
import { positionsInvolving, type Role } from "../chain/events";
import { readPosition } from "../chain/vault";
import { Amount, Notice, Spinner, Status } from "../components/ui";
import { config, vaultById, type VaultConfig, type VaultId } from "../config";
import { common, phases, positions as copy, vaultNames } from "../copy";
import { timeline } from "../lib/schedule";
import { href, navigate } from "../router";
import { useChainNow, useClient, useVaultEvents, useVaultInfo } from "../state/queries";
import { useSession } from "../state/session";

const WalletLookup = lazy(() => import("../components/WalletLookup"));

function PositionTable({ vault, roles }: { vault: VaultConfig; roles: Map<bigint, Set<Role>> }) {
  const client = useClient();
  const info = useVaultInfo(vault);
  const now = useChainNow();
  const ids = [...roles.keys()].sort((a, b) => (a < b ? 1 : -1));
  const reads = useQueries({
    queries: ids.map((id) => ({ queryKey: ["position", vault.id, id.toString()], queryFn: () => readPosition(client, vault, id) })),
  });
  const decimals = info.data?.decimals ?? 6;
  const t = now.data ?? BigInt(Math.floor(Date.now() / 1000));

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th scope="col">{copy.columns.id}</th>
            <th scope="col">{copy.columns.role}</th>
            <th scope="col" className="num">
              {copy.columns.principal}
            </th>
            <th scope="col">{copy.columns.status}</th>
          </tr>
        </thead>
        <tbody>
          {ids.map((id, i) => {
            const read = reads[i];
            const p = read?.data;
            const phase = p ? timeline(p.state, t, p.heirs.length).phase : null;
            return (
              <tr key={id.toString()}>
                <th scope="row" style={{ textTransform: "none", letterSpacing: 0, fontSize: "var(--size-small)" }}>
                  <a href={href({ name: "position", vault: vault.id, id })}>#{id.toString()}</a>
                </th>
                <td>{[...(roles.get(id) ?? [])].map((r) => copy.roleNames[r]).join(", ")}</td>
                <td className="num">{p ? <Amount value={p.state.principal} decimals={decimals} unit={info.data?.symbol} /> : <span className="skeleton">0000</span>}</td>
                <td>{phase ? <Status tone={phase === "active" ? "ok" : phase === "closed" || phase === "succeeded" ? "neutral" : "warn"}>{phases[phase].name}</Status> : null}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ForAddress({ vault, address }: { vault: VaultConfig; address: Address }) {
  const events = useVaultEvents(vault);
  if (events.isPending) return <Spinner label={copy.scanning} />;
  if (events.isError) {
    return (
      <Notice tone="danger" title={copy.scanning}>
        <button type="button" className="link-button" onClick={() => void events.refetch()}>
          {common.retry}
        </button>
      </Notice>
    );
  }
  const roles = positionsInvolving(events.data, address);
  if (roles.size === 0) return <p className="muted">{copy.empty}</p>;
  return <PositionTable vault={vault} roles={roles} />;
}

export function Positions({ vaultId, address }: { vaultId: VaultId; address?: string }) {
  const vault = vaultById(vaultId);
  const { account } = useSession();
  const [walletAddress, setWalletAddress] = useState<Address | undefined>(undefined);
  const info = useVaultInfo(vault);
  const [id, setId] = useState("");
  const [query, setQuery] = useState(address ?? "");
  const [idError, setIdError] = useState(false);
  const [addressError, setAddressError] = useState(false);
  const searched = address && isAddress(address, { strict: false }) ? getAddress(address) : null;

  const goToId = (event: FormEvent) => {
    event.preventDefault();
    if (!/^[1-9]\d*$/.test(id.trim())) {
      setIdError(true);
      return;
    }
    navigate({ name: "position", vault: vault.id, id: BigInt(id.trim()) });
  };

  const search = (event: FormEvent) => {
    event.preventDefault();
    if (!isAddress(query.trim(), { strict: false })) {
      setAddressError(true);
      return;
    }
    setAddressError(false);
    navigate({ name: "positions", vault: vault.id, address: getAddress(query.trim()) });
  };

  const count = info.data?.positionCount ?? 0n;
  const all = new Map<bigint, Set<Role>>(Array.from({ length: Number(count) }, (_, i) => [BigInt(i + 1), new Set<Role>()]));

  return (
    <div className="page">
      <section className="section" aria-labelledby="positions-title">
        <div className="section-head">
          <h1 id="positions-title" style={{ fontSize: "var(--size-h2)" }}>
            {copy.title}
          </h1>
        </div>
        <nav className="segmented" aria-label={copy.vault} style={{ marginBottom: "var(--space-5)" }}>
          {config.vaults.map((v) => (
            <a
              key={v.id}
              className="segment"
              href={href({ name: "positions", vault: v.id })}
              aria-current={v.id === vault.id ? "page" : undefined}
            >
              {vaultNames[v.id].name}
            </a>
          ))}
        </nav>
        <p className="small muted" style={{ marginBottom: "var(--space-5)" }}>
          {vaultNames[vault.id].note}
        </p>

        <div className="split even">
          <form className="field" onSubmit={goToId} noValidate>
            <label htmlFor="position-id">{copy.byId}</label>
            <div className="input-suffix">
              <input
                id="position-id"
                inputMode="numeric"
                value={id}
                onChange={(e) => {
                  setId(e.target.value);
                  setIdError(false);
                }}
                aria-invalid={idError ? true : undefined}
                aria-describedby="position-id-error"
              />
              <button type="submit" className="button small quiet">
                {copy.go}
              </button>
            </div>
            <span id="position-id-error" className="error">
              {idError ? copy.invalidId : null}
            </span>
          </form>
          <form className="field" onSubmit={search} noValidate>
            <label htmlFor="position-address">{copy.byAddress}</label>
            <div className="input-suffix">
              <input
                id="position-address"
                className="mono"
                value={query}
                placeholder="0x…"
                spellCheck={false}
                autoComplete="off"
                onChange={(e) => {
                  setQuery(e.target.value);
                  setAddressError(false);
                }}
                aria-invalid={addressError ? true : undefined}
                aria-describedby="position-address-hint position-address-error"
              />
              <button type="submit" className="button small quiet">
                {copy.search}
              </button>
            </div>
            <span id="position-address-hint" className="hint">
              {copy.addressHint}
            </span>
            <span id="position-address-error" className="error">
              {addressError ? copy.invalidAddress : null}
            </span>
          </form>
        </div>
      </section>

      {searched ? (
        <section className="section stack" aria-labelledby="searched-title">
          <h2 id="searched-title" className="label">
            {copy.byAddress}: <span className="mono">{searched}</span>
          </h2>
          <ForAddress vault={vault} address={searched} />
        </section>
      ) : null}

      {account ? (
        <section className="section stack" aria-labelledby="yours-title">
          <h2 id="yours-title" className="label">
            {copy.yours}
          </h2>
          <ForAddress vault={vault} address={account.evm} />
          {account.nativeEvm !== account.evm ? <ForAddress vault={vault} address={account.nativeEvm} /> : null}
        </section>
      ) : null}

      <section className="section stack" aria-labelledby="wallet-title">
        <h2 id="wallet-title" className="label">
          {copy.wallet}
        </h2>
        <Suspense fallback={<Spinner />}>
          <WalletLookup onAccount={setWalletAddress} />
        </Suspense>
        {walletAddress ? <ForAddress vault={vault} address={walletAddress} /> : null}
      </section>

      <section className="section stack" aria-labelledby="all-title">
        <h2 id="all-title" className="label">
          {copy.all}
        </h2>
        {info.isPending ? <Spinner /> : count === 0n ? <p className="muted">{copy.none}</p> : <PositionTable vault={vault} roles={all} />}
      </section>
    </div>
  );
}
