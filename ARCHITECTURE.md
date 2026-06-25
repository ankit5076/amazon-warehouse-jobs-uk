# Architecture

## Runtime Model

The extension is local-only. Popup settings are stored in Chrome local storage and drive all automation:

- `ACTIVE` starts or stops polling and booking automation.
- Location scope is either explicit city tags or Any UK location.
- Job types and fetch interval are local popup inputs.
- Amazon authentication is verified through Amazon authorize/session probes only.

No tracker-service, Telegram, backend client, admin validation, or outbound observability service is used.

## Contexts

- Popup: saves local settings and notifies the active tab when activation changes.
- Content main: checks Amazon auth, polls Amazon GraphQL, matches jobs, navigates to job detail pages, and starts schedule automation.
- Application content: automates Amazon’s application flow and records local pending attempt traces.
- Service worker: seeds install defaults, syncs active state to tabs, and injects the application automation bundle when needed.

## Booking Flow

1. User configures location scope, job types, and interval in the popup.
2. User activates the extension.
3. Content script verifies Amazon auth; unauthenticated sessions are redirected to Amazon login for manual sign-in.
4. Job search polls Amazon GraphQL using broad UK search and filters locally by job type and location tags.
5. On match, the extension navigates to the job detail/application flow and clicks through Amazon’s native booking steps.
6. Local toasts, sounds, logs, and session/local trace state provide feedback without external delivery.
