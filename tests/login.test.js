import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";
import { loadSharedScripts, unloadSharedNamespaces } from "./_load.js";

describe("AMZ_LOGIN flow", () => {
    beforeEach(() => {
        const dom = new JSDOM("<!doctype html><html><body></body></html>", {
            url: "https://www.jobsatamazon.co.uk/app#/jobSearch",
        });

        globalThis.window = dom.window;
        globalThis.document = dom.window.document;
        globalThis.localStorage = dom.window.localStorage;
        globalThis.sessionStorage = dom.window.sessionStorage;

        unloadSharedNamespaces(["AMZ_CONSTANTS", "AMZ_URL", "AMZ_LOGIN"]);
        loadSharedScripts(["shared/constants.js"]);
        loadSharedScripts(["shared/utils/url.js"]);
        globalThis.AMZ_DOM = {
            waitForSelector: vi.fn(),
            setInputValue: vi.fn(),
        };
        globalThis.AMZ_STORAGE = {
            getLocal: vi.fn(async () => ({})),
            setLocal: vi.fn(async () => {}),
        };
        globalThis.Swal = {
            fire: vi.fn(async () => ({ isConfirmed: false })),
            showValidationMessage: vi.fn(),
        };

        loadSharedScripts(["content/login.js"]);
    });

    afterEach(() => {
        delete globalThis.window;
        delete globalThis.document;
        delete globalThis.localStorage;
        delete globalThis.sessionStorage;
        delete globalThis.chrome;
        delete globalThis.AMZ_DOM;
        delete globalThis.AMZ_STORAGE;
        delete globalThis.Swal;
        unloadSharedNamespaces(["AMZ_CONSTANTS", "AMZ_URL", "AMZ_LOGIN"]);
    });

    it("does not show the credential prompt on the job search page", async () => {
        await globalThis.AMZ_LOGIN.handleAuthLoginFlow();

        expect(globalThis.Swal.fire).not.toHaveBeenCalled();
        expect(globalThis.AMZ_DOM.waitForSelector).not.toHaveBeenCalled();
    });

    it("shows the credential prompt on the Amazon login page", async () => {
        window.history.replaceState(null, "", "/app#/login");

        await globalThis.AMZ_LOGIN.handleAuthLoginFlow();

        expect(globalThis.Swal.fire).toHaveBeenCalledWith(expect.objectContaining({
            title: "Amazon Login Required",
        }));
    });

    it("asks the service worker to clear Amazon auth cookies", async () => {
        localStorage.setItem("sessionToken", "token");
        localStorage.setItem("bbCandidateId", "candidate");
        sessionStorage.setItem("amazon-session", "value");
        globalThis.chrome = {
            runtime: {
                sendMessage: vi.fn(async () => ({ ok: true, removed: 1 })),
            },
        };

        await globalThis.AMZ_LOGIN.logoutAmazonSession();

        expect(localStorage.getItem("sessionToken")).toBeNull();
        expect(localStorage.getItem("bbCandidateId")).toBeNull();
        expect(sessionStorage.length).toBe(0);
        expect(globalThis.chrome.runtime.sendMessage).toHaveBeenCalledWith({
            action: globalThis.AMZ_CONSTANTS.MESSAGE_ACTIONS.LOGOUT_AMAZON_SESSION,
        });
    });
});
