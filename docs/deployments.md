# Deployments

QoreChain testnet (`qorechain-diana`, EVM chain id 9800). The explorer has no
source verification, so this file records what was deployed, from which
commit, with which compiler settings, and how to check the bytecode yourself.

## Current deployment

Deployed 16 November 2026 (UTC) by
`0x825c2e0282c4681fad2f99F514d3D3003cd27432`. Every rate below is simulated:
the sources are `MockYieldSource`, paying from a test reserve the deployer
funded, and nothing earns it (decision 006).

| Contract | Address | Deployment transaction | Block |
|---|---|---|---|
| PerennialVault, **no yield** | `0x76DAC5461fF361f911e5F39810c9455a6180C180` | `0x8c384425d22c85279654aa4ec90e427f7005038775cc8401f80be35a4a63deff` | 10,202,926 |
| MockYieldSource, pays nothing (rate 0) | `0xcF067585a36b91EaA2F4F943De503357536F5135` | `0xd6cb3d9cb4394df643ab2a16a4f499c197bc3020bfab1e9b092e1ef582c51769` | 10,202,924 |
| PerennialVault, **simulated at the Aave v3 USDC rate of 16 November 2026** | `0x78075C631D41AF72c69e34120d5C33cDC7A66A71` | `0xc2e91d2f59a477720e860a4ef49c89961f5019822afb26172df09cfdff7a4c6c` | 10,203,526 |
| MockYieldSource, 4.29% a year: Aave v3 USDC's 30-day mean on Ethereum on 16 November 2026 (DefiLlama) | `0x9f9271A64A1e3B28Ca5b9461C7E38e711D3F7BCB` | `0x6a426d3d35b00a1848a0e80df4ba6a20ca21a34624886162bf20d330aac57070` | 10,203,519 |
| PerennialVault, **accelerated testnet rate, simulated, not a return** | `0x496AAa4D585B97c8a26095D97Af4bBfAd473798c` | `0xec85677032505003dcb706c5d00e2d960a1371b80c4223169e19a64ee1979913` | 10,203,015 |
| MockYieldSource, 15,768% a year, for demonstrations | `0x391E1a4E6dA05E59D85A13cd7cd46eA7D292675f` | `0x24bc82d7cc3ba29b33b103bd94e7de2697071da6e25c97cd5aad56539dbe767c` | 10,202,951 |

Constructor arguments: each vault takes `(asset, source)` with asset fUSD
`0x97143B771D34ddb9130b807b135Ae675A5a963CA`; each mock takes
`(asset, ratePerYear)` with `ratePerYear` `0`, `0.0429e18` and `157.68e18`.
`contracts/src` is the same at both deployment commits, `e1460cb` (no-yield and
accelerated vaults) and `f041fd2` (the vault simulated at the Aave v3 USDC rate). The
deployer is each mock's `FUNDER`, the only account that can take back
reserve no depositor is owed (`reclaim`).

Reserves funded at deployment (from the deployer, in fUSD):

| Source | Approve | Fund | Amount |
|---|---|---|---|
| no yield | none | none | 0 |
| Aave v3 USDC rate | `0x248a3a0b41efcf9d9803af9f99c4a3d96780159f1294eba4678c51d1a6e0c5a3` | `0x4cbba094d0af9f464dd34b9eb92b74c4b9427824d9d24f4d727e232ba643fcb1` | 20 |
| accelerated | `0xfd3241d4af6fc8df9e3d5523c09710d41947da051d9c651a2c1436320674be16` | `0x7a3b2a26b5b17a08eceb39114524c956d12096f21da5d552044060dd7e9082ba` | 60 |

The accelerated vault was deployed in a second window, against its already
funded source, after the first window's value limit ran out. The vault
simulated at the Aave v3 USDC rate replaced a first one at a round 5%
(retired below); that one's 20 fUSD reserve was taken back with `reclaim`
(`0xcf400bcb13130e9edee3e146aa11bf65f66a3c599f053bdfceae25cf3198cdce`,
`script/Reclaim.s.sol`) and funds the new source. All transactions
succeeded.

The simulated rate is a reference, not a return this vault earns: rates
like it are paid on other chains, vary, and carry their protocols' risks;
they are the planning assumption for a later deployment on a chain where
such vaults exist, which is what the ERC-4626 and Aave adapters are for.
`pnpm rates` in `app/` prints the current figures.

