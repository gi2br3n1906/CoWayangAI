#!/bin/bash

# ===========================================
# CoWayangAI - Comprehensive Installation Script
# ===========================================
# This script will install and configure all components of CoWayangAI:
# - Node.js Backend (API Gateway)
# - Python AI Backend (Wayang Detection)
# - Python ASR Server (Speech Recognition)
# - Vue.js Frontend

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo -e "${BLUE}"
echo "╔════════════════════════════════════════════════════════════╗"
echo "║         🎭 CoWayangAI Installation Script 🎭              ║"
echo "║                                                            ║"
echo "║  This script will install and configure:                  ║"
echo "║  • Node.js Backend (API Gateway)                          ║"
echo "║  • Python AI Backend (Wayang Detection)                   ║"
echo "║  • Python ASR Server (Speech Recognition)                 ║"
echo "║  • Vue.js Frontend                                        ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# ===========================================
# STEP 1: System Dependencies Check
# ===========================================
echo -e "\n${YELLOW}📋 Step 1: Checking System Dependencies...${NC}\n"

# Check Node.js
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    echo -e "${GREEN}✓${NC} Node.js installed: $NODE_VERSION"
else
    echo -e "${RED}✗${NC} Node.js not found!"
    echo "  Please install Node.js 20.x or 22.x from: https://nodejs.org/"
    exit 1
fi

# Check npm
if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm --version)
    echo -e "${GREEN}✓${NC} npm installed: $NPM_VERSION"
else
    echo -e "${RED}✗${NC} npm not found!"
    exit 1
fi

# Check Python
if command -v python3 &> /dev/null; then
    PYTHON_VERSION=$(python3 --version)
    echo -e "${GREEN}✓${NC} Python installed: $PYTHON_VERSION"
else
    echo -e "${RED}✗${NC} Python3 not found!"
    echo "  Please install Python 3.8+ from: https://www.python.org/"
    exit 1
fi

# Check pip
if command -v pip3 &> /dev/null; then
    PIP_VERSION=$(pip3 --version)
    echo -e "${GREEN}✓${NC} pip3 installed"
else
    echo -e "${RED}✗${NC} pip3 not found!"
    exit 1
fi

# Check PM2
if command -v pm2 &> /dev/null; then
    PM2_VERSION=$(pm2 --version)
    echo -e "${GREEN}✓${NC} PM2 installed: $PM2_VERSION"
else
    echo -e "${YELLOW}⚠${NC}  PM2 not found. Installing PM2 globally..."
    npm install -g pm2
    echo -e "${GREEN}✓${NC} PM2 installed successfully"
fi

# Check yt-dlp
if command -v yt-dlp &> /dev/null; then
    YTDLP_VERSION=$(yt-dlp --version)
    echo -e "${GREEN}✓${NC} yt-dlp installed: $YTDLP_VERSION"
else
    echo -e "${YELLOW}⚠${NC}  yt-dlp not found. Installing yt-dlp..."
    if command -v apt-get &> /dev/null; then
        sudo apt-get update && sudo apt-get install -y yt-dlp
    elif command -v brew &> /dev/null; then
        brew install yt-dlp
    else
        pip3 install yt-dlp
    fi
    echo -e "${GREEN}✓${NC} yt-dlp installed successfully"
fi

# ===========================================
# STEP 2: Environment Configuration
# ===========================================
echo -e "\n${YELLOW}🔧 Step 2: Environment Configuration...${NC}\n"

# Function to prompt for input with default value
prompt_input() {
    local prompt="$1"
    local default="$2"
    local value
    
    if [ -n "$default" ]; then
        read -p "$prompt [$default]: " value
        echo "${value:-$default}"
    else
        read -p "$prompt: " value
        echo "$value"
    fi
}

# Function to prompt for password (hidden input)
prompt_password() {
    local prompt="$1"
    local value
    read -sp "$prompt: " value
    echo ""
    echo "$value"
}

echo "Please provide the following configuration values:"
echo "(Press Enter to use default values where shown)"
echo ""

# Backend Configuration
echo -e "${BLUE}--- Node.js Backend Configuration ---${NC}"
BACKEND_PORT=$(prompt_input "Backend API Port" "3000")
NODEJS_WEBHOOK_URL="http://localhost:${BACKEND_PORT}/api/webhook"

# AI Backend Configuration
echo -e "\n${BLUE}--- AI Backend Configuration ---${NC}"
AI_BACKEND_PORT=$(prompt_input "AI Backend Port" "8000")
ROBOFLOW_API_KEY=$(prompt_input "Roboflow API Key (optional, press Enter to use default)" "nxnWGYVSmEqBIjegHsVj")
GEMINI_API_KEY=$(prompt_password "Gemini API Key")
GEMINI_API_URL=$(prompt_input "Gemini API URL" "https://generativelanguage.googleapis.com/v1beta/models")
GEMINI_MODEL=$(prompt_input "Gemini Model" "gemini-1.5-flash-latest")

