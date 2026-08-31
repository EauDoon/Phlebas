// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IConditionalLock} from "./IConditionalLock.sol";

/// @title ConditionalLock
/// @notice One immutable exact-token lock for one native-ZEC atomic-swap fill.
/// @dev The contract has no proxy, administrator, fee, arbitrary recipient,
///      token substitution, callback entry point, or native-value path.
contract ConditionalLock is IConditionalLock, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public immutable swapId;
    bytes32 public immutable termsHash;
    address public immutable token;
    address public immutable funder;
    address public immutable claimRecipient;
    address public immutable refundRecipient;
    uint256 public immutable amount;
    bytes32 public immutable hashlock;
    uint64 public immutable fundingCutoff;
    uint64 public immutable claimCutoff;
    uint64 public immutable refundTime;

    State public state;

    constructor(
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
    ) {
        if (swapId_ == bytes32(0)) revert InvalidSwapId();
        if (termsHash_ == bytes32(0)) revert InvalidTermsHash();
        if (token_ == address(0) || token_.code.length == 0) revert InvalidToken();
        if (amount_ == 0) revert InvalidAmount();
        if (hashlock_ == bytes32(0)) revert InvalidHashlock();
        if (
            funder_ == address(0) || claimRecipient_ == address(0) || refundRecipient_ == address(0)
                || funder_ == claimRecipient_ || funder_ == token_ || claimRecipient_ == token_
                || funder_ == address(this) || claimRecipient_ == address(this)
        ) revert InvalidRole();
        if (refundRecipient_ != funder_) revert RefundRecipientNotFunder();
        if (fundingCutoff_ <= block.timestamp || fundingCutoff_ >= claimCutoff_ || claimCutoff_ >= refundTime_) {
            revert InvalidTimeline();
        }

        swapId = swapId_;
        termsHash = termsHash_;
        token = token_;
        funder = funder_;
        claimRecipient = claimRecipient_;
        refundRecipient = refundRecipient_;
        amount = amount_;
        hashlock = hashlock_;
        fundingCutoff = fundingCutoff_;
        claimCutoff = claimCutoff_;
        refundTime = refundTime_;

        emit LockCreated(
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

    /// @notice Pulls the exact immutable amount from the immutable funder.
    function fund() external nonReentrant {
        if (msg.sender != funder) revert OnlyFunder();
        _requireState(State.Unfunded);
        if (block.timestamp > fundingCutoff) revert FundingClosed(fundingCutoff, block.timestamp);

        state = State.Funded;
        IERC20 lockedToken = IERC20(token);
        uint256 balanceBefore = lockedToken.balanceOf(address(this));
        lockedToken.safeTransferFrom(funder, address(this), amount);
        uint256 balanceAfter = lockedToken.balanceOf(address(this));
        if (balanceAfter < balanceBefore || balanceAfter - balanceBefore != amount) {
            revert InexactTransferIn(amount, balanceBefore, balanceAfter);
        }

        emit Funded(swapId, funder, token, amount);
    }

    /// @notice Releases the exact locked amount to the immutable claim recipient.
    function claim(bytes32 preimage) external nonReentrant {
        if (msg.sender != claimRecipient) revert OnlyClaimRecipient();
        _requireState(State.Funded);
        if (block.timestamp > claimCutoff) revert ClaimClosed(claimCutoff, block.timestamp);
        if (!_verifyPreimage(preimage)) revert WrongPreimage();

        state = State.Claimed;
        _transferExact(claimRecipient);
        emit Claimed(swapId, claimRecipient, amount);
    }

    /// @notice Returns the exact locked amount to the original funder.
    function refund() external nonReentrant {
        if (msg.sender != funder) revert OnlyFunder();
        _requireState(State.Funded);
        if (block.timestamp < refundTime) revert RefundNotAvailable(refundTime, block.timestamp);

        state = State.Refunded;
        _transferExact(refundRecipient);
        emit Refunded(swapId, refundRecipient, amount);
    }

    function verifyPreimage(bytes32 preimage) external view returns (bool) {
        return _verifyPreimage(preimage);
    }

    function _verifyPreimage(bytes32 preimage) internal view returns (bool) {
        return sha256(abi.encode(preimage)) == hashlock;
    }

    function _requireState(State expected) internal view {
        State actual = state;
        if (actual != expected) revert InvalidState(expected, actual);
    }

    function _transferExact(address recipient) internal {
        IERC20 lockedToken = IERC20(token);
        uint256 contractBalanceBefore = lockedToken.balanceOf(address(this));
        uint256 recipientBalanceBefore = lockedToken.balanceOf(recipient);

        lockedToken.safeTransfer(recipient, amount);

        uint256 contractBalanceAfter = lockedToken.balanceOf(address(this));
        uint256 recipientBalanceAfter = lockedToken.balanceOf(recipient);
        if (
            contractBalanceAfter > contractBalanceBefore || recipientBalanceAfter < recipientBalanceBefore
                || contractBalanceBefore - contractBalanceAfter != amount
                || recipientBalanceAfter - recipientBalanceBefore != amount
        ) {
            revert InexactTransferOut(
                amount,
                contractBalanceBefore,
                contractBalanceAfter,
                recipientBalanceBefore,
                recipientBalanceAfter
            );
        }
    }
}
