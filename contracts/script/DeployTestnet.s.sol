// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.28;

import {ScriptBase} from "./Cheatcodes.sol";
import {Zec} from "../src/token/Zec.sol";
import {QuoteToken} from "../src/token/QuoteToken.sol";
import {Factory} from "../src/amm/Factory.sol";
import {Router} from "../src/amm/Router.sol";
import {Settlement} from "../src/Settlement.sol";

/// @notice Arbitrum Sepolia no-value deploy. Does not configure mainnet.
/// @dev Foundry writes `broadcast/` on --broadcast. Do not flip infra/testnet/arbitrum-sepolia.json
///      `deployed` to true from this script. Use `node scripts/record-sepolia-deploy.mjs` after a real tx.
contract DeployTestnet is ScriptBase {
    error InvalidRoles();

    function run() external returns (address settlement, address zec, address factory, address router) {
        address deployer = vm.envAddress("PHLEBAS_DEPLOYER");
        address minter = vm.envAddress("PHLEBAS_MINTER");
        address pauser = vm.envAddress("PHLEBAS_PAUSER");
        address governor = vm.envAddress("PHLEBAS_GOVERNOR");
        address feeRecipient = vm.envAddress("PHLEBAS_FEE_RECIPIENT");
        _assertDistinctRoles([deployer, minter, pauser, governor, feeRecipient]);
        vm.startBroadcast(deployer);
        Zec zecToken = new Zec(minter, pauser, governor);
        QuoteToken usdc = new QuoteToken("Phlebas Testnet USDC", "tUSDC");
        QuoteToken usdt = new QuoteToken("Phlebas Testnet USDT", "tUSDT");
        Factory factoryContract = new Factory(address(zecToken), address(usdc), address(usdt));
        factoryContract.createPair(address(usdc));
        factoryContract.createPair(address(usdt));
        Router routerContract = new Router(factoryContract, pauser, governor);
        Settlement settlementContract =
            new Settlement(address(zecToken), address(usdc), address(usdt), feeRecipient, pauser, governor);
        vm.stopBroadcast();
        return (address(settlementContract), address(zecToken), address(factoryContract), address(routerContract));
    }

    function _assertDistinctRoles(address[5] memory roles) private pure {
        for (uint256 i; i < roles.length; i++) {
            if (roles[i] == address(0)) revert InvalidRoles();
            for (uint256 j = i + 1; j < roles.length; j++) {
                if (roles[i] == roles[j]) revert InvalidRoles();
            }
        }
    }
}
