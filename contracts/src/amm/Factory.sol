// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {Pair} from "./Pair.sol";

/// @notice Creates only the two approved testnet pairs. No fee switch. Non-upgradeable.
contract Factory {
    address public immutable pzec;
    address public immutable usdc;
    address public immutable usdt0;

    mapping(address => mapping(address => address)) public getPair;
    address[2] public allPairs;

    error PairExists();
    error PairNotAllowed();
    error ZeroAddress();

    constructor(address pzec_, address usdc_, address usdt0_) {
        if (pzec_ == address(0) || usdc_ == address(0) || usdt0_ == address(0)) revert ZeroAddress();
        if (pzec_ == usdc_ || pzec_ == usdt0_ || usdc_ == usdt0_) revert PairNotAllowed();
        pzec = pzec_;
        usdc = usdc_;
        usdt0 = usdt0_;
    }

    function allPairsLength() external view returns (uint256) {
        uint256 count;
        if (allPairs[0] != address(0)) count = 1;
        if (allPairs[1] != address(0)) count = 2;
        return count;
    }

    function createPair(address quote) external returns (address pair) {
        if (quote != usdc && quote != usdt0) revert PairNotAllowed();
        if (getPair[pzec][quote] != address(0)) revert PairExists();
        pair = address(new Pair(pzec, quote));
        getPair[pzec][quote] = pair;
        getPair[quote][pzec] = pair;
        allPairs[quote == usdc ? 0 : 1] = pair;
    }
}
