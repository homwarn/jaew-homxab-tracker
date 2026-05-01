/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          yellow:       '#F2B705',
          'yellow-dark':'#C9960A',
          'yellow-light':'#FFD95A',
          gold:         '#D4920A',
          cream:        '#FFF8E7',
        },
        dark: {
          950: '#030303',
          900: '#070707',
          800: '#0d0d0d',
          700: '#141414',
          600: '#1b1b1b',
          500: '#232323',
          400: '#2e2e2e',
          300: '#3d3d3d',
          200: '#555555',
        },
      },
      fontFamily: {
        display: ['"Cormorant Garamond"', 'Georgia', 'serif'],
        lao:     ['"Noto Sans Lao"', '"Phetsarath OT"', 'sans-serif'],
        sans:    ['"Noto Sans Lao"', '"Phetsarath OT"', 'sans-serif'],
      },
      boxShadow: {
        'gold-sm':  '0 2px 12px rgba(242, 183, 5, 0.18)',
        'gold':     '0 4px 24px rgba(242, 183, 5, 0.28)',
        'gold-lg':  '0 8px 40px rgba(242, 183, 5, 0.35)',
        'card':     '0 2px 20px rgba(0,0,0,0.55)',
        'card-lg':  '0 8px 40px rgba(0,0,0,0.7)',
        'inset-top':'inset 0 1px 0 rgba(255,255,255,0.04)',
      },
      animation: {
        'fade-in':   'fadeIn 0.2s ease-out',
        'slide-up':  'slideUp 0.3s cubic-bezier(0.16,1,0.3,1)',
        'scale-in':  'scaleIn 0.2s cubic-bezier(0.16,1,0.3,1)',
      },
      keyframes: {
        fadeIn:  { from: { opacity: 0   }, to: { opacity: 1   } },
        slideUp: { from: { transform: 'translateY(24px)', opacity: 0 }, to: { transform: 'translateY(0)', opacity: 1 } },
        scaleIn: { from: { transform: 'scale(0.95)', opacity: 0 }, to: { transform: 'scale(1)', opacity: 1 } },
      },
      borderRadius: {
        '4xl': '2rem',
      },
    },
  },
  plugins: [],
}
