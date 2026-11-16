import { totals } from "../chain/events";
import { AgentCalculator } from "../components/AgentCalculator";
import { Amount, Figure, Notice } from "../components/ui";
import { addressUrl, config, type VaultConfig } from "../config";
import { agentCalc, faq, hero, how, live, roles, simulated, uses, vaultNames, why } from "../copy";
import { href } from "../router";
import { usePrincipalHeld, useSourceReserve, useVaultEvents, useVaultInfo } from "../state/queries";

function Hero() {
  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="split">
        <div>
          <p className="label">{hero.label}</p>
          <h1 id="hero-title" aria-label={hero.headline}>
            {hero.headlineLines.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </h1>
          <p className="lede">{hero.lede}</p>
          <div className="row actions">
            <a className="button primary" href={href({ name: "open", vault: config.defaultVault })}>
              {hero.primary}
            </a>
            <a className="button quiet" href={href({ name: "positions", vault: config.defaultVault })}>
              {hero.secondary}
            </a>
          </div>
        </div>
        <aside aria-labelledby="example-title" style={{ alignSelf: "end" }}>
          <p id="example-title" className="label" style={{ marginBottom: "var(--space-3)" }}>
            {hero.example.label}
          </p>
          <dl className="ledger">
            <div>
              <dt>{hero.example.deposit}</dt>
              <dd>{hero.example.depositValue}</dd>
            </div>
            <div>
              <dt>{hero.example.rate}</dt>
              <dd>{hero.example.rateValue}</dd>
            </div>
            <div>
              <dt>{hero.example.margin}</dt>
              <dd>{hero.example.marginValue}</dd>
            </div>
            <div>
              <dt>{hero.example.hourly}</dt>
              <dd>{hero.example.hourlyValue}</dd>
            </div>
            <div className="total">
              <dt>{hero.example.calls}</dt>
              <dd>{hero.example.callsValue}</dd>
            </div>
          </dl>
          <p className="small faint" style={{ marginTop: "var(--space-3)" }}>
            {hero.example.note}
          </p>
        </aside>
      </div>
    </section>
  );
}

function VaultFigures({ vault }: { vault: VaultConfig }) {
  const info = useVaultInfo(vault);
  const events = useVaultEvents(vault);
  const held = usePrincipalHeld(vault, info.data?.positionCount);
  const reserve = useSourceReserve(vault, info.data?.source, info.data?.asset, held.data);
  const failed = info.isError || events.isError || held.isError;
  const decimals = info.data?.decimals ?? 6;
  const symbol = info.data?.symbol ?? "fUSD";
  const sums = events.data ? totals(events.data) : null;
  const name = vaultNames[vault.id];

  return (
    <div className="stack">
      <h3 style={{ fontSize: "var(--size-body)", fontFamily: "var(--font-text)", fontWeight: 600 }}>
        {name.name} <span className="faint small">· {name.rate}</span>
      </h3>
      {failed ? (
        <Notice tone="danger" title={live.error}>
          <button
            type="button"
            className="link-button"
            onClick={() => {
              void info.refetch();
              void events.refetch();
              void held.refetch();
            }}
          >
            {live.retry}
          </button>
        </Notice>
      ) : (
        <div className="figures" aria-busy={info.isPending || events.isPending}>
          <Figure label={live.opened}>{info.data ? <span className="num">{info.data.positionCount.toString()}</span> : <span className="skeleton">00</span>}</Figure>
          <Figure label={live.principal}>
            {held.data !== undefined ? <Amount value={held.data} decimals={decimals} unit={symbol} /> : <span className="skeleton">0000</span>}
          </Figure>
          <Figure label={live.spends}>{sums ? <span className="num">{sums.spends.toString()}</span> : <span className="skeleton">00</span>}</Figure>
          <Figure label={live.spent}>{sums ? <Amount value={sums.spent} decimals={decimals} unit={symbol} fraction={4} /> : <span className="skeleton">0000</span>}</Figure>
        </div>
      )}
      <p className="small faint">
        {name.note} {live.contract}:{" "}
        <a className="mono" href={addressUrl(vault.address)} target="_blank" rel="noreferrer">
          {vault.address}
        </a>
        {reserve.data !== undefined ? (
          <>
            {" · "}
            {live.reserveLabel}: <Amount value={reserve.data} decimals={decimals} unit={symbol} />
          </>
        ) : null}
      </p>
    </div>
  );
}

