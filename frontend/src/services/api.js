import axios from 'axios'
import { auth } from '@/firebase'
import { createFohAuthInterceptor } from './fohAuth'
export const api = axios.create({ baseURL: import.meta.env.VITE_API_BASE_URL || '/', timeout: 10000 })
api.interceptors.request.use(createFohAuthInterceptor(auth))
export function apiError(error, fallback = 'Layanan belum dapat dihubungi. Coba lagi nanti.') { return error?.response?.data?.message || fallback }
