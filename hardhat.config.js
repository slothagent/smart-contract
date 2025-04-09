require("@nomicfoundation/hardhat-toolbox");
require("@openzeppelin/hardhat-upgrades");
require('dotenv').config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      },
      viaIR: true
    }
  },
  networks: {
    hardhat: {
      chainId: 1337
    },
    localhost: {
      url: "http://127.0.0.1:8545"
    },
    testnet: {
      url: process.env.RPC_URL || "",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : []
    },
    'ancient8-testnet': {
      url: 'https://rpcv2-testnet.ancient8.gg',
      accounts: [process.env.RELAYER_PRIVATE_KEY],
      chainId: 28122024
    },
    'sonic-blaze': {
      url: "https://rpc.blaze.soniclabs.com",
      accounts: [process.env.RELAYER_PRIVATE_KEY],
      chainId: 57054
    }
  },
  etherscan: {
    apiKey: {
      'ancient8-testnet': 'empty',
      'sonic-blaze': process.env.SONICSCAN_TESTNET_API_KEY
    },
    customChains: [
      {
        network: "ancient8-testnet",
        chainId: 28122024,
        urls: {
          apiURL: "https://testnet.a8scan.io/api",
          browserURL: "https://testnet.a8scan.io"
        }
      },
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
  },
  gasReporter: {
    enabled: true,
    currency: 'USD'
  }
};