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
    LICENSE_BUYER_EMAIL: 'licenseBuyerEmail',
    LICENSE_AMAZON_EMAIL: 'licenseAmazonEmail',
    LICENSE_EMAIL: 'licenseEmail',
    LICENSE_STATE: 'licenseState',
    LICENSE_ALLOWED: 'licenseAllowed',
    LICENSE_IS_PRO_USER: 'licenseIsProUser',
    LICENSE_CHECKOUT_URL: 'licenseCheckoutUrl',
    LICENSE_MESSAGE: 'licenseMessage',
    LICENSE_CHECKED_AT: 'licenseCheckedAt',
    LICENSE_SYNC_INTERVAL_MS: 'licenseSyncIntervalMs',
    LICENSE_USAGE_KEYS: 'licenseUsageKeys',
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

  const JOB_TYPE_VALUES = Object.freeze([
    'FULL_TIME',
    'PART_TIME',
    'FLEX_TIME',
    'REDUCED_TIME',
  ]);

  const UK_CITY_COORDINATES = Object.freeze({
    'Barking': Object.freeze({ lat: 51.53622, lng: 0.08148 }),
    'Barlborough': Object.freeze({ lat: 53.288311, lng: -1.288936 }),
    'Banbury': Object.freeze({ lat: 52.060181, lng: -1.340279 }),
    'Bedford': Object.freeze({ lat: 52.136436, lng: -0.467504 }),
    'Belfast': Object.freeze({ lat: 54.597285, lng: -5.93012 }),
    'Birmingham': Object.freeze({ lat: 52.486244, lng: -1.890401 }),
    'Bolton': Object.freeze({ lat: 53.576864, lng: -2.428219 }),
    'Bournemouth': Object.freeze({ lat: 50.719164, lng: -1.880769 }),
    'Bradford': Object.freeze({ lat: 53.795984, lng: -1.759398 }),
    'Bracknell': Object.freeze({ lat: 51.414351, lng: -0.744992 }),
    'Bristol': Object.freeze({ lat: 51.454514, lng: -2.58791 }),
    'Cambridge': Object.freeze({ lat: 52.205337, lng: 0.121817 }),
    'Cardiff': Object.freeze({ lat: 51.481583, lng: -3.17909 }),
    'Carlisle': Object.freeze({ lat: 54.892473, lng: -2.932932 }),
    'Chesterfield': Object.freeze({ lat: 53.235048, lng: -1.421629 }),
    'Coalville': Object.freeze({ lat: 52.7228, lng: -1.3702 }),
    'Coventry': Object.freeze({ lat: 52.406822, lng: -1.519693 }),
    'Croydon': Object.freeze({ lat: 51.376165, lng: -0.098234 }),
    'Darlington': Object.freeze({ lat: 54.52361, lng: -1.559458 }),
    'Dartford': Object.freeze({ lat: 51.44621, lng: 0.216872 }),
    'Daventry': Object.freeze({ lat: 52.258319, lng: -1.160432 }),
    'Derby': Object.freeze({ lat: 52.92253, lng: -1.474619 }),
    'Doncaster': Object.freeze({ lat: 53.52282, lng: -1.128462 }),
    'Dunstable': Object.freeze({ lat: 51.886017, lng: -0.520995 }),
    'Dunfermline': Object.freeze({ lat: 56.071741, lng: -3.452151 }),
    'Durham': Object.freeze({ lat: 54.77525, lng: -1.584852 }),
    'Edinburgh': Object.freeze({ lat: 55.953252, lng: -3.188267 }),
    'Enfield': Object.freeze({ lat: 51.652299, lng: -0.080711 }),
    'Exeter': Object.freeze({ lat: 50.718412, lng: -3.533899 }),
    'Glasgow': Object.freeze({ lat: 55.864237, lng: -4.251806 }),
    'Gourock': Object.freeze({ lat: 55.96157, lng: -4.81789 }),
    'Hayes': Object.freeze({ lat: 51.512633, lng: -0.42031 }),
    'Hemel Hempstead': Object.freeze({ lat: 51.752725, lng: -0.469927 }),
    'Hinckley': Object.freeze({ lat: 52.541279, lng: -1.373363 }),
    'Leeds': Object.freeze({ lat: 53.800755, lng: -1.549077 }),
    'Leicester': Object.freeze({ lat: 52.636878, lng: -1.139759 }),
    'Liverpool': Object.freeze({ lat: 53.408371, lng: -2.991573 }),
    'London': Object.freeze({ lat: 51.507218, lng: -0.127586 }),
    'Luton': Object.freeze({ lat: 51.878671, lng: -0.420026 }),
    'Manchester': Object.freeze({ lat: 53.480759, lng: -2.242631 }),
    'Milton Keynes': Object.freeze({ lat: 52.040623, lng: -0.759417 }),
    'Middlesbrough': Object.freeze({ lat: 54.574227, lng: -1.234956 }),
    'Motherwell': Object.freeze({ lat: 55.78334, lng: -3.98339 }),
    'Newcastle': Object.freeze({ lat: 54.978252, lng: -1.61778 }),
    'Newcastle upon Tyne': Object.freeze({ lat: 54.978252, lng: -1.61778 }),
    'Northampton': Object.freeze({ lat: 52.240477, lng: -0.902656 }),
    'Nottingham': Object.freeze({ lat: 52.954783, lng: -1.158109 }),
    'Peterborough': Object.freeze({ lat: 52.569498, lng: -0.24053 }),
    'Plymouth': Object.freeze({ lat: 50.375456, lng: -4.142656 }),
    'Portsmouth': Object.freeze({ lat: 50.819767, lng: -1.087977 }),
    'Reading': Object.freeze({ lat: 51.45512, lng: -0.978747 }),
    'Rugby': Object.freeze({ lat: 52.370878, lng: -1.265032 }),
    'Sheffield': Object.freeze({ lat: 53.381129, lng: -1.470085 }),
    'Slough': Object.freeze({ lat: 51.510538, lng: -0.595041 }),
    'Southampton': Object.freeze({ lat: 50.9097, lng: -1.404351 }),
    'St Helens': Object.freeze({ lat: 53.456307, lng: -2.737095 }),
    'Stoke-on-Trent': Object.freeze({ lat: 53.002668, lng: -2.179404 }),
    'Sutton-in-Ashfield': Object.freeze({ lat: 53.125001, lng: -1.262129 }),
    'Swansea': Object.freeze({ lat: 51.62144, lng: -3.943646 }),
    'Swindon': Object.freeze({ lat: 51.555773, lng: -1.779718 }),
    'Theale': Object.freeze({ lat: 51.436812, lng: -1.077694 }),
    'Tilbury': Object.freeze({ lat: 51.46248, lng: 0.358556 }),
    'Wakefield': Object.freeze({ lat: 53.683298, lng: -1.505924 }),
    'Warrington': Object.freeze({ lat: 53.390044, lng: -2.59695 }),
    'Wembley': Object.freeze({ lat: 51.5588, lng: -0.2817 }),
    'Weybridge': Object.freeze({ lat: 51.371626, lng: -0.457904 }),
  });

  const UK_DEFAULT_CITY_TAGS = Object.freeze([
    'London',
    'Enfield',
    'Barking',
    'Bracknell',
    'Reading',
    'Theale',
    'Croydon',
    'Dartford',
    'Tilbury',
    'Wembley',
    'Hayes',
    'Weybridge',
    'Southampton',
    'Portsmouth',
    'Bournemouth',
    'Bristol',
    'Swindon',
    'Banbury',
    'Northampton',
    'Milton Keynes',
    'Bedford',
    'Hemel Hempstead',
    'Dunstable',
    'Coventry',
    'Rugby',
    'Daventry',
    'Leicester',
    'Coalville',
    'Hinckley',
    'Birmingham',
    'Stoke-on-Trent',
    'Nottingham',
    'Derby',
    'Sutton-in-Ashfield',
    'Sheffield',
    'Doncaster',
    'Leeds',
    'Wakefield',
    'Bradford',
    'Manchester',
    'Warrington',
    'Bolton',
    'Chesterfield',
    'Barlborough',
    'Liverpool',
    'St Helens',
    'Newcastle',
    'Durham',
    'Darlington',
    'Middlesbrough',
    'Carlisle',
    'Edinburgh',
    'Dunfermline',
    'Glasgow',
    'Motherwell',
    'Gourock',
    'Swansea',
    'Belfast',
    'Cardiff',
    'Exeter',
  ]);

  const DISTANCE_OPTIONS = Object.freeze([
    Object.freeze({ value: '5', label: '5' }),
    Object.freeze({ value: '15', label: '15' }),
    Object.freeze({ value: '25', label: '25' }),
    Object.freeze({ value: '35', label: '35' }),
    Object.freeze({ value: '50', label: '50' }),
    Object.freeze({ value: '75', label: '75' }),
    Object.freeze({ value: '150', label: '150' }),
    Object.freeze({ value: '25000', label: 'Entire Country' }),
  ]);

  const LOCAL_RUNTIME_DEFAULTS = Object.freeze({
    cityCoordinates: UK_CITY_COORDINATES,
    defaultCityTags: UK_DEFAULT_CITY_TAGS,
    cityOptions: Object.freeze(Object.keys(UK_CITY_COORDINATES).sort()),
    distanceOptions: DISTANCE_OPTIONS,
    jobTypeOptions: JOB_TYPE_VALUES,
    defaultInputs: Object.freeze({
      selectedCity: 'London',
      distance: '150',
      jobType: JOB_TYPE_VALUES,
    }),
    fetchInterval: Object.freeze({
      defaultUnit: 'ms',
      defaultSValue: '1',
      defaultMsValue: 650,
    }),
    jobSearch: Object.freeze({
      fallbackDistanceKm: 5,
      fetchTimeoutMs: 15000,
    }),
    pageRefresh: Object.freeze({
      jobSearchIntervalMs: 120000,
    }),
    features: Object.freeze({
      polling: true,
      scheduleAutomation: true,
      telegram: false,
    }),
  });

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
    [STORAGE_KEYS.SELECTED_CITY]: LOCAL_RUNTIME_DEFAULTS.defaultInputs.selectedCity,
    [STORAGE_KEYS.ALL_CITIES_SELECTED]: false,
    [STORAGE_KEYS.DISTANCE]: LOCAL_RUNTIME_DEFAULTS.defaultInputs.distance,
    [STORAGE_KEYS.JOB_TYPE]: LOCAL_RUNTIME_DEFAULTS.defaultInputs.jobType,
    [STORAGE_KEYS.FETCH_INTERVAL_VALUE]: String(LOCAL_RUNTIME_DEFAULTS.fetchInterval.defaultMsValue),
    [STORAGE_KEYS.FETCH_INTERVAL_UNIT]: LOCAL_RUNTIME_DEFAULTS.fetchInterval.defaultUnit,
    [STORAGE_KEYS.FETCH_INTERVAL_MIN_MS]: 0,
    [STORAGE_KEYS.JOB_SEARCH_FALLBACK_DISTANCE_KM]: String(LOCAL_RUNTIME_DEFAULTS.jobSearch.fallbackDistanceKm),
    [STORAGE_KEYS.JOB_SEARCH_FETCH_TIMEOUT_MS]: LOCAL_RUNTIME_DEFAULTS.jobSearch.fetchTimeoutMs,
    [STORAGE_KEYS.PAGE_REFRESH_JOB_SEARCH_INTERVAL_MS]: LOCAL_RUNTIME_DEFAULTS.pageRefresh.jobSearchIntervalMs,
    [STORAGE_KEYS.CITY_TAGS]: LOCAL_RUNTIME_DEFAULTS.defaultCityTags,
    [STORAGE_KEYS.LOG_MODE]: LOGGING.DEFAULT_MODE,
    [STORAGE_KEYS.LICENSE_EMAIL]: '',
    [STORAGE_KEYS.LICENSE_ALLOWED]: false,
    [STORAGE_KEYS.LICENSE_IS_PRO_USER]: false,
    [STORAGE_KEYS.LICENSE_CHECKOUT_URL]: '',
    [STORAGE_KEYS.LICENSE_MESSAGE]: '',
    [STORAGE_KEYS.LICENSE_CHECKED_AT]: 0,
    [STORAGE_KEYS.LICENSE_SYNC_INTERVAL_MS]: 0,
    [STORAGE_KEYS.LICENSE_USAGE_KEYS]: {},
  });

  const RESET_DEFAULTS = Object.freeze({
    [STORAGE_KEYS.ACTIVE]: false,
    [STORAGE_KEYS.SELECTED_CITY]: LOCAL_RUNTIME_DEFAULTS.defaultInputs.selectedCity,
    [STORAGE_KEYS.ALL_CITIES_SELECTED]: false,
    [STORAGE_KEYS.LATITUDE]: null,
    [STORAGE_KEYS.LONGITUDE]: null,
    [STORAGE_KEYS.DISTANCE]: LOCAL_RUNTIME_DEFAULTS.defaultInputs.distance,
    [STORAGE_KEYS.JOB_TYPE]: LOCAL_RUNTIME_DEFAULTS.defaultInputs.jobType,
    [STORAGE_KEYS.FETCH_INTERVAL_VALUE]: String(LOCAL_RUNTIME_DEFAULTS.fetchInterval.defaultMsValue),
    [STORAGE_KEYS.FETCH_INTERVAL_UNIT]: LOCAL_RUNTIME_DEFAULTS.fetchInterval.defaultUnit,
    [STORAGE_KEYS.FETCH_INTERVAL_MIN_MS]: 0,
    [STORAGE_KEYS.JOB_SEARCH_FALLBACK_DISTANCE_KM]: String(LOCAL_RUNTIME_DEFAULTS.jobSearch.fallbackDistanceKm),
    [STORAGE_KEYS.JOB_SEARCH_FETCH_TIMEOUT_MS]: LOCAL_RUNTIME_DEFAULTS.jobSearch.fetchTimeoutMs,
    [STORAGE_KEYS.PAGE_REFRESH_JOB_SEARCH_INTERVAL_MS]: LOCAL_RUNTIME_DEFAULTS.pageRefresh.jobSearchIntervalMs,
    [STORAGE_KEYS.CITY_TAGS]: LOCAL_RUNTIME_DEFAULTS.defaultCityTags,
    [STORAGE_KEYS.LOG_MODE]: LOGGING.DEFAULT_MODE,
    [STORAGE_KEYS.LICENSE_EMAIL]: '',
    [STORAGE_KEYS.LICENSE_ALLOWED]: false,
    [STORAGE_KEYS.LICENSE_IS_PRO_USER]: false,
    [STORAGE_KEYS.LICENSE_CHECKOUT_URL]: '',
    [STORAGE_KEYS.LICENSE_MESSAGE]: '',
    [STORAGE_KEYS.LICENSE_CHECKED_AT]: 0,
    [STORAGE_KEYS.LICENSE_SYNC_INTERVAL_MS]: 0,
    [STORAGE_KEYS.LICENSE_USAGE_KEYS]: {},
  });

  const BACKEND = Object.freeze({
    PRODUCT_ID: 'amazon-warehouse-jobs-uk',
    PRODUCT_NAME: 'Amazon Warehouse Jobs UK',
    COUNTRY: 'United Kingdom',
    DEFAULT_LICENSE_SYNC_INTERVAL_MS: 15 * 60 * 1000,
    FALLBACK_DEFAULTS: LOCAL_RUNTIME_DEFAULTS,
  });

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

  const PAYMENT_GATE = Object.freeze({
    API_BASE_URL: 'https://getslotnow.com/extension-usage-tracker',
    PRODUCT_ID: 'amazon-warehouse-jobs-uk',
    COUNTRY: ACTIVE_COUNTRY_CONFIG.countryCode,
    EXTENSION_NAME: 'Amazon Warehouse UK',
    DEFAULT_SYNC_INTERVAL_MS: 15 * 60 * 1000,
    RETRY_SYNC_INTERVAL_MS: 60 * 1000,
    BOOKING_CACHE_MAX_AGE_MS: 5 * 60 * 1000,
    ENDPOINTS: Object.freeze({
      CHECK: '/api/amazon-warehouse-jobs-uk/license/check',
      CHECKOUT: '/api/amazon-warehouse-jobs-uk/license/checkout',
      USAGE: '/api/amazon-warehouse-jobs-uk/license/usage',
    }),
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
    BACKEND,
    AMAZON,
    SELECTORS,
    DOM,
    POPUP,
    POLLING,
    CREATE_APPLICATION,
    SCHEDULE_AUTOMATION,
    PAYMENT_GATE,
    ALERTS,
  });
})(typeof globalThis !== 'undefined' ? globalThis : self);
