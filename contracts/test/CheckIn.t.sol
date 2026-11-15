// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {PerennialVault} from "../src/PerennialVault.sol";
import {PQCAuth} from "../src/libraries/PQCAuth.sol";
import {VaultFixture} from "./VaultFixture.sol";

contract CheckInTest is VaultFixture {
    function _checkIn(uint256 id) internal {
        uint256 deadline = _deadline();
        vault.checkIn(
            id, deadline, _sign(BENEFICIARY_SECRET, id, PerennialVault.Action.CheckIn, deadline, 0)
        );
    }

    function _heirsSignature(
        uint256 id,
        PerennialVault.Heir[] memory list,
        bytes32 secret,
        uint256 deadline
    ) internal view returns (bytes memory) {
        return
            _sign(secret, id, PerennialVault.Action.SetHeirs, deadline, keccak256(abi.encode(list)));
    }

    function _setHeirs(uint256 id, PerennialVault.Heir[] memory list, bytes32 secret) internal {
        uint256 deadline = _deadline();
        bytes memory signature =
            _sign(secret, id, PerennialVault.Action.SetHeirs, deadline, keccak256(abi.encode(list)));
        vault.setHeirs(id, list, deadline, signature);
    }

    function test_successionDeadline_startsAtOpening() public {
        uint256 id = _open();
        assertEq(vault.successionDeadline(id), block.timestamp + CHECK_IN_PERIOD + GRACE_PERIOD);
    }

    function test_checkIn_restartsThePeriod() public {
        uint256 id = _open();
        skip(60 days);

        _checkIn(id);

        assertEq(vault.position(id).lastCheckIn, block.timestamp);
        assertEq(vault.successionDeadline(id), block.timestamp + CHECK_IN_PERIOD + GRACE_PERIOD);
        assertEq(vault.position(id).nonce, 1);
    }

    function test_checkIn_canBeRelayedByAnyone() public {
        uint256 id = _open();
        skip(60 days);
        uint256 deadline = _deadline();
        bytes memory signature =
            _sign(BENEFICIARY_SECRET, id, PerennialVault.Action.CheckIn, deadline, 0);

        vm.prank(stranger);
        vault.checkIn(id, deadline, signature);

        assertEq(vault.position(id).lastCheckIn, block.timestamp);
    }

    /// Holding the beneficiary's classical account is not enough to prove life.
    function test_checkIn_revertsWithoutAValidSignatureEvenFromTheBeneficiary() public {
        uint256 id = _open();

        vm.prank(beneficiary);
        vm.expectRevert(abi.encodeWithSelector(PQCAuth.PQCSignatureInvalid.selector, beneficiary));
        vault.checkIn(id, _deadline(), hex"");
    }

    function test_checkIn_revertsWithTheOwnersSignature() public {
        uint256 id = _open();
        uint256 deadline = _deadline();
        bytes memory signature = _sign(OWNER_SECRET, id, PerennialVault.Action.CheckIn, deadline, 0);

        vm.expectRevert(abi.encodeWithSelector(PQCAuth.PQCSignatureInvalid.selector, beneficiary));
        vault.checkIn(id, deadline, signature);
    }

    function test_checkIn_revertsWhenReplayed() public {
        uint256 id = _open();
        uint256 deadline = block.timestamp + 365 days;
        bytes memory signature =
            _sign(BENEFICIARY_SECRET, id, PerennialVault.Action.CheckIn, deadline, 0);
        vault.checkIn(id, deadline, signature);

        vm.expectRevert(abi.encodeWithSelector(PQCAuth.PQCSignatureInvalid.selector, beneficiary));
        vault.checkIn(id, deadline, signature);
    }

    function test_checkIn_followsARotatedKey() public {
        uint256 id = _open();
        bytes32 newSecret = keccak256("beneficiary rotated secret");
        pqc.register(beneficiary, newSecret, true);
        uint256 deadline = _deadline();

        bytes memory oldKeySignature =
            _sign(BENEFICIARY_SECRET, id, PerennialVault.Action.CheckIn, deadline, 0);
        vm.expectRevert(abi.encodeWithSelector(PQCAuth.PQCSignatureInvalid.selector, beneficiary));
        vault.checkIn(id, deadline, oldKeySignature);

        vault.checkIn(
            id, deadline, _sign(newSecret, id, PerennialVault.Action.CheckIn, deadline, 0)
        );
        assertEq(vault.position(id).nonce, 1);
    }

    function test_claim_countsAsACheckIn() public {
        uint256 id = _open();
        skip(PAYOUT_INTERVAL);

        _claim(id);

        assertEq(vault.position(id).lastCheckIn, block.timestamp);
    }

    function test_setHeirs_replacesTheList() public {
        uint256 id = _open();
        PerennialVault.Heir[] memory list = new PerennialVault.Heir[](1);
        list[0] = PerennialVault.Heir(stranger, 10_000);
        skip(10 days);

        _setHeirs(id, list, BENEFICIARY_SECRET);

        PerennialVault.Heir[] memory stored = vault.heirs(id);
        assertEq(stored.length, 1);
        assertEq(stored[0].account, stranger);
        assertEq(stored[0].bps, 10_000);
        assertEq(vault.position(id).lastCheckIn, block.timestamp);
    }

    function test_setHeirs_canRemoveAllHeirs() public {
        uint256 id = _open();

        _setHeirs(id, new PerennialVault.Heir[](0), BENEFICIARY_SECRET);

        assertEq(vault.heirs(id).length, 0);
    }

    function test_setHeirs_revertsWhenTheOwnerSigns() public {
        uint256 id = _open();
        PerennialVault.Heir[] memory list = new PerennialVault.Heir[](1);
        list[0] = PerennialVault.Heir(owner, 10_000);

        uint256 deadline = _deadline();
        bytes memory signature = _heirsSignature(id, list, OWNER_SECRET, deadline);

        vm.expectRevert(abi.encodeWithSelector(PQCAuth.PQCSignatureInvalid.selector, beneficiary));
        vault.setHeirs(id, list, deadline, signature);
    }

    /// A signature approves one exact list; it cannot be reused for a different one.
    function test_setHeirs_revertsWhenTheListDiffersFromTheSignedOne() public {
        uint256 id = _open();
        PerennialVault.Heir[] memory signed = new PerennialVault.Heir[](1);
        signed[0] = PerennialVault.Heir(heirA, 10_000);
        PerennialVault.Heir[] memory submitted = new PerennialVault.Heir[](1);
        submitted[0] = PerennialVault.Heir(stranger, 10_000);
        uint256 deadline = _deadline();
        bytes memory signature = _sign(
            BENEFICIARY_SECRET,
            id,
            PerennialVault.Action.SetHeirs,
            deadline,
            keccak256(abi.encode(signed))
        );

        vm.expectRevert(abi.encodeWithSelector(PQCAuth.PQCSignatureInvalid.selector, beneficiary));
        vault.setHeirs(id, submitted, deadline, signature);
    }

    function test_setHeirs_revertsOnInvalidWeights() public {
        uint256 id = _open();
        PerennialVault.Heir[] memory list = new PerennialVault.Heir[](1);
        list[0] = PerennialVault.Heir(heirA, 9_999);

        uint256 deadline = _deadline();
        bytes memory signature = _heirsSignature(id, list, BENEFICIARY_SECRET, deadline);

        vm.expectRevert(PerennialVault.HeirWeightsMustTotalBps.selector);
        vault.setHeirs(id, list, deadline, signature);
    }
}
