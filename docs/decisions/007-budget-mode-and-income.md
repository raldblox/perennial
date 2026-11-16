# 007 — Budget mode, and income from anyone

Status: accepted · 16 November 2026

## Context

[Decision 006](006-yield-sources.md) found that nothing on QoreChain pays a
return a contract can collect. Living off the yield cannot be the reason to
open a position here. The reason is the rules: a wallet gives everything to
whoever holds its key; a position gives an agent a capped budget, the owner a
way out, heirs a handover, and every instruction a post-quantum signature.
Yield becomes an optional top-up.

That needs two things the vault did not have: a way to spend the deposit
itself, at a limited rate, and a way for anyone to pay income in.

## Decision

### Budget mode

`OpenParams.budgetMode`, fixed at opening, default off.

- **Off:** nothing changes. `spend` and `claim` pay from the buffer only, and
  the principal is never paid out.
- **On:** `spend`, `claim` and, after succession, `distribute` take from the
  buffer first and then from the principal. All of them together are limited
  to `payoutAmount` per `payoutInterval`. `open` refuses budget mode with a
  `payoutAmount` of zero (`BudgetNeedsPayoutAmount`).

**The window.** Each position keeps `windowStart` and `windowSpent`. A window
is `payoutInterval` long and starts at opening; when one ends, the next
starts at the next whole interval and `windowSpent` returns to zero. A spend
that would take `windowSpent` above `payoutAmount` reverts with
`BudgetExceeded(positionId, remaining)`. A claim (or distribution) pays what
is left of the window's budget, as far as the buffer and principal cover it,
and reverts with `PayoutNotDue` when nothing is left. Unused budget does not
carry over: missing three windows does not allow three times the budget.
`budgetRemaining(positionId)` reports what the current window still allows.

**Drawing on the principal.** When the buffer cannot cover an amount, the
rest is taken from the principal: the vault redeems
`previewWithdraw(rest)` shares (which rounds up, in the principal's favour)
and reduces `principal` by exactly that rest. Whatever the redemption returns
beyond it, by rounding, stays in the buffer. `PrincipalDrawn(positionId,
amount)` records it. If the rest would need all remaining shares, all are
redeemed, `principal` becomes zero, and anything returned beyond the rest
goes to the buffer.

**At zero.** A position with no principal and an empty buffer stays open.
Spends and claims then revert with `InsufficientBuffer`. Income (`fund`) or a
deposit (`topUp`) brings it back. Nothing closes it automatically.

**A source that has lost value.** A draw that receives less than it needs
reverts with `InsufficientBuffer`. The position is then limited to its buffer
until the source recovers or the owner closes it.

**Compounding and the cap.** Unchanged
([decision 004](004-buffer-cap.md)): after every payout path, buffer above the
cap is added to the principal. In budget mode that principal stays drawable,
so compounding only parks income where it may earn; it does not lock it away
from the budget.

**Succession and close.** Spending stops at succession, as before. Afterwards
`distribute` pays the heirs from the same window budget, drawing on the
principal in budget mode, so the heirs inherit the budget stream until the
position is empty. `closeByOwner` redeems whatever shares are left; with a
reduced principal, the owner gets the reduced amount.

### Income from anyone

`fund(positionId, amount)`: anyone may pay income into a live position's
buffer. It emits `Funded(positionId, from, amount)` with the payer, refuses
tokens that deliver less than sent, and then applies the buffer cap: income
above the cap is added to the principal. Funding is allowed after succession,
so income keeps reaching the heirs; it is refused once the position is
closed.

`topUp` (to the principal, by anyone) is unchanged and is tested with many
deposits from different payers.

## Options considered

- **A separate allowance per spender** (ERC-20 style): more state, and an
  allowance does not bound the total across spends and claims.
- **A rate on the principal only** (yield free, principal rate-limited):
  harder to explain, and the limit should be on what leaves the position.
- **Carrying unused budget over:** lets an attacker who waits withdraw a
  multiple of the budget at once. Rejected.

## Consequences

- The worst a stolen beneficiary key can take is one window's budget per
  window in budget mode, or the buffer without it. Never more than the
  position holds. The invariant test checks both on every random sequence:
  no window pays more than `payoutAmount`, and no call pays more than the
  buffer, pending yield and, in budget mode, the principal.
- In budget mode the principal is spent; the name "principal" then means
  "what is left of the deposit and compounded income".
- The `Position` struct gains `budgetMode`, `windowStart` and `windowSpent`.
  `spend` and `Spent` are unchanged.
