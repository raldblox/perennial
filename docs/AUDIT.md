# AI contract review

QoreChain's dashboard has an AI contract reviewer, QCAI
(<https://dashboard.qorechain.io/audit>, described at
<https://docs.qorechain.io/dashboard/contract-auditor>). It reads pasted
source only and is **not** a formal audit. Perennial's vault went through it
in two stages: stage 1 on the source before budget mode, then the changes
below, then stage 2 on the final, deployed source. This file records each
run, every finding, and what was done about it: a fix with its commit, or the
reason it is not a defect and the test that shows it.

| Stage | Date | Source reviewed | Result | Report (PDF) |
|---|---|---|---|---|
| 1 | 16 November 2026 | `PerennialVault.sol` before budget mode and `fund` | 82/100, risk medium, 5 findings, no change required | [ai-review-2026-11-16-stage1.pdf](https://github.com/raldblox/perennial/blob/main/docs/audits/ai-review-2026-11-16-stage1.pdf) |
| 2 | 23 November 2026 | the deployed source, flattened with its libraries ([PerennialVault.flattened.sol](audits/PerennialVault.flattened.sol)) | 72/100, risk medium, 5 findings, no change required | [ai-review-2026-11-23-stage2.pdf](https://github.com/raldblox/perennial/blob/main/docs/audits/ai-review-2026-11-23-stage2.pdf) |

The dashboard issues each report as a PDF, not as a public link; both PDFs are committed in this repository and linked here.

## Changes between the stages

| Commit | Change to `contracts/src` | Why | Tests |
|---|---|---|---|
| `9fca35f` | Budget mode (opt-in at open: spends and claims may draw on principal, at most `payoutAmount` per `payoutInterval` in total) and `fund` (anyone pays income into a position's buffer) | the owner's decision to make the budget, not the yield, the reason to deposit ([decision 007](decisions/007-budget-mode-and-income.md)) | `Budget.t.sol`, `Fund.t.sol`, the invariant `invariant_rateLimitAndHoldingsBoundEveryPayout` |
| `1c787a2` | `harvest` never redeems a source for zero assets | an ERC-4626 vault or Aave market that refuses a zero redemption would otherwise block every claim, spend and close | `ERC4626Source.t.sol: test_strictVault_dustHarvestDoesNotBlockTheClose` (fails without the guard) |
| `aa9a25d` | Signing domain tag `keccak256("Perennial.Action")` | the first release carries no version label; nothing signed for the earlier tag exists on the deployed vaults | the whole suite signs through `actionMessage` |

No stage-1 finding required a change; each is answered below with its test.

## Stage 1 · 16 November 2026

- Setting: Ethereum (EVM/Solidity). File reviewed: `PerennialVault.sol`, as it
  stood before budget mode and `fund` were added.
- Result: score 82/100, risk "medium", 5 findings.
- Report: [audits/ai-review-2026-11-16-stage1.pdf](audits/ai-review-2026-11-16-stage1.pdf).

Line numbers are the report's, in the file as reviewed. Every test named below
is in `contracts/test/` and passes (`forge test`).

| # | Finding (as reported) | Severity | Location | Verdict | Reason and evidence |
|---|---|---|---|---|---|
| 1 | Missing access control on `closeByOwner` | High | 390 | Not a defect | Access control is the owner's ML-DSA-87 signature, not `msg.sender`: `closeByOwner` calls `_authorize(…, pos.owner, Action.Close, …)`, which requires a valid signature by the key registered for the owner and consumes the nonce, and it reverts unless the owner kept the right at opening. A caller without that signature, including the beneficiary and the owner's own address with a bad signature, cannot close: `AuditFindings.t.sol: test_finding1_aCallerWithoutTheOwnersSignatureCannotClose`, `Close.t.sol: test_close_revertsWithTheBeneficiarysSignature`, `test_close_revertsWithoutAValidSignatureEvenFromTheOwner`, `test_close_revertsWhenTheRightWasNotKept`. A relayed owner signature pays the owner, never the relayer: `test_finding1_aRelayedOwnerSignatureStillPaysTheOwner`. Anyone may submit a signed action by design ([decision 001](decisions/001-pq-signed-actions.md)). |
| 2 | Potential overflow in `_payHeirs` | Medium | 443 | Not a defect | The contract compiles with Solidity 0.8.28, whose arithmetic is checked: `amount * bps` cannot wrap; it reverts. It could only overflow above about 1.2 × 10⁷³ token units in one payout (2²⁵⁶ ÷ 10,000). Fuzzed exact split for any amount up to 2¹²⁸ and any pair of weights: `testFuzz_finding2_heirSharesAddUpExactly`. A product that does not fit reverts with an arithmetic error instead of paying a wrong amount: `test_finding2_anOverflowingProductRevertsInsteadOfWrapping`. |
| 3 | Front-running in `claim` | Medium | 220 | Not a defect | A claim pays the position's beneficiary whoever submits it, and the signature is bound to the chain, vault, position, action, nonce and deadline, so it works once. Front-running can only submit the beneficiary's own claim earlier, with the same result; the original submission then fails and nothing is paid twice: `test_finding3_aFrontRunClaimStillPaysOnlyTheBeneficiary`, `Claim.t.sol: test_claim_canBeSubmittedByAnyoneAndStillPaysTheBeneficiary`, `test_claim_revertsWhenTheSignatureIsReplayed`. A commit-reveal would add a step without protecting anything. |
| 4 | Unbounded loop in `_storeHeirs` | Low | 472 | Not a defect | The list is bounded: `MAX_HEIRS` is 16 and longer lists revert with `TooManyHeirs` before the loop runs. `Open.t.sol: test_open_revertsOnTooManyHeirs`, `test_finding4_seventeenHeirsRevertOnSetHeirs`; 16 heirs cost under 1,000,000 gas: `test_finding4_sixteenHeirsFitInABoundedGasCost`. |
| 5 | No ERC-20/721 interface | Info | — | By design | A position is not a token. Its rights are bound to the owner's and the beneficiary's ML-DSA-87 keys, and making positions transferable would hand those rights to whoever holds a classical key that can sign a transfer, which is what the vault exists to prevent. The vault does use the ERC-20 standard for the asset it holds, through OpenZeppelin's `SafeERC20`. |

No finding required a change to the contract.

## Stage 2 · 23 November 2026

- Setting: Ethereum (EVM/Solidity). File reviewed:
  [audits/PerennialVault.flattened.sol](audits/PerennialVault.flattened.sol),
  the deployed source (`contracts/src` unchanged since `aa9a25d`, deployed
  from `e1460cb`) flattened with `forge flatten`, so `PQCAuth`, the precompile
  and yield-source interfaces and OpenZeppelin's `SafeERC20` and
  `ReentrancyGuard` were in view.
- Result: score 72/100, risk "medium", 5 findings.
- Report: [audits/ai-review-2026-11-23-stage2.pdf](audits/ai-review-2026-11-23-stage2.pdf).

The score is lower than stage 1's 82 because more was reviewed: the contract
grew by budget mode, `spend` and `fund` (725 lines), and the flattened file
adds about 850 lines of library code, one finding of which is about a library
interface the vault does not use. The findings are the same kinds as in
stage 1, now asked of the budget code; none is a defect.

The report's line numbers do not match the flattened file (its line 580 is
inside OpenZeppelin's `IERC1363`, 630 inside `SafeERC20`), so each finding is
mapped by the function it names. Tests are in `contracts/test/` and pass.

| # | Finding (as reported) | Severity | Verdict | Reason and evidence |
|---|---|---|---|---|
| 1 | Missing access control on `closeByOwner` | High | Not a defect | As in stage 1: access is the owner's ML-DSA-87 signature, checked by `_authorize(…, pos.owner, Action.Close, …)` against the key registered for the owner, and the close reverts unless the owner kept the right at opening. `msg.sender` is deliberately irrelevant, so a relayer can submit the owner's signature and the principal still goes to the owner. In budget mode too: `AuditFindingsStage2.t.sol: test_stage2_finding1_closeNeedsTheOwnersSignatureInBudgetMode`; stage 1's `test_finding1_aCallerWithoutTheOwnersSignatureCannotClose` and `test_finding1_aRelayedOwnerSignatureStillPaysTheOwner`. |
| 2 | Potential overflow in budget calculation | Medium | Not a defect | The subtraction is `payoutAmount - windowSpent` in `_useBudget`, `_settleBudget` and `budgetRemaining`. Solidity 0.8.28 checks it, and it cannot underflow: `windowSpent` only grows in `_useBudget`, by at most what is left (larger amounts revert with `BudgetExceeded`), and in `_settleBudget`, by at most what is left; `_rollWindow` resets it to zero; `payoutAmount` is fixed at opening. Fuzzed over six spends of up to twice the budget each across up to six windows: `windowSpent <= payoutAmount` after every step and `budgetRemaining` always answers, `testFuzz_stage2_finding2_windowSpentNeverExceedsTheBudget`; the invariant `invariant_rateLimitAndHoldingsBoundEveryPayout` holds over random sequences of every action. |
| 3 | Front-running in budget mode | Medium | Not a defect | A spend's signature covers `keccak256(abi.encode(to, amount, ref))`, the position, the nonce and the deadline. A front-runner can only submit the agent's own spend earlier: redirected, resized or re-referenced it fails the signature check; submitted as signed it pays the signed recipient, counts once against the budget, and the agent's own submission then fails on the consumed nonce. `test_stage2_finding3_aFrontRunSpendPaysOnlyWhatWasSignedOnce`, `Spend.t.sol: test_spend_canBeRelayedByAnyoneAndStillPaysWhoWasSigned`, `test_spend_bindsRecipientAmountAndRef`, `test_spend_cannotBeReplayed`. A commit-reveal would add a step without protecting anything. |
| 4 | Unbounded loop in heir storage | Low | Not a defect | `MAX_HEIRS` is 16 and longer lists revert with `TooManyHeirs` before `_storeHeirs` loops: `test_stage2_finding4_seventeenHeirsRevertInBudgetMode`, `test_finding4_seventeenHeirsRevertOnSetHeirs`; 16 heirs cost under 1,000,000 gas, `test_finding4_sixteenHeirsFitInABoundedGasCost`. A mapping would not bound anything further and would make the frozen, weighted list harder to pay out in order. |
| 5 | ERC-1363 compliance | Info | Not applicable | `IERC1363` is in the file only because flattening includes OpenZeppelin's `SafeERC20`, which declares it for its `*AndCall` helpers. The vault calls only `safeTransfer`, `safeTransferFrom` and `forceApprove`; nothing in `contracts/src` refers to ERC-1363 (`git grep 1363 contracts/src` finds nothing), and a position is not a token, by design (stage 1, finding 5). |

No finding required a change to the contract.

## Running a review again

1. Open <https://dashboard.qorechain.io/audit> and choose **Ethereum
   (EVM/Solidity)**.
2. Flatten the source: `forge flatten src/PerennialVault.sol -o ../docs/audits/PerennialVault.flattened.sol`
   in `contracts/`, and paste the whole file, nothing else.
3. Save the PDF in `docs/audits/`, link it from the table above and add a
   section like the ones above, one row per finding. Verdicts: **fixed** (the
   commit and the test that now covers it), **not a defect** (the line or
   decision that shows it, and a test), or **accepted** (why, added to the
   [threat model](threat-model.md)'s known limitations). A fix to
   `contracts/src` needs a new deployment, recorded in
   [deployments.md](deployments.md).

Optional: `contracts/src/adapters/ERC4626Source.sol` and
`contracts/src/adapters/AaveV3Source.sol`, the sources other chains would use.
