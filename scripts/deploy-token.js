const hre = require("hardhat");
const { ethers } = require("hardhat");

async function main() {
  // Get the contract factory
  const SlothToken = await ethers.getContractFactory("SlothToken");
  
  // Deploy parameters
  const name = "Sloth Token";
  const symbol = "SLOTH";
  const totalSupply = ethers.parseEther("1000000"); // 1 million tokens with 18 decimals
  
  // Get the deployer's address
  const [deployer] = await ethers.getSigners();
  
  console.log("Deploying SlothToken with the account:", deployer.address);
  
  // Deploy the contract
  const slothToken = await SlothToken.deploy();
  await slothToken.waitForDeployment();
  
  // Initialize the contract
  await slothToken.initializeWithoutLaunching(
    name,
    symbol,
    totalSupply,
    deployer.address
  );
  
  const slothTokenAddress = await slothToken.getAddress();
  console.log("SlothToken deployed to:", slothTokenAddress);
  
  // Verify contract on Etherscan (if not on a local network)
  if (network.name !== "hardhat" && network.name !== "localhost") {
    console.log("Waiting for block confirmations...");
    
    await hre.run("verify:verify", {
      address: slothTokenAddress,
      contract: "contracts/SlothToken.sol:SlothToken"
    });
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 