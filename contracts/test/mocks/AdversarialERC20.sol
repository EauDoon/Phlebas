// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.28;

contract AdversarialERC20 {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    uint256 public totalSupply;
    uint16 public feeBps;
    bool public returnFalse;
    bool public noOp;
    bool public revertTransfer;
    address public callbackTarget;
    bytes public callbackData;
    bool public callbackSucceeded;
    bytes public callbackReturnData;

    error TransferReverted();
    error InsufficientBalance();
    error InsufficientAllowance();

    function mint(address recipient, uint256 value) external {
        totalSupply += value;
        balanceOf[recipient] += value;
    }

    function setBehavior(uint16 feeBps_, bool returnFalse_, bool noOp_, bool revertTransfer_) external {
        feeBps = feeBps_;
        returnFalse = returnFalse_;
        noOp = noOp_;
        revertTransfer = revertTransfer_;
    }

    function setCallback(address target, bytes calldata data) external {
        callbackTarget = target;
        callbackData = data;
        callbackSucceeded = false;
        delete callbackReturnData;
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        return true;
    }

    function transfer(address recipient, uint256 value) external virtual returns (bool) {
        _callback();
        return _transfer(msg.sender, recipient, value);
    }

    function transferFrom(address sender, address recipient, uint256 value) external virtual returns (bool) {
        _callback();
        if (allowance[sender][msg.sender] < value) revert InsufficientAllowance();
        allowance[sender][msg.sender] -= value;
        return _transfer(sender, recipient, value);
    }

    function _callback() private {
        if (callbackTarget == address(0)) return;
        (callbackSucceeded, callbackReturnData) = callbackTarget.call(callbackData);
    }

    function _transfer(address sender, address recipient, uint256 value) private returns (bool) {
        if (revertTransfer) revert TransferReverted();
        if (returnFalse) return false;
        if (noOp) return true;
        if (balanceOf[sender] < value) revert InsufficientBalance();

        uint256 fee = (value * feeBps) / 10_000;
        balanceOf[sender] -= value;
        balanceOf[recipient] += value - fee;
        totalSupply -= fee;
        return true;
    }
}

/// @notice Models legacy USDT-style transfer functions with no return value.
contract NoReturnERC20 {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    error InsufficientBalance();
    error InsufficientAllowance();

    function mint(address recipient, uint256 value) external {
        balanceOf[recipient] += value;
    }

    function approve(address spender, uint256 value) external {
        allowance[msg.sender][spender] = value;
    }

    function transfer(address recipient, uint256 value) external {
        _move(msg.sender, recipient, value);
    }

    function transferFrom(address sender, address recipient, uint256 value) external {
        if (allowance[sender][msg.sender] < value) revert InsufficientAllowance();
        allowance[sender][msg.sender] -= value;
        _move(sender, recipient, value);
    }

    function _move(address sender, address recipient, uint256 value) private {
        if (balanceOf[sender] < value) revert InsufficientBalance();
        balanceOf[sender] -= value;
        balanceOf[recipient] += value;
    }
}

/// @notice Returns one byte instead of an ABI-encoded bool.
contract MalformedReturnERC20 is AdversarialERC20 {
    function transfer(address, uint256) external pure override returns (bool) {
        assembly ("memory-safe") {
            mstore(0, 1)
            return(31, 1)
        }
    }

    function transferFrom(address, address, uint256) external pure override returns (bool) {
        assembly ("memory-safe") {
            mstore(0, 1)
            return(31, 1)
        }
    }
}
