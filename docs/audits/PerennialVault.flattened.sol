// SPDX-License-Identifier: MIT
pragma solidity >=0.4.16 >=0.6.2 ^0.8.20 ^0.8.24;

// lib/openzeppelin-contracts/contracts/utils/introspection/IERC165.sol

// OpenZeppelin Contracts (last updated v5.4.0) (utils/introspection/IERC165.sol)

/**
 * @dev Interface of the ERC-165 standard, as defined in the
 * https://eips.ethereum.org/EIPS/eip-165[ERC].
 *
 * Implementers can declare support of contract interfaces, which can then be
 * queried by others ({ERC165Checker}).
 *
 * For an implementation, see {ERC165}.
 */
interface IERC165 {
    /**
     * @dev Returns true if this contract implements the interface defined by
     * `interfaceId`. See the corresponding
     * https://eips.ethereum.org/EIPS/eip-165#how-interfaces-are-identified[ERC section]
     * to learn more about how these ids are created.
     *
     * This function call must use less than 30 000 gas.
     */
    function supportsInterface(bytes4 interfaceId) external view returns (bool);
}

// lib/openzeppelin-contracts/contracts/token/ERC20/IERC20.sol

// OpenZeppelin Contracts (last updated v5.4.0) (token/ERC20/IERC20.sol)

/**
 * @dev Interface of the ERC-20 standard as defined in the ERC.
 */
interface IERC20 {
    /**
     * @dev Emitted when `value` tokens are moved from one account (`from`) to
     * another (`to`).
     *
     * Note that `value` may be zero.
     */
    event Transfer(address indexed from, address indexed to, uint256 value);

    /**
     * @dev Emitted when the allowance of a `spender` for an `owner` is set by
     * a call to {approve}. `value` is the new allowance.
     */
    event Approval(address indexed owner, address indexed spender, uint256 value);

    /**
     * @dev Returns the value of tokens in existence.
     */
    function totalSupply() external view returns (uint256);

    /**
     * @dev Returns the value of tokens owned by `account`.
     */
    function balanceOf(address account) external view returns (uint256);

    /**
     * @dev Moves a `value` amount of tokens from the caller's account to `to`.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * Emits a {Transfer} event.
     */
    function transfer(address to, uint256 value) external returns (bool);

    /**
     * @dev Returns the remaining number of tokens that `spender` will be
     * allowed to spend on behalf of `owner` through {transferFrom}. This is
     * zero by default.
     *
     * This value changes when {approve} or {transferFrom} are called.
     */
    function allowance(address owner, address spender) external view returns (uint256);

    /**
     * @dev Sets a `value` amount of tokens as the allowance of `spender` over the
     * caller's tokens.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * IMPORTANT: Beware that changing an allowance with this method brings the risk
     * that someone may use both the old and the new allowance by unfortunate
     * transaction ordering. One possible solution to mitigate this race
     * condition is to first reduce the spender's allowance to 0 and set the
     * desired value afterwards:
     * https://github.com/ethereum/EIPs/issues/20#issuecomment-263524729
     *
     * Emits an {Approval} event.
     */
    function approve(address spender, uint256 value) external returns (bool);

    /**
     * @dev Moves a `value` amount of tokens from `from` to `to` using the
     * allowance mechanism. `value` is then deducted from the caller's
     * allowance.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * Emits a {Transfer} event.
     */
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}

// src/interfaces/IQorePQC.sol

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

// src/interfaces/IYieldSource.sol

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

// lib/openzeppelin-contracts/contracts/utils/StorageSlot.sol

// OpenZeppelin Contracts (last updated v5.1.0) (utils/StorageSlot.sol)
// This file was procedurally generated from scripts/generate/templates/StorageSlot.js.

/**
 * @dev Library for reading and writing primitive types to specific storage slots.
 *
 * Storage slots are often used to avoid storage conflict when dealing with upgradeable contracts.
 * This library helps with reading and writing to such slots without the need for inline assembly.
 *
 * The functions in this library return Slot structs that contain a `value` member that can be used to read or write.
 *
 * Example usage to set ERC-1967 implementation slot:
 * ```solidity
 * contract ERC1967 {
 *     // Define the slot. Alternatively, use the SlotDerivation library to derive the slot.
 *     bytes32 internal constant _IMPLEMENTATION_SLOT = 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;
 *
 *     function _getImplementation() internal view returns (address) {
 *         return StorageSlot.getAddressSlot(_IMPLEMENTATION_SLOT).value;
 *     }
 *
 *     function _setImplementation(address newImplementation) internal {
 *         require(newImplementation.code.length > 0);
 *         StorageSlot.getAddressSlot(_IMPLEMENTATION_SLOT).value = newImplementation;
 *     }
 * }
 * ```
 *
 * TIP: Consider using this library along with {SlotDerivation}.
 */
