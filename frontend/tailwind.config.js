/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          navy:  '#071456',
          dark:  '#050e3d',
          light: '#0d1f7a',
        },
        accent: {
          DEFAULT: '#FF4400',
          hover:   '#e63d00',
          light:   '#fff0eb',
        },
      },
      fontFamily: {
        sans: ['Montserrat', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
