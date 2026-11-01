(() => {
  'use strict';

  const root = document.documentElement;
  const body = document.body;
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

  function toast(message, type = 'info') {
    const stack = $('[data-toasts]');
    if (!stack || !message) return;
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.setAttribute('role', 'status');
    el.textContent = message;
    stack.appendChild(el);
    window.setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(6px)';
      window.setTimeout(() => el.remove(), 220);
    }, 4200);
  }

  // Theme
  const themeBtn = $('[data-theme-toggle]');
  function paintThemeButton() {
    if (!themeBtn) return;
    const dark = root.dataset.theme !== 'light';
    themeBtn.innerHTML = dark ? sunIcon() : moonIcon();
    themeBtn.setAttribute('aria-label', dark ? 'پوسته روشن' : 'پوسته تاریک');
  }
  function sunIcon() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  }
  function moonIcon() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"/></svg>';
  }
  if (themeBtn) {
    paintThemeButton();
    themeBtn.addEventListener('click', () => {
      const next = root.dataset.theme === 'light' ? 'dark' : 'light';
      root.dataset.theme = next;
      try {
        localStorage.setItem('karen-admin-theme', next);
      } catch (e) {}
      const meta = $('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', next === 'light' ? '#f4f6fb' : '#0b1220');
      paintThemeButton();
    });
  }

  // Mobile navigation
  $$('[data-nav-open]').forEach((btn) =>
    btn.addEventListener('click', () => body.classList.add('nav-open')),
  );
  $$('[data-nav-close]').forEach((btn) =>
    btn.addEventListener('click', () => body.classList.remove('nav-open')),
  );
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      body.classList.remove('nav-open');
      closeModal();
    }
  });
  const page = body.dataset.page || '';
  $$('[data-mobile]').forEach((a) => {
    if (a.dataset.mobile === page || (page === 'license' && a.dataset.mobile === 'licenses')) {
      a.classList.add('active');
    }
  });

  // Modal + confirm forms
  const modal = $('[data-modal]');
  let pendingForm = null;
  function openModal(title, message, onConfirm, confirmLabel = 'تأیید') {
    if (!modal) {
      if (onConfirm) onConfirm();
      return;
    }
    $('[data-modal-title]', modal).textContent = title;
    $('[data-modal-body]', modal).textContent = message;
    const confirmBtn = $('[data-modal-confirm]', modal);
    confirmBtn.textContent = confirmLabel;
    confirmBtn.className = 'btn ' + (confirmLabel.includes('مسدود') ? 'btn-danger' : 'btn-primary');
    modal.classList.add('open');
    pendingForm = onConfirm;
    confirmBtn.focus();
  }
  function closeModal() {
    if (!modal) return;
    modal.classList.remove('open');
    pendingForm = null;
  }
  if (modal) {
    $('[data-modal-cancel]', modal).addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
    $('[data-modal-confirm]', modal).addEventListener('click', () => {
      const fn = pendingForm;
      closeModal();
      if (typeof fn === 'function') fn();
    });
  }
  $$('form[data-confirm]').forEach((form) => {
    form.addEventListener('submit', (e) => {
      if (form.dataset.confirmed === '1') return;
      e.preventDefault();
      openModal(
        form.dataset.confirmTitle || 'تأیید عملیات',
        form.dataset.confirm || 'آیا مطمئن هستی؟',
        () => {
          form.dataset.confirmed = '1';
          form.submit();
        },
        form.dataset.confirmLabel || 'تأیید',
      );
    });
  });

  // Copy buttons
  $$('[data-copy]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const target = btn.dataset.copy ? $(btn.dataset.copy) : null;
      const text = target ? target.textContent.trim() : btn.dataset.copyText || '';
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
        toast('کپی شد.', 'success');
      } catch (e) {
        const range = document.createRange();
        if (target) {
          range.selectNodeContents(target);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
        }
        toast('کپی خودکار ممکن نشد؛ متن انتخاب شد.', 'warning');
      }
    });
  });

  // Server flash messages -> toasts
  $$('[data-toast]').forEach((el) => {
    toast(el.dataset.toast || el.textContent.trim(), el.dataset.toastType || 'info');
    el.remove();
  });

  // PWA install
  let deferredPrompt = null;
  const installCards = $$('[data-install-card]');
  const installButtons = $$('[data-install]');
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  function showInstallUi(show) {
    installCards.forEach((el) => el.classList.toggle('hidden', !show));
    installButtons.forEach((el) => {
      if (el.closest('.topbar')) el.classList.toggle('hidden', !show);
    });
  }
  showInstallUi(!isStandalone);
  if (!isStandalone) {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      showInstallUi(true);
    });
    // Fallback for browsers without beforeinstallprompt (e.g. iOS Safari)
    window.setTimeout(() => {
      if (!deferredPrompt && /iphone|ipad|ipod/i.test(window.navigator.userAgent))
        showInstallUi(true);
    }, 1500);
  }
  installButtons.forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice && choice.outcome === 'accepted') toast('درخواست نصب ارسال شد.', 'success');
        deferredPrompt = null;
        showInstallUi(false);
        return;
      }
      openModal(
        'نصب روی گوشی',
        'در Chrome اندروید از منوی سه‌نقطه گزینه «Install app» یا «Add to Home screen» را بزن. در iPhone از Safari، Share و سپس Add to Home Screen.',
        null,
        'متوجه شدم',
      );
    });
  });
  window.addEventListener('appinstalled', () => {
    toast('داشبورد نصب شد.', 'success');
    showInstallUi(false);
  });

  // Service worker: static assets only; authenticated PHP pages are never cached.
  if ('serviceWorker' in navigator && window.isSecureContext) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {});
    });
  }
})();
