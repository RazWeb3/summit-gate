const hre = require("hardhat");

async function main() {
  console.log("Starting deployment...");

  // 1. JPYC (Mock) のデプロイ
  // 本番環境（Avalanche C-Chain）では、既存のJPYCアドレスを使用するため、このステップはテスト用です。
  const MockJPYC = await hre.ethers.getContractFactory("MockJPYC");
  const jpyc = await MockJPYC.deploy();
  await jpyc.waitForDeployment();
  const jpycAddress = await jpyc.getAddress();
  console.log(`MockJPYC deployed to: ${jpycAddress}`);

  // 2. SummitGateDistribution のデプロイ
  const SummitGateDistribution = await hre.ethers.getContractFactory("SummitGateDistribution");
  const distribution = await SummitGateDistribution.deploy(jpycAddress);
  await distribution.waitForDeployment();
  const distributionAddress = await distribution.getAddress();

  console.log(`SummitGateDistribution deployed to: ${distributionAddress}`);
  console.log("Deployment completed successfully.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
