# Deployments

QoreChain testnet (`qorechain-diana`, EVM chain id 9800). The explorer has no
source verification, so this file records what was deployed, from which
commit, with which compiler settings, and how to check the bytecode yourself.

## Current deployment

Not deployed yet. The three vaults (no yield, simulated 5%, accelerated
testnet rate) are deployed from this branch once the deployer holds enough
QOR; their addresses, transactions and blocks go here.

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
git checkout a35708b -- src foundry.toml
forge build
cast code 0xbE25A982f41182aA68000110933337fDd5931289 --rpc-url qorechain_testnet
```

Compare the result with `deployedBytecode.object` in
`out/PerennialVault.sol/PerennialVault.json`. They differ only at the
`immutableReferences` positions, which hold the asset and source addresses.
This was checked for both the accelerated vault and the 5% mock on
16 November 2026: identical apart from the immutables.
