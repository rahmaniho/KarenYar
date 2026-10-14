import '@testing-library/jest-dom/vitest';

// jsdom پیاده‌سازی کاملی از matchMedia ندارد — برای تست‌ها کاملش می‌کنیم
if (typeof window !== 'undefined') {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

// اسکرول صفحه در jsdom پیاده نشده است
if (typeof window !== 'undefined') {
  window.scrollTo = () => undefined;
}
