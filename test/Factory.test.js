const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Factory", function () {
    let Factory;
    let factory;
    let owner;
    let buyer;
    let ContractErc20;
    let BondingCurve;

    const TOKEN_NAME = "Test Token";
    const TOKEN_SYMBOL = "TEST";
    const CREATION_FEE = ethers.parseEther("1"); // 1 ETH
    const BUY_AMOUNT = ethers.parseEther("2"); // 2 ETH

    beforeEach(async function () {
        // Get signers
        [owner, buyer] = await ethers.getSigners();

        // Deploy contracts
        ContractErc20 = await ethers.getContractFactory("ContractErc20");
        BondingCurve = await ethers.getContractFactory("BondingCurve");
        Factory = await ethers.getContractFactory("Factory");
        
        factory = await Factory.deploy();
        await factory.waitForDeployment();
    });

    describe("Deployment", function () {
        it("Should set the right owner", async function () {
            expect(await factory.owner()).to.equal(owner.address);
        });

        it("Should have zero total tokens initially", async function () {
            expect(await factory.getTotalTokens()).to.equal(0);
        });
    });

    describe("Token Creation", function () {
        it("Should fail if creation fee is not provided", async function () {
            await expect(
                factory.createTokenAndCurve(TOKEN_NAME, TOKEN_SYMBOL, 0)
            ).to.be.revertedWith("Insufficient ETH");
        });

        it("Should create new token and curve with just creation fee", async function () {
            const tx = await factory.createTokenAndCurve(
                TOKEN_NAME, 
                TOKEN_SYMBOL, 
                0, 
                { value: CREATION_FEE }
            );

            // Wait for transaction
            await tx.wait();

            // Get latest token
            const [tokenAddress, curveAddress] = await factory.getLatestToken();

            // Verify token is registered
            expect(await factory.isTokenRegistered(tokenAddress)).to.be.true;
            expect(await factory.tokenToCurve(tokenAddress)).to.equal(curveAddress);

            // Verify token details
            const token = ContractErc20.attach(tokenAddress);
            expect(await token.name()).to.equal(TOKEN_NAME);
            expect(await token.symbol()).to.equal(TOKEN_SYMBOL);
        });

        it("Should create token and buy tokens in one transaction", async function () {
            const totalValue = CREATION_FEE + BUY_AMOUNT;

            const tx = await factory.createTokenAndCurve(
                TOKEN_NAME, 
                TOKEN_SYMBOL, 
                BUY_AMOUNT, 
                { value: totalValue }
            );

            await tx.wait();

            // Get created token and curve
            const [tokenAddress, curveAddress] = await factory.getLatestToken();
            const token = ContractErc20.attach(tokenAddress);
            
            // Verify buyer received tokens
            const buyerBalance = await token.balanceOf(owner.address);
            console.log("buyerBalance", buyerBalance);
            expect(buyerBalance).to.be.gt(0);
        });

        it("Should refund excess ETH", async function () {
            const excess = ethers.parseEther("0.5");
            const totalValue = CREATION_FEE + BUY_AMOUNT + excess;

            const initialBalance = await ethers.provider.getBalance(owner.address);
            
            const tx = await factory.createTokenAndCurve(
                TOKEN_NAME, 
                TOKEN_SYMBOL, 
                BUY_AMOUNT, 
                { value: totalValue }
            );

            await tx.wait();

            const finalBalance = await ethers.provider.getBalance(owner.address);
            // Account for gas costs, final balance should be greater than initial - (CREATION_FEE + BUY_AMOUNT)
            expect(finalBalance).to.be.gt(initialBalance - CREATION_FEE - BUY_AMOUNT - ethers.parseEther("0.1"));
        });
    });

    describe("Token Management", function () {
        beforeEach(async function () {
            // Create a token before each test
            await factory.createTokenAndCurve(
                TOKEN_NAME, 
                TOKEN_SYMBOL, 
                0, 
                { value: CREATION_FEE }
            );
        });

        it("Should track total number of tokens", async function () {
            expect(await factory.getTotalTokens()).to.equal(1);
        });

        it("Should get latest token", async function () {
            const [token, curve] = await factory.getLatestToken();
            expect(token).to.not.equal(ethers.ZeroAddress);
            expect(curve).to.not.equal(ethers.ZeroAddress);
        });

        it("Should allow owner to withdraw fees", async function () {
            const initialBalance = await ethers.provider.getBalance(owner.address);
            
            await factory.withdrawFees();
            
            const finalBalance = await ethers.provider.getBalance(owner.address);
            expect(finalBalance).to.be.gt(initialBalance);
        });

        it("Should allow owner to withdraw creator tokens", async function () {
            const [tokenAddress] = await factory.getLatestToken();
            const token = ContractErc20.attach(tokenAddress);

            await factory.withdrawCreatorTokens(tokenAddress, owner.address);
            
            const balance = await token.balanceOf(owner.address);
            expect(balance).to.be.gt(0);
        });
    });

    describe("Error Cases", function () {
        it("Should fail when non-owner tries to withdraw fees", async function () {
            await expect(
                factory.connect(buyer).withdrawFees()
            ).to.be.revertedWith("Ownable: caller is not the owner");
        });

        it("Should fail when trying to get latest token with no tokens created", async function () {
            const emptyFactory = await Factory.deploy();
            await expect(
                emptyFactory.getLatestToken()
            ).to.be.revertedWith("No tokens created");
        });

        it("Should fail when trying to withdraw creator tokens for non-registered token", async function () {
            await expect(
                factory.withdrawCreatorTokens(ethers.ZeroAddress, owner.address)
            ).to.be.revertedWith("Token not registered");
        });
    });
}); 