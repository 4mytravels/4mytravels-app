# Contributing to 4MyTravels

Thanks for your interest in contributing! 4MyTravels is an open-source,
privacy-first travel app.

## Language

All communication and code in this repository is in **English** — code, comments,
documentation, commit messages, and issue/PR discussions. This keeps the project
accessible to an international community.

## How to contribute

1. **Fork** the repository to your own GitHub account.
2. **Clone** your fork:
   ```bash
   git clone git@github.com:<your-username>/4mytravels-app.git
   cd 4mytravels-app
   ```
3. **Create a branch** for your change:
   ```bash
   git checkout -b feat/short-description
   # or fix/short-description
   ```
4. **Install dependencies** and verify the app runs:
   ```bash
   npm install
   npx expo start
   ```
5. **Commit** with a clear, English message (imperative mood, e.g.
   `Add trip budget progress indicator`).
6. **Push** to your fork and open a **Pull Request** against `main`.

## Code style

- TypeScript throughout; follow the existing structure under `app/`, `components/`, etc.
- Keep user-facing strings and in-code comments in English.
- Respect the privacy-first, offline-first principles of the project (see the
  MVP scope). No analytics/tracking SDKs tied to third parties.

## License

By contributing, you agree that your contributions are licensed under the
**GPL-3.0** (same as the project).

## Code of Conduct

Be respectful and constructive. This project follows the
[Contributor Covenant](https://www.contributor-covenant.org/) (v2.1).
