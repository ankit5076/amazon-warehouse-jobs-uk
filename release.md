# Release Notes

## UK 60-Day Access Pass Build

- Kept the extension focused on Amazon polling, matching, sounds, toasts, local trace state, and native booking automation.
- Added tracker-backed Razorpay checkout for the `Rs 6,999` 60-day access pass.
- Added paid-access gates so unpaid users can search and match jobs but cannot navigate into booking or click application/Apply controls.
- Added booking usage audit before final Apply/Accept-style actions; access remains unlimited while active.
- Removed admin sign-in, backend client selection, notification delivery, and outbound attempt posting.
- Reworked the popup around local settings: location tags, Any UK location, job type, fetch interval, access status, checkout, Activate, and Reset.
- Amazon account sign-in stays on Amazon; the extension may prefill the email prompt but does not store an Amazon password or PIN.
