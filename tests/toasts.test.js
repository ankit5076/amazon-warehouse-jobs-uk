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

    it("renders a booking confirmation toast", () => {
        globalThis.AMZ_TOASTS.showBookingConfirmedToast({ jobId: "JOB-1", scheduleId: "SCH-1" });

        const config = globalThis.Swal.fire.mock.calls[0][0];
        expect(config.title).toBe("Booking confirmed");
        expect(config.html).toContain("JOB-1");
        expect(config.html).toContain("SCH-1");
        expect(config.icon).toBe("success");
    });

    it("shows returned job locations while city filters are being matched", () => {
        globalThis.AMZ_TOASTS.showJobsReceivedToast(650, [
            { city: "Edinburgh" },
            { city: "London" },
            { city: "Edinburgh" },
        ]);

        const config = globalThis.Swal.fire.mock.calls[0][0];
        expect(config.html).toContain("Found jobs in Edinburgh, London");
        expect(config.html).toContain("Matching city filters");
    });

    it("shows the configured matched location in the job matched toast", () => {
        globalThis.AMZ_TOASTS.showJobFoundToast({
            job: { city: "", locationName: "Edinburgh Delivery Station" },
            matchedLocation: {
                tag: "Edinburgh",
                field: "locationName",
                value: "Edinburgh Delivery Station",
            },
        });

        const config = globalThis.Swal.fire.mock.calls[0][0];
        expect(config.title).toBe("Job matched for Edinburgh");
        expect(config.html).toContain("Matching job in Edinburgh");
        expect(config.html).toContain("Amazon location: Edinburgh Delivery Station");
    });
});
