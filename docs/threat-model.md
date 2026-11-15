# Threat model

What Perennial protects, from whom, what it trusts, and where it is weak.
Written for the contracts in `contracts/src` and the web app in `app/`, as
deployed on the QoreChain testnet (version 2, with `spend` and the buffer
cap; see [deployments](deployments.md)). Last reviewed 16 November 2026.

## Assets

| Asset | Where it lives | What losing it means |
|---|---|---|
| Principal | yield-source shares held by the vault for each position | the capital behind the income |
| Buffer | asset tokens held by the vault, per position, at most the position's cap after every harvest, claim, distribution or spend | harvested income not yet paid; what a stolen beneficiary key can spend |
| Schedule and proof of life | `payoutAmount`, `payoutInterval`, `lastPayout`, `lastCheckIn` | a forged check-in delays succession; a forged claim spends the buffer early |
| Heirs | the position's heir list and weights | whoever is on it inherits the income |
| The right to close | `ownerCanClose` and the owner's ML-DSA-87 key | releases the principal to the owner |
| ML-DSA-87 keys | each account's registered key on chain; the secret in the holder's custody | authority over every signed action of that role |

## Actors

- **Owner**: deposits the principal. Holds no authority afterwards unless the
  right to close was kept.
- **Beneficiary**: typically an AI agent's own account. Spends from the
  buffer to any recipient, claims payouts, checks in and changes heirs, all
  with an ML-DSA-87 signature. It never holds the principal.
- **Heirs**: receive the payouts after succession. Need no key and sign
  nothing.
- **Relayer**: anyone who submits a signed action, such as a payment
  facilitator submitting an agent's spends. Pays the fee, gains nothing.
- **Payee**: the recipient a spend names, such as an inference service. It
  finds its payment by the `Spent` event's `ref`.
- **Anyone**: may harvest, trigger succession after the deadline, distribute
  after succession, and top up principal.
- **Attacker with a classical key**: has recovered an account's secp256k1 key,
  for example with a quantum computer, or stole it.
- **Attacker with an ML-DSA-87 key**: has the role holder's post-quantum
  secret.
- **Host of the web app**, and anything that can run code in its page
  (dependencies, browser extensions).

## Trust assumptions

1. The QoreChain `pqcKeyStatus` and `pqcVerify` precompiles answer truthfully,
   and ML-DSA-87 (FIPS 204) is secure. Both precompiles are active on the
   testnet only.
2. The chain admits an EVM transaction only from an account with a registered
   key and an open EVM window, opened with a hybrid signature.
3. The yield source returns at least the principal on redemption. The testnet
   source is `MockYieldSource`, which pays from a pre-funded reserve.
4. The asset is a plain ERC-20. Fee-on-transfer tokens are refused at
   deposit; rebasing tokens are not supported.
5. The block timestamp is close to real time. Deadlines are days, so a few
   seconds of drift do not matter.

## What a recovered classical key can and cannot do

Inside the vault, nothing that matters. Authority over a position is a
signature by the role holder's ML-DSA-87 key, checked in the contract against
the key the chain reports at that moment ([decision 001](decisions/001-pq-signed-actions.md)).

| With only the secp256k1 key of… | Can | Cannot |
|---|---|---|
| the beneficiary | nothing beyond what anyone can do | spend, claim, check in, change heirs |
| the owner | nothing beyond what anyone can do | close the position |
| anyone | harvest, trigger succession after the deadline, distribute, top up | redirect a payout: the vault pays the beneficiary or the frozen heirs only |

Outside the vault, a classical key still spends whatever an open EVM window of
that account allows, which is why the app opens windows scoped to the vault
and the asset, with a few transactions and only enough value for fees.

One dependency sits outside Perennial. The chain accepts an account's first
ML-DSA-87 registration with a classical signature, and it supports key
rotation. The vault reads the key at call time, so if the chain ever let a
classical signature alone replace an existing key, an attacker with the
beneficiary's classical key could install their own post-quantum key and the
vault would follow. We have not tested how the chain treats a classically
signed registration or rotation for an account that already has a key; the
protection above assumes it refuses one.

## What a stolen ML-DSA-87 key can do

Everything its role allows. The vault cannot tell a stolen key from its
holder.

- **The beneficiary's (agent's) key** can spend the buffer to any address,
  which is the worst case: at most what the buffer holds at that moment, and
  after every harvest the buffer is cut back to its cap
  ([decision 004](decisions/004-buffer-cap.md)). It can also claim (to the
  beneficiary), check in to postpone succession, and replace the heirs with
  its own account. It can never touch the principal
  ([decision 005](decisions/005-spend.md)).
- **The owner's key** can close the position if the right was kept, sending
  the principal to the owner and the buffer to the beneficiary.

So an owner who funds an agent should keep the right to close: closing is
the only way to stop a compromised agent key, because only the beneficiary's
key can change the heirs.

## Signatures, relayers and replay

