// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.28;

import {TestBase} from "./TestBase.sol";
import {QuoteToken} from "../src/token/QuoteToken.sol";
import {ConditionalLock} from "../src/swap/ConditionalLock.sol";

abstract contract ConditionalLockTestBase is TestBase {
    bytes32 internal constant SWAP_ID = keccak256("phlebas-swap-0001");
    bytes32 internal constant TERMS_HASH = keccak256("phlebas-terms-0001");
    bytes32 internal constant PREIMAGE = bytes32(uint256(0xC0FFEE));
    bytes32 internal constant HASHLOCK = bytes32(0x5b20697604703c31c910b528899cfcd8fc4b623c0582032d0fa8fb854ed48017);
    uint256 internal constant AMOUNT = 100e6;

    address internal funder = address(0xF00D);
    address internal claimRecipient = address(0xC1A1);
    address internal bystander = address(0xBADD);

    QuoteToken internal quoteToken;
    ConditionalLock internal conditionalLock;
    uint64 internal fundingCutoff;
    uint64 internal claimCutoff;
    uint64 internal refundTime;

    function setUp() public virtual {
        quoteToken = new QuoteToken("Phlebas Test Quote", "tQUOTE");
        fundingCutoff = uint64(block.timestamp + 1 hours);
        claimCutoff = uint64(block.timestamp + 2 hours);
        refundTime = uint64(block.timestamp + 3 hours);
        conditionalLock = _deploy(
            SWAP_ID,
            TERMS_HASH,
            address(quoteToken),
            funder,
            claimRecipient,
            funder,
            AMOUNT,
            HASHLOCK,
            fundingCutoff,
            claimCutoff,
            refundTime
        );

        vm.prank(funder);
        quoteToken.faucet(10_000e6);
    }

    function _fund(ConditionalLock lock_, uint256 amount_) internal {
        vm.prank(funder);
        quoteToken.approve(address(lock_), amount_);
        vm.prank(funder);
        lock_.fund();
    }

    function _deploy(
        bytes32 swapId_,
        bytes32 termsHash_,
        address token_,
        address funder_,
        address claimRecipient_,
        address refundRecipient_,
        uint256 amount_,
        bytes32 hashlock_,
        uint64 fundingCutoff_,
        uint64 claimCutoff_,
        uint64 refundTime_
    ) internal returns (ConditionalLock) {
        return new ConditionalLock(
            swapId_,
            termsHash_,
            token_,
            funder_,
            claimRecipient_,
            refundRecipient_,
            amount_,
            hashlock_,
            fundingCutoff_,
            claimCutoff_,
            refundTime_
        );
    }
}
