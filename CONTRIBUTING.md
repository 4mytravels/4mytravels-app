# Contributing to 4MyTravels

Thanks for your interest in 4MyTravels — a privacy-first, open-source travel
expense tracker.

## Important: sole authorship

4MyTravels is a **sole-authorship** project (MVP Scope §3, "Contributions"). To
keep every future licensing/distribution option open, **no external code pull
requests are accepted**. This is a deliberate, permanent policy — not a temporary
one.

What is warmly welcomed:

- **Bug reports** — open an issue with repro steps, expected vs. actual behavior.
- **Feature requests** — open an issue describing the use case.
- **Security reports** — please open a private/security issue or contact the
  maintainer directly; do not post vulnerabilities in public issues.

What is not accepted:

- Code pull requests from outside contributors.
- "Fix" PRs — please report the bug as an issue instead; the maintainer
  implements the fix.

> Note: a DCO (signed-off commits) alone is insufficient for relicensing; it
> proves provenance only. If real external-contribution demand emerges, the
> policy may be revisited via a CLA or a GPLv3 §7 additional permission — but
> that is a future decision, not the current state.

## Language

All communication and code in this repository is in **English** — code, comments,
documentation, commit messages, and issue discussions. This keeps the project
accessible to an international community.

## How to run the project locally

1. **Clone** the repository:
   ```bash
   git clone https://github.com/<org>/4mytravels-app.git
   cd 4mytravels-app
   ```
2. **Install dependencies:**
   ```bash
   npm install
   ```
3. **Start the dev server:**
   ```bash
   npx expo start
   ```
   Press `a` for the Android emulator, `w` for the web/PWA target. Note:
   `op-sqlite` + SQLCipher is a native module, so a custom dev client / EAS Build
   is required for the Android target (plain Expo Go will not work).

## Code style

- TypeScript throughout; follow the existing structure under `src/` (see the
  README project-structure section).
- Keep user-facing strings and in-code comments in English.
- Respect the privacy-first, offline-first principles of the project (see the MVP
  scope):
  - No analytics/tracking SDKs tied to third parties.
  - No Google Play Services / FCM dependencies.
  - PWA must ship with a strict CSP and **zero third-party JavaScript**.
  - All local data is encrypted; geodata is stripped from photos before storage.

## License

By contributing (issues, reports, discussions) you acknowledge the project is
licensed under the **GPL-3.0** (client app). The sync/backup backend is
proprietary and closed source.

## Code of Conduct

Be respectful and constructive. This project follows the
[Contributor Covenant](https://www.contributor-covenant.org/) (v2.1).
