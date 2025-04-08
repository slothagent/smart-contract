// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

library FactoryLib {
    struct TokenInfo {
        string name;
        string symbol;
        address tokenAddress;
        address curveAddress;
        uint256 initialSupply;
        uint256 creationTime;
    }

} 