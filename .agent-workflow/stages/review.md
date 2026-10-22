# Stage: Review (requirements + actual code + standards)

You review code you didn't write. Don't edit code in this stage. The only file you write is the review file (or, for a fix check of PR comments, the comments file).

## 1. Get the change cheaply
**Local changes** are compared as snapshots, so new (untracked) files are included and earlier unrelated edits aren't. `H` is the output of `node .agent-workflow/scripts/snapshot.js`, taken now. `B` is:
- **Plan file:** the latest `Milestone N base` in the plan if there is one, else its `Base snapshot`.
- **Fix check** ("fix diff only"): the latest `Fix base` in the review or comments file.
- **Nothing given:** the output of `node .agent-workflow/scripts/snapshot.js --head` (it also works before the first commit).

Then run `git diff --stat B H -- . ":(exclude).agent-workflow"`, and `git diff B H -- <file>` one file at a time.

**Pull request** (needs `gh`, logged in; github.com or GitHub Enterprise). This reads the PR without checking it out or creating branches:
1. Run `gh pr view <n> --json title,body` for the description.
2. Run `node .agent-workflow/scripts/pr-threads.js --fetch <n>`. It fetches from the remote that matches the PR's repo (or by URL, e.g. in a fork clone), then prints the two refs `PB` and `PH` plus a diffstat.
3. Then:
   ```
   git diff PB...PH -- <file>     # one file at a time
   git show PH:<path>             # full file, only when needed
   ```

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
  5. Tests cover the change.
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
- [ ] F1 [must-fix] path:line — <issue> — Fix: <concrete proposed change>
- [ ] F2 [should-fix] path:line — <issue> — Fix: <...>
- [ ] F3 [suggestion] path:line — <better approach> — Why: <benefit>
## Requirements
- AC1 met | AC2 missing (<why>) | Scope creep: <file> <what>
## Not reviewed
- <files skipped, or "none">
```
Return the new contents (only the new section, when appending), then ask: **"Which to fix? e.g. `all must`, `must+should`, `F1 F3`, `none`."**

If the answer is `none`:
- **A plan with milestones still unticked:** nothing to finish. Continue with the next milestone, and keep its snapshots.
- **Otherwise, finish the task:**
  - For a plan whose status is `IMPLEMENTED`, set `Status: DONE`.
  - Run `node .agent-workflow/scripts/snapshot.js --clean <slug>`.
