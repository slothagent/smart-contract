const ethers = require('ethers');
const { bondingCurveAbi } = require('../abi/bondingCurveAbi');
const { tokenAbi } = require('../abi/tokenAbi');

async function calculateTokenCost() {
    try {
        // Kết nối đến mạng Ethereum (ví dụ: localhost hoặc testnet)
        const provider = new ethers.JsonRpcProvider('https://rpc.blaze.soniclabs.com');  // Thay thế bằng RPC URL của bạn

        // Địa chỉ contract
        const contractAddress = '0xEE979ba8Da7Cd43a2939D34B562c9457E0AcA776';
        const tokenContractAddress = '0xb969baea8c5c4be6e5e1ea79ceaa548aedf1cb3f';

        // Tạo instance của contract
        const contract = new ethers.Contract(contractAddress, bondingCurveAbi, provider);
        const tokenContract = new ethers.Contract(tokenContractAddress, tokenAbi, provider);

        const totalSupplyResponse = await tokenContract.totalSupply();
        console.log('Total supply (raw):', totalSupplyResponse.toString());

        

    } catch (error) {
        console.error('Lỗi:', error);
    }
}

// Chạy function
calculateTokenCost(); 