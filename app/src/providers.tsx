import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { PublicClient } from "viem";
import { publicClient } from "./chain/client";
import { ChainContext } from "./state/queries";
import { SessionProvider } from "./state/session";

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: 2, refetchOnWindowFocus: true, staleTime: 10_000 } },
  });
}

export function Providers({
  children,
  client = publicClient,
  queryClient = makeQueryClient(),
}: {
  children: ReactNode;
  client?: PublicClient;
  queryClient?: QueryClient;
}) {
  return (
    <QueryClientProvider client={queryClient}>
      <ChainContext.Provider value={client}>
        <SessionProvider>{children}</SessionProvider>
      </ChainContext.Provider>
    </QueryClientProvider>
  );
}
