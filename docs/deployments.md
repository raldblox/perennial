# Deployments

QoreChain testnet (`qorechain-diana`, EVM chain id 9800). The explorer has no
source verification, so this file records what was deployed, from which
commit, with which compiler settings, and how to check the bytecode yourself.

## Current deployment

Deployed 16 November 2026 from commit `e1460cb` by
`0x825c2e0282c4681fad2f99F514d3D3003cd27432`. Every rate below is simulated:
the sources are `MockYieldSource`, paying from a test reserve the deployer
funded, and nothing earns it (decision 006).

| Contract | Address | Deployment transaction | Block |
|---|---|---|---|
| PerennialVault, **no yield** | `0x76DAC5461fF361f911e5F39810c9455a6180C180` | `0x8c384425d22c85279654aa4ec90e427f7005038775cc8401f80be35a4a63deff` | 10,202,926 |
| MockYieldSource, pays nothing (rate 0) | `0xcF067585a36b91EaA2F4F943De503357536F5135` | `0xd6cb3d9cb4394df643ab2a16a4f499c197bc3020bfab1e9b092e1ef582c51769` | 10,202,924 |
| PerennialVault, **5% a year, simulated** | `0x5BB20552043Df7bC9df11d80BE4Ff024a67c2b16` | `0x91becb4abd1a73b2b1b3903417b4ffcbcfd951f9c490f644c1ca3b19fca10e8d` | 10,202,942 |
| MockYieldSource, 5% a year | `0x31fEB82cb0739E94700A0E8c24c44beEc5058653` | `0xc059f36a114b4a0127a0a6e2b3ed43c055e57cfc7da0d41c3b028fd44cea7d9b` | 10,202,936 |
| PerennialVault, **accelerated testnet rate, simulated, not a return** | `0x496AAa4D585B97c8a26095D97Af4bBfAd473798c` | `0xec85677032505003dcb706c5d00e2d960a1371b80c4223169e19a64ee1979913` | 10,203,015 |
| MockYieldSource, 15,768% a year, for demonstrations | `0x391E1a4E6dA05E59D85A13cd7cd46eA7D292675f` | `0x24bc82d7cc3ba29b33b103bd94e7de2697071da6e25c97cd5aad56539dbe767c` | 10,202,951 |

Constructor arguments: each vault takes `(asset, source)` with asset fUSD
`0x97143B771D34ddb9130b807b135Ae675A5a963CA`; each mock takes
`(asset, ratePerYear)` with `ratePerYear` `0`, `0.05e18` and `157.68e18`. The
deployer is each mock's `FUNDER`, the only account that can take back
reserve no depositor is owed (`reclaim`).

Reserves funded at deployment (from the deployer, in fUSD):

| Source | Approve | Fund | Amount |
|---|---|---|---|
| no yield | none | none | 0 |
| 5% | `0x64598d28be8a507ebdc0ce71d95bfb7ac3c4020fd20c0da4ffce80a948553c8d` | `0xbcea1c570a7c96c5ad8a88e3604741f35ea51ed690203ad0b602e8b7f6919fe0` | 20 |
| accelerated | `0xfd3241d4af6fc8df9e3d5523c09710d41947da051d9c651a2c1436320674be16` | `0x7a3b2a26b5b17a08eceb39114524c956d12096f21da5d552044060dd7e9082ba` | 60 |

All ten transactions succeeded at 100 gwei, 1.236 QOR in fees. The
accelerated vault was deployed in a second window, against its already
funded source, after the first window's value limit ran out.

**The accelerated rate is not a return.** It exists so that a 20 fUSD deposit
visibly pays several 0.002 fUSD calls a minute in a demonstration. Its reserve
drains at that speed and must be refilled.

## Earlier test deployments (retired)

Test deployments of earlier builds of the contract, before budget mode,
`fund` and the final signing domain tag. The app no longer reads them. Each
mock's reserve, checked on 16 November 2026, stays where it is: these mocks
have no function that returns a reserve (the `reclaim` selector is absent
from their deployed bytecode), and the only other way out, depositing and
collecting simulated yield, would cost QOR and would drain what backs the
one open position.

| What | Address | State on 16 November 2026 |
|---|---|---|
| PerennialVault, 5% source | `0xf8e6a785c718b4b41A4EfDa288c72A3A85c0D1f4` (deployed in `0xca8d5831b46fe760ee397502e64bae72de81e33b8f89e0991d6fcae9278428f9`, block 10,149,536) | no positions ever opened |
| MockYieldSource, 5% a year | `0x3928b2a863eE86B6AEFc7afe3e3e3d117De17e9a` | reserve 20.000000 fUSD, stuck |
| PerennialVault, accelerated testnet rate | `0xbE25A982f41182aA68000110933337fDd5931289` (deployed in `0x287d7aaace49c6fb0cbf378c71ffe721360de5454549d05306742bce7d3670df`, block 10,149,554) | positions 1 and 2, the deployer's, both closed |
| MockYieldSource, 15,768% a year | `0xf66B6cC12CE9f20E9400AB1580976d227b5E1BB8` | reserve 59.989055 fUSD, stuck |
| PerennialVault, the first build (no `spend`, no buffer cap) | `0x2fB3057c42fB97964F5a86fD20ecD90969d06593` (block 10,124,332) | positions 1, 3 and 4, the deployer's, closed; position 2 belongs to a separate test account and is open, left untouched |
| MockYieldSource for the first build, 5% a year | `0xBcC4ABe0B3aBfABa14eA1eFDBE5c87035f167f17` | 549.999884 fUSD: position 2's principal (49.999177 shares) and the reserve that pays its simulated yield |

The reserve-funding and end-to-end transactions of the 5% and accelerated
deployments are in the git history of this file.

## Compiler settings

From `contracts/foundry.toml`:

| Setting | Value |
|---|---|
| Foundry | 1.3.5-stable |
| solc | 0.8.28 |
| EVM version | prague |
| Optimizer | on, 200 runs |
| via-IR | off |
| Bytecode hash | ipfs, CBOR metadata on |
| OpenZeppelin Contracts, forge-std | the submodule commits recorded in this commit |

## Check the bytecode

```sh
cd contracts
git checkout e1460cb -- src foundry.toml
forge build
cast code 0x76DAC5461fF361f911e5F39810c9455a6180C180 --rpc-url qorechain_testnet
```

Compare the result with `deployedBytecode.object` in
`out/PerennialVault.sol/PerennialVault.json`. They differ only at the
`immutableReferences` positions, which hold the asset and source addresses.
This was checked for all three vaults and all three mocks on 16 November
2026: identical apart from the immutables.
