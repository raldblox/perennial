// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IYieldSource
/// @notice Where a vault keeps principal so that it earns. The functions are a subset of
///         ERC-4626 with the same signatures and rounding rules, so any ERC-4626 vault can
///         be used as a source without an adapter.
interface IYieldSource {
    /// @notice The token deposited and paid back.
    function asset() external view returns (address);

    /// @notice Deposit `assets` and mint shares to `receiver`. Rounds shares down.
    function deposit(uint256 assets, address receiver) external returns (uint256 shares);

    /// @notice Burn `shares` of `owner` and send the assets to `receiver`. Rounds assets down.
    function redeem(uint256 shares, address receiver, address owner)
        external
        returns (uint256 assets);

    /// @notice Shares that must be burned to withdraw exactly `assets`. Rounds up.
    function previewWithdraw(uint256 assets) external view returns (uint256 shares);

    /// @notice Current value of `shares` in assets. Rounds down.
    function convertToAssets(uint256 shares) external view returns (uint256 assets);
}
