/// <reference types="vitest" />
import react from "@vitejs/plugin-react";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// The chain's REST API and CometBFT RPC send no CORS headers, so a page can
// reach them only through its own origin. The dev and preview servers forward
// these paths; a production host must do the same for the EVM window to be
// read and opened from the page (see README). The EVM JSON-RPC allows any
// origin and is called directly.
const forward = (prefix: string, target: string) => ({
  [prefix]: {
    target,
    changeOrigin: true,
    rewrite: (path: string) => path.slice(prefix.length) || "/",
  },
});
const proxy = {
  ...forward("/qore/rest", "https://api-testnet.qore.host"),
  ...forward("/qore/rpc", "https://rpc-testnet.qore.host"),
};

const localClient = fileURLToPath(new URL("../packages/perennial/src/index.ts", import.meta.url));

export default defineConfig({
  plugins: [react()],
  // The vault client is @pq-apps/perennial from npm. In a checkout of the whole repository
  // the app builds it from source instead, so a change there shows here at once; a host that
  // uploads only app/ (Vercel) uses the published package.
  resolve: existsSync(localClient)
    ? { alias: { "@pq-apps/perennial": localClient }, dedupe: ["viem"] }
    : { dedupe: ["viem"] },
  server: { port: 5173, proxy },
  preview: { port: 4173, proxy },
  // The signer chunk carries the QoreChain SDK and loads only when an account is unlocked.
  build: { target: "es2022", sourcemap: true, chunkSizeWarningLimit: 3_000 },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: false,
    // Tests run against the fake chain, with addresses of their own, whatever is deployed.
    env: {
      VITE_VAULT_ADDRESS: "0x00000000000000000000000000000000000a6e01",
      VITE_VAULT_DEPLOY_BLOCK: "10149536",
      VITE_NOYIELD_VAULT_ADDRESS: "0x00000000000000000000000000000000000a6e02",
      VITE_NOYIELD_VAULT_DEPLOY_BLOCK: "10149536",
      VITE_DEMO_VAULT_ADDRESS: "0x00000000000000000000000000000000000a6e03",
      VITE_DEMO_VAULT_DEPLOY_BLOCK: "10149554",
    },
  },
});
