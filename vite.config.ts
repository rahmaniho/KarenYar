import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

// حساب‌یار کارن سافت — پیکربندی Vite + PWA + Vitest
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // مانیفست استاتیک در public/manifest.webmanifest قرار دارد (مطابق ساختار پروژه)
      manifest: false,
      includeAssets: ['icons/*.png', 'fonts/*.woff2', 'images/karensoft/*.png'],
      workbox: {
        // Cache-First برای همه‌ی assetهای build شده (آفلاین‌فرست)
        globPatterns: ['**/*.{js,css,html,woff2,png,svg,webmanifest,ico}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.destination === 'image',
            handler: 'CacheFirst',
            options: {
              cacheName: 'hesabyar-images',
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
        cleanupOutdatedCaches: true,
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: true,
    // اجازه‌ی هاست‌های پیش‌نمایش (مثل محیط‌های ابری) در حالت توسعه
    allowedHosts: true,
  },
  preview: { host: true, allowedHosts: true },
  build: {
    target: 'es2020',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        // چانک‌بندی دستی: کش بهتر + پارس سریع‌تر در موبایل
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-charts': ['recharts'],
          'vendor-pdf': ['jspdf', 'html2canvas'],
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
    setupFiles: ['./src/tests/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/core/**/*.ts', 'src/features/**/calc*.ts'],
      thresholds: { lines: 70, functions: 70, branches: 60, statements: 70 },
    },
  },
});
