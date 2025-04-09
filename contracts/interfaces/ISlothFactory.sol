// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

interface ISlothFactory {
    struct InitializationParams {
        address slothImplementation;
        address uniswapV2Factory;
        address native;
        address signerAddress;
        address feeTo;
        uint256 tradingFeeRate;
        uint256 listingFeeRate;
        uint256 creationFee;
        uint256 tokenOffset;
        uint256 nativeOffset;
        uint256 totalSupply;
        uint256 saleAmount;
    }

    struct SlothCreationParams {
        string name;
        string symbol;
        uint256 tokenId;
        uint256 initialDeposit;
    }

    function feeTo() external view returns (address);
    function tradingFeeRate() external view returns (uint256);
    function creationFee() external view returns (uint256);
    function listingFeeRate() external view returns (uint256);
    function bridge() external view returns (address);
    function signerAddress() external view returns (address);
    function nonces(address owner) external view returns (uint256);

    function createWithPermit(
        SlothCreationParams calldata params,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external returns (address token, address sloth);

    function createWithPermitRelayer(
        address creator,
        SlothCreationParams calldata params,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s,
        uint256 nonce
    ) external returns (address token, address sloth);

    function verifyCreateSignatureWithRelayer(
        address creator,
        SlothCreationParams calldata params,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s,
        address relayer,
        uint256 nonce
    ) external view returns (bool);
}
