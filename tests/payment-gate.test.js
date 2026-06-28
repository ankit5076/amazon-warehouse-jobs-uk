import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { loadSharedScripts, unloadSharedNamespaces } from "./_load.js";

function installStore(initial = {}) {
    const store = { ...initial };
    globalThis.chrome = {
        runtime: {
            lastError: null,
            getManifest: () => ({ version: "1.0.0" }),
        },
        storage: {
            onChanged: { addListener: () => {} },
            local: {
                get: vi.fn(keys => {
                    if (!keys) return Promise.resolve({ ...store });
                    if (Array.isArray(keys)) {
                        return Promise.resolve(Object.fromEntries(
                            keys.filter(key => Object.prototype.hasOwnProperty.call(store, key))
                                .map(key => [key, store[key]])
                        ));
                    }
                    if (typeof keys === "string") {
                        return Promise.resolve(
                            Object.prototype.hasOwnProperty.call(store, keys) ? { [keys]: store[keys] } : {}
                        );
                    }
                    return Promise.resolve({ ...keys, ...store });
                }),
                set: vi.fn(values => {
                    Object.assign(store, values);
                    return Promise.resolve();
                }),
                remove: vi.fn(keys => {
                    (Array.isArray(keys) ? keys : [keys]).forEach(key => delete store[key]);
                    return Promise.resolve();
                }),
                clear: vi.fn(() => {
                    Object.keys(store).forEach(key => delete store[key]);
                    return Promise.resolve();
                }),
            },
            session: {
                get: vi.fn(() => Promise.resolve({})),
                set: vi.fn(() => Promise.resolve()),
                remove: vi.fn(() => Promise.resolve()),
            },
        },
    };
    return store;
}

function loadPaymentModules(initial = {}) {
    const store = installStore(initial);
    loadSharedScripts([
        "shared/constants.js",
        "shared/utils/storage.js",
        "shared/utils/license-api.js",
        "shared/utils/license-state.js",
        "shared/utils/payment-gate.js",
    ]);
    return store;
}

function mockFetchJson(body, options = {}) {
    globalThis.fetch = vi.fn(() =>
        Promise.resolve({
            ok: options.ok !== false,
            status: options.status || 200,
            json: () => Promise.resolve(body),
        })
    );
}

