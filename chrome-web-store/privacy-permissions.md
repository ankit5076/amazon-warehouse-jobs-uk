# Privacy And Permissions

## Data Collection Disclosure

```text
The extension reads supported Amazon UK hiring pages to match job listings and continue the booking/application flow only after paid access is active. It may store the Amazon job-search email locally to prefill the Amazon login prompt and validate access with getslotnow.com. The extension does not sell user data, does not call Supabase directly, and does not store an Amazon password, PIN, Razorpay secret, or Supabase secret.
```

## Permission Justification

```text
This extension needs access to Amazon UK hiring pages to detect available warehouse job listings, match the user's selected search criteria, and continue the booking/application flow only after valid paid access is confirmed. Storage is used to save local extension preferences, the remembered Amazon email, and a short-lived access cache. Tabs, scripting, and declarativeContent are used to coordinate the popup with the active Amazon hiring tab and inject booking helpers on supported pages only. The cookies permission is used only to sign out of Amazon Hiring when the extension must return an unauthorized session to the login page.
```

## Host Permission Justification

```text
Amazon UK hiring host permissions are required because the extension operates only on Amazon UK job-search, authentication, and application pages. getslotnow.com is required for paid access validation, Razorpay checkout creation, and booking usage audit.
```

## Paid Feature Disclosure

```text
The extension offers one 60-day access pass for Rs 6,999. Checkout is hosted by Razorpay through the extension usage tracker. Without active access, users can search and detect jobs but cannot proceed into booking/application automation.
```
