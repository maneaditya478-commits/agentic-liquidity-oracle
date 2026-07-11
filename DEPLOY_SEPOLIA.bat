@echo off
echo ===================================================
echo   Sepolia Smart Contract Deployment Helper
echo ===================================================
echo.

cd contracts

if not exist .env (
    echo [ERROR] .env file not found inside the 'contracts' directory!
    echo Please create 'contracts/.env' and define the following variables:
    echo   SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_API_KEY
    echo   DEPLOYER_PRIVATE_KEY=your_metamask_private_key
    echo   ORACLE_ADDRESS=your_oracle_agent_wallet_address
    echo.
    pause
    exit /b 1
)

echo Checking dependencies...
call npm install

echo Compiling smart contracts...
call npx hardhat compile

echo Deploying TreasuryGuard contract to Sepolia testnet...
call npx hardhat run scripts/deploy.js --network sepolia

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Contract deployment failed! Please verify your private key, RPC URL, and faucet balance.
    echo.
    pause
    exit /b 1
)

echo.
echo ===================================================
echo   Deployment Successful!
echo ===================================================
echo Next steps:
echo 1. Copy the deployed contract address printed above.
echo 2. Go to your Render/Railway backend environment settings.
echo 3. Update the CONTRACT_ADDRESS variable with the new address.
echo.
pause
