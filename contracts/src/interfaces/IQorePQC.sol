// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title QoreChain post-quantum precompiles
/// @notice `pqcVerify` lives at 0x…0A01 and `pqcKeyStatus` at 0x…0A02 on networks where
///         governance has activated them. An inactive address answers a call with success
///         and empty return data, so callers must check the returned length.
interface IQorePQC {
    /// @notice Verify an ML-DSA-87 signature.
    /// @param pubkey The 2592-byte ML-DSA-87 public key.
    /// @param signature The 4627-byte signature.
    /// @param message The signed bytes.
    function pqcVerify(bytes calldata pubkey, bytes calldata signature, bytes calldata message)
        external
        view
        returns (bool valid);

    /// @notice Read the post-quantum key registered for an account.
    /// @return registered Whether a key is registered.
    /// @return algorithmId 1 for ML-DSA-87.
    /// @return pubkey The registered public key, empty if none.
    /// @return possessionProven Whether the key was registered with a verified proof of
    ///         possession. Registration alone does not show the account controls the key.
    function pqcKeyStatus(address account)
        external
        view
        returns (bool registered, uint8 algorithmId, bytes memory pubkey, bool possessionProven);
}
