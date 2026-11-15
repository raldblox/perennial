# QoreChain notes

What Perennial relies on from the chain, with sources. Everything here was
read or measured on 15 November 2026 against the `qorechain-diana` testnet
(node v3.2.8). The testnet upgrades often, so re-check before relying on a
detail.

## Network

| | Testnet |
|---|---|
| Chain id | `qorechain-diana` |
| EVM chain id | `9800` |
| EVM RPC | `https://evm-testnet.qore.host` |
| REST | `https://api-testnet.qore.host` |
| RPC | `https://rpc-testnet.qore.host` |
| Fee denom | `uqor` (1 QOR = 1,000,000 uqor) |

Source: <https://docs.qorechain.io/getting-started>

## Post-quantum keys

- Every account registers one ML-DSA-87 public key (2592 bytes), once and
  explicitly. Signatures are 4627 bytes.
- A registration may carry a proof of possession. It is optional, so a
  registered key is only trustworthy when the account record also reports
  `possession_proven`.
- The key is derived from the account's mnemonic (or from a separate recovery
  code when the account is a bare private key), so it can be recovered.
- Keys can be rotated. A contract that stores a public key goes stale; a
  contract that reads the key at call time follows the rotation.

Source: <https://docs.qorechain.io/developer-guide/post-quantum-signing>

## PQC precompiles

| Precompile | Address | Gas |
|---|---|---|
| `pqcVerify(bytes pubkey, bytes signature, bytes message) → bool` | `0x0000000000000000000000000000000000000A01` | 25,000 + 8 per input byte (about 85–90k for ML-DSA-87) |
| `pqcKeyStatus(address) → (bool registered, uint8 algorithmId, bytes pubkey, bool possessionProven)` | `0x0000000000000000000000000000000000000A02` | 2,500 |

- Both are active on the testnet and **not** on mainnet. The live list is the
  `active_static_precompiles` parameter:
  `curl -s https://api-testnet.qore.host/cosmos/evm/vm/v1/params`.
- A call to an inactive precompile address succeeds and returns empty data.
  It does not revert. Callers must check the length of the return data and
  fail closed.
- `algorithmId` is `1` for ML-DSA-87.
- Measured: `pqcKeyStatus` for an account without a key returns
  `(false, 0, 0x, false)`. `pqcVerify` with empty inputs returns `false`
  rather than reverting, so a bad signature is reported as a value.
- Foundry's local EVM does not have these precompiles. Unit tests install a
  mock at the precompile addresses; real verification is exercised on the
  testnet by `contracts/scripts/e2e.ts`.
- Confirmed on 15 November 2026: `pqcVerify` accepts a signature made with
  `mldsa.sign` from `@qorechain/pqc` (deterministic, no context string) over
  the raw message bytes, against the key `pqcKeyStatus` returns.
- `forge script` runs twice: once on a local fork and once as an on-chain
  simulation, both on Foundry's own EVM. A constructor that calls a
  precompile fails in both. The deploy script therefore asks the node with
  `eth_call` whether the precompile is active, installs stand-ins for the
  local run, and is run with `--skip-simulation` so the node estimates gas.

Source: <https://docs.qorechain.io/developer-guide/evm-precompiles>

## EVM authorisation window

An Ethereum transaction carries one secp256k1 signature, so it cannot carry
the ML-DSA-87 signature the chain asks of every other transaction. An account
may therefore send EVM transactions only while it has an open **window**,
opened with a Native message that is hybrid-signed (secp256k1 + ML-DSA-87).

- A window bounds blocks, number of transactions and total value (value plus
  the maximum fee of each transaction, in uqor). It can be scoped to a list of
  `allowedTargets`.
- Opening a window advances the account's nonce. Read the EVM nonce after
  opening, not before.
- Deploying needs a window too.
- Within its bounds, a window admits anything the classical key signs. A
  stolen classical key is worth whatever an open window still allows.

That last point is why Perennial checks an ML-DSA-87 signature inside the
contract for its sensitive actions instead of trusting `msg.sender`
(see [decision 001](decisions/001-pq-signed-actions.md)).

Source: <https://docs.qorechain.io/developer-guide/evm-window-reference>

## Accounts

One mnemonic gives two different accounts:

- the **Native account** (`cosmos.crypto.secp256k1`, what the QoreX wallet
  shows), and
- the **EVM account** (`m/44'/60'/0'/0/0`, an Ethereum-style key), which is
  the one Foundry, viem and MetaMask sign for.

They have different addresses and separate balances, and each registers its
own ML-DSA-87 key. Every `0x` address also has a `qor1` form of the same 20
bytes (`evmToQor` in `@qorechain/sdk`), which is how a contract address is
written on the Native side.

## Fees

The EVM lane charges at least half of a transaction's gas limit, whatever it
uses: a signed vault action sent with a 900,000 limit is billed 450,000. Set
gas limits close to the real cost.

## Tokens and yield

- fUSD, the testnet dollar token, is an ERC-20 at
  `0x97143B771D34ddb9130b807b135Ae675A5a963CA` with **6 decimals**
  (`name()` returns "Fest USD"). It comes from the testnet faucet.
- The faucet pays fUSD as a **bank coin** (`erc20:0x9714…`), which contracts
  cannot see. `/cosmos.evm.erc20.v1.MsgConvertCoin`
  (`coin`, `receiver` as `0x…`, `sender` as `qor1…`) turns it into an ERC-20
  balance; it can be sent from the Native account straight to an EVM
  address. A plain bank transfer does not convert anything. The SDK has no
  builder for the message at 0.14.0.
- Staking and delegation are Native-lane only; the EVM staking precompile is
  not active. A Solidity contract cannot stake directly.
- The CrossVM bridge precompile (`0x…0901`) is active only for an allowlist
  of reviewed contracts.

Consequence: a real yield source reachable from Solidity has to be an EVM
contract itself, such as an ERC-4626 vault or an AMM pool
(see [decision 002](decisions/002-yield-source.md)).

## Tooling

- `create-qorechain-dapp` has a `foundry` template with a helper script that
  registers the PQC key and opens the window. The contracts project here
  starts from it.
- The dashboard has an AI contract review at
  <https://dashboard.qorechain.io/audit> (source is pasted in; one free run
  per UTC day). It reviews source only and is not a formal audit. Source:
  <https://docs.qorechain.io/dashboard/contract-auditor>

## Wallets and browsers

Read and measured on 15 November 2026.

- QoreX does not sign arbitrary bytes for a page: `signArbitrary` is refused,
  and on the EVM lane it answers account and chain queries only
  (`@qorechain/qorex-types` 0.1.0,
  <https://docs.qorechain.io/qorex/dapp-browser>). Message signing with
  ML-DSA-87 and EVM signing are announced as planned, without a date
  (<https://github.com/qorechain/qorex-integrations>).
- The ML-DSA-87 key of a phrase's EVM account is
  `deriveUnifiedAccount(phrase).pqc`; the key of its Native account
  (`m/44'/118'/0'/0/0`, what QoreX shows) is
  `derivePqcCanonical(nativeAddress, phrase)`. Both matched the keys
  `pqcKeyStatus` returned for the deployer's phrase.
- The EVM JSON-RPC sends `access-control-allow-origin: *`. The REST API and
  the CometBFT RPC send no CORS headers, so a page on another origin cannot read
  or open an EVM window, or broadcast a native transaction, without a proxy.
  `pqcKeyStatus` is readable from a page through `eth_call`.
- Testnet blocks arrive about every 1.4 seconds; the EVM gas price was
  112.5 gwei.

How the web app deals with this is
[decision 003](decisions/003-browser-signing.md).
