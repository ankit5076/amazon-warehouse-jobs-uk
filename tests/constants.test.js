import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadSharedScripts, unloadSharedNamespaces } from "./_load.js";

describe("AMZ_CONSTANTS local-only configuration", () => {
    beforeEach(() => {
        unloadSharedNamespaces(["AMZ_CONSTANTS"]);
        loadSharedScripts(["shared/constants.js"]);
    });

    it("exposes local runtime defaults without admin notification or validation groups", () => {
        const { BACKEND } = globalThis.AMZ_CONSTANTS;

        expect(BACKEND.PRODUCT_ID).toBe("amazon-warehouse-jobs-uk");
        expect(BACKEND.FALLBACK_DEFAULTS.defaultInputs.selectedCity).toBe("London");
        expect(BACKEND.FALLBACK_DEFAULTS.defaultInputs.distance).toBe("150");
        expect(BACKEND.FALLBACK_DEFAULTS.fetchInterval.defaultMsValue).toBe(650);
        expect(BACKEND.FALLBACK_DEFAULTS.jobSearch.fallbackDistanceKm).toBe(5);
        expect(BACKEND.FALLBACK_DEFAULTS.jobSearch.fetchTimeoutMs).toBe(15000);
        expect(BACKEND.FALLBACK_DEFAULTS.pageRefresh.jobSearchIntervalMs).toBe(120000);
        expect(Object.keys(BACKEND.FALLBACK_DEFAULTS.cityCoordinates)).toHaveLength(66);
        expect(BACKEND.FALLBACK_DEFAULTS.cityCoordinates.London).toEqual({
            lat: 51.507218,
            lng: -0.127586,
        });
        expect(globalThis.AMZ_CONSTANTS.NOTIFICATIONS).toBeUndefined();
        expect(globalThis.AMZ_CONSTANTS.MESSAGE_ACTIONS.BACKEND_REQUEST).toBeUndefined();
        expect(globalThis.AMZ_CONSTANTS.MESSAGE_ACTIONS.NOTIFICATION_EVENT).toBeUndefined();
    });

    it("keeps install and reset defaults free of service and credential keys", () => {
        const serializedInstall = JSON.stringify(globalThis.AMZ_CONSTANTS.INSTALL_DEFAULTS);
        const serializedReset = JSON.stringify(globalThis.AMZ_CONSTANTS.RESET_DEFAULTS);

        for (const serialized of [serializedInstall, serializedReset]) {
            expect(serialized).not.toContain("__amz_admin_session_token");
            expect(serialized).not.toContain("__amz_operator_username");
            expect(serialized).not.toContain("__amz_login_username");
            expect(serialized).not.toContain("__pw");
            expect(serialized).not.toContain("__amz_selected_client_id");
            expect(serialized).not.toContain("notificationQueue");
        }
    });

    it("targets UK Amazon pages with only Amazon and license API host permissions", () => {
        const manifest = JSON.parse(readFileSync(resolve("src", "manifest.json"), "utf8"));

        expect(globalThis.AMZ_CONSTANTS.AMAZON.URLS.JOB_SEARCH)
            .toBe("https://www.jobsatamazon.co.uk/app#/jobSearch");
        expect(manifest.host_permissions).toEqual([
            "https://www.jobsatamazon.co.uk/*",
            "https://jobsatamazon.co.uk/*",
            "*://auth.hiring.amazon.com/*",
            "https://getslotnow.com/*",
        ]);
        expect(JSON.stringify(manifest)).not.toContain("alertmeasap");
        expect(JSON.stringify(manifest)).not.toContain("localhost:8080");
    });

    it("keeps local timing settings positive", () => {
        const { ALERTS, LOGGING, POLLING, SCHEDULE_AUTOMATION } = globalThis.AMZ_CONSTANTS;

        expect(ALERTS.JOB_FOUND_TOAST_DURATION_MS).toBeGreaterThan(0);
        expect(LOGGING.HIGH_FREQUENCY_THROTTLE_MS).toBeGreaterThan(0);
        expect(POLLING.FALLBACK_DELAY_MS).toBeGreaterThan(0);
        expect(SCHEDULE_AUTOMATION.RETRY_INTERVAL_MS).toBeGreaterThan(0);
    });
});