library StorageSlot {
    struct AddressSlot {
        address value;
    }

    struct BooleanSlot {
        bool value;
    }

    struct Bytes32Slot {
        bytes32 value;
    }

    struct Uint256Slot {
        uint256 value;
    }

    struct Int256Slot {
        int256 value;
    }

    struct StringSlot {
        string value;
    }

    struct BytesSlot {
        bytes value;
    }

    /**
     * @dev Returns an `AddressSlot` with member `value` located at `slot`.
     */
    function getAddressSlot(bytes32 slot) internal pure returns (AddressSlot storage r) {
        assembly ("memory-safe") {
            r.slot := slot
        }
    }

    /**
     * @dev Returns a `BooleanSlot` with member `value` located at `slot`.
     */
    function getBooleanSlot(bytes32 slot) internal pure returns (BooleanSlot storage r) {
        assembly ("memory-safe") {
            r.slot := slot
        }
    }

    /**
     * @dev Returns a `Bytes32Slot` with member `value` located at `slot`.
     */
    function getBytes32Slot(bytes32 slot) internal pure returns (Bytes32Slot storage r) {
        assembly ("memory-safe") {
            r.slot := slot
        }
    }

    /**
     * @dev Returns a `Uint256Slot` with member `value` located at `slot`.
     */
    function getUint256Slot(bytes32 slot) internal pure returns (Uint256Slot storage r) {
        assembly ("memory-safe") {
            r.slot := slot
        }
    }

    /**
     * @dev Returns a `Int256Slot` with member `value` located at `slot`.
     */
    function getInt256Slot(bytes32 slot) internal pure returns (Int256Slot storage r) {
        assembly ("memory-safe") {
            r.slot := slot
        }
    }

    /**
     * @dev Returns a `StringSlot` with member `value` located at `slot`.
     */
    function getStringSlot(bytes32 slot) internal pure returns (StringSlot storage r) {
        assembly ("memory-safe") {
            r.slot := slot
        }
    }

    /**
     * @dev Returns an `StringSlot` representation of the string storage pointer `store`.
     */
    function getStringSlot(string storage store) internal pure returns (StringSlot storage r) {
        assembly ("memory-safe") {
            r.slot := store.slot
        }
    }

    /**
     * @dev Returns a `BytesSlot` with member `value` located at `slot`.
     */
    function getBytesSlot(bytes32 slot) internal pure returns (BytesSlot storage r) {
        assembly ("memory-safe") {
            r.slot := slot
        }
    }

    /**
     * @dev Returns an `BytesSlot` representation of the bytes storage pointer `store`.
     */
    function getBytesSlot(bytes storage store) internal pure returns (BytesSlot storage r) {
        assembly ("memory-safe") {
            r.slot := store.slot
        }
    }
}

// lib/openzeppelin-contracts/contracts/interfaces/IERC165.sol

// OpenZeppelin Contracts (last updated v5.4.0) (interfaces/IERC165.sol)

// lib/openzeppelin-contracts/contracts/interfaces/IERC20.sol

// OpenZeppelin Contracts (last updated v5.4.0) (interfaces/IERC20.sol)

// src/libraries/PQCAuth.sol

/// @title PQCAuth
/// @notice Checks that an account approved a message with its registered ML-DSA-87 key.
/// @dev Every path fails closed: a precompile that is inactive, or missing on this chain,
///      returns empty data and is reported as unavailable instead of being read as "valid".
library PQCAuth {
    /// @dev Algorithm identifier the chain reports for ML-DSA-87.
    uint8 internal constant ML_DSA_87 = 1;
    uint256 internal constant ML_DSA_87_PUBLIC_KEY_LENGTH = 2592;

    /// @dev ABI size of (bool, uint8, bytes, bool) with an empty `bytes`.
    uint256 private constant MIN_KEY_STATUS_RETURN = 160;

    error PQCUnavailable(address precompile);
    error PQCKeyNotRegistered(address account);
    error PQCKeyUnsupported(address account);
    error PQCKeyNotProven(address account);
    error PQCSignatureInvalid(address account);

    /// @notice Revert unless both precompiles answer. Called once at deployment, so a
    ///         contract can never be deployed on a chain where it could authorise nothing.
    function requireAvailable(address verifier, address keyStatus) internal view {
        (bool ok, bytes memory ret) =
            keyStatus.staticcall(abi.encodeCall(IQorePQC.pqcKeyStatus, (address(0))));
        if (!ok || ret.length < MIN_KEY_STATUS_RETURN) revert PQCUnavailable(keyStatus);

        (ok, ret) = verifier.staticcall(abi.encodeCall(IQorePQC.pqcVerify, ("", "", "")));
        if (!ok || ret.length != 32) revert PQCUnavailable(verifier);
    }

    /// @notice Return the account's ML-DSA-87 key, requiring a verified proof of possession.
    function provenKey(address keyStatus, address account)
        internal
        view
        returns (bytes memory pubkey)
    {
        (bool ok, bytes memory ret) =
            keyStatus.staticcall(abi.encodeCall(IQorePQC.pqcKeyStatus, (account)));
        if (!ok || ret.length < MIN_KEY_STATUS_RETURN) revert PQCUnavailable(keyStatus);

        bool registered;
        uint8 algorithmId;
        bool possessionProven;
        (registered, algorithmId, pubkey, possessionProven) =
            abi.decode(ret, (bool, uint8, bytes, bool));

        if (!registered) revert PQCKeyNotRegistered(account);
        if (algorithmId != ML_DSA_87 || pubkey.length != ML_DSA_87_PUBLIC_KEY_LENGTH) {
            revert PQCKeyUnsupported(account);
        }
        if (!possessionProven) revert PQCKeyNotProven(account);
    }

    /// @notice Revert unless `signature` is `account`'s ML-DSA-87 signature over `message`.
    /// @dev The key is read at call time, so a key rotated on chain is followed.
    function requireSignature(
        address verifier,
        address keyStatus,
        address account,
        bytes memory message,
        bytes calldata signature
    ) internal view {
        bytes memory pubkey = provenKey(keyStatus, account);

        (bool ok, bytes memory ret) =
            verifier.staticcall(abi.encodeCall(IQorePQC.pqcVerify, (pubkey, signature, message)));
        if (!ok || ret.length != 32) revert PQCUnavailable(verifier);
        if (!abi.decode(ret, (bool))) revert PQCSignatureInvalid(account);
    }
}

