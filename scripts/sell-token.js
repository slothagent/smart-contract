const { ethers } = require("hardhat");

async function main() {
    const [signer] = await ethers.getSigners();
    console.log("Seller address:", signer.address);

    // Contract addresses
    const TOKEN_ADDRESS = "0xE15f0e61978338F2fe3f5EFf14E1bDd64a1aC644";
    const SLOTH_ADDRESS = "0x849C4bA7BdfcA475C98e8950B3041552ED17db68";
    const NATIVE_TOKEN = "0xfC57492d6569f6F45Ea1b8850e842Bf5F9656EA6";
    try {
        // Get contracts
        const sloth = await ethers.getContractAt("Sloth", SLOTH_ADDRESS);
        const token = await ethers.getContractAt("SlothToken", TOKEN_ADDRESS);
        const nativeToken = await ethers.getContractAt("IERC20", NATIVE_TOKEN);

        // Amount to sell (in tokens)
        const sellAmount = ethers.parseEther("5"); // Adjust this value as needed

        // Get token info and price before sell
        console.log("\nBefore Sell:");
        const totalTokenSold = await sloth.totalTokenSold();
        const totalNativeCollected = await sloth.totalNativeCollected();
        const tokenPrice = await sloth.getTokenPrice();
        console.log("Total Token Sold:", ethers.formatEther(totalTokenSold));
        console.log("Total Native Collected:", ethers.formatEther(totalNativeCollected));
        console.log("Current Token Price:", ethers.formatEther(tokenPrice), "A8/token");

        // Calculate expected native amount
        const expectedNative = await sloth.calculateNativeAmount(sellAmount);
        console.log("\nSell Details:");
        console.log("Token Amount:", ethers.formatEther(sellAmount));
        console.log("Expected Native:", ethers.formatEther(expectedNative));
        console.log("Effective Sell Price:", ethers.formatEther(expectedNative) / ethers.formatEther(sellAmount), "A8/token");

        // Check token balance and allowance
        const balance = await token.balanceOf(signer.address);
        const allowance = await token.allowance(signer.address, SLOTH_ADDRESS);
        
        console.log("\nChecks:");
        console.log("Token Balance:", ethers.formatEther(balance));
        console.log("Current Allowance:", ethers.formatEther(allowance));

        // Approve if needed
        if (allowance < sellAmount) {
            console.log("\nApproving tokens...");
            const approveTx = await token.approve(SLOTH_ADDRESS, sellAmount);
            await approveTx.wait();
            console.log("Approved ✅");
        }

        // Sell tokens
        console.log("\nSelling tokens...");
        const sellTx = await sloth.sell(sellAmount, signer.address);
        await sellTx.wait();
        console.log("Sell successful! ✅");

        // Get updated balances and price
        const newTokenBalance = await token.balanceOf(signer.address);
        const newNativeBalance = await nativeToken.balanceOf(signer.address);
        const newTokenPrice = await sloth.getTokenPrice();
        
        console.log("\nAfter Sell:");
        console.log("Token Balance:", ethers.formatEther(newTokenBalance));
        console.log("Native Balance:", ethers.formatEther(newNativeBalance));
        console.log("New Token Price:", ethers.formatEther(newTokenPrice), "A8/token");
        console.log("Price Change:", 
            ((ethers.formatEther(newTokenPrice) / ethers.formatEther(tokenPrice) - 1) * 100).toFixed(2), 
            "%"
        );

        // Get bonding curve progress
        const progress = await sloth.getBondingCurveProgress();
        console.log("\nBonding Curve Progress:");
        console.log("Progress:", progress.progress.toString(), "%");
        console.log("Current Balance:", ethers.formatEther(progress.currentBalance));
        console.log("Max Balance:", ethers.formatEther(progress.maxBalance));

    } catch (error) {
        console.error("\nError selling tokens:", error.message || error);
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