const { ethers } = require('ethers');
const axios = require('axios');
require('dotenv').config();

// ABI for the SlothFactory contract (only the functions we need)
const FACTORY_ABI = [
  "function createWithPermitRelayer(address creator, tuple(string name, string symbol, uint256 tokenId, uint256 initialDeposit) params, uint256 deadline, uint8 v, bytes32 r, bytes32 s, uint256 nonce) external returns (address token, address sloth)",
  "function verifyCreateSignatureWithRelayer(address creator, tuple(string name, string symbol, uint256 tokenId, uint256 initialDeposit) params, uint256 deadline, uint8 v, bytes32 r, bytes32 s, address relayer, uint256 nonce) external view returns (bool)",
  "function nonces(address owner) view returns (uint256)",
  "function DOMAIN_SEPARATOR() view returns (bytes32)",
  "function native() view returns (address)",
  "function creationFee() view returns (uint256)",
  "function forLaunching() view returns (bool)"
];

// Factory contract address
const FACTORY_ADDRESS = "0x81baE711d2da2b7a53B162c129D9501484fCE9B0";

// Create token operation type
const CREATE_TYPE = [
  { name: "creator", type: "address" },
  { name: "name", type: "string" },
  { name: "symbol", type: "string" },
  { name: "tokenId", type: "uint256" },
  { name: "initialDeposit", type: "uint256" },
  { name: "nonce", type: "uint256" },
  { name: "deadline", type: "uint256" },
  { name: "relayer", type: "address" }
];

// Add signatures
const SIGNATURES = {
    allowance: "0xdd62ed3e",          // allowance(address,address)
    approve: "0x095ea7b3",           // approve(address,uint256)
};

// RPC helper functions
async function makeRpcCall(method, params) {
    try {
        const response = await axios.post(process.env.RPC_URL, {
            jsonrpc: "2.0",
            id: Math.floor(Math.random() * 1000),
            method,
            params
        });

        if (!response.data || response.data.error) {
            console.error("RPC Error:", response.data?.error || "No response data");
            throw new Error("RPC call failed");
        }

        return response.data.result;
    } catch (error) {
        console.error("RPC call failed:", error.message);
        throw error;
    }
}

async function ethCall(to, data) {
    try {
        const result = await makeRpcCall("eth_call", [{
            to,
            data
        }, "latest"]);

        if (!result || !result.startsWith('0x')) {
            console.error("Invalid eth_call result:", result);
            throw new Error("Invalid eth_call result");
        }

        return result;
    } catch (error) {
        console.error("eth_call failed for contract:", to);
        console.error("with data:", data);
        throw error;
    }
}

// Encode function call with parameters
function encodeFunction(signature, ...params) {
    const abiCoder = new ethers.AbiCoder();
    const encodedParams = params.length > 0 ? abiCoder.encode(params.map(() => 'uint256'), params).slice(2) : '';
    return signature + encodedParams;
}

