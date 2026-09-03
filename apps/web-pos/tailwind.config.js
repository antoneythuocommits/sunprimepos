/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f6f8f5',
          100: '#e8efe4',
          500: '#3d6b4f',
          600: '#2f5540',
          700: '#254433',
          900: '#15261c',
        },
        accent: {
          400: '#e8a317',
          500: '#d4920f',
        },
      },
      fontFamily: {
        display: ['"Segoe UI"', 'system-ui', 'sans-serif'],
        mono: ['"Cascadia Mono"', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};
