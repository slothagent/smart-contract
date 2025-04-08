const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("TokenERC20Factory", function () {
  let tokenFactory;
  let owner;
  let addr1;
  let addr2;
  let addrs;

  beforeEach(async function () {
    // Get signers
    [owner, addr1, addr2, ...addrs] = await ethers.getSigners();

    // Deploy TokenERC20Factory
    const TokenERC20Factory = await ethers.getContractFactory("TokenERC20Factory");
    tokenFactory = await TokenERC20Factory.deploy();
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await tokenFactory.owner()).to.equal(owner.address);
    });

    it("Should have a valid token implementation address", async function () {
      const implementationAddress = await tokenFactory.tokenImplementation();
      expect(implementationAddress).to.be.a("string");
      expect(implementationAddress).to.not.equal(ethers.ZeroAddress);
    });
  });

  describe("Token Creation", function () {
    const tokenName = "Test Token";
    const tokenSymbol = "TEST";
    const contractURI = "ipfs://test";
    const trustedForwarders = [];
    const platformFeeBps = 250; // 2.5%

    it("Should create a new token with correct parameters", async function () {
      const tx = await tokenFactory.createToken(
        owner.address,
        tokenName,
        tokenSymbol,
        contractURI,
        trustedForwarders,
        addr1.address, // primarySaleRecipient
        addr2.address, // platformFeeRecipient
        platformFeeBps
      );

      const receipt = await tx.wait();
      // In ethers v6, events are accessed differently
      const event = receipt.logs[0];
      expect(event).to.not.be.undefined;
      
      // Get the token address from the event args
      const tokenAddress = event.args[0]; // First argument is tokenAddress
      expect(tokenAddress).to.be.a("string");
      expect(tokenAddress.startsWith("0x")).to.be.true;

      // Get the deployed token contract
      const TokenERC20 = await ethers.getContractFactory("TokenERC20");
      const deployedToken = await TokenERC20.attach(tokenAddress);

      // Verify token parameters
      expect(await deployedToken.name()).to.equal(tokenName);
      expect(await deployedToken.symbol()).to.equal(tokenSymbol);
      expect(await deployedToken.contractURI()).to.equal(contractURI);
      expect(await deployedToken.primarySaleRecipient()).to.equal(addr1.address);
      expect(await deployedToken.platformFeeRecipient()).to.equal(addr2.address);
      expect(await deployedToken.platformFeeBps()).to.equal(platformFeeBps);
    });

    it("Should create deterministic token with predictable address", async function () {
      const salt = ethers.keccak256(ethers.toUtf8Bytes("test-salt"));
      
      // Predict address
      const predictedAddress = await tokenFactory.predictTokenAddress(salt);

      // Create token
      const tx = await tokenFactory.createTokenDeterministic(
        salt,
        owner.address,
        tokenName,
        tokenSymbol,
        contractURI,
        trustedForwarders,
        addr1.address,
        addr2.address,
        platformFeeBps
      );

      const receipt = await tx.wait();
      // In ethers v6, events are accessed differently
      const event = receipt.logs[0];
      const actualAddress = event.args[0]; // First argument is tokenAddress

      // Verify the predicted address matches the actual deployed address
      expect(actualAddress.toLowerCase()).to.equal(predictedAddress.toLowerCase());
    });
  });
}); 