async function createTokenWithPermitRelayer(
  signer,
  relayer,
  {
    name,
    symbol,
    tokenId,
    initialDeposit = 0
  }
) {
  try {
    // Get provider from signer
    const provider = signer.provider;
    if (!provider) {
      throw new Error("Signer must be connected to a provider");
    }

    // Create contract instance
    const factory = new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, provider);

    // Check if factory is in launching mode
    const isLaunching = await factory.forLaunching();
    console.log("Factory launching mode:", isLaunching);
    if (!isLaunching) {
      throw new Error("Factory is not in launching mode");
    }

    // Get chain ID
    const { chainId } = await provider.getNetwork();
    console.log("Chain ID:", chainId);

    // Get current nonce
    const creatorAddress = await signer.getAddress();
    const nonce = await factory.nonces(creatorAddress);
    console.log("Current nonce:", nonce.toString());
    console.log("Creator address:", creatorAddress);

    // Set deadline to 24 hours from now
    const deadline = Math.floor(Date.now() / 1000) + 86400;
    console.log("Deadline:", new Date(deadline * 1000));

    // Get domain separator
    const domainSeparator = await factory.DOMAIN_SEPARATOR();
    console.log("Domain Separator:", domainSeparator);

    // Get creation fee
    const creationFee = await factory.creationFee();
    console.log("Creation fee:", ethers.formatEther(creationFee), "ETH");

    // Check if relayer has enough balance for creation fee
    const relayerBalance = await provider.getBalance(relayer.address);
    console.log("Relayer balance:", ethers.formatEther(relayerBalance), "ETH");
    console.log("Relayer address:", relayer.address);
    if (relayerBalance < creationFee) {
      throw new Error(`Relayer doesn't have enough balance for creation fee. Required: ${ethers.formatEther(creationFee)} ETH, Has: ${ethers.formatEther(relayerBalance)} ETH`);
    }

    // Check native token balance
    const nativeToken = await factory.native();
    console.log("Native token address:", nativeToken);
    const nativeTokenContract = new ethers.Contract(nativeToken, [
      "function balanceOf(address) view returns (uint256)",
      "function allowance(address,address) view returns (uint256)"
    ], provider);
    
    const creatorNativeBalance = await nativeTokenContract.balanceOf(creatorAddress);
    console.log("Creator native token balance:", ethers.formatEther(creatorNativeBalance));
    
    const creatorNativeAllowance = await nativeTokenContract.allowance(creatorAddress, factory.target);
    console.log("Creator native token allowance:", ethers.formatEther(creatorNativeAllowance));

    // Prepare message data
    const messageData = {
      creator: creatorAddress,
      name,
      symbol,
      tokenId,
      initialDeposit,
      nonce,
      deadline,
      relayer: relayer.address
    };

    console.log("Message data:", messageData);
    console.log("Initial deposit:", ethers.formatEther(messageData.initialDeposit), "ETH");

    // Get native token address
    const nativeTokenAddress = await factory.native();
    console.log("Native token address:", nativeTokenAddress);

    // Check allowance using RPC
    const allowanceData = encodeFunction(
      SIGNATURES.allowance,
      BigInt(creatorAddress),
      BigInt(FACTORY_ADDRESS)
    );
    const allowanceHex = await ethCall(nativeTokenAddress, allowanceData);
    const allowance = BigInt(allowanceHex);
    console.log("Current allowance:", ethers.formatEther(allowance));

    // Check if approval is needed
    if (allowance < messageData.initialDeposit) {
      console.log("\nApproving native token...");
      const approveData = encodeFunction(
        SIGNATURES.approve,
        BigInt(FACTORY_ADDRESS),
        messageData.initialDeposit
      );
      
      const approveTx = await signer.sendTransaction({
        to: nativeTokenAddress,
        data: approveData
      });
      console.log("Approval transaction sent:", approveTx.hash);
      
      await approveTx.wait();
      console.log("Approval confirmed ✅");
    }

    // Sign the message
    console.log("Signing message...");
    const signature = await signer.signTypedData(
      {
        name: "Sloth Factory",
        version: "1",
        chainId,
        verifyingContract: FACTORY_ADDRESS
      },
      {
        Create: CREATE_TYPE
      },
      messageData
    );

    // Split signature
    const { v, r, s } = ethers.Signature.from(signature);
    console.log("Signature components:", { v, r, s });

    // Verify signature first
    console.log("Verifying signature...");
    const isValid = await factory.verifyCreateSignatureWithRelayer(
      messageData.creator,
      {
        name: messageData.name,
        symbol: messageData.symbol,
        tokenId: messageData.tokenId,
        initialDeposit: messageData.initialDeposit
      },
      messageData.deadline,
      v,
      r,
      s,
      relayer.address,
      messageData.nonce
    );

    if (!isValid) {
      throw new Error("Signature verification failed");
    }

    console.log("Signature verified successfully");

    // Create token using relayer
    console.log("Creating token...");
    const tx = await factory.connect(relayer).createWithPermitRelayer(
      messageData.creator,
      {
        name: messageData.name,
        symbol: messageData.symbol,
        tokenId: messageData.tokenId,
        initialDeposit: messageData.initialDeposit
      },
      messageData.deadline,
      v,
      r,
      s,
      messageData.nonce,
      { 
        gasLimit: 5000000
      }
    );

    console.log("Transaction sent:", tx.hash);
    console.log("Waiting for transaction confirmation...");
    
    const receipt = await tx.wait();
    if (receipt.status === 0) {
      // Get more details about the failure
      const code = await provider.call(tx); // This will give us the revert reason
      throw new Error(`Transaction failed with code: ${code}`);
    }
    
    console.log("Transaction confirmed in block:", receipt.blockNumber);

    // Find the SlothCreated event
    const slothCreatedEvent = receipt.logs.find(
      log => log.topics[0] === ethers.id("SlothCreated(address,address,address,uint256,uint256,uint256,uint256,uint256,bool,address)")
    );

    if (!slothCreatedEvent) {
      throw new Error("SlothCreated event not found in transaction logs");
    }

    const parsedEvent = factory.interface.parseLog({
      topics: slothCreatedEvent.topics,
      data: slothCreatedEvent.data
    });

    const result = {
      tokenAddress: parsedEvent.args[0],
      slothAddress: parsedEvent.args[1],
      creator: parsedEvent.args[2],
      totalSupply: parsedEvent.args[3],
      saleAmount: parsedEvent.args[4],
      tokenOffset: parsedEvent.args[5],
      nativeOffset: parsedEvent.args[6],
      tokenId: parsedEvent.args[7],
      whitelistEnabled: parsedEvent.args[8],
      factory: parsedEvent.args[9]
    };

    console.log("Token created successfully:");
    console.log("- Token address:", result.tokenAddress);
    console.log("- Sloth address:", result.slothAddress);
    console.log("- Creator:", result.creator);
    console.log("- Total supply:", result.totalSupply.toString());
    console.log("- Sale amount:", result.saleAmount.toString());
    console.log("- Token ID:", result.tokenId.toString());

    return result;
  } catch (error) {
    console.error("Error creating token:", error);
    // Unwrap nested errors
    if (error.error) {
      console.error("Contract error:", error.error);
    }
    throw error;
  }
}

