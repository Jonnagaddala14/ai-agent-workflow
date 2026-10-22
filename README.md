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
In Claude Code, `/wf` runs the whole flow, using sub-agents for implementation and review. You only approve the plan and pick which findings to fix.

The command names are the same in Claude Code and Copilot:

| Command | Use it to |
|---|---|
| `/wf <requirement or Jira key>` | Run everything: (standards if missing) → plan → implement → review → fix. **Claude Code only** |
| `/wf-standards [--refresh]` | Generate `STANDARDS.md` from the code (first time), or update it for areas that changed |
| `/wf-plan <requirement>` | Understand the requirement, gather context, write the plan, get approval |
| `/wf-implement <plan>` | Implement an approved plan and verify it |
| `/wf-review [plan \| PR# \| empty]` | Review against requirements, code and standards; findings go to a file |
| `/wf-fix <PR# \| review file>` | Fix picked findings, or address a PR's unresolved review comments |

## Files
Everything lives in one folder, `.agent-workflow/`, except the small entry files that each tool only looks for in a fixed place.

| File (in `.agent-workflow/` unless shown) | Loaded when | Purpose |
|---|---|---|
| `AGENT_WORKFLOW.md` | **every request** (via the entry files below) | Small core: the stage map, consent rules, token rules |
| `stages/standards.md`, `plan.md`, `implement.md`, `review.md`, `fix.md` | only when that stage runs | Stage instructions, shared by Claude Code and Copilot |
| `PLAN_TEMPLATE.md` | Plan stage | Plan format (status, sources, approach, acceptance criteria, steps, verify) |
| `templates/STANDARDS_TEMPLATE.md` | Standards stage | Format of the generated `STANDARDS.md` (sections per area, decisions needed, recommendations) |
| `STANDARDS.md` (generated, per repo) | Plan, Implement, Review, Fix (relevant sections only) | The repo's architecture and coding rules, inferred from the code with evidence, approved by you |
| `plans/` (generated, per task) | each stage | Plan, review, PR-comments and reply files: the handoffs between stages |
| `scripts/repo-map.js` | Standards stage | Compact repo summary (areas, file types, configs, docs, hotspots) so the agent samples files instead of reading them all. Monorepo packages and modules with their own manifest are separate areas; lock files, generated code and the kit's own files are left out (needs Node.js) |
| `scripts/snapshot.js` | Plan approval, before each fix round, at review time | Records the whole working tree, including new untracked files, as a git snapshot without touching your staging area. Reviews diff two snapshots, so new files are included and fix checks see only the fixes (needs git + Node.js) |
| `scripts/pr-threads.js` | Fix stage (PRs) | Prints only the unresolved PR comment threads, one line each. `--fetch <n>` fetches a PR for review without checking it out. After your consent, `--reply <threadId> <file>` replies in a thread (the text comes from a file, so quotes are safe in any shell) and `--resolve <threadId>` resolves it (needs `gh` + Node.js) |
| `hooks/plan-gate.js` | Claude Code edits | Blocks code edits while a plan is DRAFT (needs Node.js) |
| `manifest.json` (written by the installer) | upgrades | The installed version plus a fingerprint of each kit file |
| **Entry files (outside the folder)** | | |
| `.claude/commands/wf*.md`, `.claude/agents/wf-*.md` | on demand | Claude Code commands and the `wf-implementer` / `wf-reviewer` sub-agents |
| `.claude/rules/agent-workflow.md` | every Claude Code request | Copy of `AGENT_WORKFLOW.md`; Claude Code loads `.claude/rules/` automatically |
| `.claude/settings.local.json` | Claude Code edits | Runs the plan-gate hook (merged into your existing local settings) |
| `.github/prompts/wf-*.prompt.md` | on demand | Copilot versions of the commands (run in Agent mode) |
| `.github/instructions/agent-workflow.instructions.md` | every Copilot request | Copy of `AGENT_WORKFLOW.md` with `applyTo: "**"` |
| **Kit repo only (not installed)** | | |
| `install.js` | once per repo, and to upgrade | Installs the kit into a repo (see Setup) |
| `VERSION`, `CHANGELOG.md` | — | Kit version and history |
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
- **Small always-on core.** Stage details are loaded only by the command that needs them.
- **Handoff files instead of chat history.** Plan → implement → review file → fix. Each stage starts fresh (a sub-agent or `/clear`).
- **Cheap diffs.** `--stat` first, then one file at a time. Generated and lock files are skipped. Large PRs are reviewed highest-risk first.
- **PRs reviewed without checkout.** `git fetch pull/<n>/head` + `git show` reads the actual code without switching branches.
- **The linter does the style checking.** The reviewer runs lint instead of commenting on formatting.
- **Compact PR comments.** `pr-threads.js` prints one line per unresolved thread instead of raw GitHub JSON.
- **Limited fix rounds.** Fixes are checked against a checkpoint taken just before them, so each round reviews only the fixes. At most 2 rounds; each round is appended to the same review file.

## Optional sources: Jira, Figma
Used only if their MCP tools are connected. Otherwise they're skipped silently (`Sources: none`). The agent only asks if you gave a ticket key or design link it can't open; then it asks you to paste the content. To connect them, use `claude mcp add` or `/mcp` in Claude Code, or VS Code's MCP settings for Copilot.

## Consent points
1. Plan approval, before any code changes.
2. Picking which review findings or PR comments to fix.
3. Commit, push, open a PR, or post or reply to comments: only when you say so.

