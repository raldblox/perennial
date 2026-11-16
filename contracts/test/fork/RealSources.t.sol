// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {PerennialVault} from "../../src/PerennialVault.sol";
import {AaveV3Source, IAavePool} from "../../src/adapters/AaveV3Source.sol";
import {ERC4626Source} from "../../src/adapters/ERC4626Source.sol";
import {IYieldSource} from "../../src/interfaces/IYieldSource.sol";
import {MockPQC, MockPQCVerifier} from "../mocks/MockPQC.sol";

/// @dev Optional, read-only fork tests against real Ethereum mainnet sources. They run only
///      when FORK_RPC_URL is set (any Ethereum mainnet JSON-RPC) and are skipped otherwise,
///      as in CI. Mainnet has no QoreChain PQC precompiles, so the usual stand-ins are
///      installed at their addresses; what is real here is the yield source.
contract RealSourcesForkTest is Test {
    // Ethereum mainnet.
    address internal constant AAVE_POOL = 0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2;
    address internal constant USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
    address internal constant A_USDC = 0x98C23E9d8f34FEFb1B7BD6a91B7FF122F4e16F5c;
    address internal constant DAI = 0x6B175474E89094C44Da98b954EedeAC495271d0F;
    address internal constant SDAI = 0x83F20F44975D03b1b09e64809B757c47f942BEeA;

    address internal constant PQC_VERIFY = 0x0000000000000000000000000000000000000a01;
    address internal constant PQC_KEY_STATUS = 0x0000000000000000000000000000000000000a02;
    bytes32 internal constant OWNER_SECRET = keccak256("owner secret");
    bytes32 internal constant BENEFICIARY_SECRET = keccak256("beneficiary secret");

    address internal owner = makeAddr("owner");
    address internal beneficiary = makeAddr("beneficiary");
    MockPQC internal pqc;

    function setUp() public {
        string memory rpc = vm.envOr("FORK_RPC_URL", string(""));
        if (bytes(rpc).length == 0) {
            vm.skip(true);
            return;
        }
        vm.createSelectFork(rpc);
        vm.etch(PQC_KEY_STATUS, type(MockPQC).runtimeCode);
        vm.etch(PQC_VERIFY, type(MockPQCVerifier).runtimeCode);
        pqc = MockPQC(PQC_KEY_STATUS);
        pqc.register(owner, OWNER_SECRET, true);
        pqc.register(beneficiary, BENEFICIARY_SECRET, true);
    }

    function _params(uint256 amount) internal view returns (PerennialVault.OpenParams memory) {
        return PerennialVault.OpenParams({
            amount: amount,
            beneficiary: beneficiary,
            payoutAmount: 0,
            payoutInterval: 30 days,
            checkInPeriod: 90 days,
            gracePeriod: 30 days,
            ownerCanClose: true,
            heirs: new PerennialVault.Heir[](0),
            bufferCap: type(uint256).max,
            budgetMode: false
        });
    }

    /// Opens, lets a month pass on the real market, harvests and closes.
    function _roundTrip(PerennialVault vault, address asset, uint256 amount)
        internal
        returns (uint256 yield, uint256 returned)
    {
        deal(asset, owner, amount);
        vm.startPrank(owner);
        IERC20(asset).approve(address(vault), amount);
        uint256 id = vault.open(_params(amount));
        vm.stopPrank();

        skip(30 days);
        vm.roll(block.number + 216_000);
        yield = vault.harvest(id);

        uint256 before = IERC20(asset).balanceOf(owner);
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = vault.position(id).nonce;
        bytes memory signature = pqc.sign(
            OWNER_SECRET, vault.actionMessage(id, PerennialVault.Action.Close, nonce, deadline, 0)
        );
        vault.closeByOwner(id, deadline, signature);
        returned = IERC20(asset).balanceOf(owner) - before;
    }

    function test_fork_aaveUsdcMarket() public {
        AaveV3Source source = new AaveV3Source(IERC20(USDC), IAavePool(AAVE_POOL), IERC20(A_USDC));
        PerennialVault vault = new PerennialVault(IERC20(USDC), IYieldSource(address(source)));
        (uint256 yield, uint256 returned) = _roundTrip(vault, USDC, 10_000e6);
        emit log_named_uint("Aave USDC: yield harvested in 30 days (units)", yield);
        assertGt(yield, 0);
        assertGe(returned + 2, 10_000e6);
    }

    function test_fork_sDaiThroughTheAdapter() public {
        ERC4626Source source = new ERC4626Source(IERC4626(SDAI), IERC20(DAI));
        PerennialVault vault = new PerennialVault(IERC20(DAI), IYieldSource(address(source)));
        (uint256 yield, uint256 returned) = _roundTrip(vault, DAI, 10_000e18);
        emit log_named_uint("sDAI: yield harvested in 30 days (wei)", yield);
        assertGt(yield, 0);
        assertGe(returned + 2, 10_000e18);
    }
}
