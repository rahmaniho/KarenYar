import { fileURLToPath, URL } from 'node:url';
import laravel from 'laravel-vite-plugin';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// کارو نرم افزار حسابداری — Vite + React داخل لاراول
// افزونهٔ laravel-vite-plugin در محیط CI اجرای سرور HMR را ممنوع می‌کند و vitest با
// آن بالا نمی‌آید؛ چون تست‌ها به manifest/HMR نیاز ندارند، در حالت تست اضافه نمی‌شود.
const isTest = process.env.VITEST === 'true' || process.env.VITEST === '1';

export default defineConfig({
  plugins: [
    ...(isTest
      ? []
      : [
          laravel({
            input: ['resources/js/main.tsx'],
            refresh: true,
          }),
        ]),
    react(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./resources/js', import.meta.url)),
    },
  },
  server: {
    host: true,
    allowedHosts: true,
    watch: {
      ignored: ['**/storage/framework/views/**'],
    },
  },
  preview: {
    host: true,
    allowedHosts: true,
  },
  build: {
    target: 'es2020',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-charts': ['recharts'],
          'vendor-pdf-vector': ['pdf-lib', '@pdf-lib/fontkit'],
          'vendor-ui': [
            '@radix-ui/react-dialog',
            '@radix-ui/react-select',
            '@radix-ui/react-tabs',
            '@radix-ui/react-switch',
            'framer-motion',
          ],
          'vendor-data': ['dexie', 'dexie-react-hooks', 'zustand'],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./resources/js/tests/setup.ts'],
    include: ['resources/js/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: [
        'resources/js/core/**/*.ts',
        'resources/js/features/**/*-calc.ts',
        'resources/js/features/**/*.service.ts',
        'resources/js/features/store/payment.ts',
      ],
      thresholds: { lines: 70, functions: 70, branches: 60, statements: 70 },
    },
  },
});