// lib/openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol

// OpenZeppelin Contracts (last updated v5.5.0) (utils/ReentrancyGuard.sol)

/**
 * @dev Contract module that helps prevent reentrant calls to a function.
 *
 * Inheriting from `ReentrancyGuard` will make the {nonReentrant} modifier
 * available, which can be applied to functions to make sure there are no nested
 * (reentrant) calls to them.
 *
 * Note that because there is a single `nonReentrant` guard, functions marked as
 * `nonReentrant` may not call one another. This can be worked around by making
 * those functions `private`, and then adding `external` `nonReentrant` entry
 * points to them.
 *
 * TIP: If EIP-1153 (transient storage) is available on the chain you're deploying at,
 * consider using {ReentrancyGuardTransient} instead.
 *
 * TIP: If you would like to learn more about reentrancy and alternative ways
 * to protect against it, check out our blog post
 * https://blog.openzeppelin.com/reentrancy-after-istanbul/[Reentrancy After Istanbul].
 *
 * IMPORTANT: Deprecated. This storage-based reentrancy guard will be removed and replaced
 * by the {ReentrancyGuardTransient} variant in v6.0.
 *
 * @custom:stateless
 */
abstract contract ReentrancyGuard {
    using StorageSlot for bytes32;

    // keccak256(abi.encode(uint256(keccak256("openzeppelin.storage.ReentrancyGuard")) - 1)) & ~bytes32(uint256(0xff))
    bytes32 private constant REENTRANCY_GUARD_STORAGE =
        0x9b779b17422d0df92223018b32b4d1fa46e071723d6817e2486d003becc55f00;

    // Booleans are more expensive than uint256 or any type that takes up a full
    // word because each write operation emits an extra SLOAD to first read the
    // slot's contents, replace the bits taken up by the boolean, and then write
    // back. This is the compiler's defense against contract upgrades and
    // pointer aliasing, and it cannot be disabled.

    // The values being non-zero value makes deployment a bit more expensive,
    // but in exchange the refund on every call to nonReentrant will be lower in
    // amount. Since refunds are capped to a percentage of the total
    // transaction's gas, it is best to keep them low in cases like this one, to
    // increase the likelihood of the full refund coming into effect.
    uint256 private constant NOT_ENTERED = 1;
    uint256 private constant ENTERED = 2;

    /**
     * @dev Unauthorized reentrant call.
     */
    error ReentrancyGuardReentrantCall();

    constructor() {
        _reentrancyGuardStorageSlot().getUint256Slot().value = NOT_ENTERED;
    }

    /**
     * @dev Prevents a contract from calling itself, directly or indirectly.
     * Calling a `nonReentrant` function from another `nonReentrant`
     * function is not supported. It is possible to prevent this from happening
     * by making the `nonReentrant` function external, and making it call a
     * `private` function that does the actual work.
     */
    modifier nonReentrant() {
        _nonReentrantBefore();
        _;
        _nonReentrantAfter();
    }

    /**
     * @dev A `view` only version of {nonReentrant}. Use to block view functions
     * from being called, preventing reading from inconsistent contract state.
     *
     * CAUTION: This is a "view" modifier and does not change the reentrancy
     * status. Use it only on view functions. For payable or non-payable functions,
     * use the standard {nonReentrant} modifier instead.
     */
    modifier nonReentrantView() {
        _nonReentrantBeforeView();
        _;
    }

    function _nonReentrantBeforeView() private view {
        if (_reentrancyGuardEntered()) {
            revert ReentrancyGuardReentrantCall();
        }
    }

    function _nonReentrantBefore() private {
        // On the first call to nonReentrant, _status will be NOT_ENTERED
        _nonReentrantBeforeView();

        // Any calls to nonReentrant after this point will fail
        _reentrancyGuardStorageSlot().getUint256Slot().value = ENTERED;
    }

    function _nonReentrantAfter() private {
        // By storing the original value once again, a refund is triggered (see
        // https://eips.ethereum.org/EIPS/eip-2200)
        _reentrancyGuardStorageSlot().getUint256Slot().value = NOT_ENTERED;
    }

    /**
     * @dev Returns true if the reentrancy guard is currently set to "entered", which indicates there is a
     * `nonReentrant` function in the call stack.
     */
    function _reentrancyGuardEntered() internal view returns (bool) {
        return _reentrancyGuardStorageSlot().getUint256Slot().value == ENTERED;
    }

    function _reentrancyGuardStorageSlot() internal pure virtual returns (bytes32) {
        return REENTRANCY_GUARD_STORAGE;
    }
}

// lib/openzeppelin-contracts/contracts/interfaces/IERC1363.sol

