/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './patrocinadores.html'],
  theme: {
    extend: {
      colors: {
        brand: {
          bg: '#000000',
          surface: '#000000',
          primary: '#F8C100',
          primaryHover: '#F8C100',
          accent: '#F8C100',
          textPrimary: '#FFFFFF',
          textSecondary: '#FFFFFF',
          textMuted: '#FFFFFF',
          darkgray: '#000000',
          success: '#F8C100',
        },
      },
      fontFamily: {
        sans: ['Gilroy', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        heading: ['Agharti', 'Oswald', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      animation: {
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        shimmer: 'shimmer 2.5s infinite linear',
        float: 'float 8s ease-in-out infinite',
        'float-delayed': 'float 10s ease-in-out infinite 2s',
        'pan-image': 'panImage 40s ease-in-out infinite alternate',
        marquee: 'marquee 25s linear infinite',
      },
      keyframes: {
        shimmer: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0) scale(1)' },
          '50%': { transform: 'translateY(-30px) scale(1.05)' },
        },
        panImage: {
          '0%': { transform: 'scale(1.05) translate(0, 0)' },
          '100%': { transform: 'scale(1.15) translate(-2%, -2%)' },
        },
        marquee: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
      },
    },
  },
  plugins: [],
};
