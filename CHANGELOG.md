# Changelog

## Unreleased

- Canonicalize trailing DNS dots before validation and origin grants; reject additional local suffixes and malformed DNS labels, with international-domain and alternate-IP regression tests.

- Keep redirects blocked before destination contact; explain final-page recovery and verify popup/picker setup uses the final tab URL.
- Scope password-field detection to the selected subtree without weakening whole-page or challenge detection.
- Compare text thresholds with the last-alert reference while retaining each previous-to-current history snapshot.
- Add explicit currency codes, neutral `kr` labels and labelled trailing `,-` amounts without guessing missing currencies.
- Migrate IndexedDB to version 2 with separate text records, indexed history metadata and transactional byte accounting. Scheduler/badge reads use lightweight metadata; quota failures roll back text, history and accounting together.

## 0.1.0 — 2026-10-23

Initial preview: local public-HTML monitoring, optional per-origin access, scheduled and manual checks, visible monitor health, visual selection, readable history, policy-passage highlights, price/phrase rules, Material 3 themes, and local data export/configuration import.

Dynamic rendering, screenshots, authenticated checks, and company-wide Privacy Watch groups are deferred.
