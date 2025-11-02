// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console2} from "forge-std/Test.sol";
import {SupplyChain} from "../src/SupplyChain.sol";

event Created(address party, uint256 time);
event Transferred(address party, uint256 time);
event Recieved(address party, uint256 time);

error AccessControlUnauthorizedAccount(address account, bytes32 role);

contract SupplyChainTest is Test {
    SupplyChain supplyChain;

    address constant DEPLOYER = address(0x1);
    address constant MANUFACTURER_2 = address(0x2);
    address constant CARRIER = address(0x3);
    address constant RETAILER = address(0x4);
    address constant NON_MANUFACTURER = address(0x5);

    uint256 constant TOKEN_ID = 101;
    string constant PRODUCT_NAME = "Test Widget";
    string constant IPFS_HASH_CREATED = "QmHashCreated";
    string constant IPFS_HASH_TRANSIT = "QmHashTransit";
    string constant IPFS_HASH_RECEIVED = "QmHashReceived";

    function setUp() public {
        vm.startPrank(DEPLOYER);
        supplyChain = new SupplyChain();
        supplyChain.addManufacturer(DEPLOYER);
        supplyChain.addManufacturer(MANUFACTURER_2);
        vm.stopPrank();
    }

    function test_AdminAddsAndRemovesManufacturer() public {
        bytes32 manufacturerRole = supplyChain.MANUFACTURER_ROLE();
        assertTrue(supplyChain.hasRole(manufacturerRole, MANUFACTURER_2), "M2 should have role initially");

        vm.prank(DEPLOYER);
        supplyChain.removeManufacturer(MANUFACTURER_2);

        assertFalse(supplyChain.hasRole(manufacturerRole, MANUFACTURER_2), "M2 should not have role after removal");

        vm.prank(DEPLOYER);
        supplyChain.addManufacturer(MANUFACTURER_2);
        assertTrue(supplyChain.hasRole(manufacturerRole, MANUFACTURER_2), "M2 should have role after being re-added");
    }

    function test_NonAdminCannotAddManufacturer() public {
        bytes32 adminRole = 0x0000000000000000000000000000000000000000000000000000000000000000;

        vm.prank(NON_MANUFACTURER);
        vm.expectRevert(abi.encodeWithSelector(AccessControlUnauthorizedAccount.selector, NON_MANUFACTURER, adminRole));
        supplyChain.addManufacturer(NON_MANUFACTURER);
    }

    function test_ManufacturerCreatesProduct() public {
        vm.prank(DEPLOYER);
        vm.expectEmit(true, false, false, true);
        emit Created(DEPLOYER, block.timestamp);
        supplyChain.createProduct(TOKEN_ID, PRODUCT_NAME, IPFS_HASH_CREATED);

        assertEq(supplyChain.ownerOf(TOKEN_ID), DEPLOYER, "Owner should be DEPLOYER");
        assertEq(supplyChain.tokenURI(TOKEN_ID), IPFS_HASH_CREATED, "Token URI should match IPFS hash");

        SupplyChain.Product memory product = supplyChain.getProduct(TOKEN_ID);
        assertEq(product.name, PRODUCT_NAME, "Product name mismatch");
        assertEq(product.ipfsHash, IPFS_HASH_CREATED, "Product IPFS hash mismatch");
    }

    function test_NonManufacturerCannotCreateProduct() public {
        bytes32 manufacturerRole = supplyChain.MANUFACTURER_ROLE(); 
        
        vm.prank(NON_MANUFACTURER);
        vm.expectRevert(abi.encodeWithSelector(AccessControlUnauthorizedAccount.selector, NON_MANUFACTURER, manufacturerRole));
        supplyChain.createProduct(TOKEN_ID, PRODUCT_NAME, IPFS_HASH_CREATED);
    }

    function test_TransferAndReceiveFlow() public {
        vm.prank(DEPLOYER);
        supplyChain.createProduct(TOKEN_ID, PRODUCT_NAME, IPFS_HASH_CREATED);

        vm.prank(DEPLOYER);
        vm.expectEmit(true, false, false, true);
        emit Transferred(DEPLOYER, block.timestamp);
        supplyChain.transferOwnership(TOKEN_ID, CARRIER, IPFS_HASH_TRANSIT);

        assertEq(supplyChain.ownerOf(TOKEN_ID), CARRIER, "Owner should now be CARRIER after transfer");

        vm.prank(CARRIER);
        vm.expectEmit(true, false, false, true);
        emit Recieved(CARRIER, block.timestamp);
        supplyChain.verifyRecieve(TOKEN_ID, IPFS_HASH_RECEIVED);

        SupplyChain.TransferLog[] memory history = supplyChain.getHistory(TOKEN_ID);
        assertEq(history.length, 3, "History should have 3 entries (Created, InTransit, Recieved)");

        assertEq(uint8(history[2].action), uint8(SupplyChain.Action.Recieved), "Last action should be Recieved");
        assertEq(history[2].partyGet, CARRIER, "Recieved party should be CARRIER");
        assertEq(history[2].ipfsHash, IPFS_HASH_RECEIVED, "Recieved IPFS hash mismatch");
    }

    function test_VerifyRecieveRevertsIfNotOwner() public {
        vm.prank(DEPLOYER);
        supplyChain.createProduct(TOKEN_ID, PRODUCT_NAME, IPFS_HASH_CREATED);
        
        vm.prank(DEPLOYER);
        supplyChain.transferOwnership(TOKEN_ID, CARRIER, IPFS_HASH_TRANSIT);

        vm.prank(RETAILER);
        vm.expectRevert(SupplyChain.NotOwner.selector);
        supplyChain.verifyRecieve(TOKEN_ID, IPFS_HASH_RECEIVED);
    }
}