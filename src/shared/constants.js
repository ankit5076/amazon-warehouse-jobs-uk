/*
 * Static configuration for the Amazon shift automation extension.
 *
 * This file is intentionally configuration-only. Runtime behavior lives in
 * shared services, content controllers, popup controllers, and background
 * services. Every execution context loads this file before using config.
 */
(function (root) {
  'use strict';

  if (root.AMZ_CONSTANTS) return;

  const STORAGE_KEYS = Object.freeze({
    ACTIVE: '__ap',
    USERNAME: '__amz_username',
    USER_EMAIL: '__un',
    LEGACY_USER_EMAIL: 'userEmail',
    SELECTED_CITY: 'selectedCity',
    ALL_CITIES_SELECTED: 'allCitiesSelected',
    LATITUDE: 'lat',
    LONGITUDE: 'lng',
    DISTANCE: 'distance',
    JOB_TYPE: 'jobType',
    CITY_TAGS: 'cityTags',
    FETCH_INTERVAL_VALUE: 'fetchIntervalValue',
    FETCH_INTERVAL_UNIT: 'fetchIntervalUnit',
    FETCH_INTERVAL_MIN_MS: 'fetchIntervalMinMs',
    JOB_SEARCH_FALLBACK_DISTANCE_KM: 'jobSearchFallbackDistanceKm',
    JOB_SEARCH_FETCH_TIMEOUT_MS: 'jobSearchFetchTimeoutMs',
    PAGE_REFRESH_JOB_SEARCH_INTERVAL_MS: 'pageRefreshJobSearchIntervalMs',
    LAST_MATCHED_JOB: 'lastMatchedJob',
    LAST_SELECTED_SCHEDULE: 'lastSelectedSchedule',
    DETECTED_EMAILS: 'detectedEmails',
    AUTH_PROBE_STATUS: 'authProbeStatus',
    AUTH_PROBE_UPDATED_AT: 'authProbeUpdatedAt',
    AUTH_PROBE_HTTP_STATUS: 'authProbeHttpStatus',
    AUTH_PROBE_DETAIL: 'authProbeDetail',
    LOG_MODE: 'logMode',
    APPLICATION_ATTEMPT_TRACE: 'applicationAttemptTrace',
  });

  const MESSAGE_ACTIONS = Object.freeze({
    ACTIVATE: 'activate',
    EXTENSION_STATE_CHANGED: 'extension_state_changed',
  });

  const USERNAME_REGEX = /\S/;
  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const ACTIVE_COUNTRY_KEY = 'UK';
  const isCanada = false;
  const UK_CITY_DISTANCE_OPTIONS = Object.freeze([
    Object.freeze({ value: '3', label: 'Within 3 miles' }),
    Object.freeze({ value: '10', label: 'Within 10 miles' }),
    Object.freeze({ value: '15', label: 'Within 15 miles' }),
    Object.freeze({ value: '20', label: 'Within 20 miles' }),
    Object.freeze({ value: '30', label: 'Within 30 miles' }),
    Object.freeze({ value: '50', label: 'Within 50 miles' }),
    Object.freeze({ value: '150', label: 'Within 150 miles' }),
    Object.freeze({ value: '1500', label: 'Within 1500 miles' }),
  ]);

  const COUNTRY_CONFIGS = Object.freeze({
    UK: Object.freeze({
      domain: 'www.jobsatamazon.co.uk',
      authDomain: 'auth.hiring.amazon.com',
      loginUrl: 'https://www.jobsatamazon.co.uk/app#/login',
      applicationCountryPath: 'uk',
      locale: 'en-GB',
      country: 'United Kingdom',
      countryCode: 'UK',
      search: Object.freeze({
        supportsAllCitiesSearch: true,
        includeGeoQueryClause: true,
        includeHoursPerWeekRange: false,
        includeConsolidateSchedule: true,
        includeDateFilters: false,
        includeJobTypeFilter: true,
        allCitiesDistanceKm: '25000',
        cityDistanceOptions: UK_CITY_DISTANCE_OPTIONS,
        defaultCityDistance: '30',
        maxCityDistanceMiles: 1500,
        equalFilters: Object.freeze([]),
        sorters: Object.freeze([
          Object.freeze({ fieldName: 'totalPayRateMax', ascending: 'false' }),
        ]),
      }),
    }),
  });

  const ACTIVE_COUNTRY_CONFIG = COUNTRY_CONFIGS[ACTIVE_COUNTRY_KEY];

  const AUTH_PROBE = Object.freeze({
    COUNTRY_CODE: ACTIVE_COUNTRY_CONFIG.countryCode,
    CSRF_URL: 'https://' + ACTIVE_COUNTRY_CONFIG.domain +
      '/authorize/api/csrf?countryCode=' + ACTIVE_COUNTRY_CONFIG.countryCode,
    AUTHORIZE_URL: 'https://' + ACTIVE_COUNTRY_CONFIG.domain +
      '/authorize/api/authorize?countryCode=' + ACTIVE_COUNTRY_CONFIG.countryCode,
    REDIRECT_URL: ACTIVE_COUNTRY_CONFIG.domain,
    FETCH_TIMEOUT_MS: 15000,
    ROUTE_RECHECK_DELAY_MS: 750,
    NOT_AUTHENTICATED_HTTP_STATUSES: Object.freeze([401, 403]),
    STATUSES: Object.freeze({
      CHECKING: 'checking',
      AUTHENTICATED: 'authenticated',
      NOT_AUTHENTICATED: 'not_authenticated',
      UNKNOWN: 'unknown',
    }),
    LABELS: Object.freeze({
      checking: 'Checking Amazon session…',
      authenticated: 'Amazon session authenticated',
      not_authenticated: 'Amazon session not authenticated',
      unknown: 'Unable to verify Amazon session',
    }),
    HINTS: Object.freeze({
      checking: 'Authenticity is checked after each job-search page refresh.',
      authenticated: 'The latest refresh-based authorize check succeeded.',
      not_authenticated: 'Polling stops and the Amazon login page opens until the session recovers.',
      unknown: 'Polling stops until the Amazon session can be verified again.',
    }),
  });

  const IDENTITY = Object.freeze({
    EMAIL_DISCOVERY_REGEX: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
  });

  const TEXT_LIMITS = Object.freeze({
    DEFAULT_COMPACT_LENGTH: 140,
    BUTTON_CLASSNAME_LENGTH: 120,
  });

  const LOGGING = Object.freeze({
    DEFAULT_MODE: 'standard',
    HIGH_FREQUENCY_THROTTLE_MS: 2000,
    POLLING_SUCCESS_THROTTLE_MS: 30000,
    MODES: Object.freeze({
      OFF: 'off',
      STANDARD: 'standard',
      DEBUG: 'debug',
    }),
    LEVELS: Object.freeze({
      EVENT: 'event',
      INFO: 'info',
      WARN: 'warn',
      ERROR: 'error',
      DEBUG: 'debug',
      TRACE: 'trace',
    }),
    CONSOLE_METHOD_BY_LEVEL: Object.freeze({
      event: 'log',
      info: 'info',
      warn: 'warn',
      error: 'error',
      debug: 'debug',
      trace: 'debug',
    }),
    STANDARD_LEVELS: Object.freeze([
      'event',
      'info',
      'warn',
      'error',
    ]),
    DEBUG_LEVELS: Object.freeze([
      'event',
      'info',
      'warn',
      'error',
      'debug',
      'trace',
    ]),
  });

  const INSTALL_DEFAULTS = Object.freeze({
    $active: false,
    [STORAGE_KEYS.ACTIVE]: false,
    __fq: 0.5,
    __gp: 3,
    __tdgp: 3,
    [STORAGE_KEYS.SELECTED_CITY]: '',
    [STORAGE_KEYS.ALL_CITIES_SELECTED]: false,
    [STORAGE_KEYS.DISTANCE]: '',
    [STORAGE_KEYS.JOB_TYPE]: [],
    [STORAGE_KEYS.FETCH_INTERVAL_VALUE]: '850',
    [STORAGE_KEYS.FETCH_INTERVAL_UNIT]: 'ms',
    [STORAGE_KEYS.FETCH_INTERVAL_MIN_MS]: 0,
    [STORAGE_KEYS.JOB_SEARCH_FALLBACK_DISTANCE_KM]: '',
    [STORAGE_KEYS.JOB_SEARCH_FETCH_TIMEOUT_MS]: 0,
    [STORAGE_KEYS.PAGE_REFRESH_JOB_SEARCH_INTERVAL_MS]: 0,
    [STORAGE_KEYS.CITY_TAGS]: [],
    [STORAGE_KEYS.LOG_MODE]: LOGGING.DEFAULT_MODE,
  });

  const RESET_DEFAULTS = Object.freeze({
    [STORAGE_KEYS.ACTIVE]: false,
    [STORAGE_KEYS.SELECTED_CITY]: '',
    [STORAGE_KEYS.ALL_CITIES_SELECTED]: false,
    [STORAGE_KEYS.LATITUDE]: null,
    [STORAGE_KEYS.LONGITUDE]: null,
    [STORAGE_KEYS.DISTANCE]: '',
    [STORAGE_KEYS.JOB_TYPE]: [],
    [STORAGE_KEYS.FETCH_INTERVAL_VALUE]: '850',
    [STORAGE_KEYS.FETCH_INTERVAL_UNIT]: 'ms',
    [STORAGE_KEYS.FETCH_INTERVAL_MIN_MS]: 0,
    [STORAGE_KEYS.JOB_SEARCH_FALLBACK_DISTANCE_KM]: '',
    [STORAGE_KEYS.JOB_SEARCH_FETCH_TIMEOUT_MS]: 0,
    [STORAGE_KEYS.PAGE_REFRESH_JOB_SEARCH_INTERVAL_MS]: 0,
    [STORAGE_KEYS.CITY_TAGS]: [],
    [STORAGE_KEYS.LOG_MODE]: LOGGING.DEFAULT_MODE,
  });

  const JOB_TYPE_VALUES = Object.freeze([
    'FULL_TIME',
    'PART_TIME',
    'FLEX_TIME',
    'REDUCED_TIME',
  ]);

  const AMAZON = Object.freeze({
    isCanada,
    JOB_TYPE_VALUES,
    PAGE_PATTERNS: Object.freeze([
      'https://www.jobsatamazon.co.uk/*',
      'https://jobsatamazon.co.uk/*',
      '*://auth.hiring.amazon.com/*',
    ]),
    APPLICATION_PATH_SEGMENTS: Object.freeze(['/application/uk/']),
    SKIP_PAGE_FRAGMENTS: Object.freeze(['already-applied-but-can-be-reset', 'consent']),
    URLS: Object.freeze({
      JOB_SEARCH: 'https://' + ACTIVE_COUNTRY_CONFIG.domain + '/app#/jobSearch',
      MY_APPLICATIONS: 'https://' + ACTIVE_COUNTRY_CONFIG.domain + '/app#/myApplications',
      LOGIN: ACTIVE_COUNTRY_CONFIG.loginUrl,
      CREATE_APPLICATION:
        'https://' +
        ACTIVE_COUNTRY_CONFIG.domain +
        '/application/' +
        ACTIVE_COUNTRY_CONFIG.applicationCountryPath +
        '/?country=' +
        ACTIVE_COUNTRY_CONFIG.applicationCountryPath,
    }),
    COUNTRY_CONFIGS,
    COUNTRY_CONFIG: ACTIVE_COUNTRY_CONFIG,
    GRAPHQL: Object.freeze({
      URL: 'https://' + ACTIVE_COUNTRY_CONFIG.domain + '/graphql',
      OPERATION_NAME: 'searchJobCardsByLocation',
      SCHEDULE_OPERATION_NAME: 'searchScheduleCards',
      PAGE_SIZE: 100,
      SCHEDULE_PAGE_SIZE: 1000,
      REQUEST_JITTER_MS: 50,
      GEO_UNIT: 'mi',
      HOURS_PER_WEEK_RANGE: Object.freeze({ minimum: 0, maximum: 80 }),
      SEARCH_CONFIG: Object.freeze({
        EMPTY_KEYWORDS: '',
        PRIVATE_SCHEDULE_FILTER_KEY: 'isPrivateSchedule',
        PRIVATE_SCHEDULE_FILTER_VALUE: 'false',
        PRIVATE_SCHEDULE_FILTER_VALUES: Object.freeze(['true', 'false']),
        JOB_TYPE_FILTER_KEY: 'jobType',
        JOB_TYPE_FILTER_VALUES: Object.freeze({
          FULL_TIME: 'Full-time',
          PART_TIME: 'Part-time',
        }),
        HOURS_PER_WEEK_FILTER_KEY: 'hoursPerWeek',
        FIRST_DAY_FILTER_KEY: 'firstDayOnSite',
        CONSOLIDATE_SCHEDULE: true,
      }),
      REQUEST_HEADERS: Object.freeze({
        accept: '*/*',
        'content-type': 'application/json',
        iscanary: 'false',
      }),
      QUERY: `query searchJobCardsByLocation($searchJobRequest: SearchJobRequest!) {
        searchJobCardsByLocation(searchJobRequest: $searchJobRequest) {
          nextToken
          jobCards {
            jobId
            language
            dataSource
            requisitionType
            jobTitle
            jobType
            employmentType
            city
            state
            postalCode
            locationName
            totalPayRateMin
            totalPayRateMax
            tagLine
            bannerText
            image
            jobPreviewVideo
            distance
            featuredJob
            bonusJob
            bonusPay
            scheduleCount
            currencyCode
            geoClusterDescription
            surgePay
            jobTypeL10N
            employmentTypeL10N
            bonusPayL10N
            surgePayL10N
            totalPayRateMinL10N
            totalPayRateMaxL10N
            distanceL10N
            monthlyBasePayMin
            monthlyBasePayMinL10N
            monthlyBasePayMax
            monthlyBasePayMaxL10N
            jobContainerJobMetaL1
            virtualLocation
            poolingEnabled
            payFrequency
            jobLocationType
            internalStaffingOrgId
            agencyName
            advertisedBasePay
            advertisedBasePayL10N
            advertisedPayFrequency
            advertisedPayFrequencyL10N
            __typename
          }
          __typename
        }
      }`,
      SCHEDULE_QUERY: `query searchScheduleCards($searchScheduleRequest: SearchScheduleRequest!) {
        searchScheduleCards(searchScheduleRequest: $searchScheduleRequest) {
          nextToken
          scheduleCards {
            hireStartDate
            address
            basePay
            bonusSchedule
            city
            currencyCode
            dataSource
            distance
            employmentType
            employmentTypeL10N
            externalJobTitle
            featuredSchedule
            firstDayOnSite
            firstDayOnSiteL10N
            hoursPerWeek
            image
            jobId
            jobPreviewVideo
            language
            postalCode
            priorityRank
            scheduleBannerText
            scheduleBusinessCategory
            scheduleBusinessCategoryL10N
            scheduleDescription
            scheduleId
            scheduleText
            scheduleType
            scheduleTypeL10N
            signOnBonus
            signOnBonusL10N
            state
            surgePay
            tagLine
            totalPayRate
            totalPayRateL10N
            payFrequency
            requiredLanguage
            siteId
            vendorId
            vendorName
          }
        }
      }`,
    }),
  });

  const SELECTORS = Object.freeze({
    LOGIN_INPUT: 'input[data-test-id="input-test-id-login"]',
    PIN_INPUT: 'input[data-test-id="input-test-id-pin"]',
    CONTINUE_BUTTON: 'button[data-test-id="button-continue"]',
    EMAIL_INPUTS: 'input[type="email"], input[data-test-id="input-test-id-emailId"]',
    MAILTO_LINKS: 'a[href^="mailto:"]',
    BUTTONS: 'button',
    CREATE_APPLICATION_ROW_TEXT: 'div[data-test-component="StencilReactRow"]',
    START_APPLICATION_BUTTON: 'button#startApplicationButton',
    ACTIVE_APPLICATION_MODAL: '[aria-labelledby="existing-application-title"]',
    JOB_OPPORTUNITY_SCHEDULE_CARDS: '.scheduleCardContainer',
    JOB_OPPORTUNITY_CARDS: '[data-test-component="StencilReactCard"]',
    ACCEPT_OFFER_BUTTON:
      'button[data-test-component="StencilReactButton"].contingent-offer-flyout-btn, button.contingent-offer-flyout-btn',
    SCHEDULE_CARD_ROOT: '[data-test-component="StencilReactCard"], [role="button"].focusableItem',
    SCHEDULE_OPTION:
      'div[data-test-id="schedulePanel"] [data-test-component="StencilReactCard"][role="button"], div[data-test-id="schedulePanel"] [role="button"].focusableItem, div[data-test-id="schedulePanel"] .scheduleFlyoutSelection',
    SCHEDULE_APPLY_BUTTON: 'button[data-test-id="ScheduleCardSelectScheduleLink"]',
    SCHEDULE_SELECT_BUTTON:
      'button[data-test-id="jobDetailSelectScheduleButton"], .jobDetailScheduleDropdown',
    DESKTOP_APPLY_BUTTON: 'button[data-test-id="jobDetailApplyButtonDesktop"]',
    APPLY_BUTTONS:
      'button[data-test-id="ScheduleCardSelectScheduleLink"], button[data-test-id="jobDetailApplyButtonDesktop"]',
    SCHEDULE_LABEL: '.scheduleCardLabelText',
    SCHEDULE_EXPAND_LINK: 'div[data-test-component="StencilText"] em',
  });

  const DOM = Object.freeze({
    WAIT_TIMEOUT_MS: 10000,
    WAIT_INTERVAL_MS: 150,
  });

  const POPUP = Object.freeze({
    REFRESH_SUCCESS_DELAY_MS: 600,
  });

  const POLLING = Object.freeze({
    FALLBACK_DELAY_MS: 850,
    SCHEDULE_JITTER_MIN_MS: 200,
    SCHEDULE_JITTER_MAX_MS: 800,
    WAF_FORBIDDEN_BACKOFF_MS: 5000,
    AUTH_BACKOFF: Object.freeze({
      ERROR_THRESHOLD: 3,
      INTERVAL_MS: 2000,
      DURATION_MS: 60000,
      RECOVERY_SUCCESS_THRESHOLD: 2,
      AUTH_HTTP_STATUSES: Object.freeze([401]),
      AUTH_ERROR_PATTERNS: Object.freeze([
        'unauthorized',
        'forbidden',
        'not authorized',
        'not authenticated',
        'authentication',
        'authorization',
        'session',
        'token',
      ]),
    }),
  });

  const CREATE_APPLICATION = Object.freeze({
    REDIRECT_URL: AMAZON.URLS.MY_APPLICATIONS,
    REDIRECT_DELAY_MS: 10000,
    NATIVE_CLICK_DELAY_MS: 500,
    POST_NEXT_RESCAN_MS: 250,
    POST_CLICK_RESCAN_MS: 100,
    ROUTE_CHANGE_RESCAN_MS: 50,
    SCAN_INTERVAL_MS: 250,
    ACCEPT_OFFER_RETRY_DELAY_MS: 2000,
    APPLICATION_OBSERVABILITY_PENDING_TTL_MS: 10 * 60 * 1000,
    BUTTON_TEXT: Object.freeze({
      START_APPLICATION: 'Start Application',
      ACTIVE_APPLICATION_CONTINUE: 'Continue',
      SELECT_THIS_JOB: 'Select this job',
      ACCEPT_OFFER: 'Accept Offer',
      SUBMIT_SHIFT_PREFERENCES: 'Submit your shift preferences',
      CONTINUE: 'Continue',
      NEXT: 'Next',
      CREATE_APPLICATION: 'Create Application',
    }),
    ACTIVE_APPLICATION_TITLE: 'You have an active job application',
    INJECTION_FILES: Object.freeze([
      'shared/constants.js',
      'shared/utils/logger.js',
      'shared/utils/text.js',
      'shared/utils/url.js',
      'shared/utils/storage.js',
      'shared/utils/messaging.js',
      'content/utils/dom.js',
      'content/utils/application-observability.js',
      'content/utils/alerts.js',
      'content/createapp.js',
    ]),
  });

  const SCHEDULE_AUTOMATION = Object.freeze({
    ATTEMPT_QUEUE_FALLBACK_MS: 50,
    FALLBACK_DELAY_MS: 1500,
    HARD_STOP_DELAY_MS: 15000,
    NO_APPLY_JOB_SEARCH_REDIRECT_DELAY_MS: 750,
    POST_SELECT_SCHEDULE_OPTIONS_GRACE_MS: 3000,
    POST_SCHEDULE_LABEL_APPLY_GRACE_MS: 3000,
    SCHEDULE_GRAPHQL_RECOVERY_ENABLED: true,
    UNAVAILABLE_SCHEDULE_COOLDOWN_MS: 30 * 1000,
    UNAVAILABLE_SCHEDULE_STORAGE_PREFIX: '__amz_unavailable_schedule__',
    RETRY_INTERVAL_MS: 250,
    SELECT_SCHEDULE_MAX_ATTEMPTS: 6,
    EXPAND_TO_LABEL_DELAY_MS: 150,
    LABEL_SELECTION_STRATEGIES: Object.freeze({
      RANDOM: 'random',
      FIRST: 'first',
    }),
    LABEL_SELECTION_STRATEGY: 'random',
  });

  const ALERTS = Object.freeze({
    JOB_FOUND_TOAST_DURATION_MS: 10000,
    MATCHING_PROGRESS_LABEL: 'Found a Job, now we will match city',
    SOUND_FILE: 'assets/sounds/alert_long.wav',
    SESSION_UNAUTHORIZED_SOUND_FILE: 'assets/sounds/alert.wav',
    BOOKING_TERMINAL_SOUND_FILE: 'assets/sounds/alert.wav',
    JOB_FOUND_SOUND_VOLUME: 1,
    SESSION_UNAUTHORIZED_SOUND_VOLUME: 1,
    BOOKING_TERMINAL_SOUND_VOLUME: 1,
    SESSION_UNAUTHORIZED_LOGIN_REDIRECT_DELAY_MS: 2000,
  });

  root.AMZ_CONSTANTS = Object.freeze({
    isCanada,
    STORAGE_KEYS,
    MESSAGE_ACTIONS,
    USERNAME_REGEX,
    EMAIL_REGEX,
    AUTH_PROBE,
    IDENTITY,
    TEXT_LIMITS,
    LOGGING,
    INSTALL_DEFAULTS,
    RESET_DEFAULTS,
    AMAZON,
    SELECTORS,
    DOM,
    POPUP,
    POLLING,
    CREATE_APPLICATION,
    SCHEDULE_AUTOMATION,
    ALERTS,
  });
})(typeof globalThis !== 'undefined' ? globalThis : self);
