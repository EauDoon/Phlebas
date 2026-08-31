// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.28;

import {TestBase} from "./TestBase.sol";
import {PZec} from "../src/token/PZec.sol";
import {QuoteToken} from "../src/token/QuoteToken.sol";
import {Factory} from "../src/amm/Factory.sol";
import {Pair} from "../src/amm/Pair.sol";
import {Router} from "../src/amm/Router.sol";
import {Settlement} from "../src/Settlement.sol";

contract PhlebasTest is TestBase {
    uint256 internal constant MAKER_KEY = 0xA11CE;
    uint256 internal constant TAKER_KEY = 0xB0B;

    PZec internal pzec;
    QuoteToken internal usdc;
    QuoteToken internal usdt;
    Factory internal factory;
    Pair internal pair;
    Router internal router;
    Settlement internal settlement;
    address internal maker;
    address internal taker;

    function setUp() public {
        maker = vm.addr(MAKER_KEY);
        taker = vm.addr(TAKER_KEY);
        pzec = new PZec(address(this), address(this), address(this));
        usdc = new QuoteToken("Phlebas Testnet USDC", "tUSDC");
        usdt = new QuoteToken("Phlebas Testnet USDT", "tUSDT");
        factory = new Factory(address(pzec), address(usdc), address(usdt));
        pair = Pair(factory.createPair(address(usdc)));
        factory.createPair(address(usdt));
        router = new Router(factory, address(this), address(this));
        settlement = new Settlement(
            address(pzec),
            address(usdc),
            address(usdt),
            address(this),
            address(this),
            address(this)
        );
        pzec.mint(maker, 100e8);
        pzec.mint(taker, 100e8);
        pzec.mint(address(this), 50e8);
        vm.prank(maker);
        usdc.faucet(10_000e6);
        vm.prank(taker);
        usdc.faucet(10_000e6);
        usdc.faucet(10_000e6);
    }

    function testTypehashesMatchTypescript() public view {
        assertEq(
            settlement.DOMAIN_TYPEHASH(),
            bytes32(0x8b73c3c69bb8fe3d512ecc4cf759cc79239f7b179b0ffacaa9a75d522b39400f)
        );
        assertEq(
            settlement.ORDER_TYPEHASH(),
            bytes32(0x500d62235725032be08d01f5a4aa11a96e771d40267bdf234cbf9dc51399cc24)
        );
    }

    function testStructHashMatchesTypescriptVector() public view {
        Settlement.Order memory order = Settlement.Order({
            maker: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266,
            side: 0,
            baseAsset: address(1),
            quoteAsset: address(2),
            baseAmount: 100_000_000,
            limitPriceTicks: 5291,
            nonce: 1,
            accountEpoch: 0,
            expiry: 0,
            salt: 1,
            recipient: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266,
            maximumFeeBps: 30,
            allowedVenues: 1
        });
        assertEq(
            settlement.hashOrder(order),
            bytes32(0x7dec6a8eea90d206d60f03afeb1576724c542c1f118535c875003e6719c6c334)
        );
    }

    function testSettleSelectorMatchesTypescript() public pure {
        bytes4 selector = bytes4(
            keccak256(
                "settle((address,uint8,address,address,uint128,uint128,uint64,uint64,uint64,uint256,address,uint16,uint8),bytes,(address,uint8,address,address,uint128,uint128,uint64,uint64,uint64,uint256,address,uint16,uint8),bytes,uint128)"
            )
        );
        assertEq(uint256(uint32(selector)), uint256(0xf753db5f));
    }

    function testZecTokenNameAndSymbol() public view {
        assertEq(pzec.name(), "Phlebas Testnet ZEC");
        assertEq(pzec.symbol(), "tZEC");
        assertEq(uint256(pzec.decimals()), 8);
    }

    function testPzecMinterAndPauseBoundaries() public {
        vm.prank(taker);
        vm.expectRevert(PZec.NotMinter.selector);
        pzec.mint(taker, 1);
        pzec.pauseMint();
        vm.expectRevert(PZec.MintPaused.selector);
        pzec.mint(taker, 1);
        vm.prank(taker);
        vm.expectRevert(PZec.NotGovernor.selector);
        pzec.unpauseMint();
        pzec.unpauseMint();
        pzec.mint(taker, 1);
    }

    function testFactoryRejectsThirdPair() public {
        QuoteToken extra = new QuoteToken("nope", "NOPE");
        vm.expectRevert(Factory.PairNotAllowed.selector);
        factory.createPair(address(extra));
        vm.expectRevert(Factory.PairExists.selector);
        factory.createPair(address(usdc));
    }

    function testAmmMintSwapBurnAndK() public {
        pzec.approve(address(router), type(uint256).max);
        usdc.approve(address(router), type(uint256).max);
        uint256 shares = router.addLiquidity(address(usdc), 10e8, 5_291e6, address(this), block.timestamp + 60);
        assertGt(shares, 0);
        uint256 out = router.swapExactIn(address(pzec), address(usdc), 1e8, 1, address(this), block.timestamp + 60);
        assertGt(out, 0);
        (uint256 reservePzec, uint256 reserveQuote) = pair.getReserves();
        assertGt(reservePzec * reserveQuote, 10e8 * 5_291e6);
        pair.approve(address(router), shares / 2);
        (uint256 backPzec,) = router.removeLiquidity(address(usdc), shares / 2, 1, 1, address(this), block.timestamp + 60);
        assertGt(backPzec, 0);
        assertEq(pzec.balanceOf(address(router)), 0);
        assertEq(usdc.balanceOf(address(router)), 0);
    }

    function testSettlementFillTransfersAndFees() public {
        Settlement.Order memory sell = _order(maker, 1, 2e8, 5291, 1);
        Settlement.Order memory buy = _order(taker, 0, 2e8, 5300, 2);
        vm.prank(maker);
        pzec.approve(address(settlement), type(uint256).max);
        vm.prank(taker);
        usdc.approve(address(settlement), type(uint256).max);

        uint128 fill = 1e8;
        uint256 sellerQuoteBefore = usdc.balanceOf(maker);
        uint256 buyerPzecBefore = pzec.balanceOf(taker);
        settlement.settle(sell, _sign(MAKER_KEY, settlement.digest(sell)), buy, _sign(TAKER_KEY, settlement.digest(buy)), fill);
        assertEq(pzec.balanceOf(taker) - buyerPzecBefore, fill);
        assertGt(usdc.balanceOf(maker), sellerQuoteBefore);
        assertGt(usdc.balanceOf(address(this)), 0);
        assertEq(settlement.filled(settlement.hashOrder(sell)), fill);
    }

    function testNonceCancelFlag() public {
        vm.prank(maker);
        settlement.cancelNonce(9);
        require(settlement.nonceCanceled(maker, 9), "not flagged");
    }

    function testCancelAndEpochReject() public {
        Settlement.Order memory sell = _order(maker, 1, 1e8, 5291, 9);
        Settlement.Order memory buy = _order(taker, 0, 1e8, 5291, 10);
        vm.prank(maker);
        pzec.approve(address(settlement), type(uint256).max);
        vm.prank(taker);
        usdc.approve(address(settlement), type(uint256).max);
        vm.prank(maker);
        settlement.cancelNonce(9);
        bytes memory sellSig = _sign(MAKER_KEY, settlement.digest(sell));
        bytes memory buySig = _sign(TAKER_KEY, settlement.digest(buy));
        vm.expectRevert(Settlement.Canceled.selector);
        settlement.settle(sell, sellSig, buy, buySig, 1e8);

        Settlement.Order memory sell2 = _order(maker, 1, 1e8, 5291, 11);
        bytes memory sell2Sig = _sign(MAKER_KEY, settlement.digest(sell2));
        vm.prank(maker);
        settlement.incrementEpoch();
        vm.expectRevert(Settlement.Epoch.selector);
        settlement.settle(sell2, sell2Sig, buy, buySig, 1e8);
    }

    function testEmergencyPauseCannotUnpause() public {
        settlement.pause();
        vm.prank(taker);
        vm.expectRevert(Settlement.NotGovernor.selector);
        settlement.unpause();
        router.pause();
        vm.expectRevert(Router.Paused.selector);
        router.swapExactIn(address(pzec), address(usdc), 1, 1, taker, block.timestamp + 1);
    }

    function testQuoteRoundingBuyerUpSellerDown() public view {
        assertEq(settlement.quoteDown(1, 5291), 0);
        assertEq(settlement.quoteUp(1, 5291), 1);
        assertEq(settlement.quoteDown(100_000_000, 5291), 52_910_000);
        assertEq(settlement.quoteUp(100_000_000, 5291), 52_910_000);
    }

    function _order(address who, uint8 side, uint128 amount, uint128 ticks, uint64 nonce)
        internal
        view
        returns (Settlement.Order memory)
    {
        return Settlement.Order({
            maker: who,
            side: side,
            baseAsset: address(pzec),
            quoteAsset: address(usdc),
            baseAmount: amount,
            limitPriceTicks: ticks,
            nonce: nonce,
            accountEpoch: settlement.epoch(who),
            expiry: 0,
            salt: 1,
            recipient: who,
            maximumFeeBps: 30,
            allowedVenues: 1
        });
    }

    function _sign(uint256 key, bytes32 hashed) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, hashed);
        return abi.encodePacked(r, s, v);
    }
}
