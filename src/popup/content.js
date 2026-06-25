/* Popup controller: local-only booking settings. */
document.addEventListener('DOMContentLoaded', async () => {
  'use strict';

  const {
    AMAZON,
    LOGGING,
    MESSAGE_ACTIONS,
    RESET_DEFAULTS,
    STORAGE_KEYS,
  } = globalThis.AMZ_CONSTANTS;
  const state = globalThis.AMZ_STATE;
  const storage = globalThis.AMZ_STORAGE;
  const runtimeControls = globalThis.AMZ_RUNTIME_CONTROLS;
  const log = globalThis.AMZ_LOGGER.create('[popup]', {
    workflow: 'popup-settings',
    source: 'popup/content.js',
  });
  const USER_LOG_OPTIONS = Object.freeze({});

  document.getElementById('version').innerText = '(version v' + storage.getManifestVersion() + ')';

  const elements = {
    jobType: document.getElementById('jobType'),
    activate: document.getElementById('activate'),
    logMode: document.getElementById('log_mode'),
    intervalValue: document.getElementById('fetch_interval_value'),
    intervalUnit: document.getElementById('fetch_interval_unit'),
    addAllCitiesButton: document.getElementById('add-all-cities'),
    cityScopeStatus: document.getElementById('city-scope-status'),
    cityFilterContainer: document.querySelector('.tag-input-container'),
    selectAllJobTypesButton: document.getElementById('select-all-job-types'),
    resetForm: document.getElementById('ais_visa_info'),
    resetButton: document.getElementById('reset_info'),
    status: document.getElementById('local-settings-status'),
  };

  let resetInProgress = false;

  function normalizeSelectOption(option) {
    const value = runtimeControls.normalizeOptionValue(option);
    return value ? { value, label: value.replace(/_/g, ' ') } : null;
  }

  function getSelectedValues(selectElement) {
    if (!selectElement) return [];
    return Array.from(selectElement.selectedOptions || [])
      .map(option => option.value)
      .filter(Boolean);
  }

  function setSelectedValues(selectElement, values) {
    if (!selectElement) return;
    const selectedValues = new Set(runtimeControls.normalizeJobTypeList(values));
    Array.from(selectElement.options || []).forEach(option => {
      option.selected = selectedValues.has(option.value);
    });
  }

  function populateJobTypes(preferredValues = []) {
    if (!elements.jobType) return;
    elements.jobType.replaceChildren();
    (AMAZON.JOB_TYPE_VALUES || []).forEach(option => {
      const normalized = normalizeSelectOption(option);
      if (!normalized) return;
      const optionElement = document.createElement('option');
      optionElement.value = normalized.value;
      optionElement.textContent = normalized.label;
      elements.jobType.append(optionElement);
    });
    setSelectedValues(elements.jobType, preferredValues.length ? preferredValues : AMAZON.JOB_TYPE_VALUES);
  }

  function setStatus(message, tone = '') {
    if (!elements.status) return;
    elements.status.textContent = message || '';
    elements.status.className = ['local-settings-status', tone].filter(Boolean).join(' ');
  }

  function updateAllCitiesUi(allCitiesSelected) {
    const active = allCitiesSelected === true;
    elements.addAllCitiesButton?.classList.toggle('active', active);
    elements.addAllCitiesButton?.setAttribute('aria-pressed', active ? 'true' : 'false');
    elements.cityFilterContainer?.classList.toggle('all-cities-active', active);
    if (elements.cityScopeStatus) {
      elements.cityScopeStatus.textContent = active ? 'Any UK location' : 'City filters';
      elements.cityScopeStatus.classList.toggle('active', active);
    }
  }

  function resolveLogModeFromStorage(stored = {}) {
    if (typeof globalThis.AMZ_LOGGER?.normalizeMode === 'function') {
      const explicitMode = stored[STORAGE_KEYS.LOG_MODE];
      if (explicitMode) return globalThis.AMZ_LOGGER.normalizeMode(explicitMode);
      return globalThis.AMZ_LOGGER.normalizeMode(LOGGING.DEFAULT_MODE);
    }
    return LOGGING.DEFAULT_MODE;
  }

  function setLogModeUi(value) {
    const mode = resolveLogModeFromStorage({ [STORAGE_KEYS.LOG_MODE]: value });
    if (elements.logMode) elements.logMode.value = mode;
    globalThis.AMZ_LOGGER?.setMode?.(mode);
  }

  function getIntervalDefaultValueForUnit(unit) {
    return globalThis.AMZ_INTERVALS.getDefaultValue(
      runtimeControls.normalizeOptionValue(unit)
    );
  }

  function normalizeIntervalValueForUnit(value, unit) {
    const parsedValue = runtimeControls.normalizePositiveInteger(value);
    return parsedValue ? String(parsedValue) : getIntervalDefaultValueForUnit(unit);
  }

  async function hasUsableLocationScope() {
    const stored = await state.getTagRenderState('');
    return stored.allCitiesSelected === true ||
      (Array.isArray(stored.cityTags) && stored.cityTags.length > 0);
  }

  async function refreshActivationGate() {
    const valid = await hasUsableLocationScope();
    if (elements.activate) {
      elements.activate.disabled = !valid;
      elements.activate.title = valid ? '' : 'Add a city filter or choose Any UK location';
      if (!valid && elements.activate.checked) {
        elements.activate.checked = false;
        await state.setActive(false);
      }
    }
    setStatus(valid ? '' : 'Add a city filter or choose Any UK location before activating.', valid ? '' : 'warning');
    return valid;
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

  function getAllJobTypes() {
    return runtimeControls.normalizeJobTypeList(AMAZON.JOB_TYPE_VALUES);
  }

  async function applyStoredState() {
    const stored = await state.getPopupFormState();
    const allCitiesSelected = stored[STORAGE_KEYS.ALL_CITIES_SELECTED] === true;
    const savedJobType = runtimeControls.normalizeJobTypeList(stored[STORAGE_KEYS.JOB_TYPE]);
    const intervalUnit = stored[STORAGE_KEYS.FETCH_INTERVAL_UNIT] || globalThis.AMZ_INTERVALS.getDefaultUnit();
    const intervalValue = stored[STORAGE_KEYS.FETCH_INTERVAL_VALUE] || getIntervalDefaultValueForUnit(intervalUnit);
    const logMode = resolveLogModeFromStorage(stored);

    populateJobTypes(savedJobType);
    updateAllCitiesUi(allCitiesSelected);
    setLogModeUi(logMode);
    if (elements.intervalValue) elements.intervalValue.value = intervalValue;
    if (elements.intervalUnit) elements.intervalUnit.value = intervalUnit;

    await tagManager.renderFromStorage();
    const active = stored[STORAGE_KEYS.ACTIVE] === true && await hasUsableLocationScope();
    if (stored[STORAGE_KEYS.ACTIVE] === true && !active) {
      await state.setActive(false);
    }
    if (elements.activate) elements.activate.checked = active;
    await refreshActivationGate();
  }

  async function applyLiveStorageChange(changes, areaName) {
    if (areaName !== 'local' || resetInProgress) return;

    let shouldRefreshGate = false;
    let shouldRenderTags = false;

    if (changes[STORAGE_KEYS.ALL_CITIES_SELECTED]) {
      updateAllCitiesUi(changes[STORAGE_KEYS.ALL_CITIES_SELECTED].newValue === true);
      shouldRefreshGate = true;
      shouldRenderTags = true;
    }
    if (changes[STORAGE_KEYS.CITY_TAGS]) {
      shouldRefreshGate = true;
      shouldRenderTags = true;
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
    if (changes[STORAGE_KEYS.LOG_MODE] && elements.logMode) {
      setLogModeUi(changes[STORAGE_KEYS.LOG_MODE].newValue);
    }
    if (shouldRenderTags) await tagManager.renderFromStorage();
    if (shouldRefreshGate) await refreshActivationGate();
  }

  const tagManager = globalThis.AMZ_POPUP_TAGS.create({
    defaultSelectedCity: '',
    afterChange: refreshActivationGate,
  });
  tagManager.bind();

  await applyStoredState();
  chrome.storage.onChanged.addListener((changes, areaName) => {
    applyLiveStorageChange(changes, areaName).catch(error => {
      log.error('live storage sync failed:', error);
    });
  });

  elements.jobType?.addEventListener('change', event => {
    state.setJobType(getSelectedValues(event.target));
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

  elements.logMode?.addEventListener('change', async event => {
    const mode = resolveLogModeFromStorage({ [STORAGE_KEYS.LOG_MODE]: event.target.value });
    globalThis.AMZ_LOGGER?.setMode?.(mode);
    await storage.setLocal({ [STORAGE_KEYS.LOG_MODE]: mode });
    log.info('log mode changed', { mode }, USER_LOG_OPTIONS);
  });

  elements.addAllCitiesButton?.addEventListener('click', async () => {
    const nextActive = !(await state.getTagRenderState('')).allCitiesSelected;
    if (nextActive) {
      await state.setAllCitiesSelection([]);
    } else {
      await storage.setLocal({
        [STORAGE_KEYS.ALL_CITIES_SELECTED]: false,
        [STORAGE_KEYS.DISTANCE]: '',
      });
    }
    updateAllCitiesUi(nextActive);
    await tagManager.renderFromStorage();
    await refreshActivationGate();
    log.debug('any UK location toggled', { active: nextActive }, USER_LOG_OPTIONS);
  });

  elements.selectAllJobTypesButton?.addEventListener('click', async () => {
    const jobTypes = getAllJobTypes();
    setSelectedValues(elements.jobType, jobTypes);
    await state.setJobType(jobTypes);
    log.debug('all job types selected', { jobTypes }, USER_LOG_OPTIONS);
  });

  elements.activate?.addEventListener('change', async event => {
    if (event.target.checked && !await refreshActivationGate()) {
      event.preventDefault();
      event.target.checked = false;
      await state.setActive(false);
      return;
    }

    const active = await state.setActive(event.target.checked);
    if (event.target.checked && !active) {
      event.target.checked = false;
      await refreshActivationGate();
      return;
    }
    log.info('automation active setting changed', { active }, USER_LOG_OPTIONS);
    await notifyActiveTab(active);
  });

  elements.resetForm?.addEventListener('submit', async event => {
    event.preventDefault();
    if (elements.resetButton) {
      elements.resetButton.disabled = true;
      elements.resetButton.innerText = 'Resetting...';
    }

    try {
      resetInProgress = true;
      await state.resetLocal(RESET_DEFAULTS);
      populateJobTypes(RESET_DEFAULTS[STORAGE_KEYS.JOB_TYPE]);
      setLogModeUi(RESET_DEFAULTS[STORAGE_KEYS.LOG_MODE]);
      if (elements.intervalValue) elements.intervalValue.value = RESET_DEFAULTS[STORAGE_KEYS.FETCH_INTERVAL_VALUE];
      if (elements.intervalUnit) elements.intervalUnit.value = RESET_DEFAULTS[STORAGE_KEYS.FETCH_INTERVAL_UNIT];
      if (elements.activate) elements.activate.checked = false;
      updateAllCitiesUi(false);
      await tagManager.renderFromStorage();
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
