// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.22;

interface ISloth {
    /**
     * @notice Emitted when tokens are bought in initial sale
     * @param buyer Address of the buyer
     * @param recipient Address receiving the tokens
     * @param nativeAmount Amount of native tokens paid
     * @param tokenAmount Amount of tokens received
     */
    event InitialBuy(
        address indexed buyer,
        address indexed recipient,
        uint256 nativeAmount,
        uint256 tokenAmount
    );

    /**
     * @notice Emitted when tokens are bought
     * @param buyer Address of the buyer
     * @param recipient Address receiving the tokens
     * @param nativeAmount Amount of native tokens paid
     * @param tokenAmount Amount of tokens received
     */
    event TokenBought(
        address indexed buyer,
        address indexed recipient,
        uint256 nativeAmount,
        uint256 tokenAmount
    );

    /**
     * @notice Emitted when tokens are sold
     * @param seller Address of the seller
     * @param recipient Address receiving the native tokens
     * @param tokenAmount Amount of tokens sold
     * @param nativeAmount Amount of native tokens received
     */
    event TokenSold(
        address indexed seller,
        address indexed recipient,
        uint256 tokenAmount,
        uint256 nativeAmount
    );

    function initialize(
        address _token,
        address _native,
        address _uniswapV2Factory,
        address _uniswapV2Pair,
        uint256 _saleAmount,
        uint256 _tokenOffset,
        uint256 _nativeOffset
    ) external;

    /**
     * @notice Get current liquidity info
     * @return tokenReserve Current token reserve in the pool
     * @return nativeReserve Current native token reserve in the pool
     * @return totalLiquidity Total supply of LP tokens
     */
    function getLiquidityInfo() external view returns (
        uint256 tokenReserve,
        uint256 nativeReserve,
        uint256 totalLiquidity
    );

    function initialBuy(uint256 _nativeAmount, address _to) external payable;
    function buy(uint256 _nativeAmount, address _to) external payable;
    function sell(uint256 _tokenAmount, address _to) external;
    function calculateTokenAmount(uint256 _nativeAmount) external view returns (uint256);
    function calculateNativeAmount(uint256 _tokenAmount) external view returns (uint256);

    /**
     * @notice Verify a buy signature with relayer
     * @param buyer Address of the buyer
     * @param recipient Address receiving the tokens
     * @param nativeAmount Amount of native tokens to spend
     * @param nonce Current nonce of the buyer
     * @param deadline Timestamp after which the signature is invalid
     * @param relayer Address of the relayer
     * @param v ECDSA signature v
     * @param r ECDSA signature r
     * @param s ECDSA signature s
     * @return Whether the signature is valid, the relayer address, and the signature hash
     */
    function verifyBuySignatureWithRelayer(
        address buyer,
        address recipient,
        uint256 nativeAmount,
        uint256 nonce,
        uint256 deadline,
        address relayer,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external view returns (bool, address, bytes32);

    /**
     * @notice Verify a sell signature with relayer
     * @param seller Address of the seller
     * @param recipient Address receiving the native tokens
     * @param tokenAmount Amount of tokens to sell
     * @param nonce Current nonce of the seller
     * @param deadline Timestamp after which the signature is invalid
     * @param relayer Address of the relayer
     * @param v ECDSA signature v
     * @param r ECDSA signature r
     * @param s ECDSA signature s
     * @return Whether the signature is valid, the relayer address, and the signature hash
     */
    function verifySellSignatureWithRelayer(
        address seller,
        address recipient,
        uint256 tokenAmount,
        uint256 nonce,
        uint256 deadline,
        address relayer,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external view returns (bool, address, bytes32);

    /**
     * @notice Buy tokens with a permit through a relayer
     * @param buyer Address of the buyer
     * @param recipient Address receiving the tokens
     * @param nativeAmount Amount of native tokens to spend
     * @param nonce Current nonce of the buyer
     * @param deadline Timestamp after which the signature is invalid
     * @param relayer Address of the relayer
     * @param v ECDSA signature v
     * @param r ECDSA signature r
     * @param s ECDSA signature s
     */
    function buyWithPermitRelayer(
        address buyer,
        address recipient,
        uint256 nativeAmount,
        uint256 nonce,
        uint256 deadline,
        address relayer,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;

    /**
     * @notice Sell tokens with a permit through a relayer
     * @param seller Address of the seller
     * @param recipient Address receiving the native tokens
     * @param tokenAmount Amount of tokens to sell
     * @param nonce Current nonce of the seller
     * @param deadline Timestamp after which the signature is invalid
     * @param relayer Address of the relayer
     * @param v ECDSA signature v
     * @param r ECDSA signature r
     * @param s ECDSA signature s
     */
    function sellWithPermitRelayer(
        address seller,
        address recipient,
        uint256 tokenAmount,
        uint256 nonce,
        uint256 deadline,
        address relayer,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;

    /**
     * @notice Get the current nonce for an address
     * @param owner The address to get the nonce for
     * @return The current nonce
     */
    function nonces(address owner) external view returns (uint256);

    /**
     * @notice Get the DOMAIN_SEPARATOR for EIP-712
     * @return The domain separator
     */
    function DOMAIN_SEPARATOR() external view returns (bytes32);

    /**
     * @notice Get the BUY_TYPEHASH for EIP-712
     * @return The buy typehash
     */
    function BUY_TYPEHASH() external view returns (bytes32);

    /**
     * @notice Get the SELL_TYPEHASH for EIP-712
     * @return The sell typehash
     */
    function SELL_TYPEHASH() external view returns (bytes32);
}
