# Changelog

## 0.3.0 — 2026-10-22 (pilot)
One folder, nothing committed.
- **Layout:** the kit, `STANDARDS.md` and `plans/` all live in `.agent-workflow/`. Stage files move to `.agent-workflow/stages/`, so `stages/standards.md` can't collide with `STANDARDS.md` on case-insensitive file systems (Windows, macOS). The manifest is now `.agent-workflow/manifest.json`.
- **Entry files:** Claude Code loads the core rules from `.claude/rules/agent-workflow.md`, and Copilot from `.github/instructions/agent-workflow.instructions.md` (`applyTo: "**"`). Both are generated from `.agent-workflow/AGENT_WORKFLOW.md`. The hook moves to `.claude/settings.local.json`.
- **No committed files are edited.** `CLAUDE.md`, `.claude/settings.json`, `.github/copilot-instructions.md` and `.gitignore` are no longer touched.
- **Ignore rules:** the installer writes a marked block to `.git/info/exclude` (local), or to `.gitignore` with `--gitignore`. It warns about files git already tracks. `--ignore-plans` is no longer needed.
- **Upgrading from 0.2.0:** old files are removed (edited ones are kept and listed), `STANDARDS.md` and `plans/` are moved into the folder, and the old `CLAUDE.md` import, Copilot block and `settings.json` hook are taken out.
- The core rules say never to stage or commit `.agent-workflow/` or the `wf` entry files. The fix stage's branch check excludes `.agent-workflow` instead of `plans`.
- `repo-map.js` skips `.agent-workflow/` and the new entry files, and still recognises a committed 0.2.0 layout.

## 0.2.0 — 2026-10-14 (pilot)
Fixes from a fresh-eyes review.
- **Approval gate:** the hook now recognises a bold or list-formatted `Status: DRAFT` line, so formatting can't bypass it.
- **Upgrades:** the installer records file fingerprints in `.wf-manifest.json` (replacing `.wf-version`). It updates untouched files, skips edited ones, removes files the kit no longer ships, updates the hook command, and ignores CRLF differences. Re-running with only one tool selected no longer deletes the other tool's files.
- **Fix flow:**
  - The implementer sub-agent only applies fixes and verifies; the main session runs the fix check and finishes.
  - The fix checkpoint is reused when a round resumes after a question.
  - Fix checks for PR comments append to the comments file.
  - The reviewer appends rounds with Edit instead of rewriting files.
  - Each milestone gets its own baseline and review section.
  - Picking `none` finishes the task.
- **Branch checks:** the Copilot review→fix path now checks the branch first, and `plans/` no longer counts as uncommitted changes.
- **Drift check:** files marked `(new)` in "Files to touch" are expected not to exist yet.
- **PRs:**
  - `pr-threads.js --fetch <n>` fetches the PR into `refs/wf/<worktree>/` from the remote that matches the PR, so forks work and re-reviews work while you're on the PR's branch.
  - `pr-threads.js` takes the repo and host from the PR (github.com or GitHub Enterprise) and adds `--reply` (text from a file) and `--resolve`.
  - `/wf-review --post` posts with `--body-file`.
- **Snapshots:** saved as `refs/wf/<worktree>/…` (shared refs, so `git gc` in another worktree can't prune them), `--head` works before the first commit, and `--clean` also covers PR and milestone refs. PR reviews, `--post`-only reviews and `none` answers now clean up too. `none` on a milestone review continues with the next milestone instead of finishing the plan.
- **Upgrading from 0.1.0:** that version recorded no fingerprints, so the installer explains why changed files are skipped, and keeps `.wf-version` until a full install.
- **repo-map.js:**
  - Non-ASCII paths print correctly.
  - Lock files, generated code, the kit's own files and agent config are excluded.
  - Monorepo packages and modules with their own manifest are separate areas. Test projects (`Api.Tests/`, `*.UnitTests/`) fold into the project they test and count as tests.
  - The Standards stage uses at most 5 sub-agents, grouping similar areas.
- **Other:**
  - The implementer is explicitly forbidden to commit, push or post.
  - The Standards stage has a one-area-at-a-time fallback for tools without sub-agents.
  - Reviews of local changes without a plan have a defined file name (`local-<branch>`).
  - Scripts no longer report a missing file as "gh/git not installed".

## 0.1.0 — 2026-10-14 (pilot)
First version, for piloting on real projects.
- Stages: Standards (generated from the code) → Plan → Implement → Review → Fix, each starting fresh with a handoff file in `plans/`.
- Consent points: plan approval, choosing which fixes to apply, and anything outward-facing (commit, push, PR, comments).
- Claude Code: `/wf` (whole flow), `/wf-standards`, `/wf-plan`, `/wf-implement`, `/wf-review`, `/wf-fix`; `wf-implementer` and `wf-reviewer` sub-agents; `plan-gate` hook.
- Copilot: the same commands as Agent-mode prompt files (except `/wf`).
- Scripts:
  - `repo-map.js`: compact repo summary.
  - `snapshot.js`: working-tree snapshots, so diffs include new files and fix checks are isolated.
  - `pr-threads.js`: unresolved GitHub PR threads, one line each.
- `install.js`: installs and upgrades, merging `settings.json`, `CLAUDE.md` and `copilot-instructions.md`.
- Not yet tested end to end on a real project.