**The accelerated rate is not a return.** It exists so that a 20 fUSD deposit
visibly pays several 0.002 fUSD calls a minute in a demonstration. Its reserve
drains at that speed and must be refilled.

## Demo position

Position 1 of the accelerated vault (`0x496AAa4D585B97c8a26095D97Af4bBfAd473798c`),
opened on 22 November 2026 by the deployer with the app's own modules and left
open, so the live app shows a real control panel
([perennial-flax.vercel.app/#/position/demo/1](https://perennial-flax.vercel.app/#/position/demo/1)).
Terms: 20 fUSD; budget mode, 1 fUSD per week (`payoutInterval` 604,800 s);
buffer cap 0.048 fUSD, a day of one 0.002 fUSD call an hour; check-in period
30 days, grace 7 days; the owner can close; no heirs.

Each spend pays 0.002 fUSD to the deployer, signed with its ML-DSA-87 key;
its `ref` is the Keccak-256 hash of a sample inference request
(`POST /chat/completions` with a `request_id` from `req_0001` to `req_0003`,
then `POST /embeddings`, `req_0004`).

| Step | Transaction | `ref` |
|---|---|---|
| EVM window, scoped to the vault and fUSD (native) | `037A8210EE972DC14E14D0CB766EE66553D73F37F33B2015A393D2F78EBF0B01` | |
| Approve exactly 20 fUSD | `0xa4c137c89c334cc8e84bc90ceb16bff653c7e3af2afa1c4f115e7f7c975b2d9c` | |
| Open position 1 | `0xc2b40e1d0e7577db4308ee44db5c992254506670bb918f6c5896ebbad56faa8c` | |
| Spend #1 | `0xba68c77edd37eaed209a798d08d53747acfd114190172659a00375855f287398` | `0xb4165c49e93593217c16728d688ab16d5e23b61bc7f418aca4ba51e88ab3366e` |
| Spend #2 | `0x50b3e8cee538aa842f4f068d6c6556100d6d7167c2917582c663d5f95e904a5e` | `0x57d169958f8000f3d7e7ad3eab5f8b73e18385bc5e1ef9bc4d4ca1ae9e45c0dc` |
| Spend #3 | `0x0dd40d3687222a11fbc66b20b0f50d56c3f8d23697c24ed07e347eb19e0e3daa` | `0x9402415e31b1ac896644e8fea255fb427f197598b2f06b77fd4f2bfdde3b4999` |
| Spend #4 | `0xd64c01839a64a283f51c59ab31c156d6ff32589ffcf138c44bbebf6c455e09c0` | `0xc4a9e65545cc649ae8015eb4705eb9a978dfb8a166e1f15c3e4ac31b1b7aa6b3` |
| Close the EVM window (native) | `38FA5402E4CFF5C059B519C9DE578137C56561B04A32215713D86CAE9C01F4F5` | |

After the spends: principal 20.000000 fUSD, 0.008 spent in the current window,
0.992 fUSD of the week's budget left. Cost: 0.389 QOR.

## Earlier test deployments (retired)

The first row is the final contract at a round 5%, replaced by the vault
simulated at a real reference rate. The rest are test deployments of earlier
builds of the contract, before budget mode, `fund` and the final signing
domain tag. The app no longer reads them. Each of those mocks' reserves, checked on 16 November 2026, stays where it is: these mocks
have no function that returns a reserve (the `reclaim` selector is absent
from their deployed bytecode), and the only other way out, depositing and
collecting simulated yield, would cost QOR and would drain what backs the
one open position.

| What | Address | State on 16 November 2026 |
|---|---|---|
| PerennialVault, final contract, simulated at a round 5% | `0x5BB20552043Df7bC9df11d80BE4Ff024a67c2b16` (deployed in `0x91becb4abd1a73b2b1b3903417b4ffcbcfd951f9c490f644c1ca3b19fca10e8d`, block 10,202,942) | replaced the same day; no positions ever opened |
| MockYieldSource, 5% a year | `0x31fEB82cb0739E94700A0E8c24c44beEc5058653` | reserve of 20 fUSD reclaimed; holds 0 |
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
This was checked for all three current vaults and their mocks on
16 November 2026: identical apart from the immutables.
