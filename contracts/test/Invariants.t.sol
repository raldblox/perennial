// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PerennialVault} from "../src/PerennialVault.sol";
import {MockYieldSource} from "../src/mocks/MockYieldSource.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockPQC} from "./mocks/MockPQC.sol";
import {VaultFixture} from "./VaultFixture.sol";

/// @dev Drives the vault through random sequences of every action, signing correctly where
///      a signature is needed, and keeps the bookkeeping the invariants are checked against.
contract Handler is Test {
    uint256 internal constant USD = 1e6;
    uint256 internal constant MAX_POSITIONS = 6;

    PerennialVault internal vault;
    MockERC20 internal token;
    MockPQC internal pqc;

    address internal owner;
    address internal beneficiary;
    address internal heirA;
    address internal heirB;
    bytes32 internal ownerSecret;
    bytes32 internal beneficiarySecret;

    /// Principal ever deposited into each position, and how many deposits made it up.
    mapping(uint256 => uint256) public deposited;
    mapping(uint256 => uint256) public deposits;
    /// What the beneficiary had received when a position went to the heirs.
    mapping(uint256 => bool) public succeeded;
    uint256 public beneficiaryBalanceAtLastSuccession;
    bool public anySucceeded;
    uint256 public principalReturned;
    /// Principal last seen for each open position, and whether it ever went down.
    mapping(uint256 => uint256) public lastPrincipal;
    bool public principalShrank;
    /// How many times each position's principal grew (a deposit or a compounding).
    mapping(uint256 => uint256) public growths;

    constructor(
        PerennialVault vault_,
        MockERC20 token_,
        MockPQC pqc_,
        address[4] memory accounts,
        bytes32[2] memory secrets
    ) {
        vault = vault_;
        token = token_;
        pqc = pqc_;
        (owner, beneficiary, heirA, heirB) = (accounts[0], accounts[1], accounts[2], accounts[3]);
        (ownerSecret, beneficiarySecret) = (secrets[0], secrets[1]);
    }

    function _pick(uint256 seed) internal view returns (uint256 id) {
        uint256 count = vault.positionCount();
        if (count == 0) return 0;
        return bound(seed, 1, count);
    }

    function _sign(bytes32 secret, uint256 id, PerennialVault.Action action, uint256 deadline)
        internal
        view
        returns (bytes memory)
    {
        return _signWith(secret, id, action, deadline, 0);
    }

    function _signWith(
        bytes32 secret,
        uint256 id,
        PerennialVault.Action action,
        uint256 deadline,
        bytes32 paramsHash
    ) internal view returns (bytes memory) {
        uint256 nonce = vault.position(id).nonce;
        return pqc.sign(secret, vault.actionMessage(id, action, nonce, deadline, paramsHash));
    }

    /// @dev After every action: an open position's principal may only grow.
    modifier tracksPrincipal(uint256 seed) {
        _;
        uint256 count = vault.positionCount();
        for (uint256 id = 1; id <= count; ++id) {
            PerennialVault.Position memory pos = vault.position(id);
            if (pos.closed) continue;
            if (pos.principal < lastPrincipal[id]) principalShrank = true;
            if (pos.principal > lastPrincipal[id]) growths[id] += 1;
            lastPrincipal[id] = pos.principal;
        }
    }

    function open(uint256 amount, uint256 payout, bool closable, uint256 cap)
        external
        tracksPrincipal(0)
    {
        if (vault.positionCount() >= MAX_POSITIONS) return;
        amount = bound(amount, 1, 500_000 * USD);
        PerennialVault.Heir[] memory list = new PerennialVault.Heir[](2);
        list[0] = PerennialVault.Heir(heirA, 6_000);
        list[1] = PerennialVault.Heir(heirB, 4_000);

        token.mint(owner, amount);
        vm.startPrank(owner);
        token.approve(address(vault), amount);
        uint256 id = vault.open(
            PerennialVault.OpenParams({
                amount: amount,
                beneficiary: beneficiary,
                payoutAmount: bound(payout, 0, 5_000 * USD),
                payoutInterval: 30 days,
                checkInPeriod: 90 days,
                gracePeriod: 30 days,
                ownerCanClose: closable,
                heirs: list,
                // A third of positions never compound, the rest keep a cap from zero up.
                bufferCap: cap % 3 == 0 ? type(uint256).max : bound(cap, 0, 2_000 * USD)
            })
        );
        vm.stopPrank();
        deposited[id] = amount;
        deposits[id] = 1;
    }

    function topUp(uint256 seed, uint256 amount) external tracksPrincipal(seed) {
        uint256 id = _pick(seed);
        if (id == 0 || vault.position(id).closed) return;
        amount = bound(amount, 1, 100_000 * USD);
        token.mint(owner, amount);
        vm.startPrank(owner);
        token.approve(address(vault), amount);
        vault.topUp(id, amount);
        vm.stopPrank();
        deposited[id] += amount;
        deposits[id] += 1;
    }

    function warp(uint256 secondsForward) external {
        skip(bound(secondsForward, 1 hours, 100 days));
    }

    function harvest(uint256 seed) external tracksPrincipal(seed) {
        uint256 id = _pick(seed);
        if (id == 0) return;
        vault.harvest(id);
    }

    function claim(uint256 seed) external tracksPrincipal(seed) {
        uint256 id = _pick(seed);
        if (id == 0) return;
        uint256 deadline = block.timestamp + 1;
        bytes memory signature = _sign(beneficiarySecret, id, PerennialVault.Action.Claim, deadline);
        vault.claim(id, deadline, signature);
    }

    function checkIn(uint256 seed) external tracksPrincipal(seed) {
        uint256 id = _pick(seed);
        if (id == 0) return;
        uint256 deadline = block.timestamp + 1;
        bytes memory signature =
            _sign(beneficiarySecret, id, PerennialVault.Action.CheckIn, deadline);
        vault.checkIn(id, deadline, signature);
    }

    function triggerSuccession(uint256 seed) external tracksPrincipal(seed) {
        uint256 id = _pick(seed);
        if (id == 0) return;
        vault.triggerSuccession(id);
        succeeded[id] = true;
        anySucceeded = true;
    }

    function distribute(uint256 seed) external tracksPrincipal(seed) {
        uint256 id = _pick(seed);
        if (id == 0) return;
        vault.distribute(id);
    }

    function close(uint256 seed) external tracksPrincipal(seed) {
        uint256 id = _pick(seed);
        if (id == 0) return;
        uint256 deadline = block.timestamp + 1;
        bytes memory signature = _sign(ownerSecret, id, PerennialVault.Action.Close, deadline);
        uint256 before = token.balanceOf(owner);
        vault.closeByOwner(id, deadline, signature);
        principalReturned += token.balanceOf(owner) - before;
    }
}

