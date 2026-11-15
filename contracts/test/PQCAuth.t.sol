// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PQCAuth} from "../src/libraries/PQCAuth.sol";
import {MockPQC} from "./mocks/MockPQC.sol";

/// @dev Exposes the internal library through external calls so reverts can be asserted.
contract PQCAuthHarness {
    function provenKey(address keyStatus, address account) external view returns (bytes memory) {
        return PQCAuth.provenKey(keyStatus, account);
    }

    function requireSignature(
        address verifier,
        address keyStatus,
        address account,
        bytes memory message,
        bytes calldata signature
    ) external view {
        PQCAuth.requireSignature(verifier, keyStatus, account, message, signature);
    }
}

contract PQCAuthTest is Test {
    MockPQC internal pqc;
    PQCAuthHarness internal harness;

    address internal alice = makeAddr("alice");
    bytes32 internal constant ALICE_SECRET = keccak256("alice secret");
    bytes32 internal constant OTHER_SECRET = keccak256("other secret");
    bytes internal constant MESSAGE = "approve this";

    function setUp() public {
        pqc = new MockPQC();
        harness = new PQCAuthHarness();
        pqc.register(alice, ALICE_SECRET, true);
    }

    function _require(address account, bytes memory message, bytes memory signature)
        internal
        view
    {
        harness.requireSignature(address(pqc), address(pqc), account, message, signature);
    }

    function test_provenKey_returnsRegisteredKey() public view {
        bytes memory key = harness.provenKey(address(pqc), alice);
        assertEq(key, pqc.publicKey(ALICE_SECRET));
    }

    function test_provenKey_revertsWhenNotRegistered() public {
        address nobody = makeAddr("nobody");
        vm.expectRevert(abi.encodeWithSelector(PQCAuth.PQCKeyNotRegistered.selector, nobody));
        harness.provenKey(address(pqc), nobody);
    }

    function test_provenKey_revertsWithoutProofOfPossession() public {
        address bob = makeAddr("bob");
        pqc.register(bob, OTHER_SECRET, false);
        vm.expectRevert(abi.encodeWithSelector(PQCAuth.PQCKeyNotProven.selector, bob));
        harness.provenKey(address(pqc), bob);
    }

    function test_provenKey_revertsOnOtherAlgorithm() public {
        pqc.setRecord(alice, true, 2, pqc.publicKey(ALICE_SECRET), true);
        vm.expectRevert(abi.encodeWithSelector(PQCAuth.PQCKeyUnsupported.selector, alice));
        harness.provenKey(address(pqc), alice);
    }

    function test_provenKey_revertsOnWrongKeyLength() public {
        pqc.setRecord(alice, true, 1, new bytes(1952), true);
        vm.expectRevert(abi.encodeWithSelector(PQCAuth.PQCKeyUnsupported.selector, alice));
        harness.provenKey(address(pqc), alice);
    }

    /// An address with no code answers like an inactive precompile: success, no data.
    function test_provenKey_failsClosedWhenPrecompileInactive() public {
        address inactive = address(0xA02);
        vm.expectRevert(abi.encodeWithSelector(PQCAuth.PQCUnavailable.selector, inactive));
        harness.provenKey(inactive, alice);
    }

    function test_requireSignature_acceptsValidSignature() public view {
        _require(alice, MESSAGE, pqc.sign(ALICE_SECRET, MESSAGE));
    }

    function test_requireSignature_rejectsAnotherKeysSignature() public {
        pqc.register(makeAddr("bob"), OTHER_SECRET, true);
        bytes memory signature = pqc.sign(OTHER_SECRET, MESSAGE);
        vm.expectRevert(abi.encodeWithSelector(PQCAuth.PQCSignatureInvalid.selector, alice));
        _require(alice, MESSAGE, signature);
    }

    function test_requireSignature_rejectsSignatureOverAnotherMessage() public {
        bytes memory signature = pqc.sign(ALICE_SECRET, "approve that");
        vm.expectRevert(abi.encodeWithSelector(PQCAuth.PQCSignatureInvalid.selector, alice));
        _require(alice, MESSAGE, signature);
    }

    function test_requireSignature_failsClosedWhenVerifierInactive() public {
        address inactive = address(0xA01);
        bytes memory signature = pqc.sign(ALICE_SECRET, MESSAGE);
        vm.expectRevert(abi.encodeWithSelector(PQCAuth.PQCUnavailable.selector, inactive));
        harness.requireSignature(inactive, address(pqc), alice, MESSAGE, signature);
    }

    function test_requireSignature_followsKeyRotation() public {
        bytes memory oldSignature = pqc.sign(ALICE_SECRET, MESSAGE);
        pqc.register(alice, OTHER_SECRET, true);

        _require(alice, MESSAGE, pqc.sign(OTHER_SECRET, MESSAGE));

        vm.expectRevert(abi.encodeWithSelector(PQCAuth.PQCSignatureInvalid.selector, alice));
        _require(alice, MESSAGE, oldSignature);
    }
}
