// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {ERC20} from "../token/ERC20.sol";

interface IERC20Minimal {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address owner) external view returns (uint256);
}

/// @notice Constant-product pair. Fixed 30 bps. No callbacks, flash, or hooks.
contract Pair is ERC20 {
    uint16 public constant FEE_BPS = 30;
    uint16 public constant BPS = 10_000;

    address public immutable factory;
    address public immutable pzec;
    address public immutable quote;

    uint256 public reservePzec;
    uint256 public reserveQuote;
    bool private locked;

    error Locked();
    error K();
    error InsufficientLiquidity();
    error InsufficientOutput();

    modifier lock() {
        if (locked) revert Locked();
        locked = true;
        _;
        locked = false;
    }

    constructor(address pzec_, address quote_) ERC20("Phlebas Testnet LP", "tpLP", 18) {
        factory = msg.sender;
        pzec = pzec_;
        quote = quote_;
    }

    function getReserves() external view returns (uint256, uint256) {
        return (reservePzec, reserveQuote);
    }

    function mint(address to) external lock returns (uint256 shares) {
        uint256 balancePzec = IERC20Minimal(pzec).balanceOf(address(this));
        uint256 balanceQuote = IERC20Minimal(quote).balanceOf(address(this));
        uint256 inPzec = balancePzec - reservePzec;
        uint256 inQuote = balanceQuote - reserveQuote;
        if (inPzec == 0 || inQuote == 0) revert InsufficientLiquidity();

        if (totalSupply == 0) {
            shares = inPzec;
        } else {
            shares = (inPzec * totalSupply) / reservePzec;
            uint256 requiredQuote = (inPzec * reserveQuote) / reservePzec;
            if (inQuote < requiredQuote) revert InsufficientLiquidity();
        }
        if (shares == 0) revert InsufficientLiquidity();
        _mint(to, shares);
        _setReserves(balancePzec, balanceQuote);
    }

    function burn(address to) external lock returns (uint256 outPzec, uint256 outQuote) {
        uint256 shares = balanceOf[address(this)];
        if (shares == 0 || totalSupply == 0) revert InsufficientLiquidity();
        outPzec = (shares * reservePzec) / totalSupply;
        outQuote = (shares * reserveQuote) / totalSupply;
        if (outPzec == 0 || outQuote == 0) revert InsufficientLiquidity();
        _burn(address(this), shares);
        _safeTransfer(pzec, to, outPzec);
        _safeTransfer(quote, to, outQuote);
        _setReserves(IERC20Minimal(pzec).balanceOf(address(this)), IERC20Minimal(quote).balanceOf(address(this)));
    }

    function swap(bool pzecIn, uint256 minOut, address to) external lock returns (uint256 amountOut) {
        if (to == pzec || to == quote || to == address(this)) revert("Pair: to");
        address tokenIn = pzecIn ? pzec : quote;
        address tokenOut = pzecIn ? quote : pzec;
        uint256 reserveIn = pzecIn ? reservePzec : reserveQuote;
        uint256 reserveOut = pzecIn ? reserveQuote : reservePzec;
        uint256 amountIn = IERC20Minimal(tokenIn).balanceOf(address(this)) - reserveIn;
        if (amountIn == 0) revert InsufficientOutput();
        amountOut = quoteOut(amountIn, reserveIn, reserveOut);
        if (amountOut < minOut || amountOut == 0 || amountOut >= reserveOut) revert InsufficientOutput();
        if (!_productHolds(amountIn, reserveIn, reserveOut, amountOut)) revert K();
        _safeTransfer(tokenOut, to, amountOut);
        _setReserves(
            IERC20Minimal(pzec).balanceOf(address(this)),
            IERC20Minimal(quote).balanceOf(address(this))
        );
    }

    function quoteOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut) public pure returns (uint256) {
        if (amountIn == 0 || reserveIn == 0 || reserveOut == 0) revert InsufficientLiquidity();
        uint256 amountInWithFee = amountIn * (BPS - FEE_BPS);
        return (amountInWithFee * reserveOut) / (reserveIn * BPS + amountInWithFee);
    }

    function _productHolds(uint256 amountIn, uint256 reserveIn, uint256 reserveOut, uint256 amountOut)
        internal
        pure
        returns (bool)
    {
        uint256 x = reserveIn + amountIn;
        uint256 y = reserveOut - amountOut;
        return (x * BPS - amountIn * FEE_BPS) * (y * BPS) >= reserveIn * reserveOut * BPS * BPS;
    }

    function _setReserves(uint256 nextPzec, uint256 nextQuote) internal {
        reservePzec = nextPzec;
        reserveQuote = nextQuote;
    }

    function _safeTransfer(address token, address to, uint256 amount) internal {
        if (!IERC20Minimal(token).transfer(to, amount)) revert("Pair: transfer");
    }

}
