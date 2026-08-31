// SPDX-License-Identifier: Apache-2.0
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
    address public immutable zec;
    address public immutable quote;

    uint256 public reserveZec;
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

    constructor(address zec_, address quote_) ERC20("Phlebas Testnet LP", "tpLP", 18) {
        factory = msg.sender;
        zec = zec_;
        quote = quote_;
    }

    function getReserves() external view returns (uint256, uint256) {
        return (reserveZec, reserveQuote);
    }

    function mint(address to) external lock returns (uint256 shares) {
        uint256 balanceZec = IERC20Minimal(zec).balanceOf(address(this));
        uint256 balanceQuote = IERC20Minimal(quote).balanceOf(address(this));
        uint256 inZec = balanceZec - reserveZec;
        uint256 inQuote = balanceQuote - reserveQuote;
        if (inZec == 0 || inQuote == 0) revert InsufficientLiquidity();

        if (totalSupply == 0) {
            shares = inZec;
        } else {
            shares = (inZec * totalSupply) / reserveZec;
            uint256 requiredQuote = (inZec * reserveQuote) / reserveZec;
            if (inQuote < requiredQuote) revert InsufficientLiquidity();
        }
        if (shares == 0) revert InsufficientLiquidity();
        _mint(to, shares);
        _setReserves(balanceZec, balanceQuote);
    }

    function burn(address to) external lock returns (uint256 outZec, uint256 outQuote) {
        uint256 shares = balanceOf[address(this)];
        if (shares == 0 || totalSupply == 0) revert InsufficientLiquidity();
        outZec = (shares * reserveZec) / totalSupply;
        outQuote = (shares * reserveQuote) / totalSupply;
        if (outZec == 0 || outQuote == 0) revert InsufficientLiquidity();
        _burn(address(this), shares);
        _safeTransfer(zec, to, outZec);
        _safeTransfer(quote, to, outQuote);
        _setReserves(IERC20Minimal(zec).balanceOf(address(this)), IERC20Minimal(quote).balanceOf(address(this)));
    }

    function swap(bool zecIn, uint256 minOut, address to) external lock returns (uint256 amountOut) {
        if (to == zec || to == quote || to == address(this)) revert("Pair: to");
        address tokenIn = zecIn ? zec : quote;
        address tokenOut = zecIn ? quote : zec;
        uint256 reserveIn = zecIn ? reserveZec : reserveQuote;
        uint256 reserveOut = zecIn ? reserveQuote : reserveZec;
        uint256 amountIn = IERC20Minimal(tokenIn).balanceOf(address(this)) - reserveIn;
        if (amountIn == 0) revert InsufficientOutput();
        amountOut = quoteOut(amountIn, reserveIn, reserveOut);
        if (amountOut < minOut || amountOut == 0 || amountOut >= reserveOut) revert InsufficientOutput();
        if (!_productHolds(amountIn, reserveIn, reserveOut, amountOut)) revert K();
        _safeTransfer(tokenOut, to, amountOut);
        _setReserves(
            IERC20Minimal(zec).balanceOf(address(this)),
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

    function _setReserves(uint256 nextZec, uint256 nextQuote) internal {
        reserveZec = nextZec;
        reserveQuote = nextQuote;
    }

    function _safeTransfer(address token, address to, uint256 amount) internal {
        if (!IERC20Minimal(token).transfer(to, amount)) revert("Pair: transfer");
    }

}
