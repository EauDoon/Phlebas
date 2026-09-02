// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.28;

import {ScriptBase} from "./Cheatcodes.sol";
import {Settlement} from "../src/Settlement.sol";

/// @notice Ethereum Mainnet settlement deploy. Moves real value.
///
/// Environment inputs (all required, all owned by you):
///   PHLEBAS_DEPLOYER      funded EOA that broadcasts. Keep this key offline
///                         and pass it only via a local keystore/cleartext
///                         profile you control. Never commit it anywhere.
///   PHLEBAS_ZEC_TOKEN     address of the ZEC-representing ERC-20 the CLOB
///                         settles for the base leg. This is a product
///                         decision: pick a token you have vetted (or one
///                         you deploy and govern yourself). The contract
///                         requires code at this address.
///   PHLEBAS_FEE_RECIPIENT fee destination.
///   PHLEBAS_PAUSER        pause role. Must be an operationally reachable key.
///   PHLEBAS_GOVERNOR      unpause role. Distinct from the pauser on purpose.
///
/// USDC and USDT are pinned to the canonical Ethereum Mainnet deployments.
contract DeployMainnet is ScriptBase {
    error InvalidEnvironment();

    address internal constant USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
    address internal constant USDT = 0xdAC17F958D2ee523a2206206994597C13D831ec7;

    function run() external returns (address settlement) {
        address deployer = vm.envAddress("PHLEBAS_DEPLOYER");
        address zecToken = vm.envAddress("PHLEBAS_ZEC_TOKEN");
        address feeRecipient = vm.envAddress("PHLEBAS_FEE_RECIPIENT");
        address pauser = vm.envAddress("PHLEBAS_PAUSER");
        address governor = vm.envAddress("PHLEBAS_GOVERNOR");

        if (
            deployer == address(0) || zecToken == address(0) || feeRecipient == address(0) || pauser == address(0)
                || governor == address(0)
        ) revert InvalidEnvironment();
        if (zecToken == USDC || zecToken == USDT) revert InvalidEnvironment();
        if (pauser == governor || pauser == feeRecipient || governor == feeRecipient) revert InvalidEnvironment();
        if (zecToken.code.length == 0 || USDC.code.length == 0 || USDT.code.length == 0) revert InvalidEnvironment();

        vm.startBroadcast(deployer);
        Settlement settlementContract = new Settlement(zecToken, USDC, USDT, feeRecipient, pauser, governor);
        vm.stopBroadcast();
        settlement = address(settlementContract);
    }
}