# ASR Configuration
echo -e "\n${BLUE}--- ASR Server Configuration ---${NC}"
ASR_PORT=$(prompt_input "ASR Server Port" "8001")

# Frontend Configuration
echo -e "\n${BLUE}--- Frontend Configuration ---${NC}"
FRONTEND_PORT=$(prompt_input "Frontend Dev Server Port" "5173")

echo -e "\n${BLUE}--- Firebase Configuration ---${NC}"
echo "Please provide your Firebase credentials:"
FIREBASE_API_KEY=$(prompt_password "Firebase API Key")
FIREBASE_AUTH_DOMAIN=$(prompt_input "Firebase Auth Domain" "your-project.firebaseapp.com")
FIREBASE_PROJECT_ID=$(prompt_input "Firebase Project ID")
FIREBASE_STORAGE_BUCKET=$(prompt_input "Firebase Storage Bucket" "${FIREBASE_PROJECT_ID}.appspot.com")
FIREBASE_MESSAGING_SENDER_ID=$(prompt_input "Firebase Messaging Sender ID")
FIREBASE_APP_ID=$(prompt_input "Firebase App ID")

# ===========================================
# STEP 3: Create Environment Files
# ===========================================
echo -e "\n${YELLOW}📝 Step 3: Creating Environment Files...${NC}\n"

# Backend .env
cat > "$SCRIPT_DIR/backend/.env" << EOF
PORT=${BACKEND_PORT}
AI_API_URL=http://localhost:${AI_BACKEND_PORT}/start-analysis
ASR_API_URL=http://localhost:${ASR_PORT}/start-asr
WEBHOOK_URL=http://localhost:${BACKEND_PORT}/api/webhook
EOF
echo -e "${GREEN}✓${NC} Created backend/.env"

# Backend-AI .env
cat > "$SCRIPT_DIR/backend-ai/.env" << EOF
ROBOFLOW_API_KEY=${ROBOFLOW_API_KEY}
GEMINI_API_KEY=${GEMINI_API_KEY}
GEMINI_API_URL=${GEMINI_API_URL}
GEMINI_MODEL=${GEMINI_MODEL}
NODEJS_WEBHOOK_URL=${NODEJS_WEBHOOK_URL}
PORT=${AI_BACKEND_PORT}
EOF
echo -e "${GREEN}✓${NC} Created backend-ai/.env"

# Frontend .env
cat > "$SCRIPT_DIR/frontend/.env" << EOF
VITE_FIREBASE_API_KEY=${FIREBASE_API_KEY}
VITE_FIREBASE_AUTH_DOMAIN=${FIREBASE_AUTH_DOMAIN}
VITE_FIREBASE_PROJECT_ID=${FIREBASE_PROJECT_ID}
VITE_FIREBASE_STORAGE_BUCKET=${FIREBASE_STORAGE_BUCKET}
VITE_FIREBASE_MESSAGING_SENDER_ID=${FIREBASE_MESSAGING_SENDER_ID}
VITE_FIREBASE_APP_ID=${FIREBASE_APP_ID}
VITE_API_URL=http://localhost:${BACKEND_PORT}
EOF
echo -e "${GREEN}✓${NC} Created frontend/.env"

# ===========================================
# STEP 4: Install Dependencies
# ===========================================
echo -e "\n${YELLOW}📦 Step 4: Installing Dependencies...${NC}\n"

# Backend dependencies
echo -e "${BLUE}Installing Node.js Backend dependencies...${NC}"
cd "$SCRIPT_DIR/backend"
npm install
echo -e "${GREEN}✓${NC} Backend dependencies installed"

# Frontend dependencies
echo -e "\n${BLUE}Installing Frontend dependencies...${NC}"
cd "$SCRIPT_DIR/frontend"
npm install
echo -e "${GREEN}✓${NC} Frontend dependencies installed"

# Python AI Backend dependencies
echo -e "\n${BLUE}Installing Python AI Backend dependencies...${NC}"
cd "$SCRIPT_DIR/backend-ai"

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo "Creating Python virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment and install dependencies
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
echo -e "${GREEN}✓${NC} Python dependencies installed"

# Install transformers for ASR
echo -e "\n${BLUE}Installing additional ASR dependencies...${NC}"
pip install transformers
echo -e "${GREEN}✓${NC} ASR dependencies installed"

deactivate

# ===========================================
# STEP 5: Create PM2 Ecosystem File
# ===========================================
echo -e "\n${YELLOW}⚙️  Step 5: Creating PM2 Configuration...${NC}\n"

