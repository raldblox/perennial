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
        bytes pubkey;
    }

    mapping(address => Record) private records;
    mapping(bytes32 => bytes32) private secretOf;

    function publicKey(bytes32 secret) public pure returns (bytes memory pubkey) {
        pubkey = new bytes(2592);
        bytes32 commitment = keccak256(abi.encode("mock-mldsa87-public-key", secret));
        assembly {
            mstore(add(pubkey, 32), commitment)
        }
    }

    function sign(bytes32 secret, bytes memory message) public pure returns (bytes memory) {
        return abi.encodePacked(keccak256(abi.encode(secret, message)));
    }

    function register(address account, bytes32 secret, bool possessionProven) external {
        setRecord(account, true, 1, publicKey(secret), possessionProven);
        secretOf[keccak256(publicKey(secret))] = secret;
    }

    function setRecord(
        address account,
        bool registered,
        uint8 algorithmId,
        bytes memory pubkey,
        bool possessionProven
    ) public {
        records[account] = Record(registered, algorithmId, possessionProven, pubkey);
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
        return (r.registered, r.algorithmId, r.pubkey, r.possessionProven);
    }
}
