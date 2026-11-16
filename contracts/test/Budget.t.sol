// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {PerennialVault} from "../src/PerennialVault.sol";
import {MockYieldSource} from "../src/mocks/MockYieldSource.sol";
import {VaultFixture} from "./VaultFixture.sol";

/// @dev Budget mode: spends and payouts may draw on the principal once the buffer is empty,
///      never more than `payoutAmount` per `payoutInterval` in total.
contract BudgetTest is VaultFixture {
    uint256 internal constant BUDGET = 100 * USD; // per 30-day window
    address internal merchant = makeAddr("merchant");

    event PrincipalDrawn(uint256 indexed positionId, uint256 amount);

    function _openBudget(uint256 principal, uint256 cap) internal returns (uint256 id) {
        PerennialVault.OpenParams memory p = _params();
        p.amount = principal;
        p.payoutAmount = BUDGET;
        p.budgetMode = true;
        p.bufferCap = cap;
        p.ownerCanClose = true;
        id = _open(p);
    }

    /// A vault whose source pays nothing: the budget is all principal, as it would be today.
    function _flatVault() internal returns (PerennialVault flat) {
        MockYieldSource none = new MockYieldSource(token, 0);
        flat = new PerennialVault(token, none);
        vm.prank(owner);
        token.approve(address(flat), type(uint256).max);
    }

    function _spendOn(PerennialVault v, uint256 id, uint256 amount, bytes32 ref) internal {
        uint256 deadline = _deadline();
        uint256 nonce = v.position(id).nonce;
        bytes memory signature = pqc.sign(
            BENEFICIARY_SECRET,
            v.actionMessage(
                id,
                PerennialVault.Action.Spend,
                nonce,
                deadline,
                keccak256(abi.encode(merchant, amount, ref))
            )
        );
        v.spend(id, merchant, amount, ref, deadline, signature);
    }

    function _spend(uint256 id, uint256 amount) internal {
        _spendOn(vault, id, amount, keccak256(abi.encode(amount, block.timestamp)));
    }

    function test_open_budgetModeNeedsAPayoutAmount() public {
        PerennialVault.OpenParams memory p = _params();
        p.payoutAmount = 0;
        p.budgetMode = true;
        vm.prank(owner);
        vm.expectRevert(PerennialVault.BudgetNeedsPayoutAmount.selector);
        vault.open(p);
    }

    function test_spend_drawsOnThePrincipalWhenTheBufferIsEmpty() public {
        PerennialVault flat = _flatVault();
        PerennialVault.OpenParams memory p = _params();
        p.amount = 1_000 * USD;
        p.payoutAmount = BUDGET;
        p.budgetMode = true;
        vm.prank(owner);
        uint256 id = flat.open(p);

        vm.expectEmit(true, false, false, true, address(flat));
        emit PrincipalDrawn(id, 40 * USD);
        _spendOn(flat, id, 40 * USD, "a");

        PerennialVault.Position memory pos = flat.position(id);
        assertEq(token.balanceOf(merchant), 40 * USD);
        assertEq(pos.principal, 960 * USD);
        assertEq(pos.buffer, 0);
        assertEq(pos.windowSpent, 40 * USD);
        assertEq(flat.budgetRemaining(id), 60 * USD);
    }

    function test_spend_usesTheBufferBeforeThePrincipal() public {
        uint256 id = _openBudget(PRINCIPAL, type(uint256).max);
        skip(1 days);
        uint256 yield = vault.pendingYield(id); // about 13.7 at 5% on 100,000
        _spend(id, 20 * USD);

        PerennialVault.Position memory pos = vault.position(id);
        assertEq(pos.buffer, 0);
        assertApproxEqAbs(pos.principal, PRINCIPAL - (20 * USD - yield), 1);
    }

    function test_spend_refusesMoreThanTheWindowsBudget() public {
        uint256 id = _openBudget(PRINCIPAL, type(uint256).max);
        _spend(id, 70 * USD);

        uint256 deadline = _deadline();
        bytes32 ref = "over";
        bytes memory signature = _sign(
            BENEFICIARY_SECRET,
            id,
            PerennialVault.Action.Spend,
            deadline,
            keccak256(abi.encode(merchant, uint256(31 * USD), ref))
        );
        vm.expectRevert(
            abi.encodeWithSelector(PerennialVault.BudgetExceeded.selector, id, 30 * USD)
        );
        vault.spend(id, merchant, 31 * USD, ref, deadline, signature);

        // The next window has a fresh budget.
        skip(PAYOUT_INTERVAL);
        _spend(id, BUDGET);
        assertEq(token.balanceOf(merchant), 170 * USD);
    }

    function test_spendAndClaim_shareOneBudget() public {
        uint256 id = _openBudget(PRINCIPAL, type(uint256).max);
        _spend(id, 75 * USD);

        uint256 paid = _claim(id);

        assertEq(paid, 25 * USD);
        assertEq(token.balanceOf(beneficiary), 25 * USD);
        assertEq(vault.budgetRemaining(id), 0);
        uint256 deadline = _deadline();
        bytes memory signature =
            _sign(BENEFICIARY_SECRET, id, PerennialVault.Action.Claim, deadline, 0);
        vm.expectRevert(
            abi.encodeWithSelector(
                PerennialVault.PayoutNotDue.selector, id, block.timestamp + PAYOUT_INTERVAL
            )
        );
        vault.claim(id, deadline, signature);
    }

    function test_claim_unusedBudgetDoesNotCarryOver() public {
        uint256 id = _openBudget(PRINCIPAL, type(uint256).max);
        skip(3 * PAYOUT_INTERVAL + 1 days);
        assertEq(_claim(id), BUDGET);
    }

    function test_budget_runsDownToZeroThenStops() public {
        PerennialVault flat = _flatVault();
        PerennialVault.OpenParams memory p = _params();
        p.amount = 250 * USD;
        p.payoutAmount = BUDGET;
        p.budgetMode = true;
        vm.prank(owner);
        uint256 id = flat.open(p);

        _spendOn(flat, id, BUDGET, "1");
        skip(PAYOUT_INTERVAL);
        _spendOn(flat, id, BUDGET, "2");
        skip(PAYOUT_INTERVAL);
        _spendOn(flat, id, 50 * USD, "3");
        assertEq(flat.position(id).principal, 0);
        assertEq(flat.position(id).shares, 0);

        uint256 deadline = _deadline();
        uint256 nonce = flat.position(id).nonce;
        bytes memory signature = pqc.sign(
            BENEFICIARY_SECRET,
            flat.actionMessage(
                id,
                PerennialVault.Action.Spend,
                nonce,
                deadline,
                keccak256(abi.encode(merchant, uint256(1), bytes32("4")))
            )
        );
        vm.expectRevert(abi.encodeWithSelector(PerennialVault.InsufficientBuffer.selector, id, 0));
        flat.spend(id, merchant, 1, "4", deadline, signature);

        // Income or a top-up brings it back.
        token.mint(stranger, 10 * USD);
        vm.startPrank(stranger);
        token.approve(address(flat), 10 * USD);
        flat.fund(id, 10 * USD);
        vm.stopPrank();
        _spendOn(flat, id, 10 * USD, "5");
        assertEq(token.balanceOf(merchant), 260 * USD);
    }

    function test_budget_withoutTheFlagTheBufferIsTheLimit() public {
        uint256 id = _open(); // not in budget mode
        skip(1 days);
        uint256 available = vault.pendingYield(id);
        uint256 deadline = _deadline();
        bytes memory signature = _sign(
            BENEFICIARY_SECRET,
            id,
            PerennialVault.Action.Spend,
            deadline,
            keccak256(abi.encode(merchant, available + 1, bytes32("x")))
        );
        vm.expectRevert(
            abi.encodeWithSelector(PerennialVault.InsufficientBuffer.selector, id, available)
        );
        vault.spend(id, merchant, available + 1, "x", deadline, signature);
        assertEq(vault.budgetRemaining(id), 0);
    }

    function test_budget_compoundedIncomeIsDrawableLater() public {
        PerennialVault flat = _flatVault();
        PerennialVault.OpenParams memory p = _params();
        p.amount = 10 * USD;
        p.payoutAmount = BUDGET;
        p.budgetMode = true;
        p.bufferCap = 5 * USD;
        vm.prank(owner);
        uint256 id = flat.open(p);

        token.mint(stranger, 100 * USD);
        vm.startPrank(stranger);
        token.approve(address(flat), 100 * USD);
        flat.fund(id, 100 * USD);
        vm.stopPrank();
        assertEq(flat.position(id).buffer, 5 * USD);
        assertEq(flat.position(id).principal, 105 * USD);

        _spendOn(flat, id, BUDGET, "all");
        assertEq(flat.position(id).buffer + flat.position(id).principal, 10 * USD);
    }

    function test_distribute_afterSuccessionPaysTheHeirsFromThePrincipal() public {
        PerennialVault flat = _flatVault();
        PerennialVault.OpenParams memory p = _params();
        p.amount = 1_000 * USD;
        p.payoutAmount = BUDGET;
        p.budgetMode = true;
        vm.prank(owner);
        uint256 id = flat.open(p);
        skip(CHECK_IN_PERIOD + GRACE_PERIOD + 1);
        flat.triggerSuccession(id);

        uint256 paid = flat.distribute(id);

        assertEq(paid, BUDGET);
        assertEq(token.balanceOf(heirA), 60 * USD);
        assertEq(token.balanceOf(heirB), 40 * USD);
        assertEq(flat.position(id).principal, 900 * USD);
        vm.expectRevert();
        flat.distribute(id); // this window's budget is used
    }

    function test_close_returnsWhatIsLeftOfAReducedPrincipal() public {
        PerennialVault flat = _flatVault();
        PerennialVault.OpenParams memory p = _params();
        p.amount = 1_000 * USD;
        p.payoutAmount = BUDGET;
        p.budgetMode = true;
        p.ownerCanClose = true;
        vm.prank(owner);
        uint256 id = flat.open(p);
        _spendOn(flat, id, BUDGET, "a");
        uint256 before = token.balanceOf(owner);

        uint256 deadline = _deadline();
        uint256 nonce = flat.position(id).nonce;
        flat.closeByOwner(
            id,
            deadline,
            pqc.sign(
                OWNER_SECRET,
                flat.actionMessage(id, PerennialVault.Action.Close, nonce, deadline, 0)
            )
        );
        assertEq(token.balanceOf(owner) - before, 900 * USD);
    }

    /// Whatever the timing and amounts, a window never pays out more than its budget, and
    /// nothing is ever paid beyond what the position holds.
    function testFuzz_budget_neverExceedsTheRateOrThePosition(
        uint256[8] memory amounts,
        uint256[8] memory gaps,
        uint256 principal
    ) public {
        PerennialVault flat = _flatVault();
        PerennialVault.OpenParams memory p = _params();
        p.amount = bound(principal, 1, 1_000 * USD);
        p.payoutAmount = BUDGET;
        p.budgetMode = true;
        vm.prank(owner);
        uint256 id = flat.open(p);

        uint256 windowStart = block.timestamp;
        uint256 paidInWindow;
        uint256 paidTotal;
        for (uint256 i; i < 8; ++i) {
            skip(bound(gaps[i], 0, 20 days));
            if (block.timestamp >= windowStart + PAYOUT_INTERVAL) {
                windowStart += ((block.timestamp - windowStart) / PAYOUT_INTERVAL) * PAYOUT_INTERVAL;
                paidInWindow = 0;
            }
            uint256 amount = bound(amounts[i], 1, 150 * USD);
            uint256 held = flat.position(id).buffer + flat.position(id).principal;
            bytes32 ref = bytes32(i);
            uint256 deadline = _deadline();
            uint256 nonce = flat.position(id).nonce;
            bytes memory signature = pqc.sign(
                BENEFICIARY_SECRET,
                flat.actionMessage(
                    id,
                    PerennialVault.Action.Spend,
                    nonce,
                    deadline,
                    keccak256(abi.encode(merchant, amount, ref))
                )
            );
            bool fits = paidInWindow + amount <= BUDGET && amount <= held;
            if (!fits) vm.expectRevert();
            flat.spend(id, merchant, amount, ref, deadline, signature);
            if (fits) {
                paidInWindow += amount;
                paidTotal += amount;
            }
            assertLe(paidInWindow, BUDGET);
        }
        assertEq(token.balanceOf(merchant), paidTotal);
        assertLe(paidTotal, p.amount);
    }
}
