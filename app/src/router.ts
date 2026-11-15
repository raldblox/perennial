/**
 * Hash routes, so the build works on any static host without rewrites.
 *   #/                 overview
 *   #/open             open a position
 *   #/positions        find positions
 *   #/position/:id     one position
 */
import { useSyncExternalStore } from "react";

export type Route =
  | { name: "overview" }
  | { name: "open" }
  | { name: "positions"; address?: string }
  | { name: "position"; id: bigint }
  | { name: "not-found" };

export function parseRoute(hash: string): Route {
  const [path = "", query = ""] = hash.replace(/^#/, "").split("?");
  const parts = path.split("/").filter(Boolean);
  if (parts.length === 0) return { name: "overview" };
  if (parts[0] === "open" && parts.length === 1) return { name: "open" };
  if (parts[0] === "positions" && parts.length === 1) {
    const address = new URLSearchParams(query).get("address") ?? undefined;
    return address ? { name: "positions", address } : { name: "positions" };
  }
  if (parts[0] === "position" && parts.length === 2 && /^[1-9]\d{0,30}$/.test(parts[1] ?? "")) {
    return { name: "position", id: BigInt(parts[1] ?? "0") };
  }
  return { name: "not-found" };
}

export function href(route: Route): string {
  switch (route.name) {
    case "overview":
      return "#/";
    case "open":
      return "#/open";
    case "positions":
      return route.address ? `#/positions?address=${route.address}` : "#/positions";
    case "position":
      return `#/position/${route.id.toString()}`;
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
