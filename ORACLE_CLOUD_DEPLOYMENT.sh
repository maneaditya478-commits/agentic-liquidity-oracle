#!/bin/bash

# Oracle Cloud Free Tier Deployment Guide
# Deploy agentic-liquidity-oracle with Docker Compose

echo "=== Oracle Cloud VM Setup ==="

# Step 1: Update system and install Docker
echo "Step 1: Installing Docker..."
sudo apt update
sudo apt install -y docker.io docker-compose git

# Add current user to docker group (avoid sudo)
sudo usermod -aG docker $USER
newgrp docker

# Step 2: Clone the repository
echo "Step 2: Cloning repository..."
cd /home/ubuntu
git clone https://github.com/maneaditya478-commits/agentic-liquidity-oracle.git
cd agentic-liquidity-oracle

# Step 3: Set up environment variables
echo "Step 3: Configuring environment..."
cp .env.example .env

# Step 4: Start Docker Compose
echo "Step 4: Starting services with Docker Compose..."
docker compose up -d

# Step 5: Wait for services to be healthy
echo "Step 5: Waiting for services to initialize..."
sleep 10

# Step 6: Check status
echo "Step 6: Service Status:"
docker compose ps

# Step 7: Get public IP and show access URLs
PUBLIC_IP=$(curl -s http://169.254.169.254/opc/v1/instance/primaryVnic/publicIp/)
echo ""
echo "=== Deployment Complete ==="
echo "Your services are now running:"
echo "Frontend: http://$PUBLIC_IP:3000"
echo "Backend API: http://$PUBLIC_IP:8000"
echo "EVM Node: http://$PUBLIC_IP:8545"
echo "PostgreSQL: $PUBLIC_IP:5432"
echo ""
echo "View logs: docker compose logs -f"
echo "Stop services: docker compose down"
