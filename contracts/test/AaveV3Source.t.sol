// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PerennialVault} from "../src/PerennialVault.sol";
import {AaveV3Source, IAavePool} from "../src/adapters/AaveV3Source.sol";
import {IYieldSource} from "../src/interfaces/IYieldSource.sol";
import {MockAavePool} from "./mocks/MockAave.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {VaultFixture} from "./VaultFixture.sol";

contract AaveV3SourceTest is VaultFixture {
    uint256 internal constant RAY = 1e27;

    MockAavePool internal pool;
    AaveV3Source internal aave;
    PerennialVault internal aaveVault;

    function setUp() public override {
        super.setUp();
        pool = new MockAavePool(token);
        aave = new AaveV3Source(token, IAavePool(address(pool)), IERC20(address(pool.A_TOKEN())));
        aaveVault = new PerennialVault(token, IYieldSource(address(aave)));
        vm.prank(owner);
        token.approve(address(aaveVault), type(uint256).max);
    }

    /// Interest, as Aave accrues it: the index rises and the aToken holds the extra underlying.
    function _accrue(uint256 bps) internal {
        uint256 supplied = pool.A_TOKEN().balanceOf(address(aave));
        pool.setLiquidityIndex((pool.liquidityIndex() * (10_000 + bps)) / 10_000);
        uint256 grown = pool.A_TOKEN().balanceOf(address(aave));
        token.mint(address(pool.A_TOKEN()), grown - supplied + 1);
    }

    function test_constructor_checksTheATokensMarket() public {
        MockERC20 other = new MockERC20();
        MockAavePool otherPool = new MockAavePool(other);
        address wrong = address(otherPool.A_TOKEN());
        vm.expectRevert(abi.encodeWithSelector(AaveV3Source.WrongAToken.selector, wrong));
        new AaveV3Source(token, IAavePool(address(pool)), IERC20(wrong));
    }

    function test_deposit_suppliesToThePoolAndHoldsOnlyATokens() public {
        _open(); // the default fixture vault is untouched; use the Aave one below
        vm.prank(owner);
        uint256 id = aaveVault.open(_params());
        assertEq(token.balanceOf(address(aave)), 0);
        assertApproxEqAbs(pool.A_TOKEN().balanceOf(address(aave)), PRINCIPAL, 1);
        assertEq(aave.balanceOf(address(aaveVault)), aaveVault.position(id).shares);
    }

    function test_vault_harvestsAaveInterestAndKeepsThePrincipal() public {
        PerennialVault.OpenParams memory p = _params();
        p.ownerCanClose = true;
        vm.prank(owner);
        uint256 id = aaveVault.open(p);

        _accrue(500); // 5% of interest
        skip(PAYOUT_INTERVAL);
        uint256 harvested = aaveVault.harvest(id);
        assertApproxEqAbs(harvested, 5_000 * USD, 3);
        assertEq(aaveVault.position(id).principal, PRINCIPAL);
        assertGe(aave.convertToAssets(aaveVault.position(id).shares) + 2, PRINCIPAL);

        uint256 before = token.balanceOf(owner);
        uint256 deadline = _deadline();
        uint256 nonce = aaveVault.position(id).nonce;
        aaveVault.closeByOwner(
            id,
            deadline,
            pqc.sign(
                OWNER_SECRET,
                aaveVault.actionMessage(id, PerennialVault.Action.Close, nonce, deadline, 0)
            )
        );
        assertApproxEqAbs(token.balanceOf(owner) - before, PRINCIPAL, 3);
    }

    function test_vault_budgetModeDrawsOnAaveSuppliedPrincipal() public {
        PerennialVault.OpenParams memory p = _params();
        p.amount = 1_000 * USD;
        p.payoutAmount = 100 * USD;
        p.budgetMode = true;
        vm.prank(owner);
        uint256 id = aaveVault.open(p);
        address merchant = makeAddr("merchant");
        uint256 deadline = _deadline();
        uint256 nonce = aaveVault.position(id).nonce;
        bytes memory signature = pqc.sign(
            BENEFICIARY_SECRET,
            aaveVault.actionMessage(
                id,
                PerennialVault.Action.Spend,
                nonce,
                deadline,
                keccak256(abi.encode(merchant, uint256(100 * USD), bytes32("r")))
            )
        );
        aaveVault.spend(id, merchant, 100 * USD, "r", deadline, signature);
        assertEq(token.balanceOf(merchant), 100 * USD);
        assertEq(aaveVault.position(id).principal, 900 * USD);
    }

    /// The inflation attack on an empty vault: a donation of aTokens before the first deposit
    /// barely moves the share price, so the victim's deposit still mints shares and keeps its
    /// value.
    function test_inflationAttack_doesNotPay() public {
        token.mint(stranger, 1_000_001 * USD);
        vm.startPrank(stranger);
        token.approve(address(aave), 1);
        aave.deposit(1, stranger);
        token.approve(address(pool), type(uint256).max);
        pool.supply(address(token), 1_000_000 * USD, address(aave), 0); // donate aTokens
        vm.stopPrank();

        token.mint(address(this), 100 * USD);
        token.approve(address(aave), 100 * USD);
        uint256 shares = aave.deposit(100 * USD, address(this));
        assertGt(shares, 0);
        assertApproxEqRel(aave.convertToAssets(shares), 100 * USD, 0.01e18);
    }

    /// A harvest that finds no whole unit of interest redeems dust worth zero; Aave refuses a
    /// zero withdrawal, so the adapter must not ask for one.
    function test_redeemingDustWorthNothingDoesNotRevert() public {
        token.mint(address(this), 10 * USD);
        token.approve(address(aave), 10 * USD);
        aave.deposit(10 * USD, address(this));
        assertEq(aave.redeem(1, address(this), address(this)), 0);
    }

    function testFuzz_roundTrip_neverPaysMoreThanSuppliedPlusInterest(uint96 assets, uint16 bps)
        public
    {
        assets = uint96(bound(assets, 1, 1_000_000 * USD));
        bps = uint16(bound(bps, 0, 2_000));
        token.mint(address(this), assets);
        token.approve(address(aave), assets);
        uint256 shares = aave.deposit(assets, address(this));
        if (bps > 0) _accrue(bps);

        uint256 out = aave.redeem(shares, address(this), address(this));
        uint256 expected = (uint256(assets) * (10_000 + bps)) / 10_000;
        assertLe(out, expected + 2);
        assertGe(out + 3, uint256(assets));
    }
}
