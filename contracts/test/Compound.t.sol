// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {PerennialVault} from "../src/PerennialVault.sol";
import {VaultFixture} from "./VaultFixture.sol";

contract CompoundTest is VaultFixture {
    event Compounded(uint256 indexed positionId, uint256 amount);

    function _openWithCap(uint256 cap, uint256 payout) internal returns (uint256) {
        PerennialVault.OpenParams memory p = _params();
        p.bufferCap = cap;
        p.payoutAmount = payout;
        return _open(p);
    }

    function test_open_storesTheCap() public {
        uint256 id = _openWithCap(50 * USD, PAYOUT);
        assertEq(vault.position(id).bufferCap, 50 * USD);
    }

    function test_harvest_addsWhatIsAboveTheCapToThePrincipal() public {
        uint256 id = _openWithCap(50 * USD, PAYOUT);
        skip(30 days);
        uint256 pending = vault.pendingYield(id);
        assertGt(pending, 50 * USD);

        vm.expectEmit(true, false, false, true, address(vault));
        emit Compounded(id, pending - 50 * USD);
        vault.harvest(id);

        PerennialVault.Position memory pos = vault.position(id);
        assertEq(pos.buffer, 50 * USD);
        assertEq(pos.principal, PRINCIPAL + pending - 50 * USD);
        assertGe(source.convertToAssets(pos.shares) + 1, pos.principal);
    }

    function test_harvest_belowTheCapCompoundsNothing() public {
        uint256 id = _openWithCap(1_000 * USD, PAYOUT);
        skip(30 days);
        uint256 pending = vault.pendingYield(id);
        vault.harvest(id);
        PerennialVault.Position memory pos = vault.position(id);
        assertEq(pos.buffer, pending);
        assertEq(pos.principal, PRINCIPAL);
    }

    function test_maxCapNeverCompounds() public {
        uint256 id = _openWithCap(type(uint256).max, PAYOUT);
        skip(3 * 365 days);
        vault.harvest(id);
        assertEq(vault.position(id).principal, PRINCIPAL);
    }

    /// A cap of zero compounds everything not paid on the schedule: the claim is paid first.
    function test_zeroCap_paysTheScheduleThenCompoundsTheRest() public {
        uint256 id = _openWithCap(0, PAYOUT);
        skip(PAYOUT_INTERVAL);
        uint256 pending = vault.pendingYield(id);

        uint256 paid = _claim(id);

        assertEq(paid, PAYOUT);
        PerennialVault.Position memory pos = vault.position(id);
        assertEq(pos.buffer, 0);
        assertEq(pos.principal, PRINCIPAL + pending - PAYOUT);
    }

    function test_zeroCap_harvestCompoundsEverything() public {
        uint256 id = _openWithCap(0, PAYOUT);
        skip(10 days);
        uint256 pending = vault.pendingYield(id);
        vault.harvest(id);
        PerennialVault.Position memory pos = vault.position(id);
        assertEq(pos.buffer, 0);
        assertEq(pos.principal, PRINCIPAL + pending);
    }

    /// A spend is taken before anything is compounded.
    function test_spend_isPaidBeforeCompounding() public {
        uint256 id = _openWithCap(0, 0);
        skip(1 days);
        uint256 pending = vault.pendingYield(id);
        address merchant = makeAddr("merchant");
        bytes32 ref = keccak256("call");
        uint256 deadline = _deadline();
        bytes memory signature = _sign(
            BENEFICIARY_SECRET,
            id,
            PerennialVault.Action.Spend,
            deadline,
            keccak256(abi.encode(merchant, uint256(1_000), ref))
        );
        vault.spend(id, merchant, 1_000, ref, deadline, signature);

        PerennialVault.Position memory pos = vault.position(id);
        assertEq(token.balanceOf(merchant), 1_000);
        assertEq(pos.buffer, 0);
        assertEq(pos.principal, PRINCIPAL + pending - 1_000);
    }

    function test_distribute_paysHeirsThenCompounds() public {
        uint256 id = _openWithCap(10 * USD, PAYOUT);
        skip(CHECK_IN_PERIOD + GRACE_PERIOD + 1);
        vault.triggerSuccession(id);
        skip(PAYOUT_INTERVAL);
        uint256 before = vault.position(id).principal;

        vault.distribute(id);

        PerennialVault.Position memory pos = vault.position(id);
        assertLe(pos.buffer, 10 * USD);
        assertGt(pos.principal, before);
        assertGt(token.balanceOf(heirA), 0);
    }

    /// Compounded principal is returned on close like any other principal.
    function test_close_returnsCompoundedPrincipalToTheOwner() public {
        PerennialVault.OpenParams memory p = _params();
        p.ownerCanClose = true;
        p.bufferCap = 0;
        uint256 id = _open(p);
        skip(365 days);
        vault.harvest(id);
        uint256 principal = vault.position(id).principal;
        assertGt(principal, PRINCIPAL);
        uint256 ownerBefore = token.balanceOf(owner);
        uint256 deadline = _deadline();

        vault.closeByOwner(
            id, deadline, _sign(OWNER_SECRET, id, PerennialVault.Action.Close, deadline, 0)
        );

        assertGe(token.balanceOf(owner) - ownerBefore + 1, principal);
    }

    function testFuzz_compounding_keepsBufferAtMostTheCapAndPrincipalGrowing(
        uint256 cap,
        uint256 elapsed
    ) public {
        cap = bound(cap, 0, 10_000 * USD);
        uint256 id = _openWithCap(cap, PAYOUT);
        skip(bound(elapsed, 1, 5 * 365 days));
        uint256 pending = vault.pendingYield(id);

        vault.harvest(id);

        PerennialVault.Position memory pos = vault.position(id);
        assertLe(pos.buffer, cap);
        assertEq(pos.buffer + pos.principal, PRINCIPAL + pending);
    }
}
