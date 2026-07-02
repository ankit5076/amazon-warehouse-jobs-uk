import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("console-based logging", () => {
    it("keeps runtime source files using direct console methods instead of the removed logger module", () => {
        const srcRoot = resolve(process.cwd(), "src");
        const expectedFiles = [
            "background/service-worker.js",
            "content/fetch.js",
            "content/login.js",
            "content/utils/alerts.js",
            "content/utils/auth-probe.js",
            "content/utils/dom.js",
            "content/utils/job-search.js",
            "content/utils/schedule-automation.js",
            "popup/content.js",
            "shared/utils/messaging.js",
        ];
        const offenders = expectedFiles.flatMap(relativePath => {
            const filePath = resolve(srcRoot, relativePath);
            if (!existsSync(filePath)) return [];

            const source = readFileSync(filePath, "utf8");
            const matches = [...source.matchAll(/console\.(log|info|debug|warn|error)\s*\(/g)];
            return matches.length === 0 ? [`${relativePath}:missing-console-call`] : [];
        });

        expect(offenders).toEqual([]);
    });

    it("does not reference the removed logger module in extension sources", () => {
        const sources = [
            "src/manifest.json",
            "src/shared/constants.js",
            "src/background/service-worker.js",
            "src/popup/index.html",
            "src/popup/content.js",
            "src/content/login.js",
            "src/content/createapp.js",
            "src/content/fetch.js",
            "src/content/utils/dom.js",
            "src/content/utils/auth-probe.js",
            "src/content/utils/page-refresh.js",
            "src/content/utils/alerts.js",
            "src/content/utils/job-search.js",
            "src/content/utils/schedule-automation.js",
            "src/shared/utils/messaging.js",
            "scripts/build.js",
        ]
            .map(path => readFileSync(resolve(process.cwd(), path), "utf8"))
            .join("\n");

        expect(sources).not.toContain("shared/utils/logger.js");
        expect(sources).not.toContain("AMZ_LOGGER");
    });
});