describe("shared payment gate", () => {
    beforeEach(() => {
        unloadSharedNamespaces([
            "AMZ_CONSTANTS",
            "AMZ_STORAGE",
            "AMZ_LICENSE_API",
            "AMZ_LICENSE_STATE",
            "AMZ_PAYMENT_GATE",
        ]);
        delete globalThis.chrome;
        delete globalThis.fetch;
        delete globalThis.open;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("normalizes license responses and checks the country-specific Amazon email endpoint", async () => {
        loadPaymentModules();
        mockFetchJson({ allowed: true, isProUser: false, accessExpiresAt: "2026-02-01T00:00:00.000Z", syncIntervalMs: "60000" });

        const response = await globalThis.AMZ_LICENSE_API.checkLicense({ amazonEmailId: " Paid@Example.COM " });

        expect(response).toMatchObject({
            allowed: true,
            isProUser: false,
            accessExpiresAt: "2026-02-01T00:00:00.000Z",
            syncIntervalMs: 60000,
        });
        expect(globalThis.fetch).toHaveBeenCalledWith(
            "https://getslotnow.com/extension-usage-tracker/api/amazon-warehouse-jobs-uk/license/check?amazonEmail=paid%40example.com",
            expect.objectContaining({ method: "GET" })
        );
    });

    it("starts hosted checkout through the backend", async () => {
        loadPaymentModules();
        mockFetchJson({ checkoutUrl: "https://checkout.dodo/session", allowed: false });

        const response = await globalThis.AMZ_LICENSE_API.createCheckout({ purchaseType: "pro" });

        expect(response.checkoutUrl).toBe("https://checkout.dodo/session");
        expect(globalThis.fetch).toHaveBeenCalledWith(
            "https://getslotnow.com/extension-usage-tracker/api/amazon-warehouse-jobs-uk/license/checkout",
            expect.objectContaining({
                method: "POST",
                body: expect.stringContaining('"purchaseType":"pro"'),
            })
        );
    });

    it("loads provider plan availability from the backend", async () => {
        loadPaymentModules();
        mockFetchJson({ plans: { access: true, pro: false } });

        const response = await globalThis.AMZ_LICENSE_API.getPlans();

        expect(response).toEqual({ access: true, pro: false });
        expect(globalThis.fetch).toHaveBeenCalledWith(
            "https://getslotnow.com/extension-usage-tracker/api/amazon-warehouse-jobs-uk/license/plans",
            expect.objectContaining({ method: "GET" })
        );
    });


    it("caches valid paid license state until expiry", async () => {
        const { STORAGE_KEYS } = (loadPaymentModules({
            licenseBuyerEmail: "buyer@example.com",
            licenseAmazonEmail: "paid@example.com",
        }), globalThis.AMZ_CONSTANTS);
        mockFetchJson({ allowed: true, isProUser: true, syncIntervalMs: 60000 });

        const state = await globalThis.AMZ_LICENSE_STATE.refresh({ amazonEmailId: "paid@example.com" });

        expect(state.allowed).toBe(true);
        expect(state.amazonEmailId).toBe("paid@example.com");
        expect(await globalThis.AMZ_LICENSE_STATE.isAllowed()).toBe(true);
        expect(globalThis.chrome.storage.local.set).toHaveBeenCalledWith(
            expect.objectContaining({ [STORAGE_KEYS.LICENSE_STATE]: expect.objectContaining({ isProUser: true }) })
        );
    });

    it("treats expired cached licenses as denied", async () => {
        loadPaymentModules({
            licenseBuyerEmail: "buyer@example.com",
            licenseAmazonEmail: "paid@example.com",
            licenseState: {
                allowed: true,
                isProUser: true,
                emailId: "buyer@example.com",
                amazonEmailId: "paid@example.com",
                email: "paid@example.com",
                expiresAt: Date.now() - 1,
            },
        });
        globalThis.fetch = vi.fn(() => Promise.reject(new Error("offline")));

        expect(await globalThis.AMZ_LICENSE_STATE.isAllowed()).toBe(false);
    });

    it("denies booking on inactive paid-access responses without disabling free job search", async () => {
        const { STORAGE_KEYS } = (loadPaymentModules({
            licenseAmazonEmail: "empty@example.com",
            __ap: true,
        }), globalThis.AMZ_CONSTANTS);
        mockFetchJson({ allowed: false, isProUser: false, message: "No active paid access" });

        const denied = await globalThis.AMZ_LICENSE_STATE.refresh({ amazonEmailId: "empty@example.com" });

        expect(globalThis.AMZ_LICENSE_STATE.isAllowedState(denied)).toBe(false);
        expect(globalThis.chrome.storage.local.set).not.toHaveBeenCalledWith(
            expect.objectContaining({ [STORAGE_KEYS.ACTIVE]: false })
        );
    });

    it("allows pro users without recording usage through the backend", async () => {
        loadPaymentModules({
            licenseBuyerEmail: "buyer@example.com",
            licenseAmazonEmail: "pro@example.com",
            licenseState: {
                allowed: true,
                isProUser: true,
                emailId: "buyer@example.com",
                amazonEmailId: "pro@example.com",
                email: "pro@example.com",
                expiresAt: Date.now() + 60000,
            },
        });
        globalThis.fetch = vi.fn();

        const result = await globalThis.AMZ_PAYMENT_GATE.recordBookingUsage({ jobId: "JOB-1", scheduleId: "SCH-1" });

        expect(result.ok).toBe(true);
        expect(result.skipped).toBe("pro-user");
        expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it("does not call usage for active unlimited paid access", async () => {
        const store = loadPaymentModules({
            licenseBuyerEmail: "buyer@example.com",
            licenseAmazonEmail: "paid@example.com",
            licenseState: {
                allowed: true,
                isProUser: true,
                emailId: "buyer@example.com",
                amazonEmailId: "paid@example.com",
                email: "paid@example.com",
                expiresAt: Date.now() + 60000,
            },
            licenseUsageKeys: {},
        });
        globalThis.fetch = vi.fn();

        const first = await globalThis.AMZ_PAYMENT_GATE.recordBookingUsage({ jobId: "JOB-1", scheduleId: "SCH-1" });
        const second = await globalThis.AMZ_PAYMENT_GATE.recordBookingUsage({ jobId: "JOB-1", scheduleId: "SCH-1" });

        expect(first.ok).toBe(true);
        expect(first.skipped).toBe("pro-user");
        expect(second.skipped).toBe("already-recorded");
        expect(globalThis.fetch).not.toHaveBeenCalled();
        expect(Object.keys(store.licenseUsageKeys)).toEqual([
            "amazon-warehouse-jobs-uk:paid@example.com:JOB-1:SCH-1",
        ]);
    });
});
