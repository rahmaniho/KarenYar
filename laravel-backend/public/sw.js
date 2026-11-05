/*
 * طلای امین — service worker
 *
 * The application is fully dynamic (Livewire): every page renders live
 * prices and every action posts a signed payload. Caching responses would
 * therefore serve stale prices and break Livewire requests, so the worker
 * stays network-only. The fetch handler only exists because browsers
 * require one before they offer "Add to Home Screen".
 */

self.addEventListener('install', function () {
    self.skipWaiting();
});

self.addEventListener('activate', function (event) {
    event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', function () {
    // Network-only: let the browser handle every request as usual.
});
