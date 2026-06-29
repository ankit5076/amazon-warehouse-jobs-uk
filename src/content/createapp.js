/* Native UK application page controller. */
(async function (root) {
  'use strict';

  if (root.__amazonCreateAppAutomation?.initialized) {
    root.__amazonCreateAppAutomation.setEnabled(true);
    return;
  }

  const { CREATE_APPLICATION, SELECTORS } = root.AMZ_CONSTANTS;
  const dom = root.AMZ_DOM;
  const log = root.AMZ_LOGGER.create('[create-application]', {
    enabled: () => enabled,
    workflow: 'create-application-ui',
    source: 'content/createapp.js',
  });

  let enabled = false;
  let observer = null;
  let scanTimer = null;
  let watchdogTimer = null;
  let routeListenersInstalled = false;
  let enableRequestId = 0;
  const clickedKeys = new Set();
  const seenTraceRoutes = new Set();
  const acceptOfferState = {
    clicked: false,
    clickedAt: 0,
    retried: false,
    notificationSent: false,
  };

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

  function clickButton(button, label, options = {}) {
    if (!enabled || !button || !dom.isClickable(button)) return false;

    const clickKey = options.key || buildClickKey(label, button);
    if (!options.retry && clickedKeys.has(clickKey)) {
      log.trace(label + ' skipped because it was already clicked for this page', {
        clickKey,
      });
      return false;
    }

    clickedKeys.add(clickKey);
    log.info(label + ' click requested', dom.describeButton(button));
    const clicked = dom.clickElement(button, label, options.clickOptions);
    if (!clicked) {
      clickedKeys.delete(clickKey);
      return false;
    }

    scheduleScan('post-' + label, CREATE_APPLICATION.POST_CLICK_RESCAN_MS);
    return true;
  }

  function trackRouteEntry() {
    const context = getApplicationContext();
    const key = routeSignature();
    if (seenTraceRoutes.has(key)) return;
    seenTraceRoutes.add(key);
    root.AMZ_APPLICATION_OBSERVABILITY?.ensureApplicationTrace?.({
      ...context,
      href: window.location.href,
      jobId: context.jobId || root.AMZ_URL.getJobIdFromUrl?.() || null,
      scheduleId: context.scheduleId || root.AMZ_URL.getScheduleIdFromUrl?.() || null,
    }, {
      source: 'content/createapp.js',
      route: getApplicationHashRoute() || null,
    });
  }

  function finalizeAcceptOfferObservability(pageUrl, workflowStepName, context, scheduleId) {
    const observability = root.AMZ_APPLICATION_OBSERVABILITY;
    if (!observability?.loadPendingTrace || !observability?.finalizeAndFlush) return;

    const traceContext = {
      ...context,
      href: pageUrl,
      jobId: context.jobId || root.AMZ_URL.getJobIdFromUrl?.(pageUrl) || null,
      scheduleId,
    };
    void observability.loadPendingTrace(traceContext).then(trace => {
      if (!trace) return null;
      trace.applicationId = context.applicationId || trace.applicationId || null;
      trace.scheduleId = scheduleId || trace.scheduleId || null;
      trace.confirmedScheduleId = scheduleId || trace.confirmedScheduleId || null;
      trace.pageUrl = pageUrl || trace.pageUrl || null;
      return observability.finalizeAndFlush(trace, 'BOOKED', {
        detailedOutcome: 'CONTINGENT_OFFER_ACCEPTED',
        applicationId: trace.applicationId,
        scheduleId: trace.scheduleId,
        confirmedScheduleId: trace.confirmedScheduleId,
        pageUrl: trace.pageUrl,
        workflowStepName: workflowStepName || null,
      }, traceContext);
    }).catch(error => {
      log.debug('accept offer observability finalization skipped', {
        errorMessage: error?.message || String(error),
      });
    });
  }

  async function recordBookingCreditUsage(context, pageUrl, workflowStepName, scheduleId) {
    try {
      const usage = await root.AMZ_PAYMENT_GATE.recordBookingUsage({
        jobId: context.jobId || root.AMZ_URL.getJobIdFromUrl?.(pageUrl) || null,
        scheduleId: scheduleId || context.applicationId || null,
        metadata: {
          source: 'accept-offer-confirmed',
          applicationId: context.applicationId || null,
          workflowStepName: workflowStepName || null,
          pageUrl,
        },
      });
      if (!usage?.ok) {
        log.warn('booking usage recording failed after accept offer confirmation', {
          reason: usage?.reason || 'usage-denied',
          jobId: context.jobId || null,
          scheduleId,
        });
      }
    } catch (error) {
      log.warn('booking usage recording failed after accept offer confirmation', {
        message: error?.message || String(error),
        jobId: context.jobId || null,
        scheduleId,
      });
    }
  }

  function notifyAcceptOfferConfirmed(pageUrl = window.location.href, workflowStepName = getApplicationHashRoute()) {
    if (acceptOfferState.notificationSent) return;
    acceptOfferState.notificationSent = true;
    const context = getApplicationContext(pageUrl);
    const scheduleId = context.scheduleId || root.AMZ_URL.getScheduleIdFromUrl?.(pageUrl) || null;
    finalizeAcceptOfferObservability(pageUrl, workflowStepName, context, scheduleId);
    void recordBookingCreditUsage(context, pageUrl, workflowStepName, scheduleId);
    log.info('accept offer confirmed locally', {
      jobId: context.jobId || root.AMZ_URL.getJobIdFromUrl?.(pageUrl) || null,
      scheduleId,
      applicationId: context.applicationId || null,
      workflowStepName: workflowStepName || 'additional-information',
    });
  }

  function handlePendingAcceptOffer() {
    if (!acceptOfferState.clicked || acceptOfferState.notificationSent) return false;

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
      if (clickButton(button, 'accept offer', {
        key: buildClickKey('accept offer retry', button),
        retry: true,
        clickOptions: { targetSelf: true, telemetryRetry: true },
      })) {
        acceptOfferState.retried = true;
        acceptOfferState.clickedAt = Date.now();
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

  function handleActiveApplicationModal() {
    const modal = findActiveApplicationModal();
    if (!modal) return false;

    const button = findActiveApplicationContinueButton(modal);
    log.debug('active application modal scan', {
      continueButton: dom.describeButton(button),
    });
    if (clickButton(button, 'active application continue')) return true;
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

  function runHandler(handler) {
    if (!handler) return false;
    const button = handler.find();
    if (!button) return false;
    const clicked = clickButton(button, handler.label, {
      clickOptions: handler.clickOptions,
    });
    if (clicked) handler.afterClick?.();
    return clicked;
  }

  function attemptAutomation(trigger = 'scan') {
    if (!enabled) return;
    trackRouteEntry();

    if (handleActiveApplicationModal()) return;
    if (handlePendingAcceptOffer()) return;

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

    if (routeButton && runHandler({
      ...routeHandler,
      find: () => routeButton,
    })) {
      return;
    }

    for (const handler of fallbackHandlersForRoute()) {
      if (runHandler(handler)) return;
    }
  }

  function scheduleScan(reason, delayMs = 0) {
    if (!enabled) return;
    if (scanTimer) clearTimeout(scanTimer);

    const run = () => {
      scanTimer = null;
      attemptAutomation(reason);
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
    seenTraceRoutes.clear();
    acceptOfferState.clicked = false;
    acceptOfferState.clickedAt = 0;
    acceptOfferState.retried = false;
    acceptOfferState.notificationSent = false;
  }

  function setEnabled(nextEnabled) {
    const requestId = ++enableRequestId;
    const wasEnabled = enabled;
    if (nextEnabled !== true) {
      enabled = false;
      cleanup();
      return;
    }

    root.AMZ_PAYMENT_GATE.requireAllowed({ allowCache: true, refresh: false }).then(result => {
      if (requestId !== enableRequestId) return;
      if (!result.ok) {
        enabled = false;
        cleanup();
        void root.AMZ_STORAGE.setLocal({
          [root.AMZ_CONSTANTS.STORAGE_KEYS.ACTIVE]: false,
        });
        log.warn('native application automation blocked by payment gate', {
          reason: result.reason,
        });
        return;
      }
      enabled = true;
      if (!wasEnabled) resetRunState();
      ensureObserver();
    }).catch(error => {
      if (requestId !== enableRequestId) return;
      enabled = false;
      cleanup();
      void root.AMZ_STORAGE.setLocal({
        [root.AMZ_CONSTANTS.STORAGE_KEYS.ACTIVE]: false,
      });
      log.warn('native application automation payment check failed', {
        errorMessage: error?.message || String(error),
      });
    });
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
        setEnabled(message.status === true);
      }
    });
  }

  const storage = await root.AMZ_STORAGE.getLocal([
    root.AMZ_CONSTANTS.STORAGE_KEYS.ACTIVE,
  ]);
  setEnabled(storage[root.AMZ_CONSTANTS.STORAGE_KEYS.ACTIVE] === true);
})(typeof globalThis !== 'undefined' ? globalThis : self);
