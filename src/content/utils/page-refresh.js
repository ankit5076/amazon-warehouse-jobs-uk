/* Refresh the Amazon job-search page when local settings configure it. */
(function (root) {
  'use strict';

  if (root.AMZ_PAGE_REFRESH) return;

  const { STORAGE_KEYS } = root.AMZ_CONSTANTS;
  const state = root.AMZ_STATE;
  const log = (...args) => console.log(...args);
  log.event = log;
  log.log = log;
  log.info = (...args) => console.info(...args);
  log.warn = (...args) => console.warn(...args);
  log.error = (...args) => console.error(...args);
  log.debug = (...args) => console.debug(...args);
  log.trace = (...args) => console.debug(...args);
  let refreshTimerId = null;

  function clearJobSearchRefresh() {
    if (!refreshTimerId) return;
    window.clearTimeout(refreshTimerId);
    refreshTimerId = null;
  }

  async function getConfiguredRefreshIntervalMs() {
    return state.getPageRefreshIntervalMs();
  }

  async function scheduleJobSearchRefresh() {
    clearJobSearchRefresh();
    if (!root.AMZ_URL.isJobSearchPage()) return;

    const intervalMs = await getConfiguredRefreshIntervalMs();
    if (!intervalMs) return;

    refreshTimerId = window.setTimeout(() => {
      window.location.reload();
    }, intervalMs);
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (
      areaName !== 'local' ||
      (
        !changes[STORAGE_KEYS.ACTIVE] &&
        !changes[STORAGE_KEYS.PAGE_REFRESH_JOB_SEARCH_INTERVAL_MS]
      )
    ) return;
    scheduleJobSearchRefresh().catch(error => {
      log.error('Unable to reschedule page refresh:', error);
    });
  });

  root.AMZ_PAGE_REFRESH = Object.freeze({
    scheduleJobSearchRefresh,
    clearJobSearchRefresh,
    getConfiguredRefreshIntervalMs,
  });

  scheduleJobSearchRefresh().catch(error => {
    log.error('Unable to schedule page refresh:', error);
  });
})(typeof globalThis !== 'undefined' ? globalThis : self);
