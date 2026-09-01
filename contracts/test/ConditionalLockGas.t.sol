// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.28;

import {ConditionalLock} from "../src/swap/ConditionalLock.sol";
import {ConditionalLockTestBase} from "./ConditionalLockTestBase.sol";

contract ConditionalLockGasTest is ConditionalLockTestBase {
    uint256 internal constant MAX_DEPLOYMENT_GAS = 1_200_000;
    uint256 internal constant MAX_FUND_GAS = 150_000;
    uint256 internal constant MAX_CLAIM_GAS = 150_000;
    uint256 internal constant MAX_REFUND_GAS = 150_000;

    function testDeploymentStaysWithinGasBudget() public {
        uint256 gasBefore = gasleft();
        ConditionalLock measuredLock = _deploy(
            keccak256("gas-budget-swap"),
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
        uint256 gasUsed = gasBefore - gasleft();

        assertTrue(address(measuredLock) != address(0));
        assertLe(gasUsed, MAX_DEPLOYMENT_GAS);
    }

    function testFundingStaysWithinGasBudget() public {
        vm.prank(funder);
        quoteToken.approve(address(conditionalLock), AMOUNT);
        vm.prank(funder);
        uint256 gasBefore = gasleft();
        conditionalLock.fund();
        uint256 gasUsed = gasBefore - gasleft();

        assertLe(gasUsed, MAX_FUND_GAS);
    }

    function testClaimStaysWithinGasBudget() public {
        _fund(conditionalLock, AMOUNT);
        vm.prank(claimRecipient);
        uint256 gasBefore = gasleft();
        conditionalLock.claim(PREIMAGE);
        uint256 gasUsed = gasBefore - gasleft();

        assertLe(gasUsed, MAX_CLAIM_GAS);
    }

    function testRefundStaysWithinGasBudget() public {
        _fund(conditionalLock, AMOUNT);
        vm.warp(refundTime);
        vm.prank(funder);
        uint256 gasBefore = gasleft();
        conditionalLock.refund();
        uint256 gasUsed = gasBefore - gasleft();

        assertLe(gasUsed, MAX_REFUND_GAS);
    }
}
