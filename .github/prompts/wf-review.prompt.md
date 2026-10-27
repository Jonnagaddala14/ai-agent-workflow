---
agent: agent
description: Review a plan's diff, local changes, or a GitHub PR against requirements, code, and STANDARDS.md.
---
Target: ${input:target:.agent-workflow/plans/<slug>.md, a PR number/URL, or empty for current changes}

Follow [.agent-workflow/stages/review.md](../../.agent-workflow/stages/review.md). For fresh eyes on code this chat wrote, run the review as a `wf-reviewer` sub-agent and show its findings as returned; otherwise review here.

If I pick findings to fix, follow section A of [.agent-workflow/stages/fix.md](../../.agent-workflow/stages/fix.md) from step 2, in this chat (sub-agents can't be resumed here, so the main session applies the fixes; a `wf-reviewer` sub-agent does the fix check only when a must-fix was applied). **For a PR target, first do the branch check** (section B, step 4) and don't edit anything until it passes.

To post the findings on a teammate's PR:
1. Write them as one comment to `.agent-workflow/plans/pr-<n>.post.md` and show me.
2. Only after I confirm, run `gh pr review <n> --comment --body-file .agent-workflow/plans/pr-<n>.post.md`.
3. Afterwards, unless fixes follow, run `node .agent-workflow/scripts/snapshot.js --clean pr-<n>`.
