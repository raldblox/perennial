/// <reference types="vitest" />
import react from "@vitejs/plugin-react";
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

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy },
  preview: { port: 4173, proxy },
  build: { target: "es2022", sourcemap: true },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: false,
    passWithNoTests: true,
  },
});
