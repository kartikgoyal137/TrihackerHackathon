//SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "openzeppelin-contracts/contracts/access/AccessControl.sol";
import "openzeppelin-contracts/contracts/token/ERC721/ERC721.sol"; 
import "openzeppelin-contracts/contracts/token/ERC721/extensions/ERC721URIStorage.sol"; 
// import "@chainlink/contracts/src/v0.8/ChainlinkClient.sol";

event Created(address party, uint256 time);
event Transferred(address party, uint256 time);
event Recieved(address party, uint256 time);

contract SupplyChain is AccessControl, ERC721, ERC721URIStorage {

    error NotOwner();

    bytes32 public constant MANUFACTURER_ROLE = keccak256("MANUFACTURER_ROLE");

    enum Action {
        Created,
        InTransit,
        Recieved,
        Sold
    }

    struct Product {
        string name;
        string ipfsHash;
    }

    struct TransferLog {
        address partyCall;
        address partyGet;
        uint256 timestamp;
        Action action;
        string ipfsHash;
    }

    mapping(uint256 => Product) private products;
    mapping(uint256 => TransferLog[]) private history;

    constructor() ERC721("SupplyChainUnit", "SCU") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function addManufacturer(address account) public onlyRole(DEFAULT_ADMIN_ROLE) {
        _grantRole(MANUFACTURER_ROLE, account);
    }

    function removeManufacturer(address account) public onlyRole(DEFAULT_ADMIN_ROLE) {
        _revokeRole(MANUFACTURER_ROLE, account);
    }

    function createProduct(uint256 _id, string memory _name, string memory _ipfsHash) public onlyRole(MANUFACTURER_ROLE) {
        products[_id] = Product({name : _name, ipfsHash: _ipfsHash});
        _safeMint(msg.sender, _id);
        _setTokenURI(_id, _ipfsHash);
        TransferLog memory log = TransferLog(msg.sender, msg.sender, block.timestamp, Action.Created, _ipfsHash);
        history[_id].push(log);
        
        emit Created(msg.sender, block.timestamp);
    }

    function transferOwnership(uint256 _id, address newOwner, string memory _ipfsHash) public {
        transferFrom(msg.sender, newOwner, _id);

        TransferLog memory log = TransferLog(msg.sender, newOwner, block.timestamp, Action.InTransit, _ipfsHash);
        history[_id].push(log);

        emit Transferred(msg.sender, block.timestamp);
    }

    function verifyRecieve(uint256 _id, string memory _ipfsHash) public {
        if(msg.sender != ownerOf(_id)) revert NotOwner(); 
        if(msg.sender != history[_id][history[_id].length-1].partyGet) revert NotOwner();
        TransferLog memory log = TransferLog(msg.sender, msg.sender, block.timestamp, Action.Recieved, _ipfsHash);
        history[_id].push(log);

        emit Recieved(msg.sender, block.timestamp);
    }

    function getProduct(uint256 _id) public view returns(Product memory) {
        return products[_id];
    }

    function getHistory(uint256 _id) public view returns(TransferLog[] memory) {
        return history[_id];
    }

    function supportsInterface(bytes4 interfaceId) 
    public 
    view 
    override(AccessControl, ERC721, ERC721URIStorage) 
    returns (bool) 
    {
        return super.supportsInterface(interfaceId);
    }
    
    function tokenURI(uint256 tokenId) 
    public 
    view 
    override(ERC721, ERC721URIStorage) 
    returns (string memory) 
    {
        return super.tokenURI(tokenId);
    }

}
