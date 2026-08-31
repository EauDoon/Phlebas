// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {ERC20} from "./ERC20.sol";

/// @notice Testnet faucet quote token. Not Circle USDC or USDT0.
contract QuoteToken is ERC20 {
    uint256 public constant FAUCET_MAX = 10_000 * 1e6;

    constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_, 6) {}

    function faucet(uint256 amount) external {
        if (amount == 0 || amount > FAUCET_MAX) revert("QuoteToken: faucet");
        _mint(msg.sender, amount);
    }
}
