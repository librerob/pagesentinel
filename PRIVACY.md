# Privacy

PageSentinel v0.1.0 stores monitor URLs, names, rules, successful text snapshots, check status, and settings on your device. IndexedDB holds monitor state and history. Chrome local storage holds preferences; session storage briefly holds element selections. Chrome sync is not used.

There are no accounts, advertisements, analytics, telemetry, remote configuration, developer-controlled API, or external AI service. All executable code, icons, and fonts ship inside the extension.

Checks necessarily contact the websites you choose. Those sites can see your network address, requested URL including query parameters, and ordinary request metadata. Fetch uses `credentials: omit`, `referrerPolicy: no-referrer`, and rejects redirects. We do not collect passwords, copy cookies, or use browser history. A URL or title you enter may itself contain private information; avoid monitoring secret-bearing URLs.

The visual selector reads text and structure only after you activate it. It uses temporary `activeTab` access or an existing optional origin grant. Scheduled checks require persistent optional host access to the selected origin. Revoking access pauses affected monitors. Browser host grants apply across paths on that origin, although checks only request saved URLs. Chrome host permission matching does not isolate individual ports.

Permissions used:

| Permission                | Purpose                                                 |
| ------------------------- | ------------------------------------------------------- |
| `alarms`                  | Wake the scheduler while Chrome is active               |
| `storage`                 | Save appearance, retention and notification preferences |
| `notifications`           | Request native change and first-failure alerts          |
| `activeTab`               | Inspect the current page after a toolbar interaction    |
| `scripting`               | Temporarily inject the visual selector                  |
| optional HTTP/HTTPS hosts | Fetch user-approved pages on a schedule                 |

History and exported backups are plain text; the extension does not encrypt them. Device users or malware with access to your Chrome profile may read them. Browser/OS backups may include the profile. Clearing history preserves the current baseline. Deleting a monitor removes its baseline and history. Reset all data removes monitor data and preferences and attempts to release optional website grants. Uninstalling normally removes extension storage.

Notifications contain the monitor name and, for prices, previous/current prices. Other alerts do not include page paragraphs or URL query strings. Your OS may retain notifications after extension data is deleted. Source links you open navigate directly to the selected website. About-page GitHub links open only when clicked.

Security reports: use the repository's private vulnerability reporting when available. Do not include real monitored page contents or secrets in public issues.
