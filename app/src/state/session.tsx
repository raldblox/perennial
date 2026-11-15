/**
 * React access to the unlocked account. The signer module, and the QoreChain
 * SDK it carries, load only when someone unlocks. The account locks itself
 * after 15 minutes without input, and when the tab is closed.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { SessionAccount } from "../signer/session";

export const IDLE_LOCK_MS = 15 * 60 * 1000;

type SignerModule = typeof import("../signer/session");

export interface Session {
  account: SessionAccount | null;
  unlock: (phrase: string) => Promise<SessionAccount>;
  lock: () => void;
  /** The loaded signer module, or null while locked. */
  signer: SignerModule | null;
}

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children, loader }: { children: ReactNode; loader?: () => Promise<SignerModule> }) {
  const [account, setAccount] = useState<SessionAccount | null>(null);
  const [signer, setSigner] = useState<SignerModule | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const load = loader ?? (() => import("../signer/session"));

  const lock = useCallback(() => {
    signer?.lock();
    setAccount(null);
    setSigner(null);
    window.clearTimeout(timer.current);
  }, [signer]);

  const unlock = useCallback(
    async (phrase: string) => {
      const mod = await load();
      const next = await mod.unlock(phrase);
      setSigner(mod);
      setAccount(next);
      return next;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    if (!account) return;
    const reset = () => {
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(lock, IDLE_LOCK_MS);
    };
    const events = ["pointerdown", "keydown", "scroll", "focus"] as const;
    for (const e of events) window.addEventListener(e, reset, { passive: true });
    window.addEventListener("pagehide", lock);
    reset();
    return () => {
      for (const e of events) window.removeEventListener(e, reset);
      window.removeEventListener("pagehide", lock);
      window.clearTimeout(timer.current);
    };
  }, [account, lock]);

  const value = useMemo(() => ({ account, unlock, lock, signer }), [account, unlock, lock, signer]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession outside SessionProvider");
  return session;
}
