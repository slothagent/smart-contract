const hre = require("hardhat");
const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);

  // Deploy SlothFactory
  const SlothFactory = await ethers.getContractFactory("SlothFactory");
  const slothFactory = await SlothFactory.deploy(deployer.address);
  await slothFactory.waitForDeployment();
  console.log("SlothFactory deployed to:", await slothFactory.getAddress());

  // Deploy Sloth implementation
  const Sloth = await ethers.getContractFactory("Sloth");
  const slothImplementation = await Sloth.deploy();
  await slothImplementation.waitForDeployment();
  console.log("Sloth Implementation deployed to:", await slothImplementation.getAddress());

  // Initialize SlothFactory
  const initParams = {
    slothImplementation: await slothImplementation.getAddress(),
    uniswapV2Factory: "0x0312E35AA42E9F7275045953f11Ce695B73469C6",
    native: "0xfC57492d6569f6F45Ea1b8850e842Bf5F9656EA6",
    signerAddress: deployer.address,
    feeTo: deployer.address,
    tradingFeeRate: "100",
    listingFeeRate: "500",
    creationFee: "0",
    totalSupply: "1000000000000000000000000000",
    saleAmount: "800000000000000000000000000",
    tokenOffset: "266666666666666700000000000",
    nativeOffset: "8333333333333334000000"
  };

  const initTx = await slothFactory.initialize(initParams);
  await initTx.wait();
  console.log("SlothFactory initialized");

  // Verify contracts on Etherscan
  if (hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
    console.log("Verifying contracts on Etherscan...");
    
    await hre.run("verify:verify", {
      address: await slothFactory.getAddress(),
      constructorArguments: [deployer.address],
    });

    await hre.run("verify:verify", {
      address: await slothImplementation.getAddress(),
      constructorArguments: [],
    });
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 