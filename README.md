# Amazon Warehouse UK

Chrome MV3 extension for local-only Amazon UK warehouse job polling and booking automation.

## Structure

- `shared/constants.js` — Amazon UK URLs, storage keys, timing, selectors, and local defaults.
- `popup/*` — local popup settings: activation, location tags, Any UK location, job types, fetch interval, logs, and reset.
- `content/fetch.js` and `content/utils/*` — Amazon auth probing, GraphQL polling, matching, toasts, sounds, page refresh, and schedule automation.
- `content/createapp.js` — native Amazon application-page button automation.
- `background/*` — install handling, tab state sync, and create-application script injection.
- `scripts/build.js` — bundles and obfuscates the extension into `dist/amazon-warehouse-uk/`.

## Local-Only Behavior

The extension does not connect to tracker-service, Telegram, or any non-Amazon service. It has no admin login, no backend client picker, no backend runtime validation, and no outbound booking observability posts.

Amazon account authentication is manual on Amazon’s own site. If the Amazon session probe fails, polling stops and the extension navigates to Amazon login.

## Development

- `npm test` runs the Vitest suite.
- `npm run build` writes the unpacked extension to `dist/amazon-warehouse-uk/`.
- `npm run package` builds and zips the extension.
