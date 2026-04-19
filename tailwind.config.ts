import type { Config } from 'tailwindcss';

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: { DEFAULT: '#fafbfc', 2: '#f4f5f7', 3: '#eaebef' },
        ink: { DEFAULT: '#0e0f12', soft: '#5a6068', mute: '#8b92a0' },
        line: '#e3e5e9',
        accent: { DEFAULT: '#5e6ad2', 2: '#4c56c4' },
        nibs: '#d85a3e',
        angel: '#f4c874',
        good: '#10b981',
        bad: '#d96f3d',
      },
      fontFamily: {
        serif: ['Fraunces', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config;
