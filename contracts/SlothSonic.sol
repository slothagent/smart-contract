// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {IERC20} from "@openzeppelin/contracts/interfaces/IERC20.sol";
import {IUniswapV2Factory} from "./interfaces/IUniswapV2Factory.sol";
import {IUniswapV2Pair} from "./interfaces/IUniswapV2Pair.sol";
import {ISloth} from "./interfaces/ISloth.sol";
import {FullMath} from "./libraries/FullMath.sol";
import {ISlothToken} from "./interfaces/ISlothToken.sol";
import {SlothToken} from "./SlothToken.sol";

contract SlothSonic is ISloth, Initializable {
    address public token;
    address public native;
    address public uniswapV2Factory;
    address public uniswapV2Pair;
    uint256 public saleAmount;
    uint256 public tokenOffset;
    uint256 public nativeOffset;
    uint256 public totalTokenSold;
    uint256 public totalNativeCollected;

    // Debug events
    event Debug(string message, address indexed sender, string data);
    event DebugAddress(string message, address value);
    event DebugBool(string message, bool value);
    event DebugUint(string message, uint256 value);
    event DebugSignatureVerification(
        string message,
        bytes32 typehash,
        bytes32 structHash,
        bytes32 digest,
        address recoveredAddress,
        address expectedSigner
    );

    // Maximum balance for bonding curve (25,000 A8 tokens)
    uint256 public constant MAX_BONDING_BALANCE = 25_000 * 1e18;
    // Add event for token launch
    event TokenLaunched(address indexed launcher, uint256 nativeAmount, uint256 tokenAmount);

    // EIP-712 Domain
    bytes32 public constant DOMAIN_TYPEHASH = keccak256(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    );
    
    // Buy operation typehash
    bytes32 public constant BUY_TYPEHASH = keccak256(
        "Buy(address buyer,address recipient,uint256 nativeAmount,uint256 nonce,uint256 deadline,address relayer)"
    );
    
    // Sell operation typehash
    bytes32 public constant SELL_TYPEHASH = keccak256(
        "Sell(address seller,address recipient,uint256 tokenAmount,uint256 nonce,uint256 deadline,address relayer)"
    );

    // EIP-712 Domain Separator
    bytes32 public immutable DOMAIN_SEPARATOR;
    
    // User nonces for replay protection
    mapping(address => uint256) public nonces;

    constructor() {
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                DOMAIN_TYPEHASH,
                keccak256(bytes("Sloth Factory")),
                keccak256(bytes("1")),
                block.chainid,
                address(this)
            )
        );
    }

    function initialize(
        address _token,
        address _native,
        address _uniswapV2Factory,
        address _uniswapV2Pair,
        uint256 _saleAmount,
        uint256 _tokenOffset,
        uint256 _nativeOffset
    ) external initializer {
        token = _token;
        native = _native;
        uniswapV2Factory = _uniswapV2Factory;
        uniswapV2Pair = _uniswapV2Pair;
        saleAmount = _saleAmount;
        tokenOffset = _tokenOffset;
        nativeOffset = _nativeOffset;
    }
    

    function canAddLiquidity() public view returns (bool) {
        return IERC20(native).balanceOf(address(this)) >= MAX_BONDING_BALANCE;
    }

    function launchToken() external {
        require(canAddLiquidity(), "Not enough balance to launch");
        require(totalTokenSold > 0, "No tokens have been sold yet");
        
        // Get current balances
        uint256 nativeBalance = IERC20(native).balanceOf(address(this));
        uint256 tokenBalance = calculateTokenAmount(nativeBalance);
        
        require(tokenBalance <= saleAmount, "Not enough tokens for sale");
        
        // Add initial liquidity to Uniswap
        IERC20(token).transfer(uniswapV2Pair, tokenBalance);
        IERC20(native).transfer(uniswapV2Pair, nativeBalance);
        IUniswapV2Pair(uniswapV2Pair).mint(address(this));
        
        // End launching phase
        SlothToken(token).setEndLaunching();
        
        emit TokenLaunched(msg.sender, nativeBalance, tokenBalance);
    }
    


    function initialBuy(uint256 _nativeAmount, address _to) external payable {
        require(totalTokenSold == 0, "Initial buy already done");
        require(_nativeAmount > 0, "Native amount must be greater than 0");

        uint256 tokenAmount = calculateTokenAmount(_nativeAmount);
        require(tokenAmount <= saleAmount, "Not enough tokens for sale");

        totalTokenSold = tokenAmount;
        totalNativeCollected = _nativeAmount;

        IERC20(token).transfer(_to, tokenAmount);
        
        emit TokenBought(msg.sender, _to, _nativeAmount, tokenAmount);
    }

    function _createBuyDigestWithRelayer(
        address buyer,
        address recipient,
        uint256 nativeAmount,
        uint256 nonce,
        uint256 deadline,
        address relayer
    ) internal view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                BUY_TYPEHASH,
                buyer,
                recipient,
                nativeAmount,
                nonce,
                deadline,
                relayer
            )
        );
        return keccak256(
            abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash)
        );
    }

    function _createSellDigestWithRelayer(
        address seller,
        address recipient,
        uint256 tokenAmount,
        uint256 nonce,
        uint256 deadline,
        address relayer
    ) internal view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                SELL_TYPEHASH,
                seller,
                recipient,
                tokenAmount,
                nonce,
                deadline,
                relayer
            )
        );
        return keccak256(
            abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash)
        );
    }

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
    ) external view returns (bool, address, bytes32) {
        bytes32 digest = _createBuyDigestWithRelayer(
            buyer,
            recipient,
            nativeAmount,
            nonce,
            deadline,
            relayer
        );

        address recoveredAddress = ecrecover(digest, v, r, s);

        /// todo: add fix for case-insensitive address comparison
        return (
            recoveredAddress != address(0),
            recoveredAddress,
            digest
        );
    }

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
    ) external view returns (bool, address, bytes32) {
        bytes32 digest = _createSellDigestWithRelayer(
            seller,
            recipient,
            tokenAmount,
            nonce,
            deadline,
            relayer
        );

        address recoveredAddress = ecrecover(digest, v, r, s);

        /// todo: add fix for case-insensitive address comparison
        return (
            recoveredAddress != address(0),
            recoveredAddress,
            digest
        );
    }

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
    ) external {
        require(deadline >= block.timestamp, "Signature expired");
        require(nonce == nonces[buyer], "Invalid nonce");
        
        (bool isValid,,) = this.verifyBuySignatureWithRelayer(
            buyer,
            recipient,
            nativeAmount,
            nonce,
            deadline,
            relayer,
            v,
            r,
            s
        );
        
        require(isValid, "Invalid signature");
        nonces[buyer]++;
        
        _buy(buyer, recipient, nativeAmount);
    }

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
    ) external {
        require(deadline >= block.timestamp, "Signature expired");
        require(nonce == nonces[seller], "Invalid nonce");
        
        (bool isValid,,) = this.verifySellSignatureWithRelayer(
            seller,
            recipient,
            tokenAmount,
            nonce,
            deadline,
            relayer,
            v,
            r,
            s
        );
        
        require(isValid, "Invalid signature");
        nonces[seller]++;
        
        _sell(seller, recipient, tokenAmount);
    }

    function _buy(address buyer, address recipient, uint256 nativeAmount) internal {
        require(nativeAmount > 0, "Native amount must be greater than 0");
        require(totalTokenSold > 0, "Initial buy not done");

        uint256 tokenAmount = calculateTokenAmount(nativeAmount);
        require(tokenAmount + totalTokenSold <= saleAmount, "Not enough tokens for sale");

        totalTokenSold += tokenAmount;
        totalNativeCollected += nativeAmount;

        IERC20(native).transferFrom(buyer, address(this), nativeAmount);
        IERC20(token).transfer(recipient, tokenAmount);

        emit TokenBought(buyer, recipient, nativeAmount, tokenAmount);
    }

    function _sell(address seller, address recipient, uint256 tokenAmount) internal {
        require(tokenAmount > 0, "Token amount must be greater than 0");
        require(totalTokenSold > 0, "No tokens have been sold yet");

        uint256 nativeAmount = calculateNativeAmount(tokenAmount);
        require(nativeAmount <= IERC20(native).balanceOf(address(this)), "Not enough native tokens in contract");

        totalTokenSold -= tokenAmount;
        totalNativeCollected -= nativeAmount;

        IERC20(token).transferFrom(seller, address(this), tokenAmount);
        IERC20(native).transfer(recipient, nativeAmount);

        emit TokenSold(seller, recipient, tokenAmount, nativeAmount);
    }

    function buy(uint256 _nativeAmount, address _to) external payable {
        _buy(msg.sender, _to, _nativeAmount);
    }

    function sell(uint256 _tokenAmount, address _to) external {
        _sell(msg.sender, _to, _tokenAmount);
    }

    function calculateTokenAmount(uint256 _nativeAmount) public view returns (uint256) {
        return FullMath.mulDiv(
            _nativeAmount + nativeOffset,
            saleAmount,
            totalNativeCollected + tokenOffset
        );
    }

    function calculateNativeAmount(uint256 _tokenAmount) public view returns (uint256) {
        return FullMath.mulDiv(
            _tokenAmount + tokenOffset,
            totalNativeCollected,
            saleAmount
        );
    }

    function getLiquidityInfo() external view returns (
        uint256 tokenReserve,
        uint256 nativeReserve,
        uint256 totalLiquidity
    ) {
        // Get reserves
        (uint256 reserve0, uint256 reserve1,) = IUniswapV2Pair(uniswapV2Pair).getReserves();
        
        // Determine which token is which in the pair
        (tokenReserve, nativeReserve) = token < native ? 
            (reserve0, reserve1) : (reserve1, reserve0);
            
        // Get total supply of LP tokens using IERC20 interface
        totalLiquidity = IERC20(uniswapV2Pair).totalSupply();
        
        return (tokenReserve, nativeReserve, totalLiquidity);
    }

    /**
     * @notice Calculate current token price in terms of native token
     * @return Price of 1 token in native token (with 18 decimals precision)
     */
    function getTokenPrice() public view returns (uint256) {
        if (totalTokenSold == 0) return 0;

        // Before launch, calculate price from bonding curve
        if (!ISlothToken(token).isLaunched()) {
            if (totalNativeCollected == 0) return 0;
            return FullMath.mulDiv(totalNativeCollected, 1e18, totalTokenSold);
        }
        
        // After launch, get price from Uniswap pair
        (uint256 reserve0, uint256 reserve1,) = IUniswapV2Pair(uniswapV2Pair).getReserves();
        
        // Determine which token is which in the pair
        (uint256 nativeReserve, uint256 tokenReserve) = token < native ? 
            (reserve1, reserve0) : (reserve0, reserve1);

        // Calculate price with 18 decimals precision
        // Price = (Native Reserve * 1e18) / Token Reserve
        return FullMath.mulDiv(nativeReserve, 1e18, tokenReserve);
    }

    /**
     * @notice Calculate total market capitalization in native token
     * @return Market cap in native token (with 18 decimals precision)
     */
    function getMarketCap() external view returns (uint256) {
        uint256 totalSupply = IERC20(token).totalSupply();
        uint256 price = getTokenPrice();
        
        // Market Cap = Total Supply * Price
        return FullMath.mulDiv(totalSupply, price, 1e18);
    }

    /**
     * @notice Calculate the current progress of the bonding curve
     * @return progress Percentage of bonding curve filled (1-100)
     * @return currentBalance Current balance in the bonding curve
     * @return maxBalance Maximum balance allowed (25,000 A8)
     */
    function getBondingCurveProgress() public view returns (uint256 progress, uint256 currentBalance, uint256 maxBalance) {
        currentBalance = IERC20(native).balanceOf(address(this));
        maxBalance = MAX_BONDING_BALANCE;
        
        // Calculate progress as percentage (1-100)
        progress = FullMath.mulDiv(currentBalance, 100, maxBalance);
        
        return (progress, currentBalance, maxBalance);
    }

    /**
     * @notice Get detailed liquidity information including bonding curve status
     * @return tokenLiquidity Amount of tokens in liquidity pool
     * @return nativeLiquidity Amount of native tokens in liquidity pool
     * @return bondingBalance Current balance in bonding curve
     * @return bondingProgress Progress of bonding curve (1-100)
     */
    function getLiquidityDetails() external view returns (
        uint256 tokenLiquidity,
        uint256 nativeLiquidity,
        uint256 bondingBalance,
        uint256 bondingProgress
    ) {
        // Get liquidity pool reserves
        (uint256 reserve0, uint256 reserve1,) = IUniswapV2Pair(uniswapV2Pair).getReserves();
        
        // Determine which token is which in the pair
        (tokenLiquidity, nativeLiquidity) = token < native ? 
            (reserve0, reserve1) : (reserve1, reserve0);

        // Get bonding curve progress
        (bondingProgress, bondingBalance,) = getBondingCurveProgress();
        
        return (tokenLiquidity, nativeLiquidity, bondingBalance, bondingProgress);
    }
} 