import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadSharedScripts, unloadSharedNamespaces } from "./_load.js";

function tick() {
    return new Promise(resolveTick => setTimeout(resolveTick, 0));
}

async function flushPopup() {
    for (let index = 0; index < 20; index += 1) await tick();
}

function installPopupDom() {
    const dom = new JSDOM(`<!doctype html>
        <html>
          <body>
            <span id="version"></span>
            <select id="log_mode">
              <option value="standard">Standard</option>
              <option value="debug">Debug</option>
              <option value="off">Off</option>
            </select>
            <input id="activate" type="checkbox">
            <select id="jobType" multiple></select>
            <input id="fetch_interval_value" type="number">
            <select id="fetch_interval_unit">
              <option value="ms">Milliseconds</option>
              <option value="s">Seconds</option>
            </select>
            <button id="add-all-cities" type="button"></button>
            <span id="city-scope-status"></span>
            <button id="select-all-job-types" type="button"></button>
            <form id="ais_visa_info"><button id="reset_info" type="submit"></button></form>
            <div class="tag-input-container">
              <small id="local-settings-status"></small>
              <div id="tag-input-box"><input id="city-input"></div>
            </div>
            <button id="clear-all" type="button"></button>
          </body>
        </html>`, {
        url: "chrome-extension://test/popup/index.html",
    });

    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.Event = dom.window.Event;
    globalThis.KeyboardEvent = dom.window.KeyboardEvent;
    return dom;
}

function useLocalStore(initial = {}) {
    if (!globalThis.chrome) {
        globalThis.chrome = {
            runtime: {
                lastError: null,
                sendMessage: () => {},
                getManifest: () => ({ version: "1.0.0" }),
            },
            tabs: {
                query: () => Promise.resolve([]),
                sendMessage: () => {},
            },
            storage: {
                onChanged: { addListener: () => {} },
                local: {},
                session: {},
            },
        };
    }
    const store = { ...initial };
    const listeners = [];
    globalThis.chrome.storage.onChanged.addListener = vi.fn(listener => listeners.push(listener));
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
        const changes = {};
        Object.entries(values).forEach(([key, value]) => {
            changes[key] = { oldValue: store[key], newValue: value };
            store[key] = value;
        });
        if (typeof cb === "function") cb();
        listeners.forEach(listener => listener(changes, "local"));
        return Promise.resolve();
    });
    globalThis.chrome.storage.local.remove = vi.fn((keys, cb) => {
        (Array.isArray(keys) ? keys : [keys]).forEach(key => delete store[key]);
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

async function loadPopup(store = {}) {
    installPopupDom();
    const activeStore = useLocalStore(store);
    globalThis.chrome.tabs.query = vi.fn().mockResolvedValue([{ id: 12 }]);
    globalThis.chrome.tabs.sendMessage = vi.fn();
    loadSharedScripts([
        "shared/constants.js",
        "shared/utils/time.js",
        "shared/utils/logger.js",
        "shared/utils/text.js",
        "shared/utils/storage.js",
        "shared/utils/city-tags.js",
        "shared/utils/intervals.js",
        "shared/utils/runtime-controls.js",
        "shared/utils/state-store.js",
        "shared/utils/messaging.js",
        "popup/tag-manager.js",
        "popup/content.js",
    ]);
    document.dispatchEvent(new window.Event("DOMContentLoaded"));
    await flushPopup();
    return activeStore;
}

describe("local-only popup", () => {
    beforeEach(() => {
        unloadSharedNamespaces([
            "AMZ_CONSTANTS",
            "AMZ_TIME",
            "AMZ_LOGGER",
            "AMZ_TEXT",
            "AMZ_STORAGE",
            "AMZ_CITY_TAGS",
            "AMZ_INTERVALS",
            "AMZ_RUNTIME_CONTROLS",
            "AMZ_STATE",
            "AMZ_MESSAGING",
            "AMZ_POPUP_TAGS",
        ]);
        delete globalThis.window;
        delete globalThis.document;
        delete globalThis.chrome;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("has no admin, backend, or client picker markup", () => {
        const html = readFileSync(resolve("src", "popup", "index.html"), "utf8");
        expect(html).not.toContain("admin_login_btn");
        expect(html).not.toContain("fetch_clients_btn");
        expect(html).not.toContain("shared/api-client.js");
        expect(html).not.toContain("shared/validation.js");
    });

    it("requires a local location scope before activation", async () => {
        const store = await loadPopup();

        expect(document.getElementById("activate").disabled).toBe(true);

        const input = document.getElementById("city-input");
        input.value = "London";
        input.dispatchEvent(new window.KeyboardEvent("keyup", { key: "Enter" }));
        await flushPopup();

        expect(store.cityTags).toEqual(["London"]);
        expect(store.allCitiesSelected).toBe(false);
        expect(document.getElementById("activate").disabled).toBe(false);
    });

    it("activates with Any UK location and notifies the active tab", async () => {
        const store = await loadPopup();

        document.getElementById("add-all-cities").click();
        await flushPopup();
        expect(store.allCitiesSelected).toBe(true);
        expect(document.getElementById("activate").disabled).toBe(false);

        const activate = document.getElementById("activate");
        activate.checked = true;
        activate.dispatchEvent(new window.Event("change"));
        await flushPopup();

        expect(store.__ap).toBe(true);
        expect(globalThis.chrome.tabs.sendMessage).toHaveBeenCalledWith(12, {
            action: "activate",
            status: true,
        });
    });

    it("reset clears stale service and credential keys", async () => {
        const store = await loadPopup({
            __amz_operator_username: "admin",
            __amz_admin_session_token: "token",
            __amz_login_username: "candidate@example.com",
            __pw: "123456",
            __amz_selected_client_id: "7",
            cityTags: ["London"],
            allCitiesSelected: true,
            __ap: true,
        });

        document.getElementById("ais_visa_info").dispatchEvent(
            new window.Event("submit", { bubbles: true, cancelable: true })
        );
        await flushPopup();

        expect(store.__amz_operator_username).toBeUndefined();
        expect(store.__amz_admin_session_token).toBeUndefined();
        expect(store.__amz_login_username).toBeUndefined();
        expect(store.__pw).toBeUndefined();
        expect(store.__amz_selected_client_id).toBeUndefined();
        expect(store.__ap).toBe(false);
    });
});
