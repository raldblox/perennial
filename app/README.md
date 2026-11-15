# Perennial web app

A static React app for the Perennial vault on the QoreChain testnet: the
overview and sizing calculator, opening a position, and a page per position
with its deadlines, history and every vault action. Everything reads without
an account.

```sh
pnpm install
pnpm dev          # http://localhost:5173
pnpm typecheck
pnpm lint
pnpm test         # unit and component tests, chain mocked
pnpm build        # static output in dist/
pnpm preview      # serve dist/, with the chain's native API forwarded
pnpm brand        # redraw the cover image, link preview and icons
```

- Configuration: `src/config.ts`, overridable with the `VITE_` variables in
  `.env.example`. The defaults point at the testnet deployment.
- Wording: `src/copy.ts`. Design tokens: `src/styles/tokens.css`.
- Signing: the page derives an account's keys from a recovery phrase and keeps
  them in the tab's memory, because the QoreX wallet cannot yet sign arbitrary
  bytes or EVM transactions for a page. Read
  [decision 003](../docs/decisions/003-browser-signing.md) before using it,
  and use a testnet-only phrase.
- Hosting: the host must forward `/qore/rest/*` and `/qore/rpc` to the
  chain's REST API and CometBFT RPC for the page to read and open EVM windows
  (see the main README).

Started from the `viem-wagmi` template of
[`create-qorechain-dapp`](https://www.npmjs.com/package/create-qorechain-dapp)
(Apache-2.0).
