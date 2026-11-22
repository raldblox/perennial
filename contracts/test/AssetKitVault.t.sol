// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {QoreChainRwaVault} from "qorechain-asset-kit/vaults/QoreChainRwaVault.sol";
import {QoreChainHybridHolderGuard} from "qorechain-asset-kit/guard/QoreChainHybridHolderGuard.sol";
import {IHolderEligibility} from "qorechain-asset-kit/interfaces/IHolderEligibility.sol";
import {PerennialVault} from "../src/PerennialVault.sol";
import {ERC4626Source} from "../src/adapters/ERC4626Source.sol";
import {VaultFixture} from "./VaultFixture.sol";

/// @dev ERC4626Source over the QoreChain Asset Kit's ERC-4626 vault (`QoreChainRwaVault`), whose
///      share holders must pass the Asset Kit's `QoreChainHybridHolderGuard`: a registered
///      ML-DSA-87 key with proof of possession, read from the same `pqcKeyStatus` precompile the
///      Perennial vault uses. The precompile stand-in from the fixture answers both. A contract
///      cannot hold an ML-DSA-87 key, so the adapter, which holds the shares, must be exempted by
///      the guard's owner; until it is, the Asset Kit vault reports no deposit capacity for it.
contract AssetKitVaultTest is VaultFixture {
    QoreChainHybridHolderGuard internal guard;
    QoreChainRwaVault internal rwa;
    ERC4626Source internal adapter;
    PerennialVault internal kitVault;

    function setUp() public override {
        super.setUp();
        guard = new QoreChainHybridHolderGuard(address(this));
        rwa = new QoreChainRwaVault(
            token, "Asset Kit vault", "akV", IHolderEligibility(address(guard))
        );
        adapter = new ERC4626Source(IERC4626(address(rwa)), token);
        kitVault = new PerennialVault(token, adapter);
        vm.prank(owner);
        token.approve(address(kitVault), type(uint256).max);
    }

    function _openOnKit(bool ownerCanClose) internal returns (uint256 id) {
        PerennialVault.OpenParams memory p = _params();
        p.ownerCanClose = ownerCanClose;
        vm.prank(owner);
        id = kitVault.open(p);
    }

    function test_guard_readsTheSamePqcKeyRegistry() public view {
        assertTrue(guard.precompileActive());
        assertTrue(guard.isEligible(owner)); // proven ML-DSA-87 key in the stand-in
        assertFalse(guard.isEligible(stranger)); // no key
        assertFalse(guard.isEligible(address(adapter))); // a contract has no key
    }

    /// Until the guard's owner exempts the adapter, the Asset Kit vault offers it no capacity,
    /// and the adapter refuses with its own error instead of whatever the vault would revert with.
    function test_unexemptedAdapter_isRefusedWithAClearError() public {
        assertEq(rwa.maxDeposit(address(adapter)), 0);
        PerennialVault.OpenParams memory p = _params();
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(ERC4626Source.DepositLimit.selector, PRINCIPAL, 0));
        kitVault.open(p);
    }

    /// Exempted, the adapter carries a position through harvest, claim and close on the Asset
    /// Kit vault, and the principal comes back whole.
    function test_exemptedAdapter_carriesAPositionThroughHarvestClaimAndClose() public {
        guard.setExempt(
            address(adapter), true, "Perennial ERC4626Source holds shares for its vaults"
        );
        uint256 id = _openOnKit(true);
        assertEq(rwa.balanceOf(address(adapter)), adapter.balanceOf(address(kitVault)));

        token.mint(address(rwa), 5_000 * USD); // 5% on the 100,000 principal, earned by the vault
        skip(PAYOUT_INTERVAL);
        assertApproxEqAbs(kitVault.harvest(id), 5_000 * USD, 2);

        uint256 deadline = _deadline();
        uint256 nonce = kitVault.position(id).nonce;
        kitVault.claim(
            id,
            deadline,
            pqc.sign(
                BENEFICIARY_SECRET,
                kitVault.actionMessage(id, PerennialVault.Action.Claim, nonce, deadline, 0)
            )
        );
        assertEq(token.balanceOf(beneficiary), PAYOUT);

        uint256 before = token.balanceOf(owner);
        nonce = kitVault.position(id).nonce;
        kitVault.closeByOwner(
            id,
            deadline,
            pqc.sign(
                OWNER_SECRET,
                kitVault.actionMessage(id, PerennialVault.Action.Close, nonce, deadline, 0)
            )
        );
        assertApproxEqAbs(token.balanceOf(owner) - before, PRINCIPAL, 2);
        assertEq(adapter.totalSupply(), 0);
    }

    /// The restriction still holds around the adapter: an address without a key cannot be sent
    /// the Asset Kit vault's shares.
    function test_sharesCannotReachAnAddressWithoutAKey() public {
        guard.setExempt(address(adapter), true, "Perennial ERC4626Source");
        token.mint(owner, 10 * USD);
        vm.startPrank(owner);
        token.approve(address(rwa), 10 * USD);
        rwa.deposit(10 * USD, owner); // the owner holds a proven key
        vm.expectRevert(
            abi.encodeWithSelector(
                QoreChainRwaVault.QoreChainRwaVault_NotEligible.selector, stranger
            )
        );
        IERC20(address(rwa)).transfer(stranger, 1);
        vm.stopPrank();
    }
}
