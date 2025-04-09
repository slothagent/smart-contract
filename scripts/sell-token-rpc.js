const axios = require('axios');
const { ethers } = require("hardhat");
const { formatEther, parseEther, AbiCoder, toBigInt } = ethers;

const RPC_URL = "https://28122024.rpc.thirdweb.com/0f0cbc64d2af63826712a3e7f09fdee7";
const TOKEN_ADDRESS = "0xE15f0e61978338F2fe3f5EFf14E1bDd64a1aC644";
const SLOTH_ADDRESS = "0x849C4bA7BdfcA475C98e8950B3041552ED17db68";
const NATIVE_TOKEN = "0xfC57492d6569f6F45Ea1b8850e842Bf5F9656EA6";

// Function signatures
const SIGNATURES = {
    totalTokenSold: "0xb5f7f636",      // totalTokenSold()
    totalNativeCollected: "0x78e28b7e", // totalNativeCollected()
    getTokenPrice: "0x4b94f50e",       // getTokenPrice()
    calculateNativeAmount: "0x2307548e", // calculateNativeAmount(uint256)
    balanceOf: "0x70a08231",          // balanceOf(address)
    allowance: "0xdd62ed3e",          // allowance(address,address)
    canAddLiquidity: "0x8b0af0fa",    // canAddLiquidity()
    getBondingCurveProgress: "0x67558d46", // getBondingCurveProgress()
    token: "0xfc0c546a",              // token()
    launching: "0x1f2c1cd9",          // launching()
    name: "0x06fdde03",              // name()
    symbol: "0x95d89b41",             // symbol()
    approve: "0x095ea7b3",           // approve(address,uint256)
    sell: "0x4189a68e",              // sell(uint256,address)
    getMarketCap: "0x90825c28"       // getMarketCap()
};

