const hre = require("hardhat");

async function main() {
    console.log("Starting contract verification...");

    const factoryAddress = "0x6FFc6c93F4C28F91775e7b1241902E4B894DF950";// You need to replace this with actual FactoryLib address
    const creationFee = hre.ethers.parseEther("0.001137"); // $3 in ETH


    // Then verify Factory
    console.log("\nVerifying Factory...");
    try {
        await hre.run("verify:verify", {
            address: factoryAddress,
            constructorArguments: [],
        });
        console.log("Factory verified successfully!");
    } catch (error) {
        console.log("Error verifying Factory:", error.message);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    }); 