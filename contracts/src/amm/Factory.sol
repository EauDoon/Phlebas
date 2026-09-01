// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.28;

import {Pair} from "./Pair.sol";

/// @notice Creates only the two approved testnet pairs. No fee switch. Non-upgradeable.
contract Factory {
    address public immutable zec;
    address public immutable usdc;
    address public immutable usdt;

    mapping(address => mapping(address => address)) public getPair;
    address[2] public allPairs;
    uint256 public allPairsLength;

    error PairExists();
    error PairNotAllowed();
    error ZeroAddress();

    event PairCreated(address indexed zec, address indexed quote, address pair, uint256 pairCount);

    constructor(address zec_, address usdc_, address usdt_) {
        if (
            zec_ == address(0) || usdc_ == address(0) || usdt_ == address(0) || zec_.code.length == 0
                || usdc_.code.length == 0 || usdt_.code.length == 0
        ) revert ZeroAddress();
        if (zec_ == usdc_ || zec_ == usdt_ || usdc_ == usdt_) revert PairNotAllowed();
        zec = zec_;
        usdc = usdc_;
        usdt = usdt_;
    }

    function createPair(address quote) external returns (address pair) {
        if (quote != usdc && quote != usdt) revert PairNotAllowed();
        if (getPair[zec][quote] != address(0)) revert PairExists();
        pair = address(new Pair(zec, quote));
        getPair[zec][quote] = pair;
        getPair[quote][zec] = pair;
        allPairs[allPairsLength] = pair;
        allPairsLength += 1;
        emit PairCreated(zec, quote, pair, allPairsLength);
    }
}
