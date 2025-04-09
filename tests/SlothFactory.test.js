const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("SlothFactory", function() {
  let SlothFactory;
  let factory;
  let SlothToken;
  let owner;
  let creator;
  let relayer;
  let native;

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

  before(async function() {
    // Get signers
    [owner, creator, relayer] = await ethers.getSigners();

    // Deploy mock native token (e.g., WETH)
    const MockToken = await ethers.getContractFactory("MockToken");
    native = await MockToken.deploy("Wrapped ETH", "WETH");
    await native.waitForDeployment();

    // Deploy UniswapV2Factory
    const UniswapV2Factory = await ethers.getContractFactory("UniswapV2Factory");
    const uniswapFactory = await UniswapV2Factory.deploy(owner.address);
    await uniswapFactory.waitForDeployment();

    // Deploy SlothToken implementation
    SlothToken = await ethers.getContractFactory("SlothToken");
    const slothTokenImpl = await SlothToken.deploy();
    await slothTokenImpl.waitForDeployment();

    // Deploy SlothFactory
    SlothFactory = await ethers.getContractFactory("SlothFactory");
    factory = await SlothFactory.deploy(owner.address);
    await factory.waitForDeployment();

    // Initialize factory
    await factory.initialize({
      slothImplementation: slothTokenImpl.address,
      uniswapV2Factory: uniswapFactory.address,
      native: native.address,
      signerAddress: owner.address,
      feeTo: owner.address,
      tradingFeeRate: ethers.parseEther("0.003"), // 0.3%
      listingFeeRate: ethers.parseEther("0.01"), // 1%
      creationFee: ethers.parseEther("0.1"), // 0.1 ETH
      totalSupply: ethers.parseEther("1000000"), // 1M tokens
      saleAmount: ethers.parseEther("100000"), // 100K tokens
      tokenOffset: ethers.parseEther("0.0001"), // Token price offset
      nativeOffset: ethers.parseEther("0.0001") // Native price offset
    });

    // Fund creator with native tokens
    await native.mint(creator.address, ethers.parseEther("10"));
    await native.connect(creator).approve(factory.address, ethers.MaxUint256);

    // Fund relayer with native tokens
    await native.mint(relayer.address, ethers.parseEther("10"));
    await native.connect(relayer).approve(factory.address, ethers.MaxUint256);
  });

  describe("Signature Verification", function() {
    it("should verify valid signature", async function() {
      const tokenParams = {
        name: "Test Token",
        symbol: "TEST",
        tokenId: 1,
        initialDeposit: ethers.parseEther("0.1")
      };

      const nonce = await factory.nonces(creator.address);
      const deadline = Math.floor(Date.now() / 1000) + 86400;
      const chainId = (await ethers.provider.getNetwork()).chainId;

      const messageData = {
        creator: creator.address,
        name: tokenParams.name,
        symbol: tokenParams.symbol,
        tokenId: tokenParams.tokenId,
        initialDeposit: tokenParams.initialDeposit,
        nonce,
        deadline,
        relayer: relayer.address
      };

      const signature = await creator.signTypedData(
        {
          name: "Sloth Factory",
          version: "1",
          chainId,
          verifyingContract: await factory.getAddress()
        },
        {
          Create: CREATE_TYPE
        },
        messageData
      );

      const { v, r, s } = ethers.Signature.from(signature);

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

      expect(isValid).to.be.true;
    });

    it("should reject expired signature", async function() {
      const tokenParams = {
        name: "Test Token",
        symbol: "TEST",
        tokenId: 2,
        initialDeposit: ethers.parseEther("0.1")
      };

      const nonce = await factory.nonces(creator.address);
      const deadline = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
      const chainId = (await ethers.provider.getNetwork()).chainId;

      const messageData = {
        creator: creator.address,
        name: tokenParams.name,
        symbol: tokenParams.symbol,
        tokenId: tokenParams.tokenId,
        initialDeposit: tokenParams.initialDeposit,
        nonce,
        deadline,
        relayer: relayer.address
      };

      const signature = await creator.signTypedData(
        {
          name: "Sloth Factory",
          version: "1",
          chainId,
          verifyingContract: await factory.getAddress()
        },
        {
          Create: CREATE_TYPE
        },
        messageData
      );

      const { v, r, s } = ethers.Signature.from(signature);

      await expect(
        factory.verifyCreateSignatureWithRelayer(
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
        )
      ).to.be.revertedWith("Signature expired");
    });
  });

  describe("Token Creation", function() {
    it("should create token successfully", async function() {
      const tokenParams = {
        name: "Test Token",
        symbol: "TEST",
        tokenId: 3,
        initialDeposit: ethers.parseEther("0.1")
      };

      const nonce = await factory.nonces(creator.address);
      const deadline = Math.floor(Date.now() / 1000) + 86400;
      const chainId = (await ethers.provider.getNetwork()).chainId;

      const messageData = {
        creator: creator.address,
        name: tokenParams.name,
        symbol: tokenParams.symbol,
        tokenId: tokenParams.tokenId,
        initialDeposit: tokenParams.initialDeposit,
        nonce,
        deadline,
        relayer: relayer.address
      };

      const signature = await creator.signTypedData(
        {
          name: "Sloth Factory",
          version: "1",
          chainId,
          verifyingContract: await factory.getAddress()
        },
        {
          Create: CREATE_TYPE
        },
        messageData
      );

      const { v, r, s } = ethers.Signature.from(signature);

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
        messageData.nonce
      );

      const receipt = await tx.wait();
      const event = receipt.logs.find(
        log => log.fragment && log.fragment.name === "SlothCreated"
      );

      expect(event).to.not.be.undefined;
      expect(event.args.creator).to.equal(creator.address);
      expect(event.args.tokenId).to.equal(tokenParams.tokenId);

      // Verify token was created correctly
      const slothToken = SlothToken.attach(event.args.token);
      expect(await slothToken.name()).to.equal(tokenParams.name);
      expect(await slothToken.symbol()).to.equal(tokenParams.symbol);
    });

    it("should fail with invalid nonce", async function() {
      const tokenParams = {
        name: "Test Token",
        symbol: "TEST",
        tokenId: 4,
        initialDeposit: ethers.parseEther("0.1")
      };

      const nonce = (await factory.nonces(creator.address)).add(1); // Invalid nonce
      const deadline = Math.floor(Date.now() / 1000) + 86400;
      const chainId = (await ethers.provider.getNetwork()).chainId;

      const messageData = {
        creator: creator.address,
        name: tokenParams.name,
        symbol: tokenParams.symbol,
        tokenId: tokenParams.tokenId,
        initialDeposit: tokenParams.initialDeposit,
        nonce,
        deadline,
        relayer: relayer.address
      };

      const signature = await creator.signTypedData(
        {
          name: "Sloth Factory",
          version: "1",
          chainId,
          verifyingContract: await factory.getAddress()
        },
        {
          Create: CREATE_TYPE
        },
        messageData
      );

      const { v, r, s } = ethers.Signature.from(signature);

      await expect(
        factory.connect(relayer).createWithPermitRelayer(
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
          messageData.nonce
        )
      ).to.be.revertedWith("Invalid nonce");
    });
  });
});