# Release Notes

## Local-Only Detach

- Removed all non-Amazon service integrations from active source and build output.
- Removed admin sign-in, backend client selection, runtime validation, notification delivery, and outbound attempt posting.
- Reworked the popup into local settings only: location tags, Any UK location, job type, fetch interval, logs, Activate, and Reset.
- Kept Amazon polling, matching, sounds, toasts, local trace state, and native booking automation.
- Amazon account sign-in is manual on Amazon; the extension no longer stores or prompts for Amazon credentials.
