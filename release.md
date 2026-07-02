# Release Notes

## Booking Test Build

- Kept the extension focused on Amazon polling, matching, sounds, toasts, local trace state, and native booking automation.
- Removed paid-access backend integration, hosted checkout, and booking gates for end-to-end booking-flow testing.
- Removed admin sign-in, backend client selection, notification delivery, and outbound attempt posting.
- Reworked the popup around local settings: location tags, Any UK location, job type, fetch interval, logs, Activate, and Reset.
- Amazon account sign-in stays on Amazon; the extension may prefill the email prompt but does not store an Amazon password or PIN.
