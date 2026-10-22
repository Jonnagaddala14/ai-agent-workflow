# Stage: Fix (review findings, or a PR's review comments)

**Who does what.** "Apply" steps can run in a sub-agent. Steps that ask the user, run the fix check, or finish the task belong to the main session. With no sub-agents (e.g. Copilot), do everything in order in one chat.

**Slug:** the plan's slug, `pr-<n>`, or `local-<branch>` (see the table in `.agent-workflow/stages/review.md`).

**Checkpoint.** Before the first fix edit of round N:
- If the file already ends with `Fix base (round N): …` and no `## Round N` review after it, you're resuming the round. Reuse that checkpoint.
- Otherwise run `node .agent-workflow/scripts/snapshot.js <slug>-fix<N>` and append `Fix base (round N): <output>` to the review or comments file.

The fix check diffs against the checkpoint, so it sees only the fixes, including new files.

## A. Fix findings from a review file
1. Read the review file. It and the code it cites are your only context.
2. Take the checkpoint. Apply **only** the findings the user picked. Keep each fix minimal and match `.agent-workflow/STANDARDS.md`.
3. Tick each finding off (`- [x] F1 … — fixed`). Mark the ones not picked `— skipped (user)`.
4. Run the verify commands (the plan's, or the repo's build, test and lint). Stop here if you're a sub-agent.
5. **Main session — fix check:** review only the fix diff (`.agent-workflow/stages/review.md`, "Fix check"). If it finds anything, ask the user again. Do at most 2 rounds, then report anything still open.
6. **Main session — finish:**
   - Plan: set `Status: DONE`.
   - Run `node .agent-workflow/scripts/snapshot.js --clean <slug>`.
   - Report in 3–6 lines: fixed, open, verify result.

## B. Address review comments on a PR
Steps 1–4 and 6 run in the main session, because they need the user. Step 5 can go to a sub-agent.
1. Fetch only the unresolved threads, in compact form: `node .agent-workflow/scripts/pr-threads.js <n>` (add `--bots` to include bot comments).
2. For each comment, check it against the actual code and propose one action:
   - **fix**: the comment is valid. Give the concrete change.
   - **reply**: you disagree. Give the reason, grounded in the code, the requirements or `.agent-workflow/STANDARDS.md`.
   - **clarify**: it's ambiguous. Give the question to ask the reviewer.
3. Write `.agent-workflow/plans/pr-<n>.comments.md` as `- [ ] C1 [fix|reply|clarify] path:line @reviewer — <summary> — <proposed action> {<threadId>}`. Show it, then ask once: **"Apply which? e.g. `all fixes`, `C1 C4`."**
4. **Branch check:** you must be on the PR's branch (`gh pr view <n> --json headRefName`), with no uncommitted changes outside `.agent-workflow/`. `git status --porcelain -- . ":(exclude).agent-workflow"` must print nothing.
   - On another branch: ask before running `gh pr checkout <n>`.
   - Uncommitted changes: stop and ask the user to commit or stash them.
5. **Apply:** take the checkpoint, apply the approved fixes, verify, and tick them off in the comments file. The fix check (main session) appends `## Round N` to the comments file, with any new findings as F-ids.
6. **Replies, pushing, resolving.** None of this happens without the user's explicit yes.
   - Write each approved reply to `.agent-workflow/plans/pr-<n>.reply-C<k>.md` and show the text. After consent, post it with `node .agent-workflow/scripts/pr-threads.js --reply <threadId> .agent-workflow/plans/pr-<n>.reply-C<k>.md`.
   - Push the fixes, and resolve threads with `node .agent-workflow/scripts/pr-threads.js --resolve <threadId>`, only when the user says so.
   - When everything is done, run `node .agent-workflow/scripts/snapshot.js --clean pr-<n>`.

## Both
If a fix or a reply settles a convention that isn't in `.agent-workflow/STANDARDS.md` yet, propose a one-line rule for it and add it after consent (see "Maintain" in `.agent-workflow/stages/standards.md`).
