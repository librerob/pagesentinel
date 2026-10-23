# Security

## Trust boundaries

Fetched HTML is parsed as inert data in the service worker using bundled `htmlparser2`, `css-select`, and `domutils`. No DOM document is loaded from a monitored origin and no page scripts execute in the extension. Embedded scripts/styles/frames and hidden attributes are discarded before extraction. React renders diffs as text nodes; no fetched HTML is inserted into the extension DOM. The extension CSP restricts scripts to its own package.

Only exact extension UI URLs may send management messages. Content-script selections must originate in the top frame and use Chrome-supplied sender metadata; the page cannot choose a management URL. Selection messages cannot create or modify monitors directly. There is no externally connectable API. Chrome local storage is restricted to trusted extension contexts.

Each URL is validated before fetching, configuration storage, permission requests, and script injection. Only HTTP/HTTPS public-domain URLs without embedded credentials are accepted. IP literals and local/single-label domains are rejected. Fragments are removed. Every redirect is rejected, including same-origin redirects; users must save the final destination. Credentials and referrers are omitted. HTML response streams, extraction size, comparison time, retention, imports, and storage accounting are bounded.

DNS resolution happens in Chrome. The extension cannot inspect or pin DNS results, so a public-looking hostname that resolves to a private address or changes its DNS record is a residual risk. The public-domain validator is not a DNS-rebinding defense. Monitor only trusted public websites. No advanced private-network mode is provided.

Page access denial, empty extraction, missing/non-unique selection, HTTP failures, CAPTCHA/sign-in signals, invalid content type, and size limits produce errors. Deterministic challenge detection is conservative, not universal: an ordinary HTTP 200 error page without recognizable signals may still look like content. Select a specific stable section and inspect changed text. CSS visibility cannot be reproduced by the inert parser.

## Persistence

One serialized worker queue protects commands and checks. A persisted 45-second lease records in-flight work. The scheduler recovers expired leases and recreates a missing alarm on worker startup. The event and successful baseline commit in one IndexedDB transaction. A failed commit retains the previous baseline. A notification is requested after the transaction commits, preventing duplicate alerts for an already saved version. Worker termination between commit and notification may lose a notification; the unread event remains.

The extension maintains a 50 MiB logical UTF-8 data budget. Browser storage accounting and available disk space can differ. IndexedDB quota errors are surfaced; they are not reported as unchanged results. A storage-open failure can prevent detailed health records; the toolbar badge and UI then report an error.

Imports are at most 10 MiB and 500 configurations, validated completely before a single transaction adds new paused monitors. Only explicit fields are copied. Imported IDs, baselines, history, counters and prototypes are never trusted. Backups retain historical text for archival inspection; it is not reactivated by import.

## Reporting

Report vulnerabilities through [GitHub private vulnerability reporting](https://github.com/librerob/pagesentinel/security/advisories/new) when available. If disabled, open a minimal public issue asking for a private contact without including exploit details, sensitive URLs or page content. There is no guaranteed response SLA. v0.1.0 is a preview and needs supervised permission/notification checks before Web Store submission.
