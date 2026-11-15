// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {PerennialVault} from "../src/PerennialVault.sol";
import {VaultFixture} from "./VaultFixture.sol";

contract HarvestTest is VaultFixture {
    event Harvested(uint256 indexed positionId, address indexed caller, uint256 yield);

    function test_harvest_movesAYearOfYieldIntoTheBuffer() public {
        uint256 id = _open();
        skip(365 days);

        uint256 yield = vault.harvest(id);

        // 5% of 100,000, less at most one unit of rounding kept with the principal.
        assertApproxEqAbs(yield, 5_000 * USD, 1);
        PerennialVault.Position memory pos = vault.position(id);
        assertEq(pos.buffer, yield);
        assertEq(pos.principal, PRINCIPAL);
        assertEq(token.balanceOf(address(vault)), yield);
    }

    function test_harvest_leavesThePrincipalFullyBacked() public {
        uint256 id = _open();
        skip(365 days);

        vault.harvest(id);

        assertGe(source.convertToAssets(vault.position(id).shares), PRINCIPAL);
    }

    function test_harvest_isPermissionless() public {
        uint256 id = _open();
        skip(30 days);

        vm.expectEmit(true, true, false, false);
        emit Harvested(id, stranger, 0);
        vm.prank(stranger);
        uint256 yield = vault.harvest(id);

        assertGt(yield, 0);
        assertEq(token.balanceOf(stranger), 0);
    }

    function test_harvest_returnsZeroWhenNothingAccrued() public {
        uint256 id = _open();

        assertEq(vault.harvest(id), 0);
        assertEq(vault.position(id).buffer, 0);
    }

    function test_harvest_twiceInARowYieldsNothingTheSecondTime() public {
        uint256 id = _open();
        skip(30 days);
        vault.harvest(id);

        assertEq(vault.harvest(id), 0);
    }

    function test_harvest_keepsPositionsApart() public {
        uint256 first = _open();
        skip(365 days);
        uint256 second = _open();

        vault.harvest(first);
        vault.harvest(second);

        assertApproxEqAbs(vault.position(first).buffer, 5_000 * USD, 1);
        assertEq(vault.position(second).buffer, 0);
    }

    function test_harvest_revertsOnUnknownPosition() public {
        vm.expectRevert(abi.encodeWithSelector(PerennialVault.UnknownPosition.selector, 9));
        vault.harvest(9);
    }

    function test_pendingYield_matchesTheHarvest() public {
        uint256 id = _open();
        skip(200 days);

        uint256 pending = vault.pendingYield(id);

        assertEq(vault.harvest(id), pending);
        assertEq(vault.pendingYield(id), 0);
    }

    function test_topUp_doesNotTurnPrincipalIntoYield() public {
        uint256 id = _open();
        skip(100 days);
        vm.prank(owner);
        vault.topUp(id, 50_000 * USD);

        uint256 yield = vault.harvest(id);

        // 100 days of 5% on the original 100,000 only.
        assertApproxEqAbs(yield, (PRINCIPAL * 5 * 100) / (100 * 365), 2);
        assertGe(source.convertToAssets(vault.position(id).shares), PRINCIPAL + 50_000 * USD);
    }

    function testFuzz_harvest_neverDipsIntoPrincipal(uint256 amount, uint256 elapsed) public {
        amount = bound(amount, 1, 1_000_000 * USD);
        elapsed = bound(elapsed, 0, 20 * 365 days);
        PerennialVault.OpenParams memory p = _params();
        p.amount = amount;
        uint256 id = _open(p);
        skip(elapsed);

        vault.harvest(id);

        PerennialVault.Position memory pos = vault.position(id);
        assertEq(pos.principal, amount);
        assertGe(source.convertToAssets(pos.shares), amount);
    }
}
