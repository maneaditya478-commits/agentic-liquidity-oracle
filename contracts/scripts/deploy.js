// scripts/deploy.js
// Deploy TreasuryGuard, fund it, and persist the address for the backend.

const hre = require("hardhat");
const fs  = require("fs");
const path = require("path");

async function main() {
  const signers = await hre.ethers.getSigners();
  const deployer = signers[0];

  let oracleAddress = process.env.ORACLE_ADDRESS;
  if (!oracleAddress) {
    if (signers.length > 1) {
      oracleAddress = signers[1].address;
    } else {
      throw new Error("ORACLE_ADDRESS environment variable is required for single-signer networks (e.g. Sepolia)");
    }
  }

  let userAddress = "N/A";
  if (signers.length > 2) {
    userAddress = signers[2].address;
  }

  console.log("═══════════════════════════════════════════════════════");
  console.log("  TreasuryGuard — Deployment Script");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  Network  : ${hre.network.name}`);
  console.log(`  Deployer : ${deployer.address}`);
  console.log(`  Oracle   : ${oracleAddress}`);
  console.log(`  User     : ${userAddress}`);

  const deployerBalance = await hre.ethers.provider.getBalance(deployer.address);
  console.log(`  Balance  : ${hre.ethers.formatEther(deployerBalance)} ETH`);
  console.log("───────────────────────────────────────────────────────");

  // ── Deploy ──────────────────────────────────────────────────────────────
  console.log("\n▶  Deploying TreasuryGuard…");
  const TreasuryGuard = await hre.ethers.getContractFactory("TreasuryGuard");
  const treasuryGuard = await TreasuryGuard.deploy(deployer.address, oracleAddress);
  await treasuryGuard.waitForDeployment();

  const contractAddress = await treasuryGuard.getAddress();
  console.log(`✔  TreasuryGuard deployed at: ${contractAddress}`);

  // ── Verify roles ─────────────────────────────────────────────────────────
  const ADMIN_ROLE   = await treasuryGuard.ADMIN_ROLE();
  const ORACLE_ROLE  = await treasuryGuard.ORACLE_ROLE();
  const DEFAULT_ROLE = await treasuryGuard.DEFAULT_ADMIN_ROLE();

  const deployerHasAdmin   = await treasuryGuard.hasRole(ADMIN_ROLE,   deployer.address);
  const deployerHasDefault = await treasuryGuard.hasRole(DEFAULT_ROLE, deployer.address);
  const oracleHasOracle    = await treasuryGuard.hasRole(ORACLE_ROLE,  oracleAddress);

  console.log("\n  Role verification:");
  console.log(`  ✔ deployer has ADMIN_ROLE          : ${deployerHasAdmin}`);
  console.log(`  ✔ deployer has DEFAULT_ADMIN_ROLE  : ${deployerHasDefault}`);
  console.log(`  ✔ oracle   has ORACLE_ROLE         : ${oracleHasOracle}`);

  if (!deployerHasAdmin || !oracleHasOracle) {
    throw new Error("Role verification failed — aborting");
  }

  // ── Deposit 1 ETH ────────────────────────────────────────────────────────
  console.log("\n▶  Depositing 1 ETH into contract…");
  const depositAmount = hre.ethers.parseEther("1.0");
  const depositTx = await treasuryGuard.connect(deployer).deposit({ value: depositAmount });
  await depositTx.wait();

  const contractBalance = await treasuryGuard.getContractBalance();
  console.log(`✔  Contract balance: ${hre.ethers.formatEther(contractBalance)} ETH`);

  // ── Verify initial state ──────────────────────────────────────────────────
  const isLocked    = await treasuryGuard.isLocked();
  const actionCount = await treasuryGuard.actionCount();
  console.log(`\n  Initial state:`);
  console.log(`  ✔ isLocked    : ${isLocked}`);
  console.log(`  ✔ actionCount : ${actionCount}`);

  // ── Persist address for backend ───────────────────────────────────────────
  const backendDir  = path.resolve(__dirname, "../../backend");
  const addressFile = path.join(backendDir, ".contract_address");

  try {
    if (!fs.existsSync(backendDir)) {
      fs.mkdirSync(backendDir, { recursive: true });
      console.log(`\n  Created backend directory: ${backendDir}`);
    }
    fs.writeFileSync(addressFile, contractAddress, "utf8");
    console.log(`\n✔  Contract address written to: ${addressFile}`);
  } catch (err) {
    console.warn(`\n⚠  Could not write address file: ${err.message}`);
    console.warn(`   Address was: ${contractAddress}`);
  }

  // ── Print deployment summary ──────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════════════════");
  console.log("  DEPLOYMENT SUMMARY");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  Contract : TreasuryGuard`);
  console.log(`  Address  : ${contractAddress}`);
  console.log(`  Network  : ${hre.network.name} (chainId ${(await hre.ethers.provider.getNetwork()).chainId})`);
  console.log(`  Admin    : ${deployer.address}`);
  console.log(`  Oracle   : ${oracleAddress}`);
  console.log(`  Balance  : ${hre.ethers.formatEther(contractBalance)} ETH`);
  console.log("═══════════════════════════════════════════════════════\n");

  // ── Print ABI for reference ───────────────────────────────────────────────
  const artifact = await hre.artifacts.readArtifact("TreasuryGuard");
  console.log("  ABI (JSON):");
  console.log(JSON.stringify(artifact.abi, null, 2));

  return contractAddress;
}

main()
  .then((addr) => {
    console.log(`\nDeployment complete ✔  (${addr})`);
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n✘ Deployment failed:", error);
    process.exit(1);
  });
