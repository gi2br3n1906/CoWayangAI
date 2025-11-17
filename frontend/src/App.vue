<script setup>
import { ref } from 'vue'
import Navbar from './components/Navbar.vue'
import LoginModal from './components/LoginModal.vue'

const isLoginModalOpen = ref(false)

const openLoginModal = () => {
  isLoginModalOpen.value = true
}

const closeLoginModal = () => {
  isLoginModalOpen.value = false
}

const handleLogin = (userData) => {
  console.log('User logged in:', userData)
}
</script>

<template>
  <div class="min-h-screen bg-wayang-dark">
    <Navbar @open-login="openLoginModal" />
    <main>
      <RouterView />
    </main>
    <LoginModal 
      :is-open="isLoginModalOpen" 
      @close="closeLoginModal"
      @login="handleLogin"
    />
  </div>
</template>

<style scoped></style>
