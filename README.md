openPlanning — community contribution

This repository contains an experimental, hobby project that explores AI-enabled features for a team/organization planning app similar in spirit to the proprietary "Planning Center". The goal is to contribute to the open source ecosystem: demonstrate automation and AI workflows, and invite others to read, test, and contribute.

Short project purpose
- A hobby/open-source effort to expose AI capabilities in workflows for church/team planning.
- Not affiliated with Planning Center; intended as an educational/demo contribution.
- Contributions welcome: issues, PRs, and discussions.

Primary technologies and tools used
- JavaScript / TypeScript (TypeScript config in tsconfig.json)
- React + React Native (react, react-native)
- Expo (expo SDK and scripts)
- PocketBase (pocketbase client used in code)
- Expo modules: expo-secure-store, expo-status-bar, react-native-safe-area-context, react-native-web
- Build / analysis tooling used previously but not tracked in history: jadx, apktool (jar binaries were present but removed from git history)

How the repo is organized (high level)
- src/ — application source (React / TypeScript files)
- android/, ios/ or .expo/ — platform-specific metadata (if present)
- backend/ — (if present) backend or server-side code
- tools/ — helper tools (jar binaries were here; large tool jars were removed from history and should be downloaded as needed)
- apk/, apktool_out/, extracted/, decompiled/, analysis/ — generated artifacts and reverse-engineering outputs (archived locally and removed from git history to keep the repo pushable)

Why large files were removed from history
- GitHub rejects files larger than 100 MB. The repo contained large jars and APKs that prevented pushing.
- To keep the repo usable for contributors the large artifacts were removed from the repository history while keeping local backups and a remote backup branch.

Where to find the archived artifacts locally
- A tarball was created with the removed artifacts and left in the repo root:
  ./backup_artifacts_20261020_150209.tar.gz
  (If you need only particular artifacts you can extract and copy them out of that tarball.)

How to restore archived artifacts locally
- From the repository root:
  tar -xzf backup_artifacts_20261020_150209.tar.gz
- This will recreate the apk/, apktool_out/, extracted/, decompiled/, analysis/, and tools/ folders in your working tree.

Remote backup branch (original history)
- Before rewriting history, a remote backup branch containing the original commits was pushed:
  origin/backup-before-history-clean-20261020_150209
- That branch contains the original large blobs. Use it only if you need a full copy of the repository history. Note: it may still contain large files that GitHub's web UI won't show or download easily.

Setup / developer quickstart
Prerequisites (recommended)
- Node.js (LTS, tested with recent Node 18+ / 20+)
- npm (bundled with Node) or yarn
- expo-cli (optional, for running expo commands): npm install -g expo-cli
- Java / Android SDK (if you plan to run android builds via expo run:android)

Common commands
- Install dependencies:
  npm install

- Type-check the TypeScript source:
  npm run typecheck

- Start the Expo development server (web + device tunneling):
  npm start

- Run on Android device/emulator (requires Android toolchain):
  npm run android   # runs `expo run:android`

- Run on iOS simulator (macOS + Xcode required):
  npm run ios       # runs `expo run:ios`

Notes about node_modules
- node_modules/ is intentionally not tracked (should be in .gitignore). Do not commit it — run npm install locally or in CI.

If you need the large files in the repository long-term
- Use Git LFS for large binaries and run `git lfs migrate import` to move large blobs to LFS (this still rewrites history).
- Or store binary artifacts (APKs, tool jars) in a separate archival repo or object storage (S3, GCS) and link from this repository.

Contributor guidance and collaboration notes
- After the history rewrite the remote master was force-updated. If you cloned the project before the change, the easiest and safest option is to re-clone:
  git clone https://github.com/CaluseruMarcos/openPlanning.git

- If you must keep a local clone and have no uncommitted work, run:
  git fetch origin
  git checkout master
  git reset --hard origin/master
  git clean -fdx

- If you have local changes you want to preserve:
  git branch save-local-changes
  git format-patch origin/master --stdout > my-changes.patch
  or stash/commit your work to a new branch, then reapply after re-cloning.

- If a collaborator needs the original history or large blobs, they can fetch the backup remote branch:
  git fetch origin backup-before-history-clean-20261020_150209
  git checkout -b original-history origin/backup-before-history-clean-20261020_150209

Contributing
- This project is a hobby contribution aimed at demonstrating AI features for planning/team workflows.
- Please open issues and PRs. Small focused PRs are easiest to review.
- Avoid committing large binary artifacts to the main history. Use archives, releases, or Git LFS if binaries are needed.

License & attribution
- This project is not affiliated with Planning Center. It is an independent hobby/demo project intended for learning and contributions.

Help & coordination
- If you want the archived artifacts uploaded to a releases page, moved to a separate archive repo, or migrated to Git LFS, I can help automate that. Tell me which option you prefer (release vs separate repo vs LFS) and I will run the steps.

Thanks — contributions and questions are welcome.
