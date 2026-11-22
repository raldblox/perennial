/**
 * A QoreX @handle typed where an address is expected: resolved, verified and
 * shown next to the address it stands for.
 */
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { config } from "../config";
import { handles as copy } from "../copy";
import { isHandleInput, pinRecipient, resolveRecipient, type ResolvedRecipient } from "../lib/handles";
import type { HeirDraft } from "../lib/heirs";
import { shortAddress } from "./ui";

function key(input: string) {
  return ["handle", input.trim().toLowerCase()] as const;
}

function options(input: string) {
  return {
    queryKey: key(input),
    queryFn: () => {
      if (!config.handles) throw new Error("handles off");
      return resolveRecipient(input, config.handles);
    },
    enabled: config.handles !== null && isHandleInput(input) && input.trim().length > 3,
    retry: false,
    staleTime: 60_000,
  };
}

/** The address a field stands for: the input itself, or the handle's verified address once accepted. */
function addressOf(input: string, resolved: ResolvedRecipient | undefined): string {
  if (!isHandleInput(input)) return input;
  return resolved && resolved.pin.status !== "CHANGED" ? resolved.address : "";
}

export function useRecipient(input: string) {
  const query = useQuery(options(input));
  return { address: addressOf(input, query.data), resolved: query.data, query };
}

/** Heir drafts with every accepted @handle replaced by its address, for validation. */
export function useResolvedHeirs(drafts: HeirDraft[]): { drafts: HeirDraft[]; resolved: ResolvedRecipient[] } {
  const results = useQueries({ queries: drafts.map((d) => options(d.address)) });
  return {
    drafts: drafts.map((d, i) => ({ ...d, address: addressOf(d.address, results[i]?.data) })),
    resolved: results.flatMap((r) => (r.data ? [r.data] : [])),
  };
}

/** Pins the handles the user has now seen and proceeded with. */
export function pinSeen(resolved: (ResolvedRecipient | undefined)[]): void {
  for (const r of resolved) if (r && r.pin.status === "new") void pinRecipient(r);
}

export function HandleHint({ input }: { input: string }) {
  const { query } = useRecipient(input);
  const client = useQueryClient();
  if (!isHandleInput(input)) return null;
  if (!config.handles) return <span className="small faint">{copy.off}</span>;
  if (query.isPending) return <span className="small faint">{copy.resolving}</span>;
  if (query.isError) return <span className="error">{query.error instanceof Error ? query.error.message : copy.failed}</span>;
  const r = query.data;
  const line = (
    <span className="small mono wrap-anywhere">
      @{r.handle} → {r.address} ({shortAddress(r.qorAddress)}) · {r.source === "evm" ? copy.sourceEvm : copy.sourceNative}
    </span>
  );
  if (r.pin.status === "CHANGED") {
    return (
      <span className="stack" style={{ gap: "var(--space-1)" }}>
        {line}
        <span className="error">{copy.changed(r.pin.previous.qorAddress, r.qorAddress)}</span>
        <span>
          <button
            type="button"
            className="button small quiet"
            onClick={() => void pinRecipient(r).then(() => client.invalidateQueries({ queryKey: key(input) }))}
          >
            {copy.accept}
          </button>
        </span>
      </span>
    );
  }
  return (
    <span className="stack" style={{ gap: "var(--space-1)" }}>
      {line}
      <span className="small faint">{r.pin.status === "match" ? copy.match : copy.firstSeen}</span>
    </span>
  );
}
