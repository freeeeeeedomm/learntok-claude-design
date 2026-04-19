import type { Config } from 'tailwindcss';

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: { DEFAULT: '#13110e', 2: '#1c1814', 3: '#251f19' },
        ink: { DEFAULT: '#f3ece0', soft: '#b8ad9a', mute: '#7a7062' },
        line: '#2e2720',
        accent: { DEFAULT: '#e89a56', 2: '#d96f3d' },
        nibs: '#d85a3e',
        angel: '#f4c874',
        good: '#a8c080',
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
