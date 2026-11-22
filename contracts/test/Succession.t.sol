// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {PerennialVault} from "../src/PerennialVault.sol";
import {VaultFixture} from "./VaultFixture.sol";

contract SuccessionTest is VaultFixture {
    uint256 internal constant SILENCE = uint256(CHECK_IN_PERIOD) + GRACE_PERIOD;

    function _succeed(uint256 id) internal {
        skip(SILENCE + 1);
        vm.prank(stranger);
        vault.triggerSuccession(id);
    }

    function test_triggerSuccession_revertsBeforeTheDeadline() public {
        uint256 id = _open();
        uint256 notBefore = vault.successionDeadline(id);
        skip(CHECK_IN_PERIOD + 1);

        vm.expectRevert(
            abi.encodeWithSelector(PerennialVault.SuccessionNotDue.selector, id, notBefore)
        );
        vault.triggerSuccession(id);
    }

    function test_triggerSuccession_revertsAtTheDeadlineItself() public {
        uint256 id = _open();
        uint256 notBefore = vault.successionDeadline(id);
        skip(SILENCE);

        vm.expectRevert(
            abi.encodeWithSelector(PerennialVault.SuccessionNotDue.selector, id, notBefore)
        );
        vault.triggerSuccession(id);
    }

    function test_triggerSuccession_canBeCalledByAnyoneAfterTheDeadline() public {
        uint256 id = _open();

        _succeed(id);

        assertTrue(vault.position(id).succeeded);
    }

    function test_triggerSuccession_revertsWithoutHeirs() public {
        PerennialVault.OpenParams memory p = _params();
        p.heirs = new PerennialVault.Heir[](0);
        uint256 id = _open(p);
        skip(SILENCE + 1);

        vm.expectRevert(abi.encodeWithSelector(PerennialVault.NoHeirs.selector, id));
        vault.triggerSuccession(id);
    }

    function test_triggerSuccession_revertsTheSecondTime() public {
        uint256 id = _open();
        _succeed(id);

        vm.expectRevert(abi.encodeWithSelector(PerennialVault.PositionSucceeded.selector, id));
        vault.triggerSuccession(id);
    }

    /// A check-in during the grace period, before anyone triggers, keeps the position with its beneficiary.
    function test_lateCheckIn_preventsSuccession() public {
        uint256 id = _open();
        skip(CHECK_IN_PERIOD + GRACE_PERIOD / 2);
        uint256 deadline = _deadline();
        vault.checkIn(
            id, deadline, _sign(BENEFICIARY_SECRET, id, PerennialVault.Action.CheckIn, deadline, 0)
        );
        uint256 notBefore = vault.successionDeadline(id);
        skip(GRACE_PERIOD);

        vm.expectRevert(
            abi.encodeWithSelector(PerennialVault.SuccessionNotDue.selector, id, notBefore)
        );
        vault.triggerSuccession(id);
    }

    function test_afterSuccession_theBeneficiaryCannotCheckIn() public {
        uint256 id = _open();
        _succeed(id);
        uint256 deadline = _deadline();
        bytes memory signature =
            _sign(BENEFICIARY_SECRET, id, PerennialVault.Action.CheckIn, deadline, 0);

        vm.expectRevert(abi.encodeWithSelector(PerennialVault.PositionSucceeded.selector, id));
        vault.checkIn(id, deadline, signature);
    }

    function test_afterSuccession_theBeneficiaryCannotClaim() public {
        uint256 id = _open();
        _succeed(id);
        uint256 deadline = _deadline();
        bytes memory signature =
            _sign(BENEFICIARY_SECRET, id, PerennialVault.Action.Claim, deadline, 0);

        vm.expectRevert(abi.encodeWithSelector(PerennialVault.PositionSucceeded.selector, id));
        vault.claim(id, deadline, signature);
    }

    function test_afterSuccession_theBeneficiaryCannotChangeHeirs() public {
        uint256 id = _open();
        _succeed(id);
        PerennialVault.Heir[] memory list = new PerennialVault.Heir[](1);
        list[0] = PerennialVault.Heir(beneficiary, 10_000);
        uint256 deadline = _deadline();
        bytes memory signature = _sign(
            BENEFICIARY_SECRET,
            id,
            PerennialVault.Action.SetHeirs,
            deadline,
            keccak256(abi.encode(list))
        );

        vm.expectRevert(abi.encodeWithSelector(PerennialVault.PositionSucceeded.selector, id));
        vault.setHeirs(id, list, deadline, signature);
    }

    function test_distribute_revertsBeforeSuccession() public {
        uint256 id = _open();
        skip(PAYOUT_INTERVAL);

        vm.expectRevert(abi.encodeWithSelector(PerennialVault.PositionNotSucceeded.selector, id));
        vault.distribute(id);
    }

    function test_distribute_splitsThePayoutByWeight() public {
        uint256 id = _open();
        _succeed(id);

        vm.prank(stranger);
        uint256 paid = vault.distribute(id);

        // 121 days of silence is four whole payout periods.
        assertEq(paid, 4 * PAYOUT);
        assertEq(token.balanceOf(heirA), (4 * PAYOUT * 6_000) / 10_000);
        assertEq(token.balanceOf(heirB), (4 * PAYOUT * 4_000) / 10_000);
        assertEq(token.balanceOf(stranger), 0);
        assertEq(token.balanceOf(beneficiary), 0);
    }

    function test_distribute_leavesThePrincipalInvested() public {
        uint256 id = _open();
        _succeed(id);

        vault.distribute(id);

        PerennialVault.Position memory pos = vault.position(id);
        assertEq(pos.principal, PRINCIPAL);
        assertGe(source.convertToAssets(pos.shares), PRINCIPAL);
    }

    function test_distribute_keepsPayingOnSchedule() public {
        uint256 id = _open();
        _succeed(id);
        vault.distribute(id);
        uint256 dueAt = vault.nextPayoutAt(id);

        vm.expectRevert(abi.encodeWithSelector(PerennialVault.PayoutNotDue.selector, id, dueAt));
        vault.distribute(id);

        vm.warp(dueAt);
        assertEq(vault.distribute(id), PAYOUT);
    }

    function test_distribute_returnsDivisionDustToTheBuffer() public {
        PerennialVault.OpenParams memory p = _params();
        p.payoutAmount = 100 * USD + 1;
        p.heirs = new PerennialVault.Heir[](3);
        p.heirs[0] = PerennialVault.Heir(heirA, 3_333);
        p.heirs[1] = PerennialVault.Heir(heirB, 3_333);
        p.heirs[2] = PerennialVault.Heir(stranger, 3_334);
        uint256 id = _open(p);
        skip(SILENCE + 1);
        vault.triggerSuccession(id);

        uint256 paid = vault.distribute(id);

        uint256 owed = 4 * p.payoutAmount;
        assertLt(paid, owed);
        assertEq(token.balanceOf(heirA) + token.balanceOf(heirB) + token.balanceOf(stranger), paid);
        assertEq(token.balanceOf(address(vault)), vault.position(id).buffer);
    }
}
