// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IYieldSource} from "../interfaces/IYieldSource.sol";

/// @title ERC4626Source
/// @notice Puts a vault's principal into any ERC-4626 vault, with guards a bare ERC-4626 does
///         not promise.
/// @dev A conforming ERC-4626 vault already satisfies IYieldSource and can be used directly.
///      This adapter is for when that is not enough:
///      - it keeps its own ledger of underlying shares per depositor, so one ERC-4626 can serve
///        several Perennial vaults and each can only redeem what it deposited;
///      - it refuses a deposit that would mint no shares, which would otherwise turn principal
///        into a donation (the classic rounding loss on a small or manipulated vault);
///      - it checks the vault's `maxDeposit` and `maxRedeem` first and fails with a clear
///        error instead of whatever the vault reverts with;
///      - it fixes the asset at deployment and refuses a vault for a different one.
///      It adds no yield and holds nothing between calls except the vault's shares.
contract ERC4626Source is IYieldSource {
    using SafeERC20 for IERC20;

    IERC4626 public immutable VAULT;
    IERC20 private immutable _asset;

    /// @notice Underlying vault shares held for each depositor.
    mapping(address => uint256) public balanceOf;
    uint256 public totalSupply;

    error AssetMismatch(address expected, address actual);
    error ZeroShares(uint256 assets);
    error DepositLimit(uint256 assets, uint256 max);
    error RedeemLimit(uint256 shares, uint256 max);
    error NotShareOwner();
    error InsufficientShares(uint256 shares, uint256 balance);

    event Deposit(address indexed sender, address indexed owner, uint256 assets, uint256 shares);
    event Withdraw(
        address indexed sender,
        address indexed receiver,
        address indexed owner,
        uint256 assets,
        uint256 shares
    );

    constructor(IERC4626 vault, IERC20 asset_) {
        address actual = vault.asset();
        if (actual != address(asset_)) revert AssetMismatch(address(asset_), actual);
        VAULT = vault;
        _asset = asset_;
        asset_.forceApprove(address(vault), type(uint256).max);
    }

    function asset() external view returns (address) {
        return address(_asset);
    }

    function deposit(uint256 assets, address receiver) external returns (uint256 shares) {
        uint256 max = VAULT.maxDeposit(address(this));
        if (assets > max) revert DepositLimit(assets, max);
        if (VAULT.previewDeposit(assets) == 0) revert ZeroShares(assets);

        _asset.safeTransferFrom(msg.sender, address(this), assets);
        shares = VAULT.deposit(assets, address(this));
        if (shares == 0) revert ZeroShares(assets);

        balanceOf[receiver] += shares;
        totalSupply += shares;
        emit Deposit(msg.sender, receiver, assets, shares);
    }

    function redeem(uint256 shares, address receiver, address owner)
        external
        returns (uint256 assets)
    {
        if (owner != msg.sender) revert NotShareOwner();
        uint256 balance = balanceOf[owner];
        if (shares > balance) revert InsufficientShares(shares, balance);
        uint256 max = VAULT.maxRedeem(address(this));
        if (shares > max) revert RedeemLimit(shares, max);

        balanceOf[owner] = balance - shares;
        totalSupply -= shares;
        assets = VAULT.redeem(shares, receiver, address(this));
        emit Withdraw(msg.sender, receiver, owner, assets, shares);
    }

    function previewWithdraw(uint256 assets) external view returns (uint256) {
        return VAULT.previewWithdraw(assets);
    }

    function convertToAssets(uint256 shares) external view returns (uint256) {
        return VAULT.convertToAssets(shares);
    }
}
