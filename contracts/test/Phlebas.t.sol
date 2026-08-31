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
    uint256 internal constant CURVE_ORDER = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141;

    PZec internal pzec;
    QuoteToken internal usdc;
    QuoteToken internal usdt0;
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
        usdt0 = new QuoteToken("Phlebas Testnet USDT0", "tUSDT0");
        factory = new Factory(address(pzec), address(usdc), address(usdt0));
        pair = Pair(factory.createPair(address(usdc)));
        factory.createPair(address(usdt0));
        router = new Router(factory, address(this), address(this));
        settlement =
            new Settlement(address(pzec), address(usdc), address(usdt0), address(this), address(this), address(this));
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
            settlement.DOMAIN_TYPEHASH(), bytes32(0x8b73c3c69bb8fe3d512ecc4cf759cc79239f7b179b0ffacaa9a75d522b39400f)
        );
        assertEq(
            settlement.ORDER_TYPEHASH(), bytes32(0x59d262d3dfbfd89c25b7ee0d870e5189eeea097456890c5d4769de7efefef4e8)
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
            timeInForce: 0,
            nonce: 1,
            accountEpoch: 0,
            expiry: 0,
            salt: 1,
            recipient: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266,
            maximumFeeBps: 30,
            allowedVenues: 1
        });
        assertEq(
            settlement.hashOrder(order), bytes32(0x78d7cf7804add8ba16e86edaba899f9ea37df1d536de8dd19091f5f09c035120)
        );
    }

    function testSettleSelectorMatchesTypescript() public pure {
        bytes4 selector = bytes4(
            keccak256(
                "settle((address,uint8,address,address,uint128,uint128,uint8,uint64,uint64,uint64,uint256,address,uint16,uint8),bytes,(address,uint8,address,address,uint128,uint128,uint8,uint64,uint64,uint64,uint256,address,uint16,uint8),bytes,uint128)"
            )
        );
        assertEq(uint256(uint32(selector)), uint256(0xce5594a1));
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
        uint256 maxSupply = pzec.MAX_SUPPLY();
        vm.expectRevert(PZec.SupplyCap.selector);
        pzec.mint(taker, maxSupply);
    }

    function testFactoryRejectsThirdPair() public {
        QuoteToken extra = new QuoteToken("nope", "NOPE");
        vm.expectRevert(Factory.PairNotAllowed.selector);
        factory.createPair(address(extra));
        vm.expectRevert(Factory.PairExists.selector);
        factory.createPair(address(usdc));
    }

    function testFactoryCountsPairsIndependentOfCreationOrder() public {
        Factory fresh = new Factory(address(pzec), address(usdc), address(usdt0));
        address first = fresh.createPair(address(usdt0));
        assertEq(fresh.allPairsLength(), 1);
        assertEq(fresh.allPairs(0), first);
        fresh.createPair(address(usdc));
        assertEq(fresh.allPairsLength(), 2);
    }

    function testAmmMintSwapBurnAndK() public {
        pzec.approve(address(router), type(uint256).max);
        usdc.approve(address(router), type(uint256).max);
        uint256 shares = router.addLiquidity(address(usdc), 10e8, 5_291e6, 1, address(this), block.timestamp + 60);
        assertGt(shares, 0);
        assertEq(pair.balanceOf(pair.MINIMUM_LIQUIDITY_HOLDER()), pair.MINIMUM_LIQUIDITY());
        uint256 out = router.swapExactIn(address(pzec), address(usdc), 1e8, 1, address(this), block.timestamp + 60);
        assertGt(out, 0);
        (uint256 reservePzec, uint256 reserveQuote) = pair.getReserves();
        assertGt(reservePzec * reserveQuote, 10e8 * 5_291e6);
        pair.approve(address(router), shares / 2);
        (uint256 backPzec,) =
            router.removeLiquidity(address(usdc), shares / 2, 1, 1, address(this), block.timestamp + 60);
        assertGt(backPzec, 0);
        assertEq(pzec.balanceOf(address(router)), 0);
        assertEq(usdc.balanceOf(address(router)), 0);
    }

    function testAmmMintUsesBothAssetsAndEnforcesMinimumShares() public {
        pzec.approve(address(router), type(uint256).max);
        usdc.approve(address(router), type(uint256).max);
        vm.expectRevert(Router.Slippage.selector);
        router.addLiquidity(address(usdc), 10e8, 5_291e6, type(uint256).max, address(this), block.timestamp + 60);

        uint256 first = router.addLiquidity(address(usdc), 10e8, 5_291e6, 1, address(this), block.timestamp + 60);
        uint256 second = router.addLiquidity(address(usdc), 1e8, 1e6, 1, address(this), block.timestamp + 60);
        assertGt(first / 100, second);
    }

    function testAmmBurnIncludesDirectDonations() public {
        pzec.approve(address(router), type(uint256).max);
        usdc.approve(address(router), type(uint256).max);
        uint256 shares = router.addLiquidity(address(usdc), 10e8, 5_291e6, 1, address(this), block.timestamp + 60);
        pzec.transfer(address(pair), 1e8);
        usdc.transfer(address(pair), 100e6);
        pair.approve(address(router), shares);
        (uint256 outPzec, uint256 outQuote) =
            router.removeLiquidity(address(usdc), shares, 1, 1, address(this), block.timestamp + 60);
        assertGt(outPzec, 10e8);
        assertGt(outQuote, 5_291e6);
    }

    function testAmmSyncAccountsForDirectDonations() public {
        pzec.approve(address(router), type(uint256).max);
        usdc.approve(address(router), type(uint256).max);
        router.addLiquidity(address(usdc), 10e8, 5_291e6, 1, address(this), block.timestamp + 60);
        pzec.transfer(address(pair), 1e8);
        pair.sync();
        (uint256 reservePzec, uint256 reserveQuote) = pair.getReserves();
        assertEq(reservePzec, 11e8);
        assertEq(reserveQuote, 5_291e6);
    }

    function testFuzzAmmSwapNeverLowersK(uint96 rawAmount) public {
        pzec.approve(address(router), type(uint256).max);
        usdc.approve(address(router), type(uint256).max);
        router.addLiquidity(address(usdc), 10e8, 5_291e6, 1, address(this), block.timestamp + 60);
        (uint256 beforePzec, uint256 beforeQuote) = pair.getReserves();
        uint256 amount = (uint256(rawAmount) % 10e8) + 1;
        router.swapExactIn(address(pzec), address(usdc), amount, 1, address(this), block.timestamp + 60);
        (uint256 afterPzec, uint256 afterQuote) = pair.getReserves();
        require(afterPzec * afterQuote >= beforePzec * beforeQuote, "k decreased");
    }

    function testFuzzQuoteRoundingConserves(uint128 size, uint128 ticks) public view {
        if (size == 0 || ticks == 0) return;
        uint256 numerator = uint256(size) * uint256(ticks);
        uint256 down = settlement.quoteDown(size, ticks);
        uint256 up = settlement.quoteUp(size, ticks);
        require(down <= up && up - down <= 1, "rounding gap");
        require(down * settlement.QUOTE_COST_DIVISOR() <= numerator, "down rounded up");
        require(up * settlement.QUOTE_COST_DIVISOR() >= numerator, "up rounded down");
    }

    function testLiquidityRemovalStaysAvailableDuringTradingPause() public {
        pzec.approve(address(router), type(uint256).max);
        usdc.approve(address(router), type(uint256).max);
        uint256 shares = router.addLiquidity(address(usdc), 10e8, 5_291e6, 1, address(this), block.timestamp + 60);
        pair.approve(address(router), shares);
        router.pause();
        (uint256 outPzec, uint256 outQuote) =
            router.removeLiquidity(address(usdc), shares, 1, 1, address(this), block.timestamp + 60);
        assertGt(outPzec, 0);
        assertGt(outQuote, 0);
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
        uint256 buyerQuoteBefore = usdc.balanceOf(taker);
        uint256 feeQuoteBefore = usdc.balanceOf(address(this));
        uint256 buyerPzecBefore = pzec.balanceOf(taker);
        settlement.settle(
            sell, _sign(MAKER_KEY, settlement.digest(sell)), buy, _sign(TAKER_KEY, settlement.digest(buy)), fill
        );
        assertEq(pzec.balanceOf(taker) - buyerPzecBefore, fill);
        assertEq(usdc.balanceOf(maker) - sellerQuoteBefore, 52_883_545);
        assertEq(buyerQuoteBefore - usdc.balanceOf(taker), 52_989_365);
        assertEq(usdc.balanceOf(address(this)) - feeQuoteBefore, 105_820);
        assertEq(settlement.filled(settlement.hashOrder(sell)), fill);
    }

    function testSettlementRejectsMalleableHighSSignature() public {
        Settlement.Order memory sell = _order(maker, 1, 1e8, 5291, 1);
        Settlement.Order memory buy = _order(taker, 0, 1e8, 5291, 2);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(MAKER_KEY, settlement.digest(sell));
        bytes memory highSignature =
            abi.encodePacked(r, bytes32(CURVE_ORDER - uint256(s)), v == 27 ? uint8(28) : uint8(27));
        bytes memory buySignature = _sign(TAKER_KEY, settlement.digest(buy));
        vm.expectRevert(Settlement.Signature.selector);
        settlement.settle(sell, highSignature, buy, buySignature, 1e8);
    }

    function testSettlementRejectsSelfTrade() public {
        Settlement.Order memory sell = _order(maker, 1, 1e8, 5291, 1);
        Settlement.Order memory buy = _order(maker, 0, 1e8, 5291, 2);
        bytes memory sellSignature = _sign(MAKER_KEY, settlement.digest(sell));
        bytes memory buySignature = _sign(MAKER_KEY, settlement.digest(buy));
        vm.expectRevert(Settlement.SelfTrade.selector);
        settlement.settle(sell, sellSignature, buy, buySignature, 1e8);
    }

    function testSettlementConsumesIocRemainderAndRequiresFullFok() public {
        Settlement.Order memory sell = _order(maker, 1, 2e8, 5291, 1);
        Settlement.Order memory ioc = _order(taker, 0, 2e8, 5291, 2);
        ioc.timeInForce = settlement.TIF_IOC();
        vm.prank(maker);
        pzec.approve(address(settlement), type(uint256).max);
        vm.prank(taker);
        usdc.approve(address(settlement), type(uint256).max);
        settlement.settle(
            sell, _sign(MAKER_KEY, settlement.digest(sell)), ioc, _sign(TAKER_KEY, settlement.digest(ioc)), 1e8
        );
        assertEq(settlement.filled(settlement.hashOrder(ioc)), ioc.baseAmount);

        Settlement.Order memory fok = _order(taker, 0, 2e8, 5291, 3);
        fok.timeInForce = settlement.TIF_FOK();
        bytes memory sellSignature = _sign(MAKER_KEY, settlement.digest(sell));
        bytes memory fokSignature = _sign(TAKER_KEY, settlement.digest(fok));
        vm.expectRevert(Settlement.Fill.selector);
        settlement.settle(sell, sellSignature, fok, fokSignature, 1e8);
    }

    function testContractConstructorsRejectBrokenTrustBoundaries() public {
        vm.expectRevert(Settlement.InvalidConfiguration.selector);
        new Settlement(address(0), address(usdc), address(usdt0), address(this), address(this), address(this));
        vm.expectRevert(Router.InvalidConfiguration.selector);
        new Router(Factory(address(0)), address(this), address(this));
        vm.expectRevert(Pair.InvalidConfiguration.selector);
        new Pair(address(0), address(usdc));
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
            timeInForce: 0,
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
