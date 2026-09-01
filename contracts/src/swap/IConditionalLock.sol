// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.28;

/// @title IConditionalLock
/// @notice Interface for the EVM half of a native ZEC atomic swap. One lock holds
///         exactly one ERC-20 stablecoin deposit for one matched fill. The
///         deposit is released to a fixed counterparty on a correct preimage
///         and returned to the funder after a chain-local refund deadline.
/// @dev    See docs/adr/0003-evm-conditional-lock.md. Non-upgradeable. No
///         admin transfer, fee, callback, or proxy surface.
interface IConditionalLock {
    /// @param token         Approved stablecoin (USDC or USDT0).
    /// @param amount        Token units locked. Strictly positive.
    /// @param hashlock      SHA-256 of the preimage. Strictly non-zero.
    /// @param refundAfter   Unix timestamp; refund allowed at or after this.
    /// @param refundTo      Recipient of the refund. Strictly non-zero.
    /// @param claimTo       Recipient of the claim. Strictly non-zero.
    struct LockParams {
        address token;
        uint256 amount;
        bytes32 hashlock;
        uint64 refundAfter;
        address refundTo;
        address claimTo;
    }

    struct Lock {
        address depositor;
        address token;
        uint256 amount;
        bytes32 hashlock;
        uint64 refundAfter;
        address refundTo;
        address claimTo;
        bool claimed;
        bool refunded;
    }

    event Deposited(
        uint256 indexed lockId,
        address indexed depositor,
        address indexed token,
        uint256 amount,
        bytes32 hashlock,
        uint64 refundAfter,
        address refundTo,
        address claimTo
    );
    event Claimed(uint256 indexed lockId, address indexed claimTo, uint256 amount);
    event Refunded(uint256 indexed lockId, address indexed refundTo, uint256 amount);
    event PauseSet(bool paused);

    error Paused();
    error NotPauser();
    error NotGovernor();
    error TokenNotApproved();
    error ZeroAmount();
    error ZeroHashlock();
    error ZeroAddress();
    error RefundDelayTooShort(uint64 refundAfter, uint64 minimum);
    error LockNotFound();
    error AlreadyClaimed();
    error AlreadyRefunded();
    error WrongPreimage();
    error RefundTooEarly(uint64 refundAfter, uint256 current);
    error NotDepositor();
    error NotClaimant();
    error TransferFailed();
    error Locked();
    error InvalidConfiguration();

    function usdc() external view returns (address);
    function usdt0() external view returns (address);
    function pauser() external view returns (address);
    function governor() external view returns (address);
    function paused() external view returns (bool);
    function MIN_REFUND_DELAY() external view returns (uint64);
    function nextLockId() external view returns (uint256);

    function pause() external;
    function unpause() external;

    function deposit(LockParams calldata params) external returns (uint256 lockId);
    function claim(uint256 lockId, bytes32 preimage) external;
    function refund(uint256 lockId) external;

    function getLock(uint256 lockId) external view returns (Lock memory);
    function verifyPreimage(uint256 lockId, bytes32 preimage) external view returns (bool);
}
