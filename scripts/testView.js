const axios = require("axios");

const RPC_URL = "https://rpc.blaze.soniclabs.com";
const contractAddress = "0x99cbF4d155bBF36eBd522192D26D3f5e263b0012";
const walletAddress = "0x40550d2C3574c696446663FB911ee9EfDB7bf964";

// Function selector của balanceOf(address) là 0x70a08231
// Encode địa chỉ wallet vào (loại bỏ "0x" và thêm padding)
const data = "0xeb91d37e";

async function getBalance() {
  try {
    const response = await axios.post(RPC_URL, {
      jsonrpc: "2.0",
      method: "eth_call",
      params: [{ to: contractAddress, data: data }, "latest"],
      id: 1,
    });

    console.log("Balance (decimal):", parseInt(response.data.result, 16));
  } catch (error) {
    console.error("Error:", error.response ? error.response.data : error.message);
  }
}

getBalance();
