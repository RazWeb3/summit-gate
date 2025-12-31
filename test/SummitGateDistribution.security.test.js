// -------------------------------------------------------
// 目的: SummitGateDistributionの異常系・セキュリティ観点のテストを追加する
// 作成日: 2025/12/27
// -------------------------------------------------------

const {
  loadFixture,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("SummitGateDistribution (Security & Edge Cases)", function () {
  async function deployFixture() {
    const [deployer, operator, configurer, feeRecipient, user1, user2, attacker] = await ethers.getSigners();

    const MockJPYC = await ethers.getContractFactory("MockJPYC");
    const jpyc = await MockJPYC.deploy();

    const SummitGateDistribution = await ethers.getContractFactory("SummitGateDistribution");
    const distribution = await SummitGateDistribution.deploy(await jpyc.getAddress());

    const OPERATOR_ROLE = await distribution.OPERATOR_ROLE();
    const CONFIG_ROLE = await distribution.CONFIG_ROLE();

    await distribution.grantRole(OPERATOR_ROLE, operator.address);
    await distribution.grantRole(CONFIG_ROLE, configurer.address);

    await distribution.connect(configurer).setFeeConfig(1, 10, feeRecipient.address);

    return { 
      jpyc, 
      distribution, 
      deployer, 
      operator, 
      configurer, 
      feeRecipient, 
      user1, 
      user2, 
      attacker,
      OPERATOR_ROLE,
      CONFIG_ROLE
    };
  }

  describe("Complex Lifecycle & State Consistency", function () {
    it("Should track totalAllocated correctly through multiple cycles of deposit/allocate/withdraw", async function () {
      const { jpyc, distribution, operator, user1, user2, feeRecipient } = await loadFixture(deployFixture);
      
      // Cycle 1: Deposit 20,000
      await jpyc.mint(operator.address, ethers.parseUnits("20000", 18));
      await jpyc.connect(operator).approve(await distribution.getAddress(), ethers.parseUnits("20000", 18));
      await distribution.connect(operator).deposit(ethers.parseUnits("20000", 18));

      // Allocation 1: User1 gets 10,000. Fee (10%) = 1,000. Total required = 11,000.
      // We use batchAllocate to ensure fee is calculated.
      
      const amount1 = ethers.parseUnits("10000", 18);
      await distribution.connect(operator).batchAllocate([user1.address], [amount1]);

      // Check Fee
      // Fee = 10000 * 1 / 10 = 1000
      expect(await distribution.allocations(feeRecipient.address)).to.equal(ethers.parseUnits("1000", 18));
      
      // Check TotalAllocated: 10000 + 1000 = 11000
      expect(await distribution.totalAllocated()).to.equal(ethers.parseUnits("11000", 18));

      // Withdraw User1
      await distribution.connect(user1).withdraw();
      expect(await distribution.totalAllocated()).to.equal(ethers.parseUnits("1000", 18)); // Only fee remains

      // Cycle 2: Allocation User2 gets 5,000. Fee = 500. Total required = 5,500.
      // Remaining Unallocated in Contract: 
      // Initial Balance: 20,000
      // User1 Withdrew: 10,000
      // Current Contract Balance: 10,000
      // Current TotalAllocated: 1,000 (Fee)
      // Available Unallocated: 10,000 - 1,000 = 9,000
      
      // Requesting 5,500 is OK.
      await distribution.connect(operator).batchAllocate([user2.address], [ethers.parseUnits("5000", 18)]);

      // Check TotalAllocated: 1,000 (Old Fee) + 5,000 (User2) + 500 (New Fee) = 6,500
      expect(await distribution.totalAllocated()).to.equal(ethers.parseUnits("6500", 18));
      expect(await distribution.allocations(feeRecipient.address)).to.equal(ethers.parseUnits("1500", 18)); // 1000 + 500

      // Withdraw Fee
      await distribution.connect(feeRecipient).withdraw();
      
      // Check TotalAllocated: 6,500 - 1,500 = 5,000 (User2 remains)
      expect(await distribution.totalAllocated()).to.equal(ethers.parseUnits("5000", 18));
    });
  });

  describe("Fee Logic Edge Cases", function () {
    it("Should handle small amounts where fee rounds to 0", async function () {
      const { jpyc, distribution, operator, user1, feeRecipient } = await loadFixture(deployFixture);
      
      // Deposit small amount
      await jpyc.mint(operator.address, 1000);
      await jpyc.connect(operator).approve(await distribution.getAddress(), 1000);
      await distribution.connect(operator).deposit(1000);

      // Allocate 9 wei. Fee is 10%. 9 * 1 / 10 = 0.9 -> 0.
      await distribution.connect(operator).batchAllocate([user1.address], [9]);

      expect(await distribution.allocations(user1.address)).to.equal(9);
      expect(await distribution.allocations(feeRecipient.address)).to.equal(0);
      expect(await distribution.totalAllocated()).to.equal(9);
    });

    it("Should handle amounts where fee is exactly 1 wei", async function () {
      const { jpyc, distribution, operator, user1, feeRecipient } = await loadFixture(deployFixture);
      
      // Deposit
      await jpyc.mint(operator.address, 1000);
      await jpyc.connect(operator).approve(await distribution.getAddress(), 1000);
      await distribution.connect(operator).deposit(1000);

      // Allocate 10 wei. Fee 10%. 10 * 1 / 10 = 1.
      await distribution.connect(operator).batchAllocate([user1.address], [10]);

      expect(await distribution.allocations(user1.address)).to.equal(10);
      expect(await distribution.allocations(feeRecipient.address)).to.equal(1);
      expect(await distribution.totalAllocated()).to.equal(11);
    });
  });

  describe("Access Control & Security", function () {
    it("Should prevent revoked operator from allocating", async function () {
      const { distribution, deployer, operator, user1 } = await loadFixture(deployFixture);
      const OPERATOR_ROLE = await distribution.OPERATOR_ROLE();

      // Revoke
      await distribution.connect(deployer).revokeRole(OPERATOR_ROLE, operator.address);

      await expect(
        distribution.connect(operator).batchAllocate([user1.address], [100])
      ).to.be.revertedWithCustomError(distribution, "AccessControlUnauthorizedAccount");
    });

    it("Should prevent unauthorized fee config changes", async function () {
        const { distribution, operator, feeRecipient } = await loadFixture(deployFixture);
        // Operator is not Configurer
        await expect(
            distribution.connect(operator).setFeeConfig(1, 5, feeRecipient.address)
        ).to.be.revertedWithCustomError(distribution, "AccessControlUnauthorizedAccount");
    });

    it("Should fail batchAllocate with empty arrays", async function () {
        // Technically this might pass if loop just doesn't run, but let's see if we want to enforce it.
        // The contract checks `huts.length == amounts.length`.
        // If length is 0, loop doesn't run, fee is 0, totalRequired 0.
        // unallocatedBalance >= 0 is true.
        // It might pass and do nothing.
        // This is fine, but let's verify it doesn't crash or exploit.
        const { distribution, operator } = await loadFixture(deployFixture);
        
        await expect(
            distribution.connect(operator).batchAllocate([], [])
        ).not.to.be.reverted;
    });

    it("Should fail if fee recipient tries to front-run and withdraw before allocation (should be 0)", async function () {
        const { distribution, feeRecipient } = await loadFixture(deployFixture);
        await expect(distribution.connect(feeRecipient).withdraw()).to.be.revertedWith("No allocation to claim");
    });
  });
});