## Setup
**Prerequisites:** git and Node.js. For PR review and comment fixing, also the GitHub CLI (`gh auth login`).

```
node install.js <path-to-repo> [--claude-only | --copilot-only] [--gitignore] [--force]
```
A full install (both tools) adds 29 files: 13 in `.agent-workflow/`, 10 Claude Code entry files and 6 Copilot entry files. `--claude-only` adds 23 and `--copilot-only` adds 19.

The installer:
- Copies the kit into `.agent-workflow/` and the entry files into `.claude/` and `.github/`.
- Claude Code: merges the approval hook into `.claude/settings.local.json`, keeping your existing local settings.
- **Ignores all of it in git.** It writes a marked block of ignore rules to `.git/info/exclude`, which works like `.gitignore` but stays in your clone, so `git status` stays clean and nothing (not even the ignore rules) is committed. With `--gitignore`, it writes the same block to `.gitignore` instead, for teams that want the rules shared. Switching between the two moves the block.
- Edits **no committed file**: not `CLAUDE.md`, `.claude/settings.json`, `.github/copilot-instructions.md` or `.gitignore` (unless you pass `--gitignore`).
- Warns if git already tracks any of these files, because ignore rules don't apply to tracked files. It prints the `git rm --cached` command to run; the files stay on disk.

It never touches `.agent-workflow/STANDARDS.md` or `.agent-workflow/plans/`.

**Sharing `STANDARDS.md`:** by default each developer generates their own. To share one with the team, add `!/.agent-workflow/STANDARDS.md` to `.gitignore` (after the block, if you used `--gitignore`) and commit both. That un-ignores just that file, whichever ignore mode you used.

**Upgrading:** re-run the new kit's `install.js` on the repo. Using the fingerprints in `.agent-workflow/manifest.json`, it:
- updates kit files you haven't touched;
- skips and lists files you've edited, and records the install as `partial` (re-run with `--force` to overwrite them);
- removes files the new version no longer ships (unless you edited them);
- updates the hook command.

Line-ending differences (Windows CRLF) don't count as edits. The always-loaded entry files are regenerated from `.agent-workflow/AGENT_WORKFLOW.md`, so to change the core rules, edit that file and re-run the installer.

**Upgrading from 0.2.0** (root files, `workflow/`, `.wf-manifest.json`) also:
- removes the old files you haven't edited, and lists edited ones to port by hand;
- moves `STANDARDS.md` and `plans/` into `.agent-workflow/` (if they aren't there already);
- takes the `@AGENT_WORKFLOW.md` line out of `CLAUDE.md`, the marked block out of `.github/copilot-instructions.md`, and the hook out of `.claude/settings.json`.

Commit those removals, plus `git rm --cached` for any kit files the repo had committed.

Then, in the repo:
1. Run `/wf-standards` once, resolve the "Decisions needed", and approve.
2. Put the repo's build, test and lint commands in `CLAUDE.md` (Claude Code) or `.github/copilot-instructions.md` (Copilot). These are the team's files, so this is the one step that changes something committed; skip it if the commands are already there.

### Using Copilot (VS Code)
- Run each command in a **new chat**. The prompt files set Agent mode, because every stage writes files or runs scripts (Plan and Ask modes can't).
  - The frontmatter uses `agent: agent`. On older VS Code versions that still use `mode:`, change it to `mode: agent`.
- `/wf` isn't available. Run the stages one by one.
- Copilot has no hook and no sub-agents. The approval gate relies on the rules alone, and fresh context comes from starting a new chat.

## Known limitations
- **The hook is a guard rail, not a lock.**
  - It gates only the Edit and Write tools, and only for files inside the repo. An agent writing files through shell commands isn't blocked.
  - The agent can still edit a plan's status itself.
  - A leftover DRAFT plan blocks code edits. Delete it or set `Status: ABANDONED`.
- **PR features are GitHub-only** (`gh` CLI). Azure DevOps and GitLab PRs aren't supported yet. Everything else works with any git host.
- **`pr-threads.js` reads at most 100 threads per PR.** It says so when there are more.
- **Keep `.gitignore` up to date.** Snapshots include every untracked file that isn't ignored. Large untracked files (datasets, local builds) make snapshots slower and grow `.git`.
- **Snapshots and fetched PR refs are saved as `refs/wf/<worktree>/*`** (`main` for the main worktree). That keeps git from garbage-collecting them mid-task, and each git worktree gets its own names. They're deleted when a task finishes (`snapshot.js --clean <slug>`).
- **GitHub Enterprise** works too: the scripts take the host from the PR's URL and pass it to `gh`. Run `gh auth login --hostname <host>` first.
- **Plan, review and comments files live in `.agent-workflow/plans/`** and are ignored, so they aren't a shared record. Copy one out if you want to keep it.
- **Entry files can't all go in the kit folder.** Claude Code finds commands, agents and rules only under `.claude/`, and Copilot finds prompts and instructions only under `.github/` (without extra VS Code settings). They're ignored, so git doesn't see them.
- **To cut cost further,** you can set `model: sonnet` in a sub-agent's frontmatter. Test the review quality before relying on it.

## Checking it works
Run 3–5 small real tasks and 2–3 real PRs, then check:
- Token use: Claude Code `/cost` or `/context`; Copilot premium-request usage.
- Does the agent stop at each consent point?
- Do the findings cite real `file:line` locations and the standards, without nitpicks?
- Do fixes pass verify within 2 rounds?
