// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.28;

import {IConditionalLock} from "./IConditionalLock.sol";

interface IERC20ConditionalLock {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}

/// @title ConditionalLock
/// @notice EVM half of a native ZEC atomic swap. One lock per matched fill.
///         A user-funded stablecoin deposit is released to a fixed counterparty
///         on a correct SHA-256 preimage, or returned to the funder after a
///         chain-local refund deadline. Non-upgradeable. No admin transfer,
///         fee, callback, oracle, or proxy path.
/// @dev    See docs/adr/0003-evm-conditional-lock.md.
contract ConditionalLock is IConditionalLock {
    uint64 public constant MIN_REFUND_DELAY = 1 hours;
    address public immutable usdc;
    address public immutable usdt0;
    address public immutable pauser;
    address public immutable governor;
    bool public paused;
    bool private locked;
    uint256 public nextLockId;

    mapping(uint256 => Lock) public locks;

    modifier lock() {
        if (locked) revert Locked();
        locked = true;
        _;
        locked = false;
    }

    constructor(address usdc_, address usdt0_, address pauser_, address governor_) {
        if (
            usdc_ == address(0) || usdt0_ == address(0) || pauser_ == address(0) || governor_ == address(0)
                || usdc_ == usdt0_ || usdc_.code.length == 0 || usdt0_.code.length == 0
        ) revert InvalidConfiguration();
        usdc = usdc_;
        usdt0 = usdt0_;
        pauser = pauser_;
        governor = governor_;
        nextLockId = 1;
    }

    function pause() external {
        if (msg.sender != pauser) revert NotPauser();
        paused = true;
        emit PauseSet(true);
    }

    function unpause() external {
        if (msg.sender != governor) revert NotGovernor();
        paused = false;
        emit PauseSet(false);
    }

    function deposit(LockParams calldata params) external lock returns (uint256 lockId) {
        if (paused) revert Paused();
        if (params.token != usdc && params.token != usdt0) revert TokenNotApproved();
        if (params.amount == 0) revert ZeroAmount();
        if (params.hashlock == bytes32(0)) revert ZeroHashlock();
        if (params.refundTo == address(0) || params.claimTo == address(0)) revert ZeroAddress();
        if (params.refundAfter <= block.timestamp + MIN_REFUND_DELAY) {
            revert RefundDelayTooShort(params.refundAfter, uint64(block.timestamp) + MIN_REFUND_DELAY);
        }

        lockId = nextLockId;
        nextLockId = lockId + 1;
        locks[lockId] = Lock({
            depositor: msg.sender,
            token: params.token,
            amount: params.amount,
            hashlock: params.hashlock,
            refundAfter: params.refundAfter,
            refundTo: params.refundTo,
            claimTo: params.claimTo,
            claimed: false,
            refunded: false
        });

        if (!_transferFrom(params.token, msg.sender, address(this), params.amount)) revert TransferFailed();

        emit Deposited(
            lockId,
            msg.sender,
            params.token,
            params.amount,
            params.hashlock,
            params.refundAfter,
            params.refundTo,
            params.claimTo
        );
    }

    function claim(uint256 lockId, bytes32 preimage) external lock {
        Lock memory l = _loadLock(lockId);
        if (l.claimed) revert AlreadyClaimed();
        if (l.refunded) revert AlreadyRefunded();
        if (msg.sender != l.claimTo) revert NotClaimant();
        if (!_verifyPreimage(l.hashlock, preimage)) revert WrongPreimage();

        locks[lockId].claimed = true;
        if (!_transfer(l.token, l.claimTo, l.amount)) revert TransferFailed();
        emit Claimed(lockId, l.claimTo, l.amount);
    }

    function refund(uint256 lockId) external lock {
        Lock memory l = _loadLock(lockId);
        if (l.claimed) revert AlreadyClaimed();
        if (l.refunded) revert AlreadyRefunded();
        if (msg.sender != l.depositor) revert NotDepositor();
        if (block.timestamp < l.refundAfter) revert RefundTooEarly(l.refundAfter, block.timestamp);

        locks[lockId].refunded = true;
        if (!_transfer(l.token, l.refundTo, l.amount)) revert TransferFailed();
        emit Refunded(lockId, l.refundTo, l.amount);
    }

    function getLock(uint256 lockId) external view returns (Lock memory) {
        return _loadLock(lockId);
    }

    function verifyPreimage(uint256 lockId, bytes32 preimage) external view returns (bool) {
        if (lockId == 0 || lockId >= nextLockId) return false;
        return _verifyPreimage(locks[lockId].hashlock, preimage);
    }

    function _loadLock(uint256 lockId) internal view returns (Lock memory) {
        if (lockId == 0 || lockId >= nextLockId) revert LockNotFound();
        return locks[lockId];
    }

    function _verifyPreimage(bytes32 hashlock, bytes32 preimage) internal pure returns (bool) {
        bytes32 digest = _sha256(preimage);
        return digest == hashlock;
    }

    function _sha256(bytes32 data) internal pure returns (bytes32) {
        return sha256(abi.encodePacked(data));
    }

    function _transferFrom(address token, address from, address to, uint256 amount) internal returns (bool) {
        (bool ok, bytes memory out) =
            token.call(abi.encodeCall(IERC20ConditionalLock.transferFrom, (from, to, amount)));
        return ok && (out.length == 0 || (out.length == 32 && abi.decode(out, (bool))));
    }

    function _transfer(address token, address to, uint256 amount) internal returns (bool) {
        (bool ok, bytes memory out) =
            token.call(abi.encodeCall(IERC20ConditionalLock.transfer, (to, amount)));
        return ok && (out.length == 0 || (out.length == 32 && abi.decode(out, (bool))));
    }
}
