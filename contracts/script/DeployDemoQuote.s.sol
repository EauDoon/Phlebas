// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.28;

import {ScriptBase} from "./Cheatcodes.sol";
import {QuoteToken} from "../src/token/QuoteToken.sol";

/// @notice Local demo quote token. Only for simulated chains.
contract DeployDemoQuote is ScriptBase {
    function run() external returns (address quote) {
        string memory name = vm.envString("DEMO_QUOTE_NAME");
        string memory symbol = vm.envString("DEMO_QUOTE_SYMBOL");
        address deployer = vm.envAddress("PHLEBAS_DEPLOYER");
        vm.startBroadcast(deployer);
        QuoteToken token = new QuoteToken(name, symbol);
        vm.stopBroadcast();
        quote = address(token);
    }
}
