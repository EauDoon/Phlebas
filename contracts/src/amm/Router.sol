// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.28;

import {Factory} from "./Factory.sol";
import {Pair} from "./Pair.sol";

interface IERC20Router {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address owner) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
}

/// @notice Stateless AMM router. Cannot retain balances. No callbacks.
contract Router {
    Factory public immutable factory;
    address public immutable pzec;
    address public pauser;
    address public governor;
    bool public paused;

    error Paused();
    error Expired();
    error Slippage();
    error Residual();
    error NotPauser();
    error NotGovernor();

    constructor(Factory factory_, address pauser_, address governor_) {
        factory = factory_;
        pzec = factory_.pzec();
        pauser = pauser_;
        governor = governor_;
    }

    modifier whenLive() {
        if (paused) revert Paused();
        _;
    }

    function pause() external {
        if (msg.sender != pauser) revert NotPauser();
        paused = true;
    }

    function unpause() external {
        if (msg.sender != governor) revert NotGovernor();
        paused = false;
    }

    function addLiquidity(address quote, uint256 pzecIn, uint256 quoteIn, address to, uint256 deadline)
        external
        whenLive
        returns (uint256 shares)
    {
        if (block.timestamp > deadline) revert Expired();
        Pair pair = Pair(_pair(quote));
        _pull(pzec, msg.sender, address(pair), pzecIn);
        _pull(quote, msg.sender, address(pair), quoteIn);
        shares = pair.mint(to);
        _assertEmpty();
    }

    function removeLiquidity(address quote, uint256 shares, uint256 minPzec, uint256 minQuote, address to, uint256 deadline)
        external
        whenLive
        returns (uint256 outPzec, uint256 outQuote)
    {
        if (block.timestamp > deadline) revert Expired();
        Pair pair = Pair(_pair(quote));
        _pull(address(pair), msg.sender, address(pair), shares);
        (outPzec, outQuote) = pair.burn(to);
        if (outPzec < minPzec || outQuote < minQuote) revert Slippage();
        _assertEmpty();
    }

    function swapExactIn(address tokenIn, address tokenOut, uint256 amountIn, uint256 minOut, address to, uint256 deadline)
        external
        whenLive
        returns (uint256 amountOut)
    {
        if (block.timestamp > deadline) revert Expired();
        if (to == address(this)) revert Residual();
        if ((tokenIn == pzec) == (tokenOut == pzec)) revert("Router: pair");
        address quote = tokenIn == pzec ? tokenOut : tokenIn;
        Pair pair = Pair(_pair(quote));
        bool pzecIn = tokenIn == pzec;
        _pull(tokenIn, msg.sender, address(pair), amountIn);
        amountOut = pair.swap(pzecIn, minOut, to);
        _assertEmpty();
    }

    function _pair(address quote) internal view returns (address pair) {
        pair = factory.getPair(pzec, quote);
        if (pair == address(0)) revert("Router: pair");
    }

    function _pull(address token, address from, address to, uint256 amount) internal {
        if (!IERC20Router(token).transferFrom(from, to, amount)) revert("Router: pull");
    }

    function _assertEmpty() internal view {
        if (IERC20Router(pzec).balanceOf(address(this)) != 0) revert Residual();
        if (IERC20Router(factory.usdc()).balanceOf(address(this)) != 0) revert Residual();
        if (IERC20Router(factory.usdt0()).balanceOf(address(this)) != 0) revert Residual();
    }
}
