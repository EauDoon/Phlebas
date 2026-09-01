// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity ^0.8.28;

/// @dev Minimal invariant-target configuration surface consumed by Forge.
abstract contract InvariantTarget {
    struct FuzzSelector {
        address addr;
        bytes4[] selectors;
    }

    struct FuzzArtifactSelector {
        string artifact;
        bytes4[] selectors;
    }

    struct FuzzInterface {
        address addr;
        string[] artifacts;
    }

    address[] private targetedContractStore;
    FuzzSelector[] private targetedSelectorStore;

    function targetContract(address target) internal {
        targetedContractStore.push(target);
    }

    function targetSelector(FuzzSelector memory selector) internal {
        targetedSelectorStore.push(selector);
    }

    function excludeArtifacts() public pure returns (string[] memory) {
        return new string[](0);
    }

    function excludeContracts() public pure returns (address[] memory) {
        return new address[](0);
    }

    function excludeSelectors() public pure returns (FuzzSelector[] memory) {
        return new FuzzSelector[](0);
    }

    function excludeSenders() public pure returns (address[] memory) {
        return new address[](0);
    }

    function targetArtifacts() public pure returns (string[] memory) {
        return new string[](0);
    }

    function targetArtifactSelectors() public pure returns (FuzzArtifactSelector[] memory) {
        return new FuzzArtifactSelector[](0);
    }

    function targetContracts() public view returns (address[] memory) {
        return targetedContractStore;
    }

    function targetSelectors() public view returns (FuzzSelector[] memory) {
        return targetedSelectorStore;
    }

    function targetSenders() public pure returns (address[] memory) {
        return new address[](0);
    }

    function targetInterfaces() public pure returns (FuzzInterface[] memory) {
        return new FuzzInterface[](0);
    }
}
