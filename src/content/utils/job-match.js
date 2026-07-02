/* Pure job-match helpers for the hot search path. */
(function (root) {
  'use strict';

  if (root.AMZ_JOB_MATCH) return;

  const LOCATION_FIELDS = Object.freeze([
    'city',
    'locationName',
    'geoClusterDescription',
    'state',
    'postalCode',
  ]);

  function summarizeJob(job = {}) {
    return {
      jobId: job.jobId || null,
      jobTitle: job.jobTitle || null,
      city: job.city || null,
      state: job.state || null,
      postalCode: job.postalCode || null,
      locationName: job.locationName || null,
      geoClusterDescription: job.geoClusterDescription || null,
      jobType: job.jobType || job.jobTypeL10N || null,
      employmentType: job.employmentTypeL10N || job.employmentType || null,
      pay: job.totalPayRateMaxL10N || job.totalPayRateMinL10N || job.totalPayRateMax || null,
      scheduleCount: job.scheduleCount ?? null,
      currencyCode: job.currencyCode || null,
      payFrequency: job.payFrequency || null,
      jobLocationType: job.jobLocationType || null,
    };
  }

  function getMatchingTags(cityTags = [], selectedCity = '') {
    const cityTagsUtil = root.AMZ_CITY_TAGS;
    const storedTags = cityTagsUtil.mergeWithSelectedCity(cityTags, '');
    return {
      storedTags,
      matchingTags: cityTagsUtil.mergeWithSelectedCity(storedTags, selectedCity),
    };
  }

  function normalizeForLocationMatching(value) {
    return root.AMZ_CITY_TAGS.normalizeForMatching(value);
  }

  function getLocationCandidates(job = {}) {
    return [
      job.city,
      job.locationName,
      job.geoClusterDescription,
      job.state,
      job.postalCode,
    ]
      .map(normalizeForLocationMatching)
      .filter(Boolean);
  }

  function normalizeMatchingTags(matchingTags = []) {
    return matchingTags
      .map(normalizeForLocationMatching)
      .filter(Boolean);
  }

  function normalizeMatchingTagEntries(matchingTags = []) {
    return matchingTags
      .map(tag => ({
        label: root.AMZ_TEXT?.normalizeWhitespace?.(tag) || String(tag || '').trim(),
        normalized: normalizeForLocationMatching(tag),
      }))
      .filter(tag => tag.label && tag.normalized);
  }

  function getLocationCandidateEntries(job = {}, fields = LOCATION_FIELDS) {
    return fields
      .map(field => ({
        field,
        value: root.AMZ_TEXT?.normalizeWhitespace?.(job[field]) || String(job[field] || '').trim(),
        normalized: normalizeForLocationMatching(job[field]),
      }))
      .filter(candidate => candidate.value && candidate.normalized);
  }

  function candidateMatchesAnyTag(candidate, normalizedTags) {
    return Boolean(candidate && normalizedTags.some(tag => candidate.includes(tag)));
  }

  function findMatchingLocation(job = {}, matchingTags = [], fields = LOCATION_FIELDS) {
    const normalizedTags = normalizeMatchingTagEntries(matchingTags);
    if (!normalizedTags.length) return null;

    const candidates = getLocationCandidateEntries(job, fields);
    for (const candidate of candidates) {
      const matchedTag = normalizedTags.find(tag => candidate.normalized.includes(tag.normalized));
      if (matchedTag) {
        return {
          tag: matchedTag.label,
          field: candidate.field,
          value: candidate.value,
        };
      }
    }
    return null;
  }

  function cityMatchesTags(job = {}, matchingTags = []) {
    const normalizedTags = normalizeMatchingTags(matchingTags);
    if (!normalizedTags.length) return false;
    return candidateMatchesAnyTag(normalizeForLocationMatching(job.city), normalizedTags);
  }

  function fallbackLocationMatchesTags(job = {}, matchingTags = []) {
    const normalizedTags = normalizeMatchingTags(matchingTags);
    if (!normalizedTags.length) return false;

    return [
      job.locationName,
      job.geoClusterDescription,
      job.state,
      job.postalCode,
    ]
      .map(normalizeForLocationMatching)
      .some(candidate => candidateMatchesAnyTag(candidate, normalizedTags));
  }

  function locationMatchesTags(job = {}, matchingTags = []) {
    const normalizedTags = normalizeMatchingTags(matchingTags);
    if (!normalizedTags.length) return false;

    const candidates = getLocationCandidates(job);
    return candidates.some(candidate =>
      normalizedTags.some(tag => candidate.includes(tag))
    );
  }

  function jobMatchesSelectedTypes(job = {}, selectedJobTypes = []) {
    return root.AMZ_RUNTIME_CONTROLS.jobMatchesSelectedTypes(
      [job?.jobType, job?.jobTypeL10N, job?.employmentType, job?.employmentTypeL10N],
      selectedJobTypes
    );
  }

  function inspectJobMatch(job = {}, matchingTags = [], selectedJobTypes = []) {
    const cityMatched = cityMatchesTags(job, matchingTags);
    const fallbackMatched = fallbackLocationMatchesTags(job, matchingTags);
    const locationMatched = cityMatched || fallbackMatched;
    const jobTypeMatched = jobMatchesSelectedTypes(job, selectedJobTypes);
    return {
      job: summarizeJob(job),
      locationCandidates: getLocationCandidates(job),
      matchedLocation: locationMatched ? findMatchingLocation(job, matchingTags) : null,
      cityMatched,
      fallbackLocationMatched: fallbackMatched,
      locationMatched,
      jobTypeMatched,
      matched: locationMatched && jobTypeMatched,
    };
  }

  function buildMatchDiagnostics(jobCards, options = {}) {
    const { storedTags, matchingTags } = getMatchingTags(
      options.cityTags,
      options.selectedCity
    );
    const jobs = Array.isArray(jobCards) ? jobCards : [];
    const selectedJobTypes = root.AMZ_RUNTIME_CONTROLS.normalizeJobTypeList(options.selectedJobTypes);
    const inspected = jobs.map(job => inspectJobMatch(job, matchingTags, selectedJobTypes));
    const counts = inspected.reduce((summary, item) => {
      summary.cityMatched += item.cityMatched ? 1 : 0;
      summary.fallbackLocationMatched += item.fallbackLocationMatched ? 1 : 0;
      summary.locationMatched += item.locationMatched ? 1 : 0;
      summary.jobTypeMatched += item.jobTypeMatched ? 1 : 0;
      summary.matched += item.matched ? 1 : 0;
      return summary;
    }, {
      total: inspected.length,
      cityMatched: 0,
      fallbackLocationMatched: 0,
      locationMatched: 0,
      jobTypeMatched: 0,
      matched: 0,
    });

    return {
      selectedCity: options.selectedCity || '',
      selectedJobTypes,
      storedTags,
      matchingTags,
      counts,
      samples: inspected.slice(0, options.sampleLimit || 5),
    };
  }

  function findMatchingJob(jobCards, options = {}) {
    const { storedTags, matchingTags } = getMatchingTags(
      options.cityTags,
      options.selectedCity
    );
    const selectedJobTypes = options.selectedJobTypes || [];
    const jobs = Array.isArray(jobCards) ? jobCards : [];
    const matchesSelectedJobTypes = job => jobMatchesSelectedTypes(job, selectedJobTypes);
    const cityMatchedJob = jobs.find(job =>
      cityMatchesTags(job, matchingTags) &&
      matchesSelectedJobTypes(job)
    );
    const matchedJob = cityMatchedJob || jobs.find(job =>
      fallbackLocationMatchesTags(job, matchingTags) &&
      matchesSelectedJobTypes(job)
    ) || null;

    return {
      storedTags,
      matchingTags,
      matchedJob,
      matchedLocation: matchedJob ? findMatchingLocation(matchedJob, matchingTags) : null,
    };
  }

  function buildLastMatchedJobMetadata(matchedJob, options = {}) {
    const matchedLocation = options.matchedLocation || {};
    return {
      matchedAt: root.AMZ_TIME?.nowIstIso?.() || new Date().toISOString(),
      selectedCity: options.selectedCity || '',
      cityTags: options.matchingTags || [],
      matchedLocation: matchedLocation.tag || matchedLocation.value || '',
      matchedLocationField: matchedLocation.field || '',
      matchedLocationValue: matchedLocation.value || '',
      distance: options.distance || '',
      selectedJobTypes: options.selectedJobTypes || [],
      country: options.country || null,
      pageUrl: options.pageUrl || root.location?.href || '',
      ...matchedJob,
    };
  }

  root.AMZ_JOB_MATCH = Object.freeze({
    buildLastMatchedJobMetadata,
    buildMatchDiagnostics,
    cityMatchesTags,
    fallbackLocationMatchesTags,
    findMatchingLocation,
    findMatchingJob,
    getLocationCandidates,
    getMatchingTags,
    inspectJobMatch,
    jobMatchesSelectedTypes,
    locationMatchesTags,
    summarizeJob,
  });
})(typeof globalThis !== 'undefined' ? globalThis : self);
