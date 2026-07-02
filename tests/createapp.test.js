import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { JSDOM } from "jsdom";
import { loadSharedScripts, unloadSharedNamespaces } from "./_load.js";

async function tick() {
    for (let index = 0; index < 30; index += 1) {
        await Promise.resolve();
    }
}

function getParamFromUrl(url, key) {
    const parsed = new URL(url);
    const hashQuery = parsed.hash.includes("?") ? parsed.hash.split("?")[1] : "";
    return new URLSearchParams(hashQuery || parsed.search).get(key);
}

function setupCreateAppHarness(options = {}) {
    unloadSharedNamespaces(["AMZ_CONSTANTS", "AMZ_ACCESS", "__amazonCreateAppAutomation"]);
    loadSharedScripts(["shared/constants.js"]);

    const dom = new JSDOM(
        `<!doctype html><html><body>${options.html || "<button>Create Application</button>"}</body></html>`,
        {
            url: options.url || "https://www.jobsatamazon.co.uk/application/uk/?CS=true&jobId=JOB-1&locale=en-GB&ssoEnabled=1#/pre-consent?CS=true&jobId=JOB-1&locale=en-GB&ssoEnabled=1",
        }
    );

    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.MutationObserver = dom.window.MutationObserver;
    globalThis.requestAnimationFrame = callback => {
        callback();
        return 1;
    };

    const clickElement = vi.fn((button, label, clickOptions) => {
        if (typeof options.onClick === "function") {
            options.onClick(button, label, dom, clickOptions);
        }
        return true;
    });

    globalThis.AMZ_DOM = {
        isClickable: () => true,
        describeButton: button => button && {
            text: button.textContent.trim(),
            className: button.className || "",
            testId: button.getAttribute?.("data-test-id") || null,
        },
        clickElement,
        findButtonByText: text =>
            [...dom.window.document.querySelectorAll("button")].find(
                button => button.textContent.trim() === text
            ) || null,
    };
    globalThis.AMZ_URL = {
        getJobIdFromUrl: url => getParamFromUrl(url || dom.window.location.href, "jobId") || "JOB-1",
        getScheduleIdFromUrl: url => getParamFromUrl(url || dom.window.location.href, "scheduleId"),
        getApplicationContextFromUrl: url => {
            const value = url || dom.window.location.href;
            return {
                applicationId: getParamFromUrl(value, "applicationId"),
                jobId: getParamFromUrl(value, "jobId") || "JOB-1",
                scheduleId: getParamFromUrl(value, "scheduleId"),
            };
        },
    };
    globalThis.AMZ_STORAGE = {
        getLocal: vi.fn(async keys => {
            const values = {
                [globalThis.AMZ_CONSTANTS.STORAGE_KEYS.ACTIVE]: options.active !== false,
            };
            if (Array.isArray(keys)) {
                return keys.reduce((result, key) => {
                    if (Object.prototype.hasOwnProperty.call(values, key)) result[key] = values[key];
                    return result;
                }, {});
            }
            return Object.prototype.hasOwnProperty.call(values, keys) ? { [keys]: values[keys] } : {};
        }),
        setLocal: vi.fn(async () => {}),
    };
    const accessResponse = options.hasAccess === false
        ? {
            allowed: false,
            amazonEmailId: "candidate@example.com",
            message: "No active paid access.",
        }
        : {
            allowed: true,
            amazonEmailId: "candidate@example.com",
            accessExpiresAt: "2099-01-01T00:00:00.000Z",
            syncIntervalMs: 900000,
        };
    globalThis.AMZ_ACCESS = {
        ensureFreshAccess: vi.fn(async () => accessResponse),
        recordBookingUsage: vi.fn(async () => accessResponse),
        showAccessRequiredPrompt: vi.fn(async () => ({ shown: true })),
    };
    return { clickElement, dom };
}

function loadCreateAppScripts() {
    loadSharedScripts(["content/createapp.js"]);
}

