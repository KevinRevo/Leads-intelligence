/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        revolut: {
          50: '#f0f5ff',
          100: '#e5edff',
          200: '#cddbfe',
          300: '#b4c6fd',
          400: '#8ca2fb',
          500: '#5b6cf6',
          600: '#0075eb',
          700: '#005bb5',
          800: '#004385',
          900: '#0b132b',
          dark: '#0e1118',
          card: '#161b26',
          border: '#232936',
        }
      }
    },
  },
  plugins: [],
}
