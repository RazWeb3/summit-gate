const {
  time,
  loadFixture,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("SummitGateDistribution", function () {
  // フィクスチャを定義して、各テストごとにクリーンな状態を提供
  async function deployDistributionFixture() {
    // アカウントの取得
    const [owner, otherAccount, hut1, hut2] = await ethers.getSigners();

    // MockJPYCのデプロイ
    const MockJPYC = await ethers.getContractFactory("MockJPYC");
    const jpyc = await MockJPYC.deploy();

    // SummitGateDistributionのデプロイ
    const SummitGateDistribution = await ethers.getContractFactory("SummitGateDistribution");
    const distribution = await SummitGateDistribution.deploy(await jpyc.getAddress());

    return { jpyc, distribution, owner, otherAccount, hut1, hut2 };
  }

  describe("Deployment", function () {
    it("Should set the correct JPYC address", async function () {
      const { jpyc, distribution } = await loadFixture(deployDistributionFixture);
      expect(await distribution.jpyc()).to.equal(await jpyc.getAddress());
    });

    it("Should grant roles to deployer", async function () {
      const { distribution, owner } = await loadFixture(deployDistributionFixture);
      const DEFAULT_ADMIN_ROLE = await distribution.DEFAULT_ADMIN_ROLE();
      const OPERATOR_ROLE = await distribution.OPERATOR_ROLE();
      const CONFIG_ROLE = await distribution.CONFIG_ROLE();

      expect(await distribution.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to.be.true;
      expect(await distribution.hasRole(OPERATOR_ROLE, owner.address)).to.be.true;
      expect(await distribution.hasRole(CONFIG_ROLE, owner.address)).to.be.true;
    });
  });

  describe("Deposit", function () {
    it("Should allow users to deposit JPYC", async function () {
      const { jpyc, distribution, otherAccount } = await loadFixture(deployDistributionFixture);
      
      const depositAmount = ethers.parseUnits("10000", 18); // 10,000 JPYC

      // otherAccountにJPYCをミント
      await jpyc.mint(otherAccount.address, depositAmount);

      // Approve
      await jpyc.connect(otherAccount).approve(await distribution.getAddress(), depositAmount);

      // Deposit
      await expect(distribution.connect(otherAccount).deposit(depositAmount))
        .to.emit(distribution, "Deposited")
        .withArgs(otherAccount.address, depositAmount, anyValue);

      // コントラクトの残高確認
      expect(await jpyc.balanceOf(await distribution.getAddress())).to.equal(depositAmount);
    });

    it("Should fail if amount is 0", async function () {
        const { distribution, otherAccount } = await loadFixture(deployDistributionFixture);
        await expect(distribution.connect(otherAccount).deposit(0)).to.be.revertedWith("Amount must be greater than 0");
    });
  });

  describe("Allocate", function () {
    it("Should allow operator to allocate funds individually", async function () {
      const { jpyc, distribution, owner, hut1 } = await loadFixture(deployDistributionFixture);
      
      // 分配には資金が必要なので、まず入金する
      const fundAmount = ethers.parseUnits("10000", 18);
      await jpyc.mint(owner.address, fundAmount);
      await jpyc.connect(owner).approve(await distribution.getAddress(), fundAmount);
      await distribution.connect(owner).deposit(fundAmount);

      const amount = ethers.parseUnits("5000", 18);

      await expect(distribution.connect(owner).allocate(hut1.address, amount))
        .to.emit(distribution, "Allocated")
        .withArgs(hut1.address, amount, anyValue);

      expect(await distribution.allocations(hut1.address)).to.equal(amount);
      expect(await distribution.totalAllocated()).to.equal(amount);
    });

    it("Should allow operator to batch allocate funds with fee deduction", async function () {
      const { jpyc, distribution, owner, hut1, hut2 } = await loadFixture(deployDistributionFixture);
      
      // 分配には資金が必要なので、まず入金する
      // 山小屋分配: 8000 JPYC
      // 手数料(1/18): 8000 * 1 / 18 = 444.44... -> 444 JPYC
      // 必要合計: 8444 JPYC
      const fundAmount = ethers.parseUnits("10000", 18);
      await jpyc.mint(owner.address, fundAmount);
      await jpyc.connect(owner).approve(await distribution.getAddress(), fundAmount);
      await distribution.connect(owner).deposit(fundAmount);

      const huts = [hut1.address, hut2.address];
      const amounts = [ethers.parseUnits("5000", 18), ethers.parseUnits("3000", 18)]; // 合計 8000
      
      const totalHutAlloc = ethers.parseUnits("8000", 18);
      // Fee = Alloc * 1 / 18
      const expectedFee = (totalHutAlloc * 1n) / 18n; 

      await expect(distribution.connect(owner).batchAllocate(huts, amounts))
        .to.emit(distribution, "Allocated")
        .withArgs(hut1.address, amounts[0], anyValue)
        .to.emit(distribution, "Allocated")
        .withArgs(hut2.address, amounts[1], anyValue)
        .to.emit(distribution, "FeeCollected")
        .withArgs(owner.address, expectedFee, anyValue); // owner is default recipient

      expect(await distribution.allocations(hut1.address)).to.equal(amounts[0]);
      expect(await distribution.allocations(hut2.address)).to.equal(amounts[1]);
      expect(await distribution.allocations(owner.address)).to.equal(expectedFee);
      
      // totalAllocatedの確認
      expect(await distribution.totalAllocated()).to.equal(amounts[0] + amounts[1] + expectedFee);
    });

    it("Should fail if total required exceeds unallocated balance", async function () {
        const { jpyc, distribution, owner, hut1 } = await loadFixture(deployDistributionFixture);
        
        const fundAmount = ethers.parseUnits("1000", 18);
        await jpyc.mint(owner.address, fundAmount);
        await jpyc.connect(owner).approve(await distribution.getAddress(), fundAmount);
        await distribution.connect(owner).deposit(fundAmount);
  
        // 1000 JPYC available.
        // Try to allocate 1000 JPYC to hut.
        // Fee = 1000 * 1 / 18 = 55.5 -> 55
        // Total required = 1055 > 1000 -> Should fail
        
        const huts = [hut1.address];
        const amounts = [ethers.parseUnits("1000", 18)];
        
        await expect(distribution.connect(owner).batchAllocate(huts, amounts))
            .to.be.revertedWith("Insufficient unallocated balance");
    });

    it("Should fail if caller does not have OPERATOR_ROLE", async function () {
      const { distribution, otherAccount, hut1 } = await loadFixture(deployDistributionFixture);
      const amount = ethers.parseUnits("1000", 18);
      const OPERATOR_ROLE = await distribution.OPERATOR_ROLE();
      
      await expect(distribution.connect(otherAccount).allocate(hut1.address, amount))
        .to.be.revertedWithCustomError(distribution, "AccessControlUnauthorizedAccount")
        .withArgs(otherAccount.address, OPERATOR_ROLE);
    });

    it("Should fail if array lengths mismatch", async function () {
      const { distribution, owner, hut1 } = await loadFixture(deployDistributionFixture);
      const huts = [hut1.address];
      const amounts = [100, 200];
      
      await expect(distribution.connect(owner).batchAllocate(huts, amounts)).to.be.revertedWith("Mismatched arrays");
    });
  });

  describe("Fee Management", function () {
    it("Should allow config role to update fee config", async function () {
        const { distribution, owner, otherAccount } = await loadFixture(deployDistributionFixture);
        
        // Update fee ratio to 1:20 (approx 4.76%)
        // Check 9*1 <= 20 -> OK
        await expect(distribution.connect(owner).setFeeConfig(1, 20, otherAccount.address))
            .to.emit(distribution, "FeeConfigUpdated")
            .withArgs(1, 20, otherAccount.address);

        expect(await distribution.feeNumerator()).to.equal(1);
        expect(await distribution.feeDenominator()).to.equal(20);
        expect(await distribution.feeRecipient()).to.equal(otherAccount.address);
    });

    it("Should fail if fee exceeds max limit (10%)", async function () {
        const { distribution, owner, otherAccount } = await loadFixture(deployDistributionFixture);
        
        // Try to update fee to ratio 1:8 (1/9 = 11.11%)
        // Check 9*1 <= 8 -> False (9 > 8)
        await expect(distribution.connect(owner).setFeeConfig(1, 8, otherAccount.address))
            .to.be.revertedWith("Fee exceeds limit (max 10%)");
    });

    it("Should fail if denominator is zero", async function () {
        const { distribution, owner, otherAccount } = await loadFixture(deployDistributionFixture);
        
        await expect(distribution.connect(owner).setFeeConfig(1, 0, otherAccount.address))
            .to.be.revertedWith("Denominator cannot be zero");
    });

    it("Should fail if recipient is zero address", async function () {
        const { distribution, owner } = await loadFixture(deployDistributionFixture);
        
        await expect(distribution.connect(owner).setFeeConfig(1, 18, ethers.ZeroAddress))
            .to.be.revertedWith("Invalid recipient");
    });

    it("Should fail if non-configurator tries to update fee", async function () {
        const { distribution, otherAccount } = await loadFixture(deployDistributionFixture);
        const CONFIG_ROLE = await distribution.CONFIG_ROLE();
        
        await expect(distribution.connect(otherAccount).setFeeConfig(1, 18, otherAccount.address))
            .to.be.revertedWithCustomError(distribution, "AccessControlUnauthorizedAccount")
            .withArgs(otherAccount.address, CONFIG_ROLE);
    });
  });

  describe("Claim", function () {
    it("Should allow huts to claim their allocation", async function () {
      const { jpyc, distribution, owner, otherAccount, hut1 } = await loadFixture(deployDistributionFixture);
      
      const depositAmount = ethers.parseUnits("10000", 18);
      const allocateAmount = ethers.parseUnits("5000", 18);

      // 準備: JPYC入金
      await jpyc.mint(otherAccount.address, depositAmount);
      await jpyc.connect(otherAccount).approve(await distribution.getAddress(), depositAmount);
      await distribution.connect(otherAccount).deposit(depositAmount);

      // 準備: Allocate
      await distribution.connect(owner).allocate(hut1.address, allocateAmount);

      // Claim前の残高確認
      expect(await jpyc.balanceOf(hut1.address)).to.equal(0);

      // Claim
      await expect(distribution.connect(hut1).withdraw())
        .to.emit(distribution, "Claimed")
        .withArgs(hut1.address, allocateAmount, anyValue);

      // Claim後の残高確認
      expect(await jpyc.balanceOf(hut1.address)).to.equal(allocateAmount);
      
      // Allocationが0になっているか確認
      expect(await distribution.allocations(hut1.address)).to.equal(0);

      // totalAllocatedが減っていることを確認
      expect(await distribution.totalAllocated()).to.equal(0);
    });

    it("Should fail if nothing to claim", async function () {
      const { distribution, hut1 } = await loadFixture(deployDistributionFixture);
      await expect(distribution.connect(hut1).withdraw()).to.be.revertedWith("No allocation to claim");
    });
  });
});