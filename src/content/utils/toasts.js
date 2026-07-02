/* SweetAlert rendering for polling and job-match feedback. */
(function (root) {
  'use strict';

  if (root.AMZ_TOASTS) return;

  const { ALERTS, AUTH_PROBE } = root.AMZ_CONSTANTS;
  const text = root.AMZ_TEXT;

  function getApiStatusLabel(apiMeta = {}) {
    const status = typeof apiMeta.status === 'number' ? String(apiMeta.status) : 'N/A';
    const duration = typeof apiMeta.durationMs === 'number' ? apiMeta.durationMs + ' ms' : 'N/A';
    const details = apiMeta.details ? ' | ' + text.escapeHtml(apiMeta.details) : '';

    if (apiMeta.state === 'success') {
      return '✅ Success | HTTP: ' + status + ' | Time: ' + duration + details;
    }
    if (apiMeta.state === 'failed') {
      return '❌ Failed | HTTP: ' + status + ' | Time: ' + duration + details;
    }
    if (apiMeta.state === 'idle') {
      return 'Polling active; next request queued...';
    }
    return '⏳ Request in progress...';
  }


  function normalizeAuthProbeStatus(value) {
    return Object.values(AUTH_PROBE.STATUSES).includes(value)
      ? value
      : AUTH_PROBE.STATUSES.CHECKING;
  }

  function getAuthProbeStatusMeta(status) {
    const normalized = normalizeAuthProbeStatus(status);
    const label = AUTH_PROBE.LABELS[normalized] || AUTH_PROBE.LABELS.checking;

    const colorByStatus = {
      [AUTH_PROBE.STATUSES.CHECKING]: '#aaa',
      [AUTH_PROBE.STATUSES.AUTHENTICATED]: '#8fd19e',
      [AUTH_PROBE.STATUSES.NOT_AUTHENTICATED]: '#ff9b92',
      [AUTH_PROBE.STATUSES.UNKNOWN]: '#ffcc66',
    };

    return {
      label,
      color: colorByStatus[normalized] || '#aaa',
    };
  }

  function formatInterval(ms, unit) {
    const intervalMs = Number(ms || 0);
    if (unit === 'ms') {
      return String(Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : 0) + 'ms';
    }
    return (intervalMs / 1000).toFixed(1).replace(/\.0$/, '') + 's';
  }

  function formatJobType(value) {
    if (Array.isArray(value)) {
      return value.length ? value.join(', ') : 'N/A';
    }
    return value || 'N/A';
  }

  function normalizeLabel(value) {
    return text.normalizeWhitespace ? text.normalizeWhitespace(value) : String(value || '').trim();
  }

  function getJobLocationLabel(job = {}) {
    return [
      job.city,
      job.locationName,
      job.geoClusterDescription,
      job.state,
      job.postalCode,
    ]
      .map(normalizeLabel)
      .find(Boolean) || '';
  }

  function getJobLocationSummary(jobCards = [], limit = 3) {
    const allLabels = [];
    const seen = new Set();
    (Array.isArray(jobCards) ? jobCards : []).forEach(job => {
      const label = getJobLocationLabel(job);
      const key = text.normalizeForComparison(label);
      if (!label || seen.has(key)) return;
      seen.add(key);
      allLabels.push(label);
    });
    return {
      labels: allLabels.slice(0, limit),
      hiddenCount: Math.max(0, allLabels.length - limit),
    };
  }

  function getMatchedLocationLabel(details = {}) {
    const matchedLocation = details.matchedLocation || {};
    return normalizeLabel(
      matchedLocation.tag ||
      matchedLocation.value ||
      getJobLocationLabel(details.job) ||
      details.city
    );
  }

  function getMatchedLocationValue(details = {}) {
    return normalizeLabel(details.matchedLocation?.value || getJobLocationLabel(details.job));
  }

  function buildPollingToastHtml(options = {}) {
    const configuredIntervalLabel = formatInterval(options.intervalMs, options.intervalUnit);
    const effectiveIntervalLabel = formatInterval(
      options.effectiveIntervalMs || options.intervalMs,
      options.intervalUnit
    );
    const jobType = formatJobType(options.jobType);
    const cityLabel = options.cityTags?.length
      ? options.cityTags.join(', ')
      : options.selectedCity || 'N/A';
    const apiStatus = getApiStatusLabel(options.apiMeta);
    const authProbeMeta = getAuthProbeStatusMeta(options.authProbeStatus);
    const authBackoffLine = options.authBackoffActive
      ? '<br><span style="color:#ffcc66;font-size:0.8em;">⚠ Auth backoff active: polling every ' +
        text.escapeHtml(effectiveIntervalLabel) + '. User setting remains ' +
        text.escapeHtml(configuredIntervalLabel) + '.</span>'
      : '';

    return (
      '<div style="text-align:left;line-height:1.45;">' +
	      '<span style="color:#fff;font-weight:bold;">🔍 Fetching Jobs...</span><br>' +
	      '<span style="color:#ccc;font-size:0.85em;">📍 ' + text.escapeHtml(cityLabel) +
	      ' &nbsp;|&nbsp; 📏 ' + text.escapeHtml(options.distance || 'N/A') +
	      ' mi &nbsp;|&nbsp; 💼 ' + text.escapeHtml(jobType) + '</span><br>' +
      '<span style="color:#aaa;font-size:0.8em;">⏱ Poll every ' +
      text.escapeHtml(effectiveIntervalLabel) + '</span>' +
      authBackoffLine + '<br>' +
      '<span style="color:' + authProbeMeta.color + ';font-size:0.8em;">🔐 Auth: ' +
      text.escapeHtml(authProbeMeta.label) + '</span><br>' +
      '<span style="color:#d7d7d7;font-size:0.8em;">📡 API: ' + apiStatus + '</span>' +
      '</div>'
    );
  }

  function renderPollingToast(options = {}) {
    const html = buildPollingToastHtml(options);
    const existingToast = document.querySelector('.swal2-toast.amazon-polling-toast');
    if (Swal.isVisible() && existingToast) {
      Swal.update({ html });
      return;
    }

    Swal.fire({
      toast: true,
      position: 'bottom-start',
      showConfirmButton: false,
      allowEscapeKey: false,
      allowEnterKey: false,
      allowOutsideClick: false,
      html,
      customClass: { popup: 'amazon-polling-toast' },
    });
  }

  function showJobsReceivedToast(intervalMs, jobCards = []) {
    const locationSummary = getJobLocationSummary(jobCards);
    const locations = locationSummary.labels;
    const jobCount = Array.isArray(jobCards) ? jobCards.length : 0;
    const progressLabel = locations.length
      ? 'Found ' + (jobCount === 1 ? 'a job' : 'jobs') + ' in ' +
        locations.map(text.escapeHtml).join(', ') +
        (locationSummary.hiddenCount > 0 ? ' +' + String(locationSummary.hiddenCount) + ' more' : '') +
        '. Matching city filters...'
      : ALERTS.MATCHING_PROGRESS_LABEL;

    Swal.fire({
      toast: true,
      position: 'bottom-start',
      timer: intervalMs,
      showConfirmButton: false,
      timerProgressBar: true,
      html: '<span style="color: green;">' + progressLabel + '</span>',
    });
  }

  function showJobFoundToast(input) {
    const details = typeof input === 'object' && input !== null ? input : { city: input };
    const locationLabel = getMatchedLocationLabel(details);
    const locationValue = getMatchedLocationValue(details);
    const locationDetail = locationValue && locationValue !== locationLabel
      ? '<br><span style="font-size:0.82em;opacity:.78;">Amazon location: ' +
        text.escapeHtml(locationValue) + '</span>'
      : '';

    Swal.fire({
      title: locationLabel ? 'Job matched for ' + locationLabel : 'Job matched!',
      html: locationLabel
        ? 'Matching job in ' + text.escapeHtml(locationLabel) + locationDetail
        : 'Matching job location found.',
      icon: 'success',
      timer: ALERTS.JOB_FOUND_TOAST_DURATION_MS,
      timerProgressBar: true,
      toast: true,
      position: 'top-end',
      showConfirmButton: false,
    });
  }

  function showBookingConfirmedToast(details = {}) {
    const meta = [details.jobId, details.scheduleId].filter(Boolean).join(' · ');
    const applicationLine = details.applicationId
      ? '<br><span style="font-size:0.82em;opacity:.78;">' +
        text.escapeHtml(details.applicationId) + '</span>'
      : '';

    Swal.fire({
      title: 'Booking confirmed',
      html:
        '<span style="font-size:0.92em;">' +
        text.escapeHtml(meta || 'Amazon booking succeeded') +
        '</span>' +
        applicationLine,
      icon: 'success',
      timer: 20000,
      timerProgressBar: true,
      toast: true,
      position: 'top-end',
      showConfirmButton: false,
    });
  }

  function closePollingToast() {
    const existingToast = document.querySelector('.swal2-toast.amazon-polling-toast');
    if (existingToast && Swal.isVisible()) Swal.close();
  }

  root.AMZ_TOASTS = Object.freeze({
    renderPollingToast,
    showJobsReceivedToast,
    showJobFoundToast,
    showBookingConfirmedToast,
    closePollingToast,
  });
})(typeof globalThis !== 'undefined' ? globalThis : self);
