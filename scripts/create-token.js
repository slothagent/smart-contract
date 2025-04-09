const { ethers } = require("hardhat");

async function main() {
    const [signer] = await ethers.getSigners();
    console.log("Deployer address:", signer.address);

    // Get the SlothFactory contract
    const factoryAddress = "0xCF866B12280312C726a56b18e0205C1Baaa38AB8";
    console.log("Factory address:", factoryAddress);
    
    try {
        const factory = await ethers.getContractAt("SlothFactory", factoryAddress);
        
        // Verify factory contract
        const code = await ethers.provider.getCode(factoryAddress);
        if (code === "0x") {
            throw new Error("Factory contract not found at the specified address");
        }

        // Get and verify Uniswap V2 Factory
        const uniswapFactoryAddress = await factory.uniswapV2Factory();
        console.log("\nChecking Uniswap V2 Factory:", uniswapFactoryAddress);
        
        const uniswapCode = await ethers.provider.getCode(uniswapFactoryAddress);
        if (uniswapCode === "0x") {
            throw new Error("Uniswap V2 Factory not found at the specified address");
        }

        // Get native token contract
        const nativeTokenAddress = "0xfC57492d6569f6F45Ea1b8850e842Bf5F9656EA6";
        const nativeToken = await ethers.getContractAt("IERC20", nativeTokenAddress);

        // Check factory state
        console.log("\nChecking Factory State:");
        const isLaunching = await factory.forLaunching();
        const factoryNative = await factory.native();
        const creationFee = await factory.creationFee();
        const factorySaleAmount = await factory.saleAmount();
        console.log("Factory Launching Mode:", isLaunching);
        console.log("Factory Native Token:", factoryNative);
        console.log("Creation Fee:", ethers.formatEther(creationFee), "Native Token");
        console.log("Factory Sale Amount:", ethers.formatEther(factorySaleAmount), "Tokens");

        // Check balances
        const balance = await nativeToken.balanceOf(signer.address);
        console.log("\nNative Token Balance:", ethers.formatEther(balance), "Native Token");

        // Parameters for new token
        const tokenParams = {
            name: "MyToken",
            symbol: "MTK",
            tokenId: 1,
            initialDeposit: ethers.parseEther("0.5"),
        };

        console.log("\nPre-creation Checks:");
        console.log("1. Native Token Address matches Factory:", factoryNative.toLowerCase() === nativeTokenAddress.toLowerCase() ? "✅" : "❌");
        console.log("2. Factory in Launching Mode:", isLaunching ? "✅" : "❌");
        console.log("3. Uniswap V2 Factory is active:", uniswapCode !== "0x" ? "✅" : "❌");
        
        const requiredAmount = tokenParams.initialDeposit + creationFee;
        console.log("4. Required Amount:", ethers.formatEther(requiredAmount), "Native Token");
        console.log("5. Current Balance:", ethers.formatEther(balance), "Native Token");
        console.log("6. Has Sufficient Balance:", balance >= requiredAmount ? "✅" : "❌");

        // Check allowance
        const allowance = await nativeToken.allowance(signer.address, factoryAddress);
        console.log("7. Current Allowance:", ethers.formatEther(allowance), "Native Token");
        console.log("8. Has Sufficient Allowance:", allowance >= requiredAmount ? "✅" : "❌");

        if (!isLaunching) {
            throw new Error("Factory is not in launching mode");
        }

        if (factoryNative.toLowerCase() !== nativeTokenAddress.toLowerCase()) {
            throw new Error("Native token address mismatch in factory");
        }

        if (balance < requiredAmount) {
            throw new Error(`Insufficient balance. Need ${ethers.formatEther(requiredAmount)} but have ${ethers.formatEther(balance)}`);
        }

        // Approve if needed
        if (allowance < requiredAmount) {
            console.log("\nApproving native token...");
            const approveTx = await nativeToken.approve(factoryAddress, requiredAmount);
            console.log("Approval transaction hash:", approveTx.hash);
            await approveTx.wait();
            console.log("Native token approved ✅");
        }

        console.log("\nCreating new token...");
        console.log("Name:", tokenParams.name);
        console.log("Symbol:", tokenParams.symbol);
        console.log("Token ID:", tokenParams.tokenId);
        console.log("Initial Deposit:", ethers.formatEther(tokenParams.initialDeposit), "Native Token");

        // Create new token with explicit parameters
        const createTx = await factory.create({
            name: tokenParams.name,
            symbol: tokenParams.symbol,
            tokenId: tokenParams.tokenId,
            initialDeposit: tokenParams.initialDeposit,
            whitelistEnabled: false
        });

        console.log("Create transaction hash:", createTx.hash);
        
        // Wait for transaction to be mined
        const receipt = await createTx.wait();
        
        // Get token and sloth addresses from event
        const event = receipt.events.find(e => e.event === 'SlothCreated');
        if (!event) {
            throw new Error("SlothCreated event not found in transaction receipt");
        }
        
        const tokenAddress = event.args.token;
        const slothAddress = event.args.sloth;

        console.log("\nToken created successfully!");
        console.log("Token address:", tokenAddress);
        console.log("Sloth address:", slothAddress);

        // Get token info
        const token = await ethers.getContractAt("SlothToken", tokenAddress);
        
        const totalSupply = await token.totalSupply();
        console.log("\nToken Info:");
        console.log("Total Supply:", ethers.formatEther(totalSupply));

        // Get Sloth contract info
        const sloth = await ethers.getContractAt("Sloth", slothAddress);
        
        const saleAmount = await sloth.saleAmount();
        console.log("Sale Amount:", ethers.formatEther(saleAmount));
        
        // Get initial liquidity info
        const [tokenReserve, nativeReserve, totalLiquidity] = await sloth.getLiquidityInfo();
        console.log("\nInitial Liquidity Info:");
        console.log("Token Reserve:", ethers.formatEther(tokenReserve));
        console.log("Native Reserve:", ethers.formatEther(nativeReserve));
        console.log("Total Liquidity:", ethers.formatEther(totalLiquidity));

    } catch (error) {
        console.error("\nError creating token:", error.message || error);
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