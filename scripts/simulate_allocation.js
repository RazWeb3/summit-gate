const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("Starting Summit Gate Allocation Simulation...");

  // 1. Load Dummy Data
  const dataPath = path.join(__dirname, "../data/dummy_rfid_logs.json");
  const rawData = fs.readFileSync(dataPath, "utf8");
  const logs = JSON.parse(rawData);
  console.log(`Loaded ${logs.length} logs from dummy_rfid_logs.json`);

  // 2. Aggregate Data (Calculate allocation per Hut)
  // In production, this logic would be in the backend database/API
  const allocationMap = {};
  
  // Mapping Hut IDs to actual addresses (Mock for Hackathon)
  // You would typically fetch these from a database
  const [deployer, s1, s2, s3, s4, s5, s6, s7] = await hre.ethers.getSigners();
  const hutAddressMap = {
    "unkaiso": s1.address,          // 6th Station (Unkaiso)
    "houeisanso": s2.address,       // 6th Station (Houei-sanso)
    "goraikousanso": s3.address,    // New 7th Station (Goraikousanso)
    "yamaguchisanso": s4.address,   // Old 7th Station (Yamaguchi-sanso)
    "ikedakan": s5.address,         // 8th Station (Ikeda-kan)
    "mannenyukisanso": s6.address,  // 9th Station (Mannen-yuki-sanso)
    "munatsukisanso": s7.address    // 9.5th Station (Munatsuki-sanso)
  };

  // Unit Price (e.g., 1800 JPYC per person for the hut)
  // Assuming 2000 total - 100 fee - 100 system = 1800
  const ALLOCATION_PER_PERSON = hre.ethers.parseUnits("1800", 18);

  for (const log of logs) {
    const address = hutAddressMap[log.hutId];
    if (!address) {
      console.warn(`Unknown hutId: ${log.hutId}, skipping.`);
      continue;
    }

    if (!allocationMap[address]) {
      allocationMap[address] = BigInt(0);
    }
    
    // Add amount based on count
    allocationMap[address] += BigInt(log.count) * ALLOCATION_PER_PERSON;
  }

  // Prepare arrays for batchAllocate
  const huts = Object.keys(allocationMap);
  const amounts = Object.values(allocationMap);

  if (huts.length === 0) {
    console.log("No allocations to process.");
    return;
  }

  console.log("\n--- Allocation Plan ---");
  for (let i = 0; i < huts.length; i++) {
    console.log(`Hut: ${huts[i]}, Amount: ${hre.ethers.formatUnits(amounts[i], 18)} JPYC`);
  }

  // 3. Execute On-Chain Transaction
  // Get the deployed contract
  // NOTE: In a real script, you'd load the address from a deployment file or env var
  // For this simulation, we'll assume we need to attach to a known address 
  // OR deploy a fresh one if running on local hardhat network for demo.
  
  // Checking if we are on localhost/hardhat network to deploy a fresh instance for demo purposes
  let distribution;
  const network = hre.network.name;
  
  if (network === "hardhat" || network === "localhost") {
      console.log("\n[Dev Mode] Deploying fresh contracts for simulation...");
      const mockJpyc = await hre.ethers.deployContract("MockJPYC");
      await mockJpyc.waitForDeployment();
      
      distribution = await hre.ethers.deployContract("SummitGateDistribution", [mockJpyc.target]);
      await distribution.waitForDeployment();
      console.log(`Distribution Contract deployed to: ${distribution.target}`);

      // Mint JPYC to distribution contract to simulate deposits
      // In reality, JPYC Inc. or Payment Gateway deposits this
      const totalRequired = amounts.reduce((a, b) => a + b, BigInt(0)) * BigInt(2); // buffer
      await mockJpyc.mint(deployer.address, totalRequired);
      await mockJpyc.approve(distribution.target, totalRequired);
      await distribution.deposit(totalRequired);
      console.log(`Deposited ${hre.ethers.formatUnits(totalRequired, 18)} JPYC for testing.`);
  } else {
      // If on testnet, replace this with actual deployed address
      const CONTRACT_ADDRESS = process.env.DISTRIBUTION_ADDRESS;
      if (!CONTRACT_ADDRESS) throw new Error("Set DISTRIBUTION_ADDRESS in .env for non-local networks");
      distribution = await hre.ethers.getContractAt("SummitGateDistribution", CONTRACT_ADDRESS);
  }

  // Execute batchAllocate
  console.log("\nExecuting batchAllocate...");
  const tx = await distribution.batchAllocate(huts, amounts);
  const receipt = await tx.wait();

  console.log(`Transaction confirmed! Hash: ${receipt.hash}`);
  
  // Verify
  console.log("\n--- Verifying On-Chain State ---");
  for (const hut of huts) {
      const balance = await distribution.allocations(hut);
      console.log(`Hut ${hut} Allocation Balance: ${hre.ethers.formatUnits(balance, 18)} JPYC`);
  }
  
  console.log("\nSimulation Completed Successfully.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