// OpenZeppelin Contracts (last updated v5.4.0) (interfaces/IERC1363.sol)

/**
 * @title IERC1363
 * @dev Interface of the ERC-1363 standard as defined in the https://eips.ethereum.org/EIPS/eip-1363[ERC-1363].
 *
 * Defines an extension interface for ERC-20 tokens that supports executing code on a recipient contract
 * after `transfer` or `transferFrom`, or code on a spender contract after `approve`, in a single transaction.
 */
interface IERC1363 is IERC20, IERC165 {
    /*
     * Note: the ERC-165 identifier for this interface is 0xb0202a11.
     * 0xb0202a11 ===
     *   bytes4(keccak256('transferAndCall(address,uint256)')) ^
     *   bytes4(keccak256('transferAndCall(address,uint256,bytes)')) ^
     *   bytes4(keccak256('transferFromAndCall(address,address,uint256)')) ^
     *   bytes4(keccak256('transferFromAndCall(address,address,uint256,bytes)')) ^
     *   bytes4(keccak256('approveAndCall(address,uint256)')) ^
     *   bytes4(keccak256('approveAndCall(address,uint256,bytes)'))
     */

    /**
     * @dev Moves a `value` amount of tokens from the caller's account to `to`
     * and then calls {IERC1363Receiver-onTransferReceived} on `to`.
     * @param to The address which you want to transfer to.
     * @param value The amount of tokens to be transferred.
     * @return A boolean value indicating whether the operation succeeded unless throwing.
     */
    function transferAndCall(address to, uint256 value) external returns (bool);

    /**
     * @dev Moves a `value` amount of tokens from the caller's account to `to`
     * and then calls {IERC1363Receiver-onTransferReceived} on `to`.
     * @param to The address which you want to transfer to.
     * @param value The amount of tokens to be transferred.
     * @param data Additional data with no specified format, sent in call to `to`.
     * @return A boolean value indicating whether the operation succeeded unless throwing.
     */
    function transferAndCall(address to, uint256 value, bytes calldata data) external returns (bool);

    /**
     * @dev Moves a `value` amount of tokens from `from` to `to` using the allowance mechanism
     * and then calls {IERC1363Receiver-onTransferReceived} on `to`.
     * @param from The address which you want to send tokens from.
     * @param to The address which you want to transfer to.
     * @param value The amount of tokens to be transferred.
     * @return A boolean value indicating whether the operation succeeded unless throwing.
     */
    function transferFromAndCall(address from, address to, uint256 value) external returns (bool);

    /**
     * @dev Moves a `value` amount of tokens from `from` to `to` using the allowance mechanism
     * and then calls {IERC1363Receiver-onTransferReceived} on `to`.
     * @param from The address which you want to send tokens from.
     * @param to The address which you want to transfer to.
     * @param value The amount of tokens to be transferred.
     * @param data Additional data with no specified format, sent in call to `to`.
     * @return A boolean value indicating whether the operation succeeded unless throwing.
     */
    function transferFromAndCall(address from, address to, uint256 value, bytes calldata data) external returns (bool);

    /**
     * @dev Sets a `value` amount of tokens as the allowance of `spender` over the
     * caller's tokens and then calls {IERC1363Spender-onApprovalReceived} on `spender`.
     * @param spender The address which will spend the funds.
     * @param value The amount of tokens to be spent.
     * @return A boolean value indicating whether the operation succeeded unless throwing.
     */
    function approveAndCall(address spender, uint256 value) external returns (bool);

    /**
     * @dev Sets a `value` amount of tokens as the allowance of `spender` over the
     * caller's tokens and then calls {IERC1363Spender-onApprovalReceived} on `spender`.
     * @param spender The address which will spend the funds.
     * @param value The amount of tokens to be spent.
     * @param data Additional data with no specified format, sent in call to `spender`.
     * @return A boolean value indicating whether the operation succeeded unless throwing.
     */
    function approveAndCall(address spender, uint256 value, bytes calldata data) external returns (bool);
}

// lib/openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol

// OpenZeppelin Contracts (last updated v5.5.0) (token/ERC20/utils/SafeERC20.sol)

/**
 * @title SafeERC20
 * @dev Wrappers around ERC-20 operations that throw on failure (when the token
 * contract returns false). Tokens that return no value (and instead revert or
 * throw on failure) are also supported, non-reverting calls are assumed to be
 * successful.
 * To use this library you can add a `using SafeERC20 for IERC20;` statement to your contract,
 * which allows you to call the safe operations as `token.safeTransfer(...)`, etc.
 */
