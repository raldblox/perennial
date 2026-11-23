# AI contract review

QoreChain's dashboard has an AI contract reviewer, QCAI
(<https://dashboard.qorechain.io/audit>, described at
<https://docs.qorechain.io/dashboard/contract-auditor>). It reads pasted
source only and is **not** a formal audit. Perennial's vault went through it
in two stages: stage 1 on the source before budget mode, then the changes
below, then stage 2 on the final, deployed source. This file records each
run, every finding, and what was done about it: a fix with its commit, or the
reason it is not a defect and the test that shows it.

| Stage | Date | Source reviewed | Result | Public report |
|---|---|---|---|---|
| 1 | 16 November 2026 | `PerennialVault.sol` before budget mode and `fund` | 82/100, risk medium, 5 findings, no change required | [PDF](audits/ai-review-2026-11-16-stage1.pdf) · public link: to be added |
| 2 | to be run | `PerennialVault.sol` as deployed (`contracts/src` is unchanged since `aa9a25d`; deployed from `e1460cb`) | to be added | to be added |

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

## Stage 2 · the final source

To be run by the owner; it needs a signed-in dashboard account.

1. Open <https://dashboard.qorechain.io/audit> and choose **Ethereum
   (EVM/Solidity)**.
2. Paste **`docs/audits/PerennialVault.flattened.sol`**, the whole file
   (1,578 lines), and nothing else. It is the deployed source with every
   dependency inline (`PQCAuth`, the PQC precompile and yield-source
   interfaces, OpenZeppelin's `SafeERC20` and `ReentrancyGuard`), so the
   reviewer sees the signature checks and token handling it would otherwise
   have to guess. Made with `forge flatten src/PerennialVault.sol` from
   `contracts/src` as deployed (unchanged since `aa9a25d`, deployed from
   `e1460cb`, [deployments.md](deployments.md)); it compiles on its own with
   the deployment's settings.
3. Publish the report and add its public link to the table at the top, with
   the stage-1 public link. Save the PDF as
   `docs/audits/ai-review-<date>-stage2.pdf`.
4. Add a section like stage 1's, one row per finding. Verdicts: **fixed**
   (the commit and the test that now covers it), **not a defect** (the line
   or decision that shows it, and a test), or **accepted** (why, added to the
   [threat model](threat-model.md)'s known limitations). A fix to
   `contracts/src` needs a new deployment, recorded in
   [deployments.md](deployments.md).

Optional, another day: `contracts/src/adapters/ERC4626Source.sol` and
`contracts/src/adapters/AaveV3Source.sol`, the sources other chains would use.
