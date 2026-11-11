import type { Config } from 'tailwindcss'

// Warna memakai token CSS agar seluruh UI dapat berganti light/dark tanpa
// menggandakan class komponen.
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: '1.5rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', 'sans-serif'],
        // Landing page Digihydrotek: huruf bergaya papan nama industri + angka teknis.
        brand: ['Barlow', 'Inter', 'system-ui', 'sans-serif'],
        'brand-display': ['"Barlow Semi Condensed"', 'Barlow', 'system-ui', 'sans-serif'],
        plex: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        background: 'hsl(var(--background) / <alpha-value>)',
        surface: 'hsl(var(--surface) / <alpha-value>)',
        'surface-2': 'hsl(var(--surface-2) / <alpha-value>)',
        border: 'hsl(var(--border) / <alpha-value>)',
        'text-primary': 'hsl(var(--text-primary) / <alpha-value>)',
        'text-secondary': 'hsl(var(--text-secondary) / <alpha-value>)',
        'accent-blue': 'hsl(var(--accent-blue) / <alpha-value>)',
        'accent-green': 'hsl(var(--accent-green) / <alpha-value>)',
        'accent-red': 'hsl(var(--accent-red) / <alpha-value>)',
        'accent-yellow': 'hsl(var(--accent-yellow) / <alpha-value>)',
        'accent-orange': 'hsl(var(--accent-orange) / <alpha-value>)',
        'accent-purple': 'hsl(var(--accent-purple) / <alpha-value>)',
        status: {
          good: '#22c55e',
          warning: '#f59e0b',
          bad: '#ef4444',
          uncertain: '#8b5cf6',
          unknown: '#6b7280',
        },
      },
      borderRadius: {
        card: '8px',
        input: '6px',
      },
      keyframes: {
        'pulse-ring': {
          '0%': { boxShadow: '0 0 0 0 rgba(248, 81, 73, 0.6)' },
          '70%': { boxShadow: '0 0 0 8px rgba(248, 81, 73, 0)' },
          '100%': { boxShadow: '0 0 0 0 rgba(248, 81, 73, 0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-1000px 0' },
          '100%': { backgroundPosition: '1000px 0' },
        },
        'value-flash': {
          '0%': { backgroundColor: 'rgba(210, 153, 34, 0.35)' },
          '100%': { backgroundColor: 'transparent' },
        },
        'flow-dash': {
          to: { strokeDashoffset: -40 },
        },
      },
      animation: {
        'pulse-ring': 'pulse-ring 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        shimmer: 'shimmer 2s infinite linear',
        'value-flash': 'value-flash 500ms ease-out',
        'flow-dash': 'flow-dash 1s linear infinite',
      },
    },
  },
  plugins: [],
} satisfies Config
