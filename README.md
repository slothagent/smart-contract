# Deploy

npx hardhat run scripts/deploy.js --network ancient8-celestia-testnet

# Verify

npx hardhat run scripts/verify.js --network ancient8-celestia-testnet

# Create token

// Giả sử đã có factoryContract

// 1. Chuẩn bị tham số
const createTokenParams = {
    name: "Token A",
    symbol: "TKA",
    initialSupply: ethers.parseUnits("1000000", 18),  // 1M tokens
    slope: ethers.parseUnits("0.001", 18),           // 0.001
    basePrice: ethers.parseUnits("0.00000001", 18),  // 0.00000001 ETH
    value: ethers.parseEther("0.1")                  // 0.1 ETH creation fee
};

// 2. Gọi function
try {
    const tx = await factoryContract.createTokenAndCurve(
        createTokenParams.name,
        createTokenParams.symbol,
        createTokenParams.initialSupply,
        createTokenParams.slope,
        createTokenParams.basePrice,
        { value: createTokenParams.value }
    );
    
    // 3. Đợi transaction được xác nhận
    const receipt = await tx.wait();
    
    // 4. Lấy thông tin token mới tạo từ event
    const event = receipt.events.find(e => e.event === 'TokenAndCurveCreated');
    const newTokenAddress = event.args.token;
    const newCurveAddress = event.args.bondingCurve;
    
    console.log("New Token Address:", newTokenAddress);
    console.log("New Curve Address:", newCurveAddress);
} catch (error) {
    console.error("Error creating token:", error);
}

# Buy tokens

// Ví dụ 1: Mua với số lượng token cụ thể
const example1 = async () => {
    try {
        // Muốn mua 1000 tokens
        const amountToBuy = ethers.parseUnits("1000", 18);
        
        // Kiểm tra giá trước
        const price = await factoryContract.getTokenPrice(tokenAddress, amountToBuy);
        console.log(`Cần ${ethers.formatEther(price)} ETH để mua 1000 tokens`);
        
        // Thực hiện mua
        const tx = await factoryContract.buyTokens(
            tokenAddress,
            amountToBuy,
            { value: price }  // Gửi đúng số ETH cần thiết
        );
        await tx.wait();
    } catch (error) {
        console.error("Error:", error);
    }
};

// Ví dụ 2: Mua với số ETH cụ thể
const example2 = async () => {
    try {
        // Muốn dùng 0.001 ETH để mua
        const ethToSpend = ethers.parseEther("0.001");
        
        // Kiểm tra số token sẽ nhận được
        const tokensToReceive = await factoryContract.calculateTokensForEth(
            tokenAddress,
            ethToSpend
        );
        console.log(`Sẽ nhận được ${ethers.formatUnits(tokensToReceive, 18)} tokens với 0.001 ETH`);
        
        // Thực hiện mua
        const tx = await factoryContract.buyTokens(
            tokenAddress,
            tokensToReceive,  // Dùng số token ước tính
            { value: ethToSpend }
        );
        await tx.wait();
    } catch (error) {
        console.error("Error:", error);
    }
};