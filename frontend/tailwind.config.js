/** @type {import('tailwindcss').Config} */
const wine = { 50: '#f6e9ed', 100: '#efd4dc', 200: '#e2b4c2', 300: '#ce859b', 400: '#bd607e', 500: '#c43859', 600: '#a72c4b', 700: '#7c1d37', 800: '#55172a', 900: '#3a0f1d', 950: '#1f070e' }
export default {
 content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
 theme: { extend: {
  colors: { 'wayang-dark': '#1F070E', 'wayang-card': '#3A0F1D', 'wayang-primary': '#C43859', 'wayang-gold': '#F1C46B', white: '#FFFFFF', black: '#1F070E', gray: wine, slate: wine, indigo: wine, purple: wine, blue: wine, cyan: wine, green: wine, emerald: wine, yellow: wine, amber: wine, pink: wine, red: wine },
  fontFamily: { sans: ['Segoe UI','Inter','system-ui','sans-serif'] }
 } }, plugins: []
}
