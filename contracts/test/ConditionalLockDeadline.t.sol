// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.28;

import {IConditionalLock} from "../src/swap/IConditionalLock.sol";
import {ConditionalLockTestBase} from "./ConditionalLockTestBase.sol";

contract ConditionalLockDeadlineTest is ConditionalLockTestBase {
    function testConstructorRequiresStrictlyOrderedFutureTimeline() public {
        vm.expectRevert(IConditionalLock.InvalidTimeline.selector);
        _deploy(
            SWAP_ID, TERMS_HASH, address(quoteToken), funder, claimRecipient, funder, AMOUNT, HASHLOCK,
            uint64(block.timestamp), claimCutoff, refundTime
        );

        vm.expectRevert(IConditionalLock.InvalidTimeline.selector);
        _deploy(
            SWAP_ID, TERMS_HASH, address(quoteToken), funder, claimRecipient, funder, AMOUNT, HASHLOCK,
            claimCutoff, claimCutoff, refundTime
        );

        vm.expectRevert(IConditionalLock.InvalidTimeline.selector);
        _deploy(
            SWAP_ID, TERMS_HASH, address(quoteToken), funder, claimRecipient, funder, AMOUNT, HASHLOCK,
            fundingCutoff, refundTime, refundTime
        );

        vm.expectRevert(IConditionalLock.InvalidTimeline.selector);
        _deploy(
            SWAP_ID, TERMS_HASH, address(quoteToken), funder, claimRecipient, funder, AMOUNT, HASHLOCK,
            fundingCutoff, refundTime, claimCutoff
        );
    }

    function testFundingIsAllowedAtCutoff() public {
        vm.warp(fundingCutoff);
        _fund(conditionalLock, AMOUNT);

        assertEq(uint256(conditionalLock.state()), uint256(IConditionalLock.State.Funded));
        assertEq(quoteToken.balanceOf(address(conditionalLock)), AMOUNT);
    }

    function testFundingIsClosedOneSecondAfterCutoff() public {
        vm.prank(funder);
        quoteToken.approve(address(conditionalLock), AMOUNT);
        vm.warp(uint256(fundingCutoff) + 1);

        vm.prank(funder);
        vm.expectRevert(
            abi.encodeWithSelector(
                IConditionalLock.FundingClosed.selector, fundingCutoff, uint256(fundingCutoff) + 1
            )
        );
        conditionalLock.fund();

        assertEq(uint256(conditionalLock.state()), uint256(IConditionalLock.State.Unfunded));
        assertEq(quoteToken.balanceOf(address(conditionalLock)), 0);
    }

    function testClaimIsAllowedAtCutoff() public {
        _fund(conditionalLock, AMOUNT);
        vm.warp(claimCutoff);

        vm.prank(claimRecipient);
        conditionalLock.claim(PREIMAGE);

        assertEq(uint256(conditionalLock.state()), uint256(IConditionalLock.State.Claimed));
    }

    function testClaimIsClosedOneSecondAfterCutoff() public {
        _fund(conditionalLock, AMOUNT);
        vm.warp(uint256(claimCutoff) + 1);

        vm.prank(claimRecipient);
        vm.expectRevert(
            abi.encodeWithSelector(IConditionalLock.ClaimClosed.selector, claimCutoff, uint256(claimCutoff) + 1)
        );
        conditionalLock.claim(PREIMAGE);

        assertEq(uint256(conditionalLock.state()), uint256(IConditionalLock.State.Funded));
        assertEq(quoteToken.balanceOf(address(conditionalLock)), AMOUNT);
    }

    function testRefundIsClosedOneSecondBeforeRefundTime() public {
        _fund(conditionalLock, AMOUNT);
        vm.warp(uint256(refundTime) - 1);

        vm.prank(funder);
        vm.expectRevert(
            abi.encodeWithSelector(
                IConditionalLock.RefundNotAvailable.selector, refundTime, uint256(refundTime) - 1
            )
        );
        conditionalLock.refund();

        assertEq(uint256(conditionalLock.state()), uint256(IConditionalLock.State.Funded));
    }

    function testRefundIsAllowedExactlyAtRefundTime() public {
        _fund(conditionalLock, AMOUNT);
        vm.warp(refundTime);

        vm.prank(funder);
        conditionalLock.refund();

        assertEq(uint256(conditionalLock.state()), uint256(IConditionalLock.State.Refunded));
    }

    function testSafetyGapAllowsNeitherClaimNorRefund() public {
        _fund(conditionalLock, AMOUNT);
        uint256 gapTime = uint256(claimCutoff) + 1;
        assertTrue(gapTime < refundTime);
        vm.warp(gapTime);

        vm.prank(claimRecipient);
        vm.expectRevert(
            abi.encodeWithSelector(IConditionalLock.ClaimClosed.selector, claimCutoff, gapTime)
        );
        conditionalLock.claim(PREIMAGE);

        vm.prank(funder);
        vm.expectRevert(
            abi.encodeWithSelector(IConditionalLock.RefundNotAvailable.selector, refundTime, gapTime)
        );
        conditionalLock.refund();

        assertEq(uint256(conditionalLock.state()), uint256(IConditionalLock.State.Funded));
        assertEq(quoteToken.balanceOf(address(conditionalLock)), AMOUNT);
    }
}
