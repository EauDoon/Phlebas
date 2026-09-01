// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.28;

import {TestBase} from "./TestBase.sol";
import {QuoteToken} from "../src/token/QuoteToken.sol";
import {ConditionalLock} from "../src/swap/ConditionalLock.sol";
import {IConditionalLock} from "../src/swap/IConditionalLock.sol";

contract ConditionalLockTest is TestBase {
    bytes32 internal constant PREIMAGE = bytes32(uint256(0xC0FFEE));
    bytes32 internal constant HASHLOCK = bytes32(0x5b20697604703c31c910b528899cfcd8fc4b623c0582032d0fa8fb854ed48017);

    QuoteToken internal usdc;
    QuoteToken internal usdt0;
    ConditionalLock internal lock;

    address internal buyer = address(0xBEEF);
    address internal seller = address(0xC0DE);
    address internal bystander = address(0xDEAD);
    address internal pauser = address(0xA1);
    address internal governor = address(0xA2);

    function setUp() public {
        usdc = new QuoteToken("Phlebas Testnet USDC", "tUSDC");
        usdt0 = new QuoteToken("Phlebas Testnet USDT0", "tUSDT0");
        lock = new ConditionalLock(address(usdc), address(usdt0), pauser, governor);

        vm.prank(buyer);
        usdc.faucet(10_000e6);
        vm.prank(seller);
        usdc.faucet(10_000e6);

        vm.prank(buyer);
        usdt0.faucet(10_000e6);
        vm.prank(seller);
        usdt0.faucet(10_000e6);
    }

    function testConstructorRejectsBrokenConfiguration() public {
        vm.expectRevert(IConditionalLock.InvalidConfiguration.selector);
        new ConditionalLock(address(0), address(usdt0), pauser, governor);
        vm.expectRevert(IConditionalLock.InvalidConfiguration.selector);
        new ConditionalLock(address(usdc), address(0), pauser, governor);
        vm.expectRevert(IConditionalLock.InvalidConfiguration.selector);
        new ConditionalLock(address(usdc), address(usdt0), address(0), governor);
        vm.expectRevert(IConditionalLock.InvalidConfiguration.selector);
        new ConditionalLock(address(usdc), address(usdt0), pauser, address(0));
        vm.expectRevert(IConditionalLock.InvalidConfiguration.selector);
        new ConditionalLock(address(usdc), address(usdc), pauser, governor);
    }

    function testDepositStoresAllFieldsAndPullsTokens() public {
        vm.prank(buyer);
        usdc.approve(address(lock), type(uint256).max);

        IConditionalLock.LockParams memory params = _params(address(usdc), 100e6, HASHLOCK, seller, buyer);
        vm.prank(buyer);
        uint256 lockId = lock.deposit(params);

        assertEq(lockId, 1);
        assertEq(lock.nextLockId(), 2);
        assertEq(usdc.balanceOf(address(lock)), 100e6);
        assertEq(usdc.balanceOf(buyer), 10_000e6 - 100e6);

        IConditionalLock.Lock memory stored = lock.getLock(lockId);
        assertEq(stored.depositor, buyer);
        assertEq(stored.token, address(usdc));
        assertEq(stored.amount, 100e6);
        assertEq(stored.hashlock, HASHLOCK);
        assertEq(stored.refundTo, buyer);
        assertEq(stored.claimTo, seller);
        assertEq(stored.refundAfter, params.refundAfter);
        assertFalse(stored.claimed);
        assertFalse(stored.refunded);
    }

    function testClaimHappyPathTransfersToClaimant() public {
        vm.prank(buyer);
        usdc.approve(address(lock), type(uint256).max);

        vm.prank(buyer);
        uint256 lockId = lock.deposit(_params(address(usdc), 100e6, HASHLOCK, seller, buyer));

        uint256 sellerBefore = usdc.balanceOf(seller);
        vm.prank(seller);
        lock.claim(lockId, PREIMAGE);

        assertEq(usdc.balanceOf(seller), sellerBefore + 100e6);
        assertEq(usdc.balanceOf(address(lock)), 0);
        assertTrue(lock.getLock(lockId).claimed);
        assertFalse(lock.getLock(lockId).refunded);
    }

    function testClaimRejectsWrongPreimage() public {
        vm.prank(buyer);
        usdc.approve(address(lock), type(uint256).max);
        vm.prank(buyer);
        uint256 lockId = lock.deposit(_params(address(usdc), 100e6, HASHLOCK, seller, buyer));

        vm.prank(seller);
        vm.expectRevert(IConditionalLock.WrongPreimage.selector);
        lock.claim(lockId, bytes32(uint256(0xBADF00D)));
    }

    function testClaimRejectsBystander() public {
        vm.prank(buyer);
        usdc.approve(address(lock), type(uint256).max);
        vm.prank(buyer);
        uint256 lockId = lock.deposit(_params(address(usdc), 100e6, HASHLOCK, seller, buyer));

        vm.prank(bystander);
        vm.expectRevert(IConditionalLock.NotClaimant.selector);
        lock.claim(lockId, PREIMAGE);
    }

    function testClaimRejectsDoubleClaim() public {
        vm.prank(buyer);
        usdc.approve(address(lock), type(uint256).max);
        vm.prank(buyer);
        uint256 lockId = lock.deposit(_params(address(usdc), 100e6, HASHLOCK, seller, buyer));

        vm.prank(seller);
        lock.claim(lockId, PREIMAGE);
        vm.prank(seller);
        vm.expectRevert(IConditionalLock.AlreadyClaimed.selector);
        lock.claim(lockId, PREIMAGE);
    }

    function testRefundHappyPathAfterDeadline() public {
        vm.prank(buyer);
        usdc.approve(address(lock), type(uint256).max);

        uint64 refundAfter = uint64(block.timestamp + lock.MIN_REFUND_DELAY() + 60);
        vm.prank(buyer);
        uint256 lockId = lock.deposit(_paramsAt(address(usdc), 100e6, HASHLOCK, seller, buyer, refundAfter));

        vm.warp(block.timestamp + lock.MIN_REFUND_DELAY() + 60);

        uint256 buyerBefore = usdc.balanceOf(buyer);
        vm.prank(buyer);
        lock.refund(lockId);

        assertEq(usdc.balanceOf(buyer), buyerBefore + 100e6);
        assertEq(usdc.balanceOf(address(lock)), 0);
        assertTrue(lock.getLock(lockId).refunded);
        assertFalse(lock.getLock(lockId).claimed);
    }

    function testRefundRejectsBeforeDeadline() public {
        vm.prank(buyer);
        usdc.approve(address(lock), type(uint256).max);
        vm.prank(buyer);
        uint256 lockId = lock.deposit(_params(address(usdc), 100e6, HASHLOCK, seller, buyer));

        uint64 refundAfter = lock.getLock(lockId).refundAfter;
        uint256 currentTimestamp = block.timestamp;
        vm.prank(buyer);
        vm.expectRevert(
            abi.encodeWithSelector(IConditionalLock.RefundTooEarly.selector, refundAfter, currentTimestamp)
        );
        lock.refund(lockId);
    }

    function testRefundRejectsNonDepositor() public {
        vm.prank(buyer);
        usdc.approve(address(lock), type(uint256).max);

        uint64 refundAfter = uint64(block.timestamp + lock.MIN_REFUND_DELAY() + 60);
        vm.prank(buyer);
        uint256 lockId = lock.deposit(_paramsAt(address(usdc), 100e6, HASHLOCK, seller, buyer, refundAfter));

        vm.warp(block.timestamp + lock.MIN_REFUND_DELAY() + 60);
        vm.prank(bystander);
        vm.expectRevert(IConditionalLock.NotDepositor.selector);
        lock.refund(lockId);
    }

    function testRefundRejectsAfterClaim() public {
        vm.prank(buyer);
        usdc.approve(address(lock), type(uint256).max);
        vm.prank(buyer);
        uint256 lockId = lock.deposit(_params(address(usdc), 100e6, HASHLOCK, seller, buyer));

        vm.prank(seller);
        lock.claim(lockId, PREIMAGE);

        vm.warp(block.timestamp + lock.MIN_REFUND_DELAY() + 60);
        vm.prank(buyer);
        vm.expectRevert(IConditionalLock.AlreadyClaimed.selector);
        lock.refund(lockId);
    }

    function testClaimRejectsAfterRefund() public {
        vm.prank(buyer);
        usdc.approve(address(lock), type(uint256).max);

        uint64 refundAfter = uint64(block.timestamp + lock.MIN_REFUND_DELAY() + 60);
        vm.prank(buyer);
        uint256 lockId = lock.deposit(_paramsAt(address(usdc), 100e6, HASHLOCK, seller, buyer, refundAfter));

        vm.warp(block.timestamp + lock.MIN_REFUND_DELAY() + 60);
        vm.prank(buyer);
        lock.refund(lockId);

        vm.prank(seller);
        vm.expectRevert(IConditionalLock.AlreadyRefunded.selector);
        lock.claim(lockId, PREIMAGE);
    }

    function testDepositRejectsUnapprovedToken() public {
        vm.prank(buyer);
        QuoteToken extra = new QuoteToken("Nope", "NOPE");
        vm.prank(buyer);
        extra.faucet(100e6);
        vm.prank(buyer);
        extra.approve(address(lock), type(uint256).max);

        vm.prank(buyer);
        vm.expectRevert(IConditionalLock.TokenNotApproved.selector);
        lock.deposit(_params(address(extra), 100e6, HASHLOCK, seller, buyer));
    }

    function testDepositRejectsZeroAmount() public {
        vm.prank(buyer);
        usdc.approve(address(lock), type(uint256).max);

        vm.prank(buyer);
        vm.expectRevert(IConditionalLock.ZeroAmount.selector);
        lock.deposit(_params(address(usdc), 0, HASHLOCK, seller, buyer));
    }

    function testDepositRejectsZeroHashlock() public {
        vm.prank(buyer);
        usdc.approve(address(lock), type(uint256).max);

        vm.prank(buyer);
        vm.expectRevert(IConditionalLock.ZeroHashlock.selector);
        lock.deposit(_params(address(usdc), 100e6, bytes32(0), seller, buyer));
    }

    function testDepositRejectsZeroAddresses() public {
        vm.prank(buyer);
        usdc.approve(address(lock), type(uint256).max);

        vm.prank(buyer);
        vm.expectRevert(IConditionalLock.ZeroAddress.selector);
        lock.deposit(_params(address(usdc), 100e6, HASHLOCK, address(0), buyer));

        vm.prank(buyer);
        vm.expectRevert(IConditionalLock.ZeroAddress.selector);
        lock.deposit(_params(address(usdc), 100e6, HASHLOCK, seller, address(0)));
    }

    function testDepositRejectsRefundDelayBelowMinimum() public {
        vm.prank(buyer);
        usdc.approve(address(lock), type(uint256).max);

        uint64 tooEarly = uint64(block.timestamp + 60);
        vm.prank(buyer);
        vm.expectRevert(
            abi.encodeWithSelector(
                IConditionalLock.RefundDelayTooShort.selector, tooEarly, uint64(block.timestamp) + lock.MIN_REFUND_DELAY()
            )
        );
        lock.deposit(_paramsAt(address(usdc), 100e6, HASHLOCK, seller, buyer, tooEarly));
    }

    function testDepositRejectsAtExactMinimumPlusOne() public {
        vm.prank(buyer);
        usdc.approve(address(lock), type(uint256).max);

        uint64 boundary = uint64(block.timestamp + lock.MIN_REFUND_DELAY());
        vm.prank(buyer);
        vm.expectRevert(
            abi.encodeWithSelector(
                IConditionalLock.RefundDelayTooShort.selector, boundary, uint64(block.timestamp) + lock.MIN_REFUND_DELAY()
            )
        );
        lock.deposit(_paramsAt(address(usdc), 100e6, HASHLOCK, seller, buyer, boundary));
    }

    function testDepositWorksForUsdt0() public {
        vm.prank(buyer);
        usdt0.approve(address(lock), type(uint256).max);

        vm.prank(buyer);
        uint256 lockId = lock.deposit(_params(address(usdt0), 250e6, HASHLOCK, seller, buyer));

        assertEq(usdt0.balanceOf(address(lock)), 250e6);
        assertEq(lock.getLock(lockId).token, address(usdt0));

        vm.prank(seller);
        lock.claim(lockId, PREIMAGE);
        assertEq(usdt0.balanceOf(seller), 10_000e6 + 250e6);
    }

    function testPauseBlocksDepositsButKeepsRefundAvailable() public {
        vm.prank(buyer);
        usdc.approve(address(lock), type(uint256).max);

        vm.prank(buyer);
        uint256 lockId = lock.deposit(_params(address(usdc), 100e6, HASHLOCK, seller, buyer));

        vm.prank(pauser);
        lock.pause();

        vm.prank(buyer);
        vm.expectRevert(IConditionalLock.Paused.selector);
        lock.deposit(_params(address(usdc), 50e6, HASHLOCK, seller, buyer));

        vm.warp(block.timestamp + lock.MIN_REFUND_DELAY() + 60);
        vm.prank(buyer);
        lock.refund(lockId);
        assertTrue(lock.getLock(lockId).refunded);
    }

    function testUnpauseByPauserIsRejected() public {
        vm.prank(pauser);
        lock.pause();
        vm.prank(pauser);
        vm.expectRevert(IConditionalLock.NotGovernor.selector);
        lock.unpause();
    }

    function testUnpauseByGovernorRestoresDeposits() public {
        vm.prank(pauser);
        lock.pause();
        vm.prank(governor);
        lock.unpause();
        assertFalse(lock.paused());

        vm.prank(buyer);
        usdc.approve(address(lock), type(uint256).max);
        vm.prank(buyer);
        uint256 lockId = lock.deposit(_params(address(usdc), 100e6, HASHLOCK, seller, buyer));
        assertEq(lockId, 1);
    }

    function testVerifyPreimagePublicView() public {
        vm.prank(buyer);
        usdc.approve(address(lock), type(uint256).max);
        vm.prank(buyer);
        uint256 lockId = lock.deposit(_params(address(usdc), 100e6, HASHLOCK, seller, buyer));

        assertTrue(lock.verifyPreimage(lockId, PREIMAGE));
        assertFalse(lock.verifyPreimage(lockId, bytes32(uint256(0xBADF00D))));
        assertFalse(lock.verifyPreimage(0, PREIMAGE));
        assertFalse(lock.verifyPreimage(lockId + 1, PREIMAGE));
    }

    function testGetLockRejectsUnknownId() public {
        vm.expectRevert(IConditionalLock.LockNotFound.selector);
        lock.getLock(0);
        vm.expectRevert(IConditionalLock.LockNotFound.selector);
        lock.getLock(99);
    }

    function testSequentialLockIds() public {
        vm.prank(buyer);
        usdc.approve(address(lock), type(uint256).max);
        vm.prank(buyer);
        usdt0.approve(address(lock), type(uint256).max);

        vm.startPrank(buyer);
        uint256 first = lock.deposit(_params(address(usdc), 10e6, HASHLOCK, seller, buyer));
        uint256 second = lock.deposit(_params(address(usdt0), 20e6, HASHLOCK, seller, buyer));
        uint256 third = lock.deposit(_params(address(usdc), 30e6, bytes32(uint256(0xA1)), seller, buyer));
        vm.stopPrank();

        assertEq(first, 1);
        assertEq(second, 2);
        assertEq(third, 3);
        assertEq(lock.nextLockId(), 4);
    }

    function _params(address token, uint256 amount, bytes32 hashlock, address claimTo, address refundTo)
        internal
        view
        returns (IConditionalLock.LockParams memory)
    {
        return _paramsAt(token, amount, hashlock, claimTo, refundTo, uint64(block.timestamp + 1 hours + 60));
    }

    function _paramsAt(
        address token,
        uint256 amount,
        bytes32 hashlock,
        address claimTo,
        address refundTo,
        uint64 refundAfter
    ) internal pure returns (IConditionalLock.LockParams memory) {
        return IConditionalLock.LockParams({
            token: token,
            amount: amount,
            hashlock: hashlock,
            refundAfter: refundAfter,
            refundTo: refundTo,
            claimTo: claimTo
        });
    }
}
