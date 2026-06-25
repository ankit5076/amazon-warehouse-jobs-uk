/* Compact application-attempt observability traces for Amazon Shifts booking races. */
(function (root) {
  'use strict';

  if (root.AMZ_APPLICATION_OBSERVABILITY) return;

  const { AMAZON, CREATE_APPLICATION, STORAGE_KEYS } = root.AMZ_CONSTANTS;
  const storage = root.AMZ_STORAGE;
  const log = root.AMZ_LOGGER?.create?.('[application-observability]', {
    workflow: 'application-observability',
    source: 'content/utils/application-observability.js',
  }) || {
    debug: () => {},
    warn: () => {},
    error: () => {},
  };

  const TERMINAL_OUTCOMES = new Set([
    'BOOKED',
    'SCHEDULE_UNAVAILABLE',
    'RACE_LOST',
    'APPLICATION_CREATED_WITHOUT_SCHEDULE',
    'CAPTCHA_FAILED',
    'ALREADY_APPLIED',
    'ONE_ACTIVE_APPLICATION',
    'EXACT_DUPLICATE_ACCOUNT',
    'AUTH_REQUIRED',
    'NETWORK_TIMEOUT',
    'SERVER_OR_PROXY_ERROR',
    'MALFORMED_RESPONSE',
    'UNKNOWN_ERROR',
    'DEACTIVATED',
  ]);
  const PROGRESS_OUTCOMES = new Set([
    'JOB_MATCHED',
    'APPLICATION_CREATED',
    'CAPTCHA_REQUIRED',
  ]);
  const MAX_TIMELINE_EVENTS = 80;
  const MAX_SAMPLE_LENGTH = 220;
  const PENDING_TTL_MS = Math.max(
    60 * 1000,
    Number(CREATE_APPLICATION.APPLICATION_OBSERVABILITY_PENDING_TTL_MS) || 10 * 60 * 1000
  );
  let activeTrace = null;

  function safePerformanceNow() {
    return typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();
  }

  function istIso(epochMs = Date.now()) {
    return root.AMZ_TIME?.formatIstIso?.(epochMs) || new Date(epochMs).toISOString();
  }

  function istCompact(epochMs = Date.now()) {
    return root.AMZ_TIME?.formatIstCompact?.(epochMs) ||
      new Date(epochMs).toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  }

  function normalizeText(value, limit = MAX_SAMPLE_LENGTH) {
    if (value === null || typeof value === 'undefined') return null;
    if (typeof value === 'object' || typeof value === 'function') return null;
    const normalized = String(value).replace(/\s+/g, ' ').trim();
    if (!normalized || normalized === 'null' || normalized === 'undefined') return null;
    return normalized.length > limit ? normalized.slice(0, limit) + '...' : normalized;
  }

  function numberOrNull(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function integerOrNull(value) {
    const parsed = numberOrNull(value);
    return parsed === null ? null : Math.max(0, Math.round(parsed));
  }

  function safeJson(value, depth = 0) {
    if (value === null || typeof value === 'undefined') return null;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return typeof value === 'string' ? normalizeText(value) : value;
    }
    if (value instanceof Error) return normalizeText(value.message);
    if (depth >= 2) return normalizeText(JSON.stringify(value).slice(0, MAX_SAMPLE_LENGTH));
    if (Array.isArray(value)) return value.slice(0, 5).map(item => safeJson(item, depth + 1));
    if (typeof value === 'object') {
      const cleaned = {};
      Object.entries(value).slice(0, 20).forEach(([key, item]) => {
        if (typeof item === 'function' || typeof item === 'undefined') return;
        const safe = safeJson(item, depth + 1);
        if (safe !== null && typeof safe !== 'undefined') cleaned[key] = safe;
      });
      return Object.keys(cleaned).length ? cleaned : null;
    }
    return normalizeText(value);
  }

  function sanitizeDetails(details) {
    const cleaned = safeJson(details);
    return cleaned && typeof cleaned === 'object' && !Array.isArray(cleaned) ? cleaned : undefined;
  }

  function createAttemptId(jobId) {
    const stamp = istCompact();
    const token = normalizeText(jobId, 18)?.replace(/[^A-Za-z0-9]/g, '').slice(-12) || 'job';
    const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
    return `AS-${stamp}-${token}-${rand}`;
  }

  function extensionVersion() {
    try {
      return root.chrome?.runtime?.getManifest?.()?.version || null;
    } catch (_) {
      return null;
    }
  }

  function recordMark(trace, phaseKey, perfMs, epochMs) {
    if (!trace || !phaseKey) return;
    if (!trace.marks) trace.marks = {};
    if (!trace.marksEpoch) trace.marksEpoch = {};
    trace.marks[phaseKey] = typeof perfMs === 'number' ? perfMs : safePerformanceNow();
    trace.marksEpoch[phaseKey] = typeof epochMs === 'number' ? epochMs : Date.now();
  }

  function timelineCategory(name) {
    const normalized = String(name || '');
    if (normalized === 'schedule_apply_clicked' || normalized.startsWith('button_click')) {
      return 'button_click';
    }
    if (
      normalized.includes('api') ||
      normalized.includes('request') ||
      normalized.includes('candidate_resolve') ||
      normalized.includes('job_detail_prefetch') ||
      normalized.includes('schedule_detail_fetch') ||
      normalized.includes('schedule_recovery_fetch') ||
      normalized.includes('create_application_request') ||
      normalized.includes('confirm_job_request')
    ) {
      return 'amazon_api';
    }
    if (normalized.includes('captcha') || normalized.includes('waf')) return 'waf_captcha';
    if (
      normalized.includes('verify') ||
      normalized.includes('verified') ||
      normalized.includes('workflow')
    ) {
      return 'verification';
    }
    if (normalized.includes('observability')) return 'local_observability';
    if (normalized.includes('job_search')) return 'job_search';
    return 'extension_js';
  }

  function eventEpoch(event = {}) {
    if (typeof event.epoch_ms === 'number' && Number.isFinite(event.epoch_ms)) return event.epoch_ms;
    const parsed = Date.parse(event.at || '');
    return Number.isNaN(parsed) ? null : parsed;
  }

  function timelineForPayload(trace) {
    const events = Array.isArray(trace?.eventTimeline) ? trace.eventTimeline : [];
    const sorted = events.slice().sort((left, right) => {
      const leftEpoch = eventEpoch(left);
      const rightEpoch = eventEpoch(right);
      if (leftEpoch !== null && rightEpoch !== null && leftEpoch !== rightEpoch) {
        return leftEpoch - rightEpoch;
      }
      return events.indexOf(left) - events.indexOf(right);
    });
    return sorted.map((event, index) => {
      const currentEpoch = eventEpoch(event);
      const previousEpoch = index > 0 ? eventEpoch(sorted[index - 1]) : null;
      return {
        ...event,
        category: event.category || timelineCategory(event.name),
        since_previous_ms:
          currentEpoch !== null && previousEpoch !== null
            ? Math.max(0, Math.round(currentEpoch - previousEpoch))
            : (index === 0 ? 0 : null),
      };
    });
  }

  function recordApplicationEventAt(trace, name, details, phaseKey, timing = {}) {
    if (!trace || !name) return null;
    const epochMs = typeof timing.epochMs === 'number' ? timing.epochMs : Date.now();
    const perfMs = typeof timing.perfMs === 'number' ? timing.perfMs : safePerformanceNow();
    if (!Array.isArray(trace.eventTimeline)) trace.eventTimeline = [];
    if (phaseKey) recordMark(trace, phaseKey, perfMs, epochMs);
    const event = {
      name,
      at: istIso(epochMs),
      epoch_ms: epochMs,
      elapsed_ms: typeof trace.startEpochMs === 'number'
        ? Math.max(0, Math.round(epochMs - trace.startEpochMs))
        : null,
      category: timelineCategory(name),
    };
    const sanitized = sanitizeDetails(details);
    if (sanitized) event.details = sanitized;
    trace.eventTimeline.push(event);
    if (trace.eventTimeline.length > MAX_TIMELINE_EVENTS) {
      trace.eventTimeline.splice(0, trace.eventTimeline.length - MAX_TIMELINE_EVENTS);
    }
    return event;
  }

  function recordApplicationEvent(trace, name, details, phaseKey) {
    return recordApplicationEventAt(trace, name, details, phaseKey);
  }

  function summarizeJob(job = {}) {
    return {
      jobId: normalizeText(job.jobId, 80),
      scheduleId: normalizeText(job.scheduleId, 80),
      jobTitle: normalizeText(job.jobTitle),
      city: normalizeText(job.city, 80),
      state: normalizeText(job.state, 40),
      locationName: normalizeText(job.locationName),
      employmentType: normalizeText(job.employmentTypeL10N || job.employmentType, 80),
      jobType: normalizeText(job.jobTypeL10N || job.jobType, 80),
      pay: normalizeText(
        job.totalPayRateMaxL10N ||
        job.totalPayRateMinL10N ||
        job.totalPayRateMax ||
        job.totalPayRateMin,
        80
      ),
      scheduleCount: integerOrNull(job.scheduleCount),
    };
  }

  function createApplicationAttemptTrace({
    matchedJob,
    searchResult = {},
    searchContext = {},
    matchDiagnostics = null,
  } = {}) {
    const durationMs = integerOrNull(searchResult.durationMs) || 0;
    const searchEndEpochMs = Date.now();
    const searchStartEpochMs = searchEndEpochMs - durationMs;
    const searchEndPerfMs = safePerformanceNow();
    const searchStartPerfMs = searchEndPerfMs - durationMs;
    const job = summarizeJob(matchedJob || {});
    const trace = {
      attemptId: createAttemptId(job.jobId),
      startedAt: istIso(searchStartEpochMs),
      startEpochMs: searchStartEpochMs,
      startMs: searchStartPerfMs,
      expiresAt: searchEndEpochMs + PENDING_TTL_MS,
      outcome: 'JOB_MATCHED',
      observabilityStage: 'PROGRESS',
      isTerminal: false,
      detailedOutcome: 'JOB_MATCHED',
      extensionVersion: extensionVersion(),
      country: AMAZON.COUNTRY_CONFIG?.country || null,
      locale: AMAZON.COUNTRY_CONFIG?.locale || null,
      amazonDomain: AMAZON.COUNTRY_CONFIG?.domain || null,
      pageUrl: root.location?.href || null,
      jobId: job.jobId,
      scheduleId: job.scheduleId,
      confirmedScheduleId: null,
      applicationId: null,
      city: job.city,
      state: job.state,
      locationName: job.locationName,
      jobTitle: job.jobTitle,
      employmentType: job.employmentType,
      jobType: job.jobType,
      pay: job.pay,
      searchHttpStatus: integerOrNull(searchResult.status),
      searchJobCount: Array.isArray(searchResult.jobCards) ? searchResult.jobCards.length : null,
      matchedJobCount: matchDiagnostics?.counts?.matched ?? null,
      searchDetails: normalizeText(searchResult.details),
      selectedCity: normalizeText(searchContext.selectedCity, 80),
      allCitiesSelected: searchContext.allCitiesSelected === true,
      selectedJobTypes: Array.isArray(searchContext.jobTypes) ? searchContext.jobTypes.slice(0, 8) : [],
      cityTagCount: integerOrNull(searchContext.cityTagCount),
      matchDiagnostics: safeJson(matchDiagnostics),
      searchFetchMs: durationMs || null,
      searchResponseToMatchMs: null,
      matchToJobDetailNavigationMs: null,
      matchToApplicationRouteMs: null,
      scheduleRecoveryFetchMs: null,
      wafTokenMs: null,
      candidateResolveMs: null,
      jobDetailPrefetchMs: null,
      scheduleDetailFetchMs: null,
      scheduleVerifyMs: null,
      createApplicationRequestMs: null,
      applicationCreatedToConfirmDispatchMs: null,
      confirmJobRequestMs: null,
      captchaWaitMs: null,
      reservationVerifyMs: null,
      workflowWsMs: null,
      workflowUpdateMs: null,
      confirmToTerminalMs: null,
      pendingStatePersistMs: null,
      observabilityOverheadMs: 0,
      observabilityPostCount: 0,
      observabilityPostErrorCount: 0,
      observabilityLastPostMs: null,
      totalAttemptMs: null,
      createHttpStatus: null,
      confirmHttpStatus: null,
      reservationHttpStatus: null,
      scheduleDetailHttpStatus: null,
      jobDetailHttpStatus: null,
      scheduleRecoveryHttpStatus: null,
      workflowHttpStatus: null,
      errorCode: null,
      errorMessage: null,
      errorClassification: null,
      captchaRequired: false,
      fallbackWithoutSchedule: false,
      fallbackScheduleCount: null,
      extensionDeactivatedAt: null,
      postedOutcomes: [],
      eventTimeline: [],
      marks: {},
      marksEpoch: {},
    };
    recordApplicationEventAt(trace, 'job_search_fetch_start', {
      selected_city: trace.selectedCity,
      all_cities_selected: trace.allCitiesSelected,
    }, 'searchFetchStartAt', {
      epochMs: searchStartEpochMs,
      perfMs: searchStartPerfMs,
    });
    recordApplicationEventAt(trace, 'job_search_fetch_end', {
      status: trace.searchHttpStatus,
      duration_ms: durationMs,
      job_count: trace.searchJobCount,
    }, 'searchFetchEndAt', {
      epochMs: searchEndEpochMs,
      perfMs: searchEndPerfMs,
    });
    recordApplicationEventAt(trace, 'job_matched', {
      job_id: trace.jobId,
      city: trace.city,
      location_name: trace.locationName,
      schedule_count: job.scheduleCount,
    }, 'jobMatchedAt', {
      epochMs: searchEndEpochMs,
      perfMs: searchEndPerfMs,
    });
    activeTrace = trace;
    return trace;
  }

  function phaseDuration(trace, startKey, endKey) {
    if (!trace) return null;
    const startEpoch = trace.marksEpoch?.[startKey];
    const endEpoch = trace.marksEpoch?.[endKey];
    if (typeof startEpoch === 'number' && typeof endEpoch === 'number') {
      return Math.max(0, Math.round(endEpoch - startEpoch));
    }
    const startPerf = trace.marks?.[startKey];
    const endPerf = trace.marks?.[endKey];
    if (typeof startPerf === 'number' && typeof endPerf === 'number') {
      return Math.max(0, Math.round(endPerf - startPerf));
    }
    return null;
  }

  function refreshDurations(trace) {
    if (!trace) return trace;
    trace.searchFetchMs = phaseDuration(trace, 'searchFetchStartAt', 'searchFetchEndAt') || trace.searchFetchMs;
    trace.searchResponseToMatchMs = phaseDuration(trace, 'searchFetchEndAt', 'jobMatchedAt');
    trace.matchToJobDetailNavigationMs = phaseDuration(trace, 'jobMatchedAt', 'jobDetailNavigationAt');
    trace.matchToApplicationRouteMs = phaseDuration(trace, 'jobMatchedAt', 'applicationRouteAt');
    trace.scheduleRecoveryFetchMs = phaseDuration(trace, 'scheduleRecoveryFetchStartAt', 'scheduleRecoveryFetchEndAt');
    trace.wafTokenMs = phaseDuration(trace, 'wafTokenStartAt', 'wafTokenEndAt');
    trace.candidateResolveMs = phaseDuration(trace, 'candidateResolveStartAt', 'candidateResolveEndAt');
    trace.jobDetailPrefetchMs = phaseDuration(trace, 'jobDetailPrefetchStartAt', 'jobDetailPrefetchEndAt');
    trace.scheduleDetailFetchMs = phaseDuration(trace, 'scheduleDetailFetchStartAt', 'scheduleDetailFetchEndAt');
    trace.scheduleVerifyMs = phaseDuration(trace, 'scheduleDetailFetchStartAt', 'scheduleVerifiedAt');
    trace.createApplicationRequestMs =
      phaseDuration(trace, 'createApplicationRequestStartAt', 'createApplicationRequestEndAt');
    trace.applicationCreatedToConfirmDispatchMs =
      phaseDuration(trace, 'applicationCreatedAt', 'confirmJobRequestStartAt');
    trace.confirmJobRequestMs = phaseDuration(trace, 'confirmJobRequestStartAt', 'confirmJobRequestEndAt');
    trace.captchaWaitMs = phaseDuration(trace, 'captchaRequiredAt', 'captchaResolvedAt');
    trace.reservationVerifyMs = phaseDuration(trace, 'reservationVerifyStartAt', 'reservationVerifyEndAt');
    trace.workflowWsMs = phaseDuration(trace, 'workflowWsStartAt', 'workflowWsEndAt');
    trace.workflowUpdateMs = phaseDuration(trace, 'workflowUpdateStartAt', 'workflowUpdateEndAt');
    trace.confirmToTerminalMs = phaseDuration(trace, 'confirmJobRequestEndAt', 'terminalAt');
    if (typeof trace.startEpochMs === 'number') {
      const endEpoch = trace.marksEpoch?.terminalAt || Date.now();
      trace.totalAttemptMs = Math.max(0, Math.round(endEpoch - trace.startEpochMs));
    }
    return trace;
  }

  function isTerminalOutcome(outcome) {
    return TERMINAL_OUTCOMES.has(outcome);
  }

  function observabilityStageForOutcome(outcome) {
    return isTerminalOutcome(outcome) ? 'TERMINAL' : 'PROGRESS';
  }

  function finalizeApplicationTrace(trace, outcome, extras = {}) {
    if (!trace) return null;
    Object.assign(trace, extras || {});
    trace.outcome = outcome || trace.outcome || 'UNKNOWN_ERROR';
    trace.observabilityStage = observabilityStageForOutcome(trace.outcome);
    trace.isTerminal = isTerminalOutcome(trace.outcome);
    trace.detailedOutcome = extras.detailedOutcome || trace.detailedOutcome || trace.outcome;
    if (trace.isTerminal) {
      recordApplicationEvent(trace, 'attempt_terminal', {
        outcome: trace.outcome,
        detailed_outcome: trace.detailedOutcome,
      }, 'terminalAt');
    }
    refreshDurations(trace);
    return trace;
  }

  async function readStorageContext() {
    return {};
  }

  function contextMatches(trace, context = {}) {
    if (!trace) return false;
    const traceJobId = normalizeText(trace.jobId, 80);
    const contextJobId = normalizeText(context.jobId, 80);
    if (traceJobId && contextJobId && traceJobId !== contextJobId) return false;
    if (traceJobId && contextJobId) return true;
    const traceScheduleId = normalizeText(trace.scheduleId, 80);
    const contextScheduleId = normalizeText(context.scheduleId, 80);
    return !(traceScheduleId && contextScheduleId && traceScheduleId !== contextScheduleId);
  }

  function pendingExpired(record) {
    return !record || Number(record.expiresAt || record.trace?.expiresAt || 0) <= Date.now();
  }

  async function getPendingRecord() {
    try {
      const data = storage.getSession
        ? await storage.getSession(STORAGE_KEYS.APPLICATION_ATTEMPT_TRACE)
        : await storage.getLocal(STORAGE_KEYS.APPLICATION_ATTEMPT_TRACE);
      return data?.[STORAGE_KEYS.APPLICATION_ATTEMPT_TRACE] || null;
    } catch (_) {
      return null;
    }
  }

  async function clearPendingTrace() {
    activeTrace = null;
    try {
      if (storage.removeSession) {
        await storage.removeSession(STORAGE_KEYS.APPLICATION_ATTEMPT_TRACE);
      } else {
        await storage.removeLocal(STORAGE_KEYS.APPLICATION_ATTEMPT_TRACE);
      }
    } catch (_) {
      // Observability cleanup is best-effort.
    }
  }

  async function loadPendingTrace(context = {}) {
    if (activeTrace && contextMatches(activeTrace, context)) return activeTrace;
    const record = await getPendingRecord();
    if (!record || pendingExpired(record)) {
      if (record) await clearPendingTrace();
      return null;
    }
    const trace = record.trace || record;
    if (!contextMatches(trace, context)) return null;
    activeTrace = trace;
    return activeTrace;
  }

  async function persistPendingTrace(trace) {
    if (!trace) return null;
    const started = Date.now();
    trace.expiresAt = Date.now() + PENDING_TTL_MS;
    refreshDurations(trace);
    const record = {
      trace,
      expiresAt: trace.expiresAt,
      updatedAt: istIso(),
    };
    try {
      if (storage.setSession) {
        await storage.setSession({ [STORAGE_KEYS.APPLICATION_ATTEMPT_TRACE]: record });
      } else {
        await storage.setLocal({ [STORAGE_KEYS.APPLICATION_ATTEMPT_TRACE]: record });
      }
      trace.pendingStatePersistMs = Math.max(0, Date.now() - started);
      trace.observabilityOverheadMs = (trace.observabilityOverheadMs || 0) + trace.pendingStatePersistMs;
    } catch (error) {
      log.debug('pending application observability persistence skipped', {
        error: error?.message || String(error),
      });
    }
    return trace;
  }

  async function ensureApplicationTrace(context = {}, details = {}) {
    const trace = await loadPendingTrace(context);
    if (!trace) return null;
    const storageContext = await readStorageContext();
    Object.assign(trace, storageContext);
    trace.pageUrl = context.href || root.location?.href || trace.pageUrl || null;
    trace.scheduleId = normalizeText(context.scheduleId, 80) || trace.scheduleId || null;
    trace.jobId = normalizeText(context.jobId, 80) || trace.jobId || null;
    trace.country = context.country || trace.country || AMAZON.COUNTRY_CONFIG?.country || null;
    trace.locale = context.locale || trace.locale || AMAZON.COUNTRY_CONFIG?.locale || null;
    recordApplicationEvent(trace, 'application_route_entered', {
      job_id: trace.jobId,
      schedule_id: trace.scheduleId,
      page_url: trace.pageUrl,
    }, 'applicationRouteAt');
    return persistPendingTrace(trace);
  }

  function posted(trace, outcome) {
    return Array.isArray(trace?.postedOutcomes) && trace.postedOutcomes.includes(outcome);
  }

  async function persistApplicationAttemptLocally(trace, context = {}) {
    if (!trace || !PROGRESS_OUTCOMES.has(trace.outcome) && !TERMINAL_OUTCOMES.has(trace.outcome)) {
      return { ok: false, skipped: 'invalid-trace' };
    }
    const outcomeAtStart = trace.outcome;
    if (posted(trace, outcomeAtStart)) {
      return { ok: true, skipped: 'already-posted' };
    }

    Object.assign(trace, await readStorageContext());
    trace.pageUrl = context.href || root.location?.href || trace.pageUrl || null;
    trace.extensionVersion = trace.extensionVersion || extensionVersion();
    trace.observabilityPostCount = (trace.observabilityPostCount || 0) + 1;
    trace.observabilityLastPostMs = 0;
    trace.postedOutcomes = Array.from(new Set([...(trace.postedOutcomes || []), outcomeAtStart]));
    await persistPendingTrace(trace);
    return { ok: true, local: true };
  }

  function flushProgress(trace, outcome, extras = {}, context = {}) {
    if (!trace) return null;
    finalizeApplicationTrace(trace, outcome, {
      ...extras,
      detailedOutcome: extras.detailedOutcome || outcome,
    });
    trace.isTerminal = false;
    trace.observabilityStage = 'PROGRESS';
    void persistApplicationAttemptLocally(trace, context).catch(() => null);
    return trace;
  }

  function finalizeAndFlush(trace, outcome, extras = {}, context = {}) {
    if (!trace) return null;
    finalizeApplicationTrace(trace, outcome, extras);
    void persistApplicationAttemptLocally(trace, context).catch(() => null);
    return trace;
  }

  function recordJobDetailNavigation(trace, matchedJob, jobDetailUrl) {
    if (!trace) return null;
    trace.pageUrl = jobDetailUrl || trace.pageUrl;
    recordApplicationEvent(trace, 'job_detail_navigation', {
      job_id: trace.jobId,
      page_url: jobDetailUrl || null,
      job: summarizeJob(matchedJob || {}),
    }, 'jobDetailNavigationAt');
    return trace;
  }

  function recordScheduleClick(details = {}, source = 'schedule-automation') {
    const context = { jobId: details.jobId };
    const timing = { epochMs: Date.now(), perfMs: safePerformanceNow() };
    void loadPendingTrace(context).then(trace => {
      if (!trace) return null;
      recordApplicationEventAt(trace, 'schedule_apply_clicked', {
        source,
        job_id: details.jobId || trace.jobId || null,
        page_url: details.pageUrl || null,
        button_text: details.buttonText || null,
        button_aria_label: details.buttonAriaLabel || null,
      }, 'scheduleApplyClickedAt', timing);
      trace.pageUrl = details.pageUrl || trace.pageUrl;
      return persistPendingTrace(trace);
    }).catch(() => null);
  }

  function normalizeButtonClickDetails(details = {}) {
    return {
      label: normalizeText(details.label, 120),
      source: normalizeText(details.source, 160),
      clicked: details.clicked === true,
      duration_ms: integerOrNull(details.durationMs ?? details.duration_ms),
      method: normalizeText(details.method, 80),
      retry: details.retry === true,
      native_only: details.nativeOnly === true || details.native_only === true,
      target_self: details.targetSelf === true || details.target_self === true,
      page_url_before: normalizeText(details.pageUrlBefore || details.page_url_before, 220),
      page_url_after: normalizeText(details.pageUrlAfter || details.page_url_after, 220),
      route_before: normalizeText(details.routeBefore || details.route_before, 160),
      route_after: normalizeText(details.routeAfter || details.route_after, 160),
      button_text: normalizeText(details.buttonText || details.button_text),
      button_aria_label: normalizeText(details.buttonAriaLabel || details.button_aria_label),
      button_test_id: normalizeText(details.buttonTestId || details.button_test_id, 120),
      button_class_name: normalizeText(details.buttonClassName || details.button_class_name, 160),
      button_disabled: details.buttonDisabled === true || details.button_disabled === true,
    };
  }

  function recordButtonClick(context = {}, details = {}, timing = {}) {
    const captured = {
      epochMs: typeof timing.epochMs === 'number' ? timing.epochMs : Date.now(),
      perfMs: typeof timing.perfMs === 'number' ? timing.perfMs : safePerformanceNow(),
    };
    const normalizedContext = {
      ...context,
      jobId: normalizeText(context.jobId, 80),
      scheduleId: normalizeText(context.scheduleId, 80),
      applicationId: normalizeText(context.applicationId, 120),
      href: normalizeText(context.href, 220),
    };

    const apply = trace => {
      if (!trace) return null;
      const clickDetails = normalizeButtonClickDetails(details);
      trace.pageUrl = details.pageUrlAfter || details.page_url_after || context.href || trace.pageUrl || null;
      trace.jobId = normalizedContext.jobId || trace.jobId || null;
      trace.scheduleId = normalizedContext.scheduleId || trace.scheduleId || null;
      trace.applicationId = normalizedContext.applicationId || trace.applicationId || null;
      trace.buttonClickCount = (integerOrNull(trace.buttonClickCount) || 0) + 1;
      trace.lastButtonClickMs = clickDetails.duration_ms;
      recordApplicationEventAt(trace, 'button_click', clickDetails, null, captured);
      refreshDurations(trace);
      return persistPendingTrace(trace);
    };

    if (activeTrace && contextMatches(activeTrace, normalizedContext)) {
      void Promise.resolve(apply(activeTrace)).catch(() => null);
      return;
    }

    void loadPendingTrace(normalizedContext).then(apply).catch(() => null);
  }

  function apiPhase(operation) {
    const op = String(operation || '').trim();
    if (op === 'candidate') return ['candidateResolveStartAt', 'candidateResolveEndAt', 'candidate_resolve'];
    if (op === 'job-detail') return ['jobDetailPrefetchStartAt', 'jobDetailPrefetchEndAt', 'job_detail_prefetch'];
    if (op === 'schedule-detail') return ['scheduleDetailFetchStartAt', 'scheduleDetailFetchEndAt', 'schedule_detail_fetch'];
    if (op === 'schedule-list-fallback') {
      return ['scheduleRecoveryFetchStartAt', 'scheduleRecoveryFetchEndAt', 'schedule_recovery_fetch'];
    }
    if (op.startsWith('create-application')) {
      return ['createApplicationRequestStartAt', 'createApplicationRequestEndAt', 'create_application_request'];
    }
    if (op === 'job-confirm') return ['confirmJobRequestStartAt', 'confirmJobRequestEndAt', 'confirm_job_request'];
    if (op === 'reservation-verification') return ['reservationVerifyStartAt', 'reservationVerifyEndAt', 'reservation_verify'];
    if (op === 'workflow-step' || op === 'application-config') {
      return ['workflowUpdateStartAt', 'workflowUpdateEndAt', 'workflow_update'];
    }
    return [null, null, 'api_request'];
  }

  function recordApiRequest(context, operation, details = {}) {
    const timing = { epochMs: Date.now(), perfMs: safePerformanceNow() };
    void loadPendingTrace(context).then(trace => {
      if (!trace) return null;
      const [startKey,, name] = apiPhase(operation);
      recordApplicationEventAt(trace, `${name}_start`, {
        operation,
        method: details.method || null,
        pathname: details.pathname || null,
      }, startKey, timing);
      return trace;
    }).catch(() => null);
  }

  function recordApiResponse(context, operation, details = {}) {
    const timing = { epochMs: Date.now(), perfMs: safePerformanceNow() };
    void loadPendingTrace(context).then(trace => {
      if (!trace) return null;
      const [, endKey, name] = apiPhase(operation);
      recordApplicationEventAt(trace, `${name}_end`, {
        operation,
        http_status: details.httpStatus ?? null,
        error_code: details.errorCode || null,
        error_message: details.errorMessage || null,
        failed: details.failed === true,
      }, endKey, timing);
      const status = integerOrNull(details.httpStatus);
      if (operation === 'job-detail') trace.jobDetailHttpStatus = status;
      if (operation === 'schedule-detail') trace.scheduleDetailHttpStatus = status;
      if (operation === 'schedule-list-fallback') trace.scheduleRecoveryHttpStatus = status;
      if (String(operation || '').startsWith('create-application')) trace.createHttpStatus = status;
      if (operation === 'job-confirm') trace.confirmHttpStatus = status;
      if (operation === 'reservation-verification') trace.reservationHttpStatus = status;
      if (operation === 'workflow-step' || operation === 'application-config') trace.workflowHttpStatus = status;
      refreshDurations(trace);
      return trace;
    }).catch(() => null);
  }

  function recordCheckpoint(context = {}, name, details = {}, phaseKey = null, timing = {}) {
    const captured = {
      epochMs: typeof timing.epochMs === 'number' ? timing.epochMs : Date.now(),
      perfMs: typeof timing.perfMs === 'number' ? timing.perfMs : safePerformanceNow(),
    };
    void loadPendingTrace(context).then(trace => {
      if (!trace) return null;
      recordApplicationEventAt(trace, name, details, phaseKey, captured);
      refreshDurations(trace);
      if (details?.persist === true) return persistPendingTrace(trace);
      return trace;
    }).catch(() => null);
  }

  function recordExtensionDeactivated(context = {}, details = {}) {
    void loadPendingTrace(context).then(trace => {
      if (!trace || trace.extensionDeactivatedAt) return null;
      trace.extensionDeactivatedAt = istIso();
      recordApplicationEvent(trace, 'extension_deactivated', details, 'extensionDeactivatedAt');
      return persistPendingTrace(trace);
    }).catch(() => null);
  }

  function finalizePendingDeactivated(context = {}, details = {}) {
    void loadPendingTrace(context).then(trace => {
      if (!trace) return null;
      trace.extensionDeactivatedAt = trace.extensionDeactivatedAt || istIso();
      recordApplicationEvent(trace, 'extension_deactivated', details, 'extensionDeactivatedAt');
      return finalizeAndFlush(trace, 'DEACTIVATED', {
        detailedOutcome: 'EXTENSION_DEACTIVATED_DURING_ATTEMPT',
      }, context);
    }).catch(() => null);
  }

  root.AMZ_APPLICATION_OBSERVABILITY = Object.freeze({
    createApplicationAttemptTrace,
    recordApplicationEvent,
    recordApplicationEventAt,
    finalizeApplicationTrace,
    persistApplicationAttemptLocally,
    persistPendingTrace,
    loadPendingTrace,
    clearPendingTrace,
    ensureApplicationTrace,
    flushProgress,
    finalizeAndFlush,
    recordJobDetailNavigation,
    recordScheduleClick,
    recordButtonClick,
    recordApiRequest,
    recordApiResponse,
    recordCheckpoint,
    recordExtensionDeactivated,
    finalizePendingDeactivated,
  });
})(typeof globalThis !== 'undefined' ? globalThis : self);
