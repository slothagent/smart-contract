// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

contract TokenERC20 is ERC20, ERC20Burnable {

    address public owner;
    string public contractURI;

    constructor(string memory name, string memory symbol, uint initialMintValue, string memory _contractURI) ERC20(name, symbol) {
        _mint(msg.sender, initialMintValue);
        owner = msg.sender;
        contractURI = _contractURI;
    }

    function mint(uint mintQty, address receiver) external returns(uint){
        require(msg.sender == owner, "Mint can only be called by the owner");
        _mint(receiver, mintQty);
        return 1;
    }

    function setContractURI(string memory _uri) external {
        require(msg.sender == owner, "Only owner can set contract URI");
        contractURI = _uri;
    }
}