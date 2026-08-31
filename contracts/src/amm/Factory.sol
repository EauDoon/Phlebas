// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.28;

import {Pair} from "./Pair.sol";

/// @notice Creates only the two approved testnet pairs. No fee switch. Non-upgradeable.
contract Factory {
    address public immutable pzec;
    address public immutable usdc;
    address public immutable usdt;

    mapping(address => mapping(address => address)) public getPair;
    address[2] public allPairs;

    error PairExists();
    error PairNotAllowed();
    error ZeroAddress();

    constructor(address pzec_, address usdc_, address usdt_) {
        if (pzec_ == address(0) || usdc_ == address(0) || usdt_ == address(0)) revert ZeroAddress();
        if (pzec_ == usdc_ || pzec_ == usdt_ || usdc_ == usdt_) revert PairNotAllowed();
        pzec = pzec_;
        usdc = usdc_;
        usdt = usdt_;
    }

    function allPairsLength() external view returns (uint256) {
        uint256 count;
        if (allPairs[0] != address(0)) count = 1;
        if (allPairs[1] != address(0)) count = 2;
        return count;
    }

    function createPair(address quote) external returns (address pair) {
        if (quote != usdc && quote != usdt) revert PairNotAllowed();
        if (getPair[pzec][quote] != address(0)) revert PairExists();
        pair = address(new Pair(pzec, quote));
        getPair[pzec][quote] = pair;
        getPair[quote][pzec] = pair;
        allPairs[quote == usdc ? 0 : 1] = pair;
    }
}