async function makeRpcCall(method, params) {
    try {
        const response = await axios.post(RPC_URL, {
            jsonrpc: "2.0",
            id: Math.floor(Math.random() * 1000),
            method,
            params
        });

        if (!response.data || response.data.error) {
            console.error("RPC Error:", response.data?.error || "No response data");
            throw new Error("RPC call failed");
        }

        if (response.data.result === null || response.data.result === undefined) {
            console.error("RPC returned null/undefined result");
            throw new Error("Invalid RPC result");
        }

        return response.data.result;
    } catch (error) {
        console.error("RPC call failed:", error.message);
        console.error("Method:", method);
        console.error("Params:", JSON.stringify(params, null, 2));
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

// Safe conversion to BigInt
function safeToBigInt(hexValue) {
    if (!hexValue || !hexValue.startsWith('0x')) {
        console.error("Invalid hex value:", hexValue);
        throw new Error("Invalid hex value for BigInt conversion");
    }
    return toBigInt(hexValue);
}

// Encode function call with parameters
function encodeFunction(signature, ...params) {
    const abiCoder = new AbiCoder();
    const encodedParams = params.length > 0 ? abiCoder.encode(params.map(() => 'uint256'), params).slice(2) : '';
    return signature + encodedParams;
}

async function main() {
    const [signer] = await ethers.getSigners();
    console.log("Seller address:", signer.address);

    try {
        // Amount of tokens to sell
        const sellAmount = parseEther("1"); // Adjust this value as needed

        // Get token info and price before sell
        console.log("\nBefore Sell:");
        const totalTokenSoldHex = await ethCall(SLOTH_ADDRESS, SIGNATURES.totalTokenSold);
        const totalTokenSold = safeToBigInt(totalTokenSoldHex);
        
        const totalNativeCollectedHex = await ethCall(SLOTH_ADDRESS, SIGNATURES.totalNativeCollected);
        const totalNativeCollected = safeToBigInt(totalNativeCollectedHex);
        
        const tokenPriceHex = await ethCall(SLOTH_ADDRESS, SIGNATURES.getTokenPrice);
        const tokenPrice = safeToBigInt(tokenPriceHex);
        
        console.log("Total Token Sold:", formatEther(totalTokenSold));
        console.log("Total Native Collected:", formatEther(totalNativeCollected));
        console.log("Current Token Price:", formatEther(tokenPrice), "A8/token");

        // Calculate expected native amount
        const calculateNativeData = encodeFunction(SIGNATURES.calculateNativeAmount, sellAmount);
        const expectedNativeHex = await ethCall(SLOTH_ADDRESS, calculateNativeData);
        const expectedNative = safeToBigInt(expectedNativeHex);
        
        console.log("\nSell Details:");
        console.log("Token Amount to Sell:", formatEther(sellAmount));
        console.log("Expected Native Return:", formatEther(expectedNative));
        console.log("Effective Sell Price:", formatEther(expectedNative) / formatEther(sellAmount), "A8/token");

        // Check token balance and allowance
        const balanceData = encodeFunction(SIGNATURES.balanceOf, signer.address);
        const balanceHex = await ethCall(TOKEN_ADDRESS, balanceData);
        const balance = safeToBigInt(balanceHex);

        const allowanceData = encodeFunction(SIGNATURES.allowance, signer.address, SLOTH_ADDRESS);
        const allowanceHex = await ethCall(TOKEN_ADDRESS, allowanceData);
        const allowance = safeToBigInt(allowanceHex);
        
        console.log("\nChecks:");
        console.log("Token Balance:", formatEther(balance));
        console.log("Current Allowance:", formatEther(allowance));

        // Approve if needed
        if (allowance < sellAmount) {
            console.log("\nApproving tokens...");
            const approveData = encodeFunction(SIGNATURES.approve, SLOTH_ADDRESS, sellAmount);
            const approveTx = await signer.sendTransaction({
                to: TOKEN_ADDRESS,
                data: approveData
            });
            await approveTx.wait();
            console.log("Approved ✅");
        }

        // Sell tokens
        console.log("\nSelling tokens...");
        const sellData = encodeFunction(SIGNATURES.sell, sellAmount, signer.address);
        const sellTx = await signer.sendTransaction({
            to: SLOTH_ADDRESS,
            data: sellData
        });
        await sellTx.wait();
        console.log("Sell successful! ✅");

        // Get updated balances and price
        const newTokenBalanceHex = await ethCall(TOKEN_ADDRESS, balanceData);
        const newTokenBalance = safeToBigInt(newTokenBalanceHex);

        const newNativeBalanceData = encodeFunction(SIGNATURES.balanceOf, signer.address);
        const newNativeBalanceHex = await ethCall(NATIVE_TOKEN, newNativeBalanceData);
        const newNativeBalance = safeToBigInt(newNativeBalanceHex);

        const newTokenPriceHex = await ethCall(SLOTH_ADDRESS, SIGNATURES.getTokenPrice);
        const newTokenPrice = safeToBigInt(newTokenPriceHex);
        
        console.log("\nAfter Sell:");
        console.log("Token Balance:", formatEther(newTokenBalance));
        console.log("Native Balance:", formatEther(newNativeBalance));
        console.log("New Token Price:", formatEther(newTokenPrice), "A8/token");
        console.log("Price Change:", 
            ((formatEther(newTokenPrice) / formatEther(tokenPrice) - 1) * 100).toFixed(2), 
            "%"
        );

        // Check bonding curve progress
        const progressHex = await ethCall(SLOTH_ADDRESS, SIGNATURES.getBondingCurveProgress);
        const progress = {
            progress: safeToBigInt(progressHex.slice(0, 66)),
            currentBalance: safeToBigInt('0x' + progressHex.slice(66, 130)),
            maxBalance: safeToBigInt('0x' + progressHex.slice(130, 194))
        };
        
        console.log("\nBonding Curve Progress:");
        console.log("Progress:", progress.progress.toString(), "%");
        console.log("Current Balance:", formatEther(progress.currentBalance));
        console.log("Max Balance:", formatEther(progress.maxBalance));

    } catch (error) {
        console.error("\nError selling tokens:", error.message || error);
        if (error.data) {
            console.error("Error data:", error.data);
        }
        process.exit(1);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    }); 