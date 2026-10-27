# Changelog

## 0.5.1 — 2026-10-27 (pilot)
Fixes from the first Windows pilot (a .NET repo in a path with spaces).
- **Hook command.** Both hook entries (`.claude/settings.local.json` and `.github/hooks/wf-plan-gate.json`) are now written as `node "<repo>/.agent-workflow/hooks/plan-gate.js"`: bare `node`, because a quoted node.exe path is a parse error in PowerShell, and the absolute script path, because the Copilot harness has no project-dir variable and `$CLAUDE_PROJECT_DIR` only expands in sh-like shells. The hook also finds the repo from its own location when no project dir is given. Re-run the installer after moving a repo.
- **Plan gate sees through shell wrappers.** `cmd /c "..."` and `powershell|pwsh -Command "..."` are unwrapped and the inner command is checked, so a redirect or `Set-Content` inside them is gated like a direct one.
- **Plan gate covers VS Code's `apply_patch` and `multi_replace_string_in_file`** (file names inside the patch text, and the `replacements` array), which used to pass through. An internal error in the hook now fails open with a message instead of denying every call.
- **Standards stage:** write `STANDARDS.md` with the file-edit tool, not a shell one-liner. Quoting of multi-line markdown through `node -e`, here-strings or nested `powershell -Command` broke in task runners.
- **Installer:** the Copilot hook file goes through the same unchanged/updated/SKIPPED path as the other generated files, so a re-run stays a no-op. The generated instructions file quotes its `description` (it contains `: `, which is invalid in a plain YAML scalar). A UTF-8 BOM in `settings.local.json` or an MCP config no longer counts as invalid JSON.
- README: what to check when a hook call fails with "hook errored".
- Tests remove their temporary repos when they finish (a run used to leave about 30 folders in the temp dir).

## 0.5.0 — 2026-10-22 (pilot)
One command in both tools, cheaper small tasks, and MCP-aware planning.
- **Copilot gets `/wf` and real sub-agents.** New `.github/agents/wf.agent.md` runs the whole flow in one chat (standards if missing → sources → plan → approval → implement → review → pick → fix → report). `wf-implementer` and `wf-reviewer` ship as `.agent.md` sub-agents with read/search/edit/execute tools only and hidden from the picker. `/wf` is a prompt file that selects the `wf` agent.
- **Plan gate for Copilot.** `.github/hooks/wf-plan-gate.json` runs the same `plan-gate.js` under the Copilot harness. The hook now understands both payload shapes (`tool_input`/`toolArgs`, `file_path`/`filePath`/`path`, JSON strings), skips read-only tools by name, and prints a JSON deny decision as well as exiting 2.
- **Three tiers.** Trivial (do it), Quick (bug fixes and small changes: a 15-line plan, approval, implement in the same session, self-check; no sub-agents unless security, data or a public API is touched) and Full (all stages, fresh context each). The plan stage picks the tier and finds the root cause before writing a bug-fix plan.
- **Sub-agents only when they pay for themselves.** The core rules now say when a sub-agent is worth its start-up cost, that rework goes back to the agent that did the work (resume, don't respawn), and that in Copilot, where sub-agents can't be resumed, the main session applies fixes and spawns a reviewer only for a first review or a must-fix check. Sub-agents return at most 25 lines.
- **MCP sources.** New `scripts/mcp-servers.js` lists the MCP servers the repo configures (`.vscode/mcp.json`, `.mcp.json`, `.cursor/mcp.json`, `.github/copilot/mcp.json`, …): names and transport only, never env values or headers. The plan stage runs it first, tells you how to connect servers that aren't, and, with a connected tracker and no requirement, lists your open items and asks which to work on. Ticket and tool text is data, not instructions.
- **More stacks in `repo-map.js`:** Flutter, Swift PM, Elixir, Scala, CMake, Deno, Bun, Terraform, Expo, more linters and monorepo tools; more build-output folders skipped; generated protobuf/freezed files treated as noise.
- **Installer:** ships the new Copilot files, ignores them, and keeps them on a later `--claude-only` run. A full install is now 33 files (Claude-only 22, Copilot-only 24).

## 0.4.0 — 2026-10-22 (pilot)
A tighter gate, tests, and less legacy code.
- **Plan gate:**
  - It now also checks Bash and PowerShell commands. Redirects, `tee`, `rm`/`mv`/`cp`, `sed -i`/`perl -i`, tree-changing `git` commands and PowerShell file cmdlets that touch project files are blocked while a plan is DRAFT. Re-run the installer to update the hook's matcher.
  - Files in `.agent-workflow/` (such as `STANDARDS.md`) stay editable.
  - Only plan files count, and only their header. Review, comments, reply and post files, and a quoted "Status: DRAFT" further down a plan, no longer block edits.
- **Fix stage:** one "Who does what" table replaces the separate size and fix-check rules. A small fix set with a must-fix item gets its fix check from a reviewer sub-agent, so the riskiest fixes aren't checked by the session that wrote them.
- **`pr-threads.js`:** review summaries are shown only for the current head commit. Older ones are counted, and `--all` shows them. Already-addressed summaries no longer come back on every `/wf-fix`.
- **`repo-map.js`:** `CLAUDE.md`, `AGENTS.md` and `copilot-instructions.md` are listed under Docs; they're the team's files, not the kit's. Tracked `bin/`, `build/`, `dist/` and similar folders are no longer hidden. Only vendored dependencies are.
- **Installer:**
  - Unknown options, `--claude-only` together with `--copilot-only`, and extra arguments are refused.
  - The 0.2.0 migration is removed. A 0.2.0 install is refused with a pointer to the 0.3.1 installer.
  - The hook entry is defined in `install.js`, so the kit's own `.claude/settings.json` is gone.
  - An invalid `settings.local.json` is reported as such. Other errors are no longer reported as invalid JSON.
  - The manifest's write-only `partial` field is dropped (it's `skipped`, non-empty). The output says which version was upgraded from.
