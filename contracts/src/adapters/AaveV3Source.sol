// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @notice The two Aave V3 Pool functions the adapter uses.
interface IAavePool {
    function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)
        external;

    function withdraw(address asset, uint256 amount, address to) external returns (uint256);
}

/// @notice What the adapter checks on an aToken.
interface IAToken {
    function UNDERLYING_ASSET_ADDRESS() external view returns (address);

    function POOL() external view returns (address);
}

/// @title AaveV3Source
/// @notice Puts a vault's principal into an Aave V3 market. Supplied assets earn the market's
///         supply rate, paid as a growing aToken balance.
/// @dev An ERC-4626 vault over one aToken, so it satisfies IYieldSource unchanged: shares are
///      this contract's own, and their value is its aToken balance, which Aave raises as
///      interest accrues. Deposits are supplied to the Pool at once and withdrawals are taken
///      from it, so the adapter holds nothing but aTokens. Shares carry six extra decimals
///      (`_decimalsOffset`), which makes the share-inflation attack on an empty vault cost
///      far more than it could gain. Nothing in this repository deploys it on QoreChain,
///      which has no lending market an EVM contract can reach (decision 006).
contract AaveV3Source is ERC4626 {
    using SafeERC20 for IERC20;

    IAavePool public immutable POOL;
    IERC20 public immutable A_TOKEN;

    error WrongAToken(address aToken);

    constructor(IERC20 asset_, IAavePool pool, IERC20 aToken)
        ERC20("Perennial Aave supply", "pAAVE")
        ERC4626(asset_)
    {
        if (
            IAToken(address(aToken)).UNDERLYING_ASSET_ADDRESS() != address(asset_)
                || IAToken(address(aToken)).POOL() != address(pool)
        ) revert WrongAToken(address(aToken));
        POOL = pool;
        A_TOKEN = aToken;
        asset_.forceApprove(address(pool), type(uint256).max);
    }

    /// @notice Everything the adapter holds: its aToken balance, interest included.
    function totalAssets() public view override returns (uint256) {
        return A_TOKEN.balanceOf(address(this));
    }

    function _deposit(address caller, address receiver, uint256 assets, uint256 shares)
        internal
        override
    {
        super._deposit(caller, receiver, assets, shares);
        POOL.supply(asset(), assets, address(this), 0);
    }

    function _withdraw(
        address caller,
        address receiver,
        address owner,
        uint256 assets,
        uint256 shares
    ) internal override {
        if (caller != owner) _spendAllowance(owner, caller, shares);
        _burn(owner, shares);
        // Aave refuses to withdraw zero. Dust shares worth nothing are burned without a call,
        // so a harvest that finds no whole unit of yield does not revert.
        if (assets != 0) POOL.withdraw(asset(), assets, receiver);
        emit Withdraw(caller, receiver, owner, assets, shares);
    }

    function _decimalsOffset() internal pure override returns (uint8) {
        return 6;
    }
}
