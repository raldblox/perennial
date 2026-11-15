/**
 * Hash routes, so the build works on any static host without rewrites.
 *   #/                         overview
 *   #/open?vault=demo          fund an agent (vault defaults to the 5% one)
 *   #/positions?vault=…&address=…
 *   #/position/:id             a position in the default vault
 *   #/position/:vault/:id      a position in another vault (demo, v1)
 */
import { useSyncExternalStore } from "react";
import { config, isVaultId, type VaultId } from "./config";

export type Route =
  | { name: "overview" }
  | { name: "open"; vault: VaultId }
  | { name: "positions"; vault: VaultId; address?: string }
  | { name: "position"; vault: VaultId; id: bigint }
  | { name: "not-found" };

const ID = /^[1-9]\d{0,30}$/;

function vaultParam(query: URLSearchParams): VaultId | null {
  const v = query.get("vault");
  if (v === null) return config.defaultVault;
  return isVaultId(v) ? v : null;
}

export function parseRoute(hash: string): Route {
  const [path = "", queryText = ""] = hash.replace(/^#/, "").split("?");
  const query = new URLSearchParams(queryText);
  const parts = path.split("/").filter(Boolean);
  if (parts.length === 0) return { name: "overview" };
  const vault = vaultParam(query);
  if (vault === null) return { name: "not-found" };
  if (parts[0] === "open" && parts.length === 1) return { name: "open", vault };
  if (parts[0] === "positions" && parts.length === 1) {
    const address = query.get("address") ?? undefined;
    return address ? { name: "positions", vault, address } : { name: "positions", vault };
  }
  if (parts[0] === "position" && parts.length === 2 && ID.test(parts[1] ?? "")) {
    return { name: "position", vault: config.defaultVault, id: BigInt(parts[1] ?? "0") };
  }
  if (parts[0] === "position" && parts.length === 3 && isVaultId(parts[1] ?? "") && ID.test(parts[2] ?? "")) {
    return { name: "position", vault: parts[1] as VaultId, id: BigInt(parts[2] ?? "0") };
  }
  return { name: "not-found" };
}

function withVault(path: string, vault: VaultId, extra: Record<string, string> = {}): string {
  const query = new URLSearchParams(extra);
  if (vault !== config.defaultVault) query.set("vault", vault);
  const text = query.toString();
  return text ? `${path}?${text}` : path;
}

export function href(route: Route): string {
  switch (route.name) {
    case "overview":
      return "#/";
    case "open":
      return withVault("#/open", route.vault);
    case "positions":
      return withVault("#/positions", route.vault, route.address ? { address: route.address } : {});
    case "position":
      return route.vault === config.defaultVault ? `#/position/${route.id.toString()}` : `#/position/${route.vault}/${route.id.toString()}`;
    case "not-found":
      return "#/";
  }
}

export function navigate(route: Route): void {
  window.location.hash = href(route);
}

function subscribe(callback: () => void): () => void {
  window.addEventListener("hashchange", callback);
  return () => window.removeEventListener("hashchange", callback);
}

export function useHash(): string {
  return useSyncExternalStore(subscribe, () => window.location.hash, () => "");
}

export function useRoute(): Route {
  return parseRoute(useHash());
}
