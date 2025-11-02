//SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

event Created(address party, uint256 time);
event Transferred(address party, uint256 time);
event Recieved(address party, uint256 time);

contract SupplyChain {

    error NotOwner();

    enum Action {
        Created,
        Transferred,
        Recieved
    }

    struct Product {
        string name;
        address currentOwner;
        string detailsHash;
    }

    struct TransferLog {
        address party;
        uint256 timestamp;
        Action action;
        string detailsHash;
    }

    mapping(uint256 => Product) public Products;
    mapping(uint256 => TransferLog[]) public History;

    function CreateProduct(uint256 _id, string memory _name, string memory _detailsHash) public {
        Products[_id] = Product({name : _name, currentOwner: msg.sender, detailsHash: _detailsHash});
        TransferLog memory log = TransferLog(msg.sender, block.timestamp, Action.Created, _detailsHash);
        History[_id].push(log);
        
        emit Created(msg.sender, block.timestamp);
    }

    function TransferOwnership(uint256 _id, address newOwner, string memory _detailsHash) public {
        if(msg.sender != Products[_id].currentOwner) revert NotOwner();
        Products[_id].currentOwner = newOwner;
        TransferLog memory log = TransferLog(msg.sender, block.timestamp, Action.Transferred, _detailsHash);
        History[_id].push(log);

        emit Transferred(msg.sender, block.timestamp);
    }

    function VerifyRecieve(address _id, string memory _detailsHash) public {
        if(msg.sender != Products[_id].currentOwner) revert NotOwner();
        TransferLog memory log = TransferLog(msg.sender, block.timestamp, Action.Recieved, _detailsHash);
        History[_id].push(log);
        emit Recieved(msg.sender, block.timestamp);
    }

}
