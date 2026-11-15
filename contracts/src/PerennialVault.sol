// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IYieldSource} from "./interfaces/IYieldSource.sol";
import {PQCAuth} from "./libraries/PQCAuth.sol";

/// @title PerennialVault
/// @notice A pension that pays out only what its principal earns.
/// @dev A position's principal is deposited into the yield source and tracked as shares.
///      Yield is harvested into the position's buffer, and payouts are made from the
///      buffer only. The vault has one asset and one yield source, both fixed at
///      deployment, and no privileged role: nothing can be paused, upgraded or swept.
contract PerennialVault is ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Heir weights are in basis points and must add up to this.
    uint256 public constant BPS = 10_000;
    uint256 public constant MAX_HEIRS = 16;

    struct Heir {
        address account;
        uint16 bps;
    }

    struct Position {
        /// @dev Whoever opened the position. May close it only if `ownerCanClose`.
        address owner;
        /// @dev Receives the payouts until succession.
        address beneficiary;
        /// @dev Fixed at opening. When false, the principal can never be withdrawn.
        bool ownerCanClose;
        /// @dev Set once by succession; payouts then go to the heirs.
        bool succeeded;
        bool closed;
        /// @dev Seconds between payouts.
        uint64 payoutInterval;
        /// @dev Seconds the beneficiary has between proofs of life.
        uint64 checkInPeriod;
        /// @dev Extra seconds after a missed check-in before succession can be triggered.
        uint64 gracePeriod;
        uint64 lastCheckIn;
        uint64 lastPayout;
        /// @dev Paid per interval. Zero means "everything in the buffer".
        uint256 payoutAmount;
        /// @dev Assets deposited. Never paid out.
        uint256 principal;
        /// @dev Yield-source shares held for this position.
        uint256 shares;
        /// @dev Harvested yield waiting to be paid out.
        uint256 buffer;
        /// @dev Incremented by every signed action, so a signature works once.
        uint256 nonce;
    }

    struct OpenParams {
        uint256 amount;
        address beneficiary;
        uint256 payoutAmount;
        uint64 payoutInterval;
        uint64 checkInPeriod;
        uint64 gracePeriod;
        bool ownerCanClose;
        Heir[] heirs;
    }

    IERC20 public immutable ASSET;
    IYieldSource public immutable SOURCE;
    /// @notice The chain's ML-DSA-87 signature verification precompile.
    address public immutable PQC_VERIFY;
    /// @notice The chain's post-quantum key registry precompile.
    address public immutable PQC_KEY_STATUS;

    /// @notice Number of positions opened. Position ids run from 1 to this value.
    uint256 public positionCount;

    mapping(uint256 => Position) private _positions;
    mapping(uint256 => Heir[]) private _heirs;

    event Opened(
        uint256 indexed positionId,
        address indexed owner,
        address indexed beneficiary,
        uint256 amount,
        uint256 payoutAmount,
        uint64 payoutInterval,
        uint64 checkInPeriod,
        uint64 gracePeriod,
        bool ownerCanClose
    );
    event ToppedUp(uint256 indexed positionId, address indexed from, uint256 amount);
    event HeirsSet(uint256 indexed positionId, Heir[] heirs);

    error ZeroAddress();
    error ZeroAmount();
    error ZeroPeriod();
    error AssetMismatch();
    error UnsupportedToken();
    error UnknownPosition(uint256 positionId);
    error PositionClosed(uint256 positionId);
    error TooManyHeirs();
    error InvalidHeir();
    error DuplicateHeir(address account);
    error HeirWeightsMustTotalBps();

    constructor(IERC20 asset, IYieldSource source, address pqcVerify, address pqcKeyStatus) {
        if (
            address(asset) == address(0) || address(source) == address(0) || pqcVerify == address(0)
                || pqcKeyStatus == address(0)
        ) revert ZeroAddress();
        if (source.asset() != address(asset)) revert AssetMismatch();

        ASSET = asset;
        SOURCE = source;
        PQC_VERIFY = pqcVerify;
        PQC_KEY_STATUS = pqcKeyStatus;

        asset.forceApprove(address(source), type(uint256).max);
    }

    // ------------------------------------------------------------------
    // Funding
    // ------------------------------------------------------------------

    /// @notice Open a pension. The caller deposits `amount` as principal and becomes owner.
    /// @dev The beneficiary must hold an ML-DSA-87 key with a proven possession, since
    ///      every later action on their behalf is authorised with it. The same holds for
    ///      the owner when they keep the right to close.
    function open(OpenParams calldata p) external nonReentrant returns (uint256 positionId) {
        if (p.amount == 0) revert ZeroAmount();
        if (p.beneficiary == address(0)) revert ZeroAddress();
        if (p.payoutInterval == 0 || p.checkInPeriod == 0) revert ZeroPeriod();

        PQCAuth.provenKey(PQC_KEY_STATUS, p.beneficiary);
        if (p.ownerCanClose) PQCAuth.provenKey(PQC_KEY_STATUS, msg.sender);

        positionId = ++positionCount;
        Position storage pos = _positions[positionId];
        pos.owner = msg.sender;
        pos.beneficiary = p.beneficiary;
        pos.ownerCanClose = p.ownerCanClose;
        pos.payoutAmount = p.payoutAmount;
        pos.payoutInterval = p.payoutInterval;
        pos.checkInPeriod = p.checkInPeriod;
        pos.gracePeriod = p.gracePeriod;
        pos.lastCheckIn = uint64(block.timestamp);
        pos.lastPayout = uint64(block.timestamp);

        _storeHeirs(positionId, p.heirs);

        pos.principal = p.amount;
        pos.shares = _depositToSource(p.amount);

        emit Opened(
            positionId,
            msg.sender,
            p.beneficiary,
            p.amount,
            p.payoutAmount,
            p.payoutInterval,
            p.checkInPeriod,
            p.gracePeriod,
            p.ownerCanClose
        );
    }

    /// @notice Add principal to a position. Anyone may contribute.
    function topUp(uint256 positionId, uint256 amount) external nonReentrant {
        Position storage pos = _live(positionId);
        if (amount == 0) revert ZeroAmount();

        pos.principal += amount;
        pos.shares += _depositToSource(amount);

        emit ToppedUp(positionId, msg.sender, amount);
    }

    // ------------------------------------------------------------------
    // Views
    // ------------------------------------------------------------------

    function position(uint256 positionId) external view returns (Position memory) {
        return _existing(positionId);
    }

    function heirs(uint256 positionId) external view returns (Heir[] memory) {
        _existing(positionId);
        return _heirs[positionId];
    }

    // ------------------------------------------------------------------
    // Internals
    // ------------------------------------------------------------------

    function _existing(uint256 positionId) private view returns (Position storage pos) {
        pos = _positions[positionId];
        if (pos.owner == address(0)) revert UnknownPosition(positionId);
    }

    function _live(uint256 positionId) private view returns (Position storage pos) {
        pos = _existing(positionId);
        if (pos.closed) revert PositionClosed(positionId);
    }

    /// @dev Pulls `amount` from the caller and deposits it. Tokens that deliver less than
    ///      requested (fee-on-transfer) would break the principal accounting and are refused.
    function _depositToSource(uint256 amount) private returns (uint256 shares) {
        uint256 balanceBefore = ASSET.balanceOf(address(this));
        ASSET.safeTransferFrom(msg.sender, address(this), amount);
        if (ASSET.balanceOf(address(this)) - balanceBefore != amount) revert UnsupportedToken();
        shares = SOURCE.deposit(amount, address(this));
    }

    /// @dev An empty list is allowed: the position then has nobody to succeed to.
    function _storeHeirs(uint256 positionId, Heir[] calldata list) private {
        uint256 count = list.length;
        if (count > MAX_HEIRS) revert TooManyHeirs();

        delete _heirs[positionId];
        uint256 total;
        for (uint256 i; i < count; ++i) {
            Heir calldata heir = list[i];
            if (heir.account == address(0) || heir.bps == 0) revert InvalidHeir();
            for (uint256 j; j < i; ++j) {
                if (list[j].account == heir.account) revert DuplicateHeir(heir.account);
            }
            total += heir.bps;
            _heirs[positionId].push(heir);
        }
        if (count != 0 && total != BPS) revert HeirWeightsMustTotalBps();

        emit HeirsSet(positionId, list);
    }
}
