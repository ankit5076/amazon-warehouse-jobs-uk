import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadSharedScripts, unloadSharedNamespaces } from "./_load.js";

function tick() {
    return new Promise(resolveTick => setTimeout(resolveTick, 0));
}

async function flushPopup() {
    for (let index = 0; index < 40; index += 1) await tick();
}

function installPopupDom() {
    const dom = new JSDOM(`<!doctype html>
        <html>
          <body>
            <span id="version"></span>
            <div class="toggle-section">
              <input id="activate" type="checkbox">
            </div>
            <strong id="amazon-email-display"></strong>
            <div class="access-panel">
              <strong id="access-status"></strong>
              <span id="access-detail"></span>
              <button id="buy-access" type="button"></button>
            </div>
            <div class="dropdowns-container" data-authenticated-section>
              <div class="field"><select id="city"></select></div>
              <div class="field"><select id="distance"></select></div>
              <div id="job-type-options"></div>
              <select id="jobType" multiple></select>
              <input id="fetch_interval_value" type="number">
              <select id="fetch_interval_unit">
                <option value="ms">Milliseconds</option>
                <option value="s">Seconds</option>
              </select>
              <button id="add-all-cities" type="button"></button>
              <button id="select-all-job-types" type="button"></button>
            </div>
            <form id="refresh_info" data-authenticated-section><button id="refresh_btn" type="submit"></button></form>
            <form id="ais_visa_info" data-authenticated-section><button id="reset_info" type="submit"></button></form>
            <div class="tag-input-container" data-authenticated-section>
              <span id="city-scope-status"></span>
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
                create: () => Promise.resolve({ id: 99 }),
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

async function loadPopup(store = {}, activeTab = { id: 12 }, sendMessageImpl) {
    installPopupDom();
    const activeStore = useLocalStore(store);
    globalThis.chrome.tabs.query = vi.fn().mockResolvedValue([activeTab]);
    globalThis.chrome.tabs.sendMessage = vi.fn(sendMessageImpl);
    globalThis.chrome.tabs.create = vi.fn().mockResolvedValue({ id: 99 });
    loadSharedScripts([
        "shared/constants.js",
        "shared/utils/time.js",
        "shared/utils/text.js",
        "shared/utils/storage.js",
        "shared/utils/access-api.js",
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

describe("local booking popup", () => {
    beforeEach(() => {
        unloadSharedNamespaces([
            "AMZ_CONSTANTS",
            "AMZ_TIME",
            "AMZ_TEXT",
            "AMZ_STORAGE",
            "AMZ_ACCESS",
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
        globalThis.fetch = vi.fn();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        delete globalThis.fetch;
    });

    it("shows booking controls with the single 60-day access action", () => {
        const html = readFileSync(resolve("src", "popup", "index.html"), "utf8");
        expect(html).toContain("id=\"city\"");
        expect(html).toContain("id=\"distance\"");
        expect(html).toContain("id=\"job-type-options\"");
        expect(html).toContain("id=\"buy-access\"");
        expect(html).toContain("Buy 60-day access - Rs 6,999");
        expect(html).not.toContain("checkout_btn");
        expect(html).not.toContain("$50");
        expect(html).not.toContain("$120");
        expect(html).toContain("access-status");
        expect(html).not.toContain("buyer_email");
        expect(html).not.toContain("extension_username");
        expect(html).not.toContain("admin_login_btn");
        expect(html).not.toContain("fetch_clients_btn");
        expect(html).not.toContain("shared/api-client.js");
        expect(html).not.toContain("shared/validation.js");
        expect(html).toContain("shared/utils/access-api.js");
        expect(html).not.toContain("shared/utils/license-api.js");
        expect(html).not.toContain("shared/utils/license-state.js");
        expect(html).not.toContain("shared/utils/payment-gate.js");
    });

    it("renders City options and City Filters in alphabetical order", async () => {
        const store = await loadPopup({
            cityTags: ["London", "Edinburgh", "Barking"],
        });

        expect(Array.from(document.querySelectorAll("#city option"))
            .slice(0, 5)
            .map(option => option.textContent)).toEqual([
                "All cities",
                "Baillieston",
                "Banbury",
                "Barking",
                "Barlborough",
            ]);
        expect(Array.from(document.querySelectorAll("#tag-input-box .tag"))
            .map(tag => tag.dataset.tagValue)).toEqual([
                "Barking",
                "Edinburgh",
                "London",
            ]);
        expect(store.cityTags).toEqual(["Barking", "Edinburgh", "London"]);
    });

    it("uses checkbox job type options instead of requiring ctrl-click multi-select", async () => {
        const store = await loadPopup();
        const { STORAGE_KEYS } = globalThis.AMZ_CONSTANTS;

        const fullTime = document.querySelector('#job-type-options input[value="FULL_TIME"]');
        expect(fullTime).toBeTruthy();
        expect(fullTime.checked).toBe(false);

        fullTime.click();
        await flushPopup();

        expect(store[STORAGE_KEYS.JOB_TYPE]).toEqual(["FULL_TIME"]);
        expect(document.querySelector('.job-type-option.selected input[value="FULL_TIME"]')).toBeTruthy();
    });

    it("keeps activation enabled even before search scope is set", async () => {
        const store = await loadPopup();

        expect(document.getElementById("activate").disabled).toBe(false);
        expect(document.getElementById("amazon-email-display").textContent).toBe("Not detected");

        const input = document.getElementById("city-input");
        input.value = "London";
        input.dispatchEvent(new window.KeyboardEvent("keyup", { key: "Enter" }));
        await flushPopup();

        expect(store.cityTags).toEqual(["London"]);
        expect(store.allCitiesSelected).toBe(false);
        expect(document.getElementById("activate").disabled).toBe(false);
    });

    it("activates with All cities and notifies the active tab", async () => {
        const store = await loadPopup();
        const { STORAGE_KEYS } = globalThis.AMZ_CONSTANTS;

        document.getElementById("add-all-cities").click();
        await flushPopup();
        expect(store[STORAGE_KEYS.ALL_CITIES_SELECTED]).toBe(true);
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

    it("shows stored Amazon login email, checks access status, and still activates search", async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({
                allowed: true,
                accessExpiresAt: "2099-01-01T00:00:00.000Z",
                syncIntervalMs: 900000,
                message: "Access active.",
            }),
        });
        const store = await loadPopup({
            __amz_login_username: "candidate@example.com",
        });

        expect(document.getElementById("amazon-email-display").textContent).toBe("candidate@example.com");
        expect(document.getElementById("access-status").textContent).toBe("Access active");
        expect(document.getElementById("activate").disabled).toBe(false);

        const activate = document.getElementById("activate");
        activate.checked = true;
        activate.dispatchEvent(new window.Event("change"));
        await flushPopup();

        expect(store.__ap).toBe(true);
        expect(globalThis.fetch).toHaveBeenCalledWith(
            expect.stringContaining("/api/amazon-warehouse-jobs-uk/license/check?amazonEmail=candidate%40example.com"),
            expect.objectContaining({ method: "GET" })
        );
    });

    it("refresh syncs local runtime controls and refreshes access", async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({
                allowed: false,
                checkoutUrl: "",
                message: "No active paid access.",
                syncIntervalMs: 900000,
            }),
        });
        await loadPopup({ __amz_login_username: "candidate@example.com" });

        document.getElementById("refresh_info").dispatchEvent(
            new window.Event("submit", { bubbles: true, cancelable: true })
        );
        await flushPopup();

        expect(globalThis.fetch).toHaveBeenCalled();
        expect(document.getElementById("refresh_btn").innerText).toBe("Success");
    });

    it("creates Razorpay checkout using the Amazon email for the 60-day access pass", async () => {
        globalThis.fetch = vi.fn(url => {
            if (String(url).includes("/license/checkout")) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({
                        allowed: false,
                        checkoutUrl: "https://rzp.io/rzp/test-link",
                        message: "Open checkout to buy access.",
                        syncIntervalMs: 900000,
                    }),
                });
            }
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve({
                    allowed: false,
                    message: "No active paid access.",
                    syncIntervalMs: 900000,
                }),
            });
        });
        await loadPopup({ __amz_login_username: "candidate@example.com" });

        document.getElementById("buy-access").click();
        await flushPopup();
        await flushPopup();

        expect(globalThis.fetch).toHaveBeenLastCalledWith(
            expect.stringContaining("/api/amazon-warehouse-jobs-uk/license/checkout"),
            expect.objectContaining({
                method: "POST",
                body: JSON.stringify({
                    emailId: "candidate@example.com",
                    amazonEmailId: "candidate@example.com",
                    purchaseType: "access",
                }),
            })
        );
        expect(globalThis.chrome.tabs.create).toHaveBeenCalledWith({
            url: "https://rzp.io/rzp/test-link",
        });
    });

    it("clears displayed Amazon identity when opened on an Amazon login page", async () => {
        const store = await loadPopup({
            __amz_login_username: "login@example.com",
        }, { id: 12, url: "https://auth.hiring.amazon.com/#/login" });
        const { STORAGE_KEYS } = globalThis.AMZ_CONSTANTS;

        expect(document.getElementById("amazon-email-display").textContent).toBe("Not detected");
        expect(store[STORAGE_KEYS.AMAZON_LOGIN_USERNAME]).toBe("login@example.com");
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
