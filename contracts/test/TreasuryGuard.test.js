// test/TreasuryGuard.test.js
// Comprehensive Hardhat/Mocha/Chai test suite for TreasuryGuard.sol
// Uses ethers v6 syntax throughout.
// ─────────────────────────────────────────────────────────────────────────────

const { expect }      = require("chai");
const { ethers }      = require("hardhat");
const { time }        = require("@nomicfoundation/hardhat-network-helpers");

// Helper: keccak256 of a role string (matches contract constants)
const role = (name) => ethers.keccak256(ethers.toUtf8Bytes(name));

// Dummy oracle signature bytes used in lockLiquidity calls
const DUMMY_SIG = ethers.hexlify(ethers.randomBytes(65));

// ─────────────────────────────────────────────────────────────────────────────
// Fixture: deploy a fresh TreasuryGuard before each test group
// ─────────────────────────────────────────────────────────────────────────────

async function deployFixture() {
  const [admin, oracle, user, stranger, destination] = await ethers.getSigners();

  const TreasuryGuard = await ethers.getContractFactory("TreasuryGuard");
  const contract = await TreasuryGuard.deploy(admin.address, oracle.address);
  await contract.waitForDeployment();

  const ADMIN_ROLE    = await contract.ADMIN_ROLE();
  const ORACLE_ROLE   = await contract.ORACLE_ROLE();
  const GUARDIAN_ROLE = await contract.GUARDIAN_ROLE();
  const DEFAULT_ROLE  = await contract.DEFAULT_ADMIN_ROLE();

  return {
    contract,
    admin,
    oracle,
    user,
    stranger,
    destination,
    ADMIN_ROLE,
    ORACLE_ROLE,
    GUARDIAN_ROLE,
    DEFAULT_ROLE,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
describe("TreasuryGuard", function () {

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Deployment
  // ───────────────────────────────────────────────────────────────────────────
  describe("1. Deployment", function () {
    it("1-1: deploys with correct admin role", async function () {
      const { contract, admin, ADMIN_ROLE } = await deployFixture();
      expect(await contract.hasRole(ADMIN_ROLE, admin.address)).to.be.true;
    });

    it("1-2: deploys with correct DEFAULT_ADMIN_ROLE", async function () {
      const { contract, admin, DEFAULT_ROLE } = await deployFixture();
      expect(await contract.hasRole(DEFAULT_ROLE, admin.address)).to.be.true;
    });

    it("1-3: deploys with correct oracle role", async function () {
      const { contract, oracle, ORACLE_ROLE } = await deployFixture();
      expect(await contract.hasRole(ORACLE_ROLE, oracle.address)).to.be.true;
    });

    it("1-4: starts in unlocked state", async function () {
      const { contract } = await deployFixture();
      expect(await contract.isLocked()).to.be.false;
    });

    it("1-5: starts with zero contract balance", async function () {
      const { contract } = await deployFixture();
      expect(await contract.getContractBalance()).to.equal(0n);
    });

    it("1-6: starts with zero actionCount", async function () {
      const { contract } = await deployFixture();
      expect(await contract.actionCount()).to.equal(0n);
    });

    it("1-7: reverts if initialAdmin is zero address", async function () {
      const [, oracle] = await ethers.getSigners();
      const TreasuryGuard = await ethers.getContractFactory("TreasuryGuard");
      await expect(
        TreasuryGuard.deploy(ethers.ZeroAddress, oracle.address)
      ).to.be.revertedWithCustomError(
        await TreasuryGuard.deploy(ethers.ZeroAddress, oracle.address).catch(() =>
          TreasuryGuard.getContractFactory ? null : null
        ) ?? { interface: (await TreasuryGuard.deploy(ethers.ZeroAddress, oracle.address).catch(async () => {
          // re-use factory for error matching
          const f = await ethers.getContractFactory("TreasuryGuard");
          return { interface: f.interface };
        })).interface },
        "ZeroAddress"
      );
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. lockLiquidity()
  // ───────────────────────────────────────────────────────────────────────────
  describe("2. lockLiquidity()", function () {
    it("2-1: oracle can lock liquidity", async function () {
      const { contract, oracle } = await deployFixture();
      await expect(
        contract.connect(oracle).lockLiquidity(8500, 125000n * 10n ** 18n, 9100, DUMMY_SIG)
      ).to.not.be.reverted;
      expect(await contract.isLocked()).to.be.true;
    });

    it("2-2: lockLiquidity emits LiquidityLocked event", async function () {
      const { contract, oracle } = await deployFixture();
      const riskScore = 8500;
      const var95     = 125000n * 10n ** 18n;
      const tx = await contract.connect(oracle).lockLiquidity(riskScore, var95, 9100, DUMMY_SIG);
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt.blockNumber);
      await expect(tx)
        .to.emit(contract, "LiquidityLocked")
        .withArgs(oracle.address, block.timestamp, riskScore, var95);
    });

    it("2-3: non-oracle cannot lock liquidity", async function () {
      const { contract, stranger, ORACLE_ROLE } = await deployFixture();
      await expect(
        contract.connect(stranger).lockLiquidity(8500, 0, 9000, DUMMY_SIG)
      ).to.be.revertedWithCustomError(contract, "AccessControlUnauthorizedAccount");
    });

    it("2-4: admin cannot call lockLiquidity (wrong role)", async function () {
      const { contract, admin } = await deployFixture();
      await expect(
        contract.connect(admin).lockLiquidity(8500, 0, 9000, DUMMY_SIG)
      ).to.be.revertedWithCustomError(contract, "AccessControlUnauthorizedAccount");
    });

    it("2-5: cannot lock when already locked", async function () {
      const { contract, oracle } = await deployFixture();
      await contract.connect(oracle).lockLiquidity(8500, 0, 9000, DUMMY_SIG);
      await expect(
        contract.connect(oracle).lockLiquidity(8500, 0, 9000, DUMMY_SIG)
      ).to.be.revertedWithCustomError(contract, "AlreadyLocked");
    });

    it("2-6: lockLiquidity records decision with correct action string", async function () {
      const { contract, oracle } = await deployFixture();
      await contract.connect(oracle).lockLiquidity(8500, 999n, 9000, DUMMY_SIG);
      const history = await contract.getDecisionHistory();
      expect(history.length).to.equal(1);
      expect(history[0].action).to.equal("LOCK_LIQUIDITY");
      expect(history[0].riskScore).to.equal(8500n);
    });

    it("2-7: lockLiquidity reverts when paused", async function () {
      const { contract, oracle, admin } = await deployFixture();
      await contract.connect(admin).pause();
      await expect(
        contract.connect(oracle).lockLiquidity(8500, 0, 9000, DUMMY_SIG)
      ).to.be.revertedWithCustomError(contract, "EnforcedPause");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. unlockLiquidity()
  // ───────────────────────────────────────────────────────────────────────────
  describe("3. unlockLiquidity()", function () {
    async function lockAndSetDelay(contract, oracle, admin, delay = 0) {
      await contract.connect(admin).setUnlockDelay(delay);
      await contract.connect(oracle).lockLiquidity(7000, 0, 8000, DUMMY_SIG);
    }

    it("3-1: oracle can unlock after delay has elapsed", async function () {
      const { contract, oracle, admin } = await deployFixture();
      // Set delay to 0 for instant unlock in tests
      await contract.connect(admin).setUnlockDelay(0);
      await contract.connect(oracle).lockLiquidity(7000, 0, 8000, DUMMY_SIG);
      await expect(contract.connect(oracle).unlockLiquidity()).to.not.be.reverted;
      expect(await contract.isLocked()).to.be.false;
    });

    it("3-2: unlockLiquidity emits LiquidityUnlocked event", async function () {
      const { contract, oracle, admin } = await deployFixture();
      await lockAndSetDelay(contract, oracle, admin, 0);
      const tx = await contract.connect(oracle).unlockLiquidity();
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt.blockNumber);
      await expect(tx)
        .to.emit(contract, "LiquidityUnlocked")
        .withArgs(oracle.address, block.timestamp);
    });

    it("3-3: cannot unlock when not locked", async function () {
      const { contract, oracle } = await deployFixture();
      await expect(
        contract.connect(oracle).unlockLiquidity()
      ).to.be.revertedWithCustomError(contract, "NotLocked");
    });

    it("3-4: cannot unlock before delay has elapsed", async function () {
      const { contract, oracle } = await deployFixture();
      // Default delay is 1 hour
      await contract.connect(oracle).lockLiquidity(7000, 0, 8000, DUMMY_SIG);
      await expect(
        contract.connect(oracle).unlockLiquidity()
      ).to.be.revertedWithCustomError(contract, "UnlockDelayNotMet");
    });

    it("3-5: can unlock after 1-hour delay via time travel", async function () {
      const { contract, oracle } = await deployFixture();
      await contract.connect(oracle).lockLiquidity(7000, 0, 8000, DUMMY_SIG);
      // Fast-forward 1 hour + 1 second
      await time.increase(3601);
      await expect(contract.connect(oracle).unlockLiquidity()).to.not.be.reverted;
    });

    it("3-6: non-oracle cannot unlock", async function () {
      const { contract, oracle, admin, stranger } = await deployFixture();
      await lockAndSetDelay(contract, oracle, admin, 0);
      await expect(
        contract.connect(stranger).unlockLiquidity()
      ).to.be.revertedWithCustomError(contract, "AccessControlUnauthorizedAccount");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. rebalanceTreasury()
  // ───────────────────────────────────────────────────────────────────────────
  describe("4. rebalanceTreasury()", function () {
    it("4-1: oracle can rebalance when unlocked", async function () {
      const { contract, oracle } = await deployFixture();
      const amount = ethers.parseEther("0.5");
      await expect(contract.connect(oracle).rebalanceTreasury(amount)).to.not.be.reverted;
      expect(await contract.totalProtectedAmount()).to.equal(amount);
    });

    it("4-2: rebalance emits TreasuryRebalanced event", async function () {
      const { contract, oracle } = await deployFixture();
      const amount = ethers.parseEther("1.0");
      await expect(contract.connect(oracle).rebalanceTreasury(amount))
        .to.emit(contract, "TreasuryRebalanced")
        .withArgs(oracle.address, amount, await time.latest() + 1);
    });

    it("4-3: rebalance reverts when liquidity is locked", async function () {
      const { contract, oracle } = await deployFixture();
      await contract.connect(oracle).lockLiquidity(8000, 0, 9000, DUMMY_SIG);
      const amount = ethers.parseEther("1.0");
      await expect(
        contract.connect(oracle).rebalanceTreasury(amount)
      ).to.be.revertedWithCustomError(contract, "AlreadyLocked");
    });

    it("4-4: rebalance reverts with zero amount", async function () {
      const { contract, oracle } = await deployFixture();
      await expect(
        contract.connect(oracle).rebalanceTreasury(0n)
      ).to.be.revertedWithCustomError(contract, "ZeroAmount");
    });

    it("4-5: non-oracle cannot rebalance", async function () {
      const { contract, stranger } = await deployFixture();
      await expect(
        contract.connect(stranger).rebalanceTreasury(ethers.parseEther("1.0"))
      ).to.be.revertedWithCustomError(contract, "AccessControlUnauthorizedAccount");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. emergencyTransfer()
  // ───────────────────────────────────────────────────────────────────────────
  describe("5. emergencyTransfer()", function () {
    it("5-1: oracle can transfer ETH to a valid destination", async function () {
      const { contract, oracle, destination } = await deployFixture();
      const depositAmount = ethers.parseEther("2.0");
      await contract.connect(oracle).deposit({ value: depositAmount });

      const transferAmount = ethers.parseEther("1.0");
      const before = await ethers.provider.getBalance(destination.address);

      await contract.connect(oracle).emergencyTransfer(destination.address, transferAmount);

      const after = await ethers.provider.getBalance(destination.address);
      expect(after - before).to.equal(transferAmount);
    });

    it("5-2: emergencyTransfer emits EmergencyTriggered event", async function () {
      const { contract, oracle, destination } = await deployFixture();
      const depositAmount  = ethers.parseEther("2.0");
      const transferAmount = ethers.parseEther("0.5");
      await contract.connect(oracle).deposit({ value: depositAmount });

      await expect(
        contract.connect(oracle).emergencyTransfer(destination.address, transferAmount)
      )
        .to.emit(contract, "EmergencyTriggered")
        .withArgs(oracle.address, destination.address, transferAmount, await time.latest() + 1);
    });

    it("5-3: reverts when destination is zero address", async function () {
      const { contract, oracle } = await deployFixture();
      await contract.connect(oracle).deposit({ value: ethers.parseEther("1.0") });
      await expect(
        contract.connect(oracle).emergencyTransfer(ethers.ZeroAddress, ethers.parseEther("0.5"))
      ).to.be.revertedWithCustomError(contract, "ZeroAddress");
    });

    it("5-4: reverts when amount exceeds balance", async function () {
      const { contract, oracle, destination } = await deployFixture();
      // No deposit → balance = 0
      await expect(
        contract.connect(oracle).emergencyTransfer(destination.address, ethers.parseEther("1.0"))
      ).to.be.revertedWithCustomError(contract, "InsufficientBalance");
    });

    it("5-5: reverts when amount is zero", async function () {
      const { contract, oracle, destination } = await deployFixture();
      await expect(
        contract.connect(oracle).emergencyTransfer(destination.address, 0n)
      ).to.be.revertedWithCustomError(contract, "ZeroAmount");
    });

    it("5-6: non-oracle cannot call emergencyTransfer", async function () {
      const { contract, stranger, destination } = await deployFixture();
      await expect(
        contract.connect(stranger).emergencyTransfer(destination.address, 1n)
      ).to.be.revertedWithCustomError(contract, "AccessControlUnauthorizedAccount");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 6. updateOracle()
  // ───────────────────────────────────────────────────────────────────────────
  describe("6. updateOracle()", function () {
    it("6-1: admin can update oracle to a new address", async function () {
      const { contract, admin, oracle, user, ORACLE_ROLE } = await deployFixture();
      await contract.connect(admin).updateOracle(oracle.address, user.address);
      expect(await contract.hasRole(ORACLE_ROLE, user.address)).to.be.true;
    });

    it("6-2: old oracle loses ORACLE_ROLE after update", async function () {
      const { contract, admin, oracle, user, ORACLE_ROLE } = await deployFixture();
      await contract.connect(admin).updateOracle(oracle.address, user.address);
      expect(await contract.hasRole(ORACLE_ROLE, oracle.address)).to.be.false;
    });

    it("6-3: updateOracle emits OracleUpdated event", async function () {
      const { contract, admin, oracle, user } = await deployFixture();
      await expect(contract.connect(admin).updateOracle(oracle.address, user.address))
        .to.emit(contract, "OracleUpdated")
        .withArgs(oracle.address, user.address, await time.latest() + 1);
    });

    it("6-4: non-admin cannot update oracle", async function () {
      const { contract, stranger, oracle, user } = await deployFixture();
      await expect(
        contract.connect(stranger).updateOracle(oracle.address, user.address)
      ).to.be.revertedWithCustomError(contract, "AccessControlUnauthorizedAccount");
    });

    it("6-5: reverts when newOracle is zero address", async function () {
      const { contract, admin, oracle } = await deployFixture();
      await expect(
        contract.connect(admin).updateOracle(oracle.address, ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(contract, "ZeroAddress");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 7. pause / unpause
  // ───────────────────────────────────────────────────────────────────────────
  describe("7. pause / unpause", function () {
    it("7-1: admin can pause the contract", async function () {
      const { contract, admin } = await deployFixture();
      await contract.connect(admin).pause();
      expect(await contract.paused()).to.be.true;
    });

    it("7-2: admin can unpause the contract", async function () {
      const { contract, admin } = await deployFixture();
      await contract.connect(admin).pause();
      await contract.connect(admin).unpause();
      expect(await contract.paused()).to.be.false;
    });

    it("7-3: lockLiquidity reverts when paused", async function () {
      const { contract, admin, oracle } = await deployFixture();
      await contract.connect(admin).pause();
      await expect(
        contract.connect(oracle).lockLiquidity(8000, 0, 9000, DUMMY_SIG)
      ).to.be.revertedWithCustomError(contract, "EnforcedPause");
    });

    it("7-4: rebalanceTreasury reverts when paused", async function () {
      const { contract, admin, oracle } = await deployFixture();
      await contract.connect(admin).pause();
      await expect(
        contract.connect(oracle).rebalanceTreasury(ethers.parseEther("1.0"))
      ).to.be.revertedWithCustomError(contract, "EnforcedPause");
    });

    it("7-5: non-admin cannot pause", async function () {
      const { contract, stranger } = await deployFixture();
      await expect(
        contract.connect(stranger).pause()
      ).to.be.revertedWithCustomError(contract, "AccessControlUnauthorizedAccount");
    });

    it("7-6: operations resume after unpause", async function () {
      const { contract, admin, oracle } = await deployFixture();
      await contract.connect(admin).pause();
      await contract.connect(admin).unpause();
      // Should succeed now
      await expect(
        contract.connect(oracle).lockLiquidity(8000, 0, 9000, DUMMY_SIG)
      ).to.not.be.reverted;
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 8. deposit()
  // ───────────────────────────────────────────────────────────────────────────
  describe("8. deposit()", function () {
    it("8-1: accepts ETH and updates balance", async function () {
      const { contract, user } = await deployFixture();
      const amount = ethers.parseEther("1.5");
      await contract.connect(user).deposit({ value: amount });
      expect(await contract.getContractBalance()).to.equal(amount);
    });

    it("8-2: deposit emits FundsDeposited event", async function () {
      const { contract, user } = await deployFixture();
      const amount = ethers.parseEther("0.25");
      await expect(contract.connect(user).deposit({ value: amount }))
        .to.emit(contract, "FundsDeposited")
        .withArgs(user.address, amount);
    });

    it("8-3: anyone can deposit (no role required)", async function () {
      const { contract, stranger } = await deployFixture();
      await expect(
        contract.connect(stranger).deposit({ value: ethers.parseEther("0.1") })
      ).to.not.be.reverted;
    });

    it("8-4: plain ETH send (receive()) is accepted", async function () {
      const { contract, user } = await deployFixture();
      const amount = ethers.parseEther("0.3");
      await user.sendTransaction({ to: await contract.getAddress(), value: amount });
      expect(await contract.getContractBalance()).to.equal(amount);
    });

    it("8-5: deposit reverts with zero value", async function () {
      const { contract, user } = await deployFixture();
      await expect(
        contract.connect(user).deposit({ value: 0n })
      ).to.be.revertedWithCustomError(contract, "ZeroAmount");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 9. Access Control — comprehensive role violation tests
  // ───────────────────────────────────────────────────────────────────────────
  describe("9. Access Control", function () {
    it("9-1: stranger cannot call lockLiquidity", async function () {
      const { contract, stranger } = await deployFixture();
      await expect(
        contract.connect(stranger).lockLiquidity(1, 1, 1, DUMMY_SIG)
      ).to.be.revertedWithCustomError(contract, "AccessControlUnauthorizedAccount");
    });

    it("9-2: stranger cannot call unlockLiquidity", async function () {
      const { contract, stranger } = await deployFixture();
      await expect(
        contract.connect(stranger).unlockLiquidity()
      ).to.be.revertedWithCustomError(contract, "AccessControlUnauthorizedAccount");
    });

    it("9-3: stranger cannot call rebalanceTreasury", async function () {
      const { contract, stranger } = await deployFixture();
      await expect(
        contract.connect(stranger).rebalanceTreasury(1n)
      ).to.be.revertedWithCustomError(contract, "AccessControlUnauthorizedAccount");
    });

    it("9-4: stranger cannot call emergencyTransfer", async function () {
      const { contract, stranger, destination } = await deployFixture();
      await expect(
        contract.connect(stranger).emergencyTransfer(destination.address, 1n)
      ).to.be.revertedWithCustomError(contract, "AccessControlUnauthorizedAccount");
    });

    it("9-5: stranger cannot call updateOracle", async function () {
      const { contract, stranger, oracle, user } = await deployFixture();
      await expect(
        contract.connect(stranger).updateOracle(oracle.address, user.address)
      ).to.be.revertedWithCustomError(contract, "AccessControlUnauthorizedAccount");
    });

    it("9-6: oracle cannot call pause (wrong role)", async function () {
      const { contract, oracle } = await deployFixture();
      await expect(
        contract.connect(oracle).pause()
      ).to.be.revertedWithCustomError(contract, "AccessControlUnauthorizedAccount");
    });

    it("9-7: oracle cannot call unpause (wrong role)", async function () {
      const { contract, admin, oracle } = await deployFixture();
      await contract.connect(admin).pause();
      await expect(
        contract.connect(oracle).unpause()
      ).to.be.revertedWithCustomError(contract, "AccessControlUnauthorizedAccount");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 10. getDecisionHistory()
  // ───────────────────────────────────────────────────────────────────────────
  describe("10. getDecisionHistory()", function () {
    it("10-1: returns empty array when no decisions made", async function () {
      const { contract } = await deployFixture();
      const history = await contract.getDecisionHistory();
      expect(history.length).to.equal(0);
    });

    it("10-2: records lockLiquidity decision correctly", async function () {
      const { contract, oracle } = await deployFixture();
      const riskScore = 8700n;
      const var95     = 250000n * 10n ** 18n;
      const confidence = 9200n;
      await contract.connect(oracle).lockLiquidity(riskScore, var95, confidence, DUMMY_SIG);
      const history = await contract.getDecisionHistory();
      expect(history.length).to.equal(1);
      expect(history[0].action).to.equal("LOCK_LIQUIDITY");
      expect(history[0].riskScore).to.equal(riskScore);
      expect(history[0].var95).to.equal(var95);
      expect(history[0].confidence).to.equal(confidence);
    });

    it("10-3: records multiple decisions in order", async function () {
      const { contract, oracle, admin } = await deployFixture();
      // Set delay to 0 for test speed
      await contract.connect(admin).setUnlockDelay(0);
      await contract.connect(oracle).lockLiquidity(8000, 0, 9000, DUMMY_SIG);
      await contract.connect(oracle).unlockLiquidity();
      await contract.connect(oracle).rebalanceTreasury(ethers.parseEther("1.0"));

      const history = await contract.getDecisionHistory();
      expect(history.length).to.equal(3);
      expect(history[0].action).to.equal("LOCK_LIQUIDITY");
      expect(history[1].action).to.equal("UNLOCK_LIQUIDITY");
      expect(history[2].action).to.equal("REBALANCE_TREASURY");
    });

    it("10-4: getDecisionCount matches history length", async function () {
      const { contract, oracle, admin } = await deployFixture();
      await contract.connect(admin).setUnlockDelay(0);
      await contract.connect(oracle).lockLiquidity(8000, 0, 9000, DUMMY_SIG);
      await contract.connect(oracle).unlockLiquidity();

      const history = await contract.getDecisionHistory();
      const count   = await contract.getDecisionCount();
      expect(count).to.equal(BigInt(history.length));
    });

    it("10-5: emergencyTransfer decision is recorded with correct action", async function () {
      const { contract, oracle, destination } = await deployFixture();
      await contract.connect(oracle).deposit({ value: ethers.parseEther("1.0") });
      await contract
        .connect(oracle)
        .emergencyTransfer(destination.address, ethers.parseEther("0.5"));

      const history = await contract.getDecisionHistory();
      expect(history.length).to.equal(1);
      expect(history[0].action).to.equal("EMERGENCY_TRANSFER");
    });
  });

});
