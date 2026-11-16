# 008 — Yield sources on other EVM chains

Status: accepted · 16 November 2026

## Context

[Decision 006](006-yield-sources.md) found nothing on QoreChain that pays a
real return to a Solidity contract. The owner plans to deploy Perennial on
other EVM chains later, where lending markets and savings vaults exist. This
records what the vault can use there and what it needs to do so.

## Decision

- Keep `IYieldSource`. It is a subset of ERC-4626, so any conforming ERC-4626
  vault is a source with no code, and `ERC4626Source` adds a per-depositor
  ledger and guards on top of one.
- Add `AaveV3Source` for Aave V3 markets, which are not ERC-4626: Aave pays
  interest as a growing aToken balance. The adapter is an ERC-4626 vault over
  one aToken. Deposits are supplied to the Pool at once, withdrawals are taken
  from it, `totalAssets` is the aToken balance, and shares carry six extra
  decimals against the share-inflation attack. It checks at deployment that
  the aToken belongs to the given asset and Pool.
- The vault never redeems a source for zero assets, and both adapters write
  off dust worth zero without calling the market. Aave reverts on a zero
  withdrawal and Solmate-style vaults revert on a zero-asset redeem; either
  would otherwise block every claim, spend and close of the position.

## Sources that are ERC-4626 already

Each was checked on 16 November 2026 by reading `name()`, `asset()` and
`previewRedeem` from Ethereum mainnet. None of these, and neither adapter, is
deployed on the QoreChain testnet, where none of these markets exists.

| Source | Kind | Mainnet address | Asset | Notes |
|---|---|---|---|---|
| Savings Dai (sDAI) | Savings rate | [`0x83F2…BEeA`](https://etherscan.io/address/0x83F20F44975D03b1b09e64809B757c47f942BEeA) | DAI | [Spark docs](https://docs.spark.fi/user-guides/earning-savings/sdai). Run through `ERC4626Source` in the fork test |
| Savings USDS (sUSDS) | Savings rate | [`0xa393…7fbD`](https://etherscan.io/address/0xa3931d71877C0E7a3148CB7Eb4463524FEc27fbD) | USDS | [Spark docs](https://docs.spark.fi/user-guides/earning-savings/susds), [Sky docs](https://docs.sky.money/) |
| Staked USDe (sUSDe) | Staked dollar | [`0x9D39…3497`](https://etherscan.io/address/0x9D39A5DE30e57443BfF2A8307A4256c8797A3497) | USDe | [Ethena docs](https://docs.ethena.fi/solution-design/staking-usde). `cooldownDuration()` read 86,400 seconds; while a cooldown is set, a direct `redeem` is refused and assets come out only through a separate two-step cooldown, so a position on it could not pay or close. Not suitable without a separate design |
| MetaMorpho vaults, e.g. Steakhouse USDC | Curated lending | [`0xBEEF…64CB`](https://etherscan.io/address/0xBEEF01735c132Ada46AA9aA4c54623cAA92A64CB) | USDC | [Morpho docs](https://docs.morpho.org/learn/concepts/vault). Each vault has its own curator and markets |
| Yearn V3 vaults, e.g. USDC-1 yVault | Strategy vault | [`0xBe53…6204`](https://etherscan.io/address/0xBe53A109B494E5c9f97b9Cd39Fe969BE68BF6204) | USDC | [Yearn docs](https://docs.yearn.fi/developers/v3/overview) |
| Aave V3 markets | Lending | Pool `0x8787…A4E2` | per market | **Not ERC-4626**: use `AaveV3Source`. [Aave docs](https://aave.com/docs/developers/smart-contracts/pool). Run through the adapter in the fork test |

The general standard is [EIP-4626](https://eips.ethereum.org/EIPS/eip-4626).

## Evidence

- `contracts/test/AaveV3Source.t.sol` runs the adapter against a mock Pool and
  aToken that keep scaled balances and a liquidity index with Aave's half-up
  ray rounding, treat `type(uint256).max` as "withdraw all" and reject a zero
  withdrawal, as the real Pool does.
- `contracts/test/fork/RealSources.t.sol` is optional. With `FORK_RPC_URL` set
  to an Ethereum mainnet RPC it opens a 10,000 position on Aave's real USDC
  market through `AaveV3Source` and on real sDAI through `ERC4626Source`, lets
  30 days pass, harvests and closes. A run on 16 November 2026 against a
  public RPC harvested 33.387775 USDC and 10.2155 DAI and returned the
  principal. Without the variable the suite is skipped, as in CI:

  ```bash
  FORK_RPC_URL=https://ethereum-rpc.publicnode.com forge test --match-path "test/fork/*" -vv
  ```

## Consequences

- Moving to a chain with any source above needs a new `PerennialVault`
  deployment pointed at it (or at an adapter over it); the vault itself does
  not change.
- A real source can lose value or freeze withdrawals. A loss means no yield
  and no top-up of the principal (decision 002); a freeze blocks claims,
  spends and closes of positions on it until it lifts. The choice of source
  is a choice of counterparty and should be shown to depositors.
- Budget mode works on every source: drawing on principal redeems shares
  through the same interface (decision 007, tested against Aave's mock).
