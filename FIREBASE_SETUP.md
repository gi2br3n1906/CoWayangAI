# Firebase Setup Guide

## Langkah-langkah Setup Firebase:

### 1. Buat Project Firebase
1. Kunjungi [Firebase Console](https://console.firebase.google.com/)
2. Klik "Add project" atau "Tambah project"
3. Masukkan nama project: "co-wayang-ai"
4. (Opsional) Enable Google Analytics
5. Klik "Create project"

### 2. Setup Web App
1. Di Firebase Console, klik icon Web (</>) untuk menambahkan app
2. Masukkan nickname: "Co-Wayang Frontend"
3. Checklist "Also set up Firebase Hosting" (opsional)
4. Klik "Register app"
5. Copy konfigurasi Firebase yang ditampilkan

### 3. Enable Authentication
1. Di sidebar kiri, klik "Authentication"
2. Klik "Get started"
3. Pilih tab "Sign-in method"
4. Enable metode yang diinginkan:
   - **Email/Password**: Klik, toggle enable, save
   - **Google**: Klik, toggle enable, pilih support email, save
   - **GitHub**: Klik, toggle enable, masukkan Client ID & Secret dari GitHub OAuth App, save

#### Setup GitHub OAuth (jika menggunakan GitHub login):
1. Buka [GitHub Developer Settings](https://github.com/settings/developers)
2. Klik "New OAuth App"
3. Isi form:
   - Application name: Co-Wayang AI
   - Homepage URL: `http://localhost:5173` (development)
   - Authorization callback URL: Copy dari Firebase (misal: `https://your-project.firebaseapp.com/__/auth/handler`)
4. Klik "Register application"
5. Copy Client ID dan generate Client Secret
6. Paste ke Firebase GitHub configuration

### 4. Setup Firestore Database
1. Di sidebar kiri, klik "Firestore Database"
2. Klik "Create database"
3. Pilih mode:
   - **Production mode**: Untuk production (rules ketat)
   - **Test mode**: Untuk development (rules terbuka, auto-expire 30 hari)
4. Pilih lokasi server (misal: asia-southeast1 untuk Singapore)
5. Klik "Enable"

### 5. Konfigurasi Frontend
1. Copy konfigurasi Firebase dari step 2
2. Buka file `frontend/.env`
3. Ganti semua value dengan kredensial Firebase Anda:

```env
VITE_FIREBASE_API_KEY=AIzaSy...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abc123
```

### 6. Test Authentication
1. Jalankan frontend: `npm run dev`
2. Klik tombol "Login"
3. Coba register user baru atau login dengan Google/GitHub
4. Check Firebase Console > Authentication > Users untuk melihat user yang berhasil login

## Firestore Security Rules (Production)

Untuk production, update Firestore rules di Firebase Console:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // User data: hanya user yang bersangkutan yang bisa read/write
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Analysis results: user hanya bisa read data miliknya
    match /analyses/{analysisId} {
      allow read: if request.auth != null && 
                     resource.data.userId == request.auth.uid;
      allow create: if request.auth != null &&
                       request.resource.data.userId == request.auth.uid;
    }
  }
}
```

## Struktur Database (Firestore Collections)

```
users/
  {userId}/
    - email: string
    - displayName: string
    - photoURL: string
    - createdAt: timestamp
    
analyses/
  {analysisId}/
    - userId: string
    - videoUrl: string
    - status: string (pending, processing, completed, failed)
    - characters: array
    - subtitles: array
    - createdAt: timestamp
    - updatedAt: timestamp
```

## Troubleshooting

### Error: "Firebase: Error (auth/configuration-not-found)"
- Pastikan semua environment variables di `.env` sudah diisi dengan benar
- Restart dev server setelah mengubah `.env`

### Error: "Firebase: Error (auth/unauthorized-domain)"
- Di Firebase Console > Authentication > Settings > Authorized domains
- Tambahkan `localhost` dan domain production Anda

### Error saat login dengan Google/GitHub
- Pastikan metode authentication sudah di-enable di Firebase Console
- Untuk GitHub, pastikan OAuth App sudah dikonfigurasi dengan benar
