const hre = require("hardhat");

async function main() {
  console.log("Deploying contracts...");

  // Deploy Factory
  const Factory = await hre.ethers.deployContract("Factory");
  await Factory.waitForDeployment();
  console.log("Factory deployed to:", Factory.target);

  // Verify contract on explorer
  console.log("\nVerifying contract...");
  try {
    await hre.run("verify:verify", {
      address: Factory.target,
      constructorArguments: []
    });
    console.log("Contract verified successfully");
  } catch (error) {
    console.error("Error verifying contract:", error);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}); 