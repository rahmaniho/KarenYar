import '@testing-library/jest-dom/vitest';

// در برخی محیط‌های Vitest، localStorage روی globalThis در دسترس نیست؛
// یک پیاده‌سازی درون‌حافظه‌ای سبک برای تست‌ها فراهم می‌کنیم.
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => {
      store.delete(key);
    },
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
  };
  Object.defineProperty(globalThis, 'localStorage', {
    value: storage,
    configurable: true,
  });
}

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

// jsdom برای نمودارها (recharts) به ResizeObserver نیاز دارد
if (typeof window !== 'undefined' && !('ResizeObserver' in window)) {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  (window as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;
}
