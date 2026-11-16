// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockYieldSource} from "../src/mocks/MockYieldSource.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

contract MockYieldSourceTest is Test {
    uint256 internal constant RATE = 0.05e18;
    uint256 internal constant USD = 1e6;

    MockERC20 internal token;
    MockYieldSource internal source;
    address internal alice = makeAddr("alice");

    function setUp() public {
        token = new MockERC20();
        source = new MockYieldSource(token, RATE);

        token.mint(address(this), 1_000_000 * USD);
        token.approve(address(source), type(uint256).max);
        source.fund(1_000_000 * USD);

        token.mint(alice, 10_000 * USD);
        vm.prank(alice);
        token.approve(address(source), type(uint256).max);
    }

    function test_asset() public view {
        assertEq(source.asset(), address(token));
    }

    function test_deposit_mintsSharesAtPar() public {
        vm.prank(alice);
        uint256 shares = source.deposit(10_000 * USD, alice);
        assertEq(shares, 10_000 * USD);
        assertEq(source.balanceOf(alice), shares);
        assertEq(source.convertToAssets(shares), 10_000 * USD);
    }

    function test_valueGrowsAtTheConfiguredRate() public {
        vm.prank(alice);
        uint256 shares = source.deposit(10_000 * USD, alice);

        skip(365 days);

        assertEq(source.convertToAssets(shares), 10_500 * USD);
    }

    function test_redeem_paysPrincipalAndYield() public {
        vm.startPrank(alice);
        uint256 shares = source.deposit(10_000 * USD, alice);
        skip(365 days);
        uint256 assets = source.redeem(shares, alice, alice);
        vm.stopPrank();

        assertEq(assets, 10_500 * USD);
        assertEq(token.balanceOf(alice), 10_500 * USD);
        assertEq(source.balanceOf(alice), 0);
    }

    function test_redeem_revertsForAnotherOwnersShares() public {
        vm.prank(alice);
        uint256 shares = source.deposit(10_000 * USD, alice);

        vm.expectRevert(MockYieldSource.NotShareOwner.selector);
        source.redeem(shares, address(this), alice);
    }

    function test_redeem_revertsWhenReserveIsExhausted() public {
        MockYieldSource unfunded = new MockYieldSource(token, RATE);
        vm.startPrank(alice);
        token.approve(address(unfunded), type(uint256).max);
        uint256 shares = unfunded.deposit(10_000 * USD, alice);
        skip(365 days);

        vm.expectRevert(
            abi.encodeWithSelector(
                MockYieldSource.ReserveExhausted.selector, 10_500 * USD, 10_000 * USD
            )
        );
        unfunded.redeem(shares, alice, alice);
        vm.stopPrank();
    }

    /// The shares that previewWithdraw asks for are always enough to cover the amount.
    function testFuzz_previewWithdraw_coversTheAmount(uint256 assets, uint256 elapsed) public {
        assets = bound(assets, 1, 1_000_000_000 * USD);
        elapsed = bound(elapsed, 0, 50 * 365 days);
        skip(elapsed);

        uint256 shares = source.previewWithdraw(assets);

        assertGe(source.convertToAssets(shares), assets);
    }

    function test_reclaim_returnsOnlyWhatNoDepositorIsOwed() public {
        vm.prank(alice);
        source.deposit(10_000 * USD, alice);
        skip(365 days);
        uint256 surplus = source.surplus();
        // 1,000,000 reserve, minus the 5% (500) the deposit has earned.
        assertApproxEqAbs(surplus, 999_500 * USD, 1);

        vm.expectRevert(
            abi.encodeWithSelector(MockYieldSource.ReserveExhausted.selector, surplus + 1, surplus)
        );
        source.reclaim(surplus + 1, address(this));

        source.reclaim(surplus, address(this));
        // Alice can still take everything she is owed.
        uint256 shares = source.balanceOf(alice);
        vm.prank(alice);
        source.redeem(shares, alice, alice);
        assertApproxEqAbs(token.balanceOf(alice), 10_500 * USD, 1);
    }

    function test_reclaim_isOnlyForTheDeployer() public {
        vm.prank(alice);
        vm.expectRevert(MockYieldSource.NotFunder.selector);
        source.reclaim(1, alice);
    }

    function test_zeroRate_paysNothing() public {
        MockYieldSource flat = new MockYieldSource(token, 0);
        token.mint(address(this), 1_000 * USD);
        token.approve(address(flat), type(uint256).max);
        uint256 shares = flat.deposit(1_000 * USD, address(this));
        skip(10 * 365 days);
        assertEq(flat.convertToAssets(shares), 1_000 * USD);
    }
}
