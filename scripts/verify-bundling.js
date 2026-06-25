#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "src");
const DIST = path.join(ROOT, "dist", "amazon-warehouse-uk");
const SOURCE_JS_RE = /^(shared|content|background|popup)\//;

function fail(message) {
    console.error(`[bundle-verify] FAIL ${message}`);
    process.exit(1);
}

function assert(condition, message) {
    if (!condition) fail(message);
}

function readJson(filePath) {
    try {
        return JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch (error) {
        fail(`could not read JSON ${path.relative(ROOT, filePath)}: ${error.message}`);
    }
}

function relativeDistPath(filePath) {
    return path.relative(ROOT, path.join(DIST, filePath));
}

function assertDistFile(filePath, label) {
    assert(typeof filePath === "string" && filePath.trim(), `${label} is missing`);
    assert(!path.isAbsolute(filePath), `${label} must be relative: ${filePath}`);
    assert(!filePath.split(/[\\/]/).includes(".."), `${label} must not traverse directories: ${filePath}`);
    assert(fs.existsSync(path.join(DIST, filePath)), `${label} does not exist: ${relativeDistPath(filePath)}`);
}

function collectManifestReferences(manifest) {
    const refs = [];
    refs.push(["background.service_worker", manifest.background?.service_worker]);
    refs.push(["action.default_popup", manifest.action?.default_popup]);

    for (const [size, iconPath] of Object.entries(manifest.icons || {})) {
        refs.push([`icons.${size}`, iconPath]);
    }
    for (const [size, iconPath] of Object.entries(manifest.action?.default_icon || {})) {
        refs.push([`action.default_icon.${size}`, iconPath]);
    }

    (manifest.content_scripts || []).forEach((script, index) => {
        (script.js || []).forEach((filePath, fileIndex) => {
            refs.push([`content_scripts.${index}.js.${fileIndex}`, filePath]);
        });
        (script.css || []).forEach((filePath, fileIndex) => {
            refs.push([`content_scripts.${index}.css.${fileIndex}`, filePath]);
        });
    });

    (manifest.web_accessible_resources || []).forEach((entry, index) => {
        (entry.resources || []).forEach((filePath, fileIndex) => {
            refs.push([`web_accessible_resources.${index}.resources.${fileIndex}`, filePath]);
        });
    });

    return refs;
}

function runBuild() {
    const result = spawnSync(process.execPath, [path.join(ROOT, "scripts", "build.js")], {
        cwd: ROOT,
        env: process.env,
        stdio: "inherit",
    });

    assert(result.status === 0, `build failed with status ${result.status}`);
}

function verify() {
    const sourceManifest = readJson(path.join(SRC, "manifest.json"));
    const distManifestPath = path.join(DIST, "manifest.json");
    assert(fs.existsSync(distManifestPath), "dist manifest is missing; run npm run build first");

    const manifest = readJson(distManifestPath);
    assert(manifest.manifest_version === 3, "built manifest must remain MV3");
    assert(manifest.version === sourceManifest.version, "built manifest version must match src/manifest.json");

    const [applicationScript, mainScript] = manifest.content_scripts || [];
    assert(applicationScript, "built manifest missing application content script");
    assert(mainScript, "built manifest missing main content script");
    assert((manifest.content_scripts || []).length === 2, "built manifest should only include application and main content scripts");
    assert(applicationScript.run_at === "document_idle", "application content script must run at document_idle");
    assert(mainScript.run_at === "document_idle", "main content script must run at document_idle");
    assert(applicationScript.js?.length === 1, "application content script should be one built bundle");
    assert(mainScript.js?.length === 2, "main content script should load SweetAlert and one built bundle");
    assert(/^content-application\.[a-f0-9]{12}\.js$/.test(applicationScript.js[0]), "application content bundle name is unexpected");
    assert(mainScript.js.some(filePath => /^content-main\.[a-f0-9]{12}\.js$/.test(filePath)), "main content bundle missing");
    assert(mainScript.js.some(filePath => /^sweetalert\.[a-f0-9]{12}\.js$/.test(filePath)), "SweetAlert JS bundle missing");

    const distFiles = fs.readdirSync(DIST);

    const references = collectManifestReferences(manifest);
    for (const [label, filePath] of references) {
        assertDistFile(filePath, label);
        if (filePath.endsWith(".js")) {
            assert(!SOURCE_JS_RE.test(filePath), `${label} points at source JS instead of a built bundle: ${filePath}`);
        }
    }

    console.log("[bundle-verify] OK bundle verification passed");
    console.log(`[bundle-verify] version ${manifest.version}`);
    console.log("[bundle-verify] native application flow only");
}

const args = new Set(process.argv.slice(2));
if (!args.has("--skip-build")) runBuild();
verify();
