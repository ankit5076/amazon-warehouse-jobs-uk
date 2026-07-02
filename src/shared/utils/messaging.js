/* Promise-safe Chrome messaging helpers for MV3 contexts. */
(function (root) {
  'use strict';

  if (root.AMZ_MESSAGING) return;

  const log = (...args) => console.log(...args);
  log.event = log;
  log.log = log;
  log.info = (...args) => console.info(...args);
  log.warn = (...args) => console.warn(...args);
  log.error = (...args) => console.error(...args);
  log.debug = (...args) => console.debug(...args);
  log.trace = (...args) => console.debug(...args);

  function normalizeError(error, fallback = 'message failed') {
    if (!error) return fallback;
    if (typeof error === 'string') return error;
    return error.message || String(error) || fallback;
  }

  function getLastRuntimeError() {
    return root.chrome?.runtime?.lastError || null;
  }

  function sendRuntimeMessage(message) {
    return new Promise(resolve => {
      if (typeof root.chrome?.runtime?.sendMessage !== 'function') {
        resolve({ ok: false, error: 'runtime messaging unavailable' });
        return;
      }

      try {
        root.chrome.runtime.sendMessage(message, response => {
          const lastError = getLastRuntimeError();
          if (lastError) {
            resolve({ ok: false, error: normalizeError(lastError, 'runtime message failed') });
            return;
          }
          resolve({ ok: true, data: response });
        });
      } catch (error) {
        resolve({ ok: false, error: normalizeError(error, 'runtime message failed') });
      }
    });
  }

  function sendTabMessage(tabId, message) {
    return new Promise(resolve => {
      if (!tabId || typeof root.chrome?.tabs?.sendMessage !== 'function') {
        resolve({ ok: false, error: 'tab messaging unavailable' });
        return;
      }

      try {
        root.chrome.tabs.sendMessage(tabId, message, response => {
          const lastError = getLastRuntimeError();
          if (lastError) {
            log.debug('tab message skipped', {
              tabId,
              error: normalizeError(lastError, 'tab message failed'),
            });
            resolve({ ok: false, error: normalizeError(lastError, 'tab message failed') });
            return;
          }
          resolve({ ok: true, data: response });
        });
      } catch (error) {
        log.debug('tab message failed synchronously', {
          tabId,
          error: normalizeError(error, 'tab message failed'),
        });
        resolve({ ok: false, error: normalizeError(error, 'tab message failed') });
      }
    });
  }

  root.AMZ_MESSAGING = Object.freeze({
    normalizeError,
    sendRuntimeMessage,
    sendTabMessage,
  });
})(typeof globalThis !== 'undefined' ? globalThis : self);
