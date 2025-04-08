require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    'sonic-blaze': {
      url: "https://rpc.blaze.soniclabs.com",
      accounts: [process.env.PRIVATE_KEY],
      chainId: 57054
    },
  },
  etherscan: {
    apiKey: {
      'sonic-blaze': process.env.SONICSCAN_TESTNET_API_KEY
    },
    customChains: [
      {
        network: "sonic-blaze",
        chainId: 57054,
        urls: {
          apiURL: "https://api-testnet.sonicscan.org/api",
          browserURL: "https://testnet.sonicscan.org"
        }
      }
    ]
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  }
};