// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {PerennialVault} from "../src/PerennialVault.sol";
import {PQCAuth} from "../src/libraries/PQCAuth.sol";
import {VaultFixture} from "./VaultFixture.sol";

contract SpendTest is VaultFixture {
    address internal merchant = makeAddr("merchant");
    bytes32 internal constant REF = keccak256("POST /v1/chat/completions #1");

    event Spent(
        uint256 indexed positionId, address indexed to, uint256 amount, bytes32 indexed ref
    );
    event CheckedIn(
        uint256 indexed positionId, address indexed beneficiary, uint256 successionDeadline
    );

    function _spendParams(address to, uint256 amount, bytes32 ref)
        internal
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(to, amount, ref));
    }

    function _spendSignature(
        bytes32 secret,
        uint256 id,
        address to,
        uint256 amount,
        bytes32 ref,
        uint256 deadline
    ) internal view returns (bytes memory) {
        return
            _sign(secret, id, PerennialVault.Action.Spend, deadline, _spendParams(to, amount, ref));
    }

    function _spend(uint256 id, address to, uint256 amount, bytes32 ref) internal {
        uint256 deadline = _deadline();
        bytes memory signature = _spendSignature(BENEFICIARY_SECRET, id, to, amount, ref, deadline);
        vault.spend(id, to, amount, ref, deadline, signature);
    }

    function test_spend_paysFromHarvestedYieldAndLeavesThePrincipal() public {
        uint256 id = _open();
        skip(1 days);
        uint256 pending = vault.pendingYield(id);

        vm.expectEmit(true, true, true, true, address(vault));
        emit Spent(id, merchant, 2_000, REF);
        _spend(id, merchant, 2_000, REF);

        assertEq(token.balanceOf(merchant), 2_000);
        PerennialVault.Position memory pos = vault.position(id);
        assertEq(pos.principal, PRINCIPAL);
        assertEq(pos.buffer, pending - 2_000);
        assertEq(pos.nonce, 1);
    }

    function test_spend_canBeRelayedByAnyoneAndStillPaysWhoWasSigned() public {
        uint256 id = _open();
        skip(1 days);
        uint256 deadline = _deadline();
        bytes memory signature =
            _spendSignature(BENEFICIARY_SECRET, id, merchant, 2_000, REF, deadline);

        vm.prank(stranger);
        vault.spend(id, merchant, 2_000, REF, deadline, signature);

        assertEq(token.balanceOf(merchant), 2_000);
        assertEq(token.balanceOf(stranger), 0);
    }

    function test_spend_bindsRecipientAmountAndRef() public {
        uint256 id = _open();
        skip(1 days);
        uint256 deadline = _deadline();
        bytes memory signature =
            _spendSignature(BENEFICIARY_SECRET, id, merchant, 2_000, REF, deadline);

        vm.expectRevert(abi.encodeWithSelector(PQCAuth.PQCSignatureInvalid.selector, beneficiary));
        vault.spend(id, stranger, 2_000, REF, deadline, signature);
        vm.expectRevert(abi.encodeWithSelector(PQCAuth.PQCSignatureInvalid.selector, beneficiary));
        vault.spend(id, merchant, 2_001, REF, deadline, signature);
        vm.expectRevert(abi.encodeWithSelector(PQCAuth.PQCSignatureInvalid.selector, beneficiary));
        vault.spend(id, merchant, 2_000, keccak256("another request"), deadline, signature);

        vault.spend(id, merchant, 2_000, REF, deadline, signature);
    }

    function test_spend_cannotBeReplayed() public {
        uint256 id = _open();
        skip(1 days);
        uint256 deadline = _deadline();
        bytes memory signature =
            _spendSignature(BENEFICIARY_SECRET, id, merchant, 2_000, REF, deadline);
        vault.spend(id, merchant, 2_000, REF, deadline, signature);

        vm.expectRevert(abi.encodeWithSelector(PQCAuth.PQCSignatureInvalid.selector, beneficiary));
        vault.spend(id, merchant, 2_000, REF, deadline, signature);
    }

    function test_spend_refusesTheOwnersSignatureAndOtherActionsSignatures() public {
        uint256 id = _open();
        skip(1 days);
        uint256 deadline = _deadline();
        bytes memory ownerSignature =
            _spendSignature(OWNER_SECRET, id, merchant, 2_000, REF, deadline);
        vm.expectRevert(abi.encodeWithSelector(PQCAuth.PQCSignatureInvalid.selector, beneficiary));
        vault.spend(id, merchant, 2_000, REF, deadline, ownerSignature);

        bytes memory claimSignature = _sign(
            BENEFICIARY_SECRET,
            id,
            PerennialVault.Action.Claim,
            deadline,
            _spendParams(merchant, 2_000, REF)
        );
        vm.expectRevert(abi.encodeWithSelector(PQCAuth.PQCSignatureInvalid.selector, beneficiary));
        vault.spend(id, merchant, 2_000, REF, deadline, claimSignature);
    }

    function test_spend_revertsWhenTheBufferCannotCoverIt() public {
        uint256 id = _open();
        skip(1 days);
        uint256 available = vault.pendingYield(id);
        uint256 deadline = _deadline();
        bytes memory signature =
            _spendSignature(BENEFICIARY_SECRET, id, merchant, available + 1, REF, deadline);

        vm.expectRevert(
            abi.encodeWithSelector(PerennialVault.InsufficientBuffer.selector, id, available)
        );
        vault.spend(id, merchant, available + 1, REF, deadline, signature);
    }

    function test_spend_canTakeTheWholeBufferButNeverPrincipal() public {
        uint256 id = _open();
        skip(1 days);
        uint256 available = vault.pendingYield(id);
        _spend(id, merchant, available, REF);

        PerennialVault.Position memory pos = vault.position(id);
        assertEq(pos.buffer, 0);
        assertEq(pos.principal, PRINCIPAL);
        assertGe(source.convertToAssets(pos.shares), PRINCIPAL);
    }

    function test_spend_countsAsACheckIn() public {
        uint256 id = _open();
        skip(CHECK_IN_PERIOD + GRACE_PERIOD);

        vm.expectEmit(true, true, false, true, address(vault));
        emit CheckedIn(id, beneficiary, block.timestamp + CHECK_IN_PERIOD + GRACE_PERIOD);
        _spend(id, merchant, 1, REF);

        assertEq(vault.position(id).lastCheckIn, block.timestamp);
    }

    function test_spend_refusesAZeroRecipientAndAZeroAmount() public {
        uint256 id = _open();
        skip(1 days);
        uint256 deadline = _deadline();
        vm.expectRevert(PerennialVault.ZeroAddress.selector);
        vault.spend(id, address(0), 1, REF, deadline, "");
        vm.expectRevert(PerennialVault.ZeroAmount.selector);
        vault.spend(id, merchant, 0, REF, deadline, "");
    }

    function test_spend_refusesAnExpiredSignature() public {
        uint256 id = _open();
        skip(1 days);
        uint256 deadline = block.timestamp - 1;
        bytes memory signature = _spendSignature(BENEFICIARY_SECRET, id, merchant, 1, REF, deadline);
        vm.expectRevert(abi.encodeWithSelector(PerennialVault.SignatureExpired.selector, deadline));
        vault.spend(id, merchant, 1, REF, deadline, signature);
    }

    function test_spend_isNotPossibleAfterSuccession() public {
        uint256 id = _open();
        skip(CHECK_IN_PERIOD + GRACE_PERIOD + 1);
        vault.triggerSuccession(id);
        uint256 deadline = _deadline();
        bytes memory signature = _spendSignature(BENEFICIARY_SECRET, id, merchant, 1, REF, deadline);

        vm.expectRevert(abi.encodeWithSelector(PerennialVault.PositionSucceeded.selector, id));
        vault.spend(id, merchant, 1, REF, deadline, signature);
    }

    function test_spend_isNotPossibleOnAClosedPosition() public {
        PerennialVault.OpenParams memory p = _params();
        p.ownerCanClose = true;
        uint256 id = _open(p);
        uint256 deadline = _deadline();
        vault.closeByOwner(
            id, deadline, _sign(OWNER_SECRET, id, PerennialVault.Action.Close, deadline, 0)
        );

        vm.expectRevert(abi.encodeWithSelector(PerennialVault.PositionClosed.selector, id));
        vault.spend(id, merchant, 1, REF, deadline, "");
    }

    function test_spend_withoutAProvenKeyFailsClosed() public {
        uint256 id = _open();
        skip(1 days);
        pqc.register(beneficiary, BENEFICIARY_SECRET, false);
        uint256 deadline = _deadline();
        bytes memory signature = _spendSignature(BENEFICIARY_SECRET, id, merchant, 1, REF, deadline);

        vm.expectRevert(abi.encodeWithSelector(PQCAuth.PQCKeyNotProven.selector, beneficiary));
        vault.spend(id, merchant, 1, REF, deadline, signature);
    }

    /// The worst a stolen beneficiary key can do is spend what the buffer holds.
    function testFuzz_spend_neverPaysMoreThanTheBuffer(uint256 elapsed, uint256 amount) public {
        uint256 id = _open();
        skip(bound(elapsed, 1 hours, 3 * 365 days));
        uint256 available = vault.position(id).buffer + vault.pendingYield(id);
        amount = bound(amount, 1, available * 2 + 1);
        uint256 deadline = _deadline();
        bytes memory signature =
            _spendSignature(BENEFICIARY_SECRET, id, merchant, amount, REF, deadline);

        if (amount > available) {
            vm.expectRevert(
                abi.encodeWithSelector(PerennialVault.InsufficientBuffer.selector, id, available)
            );
            vault.spend(id, merchant, amount, REF, deadline, signature);
            return;
        }
        vault.spend(id, merchant, amount, REF, deadline, signature);
        assertEq(token.balanceOf(merchant), amount);
        assertEq(vault.position(id).principal, PRINCIPAL);
    }

    /// The one-call-an-hour sizing: 500 fUSD at 5% buys a 0.002 fUSD call every hour.
    function test_spend_fiveHundredAtFivePercentPaysOneCallAnHour() public {
        PerennialVault.OpenParams memory p = _params();
        p.amount = 500 * USD;
        p.payoutAmount = 0;
        uint256 id = _open(p);
        for (uint256 hour = 0; hour < 24 * 30; ++hour) {
            skip(1 hours);
            _spend(id, merchant, 2_000, bytes32(hour));
        }
        assertEq(token.balanceOf(merchant), 720 * 2_000);
        assertEq(vault.position(id).principal, 500 * USD);
    }
}
