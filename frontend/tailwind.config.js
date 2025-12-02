/** @type {import('tailwindcss').Config} */
const palette = {
  burgundy: '#781D42',
  terracotta: '#A3423C',
  sand: '#F0D290',
}

export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'wayang-dark': palette.burgundy,
        'wayang-card': palette.terracotta,
        'wayang-primary': palette.terracotta,
        'wayang-gold': palette.sand,
      },
      fontFamily: {
        sans: ['Poppins', 'Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
