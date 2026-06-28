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
            <select id="log_mode">
              <option value="standard">Standard</option>
              <option value="debug">Debug</option>
              <option value="off">Off</option>
            </select>
            <div class="toggle-section">
              <input id="activate" type="checkbox">
            </div>
            <div class="access-actions">
              <button id="checkout_btn" data-plan="access" type="button">Get 30 days</button>
              <button id="checkout_pro_btn" data-plan="pro" type="button">Go Pro</button>
              <small id="license-status"></small>
            </div>
            <div class="dropdowns-container" data-authenticated-section>
              <div class="field"><select id="city"></select></div>
              <div class="field"><select id="distance"></select></div>
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
        "shared/utils/license-api.js",
        "shared/utils/license-state.js",
        "shared/utils/payment-gate.js",
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
            "AMZ_LICENSE_API",
            "AMZ_LICENSE_STATE",
            "AMZ_PAYMENT_GATE",
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

    it("shows booking controls first and keeps email fields out of the landing markup", () => {
        const html = readFileSync(resolve("src", "popup", "index.html"), "utf8");
        expect(html).toContain("checkout_btn");
        expect(html).toContain("checkout_pro_btn");
        expect(html).toContain("$50");
        expect(html).toContain("$120");
        expect(html).toContain("id=\"city\"");
        expect(html).toContain("id=\"distance\"");
        expect(html).not.toContain("buyer_email");
        expect(html).not.toContain("extension_username");
        expect(html).not.toContain("admin_login_btn");
        expect(html).not.toContain("fetch_clients_btn");
        expect(html).not.toContain("shared/api-client.js");
        expect(html).not.toContain("shared/validation.js");
    });

    it("requires local location scope but not payment before activation", async () => {
        const store = await loadPopup();

        expect(document.getElementById("activate").disabled).toBe(true);

        const input = document.getElementById("city-input");
        input.value = "London";
        input.dispatchEvent(new window.KeyboardEvent("keyup", { key: "Enter" }));
        await flushPopup();

        expect(store.cityTags).toEqual(["London"]);
        expect(store.allCitiesSelected).toBe(false);
        expect(document.getElementById("activate").disabled).toBe(false);
        expect(document.getElementById("license-status").textContent).toMatch(/Search is free/);
    });

    it("activates with All cities and notifies the active tab", async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ allowed: true }),
        });
        const store = await loadPopup({
            licenseBuyerEmail: "buyer@example.com",
            licenseAmazonEmail: "paid@example.com",
            licenseEmail: "paid@example.com",
            licenseState: {
                allowed: true,
                isProUser: false,
                emailId: "buyer@example.com",
                amazonEmailId: "paid@example.com",
                email: "paid@example.com",
                expiresAt: Date.now() + 60000,
            },
        });
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

    it("opens hosted checkout pages without collecting emails in the popup", async () => {
        const store = await loadPopup();
        const { STORAGE_KEYS } = globalThis.AMZ_CONSTANTS;
        const openSpy = vi.spyOn(globalThis.window, "open").mockImplementation(() => null);
        globalThis.fetch = vi.fn(() => Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({
                allowed: false,
                isProUser: false,
                checkoutUrl: "https://checkout.dodo/pro",
            }),
        }));

        expect(document.getElementById("checkout-buyer-email")).toBeNull();
        expect(document.getElementById("checkout-amazon-email")).toBeNull();

        document.getElementById("checkout_pro_btn").click();
        await flushPopup();

        expect(store[STORAGE_KEYS.LICENSE_BUYER_EMAIL]).toBeUndefined();
        expect(store[STORAGE_KEYS.LICENSE_AMAZON_EMAIL]).toBeUndefined();
        expect(globalThis.fetch).toHaveBeenCalledWith(
            "https://getslotnow.com/extension-usage-tracker/api/amazon-warehouse-jobs-uk/license/checkout",
            expect.objectContaining({ method: "POST" })
        );
        expect(openSpy).toHaveBeenNthCalledWith(
            1,
            "https://checkout.dodo/pro",
            "_blank",
            "noopener,noreferrer"
        );
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
            licenseBuyerEmail: "buyer@example.com",
            licenseAmazonEmail: "paid@example.com",
            licenseEmail: "paid@example.com",
            licenseState: {
                allowed: true,
                isProUser: false,
                emailId: "buyer@example.com",
                amazonEmailId: "paid@example.com",
                email: "paid@example.com",
                expiresAt: Date.now() + 60000,
            },
        });
        const { STORAGE_KEYS } = globalThis.AMZ_CONSTANTS;

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
        expect(store[STORAGE_KEYS.LICENSE_BUYER_EMAIL]).toBe("buyer@example.com");
        expect(store[STORAGE_KEYS.LICENSE_AMAZON_EMAIL]).toBe("paid@example.com");
        expect(store[STORAGE_KEYS.LICENSE_EMAIL]).toBe("paid@example.com");
    });
});
