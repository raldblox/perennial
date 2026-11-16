// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @dev Aave's WadRayMath: 27-decimal fixed point, half-up rounding.
library RayMath {
    uint256 internal constant RAY = 1e27;
    uint256 internal constant HALF_RAY = RAY / 2;

    function rayMul(uint256 a, uint256 b) internal pure returns (uint256) {
        return (a * b + HALF_RAY) / RAY;
    }

    function rayDiv(uint256 a, uint256 b) internal pure returns (uint256) {
        return (a * RAY + b / 2) / b;
    }
}

/// @dev An aToken as Aave V3 keeps it: balances are stored scaled by the reserve's liquidity
///      index at supply time, and `balanceOf` multiplies them by the current index, so a
///      balance grows as interest accrues. The underlying sits in this contract.
contract MockAToken {
    using RayMath for uint256;

    address public immutable UNDERLYING_ASSET_ADDRESS;
    address public immutable POOL;
    mapping(address => uint256) public scaledBalanceOf;
    uint256 public scaledTotalSupply;

    constructor(address underlying, address pool) {
        UNDERLYING_ASSET_ADDRESS = underlying;
        POOL = pool;
    }

    function balanceOf(address account) external view returns (uint256) {
        return scaledBalanceOf[account].rayMul(MockAavePool(POOL).liquidityIndex());
    }

    function mint(address to, uint256 scaled) external {
        require(msg.sender == POOL, "only pool");
        scaledBalanceOf[to] += scaled;
        scaledTotalSupply += scaled;
    }

    function burn(address from, uint256 scaled, address to, uint256 amount) external {
        require(msg.sender == POOL, "only pool");
        scaledBalanceOf[from] -= scaled;
        scaledTotalSupply -= scaled;
        SafeERC20.safeTransfer(IERC20(UNDERLYING_ASSET_ADDRESS), to, amount);
    }
}

/// @dev The supply and withdraw paths of an Aave V3 Pool for one reserve, with the same
///      scaling, rounding and `type(uint256).max` meaning "everything". Interest is
///      simulated by raising the liquidity index; the test must send the underlying that
///      backs it to the aToken.
contract MockAavePool {
    using RayMath for uint256;
    using SafeERC20 for IERC20;

    IERC20 public immutable UNDERLYING;
    MockAToken public immutable A_TOKEN;
    uint256 public liquidityIndex = RayMath.RAY;

    error InvalidAmount();

    constructor(IERC20 underlying) {
        UNDERLYING = underlying;
        A_TOKEN = new MockAToken(address(underlying), address(this));
    }

    function setLiquidityIndex(uint256 index) external {
        require(index >= liquidityIndex, "index only grows");
        liquidityIndex = index;
    }

    function supply(address asset, uint256 amount, address onBehalfOf, uint16) external {
        require(asset == address(UNDERLYING), "reserve");
        if (amount == 0) revert InvalidAmount();
        uint256 scaled = amount.rayDiv(liquidityIndex);
        if (scaled == 0) revert InvalidAmount();
        UNDERLYING.safeTransferFrom(msg.sender, address(A_TOKEN), amount);
        A_TOKEN.mint(onBehalfOf, scaled);
    }

    function withdraw(address asset, uint256 amount, address to) external returns (uint256) {
        require(asset == address(UNDERLYING), "reserve");
        uint256 balance = A_TOKEN.balanceOf(msg.sender);
        if (amount == type(uint256).max) amount = balance;
        if (amount == 0 || amount > balance) revert InvalidAmount();
        uint256 scaled = amount.rayDiv(liquidityIndex);
        uint256 held = A_TOKEN.scaledBalanceOf(msg.sender);
        if (scaled > held) scaled = held;
        A_TOKEN.burn(msg.sender, scaled, to, amount);
        return amount;
    }
}
