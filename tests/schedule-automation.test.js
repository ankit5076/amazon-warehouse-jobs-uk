import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";
import { loadSharedScripts, unloadSharedNamespaces } from "./_load.js";

const SELECT_SCHEDULE_SELECTOR = 'button[data-test-id="jobDetailSelectScheduleButton"], .jobDetailScheduleDropdown';
const SCHEDULE_APPLY_SELECTOR = 'button[data-test-id="ScheduleCardSelectScheduleLink"]';
const SCHEDULE_OPTION_SELECTOR = 'div[data-test-id="schedulePanel"] [data-test-component="StencilReactCard"][role="button"], div[data-test-id="schedulePanel"] [role="button"].focusableItem, div[data-test-id="schedulePanel"] .scheduleFlyoutSelection';
const SCHEDULE_LABEL_SELECTOR = ".scheduleCardLabelText";
const DESKTOP_APPLY_SELECTOR = 'button[data-test-id="jobDetailApplyButtonDesktop"]';

function setupHarness({
    elementsBySelector = {},
    onNoApplyPath = vi.fn(),
    requestAnimationFrameImpl,
} = {}) {
    unloadSharedNamespaces([
        "AMZ_CONSTANTS",
        "AMZ_TEXT",
        "AMZ_SCHEDULE_AUTOMATION",
    ]);
    loadSharedScripts([
        "shared/constants.js",
        "shared/utils/text.js",
    ]);

    const dom = new JSDOM("<!doctype html><html><body></body></html>", {
        url: "https://www.jobsatamazon.co.uk/app#/jobDetail?jobId=JOB-1&locale=en-GB",
    });

    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.MutationObserver = dom.window.MutationObserver;
    globalThis.requestAnimationFrame = requestAnimationFrameImpl || (callback => setTimeout(callback, 0));

    const clickElement = vi.fn(() => true);
    let currentUrl = "https://www.jobsatamazon.co.uk/app#/jobDetail?jobId=JOB-1&locale=en-GB";
    globalThis.AMZ_DOM = {
        getClickableElements: selector => {
            const value = elementsBySelector[selector];
            return typeof value === "function" ? value() : value || [];
        },
        clickElement,
    };
    globalThis.AMZ_STORAGE = {
        setLocal: vi.fn(() => Promise.resolve()),
    };
    globalThis.AMZ_URL = {
        currentUrl: () => currentUrl,
        isJobDetailPage: url => String(url || currentUrl).includes("#/jobDetail?jobId="),
        getJobIdFromUrl: () => "JOB-1",
    };
    loadSharedScripts(["content/utils/schedule-automation.js"]);

    const automation = globalThis.AMZ_SCHEDULE_AUTOMATION.create({
        isActive: () => true,
        onNoApplyPath,
    });

    return {
        automation,
        clickElement,
        dom,
        onNoApplyPath,
        setCurrentUrl: value => {
            currentUrl = value;
            dom.window.dispatchEvent(new dom.window.Event("hashchange"));
        },
    };
}