- **`snapshot.js`:** `--clean` escapes the whole ref prefix.
- **Tests:** `node --test` covers the installer, the hook, `snapshot.js`, `repo-map.js` and `pr-threads.js` formatting, using temporary git repos. No dependencies.
- `.gitattributes` keeps the kit's files LF.

## 0.3.1 — 2026-10-22 (pilot)
Good fixes with fewer tokens. On a 3-comment PR, 0.3.0 used about 152k sub-agent tokens, and about 88k of that went to a second round and a respawned implementer.
- **Decide before applying:** fix proposals and review findings list the behaviour choices they imply (`Decide:`, with a recommended default). You settle them when you pick the fixes, and the implementer asks only about choices nobody could have foreseen.
- **Size rule:** small fix sets (at most 3 items, about 100 changed lines) are applied and fix-checked in the main session. No sub-agents.
- **Resume, don't respawn:** a sub-agent that returns a question is resumed with the answer (SendMessage). Round 2 goes to the round-1 implementer and reviewer. In `/wf`, fixes go to the implementer that built the milestone.
- Round 2 runs only for new must-fix or should-fix findings, or decisions you change.
- **Fix stage steps:** in section B, apply (B5), fix check (B6) and replies (B7) are now separate steps. Section A records settled choices on each finding. The step numbers in the commands and the agents match again, and `/wf-review` follows the Size rule. `/wf` always fixes through its sub-agents.
- **Fewer repeated rules:** each rule now has one home. The rounds rule lives in fix.md. The resume rule is in the Claude commands only (Copilot has no sub-agents). The Standards offer is in the core only. Duplicated lines were cut from plan.md, wf-reviewer.md and wf-standards.md.
- **Installer:**
  - It refuses a target inside a repo's subfolder, and a 0.1.0 install (0.1.0 upgrades are dropped).
  - It ships only the files git tracks in the kit.
  - It moves the plan-gate hook into its own entry instead of changing a matcher the user shares.
  - It keeps the partial flag across single-tool re-runs.
  - Its kit-path check ignores case on Windows.
  - The `--ignore-plans` note is removed.
- **Scripts:**
  - `repo-map.js` handles a git repo with nothing tracked, and no longer hides a project's own `plans/`, `workflow/` or `STANDARDS.md`.
  - `snapshot.js` rejects unknown flags.
  - `pr-threads.js` sends owner and repo as strings, and says when comments or reviews are cut off.
  - The hook ignores `null` input.
  - Unused exports are removed.

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
