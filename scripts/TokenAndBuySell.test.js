const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Token Creation and Trading Tests", function () {
    let factory;
    let owner;
    let buyer;
    let tokenAddress;
    let curveAddress;
    let token;
    let curve;
    let factoryLib;

    beforeEach(async function () {
        // Get signers
        [owner, buyer] = await ethers.getSigners();

        // Deploy FactoryLib first
        const FactoryLib = await ethers.getContractFactory("FactoryLib");
        factoryLib = await FactoryLib.deploy();
        await factoryLib.waitForDeployment();

        // Deploy Factory with library
        const Factory = await ethers.getContractFactory("Factory", {
            libraries: {
                FactoryLib: await factoryLib.getAddress()
            }
        });
        factory = await Factory.deploy(ethers.parseEther("0.0001")); // 0.0001 ETH creation fee
        await factory.waitForDeployment();

        // Create new token
        const tokenParams = {
            name: "Test Token",
            symbol: "TEST",
            initialSupply: ethers.parseUnits("1000000", 18), // 1M tokens
            slope: ethers.parseUnits("0.0001", 18),         // 0.0001 slope
            basePrice: ethers.parseUnits("0.0000001", 18)   // 0.0000001 ETH base price
        };

        // Create token and curve
        const tx = await factory.createTokenAndCurve(
            tokenParams.name,
            tokenParams.symbol,
            tokenParams.initialSupply,
            tokenParams.slope,
            tokenParams.basePrice,
            { value: ethers.parseEther("0.0001") }
        );

        const receipt = await tx.wait();
        
        // Get event data using event interface
        const factoryInterface = factory.interface;
        const eventLog = receipt.logs.find(log => {
            try {
                const parsed = factoryInterface.parseLog(log);
                return parsed.name === 'TokenAndCurveCreated';
            } catch (e) {
                return false;
            }
        });

        const parsedLog = factoryInterface.parseLog(eventLog);
        tokenAddress = parsedLog.args[0]; // token address
        curveAddress = parsedLog.args[1]; // curve address

        // Get contract instances
        token = await ethers.getContractAt("ContractErc20", tokenAddress);
        curve = await ethers.getContractAt("BondingCurve", curveAddress);
    });

    describe("Token Creation", function () {
        it("Should create token with correct parameters", async function () {
            expect(await token.name()).to.equal("Test Token");
            expect(await token.symbol()).to.equal("TEST");
            expect(await token.totalSupply()).to.equal(ethers.parseUnits("1000000", 18));
        });

        it("Should set correct base price and slope", async function () {
            expect(await curve.basePrice()).to.equal(ethers.parseUnits("0.0000001", 18));
            expect(await curve.slope()).to.equal(ethers.parseUnits("0.0001", 18));
        });

        it("Should transfer ownership to creator", async function () {
            expect(await token.owner()).to.equal(owner.address);
            expect(await curve.owner()).to.equal(owner.address);
        });

        it("Should transfer initial supply to bonding curve", async function () {
            expect(await token.balanceOf(curveAddress)).to.equal(ethers.parseUnits("1000000", 18));
        });
    });

    describe("Token Buying", function () {
        it("Should calculate correct token amount for ETH", async function () {
            const ethAmount = ethers.parseEther("0.0001"); // 0.0001 ETH
            const estimatedTokens = await factory.calculateTokensForEth(tokenAddress, ethAmount);
            
            // With base price 0.0000001 ETH, 0.0001 ETH should buy approximately 1000 tokens
            expect(Number(ethers.formatUnits(estimatedTokens, 18))).to.be.closeTo(1000, 1);
        });

        it("Should buy tokens successfully", async function () {
            const ethAmount = ethers.parseEther("0.0001"); // 0.0001 ETH
            const estimatedTokens = await factory.calculateTokensForEth(tokenAddress, ethAmount);

            // Get initial balances
            const initialBuyerBalance = await token.balanceOf(buyer.address);
            const initialCurveBalance = await token.balanceOf(curveAddress);

            // Buy tokens
            const buyTx = await factory.connect(buyer).buyTokens(
                tokenAddress,
                estimatedTokens,
                { value: ethAmount }
            );

            const receipt = await buyTx.wait();
            
            // Get Buy event
            const buyEventLog = receipt.logs.find(log => {
                try {
                    const parsed = curve.interface.parseLog(log);
                    return parsed.name === 'Buy';
                } catch (e) {
                    return false;
                }
            });
            const buyEvent = curve.interface.parseLog(buyEventLog);

            // Verify token transfer
            const finalBuyerBalance = await token.balanceOf(buyer.address);
            const finalCurveBalance = await token.balanceOf(curveAddress);

            // Convert all values to BigInt for comparison
            const buyerBalanceIncrease = BigInt(finalBuyerBalance.toString()) - BigInt(initialBuyerBalance.toString());
            const curveBalanceDecrease = BigInt(initialCurveBalance.toString()) - BigInt(finalCurveBalance.toString());
            const tokenAmount = BigInt(buyEvent.args.tokenAmount.toString());

            // Log the actual values for debugging
            console.log("Initial Buyer Balance:", initialBuyerBalance.toString());
            console.log("Final Buyer Balance:", finalBuyerBalance.toString());
            console.log("Tokens Received:", buyEvent.args.tokenAmount.toString());
            // Check buyer received tokens
            expect(buyerBalanceIncrease).to.equal(tokenAmount);
            // Check curve sent tokens
            expect(curveBalanceDecrease).to.equal(tokenAmount);


        });

        it("Should fail when sending insufficient ETH", async function () {
            const ethAmount = ethers.parseEther("0.0001"); // 0.0001 ETH
            const estimatedTokens = await factory.calculateTokensForEth(tokenAddress, ethAmount);

            // Try to buy with less ETH than needed
            const halfEth = ethers.parseEther("0.00005"); // Half of required ETH
            await expect(
                factory.connect(buyer).buyTokens(
                    tokenAddress,
                    estimatedTokens,
                    { value: halfEth }
                )
            ).to.be.revertedWith("Insufficient payment");
        });

        it("Should refund excess ETH", async function () {
            const ethAmount = ethers.parseEther("0.0002"); // 0.0002 ETH
            const estimatedTokens = await factory.calculateTokensForEth(
                tokenAddress, 
                ethers.parseEther("0.0001") // Calculate tokens for 0.0001 ETH
            );

            const buyerBalanceBefore = await ethers.provider.getBalance(buyer.address);
            
            // Buy tokens with excess ETH
            const buyTx = await factory.connect(buyer).buyTokens(
                tokenAddress,
                estimatedTokens,
                { value: ethAmount }
            );

            const receipt = await buyTx.wait();
            
            // Get Buy event
            const buyEventLog = receipt.logs.find(log => {
                try {
                    const parsed = curve.interface.parseLog(log);
                    return parsed.name === 'Buy';
                } catch (e) {
                    return false;
                }
            });
            const buyEvent = curve.interface.parseLog(buyEventLog);
            
            const buyerBalanceAfter = await ethers.provider.getBalance(buyer.address);
            const gasUsed = receipt.gasUsed * receipt.gasPrice;

            // Convert balances to BigInt for calculation
            const balanceBefore = BigInt(buyerBalanceBefore.toString());
            const balanceAfter = BigInt(buyerBalanceAfter.toString());
            const gasCost = BigInt(gasUsed.toString());
            const paymentAmount = BigInt(buyEvent.args.paymentAmount.toString());

            // Verify that excess ETH was refunded (accounting for gas costs)
            expect(balanceBefore - balanceAfter - gasCost).to.equal(paymentAmount);
        });
    });

    describe("Price Impact", function () {
        it("Should increase price with each purchase", async function () {
            // Get initial price
            const initialPrice = await factory.getCurrentTokenPrice(tokenAddress);

            // Make a purchase
            const ethAmount = ethers.parseEther("0.0001");
            const estimatedTokens = await factory.calculateTokensForEth(tokenAddress, ethAmount);
            
            await factory.connect(buyer).buyTokens(
                tokenAddress,
                estimatedTokens,
                { value: ethAmount }
            );

            // Get new price
            const newPrice = await factory.getCurrentTokenPrice(tokenAddress);

            // Price should increase
            expect(newPrice).to.be.gt(initialPrice);
        });

        it("Should maintain minimum base price", async function () {
            const currentPrice = await factory.getCurrentTokenPrice(tokenAddress);
            expect(currentPrice).to.be.gte(await curve.basePrice());
        });
    });
}); 