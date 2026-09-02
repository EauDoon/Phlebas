// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.28;

import {ScriptBase} from "./Cheatcodes.sol";
import {Zec} from "../src/token/Zec.sol";

/// @notice Local demo stand-in for the base-leg token. Only for simulated chains.
contract DeployDemoZec is ScriptBase {
    function run() external returns (address zec) {
        address minter = vm.envAddress("PHLEBAS_MINTER");
        address pauser = vm.envAddress("PHLEBAS_PAUSER");
        address governor = vm.envAddress("PHLEBAS_GOVERNOR");
        vm.startBroadcast(minter);
        Zec zecToken = new Zec(minter, pauser, governor);
        vm.stopBroadcast();
        zec = address(zecToken);
    }
}