// Example usage
async function main() {
  try {
    // Set up provider
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    
    // Set up signer (token creator)
    const creatorPrivateKey = process.env.PRIVATE_KEY;
    if (!creatorPrivateKey) {
      throw new Error("PRIVATE_KEY not found in environment variables");
    }
    const signer = new ethers.Wallet(creatorPrivateKey, provider);
    console.log("Creator address:", await signer.getAddress());

    // Set up relayer
    const relayerPrivateKey = process.env.RELAYER_PRIVATE_KEY;
    if (!relayerPrivateKey) {
      throw new Error("RELAYER_PRIVATE_KEY not found in environment variables");
    }
    const relayer = new ethers.Wallet(relayerPrivateKey, provider);
    console.log("Relayer address:", relayer.address);

    // // Create factory instance to get native token address
    // const factory = new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, provider);
    // const nativeTokenAddress = await factory.native();
    
    // // Create native token contract instance
    // const nativeToken = new ethers.Contract(
    //   nativeTokenAddress,
    //   [
    //     "function approve(address spender, uint256 amount) external returns (bool)",
    //     "function allowance(address owner, address spender) external view returns (uint256)"
    //   ],
    //   signer
    // );

    const tokenParams = {
      name: "Example Token",
      symbol: "EXT",
      tokenId: BigInt(Math.floor(Math.random() * 1000000)), // Using BigInt for tokenId
      initialDeposit: ethers.parseEther("1")    // Set initialDeposit to 1
    };

    // // Check current allowance
    // const currentAllowance = await nativeToken.allowance(await signer.getAddress(), FACTORY_ADDRESS);
    // console.log("Current allowance:", ethers.formatEther(currentAllowance), "ETH");

    // // Approve if needed
    // if (currentAllowance < tokenParams.initialDeposit) {
    //   console.log("Approving native token spend...");
    //   const approveTx = await nativeToken.approve(FACTORY_ADDRESS, tokenParams.initialDeposit);
    //   console.log("Approval transaction sent:", approveTx.hash);
    //   await approveTx.wait();
    //   console.log("Approval confirmed");
    // }

    console.log("Creating token with parameters:", tokenParams);
    const result = await createTokenWithPermitRelayer(signer, relayer, tokenParams);
    console.log("Token creation completed!");
  } catch (error) {
    console.error("Failed to create token:", error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  createTokenWithPermitRelayer
};