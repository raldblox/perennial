// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {PerennialVault} from "../src/PerennialVault.sol";
import {ERC4626Source} from "../src/adapters/ERC4626Source.sol";
import {IYieldSource} from "../src/interfaces/IYieldSource.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {VaultFixture} from "./VaultFixture.sol";

/// @dev OpenZeppelin's ERC-4626, unmodified. Yield is simulated by sending assets to it,
///      which raises the share price, the way a real strategy's earnings would.
contract Plain4626 is ERC4626 {
    constructor(IERC20 asset_) ERC20("Plain vault", "PV") ERC4626(asset_) {}
}

/// @dev An ERC-4626 that caps deposits and redemptions, like a vault with a limit or a queue.
contract Limited4626 is ERC4626 {
    uint256 public depositLimit = type(uint256).max;
    uint256 public redeemLimit = type(uint256).max;

    constructor(IERC20 asset_) ERC20("Limited vault", "LV") ERC4626(asset_) {}

    function setLimits(uint256 d, uint256 r) external {
        (depositLimit, redeemLimit) = (d, r);
    }

    function maxDeposit(address) public view override returns (uint256) {
        return depositLimit;
    }

    function maxRedeem(address owner) public view override returns (uint256) {
        uint256 held = balanceOf(owner);
        return held < redeemLimit ? held : redeemLimit;
    }
}

