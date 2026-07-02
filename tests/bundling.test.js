import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const DIST = resolve(ROOT, "dist", "amazon-warehouse-uk");

function contextBody(buildScript, name) {
    const match = buildScript.match(new RegExp(`${name}: Object\\.freeze\\(\\[([\\s\\S]*?)\\]\\),`));
    expect(match, `${name} context should exist`).not.toBeNull();
    return match?.[1] || "";
}

describe("production bundling", () => {
    it("keeps production content bundles free of removed legacy scripts", () => {
        const buildScript = readFileSync(resolve(ROOT, "scripts", "build.js"), "utf8");
        const applicationContent = contextBody(buildScript, "APPLICATION_CONTENT");
        const mainContent = contextBody(buildScript, "MAIN_CONTENT");

        expect(applicationContent).toContain('"content/utils/dom.js"');
        expect(applicationContent).toContain('"content/createapp.js"');
        expect(applicationContent).not.toContain('"content/utils/application-observability.js"');
        expect(applicationContent).not.toContain('"shared/api-client.js"');
        expect(applicationContent).not.toContain('"shared/validation.js"');
        expect(applicationContent).not.toContain('"shared/notifications.js"');
        expect(applicationContent.indexOf('"content/utils/dom.js"'))
            .toBeLessThan(applicationContent.indexOf('"content/createapp.js"'));

        expect(mainContent).not.toContain('"content/utils/application-observability.js"');
        expect(mainContent).not.toContain('"shared/job-found-channel.js"');
        expect(mainContent).toContain('"content/login.js"');
        expect(mainContent.indexOf('"content/login.js"'))
            .toBeLessThan(mainContent.indexOf('"content/fetch.js"'));
        expect(mainContent).not.toContain('"shared/api-client.js"');
        expect(mainContent).not.toContain('"shared/validation.js"');
        expect(mainContent).not.toContain('"shared/notifications.js"');
        expect(buildScript).not.toContain("JOB_FOUND_CHANNEL");
        expect(buildScript).not.toContain("job-found-channel");
        expect(buildScript).not.toContain("background/telegram.js");
        expect(buildScript).not.toContain("background/notification-service.js");
    });

    it("builds a self-contained MV3 dist with native application flow only", () => {
        const output = execFileSync(process.execPath, ["scripts/verify-bundling.js"], {
            cwd: ROOT,
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"],
        });

        expect(output).toContain("bundle verification passed");

        const manifest = JSON.parse(readFileSync(resolve(DIST, "manifest.json"), "utf8"));
        const resources = manifest.web_accessible_resources.flatMap(entry => entry.resources || []);
        expect(resources).not.toContain("content/utils/dom.js");
        expect(output).toContain("native application flow only");
    });
});
