// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.28;

/// @title IConditionalLock
/// @notice One immutable EVM stablecoin lock for one native-ZEC atomic-swap fill.
interface IConditionalLock {
    enum State {
        Unfunded,
        Funded,
        Claimed,
        Refunded
    }

    event LockCreated(
        bytes32 indexed swapId,
        bytes32 indexed termsHash,
        address indexed token,
        address funder,
        address claimRecipient,
        address refundRecipient,
        uint256 amount,
        bytes32 hashlock,
        uint64 fundingCutoff,
        uint64 claimCutoff,
        uint64 refundTime
    );
    event Funded(bytes32 indexed swapId, address indexed funder, address indexed token, uint256 amount);
    event Claimed(bytes32 indexed swapId, address indexed claimRecipient, uint256 amount);
    event Refunded(bytes32 indexed swapId, address indexed refundRecipient, uint256 amount);

    error InvalidSwapId();
    error InvalidTermsHash();
    error InvalidToken();
    error InvalidAmount();
    error InvalidHashlock();
    error InvalidRole();
    error RefundRecipientNotFunder();
    error InvalidTimeline();
    error OnlyFunder();
    error OnlyClaimRecipient();
    error FundingClosed(uint64 fundingCutoff, uint256 currentTime);
    error ClaimClosed(uint64 claimCutoff, uint256 currentTime);
    error RefundNotAvailable(uint64 refundTime, uint256 currentTime);
    error InvalidState(State expected, State actual);
    error WrongPreimage();
    error InexactTransferIn(uint256 expected, uint256 balanceBefore, uint256 balanceAfter);
    error InexactTransferOut(
        uint256 expected,
        uint256 contractBalanceBefore,
        uint256 contractBalanceAfter,
        uint256 recipientBalanceBefore,
        uint256 recipientBalanceAfter
    );

    function swapId() external view returns (bytes32);
    function termsHash() external view returns (bytes32);
    function token() external view returns (address);
    function funder() external view returns (address);
    function claimRecipient() external view returns (address);
    function refundRecipient() external view returns (address);
    function amount() external view returns (uint256);
    function hashlock() external view returns (bytes32);
    function fundingCutoff() external view returns (uint64);
    function claimCutoff() external view returns (uint64);
    function refundTime() external view returns (uint64);
    function state() external view returns (State);

    function fund() external;
    function claim(bytes32 preimage) external;
    function refund() external;
    function verifyPreimage(bytes32 preimage) external view returns (bool);
}
