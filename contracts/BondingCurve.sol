// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

/**
 * @title BondingCurve
 * @dev Implementation of Bancor Formula bonding curve for token pricing and liquidity
 */
contract BondingCurve is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // State variables
    IERC20 public token;  // Token being traded
    uint256 public constant PRECISION = 1e18;  // Standard precision
    uint256 public constant MAX_RESERVE_RATIO = 1000000; // 100% in ppm
    uint256 public constant FUNDING_GOAL = 25000 ether; // 400,000 ETH funding goal
    uint256 public constant INITIAL_PRICE = 0.0001 ether; // Initial price: 0.0001 ETH per token
    uint256 public constant INITIAL_SUPPLY = 1_000_000_000 * 1e18; // 1 billion tokens
    uint256 public constant INITIAL_RESERVE = 100000 ether; // Initial reserve of 100,000 ETH
    
    uint256 public reserveWeight; // Reserve weight in ppm (1-1000000)
    uint256 public initialSupply; // Initial token supply (S₀)
    uint256 public totalSupply;  // Current supply in the bonding curve
    uint256 public fundingRaised; // Total funding raised in ETH
    uint256 public reserveBalance; // Current ETH reserve balance
    bool public fundingGoalReached; // Flag to track if funding goal is reached
    uint256 public fundingEndTime; // Timestamp when funding goal was reached
    uint256 public constant KMAX = 1e10;  // Giảm lại để tránh tràn số
    uint256 public constant FEE = 1e16;   // 1% fee

    // Events
    event Buy(address indexed buyer, uint256 tokenAmount, uint256 paymentAmount);
    event Sell(address indexed seller, uint256 tokenAmount, uint256 paymentAmount);
    event FundingRaised(uint256 amount);
    event FundingGoalReached(uint256 timestamp);
    event UpdateInfo(uint256 newPrice, uint256 newSupply, uint256 newTotalMarketCap, uint256 newFundingRaised, uint256 amountTokenToReceive);
    event PoolBalanceUpdated(uint256 newBalance);

    constructor(
        address _token,
        uint256 _reserveWeight,
        uint256 _initialSupply
    ) Ownable(msg.sender) {
        require(_token != address(0), "Invalid token address");
        require(_reserveWeight > 0 && _reserveWeight <= MAX_RESERVE_RATIO, "Invalid reserve weight");
        require(_initialSupply > 0, "Initial supply must be positive");
        
        token = IERC20(_token);
        reserveWeight = _reserveWeight;
        initialSupply = _initialSupply;
        totalSupply = 0;
        fundingRaised = 0;
        reserveBalance = INITIAL_RESERVE;
    }

    /**
     * @dev Power function for calculating token price
     * @param base Base number
     * @param exp Exponent in PRECISION
     * @return result Result of base^exp
     */
    function pow(uint256 base, uint256 exp) internal pure returns (uint256) {
        require(base > 0, "Base must be positive");
        
        if (base == PRECISION) {
            return PRECISION;
        }
        if (exp == 0) {
            return PRECISION;
        }
        if (exp == PRECISION) {
            return base;
        }

        // Use logarithmic properties for the calculation
        uint256 logBase = _ln(base);
        uint256 logResult = (logBase * exp) / PRECISION;
        return _exp(logResult);
    }

    /**
     * @dev Natural logarithm function
     * @param x Value to calculate ln(x)
     * @return Natural logarithm result
     */
    function _ln(uint256 x) internal pure returns (uint256) {
        require(x > 0, "Cannot calculate ln of 0");
        
        uint256 result = 0;
        uint256 y = x;

        while (y < PRECISION) {
            y = (y * 10) / 1;
            result -= PRECISION / 10;
        }

        y = y / 10;

        for (uint8 i = 0; i < 10; i++) {
            y = (y * y) / PRECISION;
            if (y >= 10 * PRECISION) {
                result += PRECISION;
                y = y / 10;
            }
        }

        return result;
    }

    /**
     * @dev Exponential function
     * @param x Value to calculate e^x
     * @return Exponential result
     */
    function _exp(uint256 x) internal pure returns (uint256) {
        require(x <= 2 ** 255 - 1, "Overflow");
        
        uint256 result = PRECISION;
        uint256 xi = x;
        uint256 term = PRECISION;

        for (uint8 i = 1; i <= 8; i++) {
            term = (term * xi) / (i * PRECISION);
            result += term;
        }

        return result;
    }

    /**
     * @dev Get current token price using Bancor Formula
     * P = R₀ * (S/S₀)^((1-F)/F)
     * @return Current price in wei
     */
    function getCurrentPrice() public view returns (uint256) {
        if (totalSupply == 0) return INITIAL_PRICE;
        return _calculatePrice(reserveBalance);
    }

    /**
     * @dev Get total market capitalization in ETH
     * @return Total market cap in wei
     */
    function getTotalMarketCap() public view returns (uint256) {
        if (totalSupply == 0) return 0;
        return getCurrentPrice() * totalSupply / PRECISION;
    }

    /**
     * @dev Get total funding raised
     * @return Total funding in wei
     */
    function getTotalFundingRaised() public view returns (uint256) {
        return fundingRaised;
    }

    /**
     * @dev Calculate tokens to receive for ETH amount
     * @param ethAmount Amount of ETH in wei
     * @return tokenAmount Number of tokens that can be bought
     */
    function calculateTokensForEth(uint256 ethAmount) public view returns (uint256) {
        require(ethAmount > 0, "ETH amount must be positive");

        // Với lần mua đầu tiên
        if (totalSupply == 0) {
            return (ethAmount * PRECISION) / INITIAL_PRICE;
        }

        // Tính giá trước khi mua
        uint256 priceBeforeBuy = getCurrentPrice();
        
        // Tính giá sau khi mua
        uint256 newReserveBalance = reserveBalance + ethAmount;
        uint256 priceAfterBuy = _calculatePrice(newReserveBalance);
        
        // Tính số token dựa trên giá trung bình
        uint256 avgPrice = (priceBeforeBuy + priceAfterBuy) / 2;
        uint256 tokensEstimate = (ethAmount * PRECISION) / avgPrice;
        
        // Giới hạn số lượng
        uint256 availableSupply = initialSupply - totalSupply;
        if (tokensEstimate > availableSupply) {
            tokensEstimate = availableSupply;
        }
        
        require(tokensEstimate > 0, "Token calculation resulted in zero");
        return tokensEstimate;
    }

    /**
     * @dev Calculate ETH to receive for token amount
     * @param tokenAmount Amount of tokens
     * @return ethAmount Amount of ETH in wei
     */
    function calculateEthForTokens(uint256 tokenAmount) public view returns (uint256) {
        require(tokenAmount > 0, "Token amount must be positive");
        require(tokenAmount <= totalSupply, "Insufficient supply");

        // Bán toàn bộ token
        if (totalSupply == tokenAmount) {
            return reserveBalance;
        }

        // Tính giá trước khi bán
        uint256 priceBeforeSell = getCurrentPrice();
        
        // Ước tính ethAmount sẽ rút ra
        uint256 estimatedEth = (tokenAmount * priceBeforeSell) / PRECISION;
        uint256 newReserveBalance = reserveBalance > estimatedEth ? reserveBalance - estimatedEth : 0;
        
        // Tính giá sau khi bán
        uint256 priceAfterSell = _calculatePrice(newReserveBalance);
        
        // Tính ETH dựa trên giá trung bình
        uint256 avgPrice = (priceBeforeSell + priceAfterSell) / 2;
        uint256 ethEstimate = (tokenAmount * avgPrice) / PRECISION;
        
        // Áp dụng fee
        uint256 fee = (ethEstimate * FEE) / PRECISION;
        ethEstimate = ethEstimate - fee;
        
        // Kiểm tra
        require(ethEstimate <= reserveBalance, "Insufficient reserve");
        require(ethEstimate > 0, "ETH calculation resulted in zero");
        
        return ethEstimate;
    }

    /**
     * @dev Buy tokens using ETH
     * @param minTokens Minimum amount of tokens to receive
     * @param buyer Address of the token buyer
     */
    function buy(uint256 minTokens, address buyer) external payable nonReentrant {
        // Check funding goal status first
        require(!fundingGoalReached, "Funding goal already reached");
        require(fundingRaised < FUNDING_GOAL, "Funding goal exceeded");
        
        require(msg.value > 0, "Must send ETH");
        require(buyer != address(0), "Invalid buyer address");
        
        // Calculate tokens to receive
        uint256 tokensToReceive = calculateTokensForEth(msg.value);
        require(tokensToReceive > 0, "No tokens to receive");
        require(tokensToReceive >= minTokens, "Slippage too high");
        
        // Check contract balance and allowance
        uint256 contractBalance = token.balanceOf(address(this));
        require(contractBalance >= tokensToReceive, "Insufficient token balance");
        
        // Check if this purchase would exceed funding goal
        require(fundingRaised + msg.value <= FUNDING_GOAL, "Purchase would exceed funding goal");

        // Update state before transfer
        totalSupply += tokensToReceive;
        fundingRaised += msg.value;
        reserveBalance += msg.value;

        // Emit pool balance update
        emit PoolBalanceUpdated(reserveBalance);

        // Transfer tokens to buyer
        token.safeTransfer(buyer, tokensToReceive);

        // Emit price update after state changes
        emit UpdateInfo(getCurrentPrice(), totalSupply, getTotalMarketCap(), fundingRaised, tokensToReceive);

        // Check if funding goal is reached
        if (fundingRaised >= FUNDING_GOAL && !fundingGoalReached) {
            fundingGoalReached = true;
            fundingEndTime = block.timestamp;
            emit FundingGoalReached(block.timestamp);
        }

        emit Buy(buyer, tokensToReceive, msg.value);
        emit FundingRaised(msg.value);
    }

    /**
     * @dev Sell tokens back to the contract
     * @param tokenAmount Amount of tokens to sell
     * @param minEth Minimum ETH to receive
     */
    function sell(uint256 tokenAmount, uint256 minEth) external nonReentrant {
        require(tokenAmount > 0, "Amount must be positive");
        require(totalSupply >= tokenAmount, "Cannot sell more than supply");
        
        uint256 ethToReceive = calculateEthForTokens(tokenAmount);
        require(ethToReceive >= minEth, "Below min return");
        require(address(this).balance >= ethToReceive, "Insufficient contract balance");
        
        // Transfer tokens from seller
        token.safeTransferFrom(msg.sender, address(this), tokenAmount);
        
        // Update state
        totalSupply -= tokenAmount;
        reserveBalance -= ethToReceive;
        
        // Emit pool balance update
        emit PoolBalanceUpdated(reserveBalance);
        
        // Transfer ETH to seller using call
        (bool success, ) = msg.sender.call{value: ethToReceive}("");
        require(success, "ETH transfer failed");
        
        // Emit events
        emit UpdateInfo(getCurrentPrice(), totalSupply, getTotalMarketCap(), fundingRaised, tokenAmount);
        emit Sell(msg.sender, tokenAmount, ethToReceive);
    }

    /**
     * @dev Get holder's token percentage compared to initial supply
     * @param holder Address of the holder
     * @return percentage Percentage with 2 decimals (e.g., 534 = 5.34%)
     */
    function getHolderTokenPercentage(address holder) external view returns (uint256) {
        require(holder != address(0), "Invalid address");
        uint256 holderBalance = token.balanceOf(holder);
        if (holderBalance == 0) return 0;
        // Return percentage with 2 decimals
        return (holderBalance * 10000) / initialSupply;
    }

    /**
     * @dev Get top holder percentages
     * @param holders Array of holder addresses to check
     * @return percentages Array of percentages with 2 decimals
     */
    function getMultipleHolderPercentages(address[] calldata holders) external view returns (uint256[] memory) {
        uint256[] memory percentages = new uint256[](holders.length);
        
        for(uint256 i = 0; i < holders.length; i++) {
            if(holders[i] == address(0)) {
                percentages[i] = 0;
                continue;
            }
            uint256 holderBalance = token.balanceOf(holders[i]);
            percentages[i] = holderBalance > 0 ? (holderBalance * 10000) / initialSupply : 0;
        }
        
        return percentages;
    }

    /**
     * @dev Get funding progress percentage
     * @return progress Percentage with 2 decimals (e.g., 8350 = 83.50%)
     */
    function getFundingProgress() external view returns (uint256) {
        if (fundingRaised == 0) return 0;
        return (fundingRaised * 10000) / FUNDING_GOAL;
    }

    /**
     * @dev Get remaining funding amount needed
     * @return remaining Amount in ETH needed to reach goal
     */
    function getRemainingFunding() external view returns (uint256) {
        if (fundingGoalReached || fundingRaised >= FUNDING_GOAL) {
            return 0;
        }
        return FUNDING_GOAL - fundingRaised;
    }

    /**
     * @dev Get funding duration if goal reached
     * @return duration Time in seconds from contract creation to goal reached
     */
    function getFundingDuration() external view returns (uint256) {
        if (!fundingGoalReached) {
            return 0;
        }
        return fundingEndTime;
    }

    /**
     * @dev Check if funding is active
     * @return bool True if funding is still active
     */
    function isFundingActive() public view returns (bool) {
        return !fundingGoalReached && fundingRaised < FUNDING_GOAL;
    }

    /**
     * @dev Get current ETH balance in the pool
     * @return Amount of ETH in wei
     */
    function getPoolBalance() public view returns (uint256) {
        return address(this).balance;  // Return actual ETH balance of contract
    }

    // Add function to check both balances
    function checkBalances() public view returns (uint256 actualBalance, uint256 reserveBalance_) {
        return (address(this).balance, reserveBalance);
    }

    // Function to receive ETH
    receive() external payable {}

    // Thêm hàm helper để tính toán giá
    function _calculatePrice(uint256 reserveAmount) internal pure returns (uint256) {
        // Sử dụng công thức đơn giản hơn để tránh tràn số
        // P = P0 * (1 + reserveAmount/INITIAL_RESERVE)
        
        if (reserveAmount <= INITIAL_RESERVE) {
            // Nếu reserve nhỏ hơn hoặc bằng INITIAL_RESERVE, giá tăng tuyến tính
            uint256 ratio = (reserveAmount * PRECISION) / INITIAL_RESERVE;
            return (INITIAL_PRICE * (PRECISION + ratio)) / PRECISION;
        } else {
            // Nếu reserve lớn hơn INITIAL_RESERVE, giá tăng chậm hơn
            uint256 basePrice = INITIAL_PRICE * 2; // Giá tại INITIAL_RESERVE
            uint256 excessReserve = reserveAmount - INITIAL_RESERVE;
            uint256 excessRatio = (excessReserve * PRECISION) / INITIAL_RESERVE;
            uint256 sqrtRatio = Math.sqrt((excessRatio * PRECISION) / 10) + PRECISION;
            
            return (basePrice * sqrtRatio) / PRECISION;
        }
    }
} 