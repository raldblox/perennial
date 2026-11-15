// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PerennialVault} from "../src/PerennialVault.sol";
import {MockYieldSource} from "../src/mocks/MockYieldSource.sol";
import {PQCAuth} from "../src/libraries/PQCAuth.sol";
import {VaultFixture} from "./VaultFixture.sol";

/// @dev Keeps 1% of every transfer.
contract FeeOnTransferToken is ERC20 {
    constructor() ERC20("Fee Token", "FEE") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from == address(0) || to == address(0)) return super._update(from, to, value);
        uint256 fee = value / 100;
        super._update(from, address(0xdead), fee);
        super._update(from, to, value - fee);
    }
}

contract OpenTest is VaultFixture {
    function test_constructor_revertsOnAssetMismatch() public {
        IERC20 other = IERC20(address(new FeeOnTransferToken()));
        vm.expectRevert(PerennialVault.AssetMismatch.selector);
        new PerennialVault(other, source, address(pqc), address(pqc));
    }

    function test_constructor_revertsOnZeroPrecompile() public {
        vm.expectRevert(PerennialVault.ZeroAddress.selector);
        new PerennialVault(token, source, address(0), address(pqc));
    }

    function test_open_recordsThePosition() public {
        uint256 id = _open();

        assertEq(id, 1);
        assertEq(vault.positionCount(), 1);

        PerennialVault.Position memory pos = vault.position(id);
        assertEq(pos.owner, owner);
        assertEq(pos.beneficiary, beneficiary);
        assertEq(pos.principal, PRINCIPAL);
        assertEq(pos.buffer, 0);
        assertEq(pos.payoutAmount, PAYOUT);
        assertEq(pos.payoutInterval, PAYOUT_INTERVAL);
        assertEq(pos.checkInPeriod, CHECK_IN_PERIOD);
        assertEq(pos.gracePeriod, GRACE_PERIOD);
        assertEq(pos.lastCheckIn, block.timestamp);
        assertEq(pos.lastPayout, block.timestamp);
        assertFalse(pos.ownerCanClose);
        assertFalse(pos.succeeded);
        assertFalse(pos.closed);
    }

    function test_open_movesThePrincipalIntoTheYieldSource() public {
        uint256 id = _open();

        assertEq(token.balanceOf(address(vault)), 0);
        assertEq(token.balanceOf(owner), 1_000_000 * USD - PRINCIPAL);
        assertEq(source.balanceOf(address(vault)), vault.position(id).shares);
        assertEq(source.convertToAssets(vault.position(id).shares), PRINCIPAL);
    }

    function test_open_storesTheHeirs() public {
        uint256 id = _open();

        PerennialVault.Heir[] memory list = vault.heirs(id);
        assertEq(list.length, 2);
        assertEq(list[0].account, heirA);
        assertEq(list[0].bps, 6_000);
        assertEq(list[1].account, heirB);
        assertEq(list[1].bps, 4_000);
    }

    function test_open_allowsNoHeirs() public {
        PerennialVault.OpenParams memory p = _params();
        p.heirs = new PerennialVault.Heir[](0);

        uint256 id = _open(p);

        assertEq(vault.heirs(id).length, 0);
    }

    function test_open_revertsOnZeroAmount() public {
        PerennialVault.OpenParams memory p = _params();
        p.amount = 0;
        vm.expectRevert(PerennialVault.ZeroAmount.selector);
        _open(p);
    }

    function test_open_revertsOnZeroBeneficiary() public {
        PerennialVault.OpenParams memory p = _params();
        p.beneficiary = address(0);
        vm.expectRevert(PerennialVault.ZeroAddress.selector);
        _open(p);
    }

    function test_open_revertsOnZeroPayoutInterval() public {
        PerennialVault.OpenParams memory p = _params();
        p.payoutInterval = 0;
        vm.expectRevert(PerennialVault.ZeroPeriod.selector);
        _open(p);
    }

    function test_open_revertsOnZeroCheckInPeriod() public {
        PerennialVault.OpenParams memory p = _params();
        p.checkInPeriod = 0;
        vm.expectRevert(PerennialVault.ZeroPeriod.selector);
        _open(p);
    }

    function test_open_revertsWhenBeneficiaryHasNoKey() public {
        PerennialVault.OpenParams memory p = _params();
        p.beneficiary = stranger;
        vm.expectRevert(abi.encodeWithSelector(PQCAuth.PQCKeyNotRegistered.selector, stranger));
        _open(p);
    }

    function test_open_revertsWhenBeneficiaryKeyIsNotProven() public {
        pqc.register(stranger, keccak256("stranger secret"), false);
        PerennialVault.OpenParams memory p = _params();
        p.beneficiary = stranger;
        vm.expectRevert(abi.encodeWithSelector(PQCAuth.PQCKeyNotProven.selector, stranger));
        _open(p);
    }

    function test_open_revertsWhenClosingOwnerHasNoKey() public {
        token.mint(stranger, PRINCIPAL);
        PerennialVault.OpenParams memory p = _params();
        p.ownerCanClose = true;

        vm.startPrank(stranger);
        token.approve(address(vault), type(uint256).max);
        vm.expectRevert(abi.encodeWithSelector(PQCAuth.PQCKeyNotRegistered.selector, stranger));
        vault.open(p);
        vm.stopPrank();
    }

    function test_open_revertsWhenWeightsDoNotTotalBps() public {
        PerennialVault.OpenParams memory p = _params();
        p.heirs[1].bps = 3_999;
        vm.expectRevert(PerennialVault.HeirWeightsMustTotalBps.selector);
        _open(p);
    }

    function test_open_revertsOnDuplicateHeir() public {
        PerennialVault.OpenParams memory p = _params();
        p.heirs[1].account = heirA;
        vm.expectRevert(abi.encodeWithSelector(PerennialVault.DuplicateHeir.selector, heirA));
        _open(p);
    }

    function test_open_revertsOnZeroWeightHeir() public {
        PerennialVault.OpenParams memory p = _params();
        p.heirs[0].bps = 0;
        vm.expectRevert(PerennialVault.InvalidHeir.selector);
        _open(p);
    }

    function test_open_revertsOnTooManyHeirs() public {
        PerennialVault.OpenParams memory p = _params();
        p.heirs = new PerennialVault.Heir[](17);
        for (uint256 i; i < 17; ++i) {
            p.heirs[i] = PerennialVault.Heir(address(uint160(1000 + i)), 1);
        }
        vm.expectRevert(PerennialVault.TooManyHeirs.selector);
        _open(p);
    }

    function test_open_revertsOnFeeOnTransferToken() public {
        FeeOnTransferToken fee = new FeeOnTransferToken();
        MockYieldSource feeSource = new MockYieldSource(fee, RATE);
        PerennialVault feeVault = new PerennialVault(fee, feeSource, address(pqc), address(pqc));
        fee.mint(owner, PRINCIPAL);

        vm.startPrank(owner);
        fee.approve(address(feeVault), type(uint256).max);
        vm.expectRevert(PerennialVault.UnsupportedToken.selector);
        feeVault.open(_params());
        vm.stopPrank();
    }

    function test_topUp_addsPrincipalFromAnyone() public {
        uint256 id = _open();
        token.mint(stranger, 5_000 * USD);

        vm.startPrank(stranger);
        token.approve(address(vault), type(uint256).max);
        vault.topUp(id, 5_000 * USD);
        vm.stopPrank();

        PerennialVault.Position memory pos = vault.position(id);
        assertEq(pos.principal, PRINCIPAL + 5_000 * USD);
        assertEq(source.convertToAssets(pos.shares), PRINCIPAL + 5_000 * USD);
        assertEq(token.balanceOf(stranger), 0);
    }

    function test_topUp_revertsOnZeroAmount() public {
        uint256 id = _open();
        vm.prank(owner);
        vm.expectRevert(PerennialVault.ZeroAmount.selector);
        vault.topUp(id, 0);
    }

    function test_topUp_revertsOnUnknownPosition() public {
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(PerennialVault.UnknownPosition.selector, 7));
        vault.topUp(7, 1);
    }

    function test_position_revertsOnUnknownPosition() public {
        vm.expectRevert(abi.encodeWithSelector(PerennialVault.UnknownPosition.selector, 1));
        vault.position(1);
    }
}
