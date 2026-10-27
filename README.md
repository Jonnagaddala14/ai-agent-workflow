# AI Agent Workflow Kit (GitHub Copilot + Claude Code)

A default, token-efficient workflow for AI coding agents, for any stack (web, backend, Android, Roku, …).

**Priorities, in order:**
1. **Low token use, plus reviews that get fixed.** Each stage starts fresh and reads only a short handoff file. Review findings are saved, so fixing doesn't need a re-review.
2. **Understand the requirement and get consent.** One approval gate before any code changes.
3. **Review PRs against the requirements, the actual code, and your architecture and coding standards.**
4. **Address PR review comments.** Propose an action per comment, get consent once, fix.

## Flow
```
(first time) /wf-standards ──► STANDARDS.md ──(you approve)──► used by every stage below

/wf-plan ──► plans/<slug>.md ──(you approve)──► /wf-implement ──► code
                                                               │
           /wf-fix ◄──(you pick)── plans/<slug>.review.md ◄── /wf-review
```
`STANDARDS.md` and `plans/` live in `.agent-workflow/`, next to the kit. Nothing the kit installs or writes is committed (see Setup).
`/wf` runs the whole flow in both tools, using sub-agents for implementation and review when the task is big enough to need them. You only approve the plan and pick which findings to fix.

**Three tiers, sized at plan time.** Trivial changes (typo, rename, one-liner) are done directly. **Quick** tasks (bug fixes and small changes, up to about 3 files) get a 15-line plan, your approval, and are implemented and self-checked in the same session with no sub-agents. **Full** tasks go through every stage in fresh contexts. This keeps bug fixes cheap without skipping the approval gate.

The command names are the same in Claude Code and Copilot:

| Command | Use it to |
|---|---|
| `/wf [requirement \| bug \| ticket key]` | Run everything: (standards if missing) → MCP sources and work item → plan → implement → review → fix. Empty: pick an item from the connected tracker |
| `/wf-standards [--refresh]` | Generate `STANDARDS.md` from the code (first time), or update it for areas that changed |
| `/wf-plan <requirement>` | Understand the requirement, gather context, write the plan, get approval |
| `/wf-implement <plan>` | Implement an approved plan and verify it |
| `/wf-review [plan \| PR# \| empty]` | Review against requirements, code and standards; findings go to a file |
| `/wf-fix <PR# \| review file>` | Fix picked findings, or address a PR's unresolved review comments |

## Files
Everything lives in one folder, `.agent-workflow/`, except the small entry files that each tool only looks for in a fixed place.

