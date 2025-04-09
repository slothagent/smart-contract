// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface ISlothToken {
    function isLaunched() external view returns (bool);
    function setEndLaunching() external;
} 