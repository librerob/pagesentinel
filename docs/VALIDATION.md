# Validation

Local type checking, linting, Vitest, production build and package validation are required. The initial unit suite contains 50 tests covering URL/config validation, inert extraction, ambiguous prices, threshold/phrase transitions, exact diffs and policy evidence, baseline preservation, retries, quota errors, notification failures, credential-free bounded networking, IndexedDB retention and transaction behavior.

`tests/browser.mjs` loads the actual built MV3 extension into Chromium with controlled synthetic pages. A temporary test manifest pre-grants one fixture origin. Production code and URL validation are unchanged. The suite exercises worker/popup/dashboard startup, monitor CRUD, scheduling via real Chrome alarm events, baseline/change persistence, notifications API records, missing selections, HTTP errors, redirects, response bounds, exports/imports, selection/cleanup, themes, responsive layout, and full browser restart recovery.

The denied-permission branch is simulated because a required test-manifest host cannot be revoked. Native optional host dialogs and OS notification presentation are not automated. Screenshots contain controlled synthetic policy and product text, not live companies or private user data.

Windows endpoint policy blocked local browser launches in the initial build environment. Browser results must be obtained from the GitHub Actions Chromium job; do not infer a pass from a successful compilation. Machine-readable browser results and screenshot artifacts are uploaded by CI. See the final validation report for actual run status and timing.

Before Chrome Web Store submission, supervise these checks in a regular Chrome profile:

1. Native grant, denial, retry and revocation for a chosen test website.
2. Picker startup through real toolbar `activeTab` access without a pre-existing host grant.
3. OS notification presentation and notification-click routing.
4. Sleep/wake and several days of ordinary use against approved public static sites.
5. Accessibility with screen reader and keyboard, including the selector's closed shadow UI.

No external-site compatibility, idle CPU benchmark, or long-running monitoring reliability is inferred from short fixture tests.
