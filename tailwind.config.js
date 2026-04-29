/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          yellow:       'var(--brand-yellow, #F5C518)',
          'yellow-dark':'var(--brand-yellow-dark, #D4A017)',
          'yellow-light':'var(--brand-yellow-light, #FDE68A)',
        },
        dark: {
          900: 'var(--dark-900, #0a0a0a)',
          800: 'var(--dark-800, #111111)',
          700: 'var(--dark-700, #1a1a1a)',
          600: 'var(--dark-600, #222222)',
          500: 'var(--dark-500, #2a2a2a)',
          400: 'var(--dark-400, #383838)',
          300: 'var(--dark-300, #4a4a4a)',
        },
      },
      fontFamily: {
        lao: ['"Noto Sans Lao"', 'Phetsarath OT', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
      },
      keyframes: {
        fadeIn: { from: { opacity: 0 }, to: { opacity: 1 } },
        slideUp: { from: { transform: 'translateY(20px)', opacity: 0 }, to: { transform: 'translateY(0)', opacity: 1 } },
      },
    },
  },
  plugins: [],
}
