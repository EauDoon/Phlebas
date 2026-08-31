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
    function run() external returns (address settlement, address zec, address factory, address router) {
        address deployer = vm.envAddress("PHLEBAS_DEPLOYER");
        vm.startBroadcast(deployer);
        Zec zecToken = new Zec(deployer, deployer, deployer);
        QuoteToken usdc = new QuoteToken("Phlebas Testnet USDC", "tUSDC");
        QuoteToken usdt = new QuoteToken("Phlebas Testnet USDT", "tUSDT");
        Factory factoryContract = new Factory(address(zecToken), address(usdc), address(usdt));
        factoryContract.createPair(address(usdc));
        factoryContract.createPair(address(usdt));
        Router routerContract = new Router(factoryContract, deployer, deployer);
        Settlement settlementContract = new Settlement(
            address(zecToken),
            address(usdc),
            address(usdt),
            deployer,
            deployer,
            deployer
        );
        vm.stopBroadcast();
        return (address(settlementContract), address(zecToken), address(factoryContract), address(routerContract));
    }
}
