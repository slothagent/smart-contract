const hre = require("hardhat");
const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);

  // Deploy SlothFactory
  const SlothFactory = await ethers.getContractFactory("SlothFactorySonic");
  const slothFactory = await SlothFactory.deploy(deployer.address);
  await slothFactory.waitForDeployment();
  console.log("SlothFactory deployed to:", await slothFactory.getAddress());

  // Deploy Sloth implementation
  const Sloth = await ethers.getContractFactory("SlothSonic");
  const slothImplementation = await Sloth.deploy();
  await slothImplementation.waitForDeployment();
  console.log("Sloth Implementation deployed to:", await slothImplementation.getAddress());

  // Initialize SlothFactory
  const initParams = {
    slothImplementation: await slothImplementation.getAddress(),
    uniswapV2Factory: "0x4d3FF0ccDaad912BDCAfd5A2352739Ee7C6723b3",
    native: "0x039e2fb66102314ce7b64ce5ce3e5183bc94ad38",
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