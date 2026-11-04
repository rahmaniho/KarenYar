/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare module '*.ttf?url' {
  const src: string;
  export default src;
}