| File (in `.agent-workflow/` unless shown) | Loaded when | Purpose |
|---|---|---|
| `AGENT_WORKFLOW.md` | **every request** (via the entry files below) | Small core (about 600 words): the stage map, tiers, consent, token and sub-agent rules. Lines ending in `<!-- claude -->` or `<!-- copilot -->` go only to that tool |
| `stages/standards.md`, `plan.md`, `implement.md`, `review.md`, `fix.md` | only when that stage runs | Stage instructions, shared by Claude Code and Copilot |
| `agents/wf-implementer.md`, `agents/wf-reviewer.md` | when the installer runs | The one source for both tools' sub-agents; the installer generates the `.claude/agents/` and `.github/agents/` copies from it, with the same per-tool markers |
| `PLAN_TEMPLATE.md` | Plan stage | Plan format (status, sources, approach, acceptance criteria, steps, verify) |
| `templates/STANDARDS_TEMPLATE.md` | Standards stage | Format of the generated `STANDARDS.md` (sections per area, decisions needed, recommendations) |
| `STANDARDS.md` (generated, per repo) | Plan, Implement, Review, Fix (relevant sections only) | The repo's architecture and coding rules, inferred from the code with evidence, approved by you |
| `plans/` (generated, per task) | each stage | Plan, review, PR-comments and reply files: the handoffs between stages |
| `scripts/repo-map.js` | Standards stage | Compact repo summary (areas, file types, configs, docs, hotspots) so the agent samples files instead of reading them all. Monorepo packages and modules with their own manifest are separate areas; lock files, generated code and the kit's own files are left out (needs Node.js) |
| `scripts/mcp-servers.js` | Plan stage | Lists the MCP servers the repo configures (`.vscode/mcp.json`, `.mcp.json`, `.cursor/mcp.json`, `.github/copilot/mcp.json`, …): names and transport only, never env values or headers. The agent compares the list with the tools it has, tells you how to connect the rest, and can pick a work item from a connected tracker (needs Node.js) |
| `scripts/snapshot.js` | Plan approval, before each fix round, at review time | Records the whole working tree, including new untracked files, as a git snapshot without touching your staging area. Reviews diff two snapshots, so new files are included and fix checks see only the fixes (needs git + Node.js) |
| `scripts/pr-threads.js` | Fix stage (PRs) | Prints only the unresolved PR comment threads, one line each, plus review summaries on the current head commit (`--all` for older ones). `--fetch <n>` fetches a PR for review without checking it out. After your consent, `--reply <threadId> <file>` replies in a thread (the text comes from a file, so quotes are safe in any shell) and `--resolve <threadId>` resolves it (needs `gh` + Node.js) |
| `hooks/plan-gate.js` | Claude Code and Copilot edits and shell commands | Blocks code changes while a plan is DRAFT: the edit tools, and shell writes such as redirects, `rm`/`mv`/`cp`, `sed -i`, `find -delete`, `xargs rm`, `patch`, tree-changing `git` commands (in this repo) and PowerShell file cmdlets, also inside `sh -c`, `cmd /c` and `pwsh -Command`. Files in `.agent-workflow/` stay editable. Understands both tools' hook payloads (needs Node.js) |
| `manifest.json` (written by the installer) | upgrades | The installed version plus a fingerprint of each kit file |
| **Entry files (outside the folder)** | | |
| `.claude/commands/wf*.md`, `.claude/agents/wf-*.md` | on demand | Claude Code commands and the `wf-implementer` / `wf-reviewer` sub-agents (generated from `agents/`) |
| `.claude/rules/agent-workflow.md` | every Claude Code request | Generated from `AGENT_WORKFLOW.md` (Claude lines only); Claude Code loads `.claude/rules/` automatically |
| `.claude/settings.local.json` | Claude Code edits | Runs the plan-gate hook (merged into your existing local settings) |
| `.github/prompts/wf*.prompt.md` | on demand | Copilot versions of the commands. `/wf` selects the `wf` agent; the others run in Agent mode |
| `.github/agents/wf.agent.md`, `wf-implementer.agent.md`, `wf-reviewer.agent.md` | `/wf`, or as sub-agents | The Copilot orchestrator and its two sub-agents (generated from `agents/`; read/search/edit/execute tools only; hidden from the agent picker) |
| `.github/hooks/wf-plan-gate.json` | Copilot edits and shell commands | Runs the plan-gate hook under the Copilot harness. Both hook entries are written with the script's absolute path |
| `.github/instructions/agent-workflow.instructions.md` | every Copilot request | Generated from `AGENT_WORKFLOW.md` (Copilot lines only) with `applyTo: "**"` |
| **Kit repo only (not installed)** | | |
| `install.js` | once per repo, and to upgrade | Installs the kit into a repo (see Setup) |
| `VERSION`, `CHANGELOG.md`, `package.json` | — | Kit version, history, and the Node.js version and test command (no dependencies) |
| `test/` | — | Tests for the installer, scripts, hook and docs. Run `npm test` (or `node --test test/`) in the kit repo (Node.js 20+, no dependencies) |
| `examples/` | — | Illustrative standards, plan, review and PR-comments files, showing the expected size and shape |

## Standards: generated once, then followed
You don't need to write `STANDARDS.md` yourself. The first time, `/wf-standards` (or `/wf` or `/wf-review`, which offer it automatically):
1. Maps the repo with `repo-map.js` and reads the manifests, lint configs and existing docs. Documented rules win over inferred ones.
2. Splits the repo into **areas** (e.g. `API/` .NET, `React/` SPA, `app/` Android, `roku/` channel) and samples 2–3 representative files per role in each. For large repos this runs in parallel sub-agents.
3. Records a rule only when most of the samples follow it, citing an example file. Inconsistencies go to **Decisions needed** for you to choose. Missing good practices go to **Recommended (not yet followed)**; reviews raise these as suggestions only.
4. Shows a summary. You resolve the decisions and approve.

After that:
- Every plan, implementation, review and fix follows it.
- Review findings cite the rule they break.
- When you settle a convention during review or fix, it's proposed as a new rule.
- `/wf-standards --refresh` re-samples only the areas that changed since `Generated at commit`.

