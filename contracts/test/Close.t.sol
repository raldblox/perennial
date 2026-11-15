// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {PerennialVault} from "../src/PerennialVault.sol";
import {PQCAuth} from "../src/libraries/PQCAuth.sol";
import {VaultFixture} from "./VaultFixture.sol";

contract CloseTest is VaultFixture {
    function _openClosable() internal returns (uint256) {
        PerennialVault.OpenParams memory p = _params();
        p.ownerCanClose = true;
        return _open(p);
    }

    function _closeSignature(bytes32 secret, uint256 id, uint256 deadline)
        internal
        view
        returns (bytes memory)
    {
        return _sign(secret, id, PerennialVault.Action.Close, deadline, 0);
    }

    function _close(uint256 id) internal {
        uint256 deadline = _deadline();
        bytes memory signature = _closeSignature(OWNER_SECRET, id, deadline);
        vault.closeByOwner(id, deadline, signature);
    }

    /// The default position is permanent: not even the owner's signature releases it.
    function test_close_revertsWhenTheRightWasNotKept() public {
        uint256 id = _open();
        uint256 deadline = _deadline();
        bytes memory signature = _closeSignature(OWNER_SECRET, id, deadline);

        vm.expectRevert(abi.encodeWithSelector(PerennialVault.CloseNotAllowed.selector, id));
        vault.closeByOwner(id, deadline, signature);
    }

    function test_close_returnsPrincipalToOwnerAndYieldToBeneficiary() public {
        uint256 id = _openClosable();
        uint256 ownerBefore = token.balanceOf(owner);
        skip(365 days);

        _close(id);

        assertApproxEqAbs(token.balanceOf(owner) - ownerBefore, PRINCIPAL, 1);
        assertApproxEqAbs(token.balanceOf(beneficiary), 5_000 * USD, 1);
        assertEq(token.balanceOf(address(vault)), 0);
        assertEq(source.balanceOf(address(vault)), 0);

        PerennialVault.Position memory pos = vault.position(id);
        assertTrue(pos.closed);
        assertEq(pos.principal, 0);
        assertEq(pos.shares, 0);
        assertEq(pos.buffer, 0);
    }

    function test_close_revertsWithTheBeneficiarysSignature() public {
        uint256 id = _openClosable();
        uint256 deadline = _deadline();
        bytes memory signature = _closeSignature(BENEFICIARY_SECRET, id, deadline);

        vm.expectRevert(abi.encodeWithSelector(PQCAuth.PQCSignatureInvalid.selector, owner));
        vault.closeByOwner(id, deadline, signature);
    }

    /// Holding the owner's classical account is not enough to take the principal out.
    function test_close_revertsWithoutAValidSignatureEvenFromTheOwner() public {
        uint256 id = _openClosable();

        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(PQCAuth.PQCSignatureInvalid.selector, owner));
        vault.closeByOwner(id, _deadline(), hex"");
    }

    function test_close_afterSuccessionPaysTheYieldToTheHeirs() public {
        uint256 id = _openClosable();
        skip(uint256(CHECK_IN_PERIOD) + GRACE_PERIOD + 1);
        vault.triggerSuccession(id);

        _close(id);

        uint256 toHeirs = token.balanceOf(heirA) + token.balanceOf(heirB);
        assertGt(toHeirs, 0);
        assertApproxEqAbs(token.balanceOf(heirA), (toHeirs * 6_000) / 10_000, 1);
        assertEq(token.balanceOf(beneficiary), 0);
        assertEq(token.balanceOf(address(vault)), 0);
    }

    function test_close_freezesThePosition() public {
        uint256 id = _openClosable();
        _close(id);
        bytes memory expected = abi.encodeWithSelector(PerennialVault.PositionClosed.selector, id);

        vm.expectRevert(expected);
        vault.harvest(id);

        vm.prank(owner);
        vm.expectRevert(expected);
        vault.topUp(id, 1 * USD);

        vm.expectRevert(expected);
        vault.triggerSuccession(id);

        vm.expectRevert(expected);
        vault.claim(id, block.timestamp + 1 hours, hex"");

        vm.expectRevert(expected);
        vault.closeByOwner(id, block.timestamp + 1 hours, hex"");

        assertEq(vault.pendingYield(id), 0);
    }

    function test_close_doesNotTouchOtherPositions() public {
        uint256 closable = _openClosable();
        uint256 permanent = _open();
        skip(365 days);

        _close(closable);

        vault.harvest(permanent);
        PerennialVault.Position memory pos = vault.position(permanent);
        assertEq(pos.principal, PRINCIPAL);
        assertGe(source.convertToAssets(pos.shares), PRINCIPAL);
        assertEq(token.balanceOf(address(vault)), pos.buffer);
    }
}
