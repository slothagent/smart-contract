const { ethers } = require("hardhat");

async function main() {
    const [signer] = await ethers.getSigners();
    console.log("Buyer address:", signer.address);

    // Contract addresses
    const TOKEN_ADDRESS = "0xE15f0e61978338F2fe3f5EFf14E1bDd64a1aC644";
    const SLOTH_ADDRESS = "0x849C4bA7BdfcA475C98e8950B3041552ED17db68";
    const NATIVE_TOKEN = "0xfC57492d6569f6F45Ea1b8850e842Bf5F9656EA6";
    
    try {
        // Get contracts
        const sloth = await ethers.getContractAt("Sloth", SLOTH_ADDRESS);
        const token = await ethers.getContractAt("SlothToken", TOKEN_ADDRESS);
        const nativeToken = await ethers.getContractAt("IERC20", NATIVE_TOKEN);

        // Amount to buy (in native token)
        const buyAmount = ethers.parseEther("1"); // Adjust this value as needed

        // Get token info and price before buy
        console.log("\nBefore Buy:");
        const totalTokenSold = await sloth.totalTokenSold();
        const totalNativeCollected = await sloth.totalNativeCollected();
        const tokenPrice = await sloth.getTokenPrice();
        console.log("Total Token Sold:", ethers.formatEther(totalTokenSold));
        console.log("Total Native Collected:", ethers.formatEther(totalNativeCollected));
        console.log("Current Token Price:", ethers.formatEther(tokenPrice), "A8/token");

        // Calculate expected token amount
        const expectedTokens = await sloth.calculateTokenAmount(buyAmount);
        console.log("\nBuy Details:");
        console.log("Native Amount:", ethers.formatEther(buyAmount));
        console.log("Expected Tokens:", ethers.formatEther(expectedTokens));
        console.log("Effective Buy Price:", ethers.formatEther(buyAmount) / ethers.formatEther(expectedTokens), "A8/token");

        // Check native token balance and allowance
        const balance = await nativeToken.balanceOf(signer.address);
        const allowance = await nativeToken.allowance(signer.address, SLOTH_ADDRESS);
        
        console.log("\nChecks:");
        console.log("Native Balance:", ethers.formatEther(balance));
        console.log("Current Allowance:", ethers.formatEther(allowance));

        // Approve if needed
        if (allowance < buyAmount) {
            console.log("\nApproving native token...");
            const approveTx = await nativeToken.approve(SLOTH_ADDRESS, buyAmount);
            await approveTx.wait();
            console.log("Approved ✅");
        }

        // Buy tokens
        console.log("\nBuying tokens...");
        const buyTx = await sloth.buy(buyAmount, signer.address);
        await buyTx.wait();
        console.log("Buy successful! ✅");

        // Get updated balances and price
        const newTokenBalance = await token.balanceOf(signer.address);
        const newNativeBalance = await nativeToken.balanceOf(signer.address);
        const newTokenPrice = await sloth.getTokenPrice();
        
        console.log("\nAfter Buy:");
        console.log("Token Balance:", ethers.formatEther(newTokenBalance));
        console.log("Native Balance:", ethers.formatEther(newNativeBalance));
        console.log("New Token Price:", ethers.formatEther(newTokenPrice), "A8/token");
        console.log("Price Change:", 
            ((ethers.formatEther(newTokenPrice) / ethers.formatEther(tokenPrice) - 1) * 100).toFixed(2), 
            "%"
        );

        // Check if we can launch the token
        const canLaunch = await sloth.canAddLiquidity();
        if (canLaunch) {
            console.log("\nToken can be launched! 🚀");
            console.log("Call launchToken() to add liquidity to Uniswap");
        } else {
            const progress = await sloth.getBondingCurveProgress();
            console.log("\nBonding Curve Progress:");
            console.log("Progress:", progress.progress.toString(), "%");
            console.log("Current Balance:", ethers.formatEther(progress.currentBalance));
            console.log("Max Balance:", ethers.formatEther(progress.maxBalance));
        }

    } catch (error) {
        console.error("\nError buying tokens:", error.message || error);
        if (error.data) {
            console.error("Error data:", error.data);
        }
        process.exit(1);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    }); 