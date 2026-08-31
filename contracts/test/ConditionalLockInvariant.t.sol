// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {IConditionalLock} from "../src/swap/IConditionalLock.sol";
import {ConditionalLock} from "../src/swap/ConditionalLock.sol";
import {QuoteToken} from "../src/token/QuoteToken.sol";
import {InvariantTarget} from "./InvariantTarget.sol";
import {TestBase} from "./TestBase.sol";

interface VmHandler {
    function prank(address msgSender) external;
    function warp(uint256 newTimestamp) external;
}

contract ConditionalLockHandler {
    VmHandler internal constant vm = VmHandler(address(uint160(uint256(keccak256("hevm cheat code")))));

    ConditionalLock public immutable lock;
    IERC20 public immutable token;
    address public immutable funder;
    address public immutable claimRecipient;
    bytes32 public immutable preimage;
    uint256 public attempts;
    uint256 public successfulActions;
    uint256 public unexpectedFailures;

    constructor(ConditionalLock lock_, IERC20 token_, address funder_, address claimRecipient_, bytes32 preimage_) {
        lock = lock_;
        token = token_;
        funder = funder_;
        claimRecipient = claimRecipient_;
        preimage = preimage_;
    }

    function actFund() external {
        attempts++;
        if (lock.state() != IConditionalLock.State.Unfunded || block.timestamp > lock.fundingCutoff()) return;
        uint256 amount = lock.amount();
        vm.prank(funder);
        token.approve(address(lock), amount);
        vm.prank(funder);
        try lock.fund() {
            successfulActions++;
        } catch {
            unexpectedFailures++;
        }
    }

    function actClaim() external {
        attempts++;
        if (lock.state() != IConditionalLock.State.Funded || block.timestamp > lock.claimCutoff()) return;
        vm.prank(claimRecipient);
        try lock.claim(preimage) {
            successfulActions++;
        } catch {
            unexpectedFailures++;
        }
    }

    function actRefund() external {
        attempts++;
        if (lock.state() != IConditionalLock.State.Funded || block.timestamp < lock.refundTime()) return;
        vm.prank(funder);
        try lock.refund() {
            successfulActions++;
        } catch {
            unexpectedFailures++;
        }
    }

    function advanceTime(uint8 phase) external {
        attempts++;
        uint256 target;
        if (phase % 4 == 0) target = lock.fundingCutoff();
        else if (phase % 4 == 1) target = lock.claimCutoff();
        else if (phase % 4 == 2) target = uint256(lock.claimCutoff()) + 1;
        else target = lock.refundTime();
        if (target > block.timestamp) vm.warp(target);
    }
}

contract ConditionalLockInvariantTest is TestBase, InvariantTarget {
    bytes32 internal constant SWAP_ID = keccak256("invariant-swap");
    bytes32 internal constant TERMS_HASH = keccak256("invariant-terms");
    bytes32 internal constant PREIMAGE = bytes32(uint256(0xA70C));
    uint256 internal constant AMOUNT = 1_000e6;
    address internal constant FUNDER = address(0xF00D);
    address internal constant CLAIM_RECIPIENT = address(0xC1A1);

    QuoteToken internal token;
    ConditionalLock internal lock;
    ConditionalLockHandler internal handler;

    function setUp() public {
        token = new QuoteToken("Invariant Quote", "iQUOTE");
        lock = new ConditionalLock(
            SWAP_ID,
            TERMS_HASH,
            address(token),
            FUNDER,
            CLAIM_RECIPIENT,
            FUNDER,
            AMOUNT,
            sha256(abi.encode(PREIMAGE)),
            uint64(block.timestamp + 1 hours),
            uint64(block.timestamp + 2 hours),
            uint64(block.timestamp + 3 hours)
        );
        vm.prank(FUNDER);
        token.faucet(AMOUNT);

        handler = new ConditionalLockHandler(lock, IERC20(address(token)), FUNDER, CLAIM_RECIPIENT, PREIMAGE);
        bytes4[] memory selectors = new bytes4[](4);
        selectors[0] = ConditionalLockHandler.actFund.selector;
        selectors[1] = ConditionalLockHandler.actClaim.selector;
        selectors[2] = ConditionalLockHandler.actRefund.selector;
        selectors[3] = ConditionalLockHandler.advanceTime.selector;
        targetContract(address(handler));
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
    }

    function invariantOnlyTheFundedStateEscrowsTheExactAmount() public view {
        IConditionalLock.State current = lock.state();
        uint256 escrow = token.balanceOf(address(lock));
        if (current == IConditionalLock.State.Funded) assertEq(escrow, AMOUNT);
        else assertEq(escrow, 0);
    }

    function invariantTokenValueIsConservedAndTerminalRecipientIsExclusive() public view {
        uint256 funderBalance = token.balanceOf(FUNDER);
        uint256 claimBalance = token.balanceOf(CLAIM_RECIPIENT);
        uint256 escrow = token.balanceOf(address(lock));
        assertEq(funderBalance + claimBalance + escrow, AMOUNT);

        if (lock.state() == IConditionalLock.State.Claimed) {
            assertEq(claimBalance, AMOUNT);
            assertEq(funderBalance, 0);
        } else if (lock.state() == IConditionalLock.State.Refunded) {
            assertEq(funderBalance, AMOUNT);
            assertEq(claimBalance, 0);
        }
    }

    function invariantImmutableTermsNeverChange() public view {
        assertEq(lock.swapId(), SWAP_ID);
        assertEq(lock.termsHash(), TERMS_HASH);
        assertEq(lock.token(), address(token));
        assertEq(lock.funder(), FUNDER);
        assertEq(lock.claimRecipient(), CLAIM_RECIPIENT);
        assertEq(lock.refundRecipient(), FUNDER);
        assertEq(lock.amount(), AMOUNT);
        assertEq(lock.hashlock(), sha256(abi.encode(PREIMAGE)));
    }

    function invariantHandlerCallsNeverHitAnUnexpectedFailure() public view {
        assertLe(handler.successfulActions(), 2);
        assertEq(handler.unexpectedFailures(), 0);
    }
}
