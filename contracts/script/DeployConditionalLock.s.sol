// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.28;

import {ScriptBase} from "./Cheatcodes.sol";
import {ConditionalLock} from "../src/swap/ConditionalLock.sol";

/// @notice Local-Anvil or testnet deploy of the EVM half of the atomic swap.
///         Does not configure mainnet. Does not touch any custody, mint, or
///         reserve contract. Records the deployed address for the testnet
///         manifest; does not flip the manifest `deployed` flag.
/// @dev    Foundry writes `broadcast/` on `--broadcast`. The script never
///         reads or writes the manifest itself; the operator runs
///         `node scripts/record-sepolia-deploy.mjs` after a real tx.
contract DeployConditionalLock is ScriptBase {
    error InvalidRoles();

    function run() external returns (address conditionalLock) {
        address usdc = vm.envAddress("PHLEBAS_USDC");
        address usdt0 = vm.envAddress("PHLEBAS_USDT0");
        address pauser = vm.envAddress("PHLEBAS_PAUSER");
        address governor = vm.envAddress("PHLEBAS_GOVERNOR");
        _assertDistinctRoles([usdc, usdt0, pauser, governor]);
        vm.startBroadcast();
        ConditionalLock lock = new ConditionalLock(usdc, usdt0, pauser, governor);
        vm.stopBroadcast();
        return address(lock);
    }

    function _assertDistinctRoles(address[4] memory roles) private pure {
        for (uint256 i; i < roles.length; i++) {
            if (roles[i] == address(0)) revert InvalidRoles();
            for (uint256 j = i + 1; j < roles.length; j++) {
                if (roles[i] == roles[j]) revert InvalidRoles();
            }
        }
    }
}
