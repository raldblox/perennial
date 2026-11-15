// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PerennialVault} from "../src/PerennialVault.sol";
import {MockYieldSource} from "../src/mocks/MockYieldSource.sol";
import {IYieldSource} from "../src/interfaces/IYieldSource.sol";

/// @notice Deploys a PerennialVault on the QoreChain testnet.
/// @dev The sender needs a registered ML-DSA-87 key and a live EVM authorisation window
///      first (`pnpm window register`, `pnpm window open`).
///
///      Environment:
///        PRIVATE_KEY     deployer key, or
///        QORE_MNEMONIC   the deployer's BIP-39 mnemonic (account m/44'/60'/0'/0/0), used
///                        when PRIVATE_KEY is unset or left as the zero placeholder
///        ASSET           token the vault holds (default: testnet fUSD)
///        YIELD_SOURCE    an existing ERC-4626-style source for ASSET; when unset, a
///                        MockYieldSource is deployed
///        MOCK_RATE       yearly rate of the mock source, 18 decimals (default 0.05e18)
///        MOCK_RESERVE    ASSET units to move from the deployer into the mock's reserve,
///                        from which it pays its simulated yield (default 0)
contract Deploy is Script {
    address internal constant PQC_VERIFY = 0x0000000000000000000000000000000000000a01;
    address internal constant PQC_KEY_STATUS = 0x0000000000000000000000000000000000000a02;
    address internal constant TESTNET_FUSD = 0x97143B771D34ddb9130b807b135Ae675A5a963CA;

    function run() external returns (PerennialVault vault, IYieldSource source) {
        uint256 deployerKey = _deployerKey();
        IERC20 asset = IERC20(vm.envOr("ASSET", TESTNET_FUSD));
        address existingSource = vm.envOr("YIELD_SOURCE", address(0));
        uint256 mockRate = vm.envOr("MOCK_RATE", uint256(0.05e18));
        uint256 mockReserve = vm.envOr("MOCK_RESERVE", uint256(0));

        _requirePrecompiles();
        _standInForSimulation();

        vm.startBroadcast(deployerKey);
        if (existingSource == address(0)) {
            MockYieldSource mock = new MockYieldSource(asset, mockRate);
            if (mockReserve != 0) {
                asset.approve(address(mock), mockReserve);
                mock.fund(mockReserve);
            }
            source = mock;
            console.log("MockYieldSource:", address(mock));
        } else {
            source = IYieldSource(existingSource);
            console.log("Yield source (existing):", existingSource);
        }
        vault = new PerennialVault(asset, source);
        vm.stopBroadcast();

        console.log("PerennialVault:", address(vault));
        console.log("Asset:", address(asset));
    }

    /// @dev Foundry runs the script on its own copy of the chain first, and that copy has
    ///      no QoreChain precompiles, so the vault's constructor check would fail there.
    ///      Only for that local run, answer at the precompile addresses the way the chain
    ///      does for an unknown account. `_requirePrecompiles` has already confirmed the
    ///      real ones are active; the broadcast transactions run against those.
    function _standInForSimulation() internal {
        if (PQC_KEY_STATUS.code.length == 0) {
            vm.etch(PQC_KEY_STATUS, type(KeyStatusStandIn).runtimeCode);
        }
        if (PQC_VERIFY.code.length == 0) vm.etch(PQC_VERIFY, type(VerifyStandIn).runtimeCode);
    }

    function _deployerKey() internal view returns (uint256 key) {
        key = vm.envOr("PRIVATE_KEY", uint256(0));
        if (key == 0) key = vm.deriveKey(vm.envString("QORE_MNEMONIC"), 0);
    }

    /// @dev An inactive precompile answers with empty data. Stop before deploying a vault
    ///      that could never authorise anything. Foundry simulates the script on its own
    ///      EVM, which has no such precompile, so the question goes to the node itself.
    function _requirePrecompiles() internal {
        bytes memory callData = abi.encodeWithSignature("pqcKeyStatus(address)", address(1));
        string memory params = string.concat(
            '[{"to":"',
            vm.toString(PQC_KEY_STATUS),
            '","data":"',
            vm.toString(callData),
            '"},"latest"]'
        );
        bytes memory ret = vm.rpc("eth_call", params);
        require(ret.length >= 160, "PQC key status precompile is not active on this chain");
    }
}

/// @dev Simulation-only stand-in: an account with no registered key.
contract KeyStatusStandIn {
    fallback(bytes calldata) external returns (bytes memory) {
        return abi.encode(false, uint8(0), bytes(""), false);
    }
}

/// @dev Simulation-only stand-in: no signature verifies.
contract VerifyStandIn {
    fallback(bytes calldata) external returns (bytes memory) {
        return abi.encode(false);
    }
}
