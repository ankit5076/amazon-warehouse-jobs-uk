/* Paid access API client for the extension usage tracker. */
(function (root) {
  'use strict';

  if (root.AMZ_ACCESS) return;

  const { BACKEND, EMAIL_REGEX, STORAGE_KEYS } = root.AMZ_CONSTANTS;
  const storage = root.AMZ_STORAGE;
  const productId = BACKEND.PRODUCT_ID;
  const trackerBaseUrl = String(BACKEND.TRACKER_BASE_URL || '').replace(/\/+$/, '');
  const accessPass = BACKEND.ACCESS_PASS || {};
  let lastPromptedAt = 0;

  function normalizeEmail(value) {
    return String(value || '').trim().toLowerCase();
  }

  function isValidEmail(email) {
    return EMAIL_REGEX.test(normalizeEmail(email));
  }

  function nowMs() {
    return Date.now();
  }

  function parseTimestamp(value) {
    if (!value) return 0;
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function isFutureTimestamp(value, referenceMs = nowMs()) {
    const parsed = parseTimestamp(value);
    return parsed > referenceMs;
  }

  function endpoint(path) {
    return trackerBaseUrl + '/api/' + encodeURIComponent(productId) + '/license/' + path;
  }

  function denied(message, extra = {}) {
    return {
      allowed: false,
      productId,
      amazonEmailId: normalizeEmail(extra.amazonEmailId),
      checkoutUrl: '',
      message: message || 'No active paid access. Buy access to continue booking.',
      syncIntervalMs: Number(extra.syncIntervalMs || 0),
      accessExpiresAt: null,
      checkedAt: nowMs(),
      source: extra.source || 'denied',
      error: extra.error || '',
    };
  }

  function normalizeLicenseResponse(payload = {}, amazonEmailId = '', source = 'remote') {
    const normalizedEmail = normalizeEmail(amazonEmailId);
    const accessExpiresAt = payload.accessExpiresAt || null;
    const hasUnexpiredAccess = isFutureTimestamp(accessExpiresAt);
    const allowed = payload.allowed === true && hasUnexpiredAccess;

    return {
      allowed,
      productId,
      amazonEmailId: normalizedEmail,
      checkoutUrl: payload.checkoutUrl || '',
      message: payload.message || (allowed ? 'Access active.' : 'No active paid access.'),
      syncIntervalMs: Number(payload.syncIntervalMs || 0),
      accessExpiresAt,
      checkedAt: nowMs(),
      source,
    };
  }

  async function readCachedAccess(amazonEmailId = '') {
    const stored = await storage.getLocal(STORAGE_KEYS.PAID_ACCESS_CACHE);
    const cached = stored[STORAGE_KEYS.PAID_ACCESS_CACHE] || null;
    const normalizedEmail = normalizeEmail(amazonEmailId);
    if (!cached || cached.productId !== productId) return null;
    if (normalizedEmail && normalizeEmail(cached.amazonEmailId) !== normalizedEmail) return null;
    return cached;
  }

  function isFreshAllowed(snapshot) {
    if (!snapshot || snapshot.allowed !== true) return false;
    if (snapshot.productId !== productId) return false;
    if (!isFutureTimestamp(snapshot.accessExpiresAt)) return false;
    const syncIntervalMs = Number(snapshot.syncIntervalMs || 0);
    const checkedAt = Number(snapshot.checkedAt || 0);
    if (!checkedAt || syncIntervalMs <= 0) return false;
    return checkedAt + syncIntervalMs > nowMs();
  }

  async function storeAccess(snapshot) {
    await storage.setLocal({ [STORAGE_KEYS.PAID_ACCESS_CACHE]: snapshot || null });
    return snapshot;
  }

  async function requestJson(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: {
        'content-type': 'application/json',
        ...(options.headers || {}),
      },
    });
    if (!response || typeof response.json !== 'function') {
      throw new Error('Tracker service did not return a JSON response.');
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.message || 'Tracker service request failed.');
    }
    return payload || {};
  }

  async function checkAccess(amazonEmailId, options = {}) {
    const email = normalizeEmail(amazonEmailId);
    if (!isValidEmail(email)) {
      return denied('Open Amazon Jobs while signed in so the extension can detect your Amazon email.', {
        amazonEmailId: email,
        source: 'missing-email',
      });
    }

    const cached = await readCachedAccess(email);
    if (options.force !== true && isFreshAllowed(cached)) {
      return { ...cached, source: 'cache' };
    }

    try {
      const url = endpoint('check') + '?amazonEmail=' + encodeURIComponent(email);
      const payload = await requestJson(url, { method: 'GET' });
      const snapshot = normalizeLicenseResponse(payload, email, 'remote');
      return snapshot.allowed ? storeAccess(snapshot) : snapshot;
    } catch (error) {
      return denied('Unable to verify paid access. Search can continue, but booking is locked until access is verified.', {
        amazonEmailId: email,
        source: 'network-error',
        error: error?.message || String(error),
      });
    }
  }

  async function getIdentityEmail() {
    const stored = await storage.getLocal([
      STORAGE_KEYS.AMAZON_LOGIN_USERNAME,
      STORAGE_KEYS.USER_EMAIL,
    ]);
    return normalizeEmail(
      stored[STORAGE_KEYS.AMAZON_LOGIN_USERNAME] ||
      stored[STORAGE_KEYS.USER_EMAIL] ||
      ''
    );
  }

  async function ensureFreshAccess(options = {}) {
    const email = normalizeEmail(options.amazonEmailId || options.amazonEmail || await getIdentityEmail());
    return checkAccess(email, { force: options.force === true });
  }

  async function createCheckout(amazonEmailId) {
    const email = normalizeEmail(amazonEmailId || await getIdentityEmail());
    if (!isValidEmail(email)) {
      throw new Error('Amazon email is required before checkout.');
    }

    const payload = await requestJson(endpoint('checkout'), {
      method: 'POST',
      body: JSON.stringify({
        emailId: email,
        amazonEmailId: email,
        purchaseType: accessPass.PURCHASE_TYPE || 'access',
      }),
    });
    const snapshot = normalizeLicenseResponse(payload, email, 'checkout');
    return snapshot.allowed ? storeAccess(snapshot) : snapshot;
  }

  function buildUsageIdempotencyKey(input = {}, amazonEmailId = '') {
    return [
      productId,
      normalizeEmail(amazonEmailId),
      input.source || 'booking',
      input.jobId || 'job',
      input.scheduleId || 'schedule',
    ].join(':');
  }

  async function recordBookingUsage(input = {}) {
    const email = normalizeEmail(input.amazonEmailId || input.amazonEmail || await getIdentityEmail());
    if (!isValidEmail(email)) {
      return denied('Amazon email is required before booking.', {
        amazonEmailId: email,
        source: 'missing-email',
      });
    }

    try {
      const payload = await requestJson(endpoint('usage'), {
        method: 'POST',
        body: JSON.stringify({
          emailId: email,
          amazonEmailId: email,
          idempotencyKey: input.idempotencyKey || buildUsageIdempotencyKey(input, email),
          jobId: input.jobId || null,
          scheduleId: input.scheduleId || null,
          metadata: {
            source: input.source || 'booking',
            pageUrl: root.location?.href || '',
            ...(input.metadata || {}),
          },
        }),
      });
      const snapshot = normalizeLicenseResponse(payload, email, 'usage');
      return snapshot.allowed ? storeAccess(snapshot) : snapshot;
    } catch (error) {
      return denied('Unable to record paid-access booking usage. Booking is locked until access can be verified.', {
        amazonEmailId: email,
        source: 'usage-error',
        error: error?.message || String(error),
      });
    }
  }

  async function openCheckout(amazonEmailId) {
    const checkout = await createCheckout(amazonEmailId);
    if (!checkout.checkoutUrl) throw new Error('Checkout URL was not returned.');
    if (typeof root.open === 'function') {
      root.open(checkout.checkoutUrl, '_blank', 'noopener');
    } else {
      root.location.href = checkout.checkoutUrl;
    }
    return checkout;
  }

  async function showAccessRequiredPrompt(details = {}) {
    const now = nowMs();
    const throttleMs = Number(details.throttleMs || 30000);
    if (details.force !== true && lastPromptedAt && now - lastPromptedAt < throttleMs) {
      return { shown: false };
    }
    lastPromptedAt = now;

    const email = normalizeEmail(details.amazonEmailId || await getIdentityEmail());
    const message = details.message ||
      'Search can continue, but booking requires an active 60-day access pass.';
    const confirmButtonText = accessPass.BUY_LABEL || 'Buy access';

    if (!root.Swal?.fire) {
      return { shown: false, message };
    }

    const result = await root.Swal.fire({
      title: '60-day access pass required',
      html: root.AMZ_TEXT?.escapeHtml ? root.AMZ_TEXT.escapeHtml(message) : message,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText,
      cancelButtonText: 'Keep searching',
      allowOutsideClick: true,
    });

    if (result?.isConfirmed) {
      try {
        await openCheckout(email);
      } catch (error) {
        await root.Swal.fire({
          title: 'Checkout unavailable',
          text: error?.message || String(error),
          icon: 'error',
        });
      }
    }
    return { shown: true, confirmed: result?.isConfirmed === true };
  }

  function formatAccessExpiry(snapshot = {}) {
    const timestamp = parseTimestamp(snapshot.accessExpiresAt);
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  root.AMZ_ACCESS = Object.freeze({
    normalizeEmail,
    isValidEmail,
    isFutureTimestamp,
    isFreshAllowed,
    readCachedAccess,
    storeAccess,
    getIdentityEmail,
    checkAccess,
    ensureFreshAccess,
    createCheckout,
    openCheckout,
    recordBookingUsage,
    showAccessRequiredPrompt,
    formatAccessExpiry,
  });
})(typeof globalThis !== 'undefined' ? globalThis : self);
