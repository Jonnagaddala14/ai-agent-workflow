---
description: Address a PR's unresolved review comments (or a saved review file) — propose an action per comment, get consent, fix.
argument-hint: <PR number | .agent-workflow/plans/<…>.review.md>
---
Target: $ARGUMENTS

Follow @.agent-workflow/stages/fix.md: a PR number → section B, a review file → section A.

When its "Who does what" table calls for sub-agents, they are `wf-implementer` (given the file and the IDs I picked) and `wf-reviewer` (given the same file and "fix diff only").

**Resume, don't respawn.** If a sub-agent returns a question, ask me, then send my answer to that same sub-agent with SendMessage, so it continues with the code it already read. Round 2 goes to the round-1 implementer and reviewer the same way. Spawn a fresh one only if it can't be resumed.
