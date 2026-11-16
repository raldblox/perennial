// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {stdError} from "forge-std/StdError.sol";
import {PerennialVault} from "../src/PerennialVault.sol";
import {PQCAuth} from "../src/libraries/PQCAuth.sol";
import {VaultFixture} from "./VaultFixture.sol";

/// @dev One test per finding of the AI contract review of 16 November 2026 (docs/AUDIT.md).
contract AuditFindingsTest is VaultFixture {
    function _closable() internal returns (uint256 id) {
        PerennialVault.OpenParams memory p = _params();
        p.ownerCanClose = true;
        id = _open(p);
    }

    // HIGH "missing access control on closeByOwner": the access control is the owner's
    // ML-DSA-87 signature, checked by _authorize, not a msg.sender modifier.

    function test_finding1_aCallerWithoutTheOwnersSignatureCannotClose() public {
        uint256 id = _closable();
        uint256 deadline = _deadline();
        bytes memory beneficiarySignature =
            _sign(BENEFICIARY_SECRET, id, PerennialVault.Action.Close, deadline, 0);

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(PQCAuth.PQCSignatureInvalid.selector, owner));
        vault.closeByOwner(id, deadline, beneficiarySignature);

        vm.prank(owner); // even the owner's own address needs the signature
        vm.expectRevert(abi.encodeWithSelector(PQCAuth.PQCSignatureInvalid.selector, owner));
        vault.closeByOwner(id, deadline, new bytes(4627));
    }

    function test_finding1_aRelayedOwnerSignatureStillPaysTheOwner() public {
        uint256 id = _closable();
        uint256 before = token.balanceOf(owner);
        uint256 deadline = _deadline();
        bytes memory signature = _sign(OWNER_SECRET, id, PerennialVault.Action.Close, deadline, 0);

        vm.prank(stranger);
        vault.closeByOwner(id, deadline, signature);

        assertEq(token.balanceOf(owner) - before, PRINCIPAL);
        assertEq(token.balanceOf(stranger), 0);
    }

    // MEDIUM "potential overflow in _payHeirs": Solidity 0.8 arithmetic is checked, so a
    // product that does not fit reverts instead of wrapping, and every amount a real token
    // supply can reach splits exactly.

    function testFuzz_finding2_heirSharesAddUpExactly(uint128 amount, uint16 bpsA) public {
        bpsA = uint16(bound(bpsA, 1, 9_999));
        PerennialVault.OpenParams memory p = _params();
        p.payoutAmount = 0;
        p.heirs[0].bps = bpsA;
        p.heirs[1].bps = uint16(10_000 - bpsA);
        uint256 id = _open(p);
        skip(CHECK_IN_PERIOD + GRACE_PERIOD + 1);
        vault.triggerSuccession(id);
        token.mint(stranger, amount);
        vm.startPrank(stranger);
        token.approve(address(vault), amount);
        if (amount > 0) vault.fund(id, amount);
        vm.stopPrank();
        uint256 buffer = vault.position(id).buffer + vault.pendingYield(id);

        uint256 paid = vault.distribute(id);

        assertEq(token.balanceOf(heirA), (buffer * bpsA) / 10_000);
        assertEq(token.balanceOf(heirB), (buffer * (10_000 - bpsA)) / 10_000);
        assertEq(paid + vault.position(id).buffer, buffer);
    }

    function test_finding2_anOverflowingProductRevertsInsteadOfWrapping() public {
        PerennialVault.OpenParams memory p = _params();
        p.payoutAmount = 0;
        uint256 id = _open(p);
        skip(CHECK_IN_PERIOD + GRACE_PERIOD + 1);
        vault.triggerSuccession(id);
        uint256 huge = type(uint256).max / 6_000 + 1; // × 6,000 bps overflows
        token.mint(stranger, huge);
        vm.startPrank(stranger);
        token.approve(address(vault), huge);
        vault.fund(id, huge);
        vm.stopPrank();
        skip(PAYOUT_INTERVAL);

        vm.expectRevert(stdError.arithmeticError);
        vault.distribute(id);
    }

    // MEDIUM "front-running in claim": a claim pays the beneficiary whoever submits it, and
    // the signature works once, so front-running can only submit the beneficiary's own
    // claim earlier.

    function test_finding3_aFrontRunClaimStillPaysOnlyTheBeneficiary() public {
        uint256 id = _open();
        skip(PAYOUT_INTERVAL);
        uint256 deadline = _deadline();
        bytes memory signature =
            _sign(BENEFICIARY_SECRET, id, PerennialVault.Action.Claim, deadline, 0);

        vm.prank(stranger); // the front-runner
        vault.claim(id, deadline, signature);
        assertEq(token.balanceOf(beneficiary), PAYOUT);
        assertEq(token.balanceOf(stranger), 0);

        vm.prank(beneficiary); // the original submission is refused, nothing is paid twice
        vm.expectRevert(abi.encodeWithSelector(PQCAuth.PQCSignatureInvalid.selector, beneficiary));
        vault.claim(id, deadline, signature);
        assertEq(token.balanceOf(beneficiary), PAYOUT);
    }

    // LOW "unbounded loop in _storeHeirs": the list is bounded by MAX_HEIRS (16).

    function test_finding4_seventeenHeirsRevertOnSetHeirs() public {
        uint256 id = _open();
        PerennialVault.Heir[] memory list = new PerennialVault.Heir[](17);
        for (uint256 i; i < 17; ++i) {
            list[i] = PerennialVault.Heir(address(uint160(0x1000 + i)), i == 0 ? 10_000 - 16 : 1);
        }
        uint256 deadline = _deadline();
        bytes memory signature = _sign(
            BENEFICIARY_SECRET,
            id,
            PerennialVault.Action.SetHeirs,
            deadline,
            keccak256(abi.encode(list))
        );
        vm.expectRevert(PerennialVault.TooManyHeirs.selector);
        vault.setHeirs(id, list, deadline, signature);
    }

    function test_finding4_sixteenHeirsFitInABoundedGasCost() public {
        uint256 id = _open();
        PerennialVault.Heir[] memory list = new PerennialVault.Heir[](16);
        for (uint256 i; i < 16; ++i) {
            list[i] = PerennialVault.Heir(address(uint160(0x1000 + i)), i == 0 ? 10_000 - 15 : 1);
        }
        uint256 deadline = _deadline();
        bytes memory signature = _sign(
            BENEFICIARY_SECRET,
            id,
            PerennialVault.Action.SetHeirs,
            deadline,
            keccak256(abi.encode(list))
        );
        uint256 gasBefore = gasleft();
        vault.setHeirs(id, list, deadline, signature);
        assertLt(gasBefore - gasleft(), 1_000_000);
        assertEq(vault.heirs(id).length, 16);
    }
}
