# Setup Firestore untuk History & Favorites

## Langkah 1: Aktifkan Firestore

1. Buka [Firebase Console](https://console.firebase.google.com/)
2. Pilih project **cowayangai**
3. Di sidebar kiri, klik **Build** → **Firestore Database**
4. Klik **Create database**
5. Pilih **Start in production mode** atau **Start in test mode** (untuk development)
6. Pilih region: **asia-southeast1** (Singapore) atau **asia-southeast2** (Jakarta)
7. Klik **Enable**

## Langkah 2: Set Security Rules

Setelah Firestore aktif, klik tab **Rules** dan paste rules berikut:

```javascript
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    
    // Users collection - user hanya bisa akses data sendiri
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
      
      // Watch History subcollection
      match /watchHistory/{historyId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
      
      // Favorites subcollection  
      match /favorites/{favoriteId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
    }
    
  }
}
```

Klik **Publish** untuk menyimpan rules.

## Langkah 3: Test

1. Login ke aplikasi Co-Wayang AI
2. Putar video YouTube
3. Klik tombol ⭐ untuk tambah favorit
4. Buka **Profil** → tab **Riwayat** dan **Favorit**
5. Data seharusnya muncul

## Struktur Data di Firestore

```
users/
  └── {userId}/
      ├── watchHistory/
      │   └── {historyId}/
      │       ├── videoId: "abc123"
      │       ├── videoUrl: "https://youtube.com/watch?v=abc123"
      │       ├── title: "Wayang Kulit..."
      │       ├── thumbnail: "https://img.youtube.com/..."
      │       └── watchedAt: "2025-11-26T..."
      │
      └── favorites/
          └── {favoriteId}/
              ├── videoId: "abc123"
              ├── videoUrl: "https://youtube.com/watch?v=abc123"
              ├── title: "Wayang Kulit..."
              ├── thumbnail: "https://img.youtube.com/..."
              └── addedAt: "2025-11-26T..."
```

## Troubleshooting

### Error: "Missing or insufficient permissions"
- Pastikan Firestore rules sudah di-publish
- Pastikan user sudah login sebelum menyimpan

### Data tidak muncul
- Buka Browser DevTools → Console, cek apakah ada error
- Pastikan user sudah login (cek di Navbar ada avatar/nama)

### Firestore masih loading
- Tunggu 1-2 menit setelah enable Firestore
- Refresh halaman dan coba lagi
