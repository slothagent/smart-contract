// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UpgradeableBeacon} from "@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol";
import {FullMath} from "./libraries/FullMath.sol";
import {ISlothFactory} from "./interfaces/ISlothFactory.sol";
import {ISloth} from "./interfaces/ISloth.sol";
import {IUniswapV2Factory} from "./interfaces/IUniswapV2Factory.sol";
import {BeaconProxy} from "@openzeppelin/contracts/proxy/beacon/BeaconProxy.sol";
import {IERC20} from "@openzeppelin/contracts/interfaces/IERC20.sol";
import {Create2} from "@openzeppelin/contracts/utils/Create2.sol";
import "./SlothToken.sol";

contract SlothFactory is ISlothFactory, Initializable, Ownable {
    using Create2 for *;

    event CurveSet(
        uint256 totalSupply,
        uint256 saleAmount,
        uint256 tokenOffset,
        uint256 nativeOffset,
        address indexed factory
    );
    event ConfigurationSet(
        address feeTo,
        uint256 tradingFeeRate,
        uint256 listingFeeRate,
        uint256 creationFee,
        address native,
        address uniswapV2Factory,
        bool forLaunching,
        address indexed factory
    );
    event SlothCreated(
        address token,
        address sloth,
        address creator,
        uint256 totalSupply,
        uint256 saleAmount,
        uint256 tokenOffset,
        uint256 nativeOffset,
        uint256 tokenId,
        bool whitelistEnabled,
        address indexed factory
    );
    event SlothCreatedWithoutLaunching(
        address sloth,
        uint256 tokenId,
        address indexed factory
    );

    event BridgeSet(address);

    event SlothImplementationSet(address);

    event SignerSet(address);

    event Debug(string message, address sender, bytes32 data);
    event DebugAddress(string message, address value);
    event DebugUint(string message, uint256 value);
    event DebugBool(string message, bool value);

    UpgradeableBeacon public beacon;
    address public signerAddress;
    address public bridge;
    address public feeTo;
    uint256 public totalSupply;
    uint256 public saleAmount;
    uint256 public tokenOffset;
    uint256 public nativeOffset;
    uint256 public tradingFeeRate;
    uint256 public listingFeeRate;
    uint256 public creationFee;
    address public native;
    address public uniswapV2Factory;
    bool public forLaunching;

    bytes tokenInitCode;

    // EIP-712 Domain
    bytes32 public constant DOMAIN_TYPEHASH = keccak256(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    );
    
    // Create token operation typehash
    bytes32 public constant CREATE_TYPEHASH = keccak256(
        "Create(address creator,string name,string symbol,uint256 tokenId,uint256 initialDeposit,uint256 nonce,uint256 deadline,address relayer)"
    );

    // EIP-712 Domain Separator
    bytes32 public immutable DOMAIN_SEPARATOR;
    
    // User nonces for replay protection
    mapping(address => uint256) public nonces;

    constructor(address owner) Ownable(owner) {
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                DOMAIN_TYPEHASH,
                keccak256(bytes("Sloth Factory")),
                keccak256(bytes("1")),
                block.chainid,
                address(this)
            )
        );
    }

    function setSignerAddress(address _signer) external onlyOwner {
        _setSignerAddress(_signer);
    }

    function _setSignerAddress(address _signer) internal {
        signerAddress = _signer;
        emit SignerSet(_signer);
    }

    function setBridge(address _bridge) external onlyOwner {
        _setBridge(_bridge);
        emit BridgeSet(_bridge);
    }

    function _setBridge(address _bridge) internal {
        bridge = _bridge;
        emit BridgeSet(_bridge);
    }

    function initialize(
        InitializationParams calldata params
    ) public onlyOwner initializer {
        beacon = new UpgradeableBeacon(params.slothImplementation, address(this));

        uniswapV2Factory = params.uniswapV2Factory;
        native = params.native;
        signerAddress = params.signerAddress;

        feeTo = params.feeTo;

        tradingFeeRate = params.tradingFeeRate;
        listingFeeRate = params.listingFeeRate;
        creationFee = params.creationFee;

        totalSupply = params.totalSupply;
        saleAmount = params.saleAmount;
        tokenOffset = params.tokenOffset;
        nativeOffset = params.nativeOffset;

        forLaunching = true;
    }

    function initializeWithoutLaunching() external onlyOwner initializer {
        forLaunching = false;
    }

    function setUniV2Factory(address _univ2Factory) external onlyOwner {
        _setUniV2Factory(_univ2Factory);
    }
    function _setUniV2Factory(address _univ2Factory) internal {
        uniswapV2Factory = _univ2Factory;
        _emitConfigurationSet();
    }

    function setSlothImplementation(address _implementation) external onlyOwner {
        _setSlothImplementation(_implementation);
    }
    function _setSlothImplementation(address _implementation) internal {
        beacon.upgradeTo(_implementation);
        emit SlothImplementationSet(_implementation);
    }
    function setNative(address _native) external onlyOwner {
        _setNative(_native);
    }

    function _setNative(address _native) internal {
        native = _native;
        _emitConfigurationSet();
    }

    function setForLaunching(bool _forLaunching) external onlyOwner {
        _setForLaunching(_forLaunching);
    }

    function _setForLaunching(bool _forLaunching) internal {
        forLaunching = _forLaunching;
        _emitConfigurationSet();
    }

    function setCreationFee(uint256 _creationFee) external onlyOwner {
        _setCreationFee(_creationFee);
    }

    function _setCreationFee(uint256 _creationFee) internal {
        creationFee = _creationFee;
        _emitConfigurationSet();
    }

    function setListingFeeRate(uint256 _listingFee) external onlyOwner {
        _setListingFeeRate(_listingFee);
        _emitConfigurationSet();
    }

    function _setListingFeeRate(uint256 _listingFee) internal {
        listingFeeRate = _listingFee;
        _emitConfigurationSet();
    }

    function setFeeTo(address _feeTo) external onlyOwner {
        _setFeeTo(_feeTo);
    }

    function _setFeeTo(address _feeTo) internal {
        feeTo = _feeTo;

        _emitConfigurationSet();
    }

    function setTradingFeeRate(uint256 _fee) external onlyOwner {
        _setTradingFeeRate(_fee);
    }

    function _setTradingFeeRate(uint256 _fee) internal {
        tradingFeeRate = _fee;
        _emitConfigurationSet();
    }

    function setCurveConfiguration(
        uint256 _totalSupply,
        uint256 _saleAmount,
        uint256 _tokenOffset,
        uint256 _nativeOffset
    ) external onlyOwner {
        totalSupply = _totalSupply;
        saleAmount = _saleAmount;
        tokenOffset = _tokenOffset;
        nativeOffset = _nativeOffset;
        emit CurveSet(
            totalSupply,
            saleAmount,
            tokenOffset,
            nativeOffset,
            address(this)
        );
    }

    function _createBasicDigest(
        address creator,
        SlothCreationParams calldata params,
        uint256 deadline,
        uint256 nonce
    ) internal view returns (bytes32) {
        bytes32 paramsHash = keccak256(
            abi.encode(
                CREATE_TYPEHASH,
                creator,
                keccak256(bytes(params.name)),
                keccak256(bytes(params.symbol)),
                params.tokenId,
                params.initialDeposit,
                nonce,
                deadline
            )
        );
        return keccak256(
            abi.encodePacked(
                "\x19\x01",
                DOMAIN_SEPARATOR,
                paramsHash
            )
        );
    }

    function verifyCreateSignature(
        address creator,
        SlothCreationParams calldata params,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) public view returns (bool) {
        require(deadline >= block.timestamp, "Signature expired");
        bytes32 digest = _createBasicDigest(creator, params, deadline, nonces[creator]);
        address recoveredAddress = ecrecover(digest, v, r, s);
        return recoveredAddress != address(0) && recoveredAddress == creator;
    }

    function _createDigestWithRelayer(
        address creator,
        SlothCreationParams calldata params,
        uint256 deadline,
        uint256 nonce,
        address relayer
    ) internal view returns (bytes32) {
        bytes32 paramsHash = keccak256(
            abi.encode(
                CREATE_TYPEHASH,
                creator,
                keccak256(bytes(params.name)),
                keccak256(bytes(params.symbol)),
                params.tokenId,
                params.initialDeposit,
                nonce,
                deadline,
                relayer
            )
        );
        return keccak256(
            abi.encodePacked(
                "\x19\x01",
                DOMAIN_SEPARATOR,
                paramsHash
            )
        );
    }

    function verifyCreateSignatureWithRelayer(
        address creator,
        SlothCreationParams calldata params,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s,
        address relayer,
        uint256 nonce
    ) public view returns (bool) {
        require(deadline >= block.timestamp, "Signature expired");
        require(nonce == nonces[creator], "Invalid nonce");
        
        bytes32 digest = _createDigestWithRelayer(creator, params, deadline, nonce, relayer);
        address recoveredAddress = ecrecover(digest, v, r, s);
        return recoveredAddress != address(0) && recoveredAddress == creator;
    }

    function createWithPermit(
        SlothCreationParams calldata params,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external returns (address token, address sloth) {
        require(verifyCreateSignature(msg.sender, params, deadline, v, r, s), "Invalid signature");
        nonces[msg.sender]++;
        
        return _create(msg.sender, params);
    }

    function createWithPermitRelayer(
        address creator,
        SlothCreationParams calldata params,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s,
        uint256 nonce
    ) external returns (address token, address sloth) {
        emit Debug("Starting createWithPermitRelayer", msg.sender, "");
        emit DebugAddress("Creator", creator);
        
        bool isValid = verifyCreateSignatureWithRelayer(creator, params, deadline, v, r, s, msg.sender, nonce);
        emit DebugBool("Signature validation result", isValid);
        
        require(isValid, "Invalid signature");
        nonces[creator]++;
        emit DebugUint("New nonce", nonces[creator]);
        
        return _create(creator, params);
    }

    function _create(
        address creator,
        SlothCreationParams memory params
    ) internal returns (address token, address sloth) {
        emit Debug("Starting _create", msg.sender, "");
        require(forLaunching, "Only in launching mode");
        emit DebugBool("forLaunching check passed", true);

        bytes32 salt = keccak256(abi.encodePacked(params.tokenId));
        emit Debug("Generated salt", address(0), salt);

        token = Create2.deploy(
            0,
            salt,
            abi.encodePacked(type(SlothToken).creationCode)
        );
        emit DebugAddress("Token deployed at", token);

        bytes32 pumpSalt = keccak256(abi.encodePacked(token));
        emit Debug("Generated pump salt", address(0), pumpSalt);

        address uniswapPair = IUniswapV2Factory(uniswapV2Factory).getPair(
            token,
            address(native)
        );
        emit DebugAddress("Existing uniswap pair", uniswapPair);

        if (uniswapPair == address(0)) {
            emit Debug("Creating new uniswap pair", address(0), "");
            uniswapPair = IUniswapV2Factory(uniswapV2Factory).createPair(
                token,
                address(native)
            );
            emit DebugAddress("New uniswap pair created at", uniswapPair);
        }

        sloth = Create2.deploy(
            0,
            pumpSalt,
            abi.encodePacked(
                type(BeaconProxy).creationCode,
                abi.encode(address(beacon), "")
            )
        );
        emit DebugAddress("Sloth deployed at", sloth);

        try SlothToken(token).initialize(
            params.name,
            params.symbol,
            sloth,
            uniswapPair,
            totalSupply
        ) {
            emit Debug("Token initialization successful", address(0), "");
        } catch Error(string memory reason) {
            emit Debug("Token initialization failed", address(0), bytes32(bytes(reason)));
            revert(reason);
        }

        try IERC20(token).transfer(sloth, totalSupply) {
            emit Debug("Token transfer to sloth successful", address(0), "");
        } catch Error(string memory reason) {
            emit Debug("Token transfer to sloth failed", address(0), bytes32(bytes(reason)));
            revert(reason);
        }

        try ISloth(sloth).initialize(
            token,
            native,
            uniswapV2Factory,
            uniswapPair,
            saleAmount,
            tokenOffset,
            nativeOffset
        ) {
            emit Debug("Sloth initialization successful", address(0), "");
        } catch Error(string memory reason) {
            emit Debug("Sloth initialization failed", address(0), bytes32(bytes(reason)));
            revert(reason);
        }

        emit SlothCreated(
            token,
            sloth,
            creator,
            totalSupply,
            saleAmount,
            tokenOffset,
            nativeOffset,
            params.tokenId,
            false,
            address(this)
        );

        if (params.initialDeposit > 0) {
            emit DebugUint("Processing initial deposit", params.initialDeposit);
            require(
                IERC20(native).transferFrom(
                    creator,
                    address(this),
                    params.initialDeposit
                ),
                "Failed to transfer native for the first buy"
            );

            IERC20(native).transfer(sloth, params.initialDeposit);
            ISloth(sloth).initialBuy(params.initialDeposit, creator);
            emit Debug("Initial deposit processed successfully", address(0), "");
        }

        if (creationFee > 0) {
            emit DebugUint("Processing creation fee", creationFee);
            require(
                IERC20(native).transferFrom(creator, feeTo, creationFee),
                "Failed to pay creation fee"
            );
            emit Debug("Creation fee processed successfully", address(0), "");
        }
    }

    function create(
        SlothCreationParams memory params
    ) external returns (address token, address sloth) {
        return _create(msg.sender, params);
    }

    function createWithoutLaunching(
        string calldata _name,
        string calldata _symbol,
        uint256 _tokenId,
        uint256 _totalSupply,
        address _supplyRecipient
    ) external onlyOwner returns (address token) {
        require(!forLaunching, "Only in non-launching mode");

        bytes32 salt = keccak256(abi.encodePacked(_tokenId));

        token = Create2.deploy(
            0,
            salt,
            type(SlothToken).creationCode
        );

        SlothToken(token).initializeWithoutLaunching(
            _name,
            _symbol,
            _totalSupply,
            _supplyRecipient
        );

        emit SlothCreatedWithoutLaunching(token, _tokenId, address(this));
    }

    function getTokenAddressByTokenId(uint256 _tokenId) public view returns (address) {
        bytes32 salt = keccak256(abi.encodePacked(_tokenId));

        return Create2.computeAddress(
            salt,
            keccak256(abi.encodePacked(type(SlothToken).creationCode))
        );
    }

    function getTokenAddressByAddress(
        address tokenAddress
    ) public view returns (address) {
        bytes32 salt = keccak256(abi.encodePacked(tokenAddress));
        bytes memory bytecode = abi.encodePacked(
            type(BeaconProxy).creationCode,
            abi.encode(address(beacon), "")
        );
        bytes32 bytecodeHash = keccak256(bytecode);
        return Create2.computeAddress(salt, bytecodeHash);
    }

    function _emitConfigurationSet() private {
        emit ConfigurationSet(
            feeTo,
            tradingFeeRate,
            listingFeeRate,
            creationFee,
            native,
            uniswapV2Factory,
            forLaunching,
            address(this)
        );
    }

}
