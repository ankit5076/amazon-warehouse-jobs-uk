import { describe, it, expect, beforeEach, vi } from "vitest";
import { loadSharedScripts, unloadSharedNamespaces } from "./_load.js";

function useLocalStore(initial = {}) {
    const store = { ...initial };
    globalThis.chrome.storage.local.get = vi.fn((keys, cb) => {
        let result = {};
        if (Array.isArray(keys)) {
            keys.forEach(key => {
                if (Object.prototype.hasOwnProperty.call(store, key)) result[key] = store[key];
            });
        } else if (typeof keys === "string") {
            if (Object.prototype.hasOwnProperty.call(store, keys)) result[keys] = store[keys];
        } else {
            result = { ...store };
        }
        if (typeof cb === "function") cb(result);
        return Promise.resolve(result);
    });
    globalThis.chrome.storage.local.set = vi.fn((values, cb) => {
        Object.assign(store, values);
        if (typeof cb === "function") cb();
        return Promise.resolve();
    });
    globalThis.chrome.storage.local.clear = vi.fn(cb => {
        Object.keys(store).forEach(key => delete store[key]);
        if (typeof cb === "function") cb();
        return Promise.resolve();
    });
    return store;
}

function loadState() {
    unloadSharedNamespaces([
        "AMZ_CONSTANTS",
        "AMZ_TEXT",
        "AMZ_STORAGE",
        "AMZ_CITY_TAGS",
        "AMZ_RUNTIME_CONTROLS",
        "AMZ_STATE",
    ]);
    loadSharedScripts([
        "shared/constants.js",
        "shared/utils/text.js",
        "shared/utils/storage.js",
        "shared/utils/city-tags.js",
        "shared/utils/runtime-controls.js",
        "shared/utils/state-store.js",
    ]);
}

describe("AMZ_STATE local settings", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        delete globalThis.chrome;
        loadState();
    });

    it("sets active directly without a selected client requirement", async () => {
        const { STORAGE_KEYS } = globalThis.AMZ_CONSTANTS;
        const store = useLocalStore();

        await expect(globalThis.AMZ_STATE.setActive(true)).resolves.toBe(true);
        expect(store[STORAGE_KEYS.ACTIVE]).toBe(true);
    });

    it("returns page refresh interval when active without checking client storage", async () => {
        const { STORAGE_KEYS } = globalThis.AMZ_CONSTANTS;
        useLocalStore({
            [STORAGE_KEYS.ACTIVE]: true,
            [STORAGE_KEYS.PAGE_REFRESH_JOB_SEARCH_INTERVAL_MS]: 120000,
        });

        await expect(globalThis.AMZ_STATE.getPageRefreshIntervalMs()).resolves.toBe(120000);
    });

    it("keeps tag and all-city local settings centralized", async () => {
        const { STORAGE_KEYS } = globalThis.AMZ_CONSTANTS;
        const store = useLocalStore();

        await globalThis.AMZ_STATE.setAllCitiesSelection([]);
        expect(store[STORAGE_KEYS.ALL_CITIES_SELECTED]).toBe(true);
        expect(store[STORAGE_KEYS.CITY_TAGS]).toEqual([]);

        await globalThis.AMZ_STATE.setCityTags(["London"]);
        const renderState = await globalThis.AMZ_STATE.getTagRenderState("");
        expect(renderState.cityTags).toEqual(["London"]);
    });

    it("resetLocal clears stale storage before writing local defaults", async () => {
        const { RESET_DEFAULTS, STORAGE_KEYS } = globalThis.AMZ_CONSTANTS;
        const store = useLocalStore({
            __amz_admin_session_token: "token",
            __amz_selected_client_id: "7",
            __pw: "123456",
        });

        await globalThis.AMZ_STATE.resetLocal(RESET_DEFAULTS);

        expect(store.__amz_admin_session_token).toBeUndefined();
        expect(store.__amz_selected_client_id).toBeUndefined();
        expect(store.__pw).toBeUndefined();
        expect(store[STORAGE_KEYS.ACTIVE]).toBe(false);
    });
});
