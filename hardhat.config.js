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
    'ancient8-testnet': {
      url: 'https://rpcv2-testnet.ancient8.gg',
      accounts: [process.env.PRIVATE_KEY],
      chainId: 28122024
    },
    'sonic-blaze': {
      url: "https://rpc.blaze.soniclabs.com",
      accounts: [process.env.PRIVATE_KEY],
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
          apiURL: "https://explorer-ancient-8-celestia-wib77nnwsq.t.conduit.xyz/api",
          browserURL: "https://explorer-ancient-8-celestia-wib77nnwsq.t.conduit.xyz:443"
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
  }
};