describe("schedule automation", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        delete globalThis.window;
        delete globalThis.document;
        delete globalThis.MutationObserver;
        delete globalThis.requestAnimationFrame;
        delete globalThis.AMZ_DOM;
        delete globalThis.AMZ_STORAGE;
        delete globalThis.AMZ_URL;
        unloadSharedNamespaces([
            "AMZ_CONSTANTS",
            "AMZ_TEXT",
            "AMZ_SCHEDULE_AUTOMATION",
        ]);
    });

    it("does not repeatedly click Select schedule after the drawer opens", () => {
        const button = { textContent: "Select schedule" };

        const harness = setupHarness({
            elementsBySelector: {
                [SELECT_SCHEDULE_SELECTOR]: [button],
            },
        });
        const { SCHEDULE_AUTOMATION } = globalThis.AMZ_CONSTANTS;

        harness.automation.start();
        vi.advanceTimersByTime(SCHEDULE_AUTOMATION.RETRY_INTERVAL_MS * 5);

        const selectScheduleClicks = harness.clickElement.mock.calls.filter(
            call => call[1] === "select schedule"
        );
        expect(selectScheduleClicks).toHaveLength(1);

        harness.automation.stop();
    });

    it("runs a queued attempt through the timeout fallback when animation frames stall", () => {
        const button = {
            textContent: "Apply",
            getAttribute: vi.fn(() => null),
            closest: vi.fn(() => ({ innerText: "Shift card" })),
        };
        const requestAnimationFrameImpl = vi.fn();
        const harness = setupHarness({
            elementsBySelector: {
                [SCHEDULE_APPLY_SELECTOR]: [button],
            },
            requestAnimationFrameImpl,
        });
        const { SCHEDULE_AUTOMATION } = globalThis.AMZ_CONSTANTS;

        harness.automation.start();
        expect(requestAnimationFrameImpl).toHaveBeenCalledOnce();

        vi.advanceTimersByTime(SCHEDULE_AUTOMATION.ATTEMPT_QUEUE_FALLBACK_MS);

        expect(harness.clickElement).toHaveBeenCalledWith(button, "schedule apply", {
            nativeOnly: true,
        });
    });

    it("ignores queued animation-frame callbacks after stop", () => {
        const button = {
            textContent: "Apply",
            getAttribute: vi.fn(() => null),
            closest: vi.fn(() => ({ innerText: "Shift card" })),
        };
        let frameCallback = null;
        const requestAnimationFrameImpl = vi.fn(callback => {
            frameCallback = callback;
        });
        const harness = setupHarness({
            elementsBySelector: {
                [SCHEDULE_APPLY_SELECTOR]: [button],
            },
            requestAnimationFrameImpl,
        });
        const { SCHEDULE_AUTOMATION } = globalThis.AMZ_CONSTANTS;

        harness.automation.start();
        harness.automation.stop();
        frameCallback?.();
        vi.advanceTimersByTime(SCHEDULE_AUTOMATION.ATTEMPT_QUEUE_FALLBACK_MS);

        expect(harness.clickElement).not.toHaveBeenCalled();
    });

    it("reports the job as unavailable when no schedule options appear after Select schedule", () => {
        const onNoApplyPath = vi.fn();
        const harness = setupHarness({
            elementsBySelector: {
                [SELECT_SCHEDULE_SELECTOR]: [{ textContent: "Select schedule" }],
            },
            onNoApplyPath,
        });
        const { SCHEDULE_AUTOMATION } = globalThis.AMZ_CONSTANTS;

        harness.automation.start();
        vi.advanceTimersByTime(1);
        vi.advanceTimersByTime(SCHEDULE_AUTOMATION.POST_SELECT_SCHEDULE_OPTIONS_GRACE_MS);

        expect(onNoApplyPath).toHaveBeenCalledWith(expect.objectContaining({
            reason: "schedule-options-missing-after-select",
            scheduleDrawerOpened: true,
            selectScheduleClickAttempts: 1,
            diagnostics: expect.objectContaining({
                stage: "post-select-schedule-options-grace-expired",
                counts: expect.objectContaining({
                    scheduleApplyButtons: 0,
                    scheduleOptions: 0,
                    scheduleLabels: 0,
                    desktopApplyButtons: 0,
                }),
            }),
        }));
    });

    it("waits when schedule options appear after Select schedule", () => {
        const onNoApplyPath = vi.fn();
        let applyVisible = false;
        const applyButton = {
            textContent: "Apply",
            getAttribute: vi.fn(() => null),
            closest: vi.fn(() => ({ innerText: "Shift card" })),
        };
        const harness = setupHarness({
            elementsBySelector: {
                [SELECT_SCHEDULE_SELECTOR]: [{ textContent: "Select schedule" }],
                [SCHEDULE_APPLY_SELECTOR]: () => (applyVisible ? [applyButton] : []),
            },
            onNoApplyPath,
        });
        const { SCHEDULE_AUTOMATION } = globalThis.AMZ_CONSTANTS;

        harness.automation.start();
        vi.advanceTimersByTime(1);
        applyVisible = true;
        vi.advanceTimersByTime(SCHEDULE_AUTOMATION.POST_SELECT_SCHEDULE_OPTIONS_GRACE_MS);

        expect(onNoApplyPath).not.toHaveBeenCalled();
    });

    it("reports the job as unavailable when Amazon marks the job detail page unavailable", () => {
        const onNoApplyPath = vi.fn();
        const harness = setupHarness({
            elementsBySelector: {
                [SCHEDULE_LABEL_SELECTOR]: [{ textContent: "Mon, Tue 8:30 AM" }],
            },
            onNoApplyPath,
        });
        const { SCHEDULE_AUTOMATION } = globalThis.AMZ_CONSTANTS;

        harness.dom.window.document.body.textContent =
            "Warning This job is not available for application now.";
        harness.automation.start();
        vi.advanceTimersByTime(1);
        vi.advanceTimersByTime(SCHEDULE_AUTOMATION.POST_SCHEDULE_LABEL_APPLY_GRACE_MS);

        expect(onNoApplyPath).toHaveBeenCalledWith(expect.objectContaining({
            reason: "job-unavailable-before-apply",
            diagnostics: expect.objectContaining({
                stage: "unavailable-apply-page",
            }),
        }));
    });

    it("continues waiting when Apply is slow after schedule label selection", () => {
        const onNoApplyPath = vi.fn();
        const harness = setupHarness({
            elementsBySelector: {
                [SCHEDULE_LABEL_SELECTOR]: [{ textContent: "Mon, Tue 8:30 AM" }],
            },
            onNoApplyPath,
        });
        const { SCHEDULE_AUTOMATION } = globalThis.AMZ_CONSTANTS;

        harness.automation.start();
        vi.advanceTimersByTime(1);
        vi.advanceTimersByTime(SCHEDULE_AUTOMATION.POST_SCHEDULE_LABEL_APPLY_GRACE_MS);

        expect(onNoApplyPath).not.toHaveBeenCalled();
    });

    it("opens the UK legacy schedule dropdown and selects a flyout option before desktop apply", () => {
        const dropdown = { textContent: "Select one" };
        const option = { textContent: "Mon, Tue 8:30 AM" };
        const applyButton = {
            textContent: "Apply",
            getAttribute: vi.fn(() => null),
            closest: vi.fn(() => ({ innerText: "Selected shift" })),
        };
        let optionVisible = false;
        let applyVisible = false;
        const harness = setupHarness({
            elementsBySelector: {
                [SELECT_SCHEDULE_SELECTOR]: [dropdown],
                [SCHEDULE_OPTION_SELECTOR]: () => (optionVisible ? [option] : []),
                [DESKTOP_APPLY_SELECTOR]: () => (applyVisible ? [applyButton] : []),
            },
        });
        const { SCHEDULE_AUTOMATION } = globalThis.AMZ_CONSTANTS;

        harness.automation.start();
        vi.advanceTimersByTime(1);
        expect(harness.clickElement).toHaveBeenCalledWith(dropdown, "select schedule");

        optionVisible = true;
        vi.advanceTimersByTime(SCHEDULE_AUTOMATION.RETRY_INTERVAL_MS);
        expect(harness.clickElement).toHaveBeenCalledWith(option, "schedule option");

        applyVisible = true;
        vi.advanceTimersByTime(SCHEDULE_AUTOMATION.RETRY_INTERVAL_MS);
        expect(harness.clickElement).toHaveBeenCalledWith(applyButton, "desktop apply", {
            nativeOnly: true,
        });
    });

    it("clicks enabled desktop Apply before re-opening a selected schedule dropdown", () => {
        const dropdown = { textContent: "Selected shift" };
        const label = { textContent: "Shift: Mon, Tue 8:30 AM" };
        const applyButton = {
            textContent: "Apply",
            getAttribute: vi.fn(() => null),
            closest: vi.fn(() => ({ innerText: "Selected shift" })),
        };
        const harness = setupHarness({
            elementsBySelector: {
                [SELECT_SCHEDULE_SELECTOR]: [dropdown],
                [SCHEDULE_LABEL_SELECTOR]: [label],
                [DESKTOP_APPLY_SELECTOR]: [applyButton],
            },
        });

        harness.automation.start();
        vi.advanceTimersByTime(1);

        expect(harness.clickElement).toHaveBeenCalledWith(applyButton, "desktop apply", {
            nativeOnly: true,
        });
        expect(harness.clickElement).not.toHaveBeenCalledWith(label, "schedule label");
        expect(harness.clickElement).not.toHaveBeenCalledWith(dropdown, "select schedule");
    });

    it("does not click Apply again when the original job-detail tab stays open", () => {
        const applyButton = {
            textContent: "Apply",
            getAttribute: vi.fn(() => null),
            closest: vi.fn(() => ({ innerText: "Selected shift" })),
            click: vi.fn(),
        };
        const onNoApplyPath = vi.fn();
        const harness = setupHarness({
            elementsBySelector: {
                [DESKTOP_APPLY_SELECTOR]: [applyButton],
            },
            onNoApplyPath,
        });
        const { SCHEDULE_AUTOMATION } = globalThis.AMZ_CONSTANTS;

        harness.automation.start();
        vi.advanceTimersByTime(1);
        expect(harness.clickElement).toHaveBeenCalledWith(applyButton, "desktop apply", {
            nativeOnly: true,
        });

        vi.advanceTimersByTime(SCHEDULE_AUTOMATION.RETRY_INTERVAL_MS * 3);
        vi.advanceTimersByTime(SCHEDULE_AUTOMATION.HARD_STOP_DELAY_MS);

        expect(harness.clickElement.mock.calls.filter(call => call[1] === "desktop apply"))
            .toHaveLength(1);
        expect(onNoApplyPath).not.toHaveBeenCalled();
    });

    it("clicks Apply again after schedule automation restarts for the same job", () => {
        const applyButton = {
            textContent: "Apply",
            getAttribute: vi.fn(() => null),
            closest: vi.fn(() => ({ innerText: "Selected shift" })),
        };
        const harness = setupHarness({
            elementsBySelector: {
                [DESKTOP_APPLY_SELECTOR]: [applyButton],
            },
        });
        const { SCHEDULE_AUTOMATION } = globalThis.AMZ_CONSTANTS;

        harness.automation.start();
        vi.advanceTimersByTime(1);
        harness.automation.start();
        vi.advanceTimersByTime(SCHEDULE_AUTOMATION.RETRY_INTERVAL_MS * 2);

        expect(harness.clickElement.mock.calls.filter(call => call[1] === "desktop apply"))
            .toHaveLength(2);
    });

    it("clicks Apply again after leaving and returning to the same job detail page", () => {
        const applyButton = {
            textContent: "Apply",
            getAttribute: vi.fn(() => null),
            closest: vi.fn(() => ({ innerText: "Selected shift" })),
        };
        const harness = setupHarness({
            elementsBySelector: {
                [DESKTOP_APPLY_SELECTOR]: [applyButton],
            },
        });

        harness.automation.start();
        vi.advanceTimersByTime(1);

        harness.setCurrentUrl("https://www.jobsatamazon.co.uk/app#/jobSearch");
        harness.setCurrentUrl("https://www.jobsatamazon.co.uk/app#/jobDetail?jobId=JOB-1&locale=en-GB");
        harness.automation.start();
        vi.advanceTimersByTime(1);

        expect(harness.clickElement.mock.calls.filter(call => call[1] === "desktop apply"))
            .toHaveLength(2);
    });

    it("does not synthesize a myApplications route after clicking Apply", () => {
        const applyButton = {
            textContent: "Apply",
            getAttribute: vi.fn(() => null),
            closest: vi.fn(() => ({ innerText: "Selected shift" })),
        };
        const harness = setupHarness({
            elementsBySelector: {
                [DESKTOP_APPLY_SELECTOR]: [applyButton],
            },
        });
        const initialUrl = harness.dom.window.location.href;

        harness.automation.start();
        vi.advanceTimersByTime(1);
        vi.advanceTimersByTime(globalThis.AMZ_CONSTANTS.SCHEDULE_AUTOMATION.HARD_STOP_DELAY_MS);

        expect(harness.clickElement).toHaveBeenCalledWith(applyButton, "desktop apply", {
            nativeOnly: true,
        });
        expect(harness.dom.window.location.href).toBe(initialUrl);
    });

    it("reports the no-apply path when the hard stop fires", () => {
        const onNoApplyPath = vi.fn();
        const harness = setupHarness({ onNoApplyPath });
        const { SCHEDULE_AUTOMATION } = globalThis.AMZ_CONSTANTS;

        harness.automation.start();
        vi.advanceTimersByTime(SCHEDULE_AUTOMATION.HARD_STOP_DELAY_MS);

        expect(onNoApplyPath).toHaveBeenCalledWith(expect.objectContaining({
            reason: "hard-stop",
            jobId: "JOB-1",
            scheduleDrawerOpened: false,
        }));
    });
});
