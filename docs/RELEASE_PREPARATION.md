# v0.2.0 preview preparation

All five upgrade pull requests were merged into main at the owner's request. The [v0.2.0 preview](https://github.com/librerob/pagesentinel/releases/tag/v0.2.0) was published from commit `209a5d4df30f2129694754430878c08ef7881753` after the complete [release workflow](https://github.com/librerob/pagesentinel/actions/runs/40042888171) passed, including Chromium checks. The existing v0.1.0 release/tag remains unchanged. No Chrome Web Store submission was made; preview publication does not establish production readiness.

## Installable package

Build and validate with the README commands. `npm run package` reads the built manifest version and writes `artifacts/pagesentinel-0.2.0.zip` plus SHA256SUMS. The ZIP root contains manifest.json, the worker, picker, UI assets, original icons, bundled fonts and notices. It contains no source maps, tests, backups or real monitoring data. Use a successful final CI artifact or the matching locally verified package, not an old release ZIP mislabeled as the upgrade.

Back up an existing profile before upgrading. Load/update the same unpacked extension ID/profile to exercise data preservation. v1 data undergoes the existing text/accounting migration and v2 data gains an empty company store transactionally. A separate extension ID has separate storage.

## Store-ready copy, pending human review

Suggested short description: “Monitor public webpages locally, follow company policies, and see exactly what changed.”

Describe static HTML monitoring, optional per-origin grants, local history/health, policy grouping, price/availability/list rules and optional encrypted backup files. Explain that Chrome must be running, redirects are blocked, authenticated/JavaScript-only pages and screenshots are unsupported, and OS notification display is not guaranteed. Do not market the upgrade as an AI, cloud or universal compatibility product.

Privacy-policy source: [PRIVACY.md](https://github.com/librerob/pagesentinel/blob/main/PRIVACY.md). The main-branch version will reflect the upgrade only after the relevant documentation PR is merged. Verify the final public policy URL and listing against the approved build before submission. Do not claim that ordinary profile storage is encrypted.

Use genuine fixture screenshots produced by the final browser run: overview/onboarding, monitors/health, Privacy Watch, retention evidence, side-by-side policy history, settings and light/dark/AMOLED. Screenshots use synthetic companies and public-content examples. The working name remains provisional and may conflict with an existing service; naming clearance and any rename require the owner's decision.

## Supervised release checks still required

- Native permission grant/deny/revoke dialogs on the intended Chrome/OS versions.
- OS notification appearance, click routing and disabled-notification behavior.
- Screen-reader, zoom/high-contrast and keyboard review beyond automated assertions.
- Upgrade rehearsal with a real backed-up profile and matching extension identity.
- Participant usability study and ongoing daily-use reliability.
- Final store metadata, privacy disclosures, publisher details, naming and screenshots.

The manual GitHub release workflow requires explicit publication input on main and is separate from PR validation. No Chrome Web Store publication is automated. Do not submit to the store without explicit owner approval.
