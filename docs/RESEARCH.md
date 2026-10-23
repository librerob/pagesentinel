# Focused research — 2026-10-23

These are public-documentation findings, not hands-on competitor reliability measurements. Pricing can change.

| Product                                                                                                                   | Documented model and relevant capabilities                                                                                                                              | Implication                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| [Distill](https://distill.io/pricing/)                                                                                    | Local and cloud checks; free tier lists 25 monitors including 5 cloud, with paid plans from $15/month. Conditions, macros and version history are established features. | Local checks and element selection alone are not novel.                                              |
| [Visualping](https://visualping.io/pricing?plan=free)                                                                     | Cloud plans list visual, text and element changes. Its free tier lists 5 pages and 150 monthly checks; paid personal plans start at $14/month.                          | Avoid competing on cloud rendering breadth in the first extension release.                           |
| [SiteDelta Watch](https://sitedelta.schierla.de/)                                                                         | Periodic browser checks, text-change highlighting, and watched/ignored regions.                                                                                         | Simple local monitoring already has capable alternatives.                                            |
| [WebSentinel](https://github.com/Leonard013/WebSentinel)                                                                  | Open-source local checks, sensitivity settings, highlighted/side-by-side diffs and JSON backup. Its documentation also describes browser-sync page lists.               | Local ownership and diffs are established; distinguish explicit permission and failure UX.           |
| [PagePulse Sentinel](https://addons.mozilla.org/en-US/firefox/addon/pagepulse-sentinel/)                                  | Firefox extension describes scheduled fetching, normalized text/hash comparison, pause and notifications; listing requests all-site access.                             | Avoid broad mandatory host access in our architecture.                                               |
| [Page Pulse](https://pagepulse.dev/chrome-extension/)                                                                     | Account-based extension into a cloud SEO/change-analysis product.                                                                                                       | A different audience and data model; do not conflate similarly named products.                       |
| [PageSentry](https://chromewebstore.google.com/detail/pagesentry-%E2%80%94-ai-web-monit/hikhbibahdcomgbgapmjecikejmfkmpl) | Local browser processing and on-device AI claims, a free 5-monitor tier and Pro sign-in.                                                                                | Privacy-focused local monitoring is not unique. No AI or account is necessary for our first release. |
| [changedetection.io](https://github.com/dgtlmoon/changedetection.io)                                                      | Open-source self-hostable service, CSS selection, notification integrations and optional browser-based checks.                                                          | More capable automation exists; extension simplicity can reduce setup burden.                        |

The chosen product hypothesis is that clear health, first-check verification, narrow host grants, readable policy evidence and a restrained UI form a useful combination. Demand, usability superiority and reliability relative to alternatives have not been established by this research.

## Naming

[pagesentinel.com](https://pagesentinel.com/) already markets commercial website change monitoring, including policy/pricing changes and historical evidence. This is a direct naming conflict regardless of trademark registration. PageSentinel remains a working title in `librerob/pagesentinel` and is not ready for a final store listing.

Focused indexed searches for `PageSentinel` on GitHub and the Chrome Web Store did not establish a unique available name. Search absence is not clearance. Similar names include WebSentinel, PageSentry and PagePulse; avoid claiming first use or ownership.

The [UK IPO search entry point](https://www.gov.uk/search-for-trademark) was inspected. [WIPO Global Brand Database](https://branddb.wipo.int/) presented a verification challenge, so a registry-level clearance search was not completed. No trademark-availability conclusion is made. A jurisdiction/class-specific naming review is still required before final branding.

## Chrome API decisions

- [Alarms](https://developer.chrome.com/docs/extensions/reference/api/alarms): persist schedules and recreate missing alarms. Chrome 120 supports a 30-second minimum, but this product uses at least one-minute custom intervals and a 15-minute default. Delays and sleep are disclosed.
- [ActiveTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab) and [scripting](https://developer.chrome.com/docs/extensions/reference/api/scripting): temporary user-initiated selection, not background broad-site access.
- [Permissions](https://developer.chrome.com/docs/extensions/reference/api/permissions): optional origin-specific grants requested in a direct user gesture. Revocation pauses monitors.
- [Cross-origin requests](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests): fetch from the worker only with host permission, without credentials, and with redirects rejected.
- [Offscreen](https://developer.chrome.com/docs/extensions/reference/api/offscreen): service workers have no DOM parser. A bundled inert parser is used instead; no offscreen permission or hidden tabs are necessary for static HTML.
- [Notifications](https://developer.chrome.com/docs/extensions/reference/api/notifications) and [storage](https://developer.chrome.com/docs/extensions/reference/api/storage): native local notifications and small local preferences. History uses IndexedDB.

No universal dynamic-page, real-time, signed-in-session, uptime, or legal-risk claims are made.
