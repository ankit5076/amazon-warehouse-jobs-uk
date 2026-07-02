/* Popup controller: local booking settings. */
document.addEventListener('DOMContentLoaded', async () => {
  'use strict';

  const {
    BACKEND,
    MESSAGE_ACTIONS,
    POPUP,
    RESET_DEFAULTS,
    STORAGE_KEYS,
  } = globalThis.AMZ_CONSTANTS;
  const state = globalThis.AMZ_STATE;
  const storage = globalThis.AMZ_STORAGE;
  const access = globalThis.AMZ_ACCESS;
  const account = globalThis.AMZ_ACCOUNT;
  const runtimeControlUtils = globalThis.AMZ_RUNTIME_CONTROLS;
  const log = (...args) => console.log(...args);
  log.event = log;
  log.log = log;
  log.info = (...args) => console.info(...args);
  log.warn = (...args) => console.warn(...args);
  log.error = (...args) => console.error(...args);
  log.debug = (...args) => console.debug(...args);
  log.trace = (...args) => console.debug(...args);

  document.getElementById('version').innerText = '(version v' + storage.getManifestVersion() + ')';

  let runtimeControls = BACKEND.FALLBACK_DEFAULTS;
  let cityCoordinates = runtimeControls.cityCoordinates || {};
  let resetInProgress = false;

  const elements = {
    city: document.getElementById('city'),
    distance: document.getElementById('distance'),
    jobType: document.getElementById('jobType'),
    jobTypeChoices: document.getElementById('job-type-options'),
    activate: document.getElementById('activate'),
    intervalValue: document.getElementById('fetch_interval_value'),
    intervalUnit: document.getElementById('fetch_interval_unit'),
    amazonEmailDisplay: document.getElementById('amazon-email-display'),
    accessPanel: document.querySelector('.access-panel'),
    accessStatus: document.getElementById('access-status'),
    accessDetail: document.getElementById('access-detail'),
    buyAccessButton: document.getElementById('buy-access'),
    authenticatedSections: Array.from(document.querySelectorAll('[data-authenticated-section]')),
    addAllCitiesButton: document.getElementById('add-all-cities'),
    cityScopeStatus: document.getElementById('city-scope-status'),
    cityFilterContainer: document.querySelector('.tag-input-container'),
    selectAllJobTypesButton: document.getElementById('select-all-job-types'),
    refreshForm: document.getElementById('refresh_info'),
    resetForm: document.getElementById('ais_visa_info'),
    resetButton: document.getElementById('reset_info'),
    refreshButton: document.getElementById('refresh_btn'),
  };

  function normalizeEmail(value) {
    return String(value || '').trim().toLowerCase();
  }

  function setBookingUiEnabled() {
    document.body?.classList.toggle('auth-complete', true);
    document.body?.classList.toggle('auth-required', false);
    elements.authenticatedSections.forEach(section => {
      section.hidden = false;
    });
  }

  function setAccessUiState(stateName, status, detail) {
    if (elements.accessPanel) {
      elements.accessPanel.classList.remove('access-active', 'access-denied', 'access-error', 'access-checking');
      if (stateName) elements.accessPanel.classList.add('access-' + stateName);
    }
    if (elements.accessStatus) elements.accessStatus.textContent = status || '';
    if (elements.accessDetail) elements.accessDetail.textContent = detail || '';
  }

  function setBuyAccessBusy(busy) {
    if (!elements.buyAccessButton) return;
    elements.buyAccessButton.disabled = busy === true;
    elements.buyAccessButton.textContent = busy === true
      ? 'Opening checkout...'
      : (BACKEND.ACCESS_PASS?.BUY_LABEL || 'Buy access');
  }

  function renderAccessStatus(snapshot, email) {
    if (!email) {
      setAccessUiState(
        'denied',
        'Amazon email not detected',
        'Search can run after Amazon sign-in; booking unlocks after purchase.'
      );
      return;
    }
    if (!snapshot) {
      setAccessUiState('checking', 'Checking access', 'Search remains available while booking access is checked.');
      return;
    }
    if (snapshot.allowed === true) {
      const expiry = access?.formatAccessExpiry?.(snapshot) || '';
      setAccessUiState(
        'active',
        'Access active',
        expiry
          ? 'Valid until ' + expiry + '. Unlimited bookings enabled.'
          : 'Unlimited bookings enabled.'
      );
      return;
    }
    setAccessUiState(
      snapshot.source === 'network-error' || snapshot.source === 'usage-error' ? 'error' : 'denied',
      'Booking locked',
      snapshot.message || 'Buy access to continue from search into booking.'
    );
  }

  function currentAmazonEmail() {
    return normalizeEmail(elements.amazonEmailDisplay?.dataset?.email || '');
  }

  async function refreshAccessStatus(options = {}) {
    const email = currentAmazonEmail() || await getStoredAmazonEmail();
    renderAccessStatus(null, email);
    if (!email || !access?.checkAccess) return null;
    const snapshot = await access.checkAccess(email, { force: options.force === true });
    renderAccessStatus(snapshot, email);
    return snapshot;
  }

  function sameEmail(left, right) {
    return normalizeEmail(left) === normalizeEmail(right);
  }

  function setAmazonEmailDisplay(email) {
    const normalized = normalizeEmail(email);
    if (!elements.amazonEmailDisplay) return;
    elements.amazonEmailDisplay.dataset.email = normalized;
    elements.amazonEmailDisplay.textContent = normalized || 'Not detected';
    elements.amazonEmailDisplay.title = normalized || 'Open Amazon Jobs while signed in to detect the account email';
  }

  function normalizeSelectOption(option) {
    if (typeof option === 'string' || typeof option === 'number') {
      const value = runtimeControlUtils.normalizeOptionValue(option);
      return value ? { value, label: value } : null;
    }
    if (!option || typeof option !== 'object') return null;

    const value = runtimeControlUtils.normalizeOptionValue(option.value);
    if (!value) return null;

    return {
      value,
      label: runtimeControlUtils.normalizeOptionValue(option.label) || value,
    };
  }

  function compareSelectOptions(left, right) {
    return left.label.localeCompare(right.label, undefined, { sensitivity: 'base' }) ||
      left.value.localeCompare(right.value, undefined, { sensitivity: 'base' });
  }

  function normalizeUniqueOptions(options, initialSeenValues = []) {
    const seenValues = new Set(initialSeenValues);
    return (options || [])
      .map(normalizeSelectOption)
      .filter(normalized => {
        if (!normalized || seenValues.has(normalized.value)) return false;
        seenValues.add(normalized.value);
        return true;
      });
  }

  function populateSelect(selectElement, options, fallbackValue = '', preferredValue = '') {
    if (!selectElement) return;
    selectElement.replaceChildren();
    const seenValues = new Set();
    (options || []).forEach(option => {
      const normalized = normalizeSelectOption(option);
      if (!normalized || seenValues.has(normalized.value)) return;
      seenValues.add(normalized.value);

      const optionElement = document.createElement('option');
      optionElement.value = normalized.value;
      optionElement.textContent = normalized.label;
      selectElement.append(optionElement);
    });
    const optionValues = [...selectElement.options].map(option => option.value);
    const nextValue = [
      runtimeControlUtils.normalizeOptionValue(preferredValue),
      runtimeControlUtils.normalizeOptionValue(fallbackValue),
    ].find(value => optionValues.includes(value));
    if (nextValue) selectElement.value = nextValue;
    else if (selectElement.options.length > 0) selectElement.selectedIndex = 0;
  }

  function populateCitySelect(options, fallbackValue = '', preferredValue = '', allCitiesSelected = false) {
    if (!elements.city) return;
    elements.city.replaceChildren();

    const allOption = document.createElement('option');
    allOption.value = '';
    allOption.textContent = 'All cities';
    elements.city.append(allOption);

    normalizeUniqueOptions(options, [''])
      .sort(compareSelectOptions)
      .forEach(normalized => {
        const optionElement = document.createElement('option');
        optionElement.value = normalized.value;
        optionElement.textContent = normalized.label;
        elements.city.append(optionElement);
      });

    if (allCitiesSelected === true) {
      elements.city.value = '';
      return;
    }

    const optionValues = [...elements.city.options].map(option => option.value);
    const nextValue = [
      runtimeControlUtils.normalizeOptionValue(preferredValue),
      runtimeControlUtils.normalizeOptionValue(fallbackValue),
    ].find(value => optionValues.includes(value));
    elements.city.value = nextValue || '';
  }

  function getSelectedValues(selectElement) {
    if (!selectElement) return [];
    return Array.from(selectElement.selectedOptions || [])
      .map(option => option.value)
      .filter(Boolean);
  }

  function formatJobTypeLabel(value, label = '') {
    const displayText = String(label || value || '')
      .replace(/_/g, ' ')
      .trim()
      .toLowerCase();
    return displayText.replace(/\b\w/g, letter => letter.toUpperCase());
  }

  function getCheckedJobTypeValues() {
    if (!elements.jobTypeChoices) return getSelectedValues(elements.jobType);
    return Array.from(elements.jobTypeChoices.querySelectorAll('input[data-job-type]:checked'))
      .map(input => input.value)
      .filter(Boolean);
  }

  function updateJobTypeChoices(values) {
    if (!elements.jobTypeChoices) return;
    const selectedValues = new Set(runtimeControlUtils.normalizeJobTypeList(values));
    Array.from(elements.jobTypeChoices.querySelectorAll('input[data-job-type]')).forEach(input => {
      const selected = selectedValues.has(input.value);
      input.checked = selected;
      input.closest('.job-type-option')?.classList.toggle('selected', selected);
    });
  }

  async function syncJobTypeChoicesToStorage() {
    const values = getCheckedJobTypeValues();
    setSelectedValues(elements.jobType, values);
    await state.setJobType(values);
  }

  function renderJobTypeChoices(options) {
    if (!elements.jobTypeChoices) return;
    const selectedValues = new Set(getSelectedValues(elements.jobType));
    elements.jobTypeChoices.replaceChildren();
    const seenValues = new Set();
    (options || []).forEach(option => {
      const normalized = normalizeSelectOption(option);
      if (!normalized || seenValues.has(normalized.value)) return;
      seenValues.add(normalized.value);

      const wrapper = document.createElement('label');
      wrapper.className = 'job-type-option';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = normalized.value;
      checkbox.dataset.jobType = normalized.value;
      checkbox.checked = selectedValues.has(normalized.value);
      checkbox.addEventListener('change', () => {
        syncJobTypeChoicesToStorage().catch(error => log.error('job type update failed:', error));
      });

      const label = document.createElement('span');
      label.textContent = formatJobTypeLabel(normalized.value, normalized.label);

      wrapper.append(checkbox, label);
      wrapper.classList.toggle('selected', checkbox.checked);
      elements.jobTypeChoices.append(wrapper);
    });
  }

  function setSelectedValues(selectElement, values) {
    if (!selectElement) return;
    const normalizedValues = selectElement === elements.jobType
      ? runtimeControlUtils.normalizeJobTypeList(values)
      : runtimeControlUtils.normalizeStringList(values);
    const selectedValues = new Set(normalizedValues);
    Array.from(selectElement.options || []).forEach(option => {
      option.selected = selectedValues.has(option.value);
    });
    if (selectElement === elements.jobType) updateJobTypeChoices(normalizedValues);
  }

  function getAllowedSelection(options, values) {
    const allowed = new Set((options || [])
      .map(normalizeSelectOption)
      .filter(Boolean)
      .map(option => option.value));
    return runtimeControlUtils.normalizeStringList(values)
      .filter(value => allowed.has(value));
  }

  function populateMultiSelect(selectElement, options, fallbackValues = [], preferredValues = []) {
    if (!selectElement) return;
    const currentValues = getSelectedValues(selectElement);
    selectElement.replaceChildren();
    const seenValues = new Set();
    (options || []).forEach(option => {
      const normalized = normalizeSelectOption(option);
      if (!normalized || seenValues.has(normalized.value)) return;
      seenValues.add(normalized.value);

      const optionElement = document.createElement('option');
      optionElement.value = normalized.value;
      optionElement.textContent = normalized.label;
      selectElement.append(optionElement);
    });

    const nextValues = [
      getAllowedSelection(options, currentValues),
      getAllowedSelection(options, preferredValues),
      getAllowedSelection(options, fallbackValues),
    ].find(values => values.length) || [];
    setSelectedValues(selectElement, nextValues);
    if (selectElement === elements.jobType) renderJobTypeChoices(options);
  }

  function applyControls(controls, preferredValues = {}) {
    runtimeControls = controls || BACKEND.FALLBACK_DEFAULTS;
    cityCoordinates = runtimeControls.cityCoordinates || {};
    populateCitySelect(
      runtimeControls.cityOptions || [],
      runtimeControls.defaultInputs?.selectedCity,
      preferredValues.selectedCity,
      preferredValues.allCitiesSelected === true
    );
    populateSelect(
      elements.distance,
      runtimeControls.distanceOptions || [],
      runtimeControls.defaultInputs?.distance,
      preferredValues.distance
    );
    populateMultiSelect(
      elements.jobType,
      runtimeControls.jobTypeOptions || [],
      runtimeControls.defaultInputs?.jobType,
      preferredValues.jobType
    );
    updateAllCitiesUi(preferredValues.allCitiesSelected === true);
  }

  function getAllCityTags() {
    const cityOptionLabels = (runtimeControls.cityOptions || [])
      .map(normalizeSelectOption)
      .filter(Boolean)
      .flatMap(option => [option.label, option.value]);
    return runtimeControlUtils.normalizeStringList([
      ...(runtimeControls.defaultCityTags || []),
      ...cityOptionLabels,
      ...Object.keys(runtimeControls.cityCoordinates || {}),
    ]);
  }

  function getAllJobTypes() {
    return runtimeControlUtils.normalizeJobTypeList(
      (runtimeControls.jobTypeOptions || []).map(option => normalizeSelectOption(option)?.value)
    );
  }

  function updateAllCitiesUi(allCitiesSelected) {
    const active = allCitiesSelected === true;
    elements.addAllCitiesButton?.classList.toggle('active', active);
    elements.addAllCitiesButton?.setAttribute('aria-pressed', active ? 'true' : 'false');
    elements.cityFilterContainer?.classList.toggle('all-cities-active', active);
    const distanceField = elements.distance?.closest('.field');
    distanceField?.classList.toggle('all-cities-disabled', active);
    if (elements.distance) {
      elements.distance.disabled = active;
      elements.distance.title = active ? 'Distance is ignored while All cities is selected' : '';
    }
    if (elements.cityScopeStatus) {
      elements.cityScopeStatus.textContent = active ? 'All cities' : 'City specific';
      elements.cityScopeStatus.classList.toggle('active', active);
    }
  }

  function getIntervalDefaultValueForUnit(unit) {
    const normalizedUnit = runtimeControlUtils.normalizeOptionValue(unit);
    const runtimeDefault = runtimeControls?.fetchInterval || {};
    const runtimeDefaultUnit = runtimeControlUtils.normalizeOptionValue(runtimeDefault.defaultUnit);
    const unitDefaultValue = runtimeControlUtils.getFetchIntervalDefaultValue(runtimeDefault, normalizedUnit);

    if (normalizedUnit && normalizedUnit === runtimeDefaultUnit && unitDefaultValue) return unitDefaultValue;
    if (unitDefaultValue) return unitDefaultValue;
    return globalThis.AMZ_INTERVALS.getDefaultValue(normalizedUnit);
  }

  function normalizeIntervalValueForUnit(value, unit) {
    const normalizedUnit = runtimeControlUtils.normalizeOptionValue(unit);
    const parsedValue = runtimeControlUtils.normalizePositiveInteger(value);
    if (!parsedValue) return getIntervalDefaultValueForUnit(normalizedUnit);
    return String(parsedValue);
  }

  async function syncCoordinatesForCity(city) {
    const coordinates = runtimeControlUtils.getCoordinates(cityCoordinates, city);
    if (!coordinates) return;
    await state.setCitySelection(city, coordinates);
  }

  async function getStoredSearchInputs() {
    const stored = await state.getPopupFormState();
    return {
      selectedCity: stored[STORAGE_KEYS.SELECTED_CITY] || '',
      allCitiesSelected: stored[STORAGE_KEYS.ALL_CITIES_SELECTED] === true,
      distance: stored[STORAGE_KEYS.DISTANCE] || '',
      jobType: runtimeControlUtils.normalizeJobTypeList(stored[STORAGE_KEYS.JOB_TYPE]),
    };
  }

  async function syncRuntimeControlsToStorage(options = {}) {
    const forceDefaults = options.forceDefaults === true;
    const intervalUnit = elements.intervalUnit?.value || '';
    const intervalValue = normalizeIntervalValueForUnit(elements.intervalValue?.value || '', intervalUnit);
    if (!forceDefaults && elements.intervalValue) elements.intervalValue.value = intervalValue;

    const { snapshot } = await state.syncRuntimeControls(runtimeControls, {
      selectedCity: forceDefaults ? '' : elements.city?.value || '',
      allCitiesSelected: forceDefaults ? false : elements.city?.value === '',
      distance: forceDefaults ? '' : elements.distance?.value || '',
      jobType: forceDefaults ? [] : getSelectedValues(elements.jobType),
      fetchIntervalUnit: forceDefaults ? '' : intervalUnit,
      fetchIntervalValue: forceDefaults ? '' : intervalValue,
    }, {
      missingOnlyKeys: forceDefaults ? [] : [STORAGE_KEYS.CITY_TAGS],
      useStoredCurrent: !forceDefaults,
    });
    if (elements.city) elements.city.value = snapshot[STORAGE_KEYS.SELECTED_CITY];
    if (elements.distance) elements.distance.value = snapshot[STORAGE_KEYS.DISTANCE];
    updateAllCitiesUi(snapshot[STORAGE_KEYS.ALL_CITIES_SELECTED] === true);
    setSelectedValues(elements.jobType, snapshot[STORAGE_KEYS.JOB_TYPE]);
    if (elements.intervalUnit) elements.intervalUnit.value = snapshot[STORAGE_KEYS.FETCH_INTERVAL_UNIT];
    if (elements.intervalValue) elements.intervalValue.value = snapshot[STORAGE_KEYS.FETCH_INTERVAL_VALUE];
    await tagManager.renderFromStorage();
  }

  async function getActiveTabUrl() {
    try {
      const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      return activeTab?.url || '';
    } catch (_) {
      return '';
    }
  }

  function isAmazonAuthPage(url) {
    try {
      return new URL(url).hostname === 'auth.hiring.amazon.com';
    } catch (_) {
      return false;
    }
  }

  async function getStoredAmazonEmail() {
    const stored = await storage.getLocal([
      STORAGE_KEYS.AMAZON_LOGIN_USERNAME,
      STORAGE_KEYS.USER_EMAIL,
    ]);
    return normalizeEmail(
      stored[STORAGE_KEYS.AMAZON_LOGIN_USERNAME] ||
      stored[STORAGE_KEYS.USER_EMAIL] ||
      ''
    );
  }

  async function clearIdentityForNoAuthSessionIfNeeded() {
    const activeUrl = await getActiveTabUrl();
    if (!isAmazonAuthPage(activeUrl)) return false;
    setAmazonEmailDisplay('');
    await refreshActivationGate();
    return true;
  }

  async function refreshActivationGate() {
    setBookingUiEnabled();
    if (elements.activate) {
      elements.activate.disabled = false;
      elements.activate.title = '';
    }
    await refreshAccessStatus();
  }

  async function notifyActiveTab(active) {
    const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (activeTab?.id) {
      chrome.tabs.sendMessage(activeTab.id, {
        action: MESSAGE_ACTIONS.ACTIVATE,
        status: active,
      });
    }
  }

  async function applyStoredState() {
    const clearedForNoAuthSession = await clearIdentityForNoAuthSessionIfNeeded();
    const [stored, savedEmail] = await Promise.all([
      state.getPopupFormState(),
      getStoredAmazonEmail(),
    ]);
    if (!clearedForNoAuthSession) setAmazonEmailDisplay(savedEmail);

    const selectedCity = stored[STORAGE_KEYS.SELECTED_CITY] || '';
    const allCitiesSelected =
      stored[STORAGE_KEYS.ALL_CITIES_SELECTED] === true ||
      (!selectedCity && Array.isArray(stored[STORAGE_KEYS.CITY_TAGS]) && stored[STORAGE_KEYS.CITY_TAGS].length > 0);
    const savedDistance = stored[STORAGE_KEYS.DISTANCE] || '';
    const savedJobType = runtimeControlUtils.normalizeJobTypeList(stored[STORAGE_KEYS.JOB_TYPE]);
    const intervalUnit = stored[STORAGE_KEYS.FETCH_INTERVAL_UNIT] || globalThis.AMZ_INTERVALS.getDefaultUnit();
    const intervalValue = stored[STORAGE_KEYS.FETCH_INTERVAL_VALUE] || getIntervalDefaultValueForUnit(intervalUnit);

    applyControls(BACKEND.FALLBACK_DEFAULTS, {
      selectedCity,
      allCitiesSelected,
      distance: savedDistance,
      jobType: savedJobType,
    });
    if (elements.city) elements.city.value = selectedCity;
    if (elements.distance) elements.distance.value = savedDistance;
    updateAllCitiesUi(allCitiesSelected);
    setSelectedValues(elements.jobType, savedJobType);
    if (elements.activate) elements.activate.checked = stored[STORAGE_KEYS.ACTIVE] === true;
    if (elements.intervalValue) elements.intervalValue.value = intervalValue;
    if (elements.intervalUnit) elements.intervalUnit.value = intervalUnit;
    await tagManager.renderFromStorage();
    if (!allCitiesSelected) await syncCoordinatesForCity(selectedCity);
    await refreshActivationGate();
  }

  async function applyLiveStorageChange(changes, areaName) {
    if (areaName !== 'local' || resetInProgress) return;
    let shouldRenderTags = false;

    if (changes[STORAGE_KEYS.AMAZON_LOGIN_USERNAME] || changes[STORAGE_KEYS.USER_EMAIL]) {
      const previousEmail = currentAmazonEmail();
      const email = normalizeEmail(
        changes[STORAGE_KEYS.AMAZON_LOGIN_USERNAME]?.newValue ||
        changes[STORAGE_KEYS.USER_EMAIL]?.newValue ||
        ''
      );
      setAmazonEmailDisplay(email);
      if (!sameEmail(previousEmail, email)) await refreshActivationGate();
    }
    if (changes[STORAGE_KEYS.SELECTED_CITY] && elements.city) {
      elements.city.value = changes[STORAGE_KEYS.SELECTED_CITY].newValue || '';
      shouldRenderTags = true;
    }
    if (changes[STORAGE_KEYS.ALL_CITIES_SELECTED]) {
      updateAllCitiesUi(changes[STORAGE_KEYS.ALL_CITIES_SELECTED].newValue === true);
    }
    if (changes[STORAGE_KEYS.DISTANCE] && elements.distance) {
      elements.distance.value = changes[STORAGE_KEYS.DISTANCE].newValue || '';
    }
    if (changes[STORAGE_KEYS.JOB_TYPE] && elements.jobType) {
      setSelectedValues(elements.jobType, changes[STORAGE_KEYS.JOB_TYPE].newValue);
    }
    if (changes[STORAGE_KEYS.FETCH_INTERVAL_UNIT] && elements.intervalUnit) {
      elements.intervalUnit.value = changes[STORAGE_KEYS.FETCH_INTERVAL_UNIT].newValue || '';
    }
    if (changes[STORAGE_KEYS.FETCH_INTERVAL_VALUE] && elements.intervalValue) {
      elements.intervalValue.value = changes[STORAGE_KEYS.FETCH_INTERVAL_VALUE].newValue ||
        getIntervalDefaultValueForUnit(elements.intervalUnit?.value);
    }
    if (changes[STORAGE_KEYS.ACTIVE] && elements.activate) {
      elements.activate.checked = changes[STORAGE_KEYS.ACTIVE].newValue === true;
    }
    if (changes[STORAGE_KEYS.CITY_TAGS]) shouldRenderTags = true;
    if (shouldRenderTags) await tagManager.renderFromStorage();
    await refreshActivationGate();
  }

  applyControls(BACKEND.FALLBACK_DEFAULTS);
  const tagManager = globalThis.AMZ_POPUP_TAGS.create({
    defaultSelectedCity: '',
  });
  tagManager.bind();

  await applyStoredState();
  chrome.storage.onChanged.addListener((changes, areaName) => {
    applyLiveStorageChange(changes, areaName).catch(error => {
      log.error('live storage sync failed:', error);
    });
  });

  elements.city?.addEventListener('change', async event => {
    const city = event.target.value;
    if (!city) {
      await state.setAllCitiesSelection(getAllCityTags());
      updateAllCitiesUi(true);
      await tagManager.renderFromStorage();
      await refreshActivationGate();
      return;
    }
    const coordinates = runtimeControlUtils.getCoordinates(cityCoordinates, city);
    await state.setCitySelection(city, coordinates, { allCitiesSelected: false });
    updateAllCitiesUi(false);
    await tagManager.renderFromStorage();
    await refreshActivationGate();
  });

  elements.distance?.addEventListener('change', event => {
    state.setDistance(event.target.value);
  });
  elements.jobType?.addEventListener('change', event => {
    const values = getSelectedValues(event.target);
    updateJobTypeChoices(values);
    state.setJobType(values);
  });
  elements.intervalValue?.addEventListener('change', event => {
    const normalizedValue = normalizeIntervalValueForUnit(event.target.value, elements.intervalUnit?.value);
    event.target.value = normalizedValue;
    state.setFetchIntervalValue(normalizedValue);
  });
  elements.intervalUnit?.addEventListener('change', async event => {
    const unit = event.target.value;
    const defaultValue = getIntervalDefaultValueForUnit(unit);
    if (elements.intervalValue) elements.intervalValue.value = defaultValue;
    await state.setFetchInterval(unit, defaultValue);
  });

  elements.addAllCitiesButton?.addEventListener('click', async () => {
    if (elements.city) elements.city.value = '';
    await state.setAllCitiesSelection(getAllCityTags());
    updateAllCitiesUi(true);
    await tagManager.renderFromStorage();
    await refreshActivationGate();
  });

  elements.selectAllJobTypesButton?.addEventListener('click', async () => {
    const jobTypes = getAllJobTypes();
    setSelectedValues(elements.jobType, jobTypes);
    await state.setJobType(jobTypes);
  });

  elements.buyAccessButton?.addEventListener('click', async () => {
    const email = currentAmazonEmail() || await getStoredAmazonEmail();
    if (!email) {
      renderAccessStatus({
        allowed: false,
        message: 'Open Amazon Jobs while signed in so the extension can detect your Amazon email.',
      }, '');
      return;
    }

    setBuyAccessBusy(true);
    try {
      const checkout = await access.createCheckout(email);
      if (!checkout.checkoutUrl) throw new Error('Checkout URL was not returned.');
      if (typeof globalThis.chrome?.tabs?.create === 'function') {
        await globalThis.chrome.tabs.create({ url: checkout.checkoutUrl });
      } else {
        window.open(checkout.checkoutUrl, '_blank', 'noopener');
      }
      renderAccessStatus(checkout, email);
    } catch (error) {
      renderAccessStatus({
        allowed: false,
        source: 'error',
        message: error?.message || String(error),
      }, email);
    } finally {
      setBuyAccessBusy(false);
    }
  });

  elements.activate?.addEventListener('change', async event => {
    if (!event.target.checked) {
      const active = await state.setActive(false);
      await notifyActiveTab(active);
      return;
    }

    const active = await state.setActive(true);
    event.target.checked = active;
    await notifyActiveTab(active);
  });

  elements.refreshForm?.addEventListener('submit', async event => {
    event.preventDefault();
    if (!elements.refreshButton) return;
      elements.refreshButton.disabled = true;
      elements.refreshButton.innerText = 'Refreshing...';
    try {
      await syncRuntimeControlsToStorage();
      await refreshAccessStatus({ force: true });
      elements.refreshButton.classList.add('btn-success');
      elements.refreshButton.innerText = 'Success';
      await new Promise(resolve => setTimeout(resolve, POPUP.REFRESH_SUCCESS_DELAY_MS));
    } finally {
      elements.refreshButton.classList.remove('btn-success');
      elements.refreshButton.innerText = 'Refresh';
      elements.refreshButton.disabled = false;
    }
  });

  elements.resetForm?.addEventListener('submit', async event => {
    event.preventDefault();
    if (elements.resetButton) {
      elements.resetButton.disabled = true;
      elements.resetButton.innerText = 'Resetting...';
    }

    try {
      resetInProgress = true;
      const resetValues = {
        ...RESET_DEFAULTS,
        [STORAGE_KEYS.USER_EMAIL]: '',
      };

      await state.resetLocal(resetValues);
      if (elements.city) elements.city.value = RESET_DEFAULTS[STORAGE_KEYS.SELECTED_CITY];
      if (elements.distance) elements.distance.value = RESET_DEFAULTS[STORAGE_KEYS.DISTANCE];
      setSelectedValues(elements.jobType, RESET_DEFAULTS[STORAGE_KEYS.JOB_TYPE]);
      if (elements.intervalValue) elements.intervalValue.value = RESET_DEFAULTS[STORAGE_KEYS.FETCH_INTERVAL_VALUE];
      if (elements.intervalUnit) elements.intervalUnit.value = RESET_DEFAULTS[STORAGE_KEYS.FETCH_INTERVAL_UNIT];
      if (elements.activate) elements.activate.checked = false;
      await syncRuntimeControlsToStorage({ forceDefaults: true });
      await refreshActivationGate();
    } finally {
      resetInProgress = false;
      if (elements.resetButton) {
        elements.resetButton.disabled = false;
        elements.resetButton.innerText = 'Reset';
      }
    }
  });
});
