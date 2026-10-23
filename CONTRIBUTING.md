# Contributing

Use Node.js 24. Install with `npm ci --ignore-scripts`. Run type checking, lint, formatting, unit tests, build, package validation and browser tests using the commands in the README.

Use controlled synthetic fixtures for bug reports and tests. Never attach a personal Chrome profile, private policy snapshot, sign-in cookie, or secret URL. Explain the observed behavior, expected behavior and browser version.

Keep permissions minimal, dependencies bundled, and failure states visible. A failed fetch must never replace a good baseline. New monitor types need parsing, transition, and failure tests. New UI needs screenshots in Light, Dark and AMOLED and a narrow-viewport check. Update privacy documentation whenever data access or network behavior changes.

Code contributions are licensed under GPL-3.0-or-later. Fonts and dependencies retain their documented upstream licenses. There is no contributor license agreement.
