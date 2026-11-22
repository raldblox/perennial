// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {MockYieldSource} from "../src/mocks/MockYieldSource.sol";

/// @notice Takes back a test source's reserve that no depositor is owed. Only the source's
///         deployer (`FUNDER`) can, and only the surplus.
/// @dev Needs an open EVM window, like the deploy script.
///
///      Environment:
///        SOURCE          the MockYieldSource
///        AMOUNT          how much to take back (default: all of `surplus()`)
///        PRIVATE_KEY or QORE_MNEMONIC, as for the deploy script
contract Reclaim is Script {
    function run() external returns (uint256 amount) {
        uint256 key = vm.envOr("PRIVATE_KEY", uint256(0));
        if (key == 0) key = vm.deriveKey(vm.envString("QORE_MNEMONIC"), 0);
        MockYieldSource source = MockYieldSource(vm.envAddress("SOURCE"));
        address funder = vm.addr(key);
        require(source.FUNDER() == funder, "not this source's funder");

        amount = vm.envOr("AMOUNT", source.surplus());
        require(amount != 0, "nothing to reclaim");
        console.log("Reclaiming:", amount);

        vm.startBroadcast(key);
        source.reclaim(amount, funder);
        vm.stopBroadcast();
    }
}
