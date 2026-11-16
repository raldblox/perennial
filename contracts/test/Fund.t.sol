// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {PerennialVault} from "../src/PerennialVault.sol";
import {VaultFixture} from "./VaultFixture.sol";

/// @dev Income from anyone (`fund`) and deposits from many payers (`topUp`).
contract FundTest is VaultFixture {
    event Funded(uint256 indexed positionId, address indexed from, uint256 amount);
    event ToppedUp(uint256 indexed positionId, address indexed from, uint256 amount);

    function _payer(string memory name, uint256 amount) internal returns (address payer) {
        payer = makeAddr(name);
        token.mint(payer, amount);
        vm.prank(payer);
        token.approve(address(vault), amount);
    }

    function test_fund_paysIntoTheBufferFromAnyone() public {
        uint256 id = _open();
        address payer = _payer("customer", 50 * USD);

        vm.expectEmit(true, true, false, true, address(vault));
        emit Funded(id, payer, 50 * USD);
        vm.prank(payer);
        vault.fund(id, 50 * USD);

        PerennialVault.Position memory pos = vault.position(id);
        assertEq(pos.buffer, 50 * USD);
        assertEq(pos.principal, PRINCIPAL);
        assertEq(token.balanceOf(payer), 0);
    }

    function test_fund_aboveTheCapIsCompounded() public {
        PerennialVault.OpenParams memory p = _params();
        p.bufferCap = 20 * USD;
        uint256 id = _open(p);
        address payer = _payer("grant", 50 * USD);

        vm.prank(payer);
        vault.fund(id, 50 * USD);

        PerennialVault.Position memory pos = vault.position(id);
        assertEq(pos.buffer, 20 * USD);
        assertEq(pos.principal, PRINCIPAL + 30 * USD);
    }

    function test_fund_isSpendableWithoutBudgetMode() public {
        uint256 id = _open();
        address payer = _payer("customer", 5 * USD);
        vm.prank(payer);
        vault.fund(id, 5 * USD);

        address merchant = makeAddr("merchant");
        uint256 deadline = _deadline();
        bytes memory signature = _sign(
            BENEFICIARY_SECRET,
            id,
            PerennialVault.Action.Spend,
            deadline,
            keccak256(abi.encode(merchant, uint256(5 * USD), bytes32("r")))
        );
        vault.spend(id, merchant, 5 * USD, "r", deadline, signature);
        assertEq(token.balanceOf(merchant), 5 * USD);
    }

    function test_fund_afterSuccessionReachesTheHeirs() public {
        PerennialVault.OpenParams memory p = _params();
        p.payoutAmount = 0; // everything in the buffer
        uint256 id = _open(p);
        skip(CHECK_IN_PERIOD + GRACE_PERIOD + 1);
        vault.triggerSuccession(id);
        address payer = _payer("customer", 10 * USD);
        vm.prank(payer);
        vault.fund(id, 10 * USD);
        skip(PAYOUT_INTERVAL);

        vault.distribute(id);

        assertGe(token.balanceOf(heirA), 6 * USD);
        assertGe(token.balanceOf(heirB), 4 * USD);
    }

    function test_fund_refusesZeroAndClosedPositions() public {
        PerennialVault.OpenParams memory p = _params();
        p.ownerCanClose = true;
        uint256 id = _open(p);
        vm.expectRevert(PerennialVault.ZeroAmount.selector);
        vault.fund(id, 0);

        uint256 deadline = _deadline();
        vault.closeByOwner(
            id, deadline, _sign(OWNER_SECRET, id, PerennialVault.Action.Close, deadline, 0)
        );
        vm.expectRevert(abi.encodeWithSelector(PerennialVault.PositionClosed.selector, id));
        vault.fund(id, 1);
    }

    function test_topUp_acceptsManyDepositsFromDifferentPayers() public {
        uint256 id = _open();
        uint256 total = PRINCIPAL;
        for (uint256 i = 1; i <= 12; ++i) {
            uint256 amount = i * 7 * USD;
            address payer = _payer(string.concat("payer", vm.toString(i)), amount);
            vm.expectEmit(true, true, false, true, address(vault));
            emit ToppedUp(id, payer, amount);
            vm.prank(payer);
            vault.topUp(id, amount);
            total += amount;
            skip(1 days);
        }
        PerennialVault.Position memory pos = vault.position(id);
        assertEq(pos.principal, total);
        assertGe(source.convertToAssets(pos.shares) + 12, total);
    }

    function testFuzz_fund_keepsTheVaultBalanceEqualToTheBuffers(uint96 a, uint96 b) public {
        uint256 id = _open();
        address payer = _payer("p", uint256(a) + uint256(b));
        vm.startPrank(payer);
        if (a > 0) vault.fund(id, a);
        if (b > 0) vault.fund(id, b);
        vm.stopPrank();
        assertEq(token.balanceOf(address(vault)), vault.position(id).buffer);
        assertEq(vault.position(id).buffer, uint256(a) + uint256(b));
    }
}
