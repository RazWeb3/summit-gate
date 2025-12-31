const hre = require("hardhat");

async function main() {
  console.log("=== Summit Gate Demo Scenario Start ===");

  // --- セットアップ ---
  const [owner, donor, hutA, hutB] = await hre.ethers.getSigners();
  console.log(`\nActors:`);
  console.log(`- Owner (運営): ${owner.address}`);
  console.log(`- Donor (寄付者): ${donor.address}`);
  console.log(`- Hut A (山小屋A): ${hutA.address}`);
  console.log(`- Hut B (山小屋B): ${hutB.address}`);

  // コントラクトのデプロイ
  const MockJPYC = await hre.ethers.getContractFactory("MockJPYC");
  const jpyc = await MockJPYC.deploy();
  await jpyc.waitForDeployment();
  const jpycAddress = await jpyc.getAddress();
  
  const SummitGateDistribution = await hre.ethers.getContractFactory("SummitGateDistribution");
  const distribution = await SummitGateDistribution.deploy(jpycAddress);
  await distribution.waitForDeployment();
  const distributionAddress = await distribution.getAddress();

  console.log(`\nContracts Deployed:`);
  console.log(`- JPYC: ${jpycAddress}`);
  console.log(`- Distribution: ${distributionAddress}`);

  // --- シナリオ 1: 寄付 (Deposit) ---
  console.log(`\n--- Step 1: 寄付 (Deposit) ---`);
  const donationAmount = hre.ethers.parseUnits("10000", 18); // 10,000 JPYC

  // 寄付者にJPYCを配布 (テスト用)
  await jpyc.mint(donor.address, donationAmount);
  console.log(`Donor received ${hre.ethers.formatUnits(donationAmount, 18)} JPYC.`);

  // Approve & Deposit
  await jpyc.connect(donor).approve(distributionAddress, donationAmount);
  await distribution.connect(donor).deposit(donationAmount);
  
  const contractBalance = await jpyc.balanceOf(distributionAddress);
  console.log(`Donor deposited 10,000 JPYC.`);
  console.log(`Contract Balance: ${hre.ethers.formatUnits(contractBalance, 18)} JPYC`);

  // --- シナリオ 2: 配分 (Allocate) ---
  console.log(`\n--- Step 2: 配分 (Allocate) ---`);
  const allocationA = hre.ethers.parseUnits("6000", 18);
  const allocationB = hre.ethers.parseUnits("4000", 18);

  await distribution.connect(owner).allocate([hutA.address, hutB.address], [allocationA, allocationB]);
  console.log(`Owner allocated:`);
  console.log(`- Hut A: 6,000 JPYC`);
  console.log(`- Hut B: 4,000 JPYC`);

  // --- シナリオ 3: 償還 (Claim) ---
  console.log(`\n--- Step 3: 償還 (Claim by Hut A) ---`);
  // 山小屋Aがワンクリック償還を実行
  console.log(`Hut A initial balance: ${hre.ethers.formatUnits(await jpyc.balanceOf(hutA.address), 18)} JPYC`);
  
  await distribution.connect(hutA).claim();
  console.log(`Hut A clicked "Claim"!`);

  const hutABalance = await jpyc.balanceOf(hutA.address);
  console.log(`Hut A new balance: ${hre.ethers.formatUnits(hutABalance, 18)} JPYC`);
  
  const hutAAllocation = await distribution.allocations(hutA.address);
  console.log(`Hut A remaining allocation: ${hre.ethers.formatUnits(hutAAllocation, 18)} JPYC`);

  // --- シナリオ 4: 残りの確認 ---
  console.log(`\n--- Step 4: 状態確認 ---`);
  const contractBalanceFinal = await jpyc.balanceOf(distributionAddress);
  console.log(`Contract remaining balance: ${hre.ethers.formatUnits(contractBalanceFinal, 18)} JPYC (should be 4,000 for Hut B)`);

  console.log("\n=== Demo Scenario Completed ===");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
