const { ethers } = require("hardhat");

async function main() {
    try {
        // Factory contract address
        const FACTORY_ADDRESS = "0xEfD274F10fD2dF021be3d910d66C24C94E24cD98";
        
        // Get the Factory contract
        const factory = await ethers.getContractAt("Factory", FACTORY_ADDRESS);
        
        // Token parameters
        const tokenParams = {
            name: "Token A",
            symbol: "TKA",
            initialSupply: ethers.parseUnits("1000000", 18), // 1M tokens
            slope: ethers.parseUnits("0.0001", 18),          // 0.0001 slope
            basePrice: ethers.parseUnits("0.0000001", 18)  // 0.00000001 ETH (100 Gwei)
        };

        console.log("Creating token with parameters:");
        console.log("Name:", tokenParams.name);
        console.log("Symbol:", tokenParams.symbol);
        console.log("Initial Supply:", ethers.formatUnits(tokenParams.initialSupply, 18));
        console.log("Slope:", ethers.formatUnits(tokenParams.slope, 18));
        console.log("Base Price:", ethers.formatUnits(tokenParams.basePrice, 18), "ETH");

        // Get creation fee
        const creationFee = await factory.creationFee();
        console.log("Creation Fee:", ethers.formatEther(creationFee), "ETH");

        // Create token and curve
        const tx = await factory.createTokenAndCurve(
            tokenParams.name,
            tokenParams.symbol,
            tokenParams.initialSupply,
            tokenParams.slope,
            tokenParams.basePrice,
            { value: creationFee }
        );

        console.log("Transaction hash:", tx.hash);
        console.log("Waiting for confirmation...");

        // Wait for transaction to be mined
        const receipt = await tx.wait();

        // Get token and curve addresses from event
        const event = receipt.events.find(e => e.event === 'TokenAndCurveCreated');
        const tokenAddress = event.args.token;
        const curveAddress = event.args.bondingCurve;

        console.log("\nToken created successfully!");
        console.log("Token Address:", tokenAddress);
        console.log("Curve Address:", curveAddress);

    } catch (error) {
        console.error("Error creating token:", error);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    }); 