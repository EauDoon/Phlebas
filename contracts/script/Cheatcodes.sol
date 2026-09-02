// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.28;

interface Vm {
    function envAddress(string calldata name) external view returns (address);
    function envString(string calldata name) external view returns (string memory);
    function startBroadcast() external;
    function startBroadcast(address signer) external;
    function stopBroadcast() external;
}

contract ScriptBase {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
}
