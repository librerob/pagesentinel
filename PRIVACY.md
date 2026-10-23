# Privacy

PageSentinel v0.2.0 preview stores monitor URLs, names, rules, successful text snapshots, check status, company profiles and document labels on your device. IndexedDB holds monitor state, baselines/references, companies and history. Chrome local storage holds preferences and onboarding completion. Session storage temporarily holds selection, repair and discovered-link context, removed when consumed, reset, or the browser session ends; unused context may remain for the session. Chrome sync is not used.

There are no accounts, advertisements, analytics, telemetry, remote configuration, developer-controlled API, or external AI service. All executable code, icons, and fonts ship inside the extension.

Checks necessarily contact the websites you choose. Those sites can see your network address, requested URL including query parameters, and ordinary request metadata. Fetch uses `credentials: omit`, `referrerPolicy: no-referrer`, and rejects redirects. We do not collect passwords, copy cookies, or use browser history. A URL or title you enter may itself contain private information; avoid monitoring secret-bearing URLs.

The visual selector and toolbar policy-link reader inspect the current page only after you activate them. They use temporary `activeTab` access or an existing origin grant. Toolbar discovery reads existing links and does not fetch candidates. Dashboard discovery uses a separately approved, bounded homepage fetch. Users review candidates and grant each selected origin before documents are saved. Scheduled checks require persistent optional access. Revoking access pauses affected monitors and preserves history. Grants apply across paths and do not isolate individual ports. Opening a source or candidate link navigates normally, with ordinary website cookies/scripts outside the static monitoring pipeline.

Permissions used:

| Permission                | Purpose                                                 |
| ------------------------- | ------------------------------------------------------- |
| `alarms`                  | Wake the scheduler while Chrome is active               |
| `storage`                 | Save appearance, retention and notification preferences |
| `notifications`           | Request native change and first-failure alerts          |
| `activeTab`               | Inspect the current page after a toolbar interaction    |
| `scripting`               | Temporary visual selector and policy-link reader        |
| optional HTTP/HTTPS hosts | Fetch user-approved pages on a schedule                 |

Normal history and local extension storage are plaintext. Device users or malware with access to your Chrome profile may read them; OS/browser backups may include the profile. Optional backup files use authenticated AES-256-GCM encryption with PBKDF2-SHA-256 passphrase-derived keys. Passphrases/keys are never persisted. UI input is cleared after successful operations or when the form is destroyed; immediate erasure of all JavaScript memory copies cannot be guaranteed. Plain JSON export remains available after a warning. Both backup types contain URLs and recorded text. Lost passphrases cannot be recovered.

Import creates fresh paused monitor/company configurations and does not trust archival text as a live baseline; current settings remain unchanged. Clear history preserves the current baseline/reference. Delete monitor removes its baseline and history. Remove company preserves its documents as independent monitors. Reset all data removes monitors, companies, history, preferences and session context and attempts to release optional grants. Uninstalling normally removes extension storage. Downloaded backups remain wherever you saved them and must be deleted separately. See [backup details](docs/BACKUPS_AND_MONITORING.md).

Notifications contain the monitor name and, for prices, previous/current prices. Other alerts do not include page paragraphs or URL query strings. Your OS may retain notifications after extension data is deleted. Source links you open navigate directly to the selected website. About-page GitHub links open only when clicked.

Security reports: use the repository's private vulnerability reporting when available. Do not include real monitored page contents or secrets in public issues.
