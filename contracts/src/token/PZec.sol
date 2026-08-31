// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.28;

import {ERC20} from "./ERC20.sol";

/// @notice Testnet-only 8-decimal pZEC. Not native ZEC. Mint is minter-gated.
contract PZec is ERC20 {
    uint256 public constant MAX_SUPPLY = 21_000_000 * 1e8;

    address public immutable minter;
    address public immutable pauser;
    address public immutable governor;
    bool public mintPaused;

    error NotMinter();
    error NotPauser();
    error NotGovernor();
    error MintPaused();
    error SupplyCap();

    event MintPauseSet(bool paused);

    constructor(address minter_, address pauser_, address governor_) ERC20("Phlebas Testnet pZEC", "tpZEC", 8) {
        if (minter_ == address(0) || pauser_ == address(0) || governor_ == address(0)) {
            revert("PZec: zero role");
        }
        minter = minter_;
        pauser = pauser_;
        governor = governor_;
    }

    function mint(address to, uint256 amount) external {
        if (msg.sender != minter) revert NotMinter();
        if (mintPaused) revert MintPaused();
        if (amount > MAX_SUPPLY - totalSupply) revert SupplyCap();
        _mint(to, amount);
    }

    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
    }

    function pauseMint() external {
        if (msg.sender != pauser) revert NotPauser();
        mintPaused = true;
        emit MintPauseSet(true);
    }

    function unpauseMint() external {
        if (msg.sender != governor) revert NotGovernor();
        mintPaused = false;
        emit MintPauseSet(false);
    }
}
