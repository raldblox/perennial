// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IYieldSource} from "./interfaces/IYieldSource.sol";
import {PQCAuth} from "./libraries/PQCAuth.sol";

/// @title PerennialVault
/// @notice An endowment that pays out only what its principal earns.
/// @dev A position's principal is deposited into the yield source and tracked as shares.
///      Yield is harvested into the position's buffer, and payouts are made from
///      the buffer only. Whatever the buffer holds above its cap is added to the principal.
///      The vault has one asset and one yield source, both fixed at deployment, and no
///      privileged role: nothing can be paused, upgraded or swept.
contract PerennialVault is ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Heir weights are in basis points and must add up to this.
    uint256 public constant BPS = 10_000;
    uint256 public constant MAX_HEIRS = 16;
    /// @notice Domain tag of every signed action, so a signature made for this protocol
    ///         means nothing anywhere else.
    bytes32 public constant ACTION_DOMAIN = keccak256("Perennial.Action.v1");

    /// @notice The actions that need an ML-DSA-87 signature.
    enum Action {
        CheckIn,
        Claim,
        SetHeirs,
        Close
    }

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
        /// @dev Most the buffer keeps after a harvest, claim or distribution; the rest
        ///      is added to the principal. Fixed at opening. Zero compounds everything not
        ///      paid out; type(uint256).max never compounds.
        uint256 bufferCap;
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
        uint256 bufferCap;
    }

    IERC20 public immutable ASSET;
    IYieldSource public immutable SOURCE;
    /// @notice The chain's ML-DSA-87 signature verification precompile.
    address public constant PQC_VERIFY = 0x0000000000000000000000000000000000000a01;
    /// @notice The chain's post-quantum key registry precompile.
    address public constant PQC_KEY_STATUS = 0x0000000000000000000000000000000000000a02;

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
        bool ownerCanClose,
        uint256 bufferCap
    );
    event ToppedUp(uint256 indexed positionId, address indexed from, uint256 amount);
    event HeirsSet(uint256 indexed positionId, Heir[] heirs);
    event Harvested(uint256 indexed positionId, address indexed caller, uint256 yield);
    event SuccessionTriggered(uint256 indexed positionId, address indexed caller);
    event Distributed(uint256 indexed positionId, uint256 amount, uint256 periods);
    event Closed(
        uint256 indexed positionId,
        address indexed owner,
        uint256 principalReturned,
        uint256 yieldPaid
    );
    event CheckedIn(
        uint256 indexed positionId, address indexed beneficiary, uint256 successionDeadline
    );
    event Claimed(
        uint256 indexed positionId, address indexed beneficiary, uint256 amount, uint256 periods
    );
    /// @notice Buffer above the cap was added to the principal.
    event Compounded(uint256 indexed positionId, uint256 amount);

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
    error SignatureExpired(uint256 deadline);
    error PositionSucceeded(uint256 positionId);
    error PayoutNotDue(uint256 positionId, uint256 dueAt);
    error PositionNotSucceeded(uint256 positionId);
    error SuccessionNotDue(uint256 positionId, uint256 notBefore);
    error NoHeirs(uint256 positionId);
    error CloseNotAllowed(uint256 positionId);

    constructor(IERC20 asset, IYieldSource source) {
        if (address(asset) == address(0) || address(source) == address(0)) revert ZeroAddress();
        if (source.asset() != address(asset)) revert AssetMismatch();

        ASSET = asset;
        SOURCE = source;
        PQCAuth.requireAvailable(PQC_VERIFY, PQC_KEY_STATUS);

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
        pos.bufferCap = p.bufferCap;

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
            p.ownerCanClose,
            p.bufferCap
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
    // Yield
    // ------------------------------------------------------------------

    /// @notice Move the yield a position has earned into its buffer, and add whatever the
    ///         buffer then holds above its cap to the principal. Anyone may call: the yield
    ///         can only land in the position's own buffer or principal.
    function harvest(uint256 positionId) external nonReentrant returns (uint256 yield) {
        Position storage pos = _live(positionId);
        yield = _harvest(positionId, pos);
        _compound(positionId, pos);
    }

    // ------------------------------------------------------------------
    // Payouts
    // ------------------------------------------------------------------

    /// @notice Pay the beneficiary what the schedule owes, from the buffer only.
    /// @dev Authorised by the beneficiary's ML-DSA-87 signature, not by the sender, so anyone
    ///      may submit it and the money still goes to the beneficiary. Pending yield is
    ///      harvested first. A period the buffer cannot fund in full is paid in part and is
    ///      not carried over: payouts never exceed what the principal has earned.
    function claim(uint256 positionId, uint256 deadline, bytes calldata signature)
        external
        nonReentrant
        returns (uint256 paid)
    {
        Position storage pos = _live(positionId);
        if (pos.succeeded) revert PositionSucceeded(positionId);
        _authorize(positionId, pos, pos.beneficiary, Action.Claim, deadline, 0, signature);
        _recordProofOfLife(positionId, pos);

        _harvest(positionId, pos);
        uint256 periods;
        (paid, periods) = _settle(positionId, pos);

        _compound(positionId, pos);

        if (paid != 0) ASSET.safeTransfer(pos.beneficiary, paid);
        emit Claimed(positionId, pos.beneficiary, paid, periods);
    }

    // ------------------------------------------------------------------
    // Proof of life
    // ------------------------------------------------------------------

    /// @notice The beneficiary shows they are still there, restarting the check-in period.
    /// @dev Authorised by the beneficiary's ML-DSA-87 signature. A claim or a change of
    ///      heirs carries the same signature and counts as a check-in too. A late check-in
    ///      is accepted for as long as nobody has triggered succession.
    function checkIn(uint256 positionId, uint256 deadline, bytes calldata signature)
        external
        nonReentrant
    {
        Position storage pos = _live(positionId);
        if (pos.succeeded) revert PositionSucceeded(positionId);
        _authorize(positionId, pos, pos.beneficiary, Action.CheckIn, deadline, 0, signature);
        _recordProofOfLife(positionId, pos);
    }

    /// @notice Replace the heirs. Weights are basis points and must total 10,000; an empty
    ///         list removes all heirs.
    /// @dev Authorised by the beneficiary's ML-DSA-87 signature over the hash of the new list.
    function setHeirs(
        uint256 positionId,
        Heir[] calldata newHeirs,
        uint256 deadline,
        bytes calldata signature
    ) external nonReentrant {
        Position storage pos = _live(positionId);
        if (pos.succeeded) revert PositionSucceeded(positionId);
        bytes32 paramsHash = keccak256(abi.encode(newHeirs));
        _authorize(
            positionId, pos, pos.beneficiary, Action.SetHeirs, deadline, paramsHash, signature
        );
        _recordProofOfLife(positionId, pos);
        _storeHeirs(positionId, newHeirs);
    }

    // ------------------------------------------------------------------
    // Succession
    // ------------------------------------------------------------------

    /// @notice Hand the pension's income to the heirs once the beneficiary has missed the
    ///         check-in period and the grace period. Anyone may call. It cannot be undone.
    function triggerSuccession(uint256 positionId) external nonReentrant {
        Position storage pos = _live(positionId);
        if (pos.succeeded) revert PositionSucceeded(positionId);
        uint256 notBefore = successionDeadline(positionId);
        if (block.timestamp <= notBefore) revert SuccessionNotDue(positionId, notBefore);
        if (_heirs[positionId].length == 0) revert NoHeirs(positionId);

        pos.succeeded = true;
        emit SuccessionTriggered(positionId, msg.sender);
    }

    /// @notice After succession, pay the scheduled amount to the heirs by weight.
    /// @dev Permissionless and unsigned: the heirs and their weights are frozen at
    ///      succession, so the call cannot change where the money goes. The heirs inherit
    ///      the income; the principal stays invested.
    function distribute(uint256 positionId) external nonReentrant returns (uint256 paid) {
        Position storage pos = _live(positionId);
        if (!pos.succeeded) revert PositionNotSucceeded(positionId);

        _harvest(positionId, pos);
        (uint256 amount, uint256 periods) = _settle(positionId, pos);
        paid = _payHeirs(positionId, pos, amount);
        _compound(positionId, pos);

        emit Distributed(positionId, paid, periods);
    }

    // ------------------------------------------------------------------
    // Closing
    // ------------------------------------------------------------------

    /// @notice Wind the position up: the principal returns to the owner, and the yield
    ///         earned so far goes to the beneficiary, or to the heirs after succession.
    /// @dev Only possible when the owner kept this right at opening, and authorised by the
    ///      owner's ML-DSA-87 signature. Positions opened without the right are permanent.
    function closeByOwner(uint256 positionId, uint256 deadline, bytes calldata signature)
        external
        nonReentrant
    {
        Position storage pos = _live(positionId);
        if (!pos.ownerCanClose) revert CloseNotAllowed(positionId);
        _authorize(positionId, pos, pos.owner, Action.Close, deadline, 0, signature);

        _harvest(positionId, pos);

        uint256 shares = pos.shares;
        uint256 earned = pos.buffer;
        pos.closed = true;
        pos.shares = 0;
        pos.principal = 0;
        pos.buffer = 0;

        uint256 returned = SOURCE.redeem(shares, pos.owner, address(this));

        if (earned != 0) {
            if (pos.succeeded) {
                _payHeirs(positionId, pos, earned);
                uint256 dust = pos.buffer;
                pos.buffer = 0;
                if (dust != 0) ASSET.safeTransfer(pos.owner, dust);
            } else {
                ASSET.safeTransfer(pos.beneficiary, earned);
            }
        }

        emit Closed(positionId, pos.owner, returned, earned);
    }

    // ------------------------------------------------------------------
    // Views
    // ------------------------------------------------------------------

    /// @notice The moment after which succession can be triggered, unless the beneficiary
    ///         checks in first.
    function successionDeadline(uint256 positionId) public view returns (uint256) {
        Position storage pos = _existing(positionId);
        return uint256(pos.lastCheckIn) + pos.checkInPeriod + pos.gracePeriod;
    }

    /// @notice The exact bytes an account signs with ML-DSA-87 to authorise an action.
    /// @param nonce The position's current nonce, from `position(positionId).nonce`.
    /// @param paramsHash Hash of the action's arguments, or zero when it has none.
    function actionMessage(
        uint256 positionId,
        Action action,
        uint256 nonce,
        uint256 deadline,
        bytes32 paramsHash
    ) public view returns (bytes memory) {
        return abi.encode(
            ACTION_DOMAIN,
            block.chainid,
            address(this),
            positionId,
            uint8(action),
            nonce,
            deadline,
            paramsHash
        );
    }

    /// @notice When the next payout becomes due.
    function nextPayoutAt(uint256 positionId) external view returns (uint256) {
        Position storage pos = _existing(positionId);
        return uint256(pos.lastPayout) + pos.payoutInterval;
    }

    /// @notice Yield a harvest would move into the buffer right now.
    function pendingYield(uint256 positionId) external view returns (uint256) {
        Position storage pos = _existing(positionId);
        if (pos.closed) return 0;
        uint256 keep = SOURCE.previewWithdraw(pos.principal);
        return pos.shares > keep ? SOURCE.convertToAssets(pos.shares - keep) : 0;
    }

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

    /// @dev Checks `signer`'s ML-DSA-87 signature over this exact action and consumes the
    ///      position's nonce, so the signature cannot be used again.
    function _authorize(
        uint256 positionId,
        Position storage pos,
        address signer,
        Action action,
        uint256 deadline,
        bytes32 paramsHash,
        bytes calldata signature
    ) private {
        if (block.timestamp > deadline) revert SignatureExpired(deadline);
        bytes memory message = actionMessage(positionId, action, pos.nonce++, deadline, paramsHash);
        PQCAuth.requireSignature(PQC_VERIFY, PQC_KEY_STATUS, signer, message, signature);
    }

    function _recordProofOfLife(uint256 positionId, Position storage pos) private {
        pos.lastCheckIn = uint64(block.timestamp);
        emit CheckedIn(positionId, pos.beneficiary, successionDeadline(positionId));
    }

    /// @dev Splits `amount`, already taken out of the buffer, between the heirs. What the
    ///      division leaves over goes back into the buffer.
    function _payHeirs(uint256 positionId, Position storage pos, uint256 amount)
        private
        returns (uint256 paid)
    {
        Heir[] storage list = _heirs[positionId];
        uint256 count = list.length;
        for (uint256 i; i < count; ++i) {
            uint256 share = (amount * list[i].bps) / BPS;
            if (share == 0) continue;
            paid += share;
            ASSET.safeTransfer(list[i].account, share);
        }
        pos.buffer += amount - paid;
    }

    /// @dev Takes what the schedule owes out of the buffer and advances the schedule by the
    ///      whole periods that have passed.
    function _settle(uint256 positionId, Position storage pos)
        private
        returns (uint256 amount, uint256 periods)
    {
        periods = (block.timestamp - pos.lastPayout) / pos.payoutInterval;
        if (periods == 0) {
            revert PayoutNotDue(positionId, uint256(pos.lastPayout) + pos.payoutInterval);
        }

        uint256 owed = pos.payoutAmount == 0 ? pos.buffer : pos.payoutAmount * periods;
        amount = owed < pos.buffer ? owed : pos.buffer;

        pos.buffer -= amount;
        pos.lastPayout += uint64(periods * pos.payoutInterval);
    }

    /// @dev Keeps exactly the shares needed to withdraw the principal and redeems the rest.
    ///      `previewWithdraw` rounds up, so rounding always favours the principal.
    function _harvest(uint256 positionId, Position storage pos) private returns (uint256 yield) {
        uint256 keep = SOURCE.previewWithdraw(pos.principal);
        if (pos.shares <= keep) return 0;

        uint256 surplus = pos.shares - keep;
        pos.shares = keep;

        uint256 balanceBefore = ASSET.balanceOf(address(this));
        SOURCE.redeem(surplus, address(this), address(this));
        yield = ASSET.balanceOf(address(this)) - balanceBefore;

        pos.buffer += yield;
        emit Harvested(positionId, msg.sender, yield);
    }

    /// @dev Adds whatever the buffer holds above its cap to the principal, depositing it into
    ///      the source. Called after every payout path, so the scheduled payout is taken
    ///      from the buffer before anything is compounded.
    function _compound(uint256 positionId, Position storage pos) private {
        uint256 cap = pos.bufferCap;
        if (pos.buffer <= cap) return;
        uint256 excess = pos.buffer - cap;
        pos.buffer = cap;
        pos.principal += excess;
        pos.shares += SOURCE.deposit(excess, address(this));
        emit Compounded(positionId, excess);
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
