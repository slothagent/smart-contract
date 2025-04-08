require('dotenv').config();
const { ethers } = require('hardhat');

async function main() {
    try {
        // Connect to network
        const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
        const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

        // Contract addresses from previous deployment
        const TOKEN_ADDRESS = "0x9083be9ced43dd2C468fe0CF248348f57431C402";
        const CURVE_ADDRESS = "0x27740c980694A154CdA2FfF192E4ca64ba0fE23e";

        // Connect to contracts
        const Token = await ethers.getContractFactory("ContractErc20");
        const token = Token.attach(TOKEN_ADDRESS).connect(wallet);

        const BondingCurve = await ethers.getContractFactory("BondingCurve");
        const curve = BondingCurve.attach(CURVE_ADDRESS).connect(wallet);

        // Get current state
        console.log("\nPool State Before Sell:");
        console.log("------------------------");
        const [actualBalance, reserveBalance] = await curve.checkBalances();
        const tokenBalance = await token.balanceOf(wallet.address);
        const currentPrice = await curve.getCurrentPrice();

        console.log("Your Token Balance:", ethers.formatEther(tokenBalance));
        console.log("Actual Pool Balance:", ethers.formatEther(actualBalance), "ETH");
        console.log("Reserve Balance:", ethers.formatEther(reserveBalance), "ETH");
        console.log("Current Token Price:", ethers.formatEther(currentPrice), "ETH");

        // Calculate 20% sell
        const sellAmount = tokenBalance * 20n / 100n;
        console.log("\nSell Calculation (20% of balance):");
        console.log("------------------------");
        console.log("Amount to sell:", ethers.formatEther(sellAmount), "tokens");

        // Calculate expected ETH return
        const expectedEth = await curve.calculateEthForTokens(sellAmount);
        console.log("Expected ETH return:", ethers.formatEther(expectedEth), "ETH");

        // Check if pool has enough ETH
        console.log("\nPool Check:");
        console.log("------------------------");
        console.log("Required ETH:", ethers.formatEther(expectedEth));
        console.log("Available in pool (actual):", ethers.formatEther(actualBalance));
        console.log("Available in pool (reserve):", ethers.formatEther(reserveBalance));
        const canSell = expectedEth <= actualBalance;
        console.log("Can execute sell:", canSell ? "Yes" : "No");

        if (!canSell) {
            console.log("Missing ETH:", ethers.formatEther(expectedEth - actualBalance));
            console.log("\nCannot proceed with sell - insufficient pool balance");
            return;
        }

        // If we can sell, proceed with approval and sell
        console.log("\nProceeding with sell...");
        console.log("------------------------");

        // Approve tokens first
        console.log("Approving tokens...");
        await token.approve(CURVE_ADDRESS, sellAmount);

        // Execute sell with 5% slippage tolerance
        const minEth = expectedEth * 95n / 100n;
        console.log("Executing sell...");
        const tx = await curve.sell(sellAmount, minEth);
        await tx.wait();

        // Get final state
        const finalPoolBalance = await curve.getPoolBalance();
        const finalTokenBalance = await token.balanceOf(wallet.address);

        console.log("\nFinal State:");
        console.log("------------------------");
        console.log("New Token Balance:", ethers.formatEther(finalTokenBalance));
        console.log("New Pool Balance:", ethers.formatEther(finalPoolBalance), "ETH");
        console.log("ETH Received:", ethers.formatEther(expectedEth));

    } catch (error) {
        console.error("\nError:", error.message);
        process.exit(1);
    }
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    }); 