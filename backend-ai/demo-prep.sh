#!/bin/bash
# Demo preparation script
# Run this BEFORE demo to prepare stable streams

echo "🎬 Preparing Demo - Pre-warming streams..."

# List of demo videos
DEMO_VIDEOS=(
    "https://www.youtube.com/watch?v=PNEzt9fZniU"
)

COOKIE_FILE="/var/www/CoWayangAI/backend-ai/cookies.txt"

for video in "${DEMO_VIDEOS[@]}"; do
    echo "📥 Testing stream: $video"
    yt-dlp --cookies "$COOKIE_FILE" \
           --format "best[height<=480]" \
           --get-url \
           "$video" > /dev/null 2>&1
    
    if [ $? -eq 0 ]; then
        echo "   ✅ Stream ready"
    else
        echo "   ❌ Stream failed - refresh cookies!"
    fi
    sleep 2
done

echo "✨ Demo prep complete!"
