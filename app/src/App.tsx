import { useEffect } from "react";
import { Layout } from "./components/Layout";
import { notFound } from "./copy";
import { Landing } from "./pages/Landing";
import { Open } from "./pages/Open";
import { PositionPage } from "./pages/Position";
import { Positions } from "./pages/Positions";
import { href, useRoute } from "./router";

const TITLES = {
  overview: "Perennial · Deposit once. The yield pays your agent's calls.",
  open: "Fund an agent · Perennial",
  positions: "Positions · Perennial",
  "not-found": "Not found · Perennial",
} as const;

export function App() {
  const route = useRoute();

  const key = route.name === "position" ? `position-${route.vault}-${route.id.toString()}` : route.name === "open" || route.name === "positions" ? `${route.name}-${route.vault}` : route.name;

  useEffect(() => {
    document.title = route.name === "position" ? `Position ${route.id.toString()} · Perennial` : TITLES[route.name];
    window.scrollTo({ top: 0 });
    document.getElementById("main")?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (
    <Layout route={route}>
      {route.name === "overview" ? <Landing /> : null}
      {route.name === "open" ? <Open key={route.vault} vaultId={route.vault} /> : null}
      {route.name === "positions" ? <Positions key={route.vault} vaultId={route.vault} address={route.address} /> : null}
      {route.name === "position" ? <PositionPage key={`${route.vault}-${route.id.toString()}`} vaultId={route.vault} id={route.id} /> : null}
      {route.name === "not-found" ? (
        <div className="page section stack">
          <h1 style={{ fontSize: "var(--size-h2)" }}>{notFound.title}</h1>
          <p className="muted">{notFound.body}</p>
          <a href={href({ name: "overview" })}>{notFound.home}</a>
        </div>
      ) : null}
    </Layout>
  );
}
