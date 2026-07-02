import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("logger removal", () => {
  it("does not reference logger.js or AMZ_LOGGER in extension sources", () => {
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
      .map(read)
      .join("\n");

    expect(sources).not.toContain("shared/utils/logger.js");
    expect(sources).not.toContain("AMZ_LOGGER");
  });
});
