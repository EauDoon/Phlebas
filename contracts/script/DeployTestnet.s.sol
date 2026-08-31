// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.28;

import {ScriptBase} from "./Cheatcodes.sol";
import {PZec} from "../src/token/PZec.sol";
import {QuoteToken} from "../src/token/QuoteToken.sol";
import {Factory} from "../src/amm/Factory.sol";
import {Router} from "../src/amm/Router.sol";
import {Settlement} from "../src/Settlement.sol";

/// @notice Arbitrum Sepolia no-value deploy. Does not configure mainnet.
/// @dev Foundry writes `broadcast/` on --broadcast. Do not flip infra/testnet/arbitrum-sepolia.json
///      `deployed` to true from this script. Use `node scripts/record-sepolia-deploy.mjs` after a real tx.
contract DeployTestnet is ScriptBase {
    function run() external returns (address settlement, address pzec, address factory, address router) {
        address deployer = vm.envAddress("PHLEBAS_DEPLOYER");
        vm.startBroadcast(deployer);
        PZec pzecToken = new PZec(deployer, deployer, deployer);
        QuoteToken usdc = new QuoteToken("Phlebas Testnet USDC", "tUSDC");
        QuoteToken usdt0 = new QuoteToken("Phlebas Testnet USDT0", "tUSDT0");
        Factory factoryContract = new Factory(address(pzecToken), address(usdc), address(usdt0));
        factoryContract.createPair(address(usdc));
        factoryContract.createPair(address(usdt0));
        Router routerContract = new Router(factoryContract, deployer, deployer);
        Settlement settlementContract = new Settlement(
            address(pzecToken),
            address(usdc),
            address(usdt0),
            deployer,
            deployer,
            deployer
        );
        vm.stopBroadcast();
        return (address(settlementContract), address(pzecToken), address(factoryContract), address(routerContract));
    }
}
