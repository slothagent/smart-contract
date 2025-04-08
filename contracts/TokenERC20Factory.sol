// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.11;

import "./TokenERC20.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

/**
 * @title TokenERC20Factory
 * @dev Factory contract for deploying minimal proxy ERC20 tokens using EIP-1167 standard
 * This allows for gas-efficient deployment of many tokens that share the same implementation
 */
contract TokenERC20Factory is OwnableUpgradeable {
    // The address of the implementation contract that all proxies will delegate to
    address public immutable tokenImplementation;
    
    event TokenCreated(
        address indexed tokenAddress,
        address indexed creator,
        string name, 
        string symbol
    );

    constructor() initializer {
        __Ownable_init();
        // Deploy the implementation contract that will be cloned
        tokenImplementation = address(new TokenERC20());
    }

    /**
     * @dev Creates a new ERC20 token using minimal proxy pattern (EIP-1167)
     * @param _defaultAdmin Address that will receive the admin role
     * @param _name Token name
     * @param _symbol Token symbol
     * @param _contractURI URI for contract metadata
     * @param _trustedForwarders Array of trusted forwarder addresses for meta-transactions
     * @param _primarySaleRecipient Address to receive primary sales
     * @param _platformFeeRecipient Address to receive platform fees
     * @param _platformFeeBps Platform fee basis points
     * @return clone Address of the newly deployed token proxy
     */
    function createToken(
        address _defaultAdmin,
        string memory _name,
        string memory _symbol,
        string memory _contractURI,
        address[] memory _trustedForwarders,
        address _primarySaleRecipient,
        address _platformFeeRecipient,
        uint256 _platformFeeBps
    ) external returns (address clone) {
        // Deploy minimal proxy using EIP-1167 standard
        clone = Clones.clone(tokenImplementation);
        
        // Initialize the token proxy
        TokenERC20(clone).initialize(
            _defaultAdmin,
            _name,
            _symbol,
            _contractURI,
            _trustedForwarders,
            _primarySaleRecipient,
            _platformFeeRecipient,
            _platformFeeBps
        );

        emit TokenCreated(clone, msg.sender, _name, _symbol);
    }

    /**
     * @dev Predicts the address of a token that would be created using createTokenDeterministic
     * @param salt The salt that will be used to generate the deterministic address
     * @return The predicted address of the token
     */
    function predictTokenAddress(bytes32 salt) external view returns (address) {
        return Clones.predictDeterministicAddress(
            tokenImplementation,
            salt,
            address(this)
        );
    }

    /**
     * @dev Creates a new token at a deterministic address using CREATE2
     * @param salt The salt used to determine the contract address
     * @param _defaultAdmin Address that will receive the admin role
     * @param _name Token name
     * @param _symbol Token symbol
     * @param _contractURI URI for contract metadata
     * @param _trustedForwarders Array of trusted forwarder addresses
     * @param _primarySaleRecipient Address to receive primary sales
     * @param _platformFeeRecipient Address to receive platform fees
     * @param _platformFeeBps Platform fee basis points
     * @return clone Address of the newly deployed token proxy
     */
    function createTokenDeterministic(
        bytes32 salt,
        address _defaultAdmin,
        string memory _name,
        string memory _symbol,
        string memory _contractURI,
        address[] memory _trustedForwarders,
        address _primarySaleRecipient,
        address _platformFeeRecipient,
        uint256 _platformFeeBps
    ) external returns (address clone) {
        // Deploy deterministic minimal proxy using CREATE2
        clone = Clones.cloneDeterministic(tokenImplementation, salt);
        
        // Initialize the token proxy
        TokenERC20(clone).initialize(
            _defaultAdmin,
            _name,
            _symbol,
            _contractURI,
            _trustedForwarders,
            _primarySaleRecipient,
            _platformFeeRecipient,
            _platformFeeBps
        );

        emit TokenCreated(clone, msg.sender, _name, _symbol);
    }
} 