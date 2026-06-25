/* DOM helpers used by content controllers. */
(function (root) {
  'use strict';

  if (root.AMZ_DOM) return;

  const text = root.AMZ_TEXT;
  const { DOM, SELECTORS, TEXT_LIMITS } = root.AMZ_CONSTANTS;
  const log = root.AMZ_LOGGER.create('[dom]', {
    workflow: 'dom-automation',
    source: 'content/utils/dom.js',
  });

  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async function waitForSelector(
    selector,
    timeoutMs = DOM.WAIT_TIMEOUT_MS,
    intervalMs = DOM.WAIT_INTERVAL_MS
  ) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const element = document.querySelector(selector);
      if (element) return element;
      await delay(intervalMs);
    }
    return null;
  }

  function setInputValue(inputElement, value) {
    if (!inputElement) return;

    const nextValue = String(value || '');
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value'
    )?.set;

    if (nativeSetter) {
      nativeSetter.call(inputElement, nextValue);
    } else {
      inputElement.value = nextValue;
    }

    inputElement.dispatchEvent(new Event('input', { bubbles: true }));
    inputElement.dispatchEvent(new Event('change', { bubbles: true }));
    inputElement.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Tab' }));
  }

  function isClickable(element) {
    const ariaDisabled = element?.getAttribute?.('aria-disabled') === 'true';
    const disabledClass = typeof element?.className === 'string' &&
      /\bdisabled\b/.test(element.className);
    if (!element || element.disabled || ariaDisabled || disabledClass || !element.isConnected) {
      return false;
    }
    const style = window.getComputedStyle(element);
    if (
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      style.pointerEvents === 'none'
    ) {
      return false;
    }
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function getClickableElements(selector) {
    return Array.from(document.querySelectorAll(selector)).filter(isClickable);
  }

  function describeButton(button) {
    if (!button) return null;
    return {
      text: text.compact(button.textContent || ''),
      ariaLabel: button.getAttribute('aria-label') || null,
      testId: button.getAttribute('data-test-id') || null,
      disabled: Boolean(button.disabled),
      className: text.compact(button.className || '', TEXT_LIMITS.BUTTON_CLASSNAME_LENGTH),
    };
  }

  function findButtonByText(targetText) {
    const target = text.normalizeForComparison(targetText);
    if (!target) return null;

    return Array.from(document.querySelectorAll(SELECTORS.BUTTONS)).find(button => {
      const rowText = button.querySelector(SELECTORS.CREATE_APPLICATION_ROW_TEXT)?.textContent;
      const candidates = [
        rowText,
        button.innerText,
        button.textContent,
        button.getAttribute('aria-label'),
        button.getAttribute('title'),
      ].map(text.normalizeForComparison).filter(Boolean);
      return candidates.some(candidate => candidate === target || candidate.includes(target));
    }) || null;
  }

  function safePerformanceNow() {
    return typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();
  }

  function currentUrl() {
    try {
      return root.AMZ_URL?.currentUrl?.() || window.location.href || '';
    } catch (_) {
      return '';
    }
  }

  function routeFromUrl(url) {
    try {
      const parsed = new URL(url);
      const hashRoute = parsed.hash ? parsed.hash.slice(1).split('?')[0] : '';
      return hashRoute || parsed.pathname || null;
    } catch (_) {
      return null;
    }
  }

  function clickMethod(options = {}) {
    if (options.nativeOnly) return 'native';
    if (options.targetSelf) return 'pointer-target-self';
    return 'pointer';
  }

  function recordButtonClickTelemetry(element, label, options, timing) {
    const recorder = root.AMZ_APPLICATION_OBSERVABILITY?.recordButtonClick;
    if (typeof recorder !== 'function') return;

    const pageUrlAfter = currentUrl();
    const pageUrlBefore = timing.pageUrlBefore || pageUrlAfter;
    const description = describeButton(element) || {};
    const context = root.AMZ_URL?.getApplicationContextFromUrl?.(pageUrlAfter) || {};
    const jobId = context.jobId || root.AMZ_URL?.getJobIdFromUrl?.(pageUrlAfter) || null;
    const scheduleId = context.scheduleId || root.AMZ_URL?.getScheduleIdFromUrl?.(pageUrlAfter) || null;

    recorder({
      ...context,
      href: pageUrlAfter,
      jobId,
      scheduleId,
    }, {
      label,
      source: 'content/utils/dom.js',
      clicked: true,
      durationMs: safePerformanceNow() - timing.startedPerfMs,
      method: clickMethod(options),
      retry: options.telemetryRetry === true,
      nativeOnly: options.nativeOnly === true,
      targetSelf: options.targetSelf === true,
      pageUrlBefore,
      pageUrlAfter,
      routeBefore: routeFromUrl(pageUrlBefore),
      routeAfter: routeFromUrl(pageUrlAfter),
      buttonText: description.text,
      buttonAriaLabel: description.ariaLabel,
      buttonTestId: description.testId,
      buttonClassName: description.className,
      buttonDisabled: description.disabled,
    }, {
      epochMs: timing.startedEpochMs,
      perfMs: timing.startedPerfMs,
    });
  }

  function clickElement(element, label = 'element', options = {}) {
    if (!isClickable(element)) {
      log.debug(label + ': element is not clickable');
      return false;
    }

    const timing = {
      startedEpochMs: Date.now(),
      startedPerfMs: safePerformanceNow(),
      pageUrlBefore: currentUrl(),
    };
    const { nativeOnly = false, targetSelf = false } = options;
    if (nativeOnly && typeof element.click === 'function') {
      element.click();
      log.debug(label + ': native click dispatched');
      recordButtonClickTelemetry(element, label, options, timing);
      return true;
    }

    try {
      element.scrollIntoView({ block: 'center', inline: 'center' });
    } catch (_) {
      // Best-effort only; old browsers may not support option objects.
    }
    if (typeof element.focus === 'function') {
      try {
        element.focus({ preventScroll: true });
      } catch (_) {
        element.focus();
      }
    }

    const rect = element.getBoundingClientRect();
    const clientX = rect.left + rect.width / 2;
    const clientY = rect.top + rect.height / 2;
    const hitTarget = typeof document.elementFromPoint === 'function'
      ? document.elementFromPoint(clientX, clientY)
      : null;
    const eventTarget = !targetSelf && hitTarget && element.contains(hitTarget)
      ? hitTarget
      : element;
    const eventInit = {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      clientX,
      clientY,
      screenX: clientX,
      screenY: clientY,
      button: 0,
    };

    [
      ['pointerover', typeof PointerEvent === 'function' ? PointerEvent : MouseEvent, 0],
      ['mouseover', MouseEvent, 0],
      ['pointermove', typeof PointerEvent === 'function' ? PointerEvent : MouseEvent, 0],
      ['mousemove', MouseEvent, 0],
      ['pointerdown', typeof PointerEvent === 'function' ? PointerEvent : MouseEvent, 1],
      ['mousedown', MouseEvent, 1],
      ['pointerup', typeof PointerEvent === 'function' ? PointerEvent : MouseEvent, 0],
      ['mouseup', MouseEvent, 0],
      ['click', MouseEvent, 0],
    ].forEach(([type, EventCtor, buttons]) => {
      eventTarget.dispatchEvent(new EventCtor(type, {
        ...eventInit,
        buttons,
        pointerId: 1,
        pointerType: 'mouse',
        isPrimary: true,
      }));
    });

    if (eventTarget === element && typeof element.click === 'function') {
      element.click();
      log.debug(label + ': native click dispatched after pointer sequence');
      recordButtonClickTelemetry(element, label, options, timing);
      return true;
    }

    log.debug(label + ': click dispatched on hit target');
    recordButtonClickTelemetry(element, label, options, timing);
    return true;
  }

  root.AMZ_DOM = Object.freeze({
    delay,
    waitForSelector,
    setInputValue,
    isClickable,
    getClickableElements,
    describeButton,
    findButtonByText,
    clickElement,
  });
})(typeof globalThis !== 'undefined' ? globalThis : self);
