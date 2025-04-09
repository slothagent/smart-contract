const ethers = require('ethers');
require('dotenv').config();

const SLOTH_ADDRESS = "0xEbc5A14E0d3556F8CFaFafb3Eb9F101B8E5291e1";
const TOKEN_ADDRESS = "0x2049dB51940Bf2F3dbfB55f82541dF725310B598";

async function sellToken() {
    try {
        // Connect to provider
        const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL);
        
        // Setup wallet
        const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
        const relayer = new ethers.Wallet(process.env.RELAYER_PRIVATE_KEY, provider);

        // Get current timestamp for deadline
        const currentTimestamp = Math.floor(Date.now() / 1000);
        const deadline = currentTimestamp + 3600; // 1 hour from now

        // Get chain id
        const chainId = (await provider.getNetwork()).chainId;

        // Get current nonce
        const slothABI = ["function nonces(address) view returns (uint256)"];
        const slothContract = new ethers.Contract(SLOTH_ADDRESS, slothABI, provider);
        const nonce = await slothContract.nonces(wallet.address);

        // Check token allowance and approve if needed
        const tokenABI = [
            "function approve(address spender, uint256 amount) external returns (bool)",
            "function allowance(address owner, address spender) view returns (uint256)"
        ];
        const tokenContract = new ethers.Contract(TOKEN_ADDRESS, tokenABI, wallet);
        const currentAllowance = await tokenContract.allowance(wallet.address, SLOTH_ADDRESS);
        const sellAmount = ethers.utils.parseEther("1.0"); // Selling 1 token

        if (currentAllowance.lt(sellAmount)) {
            console.log("Approving tokens...");
            const approveTx = await tokenContract.approve(SLOTH_ADDRESS, ethers.constants.MaxUint256);
            await approveTx.wait();
            console.log("Tokens approved!");
        }

        // Prepare signing data
        const domain = {
            name: "Sloth Factory",
            version: "1",
            chainId: chainId,
            verifyingContract: SLOTH_ADDRESS
        };

        const types = {
            Sell: [
                { name: 'seller', type: 'address' },
                { name: 'recipient', type: 'address' },
                { name: 'tokenAmount', type: 'uint256' },
                { name: 'nonce', type: 'uint256' },
                { name: 'deadline', type: 'uint256' },
                { name: 'relayer', type: 'address' }
            ]
        };

        const value = {
            seller: wallet.address,
            recipient: wallet.address,
            tokenAmount: sellAmount,
            nonce: nonce,
            deadline: deadline,
            relayer: relayer.address
        };

        // Sign the transaction
        const signature = await wallet._signTypedData(domain, types, value);
        const { v, r, s } = ethers.utils.splitSignature(signature);

        // Prepare the relayer contract
        const relayerABI = [
            "function sellWithPermitRelayer(address seller, address recipient, uint256 tokenAmount, uint256 deadline, uint8 v, bytes32 r, bytes32 s, uint256 nonce, address relayer) external"
        ];
        const relayerContract = new ethers.Contract(SLOTH_ADDRESS, relayerABI, relayer);

        // Execute the sell transaction through relayer
        const tx = await relayerContract.sellWithPermitRelayer(
            value.seller,
            value.recipient,
            value.tokenAmount,
            value.deadline,
            v,
            r,
            s,
            value.nonce,
            value.relayer
        );

        console.log("Transaction sent:", tx.hash);
        await tx.wait();
        console.log("Transaction confirmed!");

    } catch (error) {
        console.error("Error:", error);
    }
}

// Execute the script
sellToken()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    }); 