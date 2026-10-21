# openPlanning — Community Contribution

> An experimental, hobby project demonstrating AI-enabled features for a planning app in the same space as the proprietary "Planning Center." Open to contributors.

## Overview
openPlanning is a small, community-driven project that explores how AI can assist in team and event planning workflows (targeted at church/team organisers). The project is educational and experimental — not affiliated with any commercial product. It demonstrates automation, reverse-engineering workflows, and integrations using React Native + Expo plus supporting tooling.

This repository intentionally avoids shipping large generated binaries in Git history; see "Repository artifacts & history" below for details.

---

## Project goals
- Explore AI-assisted features for planning and team coordination.
- Provide a lightweight, open-source demo that others can read, run, and extend.
- Offer a playground for automation, experimentation, and small contributions.

---

## Key technologies
- JavaScript / TypeScript
- React + React Native (Expo)
- Expo SDK (project scripts in package.json)
- PocketBase 0.40 (MIT) — SQLite, email/password auth, REST API, realtime SSE
- Build/analysis tools used locally (jadx, apktool) — not tracked in git history

---

## Backend & authentication
The rebuild talks to a local, self-hostable **PocketBase** instance for accounts,
conversations, and messages. Email/password auth is implemented now; native tokens
are stored in SecureStore and the web build uses localStorage-backed storage.
Messages and conversation summaries sync over realtime SSE, and message history is
searchable through the API.

Planning Center OAuth linking is deferred until client credentials and a registered
callback are available. The access rules, schema, seed data, and deployment notes
live in [`backend/README.md`](backend/README.md).

---

## Repository layout (high level)
- `src/` — application source (React & TypeScript), PocketBase client, and local preferences
- `backend/` — PocketBase server setup, migrations, hooks, and demo seed
- `.expo/`, `android/`, `ios/` — platform metadata (when present)
- `tools/` — helper tools (large jars were removed from history; download as needed)
- `apk/`, `apktool_out/`, `extracted/`, `decompiled/`, `analysis/` — generated/reverse-engineering artifacts (archived locally, not tracked)

---

## Getting started (developer quickstart)
Prerequisites (recommended):
- Node.js (LTS)
- npm or yarn
- Optional: expo-cli for running on devices/simulators

Install dependencies:

```bash
npm install
# or
# yarn install
```

Start the local backend (first run downloads the PocketBase binary):

```bash
cd backend
./setup.sh
./start.sh
```

In a second terminal, seed the demo workspace:

```bash
cd backend
node seed.mjs
```

Demo accounts (password `openservices`): `marcos@example.com`,
`sarah@example.com`, `michael@example.com`. The local admin dashboard is at
`http://127.0.0.1:8090/_/` (`admin@openservices.local` / `devpassword` — dev only).
See [`backend/README.md`](backend/README.md) for details and production notes.

Then start the app with the backend URL (copy `.env.example` to `.env` if you
prefer):

```bash
EXPO_PUBLIC_POCKETBASE_URL=http://127.0.0.1:8090 npm run web
```

For the Android emulator use `http://10.0.2.2:8090`; for a physical device use
your computer's LAN address.

Type-check the source:

```bash
npm run typecheck
```

Start the Expo dev server:

```bash
npm start
```

Run on Android (requires Android SDK):

```bash
npm run android
```

Run on iOS (macOS + Xcode):

```bash
npm run ios
```

---

## Repository artifacts & history (important)
To keep the GitHub repository usable, large generated artifacts were removed from the repository history. This project previously contained APKs, decompiled outputs, and large tool jars that exceeded GitHub's file-size limits.

What was removed from history and current commits:
- `apk/`, `apktool_out/`, `extracted/`, `decompiled/`, `analysis/`
- Large jars under `tools/` (e.g. `tools/jadx/lib/jadx-1.5.1-all.jar`, `tools/apktool.jar`)

What we did instead:
1. Created a local tarball backup of the removed artifacts and left it on disk (not tracked in git):
   - `backup_artifacts_20261020_150209.tar.gz` (also copied to `/home/marcos/backup_artifacts_20261020_150209.tar.gz`)
2. Rewrote the git history to remove the large blobs and force-pushed the cleaned history to `origin/master` so GitHub accepts pushes.
3. Preserved a remote backup branch (created before the rewrite): `backup-before-history-clean-20261020_150209`.

Restore local artifacts from the tarball:

```bash
# from the repository root
tar -xzf backup_artifacts_20261020_150209.tar.gz
```

Access the original (uncleaned) history if necessary:

```bash
# fetch then checkout the backup branch (it contains large blobs)
git fetch origin backup-before-history-clean-20261020_150209
git checkout -b original-history origin/backup-before-history-clean-20261020_150209
```

**WARNING:** that backup branch contains very large blobs and may be inconvenient to work with on GitHub.

---

## Why this approach
GitHub blocks files larger than 100 MB and keeping these artifacts in history prevents pushing and collaboration. Removing large blobs from history keeps the repository small and practical while preserving local access to the artifacts for reverse engineering.

If you want to keep large binaries associated with the project long-term, recommended options:
- Use Git LFS and migrate large binaries into LFS (requires history rewrite and collaborators to use Git LFS).
- Host binary artifacts in a separate archive repository or object storage (S3/GCS) and reference them from here.

---

## Collaboration notes (after history rewrite)
If you cloned this repository before the cleanup, the simplest way to continue is to re-clone:

```bash
# safe, recommended
git clone https://github.com/CaluseruMarcos/openPlanning.git
```

If you must update an existing clone (and have no local uncommitted work):

```bash
git fetch origin
git checkout master
git reset --hard origin/master
git clean -fdx
```

If you have local changes to keep, create patches or branch them before resetting:

```bash
git branch save-local-changes
git format-patch origin/master --stdout > my-changes.patch
# or stash/commit to a new branch, then reapply after re-cloning
```

---

## Contributing
This is a hobby, community project. Contributions are welcome:
- Open issues to discuss bugs or features
- Send focused pull requests (small, incremental changes are easiest to review)
- Please avoid committing large binary artifacts to the main history

If you want the artifacts publicly available for contributors, we can:
- Add them to a GitHub release as binary assets, or
- Move them to a separate archival repo or cloud storage and link from this README

---

## License & disclaimer
- This project is not affiliated with Planning Center. It is an independent hobby/demo project for learning and contribution.
- Use and contribution are at your own risk; check third-party licenses for any bundled tools or binaries you use locally.

---

## Need help?
If you want me to:
- Upload the artifacts to a GitHub release or to a separate archival repo
- Convert large binaries to Git LFS and migrate history
- Add CONTRIBUTING.md or CODE_OF_CONDUCT.md

Tell me which option and I will run the steps.

Thanks for your interest — contributions and discussion are welcome.