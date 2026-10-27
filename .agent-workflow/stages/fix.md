# Stage: Fix (review findings, or a PR's review comments)

**Who does what.** After the user picks, size the fix set from the proposals. Steps that ask the user or finish the task always stay in the main session.

| Fix set | Apply | Fix check |
|---|---|---|
| **Small:** at most 3 items and about 100 changed lines, tests included | main session, using the code it already read | main session; a reviewer sub-agent if any item is must-fix (fresh eyes, still cheap on a small diff) |
| **Larger** | the implementer that did the work, resumed (Claude Code); in Copilot, the main session | reviewer sub-agent, resumed if possible |

Rework never starts from zero: resume the agent that already has the code (see "Sub-agents" in the core rules). Copilot sub-agents can't be resumed, so there the main session applies fixes itself and spawns a sub-agent only for the fix check.

**Slug:** the plan's slug, `pr-<n>`, or `local-<branch>` (see the table in `.agent-workflow/stages/review.md`).

**Decide before applying.** A fix often implies behaviour the item doesn't spell out: edge cases (empty, out-of-range or missing input), status codes, defaults, naming, what existing callers see. Before you ask which items to apply, make sure each item has a `Decide:` note for every such choice, with your recommended default, grounded in `.agent-workflow/STANDARDS.md` or nearby code. The user settles them in the same answer as the pick; record each on its item as `— settled: <choice>`. Choices that come up later go back to the user only when neither STANDARDS.md nor the settled decisions answer them.

**Checkpoint.** Before the first fix edit of round N:
- If the file already ends with `Fix base (round N): …` and no `## Round N` review after it, you're resuming the round. Reuse that checkpoint.
- Otherwise run `node .agent-workflow/scripts/snapshot.js <slug>-fix<N>` and append `Fix base (round N): <output>` to the review or comments file.

The fix check diffs against the checkpoint, so it sees only the fixes, including new files.

**Fix check.** Review only the fix diff (`.agent-workflow/stages/review.md`, "Fix check"), done by whoever the table names: diff against the checkpoint one file at a time, check each item, its settled choices and STANDARDS.md, and append `## Round N`.

Round 2 runs only for new must-fix or should-fix findings, or decisions the user changes. Do at most 2 rounds, then report anything still open.

## A. Fix findings from a review file
1. Read the review file. It and the code it cites are your only context.
2. Add any missing `Decide:` notes, then ask which F-ids to fix and which decisions to change (skip asking if the review just did). Record the settled choices.
3. Take the checkpoint. Apply **only** the findings the user picked, with the settled choices. Keep each fix minimal and match `.agent-workflow/STANDARDS.md`.
4. Tick each finding off (`- [x] F1 … — fixed`). Mark the ones not picked `— skipped (user)`.
5. Run the verify commands (the plan's, or the repo's build, test and lint). Stop here if you're a sub-agent.
6. **Fix check** (see above). If it finds anything, ask the user again.
7. **Finish:**
   - Plan: set `Status: DONE`.
   - Run `node .agent-workflow/scripts/snapshot.js --clean <slug>`.
   - Report in 3–6 lines: fixed, open, verify result.

## B. Address review comments on a PR
1. Fetch only the unresolved threads, in compact form: `node .agent-workflow/scripts/pr-threads.js <n>` (add `--bots` to include bot comments). Review summaries (`G` items) are shown only for the current head commit; if it reports hidden older ones and a thread refers to them, re-run with `--all`.
2. For each comment, check it against the actual code and propose one action:
   - **fix**: the comment is valid. Give the concrete change and its `Decide:` choices.
   - **reply**: you disagree. Give the reason, grounded in the code, the requirements or `.agent-workflow/STANDARDS.md`.
   - **clarify**: it's ambiguous. Give the question to ask the reviewer.
3. Write `.agent-workflow/plans/pr-<n>.comments.md` as `- [ ] C1 [fix|reply|clarify] path:line @reviewer — <summary> — <proposed action> — Decide: <choice> (recommend <default>) {<threadId>}` (omit `Decide:` when there's nothing to decide). Show it, then ask once: **"Apply which, and any decisions to change? e.g. `all fixes`, `C1 C4`, `C1 with 400 instead of 404`."** Record the settled choices.
4. **Branch check:** you must be on the PR's branch (`gh pr view <n> --json headRefName`), with no uncommitted changes outside `.agent-workflow/`. `git status --porcelain -- . ":(exclude).agent-workflow"` must print nothing.
   - On another branch: ask before running `gh pr checkout <n>`.
   - Uncommitted changes: stop and ask the user to commit or stash them.
5. **Apply:** take the checkpoint, apply the approved fixes with the settled choices, verify, and tick them off in the comments file. Stop here if you're a sub-agent.
6. **Fix check** (see above). It appends `## Round N` to the comments file, with any new findings as F-ids.
7. **Replies, pushing, resolving.** None of this happens without the user's explicit yes.
   - Write each approved reply to `.agent-workflow/plans/pr-<n>.reply-C<k>.md` and show the text. After consent, post it with `node .agent-workflow/scripts/pr-threads.js --reply <threadId> .agent-workflow/plans/pr-<n>.reply-C<k>.md`.
   - Push the fixes, and resolve threads with `node .agent-workflow/scripts/pr-threads.js --resolve <threadId>`, only when the user says so.
   - When everything is done, run `node .agent-workflow/scripts/snapshot.js --clean pr-<n>`.

## Both
If a fix, a reply or a settled choice establishes a convention that isn't in `.agent-workflow/STANDARDS.md` yet, propose a one-line rule for it and add it after consent.
