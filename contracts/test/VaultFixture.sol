// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PerennialVault} from "../src/PerennialVault.sol";
import {MockYieldSource} from "../src/mocks/MockYieldSource.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockPQC} from "./mocks/MockPQC.sol";

/// @dev Shared setup: a 6-decimal dollar, a 5% yield source with a deep reserve, the PQC
///      mock, and an owner and a beneficiary who both hold proven keys.
abstract contract VaultFixture is Test {
    uint256 internal constant USD = 1e6;
    uint256 internal constant RATE = 0.05e18;

    uint256 internal constant PRINCIPAL = 100_000 * USD;
    uint256 internal constant PAYOUT = 400 * USD;
    uint64 internal constant PAYOUT_INTERVAL = 30 days;
    uint64 internal constant CHECK_IN_PERIOD = 90 days;
    uint64 internal constant GRACE_PERIOD = 30 days;

    bytes32 internal constant OWNER_SECRET = keccak256("owner secret");
    bytes32 internal constant BENEFICIARY_SECRET = keccak256("beneficiary secret");

    MockERC20 internal token;
    MockYieldSource internal source;
    MockPQC internal pqc;
    PerennialVault internal vault;

    address internal owner = makeAddr("owner");
    address internal beneficiary = makeAddr("beneficiary");
    address internal heirA = makeAddr("heirA");
    address internal heirB = makeAddr("heirB");
    address internal stranger = makeAddr("stranger");

    function setUp() public virtual {
        token = new MockERC20();
        source = new MockYieldSource(token, RATE);
        pqc = new MockPQC();
        vault = new PerennialVault(token, source, address(pqc), address(pqc));

        token.mint(address(this), 10_000_000 * USD);
        token.approve(address(source), type(uint256).max);
        source.fund(10_000_000 * USD);

        token.mint(owner, 1_000_000 * USD);
        vm.prank(owner);
        token.approve(address(vault), type(uint256).max);

        pqc.register(owner, OWNER_SECRET, true);
        pqc.register(beneficiary, BENEFICIARY_SECRET, true);
    }

    function _heirs() internal view returns (PerennialVault.Heir[] memory list) {
        list = new PerennialVault.Heir[](2);
        list[0] = PerennialVault.Heir(heirA, 6_000);
        list[1] = PerennialVault.Heir(heirB, 4_000);
    }

    function _params() internal view returns (PerennialVault.OpenParams memory) {
        return PerennialVault.OpenParams({
            amount: PRINCIPAL,
            beneficiary: beneficiary,
            payoutAmount: PAYOUT,
            payoutInterval: PAYOUT_INTERVAL,
            checkInPeriod: CHECK_IN_PERIOD,
            gracePeriod: GRACE_PERIOD,
            ownerCanClose: false,
            heirs: _heirs()
        });
    }

    function _open(PerennialVault.OpenParams memory p) internal returns (uint256 positionId) {
        vm.prank(owner);
        positionId = vault.open(p);
    }

    function _open() internal returns (uint256 positionId) {
        return _open(_params());
    }
}