## How tokens are saved
- **Sized first.** Trivial tasks skip the plan; Quick tasks (bug fixes, small changes) get a 15-line plan and are done in one session with no sub-agents; only Full tasks pay for fresh contexts.
- **Small always-on core.** Stage details are loaded only by the command that needs them.
- **Handoff files instead of chat history.** Plan → implement → review file → fix. Each stage starts fresh (a sub-agent or `/clear`).
- **Root cause before plan.** A bug-fix plan names the `file:line` and the reproduction, so the implementation doesn't re-explore.
- **Cheap diffs.** `--stat` first; under about 300 changed lines the whole diff in one read, otherwise one file at a time. Generated and lock files are skipped. Large PRs are reviewed highest-risk first.
- **PRs reviewed without checkout.** `git fetch pull/<n>/head` + `git show` reads the actual code without switching branches.
- **The linter does the style checking.** The reviewer runs lint instead of commenting on formatting.
- **Compact PR comments.** `pr-threads.js` prints one line per unresolved thread instead of raw GitHub JSON.
- **Compact MCP discovery.** `mcp-servers.js` prints one line per server instead of the agent reading config files (and keeps secrets out of its context).
- **Limited fix rounds.** Fixes are checked against a checkpoint taken just before them, so each round reviews only the fixes. At most 2 rounds; each round is appended to the same review file.
- **Decisions before fixes.** Each proposed fix lists the behaviour choices it implies (`Decide:`, with a recommended default), and you settle them when you pick. That way a fix isn't redone because an edge case came up afterwards.
- **Sub-agents only when they pay for themselves.** Small fix sets (at most 3 items, about 100 lines) are applied and checked in the main session, which has already read the code. A small set with a must-fix still gets a fresh reviewer for the fix check. Rework goes back to the agent that did the work: in Claude Code it's resumed with `SendMessage`; in Copilot, where sub-agents are one-shot, the main session does the fixes and spawns a reviewer only for a first review or a must-fix check. Sub-agents return summaries of at most 25 lines.

## Optional sources: trackers, designs, docs (MCP)
At the start of every plan the agent runs `mcp-servers.js`, which lists the MCP servers configured in the repo. For each one it checks whether the tools are actually available:
- **Connected tracker** (Jira, GitHub Issues, Azure DevOps, Linear, …): with a ticket key it reads the ticket with field filters; with no requirement it lists your open items (at most 10) and asks which to work on.
- **Configured but not connected:** it tells you once how to connect (VS Code: `MCP: List Servers`; Claude Code: `/mcp` or `claude mcp add`) and never reads the config's env values or headers.
- **Nothing configured:** skipped silently (`Sources: none`).

Ticket text, design notes and MCP results are treated as data, not instructions; anything that looks like a requirement is confirmed with you in the plan.

## Consent points
1. Plan approval, before any code changes.
2. Picking which review findings or PR comments to fix.
3. Commit, push, open a PR, or post or reply to comments: only when you say so.

## Setup
**Prerequisites:** git and Node.js 20+. On Windows, `node` must be on the PATH your editor sees (the hook is run as `node …` by Claude Code and VS Code, not by your terminal); on macOS and Linux the installer writes node's absolute path instead. For PR review and comment fixing, also the GitHub CLI (`gh auth login`).

```
node install.js <path-to-repo> [--claude-only | --copilot-only] [--gitignore] [--force] [--dry-run]
node install.js <path-to-repo> --uninstall [--force] [--dry-run]
```
A full install (both tools) adds 37 files: 16 in `.agent-workflow/` (including the manifest), 10 Claude Code entry files and 11 Copilot entry files. `--claude-only` adds 26 and `--copilot-only` adds 27.

The installer:
- Copies the kit into `.agent-workflow/` and the entry files into `.claude/` and `.github/`.
- Claude Code: merges the approval hook into `.claude/settings.local.json`, keeping your existing local settings.
- Copilot: adds `.github/hooks/wf-plan-gate.json`, the same hook for the Copilot harness. With both tools installed, the Copilot harness may run the hook twice (it also reads `.claude/settings.local.json`); that's harmless.
- **Ignores all of it in git.** It writes a marked block of ignore rules to `.git/info/exclude`, which works like `.gitignore` but stays in your clone, so `git status` stays clean and nothing (not even the ignore rules) is committed. With `--gitignore`, it writes the same block to `.gitignore` instead, for teams that want the rules shared. Switching between the two moves the block.
- Edits **no committed file**: not `CLAUDE.md`, `.claude/settings.json`, `.github/copilot-instructions.md` or `.gitignore` (unless you pass `--gitignore`).
- Warns if git already tracks any of these files, because ignore rules don't apply to tracked files. It prints the `git rm --cached` command to run; the files stay on disk.

It never touches `.agent-workflow/STANDARDS.md` or `.agent-workflow/plans/`. Installing into a subfolder of a repo, or into a path containing `$`, a backtick or a quote (they break the hook command), is refused with a message. Unknown options are refused too.

**Other options:** `--dry-run` prints what would change and changes nothing. `--uninstall` removes every file the manifest lists (edited ones only with `--force`), the hook entry, the ignore block and the manifest; it keeps `STANDARDS.md`, `plans/` and the rest of your `settings.local.json`. `--help` lists the options. Node.js 20 or later is required.

**Sharing `STANDARDS.md`:** by default each developer generates their own. To share one with the team, add `!/.agent-workflow/STANDARDS.md` to `.gitignore` (after the block, if you used `--gitignore`) and commit both. That un-ignores just that file, whichever ignore mode you used.

