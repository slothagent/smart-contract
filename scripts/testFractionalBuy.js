require('dotenv').config();
const { ethers } = require('hardhat');

async function main() {
    try {
        // Connect to network
        const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
        const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

        // Contract addresses (replace with your deployed addresses)
        const CURVE_ADDRESS = "YOUR_CURVE_ADDRESS";
        const TOKEN_ADDRESS = "YOUR_TOKEN_ADDRESS";

        // Connect to contracts
        const BondingCurve = await ethers.getContractFactory("BondingCurve");
        const curve = BondingCurve.attach(CURVE_ADDRESS).connect(wallet);

        const Token = await ethers.getContractFactory("ContractErc20");
        const token = Token.attach(TOKEN_ADDRESS).connect(wallet);

        // Get current price
        const currentPrice = await curve.getCurrentPrice(true);
        console.log("\nCurrent price:", ethers.formatEther(currentPrice), "ETH/token");

        // Try to buy with 1 ETH
        const buyAmount = ethers.parseEther("1.0");
        
        // Calculate expected tokens
        const expectedTokens = await curve.calculateTokensForEth(buyAmount);
        console.log("\nWith 1 ETH you will get:", ethers.formatEther(expectedTokens), "tokens");
        console.log("Effective price per token:", ethers.formatEther(buyAmount) / ethers.formatEther(expectedTokens), "ETH");

        // Execute buy
        console.log("\nExecuting buy...");
        const buyTx = await curve.buy(
            expectedTokens * 99n / 100n, // 1% slippage tolerance
            {
                value: buyAmount,
                gasLimit: 500000
            }
        );

        console.log("Transaction sent:", buyTx.hash);
        const receipt = await buyTx.wait();
        console.log("Transaction confirmed!");

        // Get new balance
        const balance = await token.balanceOf(wallet.address);
        console.log("\nNew token balance:", ethers.formatEther(balance));

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