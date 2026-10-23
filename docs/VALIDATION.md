# Validation

## v0.2.0 preview workflow

Run every README quality command against the reviewed branch. The expanded suite covers company storage from v1/v2, policy discovery/grouping, paragraph evidence, encrypted backups/tampering, stable-link lists, cumulative reversions, snoozing, atomic bulk operations and quota behavior. Chromium uses the actual extension and fixtures; axe scans cover onboarding, forms, popup, dashboards, comparisons, companies, settings and responsive layout. Keyboard assertions cover dialog containment; native permission dialogs, screen readers and OS presentation remain supervised.

The [20-page compatibility sample](COMPATIBILITY.md) uses the production static core in Node, not Chrome, and records one fetch/extraction per URL without retaining bodies. Fifteen pages yielded readable static text; five were rejected/unavailable. This does not certify intended-element extraction, dynamic pages or future reliability. `scripts/compatibility.mjs` reruns it explicitly and contacts those sites from the developer machine; it is not default CI or extension behavior.

The original evidence below is historical. Current run IDs, counts, artifacts and measurements belong in the upgrade handoff and must be checked against the final commit rather than inferred from the older results.

Local type checking, linting, Vitest, production build and package validation are required. The unit suite covers URL/config validation, inert extraction, ambiguous prices, threshold/phrase transitions, exact diffs and policy evidence, baseline preservation, retries, quota errors, notification failures, credential-free bounded networking, IndexedDB retention and transaction behavior. It also verifies that picked text must be reproduced in public HTML and that manual checks preserve a paused schedule.

`tests/browser.mjs` loads the actual built MV3 extension into Chromium with controlled synthetic pages. A temporary test manifest pre-grants one fixture origin. Production code and URL validation are unchanged. The suite exercises worker/popup/dashboard startup, monitor CRUD, scheduling via real Chrome alarm events, baseline/change persistence, notifications API records, missing selections, HTTP errors, redirects, response bounds, exports/imports, selection/cleanup, themes, responsive layout, and full browser restart recovery.

The denied-permission branch is simulated because a required test-manifest host cannot be revoked. Native optional host dialogs and OS notification presentation are not automated. Screenshots contain controlled synthetic policy and product text, not live companies or private user data.

Windows endpoint policy blocked local browser launches in the initial build environment. Browser results must be obtained from the GitHub Actions Chromium job; do not infer a pass from a successful compilation. Machine-readable browser results and screenshot artifacts are uploaded by CI. See the final validation report for actual run status and timing.

## Verified preview build

[Checks run 40015123134](https://github.com/librerob/pagesentinel/actions/runs/40015123134) passed on source commit `53554d54e4956ad6264b442a20bdb05e2817777b`: 54 unit cases, 26 actual Chromium scenarios, strict TypeScript, lint, formatting, dependency audit (zero reported vulnerabilities), production build, package validation, and packaging. Chromium version: `156.0.8078.4` on Linux. The minimum declared Chrome version is 120; that older browser has not been separately exercised.

The browser suite verified restart persistence, recreated alarms, recovered interrupted leases, actual scheduled checks, cookie omission, selector cleanup, and exact DOM reconstruction of both diff source texts. Light, Dark, and true-black AMOLED screenshots and a 390px layout were captured and inspected. See [machine-readable scenarios](browser-validation.json) and [screenshots](screenshots/).

The controlled first monitor took 25ms to create and baseline on the CI fixture. A separate 51,666-byte synthetic HTML fixture with 17,708 extracted characters measured 1.314ms median / 2.974ms p95 extraction and 0.463ms median / 0.629ms p95 comparison over 100 measured iterations after warm-up on that runner. See [benchmark data](benchmark.json). These do not measure public-network latency, idle CPU usage, OS notification visibility, or multi-day reliability.

Before Chrome Web Store submission, supervise these checks in a regular Chrome profile:

1. Native grant, denial, retry and revocation for a chosen test website.
2. Picker startup through real toolbar `activeTab` access without a pre-existing host grant.
3. OS notification presentation and notification-click routing.
4. Sleep/wake and several days of ordinary use against approved public static sites.
5. Accessibility with screen reader and keyboard, including the selector's closed shadow UI.

No external-site compatibility, idle CPU benchmark, or long-running monitoring reliability is inferred from short fixture tests.
