// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.28;

import {IConditionalLock} from "../src/swap/IConditionalLock.sol";
import {ConditionalLock} from "../src/swap/ConditionalLock.sol";
import {ConditionalLockTestBase} from "./ConditionalLockTestBase.sol";

contract ConditionalLockFuzzTest is ConditionalLockTestBase {
    function testFuzzFundAndClaimConserveExactAmount(uint96 rawAmount, bytes32 preimage) public {
        uint256 amount_ = (uint256(rawAmount) % 10_000e6) + 1;
        bytes32 hashlock_ = sha256(abi.encode(preimage));
        ConditionalLock lock_ = _deploy(
            keccak256(abi.encode(SWAP_ID, amount_, preimage)),
            keccak256(abi.encode(TERMS_HASH, amount_)),
            address(quoteToken),
            funder,
            claimRecipient,
            funder,
            amount_,
            hashlock_,
            fundingCutoff,
            claimCutoff,
            refundTime
        );

        _fund(lock_, amount_);
        uint256 funderAfterFunding = quoteToken.balanceOf(funder);
        vm.prank(claimRecipient);
        lock_.claim(preimage);

        assertEq(uint256(lock_.state()), uint256(IConditionalLock.State.Claimed));
        assertEq(quoteToken.balanceOf(address(lock_)), 0);
        assertEq(quoteToken.balanceOf(claimRecipient), amount_);
        assertEq(quoteToken.balanceOf(funder) + quoteToken.balanceOf(claimRecipient), funderAfterFunding + amount_);
    }

    function testFuzzFundAndRefundConserveExactAmount(uint96 rawAmount) public {
        uint256 amount_ = (uint256(rawAmount) % 10_000e6) + 1;
        ConditionalLock lock_ = _deploy(
            keccak256(abi.encode(SWAP_ID, amount_)),
            keccak256(abi.encode(TERMS_HASH, amount_)),
            address(quoteToken),
            funder,
            claimRecipient,
            funder,
            amount_,
            HASHLOCK,
            fundingCutoff,
            claimCutoff,
            refundTime
        );

        uint256 funderBefore = quoteToken.balanceOf(funder);
        _fund(lock_, amount_);
        vm.warp(refundTime);
        vm.prank(funder);
        lock_.refund();

        assertEq(uint256(lock_.state()), uint256(IConditionalLock.State.Refunded));
        assertEq(quoteToken.balanceOf(address(lock_)), 0);
        assertEq(quoteToken.balanceOf(funder), funderBefore);
        assertEq(quoteToken.balanceOf(claimRecipient), 0);
    }

    function testFuzzWrongPreimageNeverChangesFundedState(bytes32 wrongPreimage) public {
        vm.assume(wrongPreimage != PREIMAGE);
        _fund(conditionalLock, AMOUNT);

        vm.prank(claimRecipient);
        vm.expectRevert(IConditionalLock.WrongPreimage.selector);
        conditionalLock.claim(wrongPreimage);

        assertEq(uint256(conditionalLock.state()), uint256(IConditionalLock.State.Funded));
        assertEq(quoteToken.balanceOf(address(conditionalLock)), AMOUNT);
        assertEq(quoteToken.balanceOf(claimRecipient), 0);
    }

    function testFuzzStrictTimelineAcceptsPositiveGaps(uint32 rawFunding, uint32 rawClaim, uint32 rawRefund) public {
        uint64 fundingDelay = uint64((uint256(rawFunding) % 30 days) + 1);
        uint64 claimGap = uint64((uint256(rawClaim) % 30 days) + 1);
        uint64 refundGap = uint64((uint256(rawRefund) % 30 days) + 1);
        uint64 fundingCutoff_ = uint64(block.timestamp) + fundingDelay;
        uint64 claimCutoff_ = fundingCutoff_ + claimGap;
        uint64 refundTime_ = claimCutoff_ + refundGap;

        ConditionalLock lock_ = _deploy(
            keccak256(abi.encode(SWAP_ID, rawFunding, rawClaim, rawRefund)),
            TERMS_HASH,
            address(quoteToken),
            funder,
            claimRecipient,
            funder,
            AMOUNT,
            HASHLOCK,
            fundingCutoff_,
            claimCutoff_,
            refundTime_
        );

        assertTrue(lock_.fundingCutoff() < lock_.claimCutoff());
        assertTrue(lock_.claimCutoff() < lock_.refundTime());
    }
}
