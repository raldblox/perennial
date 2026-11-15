# Deployments

QoreChain testnet (`qorechain-diana`, EVM chain id 9800). The explorer has no
source verification, so this file records what was deployed, from which
commit, with which compiler settings, and how to check the bytecode yourself.

## Version 2 (current)

Deployed 16 November 2026 from commit `a35708b` (the contracts are unchanged
since `16d5824`), by `0x825c2e0282c4681fad2f99F514d3D3003cd27432`.

| Contract | Address | Deployment transaction | Block |
|---|---|---|---|
| PerennialVault (5% source) | `0xf8e6a785c718b4b41A4EfDa288c72A3A85c0D1f4` | `0xca8d5831b46fe760ee397502e64bae72de81e33b8f89e0991d6fcae9278428f9` | 10,149,536 |
| MockYieldSource, 5% a year (simulated) | `0x3928b2a863eE86B6AEFc7afe3e3e3d117De17e9a` | `0x1f60b0d804fe7d24a1589f273acb482a7049e8912054acc6d92edea7a547b535` | 10,149,530 |
| PerennialVault (accelerated testnet rate) | `0xbE25A982f41182aA68000110933337fDd5931289` | `0x287d7aaace49c6fb0cbf378c71ffe721360de5454549d05306742bce7d3670df` | 10,149,554 |
| MockYieldSource, accelerated testnet rate (15,768% a year, simulated, for demonstrations) | `0xf66B6cC12CE9f20E9400AB1580976d227b5E1BB8` | `0xd93c31ff4821c542d6e4252a4d5575b4d8d97233ad11379728967cc7966049cc` | 10,149,548 |

Constructor arguments: each vault takes `(asset, source)` with asset fUSD
`0x97143B771D34ddb9130b807b135Ae675A5a963CA`; each mock takes
`(asset, ratePerYear)` with `ratePerYear` `0.05e18` and `157.68e18`.

Reserves funded at deployment (from the deployer, in fUSD):

| Source | Approve | Fund | Amount |
|---|---|---|---|
| 5% | `0x23caf66cdecd9e22d5e6b5f055394a2e0376ad544fa5516582b66178dbb4ef78` | `0xdb6b9936d09f121cf33505617c32db70df9ce09932e8a6d5960b945e96d5f859` | 20 |
| accelerated | `0xe84a85ad64d062c6668a773855fd8e0e49228fd2dc704c7bef389889974ec2d5` | `0xfab272a967d756b501aa0065250a33165b7d1063797ccda723a3162d5f9133f6` | 60 |

**The accelerated rate is not a return.** It exists so that a 20 fUSD deposit
visibly pays several 0.002 fUSD calls a minute in a demonstration. Its reserve
drains at that speed and must be refilled.

End-to-end run on the accelerated vault (`pnpm e2e`, position 1): open
`0xe383ff8dd995c30d70f15c181164fde63d840014b8161cf2ce90cb17d1f33f52`,
check-in `0xe929de2e0c21a13ca6023d7f46b7a1c3b3d05d108806ac7cc10fae6caba0fa69`,
claim `0x1f6153f691389174ae00a86c984a2c1a182430351f261e9740221032d2b80a77`,
spend `0xca75794426689963e16a69c7133c44ad8404e72756387cce72050703c11f7558`
(emits `Spent` with `ref = keccak256("perennial e2e spend")`), close
`0xcc1d8fc108d6b94cea2f1fd1230abe9a27a16edb1c8741ecebcabb3cd12ed511`.

## Version 1 (read-only from the app)

| Contract | Address |
|---|---|
| PerennialVault | `0x2fB3057c42fB97964F5a86fD20ecD90969d06593` (deployed at block 10,124,332) |
| MockYieldSource, 5% a year | `0xBcC4ABe0B3aBfABa14eA1eFDBE5c87035f167f17` |

Version 1 has no buffer cap and no `spend`. It stays deployed and is not
written to again by this project.

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