**Upgrading:** re-run the new kit's `install.js` on the repo. Using the fingerprints in `.agent-workflow/manifest.json`, it:
- updates kit files you haven't touched;
- skips and lists files you've edited, and records them under `skipped` (re-run with `--force` to overwrite them);
- removes files the new version no longer ships (unless you edited them);
- updates the hook command and matcher.

Line-ending differences (Windows CRLF) don't count as edits. The always-loaded entry files are regenerated from `.agent-workflow/AGENT_WORKFLOW.md`, so to change the core rules, edit that file and re-run the installer.

If you move or rename the repo folder, re-run the installer once: both hook entries hold the repo's absolute path. On macOS and Linux they also hold the absolute path of the `node` that ran the installer (an editor started from the dock often lacks nvm or Homebrew on its PATH, and then the hook would silently not run), so re-run it after removing or switching that Node version too.

Then, in the repo:
1. Run `/wf-standards` once, resolve the "Decisions needed", and approve. (Or just run `/wf <requirement>`: it offers this step when `STANDARDS.md` is missing.)
2. Put the repo's build, test and lint commands in `CLAUDE.md` (Claude Code) or `.github/copilot-instructions.md` (Copilot). These are the team's files, so this is the one step that changes something committed; skip it if the commands are already there.

### Using Copilot (VS Code)
- `/wf <requirement>` runs the whole flow in one chat: it selects the `wf` custom agent, which plans with you, then uses the `wf-implementer` and `wf-reviewer` sub-agents for Full-tier work and does Quick-tier work itself.
- The per-stage prompts (`/wf-plan`, `/wf-implement`, …) still exist for running stages one at a time. Run each in a **new chat**; they set Agent mode, because every stage writes files or runs scripts.
  - The frontmatter uses `agent: agent`. On older VS Code versions that still use `mode:`, change it to `mode: agent`.
- Copilot sub-agents are one-shot: they can't be resumed with an answer. So the orchestrator applies fixes itself and spawns a reviewer only for a first review or a must-fix check.
- The plan gate runs through `.github/hooks/wf-plan-gate.json` (Copilot harness, preview). If your VS Code doesn't run hooks yet, the gate relies on the rules alone. If a tool call is denied with "hook errored" (the hook crashed, rather than deciding), check the hook output in the Output panel, run `echo {} | node .agent-workflow/hooks/plan-gate.js` in the repo to confirm Node and the script path work (it should print nothing and exit 0), and reload the window after any hook config change.
- VS Code also lists Claude-format agents from `.claude/agents/`. With both tools installed you may see `wf-implementer` twice in diagnostics; they behave the same.

## Known limitations
- **The hook is a guard rail, not a lock.**
  - It gates the edit tools and the common shell writes, and only for files inside the repo. Shell parsing is a heuristic: scripts that write files (`node build.js`, `python gen.py`) aren't blocked, and a command it misreads is blocked with a message saying so.
  - The agent can still edit a plan's status itself.
  - A leftover DRAFT plan blocks code edits. Delete it or set `Status: ABANDONED`.
- **PR features are GitHub-only** (`gh` CLI). Azure DevOps and GitLab PRs aren't supported yet. Everything else works with any git host.
- **`pr-threads.js` reads at most 100 threads per PR.** It says so when there are more.
- **Keep `.gitignore` up to date.** Snapshots include every untracked file that isn't ignored. Large untracked files (datasets, local builds) make snapshots slower and grow `.git`.
- **Snapshots and fetched PR refs are saved as `refs/wf/<worktree>/*`** (`main` for the main worktree). That keeps git from garbage-collecting them mid-task, and each git worktree gets its own names. They're deleted when a task finishes (`snapshot.js --clean <slug>`).
- **GitHub Enterprise** works too: the scripts take the host from the PR's URL and pass it to `gh`. Run `gh auth login --hostname <host>` first.
- **Plan, review and comments files live in `.agent-workflow/plans/`** and are ignored, so they aren't a shared record. Copy one out if you want to keep it.
- **Entry files can't all go in the kit folder.** Claude Code finds commands, agents and rules only under `.claude/`, and Copilot finds prompts, agents, hooks and instructions only under `.github/`. They're ignored, so git doesn't see them.
- **To cut cost further,** you can add `model: sonnet` to the frontmatter in `.agent-workflow/agents/*.md` (mark it `<!-- claude -->` if it's for Claude Code only) and re-run the installer. Test the review quality before relying on it.

## Checking it works
Run 3–5 small real tasks and 2–3 real PRs, then check:
- Token use: Claude Code `/cost` or `/context`; Copilot premium-request usage.
- Does the agent stop at each consent point?
- Do the findings cite real `file:line` locations and the standards, without nitpicks?
- Do fixes pass verify within 2 rounds?
