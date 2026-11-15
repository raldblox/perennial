# 002 — One asset and one ERC-4626-shaped yield source per vault

Status: accepted · 15 November 2026

## Context

The principal of a position has to sit somewhere that earns. Staking on
QoreChain is Native-lane only and not reachable from Solidity, so the source
must be an EVM contract.

## Decision

- A vault is deployed for **one asset and one yield source**, both immutable.
  Supporting another asset or source means deploying another vault. This
  keeps every position's accounting in one unit and leaves nothing to
  configure after deployment, so there is no admin.
- The source is addressed through `IYieldSource`, a five-function subset of
  ERC-4626 (`asset`, `deposit`, `redeem`, `previewWithdraw`,
  `convertToAssets`). Any ERC-4626 vault already satisfies it.
- The repository ships `MockYieldSource`, which accrues at a fixed rate from
  a pre-funded reserve. It is what the tests and the testnet deployment use.
- Fee-on-transfer and rebasing assets are not supported; `open` and `topUp`
  reject a transfer that delivers less than requested.

## Harvest rule

The vault holds the source's shares per position. To harvest it keeps exactly
the shares needed to withdraw the principal, `previewWithdraw(principal)`
(which rounds up), and redeems the rest into the position's buffer. Rounding
therefore always favours the principal.

## Consequences

- The yield on the testnet deployment is simulated. A real source (an
  ERC-4626 vault over an AMM pool is the likely candidate) is future work and
  needs no change to the vault.
- A source that loses value leaves a position under its principal. Harvest
  then yields nothing until the value recovers; the vault never tops the
  principal up from buffers.
