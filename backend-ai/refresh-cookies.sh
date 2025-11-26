#!/bin/bash

# ===========================================
# Script untuk Refresh YouTube Cookies
# ===========================================

COOKIES_FILE="/var/www/CoWayangAI/backend-ai/cookies.txt"
TEST_VIDEO="https://www.youtube.com/watch?v=dQw4w9WgXcQ"

echo "🍪 YouTube Cookies Refresher"
echo "============================"

# Backup cookies lama
if [ -f "$COOKIES_FILE" ]; then
    cp "$COOKIES_FILE" "${COOKIES_FILE}.backup"
    echo "📦 Backup cookies lama: ${COOKIES_FILE}.backup"
fi

# Cek apakah Chrome running (VNC harus aktif)
if ! pgrep -x "chrome" > /dev/null; then
    echo ""
    echo "⚠️  Chrome tidak terdeteksi!"
    echo ""
    echo "Langkah yang perlu dilakukan:"
    echo "1. Nyalakan VNC:  vncserver :1 -localhost no"
    echo "2. Konek ke VNC:  178.128.97.187:5901"
    echo "3. Buka Chrome dan LOGIN ke YouTube"
    echo "4. Jalankan script ini lagi"
    echo ""
    exit 1
fi

echo "🔄 Mengambil cookies dari Chrome..."

# Export cookies dari Chrome
yt-dlp --cookies-from-browser chrome --cookies "$COOKIES_FILE" --skip-download "$TEST_VIDEO" 2>&1

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Cookies berhasil di-refresh!"
    echo "📁 File: $COOKIES_FILE"
    echo ""
    
    # Test cookies
    echo "🧪 Testing cookies..."
    yt-dlp --cookies "$COOKIES_FILE" --skip-download -q "$TEST_VIDEO" 2>&1
    
    if [ $? -eq 0 ]; then
        echo "✅ Cookies valid!"
        echo ""
        echo "🔄 Restart backend..."
        pm2 restart cowayang-ai-backend
        echo ""
        echo "🎉 Selesai! Backend sudah pakai cookies baru."
    else
        echo "❌ Cookies masih bermasalah. Coba login ulang di YouTube."
    fi
else
    echo ""
    echo "❌ Gagal export cookies!"
    echo "Pastikan Chrome terbuka dan sudah login YouTube."
    
    # Restore backup
    if [ -f "${COOKIES_FILE}.backup" ]; then
        mv "${COOKIES_FILE}.backup" "$COOKIES_FILE"
        echo "📦 Cookies lama di-restore."
    fi
fi
