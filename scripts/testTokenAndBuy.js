require('dotenv').config();
const { ethers } = require('hardhat');

async function main() {
    try {
        // Connect to network
        const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
        const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
        
        // Factory contract address  
        const FACTORY_ADDRESS = "0x9f22945BFd523322f6788b014D4cF693717b74D5";
        
        // Connect to Factory
        const Factory = await ethers.getContractFactory("Factory");
        const factory = Factory.attach(FACTORY_ADDRESS).connect(wallet);

        console.log("Connected wallet:", wallet.address);

        // Check balance
        const walletBalance = await provider.getBalance(wallet.address);
        console.log("\nWallet balance:", ethers.formatEther(walletBalance), "ETH");
        
        // Create new token with 1 ETH initial buy
        console.log("\nCreating new token with 1 ETH initial buy...");
        const createTx = await factory.createTokenAndCurve(
            "Test Token",
            "TEST",
            ethers.parseEther("1"), // Buy 1 ETH worth of tokens
            { 
                value: ethers.parseEther("2"), // 1 ETH creation fee + 1 ETH for buying
                gasLimit: 3000000
            }
        );
        
        const receipt = await createTx.wait();
        console.log("Token created!");

        // Get addresses from event
        const createEvent = receipt.logs.find(
            log => log.fragment && log.fragment.name === 'TokenAndCurveCreated'
        );
        const tokenAddress = createEvent.args[0];
        const curveAddress = createEvent.args[1];

        console.log("\nToken:", tokenAddress);
        console.log("Curve:", curveAddress);

        // Connect to contracts
        const Token = await ethers.getContractFactory("ContractErc20");
        const token = Token.attach(tokenAddress).connect(wallet);

        const BondingCurve = await ethers.getContractFactory("BondingCurve");
        const curve = BondingCurve.attach(curveAddress).connect(wallet);

        // Get initial state
        console.log("\nInitial State:");
        console.log("------------------------");
        const initialState = await getState(token, curve, wallet.address);
        logState(initialState);

        // Buy 1 ETH worth of tokens
        console.log("\nBuying tokens with 1 ETH:");
        console.log("------------------------");
        await buyTokens(curve, token, wallet.address, ethers.parseEther("1"));

        // Get state after first buy
        console.log("\nState After 1 ETH Purchase:");
        console.log("------------------------");
        const stateAfterBuy = await getState(token, curve, wallet.address);
        logState(stateAfterBuy);

        // Buy 1 ETH worth of tokens
        console.log("\nBuying tokens with 1 ETH:");
        console.log("------------------------");
        await buyTokens(curve, token, wallet.address, ethers.parseEther("1"));

        // Get state after second buy
        console.log("\nState After 1 ETH Purchase:");
        console.log("------------------------");
        const stateAfterSecondBuy = await getState(token, curve, wallet.address);
        logState(stateAfterSecondBuy);

        // Approve tokens for selling
        console.log("\nApproving tokens for selling...");
        await token.approve(curveAddress, ethers.MaxUint256);

        // Sell 20% of tokens
        const balance = await token.balanceOf(wallet.address);
        const sellAmount = balance * 20n / 100n;
        console.log("\nSelling 20% of tokens:", ethers.formatEther(sellAmount), "tokens");
        console.log("------------------------");
        await sellTokens(curve, token, sellAmount);

        // Get final state
        console.log("\nFinal State After Sell:");
        console.log("------------------------");
        const finalState = await getState(token, curve, wallet.address);
        logState(finalState);

    } catch (error) {
        console.error("\nError:", error);
        process.exit(1);
    }
}

async function getState(token, curve, address) {
    const tokenBalance = await token.balanceOf(address);
    const totalSupply = await curve.totalSupply();
    const currentPrice = await curve.getCurrentPrice();
    const poolBalance = await curve.getPoolBalance();
    const marketCap = await curve.getTotalMarketCap();
    const fundingRaised = await curve.getTotalFundingRaised();
    const fundingGoal = await curve.FUNDING_GOAL();

    return {
        tokenBalance,
        totalSupply,
        currentPrice,
        poolBalance,
        marketCap,
        fundingRaised,
        fundingGoal
    };
}

function logState(state) {
    console.log("Token Balance:", ethers.formatEther(state.tokenBalance));
    console.log("Total Supply:", ethers.formatEther(state.totalSupply));
    console.log("Current Price:", ethers.formatEther(state.currentPrice), "ETH");
    console.log("Pool Balance:", ethers.formatEther(state.poolBalance), "ETH");
    console.log("Market Cap:", ethers.formatEther(state.marketCap), "ETH");
    console.log("Funding Raised:", ethers.formatEther(state.fundingRaised), "ETH");
    console.log("Funding Progress:", Number((state.fundingRaised * 10000n) / state.fundingGoal) / 100, "%");
}

async function buyTokens(curve, token, address, amount) {
    try {
        const expectedTokens = await curve.calculateTokensForEth(amount);
        console.log("Spending:", ethers.formatEther(amount), "ETH");
        console.log("Expected tokens:", ethers.formatEther(expectedTokens));

        const minTokens = expectedTokens * 95n / 100n; // 5% slippage tolerance
        
        const tx = await curve.buy(
            minTokens,
            address,
            {
                value: amount,
                gasLimit: 1000000
            }
        );

        const receipt = await tx.wait();
        const buyEvent = receipt.logs.find(log => log.fragment && log.fragment.name === 'Buy');
        const tokensReceived = buyEvent.args[1];
        
        console.log("Tokens received:", ethers.formatEther(tokensReceived));
        return tokensReceived;
    } catch (error) {
        console.error("Buy failed:", error.message);
        throw error;
    }
}

async function sellTokens(curve, token, amount) {
    try {
        const expectedEth = await curve.calculateEthForTokens(amount);
        console.log("Selling:", ethers.formatEther(amount), "tokens");
        console.log("Expected ETH:", ethers.formatEther(expectedEth));

        const minEth = expectedEth * 95n / 100n; // 5% slippage tolerance
        
        const tx = await curve.sell(amount, minEth);
        const receipt = await tx.wait();
        
        const sellEvent = receipt.logs.find(log => log.fragment && log.fragment.name === 'Sell');
        const ethReceived = sellEvent.args[2];
        
        console.log("ETH received:", ethers.formatEther(ethReceived));
        return ethReceived;
    } catch (error) {
        console.error("Sell failed:", error.message);
        throw error;
    }
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    }); 