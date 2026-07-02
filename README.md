# Amazon Warehouse UK

Chrome MV3 extension for Amazon UK warehouse job polling and booking automation.

## Structure

- `shared/constants.js` — Amazon UK URLs, storage keys, timing, selectors, and local defaults.
- `popup/*` — local popup settings: activation, location tags, Any UK location, job types, fetch interval, logs, and reset.
- `content/fetch.js` and `content/utils/*` — Amazon auth probing, GraphQL polling, matching, toasts, sounds, page refresh, and schedule automation.
- `content/createapp.js` — native Amazon application-page button automation.
- `background/*` — install handling, tab state sync, and create-application script injection.
- `scripts/build.js` — bundles and obfuscates the extension into `dist/amazon-warehouse-uk/`.

## Booking Test Mode

Payment and paid-access gates are intentionally disabled in this extension build so the booking process can be tested end to end. A payment gateway can be added later through the extension tracker service.

Amazon account authentication is manual on Amazon’s own site. If the Amazon session probe fails, polling stops and the extension navigates to Amazon login.

## Development

- `npm test` runs the Vitest suite.
- `npm run build` writes the unpacked extension to `dist/amazon-warehouse-uk/`.
- `npm run package` builds and zips the extension.
