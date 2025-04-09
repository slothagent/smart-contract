const { ethers } = require('ethers');
require('dotenv').config();

const SLOTH_ADDRESS = "0xCc384a3a9C9742414F6040D6A0F18d9dF9af4842";
const NATIVE_TOKEN = "0xfC57492d6569f6F45Ea1b8850e842Bf5F9656EA6";

async function buyToken() {
    try {
        // Connect to provider
        const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
        
        // Setup wallet
        const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
        const relayer = new ethers.Wallet(process.env.RELAYER_PRIVATE_KEY, provider);

        // Setup contracts
        const slothABI = [
            "function totalTokenSold() view returns (uint256)",
            "function nonces(address) view returns (uint256)",
            "function initialBuy(uint256 _nativeAmount, address _to) external",
            "function verifyBuySignatureWithRelayer(address buyer, address recipient, uint256 nativeAmount, uint256 deadline, uint8 v, bytes32 r, bytes32 s, uint256 nonce, address relayer) external view returns (bool)",
            "function buyWithPermitRelayer(address buyer, address recipient, uint256 nativeAmount, uint256 deadline, uint8 v, bytes32 r, bytes32 s, uint256 nonce, address relayer) external"
        ];
        const slothContract = new ethers.Contract(SLOTH_ADDRESS, slothABI, provider);

        const tokenABI = [
            "function approve(address spender, uint256 amount) external returns (bool)",
            "function allowance(address owner, address spender) view returns (uint256)",
            "function transfer(address to, uint256 amount) external returns (bool)"
        ];
        const nativeTokenContract = new ethers.Contract(NATIVE_TOKEN, tokenABI, wallet);
        
        // Check if initial buy is needed
        const totalTokenSold = await slothContract.totalTokenSold();
        console.log("Total token sold:", totalTokenSold.toString());

        if (totalTokenSold === 0n) {
            console.log("Performing initial buy...");
            const buyAmount = ethers.parseEther("1.0");
            
            // First transfer native token to contract
            const transferTx = await nativeTokenContract.transfer(SLOTH_ADDRESS, buyAmount);
            await transferTx.wait();
            console.log("Native token transferred to contract");

            // Then do initial buy
            const initialBuyTx = await slothContract.connect(wallet).initialBuy(buyAmount, wallet.address);
            await initialBuyTx.wait();
            console.log("Initial buy completed!");
            return;
        }

        // Prepare transaction parameters
        const buyAmount = ethers.parseEther("1.0");
        const currentTimestamp = Math.floor(Date.now() / 1000);
        const deadline = currentTimestamp + 3600; // 1 hour from now
        const network = await provider.getNetwork();
        const chainId = Number(network.chainId);
        const nonce = await slothContract.nonces(wallet.address);

        console.log("Transaction parameters:");
        console.log("Chain ID:", chainId);
        console.log("Current nonce:", nonce);
        console.log("Wallet address:", wallet.address);
        console.log("Relayer address:", relayer.address);
        console.log("Buy amount:", ethers.formatEther(buyAmount), "ETH");

        // Prepare signing data
        const domain = {
            name: "Sloth Factory",
            version: "1",
            chainId,
            verifyingContract: SLOTH_ADDRESS
        };

        const types = {
            Buy: [
                { name: 'buyer', type: 'address' },
                { name: 'recipient', type: 'address' },
                { name: 'nativeAmount', type: 'uint256' },
                { name: 'nonce', type: 'uint256' },
                { name: 'deadline', type: 'uint256' },
                { name: 'relayer', type: 'address' }
            ]
        };

        const value = {
            buyer: wallet.address,
            recipient: wallet.address,
            nativeAmount: buyAmount,
            nonce: nonce,
            deadline: deadline,
            relayer: relayer.address
        };

        console.log("Signing data:", { domain, types, value });

        // Sign the transaction
        const signature = await wallet.signTypedData(domain, types, value);
        const { v, r, s } = ethers.Signature.from(signature);
        console.log("Signature components:", { v, r, s });

        // Verify signature first
        console.log("Verifying signature...");
        const isValid = await slothContract.verifyBuySignatureWithRelayer(
            value.buyer,
            value.recipient,
            value.nativeAmount,
            value.deadline,
            v,
            r,
            s,
            value.nonce,
            value.relayer
        );
        console.log("Signature is valid:", isValid);

        if (!isValid) {
            throw new Error("Invalid signature");
        }

        // Check and approve native token after signature verification
        const currentAllowance = await nativeTokenContract.allowance(wallet.address, SLOTH_ADDRESS);
        console.log("Current allowance:", ethers.formatEther(currentAllowance));

        if (currentAllowance < buyAmount) {
            console.log("Approving native token...");
            const approveTx = await nativeTokenContract.approve(SLOTH_ADDRESS, ethers.MaxUint256);
            await approveTx.wait();
            console.log("Native token approved!");
        } else {
            console.log("Sufficient allowance exists");
        }

        // Execute the buy transaction through relayer
        console.log("Executing buy transaction...");
        const iface = new ethers.Interface(slothABI);
        const data = iface.encodeFunctionData("buyWithPermitRelayer", [
            value.buyer,
            value.recipient,
            value.nativeAmount,
            value.deadline,
            v,
            r,
            s,
            value.nonce,
            value.relayer
        ]);

        const tx = await relayer.sendTransaction({
            to: SLOTH_ADDRESS,
            data: data,
            gasLimit: 500000
        });

        console.log("Transaction sent:", tx.hash);
        const receipt = await tx.wait();
        
        if (receipt.status === 0) {
            throw new Error("Transaction failed");
        }
        
        console.log("Transaction confirmed successfully!");

    } catch (error) {
        console.error("Error:", error);
        if (error.transaction) {
            console.error("Transaction details:", error.transaction);
        }
        if (error.error) {
            console.error("Error details:", error.error);
        }
    }
}

// Execute the script
buyToken()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    }); 