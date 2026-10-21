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
- Cloudflare Workers + D1 + Durable Objects — primary backend, realtime WebSocket
- PocketBase 0.40 (MIT) — legacy fallback under `backend/`
- Build/analysis tools used locally (jadx, apktool) — not tracked in git history

---

## Backend & authentication
The rebuild targets the **Cloudflare Worker** in [`worker/`](worker/README.md) for
accounts, conversations, messages, reactions, read receipts, and realtime events.
D1 stores durable data; one UserHub Durable Object per signed-in user carries
WebSocket events. Native tokens are stored in SecureStore and the web build uses
localStorage-backed storage.

Email/password auth and session restore are implemented, and the Worker is
**deployed and running** at

```
https://open-services-api.snorlaxking310.workers.dev
```

Point the app at it with `EXPO_PUBLIC_API_URL=https://open-services-api.snorlaxking310.workers.dev`.
Setup, redeploy steps, and the seeded demo accounts are documented in
[`worker/README.md`](worker/README.md).

The original **PocketBase** backend remains under
[`backend/`](backend/README.md) as a reference and rollback path; the client no
longer imports the PocketBase SDK or SSE polyfill.

Planning Center OAuth linking is deferred until client credentials and a registered
callback are available. The migration design, schema, routes, and protocol live in
[`docs/cloudflare-migration.md`](docs/cloudflare-migration.md).

---

## Repository layout (high level)
- `src/` — application source (React & TypeScript), backend client adapter, and local preferences
- `worker/` — Cloudflare Worker API, D1 migrations, UserHub Durable Object, and seed
- `backend/` — legacy PocketBase setup, migrations, hooks, and demo seed
- `docs/` — migration design and architecture notes
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

Start the local Cloudflare Worker backend:

```bash
cp worker/.dev.vars.example worker/.dev.vars
# edit the two local secrets, then:
npm run worker:migrate:local
npm run worker:dev
```

The Worker listens on `http://127.0.0.1:8787`. If that port is taken, pick another
with `npx wrangler dev -c worker/wrangler.toml --port 8788` and set
`EXPO_PUBLIC_API_URL` accordingly.

In a second terminal, seed the demo workspace:

```bash
npm run worker:seed
```

Demo accounts (password `openservices`): `marcos@example.com`,
`sarah@example.com`, `michael@example.com`.

Then start the app. During development the app auto-detects the Expo dev
server's LAN host on port `8787`, so no URL is normally needed:

```bash
npm run web     # or: npm start, then press i / a
```

To override the API URL, set it explicitly:

```bash
EXPO_PUBLIC_API_URL=http://192.168.1.50:8787 npm run web
```

`EXPO_PUBLIC_POCKETBASE_URL` is accepted as a legacy alias, but new builds should
use `EXPO_PUBLIC_API_URL`. The sign-in screen shows the URL the app resolved. For
the Android emulator the fallback is `http://10.0.2.2:8787`; for a physical device
use your computer's LAN address (and make sure both are on the same network).
Release builds must set `EXPO_PUBLIC_API_URL` at build time.

Type-check both the app and the Worker:

```bash
npm run typecheck
npm run typecheck:worker
```

### Legacy PocketBase fallback

The old PocketBase backend still runs on port 8090:

```bash
cd backend
./setup.sh
./start.sh
```

It is useful as a reference or rollback path, but the current client adapter talks
to the Worker API. See [`backend/README.md`](backend/README.md) for the old setup,
schema, and production notes.

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