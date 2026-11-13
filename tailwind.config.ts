import type { Config } from 'tailwindcss';

/**
 * Palette taken from the ScoreHUB brand artwork: near-black navy surfaces,
 * a neon blue accent ramp, and the two corner colours.
 */
const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Surfaces, darkest first.
        ink: {
          900: '#04060d', // page background
          800: '#070b16', // panels
          700: '#0b1120', // raised panels
          600: '#111a2e', // inputs, hover
          500: '#1a2640', // borders
          400: '#2a3a5c', // strong borders
        },
        brand: {
          50: '#e8f4ff',
          100: '#cfe8ff',
          200: '#9ed2ff',
          300: '#6bbcff',
          400: '#29b6ff', // neon highlight
          500: '#1580f5',
          600: '#0b5fe8',
          700: '#0b3fd4',
          800: '#0a33a8',
          900: '#0b2b80',
        },
        blueCorner: {
          bg: '#0d1b3d',
          border: '#2a4d9e',
          text: '#7fb4ff',
          solid: '#1d4ed8',
        },
        redCorner: {
          bg: '#2b0d18',
          border: '#8e2942',
          text: '#ff8fa6',
          solid: '#c31f43',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(0,0,0,.5), 0 8px 24px -12px rgba(0,0,0,.8)',
        glow: '0 0 24px -4px rgba(41,182,255,.45)',
        'glow-lg': '0 0 60px -10px rgba(41,182,255,.55)',
      },
      backgroundImage: {
        'brand-grad': 'linear-gradient(90deg, #0b3fd4 0%, #1580f5 55%, #29b6ff 100%)',
        'spotlight':
          'radial-gradient(60% 55% at 50% 38%, rgba(41,182,255,.16) 0%, rgba(4,6,13,0) 70%)',
      },
    },
  },
  plugins: [],
};

export default config;
