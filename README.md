# Amazon Warehouse UK

Chrome MV3 extension for Amazon UK warehouse job polling and booking automation.

## Structure

- `shared/constants.js` — Amazon UK URLs, tracker access config, storage keys, timing, selectors, and local defaults.
- `shared/utils/access-api.js` — extension tracker client for access checks, Razorpay checkout creation, and booking usage audit.
- `popup/*` — local popup settings: activation, location tags, Any UK location, job types, fetch interval, access status, checkout, and reset.
- `content/fetch.js` and `content/utils/*` — Amazon auth probing, GraphQL polling, matching, toasts, sounds, page refresh, and schedule automation.
- `content/createapp.js` — native Amazon application-page button automation.
- `background/*` — install handling, tab state sync, and create-application script injection.
- `scripts/build.js` — bundles and obfuscates the extension into `dist/amazon-warehouse-uk/`.

## 60-Day Access Pass

Search and matching are available without paid access. Moving from a match into booking, job-detail Apply automation, and native application automation require an active tracker-backed 60-day access pass.

The pass is a one-time Razorpay checkout for `Rs 6,999`, grants 60 days of access, and allows unlimited bookings while active. The extension calls `https://getslotnow.com/extension-usage-tracker` for `/license/check`, `/license/checkout`, and `/license/usage`; it never calls Supabase or stores Razorpay/Supabase secrets.

Amazon account authentication is manual on Amazon’s own site. If the Amazon session probe fails, polling stops and the extension navigates to Amazon login.

## Development

- `npm test` runs the Vitest suite.
- `npm run build` writes the unpacked extension to `dist/amazon-warehouse-uk/`.
- `npm run package` builds and zips the extension.
