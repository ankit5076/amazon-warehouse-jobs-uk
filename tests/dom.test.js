import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";
import { loadSharedScripts, unloadSharedNamespaces } from "./_load.js";

function loadDom(html) {
    unloadSharedNamespaces(["AMZ_CONSTANTS", "AMZ_TEXT", "AMZ_DOM"]);
    loadSharedScripts([
        "shared/constants.js",
        "shared/utils/text.js",
    ]);

    const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, {
        url: "https://www.jobsatamazon.co.uk/app#/jobDetail?jobId=JOB-1&locale=en-GB",
    });

    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.MouseEvent = dom.window.MouseEvent;
    globalThis.PointerEvent = dom.window.PointerEvent;
    loadSharedScripts(["content/utils/dom.js"]);
    return dom;
}

describe("AMZ_DOM", () => {
    beforeEach(() => {
        unloadSharedNamespaces(["AMZ_CONSTANTS", "AMZ_TEXT", "AMZ_DOM"]);
    });

    afterEach(() => {
        delete globalThis.window;
        delete globalThis.document;
        delete globalThis.MouseEvent;
        delete globalThis.PointerEvent;
        unloadSharedNamespaces(["AMZ_CONSTANTS", "AMZ_TEXT", "AMZ_DOM"]);
    });

    it("dispatches native click events through the visible hit target inside a button", () => {
        const dom = loadDom(
            '<button id="apply" type="button"><div id="label">Apply</div></button>'
        );
        const button = dom.window.document.querySelector("#apply");
        const label = dom.window.document.querySelector("#label");
        const targets = [];

        button.getBoundingClientRect = () => ({
            left: 10,
            top: 20,
            width: 120,
            height: 36,
            right: 130,
            bottom: 56,
        });
        dom.window.document.elementFromPoint = vi.fn(() => label);
        button.addEventListener("click", event => {
            targets.push(event.target.id);
        });

        expect(globalThis.AMZ_DOM.clickElement(button, "apply")).toBe(true);

        expect(dom.window.document.elementFromPoint).toHaveBeenCalledWith(70, 38);
        expect(targets).toContain("label");
    });

    it("does not treat aria-disabled or disabled-class buttons as clickable", () => {
        const dom = loadDom(
            '<button id="aria" aria-disabled="true">Apply</button><button id="classed" class="jobDetailApplyButton disabled">Apply</button>'
        );

        expect(globalThis.AMZ_DOM.isClickable(dom.window.document.querySelector("#aria"))).toBe(false);
        expect(globalThis.AMZ_DOM.isClickable(dom.window.document.querySelector("#classed"))).toBe(false);
    });
});
