// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.28;

import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IConditionalLock} from "../src/swap/IConditionalLock.sol";
import {ConditionalLock} from "../src/swap/ConditionalLock.sol";
import {ConditionalLockTestBase} from "./ConditionalLockTestBase.sol";
import {AdversarialERC20, MalformedReturnERC20, NoReturnERC20} from "./mocks/AdversarialERC20.sol";

contract ConditionalLockMaliciousTokenTest is ConditionalLockTestBase {
    function testSafeERC20AcceptsLegacyNoReturnTokenWithExactDeltas() public {
        NoReturnERC20 legacy = new NoReturnERC20();
        ConditionalLock lock_ = _lockFor(address(legacy), AMOUNT);
        legacy.mint(funder, AMOUNT);

        vm.prank(funder);
        legacy.approve(address(lock_), AMOUNT);
        vm.prank(funder);
        lock_.fund();

        vm.prank(claimRecipient);
        lock_.claim(PREIMAGE);

        assertEq(uint256(lock_.state()), uint256(IConditionalLock.State.Claimed));
        assertEq(legacy.balanceOf(claimRecipient), AMOUNT);
        assertEq(legacy.balanceOf(address(lock_)), 0);
    }

    function testFalseReturningTokenIsRejectedBySafeERC20() public {
        AdversarialERC20 badToken = new AdversarialERC20();
        ConditionalLock lock_ = _prepared(badToken);
        badToken.setBehavior(0, true, false, false);

        vm.prank(funder);
        vm.expectRevert(abi.encodeWithSelector(SafeERC20.SafeERC20FailedOperation.selector, address(badToken)));
        lock_.fund();

        assertEq(uint256(lock_.state()), uint256(IConditionalLock.State.Unfunded));
    }

    function testRevertingTokenBubblesFailureAndPreservesState() public {
        AdversarialERC20 badToken = new AdversarialERC20();
        ConditionalLock lock_ = _prepared(badToken);
        badToken.setBehavior(0, false, false, true);

        vm.prank(funder);
        vm.expectRevert(AdversarialERC20.TransferReverted.selector);
        lock_.fund();

        assertEq(uint256(lock_.state()), uint256(IConditionalLock.State.Unfunded));
    }

    function testSuccessfulNoOpTokenIsRejectedByIncomingDelta() public {
        AdversarialERC20 badToken = new AdversarialERC20();
        ConditionalLock lock_ = _prepared(badToken);
        badToken.setBehavior(0, false, true, false);

        vm.prank(funder);
        vm.expectRevert(abi.encodeWithSelector(IConditionalLock.InexactTransferIn.selector, AMOUNT, 0, 0));
        lock_.fund();

        assertEq(uint256(lock_.state()), uint256(IConditionalLock.State.Unfunded));
        assertEq(badToken.balanceOf(address(lock_)), 0);
    }

    function testFeeOnTransferFundingIsRejectedByIncomingDelta() public {
        AdversarialERC20 badToken = new AdversarialERC20();
        ConditionalLock lock_ = _prepared(badToken);
        badToken.setBehavior(100, false, false, false);

        vm.prank(funder);
        vm.expectRevert(abi.encodeWithSelector(IConditionalLock.InexactTransferIn.selector, AMOUNT, 0, 99e6));
        lock_.fund();

        assertEq(uint256(lock_.state()), uint256(IConditionalLock.State.Unfunded));
        assertEq(badToken.balanceOf(funder), AMOUNT);
    }

    function testFundingRejectsTokenThatOverdebitsFunder() public {
        AdversarialERC20 badToken = new AdversarialERC20();
        ConditionalLock lock_ = _lockFor(address(badToken), AMOUNT);
        badToken.mint(funder, AMOUNT + 1);
        badToken.setSenderSurcharge(1);
        vm.prank(funder);
        badToken.approve(address(lock_), AMOUNT);

        vm.prank(funder);
        vm.expectRevert(abi.encodeWithSelector(IConditionalLock.InexactFunderDebit.selector, AMOUNT, AMOUNT + 1, 0));
        lock_.fund();

        assertEq(uint256(lock_.state()), uint256(IConditionalLock.State.Unfunded));
        assertEq(badToken.balanceOf(funder), AMOUNT + 1);
        assertEq(badToken.balanceOf(address(lock_)), 0);
    }

    function testFundingRejectsTokenThatDoesNotDebitFunder() public {
        AdversarialERC20 badToken = new AdversarialERC20();
        ConditionalLock lock_ = _prepared(badToken);
        badToken.setWaiveSenderDebit(true);

        vm.prank(funder);
        vm.expectRevert(abi.encodeWithSelector(IConditionalLock.InexactFunderDebit.selector, AMOUNT, AMOUNT, AMOUNT));
        lock_.fund();

        assertEq(uint256(lock_.state()), uint256(IConditionalLock.State.Unfunded));
        assertEq(badToken.balanceOf(funder), AMOUNT);
        assertEq(badToken.balanceOf(address(lock_)), 0);
    }

    function testFeeOnTransferClaimIsRejectedAndRolledBack() public {
        AdversarialERC20 badToken = new AdversarialERC20();
        ConditionalLock lock_ = _prepared(badToken);
        vm.prank(funder);
        lock_.fund();
        badToken.setBehavior(100, false, false, false);

        vm.prank(claimRecipient);
        vm.expectRevert(
            abi.encodeWithSelector(IConditionalLock.InexactTransferOut.selector, AMOUNT, AMOUNT, 0, 0, 99e6)
        );
        lock_.claim(PREIMAGE);

        assertEq(uint256(lock_.state()), uint256(IConditionalLock.State.Funded));
        assertEq(badToken.balanceOf(address(lock_)), AMOUNT);
        assertEq(badToken.balanceOf(claimRecipient), 0);
    }

    function testFeeOnTransferRefundIsRejectedAndRolledBack() public {
        AdversarialERC20 badToken = new AdversarialERC20();
        ConditionalLock lock_ = _prepared(badToken);
        vm.prank(funder);
        lock_.fund();
        badToken.setBehavior(100, false, false, false);
        vm.warp(refundTime);

        vm.prank(funder);
        vm.expectRevert(
            abi.encodeWithSelector(
                IConditionalLock.InexactTransferOut.selector, AMOUNT, AMOUNT, 0, AMOUNT - AMOUNT, AMOUNT - AMOUNT + 99e6
            )
        );
        lock_.refund();

        assertEq(uint256(lock_.state()), uint256(IConditionalLock.State.Funded));
        assertEq(badToken.balanceOf(address(lock_)), AMOUNT);
    }

    function testSuccessfulNoOpClaimIsRejectedByOutgoingDeltas() public {
        AdversarialERC20 badToken = new AdversarialERC20();
        ConditionalLock lock_ = _prepared(badToken);
        vm.prank(funder);
        lock_.fund();
        badToken.setBehavior(0, false, true, false);

        vm.prank(claimRecipient);
        vm.expectRevert(
            abi.encodeWithSelector(IConditionalLock.InexactTransferOut.selector, AMOUNT, AMOUNT, AMOUNT, 0, 0)
        );
        lock_.claim(PREIMAGE);

        assertEq(uint256(lock_.state()), uint256(IConditionalLock.State.Funded));
        assertEq(badToken.balanceOf(address(lock_)), AMOUNT);
        assertEq(badToken.balanceOf(claimRecipient), 0);
    }

    function testMalformedReturnDataIsRejectedBySafeERC20() public {
        MalformedReturnERC20 badToken = new MalformedReturnERC20();
        ConditionalLock lock_ = _lockFor(address(badToken), AMOUNT);
        badToken.mint(funder, AMOUNT);
        vm.prank(funder);
        badToken.approve(address(lock_), AMOUNT);

        vm.prank(funder);
        vm.expectRevert(abi.encodeWithSelector(SafeERC20.SafeERC20FailedOperation.selector, address(badToken)));
        lock_.fund();
    }

    function testTokenCannotReenterFundingOrClaim() public {
        AdversarialERC20 reentrant = new AdversarialERC20();
        ConditionalLock lock_ = _prepared(reentrant);
        reentrant.setCallback(address(lock_), abi.encodeCall(ConditionalLock.fund, ()));

        vm.prank(funder);
        lock_.fund();
        assertFalse(reentrant.callbackSucceeded());
        assertEq(
            keccak256(reentrant.callbackReturnData()),
            keccak256(abi.encodeWithSelector(ReentrancyGuard.ReentrancyGuardReentrantCall.selector))
        );
        assertEq(uint256(lock_.state()), uint256(IConditionalLock.State.Funded));

        reentrant.setCallback(address(lock_), abi.encodeCall(ConditionalLock.claim, (PREIMAGE)));
        vm.prank(claimRecipient);
        lock_.claim(PREIMAGE);

        assertFalse(reentrant.callbackSucceeded());
        assertEq(
            keccak256(reentrant.callbackReturnData()),
            keccak256(abi.encodeWithSelector(ReentrancyGuard.ReentrancyGuardReentrantCall.selector))
        );
        assertEq(uint256(lock_.state()), uint256(IConditionalLock.State.Claimed));
        assertEq(reentrant.balanceOf(claimRecipient), AMOUNT);
    }

    function testTokenCannotReenterRefund() public {
        AdversarialERC20 reentrant = new AdversarialERC20();
        ConditionalLock lock_ = _prepared(reentrant);
        vm.prank(funder);
        lock_.fund();
        vm.warp(refundTime);
        reentrant.setCallback(address(lock_), abi.encodeCall(ConditionalLock.refund, ()));

        vm.prank(funder);
        lock_.refund();

        assertFalse(reentrant.callbackSucceeded());
        assertEq(
            keccak256(reentrant.callbackReturnData()),
            keccak256(abi.encodeWithSelector(ReentrancyGuard.ReentrancyGuardReentrantCall.selector))
        );
        assertEq(uint256(lock_.state()), uint256(IConditionalLock.State.Refunded));
        assertEq(reentrant.balanceOf(funder), AMOUNT);
    }

    function testUnsolicitedDonationCannotChangeExactPayoutOrBeSwept() public {
        uint256 donation = 7e6;
        vm.prank(funder);
        assertTrue(quoteToken.transfer(address(conditionalLock), donation));

        _fund(conditionalLock, AMOUNT);
        vm.prank(claimRecipient);
        conditionalLock.claim(PREIMAGE);

        assertEq(quoteToken.balanceOf(claimRecipient), AMOUNT);
        assertEq(quoteToken.balanceOf(address(conditionalLock)), donation);
    }

    function _prepared(AdversarialERC20 token_) private returns (ConditionalLock lock_) {
        lock_ = _lockFor(address(token_), AMOUNT);
        token_.mint(funder, AMOUNT);
        vm.prank(funder);
        token_.approve(address(lock_), AMOUNT);
    }

    function _lockFor(address token_, uint256 amount_) private returns (ConditionalLock) {
        return _deploy(
            keccak256(abi.encode(SWAP_ID, token_)),
            TERMS_HASH,
            token_,
            funder,
            claimRecipient,
            funder,
            amount_,
            HASHLOCK,
            fundingCutoff,
            claimCutoff,
            refundTime
        );
    }
}