library SafeERC20 {
    /**
     * @dev An operation with an ERC-20 token failed.
     */
    error SafeERC20FailedOperation(address token);

    /**
     * @dev Indicates a failed `decreaseAllowance` request.
     */
    error SafeERC20FailedDecreaseAllowance(address spender, uint256 currentAllowance, uint256 requestedDecrease);

    /**
     * @dev Transfer `value` amount of `token` from the calling contract to `to`. If `token` returns no value,
     * non-reverting calls are assumed to be successful.
     */
    function safeTransfer(IERC20 token, address to, uint256 value) internal {
        if (!_safeTransfer(token, to, value, true)) {
            revert SafeERC20FailedOperation(address(token));
        }
    }

    /**
     * @dev Transfer `value` amount of `token` from `from` to `to`, spending the approval given by `from` to the
     * calling contract. If `token` returns no value, non-reverting calls are assumed to be successful.
     */
    function safeTransferFrom(IERC20 token, address from, address to, uint256 value) internal {
        if (!_safeTransferFrom(token, from, to, value, true)) {
            revert SafeERC20FailedOperation(address(token));
        }
    }

    /**
     * @dev Variant of {safeTransfer} that returns a bool instead of reverting if the operation is not successful.
     */
    function trySafeTransfer(IERC20 token, address to, uint256 value) internal returns (bool) {
        return _safeTransfer(token, to, value, false);
    }

    /**
     * @dev Variant of {safeTransferFrom} that returns a bool instead of reverting if the operation is not successful.
     */
    function trySafeTransferFrom(IERC20 token, address from, address to, uint256 value) internal returns (bool) {
        return _safeTransferFrom(token, from, to, value, false);
    }

    /**
     * @dev Increase the calling contract's allowance toward `spender` by `value`. If `token` returns no value,
     * non-reverting calls are assumed to be successful.
     *
     * IMPORTANT: If the token implements ERC-7674 (ERC-20 with temporary allowance), and if the "client"
     * smart contract uses ERC-7674 to set temporary allowances, then the "client" smart contract should avoid using
     * this function. Performing a {safeIncreaseAllowance} or {safeDecreaseAllowance} operation on a token contract
     * that has a non-zero temporary allowance (for that particular owner-spender) will result in unexpected behavior.
     */
    function safeIncreaseAllowance(IERC20 token, address spender, uint256 value) internal {
        uint256 oldAllowance = token.allowance(address(this), spender);
        forceApprove(token, spender, oldAllowance + value);
    }

    /**
     * @dev Decrease the calling contract's allowance toward `spender` by `requestedDecrease`. If `token` returns no
     * value, non-reverting calls are assumed to be successful.
     *
     * IMPORTANT: If the token implements ERC-7674 (ERC-20 with temporary allowance), and if the "client"
     * smart contract uses ERC-7674 to set temporary allowances, then the "client" smart contract should avoid using
     * this function. Performing a {safeIncreaseAllowance} or {safeDecreaseAllowance} operation on a token contract
     * that has a non-zero temporary allowance (for that particular owner-spender) will result in unexpected behavior.
     */
    function safeDecreaseAllowance(IERC20 token, address spender, uint256 requestedDecrease) internal {
        unchecked {
            uint256 currentAllowance = token.allowance(address(this), spender);
            if (currentAllowance < requestedDecrease) {
                revert SafeERC20FailedDecreaseAllowance(spender, currentAllowance, requestedDecrease);
            }
            forceApprove(token, spender, currentAllowance - requestedDecrease);
        }
    }

    /**
     * @dev Set the calling contract's allowance toward `spender` to `value`. If `token` returns no value,
     * non-reverting calls are assumed to be successful. Meant to be used with tokens that require the approval
     * to be set to zero before setting it to a non-zero value, such as USDT.
     *
     * NOTE: If the token implements ERC-7674, this function will not modify any temporary allowance. This function
     * only sets the "standard" allowance. Any temporary allowance will remain active, in addition to the value being
     * set here.
     */
    function forceApprove(IERC20 token, address spender, uint256 value) internal {
        if (!_safeApprove(token, spender, value, false)) {
            if (!_safeApprove(token, spender, 0, true)) revert SafeERC20FailedOperation(address(token));
            if (!_safeApprove(token, spender, value, true)) revert SafeERC20FailedOperation(address(token));
        }
    }

    /**
     * @dev Performs an {ERC1363} transferAndCall, with a fallback to the simple {ERC20} transfer if the target has no
     * code. This can be used to implement an {ERC721}-like safe transfer that relies on {ERC1363} checks when
     * targeting contracts.
     *
     * Reverts if the returned value is other than `true`.
     */
    function transferAndCallRelaxed(IERC1363 token, address to, uint256 value, bytes memory data) internal {
        if (to.code.length == 0) {
            safeTransfer(token, to, value);
        } else if (!token.transferAndCall(to, value, data)) {
            revert SafeERC20FailedOperation(address(token));
        }
    }

    /**
     * @dev Performs an {ERC1363} transferFromAndCall, with a fallback to the simple {ERC20} transferFrom if the target
     * has no code. This can be used to implement an {ERC721}-like safe transfer that relies on {ERC1363} checks when
     * targeting contracts.
     *
     * Reverts if the returned value is other than `true`.
     */
    function transferFromAndCallRelaxed(
        IERC1363 token,
        address from,
        address to,
        uint256 value,
        bytes memory data
    ) internal {
        if (to.code.length == 0) {
            safeTransferFrom(token, from, to, value);
        } else if (!token.transferFromAndCall(from, to, value, data)) {
            revert SafeERC20FailedOperation(address(token));
        }
    }

    /**
     * @dev Performs an {ERC1363} approveAndCall, with a fallback to the simple {ERC20} approve if the target has no
     * code. This can be used to implement an {ERC721}-like safe transfer that rely on {ERC1363} checks when
     * targeting contracts.
     *
     * NOTE: When the recipient address (`to`) has no code (i.e. is an EOA), this function behaves as {forceApprove}.
     * Oppositely, when the recipient address (`to`) has code, this function only attempts to call {ERC1363-approveAndCall}
     * once without retrying, and relies on the returned value to be true.
     *
     * Reverts if the returned value is other than `true`.
     */
    function approveAndCallRelaxed(IERC1363 token, address to, uint256 value, bytes memory data) internal {
        if (to.code.length == 0) {
            forceApprove(token, to, value);
        } else if (!token.approveAndCall(to, value, data)) {
            revert SafeERC20FailedOperation(address(token));
        }
    }

    /**
     * @dev Imitates a Solidity `token.transfer(to, value)` call, relaxing the requirement on the return value: the
     * return value is optional (but if data is returned, it must not be false).
     *
     * @param token The token targeted by the call.
     * @param to The recipient of the tokens
     * @param value The amount of token to transfer
     * @param bubble Behavior switch if the transfer call reverts: bubble the revert reason or return a false boolean.
     */
    function _safeTransfer(IERC20 token, address to, uint256 value, bool bubble) private returns (bool success) {
        bytes4 selector = IERC20.transfer.selector;

        assembly ("memory-safe") {
            let fmp := mload(0x40)
            mstore(0x00, selector)
            mstore(0x04, and(to, shr(96, not(0))))
            mstore(0x24, value)
            success := call(gas(), token, 0, 0x00, 0x44, 0x00, 0x20)
            // if call success and return is true, all is good.
            // otherwise (not success or return is not true), we need to perform further checks
            if iszero(and(success, eq(mload(0x00), 1))) {
                // if the call was a failure and bubble is enabled, bubble the error
                if and(iszero(success), bubble) {
                    returndatacopy(fmp, 0x00, returndatasize())
                    revert(fmp, returndatasize())
                }
                // if the return value is not true, then the call is only successful if:
                // - the token address has code
                // - the returndata is empty
                success := and(success, and(iszero(returndatasize()), gt(extcodesize(token), 0)))
            }
            mstore(0x40, fmp)
        }
    }

    /**
     * @dev Imitates a Solidity `token.transferFrom(from, to, value)` call, relaxing the requirement on the return
     * value: the return value is optional (but if data is returned, it must not be false).
     *
     * @param token The token targeted by the call.
     * @param from The sender of the tokens
     * @param to The recipient of the tokens
     * @param value The amount of token to transfer
     * @param bubble Behavior switch if the transfer call reverts: bubble the revert reason or return a false boolean.
     */
    function _safeTransferFrom(
        IERC20 token,
        address from,
        address to,
        uint256 value,
        bool bubble
    ) private returns (bool success) {
        bytes4 selector = IERC20.transferFrom.selector;

        assembly ("memory-safe") {
            let fmp := mload(0x40)
            mstore(0x00, selector)
            mstore(0x04, and(from, shr(96, not(0))))
            mstore(0x24, and(to, shr(96, not(0))))
            mstore(0x44, value)
            success := call(gas(), token, 0, 0x00, 0x64, 0x00, 0x20)
            // if call success and return is true, all is good.
            // otherwise (not success or return is not true), we need to perform further checks
            if iszero(and(success, eq(mload(0x00), 1))) {
                // if the call was a failure and bubble is enabled, bubble the error
                if and(iszero(success), bubble) {
                    returndatacopy(fmp, 0x00, returndatasize())
                    revert(fmp, returndatasize())
                }
                // if the return value is not true, then the call is only successful if:
                // - the token address has code
                // - the returndata is empty
                success := and(success, and(iszero(returndatasize()), gt(extcodesize(token), 0)))
            }
            mstore(0x40, fmp)
            mstore(0x60, 0)
        }
    }

    /**
     * @dev Imitates a Solidity `token.approve(spender, value)` call, relaxing the requirement on the return value:
     * the return value is optional (but if data is returned, it must not be false).
     *
     * @param token The token targeted by the call.
     * @param spender The spender of the tokens
     * @param value The amount of token to transfer
     * @param bubble Behavior switch if the transfer call reverts: bubble the revert reason or return a false boolean.
     */
    function _safeApprove(IERC20 token, address spender, uint256 value, bool bubble) private returns (bool success) {
        bytes4 selector = IERC20.approve.selector;

        assembly ("memory-safe") {
            let fmp := mload(0x40)
            mstore(0x00, selector)
            mstore(0x04, and(spender, shr(96, not(0))))
            mstore(0x24, value)
            success := call(gas(), token, 0, 0x00, 0x44, 0x00, 0x20)
            // if call success and return is true, all is good.
            // otherwise (not success or return is not true), we need to perform further checks
            if iszero(and(success, eq(mload(0x00), 1))) {
                // if the call was a failure and bubble is enabled, bubble the error
                if and(iszero(success), bubble) {
                    returndatacopy(fmp, 0x00, returndatasize())
                    revert(fmp, returndatasize())
                }
                // if the return value is not true, then the call is only successful if:
                // - the token address has code
                // - the returndata is empty
                success := and(success, and(iszero(returndatasize()), gt(extcodesize(token), 0)))
            }
            mstore(0x40, fmp)
        }
    }
}

