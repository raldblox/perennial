# 006 — Where real yield could come from, and an ERC-4626 adapter

Status: accepted · 16 November 2026

## Context

[Decision 002](002-yield-source.md) shipped a fixed-rate mock and left the real
source as future work. Before adding one, this records what actually pays a
return on the QoreChain testnet today and whether a Solidity contract, which
is what holds a position's principal, can reach it.

## What exists

Checked on 15 and 16 November 2026 against the docs and the live testnet REST
API (`api-testnet.qore.host`).

| Source | Yield | On the testnet | Reachable from an EVM contract |
|---|---|---|---|
| Native AMM pools (`x/amm`), e.g. pool 2, fUSD (`erc20:0x9714…63CA`) against `uqor` | Real: a 0.30% swap fee stays in the pool for liquidity providers. Test tokens, no value | Live: `/qorechain/amm/v1/pools` lists pools 1 to 4 and more; pool 2 held 621.70 fUSD and 7,292.66 QOR | **No.** There is no AMM precompile, swaps and liquidity are native-lane messages that need a hybrid ML-DSA-87 signature, and LP shares are neither bank coins nor ERC-20 tokens |
| Staking and delegation (`x/staking`, `x/distribution`) | Real mechanism, rewards from emission and fees; no live APR is published, and the docs say the testnet mints nothing more | Live | **No.** The staking (`0x0800`) and distribution (`0x0801`) precompiles are not in `active_static_precompiles` |
| Time-locked staking bonus (`x/stakingtier`) | Pool-funded bonus; `/qorechain/stakingtier/v1/apr` reported a gross base APR of 0 (`source: fees_only`) | Live | **No.** Native messages only |
| Lending | None found | — | — |
| Liquid staking token | None found | — | — |
| ERC-4626 vaults (the Asset Kit's restricted-share vault) | Not a yield source: no interest or fee mechanism documented | No deployed address documented | Yes, in principle: it is an EVM contract |
| CrossVM bridge precompile (`0x0901`) | Not a yield source | Active, with an allowlist | Only to allowlisted CosmWasm targets; EVM targets are refused; none is documented as paying yield |

Active static precompiles on 16 November 2026: `0x0901`, `0x0C01`, `0x0A01`,
`0x0A02`. `0x0C01` is not identified on the pages read; nothing suggests it
pays yield.

Sources: <https://docs.qorechain.io/architecture/amm>,
<https://docs.qorechain.io/developer-guide/evm-precompiles>,
<https://docs.qorechain.io/developer-guide/cross-vm-interoperability>,
<https://docs.qorechain.io/user-guide/staking-and-delegation>,
<https://docs.qorechain.io/architecture/tokenomics>,
<https://docs.qorechain.io/developer-tools/asset-kit>.

**Conclusion: nothing on QoreChain today pays a real return that a Solidity
contract can collect.** Every live source is on the native lane.

## Decision

- Keep `IYieldSource`. It is already a subset of ERC-4626 with the same
  signatures and rounding, so a conforming ERC-4626 vault can be used as a
  source directly; a test proves it with OpenZeppelin's implementation.
- Ship `ERC4626Source`, an adapter for when a bare ERC-4626 is not enough. It
  keeps its own ledger of shares per depositor, refuses a deposit that would
  mint no shares (the donation or rounding loss on a small or manipulated
  vault), checks `maxDeposit` and `maxRedeem` and fails with clear errors, and
  fixes the asset at deployment. It adds no yield.
- Keep the testnet on `MockYieldSource`, said plainly everywhere: its rate
  is simulated and paid from a pre-funded reserve. One vault's source pays
  nothing, as QoreChain does today; another is simulated at a real reference
  rate (Aave v3 USDC's 30-day mean, decision 008), never a return it earns.
- Deploy a second vault on a mock with an **accelerated testnet rate**, so a
  small deposit visibly pays several calls a minute in a demonstration. It is
  labelled as accelerated on every screen that shows it and is never
  presented as a return.
- Do not build a native-lane yield bridge. It would need a contract on the
  native lane, an allowlisted CrossVM route and an operator, which is a
  custodian under another name.

## Consequences

- When an ERC-4626 vault with a real strategy is deployed on QoreChain, a new
  Perennial vault can use it, directly or through the adapter, with no change
  to the vault.
- Until then, every yield figure on the testnet is simulated, and the README,
  the app and the threat model say so.
- A real ERC-4626 can lose value. The vault then pays nothing until it
  recovers and never tops up the principal (tested against the adapter).
- Sources on other EVM chains, and the Aave adapter, are
  [decision 008](008-yield-sources-on-other-chains.md).
