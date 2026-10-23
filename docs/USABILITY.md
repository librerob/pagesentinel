# Usability review and participant plan

## Expert review

This is an engineering/expert review of the implemented flows and browser scenarios, not research with human participants. No participant completion rates, measured usability advantage or full accessibility compliance is claimed.

| Task                    | Implemented path and decisions                                                                                                                                         | Evidence / remaining check                                                                                                                            |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| First monitor           | Toolbar → Monitor this page → website grant if needed. The title, text rule and 15-minute schedule have defaults. Dashboard creation asks for a URL and optional name. | Chromium verifies first successful baseline and creation form; native grant UI still needs a human.                                                   |
| Price alert             | Toolbar → Select an element → choose price → Use selection → choose Price changes/condition → Save & verify. Ambiguous prices explain decimal settings.                | Picker and target crossing are tested. A beginner's understanding of selection vs full page remains unmeasured.                                       |
| Privacy Watch           | Toolbar → Privacy Watch → review actual links → choose documents → confirm company/origin access. Dashboard can find links after approving a homepage.                 | Company setup/discovery is exercised through the UI. Heuristic false positives must be reviewed.                                                      |
| Read a policy change    | Privacy Watch → policy timeline → Show the exact change, or document → change history. Source links, dates and prior/new text remain available.                        | Fixture changes show exact retention evidence; side-by-side and all themes are captured.                                                              |
| Fix a missing selector  | Monitor details → Repair selected content → open source → toolbar selection → review replacement → Save & verify.                                                      | Explicit confirmation avoids silently switching to unrelated content. Real layout-repair usability needs observation.                                 |
| Diagnose a missed check | My Monitors → health label → last attempt/success, next expected check and explanation → Check now or Grant access.                                                    | Failures, backoff, overdue and restart recovery have regression scenarios.                                                                            |
| Pause and manage many   | Individual monitor controls, company pause, or contextual bulk disclosure → select monitors → action.                                                                  | Individual pause choices survive company pause/resume; atomic metadata/delete tests cover partial failures.                                           |
| Remove stored data      | Settings → Privacy & website access / Your data → remove grants, export, clear history or Reset all data.                                                              | Labels distinguish history deletion from baseline and full data deletion. Native browser/OS retained notifications and downloaded files are separate. |

The three primary overview actions give beginners an entry point. Advanced selectors/noise controls, company settings, diagnostics and bulk actions are contextual disclosures rather than a global mode switch. The current interface retains existing Material roles, themes and accent preferences. Skippable onboarding explains grants and browser-closed limitations and is persisted once; existing users are not repeatedly onboarded.

Competitor task paths in [research](RESEARCH.md) are documentation-derived, not measured installations. Comparable step counts cannot be asserted without equal starting states, accounts, permissions and versions. PageSentinel's paths above are inspected paths; they do not prove that users find them without assistance.

## Human participant protocol

Recruit 5–8 participants with mixed browser-extension experience, using only synthetic pages and a test Chrome profile. Obtain consent to observe; keep notes locally without browsing history or personal policy interests. Ask participants to think aloud, but do not explain controls until they request assistance.

1. “Monitor this price and notify me when it drops.”
2. “Find this company's privacy and terms documents and begin monitoring them.”
3. Change the fixture from “30 days” to “180 days”: “Show exactly what changed.”
4. Break the fixture selector: “Find out why this monitor stopped working and repair it.”
5. “Pause monitoring for this company, then resume just one individually paused document.”
6. “Export an encrypted backup, then import it into this test profile.”
7. “Remove a website's access and delete all saved monitoring history.”
8. “Explain what happens when Chrome is closed and which data leaves this device.”

For each task record completion/partial/failure, elapsed time, errors, wrong turns, assistance requested and a short comprehension answer. Distinguish spontaneous from assisted completion. Ask participants to identify last attempt vs last success and whether importing history creates trusted live baselines. Do not treat task time alone as understanding.

For a competitive study, repeat equivalent tasks in randomly ordered tools with the same fixtures and permissions. Record unavailable tasks rather than inventing comparable paths. Do not use cloud/service latency as an unlabeled local UI timing comparison.

Separately test keyboard-only navigation, dialog focus/return, screen-reader announcements, 200–400% zoom, reduced motion, high contrast and native permission/notification behavior on supported OS combinations. Automated axe scans and Playwright keyboard assertions cover a subset and do not replace these checks.
