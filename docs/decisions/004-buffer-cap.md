# 004 — Cap the buffer and compound the rest

Status: accepted · 16 November 2026

## Context

Harvested yield waits in a position's buffer until it is paid out. Whatever
is not paid out sits idle: it earns nothing, and it is exactly what a stolen
beneficiary key could take once the beneficiary can spend from the buffer
([decision 005](005-spend.md)). An endowment that pays an agent call by call
needs a small working balance, not an ever-growing one.

## Options

1. **Leave the buffer unbounded** (version 1). Simple; idle money grows, and so
   does what a compromised beneficiary key can reach.
2. **A per-position cap; what is above it joins the principal.** The excess
   keeps earning, and the exposure of the buffer is bounded by a number the
   owner chose.
3. **A cap that pays the excess out**, to the owner or the beneficiary. Turns
   the cap into a second payout schedule and gives the excess to whoever the
   rule names; that is the claim's job.

## Decision

Option 2.

- `bufferCap` is set in `open` and stored in the position. It cannot be
  changed afterwards, like every other term a position is opened with.
- After every path that adds to or pays from the buffer (`harvest`, `claim`,
  `distribute` and `spend`), whatever the buffer holds above `bufferCap` is
  added to the principal and deposited into the yield source. The event is
  `Compounded(positionId, amount)`.
- Payouts are taken first and compounding comes last, so a cap of zero
  means "compound everything that is not paid out" and the scheduled payout
  is still paid in full when the buffer can fund it.
- `type(uint256).max` means never compound, which is version 1's behaviour.
- `closeByOwner` does not compound: it harvests and returns everything.

The rule in one sentence, for the app: *yield above the buffer cap is added
to the principal, so it keeps earning and can never be spent.*

## Consequences

- The principal can now grow by compounding as well as by top-ups. It still
  never shrinks while the position is open, and it is still never paid out.
- Compounded principal is permanent on a position without the right to
  close, like any other principal. Owners who want the income spent, not
  saved, choose a cap above the expected buffer, or the maximum.
- A deposit into the source rounds shares down, so each compounding can
  leave the principal's cover short by at most one share until the next
  harvest makes it up out of yield. The invariant test allows exactly that.
- Compounding costs a deposit's gas when it happens, paid by whoever called.
- A permissionless `harvest` can compound the buffer down to the cap at any
  time. A beneficiary who spends should have a cap at least as large as the
  spending it wants to keep ready.
