/* Service worker event routing for Amazon booking automation. */
globalThis.AMZ_IS_SERVICE_WORKER = true;

try {
  importScripts(
    '../shared/constants.js',
    '../shared/utils/time.js',
    '../shared/utils/text.js',
    '../shared/utils/storage.js',
    '../shared/utils/url.js',
    '../shared/utils/messaging.js',
    './tab-service.js'
  );
} catch (error) {
  console.error('[service-worker] shared script load failed:', error);
}

const {
  AMAZON,
  INSTALL_DEFAULTS,
  MESSAGE_ACTIONS,
  STORAGE_KEYS,
} = globalThis.AMZ_CONSTANTS;

function configureSessionStorageAccessLevel() {
  const sessionStorage = chrome?.storage?.session;
  if (!sessionStorage || typeof sessionStorage.setAccessLevel !== 'function') return;
  try {
    const result = sessionStorage.setAccessLevel({
      accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS',
    });
    if (result && typeof result.catch === 'function') result.catch(() => {});
  } catch (_) {
    // Older Chrome versions or restricted contexts can reject this. Storage
    // helpers still fall back to local storage for cross-navigation local traces.
  }
}

configureSessionStorageAccessLevel();

function configureActionVisibility() {
  chrome.action.disable();
  chrome.declarativeContent.onPageChanged.removeRules(undefined, () => {
    chrome.declarativeContent.onPageChanged.addRules([{
      conditions: [new chrome.declarativeContent.PageStateMatcher({ pageUrl: {} })],
      actions: [new chrome.declarativeContent.ShowAction()],
    }]);
  });
}

function callbackPromise(run) {
  return new Promise((resolve, reject) => {
    try {
      run(resolve);
    } catch (error) {
      reject(error);
    }
  });
}

function cookieUrl(cookie) {
  const host = String(cookie.domain || '').replace(/^\./, '');
  const rawPath = String(cookie.path || '/');
  const path = rawPath.startsWith('/') ? rawPath : '/' + rawPath;
  return `${cookie.secure === false ? 'http' : 'https'}://${host}${path}`;
}

async function clearAmazonSessionCookies() {
  if (!chrome.cookies || typeof chrome.cookies.getAll !== 'function') {
    return { removed: 0, attempted: 0 };
  }

  const domains = Array.from(new Set(AMAZON.SESSION_COOKIE_DOMAINS || []));
  const cookieLists = await Promise.all(domains.map(domain => callbackPromise(resolve => {
    chrome.cookies.getAll({ domain }, cookies => resolve(Array.isArray(cookies) ? cookies : []));
  })));
  const seen = new Set();
  const cookies = cookieLists.flat().filter(cookie => {
    const key = [cookie.storeId || '', cookie.domain || '', cookie.path || '', cookie.name || ''].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const removals = await Promise.all(cookies.map(cookie => callbackPromise(resolve => {
    chrome.cookies.remove({
      url: cookieUrl(cookie),
      name: cookie.name,
      storeId: cookie.storeId,
    }, result => resolve(result || null));
  })));

  return {
    attempted: cookies.length,
    removed: removals.filter(Boolean).length,
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.action !== MESSAGE_ACTIONS.LOGOUT_AMAZON_SESSION) return false;
  clearAmazonSessionCookies()
    .then(result => sendResponse({ ok: true, ...result }))
    .catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
  return true;
});

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  configureActionVisibility();

  if (reason === 'install') {
    await globalThis.AMZ_STORAGE.setLocal(INSTALL_DEFAULTS);
    chrome.tabs.create({ url: AMAZON.URLS.JOB_SEARCH });
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete' || !globalThis.AMZ_URL.isApplicationPage(tab.url)) {
    return;
  }

  globalThis.AMZ_STORAGE.getLocal(STORAGE_KEYS.ACTIVE).then(storage => {
    if (storage[STORAGE_KEYS.ACTIVE] !== true) return null;
    return globalThis.AMZ_TAB_SERVICE.injectCreateApplicationScript(tabId);
  }).catch(() => {});
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local' || !changes[STORAGE_KEYS.ACTIVE]) return;
  globalThis.AMZ_TAB_SERVICE.syncExtensionStateToTabs(
    changes[STORAGE_KEYS.ACTIVE].newValue === true
  );
});
