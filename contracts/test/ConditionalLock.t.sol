// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.28;

import {IConditionalLock} from "../src/swap/IConditionalLock.sol";
import {ConditionalLock} from "../src/swap/ConditionalLock.sol";
import {ConditionalLockTestBase} from "./ConditionalLockTestBase.sol";

contract ConditionalLockTest is ConditionalLockTestBase {
    function testConstructorBindsEveryTermAndStartsUnfunded() public view {
        assertEq(conditionalLock.swapId(), SWAP_ID);
        assertEq(conditionalLock.termsHash(), TERMS_HASH);
        assertEq(conditionalLock.token(), address(quoteToken));
        assertEq(conditionalLock.funder(), funder);
        assertEq(conditionalLock.claimRecipient(), claimRecipient);
        assertEq(conditionalLock.refundRecipient(), funder);
        assertEq(conditionalLock.amount(), AMOUNT);
        assertEq(conditionalLock.hashlock(), HASHLOCK);
        assertEq(conditionalLock.fundingCutoff(), fundingCutoff);
        assertEq(conditionalLock.claimCutoff(), claimCutoff);
        assertEq(conditionalLock.refundTime(), refundTime);
        assertEq(uint256(conditionalLock.state()), uint256(IConditionalLock.State.Unfunded));
    }

    function testSha256VectorMatchesBothChains() public view {
        assertEq(sha256(abi.encode(PREIMAGE)), HASHLOCK);
        assertTrue(conditionalLock.verifyPreimage(PREIMAGE));
        assertFalse(conditionalLock.verifyPreimage(bytes32(uint256(0xBAD))));
    }

    function testFundAndClaimTransferExactlyOnce() public {
        _fund(conditionalLock, AMOUNT);
        assertEq(uint256(conditionalLock.state()), uint256(IConditionalLock.State.Funded));
        assertEq(quoteToken.balanceOf(address(conditionalLock)), AMOUNT);

        uint256 recipientBefore = quoteToken.balanceOf(claimRecipient);
        vm.prank(claimRecipient);
        conditionalLock.claim(PREIMAGE);

        assertEq(uint256(conditionalLock.state()), uint256(IConditionalLock.State.Claimed));
        assertEq(quoteToken.balanceOf(address(conditionalLock)), 0);
        assertEq(quoteToken.balanceOf(claimRecipient), recipientBefore + AMOUNT);

        vm.prank(claimRecipient);
        vm.expectRevert(
            abi.encodeWithSelector(
                IConditionalLock.InvalidState.selector,
                IConditionalLock.State.Funded,
                IConditionalLock.State.Claimed
            )
        );
        conditionalLock.claim(PREIMAGE);

        vm.warp(refundTime);
        vm.prank(funder);
        vm.expectRevert(
            abi.encodeWithSelector(
                IConditionalLock.InvalidState.selector,
                IConditionalLock.State.Funded,
                IConditionalLock.State.Claimed
            )
        );
        conditionalLock.refund();
    }

    function testRefundTransfersOnlyToOriginalFunderAndEndsLock() public {
        _fund(conditionalLock, AMOUNT);
        vm.warp(refundTime);

        uint256 funderBefore = quoteToken.balanceOf(funder);
        vm.prank(funder);
        conditionalLock.refund();

        assertEq(uint256(conditionalLock.state()), uint256(IConditionalLock.State.Refunded));
        assertEq(quoteToken.balanceOf(funder), funderBefore + AMOUNT);
        assertEq(quoteToken.balanceOf(address(conditionalLock)), 0);

        vm.prank(claimRecipient);
        vm.expectRevert(
            abi.encodeWithSelector(
                IConditionalLock.InvalidState.selector,
                IConditionalLock.State.Funded,
                IConditionalLock.State.Refunded
            )
        );
        conditionalLock.claim(PREIMAGE);
    }

    function testRolesAndPreimageFailClosedWithoutStateChange() public {
        vm.prank(bystander);
        vm.expectRevert(IConditionalLock.OnlyFunder.selector);
        conditionalLock.fund();

        _fund(conditionalLock, AMOUNT);

        vm.prank(bystander);
        vm.expectRevert(IConditionalLock.OnlyClaimRecipient.selector);
        conditionalLock.claim(PREIMAGE);

        vm.prank(claimRecipient);
        vm.expectRevert(IConditionalLock.WrongPreimage.selector);
        conditionalLock.claim(bytes32(uint256(0xBAD)));

        vm.warp(refundTime);
        vm.prank(bystander);
        vm.expectRevert(IConditionalLock.OnlyFunder.selector);
        conditionalLock.refund();

        assertEq(uint256(conditionalLock.state()), uint256(IConditionalLock.State.Funded));
        assertEq(quoteToken.balanceOf(address(conditionalLock)), AMOUNT);
    }

    function testSecondFundingAttemptIsReplayRejected() public {
        _fund(conditionalLock, AMOUNT);

        vm.prank(funder);
        vm.expectRevert(
            abi.encodeWithSelector(
                IConditionalLock.InvalidState.selector,
                IConditionalLock.State.Unfunded,
                IConditionalLock.State.Funded
            )
        );
        conditionalLock.fund();
    }

    function testConstructorRejectsUnboundIdentityValueAndRoles() public {
        vm.expectRevert(IConditionalLock.InvalidSwapId.selector);
        _deploy(
            bytes32(0), TERMS_HASH, address(quoteToken), funder, claimRecipient, funder, AMOUNT, HASHLOCK,
            fundingCutoff, claimCutoff, refundTime
        );

        vm.expectRevert(IConditionalLock.InvalidTermsHash.selector);
        _deploy(
            SWAP_ID, bytes32(0), address(quoteToken), funder, claimRecipient, funder, AMOUNT, HASHLOCK,
            fundingCutoff, claimCutoff, refundTime
        );

        vm.expectRevert(IConditionalLock.InvalidToken.selector);
        _deploy(
            SWAP_ID, TERMS_HASH, address(0x1234), funder, claimRecipient, funder, AMOUNT, HASHLOCK,
            fundingCutoff, claimCutoff, refundTime
        );

        vm.expectRevert(IConditionalLock.InvalidAmount.selector);
        _deploy(
            SWAP_ID, TERMS_HASH, address(quoteToken), funder, claimRecipient, funder, 0, HASHLOCK,
            fundingCutoff, claimCutoff, refundTime
        );

        vm.expectRevert(IConditionalLock.InvalidHashlock.selector);
        _deploy(
            SWAP_ID, TERMS_HASH, address(quoteToken), funder, claimRecipient, funder, AMOUNT, bytes32(0),
            fundingCutoff, claimCutoff, refundTime
        );

        vm.expectRevert(IConditionalLock.InvalidRole.selector);
        _deploy(
            SWAP_ID, TERMS_HASH, address(quoteToken), funder, funder, funder, AMOUNT, HASHLOCK,
            fundingCutoff, claimCutoff, refundTime
        );

        vm.expectRevert(IConditionalLock.RefundRecipientNotFunder.selector);
        _deploy(
            SWAP_ID, TERMS_HASH, address(quoteToken), funder, claimRecipient, bystander, AMOUNT, HASHLOCK,
            fundingCutoff, claimCutoff, refundTime
        );
    }
}
