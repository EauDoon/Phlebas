// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.28;

interface Vm {
    function addr(uint256 privateKey) external returns (address);
    function sign(uint256 privateKey, bytes32 digest) external pure returns (uint8 v, bytes32 r, bytes32 s);
    function prank(address msgSender) external;
    function startPrank(address msgSender) external;
    function stopPrank() external;
    function warp(uint256 newTimestamp) external;
    function assume(bool condition) external;
    function expectRevert() external;
    function expectRevert(bytes4) external;
    function expectRevert(bytes calldata) external;
    function expectEmit(bool checkTopic1, bool checkTopic2, bool checkTopic3, bool checkData) external;
    function expectEmit(bool checkTopic1, bool checkTopic2, bool checkTopic3, bool checkData, address emitter) external;
    function envAddress(string calldata name) external view returns (address);
    function startBroadcast(address signer) external;
    function stopBroadcast() external;
    function serializeAddress(string calldata objectKey, string calldata valueKey, address value)
        external
        returns (string memory);
}

contract TestBase {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function assertEq(uint256 left, uint256 right) internal pure {
        require(left == right, "uint neq");
    }

    function assertEq(bytes32 left, bytes32 right) internal pure {
        require(left == right, "bytes32 neq");
    }

    function assertEq(string memory left, string memory right) internal pure {
        require(keccak256(bytes(left)) == keccak256(bytes(right)), "string neq");
    }

    function assertEq(address left, address right) internal pure {
        require(left == right, "address neq");
    }

    function assertGt(uint256 left, uint256 right) internal pure {
        require(left > right, "not gt");
    }

    function assertEq(address left, address right) internal pure {
        require(left == right, "address neq");
    }

    function assertEq(bool left, bool right) internal pure {
        require(left == right, "bool neq");
    }

    function assertTrue(bool value) internal pure {
        require(value, "not true");
    }

    function assertFalse(bool value) internal pure {
        require(!value, "not false");
    }

    function assertLe(uint256 left, uint256 right) internal pure {
        require(left <= right, "not le");
    }
}
