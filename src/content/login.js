/* Auth-page login controller. */
(function (root) {
  'use strict';

  if (root.AMZ_LOGIN) return;

  const { DOM, MESSAGE_ACTIONS, SELECTORS, STORAGE_KEYS } = root.AMZ_CONSTANTS;
  const dom = root.AMZ_DOM;
  const storage = root.AMZ_STORAGE;
  const log = (...args) => console.log(...args);
  log.event = log;
  log.log = log;
  log.info = (...args) => console.info(...args);
  log.warn = (...args) => console.warn(...args);
  log.error = (...args) => console.error(...args);
  log.debug = (...args) => console.debug(...args);
  log.trace = (...args) => console.debug(...args);
  let loginFlowInProgress = false;

  function normalizeEmail(value) {
    return String(value || '').trim().toLowerCase();
  }

  function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
  }

  async function persistAmazonLoginEmail(email) {
    const normalized = normalizeEmail(email);
    if (!isValidEmail(normalized)) return '';
    await storage.setLocal({
      [STORAGE_KEYS.AMAZON_LOGIN_USERNAME]: normalized,
      [STORAGE_KEYS.USER_EMAIL]: '',
    });
    return normalized;
  }

  async function persistCredentials(credentials) {
    return persistAmazonLoginEmail(credentials.email);
  }

  function clickContinueButton() {
    const button = document.querySelector(SELECTORS.CONTINUE_BUTTON);
    if (!button || button.disabled) return false;
    button.click();
    return true;
  }

  function isLoginFlowPage() {
    return Boolean(root.AMZ_URL?.isLoginPage?.() || document.querySelector(SELECTORS.LOGIN_INPUT));
  }

  async function promptForCredentials() {
    const stored = await storage.getLocal(STORAGE_KEYS.AMAZON_LOGIN_USERNAME);
    const result = await Swal.fire({
      title: 'Amazon Login Required',
      html:
        '<div style="text-align:left">' +
        '<label for="amz-login-username" style="display:block;margin-bottom:6px;">Amazon email</label>' +
        '<input id="amz-login-username" class="swal2-input" style="display:block;width:100%;max-width:100%;box-sizing:border-box;margin:0 0 12px 0;" placeholder="Amazon Jobs email" autocomplete="username" />' +
        '<label for="amz-login-password" style="display:block;margin-bottom:6px;">Password / PIN</label>' +
        '<input id="amz-login-password" class="swal2-input" style="display:block;width:100%;max-width:100%;box-sizing:border-box;margin:0;" type="password" placeholder="Password or PIN" autocomplete="current-password" />' +
        '</div>',
      allowEscapeKey: false,
      allowEnterKey: true,
      allowOutsideClick: false,
      icon: 'info',
      confirmButtonText: 'Continue',
      didOpen: () => {
        const usernameInput = document.getElementById('amz-login-username');
        const passwordInput = document.getElementById('amz-login-password');
        if (usernameInput) {
          usernameInput.value = stored[STORAGE_KEYS.AMAZON_LOGIN_USERNAME] || '';
        }
        if (passwordInput) passwordInput.value = '';
      },
      preConfirm: () => {
        const email = normalizeEmail(document.getElementById('amz-login-username')?.value || '');
        const password = String(document.getElementById('amz-login-password')?.value || '').trim();
        if (!isValidEmail(email)) {
          Swal.showValidationMessage('Enter the Amazon Jobs email.');
          return null;
        }
        if (!password) {
          Swal.showValidationMessage('Password or PIN is required.');
          return null;
        }
        return { email, password };
      },
    });

    return result.isConfirmed && result.value ? result.value : null;
  }

  async function handleAuthLoginFlow() {
    if (!isLoginFlowPage()) return null;
    if (loginFlowInProgress) return null;
    loginFlowInProgress = true;

    try {
      const credentials = await promptForCredentials();
      if (!credentials) return null;
      await persistCredentials(credentials);

      const loginInput = await dom.waitForSelector(
        SELECTORS.LOGIN_INPUT,
        DOM.WAIT_TIMEOUT_MS,
        DOM.WAIT_INTERVAL_MS
      );
      if (!loginInput) return credentials;
      dom.setInputValue(loginInput, credentials.email);
      if (!clickContinueButton()) return credentials;

      const pinInput = await dom.waitForSelector(
        SELECTORS.PIN_INPUT,
        DOM.WAIT_TIMEOUT_MS,
        DOM.WAIT_INTERVAL_MS
      );
      if (!pinInput) return credentials;
      dom.setInputValue(pinInput, credentials.password);
      clickContinueButton();
      return credentials;
    } catch (error) {
      log.error('auth flow failed:', error);
      return null;
    } finally {
      loginFlowInProgress = false;
    }
  }

  async function syncLoginInputEmail() {
    const loginInput = document.querySelector(SELECTORS.LOGIN_INPUT);
    const email = normalizeEmail(loginInput?.value || '');
    if (email) await persistAmazonLoginEmail(email);
  }

  function clearAmazonSession() {
    try {
      window.localStorage.removeItem('sessionToken');
      window.localStorage.removeItem('bbCandidateId');
      window.sessionStorage.clear();
    } catch (_) {
      // Best-effort logout marker cleanup only.
    }
  }

  async function logoutAmazonSession() {
    clearAmazonSession();
    try {
      await chrome.runtime.sendMessage({ action: MESSAGE_ACTIONS.LOGOUT_AMAZON_SESSION });
    } catch (error) {
      log.warn('background Amazon logout skipped:', error?.message || String(error));
    }
  }

  document.addEventListener('input', event => {
    if (event.target?.matches?.(SELECTORS.LOGIN_INPUT)) {
      syncLoginInputEmail().catch(error => log.debug('login email sync skipped', {
        error: error?.message || String(error),
      }));
    }
  }, true);

  root.AMZ_LOGIN = Object.freeze({
    clearAmazonSession,
    handleAuthLoginFlow,
    isLoginFlowPage,
    logoutAmazonSession,
    persistAmazonLoginEmail,
    syncLoginInputEmail,
  });
})(typeof globalThis !== 'undefined' ? globalThis : self);
