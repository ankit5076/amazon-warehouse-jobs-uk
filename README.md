# Amazon Warehouse UK

Chrome MV3 extension for paid-access Amazon UK warehouse job polling and booking automation.

## Structure

- `shared/constants.js` — Amazon UK URLs, storage keys, timing, selectors, and local defaults.
- `popup/*` — paid-access controls and local popup settings: activation, location tags, Any UK location, job types, fetch interval, logs, and reset.
- `content/fetch.js` and `content/utils/*` — Amazon auth probing, GraphQL polling, matching, toasts, sounds, page refresh, and schedule automation.
- `content/createapp.js` — native Amazon application-page button automation.
- `background/*` — install handling, tab state sync, and create-application script injection.
- `scripts/build.js` — bundles and obfuscates the extension into `dist/amazon-warehouse-uk/`.

## Paid-Access Behavior

The extension connects to the GetSlotNow backend only for license checks and hosted checkout. It has no admin login, no backend client picker, no Telegram integration, and no outbound booking observability posts.

Amazon account authentication is manual on Amazon’s own site. If the Amazon session probe fails, polling stops and the extension navigates to Amazon login.

## Development

- `npm test` runs the Vitest suite.
- `npm run build` writes the unpacked extension to `dist/amazon-warehouse-uk/`.
- `npm run package` builds and zips the extension.
