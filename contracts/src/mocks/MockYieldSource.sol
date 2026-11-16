// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IYieldSource} from "../interfaces/IYieldSource.sol";

/// @title MockYieldSource
/// @notice A yield source with a fixed, predictable rate, for tests and demonstrations.
/// @dev The share price grows at `RATE_PER_YEAR` and compounds whenever the source is touched.
///      The yield is not earned anywhere: it is paid from tokens that someone sent to this
///      contract in advance (`fund`). If that reserve runs out, redemptions revert until it
///      is refilled. Whoever deployed it can take back reserve that no depositor is owed.
///      Do not use this to hold anything of value.
contract MockYieldSource is IYieldSource {
    using SafeERC20 for IERC20;

    uint256 private constant WAD = 1e18;
    uint256 private constant YEAR = 365 days;

    IERC20 private immutable _asset;
    /// @notice Yearly rate as an 18-decimal fraction: 0.05e18 is 5%.
    uint256 public immutable RATE_PER_YEAR;
    /// @notice May take back reserve beyond what depositors are owed (`reclaim`).
    address public immutable FUNDER;

    uint256 private _index = WAD;
    uint256 private _lastAccrual;

    mapping(address => uint256) public balanceOf;
    uint256 public totalSupply;

    event Deposit(address indexed sender, address indexed owner, uint256 assets, uint256 shares);
    event Withdraw(
        address indexed sender,
        address indexed receiver,
        address indexed owner,
        uint256 assets,
        uint256 shares
    );
    event Funded(address indexed from, uint256 assets);
    event Reclaimed(address indexed to, uint256 assets);

    error NotShareOwner();
    error ReserveExhausted(uint256 needed, uint256 available);
    error NotFunder();

    constructor(IERC20 asset_, uint256 ratePerYear_) {
        _asset = asset_;
        RATE_PER_YEAR = ratePerYear_;
        FUNDER = msg.sender;
        _lastAccrual = block.timestamp;
    }

    function asset() external view returns (address) {
        return address(_asset);
    }

    /// @notice Assets per share, scaled by 1e18.
    function index() public view returns (uint256) {
        uint256 elapsed = block.timestamp - _lastAccrual;
        return _index + Math.mulDiv(_index, RATE_PER_YEAR * elapsed, WAD * YEAR);
    }

    function convertToAssets(uint256 shares) public view returns (uint256) {
        return Math.mulDiv(shares, index(), WAD);
    }

    function convertToShares(uint256 assets) public view returns (uint256) {
        return Math.mulDiv(assets, WAD, index());
    }

    function previewWithdraw(uint256 assets) external view returns (uint256) {
        return Math.mulDiv(assets, WAD, index(), Math.Rounding.Ceil);
    }

    /// @notice Add tokens to the reserve that pays the yield.
    function fund(uint256 assets) external {
        _asset.safeTransferFrom(msg.sender, address(this), assets);
        emit Funded(msg.sender, assets);
    }

    /// @notice Reserve beyond what all shares are worth now, rounded so it never undershoots.
    function surplus() public view returns (uint256) {
        uint256 owed = Math.mulDiv(totalSupply, index(), WAD, Math.Rounding.Ceil);
        uint256 held = _asset.balanceOf(address(this));
        return held > owed ? held - owed : 0;
    }

    /// @notice Take back up to `assets` of the reserve no depositor is owed. Only the deployer.
    /// @dev Yield keeps accruing, so what is owed grows; reclaiming everything leaves later
    ///      redemptions short until the reserve is refilled.
    function reclaim(uint256 assets, address to) external {
        if (msg.sender != FUNDER) revert NotFunder();
        _accrue();
        uint256 available = surplus();
        if (assets > available) revert ReserveExhausted(assets, available);
        _asset.safeTransfer(to, assets);
        emit Reclaimed(to, assets);
    }

    function deposit(uint256 assets, address receiver) external returns (uint256 shares) {
        _accrue();
        shares = Math.mulDiv(assets, WAD, _index);
        balanceOf[receiver] += shares;
        totalSupply += shares;
        _asset.safeTransferFrom(msg.sender, address(this), assets);
        emit Deposit(msg.sender, receiver, assets, shares);
    }

    function redeem(uint256 shares, address receiver, address owner)
        external
        returns (uint256 assets)
    {
        if (owner != msg.sender) revert NotShareOwner();
        _accrue();
        assets = Math.mulDiv(shares, _index, WAD);
        uint256 available = _asset.balanceOf(address(this));
        if (assets > available) revert ReserveExhausted(assets, available);
        balanceOf[owner] -= shares;
        totalSupply -= shares;
        _asset.safeTransfer(receiver, assets);
        emit Withdraw(msg.sender, receiver, owner, assets, shares);
    }

    function _accrue() private {
        _index = index();
        _lastAccrual = block.timestamp;
    }
}