export function Landing() {
  const current = config.vaults;
  return (
    <div className="page">
      <Hero />

      <section className="section" aria-labelledby="sizing-title">
        <div className="section-head">
          <p className="label">{agentCalc.label}</p>
          <h2 id="sizing-title">{agentCalc.title}</h2>
          <p className="lede">{agentCalc.intro}</p>
        </div>
        <AgentCalculator fundHref={(calls, price) => `${href({ name: "open", vault: config.defaultVault })}?calls=${calls}&price=${price}`} />
      </section>

      <section className="section" aria-labelledby="why-title">
        <div className="section-head">
          <p className="label">{why.label}</p>
          <h2 id="why-title">{why.title}</h2>
          <p className="lede">{why.body}</p>
        </div>
        <dl className="qa">
          {why.roles.map((role) => (
            <div key={role.who}>
              <dt>{role.who}</dt>
              <dd>{role.what}</dd>
            </div>
          ))}
        </dl>
        <p className="lede" style={{ marginTop: "var(--space-6)", color: "var(--ink)" }}>
          {why.worstCase}
        </p>
      </section>

      <section className="section" aria-labelledby="how-title">
        <div className="section-head">
          <p className="label">{how.label}</p>
          <h2 id="how-title">{how.title}</h2>
        </div>
        <ol className="howto">
          {how.steps.map((step) => (
            <li key={step.title}>
              <h3>{step.title}</h3>
              <p className="muted">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="section" aria-labelledby="live-title">
        <div className="section-head">
          <p className="label">{live.label}</p>
          <h2 id="live-title">{live.title}</h2>
        </div>
        <div className="stack-lg">
          {current.map((vault) => (
            <VaultFigures key={vault.id} vault={vault} />
          ))}
        </div>
      </section>

      <section className="section" aria-labelledby="roles-title">
        <div className="section-head">
          <p className="label">{roles.label}</p>
          <h2 id="roles-title">{roles.title}</h2>
          <p className="lede">{roles.intro}</p>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">{roles.columns.action}</th>
                <th scope="col">{roles.columns.who}</th>
                <th scope="col">{roles.columns.note}</th>
              </tr>
            </thead>
            <tbody>
              {roles.rows.map((row) => (
                <tr key={row.action}>
                  <th scope="row" style={{ textTransform: "none", letterSpacing: 0, fontSize: "var(--size-small)", color: "var(--ink)" }}>
                    {row.action}
                  </th>
                  <td>{row.who}</td>
                  <td className="muted">{row.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="small muted" style={{ marginTop: "var(--space-4)", maxWidth: "var(--measure)" }}>
          {roles.footnote}
        </p>
      </section>

      <section className="section" aria-labelledby="uses-title">
        <div className="section-head">
          <p className="label">{uses.label}</p>
          <h2 id="uses-title">{uses.title}</h2>
          <p className="muted">{uses.note}</p>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">{uses.label}</th>
                <th scope="col" className="num">
                  {uses.payoutLabel}
                </th>
                <th scope="col" className="num">
                  {uses.principalLabel}
                </th>
              </tr>
            </thead>
            <tbody>
              {uses.items.map((item) => (
                <tr key={item.title}>
                  <td>
                    <strong style={{ fontWeight: 600 }}>{item.title}</strong>
                    <br />
                    <span className="muted">{item.body}</span>
                  </td>
                  <td className="num" style={{ whiteSpace: "nowrap" }}>
                    {item.payout}
                  </td>
                  <td className="num" style={{ whiteSpace: "nowrap", fontFamily: "var(--font-display)", fontSize: "var(--size-lede)" }}>
                    {item.principal} <span className="faint small">{uses.unit}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="section" aria-labelledby="simulated-title">
        <div className="section-head">
          <p className="label">{simulated.label}</p>
          <h2 id="simulated-title">{simulated.title}</h2>
        </div>
        <dl className="qa">
          {simulated.items.map((item) => (
            <div key={item.term}>
              <dt>{item.term}</dt>
              <dd>{item.body}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="section" aria-labelledby="faq-title">
        <div className="section-head">
          <p className="label">{faq.label}</p>
          <h2 id="faq-title">{faq.title}</h2>
        </div>
        <dl className="qa">
          {faq.items.map((item) => (
            <div key={item.q}>
              <dt>{item.q}</dt>
              <dd>{item.a}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
