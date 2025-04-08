const hre = require("hardhat");

async function main() {
  console.log("Deploying contracts...");

  // Deploy Token with constructor arguments
  const Token = await hre.ethers.deployContract("ContractErc20", ["Test Token", "TEST", 1000000000]);
  await Token.waitForDeployment();
  console.log("Token deployed to:", Token.target);

  // Verify contract on explorer
  console.log("\nVerifying contract...");
  try {
    await hre.run("verify:verify", {
      address: Token.target,
      constructorArguments: ["Test Token", "TEST", 1000000000]
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