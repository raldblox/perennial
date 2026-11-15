// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {PerennialVault} from "../src/PerennialVault.sol";
import {PQCAuth} from "../src/libraries/PQCAuth.sol";
import {VaultFixture} from "./VaultFixture.sol";

contract ClaimTest is VaultFixture {
    function _claimSignature(bytes32 secret, uint256 id, uint256 deadline)
        internal
        view
        returns (bytes memory)
    {
        return _sign(secret, id, PerennialVault.Action.Claim, deadline, 0);
    }

    function test_claim_paysTheScheduledAmountToTheBeneficiary() public {
        uint256 id = _open();
        skip(PAYOUT_INTERVAL);

        uint256 paid = _claim(id);

        assertEq(paid, PAYOUT);
        assertEq(token.balanceOf(beneficiary), PAYOUT);
        PerennialVault.Position memory pos = vault.position(id);
        assertEq(pos.principal, PRINCIPAL);
        assertEq(pos.lastPayout, block.timestamp);
        assertEq(pos.nonce, 1);
        // 30 days of 5% is about 410.96; what the payout did not use stays buffered.
        assertApproxEqAbs(pos.buffer, 10_958_904, 2);
    }

    function test_claim_canBeSubmittedByAnyoneAndStillPaysTheBeneficiary() public {
        uint256 id = _open();
        skip(PAYOUT_INTERVAL);
        uint256 deadline = _deadline();
        bytes memory signature = _claimSignature(BENEFICIARY_SECRET, id, deadline);

        vm.prank(stranger);
        vault.claim(id, deadline, signature);

        assertEq(token.balanceOf(beneficiary), PAYOUT);
        assertEq(token.balanceOf(stranger), 0);
    }

    function test_claim_revertsBeforeThePayoutIsDue() public {
        uint256 id = _open();
        skip(PAYOUT_INTERVAL - 1);
        uint256 deadline = _deadline();
        bytes memory signature = _claimSignature(BENEFICIARY_SECRET, id, deadline);

        vm.expectRevert(
            abi.encodeWithSelector(PerennialVault.PayoutNotDue.selector, id, block.timestamp + 1)
        );
        vault.claim(id, deadline, signature);
    }

    function test_claim_catchesUpOnMissedPeriods() public {
        uint256 id = _open();
        skip(3 * PAYOUT_INTERVAL + 5 days);

        uint256 paid = _claim(id);

        assertEq(paid, 3 * PAYOUT);
        assertEq(vault.nextPayoutAt(id), block.timestamp - 5 days + PAYOUT_INTERVAL);
    }

    function test_claim_paysOnlyWhatTheBufferHolds() public {
        PerennialVault.OpenParams memory p = _params();
        p.payoutAmount = 1_000 * USD;
        uint256 id = _open(p);
        skip(PAYOUT_INTERVAL);

        uint256 paid = _claim(id);

        // The yield of the period, not the 1,000 that was asked for.
        assertApproxEqAbs(paid, 410_958_904, 2);
        PerennialVault.Position memory pos = vault.position(id);
        assertEq(pos.buffer, 0);
        assertEq(pos.principal, PRINCIPAL);
        assertGe(source.convertToAssets(pos.shares), PRINCIPAL);
    }

    function test_claim_doesNotCarryAShortfallOver() public {
        PerennialVault.OpenParams memory p = _params();
        p.payoutAmount = 1_000 * USD;
        uint256 id = _open(p);
        skip(PAYOUT_INTERVAL);
        _claim(id);
        skip(PAYOUT_INTERVAL);

        uint256 paid = _claim(id);

        assertApproxEqAbs(paid, 410_958_904, 2);
    }

    function test_claim_withZeroPayoutAmountPaysTheWholeBuffer() public {
        PerennialVault.OpenParams memory p = _params();
        p.payoutAmount = 0;
        uint256 id = _open(p);
        skip(365 days);

        uint256 paid = _claim(id);

        assertApproxEqAbs(paid, 5_000 * USD, 1);
        assertEq(vault.position(id).buffer, 0);
    }

    function test_claim_revertsWithAnotherAccountsSignature() public {
        uint256 id = _open();
        skip(PAYOUT_INTERVAL);
        uint256 deadline = _deadline();
        bytes memory signature = _claimSignature(OWNER_SECRET, id, deadline);

        vm.expectRevert(abi.encodeWithSelector(PQCAuth.PQCSignatureInvalid.selector, beneficiary));
        vault.claim(id, deadline, signature);
    }

    /// The beneficiary's own classical account cannot claim without the ML-DSA signature.
    function test_claim_revertsWithoutAValidSignatureEvenFromTheBeneficiary() public {
        uint256 id = _open();
        skip(PAYOUT_INTERVAL);

        vm.prank(beneficiary);
        vm.expectRevert(abi.encodeWithSelector(PQCAuth.PQCSignatureInvalid.selector, beneficiary));
        vault.claim(id, _deadline(), hex"");
    }

    function test_claim_revertsWhenTheSignatureIsReplayed() public {
        uint256 id = _open();
        skip(PAYOUT_INTERVAL);
        uint256 deadline = block.timestamp + 365 days;
        bytes memory signature = _claimSignature(BENEFICIARY_SECRET, id, deadline);
        vault.claim(id, deadline, signature);
        skip(PAYOUT_INTERVAL);

        vm.expectRevert(abi.encodeWithSelector(PQCAuth.PQCSignatureInvalid.selector, beneficiary));
        vault.claim(id, deadline, signature);
    }

    function test_claim_revertsAfterTheSignatureDeadline() public {
        uint256 id = _open();
        skip(PAYOUT_INTERVAL);
        uint256 deadline = _deadline();
        bytes memory signature = _claimSignature(BENEFICIARY_SECRET, id, deadline);
        skip(1 hours + 1);

        vm.expectRevert(abi.encodeWithSelector(PerennialVault.SignatureExpired.selector, deadline));
        vault.claim(id, deadline, signature);
    }

    function test_claim_revertsWithASignatureForAnotherPosition() public {
        uint256 first = _open();
        uint256 second = _open();
        skip(PAYOUT_INTERVAL);
        uint256 deadline = _deadline();
        bytes memory signature = _claimSignature(BENEFICIARY_SECRET, first, deadline);

        vm.expectRevert(abi.encodeWithSelector(PQCAuth.PQCSignatureInvalid.selector, beneficiary));
        vault.claim(second, deadline, signature);
    }

    function test_claim_revertsWithASignatureForAnotherAction() public {
        uint256 id = _open();
        skip(PAYOUT_INTERVAL);
        uint256 deadline = _deadline();
        bytes memory signature =
            _sign(BENEFICIARY_SECRET, id, PerennialVault.Action.CheckIn, deadline, 0);

        vm.expectRevert(abi.encodeWithSelector(PQCAuth.PQCSignatureInvalid.selector, beneficiary));
        vault.claim(id, deadline, signature);
    }

    function test_claim_revertsWithASignatureForAnotherVault() public {
        PerennialVault other = new PerennialVault(token, source);
        vm.startPrank(owner);
        token.approve(address(other), type(uint256).max);
        uint256 otherId = other.open(_params());
        vm.stopPrank();
        uint256 id = _open();
        skip(PAYOUT_INTERVAL);
        uint256 deadline = _deadline();
        bytes memory signature = _claimSignature(BENEFICIARY_SECRET, id, deadline);

        vm.expectRevert(abi.encodeWithSelector(PQCAuth.PQCSignatureInvalid.selector, beneficiary));
        other.claim(otherId, deadline, signature);
    }

    function test_claim_revertsWithASignatureForAnotherChain() public {
        uint256 id = _open();
        skip(PAYOUT_INTERVAL);
        uint256 deadline = _deadline();
        bytes memory signature = _claimSignature(BENEFICIARY_SECRET, id, deadline);
        vm.chainId(9801);

        vm.expectRevert(abi.encodeWithSelector(PQCAuth.PQCSignatureInvalid.selector, beneficiary));
        vault.claim(id, deadline, signature);
    }

    function testFuzz_claim_neverPaysOutPrincipal(uint256 payout, uint8 rounds, uint32 gap)
        public
    {
        payout = bound(payout, 0, 10_000 * USD);
        rounds = uint8(bound(rounds, 1, 12));
        PerennialVault.OpenParams memory p = _params();
        p.payoutAmount = payout;
        uint256 id = _open(p);

        uint256 totalPaid;
        for (uint256 i; i < rounds; ++i) {
            skip(PAYOUT_INTERVAL + bound(gap, 0, 400 days));
            totalPaid += _claim(id);
        }

        PerennialVault.Position memory pos = vault.position(id);
        assertEq(pos.principal, PRINCIPAL);
        assertGe(source.convertToAssets(pos.shares), PRINCIPAL);
        assertEq(token.balanceOf(beneficiary), totalPaid);
        assertEq(token.balanceOf(address(vault)), pos.buffer);
    }
}