contract ERC4626SourceTest is VaultFixture {
    Plain4626 internal plain;
    ERC4626Source internal adapter;
    PerennialVault internal adapted;

    function setUp() public override {
        super.setUp();
        plain = new Plain4626(token);
        adapter = new ERC4626Source(IERC4626(address(plain)), token);
        adapted = new PerennialVault(token, adapter);
        vm.prank(owner);
        token.approve(address(adapted), type(uint256).max);
    }

    /// Yield, the way a real strategy earns it: more assets for the same shares.
    function _earn(IERC4626 vault, uint256 amount) internal {
        token.mint(address(vault), amount);
    }

    function _openOn(PerennialVault v) internal returns (uint256 id) {
        vm.prank(owner);
        id = v.open(_params());
    }

    function test_constructor_refusesAVaultForAnotherAsset() public {
        MockERC20 other = new MockERC20();
        Plain4626 wrong = new Plain4626(other);
        vm.expectRevert(
            abi.encodeWithSelector(
                ERC4626Source.AssetMismatch.selector, address(token), address(other)
            )
        );
        new ERC4626Source(IERC4626(address(wrong)), token);
    }

    function test_adapter_carriesAPositionThroughHarvestClaimAndClose() public {
        PerennialVault.OpenParams memory p = _params();
        p.ownerCanClose = true;
        vm.prank(owner);
        uint256 id = adapted.open(p);
        assertEq(adapter.balanceOf(address(adapted)), adapted.position(id).shares);

        _earn(plain, 5_000 * USD); // 5% on the 100,000 principal
        skip(PAYOUT_INTERVAL);
        uint256 harvested = adapted.harvest(id);
        assertApproxEqAbs(harvested, 5_000 * USD, 2);

        uint256 deadline = _deadline();
        uint256 nonce = adapted.position(id).nonce;
        bytes memory claimSig = pqc.sign(
            BENEFICIARY_SECRET,
            adapted.actionMessage(id, PerennialVault.Action.Claim, nonce, deadline, 0)
        );
        adapted.claim(id, deadline, claimSig);
        assertEq(token.balanceOf(beneficiary), PAYOUT);

        uint256 ownerBefore = token.balanceOf(owner);
        nonce = adapted.position(id).nonce;
        bytes memory closeSig = pqc.sign(
            OWNER_SECRET, adapted.actionMessage(id, PerennialVault.Action.Close, nonce, deadline, 0)
        );
        adapted.closeByOwner(id, deadline, closeSig);
        assertApproxEqAbs(token.balanceOf(owner) - ownerBefore, PRINCIPAL, 2);
        assertEq(adapter.totalSupply(), 0);
    }

    /// A conforming ERC-4626 also works as a source directly, without the adapter.
    function test_plainERC4626_worksAsASourceDirectly() public {
        Plain4626 direct = new Plain4626(token);
        PerennialVault v = new PerennialVault(token, IYieldSource(address(direct)));
        vm.prank(owner);
        token.approve(address(v), type(uint256).max);
        uint256 id = _openOn(v);

        _earn(direct, 1_000 * USD);
        assertApproxEqAbs(v.pendingYield(id), 1_000 * USD, 2);
        assertApproxEqAbs(v.harvest(id), 1_000 * USD, 2);
        assertEq(v.position(id).principal, PRINCIPAL);
    }

    function test_adapter_keepsEachDepositorsSharesApart() public {
        PerennialVault second = new PerennialVault(token, adapter);
        vm.prank(owner);
        token.approve(address(second), type(uint256).max);
        _openOn(adapted);
        _openOn(second);

        assertEq(adapter.balanceOf(address(adapted)), adapter.balanceOf(address(second)));
        uint256 theirs = adapter.balanceOf(address(second));
        vm.prank(address(adapted));
        vm.expectRevert(ERC4626Source.NotShareOwner.selector);
        adapter.redeem(theirs, address(adapted), address(second));

        vm.prank(address(adapted));
        vm.expectRevert(
            abi.encodeWithSelector(ERC4626Source.InsufficientShares.selector, theirs * 2, theirs)
        );
        adapter.redeem(theirs * 2, address(adapted), address(adapted));
    }

    /// The donation attack: an attacker inflates the share price of an empty vault so that a
    /// small deposit rounds to zero shares. The adapter refuses instead of losing the deposit.
    function test_adapter_refusesADepositThatWouldMintNoShares() public {
        Plain4626 victim = new Plain4626(token);
        ERC4626Source guarded = new ERC4626Source(IERC4626(address(victim)), token);
        token.mint(stranger, 1_000_001 * USD);
        vm.startPrank(stranger);
        token.approve(address(victim), 1);
        victim.deposit(1, stranger);
        token.transfer(address(victim), 1_000_000 * USD);
        vm.stopPrank();

        token.mint(address(this), 100 * USD);
        token.approve(address(guarded), 100 * USD);
        vm.expectRevert(abi.encodeWithSelector(ERC4626Source.ZeroShares.selector, 100 * USD));
        guarded.deposit(100 * USD, address(this));
    }

    function test_adapter_reportsTheVaultsLimits() public {
        Limited4626 limited = new Limited4626(token);
        ERC4626Source guarded = new ERC4626Source(IERC4626(address(limited)), token);
        token.mint(address(this), 1_000 * USD);
        token.approve(address(guarded), type(uint256).max);

        limited.setLimits(10 * USD, type(uint256).max);
        vm.expectRevert(
            abi.encodeWithSelector(ERC4626Source.DepositLimit.selector, 11 * USD, 10 * USD)
        );
        guarded.deposit(11 * USD, address(this));

        uint256 shares = guarded.deposit(10 * USD, address(this));
        limited.setLimits(10 * USD, 1);
        vm.expectRevert(abi.encodeWithSelector(ERC4626Source.RedeemLimit.selector, shares, 1));
        guarded.redeem(shares, address(this), address(this));
    }

    /// A source that loses value pays nothing until it recovers, and the vault never tops the
    /// principal up from anywhere (decision 002).
    function test_aLossMeansNoYieldAndNoTopUp() public {
        uint256 id = _openOn(adapted);
        vm.prank(address(plain));
        token.transfer(stranger, 10_000 * USD); // the strategy loses 10%
        skip(PAYOUT_INTERVAL);

        assertEq(adapted.pendingYield(id), 0);
        assertEq(adapted.harvest(id), 0);
        assertEq(adapted.position(id).principal, PRINCIPAL);
        assertEq(adapted.position(id).buffer, 0);
    }

    function testFuzz_adapter_roundTripsWithoutGainingValue(uint256 assets, uint256 earned)
        public
    {
        assets = bound(assets, 1, 1_000_000 * USD);
        earned = bound(earned, 0, assets);
        token.mint(address(this), assets);
        token.approve(address(adapter), assets);
        uint256 shares = adapter.deposit(assets, address(this));
        _earn(plain, earned);

        uint256 out = adapter.redeem(shares, address(this), address(this));
        assertLe(out, assets + earned);
        assertGe(out + 2, assets + earned);
    }
}
