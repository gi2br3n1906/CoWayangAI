import { ref, watch } from 'vue'
import { defineStore } from 'pinia'
export const useSettings = defineStore('settings', () => {
 let saved = {}
 try { saved = JSON.parse(localStorage.getItem('cowayang_model_settings') || '{}') || {} } catch { /* Invalid storage uses defaults. */ }
 const showBoundingBox = ref(typeof saved.showBoundingBox === 'boolean' ? saved.showBoundingBox : true)
 const showLabels = ref(typeof saved.showLabels === 'boolean' ? saved.showLabels : true)
 const confidenceThreshold = ref(Number.isFinite(saved.confidenceThreshold) ? Math.min(100, Math.max(0, saved.confidenceThreshold)) : 50)
 const targetLanguage = ref(['id', 'en'].includes(saved.targetLanguage) ? saved.targetLanguage : 'id')
 const uiLanguage = ref(['id', 'en'].includes(saved.uiLanguage) ? saved.uiLanguage : 'id')
 const maintenance = import.meta.env.VITE_AI_MAINTENANCE === 'true'
 watch([showBoundingBox, showLabels, confidenceThreshold, targetLanguage, uiLanguage], () => {
  try { localStorage.setItem('cowayang_model_settings', JSON.stringify({ showBoundingBox: showBoundingBox.value, showLabels: showLabels.value, confidenceThreshold: confidenceThreshold.value, targetLanguage: targetLanguage.value, uiLanguage: uiLanguage.value })) } catch { /* Keep settings in memory. */ }
 })
 return { showBoundingBox, showLabels, confidenceThreshold, targetLanguage, uiLanguage, maintenance }
})
