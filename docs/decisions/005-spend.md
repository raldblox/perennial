# 005 — Let the beneficiary spend from the buffer, call by call

Status: accepted · 16 November 2026

## Context

The use case Perennial leads with is an AI agent whose running costs are paid
from a deposit's yield: one inference call, one small payment. A claim pays
the schedule's amount to the beneficiary once per interval. An agent needs to
pay someone else, many times an hour, for a specific request, without holding
the capital and without the operator's key online.

The payment layer that consumes this (PQ-402) needs a stable call to build
against, so the signature below is fixed.

## Options

1. **Claim to the agent, then the agent pays from its own balance.** Two
   steps per call, the agent holds float, and nothing on chain ties a payment
   to what it bought.
2. **A signed `spend` from the buffer to any recipient, bound to a reference.**
   One step, the money moves straight from the vault to the merchant, and the
   reference ties it to the request.
3. **An allowance the merchant pulls from.** Needs per-merchant state and lets
   a merchant take more than one call's worth.

## Decision

Option 2:

```solidity
function spend(
    uint256 positionId,
    address to,
    uint256 amount,
    bytes32 ref,
    uint256 deadline,
    bytes calldata signature
) external;

event Spent(uint256 indexed positionId, address indexed to, uint256 amount, bytes32 indexed ref);
```

- Authorised like every sensitive action
  ([decision 001](001-pq-signed-actions.md)): an ML-DSA-87 signature by the
  beneficiary's registered key over `actionMessage(positionId, Spend, nonce,
  deadline, paramsHash)`, with `Action.Spend = 4` and
  `paramsHash = keccak256(abi.encode(to, amount, ref))`. The recipient, the
  amount and the reference are signed, so a relayer can submit the spend but
  cannot change it.
- Pending yield is harvested first. The call reverts with
  `InsufficientBuffer(positionId, available)` if the buffer cannot cover
  `amount`. It never touches the principal.
- It counts as a check-in: an agent that is paying is alive.
- It is refused after succession: the heirs are then paid on the schedule
  through `distribute`.
- `ref` is whatever the parties agree on, typically the hash of the request
  being paid for. `Spent` indexes it so a merchant can find its payment.
- After the spend, the buffer is capped ([decision 004](004-buffer-cap.md)).

## Consequences

- **The roles become the security story.** The owner, a person whose key can
  stay offline, deposits. The beneficiary, the agent's own account and
  ML-DSA-87 key, can only spend yield. If the agent's key is stolen, the most
  it can take is what the buffer holds at that moment, bounded by the cap.
  Never the capital.
- The beneficiary's nonce is shared by all its signed actions, so spends are
  signed and submitted in order. A payer that wants concurrent spends needs
  one position per stream.
- Every spend costs an ML-DSA-87 verification (about 90k gas) plus a transfer.
  Whoever relays pays it, so an agent needs neither QOR nor an EVM window.
- The claim stays: a schedule and call-by-call spending can coexist on one
  position, and both draw on the same buffer.
