# 🎭 CoWayang AI - Demo Guide untuk Juri

## 📋 Persiapan Sebelum Demo

### 1. Refresh Cookies (Sehari sebelum demo)
```bash
# Export cookies baru dari browser (Chrome/Firefox):
# 1. Install extension: "Get cookies.txt LOCALLY"
# 2. Buka YouTube (pastikan login)
# 3. Export cookies.txt
# 4. Upload ke server:
scp cookies.txt root@YOUR_SERVER:/var/www/CoWayangAI/backend-ai/cookies.txt
```

### 2. Test Koneksi (30 menit sebelum demo)
```bash
cd /var/www/CoWayangAI/backend-ai
./demo-prep.sh
```

Kalau ada yang **❌ Stream failed**, refresh cookies lagi!

### 3. Restart Services
```bash
pm2 restart all
pm2 logs  # Check semua services running
```

---

## 🚀 Saat Demo

### Kalau YouTube Error "Sign in to confirm":
**Jangan panik!** System punya **3x retry otomatis** dengan exponential backoff.

### Kalau masih gagal setelah retry:
1. **Quick fix**: Restart backend
   ```bash
   pm2 restart cowayang-ai-backend
   ```

2. **Alternatif**: Pakai video lain yang sudah di-prep

---

## 💡 Tips Demo

1. **Jangan spam request** - Kasih jeda 5-10 detik antar request
2. **Prep 2-3 video berbeda** - Kalau 1 blocked, switch ke video lain
3. **Test 1 jam sebelum** - Pastikan cookies masih valid
4. **Keep browser YouTube open** - Login di tab lain selama demo

---

## 🔧 Troubleshooting Cepat

| Problem | Solution |
|---------|----------|
| Bot detection error | Run `./demo-prep.sh` lagi |
| Cookies expired | Export fresh cookies dari browser |
| Stream URL null | Check internet & restart backend |
| AI tidak detect | Check Roboflow API key di `.env` |

---

## 📊 Fitur yang Sudah Implemented

✅ Multi-format fallback (480p/720p/best)  
✅ Automatic retry (3x dengan backoff)  
✅ Cookie authentication  
✅ Android player client (bypass restriction)  
✅ Real-time AI detection (Roboflow)  
✅ Video seeking (jump ke timestamp)  

---

**Good luck dengan demo! 🎉**
