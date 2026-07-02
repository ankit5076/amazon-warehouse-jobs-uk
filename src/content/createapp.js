/* Native UK application page controller. */
(async function (root) {
  'use strict';

  if (root.__amazonCreateAppAutomation?.initialized) {
    await root.__amazonCreateAppAutomation.setEnabled(true);
    return;
  }

  const { CREATE_APPLICATION, SELECTORS } = root.AMZ_CONSTANTS;
  const dom = root.AMZ_DOM;
  const access = root.AMZ_ACCESS;
  function writeLog(level, ...args) {
    if (!enabled && ['debug', 'trace'].includes(level)) return;
    const method = level === 'trace' ? 'debug' : level;
    console[method](...args);
  }
  const log = (...args) => writeLog('log', ...args);
  log.event = log;
  log.log = log;
  log.info = (...args) => writeLog('info', ...args);
  log.warn = (...args) => writeLog('warn', ...args);
  log.error = (...args) => writeLog('error', ...args);
  log.debug = (...args) => writeLog('debug', ...args);
  log.trace = (...args) => writeLog('trace', ...args);

  let enabled = false;
  let observer = null;
  let scanTimer = null;
  let watchdogTimer = null;
  let routeListenersInstalled = false;
  let enableRequestId = 0;
  const clickedKeys = new Set();
  const acceptOfferState = {
    clicked: false,
    clickedAt: 0,
    retried: false,
    confirmed: false,
  };
  const USAGE_AUDIT_LABELS = new Set([
    'accept offer',
    'submit shift preferences',
    'create application',
  ]);

  function normalizeText(value) {
    return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
  }

  function getApplicationHashRoute() {
    const hash = window.location.hash || '';
    if (!hash.startsWith('#/')) return '';
    return hash.slice(2).split('?')[0];
  }

  function isApplicationHashRoute(route) {
    return getApplicationHashRoute() === route;
  }

  function getApplicationContext(pageUrl = window.location.href) {
    return root.AMZ_URL.getApplicationContextFromUrl?.(pageUrl) || {
      jobId: root.AMZ_URL.getJobIdFromUrl?.(pageUrl) || null,
      scheduleId: root.AMZ_URL.getScheduleIdFromUrl?.(pageUrl) || null,
    };
  }

  async function notifyAccessBlocked(result = {}, details = {}) {
    const message = result.message ||
      'Search can continue, but booking requires an active 60-day access pass.';
    log.warn('native application automation blocked by paid-access gate', {
      ...details,
      message,
      accessSource: result.source || null,
      accessExpiresAt: result.accessExpiresAt || null,
    });
    await access?.showAccessRequiredPrompt?.({
      amazonEmailId: result.amazonEmailId,
      message,
    });
  }

  async function ensureAccessForApplication(label, options = {}) {
    if (!access?.ensureFreshAccess) {
      await notifyAccessBlocked({
        message: 'Paid-access validation is unavailable. Booking is locked.',
      }, { label });
      return false;
    }

    const context = getApplicationContext();
    const metadata = {
      label,
      route: getApplicationHashRoute(),
      pageUrl: window.location.href,
      jobId: context.jobId || null,
      scheduleId: context.scheduleId || null,
      applicationId: context.applicationId || null,
    };
    const result = options.recordUsage === true && access.recordBookingUsage
      ? await access.recordBookingUsage({
          source: 'application:' + label,
          jobId: context.jobId || null,
          scheduleId: context.scheduleId || null,
          metadata,
        })
      : await access.ensureFreshAccess({
          source: 'application:' + label,
          metadata,
        });

    if (result.allowed === true) return true;
    await notifyAccessBlocked(result, metadata);
    return false;
  }

  function routeSignature(pageUrl = window.location.href) {
    const context = getApplicationContext(pageUrl);
    return [
      getApplicationHashRoute(),
      context.jobId || '',
      context.applicationId || '',
      context.scheduleId || '',
    ].join('|');
  }

  function queryElement(selector, rootElement = document) {
    try {
      return rootElement.querySelector(selector);
    } catch (_) {
      return null;
    }
  }

  function queryElements(selector, rootElement = document) {
    try {
      return Array.from(rootElement.querySelectorAll(selector));
    } catch (_) {
      return [];
    }
  }

  function firstClickable(elements) {
    const candidates = elements.filter(Boolean);
    return candidates.find(element => dom.isClickable(element)) || candidates[0] || null;
  }

  function buttonMatchesText(button, targetText) {
    const target = normalizeText(targetText);
    if (!button || !target) return false;

    return [
      button.innerText,
      button.textContent,
      button.getAttribute?.('aria-label'),
      button.getAttribute?.('title'),
    ].some(candidate => {
      const normalized = normalizeText(candidate);
      return normalized === target || normalized.includes(target);
    });
  }

  function findButtonBySelectorAndText(selector, targetText) {
    return firstClickable(
      queryElements(selector).filter(button => buttonMatchesText(button, targetText))
    );
  }

  function findStartApplicationButton() {
    return firstClickable([
      queryElement(SELECTORS.START_APPLICATION_BUTTON),
      dom.findButtonByText(CREATE_APPLICATION.BUTTON_TEXT.START_APPLICATION),
    ]);
  }

  function findStartAssessmentButton() {
    if (!isApplicationHashRoute('assessment-consent')) return null;
    return dom.findButtonByText(CREATE_APPLICATION.BUTTON_TEXT.START_ASSESSMENT);
  }

  function isAssessmentRoute(route = getApplicationHashRoute()) {
    return String(route || '').startsWith('assessment');
  }

  function findActiveApplicationModal() {
    const modal = queryElement(SELECTORS.ACTIVE_APPLICATION_MODAL);
    if (!modal) return null;
    const modalText = normalizeText(modal.textContent);
    return modalText.includes(normalizeText(CREATE_APPLICATION.ACTIVE_APPLICATION_TITLE))
      ? modal
      : null;
  }

  function findActiveApplicationContinueButton(modal = findActiveApplicationModal()) {
    if (!modal) return null;
    return firstClickable(
      queryElements(SELECTORS.BUTTONS, modal).filter(button =>
        buttonMatchesText(button, CREATE_APPLICATION.BUTTON_TEXT.ACTIVE_APPLICATION_CONTINUE)
      )
    );
  }

  function findJobOpportunityCard() {
    if (!isApplicationHashRoute('job-opportunities')) return null;
    const scheduleCards = queryElements(SELECTORS.JOB_OPPORTUNITY_SCHEDULE_CARDS);
    const fallbackCards = queryElements(SELECTORS.JOB_OPPORTUNITY_CARDS);
    const cards = [...scheduleCards, ...fallbackCards];

    return firstClickable(cards.filter(card => {
      const cardText = normalizeText(card.textContent);
      return (
        cardText.includes('start date') &&
        cardText.includes('pay rate') &&
        cardText.includes('location') &&
        !cardText.includes('select your shift preferences')
      );
    }));
  }

  function findSelectThisJobButton() {
    if (!isApplicationHashRoute('job-opportunities/job-confirmation')) return null;
    return dom.findButtonByText(CREATE_APPLICATION.BUTTON_TEXT.SELECT_THIS_JOB);
  }

  function findAcceptOfferButton() {
    if (!isApplicationHashRoute('contingent-offer')) return null;
    return findButtonBySelectorAndText(
      SELECTORS.ACCEPT_OFFER_BUTTON,
      CREATE_APPLICATION.BUTTON_TEXT.ACCEPT_OFFER
    ) || dom.findButtonByText(CREATE_APPLICATION.BUTTON_TEXT.ACCEPT_OFFER);
  }

  function findSubmitShiftPreferencesButton() {
    if (!isApplicationHashRoute('no-available-shift')) return null;
    return dom.findButtonByText(CREATE_APPLICATION.BUTTON_TEXT.SUBMIT_SHIFT_PREFERENCES);
  }

  function buildClickKey(label, button) {
    const buttonText = normalizeText(button?.textContent || button?.getAttribute?.('aria-label') || '')
      .slice(0, 120);
    return [label, routeSignature(), buttonText].join('|');
  }

  async function clickButton(button, label, options = {}) {
    if (!enabled || !button || !dom.isClickable(button)) return false;

    const clickKey = options.key || buildClickKey(label, button);
    if (!options.retry && clickedKeys.has(clickKey)) {
      log.trace(label + ' skipped because it was already clicked for this page', {
        clickKey,
      });
      return false;
    }

    clickedKeys.add(clickKey);
    const hasAccess = await ensureAccessForApplication(label, {
      recordUsage: USAGE_AUDIT_LABELS.has(label),
    });
    if (!hasAccess) {
      clickedKeys.delete(clickKey);
      cleanup();
      return false;
    }

    log.info(label + ' click requested', dom.describeButton(button));
    const clicked = dom.clickElement(button, label, options.clickOptions);
    if (!clicked) {
      clickedKeys.delete(clickKey);
      return false;
    }

    scheduleScan('post-' + label, CREATE_APPLICATION.POST_CLICK_RESCAN_MS);
    return true;
  }

  function notifyAcceptOfferConfirmed(pageUrl = window.location.href, workflowStepName = getApplicationHashRoute()) {
    if (acceptOfferState.confirmed) return;
    acceptOfferState.confirmed = true;
    const context = getApplicationContext(pageUrl);
    const scheduleId = context.scheduleId || root.AMZ_URL.getScheduleIdFromUrl?.(pageUrl) || null;
    log.info('accept offer confirmed locally', {
      jobId: context.jobId || root.AMZ_URL.getJobIdFromUrl?.(pageUrl) || null,
      scheduleId,
      applicationId: context.applicationId || null,
      workflowStepName: workflowStepName || 'additional-information',
    });
  }

  async function handlePendingAcceptOffer() {
    if (!acceptOfferState.clicked || acceptOfferState.confirmed) return false;

    const route = getApplicationHashRoute();
    if (route && route !== 'contingent-offer') {
      notifyAcceptOfferConfirmed(window.location.href, route);
      return false;
    }

    const elapsedMs = Date.now() - acceptOfferState.clickedAt;
    if (
      !acceptOfferState.retried &&
      elapsedMs >= CREATE_APPLICATION.ACCEPT_OFFER_RETRY_DELAY_MS
    ) {
      const button = findAcceptOfferButton();
      acceptOfferState.retried = true;
      if (await clickButton(button, 'accept offer', {
        key: buildClickKey('accept offer retry', button),
        retry: true,
        clickOptions: { targetSelf: true },
      })) {
        acceptOfferState.clickedAt = Date.now();
      } else {
        acceptOfferState.retried = false;
      }
      return true;
    }

    if (route === 'contingent-offer') {
      const waitMs = Math.max(
        250,
        Math.min(
          1000,
          CREATE_APPLICATION.ACCEPT_OFFER_RETRY_DELAY_MS - elapsedMs
        )
      );
      scheduleScan('accept-offer-confirm-wait', waitMs);
      return true;
    }

    return false;
  }

  async function handleActiveApplicationModal() {
    const modal = findActiveApplicationModal();
    if (!modal) return false;

    const button = findActiveApplicationContinueButton(modal);
    log.debug('active application modal scan', {
      continueButton: dom.describeButton(button),
    });
    if (await clickButton(button, 'active application continue')) return true;
    scheduleScan('active-application-modal-wait', CREATE_APPLICATION.POST_CLICK_RESCAN_MS);
    return true;
  }

  const routeHandlers = Object.freeze([
    Object.freeze({
      route: 'pre-consent',
      label: 'next',
      find: () => dom.findButtonByText(CREATE_APPLICATION.BUTTON_TEXT.NEXT),
    }),
    Object.freeze({
      route: 'consent',
      label: 'start application',
      find: findStartApplicationButton,
    }),
    Object.freeze({
      route: 'assessment-consent',
      label: 'start assessment',
      find: findStartAssessmentButton,
    }),
    Object.freeze({
      route: 'job-opportunities',
      label: 'job opportunity',
      find: findJobOpportunityCard,
    }),
    Object.freeze({
      route: 'job-opportunities/job-confirmation',
      label: 'select this job',
      find: findSelectThisJobButton,
    }),
    Object.freeze({
      route: 'contingent-offer',
      label: 'accept offer',
      find: findAcceptOfferButton,
      clickOptions: { targetSelf: true },
      afterClick: () => {
        acceptOfferState.clicked = true;
        acceptOfferState.clickedAt = Date.now();
        acceptOfferState.retried = false;
      },
    }),
    Object.freeze({
      route: 'no-available-shift',
      label: 'submit shift preferences',
      find: findSubmitShiftPreferencesButton,
    }),
  ]);

  function fallbackHandlersForRoute() {
    const route = getApplicationHashRoute();
    const handlers = [];

    if (isAssessmentRoute(route)) return handlers;

    if (!route) {
      handlers.push({
        label: 'start application',
        find: findStartApplicationButton,
      }, {
        label: 'next',
        find: () => dom.findButtonByText(CREATE_APPLICATION.BUTTON_TEXT.NEXT),
      });
    }
    if (route !== 'job-opportunities/job-confirmation') {
      handlers.push({
        label: 'select this job',
        find: findSelectThisJobButton,
      });
    }
    if (route !== 'contingent-offer') {
      handlers.push({
        label: 'accept offer',
        find: findAcceptOfferButton,
        clickOptions: { targetSelf: true },
      });
    }

    handlers.push(
      {
        label: 'continue',
        find: () => dom.findButtonByText(CREATE_APPLICATION.BUTTON_TEXT.CONTINUE),
      },
      {
        label: 'create application',
        find: () => dom.findButtonByText(CREATE_APPLICATION.BUTTON_TEXT.CREATE_APPLICATION),
      }
    );

    return handlers;
  }

  async function runHandler(handler) {
    if (!handler) return false;
    const button = handler.find();
    if (!button) return false;
    const clicked = await clickButton(button, handler.label, {
      clickOptions: handler.clickOptions,
    });
    if (clicked) handler.afterClick?.();
    return clicked;
  }

  async function attemptAutomation(trigger = 'scan') {
    if (!enabled) return;

    if (await handleActiveApplicationModal()) return;
    if (await handlePendingAcceptOffer()) return;

    const route = getApplicationHashRoute();
    const routeHandler = routeHandlers.find(handler => handler.route === route);
    const routeButton = routeHandler?.find?.();

    log.debug('automation scan: ' + trigger, {
      route,
      routeButton: dom.describeButton(routeButton),
      routeHandler: routeHandler?.label || null,
      acceptOfferClicked: acceptOfferState.clicked,
      acceptOfferRetried: acceptOfferState.retried,
    });

    if (routeButton && await runHandler({
      ...routeHandler,
      find: () => routeButton,
    })) {
      return;
    }

    for (const handler of fallbackHandlersForRoute()) {
      if (await runHandler(handler)) return;
    }
  }

  function scheduleScan(reason, delayMs = 0) {
    if (!enabled) return;
    if (scanTimer) clearTimeout(scanTimer);

    const run = () => {
      scanTimer = null;
      void attemptAutomation(reason);
    };

    if (delayMs > 0) {
      scanTimer = setTimeout(run, delayMs);
      return;
    }

    const frame = typeof root.requestAnimationFrame === 'function'
      ? root.requestAnimationFrame.bind(root)
      : callback => setTimeout(callback, 0);
    scanTimer = setTimeout(run, CREATE_APPLICATION.POST_CLICK_RESCAN_MS);
    frame(() => {
      if (!scanTimer) return;
      clearTimeout(scanTimer);
      run();
    });
  }

  function scheduleRouteChangeScan(reason) {
    scheduleScan(reason, CREATE_APPLICATION.ROUTE_CHANGE_RESCAN_MS);
  }

  function patchHistoryForRouteChanges() {
    const historyRef = root.history;
    if (!historyRef || historyRef.__amzNativeApplicationRoutePatch) return;

    ['pushState', 'replaceState'].forEach(method => {
      const original = historyRef[method];
      if (typeof original !== 'function') return;
      historyRef[method] = function patchedHistoryState(...args) {
        const result = original.apply(this, args);
        scheduleRouteChangeScan('history-' + method);
        return result;
      };
    });

    try {
      Object.defineProperty(historyRef, '__amzNativeApplicationRoutePatch', {
        value: true,
        configurable: false,
      });
    } catch (_) {
      historyRef.__amzNativeApplicationRoutePatch = true;
    }
  }

  function installRouteChangeListeners() {
    if (routeListenersInstalled) return;
    routeListenersInstalled = true;
    patchHistoryForRouteChanges();
    window.addEventListener('hashchange', () => scheduleRouteChangeScan('hashchange'));
    window.addEventListener('popstate', () => scheduleRouteChangeScan('popstate'));
  }

  function startWatchdog() {
    if (watchdogTimer) clearInterval(watchdogTimer);
    watchdogTimer = setInterval(() => {
      scheduleScan('watchdog');
    }, CREATE_APPLICATION.SCAN_INTERVAL_MS);
  }

  function ensureObserver() {
    if (!document.body) {
      document.addEventListener('DOMContentLoaded', () => ensureObserver(), { once: true });
      return;
    }

    if (!observer) {
      observer = new MutationObserver(mutations => {
        log.trace('mutation observed', {
          count: mutations.length,
        }, {
          throttleKey: 'createapp-mutations',
          throttleMs: root.AMZ_CONSTANTS.LOGGING.HIGH_FREQUENCY_THROTTLE_MS,
        });
        scheduleScan('mutation');
      });
    }

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['disabled', 'aria-disabled', 'class', 'style'],
    });
    installRouteChangeListeners();
    startWatchdog();
    scheduleScan('initial scan');
  }

  function cleanup() {
    observer?.disconnect();
    observer = null;
    if (scanTimer) clearTimeout(scanTimer);
    if (watchdogTimer) clearInterval(watchdogTimer);
    scanTimer = null;
    watchdogTimer = null;
  }

  function resetRunState() {
    clickedKeys.clear();
    acceptOfferState.clicked = false;
    acceptOfferState.clickedAt = 0;
    acceptOfferState.retried = false;
    acceptOfferState.confirmed = false;
  }

  async function setEnabled(nextEnabled) {
    const requestId = ++enableRequestId;
    const wasEnabled = enabled;
    if (nextEnabled !== true) {
      enabled = false;
      cleanup();
      return;
    }

    const hasAccess = await ensureAccessForApplication('application enable');
    if (requestId !== enableRequestId) return;
    if (!hasAccess) {
      enabled = false;
      cleanup();
      return;
    }
    enabled = true;
    if (!wasEnabled) resetRunState();
    ensureObserver();
  }

  root.__amazonCreateAppAutomation = Object.freeze({
    initialized: true,
    cleanup,
    setEnabled,
  });

  if (root.chrome?.runtime?.onMessage?.addListener) {
    chrome.runtime.onMessage.addListener(message => {
      if (
        message?.action === root.AMZ_CONSTANTS.MESSAGE_ACTIONS.EXTENSION_STATE_CHANGED ||
        message?.action === root.AMZ_CONSTANTS.MESSAGE_ACTIONS.ACTIVATE
      ) {
        void setEnabled(message.status === true);
      }
    });
  }

  const storage = await root.AMZ_STORAGE.getLocal([
    root.AMZ_CONSTANTS.STORAGE_KEYS.ACTIVE,
  ]);
  await setEnabled(storage[root.AMZ_CONSTANTS.STORAGE_KEYS.ACTIVE] === true);
})(typeof globalThis !== 'undefined' ? globalThis : self);
