// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {PerennialVault} from "../src/PerennialVault.sol";
import {PQCAuth} from "../src/libraries/PQCAuth.sol";
import {VaultFixture} from "./VaultFixture.sol";

/// @dev Tests for the findings of the second AI contract review (23 November 2026), which
///      reviewed the deployed source with budget mode, `spend` and `fund` (docs/AUDIT.md).
///      Findings 1 and 4 repeat stage 1's and keep stage 1's tests in AuditFindings.t.sol;
///      these cover them in budget mode and add the two new ones.
contract AuditFindingsStage2Test is VaultFixture {
    uint256 internal constant BUDGET = 100 * USD; // per 30-day window
    address internal merchant = makeAddr("merchant");

    function _openBudget() internal returns (uint256 id) {
        PerennialVault.OpenParams memory p = _params();
        p.payoutAmount = BUDGET;
        p.budgetMode = true;
        p.ownerCanClose = true;
        id = _open(p);
    }

    function _signedSpend(uint256 id, address to, uint256 amount, bytes32 ref)
        internal
        view
        returns (uint256 deadline, bytes memory signature)
    {
        deadline = _deadline();
        signature = _sign(
            BENEFICIARY_SECRET,
            id,
            PerennialVault.Action.Spend,
            deadline,
            keccak256(abi.encode(to, amount, ref))
        );
    }

    /// Finding 1, on a budget-mode position: the beneficiary's signature, a stranger and the
    /// owner's own address without a valid signature all fail to close.
    function test_stage2_finding1_closeNeedsTheOwnersSignatureInBudgetMode() public {
        uint256 id = _openBudget();
        uint256 deadline = _deadline();

        bytes memory byBeneficiary =
            _sign(BENEFICIARY_SECRET, id, PerennialVault.Action.Close, deadline, 0);
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(PQCAuth.PQCSignatureInvalid.selector, owner));
        vault.closeByOwner(id, deadline, byBeneficiary);

        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(PQCAuth.PQCSignatureInvalid.selector, owner));
        vault.closeByOwner(id, deadline, hex"00");

        assertFalse(vault.position(id).closed);
        bytes memory byOwner = _sign(OWNER_SECRET, id, PerennialVault.Action.Close, deadline, 0);
        vm.prank(stranger); // relayed: the principal still goes to the owner
        vault.closeByOwner(id, deadline, byOwner);
        assertTrue(vault.position(id).closed);
    }

    /// Finding 2: `payoutAmount - windowSpent` cannot underflow, because no path lets the
    /// window's spending exceed its budget. Any sequence of spends of any size, across any
    /// number of windows, keeps `windowSpent <= payoutAmount`, and `budgetRemaining` always
    /// answers.
    function testFuzz_stage2_finding2_windowSpentNeverExceedsTheBudget(
        uint256[6] memory amounts,
        uint256[6] memory waits
    ) public {
        uint256 id = _openBudget();
        for (uint256 i; i < amounts.length; ++i) {
            skip(bound(waits[i], 0, 45 days));
            uint256 amount = bound(amounts[i], 1, 2 * BUDGET);
            uint256 left = vault.budgetRemaining(id);
            bytes32 ref = bytes32(i);
            (uint256 deadline, bytes memory signature) = _signedSpend(id, merchant, amount, ref);
            if (amount > left) {
                vm.expectRevert(
                    abi.encodeWithSelector(PerennialVault.BudgetExceeded.selector, id, left)
                );
            }
            vault.spend(id, merchant, amount, ref, deadline, signature);

            PerennialVault.Position memory p = vault.position(id);
            assertLe(p.windowSpent, p.payoutAmount);
            // Once a window has ended, the stored spending belongs to the old window until the
            // next payout rolls it, and the whole budget is available again.
            bool ended = block.timestamp >= uint256(p.windowStart) + p.payoutInterval;
            assertEq(
                vault.budgetRemaining(id), ended ? p.payoutAmount : p.payoutAmount - p.windowSpent
            );
        }
    }

    /// Finding 3: front-running a spend in budget mode changes nothing. The signature binds
    /// the recipient, the amount and the reference, so a relayer cannot redirect or resize
    /// it; whoever submits it first pays the signed recipient, the budget counts it once, and
    /// a second submission fails on the consumed nonce.
    function test_stage2_finding3_aFrontRunSpendPaysOnlyWhatWasSignedOnce() public {
        uint256 id = _openBudget();
        bytes32 ref = keccak256("POST /chat/completions req_0001");
        (uint256 deadline, bytes memory signature) = _signedSpend(id, merchant, 2 * USD, ref);

        vm.startPrank(stranger);
        vm.expectRevert(abi.encodeWithSelector(PQCAuth.PQCSignatureInvalid.selector, beneficiary));
        vault.spend(id, stranger, 2 * USD, ref, deadline, signature); // redirected
        vm.expectRevert(abi.encodeWithSelector(PQCAuth.PQCSignatureInvalid.selector, beneficiary));
        vault.spend(id, merchant, 3 * USD, ref, deadline, signature); // resized
        vm.expectRevert(abi.encodeWithSelector(PQCAuth.PQCSignatureInvalid.selector, beneficiary));
        vault.spend(id, merchant, 2 * USD, bytes32("other"), deadline, signature); // re-referenced

        vault.spend(id, merchant, 2 * USD, ref, deadline, signature); // front-run as signed
        vm.stopPrank();
        assertEq(token.balanceOf(merchant), 2 * USD);
        assertEq(token.balanceOf(stranger), 0);
        assertEq(vault.position(id).windowSpent, 2 * USD);

        // The agent's own submission of the same signature now fails: paid once.
        vm.expectRevert();
        vault.spend(id, merchant, 2 * USD, ref, deadline, signature);
        assertEq(vault.position(id).windowSpent, 2 * USD);
    }

    /// Finding 4, in budget mode: setting 17 heirs reverts before any loop runs.
    function test_stage2_finding4_seventeenHeirsRevertInBudgetMode() public {
        PerennialVault.OpenParams memory p = _params();
        p.payoutAmount = BUDGET;
        p.budgetMode = true;
        p.heirs = new PerennialVault.Heir[](17);
        for (uint256 i; i < 17; ++i) {
            p.heirs[i] = PerennialVault.Heir(
                address(uint160(0x1000 + i)), uint16(i == 0 ? 10_000 - 16 * 588 : 588)
            );
        }
        vm.prank(owner);
        vm.expectRevert(PerennialVault.TooManyHeirs.selector);
        vault.open(p);
    }
}
