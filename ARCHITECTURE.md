# Architecture

## Runtime Model

The extension stores popup settings in Chrome local storage and drives booking automation locally:

- `ACTIVE` starts or stops polling and booking automation.
- Location scope is either explicit city tags or Any UK location.
- Job types and fetch interval are local popup inputs.
- Amazon authentication is verified through Amazon authorize/session probes only.
- Paid access is checked through the extension usage tracker before any booking/application forward motion.

No Supabase, Razorpay, Telegram, admin validation, or outbound observability secrets live in the extension. The extension only calls the tracker service for access checks, Razorpay checkout creation, and booking usage audit.

## Contexts

- Popup: saves local settings, shows 60-day access status, opens tracker-backed Razorpay checkout, and notifies the active tab when activation changes.
- Content main: checks Amazon auth, polls Amazon GraphQL, matches jobs, blocks unpaid booking navigation, and starts schedule automation only with active access.
- Application content: blocks unpaid native application clicks, automates Amazon’s application flow with active access, and records usage before final booking actions.
- Service worker: seeds install defaults, syncs active state to tabs, and injects the application automation bundle when needed.

## Booking Flow

1. User configures location scope, job types, and interval in the popup.
2. User activates the extension.
3. Content script verifies Amazon auth; unauthenticated sessions are redirected to Amazon login for manual sign-in.
4. Job search polls Amazon GraphQL using broad UK search and filters locally by job type and location tags.
5. On match, unpaid users see the access prompt and stay in search; paid users can navigate to the job detail/application flow.
6. Before Apply/Accept-style final actions, the extension records `/license/usage`; access is unlimited, so this is audit only.
7. Local toasts, sounds, logs, and session/local trace state provide feedback without outbound booking observability delivery.