cd "$SCRIPT_DIR"
cat > "ecosystem.config.js" << 'EOF'
module.exports = {
  apps: [
    {
      name: 'nodejs-api',
      script: './backend/index.js',
      cwd: './backend',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production'
      },
      error_file: './logs/nodejs-api-error.log',
      out_file: './logs/nodejs-api-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    },
    {
      name: 'cowayang-ai-backend',
      script: './backend-ai/venv/bin/python',
      args: 'main.py',
      cwd: './backend-ai',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '2G',
      interpreter: 'none',
      error_file: './logs/ai-backend-error.log',
      out_file: './logs/ai-backend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    },
    {
      name: 'cowayang-ai-asr',
      script: './backend-ai/venv/bin/python',
      args: 'asr_server.py',
      cwd: './backend-ai',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '2G',
      interpreter: 'none',
      error_file: './logs/asr-server-error.log',
      out_file: './logs/asr-server-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    }
  ]
};
EOF
echo -e "${GREEN}✓${NC} Created ecosystem.config.js"

# Create logs directory
mkdir -p logs
echo -e "${GREEN}✓${NC} Created logs directory"

# ===========================================
# STEP 6: Start Services
# ===========================================
echo -e "\n${YELLOW}🚀 Step 6: Starting Services with PM2...${NC}\n"

# Stop any existing PM2 processes
pm2 delete all 2>/dev/null || true

# Start services using ecosystem file
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Setup PM2 startup script
echo -e "\n${BLUE}Setting up PM2 to start on system boot...${NC}"
pm2 startup | tail -n 1 | bash || echo -e "${YELLOW}⚠${NC}  Could not setup PM2 startup (may require sudo)"

echo -e "\n${GREEN}✓${NC} All backend services started with PM2"

# ===========================================
# STEP 7: Health Check
# ===========================================
echo -e "\n${YELLOW}🏥 Step 7: Running Health Checks...${NC}\n"

sleep 5  # Wait for services to start

# Check Node.js Backend
echo -n "Checking Node.js Backend... "
if curl -s http://localhost:${BACKEND_PORT}/api/health > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Running${NC}"
else
    echo -e "${RED}✗ Not responding${NC}"
fi

# Check AI Backend
echo -n "Checking AI Backend... "
if curl -s http://localhost:${AI_BACKEND_PORT}/ > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Running${NC}"
else
    echo -e "${RED}✗ Not responding${NC}"
fi

# Check ASR Server
echo -n "Checking ASR Server... "
if curl -s http://localhost:${ASR_PORT}/ > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Running${NC}"
else
    echo -e "${RED}✗ Not responding${NC}"
fi

# ===========================================
# STEP 8: Frontend Development Server
# ===========================================
echo -e "\n${YELLOW}💡 Step 8: Frontend Development Server${NC}\n"

echo "The backend services are now running with PM2."
echo "To start the frontend development server, run:"
echo ""
echo -e "  ${BLUE}cd frontend && npm run dev${NC}"
echo ""
echo "The frontend will be available at: http://localhost:${FRONTEND_PORT}"

# ===========================================
# Installation Complete
# ===========================================
echo -e "\n${GREEN}"
echo "╔════════════════════════════════════════════════════════════╗"
echo "║                  ✅ Installation Complete! ✅              ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

echo -e "\n${BLUE}📊 Service Status:${NC}"
pm2 status

echo -e "\n${BLUE}📝 Useful Commands:${NC}"
echo "  pm2 status              - View all services status"
echo "  pm2 logs                - View all logs"
echo "  pm2 logs nodejs-api     - View Node.js backend logs"
echo "  pm2 logs cowayang-ai-backend - View AI backend logs"
echo "  pm2 logs cowayang-ai-asr     - View ASR server logs"
echo "  pm2 restart all         - Restart all services"
echo "  pm2 stop all            - Stop all services"
echo ""
echo "  bash restart-all.sh     - Clean restart all services"
echo ""

echo -e "${BLUE}🌐 Service URLs:${NC}"
echo "  Node.js Backend: http://localhost:${BACKEND_PORT}"
echo "  AI Backend:      http://localhost:${AI_BACKEND_PORT}"
echo "  ASR Server:      http://localhost:${ASR_PORT}"
echo "  Frontend:        http://localhost:${FRONTEND_PORT} (after running 'npm run dev')"
echo ""

echo -e "${YELLOW}⚠️  Important Notes:${NC}"
echo "  1. Make sure to refresh YouTube cookies if needed:"
echo "     bash backend-ai/refresh-cookies.sh"
echo ""
echo "  2. All environment files (.env) contain sensitive data."
echo "     Do NOT commit them to git!"
echo ""
echo "  3. For production deployment, build the frontend:"
echo "     cd frontend && npm run build"
echo ""

echo -e "${GREEN}🎉 Happy coding! 🎭${NC}\n"
