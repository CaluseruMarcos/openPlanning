openPlanning — community contribution

This repository contains an experimental, hobby project that explores AI-enabled features for a team/organization planning app similar in spirit to the proprietary "Planning Center". The goal is to contribute to the open source ecosystem: demonstrate automation and AI workflows, and invite others to read, test, and contribute.

Short project purpose
- A hobby/open-source effort to expose AI capabilities in workflows for church/team planning.
- Not affiliated with Planning Center; intended as an educational/demo contribution.
- Contributions welcome: issues, PRs, and discussions.

Important Git / repo history notes (read before pulling/pushing)
- To make the repository pushable to GitHub we removed very large generated artifacts from the repository history (APKs, decompiled output, and large tool jars). This rewrite required a forced update to the remote history.
- What was removed from current commits and from history: apk/, apktool_out/, extracted/, decompiled/, analysis/, and large jar files under tools/ (for example: tools/jadx/lib/jadx-1.5.1-all.jar and tools/apktool.jar).
- Backup of original artifacts: a tarball of the removed artifacts was created and saved in the repo root at:
  ./backup_artifacts_20261020_150209.tar.gz
  (Size: ~253 MB). The tarball and your local working-tree copies keep your ability to continue reverse engineering locally.
- A remote backup branch containing the original history was pushed before the rewrite. Its name is:
  backup-before-history-clean-20261020_150209
  (It contains the original commits including the large blobs.)

If you cloned the repository before this history rewrite
- Recommended (clean and safe): delete your local clone and re-clone the repository fresh:
  git clone https://github.com/CaluseruMarcos/openPlanning.git

- Alternative (if you understand git and have NO local uncommitted changes): in your existing clone you can run:
  git fetch origin
  git checkout master
  git reset --hard origin/master
  git clean -fdx
  This will force your local master to match the rewritten origin/master and remove untracked files.

- If you have local changes you want to keep: create patches or a branch first before resetting:
  git branch save-local-changes
  git format-patch origin/master --stdout > my-changes.patch
  or use git stash or git bundle to export your work, then reapply after re-cloning.

How to access the original history or artifacts
- If you need the original commit history with large blobs (for forensic or archival reasons), the remote backup branch is available:
  git fetch origin backup-before-history-clean-20261020_150209
  git checkout -b original-history origin/backup-before-history-clean-20261020_150209
  Note: that branch contains the large blobs (GitHub may block access for very large files depending on your remote policy).
- If you only need the artifacts (APKs, decompiled files, tools) you can extract the tarball saved in the repo root:
  tar -xzf backup_artifacts_20261020_150209.tar.gz

Why we did this
- GitHub blocks files larger than 100 MB. The tracked jars/APKs prevented pushing. To keep the repository small and usable while retaining a local copy of the artifacts for reverse engineering, we:
  1) created a local backup tarball, and
  2) rewrote history to remove the large blobs, then force-pushed the cleaned history.

If you want the large files in the repo long-term
- Consider using Git LFS and migrating heavy files into LFS, or host the binary artifacts in a separate archive repository or object storage (S3). I can help set that up if desired.

Contributing
- This project is a hobby contribution aimed at demonstrating AI features for planning/team workflows.
- Please open issues and PRs. Small focused PRs are easiest to review.
- If you're adding large binary artifacts for testing, please use a separate archive (not the main git history) or Git LFS.

Contact / coordination
- If you need the archived artifacts moved to a different place (a release asset, a separate repo, or object storage), or if you want help instructing other collaborators how to migrate, tell me and I will help.

Thank you for your interest — contributions and questions are welcome.