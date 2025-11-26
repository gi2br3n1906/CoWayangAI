#!/bin/bash

# ===========================================
# CoWayangAI - Fresh Restart All Services
# ===========================================

echo "🔄 CoWayangAI Fresh Restart Script"
echo "=================================="

# Warna untuk output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Stop semua PM2 processes
echo -e "\n${YELLOW}⏹️  Stopping all PM2 processes...${NC}"
pm2 stop all

# Bersihkan temp files
echo -e "\n${YELLOW}🧹 Cleaning temp files...${NC}"
rm -f /tmp/wayang_chunk_*.mp4
rm -f /var/www/CoWayangAI/backend-ai/temp_audio_chunks/*.wav
echo "   Temp files cleaned!"

# Restart Node.js Backend (API Gateway)
echo -e "\n${YELLOW}🚀 Starting Node.js Backend...${NC}"
pm2 restart nodejs-api --update-env
sleep 2

# Restart Python AI Backend (Wayang Detection)
echo -e "\n${YELLOW}🤖 Starting AI Backend (Wayang Detection)...${NC}"
pm2 restart cowayang-ai-backend --update-env
sleep 2

# Restart ASR Server (Speech Recognition)
echo -e "\n${YELLOW}🎤 Starting ASR Server (Speech Recognition)...${NC}"
pm2 restart cowayang-ai-asr --update-env
sleep 2

# Save PM2 state
echo -e "\n${YELLOW}💾 Saving PM2 state...${NC}"
pm2 save

# Show status
echo -e "\n${GREEN}✅ All services restarted!${NC}"
echo -e "\n📊 Current PM2 Status:"
pm2 status

echo -e "\n${GREEN}=================================="
echo "🎭 CoWayangAI is ready!"
echo "==================================${NC}"
echo ""
echo "📝 Quick commands:"
echo "   pm2 logs              - View all logs"
echo "   pm2 logs nodejs-api   - View Node.js logs"
echo "   pm2 logs cowayang-ai-backend - View AI logs"
echo "   pm2 logs cowayang-ai-asr     - View ASR logs"
echo ""
