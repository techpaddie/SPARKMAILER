/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  safelist: [
    { pattern: /^bg-surface-\d+(\/\d+)?$/, variants: ['hover'] },
    'font-heading',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        heading: ['Orbitron', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        primary: {
          50: '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
          800: '#065f46',
          900: '#064e3b',
        },
        tactical: {
          DEFAULT: '#10b981',
          dim: '#059669',
          glow: 'rgba(16, 185, 129, 0.15)',
        },
        tech: {
          DEFAULT: '#22d3ee',
          dim: '#06b6d4',
        },
        surface: {
          900: '#0a0a0a',
          800: '#0f0f0f',
          700: '#141414',
          600: '#1a1a1a',
          500: '#262626',
        },
      },
      borderColor: {
        tactical: 'rgba(255,255,255,0.08)',
        'tactical-accent': '#10b981',
      },
      boxShadow: {
        tactical: '0 0 0 1px rgba(255,255,255,0.06), 0 4px 24px -4px rgba(0,0,0,0.5)',
        'tactical-glow': '0 0 20px -4px rgba(16, 185, 129, 0.2)',
        'tactical-inner': 'inset 0 1px 0 0 rgba(255,255,255,0.04)',
      },
      backgroundImage: {
        'grid-subtle': 'linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)',
      },
      backgroundSize: {
        'grid': '24px 24px',
      },
    },
  },
  plugins: [],
};
