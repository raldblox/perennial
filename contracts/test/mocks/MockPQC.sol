// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IQorePQC} from "../../src/interfaces/IQorePQC.sol";

/// @notice Stand-in for the QoreChain PQC precompiles on Foundry's local EVM.
/// @dev It models the interface and the trust rules, not the cryptography. A "key pair" is a
///      32-byte secret and a 2592-byte public key derived from it; a signature is a hash of
///      the secret and the message. A signature therefore verifies only for the right key
///      and the exact message, which is what the vault's tests need. Real ML-DSA-87
///      verification is exercised against the testnet.
contract MockPQC is IQorePQC {
    struct Record {
        bool registered;
        uint8 algorithmId;
        bool possessionProven;
        /// @dev A key set as raw bytes by `setRecord`.
        bytes pubkey;
        /// @dev A key derived from a secret by `register`: kept as its commitment and rebuilt on
        ///      read, so a status query costs about what the real precompile charges (a flat
        ///      2,500 gas) instead of 81 storage reads. Callers that cap the gas they forward,
        ///      such as the Asset Kit's guard, then behave as they would on the chain.
        bytes32 commitment;
    }

    mapping(address => Record) private records;
    mapping(bytes32 => bytes32) private secretOf;

    function publicKey(bytes32 secret) public pure returns (bytes memory) {
        return _expand(keccak256(abi.encode("mock-mldsa87-public-key", secret)));
    }

    function _expand(bytes32 commitment) private pure returns (bytes memory pubkey) {
        pubkey = new bytes(2592);
        assembly {
            mstore(add(pubkey, 32), commitment)
        }
    }

    function sign(bytes32 secret, bytes memory message) public pure returns (bytes memory) {
        return abi.encodePacked(keccak256(abi.encode(secret, message)));
    }

    function register(address account, bytes32 secret, bool possessionProven) external {
        bytes32 commitment = keccak256(abi.encode("mock-mldsa87-public-key", secret));
        records[account] = Record(true, 1, possessionProven, "", commitment);
        secretOf[keccak256(publicKey(secret))] = secret;
    }

    function setRecord(
        address account,
        bool registered,
        uint8 algorithmId,
        bytes memory pubkey,
        bool possessionProven
    ) public {
        records[account] = Record(registered, algorithmId, possessionProven, pubkey, bytes32(0));
    }

    function pqcVerify(bytes calldata pubkey, bytes calldata signature, bytes calldata message)
        external
        view
        returns (bool)
    {
        bytes32 secret = secretOf[keccak256(pubkey)];
        if (secret == bytes32(0)) return false;
        return keccak256(signature) == keccak256(sign(secret, message));
    }

    function pqcKeyStatus(address account)
        external
        view
        returns (bool, uint8, bytes memory, bool)
    {
        Record storage r = records[account];
        bytes memory pubkey = r.commitment == bytes32(0) ? r.pubkey : _expand(r.commitment);
        return (r.registered, r.algorithmId, pubkey, r.possessionProven);
    }
}

/// @notice Installed at the verifier precompile address when the mock above sits at the
///         key-status address. The chain's two precompiles share one key registry; this
///         keeps that true in tests by asking the mock that holds the keys.
contract MockPQCVerifier {
    address private constant KEY_STATUS = 0x0000000000000000000000000000000000000a02;

    function pqcVerify(bytes calldata pubkey, bytes calldata signature, bytes calldata message)
        external
        view
        returns (bool)
    {
        return MockPQC(KEY_STATUS).pqcVerify(pubkey, signature, message);
    }
}
