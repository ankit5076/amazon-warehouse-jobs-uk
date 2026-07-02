# Privacy And Permissions

## Data Collection Disclosure

```text
The extension reads supported Amazon UK hiring pages to match job listings and continue the booking/application flow. It may store the Amazon job-search email locally to prefill the Amazon login prompt. The extension does not sell user data, does not call a payment backend, and does not store an Amazon password or PIN.
```

## Permission Justification

```text
This extension needs access to Amazon UK hiring pages to detect available warehouse job listings, match the user's selected search criteria, and continue the booking/application flow. Storage is used to save local extension preferences and the remembered Amazon email. Tabs, scripting, and declarativeContent are used to coordinate the popup with the active Amazon hiring tab and inject booking helpers on supported pages only. The cookies permission is used only to sign out of Amazon Hiring when the extension must return an unauthorized session to the login page.
```

## Host Permission Justification

```text
Amazon UK hiring host permissions are required because the extension operates only on Amazon UK job-search, authentication, and application pages.
```

## Paid Feature Disclosure

```text
This build does not include paid access or checkout. Payment integration is planned for a later tracker-service-backed release.
```
