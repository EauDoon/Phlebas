// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {TestBase} from "../test/TestBase.sol";
import {PZec} from "../src/token/PZec.sol";
import {QuoteToken} from "../src/token/QuoteToken.sol";
import {Factory} from "../src/amm/Factory.sol";
import {Router} from "../src/amm/Router.sol";
import {Settlement} from "../src/Settlement.sol";

/// @notice Arbitrum Sepolia no-value deploy. Does not configure mainnet.
contract DeployTestnet is TestBase {
    function run() external {
        address deployer = vm.envAddress("PHLEBAS_DEPLOYER");
        vm.startBroadcast(deployer);
        PZec pzec = new PZec(deployer, deployer, deployer);
        QuoteToken usdc = new QuoteToken("Phlebas Testnet USDC", "tUSDC");
        QuoteToken usdt0 = new QuoteToken("Phlebas Testnet USDT0", "tUSDT0");
        Factory factory = new Factory(address(pzec), address(usdc), address(usdt0));
        factory.createPair(address(usdc));
        factory.createPair(address(usdt0));
        Router router = new Router(factory, deployer, deployer);
        Settlement settlement = new Settlement(
            address(pzec),
            address(usdc),
            address(usdt0),
            deployer,
            deployer,
            deployer
        );
        vm.stopBroadcast();
        vm.serializeAddress("deploy", "PZec", address(pzec));
        vm.serializeAddress("deploy", "TUsdc", address(usdc));
        vm.serializeAddress("deploy", "TUsdt0", address(usdt0));
        vm.serializeAddress("deploy", "Factory", address(factory));
        vm.serializeAddress("deploy", "PzecUsdcPair", factory.getPair(address(pzec), address(usdc)));
        vm.serializeAddress("deploy", "PzecUsdt0Pair", factory.getPair(address(pzec), address(usdt0)));
        vm.serializeAddress("deploy", "Router", address(router));
        vm.serializeAddress("deploy", "Settlement", address(settlement));
    }
}
