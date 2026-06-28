import { describe, it, expect, beforeEach, vi } from "vitest";
import { JSDOM } from "jsdom";
import { loadSharedScripts, unloadSharedNamespaces } from "./_load.js";

function reload() {
    const dom = new JSDOM("<!doctype html><html><body></body></html>");
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.Swal = {
        fire: vi.fn(),
        update: vi.fn(),
        isVisible: vi.fn(() => false),
        close: vi.fn(),
    };

    unloadSharedNamespaces([
        "AMZ_CONSTANTS",
        "AMZ_TEXT",
        "AMZ_TOASTS",
    ]);
    loadSharedScripts([
        "shared/constants.js",
        "shared/utils/text.js",
        "content/utils/toasts.js",
    ]);
}

describe("AMZ_TOASTS", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        reload();
    });

    it("renders polling distance in miles to match GraphQL geoQueryClause", () => {
        globalThis.AMZ_TOASTS.renderPollingToast({
            selectedCity: "London",
            distance: "30",
            jobType: ["FULL_TIME"],
            intervalMs: 650,
            intervalUnit: "ms",
            authProbeStatus: globalThis.AMZ_CONSTANTS.AUTH_PROBE.STATUSES.AUTHENTICATED,
            apiMeta: { state: "idle" },
        });

        const html = globalThis.Swal.fire.mock.calls[0][0].html;
        expect(html).toContain("📏 30 mi");
        expect(html).not.toContain("30 km");
    });

    it("explains that search is free but booking requires paid access", () => {
        globalThis.AMZ_TOASTS.showCreditsRequiredPopup({ city: "London", jobId: "JOB-1" });

        const config = globalThis.Swal.fire.mock.calls[0][0];
        expect(config.title).toBe("Job search is free");
        expect(config.html).toContain("booking requires paid access");
        expect(config.html).toContain("30-Day");
        expect(config.html).toContain("Pro");
        expect(config.html).toContain("London");
    });
});