- The signed message is the ABI encoding of the domain tag
  `keccak256("Perennial.Action.v1")`, the chain id, the vault address, the
  position id, the action, the position's nonce, a deadline and a hash of the
  action's parameters. A signature is valid once, for one action, on one
  position of one vault on one chain, until its deadline.
- The nonce is per position and consumed by every signed action, so signatures
  must be used in order; a second signature made at the same nonce becomes
  useless once the first is used.
- `setHeirs` binds `keccak256(abi.encode(newHeirs))`, so a relayer cannot swap
  the list.
- `spend` binds `keccak256(abi.encode(to, amount, ref))`, so a relayer
  cannot change the recipient, the amount or the reference.
- One nonce per position means an agent's spends are strictly sequential. A
  relayer holding several signed spends can only submit them in order; one
  withheld spend blocks the ones after it until its deadline passes.
- A relayer can delay a signed action until its deadline or never submit it.
  The app signs with a ten-minute deadline and submits itself.
- A relayer can front-run with the same signature; the effect is the same,
  because the money goes where the position says regardless of the sender.
- Anyone can trigger succession the moment the deadline passes. A beneficiary
  who is late by one block loses the income. The grace period exists for that.

## Yield source and mock risks

- The testnet yield is simulated. `MockYieldSource` accrues 5% a year and pays
  it from a reserve someone funded. When the reserve is short, redemptions
  revert with `ReserveExhausted`, and harvest, claim and close revert with
  them. The app shows the reserve left.
- A real source can lose value. Harvest then yields nothing until it
  recovers, and the vault never tops the principal up
  ([decision 002](decisions/002-yield-source.md)).
- A malicious or upgradeable source could take the principal. The source is
  fixed at deployment; a vault is only as safe as the source it was deployed
  with.
- The demo vault's source pays an accelerated testnet rate (15,768% a year)
  so a small deposit pays several calls a minute. Its reserve drains at that
  speed. It is a test setting and is labelled as one.
- `ERC4626Source` adds guards for real ERC-4626 vaults (zero-share deposits,
  limits, per-depositor shares) but inherits that vault's risks
  ([decision 006](decisions/006-yield-sources.md)). Nothing on QoreChain pays
  a real return a contract can collect today.
- Compounded yield becomes principal and can never be spent; on a position
  without the right to close it is locked like any other principal.

## Front-end risks (from decision 003)

The QoreX wallet cannot yet sign arbitrary bytes or EVM transactions for a
page, so the app derives the keys from a recovery phrase typed into the page
([decision 003](decisions/003-browser-signing.md)).

- **The page holds the keys while unlocked.** Whoever controls the JavaScript
  the browser runs (the host, a compromised dependency, an extension with page
  access) can read the keys and sign anything as that account: new heirs, a
  close, check-ins. The contract's post-quantum protection does not help
  against a page that holds the post-quantum key.
- **The phrase controls both accounts of the phrase**, the EVM account and the
  Native account, including any QOR they hold.
- Mitigations in the app: the phrase is cleared after derivation; keys are
  dropped on lock, after 15 idle minutes and when the tab closes; nothing is
  stored or sent; every signed action shows the exact `actionMessage` bytes,
  the nonce and the expiry before signing; the derived public key must match
  the one the chain reports; succession asks for confirmation; windows are
  scoped to the vault and the asset; the build loads no third-party scripts,
  fonts or analytics at run time.
- Residual risk: JavaScript cannot guarantee that string copies of a secret
  are erased from memory. Use a phrase made for the testnet only.
- **Display risks.** The app reads state from the configured RPC; a malicious
  RPC could show false figures. The vault, asset and chain id are compiled
  into the build, and the app refuses to write when the RPC's chain id or the
  vault's asset differ from the configuration.
- **Proxy.** Reading and opening an EVM window needs the chain's REST and RPC
  endpoints, which refuse cross-origin requests; the host forwards them. A
  malicious proxy could misreport the window or refuse to open one. It cannot
  forge a window: the opening message is signed in the page.
- **Swap.** The in-page swap takes its quote from the pool reserves the proxy
  returns. A malicious proxy could report reserves that lower the minimum,
  exposing the swap to a worse price. The page caps a swap at 1 QOR and
  shows the minimum before signing.

## Known limitations

- Testnet only. The precompiles are not active on QoreChain mainnet.
- Unaudited. The contracts have unit, fuzz and invariant tests and a live
  end-to-end script, but no external audit.
- Simulated yield (see above).
- A position opened without the right to close is permanent: nobody can ever
  withdraw its principal.
- Succession cannot be undone, and a position without heirs can never
  succeed.
- A period the buffer cannot fund in full is paid in part and not carried
  over.
- The app signs only for the EVM and Native accounts of the unlocked phrase.
  A beneficiary whose key lives elsewhere needs another tool; the contract
  accepts a valid signature from anywhere.
- QoreChain's explorer does not look up EVM transaction hashes; the app shows
  them in full instead of linking.
- An agent's spends share the position's nonce, so they are sequential; a
  payer that needs concurrent spends needs one position per stream.
