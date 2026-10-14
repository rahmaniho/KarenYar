import type { Config } from 'tailwindcss';

// هویت بصری کارن سافت: سرمه‌ای #0B1B3A + سبز نئونی #39FF88
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: { center: true, padding: '1rem' },
    extend: {
      fontFamily: {
        sans: ['Vazirmatn', 'Tahoma', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        navy: {
          50: '#eef3fb',
          100: '#d9e4f5',
          200: '#b3c9ea',
          300: '#84a5d8',
          400: '#4f78bd',
          500: '#2c559e',
          600: '#1c3f7d',
          700: '#142f61',
          800: '#0f2449',
          900: '#0B1B3A',
          950: '#071228',
        },
        neon: {
          300: '#7dffb8',
          400: '#5cff9f',
          500: '#39FF88',
          600: '#17e76c',
          700: '#0fc656',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning))',
          foreground: 'hsl(var(--warning-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        xl: 'calc(var(--radius) + 4px)',
        '2xl': 'calc(var(--radius) + 8px)',
      },
      boxShadow: {
        soft: '0 4px 24px -6px rgb(11 27 58 / 0.12)',
        card: '0 1px 3px rgb(11 27 58 / 0.06), 0 8px 24px -12px rgb(11 27 58 / 0.12)',
        glow: '0 0 24px -4px rgb(57 255 136 / 0.45)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.25s ease both',
        'slide-up': 'slide-up 0.3s ease both',
      },
    },
  },
  plugins: [],
} satisfies Config;
