# 001 — Authorise sensitive actions with ML-DSA-87 signatures

Status: accepted · 15 November 2026

## Context

A pension has to outlive the cryptography it started with. On QoreChain an
account sends EVM transactions under an authorisation window that was opened
with its post-quantum key, but inside that window the classical secp256k1 key
alone decides what happens. If Perennial trusted `msg.sender`, a recovered
classical key could redirect a pension for as long as a window is open.

The chain exposes two precompiles to Solidity: `pqcKeyStatus`, which returns
an account's registered ML-DSA-87 key, and `pqcVerify`, which checks a
signature (see [the notes](../qorechain-notes.md)).

## Options

1. **Trust `msg.sender`.** Simple, and the window gives some protection, but
   the contract itself adds none.
2. **Require a registered key, still trust `msg.sender`.** Proves the account
   has a post-quantum key, not that the key approved this action.
3. **Require an ML-DSA-87 signature over each sensitive action**, verified in
   the contract against the key registered for the account.

## Decision

Option 3.

**Authority is the signature, not the sender.** A sensitive action carries an
ML-DSA-87 signature by the account that holds the role (beneficiary or
owner). The contract reads that account's key with `pqcKeyStatus` at call
time, requires `registered`, `algorithmId == 1`, `possessionProven` and a
2592-byte key, and verifies with `pqcVerify`. Anyone may submit the
transaction, which also lets a relayer pay the fee for a beneficiary who has
no window open.

**Signed message.** The ABI encoding of:

| Field | Purpose |
|---|---|
| `bytes32 domain` = `keccak256("Perennial.Action")` | separates Perennial from other uses of the key |
| `uint256 chainId` | no replay on another chain |
| `address vault` | no replay on another deployment |
| `uint256 positionId` | no replay on another position |
| `uint8 action` | no reuse for a different action |
| `uint256 nonce` | per position, incremented on every signed action |
| `uint256 deadline` | signature expires |
| `bytes32 paramsHash` | binds the action's arguments (e.g. the new heirs) |

**Which actions are signed.**

| Action | Signed by | Why |
|---|---|---|
| `checkIn` | beneficiary | proof of life must not be forgeable |
| `claim` | beneficiary | also counts as proof of life |
| `setHeirs` | beneficiary | decides who inherits |
| `closeByOwner` | owner | releases the principal |

**Which are not.** `open` and `topUp` only move the caller's own tokens in.
`harvest`, `triggerSuccession` and `distribute` are permissionless by design:
they cannot change where money goes, and the pension must keep working when
nobody with a key is around.

**Keys are read, never stored.** If the beneficiary rotates their key on
chain, the pension follows.

**Fail closed.** If a precompile returns empty data (inactive, or a chain
without it), the action reverts.

## Consequences

- Each signed action costs roughly 90k extra gas and 4.6 KB of calldata.
- `open` requires the beneficiary to already have a proven key; otherwise the
  position could never be operated.
- The contract only works on a chain with both precompiles active. Today that
  is the QoreChain testnet.
- Unit tests run against a mock of the precompiles. The real verifier is
  covered by the testnet end-to-end test.
