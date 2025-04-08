require('dotenv').config();
const { ethers } = require('hardhat');

async function main() {
    try {
        // Connect to network
        const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
        const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

        const balance = await provider.getBalance(wallet.address);
        console.log("\nWallet balance:", ethers.formatEther(balance), "ETH");

        // Contract addresses
        const TOKEN_ADDRESS = "0x35EEd3e24BC21ed874C0afCd032Ef30EA46F11Ce";
        const CURVE_ADDRESS = "0x043b48160c59E204Fd6ec669c763645c715cE0bC";

        // Connect to contracts
        const Token = await ethers.getContractFactory("ContractErc20");
        const token = Token.attach(TOKEN_ADDRESS).connect(wallet);

        const BondingCurve = await ethers.getContractFactory("BondingCurve");
        const curve = BondingCurve.attach(CURVE_ADDRESS).connect(wallet);

        // Get initial state with additional metrics
        const initialBalance = await token.balanceOf(wallet.address);
        const initialBuyPrice = await curve.getBuyPrice();
        const initialSellPrice = await curve.getSellPrice();
        const fundingRaised = await curve.fundingRaised();
        const fundingGoal = await curve.FUNDING_GOAL();
        const totalSupply = await curve.totalSupply();
        const marketCap = await curve.getTotalMarketCap();

        console.log("\nInitial state:");
        console.log("Token balance:", ethers.formatEther(initialBalance));
        console.log("Total supply:", ethers.formatEther(totalSupply));
        console.log("Market cap:", ethers.formatEther(marketCap));
        console.log("Buy price:", ethers.formatEther(initialBuyPrice));
        console.log("Sell price:", ethers.formatEther(initialSellPrice));
        console.log("Spread:", ethers.formatEther(initialBuyPrice - initialSellPrice));
        console.log("Funding raised:", ethers.formatEther(fundingRaised));
        console.log("Funding goal:", ethers.formatEther(fundingGoal));
        console.log("Progress:", Number((fundingRaised * 100n) / fundingGoal), "%");

        // Buy tokens with error handling for price impact
        console.log("\nBuying tokens...");
        const buyAmount = ethers.parseEther("1");
        
        try {
            // Calculate tokens with safety checks
            const estimatedTokens = await curve.calculateTokensForEth(buyAmount);
            console.log("Spending:", ethers.formatEther(buyAmount), "ETH");
            console.log("Estimated tokens:", ethers.formatEther(estimatedTokens));

            // Set minimum tokens to 98% of estimated (2% slippage tolerance for safety)
            const minTokens = estimatedTokens * 98n / 100n;
            console.log("Min tokens:", ethers.formatEther(minTokens));

            // Calculate expected price impact
            const expectedPrice = (buyAmount * ethers.parseEther("1")) / estimatedTokens;
            const currentPrice = await curve.getBuyPrice();
            const priceImpact = ((expectedPrice - currentPrice) * 100n) / currentPrice;
            console.log("Expected price impact:", Number(priceImpact) / 100, "%");

            // Execute buy with higher gas limit and proper error handling
            console.log("\nExecuting buy...");
            const buyTx = await curve.buy(
                minTokens,
                wallet.address,
                {
                    value: buyAmount,
                    gasLimit: 1000000 // Increased for complex calculations
                }
            );

            console.log("Transaction sent:", buyTx.hash);
            const buyReceipt = await buyTx.wait();
            
            if (buyReceipt.status === 0) {
                throw new Error("Transaction failed");
            }

            // Get buy event for exact tokens received
            const buyEvent = buyReceipt.logs.find(
                log => log.fragment && log.fragment.name === 'Buy'
            );
            const tokensReceived = buyEvent.args[1];
            console.log("Transaction confirmed! Received:", ethers.formatEther(tokensReceived), "tokens");

            // Get updated state with all metrics
            const newBalance = await token.balanceOf(wallet.address);
            const newBuyPrice = await curve.getBuyPrice();
            const newSellPrice = await curve.getSellPrice();
            const newFundingRaised = await curve.fundingRaised();
            const newTotalSupply = await curve.totalSupply();
            const newMarketCap = await curve.getTotalMarketCap();

            console.log("\nAfter purchase:");
            console.log("New balance:", ethers.formatEther(newBalance));
            console.log("Total supply:", ethers.formatEther(newTotalSupply));
            console.log("Market cap:", ethers.formatEther(newMarketCap));
            console.log("Tokens received:", ethers.formatEther(newBalance - initialBalance));
            console.log("New buy price:", ethers.formatEther(newBuyPrice));
            console.log("New sell price:", ethers.formatEther(newSellPrice));
            console.log("Price impact:", ethers.formatEther(newBuyPrice - initialBuyPrice));
            console.log("New spread:", ethers.formatEther(newBuyPrice - newSellPrice));
            console.log("New funding:", ethers.formatEther(newFundingRaised));
            console.log("Progress:", Number((newFundingRaised * 100n) / fundingGoal), "%");

        } catch (error) {
            console.error("\nTransaction failed:");
            if (error.data) {
                // Handle specific contract errors
                const reason = error.data.message || error.message;
                console.error("Contract error:", reason);
            } else {
                console.error("Error:", error.message);
            }
            throw error;
        }
    } catch (error) {
        console.error("Error:", error);
        process.exit(1);
    }
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    }); 