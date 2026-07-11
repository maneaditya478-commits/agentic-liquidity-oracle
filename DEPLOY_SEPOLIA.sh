#!/bin/bash

# Exit on error
set -e

echo "==================================================="
echo "  Sepolia Smart Contract Deployment Helper"
echo "==================================================="
echo ""

cd contracts

if [ ! -f .env ]; then
    echo "[ERROR] .env file not found inside the 'contracts' directory!"
    echo "Please create 'contracts/.env' and define the following variables:"
    echo "  SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_API_KEY"
    echo "  DEPLOYER_PRIVATE_KEY=your_metamask_private_key"
    echo "  ORACLE_ADDRESS=your_oracle_agent_wallet_address"
    echo ""
    exit 1
fi

echo "Checking dependencies..."
npm install

echo "Compiling smart contracts..."
npx hardhat compile

echo "Deploying TreasuryGuard contract to Sepolia testnet..."
npx hardhat run scripts/deploy.js --network sepolia

echo ""
echo "==================================================="
echo "  Deployment Successful!"
echo "==================================================="
echo "Next steps:"
echo "1. Copy the deployed contract address printed above."
echo "2. Go to your Render/Railway backend environment settings."
echo "3. Update the CONTRACT_ADDRESS variable with the new address."
echo ""
