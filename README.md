# Perennial

[![contracts](https://github.com/raldblox/perennial/actions/workflows/contracts.yml/badge.svg)](https://github.com/raldblox/perennial/actions/workflows/contracts.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Built on QoreChain](https://build.qorechain.io/badge/perennial.svg)](https://build.qorechain.io/p/perennial)

![Perennial: deposit once, the yield pays your agent's calls](docs/assets/cover.png)

**Deposit once. The yield pays your agent's inference, call by call.**

## What it does

Perennial is a vault for an endowment with a living beneficiary. You deposit
fUSD once; it becomes the principal and is never spent. What it earns lands
in a buffer, and the beneficiary, typically an AI agent with its own account,
pays from that buffer for each model call it makes. **500 fUSD at 5% a year
pays for one 0.002 fUSD call every hour, for as long as the 5% holds** (1.24
an hour, exactly; 5,000 fUSD pays about twelve). On the QoreChain testnet,
where this runs, the 5% is simulated.

## Why

An agent that pays for its own inference needs money it can spend. Giving it
a funded wallet means giving it money it can lose. Perennial splits the roles:

- **You, the owner**, deposit once, with a key you can keep offline.
- **Your agent, the beneficiary**, has its own account and ML-DSA-87 key and
  can spend only the yield.
- **Your heirs**, for example you, get the income if the agent stops.

If the agent's key is stolen, the most it can take is what the buffer holds
at that moment, which the buffer cap bounds. Never the capital. And because
every one of those actions needs a post-quantum signature checked inside the
contract, a classical key, stolen or recovered by a quantum computer, moves
nothing. There is no admin, no custodian and no upgrade path.

## How it works

```mermaid
flowchart LR
    O[Owner] -->|deposit once| V[PerennialVault]
    V -->|principal| S[Yield source]
    S -->|harvest: yield only| V
    A[Agent's signed spend] -.->|relayed by anyone| V
    V -->|pays per call| M[Model provider]
    V -.->|above the cap| S
    V -.->|after succession| H[Heirs]
```

1. **Deposit.** The deposit is the position's *principal*. It goes into the
   yield source and is never paid out.
2. **Earn.** A harvest, which anyone can call, moves what the principal has
   earned into the position's *buffer*.
3. **Spend.** For each call, the agent signs
   `spend(positionId, to, amount, ref, deadline, signature)` with its
   ML-DSA-87 key: who is paid, how much, and a reference to the request.
   Anyone can submit it, so the agent needs neither QOR nor an EVM window; the
   vault pays from the buffer only and emits `Spent(positionId, to, amount, ref)`.
4. **Compound.** Yield above the position's buffer cap is added to the
   principal, so it keeps earning and can never be spent. A spend, claim or
   check-in is proof of life; after the check-in period and a grace period of
   silence, anyone can trigger succession and the income goes to the heirs.

**Sizing.** For `C` a year of calls at yield rate `r`, deposit
`P = k · C / r` with a margin `k` (1.15 lets the yield fall 13% before calls
go unpaid). One 0.002 call an hour is 17.52 a year, so `P` is 402.96 at 5%.

### Who can do what

| Action | Authorised by | Notes |
|---|---|---|
| `open`, `topUp` | the caller's own tokens | the beneficiary must hold a proven ML-DSA-87 key |
| `harvest` | anyone | yield lands in the buffer, above the cap in the principal |
| `spend` | beneficiary's ML-DSA-87 signature | over `(to, amount, ref)`; from the buffer only; counts as a check-in |
| `claim` | beneficiary's ML-DSA-87 signature | the schedule's amount, to the beneficiary itself |
| `checkIn` | beneficiary's ML-DSA-87 signature | |
| `setHeirs` | beneficiary's ML-DSA-87 signature | over the hash of the new list |
| `triggerSuccession` | anyone, after the deadline | cannot be undone |
| `distribute` | anyone, after succession | heirs and weights are frozen |
| `closeByOwner` | owner's ML-DSA-87 signature | only if the right was kept at opening |

A signed action is bound to the chain, the vault, the position, the action,
a nonce and a deadline ([decision 001](docs/decisions/001-pq-signed-actions.md)).
`spend` is [decision 005](docs/decisions/005-spend.md), the buffer cap is
[decision 004](docs/decisions/004-buffer-cap.md), and what all this protects
against is in the [threat model](docs/threat-model.md).

## Other uses

The same vault pays people on a schedule: a public good's fixed bill (10 a
month needs 2,760), a maintainer's stipend (100 a month, 27,600), a parent's
allowance passing to the children (250 a month, 69,000). Each at 5% with a
1.15 margin.

## Status

| Part | State |
|---|---|
| Contracts | Version 2 with `spend` and the buffer cap; 140 tests including fuzz and invariant tests; an ERC-4626 source adapter |
| Testnet | Version 2 deployed on `qorechain-diana`; spends made live with real ML-DSA-87 signatures |
| Web app | Fund an agent, a control panel per position, an in-page QOR to fUSD swap; 128 tests |
| Review | Not audited. The AI review record is ready in [docs/AUDIT.md](docs/AUDIT.md) |

### Testnet addresses

QoreChain testnet (`qorechain-diana`, EVM chain id 9800). Transactions,
constructor arguments and compiler settings are in
[docs/deployments.md](docs/deployments.md).

| What | Address |
|---|---|
| PerennialVault, version 2 (5% source) | `0xf8e6a785c718b4b41A4EfDa288c72A3A85c0D1f4` |
| MockYieldSource, 5% a year (simulated) | `0x3928b2a863eE86B6AEFc7afe3e3e3d117De17e9a` |
| PerennialVault, version 2 (demo, accelerated testnet rate) | `0xbE25A982f41182aA68000110933337fDd5931289` |
| MockYieldSource, accelerated testnet rate (simulated, not a return) | `0xf66B6cC12CE9f20E9400AB1580976d227b5E1BB8` |
| PerennialVault, version 1 (no spend, read-only from the app) | `0x2fB3057c42fB97964F5a86fD20ecD90969d06593` (`qor197es2lzzlwtevn66sm7jpmxep95aqevnrhsh9w`) |
| MockYieldSource for version 1, 5% a year (simulated) | `0xBcC4ABe0B3aBfABa14eA1eFDBE5c87035f167f17` (`qor1hnz2hc9n40at5982rm7muhy8qd03vlchx773pc`) |
| Asset (fUSD) | `0x97143B771D34ddb9130b807b135Ae675A5a963CA` |
| Deployer | `0x825c2e0282c4681fad2f99F514d3D3003cd27432` (`qor1sfwzuq5zc35pltf0n863f57nqq7dyapj6gqlyg`) |
| Adversarial test account | `0x38FbFDdAE9E53fFb221c0b7E8dF993dC8C75917c` (`qor18ralmkhfu5llkgsupdlgm7vnmjx8tytunvzdqe`) |

The adversarial test account exists to be attacked: treat its secp256k1
private key as compromised. Its savings sit in position 2 of the version 1
vault. With the classical key alone nobody can claim, check in, change its
heirs or close the position, and it keeps no EVM window open, so that key
cannot move its QOR either.

`pnpm e2e <vault>` in `contracts/` opens a position on a live vault, checks
in, claims, spends from the buffer and closes with real ML-DSA-87 signatures,
and confirms that a forged, a mismatched and a replayed signature, and a
spend to a different recipient, are each refused.

### What is simulated

- **The yield.** Each vault's principal sits in `MockYieldSource`, which pays
  a fixed rate out of a reserve someone funded. Nothing earns it. Nothing on
  QoreChain pays a real return a Solidity contract can collect today: AMM
  fees, staking and staking tiers are native-lane only
  ([decision 006](docs/decisions/006-yield-sources.md)). When a real
  ERC-4626 vault exists, a new vault can use it, directly or through
  `ERC4626Source`.
- **The demo rate.** The demo vault's source pays 15,768% a year so that
  20 fUSD visibly pays about 2.6 calls a minute in a demonstration. It is a
  test setting, never a return, and is labelled wherever it appears.
- **The tokens.** fUSD is the testnet's dollar token. It has no value.
- **The precompiles, in unit tests only.** Foundry's local EVM does not have
  QoreChain's PQC precompiles, so unit tests run against a mock of them. Real
  ML-DSA-87 verification happens on the chain, in the end-to-end script and
  in the app.

**Where it runs.** The precompiles Perennial depends on are active on the
QoreChain testnet and not on mainnet. The contracts have not been audited.

## The web app

`app/` is a static React app. **Fund an agent** sizes a deposit from calls an
hour and a price per call, sets the buffer cap (a day of calls by default),
and opens the position. Each position has a **control panel**: health
(buffer runway at the last day's spending, earning against spending, the
check-in deadline), a ledger of every harvest, spend, claim, top-up and
compounding with its transaction and reference, and controls to send a
signed payment, add principal, claim, change heirs and close. Every screen
reads without an account. An account panel can swap up to 1 QOR for fUSD in
the native AMM.

**How it signs.** The QoreX wallet cannot yet sign arbitrary bytes or EVM
transactions for a web page, so the app derives the account's keys from a
recovery phrase typed into the page, keeps them in that tab's memory only, and
shows the exact bytes before every signature. Whoever controls the page's code
while it is unlocked can sign as that account: use a testnet-only phrase
([decision 003](docs/decisions/003-browser-signing.md)).

```sh
cd app
pnpm install
pnpm dev          # http://localhost:5173
pnpm test         # unit and component tests, chain mocked
pnpm build        # static output in app/dist
pnpm preview      # serve the build, with the native API forwarded
```

Configuration (chain, RPC, vaults, asset, AMM pool) is in
`app/src/config.ts`, with the testnet deployment as the default and `VITE_`
overrides listed in `app/.env.example`. All wording is in `app/src/copy.ts`.

**Hosting.** The build is static and holds no secrets. Reading the vaults and
sending transactions use the EVM JSON-RPC, which accepts any origin. Reading
and opening the account's EVM window, and the swap, use the chain's REST API
and CometBFT RPC, which refuse cross-origin requests, so the host must forward
`/qore/rest/*` to `https://api-testnet.qore.host/*` and `/qore/rpc` to
`https://rpc-testnet.qore.host/` (the dev and preview servers do), or
`VITE_REST_URL` and `VITE_RPC_URL` must point at a proxy that does. Without
that, the app still works, and says how to open the window in the QoreX app or
with `pnpm window open`, and to swap with `pnpm swap`.

`pnpm brand` in `app/` redraws the cover image, the link preview and the
icons from the design tokens.

## Quickstart (contracts)

Requires [Foundry](https://getfoundry.sh), Node.js 20 or later and pnpm.

```sh
git clone --recurse-submodules https://github.com/raldblox/perennial
cd perennial/contracts
pnpm install
forge test
```

### Deploy to the testnet

On QoreChain an account can send EVM transactions only after it has
registered an ML-DSA-87 key and opened an EVM authorisation window. A window
scoped to contracts refuses contract creation, so deploy under a small
unscoped window and close it right after.

```sh
cp .env.example .env        # set QORE_MNEMONIC, or PRIVATE_KEY with a recovery code
pnpm window status          # shows the account, its key and its window
pnpm window register        # once per account
pnpm window open
pnpm deploy:dry-run         # simulation only
pnpm deploy:testnet
pnpm window close
pnpm swap 1                 # optional: 1 QOR for fUSD in the native AMM, converted for contracts
```

Use a testnet-only account. Never commit `.env`.

## Repository

```
contracts/
  src/PerennialVault.sol          the vault
  src/libraries/PQCAuth.sol       ML-DSA-87 key lookup and signature check
  src/adapters/ERC4626Source.sol  guarded adapter for real ERC-4626 vaults
  src/interfaces/                 PQC precompiles, yield source
  src/mocks/MockYieldSource.sol   fixed-rate source for tests and testnet
  script/Deploy.s.sol             deployment
  scripts/window.ts               key registration and EVM window helper
  scripts/e2e.ts                  end-to-end run against a live vault
  scripts/swap.ts                 QOR to fUSD in the native AMM
  test/                           unit, fuzz and invariant tests
app/
  src/config.ts                   chain, endpoints, vaults and addresses
  src/copy.ts                     every word the app shows
  src/chain/                      vault reads, writes, events, error decoding
  src/signer/session.ts           the unlocked account's keys, in memory
  src/lib/                        exact amounts, sizing, schedule, heirs, swaps
  src/pages/, src/components/     the screens
  scripts/brand.ts                cover image, link preview and icons
docs/
  qorechain-notes.md              what the protocol relies on from the chain
  deployments.md                  addresses, transactions, compiler settings
  threat-model.md                 assets, actors, trust, limitations
  AUDIT.md                        AI contract review record
  decisions/                      design decisions
```

## Credits

- [QoreChain](https://qorechain.io): the ML-DSA-87 precompiles, the native
  AMM, the SDK (`@qorechain/sdk`, `@qorechain/evm`), `@qorechain/pqc`,
  `@qorechain/qorex-rainbowkit` and
  [`create-qorechain-dapp`](https://www.npmjs.com/package/create-qorechain-dapp),
  whose Foundry template the contracts tooling and `scripts/window.ts` start
  from, and whose `viem-wagmi` template the app starts from (Apache-2.0).
- [OpenZeppelin Contracts](https://github.com/OpenZeppelin/openzeppelin-contracts) (MIT),
  including the ERC-4626 implementation the adapter is tested against.
- [Foundry](https://github.com/foundry-rs/foundry) and
  [forge-std](https://github.com/foundry-rs/forge-std) (MIT / Apache-2.0).
- [CosmJS](https://github.com/cosmos/cosmjs) (Apache-2.0).
- [viem](https://viem.sh), [wagmi](https://wagmi.sh) and
  [RainbowKit](https://rainbowkit.com) (MIT).
- [React](https://react.dev), [TanStack Query](https://tanstack.com/query),
  [Vite](https://vite.dev), [Vitest](https://vitest.dev),
  [Testing Library](https://testing-library.com),
  [ESLint](https://eslint.org) and
  [typescript-eslint](https://typescript-eslint.io) (MIT).
- [satori](https://github.com/vercel/satori) and
  [resvg-js](https://github.com/thx/resvg-js) (MPL-2.0), for the images.
- Fonts, bundled through [Fontsource](https://fontsource.org):
  [Source Serif 4](https://github.com/adobe-fonts/source-serif) and
  [IBM Plex](https://github.com/IBM/plex) (SIL Open Font License 1.1).

## License

[MIT](LICENSE)
