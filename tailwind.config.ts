import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0b0908',
        smoke: '#19150f',
        ash: '#2a241c',
        cream: '#f4ead6',
        sand: '#cdb892',
        honey: '#e0a63a',
        coral: '#e4573d',
        agave: '#4f7f6a',
      },
      fontFamily: {
        display: ['"Bebas Neue"', 'Impact', '"Arial Narrow"', 'sans-serif'],
        sans: ['-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
      },
      boxShadow: { glow: '0 0 0 1px rgba(224,166,58,.35), 0 10px 40px rgba(224,166,58,.15)' },
    },
  },
  plugins: [],
};
export default config;
