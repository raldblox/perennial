# AI contract review

QoreChain's dashboard has an AI contract reviewer
(<https://dashboard.qorechain.io/audit>, described at
<https://docs.qorechain.io/dashboard/contract-auditor>). It reads pasted
source only and is **not** a formal audit. This file records each run, every
finding, and what was done about it: a fix with its commit, or the reason it
is not a defect and the test that shows it.

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

## Stage 2 · the final source

To be run by hand; it needs a signed-in dashboard account.

1. Open <https://dashboard.qorechain.io/audit> and choose **Ethereum
   (EVM/Solidity)**.
2. Paste **`contracts/src/PerennialVault.sol`**, the whole file, as it is at
   the commit of the testnet deployment recorded in
   [deployments.md](deployments.md). Paste only that file, as in stage 1.
3. Save the PDF as `docs/audits/ai-review-<date>-stage2.pdf` and add a
   section like the one above, with one row per finding.
4. Optional second run on another day: `contracts/src/adapters/ERC4626Source.sol`
   and `contracts/src/adapters/AaveV3Source.sol`, the sources other chains
   would use.

Verdicts: **fixed** (name the commit and the test that now covers it),
**not a defect** (the line or decision that shows it, and a test), or
**accepted** (why, added to the [threat model](threat-model.md)'s known
limitations). A fix to `contracts/src` needs a new deployment; record it in
[deployments.md](deployments.md).
