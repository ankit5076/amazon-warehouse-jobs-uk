import { describe, it, expect, beforeEach, vi } from "vitest";
import { loadSharedScripts, unloadSharedNamespaces } from "./_load.js";

function useStores() {
    const localStore = {};
    const sessionStore = {};
    for (const [area, store] of [["local", localStore], ["session", sessionStore]]) {
        globalThis.chrome.storage[area].get = vi.fn((keys, cb) => {
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
        globalThis.chrome.storage[area].set = vi.fn((values, cb) => {
            Object.assign(store, values);
            if (typeof cb === "function") cb();
            return Promise.resolve();
        });
        globalThis.chrome.storage[area].remove = vi.fn((keys, cb) => {
            (Array.isArray(keys) ? keys : [keys]).forEach(key => delete store[key]);
            if (typeof cb === "function") cb();
            return Promise.resolve();
        });
    }
    return { localStore, sessionStore };
}

function loadObservability() {
    unloadSharedNamespaces([
        "AMZ_CONSTANTS",
        "AMZ_TIME",
        "AMZ_LOGGER",
        "AMZ_TEXT",
        "AMZ_STORAGE",
        "AMZ_URL",
        "AMZ_APPLICATION_OBSERVABILITY",
    ]);
    loadSharedScripts([
        "shared/constants.js",
        "shared/utils/time.js",
        "shared/utils/logger.js",
        "shared/utils/text.js",
        "shared/utils/storage.js",
        "shared/utils/url.js",
        "content/utils/application-observability.js",
    ]);
}

function createTrace() {
    return globalThis.AMZ_APPLICATION_OBSERVABILITY.createApplicationAttemptTrace({
        matchedJob: {
            jobId: "JOB-1",
            jobTitle: "Warehouse Associate",
            city: "London",
            state: "England",
            scheduleCount: 1,
        },
        searchResult: {
            durationMs: 42,
            status: 200,
            jobCards: [{ jobId: "JOB-1" }],
        },
        searchContext: {
            selectedCity: "",
            allCitiesSelected: true,
            jobTypes: ["FULL_TIME"],
            cityTagCount: 0,
        },
    });
}

describe("AMZ_APPLICATION_OBSERVABILITY local traces", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        delete globalThis.chrome;
        loadSharedScripts(["shared/constants.js"]);
        useStores();
        loadObservability();
    });

    it("persists progress locally without exposing any backend API dependency", async () => {
        expect(globalThis.AMZ_API).toBeUndefined();

        const trace = createTrace();
        globalThis.AMZ_APPLICATION_OBSERVABILITY.flushProgress(trace, "JOB_MATCHED", {}, {
            href: "https://www.jobsatamazon.co.uk/app#/jobDetail?jobId=JOB-1",
            jobId: "JOB-1",
        });
        await new Promise(resolve => setTimeout(resolve, 0));

        const key = globalThis.AMZ_CONSTANTS.STORAGE_KEYS.APPLICATION_ATTEMPT_TRACE;
        const stored = await globalThis.chrome.storage.session.get(key);
        expect(stored[key].trace.outcome).toBe("JOB_MATCHED");
        expect(stored[key].trace.postedOutcomes).toContain("JOB_MATCHED");
        expect(stored[key].trace.eventTimeline.some(event => event.category === "local_observability")).toBe(false);
    });

    it("finalizes terminal attempts into local pending trace state", async () => {
        const trace = createTrace();
        await globalThis.AMZ_APPLICATION_OBSERVABILITY.persistPendingTrace(trace);

        globalThis.AMZ_APPLICATION_OBSERVABILITY.finalizeAndFlush(trace, "BOOKED", {
            detailedOutcome: "CONTINGENT_OFFER_ACCEPTED",
            scheduleId: "SCH-1",
        }, {
            href: "https://www.jobsatamazon.co.uk/application/uk/#/contingent-offer",
            jobId: "JOB-1",
        });
        await new Promise(resolve => setTimeout(resolve, 0));

        const key = globalThis.AMZ_CONSTANTS.STORAGE_KEYS.APPLICATION_ATTEMPT_TRACE;
        const stored = await globalThis.chrome.storage.session.get(key);
        expect(stored[key].trace.outcome).toBe("BOOKED");
        expect(stored[key].trace.isTerminal).toBe(true);
        expect(stored[key].trace.postedOutcomes).toContain("BOOKED");
    });
});
