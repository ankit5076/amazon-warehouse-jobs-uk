import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
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
    return store;
}

function loadAccess(initialStore = {}) {
    unloadSharedNamespaces(["AMZ_CONSTANTS", "AMZ_STORAGE", "AMZ_ACCESS"]);
    loadSharedScripts([
        "shared/constants.js",
        "shared/utils/storage.js",
        "shared/utils/access-api.js",
    ]);
    return useLocalStore(initialStore);
}

describe("access API", () => {
    beforeEach(() => {
        delete globalThis.chrome;
        globalThis.fetch = vi.fn();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        delete globalThis.fetch;
        unloadSharedNamespaces(["AMZ_CONSTANTS", "AMZ_STORAGE", "AMZ_ACCESS"]);
    });

    it("creates checkout with the Amazon email as buyer and access identity", async () => {
        loadAccess();
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({
                allowed: false,
                checkoutUrl: "https://rzp.io/rzp/test",
                message: "Open checkout to buy access.",
                syncIntervalMs: 900000,
            }),
        });

        const result = await globalThis.AMZ_ACCESS.createCheckout("Candidate@Example.com");

        expect(result.checkoutUrl).toBe("https://rzp.io/rzp/test");
        expect(globalThis.fetch).toHaveBeenCalledWith(
            "https://getslotnow.com/extension-usage-tracker/api/amazon-warehouse-jobs-uk/license/checkout",
            expect.objectContaining({
                method: "POST",
                body: JSON.stringify({
                    emailId: "candidate@example.com",
                    amazonEmailId: "candidate@example.com",
                    purchaseType: "access",
                }),
            })
        );
    });

    it("uses fresh unexpired positive cache without calling the tracker", async () => {
        loadAccess({
            __amz_paid_access_cache: {
                allowed: true,
                productId: "amazon-warehouse-jobs-uk",
                amazonEmailId: "candidate@example.com",
                accessExpiresAt: "2099-01-01T00:00:00.000Z",
                checkedAt: Date.now(),
                syncIntervalMs: 900000,
            },
        });

        const result = await globalThis.AMZ_ACCESS.checkAccess("candidate@example.com");

        expect(result.allowed).toBe(true);
        expect(result.source).toBe("cache");
        expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it("fails closed when stale cached access cannot be revalidated", async () => {
        loadAccess({
            __amz_paid_access_cache: {
                allowed: true,
                productId: "amazon-warehouse-jobs-uk",
                amazonEmailId: "candidate@example.com",
                accessExpiresAt: "2099-01-01T00:00:00.000Z",
                checkedAt: Date.now() - 1000000,
                syncIntervalMs: 1000,
            },
        });
        globalThis.fetch = vi.fn().mockRejectedValue(new Error("network down"));

        const result = await globalThis.AMZ_ACCESS.checkAccess("candidate@example.com");

        expect(result.allowed).toBe(false);
        expect(result.source).toBe("network-error");
        expect(globalThis.fetch).toHaveBeenCalled();
    });

    it("records booking usage before final booking actions", async () => {
        loadAccess({
            __amz_login_username: "candidate@example.com",
        });
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({
                allowed: true,
                accessExpiresAt: "2099-01-01T00:00:00.000Z",
                message: "Booking recorded for paid access.",
                syncIntervalMs: 900000,
            }),
        });

        const result = await globalThis.AMZ_ACCESS.recordBookingUsage({
            source: "application:accept offer",
            jobId: "JOB-1",
            scheduleId: "SCH-1",
        });

        expect(result.allowed).toBe(true);
        expect(globalThis.fetch).toHaveBeenCalledWith(
            "https://getslotnow.com/extension-usage-tracker/api/amazon-warehouse-jobs-uk/license/usage",
            expect.objectContaining({
                method: "POST",
                body: expect.stringContaining('"amazonEmailId":"candidate@example.com"'),
            })
        );
    });
});