// src/PerennialVault.sol

/// @title PerennialVault
/// @notice A budget held under rules: the beneficiary spends call by call or is paid on a
///         schedule, the owner keeps a way out, heirs take over when the beneficiary goes
///         silent, and every instruction carries a post-quantum signature.
/// @dev A position's principal is deposited into the yield source and tracked as shares.
///      Yield, and income anyone pays in with `fund`, collect in the position's buffer.
///      Payouts and spends come from the buffer; a position opened in budget mode may also
///      draw on its principal, never more than `payoutAmount` per `payoutInterval` in total.
///      Whatever the buffer holds above its cap is added to the principal.
///      The vault has one asset and one yield source, both fixed at deployment, and no
///      privileged role: nothing can be paused, upgraded or swept.
contract PerennialVault is ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Heir weights are in basis points and must add up to this.
    uint256 public constant BPS = 10_000;
    uint256 public constant MAX_HEIRS = 16;
    /// @notice Domain tag of every signed action, so a signature made for this protocol
    ///         means nothing anywhere else.
    bytes32 public constant ACTION_DOMAIN = keccak256("Perennial.Action");

    /// @notice The actions that need an ML-DSA-87 signature.
    enum Action {
        CheckIn,
        Claim,
        SetHeirs,
        Close,
        Spend
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
        /// @dev Most the buffer keeps after a harvest, claim, distribution, spend or fund; the
        ///      rest is added to the principal. Fixed at opening. Zero compounds everything not
        ///      paid out; type(uint256).max never compounds.
        uint256 bufferCap;
        /// @dev Fixed at opening. When set, spends and payouts may draw on the principal once
        ///      the buffer is empty, and all of them together are limited to `payoutAmount`
        ///      per `payoutInterval`.
        bool budgetMode;
        /// @dev Start of the current budget window (budget mode only).
        uint64 windowStart;
        /// @dev Paid out in the current budget window (budget mode only).
        uint256 windowSpent;
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
        bool budgetMode;
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
    /// @notice The beneficiary paid `amount` from the buffer to `to`. `ref` ties the payment to
    ///         whatever it paid for, such as the hash of a request.
    event Spent(
        uint256 indexed positionId, address indexed to, uint256 amount, bytes32 indexed ref
    );
    /// @notice Buffer above the cap was added to the principal.
    event Compounded(uint256 indexed positionId, uint256 amount);
    /// @notice Someone paid income straight into the position's buffer.
    event Funded(uint256 indexed positionId, address indexed from, uint256 amount);
    /// @notice A budget-mode payout or spend took `amount` from the principal.
    event PrincipalDrawn(uint256 indexed positionId, uint256 amount);

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
    error InsufficientBuffer(uint256 positionId, uint256 available);
    error BudgetNeedsPayoutAmount();
    error BudgetExceeded(uint256 positionId, uint256 remaining);

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
        if (p.budgetMode && p.payoutAmount == 0) revert BudgetNeedsPayoutAmount();

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
        pos.budgetMode = p.budgetMode;
        pos.windowStart = uint64(block.timestamp);

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

    /// @notice Pay income into a position's buffer. Anyone may: a user paying an agent, a
    ///         grant, a revenue share. The buffer cap applies, so whatever lands above it is
    ///         added to the principal.
    function fund(uint256 positionId, uint256 amount) external nonReentrant {
        Position storage pos = _live(positionId);
        if (amount == 0) revert ZeroAmount();

        uint256 balanceBefore = ASSET.balanceOf(address(this));
        ASSET.safeTransferFrom(msg.sender, address(this), amount);
        if (ASSET.balanceOf(address(this)) - balanceBefore != amount) revert UnsupportedToken();
        pos.buffer += amount;
        emit Funded(positionId, msg.sender, amount);
        _compound(positionId, pos);
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

    /// @notice Pay the beneficiary what the schedule owes.
    /// @dev Authorised by the beneficiary's ML-DSA-87 signature, not by the sender, so anyone
    ///      may submit it and the money still goes to the beneficiary. Pending yield is
    ///      harvested first. Without budget mode it pays from the buffer only, and a period
    ///      the buffer cannot fund in full is paid in part and not carried over. In budget mode
    ///      it pays what is left of the current window's budget, from the buffer and then the
    ///      principal.
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
        (paid, periods) = pos.budgetMode ? _settleBudget(positionId, pos) : _settle(positionId, pos);

        _compound(positionId, pos);

        if (paid != 0) ASSET.safeTransfer(pos.beneficiary, paid);
        emit Claimed(positionId, pos.beneficiary, paid, periods);
    }

    /// @notice Pay `amount` from the buffer to `to`, for the purpose `ref` names. This is how
    ///         a beneficiary such as an agent pays for what it uses, call by call.
    /// @dev Authorised by the beneficiary's ML-DSA-87 signature over `(to, amount, ref)`, so
    ///      anyone may relay it and nobody can change where the money goes. Pending yield is
    ///      harvested first. Without budget mode the buffer must cover `amount` and the
    ///      principal is never touched. In budget mode `amount` counts against the window's
    ///      budget and may come from the principal once the buffer is empty. Counts as a
    ///      check-in. Not possible after succession: the heirs are then paid through
    ///      `distribute`.
    function spend(
        uint256 positionId,
        address to,
        uint256 amount,
        bytes32 ref,
        uint256 deadline,
        bytes calldata signature
    ) external nonReentrant {
        Position storage pos = _live(positionId);
        if (pos.succeeded) revert PositionSucceeded(positionId);
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        bytes32 paramsHash = keccak256(abi.encode(to, amount, ref));
        _authorize(positionId, pos, pos.beneficiary, Action.Spend, deadline, paramsHash, signature);
        _recordProofOfLife(positionId, pos);

        _harvest(positionId, pos);
        if (pos.budgetMode) {
            _useBudget(positionId, pos, amount);
            _take(positionId, pos, amount);
        } else {
            if (amount > pos.buffer) revert InsufficientBuffer(positionId, pos.buffer);
            pos.buffer -= amount;
        }
        _compound(positionId, pos);

        ASSET.safeTransfer(to, amount);
        emit Spent(positionId, to, amount, ref);
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
        (uint256 amount, uint256 periods) =
            pos.budgetMode ? _settleBudget(positionId, pos) : _settle(positionId, pos);
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

    /// @notice What a budget-mode position may still pay out in the current window, before
    ///         counting what the buffer and principal hold. Zero for other positions.
    function budgetRemaining(uint256 positionId) external view returns (uint256) {
        Position storage pos = _existing(positionId);
        if (!pos.budgetMode || pos.closed) return 0;
        if (block.timestamp >= uint256(pos.windowStart) + pos.payoutInterval) {
            return pos.payoutAmount;
        }
        return pos.payoutAmount - pos.windowSpent;
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

    /// @dev Moves the budget window forward by whole intervals once the current one is over.
    function _rollWindow(Position storage pos) private {
        uint256 start = pos.windowStart;
        if (block.timestamp < start + pos.payoutInterval) return;
        uint256 intervals = (block.timestamp - start) / pos.payoutInterval;
        pos.windowStart = uint64(start + intervals * pos.payoutInterval);
        pos.windowSpent = 0;
    }

    /// @dev Counts `amount` against the window's budget, refusing what would exceed it.
    function _useBudget(uint256 positionId, Position storage pos, uint256 amount) private {
        _rollWindow(pos);
        uint256 remaining = pos.payoutAmount - pos.windowSpent;
        if (amount > remaining) revert BudgetExceeded(positionId, remaining);
        pos.windowSpent += amount;
    }

    /// @dev Budget mode's payout: whatever is left of the window's budget, as far as the
    ///      buffer and the principal can cover it. Unused budget does not carry over.
    function _settleBudget(uint256 positionId, Position storage pos)
        private
        returns (uint256 amount, uint256 periods)
    {
        _rollWindow(pos);
        uint256 remaining = pos.payoutAmount - pos.windowSpent;
        if (remaining == 0) {
            revert PayoutNotDue(positionId, uint256(pos.windowStart) + pos.payoutInterval);
        }
        uint256 available = pos.buffer + pos.principal;
        amount = remaining < available ? remaining : available;
        pos.windowSpent += amount;
        pos.lastPayout = pos.windowStart;
        periods = 1;
        _take(positionId, pos, amount);
    }

    /// @dev Takes `amount` out of the position: the buffer first, then, in budget mode, the
    ///      principal. The caller has already checked the budget.
    function _take(uint256 positionId, Position storage pos, uint256 amount) private {
        if (amount <= pos.buffer) {
            pos.buffer -= amount;
            return;
        }
        uint256 need = amount - pos.buffer;
        uint256 bufferBefore = pos.buffer;
        pos.buffer = 0;
        if (need > pos.principal) {
            revert InsufficientBuffer(positionId, bufferBefore + pos.principal);
        }

        uint256 shares = SOURCE.previewWithdraw(need);
        bool all = shares >= pos.shares;
        if (all) shares = pos.shares;

        uint256 balanceBefore = ASSET.balanceOf(address(this));
        SOURCE.redeem(shares, address(this), address(this));
        uint256 received = ASSET.balanceOf(address(this)) - balanceBefore;
        // Only a source that has lost value pays less than the principal it is booked at.
        if (received < need) revert InsufficientBuffer(positionId, bufferBefore + received);

        pos.shares -= shares;
        pos.principal = all ? 0 : pos.principal - need;
        // Rounding, or the rest of a fully redeemed principal, stays in the buffer.
        pos.buffer = received - need;
        emit PrincipalDrawn(positionId, need);
    }

    /// @dev Keeps exactly the shares needed to withdraw the principal and redeems the rest.
    ///      `previewWithdraw` rounds up, so rounding always favours the principal.
    function _harvest(uint256 positionId, Position storage pos) private returns (uint256 yield) {
        uint256 keep = SOURCE.previewWithdraw(pos.principal);
        if (pos.shares <= keep) return 0;

        uint256 surplus = pos.shares - keep;
        // Shares worth less than one unit stay put: some ERC-4626 vaults refuse to redeem
        // for zero assets, and a revert here would block every claim, spend and close.
        if (SOURCE.convertToAssets(surplus) == 0) return 0;
        pos.shares = keep;

        uint256 balanceBefore = ASSET.balanceOf(address(this));
        SOURCE.redeem(surplus, address(this), address(this));
        yield = ASSET.balanceOf(address(this)) - balanceBefore;

        pos.buffer += yield;
        emit Harvested(positionId, msg.sender, yield);
    }

    /// @dev Adds whatever the buffer holds above its cap to the principal, depositing it into
    ///      the source. Called after every payout path, so the scheduled payout and a spend
    ///      are taken from the buffer before anything is compounded.
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
