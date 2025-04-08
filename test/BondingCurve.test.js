const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Factory and BondingCurve", function () {
    let Factory;
    let factory;
    let owner;
    let buyer;
    let seller;
    let token;
    let curve;

    // Constants from contracts
    const INITIAL_PRICE = ethers.parseEther("0.00000001"); // 0.000001 ETH
    const FUNDING_GOAL = ethers.parseEther("10"); // Update to match the contract's 10 ETH

    beforeEach(async function () {
        // Get signers
        [owner, buyer, seller] = await ethers.getSigners();

        // Deploy Factory
        Factory = await ethers.getContractFactory("Factory");
        factory = await Factory.deploy();
        await factory.waitForDeployment();

        // Create new token and curve with 0.01 ETH buy amount
        const buyAmount = ethers.parseEther("0.01");
        const tx = await factory.connect(owner).createTokenAndCurve(
            "Test Token",
            "TEST",
            buyAmount, // 0.01 ETH buy amount
            { value: buyAmount + ethers.parseEther("0.001") } // 0.001 ETH for creation fee + 0.01 ETH for buying
        );
        const receipt = await tx.wait();

        // Get addresses from event
        const createEvent = receipt.logs.find(
            log => log.fragment && log.fragment.name === 'TokenAndCurveCreated'
        );
        const tokenAddress = createEvent.args[0];
        const curveAddress = createEvent.args[1];

        // Get contract instances
        const Token = await ethers.getContractFactory("ContractErc20");
        token = Token.attach(tokenAddress);

        const BondingCurve = await ethers.getContractFactory("BondingCurve");
        curve = BondingCurve.attach(curveAddress);
    });

    describe("Initial State", function () {
        it("Should set correct initial values", async function () {
            expect(await token.name()).to.equal("Test Token");
            expect(await token.symbol()).to.equal("TEST");
            expect(await curve.INITIAL_PRICE()).to.equal(INITIAL_PRICE);
            expect(await curve.FUNDING_GOAL()).to.equal(FUNDING_GOAL);
            
            // Check INITIAL_SUPPLY constant
            const INITIAL_SUPPLY = ethers.parseEther("1000000000"); // 1 billion tokens
            expect(await curve.INITIAL_SUPPLY()).to.equal(INITIAL_SUPPLY);
            
            // Check that totalSupply is greater than 0 (some tokens were bought in setup)
            expect(await curve.totalSupply()).to.be.gt(0);
            
            // Check initialSupply state variable - this is set in the constructor
            // and might be different from INITIAL_SUPPLY constant
            const initialSupply = await curve.initialSupply();
            console.log(`Initial supply from contract: ${ethers.formatEther(initialSupply)}`);
        });
    });

    describe("Buying Tokens", function () {
        it("Should show price impact with large and small purchases", async function () {
            const formatEther = (bn) => ethers.formatEther(bn);
            
            // First purchase - 0.01 ETH
            const buyAmount = ethers.parseEther("0.01");
            
            // Get initial states
            const initialPrice = await curve.getCurrentPrice();
            const initialSupply = await curve.totalSupply();
            
            console.log("\nInitial State:");
            console.log("------------------------");
            console.log(`Initial price: ${formatEther(initialPrice)} ETH`);
            console.log(`Initial supply: ${formatEther(initialSupply)}`);

            // Calculate expected tokens for 0.01 ETH
            const expectedTokens = await curve.calculateTokensForEth(buyAmount);
            console.log(`\nFirst Purchase (0.01 ETH):`);
            console.log(`Expected tokens: ${formatEther(expectedTokens)}`);
            console.log(`Effective price per token: ${formatEther(buyAmount * ethers.parseEther("0.01") / expectedTokens)} ETH`);
            
            // Execute first buy with higher slippage tolerance
            await curve.connect(buyer).buy(
                expectedTokens * 95n / 100n, // 5% slippage tolerance
                buyer.address,
                { value: buyAmount }
            );

            // Get states after first buy
            const priceAfterFirstBuy = await curve.getCurrentPrice();
            const supplyAfterFirstBuy = await curve.totalSupply();
            const firstBuyBalance = await token.balanceOf(buyer.address);

            console.log("\nAfter First Buy (0.01 ETH):");
            console.log(`Price after buy: ${formatEther(priceAfterFirstBuy)} ETH`);
            console.log(`Price increase: ${formatEther(priceAfterFirstBuy - initialPrice)} ETH`);
            console.log(`Tokens received: ${formatEther(firstBuyBalance)}`);
            console.log(`Total supply: ${formatEther(supplyAfterFirstBuy)}`);

            // Second purchase - 0.001 ETH
            const secondBuyAmount = ethers.parseEther("0.001");
            
            // Calculate expected tokens for 0.001 ETH
            const expectedTokens2 = await curve.calculateTokensForEth(secondBuyAmount);
            console.log(`\nSecond Purchase (0.001 ETH):`);
            console.log(`Expected tokens: ${formatEther(expectedTokens2)}`);
            console.log(`Effective price per token: ${formatEther(secondBuyAmount * ethers.parseEther("0.001") / expectedTokens2)} ETH`);
            
            // Execute second buy
            await curve.connect(buyer).buy(
                expectedTokens2 * 98n / 100n, // 2% slippage tolerance
                buyer.address,
                { value: secondBuyAmount }
            );

            // Get final states
            const finalPrice = await curve.getCurrentPrice();
            const finalSupply = await curve.totalSupply();
            const finalBalance = await token.balanceOf(buyer.address);
            const secondBuyTokens = finalBalance - firstBuyBalance;

            console.log("\nAfter Second Buy (0.001 ETH):");
            console.log(`Final price: ${formatEther(finalPrice)} ETH`);
            console.log(`Price increase from first buy: ${formatEther(finalPrice - priceAfterFirstBuy)} ETH`);
            console.log(`Additional tokens received: ${formatEther(secondBuyTokens)}`);
            console.log(`Total tokens held: ${formatEther(finalBalance)}`);
            console.log(`Final total supply: ${formatEther(finalSupply)}`);

            // Comparison stats
            console.log("\nComparison Stats:");
            console.log(`Tokens per ETH (first buy): ${formatEther(firstBuyBalance / 100n)}`);
            console.log(`Tokens per ETH (second buy): ${formatEther(secondBuyTokens)}`);
            console.log(`Price increase percentage: ${((finalPrice - initialPrice) * 100n / initialPrice).toString()}%`);

            // Verify expected behaviors - with updated expectations for the higher price impact
            expect(finalPrice).to.be.gt(priceAfterFirstBuy);
            expect(finalPrice).to.be.gt(initialPrice);
            
            // We're not checking the exact token amounts here since the formula has changed
            // Just verify that the second buy gets fewer tokens per ETH than the first buy
            const tokensPerEthFirstBuy = firstBuyBalance * ethers.parseEther("1") / buyAmount;
            const tokensPerEthSecondBuy = secondBuyTokens * ethers.parseEther("1") / secondBuyAmount;
            expect(tokensPerEthSecondBuy).to.be.lt(tokensPerEthFirstBuy);
        });

        it("Should fail when sending 0 ETH", async function () {
            await expect(
                curve.connect(buyer).buy(0, buyer.address, { value: 0 })
            ).to.be.revertedWith("Must send ETH");
        });

        it("Should emit token info in UpdateInfo event", async function () {
            const buyAmount = ethers.parseEther("0.01");
            
            // Lắng nghe sự kiện UpdateInfo
            const tx = await curve.connect(buyer).buy(
                0, // Min tokens
                buyer.address,
                { value: buyAmount }
            );
            
            const receipt = await tx.wait();
            
            // Tìm sự kiện UpdateInfo
            const updateEvent = receipt.logs.find(
                log => log.fragment && log.fragment.name === 'UpdateInfo'
            );
            
            // Hiển thị thông tin token từ sự kiện
            console.log("\nToken Info from UpdateInfo event:");
            console.log("------------------------");
            console.log(updateEvent.args);
            // console.log(`Current Price: ${ethers.formatEther(updateEvent.args[1])} ETH`);
            // console.log(`Total Supply: ${ethers.formatEther(updateEvent.args[1])}`);
            // console.log(`Market Cap: ${ethers.formatEther(updateEvent.args[2])} ETH`);
            // console.log(`Funding Raised: ${ethers.formatEther(updateEvent.args[3])} ETH`);
            
            // Kiểm tra thông tin token
            expect(updateEvent.args[4]).to.equal("Test Token");
            expect(updateEvent.args[5]).to.equal("TEST");
            expect(updateEvent.args[6]).to.equal(token.target);
        });
    });

    describe("Selling Tokens", function () {
        beforeEach(async function () {
            // Buy tokens first
            await curve.connect(buyer).buy(
                0, // Min tokens
                buyer.address,
                { value: ethers.parseEther("0.01") }
            );

            // Approve maximum amount for selling
            await token.connect(buyer).approve(curve.target, ethers.MaxUint256);
        });

        it("Should allow selling tokens", async function () {
            // Get user's token balance first
            const userBalance = await token.balanceOf(buyer.address);
            // Sell 50% of balance
            const tokenAmount = userBalance / 2n;
            
            // Get initial states
            const initialEthBalance = await ethers.provider.getBalance(buyer.address);
            const initialTokenBalance = await token.balanceOf(buyer.address);
            
            // Calculate expected ETH
            const expectedEth = await curve.calculateEthForTokens(tokenAmount);
            
            // Execute sell
            await curve.connect(buyer).sell(
                tokenAmount,
                expectedEth * 99n / 100n // 1% slippage tolerance
            );

            // Check final states
            const finalTokenBalance = await token.balanceOf(buyer.address);
            expect(initialTokenBalance - finalTokenBalance).to.equal(tokenAmount);
            
            // Account for gas costs in ETH balance check
            const finalEthBalance = await ethers.provider.getBalance(buyer.address);
            expect(finalEthBalance).to.be.gt(initialEthBalance);
        });

        it("Should fail when selling more than balance", async function () {
            const balance = await token.balanceOf(buyer.address);
            await expect(
                curve.connect(buyer).sell(balance + 1n, 0)
            ).to.be.revertedWithCustomError(token, "ERC20InsufficientBalance");
        });
    });

    describe("Price Impact and Token Distribution", function () {
        it("Should show correct price and token changes across multiple purchases", async function () {
            // Helper function to format numbers for logging
            const formatEther = (bn) => ethers.formatEther(bn);
            
            // Make multiple purchases and track changes
            const purchases = [
                ethers.parseEther("0.01"),    // 1 ETH
                ethers.parseEther("0.01"),    // 1 ETH
                ethers.parseEther("0.01"),    // 1 ETH
            ];

            console.log("\nTesting multiple purchases:");
            console.log("------------------------");

            let totalTokensBought = 0n;
            
            for(let i = 0; i < purchases.length; i++) {
                const purchaseAmount = purchases[i];
                
                // Get price before purchase
                const preBuyPrice = await curve.getCurrentPrice();
                
                // Calculate expected tokens
                const expectedTokens = await curve.calculateTokensForEth(purchaseAmount);
                
                // Execute purchase
                await curve.connect(buyer).buy(
                    expectedTokens * 98n / 100n, // 2% slippage tolerance
                    buyer.address,
                    { value: purchaseAmount }
                );

                // Get price after purchase
                const postBuyPrice = await curve.getCurrentPrice();
                
                // Get actual tokens received
                const buyerBalance = await token.balanceOf(buyer.address);
                const tokensBought = buyerBalance - totalTokensBought;
                totalTokensBought = buyerBalance;

                console.log(`\nPurchase ${i + 1} (${formatEther(purchaseAmount)} ETH):`);
                console.log(`Pre-buy price: ${formatEther(preBuyPrice)} ETH`);
                console.log(`Post-buy price: ${formatEther(postBuyPrice)} ETH`);
                console.log(`Price increase: ${formatEther(postBuyPrice - preBuyPrice)} ETH`);
                console.log(`Tokens received: ${formatEther(tokensBought)}`);
                console.log(`Effective price per token: ${formatEther(purchaseAmount * ethers.parseEther("1") / tokensBought)} ETH`);
                
                // Verify price increased
                expect(postBuyPrice).to.be.gt(preBuyPrice);
                
                // Verify tokens received is close to expected (within 2%)
                const tokenDifference = expectedTokens - tokensBought;
                expect(tokenDifference).to.be.lt(expectedTokens * 2n / 100n);
            }

            // Test final market stats
            const finalSupply = await curve.totalSupply();
            const finalPrice = await curve.getCurrentPrice();
            const marketCap = await curve.getTotalMarketCap();

            console.log("\nFinal Market Stats:");
            console.log("------------------------");
            console.log(`Total Supply: ${formatEther(finalSupply)}`);
            console.log(`Final Price: ${formatEther(finalPrice)} ETH`);
            console.log(`Market Cap: ${formatEther(marketCap)} ETH`);
        });
    });

    describe("Price Impact with Buy and Sell", function () {
        it("Should show price changes after buys and sells", async function () {
            const formatEther = (bn) => ethers.formatEther(bn);
            
            // First buy some tokens with smaller amount
            const buyAmount = ethers.parseEther("0.01");
            
            console.log("\nInitial Purchase:");
            console.log("------------------------");
            
            // Get initial price and reserve
            const initialPrice = await curve.getCurrentPrice();
            const initialReserve = await curve.reserveBalance();
            console.log(`Initial price: ${formatEther(initialPrice)} ETH`);
            console.log(`Initial reserve: ${formatEther(initialReserve)} ETH`);
            
            // Calculate and log expected tokens before buy
            const expectedTokens = await curve.calculateTokensForEth(buyAmount);
            console.log(`Expected tokens for ${formatEther(buyAmount)} ETH: ${formatEther(expectedTokens)}`);
            
            // Buy tokens
            await curve.connect(buyer).buy(
                expectedTokens * 98n / 100n,
                buyer.address,
                { value: buyAmount }
            );
            
            // Ensure approval for selling
            const balance = await token.balanceOf(buyer.address);
            await token.connect(buyer).approve(curve.target, balance);

            // Get states after buy
            const priceAfterBuy = await curve.getCurrentPrice();
            const tokensBought = await token.balanceOf(buyer.address);
            const reserveAfterBuy = await curve.reserveBalance();
            
            console.log(`\nAfter buying ${formatEther(buyAmount)} ETH:`);
            console.log(`Price after buy: ${formatEther(priceAfterBuy)} ETH`);
            console.log(`Price increase: ${formatEther(priceAfterBuy - initialPrice)} ETH`);
            console.log(`Tokens bought: ${formatEther(tokensBought)}`);
            console.log(`Reserve after buy: ${formatEther(reserveAfterBuy)} ETH`);
            
            // Now sell a smaller portion of tokens
            console.log("\nSelling 20% of tokens:");
            console.log("------------------------");
            
            const tokensToSell = tokensBought * 20n / 100n;
            
            // Log states before sell
            console.log(`Tokens to sell: ${formatEther(tokensToSell)}`);
            
            // Get expected ETH return and log
            const expectedEth = await curve.calculateEthForTokens(tokensToSell);
            console.log(`Expected ETH return: ${formatEther(expectedEth)}`);
            
            // Get price before sell
            const priceBeforeSell = await curve.getCurrentPrice();
            console.log(`Price before sell: ${formatEther(priceBeforeSell)} ETH`);
            
            // Execute sell
            await curve.connect(buyer).sell(
                tokensToSell,
                expectedEth * 99n / 100n
            );
            
            // Get states after sell
            const priceAfterSell = await curve.getCurrentPrice();
            const reserveAfterSell = await curve.reserveBalance();
            
            console.log(`Price after sell: ${formatEther(priceAfterSell)} ETH`);
            console.log(`Price decrease: ${formatEther(priceBeforeSell - priceAfterSell)} ETH`);
            console.log(`Reserve after sell: ${formatEther(reserveAfterSell)} ETH`);
            console.log(`ETH received: ${formatEther(expectedEth)}`);
            
            // Verify price changes
            expect(priceAfterSell).to.be.lt(priceBeforeSell, "Price should decrease after sell");
            expect(priceAfterSell).to.be.gt(initialPrice, "Final price should be higher than initial");
            expect(reserveAfterSell).to.be.lt(reserveAfterBuy, "Reserve should decrease after sell");
        });
    });

    describe("Pool Balance", function () {
        it("Should track pool balance correctly", async function () {
            const formatEther = (bn) => ethers.formatEther(bn);
            
            // Get initial pool balance
            const initialBalance = await curve.getPoolBalance();
            console.log(`Initial pool balance: ${formatEther(initialBalance)} ETH`);

            // Buy tokens
            const buyAmount = ethers.parseEther("0.01");
            const expectedTokens = await curve.calculateTokensForEth(buyAmount);
            
            await curve.connect(buyer).buy(
                expectedTokens * 95n / 100n,
                buyer.address,
                { value: buyAmount }
            );

            // Ensure approval for selling
            const balance = await token.balanceOf(buyer.address);
            await token.connect(buyer).approve(curve.target, balance);

            // Check pool balance after buy
            const balanceAfterBuy = await curve.getPoolBalance();
            console.log(`Pool balance after buy: ${formatEther(balanceAfterBuy)} ETH`);
            expect(balanceAfterBuy).to.equal(initialBalance + buyAmount);

            // Sell some tokens
            const tokenAmount = expectedTokens / 2n;
            const expectedEth = await curve.calculateEthForTokens(tokenAmount);
            
            await curve.connect(buyer).sell(
                tokenAmount,
                expectedEth * 95n / 100n
            );

            // Check pool balance after sell
            const balanceAfterSell = await curve.getPoolBalance();
            console.log(`Pool balance after sell: ${formatEther(balanceAfterSell)} ETH`);
            expect(balanceAfterSell).to.equal(balanceAfterBuy - expectedEth);
        });
    });
}); 