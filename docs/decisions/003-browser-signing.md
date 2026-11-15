# 003 — How the web app signs actions

Status: accepted · 15 November 2026

## Context

Claim, check-in, heir changes and owner close need an ML-DSA-87 signature, by
the role holder's registered key, over the bytes the vault's
`actionMessage(positionId, action, nonce, deadline, paramsHash)` returns
([decision 001](001-pq-signed-actions.md)). Every other write (approve, open,
top up, harvest, trigger succession, distribute) is an ordinary EVM
transaction, which on QoreChain needs a sender with a registered ML-DSA-87 key
and an open EVM window.

The web app must produce both from a browser. This record settles how, and
what the user has to trust as a result.

## Evidence

Read on 15 November 2026.

**The QoreX wallet cannot sign arbitrary bytes or EVM transactions for a page.**

- `@qorechain/qorex-types` 0.1.0 (published 27 October 2026), the typed
  description of what QoreX injects: on the native lane, `signArbitrary`
  "rejects with 'QoreX: signArbitrary not yet supported' before any prompt";
  `signDirect` signs only with the secp256k1 key; `signAndBroadcast` adds the
  hybrid ML-DSA-87 layer to a *native transaction* and broadcasts it, which is
  not a signature over arbitrary bytes. On the EVM lane, QoreX answers
  `eth_chainId`, `eth_accounts`, `eth_requestAccounts` and
  `wallet_switchEthereumChain`; every other method, including `personal_sign`
  and `eth_sendTransaction`, "rejects with 'QoreX: EVM method <name> not yet
  supported'".
- `@qorechain/qorex-rainbowkit` 0.1.0 README: "Signing methods such as
  `personal_sign`, `eth_signTypedData_v4` and `eth_sendTransaction` … are not
  supported yet."
- <https://github.com/qorechain/qorex-integrations> lists message signing
  (ADR-36 + ML-DSA-87) and EVM signing as planned, with no date.
- <https://docs.qorechain.io/qorex/dapp-browser>: message signing is not
  supported, and the EVM provider "does not sign or send EVM transactions or
  messages".
- No page documents a dApp opening an EVM window through `signAndBroadcast`;
  the window is opened in the QoreX app's settings, or with the SDK.

**The keys can be derived from the recovery phrase.** Measured against the
testnet with the deployer's phrase (only public values printed):

| Account of one phrase | Address form | `pqcKeyStatus` | Key derivable in the page |
|---|---|---|---|
| EVM account, `m/44'/60'/0'/0/0` | `0x825c…7432` | registered, ML-DSA-87, 2592-byte key, possession proven | yes: `deriveUnifiedAccount(phrase).pqc`, matches the registered key |
| Native account, `m/44'/118'/0'/0/0` (what QoreX shows) | `0x97F3…3da4` (its `0x` form) | registered, ML-DSA-87, 2592-byte key, possession proven | yes: `derivePqcCanonical(nativeAddress, phrase)` from `@qorechain/sdk`, matches the registered key |
| unused address | `0x…dEaD` | `(false, 0, 0x, false)` | — |

`pqcKeyStatus` takes the 20 address bytes, so a `qor1…` address and its `0x`
form are one account with one answer. The EVM account and the Native account of
one phrase are two accounts, each with its own key.

**The chain's native endpoints refuse browsers on other origins.** The EVM
JSON-RPC answers CORS preflights with `access-control-allow-origin: *`. The REST
API (`api-testnet.qore.host`) and the CometBFT RPC (`rpc-testnet.qore.host`)
send no CORS headers. A page can therefore read the vault, the token and
`pqcKeyStatus` (through `eth_call` to `0x…0A02`) and send EVM transactions, but
it cannot read or open an EVM window unless it is served together with a proxy
for those two endpoints.

## Options

1. **The QoreX wallet signs.** Best for the user, and unavailable: see above.
   The app must not depend on an unreleased API.
2. **A server signs or relays with its own key** (custodial relayer). The
   server would hold the authority the protocol exists to remove. Rejected.
3. **The user signs elsewhere and pastes the signature.** The page shows the
   exact bytes; a command-line tool signs them; the page relays. The phrase
   never enters the page, but the page still needs an account with a window to
   send the transaction, and every action becomes a copy-and-paste round trip.
4. **The recovery phrase is entered into the page and held in memory.** The
   page derives the EVM account and both ML-DSA-87 keys, signs the vault's
   bytes, sends the transactions itself, and, where the native endpoints are
   reachable, opens a window scoped to the vault and the token.

## Decision

Option 4, with these limits, all of them stated in the app where the phrase is
entered:

- **Reading needs nothing.** Every screen works without an account.
- **The phrase lives in one JavaScript variable of the open tab.** It is never
  written to storage, a cookie, the URL or the network, and never logged. It is
  dropped when the user locks the account, after 15 minutes without activity,
  and when the tab closes. Reloading the page forgets it.
- **The page signs only what it shows.** Before each signed action the page
  reads `actionMessage` from the vault, displays the action, the position, the
  nonce and the expiry, and signs only after the user confirms. Signatures
  expire after ten minutes.
- **The signer must match the chain.** Before signing, the page compares the
  public key it derived with the one `pqcKeyStatus` returns for the role
  holder, and refuses on a mismatch. It can sign for the phrase's EVM account
  and its Native account; any other beneficiary or owner must use another tool.
- **The transaction sender is the phrase's EVM account.** It needs a
  registered key and an open window. When the app is served with the REST and
  RPC proxy (the dev and preview servers do this), it shows the window and can
  open one scoped to the vault and the token, small in blocks, transactions and
  value. Without the proxy it says so and names the two ways to open one:
  the QoreX app, or `pnpm window open` in `contracts/` with
  `QORE_WINDOW_TARGETS` set.
- **A wallet connection is optional and read-only.** QoreX can be connected to
  look up positions for its account. It signs nothing.

## What the user trusts

- **The page's code**, completely, while the account is unlocked. Whoever
  controls the JavaScript the browser runs (the host, a compromised
  dependency, an injected extension) can read the phrase and sign anything as
  that account, including new heirs or a close. The ML-DSA-87 protection in the
  contract does not help against a page that holds the key.
- **The browser**, to keep one tab's memory from other sites.
- That is why the app warns: use a phrase made for the testnet and nothing else.

What the user does not trust: a server. There is none, and the static build
carries no secrets.

## Consequences

- The app works end to end today, on the testnet, with any account whose phrase
  the user has.
- It is not the security model the protocol aims for. When QoreX signs
  arbitrary bytes with ML-DSA-87 for a page, and sends EVM transactions, the
  phrase path should become a fallback and then be removed. The contract does
  not change: it verifies a signature, whoever makes it.
- Option 3 stays possible without any contract change and is the right tool for
  a key that must never enter a browser. It is not built yet.
- Hosting the app with window support needs a proxy for the REST and RPC
  endpoints; see the README.
