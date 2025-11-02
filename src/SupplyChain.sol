//SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "openzeppelin-contracts/contracts/access/AccessControl.sol";

event Created(address party, uint256 time);
event Transferred(address party, uint256 time);
event Recieved(address party, uint256 time);

contract SupplyChain is AccessControl {

    error NotOwner();

    bytes32 public constant MANUFACTURER = keccak256("MANUFACTURER");

    enum Action {
        Created,
        InTransit,
        Recieved,
        Sold
    }

    struct Product {
        string name;
        address currentOwner;
        string ipfsHash;
    }

    struct TransferLog {
        address partyCall;
        address partyGet;
        uint256 timestamp;
        Action action;
        string ipfsHash;
    }

    mapping(uint256 => Product) public Products;
    mapping(uint256 => TransferLog[]) public History;

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function AddManufacturer(address account) public onlyRole(DEFAULT_ADMIN_ROLE) {
        _grantRole(MANUFACTURER_ROLE, account);
    }

    function removeManufacturer(address account) public onlyRole(DEFAULT_ADMIN_ROLE) {
        _revokeRole(MANUFACTURER_ROLE, account);
    }

    function CreateProduct(uint256 _id, string memory _name, string memory _ipfsHash) public onlyRole(MANUFACTURER) {
        Products[_id] = Product({name : _name, currentOwner: msg.sender, ipfsHash: _ipfsHash});
        TransferLog memory log = TransferLog(msg.sender, block.timestamp, Action.Created, _ipfsHash);
        History[_id].push(log);
        
        emit Created(msg.sender, block.timestamp);
    }

    function TransferOwnership(uint256 _id, address newOwner, string memory _ipfsHash) public {
        if(msg.sender != Products[_id].currentOwner) revert NotOwner();
        TransferLog memory log = TransferLog(msg.sender, newOwner, block.timestamp, Action.InTransit, _ipfsHash);
        History[_id].push(log);

        emit Transferred(msg.sender, block.timestamp);
    }

    function VerifyRecieve(address _id, string memory _ipfsHash) public {
        if(msg.sender != History[_id][History[_id].length-1].partyGet) revert NotOwner();
        TransferLog memory log = TransferLog(msg.sender, msg.sender, block.timestamp, Action.Recieved, _ipfsHash);
        History[_id].push(log);
        Products[_id].currentOwner = newOwner;
        emit Recieved(msg.sender, block.timestamp);
    }

}
