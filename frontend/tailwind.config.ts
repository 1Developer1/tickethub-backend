import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#e94560',
          dark: '#c72a4a',
          light: '#f06b82',
        },
        secondary: {
          DEFAULT: '#1a1a2e',
          light: '#2a2a42',
        },
        accent: {
          DEFAULT: '#ffa94d',
          dark: '#f08c1e',
        },
        surface: '#f5f5f7',
        'text-muted': '#6b6b7f',
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
        mono: ['Cascadia Code', 'Fira Code', 'Consolas', 'monospace'],
      },
      boxShadow: {
        card: '0 2px 8px rgba(0, 0, 0, 0.06)',
        'card-hover': '0 8px 24px rgba(0, 0, 0, 0.12)',
      },
    },
  },
  plugins: [],
} satisfies Config;
