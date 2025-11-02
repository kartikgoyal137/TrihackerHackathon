//SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "openzeppelin-contracts/contracts/access/AccessControl.sol";
import "openzeppelin-contracts/contracts/token/ERC721/ERC721.sol"; 
import "openzeppelin-contracts/contracts/token/ERC721/extensions/ERC721URIStorage.sol"; 
// import "@chainlink/contracts/src/v0.8/ChainlinkClient.sol";

event Created(address party, uint256 time);
event Transferred(address party, uint256 time);
event Recieved(address party, uint256 time);

contract SupplyChain is AccessControl {

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

    mapping(uint256 => Product) private Products;
    mapping(uint256 => TransferLog[]) private History;

    constructor() ERC721(_NAME, _SYMBOL) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function AddManufacturer(address account) public onlyRole(DEFAULT_ADMIN_ROLE) {
        _grantRole(MANUFACTURER_ROLE, account);
    }

    function removeManufacturer(address account) public onlyRole(DEFAULT_ADMIN_ROLE) {
        _revokeRole(MANUFACTURER_ROLE, account);
    }

    function CreateProduct(uint256 _id, string memory _name, string memory _ipfsHash) public onlyRole(MANUFACTURER_ROLE) {
        Products[_id] = Product({name : _name, ipfsHash: _ipfsHash});
        _safeMint(msg.sender, _id);
        _setTokenURI(_id, _ipfsHash);
        TransferLog memory log = TransferLog(msg.sender, block.timestamp, Action.Created, _ipfsHash);
        History[_id].push(log);
        
        emit Created(msg.sender, block.timestamp);
    }

    function TransferOwnership(uint256 _id, address newOwner, string memory _ipfsHash) public {
        transferFrom(msg.sender, newOwner, _id);

        TransferLog memory log = TransferLog(msg.sender, newOwner, block.timestamp, Action.InTransit, _ipfsHash);
        History[_id].push(log);

        emit Transferred(msg.sender, block.timestamp);
    }

    function VerifyRecieve(address _id, string memory _ipfsHash) public {
        if(msg.sender != ownerOf(_id)) revert NotOwner(); 
        if(msg.sender != History[_id][History[_id].length-1].partyGet) revert NotOwner();
        TransferLog memory log = TransferLog(msg.sender, msg.sender, block.timestamp, Action.Recieved, _ipfsHash);
        History[_id].push(log);

        emit Recieved(msg.sender, block.timestamp);
    }

    function getProduct(uint256 _id) public view returns(Product) {
        return Products[_id];
    }

    function getHistory(uint256 _id) public view returns(TranferLog[]) {
        return History[_id];
    }

}