describe("Create Application automation", () => {
    beforeEach(() => {
        vi.useRealTimers();
        unloadSharedNamespaces(["AMZ_CONSTANTS", "__amazonCreateAppAutomation"]);
    });

    afterEach(() => {
        globalThis.__amazonCreateAppAutomation?.cleanup?.();
        delete globalThis.window;
        delete globalThis.document;
        delete globalThis.MutationObserver;
        delete globalThis.requestAnimationFrame;
        delete globalThis.AMZ_DOM;
        delete globalThis.AMZ_URL;
        delete globalThis.AMZ_STORAGE;
        delete globalThis.AMZ_ACCESS;
        unloadSharedNamespaces(["AMZ_CONSTANTS", "AMZ_ACCESS", "__amazonCreateAppAutomation"]);
    });

    it("clicks the official pre-consent Next and consent Start Application steps once", async () => {
        vi.useFakeTimers();
        try {
            const { clickElement, dom } = setupCreateAppHarness({
                html: [
                    '<button type="button"><div>Next</div></button>',
                    '<button id="startApplicationButton" type="button"><div>Start Application</div></button>',
                ].join(""),
                onClick: (_button, label, dom) => {
                    if (label === "next") {
                        dom.window.history.replaceState(
                            null,
                            "",
                            "https://www.jobsatamazon.co.uk/application/uk/?CS=true&jobId=JOB-1&locale=en-GB&ssoEnabled=1#/consent?CS=true&jobId=JOB-1&locale=en-GB&ssoEnabled=1"
                        );
                    }
                },
            });
            const rescanDelayMs = globalThis.AMZ_CONSTANTS.CREATE_APPLICATION.POST_CLICK_RESCAN_MS;

            loadCreateAppScripts();
            await tick();

            expect(clickElement.mock.calls.map(call => call[1])).toEqual(["next"]);

            vi.advanceTimersByTime(rescanDelayMs);
            await tick();
            expect(clickElement.mock.calls.map(call => call[1])).toEqual([
                "next",
                "start application",
            ]);

            vi.advanceTimersByTime(rescanDelayMs * 2);
            await tick();
            expect(clickElement.mock.calls.map(call => call[1])).toEqual([
                "next",
                "start application",
            ]);
            expect(dom.window.location.hash).toContain("#/consent");
        } finally {
            vi.useRealTimers();
        }
    });

    it("clicks Continue on the active application modal and waits for the modal to leave", async () => {
        vi.useFakeTimers();
        try {
            const { clickElement } = setupCreateAppHarness({
                url: "https://www.jobsatamazon.co.uk/application/uk/?CS=true&jobId=JOB-1&locale=en-GB&ssoEnabled=1#/consent?CS=true&jobId=JOB-1&locale=en-GB&ssoEnabled=1",
                html: [
                    '<div role="dialog" aria-labelledby="existing-application-title">',
                    '<h4 id="existing-application-title">You have an active job application</h4>',
                    '<button type="button"><div>Go to dashboard</div></button>',
                    '<button type="button"><div>Continue</div></button>',
                    "</div>",
                    '<button id="startApplicationButton" type="button"><div>Start Application</div></button>',
                ].join(""),
            });
            const rescanDelayMs = globalThis.AMZ_CONSTANTS.CREATE_APPLICATION.POST_CLICK_RESCAN_MS;

            loadCreateAppScripts();
            await tick();

            expect(clickElement).toHaveBeenCalledOnce();
            expect(clickElement.mock.calls[0][1]).toBe("active application continue");
            expect(clickElement.mock.calls[0][0].textContent.trim()).toBe("Continue");

            vi.advanceTimersByTime(rescanDelayMs);
            expect(clickElement.mock.calls.map(call => call[1])).toEqual([
                "active application continue",
            ]);

            document
                .querySelector('[aria-labelledby="existing-application-title"]')
                .remove();
            vi.advanceTimersByTime(rescanDelayMs);
            await tick();

            expect(clickElement.mock.calls.map(call => call[1])).toEqual([
                "active application continue",
                "start application",
            ]);
        } finally {
            vi.useRealTimers();
        }
    });

    it("clicks job opportunity, Select this job, and Accept Offer on the UK flow", async () => {
        vi.useFakeTimers();
        try {
            const { clickElement, dom } = setupCreateAppHarness({
                url: "https://www.jobsatamazon.co.uk/application/uk/?CS=true&jobId=JOB-1&locale=en-GB&ssoEnabled=1#/job-opportunities?CS=true&jobId=JOB-1&locale=en-GB&ssoEnabled=1&applicationId=app-1",
                html: [
                    '<div data-test-component="StencilReactCard">',
                    '<div class="scheduleCardContainer" role="button">',
                    '<strong>Warehouse Operative</strong>',
                    '<p>Start Date: Thursday, 11 Jun 2026</p>',
                    '<p>Pay rate: GBP 14.30/hr</p>',
                    '<p>Location: James Park</p>',
                    "</div>",
                    "</div>",
                    '<button type="button"><div>Select this job</div></button>',
                    '<button data-test-component="StencilReactButton" class="contingent-offer-flyout-btn" type="button"><div>Accept Offer</div></button>',
                ].join(""),
                onClick: (_button, label, dom) => {
                    if (label === "job opportunity") {
                        dom.window.history.replaceState(
                            null,
                            "",
                            "https://www.jobsatamazon.co.uk/application/uk/?CS=true&jobId=JOB-1&locale=en-GB&ssoEnabled=1#/job-opportunities/job-confirmation?CS=true&jobId=JOB-1&locale=en-GB&ssoEnabled=1&applicationId=app-1&scheduleId=SCH-1"
                        );
                    }
                    if (label === "select this job") {
                        dom.window.history.replaceState(
                            null,
                            "",
                            "https://www.jobsatamazon.co.uk/application/uk/?CS=true&jobId=JOB-1&locale=en-GB&ssoEnabled=1#/contingent-offer?CS=true&jobId=JOB-1&locale=en-GB&ssoEnabled=1&applicationId=app-1&scheduleId=SCH-1"
                        );
                    }
                },
            });
            const rescanDelayMs = globalThis.AMZ_CONSTANTS.CREATE_APPLICATION.POST_CLICK_RESCAN_MS;

            loadCreateAppScripts();
            await tick();

            expect(clickElement.mock.calls.map(call => call[1])).toEqual(["job opportunity"]);
            expect(clickElement.mock.calls[0][0].classList.contains("scheduleCardContainer")).toBe(true);

            vi.advanceTimersByTime(rescanDelayMs);
            await tick();
            expect(clickElement.mock.calls.map(call => call[1])).toEqual([
                "job opportunity",
                "select this job",
            ]);

            vi.advanceTimersByTime(rescanDelayMs);
            await tick();
            expect(clickElement.mock.calls.map(call => call[1])).toEqual([
                "job opportunity",
                "select this job",
                "accept offer",
            ]);
            expect(clickElement.mock.calls[2][2]).toEqual({ targetSelf: true });
            dom.window.history.replaceState(
                null,
                "",
                "https://www.jobsatamazon.co.uk/application/uk/?CS=true&jobId=JOB-1&locale=en-GB&ssoEnabled=1#/additional-information?CS=true&jobId=JOB-1&locale=en-GB&ssoEnabled=1&applicationId=app-1&scheduleId=SCH-1"
            );
            vi.advanceTimersByTime(rescanDelayMs);
            await tick();
            expect(globalThis.AMZ_STORAGE.setLocal).not.toHaveBeenCalledWith(
                expect.objectContaining({ [globalThis.AMZ_CONSTANTS.STORAGE_KEYS.ACTIVE]: false })
            );
        } finally {
            vi.useRealTimers();
        }
    });

    it("retries Accept Offer once after Amazon stays on the contingent-offer route", async () => {
        vi.useFakeTimers();
        try {
            const { clickElement } = setupCreateAppHarness({
                url: "https://www.jobsatamazon.co.uk/application/uk/?CS=true&jobId=JOB-1&locale=en-GB&ssoEnabled=1#/contingent-offer?CS=true&jobId=JOB-1&locale=en-GB&ssoEnabled=1&applicationId=app-1&scheduleId=SCH-1",
                html: '<button data-test-component="StencilReactButton" class="contingent-offer-flyout-btn" type="button"><div>Accept Offer</div></button>',
            });
            const retryDelayMs = globalThis.AMZ_CONSTANTS.CREATE_APPLICATION.ACCEPT_OFFER_RETRY_DELAY_MS;

            loadCreateAppScripts();
            await tick();

            expect(clickElement.mock.calls.map(call => call[1])).toEqual(["accept offer"]);
            vi.advanceTimersByTime(retryDelayMs);
            await tick();
            expect(clickElement.mock.calls.map(call => call[1])).toEqual([
                "accept offer",
                "accept offer",
            ]);
            expect(clickElement.mock.calls[1][2]).toEqual({
                targetSelf: true,
            });
            vi.advanceTimersByTime(retryDelayMs * 2);
            await tick();
            expect(clickElement.mock.calls.map(call => call[1])).toEqual([
                "accept offer",
                "accept offer",
            ]);
        } finally {
            vi.useRealTimers();
        }
    });

    it("clicks Submit your shift preferences on the no-available-shift route once", async () => {
        vi.useFakeTimers();
        try {
            const { clickElement } = setupCreateAppHarness({
                url: "https://www.jobsatamazon.co.uk/application/uk/?CS=true&jobId=JOB-1&locale=en-GB&ssoEnabled=1#/no-available-shift?CS=true&jobId=JOB-1&locale=en-GB&ssoEnabled=1&applicationId=app-1",
                html: '<button data-test-component="StencilReactButton" type="button"><div>Submit your shift preferences</div></button>',
            });
            const rescanDelayMs = globalThis.AMZ_CONSTANTS.CREATE_APPLICATION.POST_CLICK_RESCAN_MS;

            loadCreateAppScripts();
            await tick();

            expect(clickElement.mock.calls.map(call => call[1])).toEqual([
                "submit shift preferences",
            ]);

            vi.advanceTimersByTime(rescanDelayMs * 3);
            await tick();
            expect(clickElement.mock.calls.map(call => call[1])).toEqual([
                "submit shift preferences",
            ]);
        } finally {
            vi.useRealTimers();
        }
    });

    it("clicks Start Assessment on the assessment consent route once", async () => {
        vi.useFakeTimers();
        try {
            const { clickElement } = setupCreateAppHarness({
                url: "https://www.jobsatamazon.co.uk/application/uk/?CS=true&jobId=JOB-1&locale=en-GB&ssoEnabled=1#/assessment-consent?CS=true&jobId=JOB-1&locale=en-GB&ssoEnabled=1&applicationId=app-1",
                html: '<button type="button"><div>Start Assessment</div></button>',
            });
            const rescanDelayMs = globalThis.AMZ_CONSTANTS.CREATE_APPLICATION.POST_CLICK_RESCAN_MS;

            loadCreateAppScripts();
            await tick();

            expect(clickElement.mock.calls.map(call => call[1])).toEqual(["start assessment"]);

            vi.advanceTimersByTime(rescanDelayMs * 3);
            await tick();
            expect(clickElement.mock.calls.map(call => call[1])).toEqual(["start assessment"]);
        } finally {
            vi.useRealTimers();
        }
    });

    it("does not click generic Continue buttons on later assessment routes", async () => {
        vi.useFakeTimers();
        try {
            const { clickElement } = setupCreateAppHarness({
                url: "https://www.jobsatamazon.co.uk/application/uk/?CS=true&jobId=JOB-1&locale=en-GB&ssoEnabled=1#/assessment?CS=true&jobId=JOB-1&locale=en-GB&ssoEnabled=1&applicationId=app-1",
                html: '<button type="button"><div>Continue</div></button>',
            });
            const rescanDelayMs = globalThis.AMZ_CONSTANTS.CREATE_APPLICATION.POST_CLICK_RESCAN_MS;

            loadCreateAppScripts();
            await tick();
            vi.advanceTimersByTime(rescanDelayMs * 4);
            await tick();

            expect(clickElement).not.toHaveBeenCalled();
        } finally {
            vi.useRealTimers();
        }
    });

    it("clicks generic Continue buttons once per unchanged UK application route", async () => {
        vi.useFakeTimers();
        try {
            const { clickElement } = setupCreateAppHarness({
                url: "https://www.jobsatamazon.co.uk/application/uk/?CS=true&jobId=JOB-1&locale=en-GB&ssoEnabled=1#/additional-information?CS=true&jobId=JOB-1&locale=en-GB&ssoEnabled=1&applicationId=app-1&scheduleId=SCH-1",
                html: '<button type="button"><div>Continue</div></button>',
            });
            const rescanDelayMs = globalThis.AMZ_CONSTANTS.CREATE_APPLICATION.POST_CLICK_RESCAN_MS;

            loadCreateAppScripts();
            await tick();
            expect(clickElement.mock.calls.map(call => call[1])).toEqual(["continue"]);

            vi.advanceTimersByTime(rescanDelayMs * 4);
            await tick();
            expect(clickElement.mock.calls.map(call => call[1])).toEqual(["continue"]);
        } finally {
            vi.useRealTimers();
        }
    });

    it("does not click native application controls without active access", async () => {
        vi.useFakeTimers();
        try {
            const { clickElement } = setupCreateAppHarness({
                hasAccess: false,
                html: '<button type="button"><div>Next</div></button>',
            });

            loadCreateAppScripts();
            await tick();
            vi.advanceTimersByTime(globalThis.AMZ_CONSTANTS.CREATE_APPLICATION.POST_CLICK_RESCAN_MS * 3);
            await tick();

            expect(clickElement).not.toHaveBeenCalled();
            expect(globalThis.AMZ_ACCESS.showAccessRequiredPrompt).toHaveBeenCalled();
        } finally {
            vi.useRealTimers();
        }
    });
});
