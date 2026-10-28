# Stage: Review (requirements + actual code + standards)

You review code you didn't write (except a fix check the main session runs, see "Who does what" in `.agent-workflow/stages/fix.md`). Don't edit code in this stage. The only file you write is the review file (or, for a fix check of PR comments, the comments file).

## 1. Get the change cheaply
**Local changes** are compared as snapshots, so new (untracked) files are included and earlier unrelated edits aren't. `H` is the output of `node .agent-workflow/scripts/snapshot.js`, taken now. `B` is:
- **Plan file:** the latest `Milestone N base` in the plan if there is one, else its `Base snapshot`.
- **Fix check** ("fix diff only"): the latest `Fix base` in the review or comments file.
- **Nothing given:** the output of `node .agent-workflow/scripts/snapshot.js --head` (it also works before the first commit).

Then run `git diff --stat B H -- . ":(exclude).agent-workflow"`. Under about 300 changed lines, read the whole diff at once (same command without `--stat`); otherwise `git diff B H -- <file>`, one file at a time.

**Pull request** (needs `gh`, logged in; github.com or GitHub Enterprise). This reads the PR without checking it out or creating branches:
1. Run `gh pr view <n> --json title,body` for the description.
2. Run `node .agent-workflow/scripts/pr-threads.js --fetch <n>`. It fetches from the remote that matches the PR's repo (or by URL, e.g. in a fork clone), then prints the two refs `PB` and `PH` plus a diffstat.
3. Then, with the same size rule as above (whole diff under about 300 lines, else per file):
   ```
   git diff PB...PH -- <file>
   git show PH:<path>             # full file, only when needed
   ```
   If `--fetch` says there's no merge base (a shallow clone), use `gh pr diff <n>` instead of `git diff`.

**For all targets:**
- Skip generated, lock, vendored and snapshot files.
- If there are more than ~15 files or ~400 changed lines, review the highest-risk files first (core logic, security, data, public APIs). List the rest under "Not reviewed".

## 2. Compare against requirements
Requirements come from the plan's acceptance criteria. For a PR without a plan, they come from the PR description plus the linked Jira story (if a Jira tool is connected).
- Mark each requirement **met**, **missing**, or **partial**.
- Flag scope creep: changes no requirement asks for.

## 3. Compare against the actual code and the standards
- Read the code around each hunk only as far as needed: callers, interfaces, the existing pattern for the same thing.
- Standards: read "General" and the area sections of `.agent-workflow/STANDARDS.md` that match the changed paths. Ignore "Decisions needed". Anything under "Recommended (not yet followed)" can only be a suggestion, never must-fix. If `.agent-workflow/STANDARDS.md` doesn't exist, follow the patterns in nearby code and add one line to the review: "No .agent-workflow/STANDARDS.md. Run the Standards stage." Don't invent standards.
- Cite the rule a finding breaks, e.g. `(STANDARDS: API › Error handling)`.
- Check, in priority order:
  1. Correctness bugs and edge cases.
  2. Security (input validation, secrets, injection, authorization).
  3. Architecture (layering, dependency direction, module boundaries).
  4. Error handling and logging.
  5. Tests cover the change. Behaviour changed with no test and no stated reason is **should-fix**, when the repo has a test setup.
  6. Performance hot spots.
  7. Simpler or better approaches.
- Don't comment on anything a linter or formatter enforces. Run the repo's lint on the changed files instead, if it's cheap, and report only the failures.
- Report only what you've confirmed. No findings means "No issues found". Don't pad the list.

## 4. Write the review
**File and slug.** The slug also names the task's snapshots.

| Target | File | Slug |
|---|---|---|
| Plan | `.agent-workflow/plans/<slug>.review.md` | the plan's slug |
| PR | `.agent-workflow/plans/pr-<n>.review.md` | `pr-<n>` |
| Nothing given | `.agent-workflow/plans/local-<branch>.review.md` | `local-<branch>` (`/` → `-`; `local-head` if detached) |

**When to create and when to append:**
- **First review:** create the file as shown below.
- **Fix check:** append a `## Round N` section to the file you were given, with only the new findings.
- **Milestone N ≥ 2:** append a `## Milestone N` section.
- When appending, number new findings after the last ID (e.g. F7, F8), and update the verdict line. Append with an edit; don't rewrite the file, or you may drop ticks.
```
# Review: <plan or PR #n> — Verdict: approve | changes requested
Base: <B>  Head: <H>
## Findings
- [ ] F1 [must-fix] path:line — <issue> — Fix: <concrete proposed change> — Decide: <choice> (recommend <default>)
- [ ] F2 [should-fix] path:line — <issue> — Fix: <...>
- [ ] F3 [suggestion] path:line — <better approach> — Why: <benefit>
## Requirements
- AC1 met | AC2 missing (<why>) | Scope creep: <file> <what>
## Not reviewed
- <files skipped, or "none">
```
Add `Decide:` only when the fix implies a behaviour choice (see "Decide before applying" in `.agent-workflow/stages/fix.md`).

Return the file path and the findings you added, one line each with their `Decide:` notes (not the rest of the file), then ask: **"Which to fix, and any decisions to change? e.g. `all must`, `must+should`, `F1 F3`, `none`."**

If the answer is `none`:
- **A plan with milestones still unticked:** nothing to finish. Continue with the next milestone, and keep its snapshots.
- **Otherwise, finish the task:**
  - For a plan whose status is `IMPLEMENTED`, set `Status: DONE`.
  - Run `node .agent-workflow/scripts/snapshot.js --clean <slug>`.
