import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  GithubAuthProvider,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail
} from 'firebase/auth'
import { auth, db } from '@/firebase'
import { doc, setDoc, getDoc, collection, addDoc, serverTimestamp, query, where, getDocs, deleteDoc } from 'firebase/firestore'

export const useAuthStore = defineStore('auth', () => {
  const user = ref(null)
  const loading = ref(true)
  const error = ref(null)

  const isAuthenticated = computed(() => !!user.value)

  // Initialize auth state listener
  const initAuth = () => {
    onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        user.value = {
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName,
          photoURL: firebaseUser.photoURL
        }
      } else {
        user.value = null
      }
      loading.value = false
    })
  }

  // Email/Password Login
  const loginWithEmail = async (email, password) => {
    try {
      error.value = null
      loading.value = true
      const userCredential = await signInWithEmailAndPassword(auth, email, password)
      user.value = {
        uid: userCredential.user.uid,
        email: userCredential.user.email,
        displayName: userCredential.user.displayName,
        photoURL: userCredential.user.photoURL
      }
      return { success: true }
    } catch (err) {
      error.value = err.message
      return { success: false, error: err.message }
    } finally {
      loading.value = false
    }
  }

  // Email/Password Register
  const registerWithEmail = async (email, password) => {
    try {
      error.value = null
      loading.value = true
      const userCredential = await createUserWithEmailAndPassword(auth, email, password)
      user.value = {
        uid: userCredential.user.uid,
        email: userCredential.user.email,
        displayName: userCredential.user.displayName,
        photoURL: userCredential.user.photoURL
      }
      return { success: true }
    } catch (err) {
      error.value = err.message
      return { success: false, error: err.message }
    } finally {
      loading.value = false
    }
  }

  // Google Login
  const loginWithGoogle = async () => {
    try {
      error.value = null
      loading.value = true
      const provider = new GoogleAuthProvider()
      const userCredential = await signInWithPopup(auth, provider)
      user.value = {
        uid: userCredential.user.uid,
        email: userCredential.user.email,
        displayName: userCredential.user.displayName,
        photoURL: userCredential.user.photoURL
      }
      return { success: true }
    } catch (err) {
      error.value = err.message
      return { success: false, error: err.message }
    } finally {
      loading.value = false
    }
  }

  // GitHub Login
  const loginWithGithub = async () => {
    try {
      error.value = null
      loading.value = true
      const provider = new GithubAuthProvider()
      const userCredential = await signInWithPopup(auth, provider)
      user.value = {
        uid: userCredential.user.uid,
        email: userCredential.user.email,
        displayName: userCredential.user.displayName,
        photoURL: userCredential.user.photoURL
      }
      return { success: true }
    } catch (err) {
      error.value = err.message
      return { success: false, error: err.message }
    } finally {
      loading.value = false
    }
  }

  // Logout
  const logout = async () => {
    try {
      await signOut(auth)
      user.value = null
      return { success: true }
    } catch (err) {
      error.value = err.message
      return { success: false, error: err.message }
    }
  }

  // Password Reset
  const resetPassword = async (email) => {
    try {
      error.value = null
      await sendPasswordResetEmail(auth, email)
      return { success: true }
    } catch (err) {
      error.value = err.message
      return { success: false, error: err.message }
    }
  }

  // Add to Watch History
  const addToWatchHistory = async (videoData) => {
    if (!user.value?.uid) {
      console.log('[Auth] addToWatchHistory: User not authenticated')
      return { success: false, error: 'Not authenticated' }
    }
    
    console.log('[Auth] addToWatchHistory: Saving...', videoData)
    
    try {
      const historyRef = collection(db, 'users', user.value.uid, 'watchHistory')
      
      // Check if already exists
      const q = query(historyRef, where('videoId', '==', videoData.videoId))
      const existing = await getDocs(q)
      
      if (!existing.empty) {
        // Update existing entry
        console.log('[Auth] addToWatchHistory: Updating existing entry')
        const docRef = doc(db, 'users', user.value.uid, 'watchHistory', existing.docs[0].id)
        await setDoc(docRef, {
          ...videoData,
          watchedAt: new Date().toISOString()
        }, { merge: true })
      } else {
        // Add new entry
        console.log('[Auth] addToWatchHistory: Adding new entry')
        await addDoc(historyRef, {
          ...videoData,
          watchedAt: new Date().toISOString()
        })
      }
      
      console.log('[Auth] addToWatchHistory: Success!')
      return { success: true }
    } catch (err) {
      console.error('[Auth] addToWatchHistory: Error:', err)
      return { success: false, error: err.message }
    }
  }

  // Add to Favorites
  const addToFavorites = async (videoData) => {
    if (!user.value?.uid) {
      console.log('[Auth] addToFavorites: User not authenticated')
      return { success: false, error: 'Not authenticated' }
    }
    
    console.log('[Auth] addToFavorites: Saving...', videoData)
    
    try {
      const favRef = collection(db, 'users', user.value.uid, 'favorites')
      
      // Check if already exists
      const q = query(favRef, where('videoId', '==', videoData.videoId))
      const existing = await getDocs(q)
      
      if (!existing.empty) {
        console.log('[Auth] addToFavorites: Already exists')
        return { success: false, error: 'Already in favorites' }
      }
      
      await addDoc(favRef, {
        ...videoData,
        addedAt: new Date().toISOString()
      })
      
      console.log('[Auth] addToFavorites: Success!')
      return { success: true }
    } catch (err) {
      console.error('[Auth] addToFavorites: Error:', err)
      return { success: false, error: err.message }
    }
  }

  // Remove from Favorites
  const removeFromFavorites = async (videoId) => {
    if (!user.value?.uid) return { success: false, error: 'Not authenticated' }
    
    try {
      const favRef = collection(db, 'users', user.value.uid, 'favorites')
      const q = query(favRef, where('videoId', '==', videoId))
      const existing = await getDocs(q)
      
      if (!existing.empty) {
        await deleteDoc(doc(db, 'users', user.value.uid, 'favorites', existing.docs[0].id))
      }
      
      return { success: true }
    } catch (err) {
      console.error('Error removing from favorites:', err)
      return { success: false, error: err.message }
    }
  }

  // Check if video is favorite
  const isFavorite = async (videoId) => {
    if (!user.value?.uid) return false
    
    try {
      const favRef = collection(db, 'users', user.value.uid, 'favorites')
      const q = query(favRef, where('videoId', '==', videoId))
      const existing = await getDocs(q)
      return !existing.empty
    } catch (err) {
      console.error('Error checking favorite:', err)
      return false
    }
  }

  return {
    user,
    loading,
    error,
    isAuthenticated,
    initAuth,
    loginWithEmail,
    registerWithEmail,
    loginWithGoogle,
    loginWithGithub,
    logout,
    resetPassword,
    addToWatchHistory,
    addToFavorites,
    removeFromFavorites,
    isFavorite
  }
})
