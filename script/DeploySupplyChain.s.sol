// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script} from "forge-std/Script.sol";
import {SupplyChain} from "../src/SupplyChain.sol";

contract SupplyChainDeployment is Script {
    function run() public returns (SupplyChain supplyChain) {
        vm.startBroadcast();
        supplyChain = new SupplyChain();

        address deployer = msg.sender;
        supplyChain.addManufacturer(deployer);

        vm.stopBroadcast();
        
        return supplyChain;
    }
}