contract InvariantsTest is VaultFixture {
    Handler internal handler;

    function setUp() public override {
        super.setUp();
        handler = new Handler(
            vault,
            token,
            pqc,
            [owner, beneficiary, heirA, heirB],
            [OWNER_SECRET, BENEFICIARY_SECRET]
        );
        targetContract(address(handler));
    }

    /// The principal of an open position never shrinks and never falls below what its
    /// owners deposited; it grows only by deposits and by compounding. The shares held for
    /// it cover it, short by at most one share per deposit or compounding (each rounds down
    /// by at most one share) until the next harvest makes that up out of yield.
    function invariant_principalIsNeverSpent() public view {
        assertFalse(handler.principalShrank());
        uint256 count = vault.positionCount();
        for (uint256 id = 1; id <= count; ++id) {
            PerennialVault.Position memory pos = vault.position(id);
            if (pos.closed) continue;
            assertGe(pos.principal, handler.deposited(id));
            assertGe(pos.shares + handler.growths(id), source.previewWithdraw(pos.principal));
        }
    }

    /// After any action the buffer holds at most its cap; the rest has been compounded.
    function invariant_bufferNeverExceedsItsCap() public view {
        uint256 count = vault.positionCount();
        for (uint256 id = 1; id <= count; ++id) {
            PerennialVault.Position memory pos = vault.position(id);
            assertLe(pos.buffer, pos.bufferCap);
        }
    }

    /// Every token the vault holds is harvested yield in some position's buffer: payouts
    /// can only ever come out of yield.
    function invariant_vaultHoldsExactlyTheBuffers() public view {
        uint256 count = vault.positionCount();
        uint256 buffers;
        for (uint256 id = 1; id <= count; ++id) {
            buffers += vault.position(id).buffer;
        }
        assertEq(token.balanceOf(address(vault)), buffers);
    }

    /// The vault's shares in the yield source are exactly those of its positions.
    function invariant_sharesAreFullyAttributed() public view {
        uint256 count = vault.positionCount();
        uint256 shares;
        for (uint256 id = 1; id <= count; ++id) {
            shares += vault.position(id).shares;
        }
        assertEq(source.balanceOf(address(vault)), shares);
    }

    /// Succession is one-way.
    function invariant_successionIsIrreversible() public view {
        uint256 count = vault.positionCount();
        for (uint256 id = 1; id <= count; ++id) {
            if (handler.succeeded(id)) assertTrue(vault.position(id).succeeded);
        }
    }

    /// Nobody but the owner, the beneficiary and the heirs ever receives tokens.
    function invariant_noValueLeaksToThirdParties() public view {
        assertEq(token.balanceOf(address(handler)), 0);
        assertEq(token.balanceOf(stranger), 0);
    }
}
